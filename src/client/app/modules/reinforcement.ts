import { APP_CONFIG, TOLERANCES, VALID_LETTER_AXES } from "../../config.js";
import {
  getConstructionCategoryKey,
  getConstructionEntityLabels,
  getConstructionLabel,
  getConstructionModuleBehavior,
  getConstructionModuleFallbackMessage,
  getConstructionProfile,
  isConstructionProfile,
  normalizeConstructionKey
} from "../construction.js";
import {
  getInspectionStatus,
  getInspectionToleranceValue,
  hasInspectionField
} from "../inspection-registry.js";
import {
  showNotification,
  validateRequiredField,
  validateProject,
  checkTolerance,
  checkStrictMatch,
  showConfirm,
  defaultRusLetters,
  defaultNumbers,
  normalizeMarking,
  formatCheckResult,
  parseDecimal,
  escapeHtml,
  sanitizeHtml,
  formatNodeValue
} from "../../utils.js";
import {
  addReinfColumn as reinfAddColumn,
  removeReinfColumn as reinfRemoveColumn,
  getReinfColumns as reinfGetColumns,
  setReinfColumns as reinfSetColumns,
  checkReinfColumnDuplicate as reinfCheckColumnDuplicate,
  addReinfBeam as reinfAddBeam,
  removeReinfBeam as reinfRemoveBeam,
  getReinfBeams as reinfGetBeams,
  setReinfBeams as reinfSetBeams,
  checkReinfBeamDuplicate as reinfCheckBeamDuplicate,
  addReinfWall as reinfAddWall,
  removeReinfWall as reinfRemoveWall,
  getReinfWalls as reinfGetWalls,
  setReinfWalls as reinfSetWalls,
  checkReinfWallDuplicate as reinfCheckWallDuplicate,
  clearAll as reinfClearAll,
  clearByType as reinfClearByType
} from "../../reinf.js";
import {
  clearProjectCollection,
  createProjectCollectionDoc,
  getProjectDocSnapshot,
  getProjectCollectionSnapshot,
  updateProjectCollectionDoc
} from "../repositories/firestore-repository.js";
import {
  clearInspectionsByModuleAndRefreshAnalytics,
  saveInspectionAndRefreshAnalytics
} from "../services/inspection-sync.js";
import { renderRegulatoryBasisHtml } from "../services/regulatory-basis.js";
import type {
  InspectionPayload,
  ReinforcementCheckRecord,
  ReinforcementLinearRecord
} from "../../types/module-records.js";
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
import {
  getCurrentIfcFileFromInput,
  getCurrentProjectIdFromGlobal
} from "../services/bim-runtime-context.js";
import { onAppTabActivated } from "../services/module-activation.js";
import {
  buildNodeDeleteIconButton,
  setupNodeCardInteractions
} from "../ui/node-card-interactions.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const safeValue = (value) => escapeHtml(value == null ? "" : String(value));
const BIM_MANUAL_MODE_MESSAGE = "";
const BIM_LOAD_ERROR_MESSAGE = "Не удалось загрузить BIM-элементы. Можно продолжить ручной ввод.";

const getCurrentProjectId = getCurrentProjectIdFromGlobal;
const getCurrentIfcFile = getCurrentIfcFileFromInput;
const getReinfChecksMap = () => {
  if (!(globalThis.reinfChecks instanceof Map)) {
    globalThis.reinfChecks = new Map<string, ReinforcementCheckRecord>();
  }
  return globalThis.reinfChecks as Map<string, ReinforcementCheckRecord>;
};
const setCurrentReinfCheckId = (value) => {
  globalThis.currentReinfCheckId = value;
};
const getCurrentReinfCheckId = () => globalThis.currentReinfCheckId || null;

const getState = () => {
  if (!globalThis.state) {
    globalThis.state = {};
  }
  return globalThis.state;
};

const getChecked = () => {
  if (!globalThis.checked) {
    globalThis.checked = {};
  }
  return globalThis.checked;
};

const updateSummary = () => {
  if (typeof globalThis.updateSummaryTab === "function") {
    return globalThis.updateSummaryTab();
  }
  return undefined;
};

const addJournalEntrySafe = (params) => {
  if (typeof globalThis.addJournalEntry === "function") {
    return globalThis.addJournalEntry(params);
  }
  return null;
};

const upsertJournalEntrySafe = (params) => {
  if (typeof globalThis.upsertJournalEntry === "function") {
    return globalThis.upsertJournalEntry(params);
  }
  return null;
};

const notifyFirestoreSyncStatusSafe = (docRef) => {
  if (typeof globalThis.notifyFirestoreSyncStatus === "function") {
    return globalThis.notifyFirestoreSyncStatus(docRef);
  }
  return undefined;
};

const auth = getAuth();
const reinfChecks = getReinfChecksMap();
let reinforcementInitialized = false;
let reinfAxesInitialized = false;
let reinfButtonsInitialized = false;
let skipReinfJournalOnce = false;
let reinfBimElements = [];
let selectedReinfBimElementId = "";
let reinfBimBindingSnapshot = null;
let reinfBimVisualPanel = null;
const reinfBimElementsById = new Map();
const reinfBimFilters = {
  search: "",
  type: "all",
  axes: "all"
};

// ============================
//  Армирование: DOM элементы
// ============================
const construction = document.getElementById("construction");
const reinfBimSearchInput = document.getElementById("reinfBimSearchInput");
const reinfBimTypeFilter = document.getElementById("reinfBimTypeFilter");
const reinfBimAxesFilter = document.getElementById("reinfBimAxesFilter");
const reinfBimElementSelect = document.getElementById("reinfBimElementSelect");
const reinfBimElementStatus = document.getElementById("reinfBimElementStatus");
const reinfBimSourceCard = document.getElementById("reinfBimSourceCard");
const reinfBimSourceTitle = document.getElementById("reinfBimSourceTitle");
const reinfBimSourceState = document.getElementById("reinfBimSourceState");
const reinfBimSourceMeta = document.getElementById("reinfBimSourceMeta");
const reinfBimAppliedTypeEl = document.getElementById("reinfBimAppliedType");
const reinfBimAppliedFloorEl = document.getElementById("reinfBimAppliedFloor");
const reinfBimAppliedMarkEl = document.getElementById("reinfBimAppliedMark");
const reinfBimAppliedAxesEl = document.getElementById("reinfBimAppliedAxes");
const reinfBimAppliedRebarEl = document.getElementById("reinfBimAppliedRebar");
const reinfBimSourceHint = document.getElementById("reinfBimSourceHint");
const reinfBimMarkEl = document.getElementById("reinfBimMark");
const reinfBimAxesEl = document.getElementById("reinfBimAxes");
const btnClearReinfBimSelection = document.getElementById("btnClearReinfBimSelection");
const reinfManualAssistNote = document.getElementById("reinfManualAssistNote");
const reinfBimPanelHost = reinfBimSourceCard?.parentElement || reinfBimElementSelect?.closest(".geo-bim-card");
const reinfStairNameEl = document.getElementById("reinfStairName");
const reinfStairNameField = document.getElementById("reinfStairNameField");
const reinfFloorEl = document.getElementById("reinfFloor");
const reinfAxisLetterFromEl = document.getElementById("reinfAxisLetterFrom");
const reinfAxisLetterToEl = document.getElementById("reinfAxisLetterTo");
const reinfAxisNumberFromEl = document.getElementById("reinfAxisNumberFrom");
const reinfAxisNumberToEl = document.getElementById("reinfAxisNumberTo");
const reinfStripAxisModeField = document.getElementById("reinfStripAxisModeField");
const reinfStripAxisModeEl = document.getElementById("reinfStripAxisMode") as HTMLSelectElement | null;
const reinfAxisLetterFromField = document.getElementById("reinfAxisLetterFromField");
const reinfAxisLetterToField = document.getElementById("reinfAxisLetterToField");
const reinfAxisNumberFromField = document.getElementById("reinfAxisNumberFromField");
const reinfAxisNumberToField = document.getElementById("reinfAxisNumberToField");
const reinfAxisLetterFromLabel = document.getElementById("reinfAxisLetterFromLabel");
const reinfAxisLetterToLabel = document.getElementById("reinfAxisLetterToLabel");
const reinfAxisNumberFromLabel = document.getElementById("reinfAxisNumberFromLabel");
const reinfAxisNumberToLabel = document.getElementById("reinfAxisNumberToLabel");
const reinfLocationEl = document.getElementById("reinfLocation");
const reinfLocationFields = document.getElementById("reinfLocationFields");
const reinfColumnFields = document.getElementById("reinfColumnFields");
const reinfColumnFloorEl = document.getElementById("reinfColumnFloor");
const reinfColumnsList = document.getElementById("reinfColumnsList");
const btnAddReinfColumn = document.getElementById("btnAddReinfColumn");
const reinfBeamFields = document.getElementById("reinfBeamFields");
const reinfBeamFloorEl = document.getElementById("reinfBeamFloor");
const reinfBeamsList = document.getElementById("reinfBeamsList");
const btnAddReinfBeam = document.getElementById("btnAddReinfBeam");
const reinfWallFields = document.getElementById("reinfWallFields");
const reinfWallFloorEl = document.getElementById("reinfWallFloor");
const reinfWallsList = document.getElementById("reinfWallsList");
const reinfWallsLimitLabel = document.getElementById("reinfWallsLimitLabel");
const reinfCommonFields = document.getElementById("reinfCommonFields");
const projDia = document.getElementById("projDia");
const factDia = document.getElementById("factDia");
const projStep = document.getElementById("projStep");
const factStep = document.getElementById("factStep");
const projCover = document.getElementById("projCover");
const factCover = document.getElementById("factCover");
const projStepField = projStep?.parentElement || null;
const factStepField = factStep?.parentElement || null;
const reinfResult = document.getElementById("reinforcementResult");
const reinfBehaviorMessage = document.getElementById("reinfBehaviorMessage");
const reinfProjHoopsStepField = document.getElementById("reinfProjHoopsStepField");
const reinfFactHoopsStepField = document.getElementById("reinfFactHoopsStepField");
const reinfProjHoopsStepEl = document.getElementById("reinfProjHoopsStep");
const reinfFactHoopsStepEl = document.getElementById("reinfFactHoopsStep");

