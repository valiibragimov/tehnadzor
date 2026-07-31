import { APP_CONFIG } from "../../config.js";
import {
  getConstructionCategoryKey,
  getConstructionLabel,
  getConstructionModuleBehavior,
  getConstructionProfile,
  normalizeConstructionKey
} from "../construction.js";
import { hasInspectionField } from "../inspection-registry.js";
import { escapeHtml, normalizeMarking, validateProject } from "../../utils.js";
import {
  addReinforcementBeam,
  addReinforcementColumn,
  createReinforcementDomBindings,
  createReinforcementRuntime,
  setReinforcementBeams,
  setReinforcementColumns,
  type ReinforcementBeam,
  type ReinforcementCheckRecord,
  type ReinforcementColumn,
  type ReinforcementRuntime,
  type ReinforcementService,
  type ReinforcementState
} from "../../features/inspections/reinforcement/index.js";
import {
  buildBimElementFilterOptions,
  buildBimElementOptionLabel,
  buildBimElementSearchText,
  formatBimElementLabel,
  getTehnadzorTypeByBimType,
  normalizeProjectBimElement,
  sortProjectBimElements
} from "../services/bim-elements.js";
import { ensureBimVisualPanel } from "../services/bim-visual-panel.js";
import { getCurrentIfcFileFromInput } from "../services/bim-runtime-context.js";
import { onAppTabActivated } from "../services/module-activation.js";
import { APP_STORAGE_KEYS } from "../storage.js";

export interface ReinforcementModuleDependencies {
  state: ReinforcementState;
  service: ReinforcementService;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  getCurrentProjectId(): string | null;
  updateSummary(): unknown;
  addJournalEntry(params: Record<string, unknown>): unknown;
  upsertJournalEntry(params: Record<string, unknown>): unknown;
  notifyFirestoreSyncStatus(docRef: unknown): unknown;
  showNotification(message: string, tone?: string): void;
  confirm(message: string): Promise<boolean>;
  setConstruction(construction: string, subtype?: string, pileElement?: string): unknown;
}

let dependencies: ReinforcementModuleDependencies | null = null;
let runtime: ReinforcementRuntime | null = null;
let reinforcementInitialized = false;
let reinfBimBindingsInitialized = false;
let reinfBimElements = [];
let selectedReinfBimElementId = "";
let reinfBimBindingSnapshot = null;
let reinfBimVisualPanel = null;
const reinfBimElementsById = new Map();
const reinfBimFilters = { search: "", type: "all", axes: "all" };

export function configureReinforcementModule(next: ReinforcementModuleDependencies) {
  dependencies = next;
}

function getDependencies() {
  if (!dependencies) throw new Error("Reinforcement module dependencies are not configured.");
  return dependencies;
}

const safeValue = (value) => escapeHtml(value == null ? "" : String(value));
const BIM_MANUAL_MODE_MESSAGE = "";
const BIM_LOAD_ERROR_MESSAGE = "Не удалось загрузить BIM-элементы. Можно продолжить ручной ввод.";
const getCurrentProjectId = () => getDependencies().getCurrentProjectId();
const getCurrentIfcFile = getCurrentIfcFileFromInput;
const showNotification = (message, tone = "") => getDependencies().showNotification(message, tone);
const reinfGetColumns = () => getDependencies().state.columns;
const reinfGetBeams = () => getDependencies().state.beams;
const reinfSetColumns = (items: ReinforcementColumn[]) => setReinforcementColumns(getDependencies().state, items);
const reinfSetBeams = (items: ReinforcementBeam[]) => setReinforcementBeams(getDependencies().state, items);
const reinfAddColumn = () => addReinforcementColumn(getDependencies().state, APP_CONFIG.MAX_ELEMENTS);
const reinfAddBeam = () => addReinforcementBeam(getDependencies().state, APP_CONFIG.MAX_ELEMENTS);

const dom = createReinforcementDomBindings(document);
const {
  construction, reinfBimSearchInput, reinfBimTypeFilter, reinfBimAxesFilter,
  reinfBimElementSelect, reinfBimElementStatus, reinfBimSourceCard,
  reinfBimSourceTitle, reinfBimSourceState, reinfBimSourceMeta,
  reinfBimAppliedTypeEl, reinfBimAppliedFloorEl, reinfBimAppliedMarkEl,
  reinfBimAppliedAxesEl, reinfBimAppliedRebarEl, reinfBimSourceHint,
  reinfBimMarkEl, reinfBimAxesEl, btnClearReinfBimSelection,
  reinfManualAssistNote, reinfBimPanelHost, reinfStairNameEl,
  reinfStairNameField, reinfFloorEl,
  reinfAxisLetterFromEl, reinfAxisLetterToEl, reinfAxisNumberFromEl,
  reinfAxisNumberToEl, reinfColumnFloorEl, reinfBeamFloorEl, reinfWallFloorEl
} = dom;

function ensureReinfBimVisualSelector() {
  if (reinfBimVisualPanel) return reinfBimVisualPanel;

  reinfBimVisualPanel = ensureBimVisualPanel({
    host: reinfBimPanelHost as HTMLElement | null,
    sourceCard: reinfBimSourceCard,
    getAllElements: () => reinfBimElements,
    getFilteredElements: () => getFilteredReinfBimElements(),
    getSelectedElement: () => getSelectedReinfBimElement(),
    getSelectedId: () => selectedReinfBimElementId,
    getCurrentProjectId,
    getCurrentIfcFile,
    onSelect: (elementId) => {
      applyReinfBimElementSelection(elementId);
    },
    labelBuilder: (element) => buildBimElementOptionLabel(element),
    moduleKey: "reinforcement"
  });

  return reinfBimVisualPanel;
}

function renderReinfBimVisualPanel() {
  ensureReinfBimVisualSelector()?.render();
}

