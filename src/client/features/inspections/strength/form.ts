import { parseSimpleStrengthAxes } from "./bim-selection.js";
import {
  APP_CONFIG,
  CONCRETE_STRENGTH_CLASSES,
  VALID_LETTER_AXES
} from "../../../config.js";
import {
  getConstructionCategoryKey,
  getConstructionEntityLabels,
  getConstructionLabel,
  getConstructionModuleBehavior,
  getConstructionModuleFallbackMessage,
  getConstructionProfile,
  normalizeConstructionKey
} from "../../../app/construction.js";
import { getInspectionStatus } from "../../../app/inspection-registry.js";
import {
  defaultNumbers,
  defaultRusLetters,
  isValidLetterAxis,
  normalizeMarking,
  sanitizeHtml
} from "../../../utils.js";
import { parseConcreteStrengthValue } from "./evaluation.js";
import type { StrengthDomBindings } from "./dom.js";
import type { StrengthCheckRecord } from "./types.js";

export interface StrengthBimFormApi {
  collectCheckData(): Partial<StrengthCheckRecord>;
  restoreSelection(check: StrengthCheckRecord): void;
  clearSelection(options: { keepManualFields: boolean }): void;
  renderBinding(): void;
  updateControls(): void;
  updateHighlights(): void;
}

export interface StrengthConstructionFlags {
  profile: string;
  behavior: ReturnType<typeof getConstructionModuleBehavior>;
  isPlate: boolean;
  isColumn: boolean;
  isWall: boolean;
  isBeam: boolean;
  isStair: boolean;
  isUnsupported: boolean;
}

export interface StrengthForm {
  init(): void;
  readCheck(existing?: StrengthCheckRecord | null): StrengthCheckRecord;
  restoreCheck(check: StrengthCheckRecord): void;
  clear(): void;
  validateMarking(): boolean;
  updateFieldsVisibility(): void;
  updateLocation(): void;
  getConstructionFlags(value?: string): StrengthConstructionFlags;
  getSelectedConstructionKey(): string;
  getSelectedConstructionLabel(): string;
  getSelectedConstructionCategory(): string;
  getSelectedConstructionSubtype(): string;
  setUnsupportedState(options?: { notify?: boolean }): string;
}

interface StrengthFormDependencies {
  dom: StrengthDomBindings;
  bim: StrengthBimFormApi;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  notify(message: string, tone?: string): void;
  setConstruction(
    construction: string,
    subtype?: string,
    pileElement?: string
  ): unknown;
  destroyChart(): void;
  now?: () => number;
}

