import {
  APP_CONFIG,
  CONCRETE_STRENGTH_CLASSES,
  VALID_LETTER_AXES
} from "../../config.js";
import {
  getConstructionCategoryKey,
  getConstructionEntityLabels,
  getConstructionLabel,
  getConstructionModuleBehavior,
  getConstructionModuleFallbackMessage,
  getConstructionProfile,
  normalizeConstructionKey
} from "../construction.js";
import { getInspectionStatus } from "../inspection-registry.js";
import {
  showNotification,
  validateProject,
  showConfirm,
  defaultRusLetters,
  defaultNumbers,
  normalizeMarking,
  parseDecimal,
  parseConcreteStrength,
  escapeHtml,
  sanitizeHtml,
  formatNodeValue,
  isValidLetterAxis
} from "../../utils.js";
import { ensureChartJsLoaded } from "../ui/lazy-libs.js";
import {
  clearProjectCollection,
  createProjectCollectionDoc,
  deleteProjectCollectionDoc,
  getProjectDocSnapshot,
  getProjectCollectionSnapshot,
  updateProjectCollectionDoc
} from "../repositories/firestore-repository.js";
import {
  clearInspectionsByModuleAndRefreshAnalytics,
  deleteInspectionAndRefreshAnalytics,
  saveInspectionAndRefreshAnalytics
} from "../services/inspection-sync.js";
import { renderRegulatoryBasisHtml } from "../services/regulatory-basis.js";
import type { InspectionPayload, StrengthCheckRecord } from "../../types/module-records.js";
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
import { buildNodeDeleteIconButton } from "../ui/node-card-interactions.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const safeValue = (value) => escapeHtml(value == null ? "" : String(value));
const BIM_MANUAL_MODE_MESSAGE = "";
const BIM_LOAD_ERROR_MESSAGE = "Не удалось загрузить BIM-элементы. Можно продолжить ручной ввод.";

const getCurrentProjectId = getCurrentProjectIdFromGlobal;
const getCurrentIfcFile = getCurrentIfcFileFromInput;
const getStrengthChecksMap = () => {
  if (!(globalThis.strengthChecks instanceof Map)) {
    globalThis.strengthChecks = new Map<string, StrengthCheckRecord>();
  }
  return globalThis.strengthChecks as Map<string, StrengthCheckRecord>;
};
const setCurrentStrengthCheckId = (value) => {
  globalThis.currentStrengthCheckId = value;
};
const getCurrentStrengthCheckId = () => globalThis.currentStrengthCheckId || null;

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

async function upsertStrengthInspectionDualWrite(projectId, inspectionId, checkData) {
  const projectSnap = await getProjectDocSnapshot(projectId);
  const projectData = projectSnap.exists() ? projectSnap.data() || {} : {};
  const authUid = String(auth.currentUser?.uid || "").trim();
  const ownerUid = String(projectData.ownerUid || projectData.createdBy || authUid || "").trim();
  const createdBy = String(projectData.createdBy || projectData.ownerUid || authUid || "").trim();
  const contractorName = String(projectData.contractorName || "").trim();

  const inspectionPayload: InspectionPayload = {
    projectId,
    module: "Прочность",
    moduleKey: "strength",
    sourceCollection: "strengthChecks",
    sourceId: inspectionId,
    sourceDocId: inspectionId,
    construction: checkData?.construction || "",
    constructionSubtype: checkData?.constructionSubtype || "",
    constructionSubtypeLabel: checkData?.constructionSubtypeLabel || "",
    checkStatus: checkData?.status || null,
    summaryText: checkData?.summaryText || "",
    createdAt: checkData?.createdAt || Date.now(),
    updatedAt: Date.now(),
    contractorName
  };
  if (ownerUid) inspectionPayload.ownerUid = ownerUid;
  if (createdBy) inspectionPayload.createdBy = createdBy;

  await saveInspectionAndRefreshAnalytics(
    projectId,
    inspectionId,
    inspectionPayload,
    { merge: true }
  );
}

async function clearStrengthInspectionDualWrite(projectId) {
  return clearInspectionsByModuleAndRefreshAnalytics(projectId, {
    sourceCollection: "strengthChecks",
    moduleKey: "strength"
  });
}

const strengthChecks = getStrengthChecksMap();
let strengthInitialized = false;
let strengthAxesInitialized = false;
let skipStrengthJournalOnce = false;
let suppressStrengthAutoSaveOnce = false;
let chartRef = null;
let strengthBimElements = [];
let selectedStrengthBimElementId = "";
let strengthBimBindingSnapshot = null;
let strengthBimVisualPanel = null;
const strengthBimElementsById = new Map();
const strengthBimFilters = {
  search: "",
  type: "all",
  axes: "all"
};

// ============================
//  Прочность: DOM элементы
// ============================
const construction = document.getElementById("construction");
const strengthBimSearchInput = document.getElementById("strengthBimSearchInput");
const strengthBimTypeFilter = document.getElementById("strengthBimTypeFilter");
const strengthBimAxesFilter = document.getElementById("strengthBimAxesFilter");
const strengthBimElementSelect = document.getElementById("strengthBimElementSelect");
const strengthBimElementStatus = document.getElementById("strengthBimElementStatus");
const strengthBimSourceCard = document.getElementById("strengthBimSourceCard");
const strengthBimSourceTitle = document.getElementById("strengthBimSourceTitle");
const strengthBimSourceState = document.getElementById("strengthBimSourceState");
const strengthBimSourceMeta = document.getElementById("strengthBimSourceMeta");
const strengthBimAppliedTypeEl = document.getElementById("strengthBimAppliedType");
const strengthBimAppliedFloorEl = document.getElementById("strengthBimAppliedFloor");
const strengthBimAppliedMarkEl = document.getElementById("strengthBimAppliedMark");
const strengthBimAppliedAxesEl = document.getElementById("strengthBimAppliedAxes");
const strengthBimAppliedStrengthEl = document.getElementById("strengthBimAppliedStrength");
const strengthBimSourceHint = document.getElementById("strengthBimSourceHint");
const strengthBimMarkEl = document.getElementById("strengthBimMark");
const strengthBimAxesEl = document.getElementById("strengthBimAxes");
const btnClearStrengthBimSelection = document.getElementById("btnClearStrengthBimSelection");
const strengthManualAssistNote = document.getElementById("strengthManualAssistNote");
const strengthBimPanelHost = strengthBimSourceCard?.parentElement || strengthBimElementSelect?.closest(".geo-bim-card");
const strengthFloorEl = document.getElementById("strengthFloor");
const mark = document.getElementById("mark");
const days = document.getElementById("days");
const actual = document.getElementById("actual");
const strengthResult = document.getElementById("strengthResult");
const strengthBehaviorMessage = document.getElementById("strengthBehaviorMessage");
const strengthUnsupportedOnlyMessage = document.getElementById("strengthUnsupportedOnlyMessage");
const strengthStairNameField = document.getElementById("strengthStairNameField");
const strengthStairNameEl = document.getElementById("strengthStairName");
const strengthCanvas = document.getElementById("strengthChart");
const strengthLocationFields = document.getElementById("strengthLocationFields");
const strengthAxisLetterFromEl = document.getElementById("strengthAxisLetterFrom");
const strengthAxisLetterToEl = document.getElementById("strengthAxisLetterTo");
const strengthAxisNumberFromEl = document.getElementById("strengthAxisNumberFrom");
const strengthAxisNumberToEl = document.getElementById("strengthAxisNumberTo");
const strengthLocationEl = document.getElementById("strengthLocation");
const strengthMarkingFields = document.getElementById("strengthMarkingFields");
const strengthMarkingEl = document.getElementById("strengthMarking");
const strengthWallFields = document.getElementById("strengthWallFields");
const strengthWallBindingTypeEl = document.getElementById("strengthWallBindingType");
const strengthWallLetterNumbersEl = document.getElementById("strengthWallLetterNumbers");
const strengthWallNumberLettersEl = document.getElementById("strengthWallNumberLetters");
const strengthWallLetterAxisEl = document.getElementById("strengthWallLetterAxis");
const strengthWallNumberAxis1El = document.getElementById("strengthWallNumberAxis1");
const strengthWallNumberAxis2El = document.getElementById("strengthWallNumberAxis2");
const strengthWallNumberAxisEl = document.getElementById("strengthWallNumberAxis");
const strengthWallLetterAxis1El = document.getElementById("strengthWallLetterAxis1");
const strengthWallLetterAxis2El = document.getElementById("strengthWallLetterAxis2");
const strengthWorkAreaElements = Array.from(
  document.querySelectorAll<HTMLElement>(
    "#strength .geo-bim-card, #strength .wizard-header, #strength .wizard-steps, #strength [data-wizard-footer]"
  )
);

function ensureStrengthBimVisualSelector() {
  if (strengthBimVisualPanel) return strengthBimVisualPanel;

  strengthBimVisualPanel = ensureBimVisualPanel({
    host: strengthBimPanelHost,
    sourceCard: strengthBimSourceCard,
    getAllElements: () => strengthBimElements,
    getFilteredElements: () => getFilteredStrengthBimElements(),
    getSelectedElement: () => getSelectedStrengthBimElement(),
    getSelectedId: () => selectedStrengthBimElementId,
    getCurrentProjectId,
    getCurrentIfcFile,
    onSelect: (elementId) => {
      applyStrengthBimElementSelection(elementId);
    },
    labelBuilder: (element) => buildBimElementOptionLabel(element),
    moduleKey: "strength"
  });

  return strengthBimVisualPanel;
}

function renderStrengthBimVisualPanel() {
  ensureStrengthBimVisualSelector()?.render();
}

// ============================
//  Прочность: helpers
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
}

function moduleStorageKey(base) {
  const id = getCurrentProjectId() || "no_project";
  return `${base}_${id}`;
}

function getStorageKey() {
  const ls = globalThis.LS || {};
  return ls.streng || "strength_checks_v1";
}