function normalizeReinfBimValue(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function getSelectedConstructionKey() {
  return construction?.dataset?.machineValue || normalizeConstructionKey(construction?.value, "");
}

function getSelectedConstructionLabel() {
  return construction?.dataset?.displayLabel || getConstructionLabel(getSelectedConstructionKey(), construction?.value || "");
}

function getSelectedConstructionCategory() {
  return construction?.dataset?.categoryKey || getConstructionCategoryKey(getSelectedConstructionKey(), "");
}

function getSelectedConstructionSubtype() {
  return construction?.dataset?.subtypeKey || "";
}

function getSelectedPileElement() {
  return construction?.dataset?.pileElementKey || "pile";
}

function isBoredPileFoundation() {
  return hasInspectionField(
    getSelectedConstructionKey(),
    "reinforcement",
    "constructionPileElement",
    getSelectedConstructionSubtype()
  );
}

function getReinfConstructionProfile(value = getSelectedConstructionKey() || construction?.value || "") {
  return getConstructionProfile(value, "reinforcement");
}

function getReinfConstructionFlags(value = getSelectedConstructionKey() || construction?.value || "") {
  const behavior = getConstructionModuleBehavior(value, "reinforcement", getSelectedConstructionSubtype());
  const profile = getReinfConstructionProfile(value);
  return {
    profile,
    behavior,
    isPlate: profile === "plate",
    isColumn: profile === "column",
    isWall: profile === "wall",
    isBeam: profile === "beam",
    isStair: profile === "stair",
    isUnsupported: behavior.supported === false || profile === "unsupported"
  };
}

function hasReinfBimValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function formatReinfBimDisplayValue(value, fallback = "Нет данных") {
  return hasReinfBimValue(value) ? String(value) : fallback;
}

function formatReinfBimShortGuid(value) {
  const normalized = normalizeReinfBimValue(value);
  if (!normalized) return null;
  return normalized.length > 16
    ? `${normalized.slice(0, 6)}...${normalized.slice(-6)}`
    : normalized;
}

function matchesReinfBimText(currentValue, bimValue) {
  return normalizeReinfBimValue(currentValue) === normalizeReinfBimValue(bimValue);
}

function matchesReinfBimMark(currentValue, bimValue) {
  return normalizeMarking(currentValue) === normalizeMarking(bimValue);
}

function getSelectedReinfBimElement() {
  return reinfBimElementsById.get(selectedReinfBimElementId) || null;
}

function getReinfFloorFieldByConstruction(constructionType = construction?.value || "") {
  const flags = getReinfConstructionFlags(constructionType);
  if (flags.isPlate || flags.isStair) return reinfFloorEl;
  if (flags.isColumn) return reinfColumnFloorEl;
  if (flags.isBeam) return reinfBeamFloorEl;
  if (flags.isWall) return reinfWallFloorEl;
  return null;
}

function getReinfBimFieldShell(fieldEl) {
  if (!fieldEl) return null;
  if (fieldEl === reinfStairNameEl) return reinfStairNameField;
  return fieldEl.closest("div");
}

function setReinfBimFieldAutofilled(fieldEl, isAutofilled) {
  const nextState = Boolean(isAutofilled);
  const shell = getReinfBimFieldShell(fieldEl);

  if (shell) {
    shell.classList.toggle("geo-bim-field--autofilled", nextState);
  }
  if (fieldEl) {
    fieldEl.classList.toggle("geo-bim-input--autofilled", nextState);
  }
}

function clearReinfStaticBimFieldHighlights() {
  [
    reinfBimMarkEl,
    reinfBimAxesEl,
    reinfFloorEl,
    reinfColumnFloorEl,
    reinfBeamFloorEl,
    reinfWallFloorEl,
    reinfAxisLetterFromEl,
    reinfAxisLetterToEl,
    reinfAxisNumberFromEl,
    reinfAxisNumberToEl
  ].forEach((fieldEl) => setReinfBimFieldAutofilled(fieldEl, false));
}

function parseSimpleReinfAxes(rawAxes) {
  const axesValue = String(rawAxes || "").trim();
  if (!axesValue) return null;

  const normalized = axesValue.replace(/\s+/g, "").toUpperCase();
  const letterFirst = normalized.match(/^([A-ZА-ЯЁ])[-–—]([A-ZА-ЯЁ])[,;/]?(\d+)[-–—](\d+)$/u);
  if (letterFirst) {
    return {
      axisLetterFrom: letterFirst[1],
      axisLetterTo: letterFirst[2],
      axisNumberFrom: letterFirst[3],
      axisNumberTo: letterFirst[4]
    };
  }

  const numberFirst = normalized.match(/^(\d+)[-–—](\d+)[,;/]?([A-ZА-ЯЁ])[-–—]([A-ZА-ЯЁ])$/u);
  if (!numberFirst) return null;

  return {
    axisLetterFrom: numberFirst[3],
    axisLetterTo: numberFirst[4],
    axisNumberFrom: numberFirst[1],
    axisNumberTo: numberFirst[2]
  };
}

function tryApplyReinfPlateAxesFromBim(rawAxes, { overwrite = false } = {}) {
  const parsedAxes = parseSimpleReinfAxes(rawAxes);
  if (!parsedAxes) return false;

  const hasManualAxes = [
    reinfAxisLetterFromEl?.value,
    reinfAxisLetterToEl?.value,
    reinfAxisNumberFromEl?.value,
    reinfAxisNumberToEl?.value
  ].some((value) => String(value || "").trim() !== "");
  if (hasManualAxes && !overwrite) return false;

  const hasLetterFrom = Array.from(reinfAxisLetterFromEl?.options || []).some((option) => option.value === parsedAxes.axisLetterFrom);
  const hasLetterTo = Array.from(reinfAxisLetterToEl?.options || []).some((option) => option.value === parsedAxes.axisLetterTo);
  const hasNumberFrom = Array.from(reinfAxisNumberFromEl?.options || []).some((option) => option.value === parsedAxes.axisNumberFrom);
  const hasNumberTo = Array.from(reinfAxisNumberToEl?.options || []).some((option) => option.value === parsedAxes.axisNumberTo);
  if (!hasLetterFrom || !hasLetterTo || !hasNumberFrom || !hasNumberTo) return false;

  if (reinfAxisLetterFromEl) reinfAxisLetterFromEl.value = parsedAxes.axisLetterFrom;
  if (reinfAxisLetterToEl) reinfAxisLetterToEl.value = parsedAxes.axisLetterTo;
  if (reinfAxisNumberFromEl) reinfAxisNumberFromEl.value = parsedAxes.axisNumberFrom;
  if (reinfAxisNumberToEl) reinfAxisNumberToEl.value = parsedAxes.axisNumberTo;
  updateReinfLocation();
  return true;
}

function normalizeReinfBimFilterValue(value, fallback = "all") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function resetReinfBimFilters() {
  reinfBimFilters.search = "";
  reinfBimFilters.type = "all";
  reinfBimFilters.axes = "all";
}

function syncReinfBimFilterControlsFromState() {
  if (reinfBimSearchInput && reinfBimSearchInput.value !== reinfBimFilters.search) {
    reinfBimSearchInput.value = reinfBimFilters.search;
  }
  if (reinfBimTypeFilter && reinfBimTypeFilter.value !== reinfBimFilters.type) {
    reinfBimTypeFilter.value = reinfBimFilters.type;
  }
  if (reinfBimAxesFilter && reinfBimAxesFilter.value !== reinfBimFilters.axes) {
    reinfBimAxesFilter.value = reinfBimFilters.axes;
  }
}

function hasActiveReinfBimFilters() {
  return (
    String(reinfBimFilters.search || "").trim() !== "" ||
    reinfBimFilters.type !== "all" ||
    reinfBimFilters.axes !== "all"
  );
}

function getFilteredReinfBimElements() {
  const searchQuery = String(reinfBimFilters.search || "").trim().toLowerCase();

  return reinfBimElements.filter((element) => {
    if (reinfBimFilters.type !== "all" && element.type !== reinfBimFilters.type) {
      return false;
    }

    const axesValue = String(element.axes || "").trim();
    if (reinfBimFilters.axes !== "all" && axesValue !== reinfBimFilters.axes) {
      return false;
    }

    if (searchQuery && !buildBimElementSearchText(element).includes(searchQuery)) {
      return false;
    }

    return true;
  });
}

function fillReinfBimFilterSelect(selectEl, options, defaultLabel, nextValue) {
  if (!selectEl) return;

  selectEl.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "all";
  defaultOption.textContent = defaultLabel;
  selectEl.appendChild(defaultOption);

  options.forEach((optionData) => {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    selectEl.appendChild(option);
  });

  const hasNextValue = nextValue === "all" || options.some((optionData) => optionData.value === nextValue);
  selectEl.value = hasNextValue ? nextValue : "all";
  selectEl.disabled = !getCurrentProjectId() || reinfBimElements.length === 0;
}

function renderReinfBimFilterOptions() {
  const filterOptions = buildBimElementFilterOptions(reinfBimElements);
  const nextType = normalizeReinfBimFilterValue(reinfBimFilters.type, "all");
  const nextAxes = normalizeReinfBimFilterValue(reinfBimFilters.axes, "all");
fillReinfBimFilterSelect(reinfBimTypeFilter, filterOptions.types, "Все типы", nextType);
  fillReinfBimFilterSelect(reinfBimAxesFilter, filterOptions.axes, "Все оси", nextAxes);

  reinfBimFilters.type = reinfBimTypeFilter ? reinfBimTypeFilter.value : nextType;
  reinfBimFilters.axes = reinfBimAxesFilter ? reinfBimAxesFilter.value : nextAxes;
  syncReinfBimFilterControlsFromState();
}

function renderReinfBimElementOptions(selectedId = selectedReinfBimElementId) {
  if (!reinfBimElementSelect) return;

  const previousValue = selectedId || "";
  const filteredElements = getFilteredReinfBimElements();
  const visibleElements = [...filteredElements];
  const selectedElement = previousValue ? reinfBimElementsById.get(previousValue) : null;
  reinfBimElementSelect.innerHTML = "";

  const manualOption = document.createElement("option");
  manualOption.value = "";
  manualOption.textContent = "Ручной ввод без BIM";
  reinfBimElementSelect.appendChild(manualOption);

  if (selectedElement) {
    const selectedKey = selectedElement.elementId || selectedElement.id || "";
    const alreadyVisible = visibleElements.some((element) => (element.elementId || element.id || "") === selectedKey);
    if (!alreadyVisible) {
      visibleElements.unshift(selectedElement);
    }
  }

  visibleElements.forEach((element) => {
    const option = document.createElement("option");
    option.value = element.elementId || element.id || "";
    option.textContent = buildBimElementOptionLabel(element);
    reinfBimElementSelect.appendChild(option);
  });

  if (!selectedElement && filteredElements.length === 0 && reinfBimElements.length > 0) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "__empty__";
    emptyOption.textContent = "По текущим фильтрам BIM-элементы не найдены";
    emptyOption.disabled = true;
    reinfBimElementSelect.appendChild(emptyOption);
  }

  const hasPreviousValue =
    previousValue === "" ||
    visibleElements.some((element) => (element.elementId || element.id || "") === previousValue);
  reinfBimElementSelect.value = hasPreviousValue ? previousValue : "";
  renderReinfBimVisualPanel();
}

