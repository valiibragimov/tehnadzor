import { t } from "../../../shared/i18n/index.js";
import { compareMeasurement, measurementNumber } from "../acceptance.js";
import { readAcceptanceCriteria, restoreAcceptanceCriteria } from "../../../app/ui/acceptance-criteria.js";
import {
  getConstructionEntityLabels,
  getConstructionModuleBehavior,
  getConstructionModuleFallbackMessage,
  isConstructionProfile,
  normalizeConstructionKey
} from "../../../app/construction.js";
import { APP_CONFIG } from "../../../config.js";
import {
  defaultNumbers,
  defaultRusLetters,
  normalizeMarking,
  sanitizeHtml,
  toDocIdPart
} from "../../../utils.js";
import { replaceGeodesyItems, type GeodesyState } from "./state.js";
import type { createGeodesyDomBindings } from "./dom.js";
import type { GeodesyBimApi } from "./types.js";
import type {
  GeodesyBindingType,
  GeodesyNodeRecord,
  GeodesyOpeningPointDraft
} from "./types.js";

type GeodesyDomBindings = ReturnType<typeof createGeodesyDomBindings>;

export interface GeodesyFormBehavior {
  geodesyHeightOnly?: boolean;
  elementSheetMode?: string;
  floorVisible?: boolean;
  locationMode?: string;
  showOpeningPoints?: boolean;
  showGeoFlatnessCheck?: boolean;
  showStairName?: boolean;
}

export interface GeodesyConstructionFlags {
  behavior: GeodesyFormBehavior;
  floorVisible?: boolean;
  isBeam: boolean;
  isColumn: boolean;
  isRangeLocation: boolean;
  isSingleAxis: boolean;
  isStripFoundation: boolean;
  isUnsupported: boolean;
  isWall: boolean;
  maxWalls?: number;
}

interface GeodesyFormDependencies {
  state: GeodesyState;
  bim: Pick<GeodesyBimApi, "syncFromNode" | "updateControls">;
  dom: GeodesyDomBindings;
  construction: HTMLElement;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  safeValue(value: unknown): string;
  showNotification(message: string, tone?: string): void;
  getGeoConstructionFlags(value?: string): GeodesyConstructionFlags;
  getCurrentConstructionKey(): string;
  getCurrentConstructionSubtype(): string;
  getCurrentPileElement(): string;
  setConstructionAndTrigger(
    constructionType: string,
    constructionSubtype?: string,
    constructionPileElement?: string
  ): boolean;
  saveMeta(): void;
}