function normalizeStrengthBimValue(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function hasStrengthBimValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function formatStrengthBimDisplayValue(value, fallback = "Нет данных") {
  return hasStrengthBimValue(value) ? String(value) : fallback;
}

function formatStrengthBimShortGuid(value) {
  const normalized = normalizeStrengthBimValue(value);
  if (!normalized) return null;
  return normalized.length > 16
    ? `${normalized.slice(0, 6)}...${normalized.slice(-6)}`
    : normalized;
}

function matchesStrengthBimText(currentValue, bimValue) {
  return normalizeStrengthBimValue(currentValue) === normalizeStrengthBimValue(bimValue);
}

function matchesStrengthBimMark(currentValue, bimValue) {
  return normalizeMarking(currentValue) === normalizeMarking(bimValue);
}

function getSelectedStrengthBimElement() {
  return strengthBimElementsById.get(selectedStrengthBimElementId) || null;
}

function getStrengthBimFieldShell(fieldEl) {
  if (!fieldEl) return null;
  return fieldEl.closest("div");
}

function setStrengthBimFieldAutofilled(fieldEl, isAutofilled) {
  const nextState = Boolean(isAutofilled);
  const shell = getStrengthBimFieldShell(fieldEl);

  if (shell) {
    shell.classList.toggle("geo-bim-field--autofilled", nextState);
  }
  if (fieldEl) {
    fieldEl.classList.toggle("geo-bim-input--autofilled", nextState);
  }
}

function clearStrengthStaticBimFieldHighlights() {
  [
    strengthBimMarkEl,
    strengthBimAxesEl,
    strengthFloorEl,
    strengthAxisLetterFromEl,
    strengthAxisLetterToEl,
    strengthAxisNumberFromEl,
    strengthAxisNumberToEl,
    strengthMarkingEl
  ].forEach((fieldEl) => setStrengthBimFieldAutofilled(fieldEl, false));
}

function parseSimpleStrengthAxes(rawAxes) {
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

function tryApplyStrengthPlateAxesFromBim(rawAxes, { overwrite = false } = {}) {
  const parsedAxes = parseSimpleStrengthAxes(rawAxes);
  if (!parsedAxes) return false;

  const hasManualAxes = [
    strengthAxisLetterFromEl?.value,
    strengthAxisLetterToEl?.value,
    strengthAxisNumberFromEl?.value,
    strengthAxisNumberToEl?.value
  ].some((value) => String(value || "").trim() !== "");
  if (hasManualAxes && !overwrite) return false;

  const hasLetterFrom = Array.from(strengthAxisLetterFromEl?.options || []).some((option) => option.value === parsedAxes.axisLetterFrom);
  const hasLetterTo = Array.from(strengthAxisLetterToEl?.options || []).some((option) => option.value === parsedAxes.axisLetterTo);
  const hasNumberFrom = Array.from(strengthAxisNumberFromEl?.options || []).some((option) => option.value === parsedAxes.axisNumberFrom);
  const hasNumberTo = Array.from(strengthAxisNumberToEl?.options || []).some((option) => option.value === parsedAxes.axisNumberTo);
  if (!hasLetterFrom || !hasLetterTo || !hasNumberFrom || !hasNumberTo) return false;

  if (strengthAxisLetterFromEl) strengthAxisLetterFromEl.value = parsedAxes.axisLetterFrom;
  if (strengthAxisLetterToEl) strengthAxisLetterToEl.value = parsedAxes.axisLetterTo;
  if (strengthAxisNumberFromEl) strengthAxisNumberFromEl.value = parsedAxes.axisNumberFrom;
  if (strengthAxisNumberToEl) strengthAxisNumberToEl.value = parsedAxes.axisNumberTo;
  updateStrengthLocation();
  return true;
}

function normalizeStrengthBimFilterValue(value, fallback = "all") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function resetStrengthBimFilters() {
  strengthBimFilters.search = "";
  strengthBimFilters.type = "all";
  strengthBimFilters.axes = "all";
}

function syncStrengthBimFilterControlsFromState() {
  if (strengthBimSearchInput && strengthBimSearchInput.value !== strengthBimFilters.search) {
    strengthBimSearchInput.value = strengthBimFilters.search;
  }
  if (strengthBimTypeFilter && strengthBimTypeFilter.value !== strengthBimFilters.type) {
    strengthBimTypeFilter.value = strengthBimFilters.type;
  }
  if (strengthBimAxesFilter && strengthBimAxesFilter.value !== strengthBimFilters.axes) {
    strengthBimAxesFilter.value = strengthBimFilters.axes;
  }
}

function hasActiveStrengthBimFilters() {
  return (
    String(strengthBimFilters.search || "").trim() !== "" ||
    strengthBimFilters.type !== "all" ||
    strengthBimFilters.axes !== "all"
  );
}

function getFilteredStrengthBimElements() {
  const searchQuery = String(strengthBimFilters.search || "").trim().toLowerCase();

  return strengthBimElements.filter((element) => {
    if (strengthBimFilters.type !== "all" && element.type !== strengthBimFilters.type) {
      return false;
    }

    const axesValue = String(element.axes || "").trim();
    if (strengthBimFilters.axes !== "all" && axesValue !== strengthBimFilters.axes) {
      return false;
    }

    if (searchQuery && !buildBimElementSearchText(element).includes(searchQuery)) {
      return false;
    }

    return true;
  });
}

function fillStrengthBimFilterSelect(selectEl, options, defaultLabel, nextValue) {
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
  selectEl.disabled = !getCurrentProjectId() || strengthBimElements.length === 0;
}

function renderStrengthBimFilterOptions() {
  const filterOptions = buildBimElementFilterOptions(strengthBimElements);
  const nextType = normalizeStrengthBimFilterValue(strengthBimFilters.type, "all");
  const nextAxes = normalizeStrengthBimFilterValue(strengthBimFilters.axes, "all");

  fillStrengthBimFilterSelect(strengthBimTypeFilter, filterOptions.types, "Все типы", nextType);
  fillStrengthBimFilterSelect(strengthBimAxesFilter, filterOptions.axes, "Все оси", nextAxes);

  strengthBimFilters.type = strengthBimTypeFilter ? strengthBimTypeFilter.value : nextType;
  strengthBimFilters.axes = strengthBimAxesFilter ? strengthBimAxesFilter.value : nextAxes;
  syncStrengthBimFilterControlsFromState();
}

function renderStrengthBimElementOptions(selectedId = selectedStrengthBimElementId) {
  if (!strengthBimElementSelect) return;

  const previousValue = selectedId || "";
  const filteredElements = getFilteredStrengthBimElements();
  const visibleElements = [...filteredElements];
  const selectedElement = previousValue ? strengthBimElementsById.get(previousValue) : null;
  strengthBimElementSelect.innerHTML = "";

  const manualOption = document.createElement("option");
  manualOption.value = "";
  manualOption.textContent = "Ручной ввод без BIM";
  strengthBimElementSelect.appendChild(manualOption);

  if (selectedElement) {
    const selectedKey = selectedElement.elementId || selectedElement.id || "";
    const alreadyVisible = visibleElements.some((element) => (element.elementId || element.id || "") === selectedKey);
    if (!alreadyVisible) visibleElements.unshift(selectedElement);
  }

  visibleElements.forEach((element) => {
    const option = document.createElement("option");
    option.value = element.elementId || element.id || "";
    option.textContent = buildBimElementOptionLabel(element);
    strengthBimElementSelect.appendChild(option);
  });

  if (!selectedElement && filteredElements.length === 0 && strengthBimElements.length > 0) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "__empty__";
    emptyOption.textContent = "По текущим фильтрам BIM-элементы не найдены";
    emptyOption.disabled = true;
    strengthBimElementSelect.appendChild(emptyOption);
  }

  const hasPreviousValue =
    previousValue === "" ||
    visibleElements.some((element) => (element.elementId || element.id || "") === previousValue);
  strengthBimElementSelect.value = hasPreviousValue ? previousValue : "";
  renderStrengthBimVisualPanel();
}

function setStrengthBimStatus(message, tone = "muted") {
  if (!strengthBimElementStatus) return;
  const hasMessage = Boolean(String(message || "").trim());
  strengthBimElementStatus.textContent = message;
  strengthBimElementStatus.hidden = !hasMessage;
  strengthBimElementStatus.dataset.empty = hasMessage ? "0" : "1";
  const statusField = strengthBimElementStatus.closest(".geo-bim-status-field") as HTMLElement | null;
  if (statusField) statusField.hidden = !hasMessage;
  strengthBimElementStatus.style.color =
    tone === "error"
      ? "#fca5a5"
      : tone === "success"
        ? "#86efac"
        : tone === "info"
          ? "#93c5fd"
          : "#E6B450";
}

function buildStrengthBimBindingSnapshot({ element = null, checkData = null, constructionType = null } = {}) {
  const selectedElement = element || null;
  const fallbackData = checkData || {};
  const elementId =
    normalizeStrengthBimValue(selectedElement?.elementId) ||
    normalizeStrengthBimValue(selectedElement?.id) ||
    normalizeStrengthBimValue(fallbackData.bimElementId);
  const rawType =
    normalizeStrengthBimValue(selectedElement?.type)?.toLowerCase() ||
    normalizeStrengthBimValue(fallbackData.bimType)?.toLowerCase();
  const typeLabel =
    getConstructionLabel(constructionType) ||
    getConstructionLabel(getTehnadzorTypeByBimType(rawType)) ||
    getConstructionLabel(fallbackData.construction) ||
    getConstructionLabel(fallbackData.constructionType) ||
    normalizeStrengthBimValue(fallbackData.constructionLabel) ||
    normalizeStrengthBimValue(fallbackData.construction);
  const floor =
    normalizeStrengthBimValue(selectedElement?.floor) ||
    normalizeStrengthBimValue(fallbackData.bimFloor);
  const markValue =
    normalizeStrengthBimValue(selectedElement?.mark) ||
    normalizeStrengthBimValue(fallbackData.bimMark);
  const axes =
    normalizeStrengthBimValue(selectedElement?.axes) ||
    normalizeStrengthBimValue(fallbackData.bimAxes);
  const sourceModelId =
    normalizeStrengthBimValue(selectedElement?.sourceModelId) ||
    normalizeStrengthBimValue(fallbackData.bimSourceModelId);
  const ifcGuid =
    normalizeStrengthBimValue(selectedElement?.ifcGuid) ||
    normalizeStrengthBimValue(fallbackData.bimIfcGuid);

  if (!elementId && !rawType && !floor && !markValue && !axes && !sourceModelId && !ifcGuid) {
    return null;
  }

  let title = "BIM-элемент";
  if (selectedElement) {
    title = formatBimElementLabel(selectedElement);
  } else if (typeLabel && markValue) {
    title = `${typeLabel} ${markValue}`;
  } else if (typeLabel) {
    title = elementId ? `${typeLabel} · ID ${elementId}` : typeLabel;
  } else if (markValue) {
    title = `Элемент ${markValue}`;
  } else if (elementId) {
    title = `Элемент ID ${elementId}`;
  }

  return {
    resolved: Boolean(selectedElement),
    elementId,
    rawType,
    typeLabel,
    floor,
    mark: markValue,
    axes,
    sourceModelId,
    ifcGuid,
    title
  };
}

function updateStrengthStaticBimHighlights(snapshot = strengthBimBindingSnapshot) {
  clearStrengthStaticBimFieldHighlights();
  if (!snapshot) return;

  setStrengthBimFieldAutofilled(
    strengthBimMarkEl,
    matchesStrengthBimText(strengthBimMarkEl?.value, snapshot.mark)
  );
  setStrengthBimFieldAutofilled(
    strengthBimAxesEl,
    matchesStrengthBimText(strengthBimAxesEl?.value, snapshot.axes)
  );
  setStrengthBimFieldAutofilled(
    strengthFloorEl,
    matchesStrengthBimText(strengthFloorEl?.value, snapshot.floor)
  );

  const currentConstruction = getSelectedConstructionKey() || construction?.value || "";
  const currentFlags = getStrengthConstructionFlags(currentConstruction);
  if (currentFlags.isPlate || currentFlags.isStair) {
    const parsedAxes = parseSimpleStrengthAxes(snapshot.axes);
    setStrengthBimFieldAutofilled(
      strengthAxisLetterFromEl,
      parsedAxes && matchesStrengthBimText(strengthAxisLetterFromEl?.value, parsedAxes.axisLetterFrom)
    );
    setStrengthBimFieldAutofilled(
      strengthAxisLetterToEl,
      parsedAxes && matchesStrengthBimText(strengthAxisLetterToEl?.value, parsedAxes.axisLetterTo)
    );
    setStrengthBimFieldAutofilled(
      strengthAxisNumberFromEl,
      parsedAxes && matchesStrengthBimText(strengthAxisNumberFromEl?.value, parsedAxes.axisNumberFrom)
    );
    setStrengthBimFieldAutofilled(
      strengthAxisNumberToEl,
      parsedAxes && matchesStrengthBimText(strengthAxisNumberToEl?.value, parsedAxes.axisNumberTo)
    );
  }

  if (currentFlags.isColumn || currentFlags.isBeam) {
    setStrengthBimFieldAutofilled(
      strengthMarkingEl,
      matchesStrengthBimMark(strengthMarkingEl?.value, snapshot.mark)
    );
  }
}

function renderStrengthBimBindingSnapshot() {
  const snapshot = strengthBimBindingSnapshot;
  const hasLink = Boolean(snapshot);

  if (strengthBimSourceCard) {
    strengthBimSourceCard.hidden = !hasLink;
    strengthBimSourceCard.classList.toggle("is-linked", hasLink);
    strengthBimSourceCard.classList.toggle("is-stale", hasLink && !snapshot?.resolved);
  }

  if (strengthManualAssistNote) {
    const noteText = hasLink
      ? snapshot.resolved
        ? "Подсвеченные поля ниже подставлены из BIM там, где данные надёжны. Класс бетона и количество дней пока остаются ручными."
        : "BIM-привязка сохранена, но сам импортированный элемент сейчас недоступен. Поля можно продолжать редактировать вручную."
      : BIM_MANUAL_MODE_MESSAGE;
    strengthManualAssistNote.textContent = noteText;
    strengthManualAssistNote.hidden = !noteText;
    strengthManualAssistNote.classList.toggle("is-linked", hasLink);
    strengthManualAssistNote.classList.toggle("is-stale", hasLink && !snapshot?.resolved);
  }

  if (!hasLink) {
    if (strengthBimSourceTitle) strengthBimSourceTitle.textContent = "BIM-элемент не выбран";
    if (strengthBimSourceState) strengthBimSourceState.textContent = BIM_MANUAL_MODE_MESSAGE;
    if (strengthBimSourceMeta) strengthBimSourceMeta.textContent = "";
    if (strengthBimAppliedTypeEl) strengthBimAppliedTypeEl.textContent = "Нет данных";
    if (strengthBimAppliedFloorEl) strengthBimAppliedFloorEl.textContent = "Нет данных";
    if (strengthBimAppliedMarkEl) strengthBimAppliedMarkEl.textContent = "Нет данных";
    if (strengthBimAppliedAxesEl) strengthBimAppliedAxesEl.textContent = "Нет данных";
    if (strengthBimAppliedStrengthEl) strengthBimAppliedStrengthEl.textContent = "Пока ручной ввод";
    if (strengthBimSourceHint) {
      strengthBimSourceHint.textContent = "Из текущего BIM-MVP в прочность надёжно приходят тип, этаж, BIM-оси и марка для колонн/балок. Класс бетона и количество дней пока вводятся вручную.";
    }
    clearStrengthStaticBimFieldHighlights();
    return;
  }

  if (strengthBimSourceTitle) strengthBimSourceTitle.textContent = snapshot.title;
  if (strengthBimSourceState) strengthBimSourceState.textContent = snapshot.resolved ? "Связка активна" : "Источник недоступен";
  if (strengthBimSourceMeta) {
    const metaParts = [];
    if (snapshot.elementId) metaParts.push(`ID ${snapshot.elementId}`);
    if (snapshot.sourceModelId) metaParts.push(`Модель ${snapshot.sourceModelId}`);
    if (snapshot.ifcGuid) metaParts.push(`GUID ${formatStrengthBimShortGuid(snapshot.ifcGuid)}`);
    strengthBimSourceMeta.textContent = metaParts.join(" · ");
  }
  if (strengthBimAppliedTypeEl) strengthBimAppliedTypeEl.textContent = formatStrengthBimDisplayValue(snapshot.typeLabel);
  if (strengthBimAppliedFloorEl) strengthBimAppliedFloorEl.textContent = formatStrengthBimDisplayValue(snapshot.floor);
  if (strengthBimAppliedMarkEl) strengthBimAppliedMarkEl.textContent = formatStrengthBimDisplayValue(snapshot.mark);
  if (strengthBimAppliedAxesEl) strengthBimAppliedAxesEl.textContent = formatStrengthBimDisplayValue(snapshot.axes);
  if (strengthBimAppliedStrengthEl) {
    strengthBimAppliedStrengthEl.textContent = snapshot.resolved
      ? "Класс бетона и дни пока вручную"
      : "Источник недоступен";
  }
  if (strengthBimSourceHint) {
    strengthBimSourceHint.textContent = snapshot.resolved
      ? "Из текущего BIM-MVP в прочность надёжно приходят тип, этаж, BIM-оси и марка для колонн/балок. Класс бетона и количество дней пока вводятся вручную."
      : "BIM-связка сохранена в проверке, но этот элемент сейчас не найден среди импортированных элементов проекта.";
  }

  updateStrengthStaticBimHighlights(snapshot);
}

function updateStrengthBimControlsState() {
  const filteredElements = getFilteredStrengthBimElements();
  const snapshot = strengthBimBindingSnapshot;
  const projectId = getCurrentProjectId();

  if (strengthBimElementSelect) strengthBimElementSelect.disabled = !projectId || strengthBimElements.length === 0;
  if (strengthBimSearchInput) strengthBimSearchInput.disabled = !projectId || strengthBimElements.length === 0;
  if (strengthBimTypeFilter) strengthBimTypeFilter.disabled = !projectId || strengthBimElements.length === 0;
  if (strengthBimAxesFilter) strengthBimAxesFilter.disabled = !projectId || strengthBimElements.length === 0;
  if (btnClearStrengthBimSelection) btnClearStrengthBimSelection.disabled = !selectedStrengthBimElementId;

  if (!projectId) {
    setStrengthBimStatus("Сначала выберите объект. После этого станут доступны BIM-элементы проекта.", "muted");
    return;
  }

  const selectedElement = getSelectedStrengthBimElement();
  if (!selectedElement && snapshot && !snapshot.resolved) {
    setStrengthBimStatus(
      "BIM-привязка сохранена в проверке, но сам импортированный элемент сейчас не найден в проекте. Можно перепривязать элемент или продолжить вручную.",
      "info"
    );
    return;
  }

  if (strengthBimElements.length === 0) {
    setStrengthBimStatus(BIM_MANUAL_MODE_MESSAGE, "muted");
    return;
  }

  if (!selectedElement) {
    if (hasActiveStrengthBimFilters()) {
      if (filteredElements.length === 0) {
        setStrengthBimStatus("По текущим фильтрам BIM-элементы не найдены. Можно ослабить фильтры или продолжить вручную.", "info");
      } else {
        setStrengthBimStatus(`Найдено ${filteredElements.length} BIM-элементов. Выберите элемент или продолжайте ручной ввод.`, "info");
      }
      return;
    }

    setStrengthBimStatus(BIM_MANUAL_MODE_MESSAGE, "muted");
    return;
  }

  const typeLabel = getConstructionLabel(getTehnadzorTypeByBimType(selectedElement.type), "Элемент");
  setStrengthBimStatus(`${typeLabel} выбран из BIM. Привязка сохранится вместе с проверкой.`, "success");
}

function collectStrengthBimCheckData() {
  const selectedElement = getSelectedStrengthBimElement();
  if (!selectedElement && !strengthBimBindingSnapshot) {
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
    bimElementId: selectedStrengthBimElementId || null,
    bimSourceModelId: selectedElement?.sourceModelId || strengthBimBindingSnapshot?.sourceModelId || null,
    bimIfcGuid: selectedElement?.ifcGuid || strengthBimBindingSnapshot?.ifcGuid || null,
    bimType: selectedElement?.type || strengthBimBindingSnapshot?.rawType || null,
    bimFloor: selectedElement?.floor || strengthBimBindingSnapshot?.floor || null,
    bimMark: normalizeStrengthBimValue(strengthBimMarkEl?.value) || null,
    bimAxes: normalizeStrengthBimValue(strengthBimAxesEl?.value) || null
  };
}

function hasStrengthBimBindingData(data: StrengthCheckRecord = {}) {
  return Boolean(
    normalizeStrengthBimValue(data.bimElementId) ||
    normalizeStrengthBimValue(data.bimSourceModelId) ||
    normalizeStrengthBimValue(data.bimIfcGuid) ||
    normalizeStrengthBimValue(data.bimType) ||
    normalizeStrengthBimValue(data.bimFloor) ||
    normalizeStrengthBimValue(data.bimMark) ||
    normalizeStrengthBimValue(data.bimAxes)
  );
}

function renderStrengthChart(labels, normData, factData, hasActual) {
  if (typeof window.Chart === "undefined" || !strengthCanvas) {
    return false;
  }

  if (chartRef) chartRef.destroy();
  strengthCanvas.style.display = "block";

  chartRef = new window.Chart(
    strengthCanvas.getContext("2d"),
    {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Нормативная кривая",
            data: normData,
            borderColor: "#60a5fa",
            borderWidth: 2,
            fill: false
          },
          {
            label: "Фактическая прочность",
            data: factData,
            borderColor: "#f87171",
            pointRadius: hasActual ? 6 : 0,
            pointBackgroundColor: "#f87171",
            spanGaps: true
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom", labels: { color: "#e5e7eb" } }
        },
        scales: {
          x: { ticks: { color: "#cbd5e1" }, grid: { color: "#3b3d42" } },
          y: {
            beginAtZero: true,
            ticks: { color: "#cbd5e1" },
            grid: { color: "#3b3d42" }
          }
        }
      }
    }
  );

  return true;
}