function setReinfBimStatus(message, tone = "muted") {
  if (!reinfBimElementStatus) return;
  const hasMessage = Boolean(String(message || "").trim());
  reinfBimElementStatus.textContent = message;
  reinfBimElementStatus.hidden = !hasMessage;
  reinfBimElementStatus.dataset.empty = hasMessage ? "0" : "1";
  const statusField = reinfBimElementStatus.closest(".geo-bim-status-field") as HTMLElement | null;
  if (statusField) statusField.hidden = !hasMessage;
  reinfBimElementStatus.style.color =
    tone === "error"
      ? "#fca5a5"
      : tone === "success"
        ? "#86efac"
        : tone === "info"
          ? "#93c5fd"
          : "#E6B450";
}

function buildReinfBimBindingSnapshot({ element = null, checkData = null, constructionType = null } = {}) {
  const selectedElement = element || null;
  const fallbackData = checkData || {};
  const elementId =
    normalizeReinfBimValue(selectedElement?.elementId) ||
    normalizeReinfBimValue(selectedElement?.id) ||
    normalizeReinfBimValue(fallbackData.bimElementId);

  const rawType =
    normalizeReinfBimValue(selectedElement?.type)?.toLowerCase() ||
    normalizeReinfBimValue(fallbackData.bimType)?.toLowerCase();

  const typeLabel =
    getConstructionLabel(constructionType) ||
    getConstructionLabel(getTehnadzorTypeByBimType(rawType)) ||
    getConstructionLabel(fallbackData.construction) ||
    getConstructionLabel(fallbackData.constructionType) ||
    normalizeReinfBimValue(fallbackData.constructionLabel) ||
    normalizeReinfBimValue(fallbackData.construction);

  const floor =
    normalizeReinfBimValue(selectedElement?.floor) ||
    normalizeReinfBimValue(fallbackData.bimFloor);

  const mark =
    normalizeReinfBimValue(selectedElement?.mark) ||
    normalizeReinfBimValue(fallbackData.bimMark);

  const axes =
    normalizeReinfBimValue(selectedElement?.axes) ||
    normalizeReinfBimValue(fallbackData.bimAxes);

  const sourceModelId =
    normalizeReinfBimValue(selectedElement?.sourceModelId) ||
    normalizeReinfBimValue(fallbackData.bimSourceModelId);

  const ifcGuid =
    normalizeReinfBimValue(selectedElement?.ifcGuid) ||
    normalizeReinfBimValue(fallbackData.bimIfcGuid);

  if (!elementId && !rawType && !floor && !mark && !axes && !sourceModelId && !ifcGuid) {
    return null;
  }

  let title = "BIM-элемент";
  if (selectedElement) {
    title = formatBimElementLabel(selectedElement);
  } else if (typeLabel && mark) {
    title = `${typeLabel} ${mark}`;
  } else if (typeLabel) {
    title = elementId ? `${typeLabel} · ID ${elementId}` : typeLabel;
  } else if (mark) {
    title = `Элемент ${mark}`;
  } else if (elementId) {
    title = `Элемент ID ${elementId}`;
  }

  return {
    resolved: Boolean(selectedElement),
    elementId,
    rawType,
    typeLabel,
    floor,
    mark,
    axes,
    sourceModelId,
    ifcGuid,
    title
  };
}

