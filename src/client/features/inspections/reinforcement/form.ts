import { APP_CONFIG, VALID_LETTER_AXES } from "../../../config.js";
import {
  getConstructionCategoryKey,
  getConstructionLabel,
  getConstructionModuleBehavior,
  getConstructionModuleFallbackMessage,
  getConstructionProfile,
  normalizeConstructionKey
} from "../../../app/construction.js";
import {
  getInspectionStatus,
  hasInspectionField
} from "../../../app/inspection-registry.js";
import {
  defaultNumbers,
  defaultRusLetters,
  normalizeMarking
} from "../../../utils.js";
import type { ReinforcementDomBindings } from "./dom.js";
import type {
  ReinforcementBeam,
  ReinforcementCheckRecord,
  ReinforcementColumn,
  ReinforcementState,
  ReinforcementWall
} from "./types.js";

export type ReinforcementProfile =
  | "plate"
  | "column"
  | "wall"
  | "beam"
  | "stair"
  | "unsupported"
  | string;

export interface ReinforcementConstructionFlags {
  profile: ReinforcementProfile;
  behavior: ReturnType<typeof getConstructionModuleBehavior>;
  isPlate: boolean;
  isColumn: boolean;
  isWall: boolean;
  isBeam: boolean;
  isStair: boolean;
  isUnsupported: boolean;
}

export interface ReinforcementLocationInput {
  profile: ReinforcementProfile;
  locationMode?: string;
  axisMode?: string;
  letterFrom?: string;
  letterTo?: string;
  numberFrom?: string;
  numberTo?: string;
}

export interface ReinforcementVisibility {
  location: boolean;
  column: boolean;
  beam: boolean;
  wall: boolean;
  common: boolean;
  stairName: boolean;
  letterTo: boolean;
  numberTo: boolean;
}

export interface ReinforcementBimFormApi {
  collectCheckData(): Partial<ReinforcementCheckRecord>;
  restoreSelection(check: ReinforcementCheckRecord): void;
  clearSelection(options: { keepManualFields: boolean }): void;
  renderBinding(): void;
  updateControls(): void;
  updateHighlights(): void;
}

export interface ReinforcementRowsFormApi {
  renderColumns(): void;
  renderBeams(): void;
  renderWalls(): void;
  loadWallsDraft(): void;
  saveWallsDraft(): void;
  bindWallButton(): void;
  updateWallLimit(flags: ReinforcementConstructionFlags): void;
}

export interface ReinforcementFormDependencies {
  state: ReinforcementState;
  dom: ReinforcementDomBindings;
  bim: ReinforcementBimFormApi;
  rows: ReinforcementRowsFormApi;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  notify(message: string, tone?: string): void;
  setConstruction(
    construction: string,
    subtype?: string,
    pileElement?: string
  ): unknown;
  now?: () => number;
}

function numericValue(element: HTMLInputElement | null) {
  return element?.value === "" ? null : Number(element?.value);
}

function persistedMeasurements(item: {
  projDia?: number | string | null;
  factDia?: number | string | null;
  projStep?: number | string | null;
  factStep?: number | string | null;
  projCover?: number | string | null;
  factCover?: number | string | null;
  projHoopsStep?: number | string | null;
  factHoopsStep?: number | string | null;
}) {
  const toNumber = (value: number | string | null | undefined) =>
    value === "" || value == null ? null : Number(value);
  return {
    projDia: toNumber(item.projDia),
    factDia: toNumber(item.factDia),
    projStep: toNumber(item.projStep),
    factStep: toNumber(item.factStep),
    projCover: toNumber(item.projCover),
    factCover: toNumber(item.factCover)
  };
}