function initStrengthAxes() {
  if (strengthAxesInitialized) return;
  strengthAxesInitialized = true;

  if (strengthAxisLetterFromEl && strengthAxisLetterToEl && strengthAxisNumberFromEl && strengthAxisNumberToEl) {
    fillSelect(strengthAxisLetterFromEl, defaultRusLetters);
    fillSelect(strengthAxisLetterToEl, defaultRusLetters);
    fillSelect(strengthAxisNumberFromEl, defaultNumbers);
    fillSelect(strengthAxisNumberToEl, defaultNumbers);
    strengthAxisLetterFromEl.value = APP_CONFIG.DEFAULT_LETTER_AXIS;
    strengthAxisLetterToEl.value = VALID_LETTER_AXES[1] || "Б";
    strengthAxisNumberFromEl.value = APP_CONFIG.DEFAULT_NUMBER_AXIS;
    strengthAxisNumberToEl.value = "2";
  }

  if (mark && CONCRETE_STRENGTH_CLASSES) {
    mark.textContent = "";
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "Выберите класс бетона";
    mark.appendChild(emptyOpt);
    CONCRETE_STRENGTH_CLASSES.forEach((item) => {
      const option = document.createElement("option");
      option.value = `${item.class}(${item.mark})`;
      option.textContent = `${item.class}(${item.mark})`;
      mark.appendChild(option);
    });

    if ("ontouchstart" in window) {
      mark.addEventListener("touchstart", (e) => {
        e.stopPropagation();
      }, { passive: true });

      mark.addEventListener("touchend", () => {
        if (mark === document.activeElement) {
          // Оставляем нативное поведение.
        }
      }, { passive: true });
    }
  }

  if (strengthWallLetterAxisEl && strengthWallNumberAxis1El && strengthWallNumberAxis2El &&
      strengthWallNumberAxisEl && strengthWallLetterAxis1El && strengthWallLetterAxis2El) {
    fillSelect(strengthWallLetterAxisEl, defaultRusLetters);
    fillSelect(strengthWallLetterAxis1El, defaultRusLetters);
    fillSelect(strengthWallLetterAxis2El, defaultRusLetters);
    fillSelect(strengthWallNumberAxisEl, defaultNumbers);
    fillSelect(strengthWallNumberAxis1El, defaultNumbers);
    fillSelect(strengthWallNumberAxis2El, defaultNumbers);
  }
}