function updateReinfStaticBimHighlights(snapshot = reinfBimBindingSnapshot) {
  clearReinfStaticBimFieldHighlights();
  if (!snapshot) return;

  setReinfBimFieldAutofilled(
    reinfBimMarkEl,
    matchesReinfBimText(reinfBimMarkEl?.value, snapshot.mark)
  );
  setReinfBimFieldAutofilled(
    reinfBimAxesEl,
    matchesReinfBimText(reinfBimAxesEl?.value, snapshot.axes)
  );

  const currentConstruction = getSelectedConstructionKey() || construction?.value || "";
  const currentFlags = getReinfConstructionFlags(currentConstruction);
  const floorField = getReinfFloorFieldByConstruction(currentConstruction);
  setReinfBimFieldAutofilled(
    floorField,
    matchesReinfBimText(floorField?.value, snapshot.floor)
  );

  if (currentFlags.isPlate || currentFlags.isStair) {
    const parsedAxes = parseSimpleReinfAxes(snapshot.axes);
    setReinfBimFieldAutofilled(
      reinfAxisLetterFromEl,
      parsedAxes && matchesReinfBimText(reinfAxisLetterFromEl?.value, parsedAxes.axisLetterFrom)
    );
    setReinfBimFieldAutofilled(
      reinfAxisLetterToEl,
      parsedAxes && matchesReinfBimText(reinfAxisLetterToEl?.value, parsedAxes.axisLetterTo)
    );
    setReinfBimFieldAutofilled(
      reinfAxisNumberFromEl,
      parsedAxes && matchesReinfBimText(reinfAxisNumberFromEl?.value, parsedAxes.axisNumberFrom)
    );
    setReinfBimFieldAutofilled(
      reinfAxisNumberToEl,
      parsedAxes && matchesReinfBimText(reinfAxisNumberToEl?.value, parsedAxes.axisNumberTo)
    );
  }
}

function clearReinfDynamicBimFlags() {
  reinfSetColumns(reinfGetColumns().map((column) => ({
    ...column,
    bimAutofilledMark: false
  })));
  reinfSetBeams(reinfGetBeams().map((beam) => ({
    ...beam,
    bimAutofilledMark: false
  })));
}

function ensureReinfColumnPrefillRow() {
  const columns = reinfGetColumns();
  if (columns.length === 0) {
    const newColumns = [{
      id: Date.now(),
marking: "",
      projDia: "",
      factDia: "",
      projStep: "",
      factStep: "",
      projCover: "",
      factCover: "",
      projHoopsStep: "",
      factHoopsStep: "",
      bimAutofilledMark: false
    }];
    reinfSetColumns(newColumns);
    return newColumns[0];
  }
  return columns[0];
}