function fillSelect(
  document: Document,
  select: HTMLSelectElement | null,
  items: readonly string[]
) {
  if (!select) return;
  select.textContent = "";
  items.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

export function createStrengthForm({
  dom,
  bim,
  inspectionState,
  inspectionChecked,
  notify,
  setConstruction,
  destroyChart,
  now = Date.now
}: StrengthFormDependencies): StrengthForm {
  let initialized = false;

  const getSelectedConstructionKey = () =>
    dom.construction?.dataset.machineValue ||
    normalizeConstructionKey(dom.construction?.value, "");
  const getSelectedConstructionLabel = () =>
    dom.construction?.dataset.displayLabel ||
    getConstructionLabel(
      getSelectedConstructionKey(),
      dom.construction?.value || ""
    );
  const getSelectedConstructionCategory = () =>
    dom.construction?.dataset.categoryKey ||
    getConstructionCategoryKey(getSelectedConstructionKey(), "");
  const getSelectedConstructionSubtype = () =>
    dom.construction?.dataset.subtypeKey || "";

  function getConstructionFlags(
    value = getSelectedConstructionKey() || dom.construction?.value || ""
  ): StrengthConstructionFlags {
    const behavior = getConstructionModuleBehavior(
      value,
      "strength",
      getSelectedConstructionSubtype()
    );
    const profile =
      behavior.profile || getConstructionProfile(value, "strength");
    return {
      profile,
      behavior,
      isPlate: profile === "plate",
      isColumn: profile === "column",
      isWall: profile === "wall",
      isBeam: profile === "beam",
      isStair: profile === "stair",
      isUnsupported:
        behavior.supported === false || profile === "unsupported"
    };
  }

  function updateLocation() {
    const flags = getConstructionFlags();
    if (!flags.isPlate && !flags.isStair) {
      if (dom.location) dom.location.value = "";
      return;
    }

    const values = [
      dom.axisLetterFrom?.value,
      dom.axisLetterTo?.value,
      dom.axisNumberFrom?.value,
      dom.axisNumberTo?.value
    ];
    if (!dom.location) return;
    dom.location.value = values.every(Boolean)
      ? `${values[0]}-${values[1]}, ${values[2]}-${values[3]}`
      : "";
  }

  function updateWallBindingDisplay() {
    const isLetterNumbers =
      dom.wallBindingType?.value === "letter_numbers";
    if (dom.wallLetterNumbers) {
      dom.wallLetterNumbers.style.display = isLetterNumbers ? "grid" : "none";
    }
    if (dom.wallNumberLetters) {
      dom.wallNumberLetters.style.display = isLetterNumbers ? "none" : "grid";
    }
  }

  function isInfoOnlyUnsupportedSubtype() {
    const status = getInspectionStatus(
      getSelectedConstructionKey() || dom.construction?.value || "",
      "strength",
      getSelectedConstructionSubtype()
    );
    return status === "factory" || status === "notApplicable";
  }

  function setUnsupportedOnlyDisplay(show: boolean, message = "") {
    if (dom.unsupportedOnlyMessage) {
      dom.unsupportedOnlyMessage.hidden = !show;
      dom.unsupportedOnlyMessage.textContent = show ? message : "";
    }
    dom.workAreaElements.forEach((element) => {
      element.style.display = show ? "none" : "";
    });
  }

  function setUnsupportedState({ notify: shouldNotify = false } = {}) {
    const message = getConstructionModuleFallbackMessage(
      getSelectedConstructionKey() || dom.construction?.value || "",
      "strength",
      "",
      getSelectedConstructionSubtype()
    );
    const infoOnly = isInfoOnlyUnsupportedSubtype();
    if (dom.result) {
      dom.result.className = "result";
      dom.result.textContent = infoOnly ? "" : message;
      dom.result.style.display = infoOnly ? "none" : "block";
    }
    if (dom.behaviorMessage) {
      dom.behaviorMessage.hidden = false;
      dom.behaviorMessage.textContent = message;
    }
    inspectionState.strength = false;
    inspectionChecked.strength = false;
    if (shouldNotify) notify(message, "warning");
    return message;
  }

  function updateFieldsVisibility() {
    if (!dom.construction) return;
    const flags = getConstructionFlags();
    const behavior = flags.behavior;
    const showLocation =
      behavior.locationMode === "plate_range" ||
      flags.isPlate ||
      flags.isStair;
    const message = getConstructionModuleFallbackMessage(
      getSelectedConstructionKey() || dom.construction.value || "",
      "strength",
      "",
      getSelectedConstructionSubtype()
    );
    setUnsupportedOnlyDisplay(
      flags.isUnsupported && isInfoOnlyUnsupportedSubtype(),
      message
    );

    if (flags.isUnsupported) {
      if (dom.behaviorMessage) {
        dom.behaviorMessage.hidden = false;
        dom.behaviorMessage.textContent = message;
      }
      bim.renderBinding();
      bim.updateControls();
      return;
    }

    if (dom.behaviorMessage) {
      dom.behaviorMessage.hidden = true;
      dom.behaviorMessage.textContent = "";
    }
    if (dom.floor?.parentElement) {
      dom.floor.parentElement.style.display =
        behavior.floorVisible === false ? "none" : "block";
    }
    if (dom.stairNameField) {
      dom.stairNameField.style.display =
        behavior.showStairName ? "block" : "none";
    }
    if (dom.locationFields) {
      dom.locationFields.style.display = showLocation ? "block" : "none";
    }
    if (dom.markingFields) {
      dom.markingFields.style.display =
        flags.isColumn || flags.isBeam ? "block" : "none";
    }
    if (dom.marking && !flags.isColumn && !flags.isBeam) {
      dom.marking.value = "";
    }
    if (dom.wallFields) {
      dom.wallFields.style.display =
        flags.isWall && !showLocation ? "block" : "none";
    }
    if ((!flags.isWall || showLocation) && dom.wallBindingType) {
      dom.wallBindingType.value = "letter_numbers";
    }
    updateWallBindingDisplay();
    if (showLocation) updateLocation();
    bim.renderBinding();
    bim.updateControls();
  }

  function validateMarking() {
    const flags = getConstructionFlags();
    if (flags.isPlate || flags.isStair) {
      const letterFrom = dom.axisLetterFrom?.value || "";
      const letterTo = dom.axisLetterTo?.value || "";
      const numberFrom = dom.axisNumberFrom?.value || "";
      const numberTo = dom.axisNumberTo?.value || "";
      if (!letterFrom || !letterTo || !numberFrom || !numberTo) {
        notify(
          "Для плит и лестниц необходимо заполнить две буквенные и две цифровые оси.",
          "error"
        );
        return false;
      }
      if (letterFrom === letterTo) {
        notify("Буквенные оси не должны повторяться.", "error");
        return false;
      }
      if (numberFrom === numberTo) {
        notify("Цифровые оси не должны повторяться.", "error");
        return false;
      }
      if (
        !isValidLetterAxis(letterFrom) ||
        !isValidLetterAxis(letterTo)
      ) {
        notify("Выбраны недопустимые буквенные оси.", "error");
        return false;
      }
      return true;
    }

    if (flags.isColumn || flags.isBeam) {
      const marking = normalizeMarking(dom.marking?.value || "");
      if (!marking) {
        notify(
          "Для колонн и балок необходимо указать маркировку (например, К 1.12 или БМ 1).",
          "error"
        );
        return false;
      }
      if (!/^[А-ЯЁ]+(?:\s+\d+(?:\.\d+)?)?$/u.test(marking)) {
        notify(
          "Маркировка должна быть в формате: буквы, пробел, цифры (например, К 1.12 или БМ 1).",
          "error"
        );
        return false;
      }
      return true;
    }

    if (!flags.isWall) return true;
    const plural = getConstructionEntityLabels(
      getSelectedConstructionKey(),
      "strength",
      getSelectedConstructionSubtype()
    ).pluralGenitive;
    if (dom.wallBindingType?.value === "letter_numbers") {
      const letter = dom.wallLetterAxis?.value || "";
      const number1 = dom.wallNumberAxis1?.value || "";
      const number2 = dom.wallNumberAxis2?.value || "";
      if (!letter || !number1 || !number2) {
        notify(
          `Для ${plural} необходимо заполнить одну буквенную и две цифровые оси.`,
          "error"
        );
        return false;
      }
      if (number1 === number2) {
        notify("Цифровые оси не должны повторяться.", "error");
        return false;
      }
      if (!isValidLetterAxis(letter)) {
        notify("Выбрана недопустимая буквенная ось.", "error");
        return false;
      }
      return true;
    }

    const number = dom.wallNumberAxis?.value || "";
    const letter1 = dom.wallLetterAxis1?.value || "";
    const letter2 = dom.wallLetterAxis2?.value || "";
    if (!number || !letter1 || !letter2) {
      notify(
        `Для ${plural} необходимо заполнить одну цифровую и две буквенные оси.`,
        "error"
      );
      return false;
    }
    if (letter1 === letter2) {
      notify("Буквенные оси не должны повторяться.", "error");
      return false;
    }
    if (!isValidLetterAxis(letter1) || !isValidLetterAxis(letter2)) {
      notify("Выбраны недопустимые буквенные оси.", "error");
      return false;
    }
    return true;
  }

  function readCheck(existing: StrengthCheckRecord | null = null) {
    const construction = getSelectedConstructionKey();
    const flags = getConstructionFlags(
      construction || dom.construction?.value || ""
    );
    const behavior = flags.behavior;
    const usesAxisRange =
      flags.isPlate ||
      flags.isStair ||
      behavior.locationMode === "plate_range";
    let location: string | null = null;
    let marking: string | null = null;
    let wallBindingType: string | null = null;
    let wallLetterAxis: string | null = null;
    let wallNumberAxis1: string | null = null;
    let wallNumberAxis2: string | null = null;
    let wallNumberAxis: string | null = null;
    let wallLetterAxis1: string | null = null;
    let wallLetterAxis2: string | null = null;

    if (usesAxisRange) {
      updateLocation();
      location = dom.location?.value || null;
    } else if (flags.isColumn || flags.isBeam) {
      marking = normalizeMarking(dom.marking?.value || "") || null;
      location = marking;
    } else if (flags.isWall) {
      wallBindingType = dom.wallBindingType?.value || "letter_numbers";
      if (wallBindingType === "letter_numbers") {
        wallLetterAxis = dom.wallLetterAxis?.value || null;
        wallNumberAxis1 = dom.wallNumberAxis1?.value || null;
        wallNumberAxis2 = dom.wallNumberAxis2?.value || null;
        if (wallLetterAxis && wallNumberAxis1 && wallNumberAxis2) {
          location = `${wallLetterAxis}, ${wallNumberAxis1}-${wallNumberAxis2}`;
        }
      } else {
        wallNumberAxis = dom.wallNumberAxis?.value || null;
        wallLetterAxis1 = dom.wallLetterAxis1?.value || null;
        wallLetterAxis2 = dom.wallLetterAxis2?.value || null;
        if (wallNumberAxis && wallLetterAxis1 && wallLetterAxis2) {
          location = `${wallNumberAxis}, ${wallLetterAxis1}-${wallLetterAxis2}`;
        }
      }
    }

    return {
      createdAt: existing?.createdAt || now(),
      construction,
      constructionCategory: getSelectedConstructionCategory(),
      constructionLabel: getSelectedConstructionLabel(),
      constructionType: dom.construction?.value || "",
      constructionSubtype: dom.construction?.dataset.subtypeKey || "",
      constructionSubtypeLabel:
        dom.construction?.dataset.subtypeLabel || "",
      constructionPileElement:
        dom.construction?.dataset.pileElementKey || "",
      constructionPileElementLabel:
        dom.construction?.dataset.pileElementLabel || "",
      ...bim.collectCheckData(),
      floor:
        behavior.floorVisible === false
          ? existing?.floor ?? null
          : dom.floor?.value.trim() || null,
      location,
      marking,
      stairName: behavior.showStairName
        ? dom.stairName?.value.trim() || null
        : null,
      axisLetterFrom:
        usesAxisRange ? dom.axisLetterFrom?.value || null : null,
      axisLetterTo:
        usesAxisRange ? dom.axisLetterTo?.value || null : null,
      axisNumberFrom:
        usesAxisRange ? dom.axisNumberFrom?.value || null : null,
      axisNumberTo:
        usesAxisRange ? dom.axisNumberTo?.value || null : null,
      wallBindingType,
      wallLetterAxis,
      wallNumberAxis1,
      wallNumberAxis2,
      wallNumberAxis,
      wallLetterAxis1,
      wallLetterAxis2,
      mark: dom.mark?.value.trim() || null,
      markValue: parseConcreteStrengthValue(dom.mark?.value),
      days: dom.days?.value === "" ? null : Number(dom.days?.value),
      actual:
        dom.actual?.value === "" ? null : Number(dom.actual?.value),
      lastMsg: dom.result?.innerHTML || ""
    } satisfies StrengthCheckRecord;
  }

  function restoreCheck(check: StrengthCheckRecord) {
    if (check.construction || check.constructionType) {
      setConstruction(
        String(check.construction || check.constructionType || ""),
        String(check.constructionSubtype || ""),
        String(check.constructionPileElement || "")
      );
    }
    updateFieldsVisibility();
    const flags = getConstructionFlags(
      String(check.construction || check.constructionType || "")
    );
    const legacyAxes = parseSimpleStrengthAxes(check.location);
    if (
      flags.isPlate ||
      flags.isStair ||
      flags.behavior.locationMode === "plate_range"
    ) {
      if (dom.axisLetterFrom && (check.axisLetterFrom ?? legacyAxes?.axisLetterFrom)) {
        dom.axisLetterFrom.value = check.axisLetterFrom ?? legacyAxes?.axisLetterFrom;
      }
      if (dom.axisLetterTo && (check.axisLetterTo ?? legacyAxes?.axisLetterTo)) {
        dom.axisLetterTo.value = check.axisLetterTo ?? legacyAxes?.axisLetterTo;
      }
      if (dom.axisNumberFrom && (check.axisNumberFrom ?? legacyAxes?.axisNumberFrom)) {
        dom.axisNumberFrom.value = String(check.axisNumberFrom ?? legacyAxes?.axisNumberFrom);
      }
      if (dom.axisNumberTo && (check.axisNumberTo ?? legacyAxes?.axisNumberTo)) {
        dom.axisNumberTo.value = String(check.axisNumberTo ?? legacyAxes?.axisNumberTo);
      }
      updateLocation();
      if (dom.location && check.location && !dom.location.value) {
        dom.location.value = check.location;
      }
      if (dom.stairName) dom.stairName.value = check.stairName || "";
    }
    if ((flags.isColumn || flags.isBeam) && dom.marking) {
      dom.marking.value = check.marking || "";
    }
    if (flags.isWall) {
      if (dom.wallBindingType && check.wallBindingType) {
        dom.wallBindingType.value = check.wallBindingType;
      }
      updateWallBindingDisplay();
      if (
        check.wallBindingType === "letter_numbers" ||
        !check.wallBindingType
      ) {
        if (dom.wallLetterAxis && check.wallLetterAxis) {
          dom.wallLetterAxis.value = check.wallLetterAxis;
        }
        if (dom.wallNumberAxis1 && check.wallNumberAxis1) {
          dom.wallNumberAxis1.value = String(check.wallNumberAxis1);
        }
        if (dom.wallNumberAxis2 && check.wallNumberAxis2) {
          dom.wallNumberAxis2.value = String(check.wallNumberAxis2);
        }
      } else {
        if (dom.wallNumberAxis && check.wallNumberAxis) {
          dom.wallNumberAxis.value = String(check.wallNumberAxis);
        }
        if (dom.wallLetterAxis1 && check.wallLetterAxis1) {
          dom.wallLetterAxis1.value = check.wallLetterAxis1;
        }
        if (dom.wallLetterAxis2 && check.wallLetterAxis2) {
          dom.wallLetterAxis2.value = check.wallLetterAxis2;
        }
      }
    }
    if (dom.floor) dom.floor.value = check.floor || "";
    if (dom.mark) {
      const storedMark = check.mark || "";
      // Older records may contain B25 rather than the current B25(M350) display value.
      if (storedMark && parseConcreteStrengthValue(storedMark) != null && !Array.from(dom.mark.options).some(option => option.value === storedMark)) {
        const option = dom.document.createElement("option");
        option.value = storedMark; option.textContent = storedMark; dom.mark.appendChild(option);
      }
      dom.mark.value = storedMark;
    }
    if (dom.days) dom.days.value = String(check.days ?? "");
    if (dom.actual) dom.actual.value = String(check.actual ?? "");
    if (dom.result) {
      dom.result.className = "result";
      if (check.status === "ok") dom.result.classList.add("ok");
      if (check.status === "bad" || check.status === "exceeded") {
        dom.result.classList.add("not-ok");
      }
      dom.result.innerHTML = sanitizeHtml(check.lastMsg || "");
      dom.result.style.display = dom.result.innerHTML ? "block" : "none";
    }
    bim.restoreSelection(check);
  }

  function clear() {
    bim.clearSelection({ keepManualFields: false });
    if (dom.floor) dom.floor.value = "";
    if (dom.mark) dom.mark.value = "";
    if (dom.days) dom.days.value = "";
    if (dom.actual) dom.actual.value = "";
    if (dom.result) {
      dom.result.className = "result";
      dom.result.innerHTML = "";
      dom.result.style.display = "none";
    }
    destroyChart();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    fillSelect(dom.document, dom.axisLetterFrom, defaultRusLetters);
    fillSelect(dom.document, dom.axisLetterTo, defaultRusLetters);
    fillSelect(dom.document, dom.axisNumberFrom, defaultNumbers);
    fillSelect(dom.document, dom.axisNumberTo, defaultNumbers);
    if (dom.axisLetterFrom) {
      dom.axisLetterFrom.value = APP_CONFIG.DEFAULT_LETTER_AXIS;
    }
    if (dom.axisLetterTo) {
      dom.axisLetterTo.value = VALID_LETTER_AXES[1] || "Б";
    }
    if (dom.axisNumberFrom) {
      dom.axisNumberFrom.value = APP_CONFIG.DEFAULT_NUMBER_AXIS;
    }
    if (dom.axisNumberTo) dom.axisNumberTo.value = "2";

    if (dom.mark) {
      dom.mark.textContent = "";
      const emptyOption = dom.document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "Выберите класс бетона";
      dom.mark.appendChild(emptyOption);
      CONCRETE_STRENGTH_CLASSES.forEach((item) => {
        const option = dom.document.createElement("option");
        option.value = `${item.class}(${item.mark})`;
        option.textContent = option.value;
        dom.mark?.appendChild(option);
      });
      const view = dom.document.defaultView;
      if (view && "ontouchstart" in view) {
        dom.mark.addEventListener(
          "touchstart",
          (event) => {
            event.stopPropagation();
          },
          { passive: true }
        );
        dom.mark.addEventListener(
          "touchend",
          () => {
            if (dom.mark === dom.document.activeElement) {
              // Оставляем нативное поведение выбора на сенсорном экране.
            }
          },
          { passive: true }
        );
      }
    }

    fillSelect(dom.document, dom.wallLetterAxis, defaultRusLetters);
    fillSelect(dom.document, dom.wallLetterAxis1, defaultRusLetters);
    fillSelect(dom.document, dom.wallLetterAxis2, defaultRusLetters);
    fillSelect(dom.document, dom.wallNumberAxis, defaultNumbers);
    fillSelect(dom.document, dom.wallNumberAxis1, defaultNumbers);
    fillSelect(dom.document, dom.wallNumberAxis2, defaultNumbers);

    [
      dom.axisLetterFrom,
      dom.axisLetterTo,
      dom.axisNumberFrom,
      dom.axisNumberTo
    ].forEach((element) => {
      if (!element) return;
      element.dataset.oldValue = element.value;
      element.addEventListener("focus", () => {
        element.dataset.oldValue = element.value;
      });
      element.addEventListener("change", () => {
        if (
          dom.axisLetterFrom?.value &&
          dom.axisLetterFrom.value === dom.axisLetterTo?.value
        ) {
          notify(
            "Буквенные оси не должны повторяться. Выберите разные буквенные оси.",
            "warning"
          );
          element.value = element.dataset.oldValue || "";
        } else if (
          dom.axisNumberFrom?.value &&
          dom.axisNumberFrom.value === dom.axisNumberTo?.value
        ) {
          notify(
            "Цифровые оси не должны повторяться. Выберите разные цифровые оси.",
            "warning"
          );
          element.value = element.dataset.oldValue || "";
        } else {
          element.dataset.oldValue = element.value;
        }
        updateLocation();
        bim.updateHighlights();
      });
    });
    dom.wallBindingType?.addEventListener(
      "change",
      updateWallBindingDisplay
    );
    updateWallBindingDisplay();
    dom.construction?.addEventListener("change", updateFieldsVisibility);
  }

  return {
    init,
    readCheck,
    restoreCheck,
    clear,
    validateMarking,
    updateFieldsVisibility,
    updateLocation,
    getConstructionFlags,
    getSelectedConstructionKey,
    getSelectedConstructionLabel,
    getSelectedConstructionCategory,
    getSelectedConstructionSubtype,
    setUnsupportedState
  };
}