// Функция обновления местоположения для плиты и лестницы
function updateStrengthLocation() {
  if (!construction || !strengthLocationEl) return;
  const flags = getStrengthConstructionFlags();
  if (!flags.isPlate && !flags.isStair) {
    strengthLocationEl.value = "";
    return;
  }

  if (!strengthAxisLetterFromEl || !strengthAxisLetterToEl || !strengthAxisNumberFromEl || !strengthAxisNumberToEl) return;

  const letterFrom = strengthAxisLetterFromEl.value;
  const letterTo = strengthAxisLetterToEl.value;
  const numberFrom = strengthAxisNumberFromEl.value;
  const numberTo = strengthAxisNumberToEl.value;

  if (letterFrom && letterTo && numberFrom && numberTo) {
    strengthLocationEl.value = `${letterFrom}-${letterTo}, ${numberFrom}-${numberTo}`;
  } else {
    strengthLocationEl.value = "";
  }
}

function initStrengthLocationListeners() {
  if (strengthAxisLetterFromEl && strengthAxisLetterToEl && strengthAxisNumberFromEl && strengthAxisNumberToEl) {
    [strengthAxisLetterFromEl, strengthAxisLetterToEl, strengthAxisNumberFromEl, strengthAxisNumberToEl].forEach((el) => {
      el.dataset.oldValue = el.value;

      el.addEventListener("focus", (e) => {
        e.target.dataset.oldValue = e.target.value;
      });

      el.addEventListener("change", (e) => {
        const letterFrom = strengthAxisLetterFromEl.value;
        const letterTo = strengthAxisLetterToEl.value;
        const numberFrom = strengthAxisNumberFromEl.value;
        const numberTo = strengthAxisNumberToEl.value;

        if (letterFrom && letterTo && letterFrom === letterTo) {
          showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
          e.target.value = e.target.dataset.oldValue || "";
          updateStrengthLocation();
          return;
        }

        if (numberFrom && numberTo && numberFrom === numberTo) {
          showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
          e.target.value = e.target.dataset.oldValue || "";
          updateStrengthLocation();
          return;
        }

        e.target.dataset.oldValue = e.target.value;
        updateStrengthLocation();
        updateStrengthStaticBimHighlights();
      });
    });
  }

  if (strengthWallBindingTypeEl) {
    strengthWallBindingTypeEl.addEventListener("change", () => {
      updateStrengthWallBindingDisplay();
    });
    updateStrengthWallBindingDisplay();
  }
}

function updateStrengthWallBindingDisplay() {
  if (!strengthWallBindingTypeEl) return;
  const isLetterNumbers = strengthWallBindingTypeEl.value === "letter_numbers";
  if (strengthWallLetterNumbersEl) strengthWallLetterNumbersEl.style.display = isLetterNumbers ? "grid" : "none";
  if (strengthWallNumberLettersEl) strengthWallNumberLettersEl.style.display = isLetterNumbers ? "none" : "grid";
}

function applyStrengthBimPrefillFromElement(element, { overwrite = false } = {}) {
  if (!element) return;

  if (strengthFloorEl && element.floor && (overwrite || !String(strengthFloorEl.value || "").trim())) {
    strengthFloorEl.value = element.floor;
  }

  const targetConstruction = construction?.value || getTehnadzorTypeByBimType(element.type) || "";
  const targetFlags = getStrengthConstructionFlags(targetConstruction);
  if ((targetFlags.isPlate || targetFlags.isStair) && element.axes) {
    tryApplyStrengthPlateAxesFromBim(element.axes, { overwrite });
  }

  if ((targetFlags.isColumn || targetFlags.isBeam) && strengthMarkingEl && element.mark) {
    if (overwrite || !normalizeStrengthBimValue(strengthMarkingEl.value)) {
      strengthMarkingEl.value = element.mark;
    }
  }
}

function syncStrengthBimSelectionFromCheck(checkData: StrengthCheckRecord = {}) {
  const nextId = String(checkData.bimElementId || "").trim();
  selectedStrengthBimElementId = nextId;
  const selectedElement = nextId ? strengthBimElementsById.get(nextId) || null : null;

  renderStrengthBimElementOptions(nextId);
  if (strengthBimElementSelect) {
    strengthBimElementSelect.value = nextId && strengthBimElementsById.has(nextId) ? nextId : "";
  }
  if (strengthBimMarkEl) {
    strengthBimMarkEl.value = checkData.bimMark || (selectedElement?.mark || "");
  }
  if (strengthBimAxesEl) {
    strengthBimAxesEl.value = checkData.bimAxes || (selectedElement?.axes || "");
  }

  strengthBimBindingSnapshot = buildStrengthBimBindingSnapshot({
    element: selectedElement,
    checkData,
    constructionType: checkData.construction || checkData.constructionType || getSelectedConstructionKey()
  });

  if (selectedElement) {
    applyStrengthBimPrefillFromElement(selectedElement, { overwrite: false });
  }

  renderStrengthBimBindingSnapshot();
  updateStrengthBimControlsState();
}

function clearStrengthBimSelection({ keepManualFields = true } = {}) {
  selectedStrengthBimElementId = "";
  strengthBimBindingSnapshot = null;
  renderStrengthBimElementOptions("");
  if (strengthBimElementSelect) strengthBimElementSelect.value = "";

  if (!keepManualFields) {
    if (strengthBimMarkEl) strengthBimMarkEl.value = "";
    if (strengthBimAxesEl) strengthBimAxesEl.value = "";
  }

  renderStrengthBimBindingSnapshot();
  updateStrengthBimControlsState();
}

function applyStrengthBimElementSelection(elementId) {
  const nextId = String(elementId || "").trim();
  if (!nextId) {
    clearStrengthBimSelection({ keepManualFields: true });
    return;
  }

  const element = strengthBimElementsById.get(nextId);
  if (!element) {
    setStrengthBimStatus("Выбранный BIM-элемент не найден в проекте. Обновите список элементов.", "error");
    return;
  }

  selectedStrengthBimElementId = nextId;
  const targetConstruction = getTehnadzorTypeByBimType(element.type) || construction?.value || "";
  if (construction && targetConstruction) {
    if (window.setConstructionAndTrigger) {
      window.setConstructionAndTrigger(targetConstruction);
    } else {
      construction.value = targetConstruction;
      updateStrengthFieldsVisibility();
    }
  }

  if (strengthBimElementSelect) {
    renderStrengthBimElementOptions(nextId);
    strengthBimElementSelect.value = nextId;
  }
  if (strengthBimMarkEl) strengthBimMarkEl.value = element.mark || "";
  if (strengthBimAxesEl) strengthBimAxesEl.value = element.axes || "";

  strengthBimBindingSnapshot = buildStrengthBimBindingSnapshot({
    element,
    constructionType: targetConstruction
  });

  applyStrengthBimPrefillFromElement(element, { overwrite: false });
  renderStrengthBimBindingSnapshot();
  updateStrengthBimControlsState();
}