function ensureReinfBeamPrefillRow() {
  const beams = reinfGetBeams();
  if (beams.length === 0) {
    const newBeams = [{
      id: Date.now(),
      marking: "",
      projDia: "",
      factDia: "",
      projStep: "",
      factStep: "",
      projCover: "",
      factCover: "",
      bimAutofilledMark: false
    }];
    reinfSetBeams(newBeams);
    return newBeams[0];
  }
  return beams[0];
}

function syncReinfDynamicBimFlags(snapshot = reinfBimBindingSnapshot) {
  const mark = normalizeReinfBimValue(snapshot?.mark);
  const constructionType = construction?.value || "";

  const nextColumns = reinfGetColumns().map((column, index) => ({
    ...column,
    bimAutofilledMark:
      constructionType === "Колонна" &&
      Boolean(mark) &&
      index === 0 &&
      matchesReinfBimMark(column.marking, mark)
  }));
  reinfSetColumns(nextColumns);

  const nextBeams = reinfGetBeams().map((beam, index) => ({
    ...beam,
    bimAutofilledMark:
      constructionType === "Балка" &&
      Boolean(mark) &&
      index === 0 &&
      matchesReinfBimMark(beam.marking, mark)
  }));
  reinfSetBeams(nextBeams);

  renderReinfColumns();
  renderReinfBeams();
}

function renderReinfBimBindingSnapshot() {
  const snapshot = reinfBimBindingSnapshot;
  const hasLink = Boolean(snapshot);

  if (reinfBimSourceCard) {
    reinfBimSourceCard.hidden = !hasLink;
    reinfBimSourceCard.classList.toggle("is-linked", hasLink);
    reinfBimSourceCard.classList.toggle("is-stale", hasLink && !snapshot?.resolved);
  }

  if (reinfManualAssistNote) {
    const noteText = hasLink
      ? snapshot.resolved
        ? "Подсвеченные поля ниже подставлены из BIM там, где данные надёжны. Диаметр, шаг и защитный слой пока остаются ручными."
        : "BIM-привязка сохранена, но сам импортированный элемент сейчас недоступен. Поля можно продолжать редактировать вручную."
      : BIM_MANUAL_MODE_MESSAGE;
    reinfManualAssistNote.textContent = noteText;
    reinfManualAssistNote.hidden = !noteText;
    reinfManualAssistNote.classList.toggle("is-linked", hasLink);
    reinfManualAssistNote.classList.toggle("is-stale", hasLink && !snapshot?.resolved);
  }

  if (!hasLink) {
    if (reinfBimSourceTitle) reinfBimSourceTitle.textContent = "BIM-элемент не выбран";
    if (reinfBimSourceState) reinfBimSourceState.textContent = BIM_MANUAL_MODE_MESSAGE;
    if (reinfBimSourceMeta) reinfBimSourceMeta.textContent = "";
    if (reinfBimAppliedTypeEl) reinfBimAppliedTypeEl.textContent = "Нет данных";
    if (reinfBimAppliedFloorEl) reinfBimAppliedFloorEl.textContent = "Нет данных";
    if (reinfBimAppliedMarkEl) reinfBimAppliedMarkEl.textContent = "Нет данных";
    if (reinfBimAppliedAxesEl) reinfBimAppliedAxesEl.textContent = "Нет данных";
    if (reinfBimAppliedRebarEl) reinfBimAppliedRebarEl.textContent = "Пока ручной ввод";
    if (reinfBimSourceHint) {
      reinfBimSourceHint.textContent = "Из текущего BIM-MVP в армирование надёжно приходят тип, этаж, BIM-оси и марка для колонн/балок. Диаметр, шаг и защитный слой пока вводятся вручную.";
    }
    clearReinfStaticBimFieldHighlights();
    return;
  }

  if (reinfBimSourceTitle) reinfBimSourceTitle.textContent = snapshot.title;
  if (reinfBimSourceState) reinfBimSourceState.textContent = snapshot.resolved ? "Связка активна" : "Источник недоступен";
  if (reinfBimSourceMeta) {
    const metaParts = [];
    if (snapshot.elementId) metaParts.push(`ID ${snapshot.elementId}`);
    if (snapshot.sourceModelId) metaParts.push(`Модель ${snapshot.sourceModelId}`);
    if (snapshot.ifcGuid) metaParts.push(`GUID ${formatReinfBimShortGuid(snapshot.ifcGuid)}`);
    reinfBimSourceMeta.textContent = metaParts.join(" · ");
  }
  if (reinfBimAppliedTypeEl) reinfBimAppliedTypeEl.textContent = formatReinfBimDisplayValue(snapshot.typeLabel);
  if (reinfBimAppliedFloorEl) reinfBimAppliedFloorEl.textContent = formatReinfBimDisplayValue(snapshot.floor);
  if (reinfBimAppliedMarkEl) reinfBimAppliedMarkEl.textContent = formatReinfBimDisplayValue(snapshot.mark);
  if (reinfBimAppliedAxesEl) reinfBimAppliedAxesEl.textContent = formatReinfBimDisplayValue(snapshot.axes);
  if (reinfBimAppliedRebarEl) {
    reinfBimAppliedRebarEl.textContent = snapshot.resolved
      ? "Диаметр, шаг и защитный слой пока вручную"
      : "Источник недоступен";
  }
  if (reinfBimSourceHint) {
    reinfBimSourceHint.textContent = snapshot.resolved
      ? "Из текущего BIM-MVP в армирование надёжно приходят тип, этаж, BIM-оси и марка для колонн/балок. Диаметр, шаг и защитный слой пока вводятся вручную."
      : "BIM-связка сохранена в проверке, но этот элемент сейчас не найден среди импортированных элементов проекта.";
  }

  updateReinfStaticBimHighlights(snapshot);
}