export function buildReinforcementLocation(
  input: ReinforcementLocationInput
) {
  if (input.profile !== "plate" && input.profile !== "stair") return "";
  const letterFrom = String(input.letterFrom || "");
  const letterTo = String(input.letterTo || "");
  const numberFrom = String(input.numberFrom || "");
  const numberTo = String(input.numberTo || "");

  if (input.locationMode === "strip_foundation") {
    if ((input.axisMode || "letter_numbers") === "letter_numbers") {
      return numberFrom && letterFrom && letterTo && letterFrom !== letterTo
        ? `${numberFrom}, ${letterFrom}-${letterTo}`
        : "";
    }
    return numberFrom && numberTo && letterFrom && numberFrom !== numberTo
      ? `${numberFrom}-${numberTo}, ${letterFrom}`
      : "";
  }

  return letterFrom && letterTo && numberFrom && numberTo
    ? `${letterFrom}-${letterTo}, ${numberFrom}-${numberTo}`
    : "";
}

export function getReinforcementVisibility(
  flags: ReinforcementConstructionFlags,
  axisMode = "letter_numbers",
  boredPileFoundation = false
): ReinforcementVisibility {
  if (flags.isUnsupported) {
    return {
      location: false,
      column: false,
      beam: false,
      wall: false,
      common: false,
      stairName: false,
      letterTo: false,
      numberTo: false
    };
  }
  const usesLocation =
    (flags.isPlate || flags.isStair) && !boredPileFoundation;
  const strip = flags.behavior.locationMode === "strip_foundation";
  return {
    location: usesLocation,
    column: flags.isColumn,
    beam: flags.isBeam,
    wall: flags.isWall,
    common:
      usesLocation ||
      (!flags.isColumn && !flags.isBeam && !flags.isWall),
    stairName: usesLocation && flags.isStair,
    letterTo: usesLocation && (!strip || axisMode === "letter_numbers"),
    numberTo: usesLocation && (!strip || axisMode === "number_letters")
  };
}

function normalizeIdentityValue(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeIdentityMarkings(
  items: Array<{ marking?: unknown }> | null | undefined
) {
  return [...new Set(
    (items || [])
      .map((item) => normalizeMarking(item.marking))
      .filter(Boolean)
  )].sort();
}

function normalizeWallAxis(value: unknown) {
  return normalizeIdentityValue(value).toLocaleUpperCase("ru");
}

function normalizeWallBindings(
  walls: ReinforcementCheckRecord["walls"]
) {
  return (walls || []).map((wall) => {
    if (wall.bindingType === "letter_numbers") {
      const extremes = [
        normalizeWallAxis(wall.numberAxis1),
        normalizeWallAxis(wall.numberAxis2)
      ].sort();
      return [
        "letter_numbers",
        normalizeWallAxis(wall.letterAxis),
        ...extremes
      ].join("|");
    }
    const extremes = [
      normalizeWallAxis(wall.letterAxis1),
      normalizeWallAxis(wall.letterAxis2)
    ].sort();
    return [
      "number_letters",
      normalizeWallAxis(wall.numberAxis),
      ...extremes
    ].join("|");
  }).sort();
}

function sameIdentityList(left: string[], right: string[]) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

export function isSameReinforcementCheckIdentity(
  current: ReinforcementCheckRecord | null | undefined,
  next: ReinforcementCheckRecord
) {
  if (!current) return false;
  const currentConstruction = normalizeConstructionKey(
    current.construction || current.constructionType,
    normalizeIdentityValue(
      current.construction || current.constructionType
    )
  );
  const nextConstruction = normalizeConstructionKey(
    next.construction || next.constructionType,
    normalizeIdentityValue(next.construction || next.constructionType)
  );
  if (currentConstruction !== nextConstruction) return false;
  if (
    normalizeIdentityValue(current.constructionSubtype) !==
      normalizeIdentityValue(next.constructionSubtype)
  ) return false;

  const currentBimElementId = normalizeIdentityValue(
    current.bimElementId
  );
  const nextBimElementId = normalizeIdentityValue(next.bimElementId);
  if (
    (currentBimElementId || nextBimElementId) &&
    currentBimElementId !== nextBimElementId
  ) return false;

  const sameFloor =
    normalizeIdentityValue(current.floor) ===
      normalizeIdentityValue(next.floor);
  if (current.columns || next.columns) {
    return sameFloor && sameIdentityList(
      normalizeIdentityMarkings(current.columns),
      normalizeIdentityMarkings(next.columns)
    );
  }
  if (current.beams || next.beams) {
    return sameFloor && sameIdentityList(
      normalizeIdentityMarkings(current.beams),
      normalizeIdentityMarkings(next.beams)
    );
  }
  if (current.walls || next.walls) {
    return sameFloor && sameIdentityList(
      normalizeWallBindings(current.walls),
      normalizeWallBindings(next.walls)
    );
  }

  const profile = getConstructionProfile(
    nextConstruction,
    "reinforcement"
  );
  if (profile === "plate" || profile === "stair") {
    return [
      "floor",
      "axisLetterFrom",
      "axisLetterTo",
      "axisNumberFrom",
      "axisNumberTo",
      "location",
      "stairName"
    ].every((key) =>
      normalizeIdentityValue(current[key]) ===
        normalizeIdentityValue(next[key])
    );
  }

  return sameFloor;
}

function fillSelect(
  document: Document,
  element: HTMLSelectElement | null,
  values: string[]
) {
  if (!element) return;
  element.textContent = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    element.appendChild(option);
  });
}