async function loadStrengthBimElements(projectId = getCurrentProjectId()) {
  const preservedBinding = collectStrengthBimCheckData();

  strengthBimElements = [];
  strengthBimElementsById.clear();
  selectedStrengthBimElementId = "";
  strengthBimBindingSnapshot = null;
  resetStrengthBimFilters();
  syncStrengthBimFilterControlsFromState();
  if (strengthBimMarkEl) strengthBimMarkEl.value = "";
  if (strengthBimAxesEl) strengthBimAxesEl.value = "";
  renderStrengthBimBindingSnapshot();
  renderStrengthBimFilterOptions();
  renderStrengthBimElementOptions("");

  if (!projectId || String(projectId).trim() === "") {
    updateStrengthBimControlsState();
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

    strengthBimElements = sortProjectBimElements(loadedElements);
    strengthBimElements.forEach((element) => {
      const key = element.elementId || element.id;
      if (key) strengthBimElementsById.set(key, element);
    });

    renderStrengthBimFilterOptions();
    renderStrengthBimElementOptions("");

    if (hasStrengthBimBindingData(preservedBinding || {})) {
      syncStrengthBimSelectionFromCheck(preservedBinding);
    } else {
      renderStrengthBimBindingSnapshot();
      updateStrengthBimControlsState();
    }
  } catch (error) {
    console.error("Ошибка загрузки BIM-элементов для прочности:", error);
    setStrengthBimStatus(BIM_LOAD_ERROR_MESSAGE, "error");
  }
}

function updateStrengthFieldsVisibility() {
  if (!construction) return;

  const flags = getStrengthConstructionFlags();
  const behavior = flags.behavior;
  const isPlate = flags.isPlate;
  const isStair = flags.isStair;
  const isColumn = flags.isColumn;
  const isBeam = flags.isBeam;
  const isWall = flags.isWall;
  const showLocationFields = behavior.locationMode === "plate_range" || flags.isPlate || flags.isStair;
  const message = getConstructionModuleFallbackMessage(
    getSelectedConstructionKey() || construction?.value || "",
    "strength",
    "",
    getSelectedConstructionSubtype()
  );
  const showUnsupportedOnlyMessage = flags.isUnsupported && isStrengthInfoOnlyUnsupportedSubtype();
  setStrengthUnsupportedOnlyDisplay(showUnsupportedOnlyMessage, message);

  if (flags.isUnsupported) {
    if (strengthBehaviorMessage) {
      strengthBehaviorMessage.hidden = false;
      strengthBehaviorMessage.textContent = message;
    }
    return true;
  }
  const isUnsupported = flags.isUnsupported;
  if (strengthBehaviorMessage) {
    strengthBehaviorMessage.hidden = true;
    strengthBehaviorMessage.textContent = "";
  }

  if (strengthFloorEl?.parentElement) {
    strengthFloorEl.parentElement.style.display = behavior.floorVisible === false ? "none" : "block";
  }
  if (strengthStairNameField) {
    strengthStairNameField.style.display = behavior.showStairName ? "block" : "none";
  }

  if (strengthLocationFields) {
    strengthLocationFields.style.display = showLocationFields ? "block" : "none";
  }

  if (strengthMarkingFields) {
    strengthMarkingFields.style.display = (isColumn || isBeam) ? "block" : "none";
  }
  if (strengthMarkingEl && !isColumn && !isBeam) {
    strengthMarkingEl.value = "";
  }

  if (strengthWallFields) {
    strengthWallFields.style.display = isWall && !showLocationFields ? "block" : "none";
  }
  if ((!isWall || showLocationFields) && strengthWallBindingTypeEl) {
    strengthWallBindingTypeEl.value = "letter_numbers";
    updateStrengthWallBindingDisplay();
  } else if (isWall) {
    updateStrengthWallBindingDisplay();
  }

  if (showLocationFields) {
    updateStrengthLocation();
  }

  if (isUnsupported) {
    setStrengthUnsupportedState();
  }

  renderStrengthBimBindingSnapshot();
  updateStrengthBimControlsState();
}

function validateStrengthMarking() {
  if (!construction) return true;

  const flags = getStrengthConstructionFlags();
  const isPlate = flags.isPlate;
  const isStair = flags.isStair;
  const isColumn = flags.isColumn;
  const isBeam = flags.isBeam;
  const isWall = flags.isWall;

  if (isPlate || isStair) {
    if (!strengthAxisLetterFromEl || !strengthAxisLetterToEl || !strengthAxisNumberFromEl || !strengthAxisNumberToEl) {
      return true;
    }

    const letterFrom = strengthAxisLetterFromEl.value;
    const letterTo = strengthAxisLetterToEl.value;
    const numberFrom = strengthAxisNumberFromEl.value;
    const numberTo = strengthAxisNumberToEl.value;

    if (!letterFrom || !letterTo || !numberFrom || !numberTo) {
      showNotification("Для плит и лестниц необходимо заполнить две буквенные и две цифровые оси.", "error");
      return false;
    }

    if (letterFrom === letterTo) {
      showNotification("Буквенные оси не должны повторяться.", "error");
      return false;
    }

    if (numberFrom === numberTo) {
      showNotification("Цифровые оси не должны повторяться.", "error");
      return false;
    }

    if (!isValidLetterAxis(letterFrom) || !isValidLetterAxis(letterTo)) {
      showNotification("Выбраны недопустимые буквенные оси.", "error");
      return false;
    }

    return true;
  }

  if (isColumn || isBeam) {
    if (!strengthMarkingEl) return true;

    const marking = normalizeMarking(strengthMarkingEl.value);
    if (!marking) {
      showNotification("Для колонн и балок необходимо указать маркировку (например, К 1.12 или БМ 1).", "error");
      return false;
    }

    const markingPattern = /^[А-ЯЁ]+(?:\s+\d+(?:\.\d+)?)?$/;
    if (!markingPattern.test(marking)) {
      showNotification("Маркировка должна быть в формате: буквы, пробел, цифры (например, К 1.12 или БМ 1).", "error");
      return false;
    }

    return true;
  }

  if (isWall) {
    if (!strengthWallBindingTypeEl) return true;

    const bindingType = strengthWallBindingTypeEl.value;

    if (bindingType === "letter_numbers") {
      if (!strengthWallLetterAxisEl || !strengthWallNumberAxis1El || !strengthWallNumberAxis2El) {
        return true;
      }

      const letterAxis = strengthWallLetterAxisEl.value;
      const numberAxis1 = strengthWallNumberAxis1El.value;
      const numberAxis2 = strengthWallNumberAxis2El.value;

      if (!letterAxis || !numberAxis1 || !numberAxis2) {
        showNotification(`Для ${getStrengthWallEntityPluralGenitive()} необходимо заполнить одну буквенную и две цифровые оси.`, "error");
        return false;
      }

      if (numberAxis1 === numberAxis2) {
        showNotification("Цифровые оси не должны повторяться.", "error");
        return false;
      }

      if (!isValidLetterAxis(letterAxis)) {
        showNotification("Выбрана недопустимая буквенная ось.", "error");
        return false;
      }
    } else {
      if (!strengthWallNumberAxisEl || !strengthWallLetterAxis1El || !strengthWallLetterAxis2El) {
        return true;
      }

      const numberAxis = strengthWallNumberAxisEl.value;
      const letterAxis1 = strengthWallLetterAxis1El.value;
      const letterAxis2 = strengthWallLetterAxis2El.value;

      if (!numberAxis || !letterAxis1 || !letterAxis2) {
        showNotification(`Для ${getStrengthWallEntityPluralGenitive()} необходимо заполнить одну цифровую и две буквенные оси.`, "error");
        return false;
      }

      if (letterAxis1 === letterAxis2) {
        showNotification("Буквенные оси не должны повторяться.", "error");
        return false;
      }

      if (!isValidLetterAxis(letterAxis1) || !isValidLetterAxis(letterAxis2)) {
        showNotification("Выбраны недопустимые буквенные оси.", "error");
        return false;
      }
    }

    return true;
  }

  return true;
}

/**
 * Чистая функция для вычисления статуса проверки прочности бетона
 * @param {Object} checkData - Данные проверки прочности
 * @returns {Object} - { status: "ok"|"exceeded"|"empty", summaryText: string }
 */
function evaluateStrengthCheck(checkData: StrengthCheckRecord) {
  const markVal = parseConcreteStrength(checkData.mark || checkData.markValue);
  const daysVal = parseDecimal(checkData.days);
  const actualVal = parseDecimal(checkData.actual);

  if (!markVal || markVal <= 0 || !daysVal || daysVal <= 0) {
    return { status: "empty", summaryText: "Не заполнено" };
  }

  if (actualVal == null) {
    return { status: "empty", summaryText: "Не заполнено" };
  }

  const norm = markVal * Math.log10(daysVal) / Math.log10(28);
  const ok = actualVal >= norm;

  return {
    status: ok ? "ok" : "exceeded",
    summaryText: ok ? "в норме" : "превышено"
  };
}

function saveStrengthChecks() {
  const payload = Array.from(strengthChecks.entries());
  const key = moduleStorageKey(getStorageKey());
  const projectId = getCurrentProjectId();
  console.log("[saveStrengthChecks] Сохранение проверок прочности, ключ:", key, "currentProjectId:", projectId, "количество:", payload.length);
  localStorage.setItem(key, JSON.stringify(payload));
}

async function loadStrengthChecks() {
  strengthChecks.clear();
  const projectId = getCurrentProjectId();
  console.log("[loadStrengthChecks] Загрузка проверок прочности, currentProjectId:", projectId);

  await loadStrengthBimElements(projectId);

  if (!projectId) {
    console.log("[loadStrengthChecks] currentProjectId отсутствует, пропускаем загрузку");
    return;
  }

  try {
    const snap = await getProjectCollectionSnapshot(projectId, "strengthChecks");
    console.log("[loadStrengthChecks] Загружено из Firestore проверок:", snap.size);
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;
      if (data.createdAt && data.createdAt.toMillis) {
        data.createdAt = data.createdAt.toMillis();
      }
      strengthChecks.set(id, { ...data, id });
    });

    saveStrengthChecks();
  } catch (e) {
    console.error("[loadStrengthChecks] Ошибка загрузки из Firestore:", e);
    const key = moduleStorageKey(getStorageKey());
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        console.log("[loadStrengthChecks] Загружено из localStorage проверок:", arr.length);
        arr.forEach(([id, data]) => strengthChecks.set(id, data));
      } catch (parseErr) {
        console.warn("[loadStrengthChecks] Ошибка парсинга localStorage:", parseErr);
      }
    }
  }
}