function updateReinfBimControlsState() {
  const filteredElements = getFilteredReinfBimElements();
  const snapshot = reinfBimBindingSnapshot;
  const projectId = getCurrentProjectId();

  if (reinfBimElementSelect) reinfBimElementSelect.disabled = !projectId || reinfBimElements.length === 0;
  if (reinfBimSearchInput) reinfBimSearchInput.disabled = !projectId || reinfBimElements.length === 0;
  if (reinfBimTypeFilter) reinfBimTypeFilter.disabled = !projectId || reinfBimElements.length === 0;
  if (reinfBimAxesFilter) reinfBimAxesFilter.disabled = !projectId || reinfBimElements.length === 0;
  if (btnClearReinfBimSelection) btnClearReinfBimSelection.disabled = !selectedReinfBimElementId;

  if (!projectId) {
    setReinfBimStatus("Сначала выберите объект. После этого станут доступны BIM-элементы проекта.", "muted");
    return;
  }

  const selectedElement = getSelectedReinfBimElement();
  if (!selectedElement && snapshot && !snapshot.resolved) {
    setReinfBimStatus(
      "BIM-привязка сохранена в проверке, но сам импортированный элемент сейчас не найден в проекте. Можно перепривязать элемент или продолжить вручную.",
      "info"
    );
    return;
  }

  if (reinfBimElements.length === 0) {
    setReinfBimStatus(BIM_MANUAL_MODE_MESSAGE, "muted");
    return;
  }

  if (!selectedElement) {
    if (hasActiveReinfBimFilters()) {
      if (filteredElements.length === 0) {
        setReinfBimStatus("По текущим фильтрам BIM-элементы не найдены. Можно ослабить фильтры или продолжить вручную.", "info");
      } else {
        setReinfBimStatus(`Найдено ${filteredElements.length} BIM-элементов. Выберите элемент или продолжайте ручной ввод.`, "info");
      }
      return;
    }

    setReinfBimStatus(BIM_MANUAL_MODE_MESSAGE, "muted");
    return;
  }

  const typeLabel = getConstructionLabel(getTehnadzorTypeByBimType(selectedElement.type), "Элемент");
  setReinfBimStatus(`${typeLabel} выбран из BIM. Привязка сохранится вместе с проверкой.`, "success");
}

function buildReinfBindingPayloadFromSnapshot() {
  if (!reinfBimBindingSnapshot && !selectedReinfBimElementId) return null;

  return {
    construction: getSelectedConstructionKey() || null,
    constructionCategory: getSelectedConstructionCategory() || null,
    constructionLabel: getSelectedConstructionLabel() || null,
    constructionType: construction?.value || null,
    bimElementId: selectedReinfBimElementId || reinfBimBindingSnapshot?.elementId || null,
    bimSourceModelId: getSelectedReinfBimElement()?.sourceModelId || reinfBimBindingSnapshot?.sourceModelId || null,
    bimIfcGuid: getSelectedReinfBimElement()?.ifcGuid || reinfBimBindingSnapshot?.ifcGuid || null,
    bimType: getSelectedReinfBimElement()?.type || reinfBimBindingSnapshot?.rawType || null,
    bimFloor: normalizeReinfBimValue(reinfBimBindingSnapshot?.floor) || null,
    bimMark: normalizeReinfBimValue(reinfBimMarkEl?.value) || normalizeReinfBimValue(reinfBimBindingSnapshot?.mark) || null,
    bimAxes: normalizeReinfBimValue(reinfBimAxesEl?.value) || normalizeReinfBimValue(reinfBimBindingSnapshot?.axes) || null
  };
}

function hasReinfBimBindingData(data: ReinforcementCheckRecord = {}) {
  return Boolean(
    normalizeReinfBimValue(data.bimElementId) ||
    normalizeReinfBimValue(data.bimSourceModelId) ||
normalizeReinfBimValue(data.bimIfcGuid) ||
    normalizeReinfBimValue(data.bimType) ||
    normalizeReinfBimValue(data.bimFloor) ||
    normalizeReinfBimValue(data.bimMark) ||
    normalizeReinfBimValue(data.bimAxes)
  );
}

function applyReinfBimPrefillFromElement(element, { overwrite = false } = {}) {
  if (!element) return;

  const targetConstruction = construction?.value || getTehnadzorTypeByBimType(element.type) || "";
  const targetFlags = getReinfConstructionFlags(targetConstruction);
  const floorField = getReinfFloorFieldByConstruction(targetConstruction);
  if (floorField && element.floor && (overwrite || !String(floorField.value || "").trim())) {
    floorField.value = element.floor;
  }

  if ((targetFlags.isPlate || targetFlags.isStair) && element.axes) {
    tryApplyReinfPlateAxesFromBim(element.axes, { overwrite });
  }

  if (targetFlags.isColumn && element.mark) {
    const firstColumn = ensureReinfColumnPrefillRow();
    if (overwrite || !normalizeReinfBimValue(firstColumn.marking)) {
      firstColumn.marking = element.mark;
    }
    firstColumn.bimAutofilledMark = matchesReinfBimMark(firstColumn.marking, element.mark);
    reinfSetColumns([...reinfGetColumns()]);
  }

  if (targetFlags.isBeam && element.mark) {
    const firstBeam = ensureReinfBeamPrefillRow();
    if (overwrite || !normalizeReinfBimValue(firstBeam.marking)) {
      firstBeam.marking = element.mark;
    }
    firstBeam.bimAutofilledMark = matchesReinfBimMark(firstBeam.marking, element.mark);
    reinfSetBeams([...reinfGetBeams()]);
  }
}