function ensureReinfBimVisualSelector() {
  if (reinfBimVisualPanel) return reinfBimVisualPanel;

  reinfBimVisualPanel = ensureBimVisualPanel({
    host: reinfBimPanelHost,
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

// ============================
//  Армирование: helpers
// ============================
function fmtDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fillSelect(el, items) {
  if (!el) return;
  el.textContent = "";
  items.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    el.appendChild(opt);
  });
  reinfStripAxisModeEl?.addEventListener("change", () => {
    updateReinfLocationFieldsVisibility(false);
    updateReinfLocation();
  });
}

function moduleStorageKey(base) {
  const id = getCurrentProjectId() || "no_project";
  return `${base}_${id}`;
}

function getStorageKey() {
  const ls = globalThis.LS || {};
  return ls.reinf || "reinf_checks_v1";
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

function getReinfWallEntityLabel() {
  return getConstructionEntityLabels(getSelectedConstructionKey(), "reinforcement", getSelectedConstructionSubtype()).singular;
}

function getReinfWallEntityPlural() {
  return getConstructionEntityLabels(getSelectedConstructionKey(), "reinforcement", getSelectedConstructionSubtype()).plural;
}

function getReinfWallEntityPluralGenitive() {
  return getConstructionEntityLabels(getSelectedConstructionKey(), "reinforcement", getSelectedConstructionSubtype()).pluralGenitive;
}

function getReinfWallEntityAddText() {
  return getConstructionEntityLabels(getSelectedConstructionKey(), "reinforcement", getSelectedConstructionSubtype()).addText;
}

function getReinfWallEntityRequiredText() {
  return getConstructionEntityLabels(getSelectedConstructionKey(), "reinforcement", getSelectedConstructionSubtype()).requiredText;
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

function getReinfWallLimit(flags = getReinfConstructionFlags()) {
  return flags.behavior.maxWalls ?? APP_CONFIG.MAX_ELEMENTS;
}

function updateReinfWallsLimitUi(flags = getReinfConstructionFlags()) {
  const maxWalls = getReinfWallLimit(flags);
  if (reinfWallsLimitLabel) {
    reinfWallsLimitLabel.textContent = `${getReinfWallEntityPlural()} (до ${maxWalls})`;
  }
  const btnAddReinfWall = document.getElementById("btnAddReinfWall") as HTMLButtonElement | null;
  if (btnAddReinfWall) {
    const label = btnAddReinfWall.querySelector(".lg-btn__label");
    if (label) label.textContent = `+ Добавить ${getReinfWallEntityAddText()}`;
    const isAtLimit = reinfGetWalls().length >= maxWalls;
    btnAddReinfWall.disabled = isAtLimit;
    btnAddReinfWall.title = isAtLimit ? `Достигнут лимит ${maxWalls}: ${getReinfWallEntityPluralGenitive()}` : "";
  }
}

function setReinfUnsupportedState({ notify = false } = {}) {
  const message = getConstructionModuleFallbackMessage(
    getSelectedConstructionKey() || construction?.value || "",
    "reinforcement",
    "",
    getSelectedConstructionSubtype()
  );
  const registryStatus = getInspectionStatus(
    getSelectedConstructionKey() || construction?.value || "",
    "reinforcement",
    getSelectedConstructionSubtype()
  );
  const showOnlyBehaviorMessage = registryStatus === "factory" || registryStatus === "notApplicable";
  if (reinfResult) {
    reinfResult.className = "result";
    reinfResult.textContent = showOnlyBehaviorMessage ? "" : message;
    reinfResult.style.display = showOnlyBehaviorMessage ? "none" : "";
  }
  if (reinfBehaviorMessage) {
    reinfBehaviorMessage.hidden = false;
    reinfBehaviorMessage.textContent = message;
  }
  const state = getState();
  const checked = getChecked();
  state.reinforcement = false;
  checked.reinforcement = false;
  if (notify) {
    showNotification(message, "warning");
  }
  return message;
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
function updateReinfLocation() {
  if (!construction || !reinfLocationEl) return;
  const flags = getReinfConstructionFlags();
  const isStripFoundation = flags.behavior.locationMode === "strip_foundation";
  if (!flags.isPlate && !flags.isStair) {
    reinfLocationEl.value = "";
    return;
  }

  if (!reinfAxisLetterFromEl || !reinfAxisLetterToEl || !reinfAxisNumberFromEl || !reinfAxisNumberToEl) {
    reinfLocationEl.value = "";
    return;
  }

  const letterFrom = reinfAxisLetterFromEl.value;
  const letterTo = reinfAxisLetterToEl.value;
  const numberFrom = reinfAxisNumberFromEl.value;
  const numberTo = reinfAxisNumberToEl.value;

  if (isStripFoundation) {
    const stripMode = reinfStripAxisModeEl?.value || "letter_numbers";
    if (stripMode === "letter_numbers") {
      reinfLocationEl.value = numberFrom && letterFrom && letterTo && letterFrom !== letterTo
        ? `${numberFrom}, ${letterFrom}-${letterTo}`
        : "";
      return;
    }
    reinfLocationEl.value = numberFrom && numberTo && letterFrom && numberFrom !== numberTo
      ? `${numberFrom}-${numberTo}, ${letterFrom}`
      : "";
    return;
  }

  if (letterFrom && letterTo && numberFrom && numberTo) {
    reinfLocationEl.value = `${letterFrom}-${letterTo}, ${numberFrom}-${numberTo}`;
  } else {
    reinfLocationEl.value = "";
  }
}

function initReinfAxes() {
  if (reinfAxesInitialized) return;
  if (!reinfAxisLetterFromEl || !reinfAxisLetterToEl || !reinfAxisNumberFromEl || !reinfAxisNumberToEl) {
    return;
  }

  reinfAxesInitialized = true;

  fillSelect(reinfAxisLetterFromEl, defaultRusLetters);
  fillSelect(reinfAxisLetterToEl, defaultRusLetters);
  fillSelect(reinfAxisNumberFromEl, defaultNumbers);
  fillSelect(reinfAxisNumberToEl, defaultNumbers);

  reinfAxisLetterFromEl.value = APP_CONFIG.DEFAULT_LETTER_AXIS;
  reinfAxisLetterToEl.value = VALID_LETTER_AXES[1] || "Б";
  reinfAxisNumberFromEl.value = APP_CONFIG.DEFAULT_NUMBER_AXIS;
  reinfAxisNumberToEl.value = "2";

  [reinfAxisLetterFromEl, reinfAxisLetterToEl, reinfAxisNumberFromEl, reinfAxisNumberToEl].forEach((el) => {
    if (!el) return;
    el.dataset.oldValue = el.value;

    el.addEventListener("focus", (e) => {
      e.target.dataset.oldValue = e.target.value;
    });

    el.addEventListener("change", (e) => {
      const letterFrom = reinfAxisLetterFromEl.value;
      const letterTo = reinfAxisLetterToEl.value;
      const numberFrom = reinfAxisNumberFromEl.value;
      const numberTo = reinfAxisNumberToEl.value;

      if (letterFrom && letterTo && letterFrom === letterTo) {
        showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
        e.target.value = e.target.dataset.oldValue || "";
        updateReinfLocation();
        return;
      }

      if (numberFrom && numberTo && numberFrom === numberTo) {
        showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
        e.target.value = e.target.dataset.oldValue || "";
        updateReinfLocation();
        return;
      }

      e.target.dataset.oldValue = e.target.value;
      updateReinfLocation();
      updateReinfStaticBimHighlights();
    });
  });
}

/**
 * Полный сброс UI и состояния для модуля армирования
 * Очищает все массивы, DOM-элементы, результаты проверки
 * ВНИМАНИЕ: Не очищает DOM-контейнеры, чтобы не удалять обработчики событий
 */
function resetReinfUI() {
  reinfClearAll();

  if (reinfFloorEl) reinfFloorEl.value = "";
  if (reinfStairNameEl) reinfStairNameEl.value = "";
  if (reinfLocationEl) reinfLocationEl.value = "";
  if (reinfColumnFloorEl) reinfColumnFloorEl.value = "";
  if (reinfBeamFloorEl) reinfBeamFloorEl.value = "";
  if (reinfWallFloorEl) reinfWallFloorEl.value = "";

  [projDia, factDia, projStep, factStep, projCover, factCover].forEach((el) => {
    if (el) el.value = "";
  });

  if (reinfResult) {
    reinfResult.className = "result";
    reinfResult.innerHTML = "";
    reinfResult.style.display = "";
  }

  const state = getState();
  const checked = getChecked();
  state.reinforcement = false;
  checked.reinforcement = false;
}

// Показ/скрытие полей местоположения в зависимости от конструкции
function updateReinfLocationFieldsVisibility(shouldReset = true) {
  if (shouldReset) {
    resetReinfUI();
  }

  if (!construction) return;
  const flags = getReinfConstructionFlags();
  const behavior = flags.behavior;
  const stripLocation = behavior.locationMode === "strip_foundation";
  const stripMode = reinfStripAxisModeEl?.value || "letter_numbers";
  const boredPileFoundation = isBoredPileFoundation();

  if (reinfBehaviorMessage) {
    reinfBehaviorMessage.hidden = !flags.isUnsupported;
    reinfBehaviorMessage.textContent = flags.isUnsupported
      ? getConstructionModuleFallbackMessage(getSelectedConstructionKey() || construction?.value || "", "reinforcement", "", getSelectedConstructionSubtype())
      : "";
  }

  if (flags.isUnsupported) {
    if (reinfLocationFields) reinfLocationFields.style.display = "none";
    if (reinfColumnFields) reinfColumnFields.style.display = "none";
    if (reinfBeamFields) reinfBeamFields.style.display = "none";
    if (reinfWallFields) reinfWallFields.style.display = "none";
    if (reinfCommonFields) reinfCommonFields.style.display = "none";
    if (reinfStairNameField) reinfStairNameField.style.display = "none";
    if (reinfProjHoopsStepField) reinfProjHoopsStepField.style.display = "none";
    if (reinfFactHoopsStepField) reinfFactHoopsStepField.style.display = "none";
    setReinfUnsupportedState();
    return;
  }

  if ((flags.isPlate || flags.isStair) && !boredPileFoundation) {
    if (reinfLocationFields) reinfLocationFields.style.display = "block";
    if (reinfColumnFields) reinfColumnFields.style.display = "none";
    if (reinfBeamFields) reinfBeamFields.style.display = "none";
    if (reinfWallFields) reinfWallFields.style.display = "none";
    if (reinfCommonFields) reinfCommonFields.style.display = "grid";
    if (projStepField) projStepField.style.display = "block";
    if (factStepField) factStepField.style.display = "block";
    const projStepLabel = projStepField?.querySelector("label");
    const factStepLabel = factStepField?.querySelector("label");
    if (projStepLabel) projStepLabel.textContent = "Проектный шаг арматуры";
    if (factStepLabel) factStepLabel.textContent = "Фактический шаг арматуры";
    if (reinfStairNameField) {
      reinfStairNameField.style.display = flags.isStair ? "block" : "none";
    }
    if (reinfFloorEl?.parentElement) {
      reinfFloorEl.parentElement.style.display = behavior.floorVisible === false ? "none" : "block";
    }
    if (reinfProjHoopsStepField) reinfProjHoopsStepField.style.display = behavior.showReinforcementHoopsStep ? "block" : "none";
    if (reinfFactHoopsStepField) reinfFactHoopsStepField.style.display = behavior.showReinforcementHoopsStep ? "block" : "none";
    if (reinfStripAxisModeField) reinfStripAxisModeField.style.display = stripLocation ? "block" : "none";
    if (reinfAxisLetterFromLabel) reinfAxisLetterFromLabel.textContent = stripLocation ? "Буквенная ось" : "От буквенной оси";
    if (reinfAxisLetterToLabel) reinfAxisLetterToLabel.textContent = "До буквенной оси";
    if (reinfAxisNumberFromLabel) reinfAxisNumberFromLabel.textContent = stripLocation ? "Цифровая ось" : "От цифровой оси";
    if (reinfAxisNumberToLabel) reinfAxisNumberToLabel.textContent = "До цифровой оси";
    if (reinfAxisLetterFromField) reinfAxisLetterFromField.style.display = "";
    if (reinfAxisLetterToField) reinfAxisLetterToField.style.display = !stripLocation || stripMode === "letter_numbers" ? "" : "none";
    if (reinfAxisNumberFromField) reinfAxisNumberFromField.style.display = "";
    if (reinfAxisNumberToField) reinfAxisNumberToField.style.display = !stripLocation || stripMode === "number_letters" ? "" : "none";
    updateReinfLocation();
  } else if (flags.isColumn) {
    if (reinfLocationFields) reinfLocationFields.style.display = "none";
    if (reinfStairNameField) reinfStairNameField.style.display = "none";
    if (reinfColumnFields) reinfColumnFields.style.display = "block";
    if (reinfBeamFields) reinfBeamFields.style.display = "none";
    if (reinfWallFields) reinfWallFields.style.display = "none";
    if (reinfCommonFields) reinfCommonFields.style.display = "none";
    if (reinfProjHoopsStepField) reinfProjHoopsStepField.style.display = "none";
    if (reinfFactHoopsStepField) reinfFactHoopsStepField.style.display = "none";
    renderReinfColumns();
  } else if (flags.isBeam) {
    if (reinfLocationFields) reinfLocationFields.style.display = "none";
    if (reinfStairNameField) reinfStairNameField.style.display = "none";
    if (reinfColumnFields) reinfColumnFields.style.display = "none";
    if (reinfBeamFields) reinfBeamFields.style.display = "block";
    if (reinfWallFields) reinfWallFields.style.display = "none";
    if (reinfCommonFields) reinfCommonFields.style.display = "none";
    if (reinfProjHoopsStepField) reinfProjHoopsStepField.style.display = "none";
    if (reinfFactHoopsStepField) reinfFactHoopsStepField.style.display = "none";
    renderReinfBeams();
  } else if (flags.isWall) {
    if (reinfLocationFields) reinfLocationFields.style.display = "none";
    if (reinfStairNameField) reinfStairNameField.style.display = "none";
    if (reinfColumnFields) reinfColumnFields.style.display = "none";
    if (reinfBeamFields) reinfBeamFields.style.display = "none";
    if (reinfWallFields) reinfWallFields.style.display = "block";
    if (reinfCommonFields) reinfCommonFields.style.display = "none";
    if (reinfProjHoopsStepField) reinfProjHoopsStepField.style.display = "none";
    if (reinfFactHoopsStepField) reinfFactHoopsStepField.style.display = "none";

    loadReinfWallsDraft();
    const maxWalls = getReinfWallLimit(flags);
    if (reinfGetWalls().length > maxWalls) {
      reinfSetWalls(reinfGetWalls().slice(0, maxWalls));
      saveReinfWallsDraft();
    }
    updateReinfWallsLimitUi(flags);
    setTimeout(() => bindReinfWallButton(), 0);
  } else {
    if (reinfLocationFields) reinfLocationFields.style.display = "none";
    if (reinfStairNameField) reinfStairNameField.style.display = "none";
    if (reinfColumnFields) reinfColumnFields.style.display = "none";
    if (reinfBeamFields) reinfBeamFields.style.display = "none";
    if (reinfWallFields) reinfWallFields.style.display = "none";
    if (reinfCommonFields) reinfCommonFields.style.display = "grid";
    const showStep = !boredPileFoundation || getSelectedPileElement() === "grillage";
    if (projStepField) projStepField.style.display = showStep ? "block" : "none";
    if (factStepField) factStepField.style.display = showStep ? "block" : "none";
    const commonProjStepLabel = projStepField?.querySelector("label");
    const commonFactStepLabel = factStepField?.querySelector("label");
    if (commonProjStepLabel) commonProjStepLabel.textContent = boredPileFoundation ? "Проектное расположение арматуры" : "Проектный шаг арматуры";
    if (commonFactStepLabel) commonFactStepLabel.textContent = boredPileFoundation ? "Фактическое расположение арматуры" : "Фактический шаг арматуры";
    if (reinfProjHoopsStepField) reinfProjHoopsStepField.style.display = behavior.showReinforcementHoopsStep ? "block" : "none";
    if (reinfFactHoopsStepField) reinfFactHoopsStepField.style.display = behavior.showReinforcementHoopsStep ? "block" : "none";
  }

  renderReinfBimBindingSnapshot();
  syncReinfDynamicBimFlags(reinfBimBindingSnapshot);
  updateReinfBimControlsState();
}

// ============================
//  Колонны
// ============================
function checkReinfColumnDuplicate(marking, excludeId = null) {
  return reinfCheckColumnDuplicate(marking, excludeId);
}

function addReinfColumn() {
  reinfAddColumn(() => {
    renderReinfColumns();
    setTimeout(() => {
      const lastCol = reinfColumnsList?.querySelector(".card:last-child");
      if (lastCol) {
        lastCol.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
  });
}

function removeReinfColumn(id) {
  reinfRemoveColumn(id, renderReinfColumns);
}

function renderReinfColumns() {
  if (!reinfColumnsList) return;
  const reinfColumns = reinfGetColumns();
  reinfColumnsList.innerHTML = "";

  if (reinfColumns.length === 0) {
    reinfColumnsList.innerHTML = '<div class="caption" style="padding: 8px;">Нет добавленных колонн. Нажмите "Добавить колонну" для начала.</div>';
    return;
  }

  reinfColumns.forEach((column, index) => {
    const colDiv = document.createElement("div");
    colDiv.className = "card";
    colDiv.style.marginBottom = "8px";
    colDiv.style.padding = "12px";

    colDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <b>Колонна ${index + 1}</b>
        <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact" data-remove="${safeValue(column.id)}">
          <span class="lg-btn__label">Удалить</span>
          <span class="lg-btn__glow" aria-hidden="true"></span>
        </button>
      </div>
      <div class="${column.bimAutofilledMark ? "geo-bim-field--autofilled" : ""}">
        <label>Маркировка колонны </label>
        <input type="text" class="reinf-col-marking ${column.bimAutofilledMark ? "geo-bim-input--autofilled" : ""}" data-id="${safeValue(column.id)}" placeholder="Напр.: К 1.12" value="${safeValue(column.marking || "")}" required />
      </div>
      <div class="grid-2 mt8">
        <div>
          <label>Проектный диаметр арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-col-projDia" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.projDia || "")}" />
        </div>
        <div>
          <label>Фактический диаметр арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-col-factDia" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.factDia || "")}" />
        </div>
        <div>
          <label>Проектный шаг арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-col-projStep" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.projStep || "")}" />
        </div>
        <div>
          <label>Фактический шаг арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-col-factStep" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.factStep || "")}" />
        </div>
        <div>
          <label>Проектный защитный слой</label>
          <input type="number" inputmode="decimal" class="reinf-col-projCover" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.projCover || "")}" />
        </div>
        <div>
          <label>Фактический защитный слой</label>
          <input type="number" inputmode="decimal" class="reinf-col-factCover" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.factCover || "")}" />
        </div>
        <div>
          <label>Проектный шаг хомутов</label>
          <input type="number" inputmode="decimal" class="reinf-col-projHoopsStep" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.projHoopsStep || "")}" />
        </div>
        <div>
          <label>Фактический шаг хомутов</label>
          <input type="number" inputmode="decimal" class="reinf-col-factHoopsStep" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.factHoopsStep || "")}" />
        </div>
      </div>
    `;

    colDiv.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const reinfColumns = reinfGetColumns();
        const colItem = reinfColumns.find((c) => c.id === column.id);
        if (colItem) {
          if (e.target.classList.contains("reinf-col-marking")) {
            colItem.marking = e.target.value;
            colItem.bimAutofilledMark =
              index === 0 &&
              construction?.value === "Колонна" &&
              matchesReinfBimMark(colItem.marking, reinfBimBindingSnapshot?.mark);
            setReinfBimFieldAutofilled(e.target, colItem.bimAutofilledMark);
          } else if (e.target.classList.contains("reinf-col-projDia")) colItem.projDia = e.target.value;
          else if (e.target.classList.contains("reinf-col-factDia")) colItem.factDia = e.target.value;
          else if (e.target.classList.contains("reinf-col-projStep")) colItem.projStep = e.target.value;
          else if (e.target.classList.contains("reinf-col-factStep")) colItem.factStep = e.target.value;
          else if (e.target.classList.contains("reinf-col-projCover")) colItem.projCover = e.target.value;
          else if (e.target.classList.contains("reinf-col-factCover")) colItem.factCover = e.target.value;
          else if (e.target.classList.contains("reinf-col-projHoopsStep")) colItem.projHoopsStep = e.target.value;
          else if (e.target.classList.contains("reinf-col-factHoopsStep")) colItem.factHoopsStep = e.target.value;
          reinfSetColumns(reinfColumns);
        }
      });
    });

    const markingInput = colDiv.querySelector(".reinf-col-marking");
    if (markingInput) {
      markingInput.addEventListener("blur", (e) => {
        const reinfColumns = reinfGetColumns();
        const colItem = reinfColumns.find((c) => c.id === column.id);
        if (colItem) {
          const newMarking = normalizeMarking(e.target.value);
          if (newMarking && checkReinfColumnDuplicate(newMarking, column.id)) {
            showNotification("Колонна с такой маркировкой уже существует. Введите другую маркировку.", "warning");
            e.target.value = colItem.marking || "";
            e.target.focus();
            return;
          }
          colItem.marking = newMarking;
          colItem.bimAutofilledMark =
            index === 0 &&
            construction?.value === "Колонна" &&
            matchesReinfBimMark(colItem.marking, reinfBimBindingSnapshot?.mark);
          reinfSetColumns(reinfColumns);
          setReinfBimFieldAutofilled(e.target, colItem.bimAutofilledMark);
        }
      });
    }

    colDiv.querySelector(`[data-remove="${column.id}"]`).addEventListener("click", () => {
      removeReinfColumn(column.id);
    });

    reinfColumnsList.appendChild(colDiv);
  });
}

// ============================
//  Балки
// ============================
function checkReinfBeamDuplicate(marking, excludeId = null) {
  return reinfCheckBeamDuplicate(marking, excludeId);
}

function addReinfBeam() {
  reinfAddBeam(() => {
    renderReinfBeams();
    setTimeout(() => {
      const lastBeam = reinfBeamsList?.querySelector(".card:last-child");
      if (lastBeam) {
        lastBeam.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
  });
}

function removeReinfBeam(id) {
  reinfRemoveBeam(id, renderReinfBeams);
}

function renderReinfBeams() {
  if (!reinfBeamsList) return;
  const reinfBeams = reinfGetBeams();
  reinfBeamsList.innerHTML = "";

  if (reinfBeams.length === 0) {
    reinfBeamsList.innerHTML = '<div class="caption" style="padding: 8px;">Нет добавленных балок. Нажмите "Добавить балку" для начала.</div>';
    return;
  }

  reinfBeams.forEach((beam, index) => {
    const beamDiv = document.createElement("div");
    beamDiv.className = "card";
    beamDiv.style.marginBottom = "8px";
    beamDiv.style.padding = "12px";

    beamDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <b>Балка ${index + 1}</b>
        <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact" data-remove="${safeValue(beam.id)}">
          <span class="lg-btn__label">Удалить</span>
          <span class="lg-btn__glow" aria-hidden="true"></span>
        </button>
      </div>
      <div class="${beam.bimAutofilledMark ? "geo-bim-field--autofilled" : ""}">
        <label>Маркировка балки </label>
        <input type="text" class="reinf-beam-marking ${beam.bimAutofilledMark ? "geo-bim-input--autofilled" : ""}" data-id="${safeValue(beam.id)}" placeholder="Напр.: БМ 1" value="${safeValue(beam.marking || "")}" required />
      </div>
      <div class="grid-2 mt8">
        <div>
          <label>Проектный диаметр арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-beam-projDia" data-id="${safeValue(beam.id)}" placeholder="мм" value="${safeValue(beam.projDia || "")}" />
        </div>
        <div>
          <label>Фактический диаметр арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-beam-factDia" data-id="${safeValue(beam.id)}" placeholder="мм" value="${safeValue(beam.factDia || "")}" />
        </div>
        <div>
          <label>Проектный шаг арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-beam-projStep" data-id="${safeValue(beam.id)}" placeholder="мм" value="${safeValue(beam.projStep || "")}" />
        </div>
        <div>
          <label>Фактический шаг арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-beam-factStep" data-id="${safeValue(beam.id)}" placeholder="мм" value="${safeValue(beam.factStep || "")}" />
        </div>
        <div>
          <label>Проектный защитный слой</label>
          <input type="number" inputmode="decimal" class="reinf-beam-projCover" data-id="${safeValue(beam.id)}" placeholder="мм" value="${safeValue(beam.projCover || "")}" />
        </div>
        <div>
          <label>Фактический защитный слой</label>
          <input type="number" inputmode="decimal" class="reinf-beam-factCover" data-id="${safeValue(beam.id)}" placeholder="мм" value="${safeValue(beam.factCover || "")}" />
        </div>
      </div>
    `;

    beamDiv.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const reinfBeams = reinfGetBeams();
        const beamItem = reinfBeams.find((b) => b.id === beam.id);
        if (beamItem) {
          if (e.target.classList.contains("reinf-beam-marking")) {
            beamItem.marking = e.target.value;
            beamItem.bimAutofilledMark =
              index === 0 &&
              construction?.value === "Балка" &&
              matchesReinfBimMark(beamItem.marking, reinfBimBindingSnapshot?.mark);
            setReinfBimFieldAutofilled(e.target, beamItem.bimAutofilledMark);
          } else if (e.target.classList.contains("reinf-beam-projDia")) beamItem.projDia = e.target.value;
          else if (e.target.classList.contains("reinf-beam-factDia")) beamItem.factDia = e.target.value;
          else if (e.target.classList.contains("reinf-beam-projStep")) beamItem.projStep = e.target.value;
          else if (e.target.classList.contains("reinf-beam-factStep")) beamItem.factStep = e.target.value;
          else if (e.target.classList.contains("reinf-beam-projCover")) beamItem.projCover = e.target.value;
          else if (e.target.classList.contains("reinf-beam-factCover")) beamItem.factCover = e.target.value;
          reinfSetBeams(reinfBeams);
        }
      });
    });

    const markingInputBeam = beamDiv.querySelector(".reinf-beam-marking");
    if (markingInputBeam) {
      markingInputBeam.addEventListener("blur", (e) => {
        const reinfBeams = reinfGetBeams();
        const beamItem = reinfBeams.find((b) => b.id === beam.id);
        if (beamItem) {
          const newMarking = normalizeMarking(e.target.value);
          if (newMarking && checkReinfBeamDuplicate(newMarking, beam.id)) {
            showNotification("Балка с такой маркировкой уже существует. Введите другую маркировку.", "warning");
            e.target.value = beamItem.marking || "";
            e.target.focus();
            return;
          }
          beamItem.marking = newMarking;
          beamItem.bimAutofilledMark =
            index === 0 &&
            construction?.value === "Балка" &&
            matchesReinfBimMark(beamItem.marking, reinfBimBindingSnapshot?.mark);
          reinfSetBeams(reinfBeams);
          setReinfBimFieldAutofilled(e.target, beamItem.bimAutofilledMark);
        }
      });
    }

    beamDiv.querySelector(`[data-remove="${beam.id}"]`).addEventListener("click", () => {
      removeReinfBeam(beam.id);
    });

    reinfBeamsList.appendChild(beamDiv);
  });
}