function formValue(value: unknown) {
  return value == null ? "" : String(value);
}

export function createReinforcementForm(
  dependencies: ReinforcementFormDependencies
) {
  const {
    state,
    dom,
    bim,
    rows,
    inspectionState,
    inspectionChecked,
    notify,
    setConstruction
  } = dependencies;
  const now = dependencies.now || Date.now;
  let axesInitialized = false;

  function getSelectedConstructionKey() {
    return (
      dom.construction?.dataset.machineValue ||
      normalizeConstructionKey(dom.construction?.value, "")
    );
  }

  function getSelectedConstructionLabel() {
    return (
      dom.construction?.dataset.displayLabel ||
      getConstructionLabel(
        getSelectedConstructionKey(),
        dom.construction?.value || ""
      )
    );
  }

  function getSelectedConstructionCategory() {
    return (
      dom.construction?.dataset.categoryKey ||
      getConstructionCategoryKey(getSelectedConstructionKey(), "")
    );
  }

  function getSelectedConstructionSubtype() {
    return dom.construction?.dataset.subtypeKey || "";
  }

  function getSelectedPileElement() {
    return dom.construction?.dataset.pileElementKey || "pile";
  }

  function isBoredPileFoundation() {
    return hasInspectionField(
      getSelectedConstructionKey(),
      "reinforcement",
      "constructionPileElement",
      getSelectedConstructionSubtype()
    );
  }

  function getConstructionFlags(
    value = getSelectedConstructionKey() ||
      dom.construction?.value ||
      ""
  ): ReinforcementConstructionFlags {
    const behavior = getConstructionModuleBehavior(
      value,
      "reinforcement",
      getSelectedConstructionSubtype()
    );
    const profile = getConstructionProfile(value, "reinforcement");
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
    if (!dom.reinfLocationEl) return "";
    const flags = getConstructionFlags();
    const location = buildReinforcementLocation({
      profile: flags.profile,
      locationMode: flags.behavior.locationMode,
      axisMode: dom.reinfStripAxisModeEl?.value,
      letterFrom: dom.reinfAxisLetterFromEl?.value,
      letterTo: dom.reinfAxisLetterToEl?.value,
      numberFrom: dom.reinfAxisNumberFromEl?.value,
      numberTo: dom.reinfAxisNumberToEl?.value
    });
    dom.reinfLocationEl.value = location;
    return location;
  }

  function setUnsupportedState({ notify: shouldNotify = false } = {}) {
    const message = getConstructionModuleFallbackMessage(
      getSelectedConstructionKey() || dom.construction?.value || "",
      "reinforcement",
      "",
      getSelectedConstructionSubtype()
    );
    const status = getInspectionStatus(
      getSelectedConstructionKey() || dom.construction?.value || "",
      "reinforcement",
      getSelectedConstructionSubtype()
    );
    const showOnlyBehaviorMessage =
      status === "factory" || status === "notApplicable";
    if (dom.reinfResult) {
      dom.reinfResult.className = "result";
      dom.reinfResult.textContent = showOnlyBehaviorMessage ? "" : message;
      dom.reinfResult.style.display = showOnlyBehaviorMessage ? "none" : "";
    }
    if (dom.reinfBehaviorMessage) {
      dom.reinfBehaviorMessage.hidden = false;
      dom.reinfBehaviorMessage.textContent = message;
    }
    inspectionState.reinforcement = false;
    inspectionChecked.reinforcement = false;
    if (shouldNotify) notify(message, "warning");
    return message;
  }

  function clear({ clearBim = true } = {}) {
    state.currentCheckId = null;
    state.columns = [];
    state.beams = [];
    state.walls = [];
    [
      dom.reinfStairNameEl,
      dom.reinfFloorEl,
      dom.reinfLocationEl,
      dom.reinfColumnFloorEl,
      dom.reinfBeamFloorEl,
      dom.reinfWallFloorEl,
      dom.projDia,
      dom.factDia,
      dom.projStep,
      dom.factStep,
      dom.projCover,
      dom.factCover,
      dom.reinfProjHoopsStepEl,
      dom.reinfFactHoopsStepEl
    ].forEach((element) => {
      if (element) element.value = "";
    });
    if (clearBim) bim.clearSelection({ keepManualFields: false });
    rows.renderColumns();
    rows.renderBeams();
    rows.renderWalls();
    if (dom.reinfResult) {
      dom.reinfResult.className = "result";
      dom.reinfResult.innerHTML = "";
      dom.reinfResult.style.display = "";
    }
    inspectionState.reinforcement = false;
    inspectionChecked.reinforcement = false;
    updateLocation();
  }

  function resetUi() {
    clear({ clearBim: false });
  }

  function updateFieldsVisibility(shouldReset = true) {
    if (shouldReset) resetUi();
    if (!dom.construction) return;
    const flags = getConstructionFlags();
    const behavior = flags.behavior;
    const axisMode =
      dom.reinfStripAxisModeEl?.value || "letter_numbers";
    const boredPile = isBoredPileFoundation();
    const visibility = getReinforcementVisibility(
      flags,
      axisMode,
      boredPile
    );
    const display = (
      element: HTMLElement | null,
      visible: boolean,
      visibleDisplay: string
    ) => {
      if (element) element.style.display = visible ? visibleDisplay : "none";
    };

    display(dom.reinfLocationFields, visibility.location, "block");
    display(dom.reinfColumnFields, visibility.column, "block");
    display(dom.reinfBeamFields, visibility.beam, "block");
    display(dom.reinfWallFields, visibility.wall, "block");
    display(dom.reinfCommonFields, visibility.common, "grid");
    display(dom.reinfStairNameField, visibility.stairName, "block");
    display(dom.reinfAxisLetterToField, visibility.letterTo, "");
    display(dom.reinfAxisNumberToField, visibility.numberTo, "");
    display(
      dom.reinfStripAxisModeField,
      visibility.location &&
        behavior.locationMode === "strip_foundation",
      "block"
    );
    display(
      dom.reinfProjHoopsStepField,
      behavior.showReinforcementHoopsStep === true &&
        !visibility.column &&
        !visibility.beam &&
        !visibility.wall,
      "block"
    );
    display(
      dom.reinfFactHoopsStepField,
      behavior.showReinforcementHoopsStep === true &&
        !visibility.column &&
        !visibility.beam &&
        !visibility.wall,
      "block"
    );

    if (dom.reinfBehaviorMessage) {
      dom.reinfBehaviorMessage.hidden = !flags.isUnsupported;
      dom.reinfBehaviorMessage.textContent = flags.isUnsupported
        ? getConstructionModuleFallbackMessage(
          getSelectedConstructionKey() || dom.construction.value || "",
          "reinforcement",
          "",
          getSelectedConstructionSubtype()
        )
        : "";
    }
    if (flags.isUnsupported) {
      setUnsupportedState();
      return;
    }

    if (dom.reinfFloorEl?.parentElement) {
      dom.reinfFloorEl.parentElement.style.display =
        behavior.floorVisible === false ? "none" : "block";
    }
    const strip =
      behavior.locationMode === "strip_foundation";
    if (dom.reinfAxisLetterFromLabel) {
      dom.reinfAxisLetterFromLabel.textContent =
        strip ? "Буквенная ось" : "От буквенной оси";
    }
    if (dom.reinfAxisLetterToLabel) {
      dom.reinfAxisLetterToLabel.textContent = "До буквенной оси";
    }
    if (dom.reinfAxisNumberFromLabel) {
      dom.reinfAxisNumberFromLabel.textContent =
        strip ? "Цифровая ось" : "От цифровой оси";
    }
    if (dom.reinfAxisNumberToLabel) {
      dom.reinfAxisNumberToLabel.textContent = "До цифровой оси";
    }
    if (dom.reinfAxisLetterFromField) {
      dom.reinfAxisLetterFromField.style.display = "";
    }
    if (dom.reinfAxisNumberFromField) {
      dom.reinfAxisNumberFromField.style.display = "";
    }

    const showStep =
      !boredPile || getSelectedPileElement() === "grillage";
    display(dom.projStepField, visibility.location || showStep, "block");
    display(dom.factStepField, visibility.location || showStep, "block");
    const projectStepLabel = dom.projStepField?.querySelector("label");
    const actualStepLabel = dom.factStepField?.querySelector("label");
    if (projectStepLabel) {
      projectStepLabel.textContent = boredPile
        ? "Проектное расположение арматуры"
        : "Проектный шаг арматуры";
    }
    if (actualStepLabel) {
      actualStepLabel.textContent = boredPile
        ? "Фактическое расположение арматуры"
        : "Фактический шаг арматуры";
    }

    if (flags.isColumn) rows.renderColumns();
    if (flags.isBeam) rows.renderBeams();
    if (flags.isWall) {
      rows.loadWallsDraft();
      const maxWalls =
        flags.behavior.maxWalls ?? APP_CONFIG.MAX_ELEMENTS;
      if (state.walls.length > maxWalls) {
        state.walls = state.walls.slice(0, maxWalls);
        rows.saveWallsDraft();
      }
      rows.updateWallLimit(flags);
      setTimeout(rows.bindWallButton, 0);
    }
    updateLocation();
    bim.renderBinding();
    bim.updateHighlights();
    bim.updateControls();
  }

  function initAxes() {
    if (axesInitialized) return;
    const fields = [
      dom.reinfAxisLetterFromEl,
      dom.reinfAxisLetterToEl,
      dom.reinfAxisNumberFromEl,
      dom.reinfAxisNumberToEl
    ];
    if (fields.some((field) => !field)) return;
    axesInitialized = true;
    fillSelect(dom.document, dom.reinfAxisLetterFromEl, defaultRusLetters);
    fillSelect(dom.document, dom.reinfAxisLetterToEl, defaultRusLetters);
    fillSelect(dom.document, dom.reinfAxisNumberFromEl, defaultNumbers);
    fillSelect(dom.document, dom.reinfAxisNumberToEl, defaultNumbers);
    dom.reinfAxisLetterFromEl!.value = APP_CONFIG.DEFAULT_LETTER_AXIS;
    dom.reinfAxisLetterToEl!.value = VALID_LETTER_AXES[1] || "Б";
    dom.reinfAxisNumberFromEl!.value = APP_CONFIG.DEFAULT_NUMBER_AXIS;
    dom.reinfAxisNumberToEl!.value = "2";

    fields.forEach((field) => {
      if (!field) return;
      field.dataset.oldValue = field.value;
      field.addEventListener("focus", () => {
        field.dataset.oldValue = field.value;
      });
      field.addEventListener("change", () => {
        const repeatedLetters =
          dom.reinfAxisLetterFromEl?.value ===
          dom.reinfAxisLetterToEl?.value;
        const repeatedNumbers =
          dom.reinfAxisNumberFromEl?.value ===
          dom.reinfAxisNumberToEl?.value;
        if (repeatedLetters || repeatedNumbers) {
          notify(
            repeatedLetters
              ? "Буквенные оси не должны повторяться. Выберите разные буквенные оси."
              : "Цифровые оси не должны повторяться. Выберите разные цифровые оси.",
            "warning"
          );
          field.value = field.dataset.oldValue || "";
        } else {
          field.dataset.oldValue = field.value;
        }
        updateLocation();
        bim.updateHighlights();
      });
    });
    dom.reinfStripAxisModeEl?.addEventListener("change", () => {
      updateFieldsVisibility(false);
      updateLocation();
    });
  }

  function readCheck(
    existing: ReinforcementCheckRecord | null = null
  ): ReinforcementCheckRecord {
    const flags = getConstructionFlags();
    const behavior = flags.behavior;
    const usesLocation =
      (flags.isPlate || flags.isStair) &&
      !isBoredPileFoundation();
    const floor = behavior.floorVisible === false
      ? null
      : usesLocation
        ? dom.reinfFloorEl?.value.trim() || null
        : flags.isColumn
          ? dom.reinfColumnFloorEl?.value.trim() || null
          : flags.isBeam
            ? dom.reinfBeamFloorEl?.value.trim() || null
            : flags.isWall
              ? dom.reinfWallFloorEl?.value.trim() || null
              : null;
    const columns = flags.isColumn
      ? state.columns.map((item) => ({
        marking: item.marking || "",
        ...persistedMeasurements(item),
        projHoopsStep:
          item.projHoopsStep === "" ? null : Number(item.projHoopsStep),
        factHoopsStep:
          item.factHoopsStep === "" ? null : Number(item.factHoopsStep)
      }))
      : null;
    const beams = flags.isBeam
      ? state.beams.map((item) => ({
        marking: item.marking || "",
        ...persistedMeasurements(item)
      }))
      : null;
    const walls = flags.isWall
      ? state.walls.map((item) => ({
        bindingType: item.bindingType,
        numberAxis: item.numberAxis || "",
        letterAxis1: item.letterAxis1 || "",
        letterAxis2: item.letterAxis2 || "",
        letterAxis: item.letterAxis || "",
        numberAxis1: item.numberAxis1 || "",
        numberAxis2: item.numberAxis2 || "",
        ...persistedMeasurements(item)
      }))
      : null;
    const common =
      !flags.isColumn && !flags.isBeam && !flags.isWall;

    return {
      createdAt: existing?.createdAt || now(),
      construction: getSelectedConstructionKey(),
      constructionCategory: getSelectedConstructionCategory(),
      constructionLabel: getSelectedConstructionLabel(),
      constructionType: dom.construction?.value || "",
      constructionSubtype: getSelectedConstructionSubtype(),
      constructionSubtypeLabel:
        dom.construction?.dataset.subtypeLabel || "",
      constructionPileElement: isBoredPileFoundation()
        ? getSelectedPileElement()
        : "",
      constructionPileElementLabel: isBoredPileFoundation()
        ? getSelectedPileElement() === "grillage"
          ? "Ростверк"
          : "Свая"
        : "",
      ...bim.collectCheckData(),
      stairName:
        flags.isStair
          ? dom.reinfStairNameEl?.value.trim() || null
          : null,
      floor,
      axisMode:
        behavior.locationMode === "strip_foundation" && usesLocation
          ? dom.reinfStripAxisModeEl?.value || "letter_numbers"
          : null,
      axisLetterFrom:
        usesLocation ? dom.reinfAxisLetterFromEl?.value || null : null,
      axisLetterTo:
        usesLocation &&
        !(
          behavior.locationMode === "strip_foundation" &&
          dom.reinfStripAxisModeEl?.value === "number_letters"
        )
          ? dom.reinfAxisLetterToEl?.value || null
          : null,
      axisNumberFrom:
        usesLocation ? dom.reinfAxisNumberFromEl?.value || null : null,
      axisNumberTo:
        usesLocation &&
        !(
          behavior.locationMode === "strip_foundation" &&
          (dom.reinfStripAxisModeEl?.value || "letter_numbers") ===
            "letter_numbers"
        )
          ? dom.reinfAxisNumberToEl?.value || null
          : null,
      location: usesLocation ? updateLocation() || null : null,
      columns,
      beams,
      walls,
      projDia: common ? numericValue(dom.projDia) : null,
      factDia: common ? numericValue(dom.factDia) : null,
      projStep:
        common &&
        (!isBoredPileFoundation() ||
          getSelectedPileElement() === "grillage")
          ? numericValue(dom.projStep)
          : null,
      factStep:
        common &&
        (!isBoredPileFoundation() ||
          getSelectedPileElement() === "grillage")
          ? numericValue(dom.factStep)
          : null,
      projCover: common ? numericValue(dom.projCover) : null,
      factCover: common ? numericValue(dom.factCover) : null,
      projHoopsStep: behavior.showReinforcementHoopsStep
        ? numericValue(dom.reinfProjHoopsStepEl)
        : null,
      factHoopsStep: behavior.showReinforcementHoopsStep
        ? numericValue(dom.reinfFactHoopsStepEl)
        : null
    };
  }

  function restoreRows(check: ReinforcementCheckRecord) {
    state.columns = (check.columns || []).map((item, index) => ({
      id: now() + index,
      marking: normalizeMarking(item.marking) || "",
      projDia: formValue(item.projDia),
      factDia: formValue(item.factDia),
      projStep: formValue(item.projStep),
      factStep: formValue(item.factStep),
      projCover: formValue(item.projCover),
      factCover: formValue(item.factCover),
      projHoopsStep: formValue(item.projHoopsStep),
      factHoopsStep: formValue(item.factHoopsStep)
    } satisfies ReinforcementColumn));
    state.beams = (check.beams || []).map((item, index) => ({
      id: now() + index,
      marking: normalizeMarking(item.marking) || "",
      projDia: formValue(item.projDia),
      factDia: formValue(item.factDia),
      projStep: formValue(item.projStep),
      factStep: formValue(item.factStep),
      projCover: formValue(item.projCover),
      factCover: formValue(item.factCover)
    } satisfies ReinforcementBeam));
    state.walls = (check.walls || []).map((item, index) => ({
      id: now() + index,
      bindingType:
        item.bindingType === "letter_numbers"
          ? "letter_numbers"
          : "number_letters",
      numberAxis: formValue(item.numberAxis),
      letterAxis1: formValue(item.letterAxis1),
      letterAxis2: formValue(item.letterAxis2),
      letterAxis: formValue(item.letterAxis),
      numberAxis1: formValue(item.numberAxis1),
      numberAxis2: formValue(item.numberAxis2),
      projDia: formValue(item.projDia),
      factDia: formValue(item.factDia),
      projStep: formValue(item.projStep),
      factStep: formValue(item.factStep),
      projCover: formValue(item.projCover),
      factCover: formValue(item.factCover)
    } satisfies ReinforcementWall));
  }

  async function restoreCheck(check: ReinforcementCheckRecord) {
    await Promise.resolve(
      setConstruction(
        String(check.construction || check.constructionType || ""),
        String(check.constructionSubtype || ""),
        String(check.constructionPileElement || "")
      )
    );
    updateFieldsVisibility(false);
    state.currentCheckId = String(check.id || "") || null;
    if (dom.reinfFloorEl) dom.reinfFloorEl.value = formValue(check.floor);
    if (dom.reinfColumnFloorEl) {
      dom.reinfColumnFloorEl.value = formValue(check.floor);
    }
    if (dom.reinfBeamFloorEl) {
      dom.reinfBeamFloorEl.value = formValue(check.floor);
    }
    if (dom.reinfWallFloorEl) {
      dom.reinfWallFloorEl.value = formValue(check.floor);
    }
    if (dom.reinfStairNameEl) {
      dom.reinfStairNameEl.value = formValue(check.stairName);
    }
    if (dom.reinfStripAxisModeEl && check.axisMode) {
      dom.reinfStripAxisModeEl.value =
        check.axisMode === "number_letters"
          ? "number_letters"
          : "letter_numbers";
    }
    if (dom.reinfAxisLetterFromEl) {
      dom.reinfAxisLetterFromEl.value = formValue(check.axisLetterFrom);
    }
    if (dom.reinfAxisLetterToEl) {
      dom.reinfAxisLetterToEl.value = formValue(check.axisLetterTo);
    }
    if (dom.reinfAxisNumberFromEl) {
      dom.reinfAxisNumberFromEl.value = formValue(check.axisNumberFrom);
    }
    if (dom.reinfAxisNumberToEl) {
      dom.reinfAxisNumberToEl.value = formValue(check.axisNumberTo);
    }
    if (dom.reinfLocationEl) {
      dom.reinfLocationEl.value = formValue(check.location);
    }
    restoreRows(check);
    const measurementFields: Array<
      [HTMLInputElement | null, unknown]
    > = [
      [dom.projDia, check.projDia],
      [dom.factDia, check.factDia],
      [dom.projStep, check.projStep],
      [dom.factStep, check.factStep],
      [dom.projCover, check.projCover],
      [dom.factCover, check.factCover],
      [dom.reinfProjHoopsStepEl, check.projHoopsStep],
      [dom.reinfFactHoopsStepEl, check.factHoopsStep]
    ];
    measurementFields.forEach(([element, value]) => {
      if (element) {
        element.value = formValue(value);
      }
    });
    rows.renderColumns();
    rows.renderBeams();
    rows.renderWalls();
    if (dom.reinfResult) {
      dom.reinfResult.className = "result";
      if (check.status === "ok") dom.reinfResult.classList.add("ok");
      if (check.status === "bad" || check.status === "exceeded") {
        dom.reinfResult.classList.add("not-ok");
      }
      dom.reinfResult.innerHTML = String(check.lastMsg || "");
    }
    bim.restoreSelection(check);
    updateLocation();
  }

  function openRestoredCheckForm() {
    if (dom.reinforcementWizard) {
      const parametersButton =
        dom.reinforcementParametersStepButton;
      const parametersStep = dom.reinforcementParametersStep;
      if (!parametersButton || !parametersStep) return false;
      parametersButton.click();
      if (!parametersStep.classList.contains("is-active")) {
        return false;
      }
    }
    dom.reinforcementSection?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
    const flags = getConstructionFlags();
    const primaryField = flags.isColumn
      ? dom.reinfColumnFloorEl
      : flags.isBeam
        ? dom.reinfBeamFloorEl
        : flags.isWall
          ? dom.reinfWallFloorEl
          : dom.reinfFloorEl;
    if (primaryField) {
      primaryField.focus();
      return true;
    }
    if (dom.reinforcementSection) {
      dom.reinforcementSection.tabIndex = -1;
      dom.reinforcementSection.focus();
    }
    return true;
  }

  function init() {
    initAxes();
    [
      dom.reinfFloorEl,
      dom.reinfStairNameEl,
      dom.reinfAxisLetterFromEl,
      dom.reinfAxisLetterToEl,
      dom.reinfAxisNumberFromEl,
      dom.reinfAxisNumberToEl
    ].forEach((element) =>
      element?.addEventListener("change", updateLocation)
    );
  }

  return {
    init,
    clear,
    readCheck,
    restoreCheck,
    openRestoredCheckForm,
    updateLocation,
    updateFieldsVisibility,
    getConstructionFlags,
    getSelectedConstructionKey,
    getSelectedConstructionLabel,
    getSelectedConstructionCategory,
    getSelectedConstructionSubtype,
    getSelectedPileElement,
    isBoredPileFoundation,
    setUnsupportedState
  };
}

export type ReinforcementForm =
  ReturnType<typeof createReinforcementForm>;