function syncReinfBimSelectionFromCheck(checkData: ReinforcementCheckRecord = {}) {
  const nextId = String(checkData.bimElementId || "").trim();
  selectedReinfBimElementId = nextId;
  const selectedElement = nextId ? reinfBimElementsById.get(nextId) || null : null;

  renderReinfBimElementOptions(nextId);
  if (reinfBimElementSelect) {
    reinfBimElementSelect.value = nextId && reinfBimElementsById.has(nextId) ? nextId : "";
  }
  if (reinfBimMarkEl) {
    reinfBimMarkEl.value = checkData.bimMark || (selectedElement?.mark || "");
  }
  if (reinfBimAxesEl) {
    reinfBimAxesEl.value = checkData.bimAxes || (selectedElement?.axes || "");
  }

  reinfBimBindingSnapshot = buildReinfBimBindingSnapshot({
    element: selectedElement,
    checkData,
    constructionType: checkData.construction || checkData.constructionType || getSelectedConstructionKey()
  });

  if (selectedElement) {
    applyReinfBimPrefillFromElement(selectedElement, { overwrite: false });
  }

  renderReinfBimBindingSnapshot();
  syncReinfDynamicBimFlags(reinfBimBindingSnapshot);
  updateReinfBimControlsState();
}

function collectReinfBimCheckData() {
  const selectedElement = getSelectedReinfBimElement();
  if (!selectedElement && !reinfBimBindingSnapshot) {
    return {
      bimElementId: null,
      bimSourceModelId: null,
      bimIfcGuid: null,
      bimType: null,
      bimFloor: null,
      bimMark: null,
      bimAxes: null
    };
  }

  return {
    bimElementId: selectedReinfBimElementId || null,
    bimSourceModelId: selectedElement?.sourceModelId || reinfBimBindingSnapshot?.sourceModelId || null,
    bimIfcGuid: selectedElement?.ifcGuid || reinfBimBindingSnapshot?.ifcGuid || null,
    bimType: selectedElement?.type || reinfBimBindingSnapshot?.rawType || null,
    bimFloor: selectedElement?.floor || reinfBimBindingSnapshot?.floor || null,
    bimMark: normalizeReinfBimValue(reinfBimMarkEl?.value) || null,
    bimAxes: normalizeReinfBimValue(reinfBimAxesEl?.value) || null
  };
}

// Функция обновления местоположения для плиты и лестницы

function clearReinfBimSelection({ keepManualFields = true } = {}) {
  selectedReinfBimElementId = "";
  reinfBimBindingSnapshot = null;
  renderReinfBimElementOptions("");
  if (reinfBimElementSelect) reinfBimElementSelect.value = "";

  if (!keepManualFields) {
    if (reinfBimMarkEl) reinfBimMarkEl.value = "";
    if (reinfBimAxesEl) reinfBimAxesEl.value = "";
  }

  clearReinfDynamicBimFlags();
  renderReinfColumns();
  renderReinfBeams();
  renderReinfBimBindingSnapshot();
  updateReinfBimControlsState();
}

function applyReinfBimElementSelection(elementId) {
  const nextId = String(elementId || "").trim();
  if (!nextId) {
    clearReinfBimSelection({ keepManualFields: true });
    return;
  }

  const element = reinfBimElementsById.get(nextId);
  if (!element) {
    setReinfBimStatus("Выбранный BIM-элемент не найден в проекте. Обновите список элементов.", "error");
    return;
  }

  selectedReinfBimElementId = nextId;
  const previousConstruction = construction?.value || "";
  const targetConstruction = getTehnadzorTypeByBimType(element.type) || construction?.value || "";
  if (construction && targetConstruction) {
    if (window.setConstructionAndTrigger) {
      window.setConstructionAndTrigger(targetConstruction);
      updateReinfLocationFieldsVisibility(previousConstruction !== construction.value);
    } else {
      construction.value = targetConstruction;
      updateReinfLocationFieldsVisibility(previousConstruction !== targetConstruction);
    }
  }

  if (reinfBimElementSelect) {
    renderReinfBimElementOptions(nextId);
    reinfBimElementSelect.value = nextId;
  }
  if (reinfBimMarkEl) reinfBimMarkEl.value = element.mark || "";
  if (reinfBimAxesEl) reinfBimAxesEl.value = element.axes || "";

  reinfBimBindingSnapshot = buildReinfBimBindingSnapshot({
    element,
    constructionType: targetConstruction
  });

  applyReinfBimPrefillFromElement(element, { overwrite: false });
  renderReinfBimBindingSnapshot();
  syncReinfDynamicBimFlags(reinfBimBindingSnapshot);
  updateReinfBimControlsState();
}

async function loadReinfBimElements(projectId = getCurrentProjectId()) {
  const preservedBinding = buildReinfBindingPayloadFromSnapshot();

  reinfBimElements = [];
  reinfBimElementsById.clear();
  selectedReinfBimElementId = "";
  reinfBimBindingSnapshot = null;
  resetReinfBimFilters();
  syncReinfBimFilterControlsFromState();
  if (reinfBimMarkEl) reinfBimMarkEl.value = "";
  if (reinfBimAxesEl) reinfBimAxesEl.value = "";
  clearReinfDynamicBimFlags();
  renderReinfBimBindingSnapshot();
  renderReinfBimFilterOptions();
  renderReinfBimElementOptions("");

  if (!projectId || String(projectId).trim() === "") {
    updateReinfBimControlsState();
    return;
  }

  try {
  const snap =
    await getDependencies().service.loadBimElements(projectId);
    const loadedElements = [];
    snap.forEach((docSnap) => {
      const normalized = normalizeProjectBimElement(docSnap.id, docSnap.data());
      if (!normalized.elementId || !normalized.type) return;
      loadedElements.push(normalized);
    });

    reinfBimElements = sortProjectBimElements(loadedElements);
    reinfBimElements.forEach((element) => {
      const key = element.elementId || element.id;
      if (key) reinfBimElementsById.set(key, element);
    });

    renderReinfBimFilterOptions();
    renderReinfBimElementOptions("");

    if (hasReinfBimBindingData(preservedBinding || {})) {
      syncReinfBimSelectionFromCheck(preservedBinding);
    } else {
      renderReinfBimBindingSnapshot();
      updateReinfBimControlsState();
    }
  } catch (error) {
    console.error("Ошибка загрузки BIM-элементов для армирования:", error);
    setReinfBimStatus(BIM_LOAD_ERROR_MESSAGE, "error");
  }
}