// ============================
//  Стены
// ============================
function checkReinfWallDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis, numberAxis1, numberAxis2, excludeId = null) {
  return reinfCheckWallDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis, numberAxis1, numberAxis2, excludeId);
}

function bindReinfWallButton() {
  // Event delegation в initReinfButtons, функция для совместимости.
}

function addReinfWall() {
  if (!construction || !isConstructionProfile(getSelectedConstructionKey() || construction.value, "reinforcement", "wall")) {
    showNotification(`Добавление ${getReinfWallEntityAddText()} доступно только для стеновых конструкций`, "warning");
    return;
  }

  if (!reinfWallsList) {
    console.error("reinfWallsList не найден в DOM");
    showNotification(`Ошибка: контейнер для ${getReinfWallEntityPluralGenitive()} не найден`, "error");
    return;
  }

  const currentWalls = reinfGetWalls();
  const maxWalls = getReinfWallLimit(getReinfConstructionFlags());
  if (currentWalls.length >= maxWalls) {
    showNotification(`Максимальное количество ${getReinfWallEntityPluralGenitive()} - ${maxWalls}`, "warning");
    return;
  }

  reinfAddWall(() => {
    renderReinfWalls();
    saveReinfWallsDraft();
    setTimeout(() => {
      const lastWall = reinfWallsList?.querySelector(".card:last-child");
      if (lastWall) {
        lastWall.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
  }, maxWalls);
}

function removeReinfWall(id) {
  reinfRemoveWall(id, () => {
    renderReinfWalls();
    saveReinfWallsDraft();
  });
}

function saveReinfWallsDraft() {
  const projectId = getCurrentProjectId();
  if (!projectId || !construction || !isConstructionProfile(getSelectedConstructionKey() || construction.value, "reinforcement", "wall")) return;

  const reinfWalls = reinfGetWalls();
  const key = `draft_reinf_walls_${projectId}`;

  if (reinfWalls.length > 0) {
    localStorage.setItem(key, JSON.stringify(reinfWalls));
  } else {
    localStorage.removeItem(key);
  }
}

function loadReinfWallsDraft() {
  const projectId = getCurrentProjectId();
  if (!projectId || !construction || !isConstructionProfile(getSelectedConstructionKey() || construction.value, "reinforcement", "wall")) return;

  const key = `draft_reinf_walls_${projectId}`;
  const draft = localStorage.getItem(key);

  if (draft) {
    try {
      const walls = JSON.parse(draft);
      if (Array.isArray(walls) && walls.length > 0) {
        reinfSetWalls(walls);
        renderReinfWalls();
      }
    } catch (e) {
      console.error("Ошибка загрузки черновика стен:", e);
      localStorage.removeItem(key);
    }
  }
}

function renderReinfWalls() {
  if (!reinfWallsList) return;
  updateReinfWallsLimitUi();
  reinfWallsList.innerHTML = "";

  const reinfWalls = reinfGetWalls();

  if (reinfWalls.length === 0) {
    reinfWallsList.innerHTML = `<div class="caption" style="padding: 8px;">Нет добавленных ${getReinfWallEntityPluralGenitive()}. Нажмите "Добавить ${getReinfWallEntityAddText()}" для начала.</div>`;
    return;
  }

  reinfWalls.forEach((wall, index) => {
    const wallDiv = document.createElement("div");
    wallDiv.className = "card";
    wallDiv.style.marginBottom = "8px";
    wallDiv.style.padding = "12px";

    const bindingTypeSelect = `
      <div style="margin-bottom: 8px;">
        <label><b>Тип привязки:</b></label>
        <select class="reinf-wall-binding-type ui-select" data-id="${safeValue(wall.id)}" style="width: 100%; margin-top: 4px;">
          <option value="number_letters" ${wall.bindingType === "number_letters" ? "selected" : ""}>Одна цифровая + две буквенные (например, 1, В-Г)</option>
          <option value="letter_numbers" ${wall.bindingType === "letter_numbers" ? "selected" : ""}>Одна буквенная + две цифровые (например, Г, 8-9)</option>
        </select>
      </div>
    `;

    let axisFields = "";
    if (wall.bindingType === "number_letters") {
      axisFields = `
        <div class="grid-3" style="margin-bottom: 8px;">
          <div>
            <label>Цифровая ось </label>
            <select class="reinf-wall-number-axis ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              <option value="">-- Выберите --</option>
              ${defaultNumbers.map((n) => `<option value="${n}" ${wall.numberAxis === n ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Буквенная ось 1 </label>
            <select class="reinf-wall-letter-axis1 ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              <option value="">-- Выберите --</option>
              ${defaultRusLetters.map((l) => `<option value="${l}" ${wall.letterAxis1 === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Буквенная ось 2 </label>
            <select class="reinf-wall-letter-axis2 ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              <option value="">-- Выберите --</option>
              ${defaultRusLetters.map((l) => `<option value="${l}" ${wall.letterAxis2 === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
        </div>
      `;
    } else {
      axisFields = `
        <div class="grid-3" style="margin-bottom: 8px;">
          <div>
            <label>Буквенная ось </label>
            <select class="reinf-wall-letter-axis ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              <option value="">-- Выберите --</option>
              ${defaultRusLetters.map((l) => `<option value="${l}" ${wall.letterAxis === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Цифровая ось 1 </label>
            <select class="reinf-wall-number-axis1 ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              <option value="">-- Выберите --</option>
              ${defaultNumbers.map((n) => `<option value="${n}" ${wall.numberAxis1 === n ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
          <div>
            <label>Цифровая ось 2 </label>
            <select class="reinf-wall-number-axis2 ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              <option value="">-- Выберите --</option>
              ${defaultNumbers.map((n) => `<option value="${n}" ${wall.numberAxis2 === n ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
        </div>
      `;
    }

    wallDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <b>${getReinfWallEntityLabel()} ${index + 1}</b>
        <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact" data-remove="${safeValue(wall.id)}">
          <span class="lg-btn__label">Удалить</span>
          <span class="lg-btn__glow" aria-hidden="true"></span>
        </button>
      </div>
      ${bindingTypeSelect}
      ${axisFields}
      <div class="grid-2 mt8">
        <div>
          <label>Проектный диаметр арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-wall-projDia" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.projDia || "")}" />
        </div>
        <div>
          <label>Фактический диаметр арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-wall-factDia" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.factDia || "")}" />
        </div>
        <div>
          <label>Проектный шаг арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-wall-projStep" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.projStep || "")}" />
        </div>
        <div>
          <label>Фактический шаг арматуры</label>
          <input type="number" inputmode="decimal" class="reinf-wall-factStep" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.factStep || "")}" />
        </div>
        <div>
          <label>Проектный защитный слой</label>
          <input type="number" inputmode="decimal" class="reinf-wall-projCover" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.projCover || "")}" />
        </div>
        <div>
          <label>Фактический защитный слой</label>
          <input type="number" inputmode="decimal" class="reinf-wall-factCover" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.factCover || "")}" />
        </div>
      </div>
    `;

    const bindingTypeSelectEl = wallDiv.querySelector(`.reinf-wall-binding-type[data-id="${wall.id}"]`);
    bindingTypeSelectEl.addEventListener("change", (e) => {
      const reinfWalls = reinfGetWalls();
      const wallItem = reinfWalls.find((w) => w.id === wall.id);
      if (wallItem) {
        const oldBindingType = wallItem.bindingType;
        wallItem.bindingType = e.target.value;

        if (wallItem.bindingType === "number_letters") {
          if (wallItem.letterAxis1 && wallItem.letterAxis2 && wallItem.letterAxis1 === wallItem.letterAxis2) {
            wallItem.bindingType = oldBindingType;
            showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
            reinfSetWalls(reinfWalls);
            renderReinfWalls();
            saveReinfWallsDraft();
            return;
          }
        } else {
          if (wallItem.numberAxis1 && wallItem.numberAxis2 && wallItem.numberAxis1 === wallItem.numberAxis2) {
            wallItem.bindingType = oldBindingType;
            showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
            reinfSetWalls(reinfWalls);
            renderReinfWalls();
            saveReinfWallsDraft();
            return;
          }
        }

        if (checkReinfWallDuplicate(
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
          showNotification(`${getReinfWallEntityLabel()} с такими же осями уже существует. Выберите другие оси.`, "warning");
          reinfSetWalls(reinfWalls);
          renderReinfWalls();
          return;
        }

        reinfSetWalls(reinfWalls);
        renderReinfWalls();
        saveReinfWallsDraft();
      }
    });

    wallDiv.querySelectorAll('select[class^="reinf-wall-"]').forEach((select) => {
      if (select.classList.contains("reinf-wall-binding-type")) return;
      select.addEventListener("change", (e) => {
        const reinfWalls = reinfGetWalls();
        const wallItem = reinfWalls.find((w) => w.id === wall.id);
        if (wallItem) {
          const oldNumberAxis = wallItem.numberAxis;
          const oldLetterAxis1 = wallItem.letterAxis1;
          const oldLetterAxis2 = wallItem.letterAxis2;
          const oldLetterAxis = wallItem.letterAxis;
          const oldNumberAxis1 = wallItem.numberAxis1;
          const oldNumberAxis2 = wallItem.numberAxis2;

          if (select.classList.contains("reinf-wall-number-axis")) wallItem.numberAxis = e.target.value;
          if (select.classList.contains("reinf-wall-letter-axis1")) wallItem.letterAxis1 = e.target.value;
          if (select.classList.contains("reinf-wall-letter-axis2")) wallItem.letterAxis2 = e.target.value;
          if (select.classList.contains("reinf-wall-letter-axis")) wallItem.letterAxis = e.target.value;
          if (select.classList.contains("reinf-wall-number-axis1")) wallItem.numberAxis1 = e.target.value;
          if (select.classList.contains("reinf-wall-number-axis2")) wallItem.numberAxis2 = e.target.value;

          if (wallItem.bindingType === "number_letters") {
            if (wallItem.letterAxis1 && wallItem.letterAxis2 && wallItem.letterAxis1 === wallItem.letterAxis2) {
              wallItem.letterAxis1 = oldLetterAxis1;
              wallItem.letterAxis2 = oldLetterAxis2;
              showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
              reinfSetWalls(reinfWalls);
              renderReinfWalls();
              return;
            }
          } else {
            if (wallItem.numberAxis1 && wallItem.numberAxis2 && wallItem.numberAxis1 === wallItem.numberAxis2) {
              wallItem.numberAxis1 = oldNumberAxis1;
              wallItem.numberAxis2 = oldNumberAxis2;
              showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
              reinfSetWalls(reinfWalls);
              renderReinfWalls();
              return;
            }
          }

          if (checkReinfWallDuplicate(
            wallItem.bindingType,
            wallItem.numberAxis,
            wallItem.letterAxis1,
            wallItem.letterAxis2,
            wallItem.letterAxis,
            wallItem.numberAxis1,
            wallItem.numberAxis2,
            wallItem.id
          )) {
            wallItem.numberAxis = oldNumberAxis;
            wallItem.letterAxis1 = oldLetterAxis1;
            wallItem.letterAxis2 = oldLetterAxis2;
            wallItem.letterAxis = oldLetterAxis;
            wallItem.numberAxis1 = oldNumberAxis1;
            wallItem.numberAxis2 = oldNumberAxis2;
            showNotification(`${getReinfWallEntityLabel()} с такими же осями уже существует. Выберите другие оси.`, "warning");
            reinfSetWalls(reinfWalls);
            renderReinfWalls();
            saveReinfWallsDraft();
            return;
          }

          reinfSetWalls(reinfWalls);
          renderReinfWalls();
          saveReinfWallsDraft();
        }
      });
    });

    wallDiv.querySelectorAll('input[type="number"]').forEach((input) => {
      input.addEventListener("input", (e) => {
        const reinfWalls = reinfGetWalls();
        const wallItem = reinfWalls.find((w) => w.id === wall.id);
        if (wallItem) {
          if (e.target.classList.contains("reinf-wall-projDia")) wallItem.projDia = e.target.value;
          else if (e.target.classList.contains("reinf-wall-factDia")) wallItem.factDia = e.target.value;
          else if (e.target.classList.contains("reinf-wall-projStep")) wallItem.projStep = e.target.value;
          else if (e.target.classList.contains("reinf-wall-factStep")) wallItem.factStep = e.target.value;
          else if (e.target.classList.contains("reinf-wall-projCover")) wallItem.projCover = e.target.value;
          else if (e.target.classList.contains("reinf-wall-factCover")) wallItem.factCover = e.target.value;
          reinfSetWalls(reinfWalls);
          saveReinfWallsDraft();
        }
      });
    });

    wallDiv.querySelector(`[data-remove="${wall.id}"]`).addEventListener("click", () => {
      removeReinfWall(wall.id);
    });

    reinfWallsList.appendChild(wallDiv);
  });
}

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
    const snap = await getProjectCollectionSnapshot(projectId, "elements");
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

// ============================
//  Сохранённые проверки армирования
// ============================
function saveReinfChecks() {
  const payload = Array.from(reinfChecks.entries());
  const key = moduleStorageKey(getStorageKey());
  const projectId = getCurrentProjectId();
  console.log("[saveReinfChecks] Сохранение проверок армирования, ключ:", key, "currentProjectId:", projectId, "количество:", payload.length);
  localStorage.setItem(key, JSON.stringify(payload));
}

async function loadReinfChecks() {
  reinfChecks.clear();
  const projectId = getCurrentProjectId();
  console.log("[loadReinfChecks] Загрузка проверок армирования, currentProjectId:", projectId);

  await loadReinfBimElements(projectId);

  if (!projectId) {
    console.log("[loadReinfChecks] currentProjectId отсутствует, пропускаем загрузку");
    return;
  }

  try {
    const snap = await getProjectCollectionSnapshot(projectId, "reinfChecks");
    console.log("[loadReinfChecks] Загружено из Firestore проверок:", snap.size);
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;
      if (data.createdAt && data.createdAt.toMillis) {
        data.createdAt = data.createdAt.toMillis();
      }
      reinfChecks.set(id, { ...data, id });
    });

    saveReinfChecks();
  } catch (e) {
    console.error("[loadReinfChecks] Ошибка загрузки из Firestore:", e);
    const key = moduleStorageKey(getStorageKey());
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        console.log("[loadReinfChecks] Загружено из localStorage проверок:", arr.length);
        arr.forEach(([id, data]) => reinfChecks.set(id, data));
      } catch (parseErr) {
        console.warn("[loadReinfChecks] Ошибка парсинга localStorage:", parseErr);
      }
    }
  }
}

function renderReinfChecks() {
  const list = document.getElementById("reinfChecksList");
  if (!list) return;
  list.innerHTML = "";

  if (!reinfChecks.size) {
    list.innerHTML =
      '<div class="caption" style="padding:10px">Пока нет сохранённых проверок. Заполните форму и нажмите «Сохранить проверку».</div>';
    return;
  }

  const items = Array.from(reinfChecks.entries()).sort(
    (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)
  );

  items.forEach(([id, d]) => {
    const row = document.createElement("div");
    row.className = "node node-enhanced";
    let locationInfo = "";
    let metaInfo = "";
    let icon = "🔧";

    let evaluation;
    if (d.status && d.status !== "empty" && d.status !== "ok" && d.status !== "exceeded") {
      evaluation = evaluateReinfCheck(d);
    } else if (d.status) {
      evaluation = { status: d.status, summaryText: d.summaryText || "" };
    } else {
      evaluation = evaluateReinfCheck(d);
    }

    if (!evaluation) {
      evaluation = { status: "empty", summaryText: "не заполнено" };
    }

    const status = evaluation.status || d.status || "empty";
    const constructionProfile = getReinfConstructionProfile(d.construction || d.constructionType || "");

    if (constructionProfile === "column") {
      icon = "🏛️";
      const count = d.columns ? d.columns.length : 0;
      const markings = d.columns ? d.columns.map((c: ReinforcementLinearRecord) => safeValue(c.marking)).filter((m) => m).join(", ") : "";
      locationInfo = `<div class="node-data-row"><span class="node-label">Колонн:</span><span class="node-values"><strong>${count} шт.</strong>${markings ? ` (${markings})` : ""}</span></div>`;
      if (d.floor) {
        locationInfo += `<div class="node-data-row"><span class="node-label">Этаж:</span><span class="node-values">${safeValue(d.floor)}</span></div>`;
      }
    } else if (constructionProfile === "beam") {
      icon = "📏";
      const count = d.beams ? d.beams.length : 0;
      const markings = d.beams ? d.beams.map((b: ReinforcementLinearRecord) => safeValue(b.marking)).filter((m) => m).join(", ") : "";
      locationInfo = `<div class="node-data-row"><span class="node-label">Балок:</span><span class="node-values"><strong>${count} шт.</strong>${markings ? ` (${markings})` : ""}</span></div>`;
      if (d.floor) {
        locationInfo += `<div class="node-data-row"><span class="node-label">Этаж:</span><span class="node-values">${safeValue(d.floor)}</span></div>`;
      }
    } else if ((constructionProfile === "plate" || constructionProfile === "stair") && d.location) {
      icon = constructionProfile === "plate" ? "📐" : "🪜";
      const stairNamePart = constructionProfile === "stair" && d.stairName ? `${safeValue(d.stairName)}, ` : "";
      const floorPart = d.floor ? `Этаж ${safeValue(d.floor)}, ` : "";
      locationInfo = `<div class="node-data-row"><span class="node-label">Местоположение:</span><span class="node-values">${stairNamePart}${floorPart}${safeValue(d.location)}</span></div>`;
    } else if (constructionProfile === "wall") {
      icon = "🧱";
      const count = d.walls ? d.walls.length : 0;

      let wallsInfo = "";
      if (d.walls && d.walls.length > 0) {
        const axes = d.walls.map((w: ReinforcementLinearRecord) => {
          if (w.bindingType === "number_letters") {
            return `${safeValue(w.numberAxis || "?")}, ${safeValue(w.letterAxis1 || "?")}-${safeValue(w.letterAxis2 || "?")}`;
          }
          return `${safeValue(w.letterAxis || "?")}, ${safeValue(w.numberAxis1 || "?")}-${safeValue(w.numberAxis2 || "?")}`;
        });

        if (axes.length <= 2) {
          wallsInfo = axes.join(", ");
        } else {
          wallsInfo = axes.slice(0, 2).join(", ") + ` +${axes.length - 2}…`;
        }
      }

      const wallCountLabelRaw = getConstructionEntityLabels(
        d.construction || d.constructionType || "",
        "reinforcement",
        d.constructionSubtype || ""
      ).pluralGenitive;
      const wallCountLabel = wallCountLabelRaw.charAt(0).toLocaleUpperCase("ru") + wallCountLabelRaw.slice(1);
      locationInfo = `<div class="node-data-row"><span class="node-label">${wallCountLabel}:</span><span class="node-values"><strong>${count} шт.</strong>${wallsInfo ? ` (${wallsInfo})` : ""}</span></div>`;
      if (d.floor) {
        locationInfo += `<div class="node-data-row"><span class="node-label">Этаж:</span><span class="node-values">${safeValue(d.floor)}</span></div>`;
      }

      if (status === "exceeded" && d.walls && d.walls.length > 0) {
        const TOL_STEP = TOLERANCES.STEP;
        const TOL_COVER = TOLERANCES.COVER;
        const problems = [];
        let diaCount = 0;
        let stepCount = 0;
        let coverCount = 0;

        d.walls.forEach((w: ReinforcementLinearRecord) => {
          const projDiaV = parseDecimal(w.projDia);
          const factDiaV = parseDecimal(w.factDia);
          if (projDiaV != null && factDiaV != null) {
            const dev = Math.abs(factDiaV - projDiaV);
            if (dev !== 0) diaCount++;
          }

          const projStepV = parseDecimal(w.projStep);
          const factStepV = parseDecimal(w.factStep);
          if (projStepV != null && factStepV != null) {
            const dev = Math.abs(factStepV - projStepV);
            if (dev > TOL_STEP) stepCount++;
          }

          const projCoverV = parseDecimal(w.projCover);
          const factCoverV = parseDecimal(w.factCover);
          if (projCoverV != null && factCoverV != null) {
            const dev = Math.abs(factCoverV - projCoverV);
            if (dev > TOL_COVER) coverCount++;
          }
        });

        if (diaCount > 0) problems.push(`диаметр(${diaCount})`);
        if (stepCount > 0) problems.push(`шаг(${stepCount})`);
        if (coverCount > 0) problems.push(`слой(${coverCount})`);

        if (problems.length > 0) {
          locationInfo += `<div class="node-data-row"><span class="node-label">Проблемы:</span><span class="node-values" style="color: #ef4444;">${problems.join(", ")}</span></div>`;
        }
      }
    }

    if (constructionProfile !== "column" && constructionProfile !== "beam" && constructionProfile !== "wall") {
      metaInfo = `<div class="node-data-row"><span class="node-label">Параметры:</span><span class="node-values">Ø ${formatNodeValue(d.projDia)}/${formatNodeValue(d.factDia)} мм, шаг ${formatNodeValue(d.projStep)}/${formatNodeValue(d.factStep)} мм, слой ${formatNodeValue(d.projCover)}/${formatNodeValue(d.factCover)} мм</span></div>`;
    }

    let statusTag = "";
    if (status === "exceeded") {
      statusTag = '<span class="tag bad">превышено</span>';
    } else if (status === "ok") {
      statusTag = '<span class="tag ok">в норме</span>';
    } else {
      statusTag = '<span class="tag" style="background: #9ca3af; color: #1f2937; font-weight: 600;">не заполнено</span>';
    }

    row.innerHTML = `
      <div class="node-content">
        <div class="node-header">
          <div class="node-title">
            <span class="node-icon">${icon}</span>
            Проверка от ${fmtDate(d.createdAt || Date.now())}
          </div>
          <div class="node-header-controls">
            ${statusTag}
            ${buildNodeDeleteIconButton("Удалить проверку")}
          </div>
        </div>
        <div class="node-data">
          ${metaInfo}
          ${locationInfo}
        </div>
      </div>
    `;
    setupNodeCardInteractions(row, {
      onOpen: () => loadReinfCheck(id),
      onDelete: async () => {
        if (await showConfirm("Удалить эту проверку?")) {
          if (getCurrentReinfCheckId() === id) setCurrentReinfCheckId(null);
          reinfChecks.delete(id);
          saveReinfChecks();
          renderReinfChecks();
          updateSummary();
        }
      }
    });
    list.appendChild(row);
  });
}

function loadReinfCheck(id) {
  const d = reinfChecks.get(id);
  if (!d) return;
  setCurrentReinfCheckId(id);

    if (window.setConstructionAndTrigger) {
      window.setConstructionAndTrigger(d.construction || d.constructionType || "", d.constructionSubtype || "", d.constructionPileElement || "");
  } else if (construction && d.constructionType) {
    construction.value = d.constructionType;
  }
  updateReinfLocationFieldsVisibility();

  const flags = getReinfConstructionFlags(d.construction || d.constructionType || "");

  if (flags.isPlate || flags.isStair) {
    if (reinfFloorEl) reinfFloorEl.value = d.floor || "";
    if (reinfStairNameEl) reinfStairNameEl.value = d.stairName || "";
    if (reinfStripAxisModeEl && d.axisMode) {
      reinfStripAxisModeEl.value = d.axisMode === "number_letters" ? "number_letters" : "letter_numbers";
    }
    if (reinfAxisLetterFromEl && d.axisLetterFrom) reinfAxisLetterFromEl.value = d.axisLetterFrom;
    if (reinfAxisLetterToEl && d.axisLetterTo) reinfAxisLetterToEl.value = d.axisLetterTo;
    if (reinfAxisNumberFromEl && d.axisNumberFrom) reinfAxisNumberFromEl.value = String(d.axisNumberFrom);
    if (reinfAxisNumberToEl && d.axisNumberTo) reinfAxisNumberToEl.value = String(d.axisNumberTo);
    if (reinfLocationEl) reinfLocationEl.value = d.location || "";
    updateReinfLocation();
  } else if (flags.isWall) {
    if (reinfWallFloorEl) reinfWallFloorEl.value = d.floor || "";
    reinfSetWalls((d.walls || []).map((wall: ReinforcementLinearRecord, idx) => ({
      id: Date.now() + idx,
      bindingType: wall.bindingType || "number_letters",
      numberAxis: wall.numberAxis?.toString() || "",
      letterAxis1: wall.letterAxis1?.toString() || "",
      letterAxis2: wall.letterAxis2?.toString() || "",
      letterAxis: wall.letterAxis?.toString() || "",
      numberAxis1: wall.numberAxis1?.toString() || "",
      numberAxis2: wall.numberAxis2?.toString() || "",
      projDia: wall.projDia?.toString() || "",
      factDia: wall.factDia?.toString() || "",
      projStep: wall.projStep?.toString() || "",
      factStep: wall.factStep?.toString() || "",
      projCover: wall.projCover?.toString() || "",
      factCover: wall.factCover?.toString() || ""
    })));
    renderReinfWalls();
    if (reinfFloorEl) reinfFloorEl.value = "";
    if (reinfStairNameEl) reinfStairNameEl.value = "";
    if (reinfLocationEl) reinfLocationEl.value = "";
  } else {
    if (reinfFloorEl) reinfFloorEl.value = "";
    if (reinfStairNameEl) reinfStairNameEl.value = "";
    if (reinfLocationEl) reinfLocationEl.value = "";
  }

  if (flags.isColumn) {
    if (reinfColumnFloorEl) reinfColumnFloorEl.value = d.floor || "";
    if (d.columns && Array.isArray(d.columns)) {
      reinfSetColumns(d.columns.map((col: ReinforcementLinearRecord, idx) => ({
        id: Date.now() + idx,
        marking: normalizeMarking(col.marking) || "",
        projDia: col.projDia != null ? String(col.projDia) : "",
        factDia: col.factDia != null ? String(col.factDia) : "",
        projStep: col.projStep != null ? String(col.projStep) : "",
        factStep: col.factStep != null ? String(col.factStep) : "",
        projCover: col.projCover != null ? String(col.projCover) : "",
        factCover: col.factCover != null ? String(col.factCover) : "",
        projHoopsStep: col.projHoopsStep != null ? String(col.projHoopsStep) : "",
        factHoopsStep: col.factHoopsStep != null ? String(col.factHoopsStep) : "",
        bimAutofilledMark: false
      })));
      renderReinfColumns();
    } else {
      reinfClearByType("Колонна");
      renderReinfColumns();
    }
  } else {
    reinfClearByType("Колонна");
    renderReinfColumns();
  }

  if (flags.isBeam) {
    if (reinfBeamFloorEl) reinfBeamFloorEl.value = d.floor || "";
    if (d.beams && Array.isArray(d.beams)) {
      reinfSetBeams(d.beams.map((beam: ReinforcementLinearRecord, idx) => ({
        id: Date.now() + idx,
        marking: normalizeMarking(beam.marking) || "",
        projDia: beam.projDia != null ? String(beam.projDia) : "",
        factDia: beam.factDia != null ? String(beam.factDia) : "",
        projStep: beam.projStep != null ? String(beam.projStep) : "",
        factStep: beam.factStep != null ? String(beam.factStep) : "",
        projCover: beam.projCover != null ? String(beam.projCover) : "",
        factCover: beam.factCover != null ? String(beam.factCover) : "",
        bimAutofilledMark: false
      })));
      renderReinfBeams();
    } else {
      reinfClearByType("Балка");
      renderReinfBeams();
    }
  } else {
    if (reinfBeamFloorEl) reinfBeamFloorEl.value = "";
    reinfClearByType("Балка");
    renderReinfBeams();
  }

  if (projDia) projDia.value = String(d.projDia ?? "");
  if (factDia) factDia.value = String(d.factDia ?? "");
  if (projStep) projStep.value = String(d.projStep ?? "");
  if (factStep) factStep.value = String(d.factStep ?? "");
  if (projCover) projCover.value = String(d.projCover ?? "");
  if (factCover) factCover.value = String(d.factCover ?? "");
  if (reinfProjHoopsStepEl) reinfProjHoopsStepEl.value = String(d.projHoopsStep ?? "");
  if (reinfFactHoopsStepEl) reinfFactHoopsStepEl.value = String(d.factHoopsStep ?? "");

  if (reinfResult) {
    reinfResult.className = "result";
    if (d.status === "ok") reinfResult.classList.add("ok");
    if (d.status === "bad" || d.status === "exceeded") reinfResult.classList.add("not-ok");
    reinfResult.innerHTML = sanitizeHtml(d.lastMsg || "");
  }

  syncReinfBimSelectionFromCheck(d);
}

async function saveReinfCheck({ skipJournalOnce = false } = {}) {
  const projectId = getCurrentProjectId();
  if (!validateProject(projectId)) return;
  console.log("[btnSaveReinfCheck] currentProjectId:", projectId);

  if (!construction) return;
  const flags = getReinfConstructionFlags();

  if (flags.isUnsupported) {
    setReinfUnsupportedState({ notify: true });
    return;
  }

  const isPlateOrStair = flags.isPlate || flags.isStair;
  const usesAxisLocation = isPlateOrStair && !isBoredPileFoundation();
  const isColumn = flags.isColumn;
  const isBeam = flags.isBeam;
  const isWall = flags.isWall;

  let floorElToCheck = null;
  if (usesAxisLocation) {
    floorElToCheck = reinfFloorEl;
  } else if (isColumn) {
    floorElToCheck = reinfColumnFloorEl;
  } else if (isBeam) {
    floorElToCheck = reinfBeamFloorEl;
  } else if (isWall) {
    floorElToCheck = reinfWallFloorEl;
  }

    const behavior = flags.behavior;
    if (behavior.floorRequired !== false && !validateRequiredField(floorElToCheck, "Этаж")) return;
    const floor = behavior.floorVisible === false ? "" : (floorElToCheck?.value.trim() || "");

  const currentId = getCurrentReinfCheckId();
  const existingById = currentId && reinfChecks.has(currentId) ? reinfChecks.get(currentId) : null;
  const normalizeLocationField = (value) => String(value ?? "").trim();
  const samePlateOrStairLocation = !usesAxisLocation || !existingById || (
    normalizeLocationField(existingById.floor) === normalizeLocationField(reinfFloorEl?.value) &&
    normalizeLocationField(existingById.axisLetterFrom) === normalizeLocationField(reinfAxisLetterFromEl?.value) &&
    normalizeLocationField(existingById.axisLetterTo) === normalizeLocationField(reinfAxisLetterToEl?.value) &&
    normalizeLocationField(existingById.axisNumberFrom) === normalizeLocationField(reinfAxisNumberFromEl?.value) &&
    normalizeLocationField(existingById.axisNumberTo) === normalizeLocationField(reinfAxisNumberToEl?.value) &&
    normalizeLocationField(existingById.location) === normalizeLocationField(reinfLocationEl?.value) &&
    normalizeLocationField(existingById.stairName) === normalizeLocationField(flags.isStair ? reinfStairNameEl?.value : null)
  );
  const existing = existingById && samePlateOrStairLocation ? existingById : null;
  const id = existing ? currentId : `chk_${Date.now()}`;

  const data: ReinforcementCheckRecord = {
    createdAt: Date.now(),
    construction: getSelectedConstructionKey(),
    constructionCategory: getSelectedConstructionCategory(),
    constructionLabel: getSelectedConstructionLabel(),
    constructionType: construction.value || "",
    constructionSubtype: construction?.dataset?.subtypeKey || "",
    constructionSubtypeLabel: construction?.dataset?.subtypeLabel || "",
    constructionPileElement: isBoredPileFoundation() ? getSelectedPileElement() : "",
    constructionPileElementLabel: isBoredPileFoundation() ? (getSelectedPileElement() === "grillage" ? "Ростверк" : "Свая") : "",
    ...collectReinfBimCheckData(),
    stairName: flags.isStair ? (reinfStairNameEl?.value.trim() || null) : null,
    floor: behavior.floorVisible === false
      ? null
      : (usesAxisLocation
      ? (reinfFloorEl?.value.trim() || null)
      : (isColumn
        ? (reinfColumnFloorEl?.value.trim() || null)
        : (isBeam
          ? (reinfBeamFloorEl?.value.trim() || null)
          : (isWall
            ? (reinfWallFloorEl?.value.trim() || null)
            : null)))),
    axisMode: behavior.locationMode === "strip_foundation" && usesAxisLocation ? (reinfStripAxisModeEl?.value || "letter_numbers") : null,
    axisLetterFrom: usesAxisLocation ? (reinfAxisLetterFromEl?.value || null) : null,
    axisLetterTo: usesAxisLocation ? (behavior.locationMode === "strip_foundation" && reinfStripAxisModeEl?.value === "number_letters" ? null : (reinfAxisLetterToEl?.value || null)) : null,
    axisNumberFrom: usesAxisLocation ? (reinfAxisNumberFromEl?.value || null) : null,
    axisNumberTo: usesAxisLocation ? (behavior.locationMode === "strip_foundation" && (reinfStripAxisModeEl?.value || "letter_numbers") === "letter_numbers" ? null : (reinfAxisNumberToEl?.value || null)) : null,
    location: usesAxisLocation ? (reinfLocationEl?.value || null) : null,
    columns: isColumn ? reinfGetColumns().map((c) => ({
      marking: c.marking || "",
      projDia: c.projDia === "" ? null : +c.projDia,
      factDia: c.factDia === "" ? null : +c.factDia,
      projStep: c.projStep === "" ? null : +c.projStep,
      factStep: c.factStep === "" ? null : +c.factStep,
      projCover: c.projCover === "" ? null : +c.projCover,
      factCover: c.factCover === "" ? null : +c.factCover,
      projHoopsStep: c.projHoopsStep === "" ? null : +c.projHoopsStep,
      factHoopsStep: c.factHoopsStep === "" ? null : +c.factHoopsStep
    })) : null,
    beams: isBeam ? reinfGetBeams().map((b) => ({
      marking: b.marking || "",
      projDia: b.projDia === "" ? null : +b.projDia,
      factDia: b.factDia === "" ? null : +b.factDia,
      projStep: b.projStep === "" ? null : +b.projStep,
      factStep: b.factStep === "" ? null : +b.factStep,
      projCover: b.projCover === "" ? null : +b.projCover,
      factCover: b.factCover === "" ? null : +b.factCover
    })) : null,
    walls: isWall ? reinfGetWalls().map((w) => ({
      bindingType: w.bindingType || "number_letters",
      numberAxis: w.numberAxis || "",
      letterAxis1: w.letterAxis1 || "",
      letterAxis2: w.letterAxis2 || "",
      letterAxis: w.letterAxis || "",
      numberAxis1: w.numberAxis1 || "",
      numberAxis2: w.numberAxis2 || "",
      projDia: w.projDia === "" ? null : +w.projDia,
      factDia: w.factDia === "" ? null : +w.factDia,
      projStep: w.projStep === "" ? null : +w.projStep,
      factStep: w.factStep === "" ? null : +w.factStep,
      projCover: w.projCover === "" ? null : +w.projCover,
      factCover: w.factCover === "" ? null : +w.factCover
    })) : null,
    projDia: !isColumn && !isBeam && !isWall ? (projDia?.value === "" ? null : +projDia.value) : null,
    factDia: !isColumn && !isBeam && !isWall ? (factDia?.value === "" ? null : +factDia.value) : null,
    projStep: !isColumn && !isBeam && !isWall && (!isBoredPileFoundation() || getSelectedPileElement() === "grillage") ? (projStep?.value === "" ? null : +projStep.value) : null,
    factStep: !isColumn && !isBeam && !isWall && (!isBoredPileFoundation() || getSelectedPileElement() === "grillage") ? (factStep?.value === "" ? null : +factStep.value) : null,
    projCover: !isColumn && !isBeam && !isWall ? (projCover?.value === "" ? null : +projCover.value) : null,
    factCover: !isColumn && !isBeam && !isWall ? (factCover?.value === "" ? null : +factCover.value) : null,
    projHoopsStep: behavior.showReinforcementHoopsStep ? (reinfProjHoopsStepEl?.value === "" ? null : +(reinfProjHoopsStepEl?.value || 0)) : null,
    factHoopsStep: behavior.showReinforcementHoopsStep ? (reinfFactHoopsStepEl?.value === "" ? null : +(reinfFactHoopsStepEl?.value || 0)) : null
  };

  const evaluation = evaluateReinfCheck(data);
  data.status = evaluation.status === "empty" ? "empty" : (evaluation.status === "ok" ? "ok" : "exceeded");
  data.summaryText = evaluation.summaryText;
  data.lastMsg = reinfResult?.innerHTML || "";

  console.log("[btnSaveReinfCheck] Данные проверки:", {
    id,
    status: data.status,
    evaluationStatus: evaluation.status,
    construction: data.construction,
    hasColumns: !!data.columns,
    hasBeams: !!data.beams,
    hasWalls: !!data.walls,
    projDia: data.projDia,
    factDia: data.factDia
  });

  data.projectId = projectId;
  data.module = "reinforcement";
  const createdAtClient = existing?.createdAt || Date.now();
  data.createdAt = createdAtClient;

  reinfChecks.set(id, data);
  saveReinfChecks();
  renderReinfChecks();

  console.log("[btnSaveReinfCheck] После сохранения в Map, reinfChecks.size:", reinfChecks.size);

  const skipJournal = skipJournalOnce || skipReinfJournalOnce;
  skipReinfJournalOnce = false;

  try {
    let finalId = id;
    if (existing) {
      const { ref: docRef } = await updateProjectCollectionDoc(projectId, "reinfChecks", id, data);
      notifyFirestoreSyncStatusSafe(docRef);
      console.log("[btnSaveReinfCheck] Проверка обновлена в Firestore, docId:", finalId);
    } else {
      const created = await createProjectCollectionDoc(projectId, "reinfChecks", data);
      const docRef = created.ref;
      notifyFirestoreSyncStatusSafe(docRef);
      finalId = created.id;
      console.log("[btnSaveReinfCheck] Проверка сохранена в Firestore, docId:", finalId, "localId:", id);

      if (finalId !== id) {
        reinfChecks.delete(id);
        reinfChecks.set(finalId, { ...data, id: finalId });
        saveReinfChecks();
        renderReinfChecks();
      }
    }

    setCurrentReinfCheckId(finalId);

    try {
      const projectSnap = await getProjectDocSnapshot(projectId);
      const projectData = projectSnap.exists() ? projectSnap.data() || {} : {};
      const authUid = String(auth.currentUser?.uid || "").trim();
      const ownerUid = String(projectData.ownerUid || projectData.createdBy || authUid || "").trim();
      const createdBy = String(projectData.createdBy || projectData.ownerUid || authUid || "").trim();
      const contractorName = String(projectData.contractorName || "").trim();

      const inspectionPayload: InspectionPayload = {
        projectId,
        module: "Армирование",
        moduleKey: "reinforcement",
        sourceCollection: "reinfChecks",
        sourceId: finalId,
        sourceDocId: finalId,
        construction: data.construction || getSelectedConstructionKey(),
        constructionCategory: data.constructionCategory || getSelectedConstructionCategory(),
        constructionLabel: data.constructionLabel || getSelectedConstructionLabel(),
        constructionType: data.constructionType || construction?.value || "",
        constructionSubtype: data.constructionSubtype || construction?.dataset?.subtypeKey || "",
        constructionSubtypeLabel: data.constructionSubtypeLabel || construction?.dataset?.subtypeLabel || "",
        checkStatus: data.status || null,
        summaryText: data.summaryText || "",
        createdAt: data.createdAt || Date.now(),
        updatedAt: Date.now(),
        contractorName
      };
      if (ownerUid) inspectionPayload.ownerUid = ownerUid;
      if (createdBy) inspectionPayload.createdBy = createdBy;

      await saveInspectionAndRefreshAnalytics(
        projectId,
        finalId,
        inspectionPayload,
        { merge: true }
      );
    } catch (dualWriteError) {
      console.warn("[DualWrite][reinforcement] inspections upsert failed:", dualWriteError);
    }

    if (!skipJournal && data.status !== "empty") {
      const contextParts = [];
      if (floor) contextParts.push(`Этаж ${floor}`);
      if (data.stairName) contextParts.push(data.stairName);
      if (data.location) contextParts.push(data.location);
      const context = contextParts.join(", ") || "Армирование";

      const detailsParts = [];
      if (data.columns) {
        data.columns.forEach((c) => {
          if (c.projDia != null && c.factDia != null && Math.abs(Number(c.factDia) - Number(c.projDia)) > 0) detailsParts.push(`Диаметр: ${c.projDia}→${c.factDia}`);
          if (c.projStep != null && c.factStep != null && Math.abs(Number(c.factStep) - Number(c.projStep)) > 5) detailsParts.push(`Шаг: ${c.projStep}→${c.factStep}`);
        });
      } else {
        if (data.projDia && data.factDia) detailsParts.push(`Диаметр: ${data.projDia}→${data.factDia}`);
        if (data.projStep && data.factStep) detailsParts.push(`Шаг: ${data.projStep}→${data.factStep}`);
      }

      await upsertJournalEntrySafe({
        module: "Армирование",
        status: data.status === "ok" ? "ok" : "exceeded",
        context: context,
        details: detailsParts.join("; ") || evaluation.summaryText || "Проверка армирования",
        sourceId: finalId,
        construction: data.construction || getSelectedConstructionKey()
      });
    }
  } catch (err) {
    console.error("[btnSaveReinfCheck] Ошибка сохранения в Firestore:", err);
    showNotification("Ошибка сохранения в Firestore.", "error");
  }

  updateSummary();
}

function clearReinfForm() {
  setCurrentReinfCheckId(null);
  if (reinfStairNameEl) reinfStairNameEl.value = "";
  if (reinfFloorEl) reinfFloorEl.value = "";
  if (reinfLocationEl) reinfLocationEl.value = "";
  if (reinfColumnFloorEl) reinfColumnFloorEl.value = "";
  if (reinfBeamFloorEl) reinfBeamFloorEl.value = "";
  if (reinfWallFloorEl) reinfWallFloorEl.value = "";
  [projDia, factDia, projStep, factStep, projCover, factCover].forEach((el) => {
    if (el) el.value = "";
  });
  reinfSetColumns([]);
  reinfSetBeams([]);
  reinfClearByType("Стена");
  clearReinfBimSelection({ keepManualFields: false });

  const projectId = getCurrentProjectId();
  if (projectId && construction?.value === "Стена") {
    const key = `draft_reinf_walls_${projectId}`;
    localStorage.removeItem(key);
  }

  renderReinfColumns();
  renderReinfBeams();
  renderReinfWalls();
  if (reinfResult) {
    reinfResult.className = "result";
    reinfResult.innerHTML = "";
  }

  const state = getState();
  const checked = getChecked();
  state.reinforcement = false;
  checked.reinforcement = false;
  updateReinfLocation();
}

async function clearReinfInspectionDualWrite(projectId) {
  return clearInspectionsByModuleAndRefreshAnalytics(projectId, {
    sourceCollection: "reinfChecks",
    moduleKey: "reinforcement"
  });
}

async function clearReinfChecks() {
  if (!(await showConfirm("Удалить все сохранённые проверки армирования для текущего проекта?"))) return;
  const projectId = getCurrentProjectId();
  if (!projectId) {
    showNotification("Сначала создайте объект или выберите существующий.", "warning");
    return;
  }

  console.log("[btnClearReinfChecks] Очистка проверок армирования");
  console.log("[btnClearReinfChecks] projectId:", projectId);
  console.log("[btnClearReinfChecks] Путь Firestore: projects/" + projectId + "/reinfChecks");

  try {
    const deletedCount = await clearProjectCollection(projectId, "reinfChecks");
    const deletedDualWriteCount = await clearReinfInspectionDualWrite(projectId);
    console.log("[btnClearReinfChecks] Найдено документов в Firestore:", deletedCount);
    console.log("[btnClearReinfChecks] Удалено документов из Firestore:", deletedCount);
    console.log("[btnClearReinfChecks] Удалено документов dual-write из inspections:", deletedDualWriteCount);

    reinfChecks.clear();
    setCurrentReinfCheckId(null);

    saveReinfChecks();
    renderReinfChecks();
    updateSummary();

    const state = getState();
    const checked = getChecked();
    if (state.reinforcement) {
      state.reinforcement = false;
      checked.reinforcement = false;
    }

    showNotification("Сохранённые проверки армирования удалены.", "success");
  } catch (e) {
    console.error("[btnClearReinfChecks] Ошибка удаления из Firestore:", e);
    showNotification("Ошибка удаления проверок: " + e.message, "error");
  }
}

/**
 * Чистая функция для вычисления статуса проверки армирования
 * @param {Object} checkData - Данные проверки армирования
 * @returns {Object} - { status: "ok"|"exceeded"|"empty", summaryText: string }
 */
function evaluateReinfCheck(checkData: ReinforcementCheckRecord) {
  const registryConstruction = checkData.construction || checkData.constructionType || checkData.checkKind || "";
  const registrySubtype = checkData.constructionSubtype || "";
  const TOL_STEP = getInspectionToleranceValue(
    registryConstruction,
    "reinforcement",
    "rebarStep",
    TOLERANCES.STEP,
    registrySubtype
  );
  const TOL_COVER = getInspectionToleranceValue(
    registryConstruction,
    "reinforcement",
    "rebarCover",
    TOLERANCES.COVER,
    registrySubtype
  );

  let hasAnyData = false;
  let allOk = true;
  let hasRequiredData = false;

  if (checkData.columns || checkData.beams || checkData.walls) {
    const items = checkData.columns || checkData.beams || checkData.walls;

    for (const item of items) {
      const projDiaV = parseDecimal(item.projDia);
      const factDiaV = parseDecimal(item.factDia);
      if (projDiaV != null && factDiaV != null) {
        hasAnyData = true;
        hasRequiredData = true;
        const dev = Math.abs(factDiaV - projDiaV);
        if (dev !== 0) allOk = false;
      } else if (projDiaV != null || factDiaV != null) {
        hasAnyData = true;
      }

      const projStepV = parseDecimal(item.projStep);
      const factStepV = parseDecimal(item.factStep);
      if (projStepV != null && factStepV != null) {
        hasAnyData = true;
        hasRequiredData = true;
        const dev = Math.abs(factStepV - projStepV);
        if (dev > TOL_STEP) allOk = false;
      } else if (projStepV != null || factStepV != null) {
        hasAnyData = true;
      }

      const projCoverV = parseDecimal(item.projCover);
      const factCoverV = parseDecimal(item.factCover);
      if (projCoverV != null && factCoverV != null) {
        hasAnyData = true;
        hasRequiredData = true;
        const dev = Math.abs(factCoverV - projCoverV);
        if (dev > TOL_COVER) allOk = false;
      } else if (projCoverV != null || factCoverV != null) {
        hasAnyData = true;
      }

      if (checkData.columns && item.projHoopsStep != null && item.factHoopsStep != null) {
        const TOL_HOOPS_STEP = getInspectionToleranceValue(
          registryConstruction,
          "reinforcement",
          "hoopsStep",
          TOLERANCES.HOOPS_STEP,
          registrySubtype
        );
        const projHoopsStepV = parseDecimal(item.projHoopsStep);
        const factHoopsStepV = parseDecimal(item.factHoopsStep);
        if (projHoopsStepV != null && factHoopsStepV != null) {
          hasAnyData = true;
          hasRequiredData = true;
          const dev = Math.abs(factHoopsStepV - projHoopsStepV);
          if (dev > TOL_HOOPS_STEP) allOk = false;
        } else if (projHoopsStepV != null || factHoopsStepV != null) {
          hasAnyData = true;
        }
      }
    }
  } else {
    const projDiaV = parseDecimal(checkData.projDia);
    const factDiaV = parseDecimal(checkData.factDia);
    const projStepV = parseDecimal(checkData.projStep);
    const factStepV = parseDecimal(checkData.factStep);
    const projCoverV = parseDecimal(checkData.projCover);
    const factCoverV = parseDecimal(checkData.factCover);
    const projHoopsStepV = parseDecimal(checkData.projHoopsStep);
    const factHoopsStepV = parseDecimal(checkData.factHoopsStep);

    if (projDiaV != null && factDiaV != null) {
      hasAnyData = true;
      hasRequiredData = true;
      const dev = Math.abs(factDiaV - projDiaV);
      if (dev !== 0) allOk = false;
    } else if (projDiaV != null || factDiaV != null) {
      hasAnyData = true;
    }

    if (projStepV != null && factStepV != null) {
      hasAnyData = true;
      hasRequiredData = true;
      const dev = Math.abs(factStepV - projStepV);
      if (dev > TOL_STEP) allOk = false;
    } else if (projStepV != null || factStepV != null) {
      hasAnyData = true;
    }

    if (projCoverV != null && factCoverV != null) {
      hasAnyData = true;
      hasRequiredData = true;
      const dev = Math.abs(factCoverV - projCoverV);
      if (dev > TOL_COVER) allOk = false;
    } else if (projCoverV != null || factCoverV != null) {
      hasAnyData = true;
    }

    if (projHoopsStepV != null && factHoopsStepV != null) {
      const TOL_HOOPS_STEP = getInspectionToleranceValue(
        registryConstruction,
        "reinforcement",
        "hoopsStep",
        TOLERANCES.HOOPS_STEP,
        registrySubtype
      );
      hasAnyData = true;
      hasRequiredData = true;
      const dev = Math.abs(factHoopsStepV - projHoopsStepV);
      if (dev > TOL_HOOPS_STEP) allOk = false;
    } else if (projHoopsStepV != null || factHoopsStepV != null) {
      hasAnyData = true;
    }
  }

  if (!hasAnyData) {
    return { status: "empty", summaryText: "Не заполнено" };
  }

  if (!hasRequiredData) {
    return { status: "empty", summaryText: "Не заполнено" };
  }

  return {
    status: allOk ? "ok" : "exceeded",
    summaryText: allOk ? "в норме" : "превышено"
  };
}

function runReinfCheck() {
  const projectId = getCurrentProjectId();
  if (!validateProject(projectId)) return;

  let shouldAutoSave = true;
  let journalAdded = false;
  const scheduleAutoSave = () => {
    if (!shouldAutoSave) return;
    void saveReinfCheck({ skipJournalOnce: journalAdded });
  };
  setTimeout(scheduleAutoSave, 0);

  const res = reinfResult;
  if (!res || !construction) return;
  const flags = getReinfConstructionFlags();

  if (flags.isUnsupported) {
    shouldAutoSave = false;
    setReinfUnsupportedState({ notify: true });
    return;
  }

  if (flags.isColumn) {
    if (reinfGetColumns().length === 0) {
      res.className = "result";
      res.textContent = "Добавьте хотя бы одну колонну для проверки.";
      const state = getState();
      const checked = getChecked();
      state.reinforcement = false;
      checked.reinforcement = false;
      shouldAutoSave = false;
      return;
    }

    const registryConstruction = getSelectedConstructionKey() || construction?.value || "";
    const registrySubtype = getSelectedConstructionSubtype();
    const TOL_STEP = getInspectionToleranceValue(
      registryConstruction,
      "reinforcement",
      "rebarStep",
      TOLERANCES.STEP,
      registrySubtype
    );
    const TOL_COVER = getInspectionToleranceValue(
      registryConstruction,
      "reinforcement",
      "rebarCover",
      TOLERANCES.COVER,
      registrySubtype
    );
    const TOL_HOOPS_STEP = getInspectionToleranceValue(
      registryConstruction,
      "reinforcement",
      "hoopsStep",
      TOLERANCES.HOOPS_STEP,
      registrySubtype
    );

    const parts = [];
    let allOk = true;
    let anyCheck = false;

    reinfGetColumns().forEach((column, index) => {
      const colParts = [];
      const marking = column.marking || `Колонна ${index + 1}`;
      const safeMarking = safeValue(marking);

      const projDiaV = parseDecimal(column.projDia);
      const factDiaV = parseDecimal(column.factDia);
      if (projDiaV != null && factDiaV != null) {
        const { ok } = checkStrictMatch(factDiaV, projDiaV);
        anyCheck = true;
        allOk = allOk && ok;
        colParts.push(formatCheckResult({
          parameterName: "Диаметр арматуры",
          actual: factDiaV,
          project: projDiaV,
          tolerance: null,
          unit: "мм",
          regulatoryDoc: "GOST_R_57997_2017",
          isStrict: true
        }));
      }

      const projStepV = parseDecimal(column.projStep);
      const factStepV = parseDecimal(column.factStep);
      if (projStepV != null && factStepV != null) {
        const { ok } = checkTolerance(factStepV, projStepV, TOL_STEP);
        anyCheck = true;
        allOk = allOk && ok;
        colParts.push(formatCheckResult({
          parameterName: "Шаг арматуры",
          actual: factStepV,
          project: projStepV,
          tolerance: TOL_STEP,
          unit: "мм",
          regulatoryDoc: "GOST_R_57997_2017",
          isStrict: false
        }));
      }

      const projCoverV = parseDecimal(column.projCover);
      const factCoverV = parseDecimal(column.factCover);
      if (projCoverV != null && factCoverV != null) {
        const { ok } = checkTolerance(factCoverV, projCoverV, TOL_COVER);
        anyCheck = true;
        allOk = allOk && ok;
        colParts.push(formatCheckResult({
          parameterName: "Защитный слой",
          actual: factCoverV,
          project: projCoverV,
          tolerance: TOL_COVER,
          unit: "мм",
          regulatoryDoc: "SP_70_13330_2012",
          isStrict: false
        }));
      }

      const projHoopsStepV = parseFloat(column.projHoopsStep);
      const factHoopsStepV = parseFloat(column.factHoopsStep);
      if (!isNaN(projHoopsStepV) && !isNaN(factHoopsStepV)) {
        const { ok } = checkTolerance(factHoopsStepV, projHoopsStepV, TOL_HOOPS_STEP);
        anyCheck = true;
        allOk = allOk && ok;
        colParts.push(formatCheckResult({
          parameterName: "Шаг хомутов",
          actual: factHoopsStepV,
          project: projHoopsStepV,
          tolerance: TOL_HOOPS_STEP,
          unit: "мм",
          regulatoryDoc: "GOST_R_57997_2017",
          isStrict: false
        }));
      }

      if (colParts.length > 0) {
        parts.push(`<b>${safeMarking}:</b><br/>${colParts.join("<br/>")}`);
      }
    });

    if (!anyCheck) {
      res.className = "result";
      res.textContent = "Нет заполненных данных для проверки. Можно сохранить данные и заполнить позже.";
      const state = getState();
      const checked = getChecked();
      state.reinforcement = false;
      checked.reinforcement = false;
      return;
    }

    res.className = "result " + (allOk ? "ok" : "not-ok");
    res.innerHTML = `
      ${parts.join("<br/><br/>")}<br/>
      <b style="margin-top: 12px; display: block;">${
        allOk
          ? "Армирование соответствует проекту и нормативным требованиям."
          : "Есть несоответствия, требуется корректировка."
      }</b>
      ${renderRegulatoryBasisHtml({
        moduleKey: "reinforcement",
        checkKind: getSelectedConstructionKey() || construction?.value || "Колонна",
        subtype: getSelectedConstructionSubtype(),
        helpTargetId: "reinfHelpContent"
      })}
    `;
    const state = getState();
    const checked = getChecked();
    state.reinforcement = allOk;
    checked.reinforcement = true;
    return;
  }

  if (flags.isBeam) {
    if (reinfGetBeams().length === 0) {
      res.className = "result";
      res.textContent = "Добавьте хотя бы одну балку для проверки.";
      const state = getState();
      const checked = getChecked();
      state.reinforcement = false;
      checked.reinforcement = false;
      shouldAutoSave = false;
      return;
    }

    const registryConstruction = getSelectedConstructionKey() || construction?.value || "";
    const registrySubtype = getSelectedConstructionSubtype();
    const TOL_STEP = getInspectionToleranceValue(
      registryConstruction,
      "reinforcement",
      "rebarStep",
      TOLERANCES.STEP,
      registrySubtype
    );
    const TOL_COVER = getInspectionToleranceValue(
      registryConstruction,
      "reinforcement",
      "rebarCover",
      TOLERANCES.COVER,
      registrySubtype
    );

    const parts = [];
    let allOk = true;
    let anyCheck = false;

    reinfGetBeams().forEach((beam, index) => {
      const beamParts = [];
      const marking = beam.marking || `Балка ${index + 1}`;
      const safeMarking = safeValue(marking);

      const projDiaV = parseDecimal(beam.projDia);
      const factDiaV = parseDecimal(beam.factDia);
      if (projDiaV != null && factDiaV != null) {
        const { ok } = checkStrictMatch(factDiaV, projDiaV);
        anyCheck = true;
        allOk = allOk && ok;
        beamParts.push(formatCheckResult({
          parameterName: "Диаметр арматуры",
          actual: factDiaV,
          project: projDiaV,
          tolerance: null,
          unit: "мм",
          regulatoryDoc: "GOST_R_57997_2017",
          isStrict: true
        }));
      }

      const projStepV = parseDecimal(beam.projStep);
      const factStepV = parseDecimal(beam.factStep);
      if (projStepV != null && factStepV != null) {
        const { ok } = checkTolerance(factStepV, projStepV, TOL_STEP);
        anyCheck = true;
        allOk = allOk && ok;
        beamParts.push(formatCheckResult({
          parameterName: "Шаг арматуры",
          actual: factStepV,
          project: projStepV,
          tolerance: TOL_STEP,
          unit: "мм",
          regulatoryDoc: "GOST_R_57997_2017",
          isStrict: false
        }));
      }

      const projCoverV = parseDecimal(beam.projCover);
      const factCoverV = parseDecimal(beam.factCover);
      if (projCoverV != null && factCoverV != null) {
        const { ok } = checkTolerance(factCoverV, projCoverV, TOL_COVER);
        anyCheck = true;
        allOk = allOk && ok;
        beamParts.push(formatCheckResult({
          parameterName: "Защитный слой",
          actual: factCoverV,
          project: projCoverV,
          tolerance: TOL_COVER,
          unit: "мм",
          regulatoryDoc: "SP_70_13330_2012",
          isStrict: false
        }));
      }

      if (beamParts.length > 0) {
        parts.push(`<b>${safeMarking}:</b><br/>${beamParts.join("<br/>")}`);
      }
    });

    if (!anyCheck) {
      res.className = "result";
      res.textContent = "Нет заполненных данных для проверки. Можно сохранить данные и заполнить позже.";
      const state = getState();
      const checked = getChecked();
      state.reinforcement = false;
      checked.reinforcement = false;
      return;
    }

    res.className = "result " + (allOk ? "ok" : "not-ok");
    res.innerHTML = `
      ${parts.join("<br/><br/>")}<br/>
      <b style="margin-top: 12px; display: block;">${
        allOk
          ? "Армирование соответствует проекту и нормативным требованиям."
          : "Есть несоответствия, требуется корректировка."
      }</b>
      ${renderRegulatoryBasisHtml({
        moduleKey: "reinforcement",
        checkKind: getSelectedConstructionKey() || construction?.value || "beam",
        subtype: getSelectedConstructionSubtype(),
        helpTargetId: "reinfHelpContent"
      })}
    `;
    const state = getState();
    const checked = getChecked();
    state.reinforcement = allOk;
    checked.reinforcement = true;
    return;
  }

  if (flags.isWall) {
    const reinfWalls = reinfGetWalls();

    if (reinfWalls.length === 0) {
      res.className = "result";
      res.textContent = `Добавьте хотя бы ${getReinfWallEntityRequiredText()} для проверки.`;
      const state = getState();
      const checked = getChecked();
      state.reinforcement = false;
      checked.reinforcement = false;
      shouldAutoSave = false;
      return;
    }

    const registryConstruction = getSelectedConstructionKey() || construction?.value || "";
    const registrySubtype = getSelectedConstructionSubtype();
    const TOL_STEP = getInspectionToleranceValue(
      registryConstruction,
      "reinforcement",
      "rebarStep",
      TOLERANCES.STEP,
      registrySubtype
    );
    const TOL_COVER = getInspectionToleranceValue(
      registryConstruction,
      "reinforcement",
      "rebarCover",
      TOLERANCES.COVER,
      registrySubtype
    );

    const parts = [];
    let allOk = true;
    let anyCheck = false;

    reinfWalls.forEach((wall) => {
      const wallParts = [];
      let wallLabel = "";
      if (wall.bindingType === "number_letters") {
        wallLabel = `${wall.numberAxis || "?"}, ${wall.letterAxis1 || "?"}-${wall.letterAxis2 || "?"}`;
      } else {
        wallLabel = `${wall.letterAxis || "?"}, ${wall.numberAxis1 || "?"}-${wall.numberAxis2 || "?"}`;
      }
      const safeWallLabel = safeValue(wallLabel);

      const projDiaV = parseDecimal(wall.projDia);
      const factDiaV = parseDecimal(wall.factDia);
      if (projDiaV != null && factDiaV != null) {
        const { ok } = checkStrictMatch(factDiaV, projDiaV);
        anyCheck = true;
        allOk = allOk && ok;
        wallParts.push(formatCheckResult({
          parameterName: "Диаметр арматуры",
          actual: factDiaV,
          project: projDiaV,
          tolerance: null,
          unit: "мм",
          regulatoryDoc: "GOST_R_57997_2017",
          isStrict: true
        }));
      }

      const projStepV = parseDecimal(wall.projStep);
      const factStepV = parseDecimal(wall.factStep);
      if (projStepV != null && factStepV != null) {
        const { ok } = checkTolerance(factStepV, projStepV, TOL_STEP);
        anyCheck = true;
        allOk = allOk && ok;
        wallParts.push(formatCheckResult({
          parameterName: "Шаг арматуры",
          actual: factStepV,
          project: projStepV,
          tolerance: TOL_STEP,
          unit: "мм",
          regulatoryDoc: "GOST_R_57997_2017",
          isStrict: false
        }));
      }

      const projCoverV = parseDecimal(wall.projCover);
      const factCoverV = parseDecimal(wall.factCover);
      if (projCoverV != null && factCoverV != null) {
        const { ok } = checkTolerance(factCoverV, projCoverV, TOL_COVER);
        anyCheck = true;
        allOk = allOk && ok;
        wallParts.push(formatCheckResult({
          parameterName: "Защитный слой",
          actual: factCoverV,
          project: projCoverV,
          tolerance: TOL_COVER,
          unit: "мм",
          regulatoryDoc: "SP_70_13330_2012",
          isStrict: false
        }));
      }

      if (wallParts.length > 0) {
        parts.push(`<b>${getReinfWallEntityLabel()} ${safeWallLabel}:</b><br/>${wallParts.join("<br/>")}`);
      }
    });

    if (!anyCheck) {
      res.className = "result";
      res.textContent = "Нет заполненных данных для проверки. Можно сохранить данные и заполнить позже.";
      const state = getState();
      const checked = getChecked();
      state.reinforcement = false;
      checked.reinforcement = false;
      return;
    }

    res.className = "result " + (allOk ? "ok" : "not-ok");
    res.innerHTML = `
      ${parts.join("<br/><br/>")}<br/>
      <b style="margin-top: 12px; display: block;">${
        allOk
          ? "Армирование соответствует проекту и нормативным требованиям."
          : "Есть несоответствия, требуется корректировка."
      }</b>
      ${renderRegulatoryBasisHtml({
        moduleKey: "reinforcement",
        checkKind: getSelectedConstructionKey() || construction?.value || "Стена",
        subtype: getSelectedConstructionSubtype(),
        helpTargetId: "reinfHelpContent"
      })}
    `;
    const state = getState();
    const checked = getChecked();
    state.reinforcement = allOk;
    checked.reinforcement = true;
    return;
  }

  const projDiaV = parseDecimal(projDia?.value);
  const factDiaV = parseDecimal(factDia?.value);
  const projStepV = parseDecimal(projStep?.value);
  const factStepV = parseDecimal(factStep?.value);
  const projCoverV = parseDecimal(projCover?.value);
  const factCoverV = parseDecimal(factCover?.value);
  const projHoopsStepV = parseDecimal(reinfProjHoopsStepEl?.value);
  const factHoopsStepV = parseDecimal(reinfFactHoopsStepEl?.value);

  const registryConstruction = getSelectedConstructionKey() || construction?.value || "";
  const registrySubtype = getSelectedConstructionSubtype();
  const TOL_STEP = getInspectionToleranceValue(
    registryConstruction,
    "reinforcement",
    "rebarStep",
    TOLERANCES.STEP,
    registrySubtype
  );
  const TOL_COVER = getInspectionToleranceValue(
    registryConstruction,
    "reinforcement",
    "rebarCover",
    TOLERANCES.COVER,
    registrySubtype
  );
  const TOL_HOOPS_STEP = getInspectionToleranceValue(
    registryConstruction,
    "reinforcement",
    "hoopsStep",
    TOLERANCES.HOOPS_STEP,
    registrySubtype
  );

  const parts = [];
  const devs = { dia: null, step: null, cover: null, hoopsStep: null };
  let allOk = true;
  let anyCheck = false;

  if (projDiaV != null && factDiaV != null) {
    const dev = Math.abs(factDiaV - projDiaV);
    const ok = dev === 0;
    devs.dia = dev;
    anyCheck = true;
    allOk = allOk && ok;
    parts.push(formatCheckResult({
      parameterName: "Диаметр арматуры",
      actual: factDiaV,
      project: projDiaV,
      tolerance: null,
      unit: "мм",
      regulatoryDoc: "GOST_R_57997_2017",
      isStrict: true
    }));
  } else if (projDiaV != null || factDiaV != null) {
    parts.push("Диаметр: необходимо заполнить оба значения (проектное и фактическое)");
    allOk = false;
    anyCheck = true;
  }

  if (projStepV != null && factStepV != null) {
    const dev = Math.abs(factStepV - projStepV);
    const ok = dev <= TOL_STEP;
    devs.step = dev;
    anyCheck = true;
    allOk = allOk && ok;
    parts.push(formatCheckResult({
      parameterName: "Шаг арматуры",
      actual: factStepV,
      project: projStepV,
      tolerance: TOL_STEP,
      unit: "мм",
      regulatoryDoc: "GOST_R_57997_2017",
      isStrict: false
    }));
  } else if (projStepV != null || factStepV != null) {
    parts.push("Шаг: необходимо заполнить оба значения (проектное и фактическое)");
    allOk = false;
    anyCheck = true;
  }

  if (projCoverV != null && factCoverV != null) {
    const dev = Math.abs(factCoverV - projCoverV);
    const ok = dev <= TOL_COVER;
    devs.cover = dev;
    anyCheck = true;
    allOk = allOk && ok;
    parts.push(formatCheckResult({
      parameterName: "Защитный слой",
      actual: factCoverV,
      project: projCoverV,
      tolerance: TOL_COVER,
      unit: "мм",
      regulatoryDoc: "SP_70_13330_2012",
      isStrict: false
    }));
  } else if (!isNaN(projCoverV) || !isNaN(factCoverV)) {
    parts.push("Защитный слой: необходимо заполнить оба значения (проектное и фактическое)");
    allOk = false;
    anyCheck = true;
  }

  if (flags.behavior.showReinforcementHoopsStep) {
    if (projHoopsStepV != null && factHoopsStepV != null) {
      const dev = Math.abs(factHoopsStepV - projHoopsStepV);
      const ok = dev <= TOL_HOOPS_STEP;
      devs.hoopsStep = dev;
      anyCheck = true;
      allOk = allOk && ok;
      parts.push(formatCheckResult({
        parameterName: "Шаг хомутов",
        actual: factHoopsStepV,
        project: projHoopsStepV,
        tolerance: TOL_HOOPS_STEP,
        unit: "мм",
        regulatoryDoc: "GOST_R_57997_2017",
        isStrict: false
      }));
    } else if (projHoopsStepV != null || factHoopsStepV != null) {
      parts.push("Шаг хомутов: необходимо заполнить оба значения (проектное и фактическое)");
      allOk = false;
      anyCheck = true;
    }
  }

  if (!anyCheck) {
    res.className = "result";
    res.textContent =
      "Нет ни одной пары проектных и фактических значений. Можно сохранить проектные данные и внести фактические позже.";
    const state = getState();
    const checked = getChecked();
    state.reinforcement = false;
    checked.reinforcement = false;
    return;
  }

  res.className = "result " + (allOk ? "ok" : "not-ok");
  res.innerHTML = `
    ${parts.join("<br/>")}<br/>
    <b>${
      allOk
        ? "Армирование соответствует проекту и нормативным требованиям."
        : "Есть несоответствия, требуется корректировка."
    }</b>
    ${renderRegulatoryBasisHtml({
      moduleKey: "reinforcement",
      checkKind: getSelectedConstructionKey() || construction?.value || "default",
      subtype: getSelectedConstructionSubtype(),
      helpTargetId: "reinfHelpContent"
    })}
  `;
  const state = getState();
  const checked = getChecked();
  state.reinforcement = allOk;
  checked.reinforcement = true;

  const detailsParts = [];
  if (devs.dia != null) detailsParts.push(`ΔØ=${devs.dia.toFixed(1)} мм`);
  if (devs.step != null) detailsParts.push(`Δшаг=${devs.step.toFixed(1)} мм`);
  if (devs.hoopsStep != null) detailsParts.push(`Δхомуты=${devs.hoopsStep.toFixed(1)} мм`);
  if (devs.cover != null) detailsParts.push(`Δзащитный=${devs.cover.toFixed(1)} мм`);

  let context = "—";
  if (flags.isPlate || flags.isStair) {
    const stairName = flags.isStair ? (reinfStairNameEl?.value.trim() || "") : "";
    const floor = reinfFloorEl?.value.trim() || "";
    const location = reinfLocationEl?.value || "";

    const parts = [];
    if (stairName) parts.push(stairName);
    if (floor) parts.push(`Этаж ${floor}`);
    if (location) parts.push(location);

    if (parts.length > 0) {
      context = parts.join(", ");
    }
  } else if (flags.isColumn) {
    const floor = reinfColumnFloorEl?.value.trim() || "";
    const markings = reinfGetColumns().map((c) => c.marking).filter((m) => m).join(", ");
    const colParts = [];
    if (floor) colParts.push(`Этаж ${floor}`);
    if (markings) colParts.push(markings);
    if (colParts.length > 0) {
      context = colParts.join(", ");
    }
  } else if (flags.isBeam) {
    const floor = reinfBeamFloorEl?.value.trim() || "";
    const markings = reinfGetBeams().map((b) => b.marking).filter((m) => m).join(", ");
    const beamParts = [];
    if (floor) beamParts.push(`Этаж ${floor}`);
    if (markings) beamParts.push(markings);
    if (beamParts.length > 0) {
      context = beamParts.join(", ");
    }
  } else if (flags.isWall) {
    const floor = reinfWallFloorEl?.value.trim() || "";
    if (floor) {
      context = `Этаж ${floor}`;
    }
  }

  addJournalEntrySafe({
    module: "Армирование",
    status: allOk ? "в норме" : "превышено",
    context: context,
    details: detailsParts.join("; "),
    construction: getSelectedConstructionKey()
  });
  journalAdded = true;
}

function initReinfButtons() {
  if (reinfButtonsInitialized) return;
  reinfButtonsInitialized = true;

  if (btnAddReinfColumn) {
    btnAddReinfColumn.addEventListener("click", addReinfColumn);
  }
  if (btnAddReinfBeam) {
    btnAddReinfBeam.addEventListener("click", addReinfBeam);
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#btnAddReinfWall");
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      addReinfWall();
    }
  });
}

function initReinforcementHandlers() {
  const btnReinf = document.getElementById("btnReinf");
  if (btnReinf) {
    btnReinf.addEventListener("click", runReinfCheck);
  }

  const btnSaveReinfCheck = document.getElementById("btnSaveReinfCheck");
  if (btnSaveReinfCheck) {
    btnSaveReinfCheck.addEventListener("click", () => {
      void saveReinfCheck();
    });
  }

  const btnClearReinfForm = document.getElementById("btnClearReinfForm");
  if (btnClearReinfForm) {
    btnClearReinfForm.addEventListener("click", clearReinfForm);
  }

  const btnClearReinfChecks = document.getElementById("btnClearReinfChecks");
  if (btnClearReinfChecks) {
    btnClearReinfChecks.addEventListener("click", () => {
      void clearReinfChecks();
    });
  }

  if (reinfBimElementSelect) {
    reinfBimElementSelect.addEventListener("change", (event) => {
      const nextId = event.target?.value || "";
      if (nextId === "__empty__") return;
      applyReinfBimElementSelection(nextId);
    });
  }

  if (reinfBimSearchInput) {
    reinfBimSearchInput.addEventListener("input", (event) => {
      reinfBimFilters.search = String(event.target?.value || "").trim();
      renderReinfBimElementOptions();
      updateReinfBimControlsState();
    });
  }

  if (reinfBimTypeFilter) {
    reinfBimTypeFilter.addEventListener("change", (event) => {
      reinfBimFilters.type = normalizeReinfBimFilterValue(event.target?.value, "all");
      renderReinfBimElementOptions();
      updateReinfBimControlsState();
    });
  }

  if (reinfBimAxesFilter) {
    reinfBimAxesFilter.addEventListener("change", (event) => {
      reinfBimFilters.axes = normalizeReinfBimFilterValue(event.target?.value, "all");
      renderReinfBimElementOptions();
      updateReinfBimControlsState();
    });
  }

  if (btnClearReinfBimSelection) {
    btnClearReinfBimSelection.addEventListener("click", () => {
      clearReinfBimSelection({ keepManualFields: true });
      setReinfBimStatus("BIM-привязка снята. Текущие значения в форме сохранены для ручного редактирования.", "info");
    });
  }

  [
    reinfFloorEl,
    reinfColumnFloorEl,
    reinfBeamFloorEl,
    reinfWallFloorEl,
    reinfBimMarkEl,
    reinfBimAxesEl
  ].forEach((fieldEl) => {
    if (!fieldEl) return;
    fieldEl.addEventListener("input", () => {
      updateReinfStaticBimHighlights();
    });
  });

  if (construction) {
    construction.addEventListener("change", () => updateReinfLocationFieldsVisibility(true));
  }
}

export function initReinforcementModule() {
  if (reinforcementInitialized) return;
  reinforcementInitialized = true;

  onAppTabActivated("reinforcement", renderReinfBimVisualPanel);
  initReinfAxes();
  initReinfButtons();
  renderReinfBimFilterOptions();
  renderReinfBimElementOptions("");
  renderReinfBimBindingSnapshot();
  updateReinfBimControlsState();
  initReinforcementHandlers();
  void loadReinfBimElements(getCurrentProjectId());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      updateReinfLocationFieldsVisibility(false);
    });
  } else {
    updateReinfLocationFieldsVisibility(false);
  }
}

export {
  checkReinfColumnDuplicate,
  removeReinfColumn,
  renderReinfColumns,
  checkReinfBeamDuplicate,
  removeReinfBeam,
  renderReinfBeams,
  checkReinfWallDuplicate,
  bindReinfWallButton,
  removeReinfWall,
  saveReinfWallsDraft,
  loadReinfWallsDraft,
  renderReinfWalls,
  updateReinfLocationFieldsVisibility,
  loadReinfChecks,
  saveReinfChecks,
  renderReinfChecks,
  loadReinfCheck,
  saveReinfCheck,
  clearReinfChecks,
  clearReinfForm,
  loadReinfBimElements,
  renderReinfBimVisualPanel
};