function renderStrengthChecks() {
  const list = document.getElementById("strengthChecksList");
  if (!list) return;
  list.innerHTML = "";

  if (!list.dataset.bound) {
    list.dataset.bound = "1";
    list.addEventListener("click", async (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const actionEl = target?.closest("[data-act]");
      if (!actionEl) return;

      const row = actionEl.closest(".node");
      const id = row?.dataset?.id;
      if (!id) return;

      const action = actionEl.dataset.act;
      if (action === "open") {
        loadStrengthCheck(id);
        return;
      }
      if (action === "del") {
        if (await showConfirm("Удалить эту проверку?")) {
          if (getCurrentStrengthCheckId() === id) setCurrentStrengthCheckId(null);
          strengthChecks.delete(id);
          saveStrengthChecks();
          renderStrengthChecks();
          updateSummary();

          const projectId = getCurrentProjectId();
          if (projectId) {
            try {
              await deleteProjectCollectionDoc(projectId, "strengthChecks", id);
              await deleteInspectionAndRefreshAnalytics(projectId, id);
            } catch (error) {
              console.error("[Strength] Ошибка удаления проверки из Firestore:", error);
            }
          }
        }
      }
    });
  }

  if (!strengthChecks.size) {
    list.innerHTML =
      '<div class="caption" style="padding:10px">Пока нет сохранённых проверок прочности.</div>';
    return;
  }

  const items = Array.from(strengthChecks.entries()).sort((a, b) => {
    const aConstruction = (a[1].construction || "").toString();
    const bConstruction = (b[1].construction || "").toString();
    const byConstruction = aConstruction.localeCompare(bConstruction, "ru", { sensitivity: "base" });
    if (byConstruction !== 0) return byConstruction;
    return (b[1].createdAt || 0) - (a[1].createdAt || 0);
  });

  const fragment = document.createDocumentFragment();
  let currentGroup = null;
  items.forEach(([id, d]) => {
    const groupLabel = d.constructionLabel || getConstructionLabel(d.construction, d.construction || "Без конструкции");
    if (groupLabel !== currentGroup) {
      currentGroup = groupLabel;
      const header = document.createElement("div");
      header.className = "caption strength-group-title";
      header.textContent = `Конструкция: ${groupLabel}`;
      fragment.appendChild(header);
    }

    const row = document.createElement("div");
    row.className = "node node-enhanced";
    row.dataset.id = id;

    let evaluation;
    if (d.status && d.status !== "empty" && d.status !== "ok" && d.status !== "exceeded") {
      evaluation = evaluateStrengthCheck(d);
    } else if (d.status) {
      evaluation = { status: d.status, summaryText: d.summaryText || "" };
    } else {
      evaluation = evaluateStrengthCheck(d);
    }

    let statusTag = "";
    if (evaluation.status === "exceeded") {
      statusTag = '<span class="tag bad">превышено</span>';
    } else if (evaluation.status === "ok") {
      statusTag = '<span class="tag ok">в норме</span>';
    } else {
      statusTag = '<span class="tag" style="background: #9ca3af; color: #1f2937; font-weight: 600;">не заполнено</span>';
    }

    row.innerHTML = `
      <div class="node-content">
        <div class="node-header">
          <div class="node-title">
            <span class="node-icon">💪</span>
            Проверка от ${fmtDate(d.createdAt || Date.now())}
          </div>
          <div class="node-header-controls">
            ${statusTag}
            ${buildNodeDeleteIconButton("Удалить проверку")}
          </div>
        </div>
        <div class="node-data">
          <div class="node-data-row">
            <span class="node-label">Класс/Марка:</span>
            <span class="node-values"><strong>${d.mark ? safeValue(d.mark) : "—"}</strong></span>
          </div>
          <div class="node-data-row">
            <span class="node-label">Дней:</span>
            <span class="node-values">${safeValue(d.days ?? "—")}</span>
          </div>
          <div class="node-data-row">
            <span class="node-label">Факт. прочность:</span>
            <span class="node-values"><strong>${formatNodeValue(d.actual, "МПа")}</strong></span>
          </div>
          ${d.floor ? `<div class="node-data-row"><span class="node-label">Этаж:</span><span class="node-values">${safeValue(d.floor)}</span></div>` : ""}
        </div>
      </div>
    `;
    row.classList.add("node-card-compact");
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    row.addEventListener("click", (event) => {
      if (event.target.closest('[data-act="del"]')) return;
      loadStrengthCheck(id);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest('[data-act="del"]')) return;
      event.preventDefault();
      loadStrengthCheck(id);
    });
    fragment.appendChild(row);
  });
  list.appendChild(fragment);
}

function loadStrengthCheck(id) {
  const d = strengthChecks.get(id);
  if (!d) return;
    if (window.setConstructionAndTrigger && d.construction) {
      window.setConstructionAndTrigger(d.construction || d.constructionType || "", d.constructionSubtype || "", d.constructionPileElement || "");
  } else if (construction && d.constructionType) {
    construction.value = d.constructionType;
  }
  updateStrengthFieldsVisibility();
  setCurrentStrengthCheckId(id);

  const flags = getStrengthConstructionFlags(d.construction || d.constructionType || "");
  const isPlate = flags.isPlate;
  const isStair = flags.isStair;
  const isColumn = flags.isColumn;
  const isBeam = flags.isBeam;
  const isWall = flags.isWall;

    if (isPlate || isStair || flags.behavior.locationMode === "plate_range") {
    if (strengthAxisLetterFromEl && d.axisLetterFrom) strengthAxisLetterFromEl.value = d.axisLetterFrom;
    if (strengthAxisLetterToEl && d.axisLetterTo) strengthAxisLetterToEl.value = d.axisLetterTo;
    if (strengthAxisNumberFromEl && d.axisNumberFrom) strengthAxisNumberFromEl.value = String(d.axisNumberFrom);
    if (strengthAxisNumberToEl && d.axisNumberTo) strengthAxisNumberToEl.value = String(d.axisNumberTo);
    updateStrengthLocation();
      if (strengthLocationEl && d.location && !strengthLocationEl.value) {
        strengthLocationEl.value = d.location;
      }
      if (strengthStairNameEl) strengthStairNameEl.value = d.stairName || "";
    }

  if (isColumn || isBeam) {
    if (strengthMarkingEl) strengthMarkingEl.value = d.marking || "";
  }

  if (isWall) {
    if (strengthWallBindingTypeEl && d.wallBindingType) {
      strengthWallBindingTypeEl.value = d.wallBindingType;
    }
    updateStrengthWallBindingDisplay();

    if (d.wallBindingType === "letter_numbers" || !d.wallBindingType) {
      if (strengthWallLetterAxisEl && d.wallLetterAxis) strengthWallLetterAxisEl.value = d.wallLetterAxis;
      if (strengthWallNumberAxis1El && d.wallNumberAxis1) strengthWallNumberAxis1El.value = String(d.wallNumberAxis1);
      if (strengthWallNumberAxis2El && d.wallNumberAxis2) strengthWallNumberAxis2El.value = String(d.wallNumberAxis2);
    } else {
      if (strengthWallNumberAxisEl && d.wallNumberAxis) strengthWallNumberAxisEl.value = String(d.wallNumberAxis);
      if (strengthWallLetterAxis1El && d.wallLetterAxis1) strengthWallLetterAxis1El.value = d.wallLetterAxis1;
      if (strengthWallLetterAxis2El && d.wallLetterAxis2) strengthWallLetterAxis2El.value = d.wallLetterAxis2;
    }
  }

  if (strengthFloorEl) strengthFloorEl.value = d.floor || "";
  if (mark) mark.value = d.mark ?? "";
  if (days) days.value = String(d.days ?? "");
  if (actual) actual.value = String(d.actual ?? "");

  if (strengthResult) {
    strengthResult.className = "result";
    if (d.status === "ok") strengthResult.classList.add("ok");
    if (d.status === "bad" || d.status === "exceeded") strengthResult.classList.add("not-ok");
    strengthResult.innerHTML = sanitizeHtml(d.lastMsg || "");
    strengthResult.style.display = strengthResult.innerHTML ? "block" : "none";
  }

  syncStrengthBimSelectionFromCheck(d);
  suppressStrengthAutoSaveOnce = true;
  runStrengthCheck();
}

function getNormativeStrength(markValue, daysValue) {
  const daysVal = parseDecimal(daysValue);
  if (!markValue || markValue <= 0 || !daysVal || daysVal <= 0) return null;
  if (daysVal < 1) return markValue * 0.2;
  if (daysVal >= 28) return markValue;
  return markValue * Math.log10(daysVal) / Math.log10(28);
}