function updateReinfLocationFieldsVisibility(shouldReset = true) {
  return runtime?.form.updateFieldsVisibility(shouldReset);
}
function updateReinfLocation() {
  return runtime?.form.updateLocation();
}
function renderReinfColumns() { return runtime?.rows.renderColumns(); }
function renderReinfBeams() { return runtime?.rows.renderBeams(); }

function initReinfBimBindings() {
  if (reinfBimBindingsInitialized) return;
  reinfBimBindingsInitialized = true;
  reinfBimElementSelect?.addEventListener("change", (event) => {
    const nextId = event.target?.value || "";
    if (nextId !== "__empty__") applyReinfBimElementSelection(nextId);
  });
  reinfBimSearchInput?.addEventListener("input", (event) => {
    reinfBimFilters.search = String(event.target?.value || "").trim();
    renderReinfBimElementOptions();
    updateReinfBimControlsState();
  });
  reinfBimTypeFilter?.addEventListener("change", (event) => {
    reinfBimFilters.type = normalizeReinfBimFilterValue(event.target?.value, "all");
    renderReinfBimElementOptions();
    updateReinfBimControlsState();
  });
  reinfBimAxesFilter?.addEventListener("change", (event) => {
    reinfBimFilters.axes = normalizeReinfBimFilterValue(event.target?.value, "all");
    renderReinfBimElementOptions();
    updateReinfBimControlsState();
  });
  btnClearReinfBimSelection?.addEventListener("click", () => {
    clearReinfBimSelection({ keepManualFields: true });
    setReinfBimStatus("BIM-привязка снята. Текущие значения в форме сохранены для ручного редактирования.", "info");
  });
  [reinfFloorEl, reinfColumnFloorEl, reinfBeamFloorEl, reinfWallFloorEl, reinfBimMarkEl, reinfBimAxesEl]
    .forEach((field) => field?.addEventListener("input", () => updateReinfStaticBimHighlights()));
}

export function initReinforcementModule() {
  if (reinforcementInitialized) return;
  reinforcementInitialized = true;
  const configured = getDependencies();
  runtime = createReinforcementRuntime({
    state: configured.state,
    service: configured.service,
    dom,
    bim: {
      collectCheckData: collectReinfBimCheckData,
      restoreSelection: syncReinfBimSelectionFromCheck,
      clearSelection: clearReinfBimSelection,
      renderBinding: renderReinfBimBindingSnapshot,
      updateControls: updateReinfBimControlsState,
      updateHighlights: () => {
        updateReinfStaticBimHighlights();
        syncReinfDynamicBimFlags(reinfBimBindingSnapshot);
      },
      initBindings: initReinfBimBindings,
      loadElements: loadReinfBimElements,
      renderVisualPanel: renderReinfBimVisualPanel,
      getMark: () => normalizeReinfBimValue(reinfBimBindingSnapshot?.mark) || null,
      setFieldAutofilled: setReinfBimFieldAutofilled
    },
    inspectionState: configured.inspectionState,
    inspectionChecked: configured.inspectionChecked,
    storage: localStorage,
    storageKey: APP_STORAGE_KEYS.reinf,
    getCurrentProjectId,
    validateProject,
    setConstruction: configured.setConstruction,
    notify: configured.showNotification,
    confirm: configured.confirm,
    updateSummary: configured.updateSummary,
    addJournalEntry: configured.addJournalEntry,
    upsertJournalEntry: configured.upsertJournalEntry,
    notifyFirestoreSyncStatus: configured.notifyFirestoreSyncStatus
  });
  onAppTabActivated("reinforcement", renderReinfBimVisualPanel);
  renderReinfBimFilterOptions();
  renderReinfBimElementOptions("");
  renderReinfBimBindingSnapshot();
  updateReinfBimControlsState();
  runtime.init();
}

export function checkReinfColumnDuplicate(marking: string, excludeId: number | null = null) {
  return runtime?.rows.checkColumnDuplicate(marking, excludeId) || false;
}
export function removeReinfColumn(id: number) { runtime?.rows.removeColumn(id); }
export function checkReinfBeamDuplicate(marking: string, excludeId: number | null = null) {
  return runtime?.rows.checkBeamDuplicate(marking, excludeId) || false;
}
export function removeReinfBeam(id: number) { runtime?.rows.removeBeam(id); }
export function checkReinfWallDuplicate(
  bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis,
  numberAxis1, numberAxis2, excludeId: number | null = null
) {
  return runtime?.rows.checkWallDuplicate({
    bindingType, numberAxis, letterAxis1, letterAxis2,
    letterAxis, numberAxis1, numberAxis2
  }, excludeId) || false;
}
export function bindReinfWallButton() { runtime?.rows.bindWallButton(); }
export function removeReinfWall(id: number) { runtime?.rows.removeWall(id); }
export function saveReinfWallsDraft() { runtime?.rows.saveWallsDraft(); }
export function loadReinfWallsDraft() { runtime?.rows.loadWallsDraft(); }
export function renderReinfWalls() { runtime?.rows.renderWalls(); }
export async function loadReinfChecks() { await runtime?.loadChecks(); }
export function saveReinfChecks() { runtime?.saveChecks(); }
export function renderReinfChecks() { runtime?.renderChecks(); }
export function loadReinfCheck(id: string) { runtime?.loadCheck(id); }
export async function saveReinfCheck(options: { skipJournalOnce?: boolean } = {}) {
  await runtime?.saveCheck(options);
}
export async function clearReinfChecks() { await runtime?.clearChecks(); }
export function clearReinfForm() { runtime?.clearForm(); }

export {
  renderReinfColumns,
  renderReinfBeams,
  updateReinfLocationFieldsVisibility,
  loadReinfBimElements,
  renderReinfBimVisualPanel
};