export function createGeodesyForm({
  state: geodesyNodeState,
  bim,
  dom,
  construction,
  inspectionState: state,
  inspectionChecked: checked,
  safeValue,
  showNotification,
  getGeoConstructionFlags,
  getCurrentConstructionKey,
  getCurrentConstructionSubtype,
  getCurrentPileElement,
  setConstructionAndTrigger,
  saveMeta
}: GeodesyFormDependencies) {
  const { nodes, columns, walls, beams, plateOpeningPoints } = geodesyNodeState;
  const {
    btnGeo, btnUpdateNode, btnAddColumn, btnGeoColumns, btnAddWall,
    btnGeoWalls, btnAddBeam, btnGeoBeams, btnAddGeoPlateOpeningPoint,
    columnMarkEl, columnMarkField, columnsBlock, columnsList,
    wallsBlock, wallsList, beamsBlock, beamsList, geoWallsLimitLabel,
    axisFields, geoStripAxisModeField, axisLetterSingleField,
    axisNumberSingleField, axisLetterFromField, axisLetterToField,
    axisNumberFromField, axisNumberToField, coordinatesBlock,
    projHField, factHField, tolHField,
    floorEl, axisLetterEl, axisNumberEl, axisLetterFromEl, axisLetterToEl,
    axisNumberFromEl, axisNumberToEl, geoStripAxisModeEl, nodeIdEl,
    nodeIdField, geoResult, geoBehaviorMessage,
    geoPlateOpeningPointsField, geoPlateOpeningPointsList,
    geoPlateFlatnessField, geoStairNameField,
    geoElementsTrigger, geoCoordinatesTrigger,
    geoPlateFlatnessActualEl, geoPlateFlatnessBaseEl,
    geoPlateFlatnessClassEl, geoPlateFlatnessToleranceEl,
    geoPlateFlatnessCheckedEl, geoStairNameEl,
    projX, factX, projY, factY, projH, factH
  } = dom;
  const formValue = (value: unknown) =>
    value == null ? "" : String(value);

  const fillSelect = (element: HTMLElement | null, items: string[]) => {
    if (!element) return;
    element.textContent = "";
    items.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      element.appendChild(option);
    });
  };
  fillSelect(axisLetterEl, defaultRusLetters);
  fillSelect(axisNumberEl, defaultNumbers);
  fillSelect(axisLetterFromEl, defaultRusLetters);
  fillSelect(axisLetterToEl, defaultRusLetters);
  fillSelect(axisNumberFromEl, defaultNumbers);
  fillSelect(axisNumberToEl, defaultNumbers);
  axisLetterEl.value = APP_CONFIG.DEFAULT_LETTER_AXIS;
  axisNumberEl.value = APP_CONFIG.DEFAULT_NUMBER_AXIS;
  if (axisLetterFromEl) {
    axisLetterFromEl.value = APP_CONFIG.DEFAULT_LETTER_AXIS;
  }
  if (axisLetterToEl) {
    axisLetterToEl.value = APP_CONFIG.DEFAULT_LETTER_AXIS;
  }
  if (axisNumberFromEl) {
    axisNumberFromEl.value = APP_CONFIG.DEFAULT_NUMBER_AXIS;
  }
  if (axisNumberToEl) {
    axisNumberToEl.value = APP_CONFIG.DEFAULT_NUMBER_AXIS;
  }

  const getGeoWallLimit = () =>
    getGeoConstructionFlags().maxWalls || APP_CONFIG.MAX_ELEMENTS;
  const getGeoWallEntityLabels = () =>
    getConstructionEntityLabels(
      getCurrentConstructionKey(),
      "geo",
      getCurrentConstructionSubtype()
    );
  const getGeoWallEntityLabel = () => getGeoWallEntityLabels().singular;
  const getGeoWallEntityPlural = () => getGeoWallEntityLabels().plural;
  const getGeoWallEntityPluralGenitive = () =>
    getGeoWallEntityLabels().pluralGenitive;
  const getGeoWallEntityAddText = () => getGeoWallEntityLabels().addText;
  const getGeoWallEntityRequiredText = () =>
    getGeoWallEntityLabels().requiredText;

  function updateGeoWallsLimitUi() {
    const maxWalls = getGeoWallLimit();
    if (geoWallsLimitLabel) {
      geoWallsLimitLabel.textContent = `${getGeoWallEntityPlural()} (до ${maxWalls})`;
    }
    if (btnAddWall) {
      const addWallButton = btnAddWall as HTMLButtonElement;
      const label = addWallButton.querySelector(".lg-btn__label");
      if (label) label.textContent = `+ Добавить ${getGeoWallEntityAddText()}`;
      const isAtLimit = walls.length >= maxWalls;
      addWallButton.disabled = isAtLimit;
      addWallButton.title = isAtLimit
        ? `Достигнут лимит ${maxWalls}: ${getGeoWallEntityPluralGenitive()}`
        : "";
    }
    if (btnGeoWalls) {
      btnGeoWalls.textContent = `Проверить ${getGeoWallEntityPluralGenitive()}`;
    }
  }

  function renderGeoToleranceFields() {
    const criteria = readAcceptanceCriteria(document.getElementById("geo"));
    const input = document.getElementById("tolHField") as HTMLInputElement | null;
    const limits = criteria.limits.geoHeight;
    if (input) input.value = criteria.confirmed && criteria.reference && limits?.min != null && limits.max != null && limits.min <= limits.max ? `${limits.min} … ${limits.max} ${t("form_mm")}` : t("assessment_pending");
  }
  document.getElementById("geo")?.addEventListener("input", renderGeoToleranceFields);
  document.getElementById("geo")?.addEventListener("change", renderGeoToleranceFields);
  function updateGeoFieldsVisibility() {
    renderGeoToleranceFields();
    const {
      behavior,
      isColumn,
      isWall,
      isBeam,
      isRangeLocation,
      isSingleAxis,
      isStripFoundation,
      isUnsupported
    } = getGeoConstructionFlags();
    const showElementsSheet = behavior.elementSheetMode === "columns" || behavior.elementSheetMode === "walls" || behavior.elementSheetMode === "beams";
    const showCoordinatesSheet = !isUnsupported && (isRangeLocation || isSingleAxis || behavior.geodesyHeightOnly);
    const pointField = document.getElementById("geoPointLabelField");
    if (pointField) pointField.hidden = !behavior.geodesyHeightOnly;
    for (const field of Array.from(coordinatesBlock.children) as HTMLElement[]) {
      if (!["projHField", "factHField", "tolHFieldWrap"].includes(field.id)) field.style.display = behavior.geodesyHeightOnly ? "none" : "";
    }

    if (geoBehaviorMessage) {
      geoBehaviorMessage.hidden = !isUnsupported;
      geoBehaviorMessage.style.display = isUnsupported ? "" : "none";
      geoBehaviorMessage.textContent = isUnsupported
        ? getConstructionModuleFallbackMessage(getCurrentConstructionKey(), "geo", "", getCurrentConstructionSubtype())
        : "";
    }
    if (!isUnsupported && geoResult) {
      geoResult.style.display = "";
    }

    columnMarkField.style.display = isColumn ? "block" : "none";
    if (geoStairNameField) {
      geoStairNameField.style.display = behavior.showStairName ? "block" : "none";
    }

    const showAxisFields = !isUnsupported && (isRangeLocation || isSingleAxis || behavior.geodesyHeightOnly);
    axisFields.style.display = showAxisFields ? "grid" : "none";
    if (axisFields) {
      axisFields.classList.toggle("grid-3", !isRangeLocation);
      axisFields.classList.toggle("grid-4", isRangeLocation);
    }
    const stripMode = geoStripAxisModeEl?.value || "letter_numbers";
    if (geoStripAxisModeField) geoStripAxisModeField.style.display = isRangeLocation && behavior.locationMode === "strip_foundation" ? "" : "none";
    if (axisLetterSingleField) axisLetterSingleField.style.display = isSingleAxis ? "" : "none";
    if (axisNumberSingleField) axisNumberSingleField.style.display = isSingleAxis ? "" : "none";
    if (axisLetterFromField) axisLetterFromField.style.display = isRangeLocation ? "" : "none";
    if (axisLetterToField) axisLetterToField.style.display = isRangeLocation && (!isStripFoundation || stripMode === "letter_numbers") ? "" : "none";
    if (axisNumberFromField) axisNumberFromField.style.display = isRangeLocation ? "" : "none";
    if (axisNumberToField) axisNumberToField.style.display = isRangeLocation && (!isStripFoundation || stripMode === "number_letters") ? "" : "none";
    if (nodeIdField) nodeIdField.classList.toggle("grid-full-span", isRangeLocation);

    coordinatesBlock.style.display = showCoordinatesSheet ? "grid" : "none";

    columnsBlock.style.display = behavior.elementSheetMode === "columns" ? "block" : "none";
    wallsBlock.style.display = behavior.elementSheetMode === "walls" ? "block" : "none";
    if (behavior.elementSheetMode === "walls" && walls.length > getGeoConstructionFlags().maxWalls) {
      walls.splice(getGeoConstructionFlags().maxWalls);
      renderWalls();
    } else {
      updateGeoWallsLimitUi();
    }
    beamsBlock.style.display = behavior.elementSheetMode === "beams" ? "block" : "none";
    if (geoPlateOpeningPointsField) {
      geoPlateOpeningPointsField.style.display = behavior.showOpeningPoints ? "block" : "none";
    }
    if (geoPlateFlatnessField) {
      geoPlateFlatnessField.style.display = behavior.showGeoFlatnessCheck ? "block" : "none";
    }
    if (floorEl?.parentElement) {
      floorEl.parentElement.style.display = behavior.floorVisible === false ? "none" : "block";
    }

    if (isUnsupported) {
      setGeoUnsupportedState();
    }

    if (geoPlateOpeningPointsField) {
      geoPlateOpeningPointsField.style.display = behavior.showOpeningPoints ? "block" : "none";
      if (behavior.showOpeningPoints) {
        normalizeGeoPlateAxisDefaults();
        renderGeoPlateOpeningPoints();
      }
    }
    if (isRangeLocation) {
      normalizeGeoPlateAxisDefaults();
    }
    if (geoElementsTrigger) {
      geoElementsTrigger.style.display = showElementsSheet ? "inline-flex" : "none";
    }
    if (geoCoordinatesTrigger) {
      geoCoordinatesTrigger.style.display = showCoordinatesSheet ? "inline-flex" : "none";
    }

    const hideHForPileElement = getCurrentConstructionKey() === "pile_grillage" &&
      getCurrentConstructionSubtype() === "bored_piles" &&
      getCurrentPileElement() === "pile";
    if (showCoordinatesSheet && !hideHForPileElement) {
      projHField.style.display = "block";
      factHField.style.display = "block";
      tolHField.style.display = "block";
    } else {
      projHField.style.display = "none";
      factHField.style.display = "none";
      tolHField.style.display = "none";
      if (hideHForPileElement) {
        if (projH) projH.value = "";
        if (factH) factH.value = "";
      }
    }

    if (!isColumn) {
      columns.length = 0;
      renderColumns();
      columnMarkEl.value = "";
      geodesyNodeState.currentNodeKeys.column = null;
    }
    if (behavior.elementSheetMode !== "walls") {
      walls.length = 0;
      renderWalls();
      geodesyNodeState.currentNodeKeys.wall = null;
    }
    if (!isBeam) {
      beams.length = 0;
      renderBeams();
      geodesyNodeState.currentNodeKeys.beam = null;
    }
    if (!behavior.showOpeningPoints) {
      plateOpeningPoints.length = 0;
      renderGeoPlateOpeningPoints();
    }
    if (!behavior.showStairName && geoStairNameEl) {
      geoStairNameEl.value = "";
    }
    if (!behavior.showGeoFlatnessCheck && geoPlateFlatnessCheckedEl) {
      geoPlateFlatnessCheckedEl.checked = false;
    }
    if (!behavior.showGeoFlatnessCheck) {
      if (geoPlateFlatnessActualEl) geoPlateFlatnessActualEl.value = "";
      if (geoPlateFlatnessBaseEl) geoPlateFlatnessBaseEl.value = "2";
      if (geoPlateFlatnessClassEl) geoPlateFlatnessClassEl.value = "project";
      if (geoPlateFlatnessToleranceEl) geoPlateFlatnessToleranceEl.value = "";
    }
    updateGeoPlateFlatnessCalculatedFields();

    updateNodeId();
    bim.updateControls();
  }

  function updateGeoPlateFlatnessCalculatedFields() {
    if (!geoPlateFlatnessToleranceEl) return;
    const limits = readAcceptanceCriteria(document.getElementById("geo")).limits.geoFlatness;
    // Historical surface class and baseline remain measurement context, never an automatic limit.
    geoPlateFlatnessToleranceEl.readOnly = true;
    geoPlateFlatnessToleranceEl.value = String(limits?.max ?? "");
  }

  function collectGeoPlateFlatnessData() {
    const actual = measurementNumber(geoPlateFlatnessActualEl?.value);
    const criteria = readAcceptanceCriteria(document.getElementById("geo"));
    const verdict = actual != null && actual >= 0 ? compareMeasurement(0, actual, "geoFlatness", criteria) : "incomplete";
    const verified = verdict === "ok" || verdict === "exceeded";
    return {
      actual,
      base: geoPlateFlatnessBaseEl?.value || "2",
      surfaceClass: geoPlateFlatnessClassEl?.value || "project",
      tolerance: verified ? criteria.limits.geoFlatness.max : null,
      result: verified ? verdict : "",
      checked: verified
    };
  }

  document.getElementById("geo")?.addEventListener("input", event => {
    if ((event.target as HTMLElement).closest("[data-acceptance]")) updateGeoPlateFlatnessCalculatedFields();
  });

  [
    geoPlateFlatnessActualEl,
    geoPlateFlatnessBaseEl,
    geoPlateFlatnessClassEl,
    geoPlateFlatnessToleranceEl
  ].forEach((element) => {
    element?.addEventListener("input", updateGeoPlateFlatnessCalculatedFields);
    element?.addEventListener("change", updateGeoPlateFlatnessCalculatedFields);
  });
  updateGeoPlateFlatnessCalculatedFields();

  function setGeoUnsupportedState({ notify = false } = {}) {
    const message = getConstructionModuleFallbackMessage(
      getCurrentConstructionKey(),
      "geo",
      "",
      getCurrentConstructionSubtype()
    );
    const isFormwork = getCurrentConstructionKey() === "formwork";
    if (geoResult) {
      geoResult.className = "result";
      geoResult.textContent = isFormwork ? "" : message;
      geoResult.style.display = isFormwork ? "none" : "";
    }
    if (geoBehaviorMessage) {
      geoBehaviorMessage.hidden = false;
      geoBehaviorMessage.style.display = "";
      geoBehaviorMessage.textContent = message;
    }
    state.geo = false;
    checked.geo = false;
    if (notify) {
      showNotification(message, "warning");
    }
    return message;
  }

  function formatGeoPlateLocation({
    letterFrom = "",
    letterTo = "",
    numberFrom = "",
    numberTo = ""
  } = {}) {
    if (letterFrom && letterTo && numberFrom && numberTo) {
      return `${letterFrom}-${letterTo}, ${numberFrom}-${numberTo}`;
    }
    return "";
  }

  function getGeoAxisState(constructionType = construction?.value || "") {
    const geoFlags = getGeoConstructionFlags(constructionType);
    if (geoFlags.isStripFoundation) {
      const stripMode = geoStripAxisModeEl?.value || "letter_numbers";
      const letterFrom = axisLetterFromEl?.value || "";
      const letterTo = axisLetterToEl?.value || "";
      const numberFrom = axisNumberFromEl?.value || "";
      const numberTo = axisNumberToEl?.value || "";
      const isLetterNumbers = stripMode === "letter_numbers";
      const location = isLetterNumbers
        ? (numberFrom && letterFrom && letterTo ? `${numberFrom}, ${letterFrom}-${letterTo}` : "")
        : (numberFrom && numberTo && letterFrom ? `${numberFrom}-${numberTo}, ${letterFrom}` : "");

      return {
        isPlate: true,
        axisMode: stripMode,
        letterFrom,
        letterTo: isLetterNumbers ? letterTo : "",
        numberFrom,
        numberTo: isLetterNumbers ? "" : numberTo,
        location,
        nodeLabel: location,
        keyLetter: isLetterNumbers ? `${letterFrom}_${letterTo}` : letterFrom,
        keyNumber: isLetterNumbers ? numberFrom : `${numberFrom}_${numberTo}`,
        legacyLetter: "",
        legacyNumber: ""
      };
    }
    if (geoFlags.isRangeLocation) {
      const letterFrom = axisLetterFromEl?.value || "";
      const letterTo = axisLetterToEl?.value || "";
      const numberFrom = axisNumberFromEl?.value || "";
      const numberTo = axisNumberToEl?.value || "";
      const location = formatGeoPlateLocation({
        letterFrom,
        letterTo,
        numberFrom,
        numberTo
      });

      return {
        isPlate: true,
        letterFrom,
        letterTo,
        numberFrom,
        numberTo,
        location,
        nodeLabel: letterFrom && letterTo && numberFrom && numberTo
          ? `${letterFrom}-${letterTo} x ${numberFrom}-${numberTo}`
          : "",
        keyLetter: letterFrom && letterTo ? `${letterFrom}_${letterTo}` : (letterFrom || letterTo || ""),
        keyNumber: numberFrom && numberTo ? `${numberFrom}_${numberTo}` : (numberFrom || numberTo || ""),
        legacyLetter: letterFrom && letterTo && letterFrom === letterTo ? letterFrom : "",
        legacyNumber: numberFrom && numberTo && numberFrom === numberTo ? numberFrom : ""
      };
    }

    const letter = axisLetterEl?.value || "";
    const number = axisNumberEl?.value || "";
    return {
      isPlate: false,
      letter,
      number,
      location: letter && number ? `${letter} × ${number}` : "",
      nodeLabel: letter && number ? `${letter} × ${number}` : "",
      keyLetter: letter,
      keyNumber: number,
      legacyLetter: letter,
      legacyNumber: number
    };
  }

  function resetGeoPlateAxisFields({ axisMode = "letter_numbers" } = {}) {
    const defaultLetterFrom = APP_CONFIG.DEFAULT_LETTER_AXIS;
    const defaultLetterTo =
      defaultRusLetters.find((value) => value !== defaultLetterFrom) || defaultLetterFrom;
    const defaultNumberFrom = APP_CONFIG.DEFAULT_NUMBER_AXIS;
    const defaultNumberTo =
      defaultNumbers.find((value) => value !== defaultNumberFrom) || defaultNumberFrom;

    if (axisLetterFromEl) axisLetterFromEl.value = defaultLetterFrom;
    if (axisLetterToEl) axisLetterToEl.value = defaultLetterTo;
    if (axisNumberFromEl) axisNumberFromEl.value = defaultNumberFrom;
    if (axisNumberToEl) axisNumberToEl.value = defaultNumberTo;
    if (geoStripAxisModeEl) geoStripAxisModeEl.value = axisMode;
    syncGeoPlateAxisPrevValues();
  }

  function normalizeGeoPlateAxisDefaults() {
    if (!axisLetterFromEl || !axisLetterToEl || !axisNumberFromEl || !axisNumberToEl) {
      return;
    }

    if (!axisLetterFromEl.value) {
      axisLetterFromEl.value = APP_CONFIG.DEFAULT_LETTER_AXIS;
    }
    if (!axisLetterToEl.value || axisLetterToEl.value === axisLetterFromEl.value) {
      axisLetterToEl.value =
        defaultRusLetters.find((value) => value !== axisLetterFromEl.value) || axisLetterFromEl.value;
    }
    if (!axisNumberFromEl.value) {
      axisNumberFromEl.value = APP_CONFIG.DEFAULT_NUMBER_AXIS;
    }
    if (!axisNumberToEl.value || axisNumberToEl.value === axisNumberFromEl.value) {
      axisNumberToEl.value =
        defaultNumbers.find((value) => value !== axisNumberFromEl.value) || axisNumberFromEl.value;
    }

    syncGeoPlateAxisPrevValues();
  }

  function syncGeoPlateAxisPrevValues() {
    [axisLetterFromEl, axisLetterToEl, axisNumberFromEl, axisNumberToEl].forEach((select) => {
      if (select) select.dataset.prevValue = select.value || "";
    });
  }

  function validateGeoPlateAxisRange({ showWarning = true } = {}) {
    if (getGeoConstructionFlags().isStripFoundation) {
      const stripMode = geoStripAxisModeEl?.value || "letter_numbers";
      if (stripMode === "letter_numbers") {
        const valid = Boolean(axisNumberFromEl?.value && axisLetterFromEl?.value && axisLetterToEl?.value);
        if (valid && axisLetterFromEl?.value === axisLetterToEl?.value) {
          if (showWarning) showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
          return false;
        }
        return valid;
      }
      const valid = Boolean(axisNumberFromEl?.value && axisNumberToEl?.value && axisLetterFromEl?.value);
      if (valid && axisNumberFromEl?.value === axisNumberToEl?.value) {
        if (showWarning) showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
        return false;
      }
      return valid;
    }

    const letterFrom = axisLetterFromEl?.value || "";
    const letterTo = axisLetterToEl?.value || "";
    const numberFrom = axisNumberFromEl?.value || "";
    const numberTo = axisNumberToEl?.value || "";

    if (letterFrom && letterTo && letterFrom === letterTo) {
      if (showWarning) {
        showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
      }
      return false;
    }

    if (numberFrom && numberTo && numberFrom === numberTo) {
      if (showWarning) {
        showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
      }
      return false;
    }

    return true;
  }

  function bindGeoPlateAxisValidation(selectEl) {
    if (!selectEl) return;

    const rememberCurrentValue = () => {
      selectEl.dataset.prevValue = selectEl.value || "";
    };

    selectEl.addEventListener("focus", rememberCurrentValue);
    selectEl.addEventListener("mousedown", rememberCurrentValue);
    selectEl.addEventListener("touchstart", rememberCurrentValue, { passive: true });
    selectEl.addEventListener("change", () => {
      if (!getGeoConstructionFlags().isRangeLocation) {
        rememberCurrentValue();
        return;
      }

      const isLetterSelect = selectEl === axisLetterFromEl || selectEl === axisLetterToEl;
      const isInvalid = isLetterSelect
        ? (axisLetterFromEl?.value && axisLetterToEl?.value && axisLetterFromEl.value === axisLetterToEl.value)
        : (axisNumberFromEl?.value && axisNumberToEl?.value && axisNumberFromEl.value === axisNumberToEl.value);

      if (isInvalid) {
        showNotification(
          isLetterSelect
            ? "Буквенные оси не должны повторяться. Выберите разные буквенные оси."
            : "Цифровые оси не должны повторяться. Выберите разные цифровые оси.",
          "warning"
        );
        selectEl.value = selectEl.dataset.prevValue || "";
        updateNodeId();
        saveMeta();
        return;
      }

      syncGeoPlateAxisPrevValues();
    });
  }

  function createGeoPlateOpeningPoint(
    point: Partial<GeodesyOpeningPointDraft> = {}
  ) {
    return {
      id: point.id || (Date.now() + Math.floor(Math.random() * 1000)),
      projX: point.projX?.toString() || "",
      projY: point.projY?.toString() || "",
      factX: point.factX?.toString() || "",
      factY: point.factY?.toString() || ""
    };
  }

  function renderGeoPlateOpeningPoints() {
    if (!geoPlateOpeningPointsList) return;
    geoPlateOpeningPointsList.innerHTML = "";

    if (plateOpeningPoints.length === 0) {
      geoPlateOpeningPointsList.innerHTML = '<div class="caption" style="padding: 8px;">Точки проёма пока не добавлены.</div>';
      return;
    }

    plateOpeningPoints.forEach((point, index) => {
      const pointDiv = document.createElement("div");
      pointDiv.className = "card";
      pointDiv.style.marginBottom = "8px";
      pointDiv.style.padding = "12px";
      pointDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <b>Точка ${index + 1}</b>
          <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact lg-btn--micro" data-remove="${safeValue(point.id)}">
            <span class="lg-btn__label">Удалить</span>
            <span class="lg-btn__glow" aria-hidden="true"></span>
          </button>
        </div>
        <div class="grid-2">
          <div>
            <label data-i18n="form_design_x">Проектная X</label>
            <input type="number" inputmode="decimal" class="geo-opening-point-projX" data-id="${safeValue(point.id)}" placeholder="мм" value="${safeValue(point.projX)}" />
          </div>
          <div>
            <label data-i18n="form_design_y">Проектная Y</label>
            <input type="number" inputmode="decimal" class="geo-opening-point-projY" data-id="${safeValue(point.id)}" placeholder="мм" value="${safeValue(point.projY)}" />
          </div>
          <div>
            <label data-i18n="form_measured_x">Фактическая X</label>
            <input type="number" inputmode="decimal" class="geo-opening-point-factX" data-id="${safeValue(point.id)}" placeholder="мм" value="${safeValue(point.factX)}" />
          </div>
          <div>
            <label data-i18n="form_measured_y">Фактическая Y</label>
            <input type="number" inputmode="decimal" class="geo-opening-point-factY" data-id="${safeValue(point.id)}" placeholder="мм" value="${safeValue(point.factY)}" />
          </div>
        </div>
      `;

      pointDiv.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", (event) => {
          const pointId = Number(event.target.dataset.id);
          const item = plateOpeningPoints.find((entry) => entry.id === pointId);
          if (!item) return;
          if (event.target.classList.contains("geo-opening-point-projX")) item.projX = event.target.value;
          if (event.target.classList.contains("geo-opening-point-projY")) item.projY = event.target.value;
          if (event.target.classList.contains("geo-opening-point-factX")) item.factX = event.target.value;
          if (event.target.classList.contains("geo-opening-point-factY")) item.factY = event.target.value;
        });
      });

      pointDiv.querySelector(`[data-remove="${point.id}"]`)?.addEventListener("click", () => {
        replaceGeodesyItems(
          plateOpeningPoints,
          plateOpeningPoints.filter((entry) => entry.id !== point.id)
        );
        renderGeoPlateOpeningPoints();
      });

      geoPlateOpeningPointsList.appendChild(pointDiv);
    });
  }

  function addGeoPlateOpeningPoint(point = {}) {
    plateOpeningPoints.push(createGeoPlateOpeningPoint(point));
    renderGeoPlateOpeningPoints();
    setTimeout(() => {
      const lastPoint = geoPlateOpeningPointsList?.querySelector(".card:last-child");
      if (lastPoint) {
        lastPoint.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
  }


    function ensureColumnPrefillRow() {
      if (columns.length === 0) {
        columns.push({
          id: Date.now(), mark: "", projX: "", factX: "", projY: "", factY: ""
        });
      }
      return columns[0];
    }

    function createEmptyLinearRow(id = Date.now()) {
      return {
        id,
        bindingType: "number_letters" as const,
        numberAxis: "", letterAxis1: "", letterAxis2: "",
        letterAxis: "", numberAxis1: "", numberAxis2: "",
        projX_num_let1: "", factX_num_let1: "",
        projY_num_let1: "", factY_num_let1: "",
        projX_num_let2: "", factX_num_let2: "",
        projY_num_let2: "", factY_num_let2: "",
        projX_let_num1: "", factX_let_num1: "",
        projY_let_num1: "", factY_let_num1: "",
        projX_let_num2: "", factX_let_num2: "",
        projY_let_num2: "", factY_let_num2: ""
      };
    }

    const createEmptyWallRow = createEmptyLinearRow;
    const createEmptyBeamRow = createEmptyLinearRow;



  interface GeoNodeKeyOptions {
    constructionValue?: string;
    floorValue?: string;
    letterValue?: string;
    numberValue?: string;
    letterFrom?: string;
    letterTo?: string;
    numberFrom?: string;
    numberTo?: string;
  }

  function buildGeoNodeKey({
    constructionValue,
    floorValue,
    letterValue = "",
    numberValue = "",
    letterFrom = "",
    letterTo = "",
    numberFrom = "",
    numberTo = ""
  }: GeoNodeKeyOptions = {}) {
    const rawFloor = floorValue || "";
    const behavior = getConstructionModuleBehavior(
      constructionValue,
      "geo",
      construction?.dataset.subtypeKey || ""
    );
    const isRangeLocation =
      behavior.locationMode === "plate_range" || behavior.locationMode === "strip_foundation";
    const rawLetter = isRangeLocation
      ? (letterFrom && letterTo ? `${letterFrom}_${letterTo}` : (letterFrom || letterTo || letterValue || ""))
      : (letterValue || "");
    const rawNumber = isRangeLocation
      ? (numberFrom && numberTo ? `${numberFrom}_${numberTo}` : (numberFrom || numberTo || numberValue || ""))
      : (numberValue || "");

    const safeFloor = toDocIdPart(rawFloor);
    const safeLetter = toDocIdPart(rawLetter);
    const safeNumber = toDocIdPart(rawNumber);

    const rawBaseKey = rawFloor ? `${rawFloor}-${rawLetter}-${rawNumber}` : `${rawLetter}-${rawNumber}`;
    const safeBaseKey = safeFloor ? `${safeFloor}-${safeLetter}-${safeNumber}` : `${safeLetter}-${safeNumber}`;

    const rawPrefixedKey = constructionValue ? `${constructionValue}:${rawBaseKey}` : rawBaseKey;
    const safePrefixedKey = constructionValue ? `${constructionValue}:${safeBaseKey}` : safeBaseKey;
    const hasMatchingNodeKey = (candidateKey: string) => {
      if (!candidateKey || !nodes?.has(candidateKey)) return false;
      if (candidateKey.includes(":")) return true;
      const legacyNode = nodes.get(candidateKey);
      return Boolean(
        legacyNode &&
        normalizeConstructionKey(legacyNode.construction || legacyNode.constructionType) === constructionValue
      );
    };
    const buildBaseKey = (rawLetterPart: string, rawNumberPart: string) =>
      rawFloor ? `${rawFloor}-${rawLetterPart}-${rawNumberPart}` : `${rawLetterPart}-${rawNumberPart}`;
    const buildPrefixedKey = (baseKey: string) =>
      constructionValue ? `${constructionValue}:${baseKey}` : baseKey;

    if (hasMatchingNodeKey(rawPrefixedKey)) {
      return rawPrefixedKey;
    }
    if (hasMatchingNodeKey(rawBaseKey)) {
      return rawBaseKey;
    }

    if (behavior.locationMode === "plate_range" && letterFrom && numberFrom) {
      const legacyRangeKeys = [
        letterTo ? buildBaseKey(`${letterFrom}_${letterTo}`, numberFrom) : "",
        numberTo ? buildBaseKey(letterFrom, `${numberFrom}_${numberTo}`) : ""
      ].filter(Boolean);
      for (const legacyBaseKey of legacyRangeKeys) {
        const legacyPrefixedKey = buildPrefixedKey(legacyBaseKey);
        if (hasMatchingNodeKey(legacyPrefixedKey)) {
          return legacyPrefixedKey;
        }
        if (hasMatchingNodeKey(legacyBaseKey)) {
          return legacyBaseKey;
        }
      }
    }

    if (
      isRangeLocation &&
      letterFrom &&
      letterTo &&
      numberFrom &&
      numberTo &&
      letterFrom === letterTo &&
      numberFrom === numberTo
    ) {
      const legacyLetter = letterFrom;
      const legacyNumber = numberFrom;
      const legacyBaseKey = rawFloor ? `${rawFloor}-${legacyLetter}-${legacyNumber}` : `${legacyLetter}-${legacyNumber}`;
      const legacyPrefixedKey = constructionValue ? `${constructionValue}:${legacyBaseKey}` : legacyBaseKey;
      if (nodes && nodes.has(legacyPrefixedKey)) {
        return legacyPrefixedKey;
      }
      if (nodes && nodes.has(legacyBaseKey)) {
        const legacyNode = nodes.get(legacyBaseKey);
        if (legacyNode && normalizeConstructionKey(legacyNode.construction || legacyNode.constructionType) === constructionValue) {
          return legacyBaseKey;
        }
      }
    }

    return safePrefixedKey;
  }

  // Функция добавления колонны
  function addColumn() {
    if (columns.length >= 20) {
      showNotification(`Максимальное количество колонн - ${APP_CONFIG.MAX_ELEMENTS}`, "warning");
      return;
    }

    columns.push({
      id: Date.now(),
      mark: normalizeMarking(columnMarkEl.value) || "",
      projX: "",
      factX: "",
      projY: "",
      factY: ""
    });

    renderColumns();

    // Автопрокрутка к последней добавленной колонне
    setTimeout(() => {
      const lastCol = columnsList.querySelector('.card:last-child');
      if (lastCol) {
        lastCol.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  }

  // Функция удаления колонны
  function removeColumn(id) {
    replaceGeodesyItems(columns, columns.filter(c => c.id !== id));
    renderColumns();
  }

  // Функция отрисовки списка колонн
  function renderColumns() {
    columnsList.innerHTML = "";

    if (columns.length === 0) {
      columnsList.innerHTML = '<div class="caption" style="padding: 8px;">Нет добавленных колонн. Нажмите "Добавить колонну" для начала.</div>';
      return;
    }

    columns.forEach((col, index) => {
      const colDiv = document.createElement("div");
      colDiv.className = "card";
      colDiv.style.marginBottom = "8px";
      colDiv.style.padding = "12px";
      colDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <b>Колонна ${index + 1}${col.mark ? `: ${safeValue(col.mark)}` : ""}</b>
          <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact lg-btn--micro" data-remove="${safeValue(col.id)}">
            <span class="lg-btn__label">Удалить</span>
            <span class="lg-btn__glow" aria-hidden="true"></span>
          </button>
        </div>
        <div class="grid-4">
          <div>
            <label data-i18n="form_design_x">Проектная X</label>
            <input type="number" inputmode="decimal" class="col-projX" data-id="${safeValue(col.id)}" data-col-index="${index}" placeholder="мм" value="${safeValue(col.projX)}" />
          </div>
          <div>
            <label data-i18n="form_measured_x">Фактическая X</label>
            <input type="number" inputmode="decimal" class="col-factX" data-id="${safeValue(col.id)}" data-col-index="${index}" placeholder="мм" value="${safeValue(col.factX)}" />
          </div>
          <div>
            <label data-i18n="form_design_y">Проектная Y</label>
            <input type="number" inputmode="decimal" class="col-projY" data-id="${safeValue(col.id)}" data-col-index="${index}" placeholder="мм" value="${safeValue(col.projY)}" />
          </div>
          <div>
            <label data-i18n="form_measured_y">Фактическая Y</label>
            <input type="number" inputmode="decimal" class="col-factY" data-id="${safeValue(col.id)}" data-col-index="${index}" placeholder="мм" value="${safeValue(col.factY)}" />
          </div>
        </div>
      `;

      // Обработчики для полей
      colDiv.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener("input", (e) => {
          const colId = parseInt(e.target.dataset.id);
          const col = columns.find(c => c.id === colId);
          if (col) {
            if (e.target.classList.contains("col-projX")) col.projX = e.target.value;
            if (e.target.classList.contains("col-factX")) col.factX = e.target.value;
            if (e.target.classList.contains("col-projY")) col.projY = e.target.value;
            if (e.target.classList.contains("col-factY")) col.factY = e.target.value;
          }
        });
      });

      // Обработчик удаления
      colDiv.querySelector(`[data-remove="${col.id}"]`).addEventListener("click", () => {
        removeColumn(col.id);
      });

      columnsList.appendChild(colDiv);
    });
  }

  btnAddColumn.addEventListener("click", addColumn);
  if (btnAddGeoPlateOpeningPoint) {
    btnAddGeoPlateOpeningPoint.addEventListener("click", () => addGeoPlateOpeningPoint());
  }

  // Кнопка проверки колонн
  if (btnGeoColumns) {
    btnGeoColumns.addEventListener("click", () => {
      btnGeo?.click();
    });
  }

  // Функции для работы со стенами

  function checkWallDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis, numberAxis1, numberAxis2, excludeId = null) {
    // Если оси не заполнены, не проверяем на дубликаты
    if (bindingType === "number_letters") {
      if (!numberAxis || !letterAxis1 || !letterAxis2) return false;
    } else {
      if (!letterAxis || !numberAxis1 || !numberAxis2) return false;
    }

    return walls.some(wall => {
      if (wall.id === excludeId) return false;

      if (bindingType === "number_letters" && wall.bindingType === "number_letters") {
        // Проверяем комбинацию: число и две буквы (порядок букв не важен)
        if (!wall.numberAxis || !wall.letterAxis1 || !wall.letterAxis2) return false;
        const letters1 = [letterAxis1, letterAxis2].sort().join("-");
        const letters2 = [wall.letterAxis1, wall.letterAxis2].sort().join("-");
        return numberAxis === wall.numberAxis && letters1 === letters2;
      } else if (bindingType === "letter_numbers" && wall.bindingType === "letter_numbers") {
        // Проверяем комбинацию: буква и два числа (порядок чисел не важен)
        if (!wall.letterAxis || !wall.numberAxis1 || !wall.numberAxis2) return false;
        const nums1 = [numberAxis1, numberAxis2].sort((a, b) => parseInt(a) - parseInt(b)).join("-");
        const nums2 = [wall.numberAxis1, wall.numberAxis2].sort((a, b) => parseInt(a) - parseInt(b)).join("-");
        return letterAxis === wall.letterAxis && nums1 === nums2;
      }
      return false;
    });
  }

  function addWall() {
    const maxWalls = getGeoWallLimit();
    if (walls.length >= maxWalls) {
      showNotification(`Максимальное количество ${getGeoWallEntityPluralGenitive()} - ${maxWalls}`, "warning");
      return;
    }

    const newWall = createEmptyWallRow();

    // Проверяем на дубликаты
    if (checkWallDuplicate(
      newWall.bindingType,
      newWall.numberAxis,
      newWall.letterAxis1,
      newWall.letterAxis2,
      newWall.letterAxis,
      newWall.numberAxis1,
      newWall.numberAxis2
    )) {
      showNotification(`${getGeoWallEntityLabel()} с такими же осями уже существует. Измените оси для нового элемента.`, "warning");
      return;
    }

    walls.push(newWall);
    renderWalls();

    // Автопрокрутка к последней добавленной стене
    setTimeout(() => {
      const lastWall = wallsList.querySelector('.card:last-child');
      if (lastWall) {
        lastWall.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  }

  function removeWall(id) {
    replaceGeodesyItems(walls, walls.filter(w => w.id !== id));
    renderWalls();
  }

  function renderWalls() {
    wallsList.innerHTML = "";
    updateGeoWallsLimitUi();

    if (walls.length === 0) {
      wallsList.innerHTML = `<div class="caption" style="padding: 8px;">Нет добавленных ${getGeoWallEntityPluralGenitive()}. Нажмите "Добавить ${getGeoWallEntityAddText()}" для начала.</div>`;
      return;
    }

    walls.forEach((wall, index) => {
      const wallDiv = document.createElement("div");
      wallDiv.className = "card";
      wallDiv.style.marginBottom = "8px";
      wallDiv.style.padding = "12px";
      const safeWallId = safeValue(wall.id);
      const safeNumberAxis = safeValue(wall.numberAxis || "?");
      const safeLetterAxis1 = safeValue(wall.letterAxis1 || "?");
      const safeLetterAxis2 = safeValue(wall.letterAxis2 || "?");
      const safeLetterAxis = safeValue(wall.letterAxis || "?");
      const safeNumberAxis1 = safeValue(wall.numberAxis1 || "?");
      const safeNumberAxis2 = safeValue(wall.numberAxis2 || "?");

      const bindingTypeSelect = `
        <div style="margin-bottom: 8px;">
          <label><b>Тип привязки:</b></label>
          <select class="wall-binding-type" data-id="${safeWallId}" style="width: 100%; margin-top: 4px;">
            <option value="number_letters" ${wall.bindingType === "number_letters" ? "selected" : ""}>Одна цифровая + две буквенные (например, 1, В-Г)</option>
            <option value="letter_numbers" ${wall.bindingType === "letter_numbers" ? "selected" : ""}>Одна буквенная + две цифровые (например, Г, 8-9)</option>
          </select>
        </div>
      `;

      let axisFields = "";
      let coordFields = "";

      if (wall.bindingType === "number_letters") {
        axisFields = `
          <div class="grid-3" style="margin-bottom: 8px;">
            <div>
              <label data-i18n="form_number_grid_axis">Цифровая ось </label>
              <select class="wall-number-axis" data-id="${safeWallId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultNumbers.map(n => `<option value="${n}" ${wall.numberAxis === n ? "selected" : ""}>${n}</option>`).join("")}
              </select>
            </div>
            <div>
              <label data-i18n="form_letter_grid_axis_1">Буквенная ось 1 </label>
              <select class="wall-letter-axis1" data-id="${safeWallId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultRusLetters.map(l => `<option value="${l}" ${wall.letterAxis1 === l ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </div>
            <div>
              <label data-i18n="form_letter_grid_axis_2">Буквенная ось 2 </label>
              <select class="wall-letter-axis2" data-id="${safeWallId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultRusLetters.map(l => `<option value="${l}" ${wall.letterAxis2 === l ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </div>
          </div>
        `;
        coordFields = `
          <div style="margin-bottom: 8px;"><b>Координаты для ${safeNumberAxis}, ${safeLetterAxis1}:</b></div>
          <div class="grid-4" style="margin-bottom: 8px;">
            <div>
              <label data-i18n="form_design_x">Проектная X</label>
              <input type="number" inputmode="decimal" class="wall-projX-num-let1" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.projX_num_let1)}" />
            </div>
            <div>
              <label data-i18n="form_measured_x">Фактическая X</label>
              <input type="number" inputmode="decimal" class="wall-factX-num-let1" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.factX_num_let1)}" />
            </div>
            <div>
              <label data-i18n="form_design_y">Проектная Y</label>
              <input type="number" inputmode="decimal" class="wall-projY-num-let1" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.projY_num_let1)}" />
            </div>
            <div>
              <label data-i18n="form_measured_y">Фактическая Y</label>
              <input type="number" inputmode="decimal" class="wall-factY-num-let1" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.factY_num_let1)}" />
            </div>
          </div>
          <div style="margin-bottom: 8px;"><b>Координаты для ${safeNumberAxis}, ${safeLetterAxis2}:</b></div>
          <div class="grid-4">
            <div>
              <label data-i18n="form_design_x">Проектная X</label>
              <input type="number" inputmode="decimal" class="wall-projX-num-let2" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.projX_num_let2)}" />
            </div>
            <div>
              <label data-i18n="form_measured_x">Фактическая X</label>
              <input type="number" inputmode="decimal" class="wall-factX-num-let2" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.factX_num_let2)}" />
            </div>
            <div>
              <label data-i18n="form_design_y">Проектная Y</label>
              <input type="number" inputmode="decimal" class="wall-projY-num-let2" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.projY_num_let2)}" />
            </div>
            <div>
              <label data-i18n="form_measured_y">Фактическая Y</label>
              <input type="number" inputmode="decimal" class="wall-factY-num-let2" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.factY_num_let2)}" />
            </div>
          </div>
        `;
      } else {
        axisFields = `
          <div class="grid-3" style="margin-bottom: 8px;">
            <div>
              <label data-i18n="form_letter_grid_axis">Буквенная ось </label>
              <select class="wall-letter-axis" data-id="${safeWallId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultRusLetters.map(l => `<option value="${l}" ${wall.letterAxis === l ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </div>
            <div>
              <label data-i18n="form_number_grid_axis_1">Цифровая ось 1 </label>
              <select class="wall-number-axis1" data-id="${safeWallId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultNumbers.map(n => `<option value="${n}" ${wall.numberAxis1 === n ? "selected" : ""}>${n}</option>`).join("")}
              </select>
            </div>
            <div>
              <label data-i18n="form_number_grid_axis_2">Цифровая ось 2 </label>
              <select class="wall-number-axis2" data-id="${safeWallId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultNumbers.map(n => `<option value="${n}" ${wall.numberAxis2 === n ? "selected" : ""}>${n}</option>`).join("")}
              </select>
            </div>
          </div>
        `;
        coordFields = `
          <div style="margin-bottom: 8px;"><b>Координаты для ${safeLetterAxis}, ${safeNumberAxis1}:</b></div>
          <div class="grid-4" style="margin-bottom: 8px;">
            <div>
              <label data-i18n="form_design_x">Проектная X</label>
              <input type="number" inputmode="decimal" class="wall-projX-let-num1" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.projX_let_num1)}" />
            </div>
            <div>
              <label data-i18n="form_measured_x">Фактическая X</label>
              <input type="number" inputmode="decimal" class="wall-factX-let-num1" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.factX_let_num1)}" />
            </div>
            <div>
              <label data-i18n="form_design_y">Проектная Y</label>
              <input type="number" inputmode="decimal" class="wall-projY-let-num1" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.projY_let_num1)}" />
            </div>
            <div>
              <label data-i18n="form_measured_y">Фактическая Y</label>
              <input type="number" inputmode="decimal" class="wall-factY-let-num1" data-id="${safeWallId}" data-wall-index="${index}" placeholder="мм" value="${safeValue(wall.factY_let_num1)}" />
            </div>
          </div>
          <div style="margin-bottom: 8px;"><b>Координаты для ${safeLetterAxis}, ${safeNumberAxis2}:</b></div>
          <div class="grid-4">
            <div>
              <label data-i18n="form_design_x">Проектная X</label>
              <input type="number" inputmode="decimal" class="wall-projX-let-num2" data-id="${safeWallId}" data-wall-index="${index}" placeholder="X_${safeLetterAxis}_${safeNumberAxis2}, мм" value="${safeValue(wall.projX_let_num2)}" />
            </div>
            <div>
              <label data-i18n="form_measured_x">Фактическая X</label>
              <input type="number" inputmode="decimal" class="wall-factX-let-num2" data-id="${safeWallId}" data-wall-index="${index}" placeholder="X_${safeLetterAxis}_${safeNumberAxis2}, мм" value="${safeValue(wall.factX_let_num2)}" />
            </div>
            <div>
              <label data-i18n="form_design_y">Проектная Y</label>
              <input type="number" inputmode="decimal" class="wall-projY-let-num2" data-id="${safeWallId}" data-wall-index="${index}" placeholder="Y_${safeLetterAxis}_${safeNumberAxis2}, мм" value="${safeValue(wall.projY_let_num2)}" />
            </div>
            <div>
              <label data-i18n="form_measured_y">Фактическая Y</label>
              <input type="number" inputmode="decimal" class="wall-factY-let-num2" data-id="${safeWallId}" data-wall-index="${index}" placeholder="Y_${safeLetterAxis}_${safeNumberAxis2}, мм" value="${safeValue(wall.factY_let_num2)}" />
            </div>
          </div>
        `;
      }

      wallDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <b>${getGeoWallEntityLabel()} ${index + 1}</b>
          <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact lg-btn--micro" data-remove="${safeWallId}">
            <span class="lg-btn__label">Удалить</span>
            <span class="lg-btn__glow" aria-hidden="true"></span>
          </button>
        </div>
        ${bindingTypeSelect}
        ${axisFields}
        ${coordFields}
      `;

      // Обработчик изменения типа привязки
      const bindingTypeSelectEl = wallDiv.querySelector(`.wall-binding-type[data-id="${wall.id}"]`);
      bindingTypeSelectEl.addEventListener("change", (e) => {
        const wallItem = walls.find(w => w.id === wall.id);
        if (wallItem) {
          const oldBindingType = wallItem.bindingType;
          wallItem.bindingType = e.target.value as GeodesyBindingType;

          // Проверяем на одинаковые оси после смены типа
          if (wallItem.bindingType === "number_letters") {
            if (wallItem.letterAxis1 && wallItem.letterAxis2 && wallItem.letterAxis1 === wallItem.letterAxis2) {
              wallItem.bindingType = oldBindingType;
              showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
              renderWalls();
              return;
            }
          } else {
            if (wallItem.numberAxis1 && wallItem.numberAxis2 && wallItem.numberAxis1 === wallItem.numberAxis2) {
              wallItem.bindingType = oldBindingType;
              showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
              renderWalls();
              return;
            }
          }

          // Проверяем на дубликаты после смены типа
          if (checkWallDuplicate(
            wallItem.bindingType,
            wallItem.numberAxis,
            wallItem.letterAxis1,
            wallItem.letterAxis2,
            wallItem.letterAxis,
            wallItem.numberAxis1,
            wallItem.numberAxis2,
            wallItem.id
          )) {
            wallItem.bindingType = oldBindingType;
            showNotification(`${getGeoWallEntityLabel()} с такими же осями уже существует. Выберите другие оси.`, "warning");
            renderWalls();
            return;
          }

          renderWalls();
        }
      });

      // Обработчики для полей осей
      wallDiv.querySelectorAll('select[class^="wall-"]').forEach(select => {
        if (select.classList.contains("wall-binding-type")) return;
        select.addEventListener("change", (e) => {
          const wallItem = walls.find(w => w.id === wall.id);
          if (wallItem) {
            // Сохраняем старые значения для проверки
            const oldNumberAxis = wallItem.numberAxis;
            const oldLetterAxis1 = wallItem.letterAxis1;
            const oldLetterAxis2 = wallItem.letterAxis2;
            const oldLetterAxis = wallItem.letterAxis;
            const oldNumberAxis1 = wallItem.numberAxis1;
            const oldNumberAxis2 = wallItem.numberAxis2;

            // Обновляем значения
            if (select.classList.contains("wall-number-axis")) wallItem.numberAxis = e.target.value;
            if (select.classList.contains("wall-letter-axis1")) wallItem.letterAxis1 = e.target.value;
            if (select.classList.contains("wall-letter-axis2")) wallItem.letterAxis2 = e.target.value;
            if (select.classList.contains("wall-letter-axis")) wallItem.letterAxis = e.target.value;
            if (select.classList.contains("wall-number-axis1")) wallItem.numberAxis1 = e.target.value;
            if (select.classList.contains("wall-number-axis2")) wallItem.numberAxis2 = e.target.value;

            // Проверяем на одинаковые оси
            if (wallItem.bindingType === "number_letters") {
              if (wallItem.letterAxis1 && wallItem.letterAxis2 && wallItem.letterAxis1 === wallItem.letterAxis2) {
                // Возвращаем старые значения
                wallItem.letterAxis1 = oldLetterAxis1;
                wallItem.letterAxis2 = oldLetterAxis2;
                showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
                renderWalls();
                return;
              }
            } else {
              if (wallItem.numberAxis1 && wallItem.numberAxis2 && wallItem.numberAxis1 === wallItem.numberAxis2) {
                // Возвращаем старые значения
                wallItem.numberAxis1 = oldNumberAxis1;
                wallItem.numberAxis2 = oldNumberAxis2;
                showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
                renderWalls();
                return;
              }
            }

            // Проверяем на дубликаты
            if (checkWallDuplicate(
              wallItem.bindingType,
              wallItem.numberAxis,
              wallItem.letterAxis1,
              wallItem.letterAxis2,
              wallItem.letterAxis,
              wallItem.numberAxis1,
              wallItem.numberAxis2,
              wallItem.id
            )) {
              // Возвращаем старые значения
              wallItem.numberAxis = oldNumberAxis;
              wallItem.letterAxis1 = oldLetterAxis1;
              wallItem.letterAxis2 = oldLetterAxis2;
              wallItem.letterAxis = oldLetterAxis;
              wallItem.numberAxis1 = oldNumberAxis1;
              wallItem.numberAxis2 = oldNumberAxis2;
              showNotification(`${getGeoWallEntityLabel()} с такими же осями уже существует. Выберите другие оси.`, "warning");
              renderWalls();
              return;
            }

            renderWalls();
          }
        });
      });

      // Обработчики для полей координат
      wallDiv.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener("input", (e) => {
          const wallId = parseInt(e.target.dataset.id);
          const wallItem = walls.find(w => w.id === wallId);
          if (wallItem) {
            const className = e.target.className;
            if (className.includes("wall-projX-num-let1")) wallItem.projX_num_let1 = e.target.value;
            if (className.includes("wall-factX-num-let1")) wallItem.factX_num_let1 = e.target.value;
            if (className.includes("wall-projY-num-let1")) wallItem.projY_num_let1 = e.target.value;
            if (className.includes("wall-factY-num-let1")) wallItem.factY_num_let1 = e.target.value;
            if (className.includes("wall-projX-num-let2")) wallItem.projX_num_let2 = e.target.value;
            if (className.includes("wall-factX-num-let2")) wallItem.factX_num_let2 = e.target.value;
            if (className.includes("wall-projY-num-let2")) wallItem.projY_num_let2 = e.target.value;
            if (className.includes("wall-factY-num-let2")) wallItem.factY_num_let2 = e.target.value;
            if (className.includes("wall-projX-let-num1")) wallItem.projX_let_num1 = e.target.value;
            if (className.includes("wall-factX-let-num1")) wallItem.factX_let_num1 = e.target.value;
            if (className.includes("wall-projY-let-num1")) wallItem.projY_let_num1 = e.target.value;
            if (className.includes("wall-factY-let-num1")) wallItem.factY_let_num1 = e.target.value;
            if (className.includes("wall-projX-let-num2")) wallItem.projX_let_num2 = e.target.value;
            if (className.includes("wall-factX-let-num2")) wallItem.factX_let_num2 = e.target.value;
            if (className.includes("wall-projY-let-num2")) wallItem.projY_let_num2 = e.target.value;
            if (className.includes("wall-factY-let-num2")) wallItem.factY_let_num2 = e.target.value;
          }
        });
      });

      // Обработчик удаления
      wallDiv.querySelector(`[data-remove="${wall.id}"]`).addEventListener("click", () => {
        removeWall(wall.id);
      });

      wallsList.appendChild(wallDiv);
    });
  }

  btnAddWall.addEventListener("click", addWall);

  // Кнопка проверки стен
  btnGeoWalls?.addEventListener("click", () => {
    btnGeo?.click();
  });

  // Функции для работы с балками (аналогично стенам)

  function checkBeamDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis, numberAxis1, numberAxis2, excludeId = null) {
    // Если оси не заполнены, не проверяем на дубликаты
    if (bindingType === "number_letters") {
      if (!numberAxis || !letterAxis1 || !letterAxis2) return false;
    } else {
      if (!letterAxis || !numberAxis1 || !numberAxis2) return false;
    }

    return beams.some(beam => {
      if (beam.id === excludeId) return false;

      if (bindingType === "number_letters" && beam.bindingType === "number_letters") {
        // Проверяем комбинацию: число и две буквы (порядок букв не важен)
        if (!beam.numberAxis || !beam.letterAxis1 || !beam.letterAxis2) return false;
        const letters1 = [letterAxis1, letterAxis2].sort().join("-");
        const letters2 = [beam.letterAxis1, beam.letterAxis2].sort().join("-");
        return numberAxis === beam.numberAxis && letters1 === letters2;
      } else if (bindingType === "letter_numbers" && beam.bindingType === "letter_numbers") {
        // Проверяем комбинацию: буква и два числа (порядок чисел не важен)
        if (!beam.letterAxis || !beam.numberAxis1 || !beam.numberAxis2) return false;
        const nums1 = [numberAxis1, numberAxis2].sort((a, b) => parseInt(a) - parseInt(b)).join("-");
        const nums2 = [beam.numberAxis1, beam.numberAxis2].sort((a, b) => parseInt(a) - parseInt(b)).join("-");
        return letterAxis === beam.letterAxis && nums1 === nums2;
      }
      return false;
    });
  }

  function addBeam() {
    if (beams.length >= 20) {
      showNotification(`Максимальное количество балок - ${APP_CONFIG.MAX_ELEMENTS}`, "warning");
      return;
    }

    const newBeam = createEmptyBeamRow();

    // Проверяем на дубликаты
    if (checkBeamDuplicate(
      newBeam.bindingType,
      newBeam.numberAxis,
      newBeam.letterAxis1,
      newBeam.letterAxis2,
      newBeam.letterAxis,
      newBeam.numberAxis1,
      newBeam.numberAxis2
    )) {
      showNotification("Балка с такими же осями уже существует. Измените оси для новой балки.", "warning");
      return;
    }

    beams.push(newBeam);
    renderBeams();

    // Автопрокрутка к последней добавленной балке
    setTimeout(() => {
      const lastBeam = beamsList.querySelector('.card:last-child');
      if (lastBeam) {
        lastBeam.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  }

  function removeBeam(id) {
    replaceGeodesyItems(beams, beams.filter(b => b.id !== id));
    renderBeams();
  }

  function renderBeams() {
    beamsList.innerHTML = "";

    if (beams.length === 0) {
      beamsList.innerHTML = '<div class="caption" style="padding: 8px;">Нет добавленных балок. Нажмите "Добавить балку" для начала.</div>';
      return;
    }

    beams.forEach((beam, index) => {
      const beamDiv = document.createElement("div");
      beamDiv.className = "card";
      beamDiv.style.marginBottom = "8px";
      beamDiv.style.padding = "12px";
      const safeBeamId = safeValue(beam.id);
      const safeNumberAxis = safeValue(beam.numberAxis || "?");
      const safeLetterAxis1 = safeValue(beam.letterAxis1 || "?");
      const safeLetterAxis2 = safeValue(beam.letterAxis2 || "?");
      const safeLetterAxis = safeValue(beam.letterAxis || "?");
      const safeNumberAxis1 = safeValue(beam.numberAxis1 || "?");
      const safeNumberAxis2 = safeValue(beam.numberAxis2 || "?");

      const bindingTypeSelect = `
        <div style="margin-bottom: 8px;">
          <label><b>Тип привязки:</b></label>
          <select class="beam-binding-type" data-id="${safeBeamId}" style="width: 100%; margin-top: 4px;">
            <option value="number_letters" ${beam.bindingType === "number_letters" ? "selected" : ""}>Одна цифровая + две буквенные (например, 1, В-Г)</option>
            <option value="letter_numbers" ${beam.bindingType === "letter_numbers" ? "selected" : ""}>Одна буквенная + две цифровые (например, Г, 8-9)</option>
          </select>
        </div>
      `;

      let axisFields = "";
      let coordFields = "";

      if (beam.bindingType === "number_letters") {
        axisFields = `
          <div class="grid-3" style="margin-bottom: 8px;">
            <div>
              <label data-i18n="form_number_grid_axis">Цифровая ось </label>
              <select class="beam-number-axis" data-id="${safeBeamId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultNumbers.map(n => `<option value="${n}" ${beam.numberAxis === n ? "selected" : ""}>${n}</option>`).join("")}
              </select>
            </div>
            <div>
              <label data-i18n="form_letter_grid_axis_1">Буквенная ось 1 </label>
              <select class="beam-letter-axis1" data-id="${safeBeamId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultRusLetters.map(l => `<option value="${l}" ${beam.letterAxis1 === l ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </div>
            <div>
              <label data-i18n="form_letter_grid_axis_2">Буквенная ось 2 </label>
              <select class="beam-letter-axis2" data-id="${safeBeamId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultRusLetters.map(l => `<option value="${l}" ${beam.letterAxis2 === l ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </div>
          </div>
        `;
        coordFields = `
          <div style="margin-bottom: 8px;"><b>Координаты для ${safeNumberAxis}, ${safeLetterAxis1}:</b></div>
          <div class="grid-4" style="margin-bottom: 8px;">
            <div>
              <label data-i18n="form_design_x">Проектная X</label>
              <input type="number" inputmode="decimal" class="beam-projX-num-let1" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="X_${safeNumberAxis}_${safeLetterAxis1}, мм" value="${safeValue(beam.projX_num_let1)}" />
            </div>
            <div>
              <label data-i18n="form_measured_x">Фактическая X</label>
              <input type="number" inputmode="decimal" class="beam-factX-num-let1" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="X_${safeNumberAxis}_${safeLetterAxis1}, мм" value="${safeValue(beam.factX_num_let1)}" />
            </div>
            <div>
              <label data-i18n="form_design_y">Проектная Y</label>
              <input type="number" inputmode="decimal" class="beam-projY-num-let1" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="Y_${safeNumberAxis}_${safeLetterAxis1}, мм" value="${safeValue(beam.projY_num_let1)}" />
            </div>
            <div>
              <label data-i18n="form_measured_y">Фактическая Y</label>
              <input type="number" inputmode="decimal" class="beam-factY-num-let1" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="Y_${safeNumberAxis}_${safeLetterAxis1}, мм" value="${safeValue(beam.factY_num_let1)}" />
            </div>
          </div>
          <div style="margin-bottom: 8px;"><b>Координаты для ${safeNumberAxis}, ${safeLetterAxis2}:</b></div>
          <div class="grid-4">
            <div>
              <label data-i18n="form_design_x">Проектная X</label>
              <input type="number" inputmode="decimal" class="beam-projX-num-let2" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="X_${safeNumberAxis}_${safeLetterAxis2}, мм" value="${safeValue(beam.projX_num_let2)}" />
            </div>
            <div>
              <label data-i18n="form_measured_x">Фактическая X</label>
              <input type="number" inputmode="decimal" class="beam-factX-num-let2" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="X_${safeNumberAxis}_${safeLetterAxis2}, мм" value="${safeValue(beam.factX_num_let2)}" />
            </div>
            <div>
              <label data-i18n="form_design_y">Проектная Y</label>
              <input type="number" inputmode="decimal" class="beam-projY-num-let2" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="Y_${safeNumberAxis}_${safeLetterAxis2}, мм" value="${safeValue(beam.projY_num_let2)}" />
            </div>
            <div>
              <label data-i18n="form_measured_y">Фактическая Y</label>
              <input type="number" inputmode="decimal" class="beam-factY-num-let2" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="Y_${safeNumberAxis}_${safeLetterAxis2}, мм" value="${safeValue(beam.factY_num_let2)}" />
            </div>
          </div>
        `;
      } else {
        axisFields = `
          <div class="grid-3" style="margin-bottom: 8px;">
            <div>
              <label data-i18n="form_letter_grid_axis">Буквенная ось </label>
              <select class="beam-letter-axis" data-id="${safeBeamId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultRusLetters.map(l => `<option value="${l}" ${beam.letterAxis === l ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </div>
            <div>
              <label data-i18n="form_number_grid_axis_1">Цифровая ось 1 </label>
              <select class="beam-number-axis1" data-id="${safeBeamId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultNumbers.map(n => `<option value="${n}" ${beam.numberAxis1 === n ? "selected" : ""}>${n}</option>`).join("")}
              </select>
            </div>
            <div>
              <label data-i18n="form_number_grid_axis_2">Цифровая ось 2 </label>
              <select class="beam-number-axis2" data-id="${safeBeamId}" style="width: 100%;">
                <option value="">-- Выберите --</option>
                ${defaultNumbers.map(n => `<option value="${n}" ${beam.numberAxis2 === n ? "selected" : ""}>${n}</option>`).join("")}
              </select>
            </div>
          </div>
        `;
        coordFields = `
          <div style="margin-bottom: 8px;"><b>Координаты для ${safeLetterAxis}, ${safeNumberAxis1}:</b></div>
          <div class="grid-4" style="margin-bottom: 8px;">
            <div>
              <label data-i18n="form_design_x">Проектная X</label>
              <input type="number" inputmode="decimal" class="beam-projX-let-num1" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="X_${safeLetterAxis}_${safeNumberAxis1}, мм" value="${safeValue(beam.projX_let_num1)}" />
            </div>
            <div>
              <label data-i18n="form_measured_x">Фактическая X</label>
              <input type="number" inputmode="decimal" class="beam-factX-let-num1" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="X_${safeLetterAxis}_${safeNumberAxis1}, мм" value="${safeValue(beam.factX_let_num1)}" />
            </div>
            <div>
              <label data-i18n="form_design_y">Проектная Y</label>
              <input type="number" inputmode="decimal" class="beam-projY-let-num1" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="Y_${safeLetterAxis}_${safeNumberAxis1}, мм" value="${safeValue(beam.projY_let_num1)}" />
            </div>
            <div>
              <label data-i18n="form_measured_y">Фактическая Y</label>
              <input type="number" inputmode="decimal" class="beam-factY-let-num1" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="Y_${safeLetterAxis}_${safeNumberAxis1}, мм" value="${safeValue(beam.factY_let_num1)}" />
            </div>
          </div>
          <div style="margin-bottom: 8px;"><b>Координаты для ${safeLetterAxis}, ${safeNumberAxis2}:</b></div>
          <div class="grid-4">
            <div>
              <label data-i18n="form_design_x">Проектная X</label>
              <input type="number" inputmode="decimal" class="beam-projX-let-num2" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="X_${safeLetterAxis}_${safeNumberAxis2}, мм" value="${safeValue(beam.projX_let_num2)}" />
            </div>
            <div>
              <label data-i18n="form_measured_x">Фактическая X</label>
              <input type="number" inputmode="decimal" class="beam-factX-let-num2" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="X_${safeLetterAxis}_${safeNumberAxis2}, мм" value="${safeValue(beam.factX_let_num2)}" />
            </div>
            <div>
              <label data-i18n="form_design_y">Проектная Y</label>
              <input type="number" inputmode="decimal" class="beam-projY-let-num2" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="Y_${safeLetterAxis}_${safeNumberAxis2}, мм" value="${safeValue(beam.projY_let_num2)}" />
            </div>
            <div>
              <label data-i18n="form_measured_y">Фактическая Y</label>
              <input type="number" inputmode="decimal" class="beam-factY-let-num2" data-id="${safeBeamId}" data-beam-index="${index}" placeholder="Y_${safeLetterAxis}_${safeNumberAxis2}, мм" value="${safeValue(beam.factY_let_num2)}" />
            </div>
          </div>
        `;
      }

      beamDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <b>Балка ${index + 1}</b>
          <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact lg-btn--micro" data-remove="${safeBeamId}">
            <span class="lg-btn__label">Удалить</span>
            <span class="lg-btn__glow" aria-hidden="true"></span>
          </button>
        </div>
        ${bindingTypeSelect}
        ${axisFields}
        ${coordFields}
      `;

      // Обработчик изменения типа привязки
      const bindingTypeSelectEl = beamDiv.querySelector(`.beam-binding-type[data-id="${beam.id}"]`);
      bindingTypeSelectEl.addEventListener("change", (e) => {
        const beamItem = beams.find(b => b.id === beam.id);
        if (beamItem) {
          const oldBindingType = beamItem.bindingType;
          beamItem.bindingType = e.target.value as GeodesyBindingType;

          // Проверяем на одинаковые оси после смены типа
          if (beamItem.bindingType === "number_letters") {
            if (beamItem.letterAxis1 && beamItem.letterAxis2 && beamItem.letterAxis1 === beamItem.letterAxis2) {
              beamItem.bindingType = oldBindingType;
              showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
              renderBeams();
              return;
            }
          } else {
            if (beamItem.numberAxis1 && beamItem.numberAxis2 && beamItem.numberAxis1 === beamItem.numberAxis2) {
              beamItem.bindingType = oldBindingType;
              showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
              renderBeams();
              return;
            }
          }

          // Проверяем на дубликаты после смены типа
          if (checkBeamDuplicate(
            beamItem.bindingType,
            beamItem.numberAxis,
            beamItem.letterAxis1,
            beamItem.letterAxis2,
            beamItem.letterAxis,
            beamItem.numberAxis1,
            beamItem.numberAxis2,
            beamItem.id
          )) {
            beamItem.bindingType = oldBindingType;
            showNotification("Балка с такими же осями уже существует. Выберите другие оси.", "warning");
            renderBeams();
            return;
          }

          renderBeams();
        }
      });

      // Обработчики для полей осей
      beamDiv.querySelectorAll('select[class^="beam-"]').forEach(select => {
        if (select.classList.contains("beam-binding-type")) return;
        select.addEventListener("change", (e) => {
          const beamItem = beams.find(b => b.id === beam.id);
          if (beamItem) {
            // Сохраняем старые значения для проверки
            const oldNumberAxis = beamItem.numberAxis;
            const oldLetterAxis1 = beamItem.letterAxis1;
            const oldLetterAxis2 = beamItem.letterAxis2;
            const oldLetterAxis = beamItem.letterAxis;
            const oldNumberAxis1 = beamItem.numberAxis1;
            const oldNumberAxis2 = beamItem.numberAxis2;

            // Обновляем значения
            if (select.classList.contains("beam-number-axis")) beamItem.numberAxis = e.target.value;
            if (select.classList.contains("beam-letter-axis1")) beamItem.letterAxis1 = e.target.value;
            if (select.classList.contains("beam-letter-axis2")) beamItem.letterAxis2 = e.target.value;
            if (select.classList.contains("beam-letter-axis")) beamItem.letterAxis = e.target.value;
            if (select.classList.contains("beam-number-axis1")) beamItem.numberAxis1 = e.target.value;
            if (select.classList.contains("beam-number-axis2")) beamItem.numberAxis2 = e.target.value;

            // Проверяем на одинаковые оси
            if (beamItem.bindingType === "number_letters") {
              if (beamItem.letterAxis1 && beamItem.letterAxis2 && beamItem.letterAxis1 === beamItem.letterAxis2) {
                // Возвращаем старые значения
                beamItem.letterAxis1 = oldLetterAxis1;
                beamItem.letterAxis2 = oldLetterAxis2;
                showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
                renderBeams();
                return;
              }
            } else {
              if (beamItem.numberAxis1 && beamItem.numberAxis2 && beamItem.numberAxis1 === beamItem.numberAxis2) {
                // Возвращаем старые значения
                beamItem.numberAxis1 = oldNumberAxis1;
                beamItem.numberAxis2 = oldNumberAxis2;
                showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
                renderBeams();
                return;
              }
            }

            // Проверяем на дубликаты
            if (checkBeamDuplicate(
              beamItem.bindingType,
              beamItem.numberAxis,
              beamItem.letterAxis1,
              beamItem.letterAxis2,
              beamItem.letterAxis,
              beamItem.numberAxis1,
              beamItem.numberAxis2,
              beamItem.id
            )) {
              // Возвращаем старые значения
              beamItem.numberAxis = oldNumberAxis;
              beamItem.letterAxis1 = oldLetterAxis1;
              beamItem.letterAxis2 = oldLetterAxis2;
              beamItem.letterAxis = oldLetterAxis;
              beamItem.numberAxis1 = oldNumberAxis1;
              beamItem.numberAxis2 = oldNumberAxis2;
              showNotification("Балка с такими же осями уже существует. Выберите другие оси.", "warning");
              renderBeams();
              return;
            }

            renderBeams();
          }
        });
      });

      // Обработчики для полей координат
      beamDiv.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener("input", (e) => {
          const beamId = parseInt(e.target.dataset.id);
          const beamItem = beams.find(b => b.id === beamId);
          if (beamItem) {
            const className = e.target.className;
            if (className.includes("beam-projX-num-let1")) beamItem.projX_num_let1 = e.target.value;
            if (className.includes("beam-factX-num-let1")) beamItem.factX_num_let1 = e.target.value;
            if (className.includes("beam-projY-num-let1")) beamItem.projY_num_let1 = e.target.value;
            if (className.includes("beam-factY-num-let1")) beamItem.factY_num_let1 = e.target.value;
            if (className.includes("beam-projX-num-let2")) beamItem.projX_num_let2 = e.target.value;
            if (className.includes("beam-factX-num-let2")) beamItem.factX_num_let2 = e.target.value;
            if (className.includes("beam-projY-num-let2")) beamItem.projY_num_let2 = e.target.value;
            if (className.includes("beam-factY-num-let2")) beamItem.factY_num_let2 = e.target.value;
            if (className.includes("beam-projX-let-num1")) beamItem.projX_let_num1 = e.target.value;
            if (className.includes("beam-factX-let-num1")) beamItem.factX_let_num1 = e.target.value;
            if (className.includes("beam-projY-let-num1")) beamItem.projY_let_num1 = e.target.value;
            if (className.includes("beam-factY-let-num1")) beamItem.factY_let_num1 = e.target.value;
            if (className.includes("beam-projX-let-num2")) beamItem.projX_let_num2 = e.target.value;
            if (className.includes("beam-factX-let-num2")) beamItem.factX_let_num2 = e.target.value;
            if (className.includes("beam-projY-let-num2")) beamItem.projY_let_num2 = e.target.value;
            if (className.includes("beam-factY-let-num2")) beamItem.factY_let_num2 = e.target.value;
          }
        });
      });

      // Обработчик удаления
      beamDiv.querySelector(`[data-remove="${beam.id}"]`).addEventListener("click", () => {
        removeBeam(beam.id);
      });

      beamsList.appendChild(beamDiv);
    });
  }

  btnAddBeam.addEventListener("click", addBeam);

  // Кнопка проверки балок
  btnGeoBeams?.addEventListener("click", () => {
    btnGeo?.click();
  });

  function updateNodeId() {
    const floor = getGeoConstructionFlags().floorVisible ? floorEl.value.trim() : "";
    const floorPart = floor ? `${floor}, ` : "";
    const axisState = getGeoAxisState();
    nodeIdEl.value = getGeoConstructionFlags().behavior.geodesyHeightOnly ? (document.getElementById("geoPointLabel") as HTMLInputElement)?.value || "" : axisState.nodeLabel ? `${floorPart}${axisState.nodeLabel}` : floorPart.replace(/, $/, "");
  }
  document.getElementById("geoPointLabel")?.addEventListener("input", updateNodeId);
  floorEl.addEventListener("input", () => {
    updateNodeId();
    saveMeta();
  });
  axisLetterEl.addEventListener("change", () => {
    updateNodeId();
    saveMeta();
  });
  axisNumberEl.addEventListener("change", () => {
    updateNodeId();
    saveMeta();
  });
  axisLetterFromEl?.addEventListener("change", () => {
    updateNodeId();
    saveMeta();
  });
  axisLetterToEl?.addEventListener("change", () => {
    updateNodeId();
    saveMeta();
  });
  axisNumberFromEl?.addEventListener("change", () => {
    updateNodeId();
    saveMeta();
  });
  axisNumberToEl?.addEventListener("change", () => {
    updateNodeId();
    saveMeta();
  });
  bindGeoPlateAxisValidation(axisLetterFromEl);
  bindGeoPlateAxisValidation(axisLetterToEl);
  bindGeoPlateAxisValidation(axisNumberFromEl);
  bindGeoPlateAxisValidation(axisNumberToEl);
  geoStripAxisModeEl?.addEventListener("change", () => {
    resetGeoPlateAxisFields({ axisMode: geoStripAxisModeEl.value || "letter_numbers" });
    updateGeoFieldsVisibility();
    updateNodeId();
    saveMeta();
  });
  syncGeoPlateAxisPrevValues();
  updateNodeId();

  function detectNodeConstructionType(node: GeodesyNodeRecord) {
    const explicitConstruction = normalizeConstructionKey(node?.construction);
    if (explicitConstruction) return explicitConstruction;
    if (node.constructionType) return node.constructionType;
    if (node.type === "columns") return "Колонна";
    if (node.type === "walls") return "Стена";
    if (node.type === "beams") return "Балка";
    return "Плита";
  }

  function loadNode(key) {
    const n = nodes.get(key);
    if (!n) return;

    geoResult.dataset.loadedKey = key;
    geoResult.dataset.legacyUnits = n.coordinateUnit === "m" ? "0" : "1";
    if (n.coordinateUnit !== "m") queueMicrotask(() => {
      geoResult.className = "result";
      geoResult.textContent = "Требует проверки: единицы старых измерений не определены. Исторический статус: " + String(n.status || "—");
      state.geo = false;
      checked.geo = false;
    });

    // Определяем тип конструкции узла
    const nodeConstructionType = detectNodeConstructionType(n);

    // Переключаем конструкцию перед загрузкой данных
    if (!setConstructionAndTrigger(nodeConstructionType, n.constructionSubtype || n.construction || "", n.constructionPileElement || "")) {
      showNotification(`Не удалось переключить конструкцию на "${nodeConstructionType}". Узел не может быть открыт.`, "error");
      return;
    }

    restoreAcceptanceCriteria(document.getElementById("geo"), n.acceptanceCriteria);
    renderGeoToleranceFields();
    if (n.coordinateUnit === "m") for (const input of [projX, projY, projH]) delete input.dataset.unitUnconfirmed;

    // Специальная обработка для колонн
    if (n.type === "columns") {
      plateOpeningPoints.length = 0;
      renderGeoPlateOpeningPoints();
      loadColumnNode(key);
      return;
    }

    // Специальная обработка для стен
    if (n.type === "walls") {
      plateOpeningPoints.length = 0;
      renderGeoPlateOpeningPoints();
      loadWallNode(key);
      return;
    }

    // Специальная обработка для балок
    if (n.type === "beams") {
      plateOpeningPoints.length = 0;
      renderGeoPlateOpeningPoints();
      loadBeamNode(key);
      return;
    }

    // Обычная обработка для плиты/лестницы
    (document.getElementById("geoPointLabel") as HTMLInputElement).value = n.pointLabel || "";
    floorEl.value = n.floor || "";
    axisLetterEl.value = n.letter || APP_CONFIG.DEFAULT_LETTER_AXIS;
    axisNumberEl.value = formValue(
      n.number || APP_CONFIG.DEFAULT_NUMBER_AXIS
    );
    const nodeGeoBehavior = getConstructionModuleBehavior(
      n.construction || n.constructionType || "",
      "geo",
      n.constructionSubtype || ""
    );
    const nodeUsesRangeLocation =
      nodeGeoBehavior.locationMode === "plate_range" || nodeGeoBehavior.locationMode === "strip_foundation";
    if (nodeUsesRangeLocation) {
      if (geoStripAxisModeEl && nodeGeoBehavior.locationMode === "strip_foundation") {
        geoStripAxisModeEl.value = n.axisMode === "number_letters" || n.axisNumberTo ? "number_letters" : "letter_numbers";
      }
      if (axisLetterFromEl) axisLetterFromEl.value = formValue(n.axisLetterFrom || n.letter || APP_CONFIG.DEFAULT_LETTER_AXIS);
      if (axisLetterToEl) axisLetterToEl.value = formValue(n.axisLetterTo || n.letter || APP_CONFIG.DEFAULT_LETTER_AXIS);
      if (axisNumberFromEl) axisNumberFromEl.value = formValue(n.axisNumberFrom || n.number || APP_CONFIG.DEFAULT_NUMBER_AXIS);
      if (axisNumberToEl) axisNumberToEl.value = formValue(n.axisNumberTo || n.number || APP_CONFIG.DEFAULT_NUMBER_AXIS);
      syncGeoPlateAxisPrevValues();
      updateGeoFieldsVisibility();
    } else {
      resetGeoPlateAxisFields();
    }
    updateNodeId();

    // Загружаем данные, сохраняя существующие если новые не заполнены
    projX.value = formValue(n.projX);
    factX.value = formValue(n.factX);
    projY.value = formValue(n.projY);
    factY.value = formValue(n.factY);
    projH.value = formValue(n.projH);
    factH.value = formValue(n.factH);
    if (geoStairNameEl) {
      geoStairNameEl.value = n.stairName || "";
    }
    if (geoPlateFlatnessCheckedEl) {
      geoPlateFlatnessCheckedEl.checked = Boolean(n.plateFlatnessChecked);
    }
    if (geoPlateFlatnessActualEl) {
      geoPlateFlatnessActualEl.value = formValue(n.plateFlatnessActual);
    }
    if (geoPlateFlatnessBaseEl) {
      geoPlateFlatnessBaseEl.value = String(n.plateFlatnessBase || "2");
    }
    if (geoPlateFlatnessClassEl) {
      geoPlateFlatnessClassEl.value = formValue(n.plateFlatnessClass || "project");
    }
    if (geoPlateFlatnessToleranceEl) {
      geoPlateFlatnessToleranceEl.value = formValue(n.plateFlatnessTolerance);
    }
    updateGeoPlateFlatnessCalculatedFields();
    replaceGeodesyItems(
      plateOpeningPoints,
      nodeGeoBehavior.showOpeningPoints && Array.isArray(n.openingPoints)
        ? n.openingPoints.map((point) => createGeoPlateOpeningPoint(point))
        : []
    );
    renderGeoPlateOpeningPoints();

    // Показываем статус загрузки
    if (n.dataStatus === "project_only") {
      geoResult.className = "result";
      geoResult.innerHTML = "Загружены только проектные данные. Заполните фактические данные для проверки.";
    } else if (n.lastMsg) {
      geoResult.className = "result " + (n.status === "ok" ? "ok" : "not-ok");
      geoResult.innerHTML = sanitizeHtml(n.lastMsg);
    } else {
      geoResult.className = "result";
      geoResult.innerHTML = "Данные узла загружены.";
    }

    bim.syncFromNode(n);
    setUpdateNodeVisibility(true);
  }

  function resolveGeoProjectFieldFallback(nodeData, fieldName, bimFieldName) {
    if (!nodeData) return "";

    const primaryValue = nodeData[fieldName];
    if (primaryValue !== undefined && primaryValue !== null && String(primaryValue).trim() !== "") {
      return String(primaryValue);
    }

    const bimValue = nodeData[bimFieldName];
    if (bimValue !== undefined && bimValue !== null && String(bimValue).trim() !== "") {
      return String(bimValue);
    }

    return "";
  }

  function applyGeoProjectFallbackToForm(nodeData, { includeX = false, includeY = false, includeH = false } = {}) {
    // Для reopen линейных элементов и колонн поднимаем BIM-координаты только как мягкий fallback в форму.
    if (includeX && projX) {
      projX.value = resolveGeoProjectFieldFallback(nodeData, "projX", "bimProjectX");
    }
    if (includeY && projY) {
      projY.value = resolveGeoProjectFieldFallback(nodeData, "projY", "bimProjectY");
    }
    if (includeH && projH) {
      projH.value = resolveGeoProjectFieldFallback(nodeData, "projH", "bimProjectH");
    }
  }

  function loadWallNode(key) {
    const n = nodes.get(key);
    if (!n || n.type !== "walls") return;

    geodesyNodeState.currentNodeKeys.wall = key;
    const wallBehavior = getConstructionModuleBehavior(
      n.construction || n.constructionType || "",
      "geo",
      n.constructionSubtype || ""
    );
    // Конструкция уже переключена в loadNode, но на всякий случай убеждаемся
    if (getGeoConstructionFlags().behavior.elementSheetMode !== "walls") {
      setConstructionAndTrigger(n.construction || "wall", n.constructionSubtype || n.construction || "");
    }

    floorEl.value = n.floor || "";
    if (wallBehavior.showOpeningPoints && Array.isArray(n.openingPoints)) {
      replaceGeodesyItems(
        plateOpeningPoints,
        n.openingPoints.map((point) => createGeoPlateOpeningPoint(point))
      );
      renderGeoPlateOpeningPoints();
    }
    if (wallBehavior.locationMode === "plate_range" || wallBehavior.locationMode === "strip_foundation") {
      if (axisLetterFromEl) axisLetterFromEl.value = n.axisLetterFrom || APP_CONFIG.DEFAULT_LETTER_AXIS;
      if (axisLetterToEl) axisLetterToEl.value = n.axisLetterTo || APP_CONFIG.DEFAULT_LETTER_AXIS;
      if (axisNumberFromEl) axisNumberFromEl.value = formValue(n.axisNumberFrom || APP_CONFIG.DEFAULT_NUMBER_AXIS);
      if (axisNumberToEl) axisNumberToEl.value = formValue(n.axisNumberTo || APP_CONFIG.DEFAULT_NUMBER_AXIS);
      syncGeoPlateAxisPrevValues();
      updateNodeId();
    }

    replaceGeodesyItems(walls, (n.walls || []).map((wall, idx) => ({
      id: Date.now() + idx,
      bindingType: wall.bindingType || "number_letters",
      numberAxis: wall.numberAxis?.toString() || "",
      letterAxis1: wall.letterAxis1?.toString() || "",
      letterAxis2: wall.letterAxis2?.toString() || "",
      letterAxis: wall.letterAxis?.toString() || "",
      numberAxis1: wall.numberAxis1?.toString() || "",
      numberAxis2: wall.numberAxis2?.toString() || "",
      projX_num_let1: wall.projX_num_let1?.toString() || "",
      factX_num_let1: wall.factX_num_let1?.toString() || "",
      projY_num_let1: wall.projY_num_let1?.toString() || "",
      factY_num_let1: wall.factY_num_let1?.toString() || "",
      projX_num_let2: wall.projX_num_let2?.toString() || "",
      factX_num_let2: wall.factX_num_let2?.toString() || "",
      projY_num_let2: wall.projY_num_let2?.toString() || "",
      factY_num_let2: wall.factY_num_let2?.toString() || "",
      projX_let_num1: wall.projX_let_num1?.toString() || "",
      factX_let_num1: wall.factX_let_num1?.toString() || "",
      projY_let_num1: wall.projY_let_num1?.toString() || "",
      factY_let_num1: wall.factY_let_num1?.toString() || "",
      projX_let_num2: wall.projX_let_num2?.toString() || "",
      factX_let_num2: wall.factX_let_num2?.toString() || "",
      projY_let_num2: wall.projY_let_num2?.toString() || "",
      factY_let_num2: wall.factY_let_num2?.toString() || ""
    })));

    renderWalls();
    applyGeoProjectFallbackToForm(n, {
      includeX: true,
      includeY: true,
      includeH: true
    });

    if (n.dataStatus === "project_only") {
      geoResult.className = "result";
      geoResult.innerHTML = "Загружены только проектные данные. Заполните фактические данные для проверки.";
    } else if (n.lastMsg) {
      geoResult.className = "result " + (n.status === "ok" ? "ok" : "not-ok");
      geoResult.innerHTML = sanitizeHtml(n.lastMsg);
    } else {
      geoResult.className = "result";
      geoResult.innerHTML = "Данные стен загружены.";
    }

    bim.syncFromNode(n);
    setUpdateNodeVisibility(true);
  }

  function loadBeamNode(key) {
    const n = nodes.get(key);
    if (!n || n.type !== "beams") return;

    geodesyNodeState.currentNodeKeys.beam = key;
    // Конструкция уже переключена в loadNode, но на всякий случай убеждаемся
    if (!isConstructionProfile(getCurrentConstructionKey(), "geo", "beam")) {
      setConstructionAndTrigger("beam");
    }

    floorEl.value = n.floor || "";

    replaceGeodesyItems(beams, (n.beams || []).map((beam, idx) => ({
      id: Date.now() + idx,
      bindingType: beam.bindingType || "number_letters",
      numberAxis: beam.numberAxis?.toString() || "",
      letterAxis1: beam.letterAxis1?.toString() || "",
      letterAxis2: beam.letterAxis2?.toString() || "",
      letterAxis: beam.letterAxis?.toString() || "",
      numberAxis1: beam.numberAxis1?.toString() || "",
      numberAxis2: beam.numberAxis2?.toString() || "",
      projX_num_let1: beam.projX_num_let1?.toString() || "",
      factX_num_let1: beam.factX_num_let1?.toString() || "",
      projY_num_let1: beam.projY_num_let1?.toString() || "",
      factY_num_let1: beam.factY_num_let1?.toString() || "",
      projX_num_let2: beam.projX_num_let2?.toString() || "",
      factX_num_let2: beam.factX_num_let2?.toString() || "",
      projY_num_let2: beam.projY_num_let2?.toString() || "",
      factY_num_let2: beam.factY_num_let2?.toString() || "",
      projX_let_num1: beam.projX_let_num1?.toString() || "",
      factX_let_num1: beam.factX_let_num1?.toString() || "",
      projY_let_num1: beam.projY_let_num1?.toString() || "",
      factY_let_num1: beam.factY_let_num1?.toString() || "",
      projX_let_num2: beam.projX_let_num2?.toString() || "",
      factX_let_num2: beam.factX_let_num2?.toString() || "",
      projY_let_num2: beam.projY_let_num2?.toString() || "",
      factY_let_num2: beam.factY_let_num2?.toString() || ""
    })));

    renderBeams();
    applyGeoProjectFallbackToForm(n, {
      includeX: true,
      includeY: true,
      includeH: true
    });

    if (n.dataStatus === "project_only") {
      geoResult.className = "result";
      geoResult.innerHTML = "Загружены только проектные данные. Заполните фактические данные для проверки.";
    } else if (n.lastMsg) {
      geoResult.className = "result " + (n.status === "ok" ? "ok" : "not-ok");
      geoResult.innerHTML = sanitizeHtml(n.lastMsg);
    } else {
      geoResult.className = "result";
      geoResult.innerHTML = "Данные балок загружены.";
    }

    bim.syncFromNode(n);
    setUpdateNodeVisibility(true);
  }

  function loadColumnNode(key) {
    const n = nodes.get(key);
    if (!n || n.type !== "columns") return;

    // Сохраняем ключ для возможности обновления
    geodesyNodeState.currentNodeKeys.column = key;

    // Конструкция уже переключена в loadNode, но на всякий случай убеждаемся
    if (!isConstructionProfile(getCurrentConstructionKey(), "geo", "column")) {
      setConstructionAndTrigger("column");
    }

    columnMarkEl.value = n.columnMark || "";
    floorEl.value = n.floor || "";

    // Загружаем колонны
    replaceGeodesyItems(columns, (n.columns || []).map((col, idx) => ({
      id: Date.now() + idx,
      mark: col.mark || "",
      projX: col.projX?.toString() || "",
      factX: col.factX?.toString() || "",
      projY: col.projY?.toString() || "",
      factY: col.factY?.toString() || ""
    })));

    renderColumns();
    applyGeoProjectFallbackToForm(n, {
      includeH: true
    });

    // Показываем статус загрузки
    if (n.dataStatus === "project_only") {
      geoResult.className = "result";
      geoResult.innerHTML = "Загружены только проектные данные. Заполните фактические данные для проверки.";
    } else if (n.lastMsg) {
      geoResult.className = "result " + (n.status === "ok" ? "ok" : "not-ok");
      geoResult.innerHTML = sanitizeHtml(n.lastMsg);
    } else {
      geoResult.className = "result";
      geoResult.innerHTML = "Данные колонн загружены.";
    }

    bim.syncFromNode(n);
    setUpdateNodeVisibility(true);
  }

  function setUpdateNodeVisibility(_isVisible: boolean) {
    if (!btnUpdateNode) return;
    btnUpdateNode.style.display = "none";
    btnUpdateNode.disabled = true;
  }

  return {
    addGeoPlateOpeningPoint,
    buildGeoNodeKey,
    collectGeoPlateFlatnessData,
    createEmptyBeamRow,
    createEmptyWallRow,
    ensureColumnPrefillRow,
    getGeoAxisState,
    getGeoWallEntityAddText,
    getGeoWallEntityLabel,
    getGeoWallEntityPlural,
    getGeoWallEntityPluralGenitive,
    getGeoWallEntityRequiredText,
    loadNode,
    normalizeGeoPlateAxisDefaults,
    renderBeams,
    renderColumns,
    renderGeoPlateOpeningPoints,
    renderWalls,
    resetGeoPlateAxisFields,
    setGeoUnsupportedState,
    setUpdateNodeVisibility,
    syncGeoPlateAxisPrevValues,
    updateGeoPlateFlatnessCalculatedFields,
    updateGeoFieldsVisibility,
    updateGeoWallsLimitUi,
    updateNodeId,
    validateGeoPlateAxisRange
  };
}

export type GeodesyFormRuntime = ReturnType<typeof createGeodesyForm>;