async function saveStrengthCheck({ skipJournalOnce = false } = {}) {
  const projectId = getCurrentProjectId();
  if (!validateProject(projectId)) return;
  console.log("[btnSaveStrengthCheck] currentProjectId:", projectId);

  const existingId = getCurrentStrengthCheckId();
  const existing = existingId && strengthChecks.has(existingId)
    ? strengthChecks.get(existingId)
    : null;
  const id = existing ? existingId : `chk_${Date.now()}`;

  const constructionValue = getSelectedConstructionKey();
  const flags = getStrengthConstructionFlags(constructionValue || construction?.value || "");
  if (flags.isUnsupported) {
    setStrengthUnsupportedState({ notify: true });
    return;
  }
  const behavior = flags.behavior;
  if (behavior.floorRequired !== false && (!strengthFloorEl || !strengthFloorEl.value.trim())) {
    showNotification("Поле 'Этаж' обязательно для заполнения.", "error");
    return;
  }
  const isPlate = flags.isPlate;
  const isStair = flags.isStair;
  const isColumn = flags.isColumn;
  const isBeam = flags.isBeam;
  const isWall = flags.isWall;

  let location = null;
  let marking = null;
  let axisLetterFrom = null;
  let axisLetterTo = null;
  let axisNumberFrom = null;
  let axisNumberTo = null;
  let wallBindingType = null;
  let wallLetterAxis = null;
  let wallNumberAxis1 = null;
  let wallNumberAxis2 = null;
  let wallNumberAxis = null;
  let wallLetterAxis1 = null;
  let wallLetterAxis2 = null;

  if (isPlate || isStair || behavior.locationMode === "plate_range") {
      updateStrengthLocation();
      axisLetterFrom = strengthAxisLetterFromEl?.value || null;
      axisLetterTo = strengthAxisLetterToEl?.value || null;
    axisNumberFrom = strengthAxisNumberFromEl?.value || null;
    axisNumberTo = strengthAxisNumberToEl?.value || null;
    location = strengthLocationEl?.value || null;
  } else if (isColumn || isBeam) {
    marking = normalizeMarking(strengthMarkingEl?.value || "") || null;
    location = marking;
  } else if (isWall) {
    wallBindingType = strengthWallBindingTypeEl?.value || "letter_numbers";
    if (wallBindingType === "letter_numbers") {
      wallLetterAxis = strengthWallLetterAxisEl?.value || null;
      wallNumberAxis1 = strengthWallNumberAxis1El?.value || null;
      wallNumberAxis2 = strengthWallNumberAxis2El?.value || null;
      if (wallLetterAxis && wallNumberAxis1 && wallNumberAxis2) {
        location = `${wallLetterAxis}, ${wallNumberAxis1}-${wallNumberAxis2}`;
      }
    } else {
      wallNumberAxis = strengthWallNumberAxisEl?.value || null;
      wallLetterAxis1 = strengthWallLetterAxis1El?.value || null;
      wallLetterAxis2 = strengthWallLetterAxis2El?.value || null;
      if (wallNumberAxis && wallLetterAxis1 && wallLetterAxis2) {
        location = `${wallNumberAxis}, ${wallLetterAxis1}-${wallLetterAxis2}`;
      }
    }
  }

  const data: StrengthCheckRecord = {
    createdAt: existing?.createdAt || Date.now(),
    construction: constructionValue,
    constructionCategory: getSelectedConstructionCategory(),
    constructionLabel: getSelectedConstructionLabel(),
    constructionType: construction?.value || "",
    constructionSubtype: construction?.dataset?.subtypeKey || "",
    constructionSubtypeLabel: construction?.dataset?.subtypeLabel || "",
    constructionPileElement: construction?.dataset?.pileElementKey || "",
    constructionPileElementLabel: construction?.dataset?.pileElementLabel || "",
    ...collectStrengthBimCheckData(),
    floor: behavior.floorVisible === false ? null : (strengthFloorEl ? (strengthFloorEl.value.trim() || null) : null),
    location,
    marking,
    stairName: behavior.showStairName ? (strengthStairNameEl?.value.trim() || null) : null,
    axisLetterFrom,
    axisLetterTo,
    axisNumberFrom,
    axisNumberTo,
    wallBindingType,
    wallLetterAxis,
    wallNumberAxis1,
    wallNumberAxis2,
    wallNumberAxis,
    wallLetterAxis1,
    wallLetterAxis2,
    mark: mark?.value === "" ? null : mark.value.trim(),
    markValue: mark?.value === "" ? null : parseConcreteStrength(mark.value),
    days: days?.value === "" ? null : +days.value,
    actual: actual?.value === "" ? null : +actual.value
  };

  const evaluation = evaluateStrengthCheck(data);
  data.status = evaluation.status === "empty" ? "empty" : (evaluation.status === "ok" ? "ok" : "exceeded");
  data.summaryText = evaluation.summaryText;
  data.lastMsg = strengthResult?.innerHTML || "";

  data.projectId = projectId;
  data.module = "strength";
  const createdAtClient = existing?.createdAt || Date.now();
  data.createdAt = createdAtClient;

  strengthChecks.set(id, data);
  saveStrengthChecks();
  renderStrengthChecks();

  const skipJournal = skipJournalOnce || skipStrengthJournalOnce;
  skipStrengthJournalOnce = false;

  try {
    let finalId = id;
    if (existing) {
      const { ref: docRef } = await updateProjectCollectionDoc(projectId, "strengthChecks", id, data);
      notifyFirestoreSyncStatusSafe(docRef);
      console.log("[btnSaveStrengthCheck] Проверка обновлена в Firestore, docId:", finalId);
    } else {
      const created = await createProjectCollectionDoc(projectId, "strengthChecks", data);
      const docRef = created.ref;
      notifyFirestoreSyncStatusSafe(docRef);
      finalId = created.id;
      console.log("[btnSaveStrengthCheck] Проверка сохранена в Firestore, docId:", finalId, "localId:", id);

      if (finalId !== id) {
        strengthChecks.delete(id);
        strengthChecks.set(finalId, { ...data, id: finalId });
        saveStrengthChecks();
        renderStrengthChecks();
      }
    }

    setCurrentStrengthCheckId(finalId);

    try {
      await upsertStrengthInspectionDualWrite(projectId, finalId, data);
    } catch (dualWriteError) {
      console.warn("[DualWrite][strength] inspections upsert failed:", dualWriteError);
    }

    if (!skipJournal && data.status !== "empty") {
      const contextParts = [];
      if (data.floor) contextParts.push(`Этаж ${data.floor}`);
      if (data.days) contextParts.push(`день=${data.days}`);
      const context = contextParts.join(", ") || "Прочность бетона";

      const norm = data.markValue ? getNormativeStrength(data.markValue, data.days) : null;
      const actualValue = data.actual != null ? Number(data.actual) : null;
      const details = norm ? `норма=${norm.toFixed(1)} МПа; факт=${actualValue != null ? actualValue.toFixed(1) : "—"} МПа` : "Проверка прочности";

      await upsertJournalEntrySafe({
        module: "Прочность",
        status: data.status === "ok" ? "ok" : "exceeded",
        context: context,
        details: details,
        sourceId: finalId,
        construction: data.construction || getSelectedConstructionKey()
      });
    }
  } catch (err) {
    console.error("[btnSaveStrengthCheck] Ошибка сохранения в Firestore:", err);
    showNotification("Ошибка сохранения в Firestore.", "error");
  }

  updateSummary();
}

function clearStrengthForm() {
  setCurrentStrengthCheckId(null);
  clearStrengthBimSelection({ keepManualFields: false });
  if (strengthFloorEl) strengthFloorEl.value = "";
  if (mark) mark.value = "";
  if (days) days.value = "";
  if (actual) actual.value = "";
  if (strengthResult) {
    strengthResult.className = "result";
    strengthResult.innerHTML = "";
    strengthResult.style.display = "none";
  }
  if (chartRef) {
    chartRef.destroy();
    chartRef = null;
  }
  if (strengthCanvas) {
    strengthCanvas.style.display = "none";
  }
  const state = getState();
  const checked = getChecked();
  state.strength = false;
  checked.strength = false;
}

async function clearStrengthChecks() {
  if (!(await showConfirm("Удалить все сохранённые проверки прочности бетона для текущего проекта?"))) return;
  const projectId = getCurrentProjectId();
  if (!projectId) {
    showNotification("Сначала создайте объект или выберите существующий.", "warning");
    return;
  }

  console.log("[btnClearStrengthChecks] Очистка проверок прочности");
  console.log("[btnClearStrengthChecks] projectId:", projectId);
  console.log("[btnClearStrengthChecks] Путь Firestore: projects/" + projectId + "/strengthChecks");

  try {
    const deletedCount = await clearProjectCollection(projectId, "strengthChecks");
    const deletedDualWriteCount = await clearStrengthInspectionDualWrite(projectId);
    console.log("[btnClearStrengthChecks] Найдено документов в Firestore:", deletedCount);
    console.log("[btnClearStrengthChecks] Удалено документов из Firestore:", deletedCount);
    console.log("[btnClearStrengthChecks] Удалено документов dual-write из inspections:", deletedDualWriteCount);

    strengthChecks.clear();
    setCurrentStrengthCheckId(null);

    saveStrengthChecks();
    renderStrengthChecks();
    updateSummary();

    const state = getState();
    const checked = getChecked();
    if (state.strength) {
      state.strength = false;
      checked.strength = false;
    }

    showNotification("Сохранённые проверки прочности бетона удалены.", "success");
  } catch (e) {
    console.error("[btnClearStrengthChecks] Ошибка удаления из Firestore:", e);
    showNotification("Ошибка удаления проверок: " + e.message, "error");
  }
}

async function runStrengthCheck() {
  const projectId = getCurrentProjectId();
  if (!validateProject(projectId)) return;

  let shouldAutoSave = !suppressStrengthAutoSaveOnce;
  suppressStrengthAutoSaveOnce = false;
  let journalAdded = false;
  const scheduleAutoSave = () => {
    if (!shouldAutoSave) return;
    void saveStrengthCheck({ skipJournalOnce: journalAdded });
  };
  setTimeout(scheduleAutoSave, 0);
  const flags = getStrengthConstructionFlags();
  if (flags.isUnsupported) {
    shouldAutoSave = false;
    setStrengthUnsupportedState({ notify: true });
    return;
  }

  const floor = strengthFloorEl ? strengthFloorEl.value.trim() : "";
  if (!floor) {
    showNotification("Поле 'Этаж' обязательно для заполнения.", "error");
    if (strengthFloorEl) strengthFloorEl.focus();
    shouldAutoSave = false;
    return;
  }

  if (!validateStrengthMarking()) {
    shouldAutoSave = false;
    return;
  }

  const markVal = parseConcreteStrength(mark?.value);
  const daysVal = parseDecimal(days?.value);
  const actualVal = parseDecimal(actual?.value);
  const res = strengthResult;
  if (res) res.style.display = "block";

  if (!mark || !mark.value || markVal === null) {
    if (res) {
      res.className = "result not-ok";
      res.textContent = "Выберите класс бетона из списка.";
    }
    if (mark) mark.focus();
    const state = getState();
    const checked = getChecked();
    state.strength = false;
    checked.strength = false;
    shouldAutoSave = false;
    return;
  }

  const hasMarkDays = markVal > 0 && daysVal != null && daysVal > 0;
  const hasActual = actualVal != null;

  if (!hasMarkDays) {
    if (res) {
      res.className = "result not-ok";
      res.textContent = "Заполните проектную прочность и количество дней после бетонирования.";
    }
    const state = getState();
    const checked = getChecked();
    state.strength = false;
    checked.strength = false;
    shouldAutoSave = false;
    return;
  }

  const selectedClass = mark?.value || "";
  let classInfo = "";
  if (selectedClass) {
    const classMatch = selectedClass.match(/^([Bb]\d+\.?\d*)\(([Мм]\d+)\)$/);
    if (classMatch) {
      classInfo = `${classMatch[1]}(${classMatch[2]})`;
    } else {
      classInfo = selectedClass;
    }
  }

  const calculateNormStrength = (age, R28) => {
    if (age < 1) return R28 * 0.2;
    if (age >= 28) return R28;
    const lg28 = Math.log10(28);
    const lgAge = Math.log10(age);
    return R28 * (lgAge / lg28);
  };

  const norm = calculateNormStrength(daysVal, markVal);

  console.log("Расчет прочности:", {
    класс: classInfo || markVal + " МПа",
    R28: markVal,
    t: daysVal,
    lg_t: Math.log10(daysVal).toFixed(3),
    lg_28: Math.log10(28).toFixed(3),
    результат: norm.toFixed(1) + " МПа"
  });

  const labels = Array.from({ length: Math.max(7, daysVal) }, (_, i) => i + 1);
  const normData = labels.map((d) => calculateNormStrength(d, markVal));
  const factData = labels.map((d) =>
    hasActual && d === daysVal ? actualVal : null
  );

  if (renderStrengthChart(labels, normData, factData, hasActual)) {
    // график уже отрисован
  } else {
    if (strengthCanvas) {
      strengthCanvas.style.display = "none";
    }

    const loaded = await ensureChartJsLoaded();
    if (loaded && renderStrengthChart(labels, normData, factData, hasActual)) {
      // график успешно подгружен и отрисован, уведомление не нужно
    } else if (!window.chartJsWarningShown) {
      showNotification("Chart.js не загружен. График недоступен, но проверка прочности выполнена. Проверьте подключение к интернету для отображения графика.", "warning");
      window.chartJsWarningShown = true;
    }
  }

  const classInfoText = classInfo ? safeValue(classInfo) : `${markVal.toFixed(1)} МПа`;
  const safeDaysVal = safeValue(daysVal);
  if (!hasActual) {
    if (res) {
      res.className = "result";
      res.innerHTML = `
        <b>Проектный класс бетона:</b> ${classInfoText} (R28 = ${markVal.toFixed(1)} МПа)<br/>
        Нормативная прочность на ${safeDaysVal}-й день: <b>${norm.toFixed(1)} МПа</b> (${((norm / markVal) * 100).toFixed(1)}% от проектной)<br/>
        Фактическая прочность ещё не введена. Проверка соответствия будет выполнена после ввода фактического значения.<br/>
        <small style="color: #94a3b8; margin-top: 8px; display: block;">
          Расчет по формуле ГОСТ 18105-2018: R(t) = R28 × lg(t) / lg(28)<br/>
          где R28 = ${markVal.toFixed(1)} МПа (проектная прочность класса ${classInfoText})
        </small>
        ${renderRegulatoryBasisHtml({
          moduleKey: "strength",
          checkKind: getSelectedConstructionKey() || "default",
          subtype: getSelectedConstructionSubtype(),
          helpTargetId: "strengthHelpContent"
        })}
      `;
    }
    const state = getState();
    const checked = getChecked();
    state.strength = false;
    checked.strength = false;
    return;
  }

  const ok = actualVal >= norm;
  const percentNorm = (norm / markVal) * 100;
  const percentActual = (actualVal / markVal) * 100;

  if (res) {
    res.className = "result " + (ok ? "ok" : "not-ok");
    res.innerHTML = `
      <b>Проектный класс бетона:</b> ${classInfoText} (R28 = ${markVal.toFixed(1)} МПа)<br/>
      Нормативная прочность на ${safeDaysVal}-й день: <b>${norm.toFixed(1)} МПа</b> (${percentNorm.toFixed(1)}% от проектной)<br/>
      Фактическая прочность: <b>${actualVal.toFixed(1)} МПа</b> (${percentActual.toFixed(1)}% от проектной)<br/>
      <b>${ok ? "✅ Соответствует нормативу." : "❌ Недобор прочности."}</b><br/>
      <small style="color: #94a3b8; margin-top: 8px; display: block;">
        Расчет по формуле ГОСТ 18105-2018: R(t) = R28 × lg(t) / lg(28)<br/>
        где R28 = ${markVal.toFixed(1)} МПа (проектная прочность класса ${classInfoText}), t = ${safeDaysVal} дней
      </small>
      ${renderRegulatoryBasisHtml({
        moduleKey: "strength",
        checkKind: getSelectedConstructionKey() || "default",
        subtype: getSelectedConstructionSubtype(),
        helpTargetId: "strengthHelpContent"
      })}
    `;
  }
  const state = getState();
  const checked = getChecked();
  state.strength = ok;
  checked.strength = true;

  const floorForContext = strengthFloorEl ? strengthFloorEl.value.trim() : "";
  const contextParts = [];
  if (floorForContext) contextParts.push(`Этаж ${floorForContext}`);
  contextParts.push(`день=${daysVal}`);
  const context = contextParts.join(", ");

  addJournalEntrySafe({
    module: "Прочность",
    status: ok ? "соответствует" : "недобор",
    context: context,
    details: `норма=${norm.toFixed(1)} МПа; факт=${actualVal.toFixed(1)} МПа`,
    construction: getSelectedConstructionKey()
  });
  journalAdded = true;
}

function initStrengthHandlers() {
  const btnStrength = document.getElementById("btnStrength");
  if (btnStrength) {
    btnStrength.addEventListener("click", runStrengthCheck);
  }

  const btnSaveStrengthCheck = document.getElementById("btnSaveStrengthCheck");
  if (btnSaveStrengthCheck) {
    btnSaveStrengthCheck.addEventListener("click", () => {
      void saveStrengthCheck();
    });
  }

  const btnClearStrengthForm = document.getElementById("btnClearStrengthForm");
  if (btnClearStrengthForm) {
    btnClearStrengthForm.addEventListener("click", clearStrengthForm);
  }

  const btnClearStrengthChecks = document.getElementById("btnClearStrengthChecks");
  if (btnClearStrengthChecks) {
    btnClearStrengthChecks.addEventListener("click", () => {
      void clearStrengthChecks();
    });
  }

  if (strengthBimElementSelect) {
    strengthBimElementSelect.addEventListener("change", (event) => {
      const nextId = event.target?.value || "";
      if (nextId === "__empty__") return;
      applyStrengthBimElementSelection(nextId);
    });
  }

  if (strengthBimSearchInput) {
    strengthBimSearchInput.addEventListener("input", (event) => {
      strengthBimFilters.search = String(event.target?.value || "").trim();
      renderStrengthBimElementOptions();
      updateStrengthBimControlsState();
    });
  }

  if (strengthBimTypeFilter) {
    strengthBimTypeFilter.addEventListener("change", (event) => {
      strengthBimFilters.type = normalizeStrengthBimFilterValue(event.target?.value, "all");
      renderStrengthBimElementOptions();
      updateStrengthBimControlsState();
    });
  }

  if (strengthBimAxesFilter) {
    strengthBimAxesFilter.addEventListener("change", (event) => {
      strengthBimFilters.axes = normalizeStrengthBimFilterValue(event.target?.value, "all");
      renderStrengthBimElementOptions();
      updateStrengthBimControlsState();
    });
  }

  if (btnClearStrengthBimSelection) {
    btnClearStrengthBimSelection.addEventListener("click", () => {
      clearStrengthBimSelection({ keepManualFields: true });
      setStrengthBimStatus("BIM-привязка снята. Текущие значения в форме сохранены для ручного редактирования.", "info");
    });
  }

  [
    strengthFloorEl,
    strengthBimMarkEl,
    strengthBimAxesEl,
    strengthMarkingEl
  ].forEach((fieldEl) => {
    if (!fieldEl) return;
    fieldEl.addEventListener("input", () => {
      updateStrengthStaticBimHighlights();
    });
  });

  if (construction) {
    construction.addEventListener("change", updateStrengthFieldsVisibility);
  }
}

export function initStrengthModule() {
  if (strengthInitialized) return;
  strengthInitialized = true;

  onAppTabActivated("strength", renderStrengthBimVisualPanel);
  initStrengthAxes();
  initStrengthLocationListeners();
  renderStrengthBimFilterOptions();
  renderStrengthBimElementOptions("");
  renderStrengthBimBindingSnapshot();
  updateStrengthBimControlsState();
  initStrengthHandlers();
  void loadStrengthBimElements(getCurrentProjectId());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateStrengthFieldsVisibility);
  } else {
    updateStrengthFieldsVisibility();
  }
}

export {
  updateStrengthFieldsVisibility,
  loadStrengthChecks,
  saveStrengthChecks,
  renderStrengthChecks,
  loadStrengthCheck,
  saveStrengthCheck,
  clearStrengthChecks,
  clearStrengthForm,
  loadStrengthBimElements,
  renderStrengthBimVisualPanel
};
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

function getStrengthWallEntityPluralGenitive() {
  return getConstructionEntityLabels(getSelectedConstructionKey(), "strength", getSelectedConstructionSubtype()).pluralGenitive;
}

function getStrengthConstructionProfile(value = getSelectedConstructionKey() || construction?.value || "") {
  return getConstructionProfile(value, "strength");
}

function getStrengthConstructionFlags(value = getSelectedConstructionKey() || construction?.value || "") {
  const behavior = getConstructionModuleBehavior(value, "strength", getSelectedConstructionSubtype());
  const profile = behavior.profile || getStrengthConstructionProfile(value);
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

function isStrengthInfoOnlyUnsupportedSubtype() {
  const registryStatus = getInspectionStatus(
    getSelectedConstructionKey() || construction?.value || "",
    "strength",
    getSelectedConstructionSubtype()
  );
  return registryStatus === "factory" || registryStatus === "notApplicable";
}

function setStrengthUnsupportedOnlyDisplay(show, message = "") {
  if (strengthUnsupportedOnlyMessage) {
    strengthUnsupportedOnlyMessage.hidden = !show;
    strengthUnsupportedOnlyMessage.textContent = show ? message : "";
  }
  strengthWorkAreaElements.forEach((element) => {
    element.style.display = show ? "none" : "";
  });
}

function setStrengthUnsupportedState({ notify = false } = {}) {
  const message = getConstructionModuleFallbackMessage(
    getSelectedConstructionKey() || construction?.value || "",
    "strength",
    "",
    getSelectedConstructionSubtype()
  );
  const showOnlyUnsupportedMessage = isStrengthInfoOnlyUnsupportedSubtype();
  if (strengthResult) {
    strengthResult.className = "result";
    strengthResult.textContent = showOnlyUnsupportedMessage ? "" : message;
    strengthResult.style.display = showOnlyUnsupportedMessage ? "none" : "block";
  }
  if (strengthBehaviorMessage) {
    strengthBehaviorMessage.hidden = false;
    strengthBehaviorMessage.textContent = message;
  }
  const state = getState();
  const checked = getChecked();
  state.strength = false;
  checked.strength = false;
  if (notify) {
    showNotification(message, "warning");
  }
  return message;
}
