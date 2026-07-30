import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

import {
  getProjectDocSnapshot,
  getUserDocSnapshot,
  mergeProjectDoc
} from "./app/repositories/firestore-repository.js";
import { initAuthBootstrap, initStaticBootstrap } from "./app/bootstrap.js";
import { createIfcImportRuntime } from "./app/ifc-import-runtime.js";
import {
  getConstructionModuleBehavior,
  getConstructionModuleFallbackMessage,
  getConstructionProfile,
  getConstructionSelectionState,
  isConstructionSupportedInModule,
  normalizeConstructionKey
} from "./app/construction.js";
import { evaluateReinfCheck } from "./app/inspection-evaluation.js";
import { hasInspectionField } from "./app/inspection-registry.js";
import { applyLaunchParamsFromUrl } from "./app/launch-params.js";
import { createAppModuleBridge } from "./app/module-bridge.js";
import { createProfileRuntime } from "./app/profile/runtime.js";
import {
  createConstructionSelectionRuntime,
  createProjectDesignAutosave,
  createProjectRuntime,
  readStoredProjectId,
  saveProjectDesignToProject,
  writeStoredProjectId
} from "./features/projects/index.js";
import {
  createGeodesyDomBindings,
  createGeodesyRuntime,
  createGeodesyState,
  createFirestoreGeodesyService
} from "./features/inspections/geodesy/index.js";
import {
  createFirestoreStrengthService,
  createStrengthState,
  setCurrentStrengthCheckId
} from "./features/inspections/strength/index.js";
import { getCurrentIfcFileFromInput } from "./app/services/bim-runtime-context.js";
import { initDatepickerStyles } from "./app/ui/datepicker.js";
import {
  initIfcBindings,
  initProjectSelectorBinding
} from "./app/ui-bindings.js";
import {
  APP_STORAGE_KEYS as LS
} from "./app/storage.js";
import {
  initActionMenus,
  initDecimalInputNormalization,
  initNetworkStatus
} from "./app/ui/system-ui.js";
import { initSettingsPanel, initThemeControls } from "./app/ui/theme.js";
import { APP_CONFIG, REGULATORY_DOCS, TOLERANCES, UI_TEXT } from "./config.js";
import type { JournalEntryRecord, JournalViewEntry } from "./types/module-records.js";
import {
  defaultNumbers,
  defaultRusLetters,
  escapeHtml,
  isValidLetterAxis,
  sanitizeHtml,
  selfTestEscapeHtml,
  showConfirm,
  showNotification,
} from "./utils.js";

const safeValue = (value) => escapeHtml(value == null ? "" : String(value));
type JournalFilterValue = string | null;

const isLocalDebugHost =
  location.hostname === "localhost" || location.hostname === "127.0.0.1";

if (isLocalDebugHost && !selfTestEscapeHtml()) {
  console.warn("[security] escapeHtml self-test failed");
}

const auth = getAuth();
const PENDING_WELCOME_KEY = "pending_welcome_message";
const PENDING_WELCOME_NEW_USER = "new_user";

let currentUserId: string | null = null;
let currentProjectId: string | null = readStoredProjectId();

let journal: JournalViewEntry[] = [];
let journalEntries: JournalEntryRecord[] = [];
let journalFilteredEntries: JournalEntryRecord[] = [];
let journalFilterModule: JournalFilterValue = null;
let journalFilterConstruction: JournalFilterValue = null;
let ifcImportRuntime: ReturnType<typeof createIfcImportRuntime> | null = null;
let geodesyRuntimeRef: ReturnType<typeof createGeodesyRuntime> | null = null;
let geoNodesRegistry: ReturnType<typeof createGeodesyState>["nodes"] | null =
  null;

function setCurrentProjectIdState(projectId) {
  currentProjectId = writeStoredProjectId(projectId);
  if (typeof syncIfcImportControls === "function") {
    syncIfcImportControls();
  }
  geodesyRuntimeRef?.bim.updateControls();
  return currentProjectId;
}

function syncIfcImportControls() {
  return ifcImportRuntime?.syncIfcImportControls();
}

function isIfcOperationInFlight() {
  return ifcImportRuntime?.isIfcOperationInFlight() || false;
}

function setBimImportStatus(message, tone = "") {
  return ifcImportRuntime?.setBimImportStatus(message, tone);
}

function handleIfcImport() {
  return ifcImportRuntime?.handleIfcImport();
}

function handleIfcImportDelete() {
  return ifcImportRuntime?.handleIfcImportDelete();
}

function toggleIfcActionsMenu() {
  return ifcImportRuntime?.toggleIfcActionsMenu();
}

function closeIfcActionsMenu() {
  return ifcImportRuntime?.closeIfcActionsMenu();
}

function clearPendingIfcSelection() {
  return ifcImportRuntime?.clearPendingIfcSelection();
}

function positionIfcActionsMenu() {
  return ifcImportRuntime?.positionIfcActionsMenu();
}

// ============================
//  Ссылки на элементы DOM
// ============================
const constructionCategory = document.getElementById("constructionCategory") as HTMLSelectElement | null;
const constructionTypeSelect = document.getElementById("constructionType") as HTMLSelectElement | null;
const constructionSubtypeSelect = document.getElementById("constructionSubtype") as HTMLSelectElement | null;
const constructionSubtypeShell = document.getElementById("constructionSubtypeShell");
const constructionSubtypeLabelEl = document.getElementById("constructionSubtypeLabel");
const constructionPileElementSelect = document.getElementById("constructionPileElement") as HTMLSelectElement | null;
const constructionPileElementShell = document.getElementById("constructionPileElementShell");
const constructionPileElementLabelEl = document.getElementById("constructionPileElementLabel");
const construction        = document.getElementById("construction") as HTMLSelectElement | null;
const constructionFieldShell = document.getElementById("constructionFieldShell");
const dateInput           = document.getElementById("date");

const projectSelector     = document.getElementById("projectSelector");
const headerProfileButton = document.getElementById("headerProfileButton");
const headerProfileAvatar = document.getElementById("headerProfileAvatar");
const ifcFileInput        = document.getElementById("ifcFileInput");
const btnImportIfc        = document.getElementById("btnImportIfc");
const btnClearIfcImport   = document.getElementById("btnClearIfcImport");
const btnChooseAnotherIfc = document.getElementById("btnChooseAnotherIfc");
const btnResetSelectedIfc = document.getElementById("btnResetSelectedIfc");
const btnIfcMoreActions   = document.getElementById("btnIfcMoreActions");
const ifcActionsMenu      = document.getElementById("ifcActionsMenu");
const bimImportFileState  = document.getElementById("bimImportFileState");
const bimImportStatus     = document.getElementById("bimImportStatus");
const bimImportedIfcCount = document.getElementById("bimImportedIfcCount");

// Отладочные запросы отключены

const geodesyDom = createGeodesyDomBindings(document);
const {
  btnClearNodes,
  btnGeo,
  btnSaveNode,
  btnUpdateNode,
  btnClearForm,
  btnGeoColumns,
  btnGeoWalls,
  btnGeoBeams,
  columnMarkEl,
  columnMarkField,
  columnsBlock,
  columnsList,
  btnAddColumn,
  wallsBlock,
  wallsList,
  btnAddWall,
  geoWallsLimitLabel,
  beamsBlock,
  beamsList,
  btnAddBeam,
  axisFields,
  geoStripAxisModeField,
  geoStripAxisModeEl,
  axisLetterSingleField,
  axisNumberSingleField,
  axisLetterFromField,
  axisLetterToField,
  axisNumberFromField,
  axisNumberToField,
  coordinatesBlock,
  projHField,
  factHField,
  tolHField,
  floorEl,
  axisLetterEl,
  axisNumberEl,
  axisLetterFromEl,
  axisLetterToEl,
  axisNumberFromEl,
  axisNumberToEl,
  nodeIdField,
  nodeIdEl,
  geoResult,
  geoBimSearchInput,
  geoBimTypeFilter,
  geoBimAxesFilter,
  geoBimElementSelect,
  geoBimElementStatus,
  geoBimSourceCard,
  geoBimSourceTitle,
  geoBimSourceState,
  geoBimSourceMeta,
  geoBimAppliedTypeEl,
  geoBimAppliedProjXEl,
  geoBimAppliedProjYEl,
  geoBimAppliedProjHEl,
  geoBimAppliedMarkEl,
  geoBimAppliedAxesEl,
  geoBimSourceHint,
  geoBimMarkEl,
  geoBimAxesEl,
  btnClearGeoBimSelection,
  geoManualAssistNote,
  geoBimPanelHost,
  geoPlateOpeningPointsField,
  geoPlateOpeningPointsList,
  btnAddGeoPlateOpeningPoint,
  geoBehaviorMessage,
  geoStairNameField,
  geoStairNameEl,
  geoPlateFlatnessField,
  geoPlateFlatnessCheckedEl,
  geoPlateFlatnessActualEl,
  geoPlateFlatnessBaseEl,
  geoPlateFlatnessClassEl,
  geoPlateFlatnessToleranceEl,
  projX,
  factX,
  projY,
  factY,
  projH,
  factH,
  geoElementsTrigger,
  geoCoordinatesTrigger,
  nodesList
} = geodesyDom;

// ============================
//  Состояние модулей
// ============================
const state = {
  geo:           false,
  reinforcement: false,
  geometry:      false,
  strength:      false
};

// какие модули реально проверялись
const checked = {
  geo:           false,
  reinforcement: false,
  geometry:      false,
  strength:      false
};

// ============================
//  Сохранённые проверки модулей
// ============================
const reinfChecks = globalThis.reinfChecks instanceof Map ? globalThis.reinfChecks : new Map();
let currentReinfCheckId = null;
const geomChecks = globalThis.geomChecks instanceof Map ? globalThis.geomChecks : new Map();
let currentGeomCheckId = null;
const strengthState = createStrengthState();
const strengthChecks = strengthState.checks;

const constructionSelectionRuntime = createConstructionSelectionRuntime({
  construction,
  category: constructionCategory,
  type: constructionTypeSelect,
  subtype: constructionSubtypeSelect,
  subtypeShell: constructionSubtypeShell,
  subtypeLabel: constructionSubtypeLabelEl,
  pileElement: constructionPileElementSelect,
  pileElementShell: constructionPileElementShell,
  pileElementLabel: constructionPileElementLabelEl
});
const {
  buildCurrentConstructionPayload,
  getCurrentConstructionCategoryKey,
  getCurrentConstructionKey,
  getCurrentConstructionLabel,
  getCurrentConstructionSubtype,
  getCurrentPileElement,
  initializeConstructionControls,
  syncConstructionSelectionState
} = constructionSelectionRuntime;

const geodesyService = createFirestoreGeodesyService({
  getCurrentUserId: () => currentUserId,
  getCurrentConstructionKey,
  getCurrentConstructionCategoryKey,
  getCurrentConstructionLabel,
  getCurrentConstructionType: () => construction?.value || ""
});
const strengthService = createFirestoreStrengthService({
  getCurrentUserId: () => currentUserId
});
const geodesyNodeState = createGeodesyState();
const nodes = geodesyNodeState.nodes;
const bimElements = geodesyNodeState.bimElements;
geoNodesRegistry = nodes;

function getGeoConstructionProfile(value = getCurrentConstructionKey()) {
  return getConstructionProfile(value, "geo");
}

function getGeoConstructionFlags(value = getCurrentConstructionKey()) {
  const behavior = getConstructionModuleBehavior(value, "geo", getCurrentConstructionSubtype());
  const profile = getGeoConstructionProfile(value);
  const locationMode = behavior.locationMode || "single_axis";
  return {
    profile,
    behavior,
    isPlate: profile === "plate",
    isColumn: profile === "column",
    isWall: profile === "wall",
    isBeam: profile === "beam",
    isStair: profile === "stair",
    isUnsupported: behavior.supported === false || profile === "unsupported",
    isRangeLocation: locationMode === "plate_range" || locationMode === "strip_foundation",
    isSingleAxis: locationMode === "single_axis",
    isStripFoundation: locationMode === "strip_foundation",
    floorVisible: behavior.floorVisible !== false,
    showOpeningPoints: behavior.showOpeningPoints === true,
    showStairName: behavior.showStairName === true,
    showGeoFlatnessCheck: behavior.showGeoFlatnessCheck === true,
    usesColumnsSheet: behavior.elementSheetMode === "columns",
    usesWallsSheet: behavior.elementSheetMode === "walls",
    usesBeamsSheet: behavior.elementSheetMode === "beams",
    maxWalls: behavior.maxWalls ?? APP_CONFIG.MAX_ELEMENTS
  };
}

const profileRuntime = createProfileRuntime({
  headerProfileButton,
  headerProfileAvatar: headerProfileAvatar as HTMLImageElement | null,
  getUserDocSnapshot
});
const loadCurrentUserEngineerName = profileRuntime.loadCurrentUserEngineerName;
const getEngineerValue = profileRuntime.getEngineerValue;

// Армирование
const reinfStairNameEl      = document.getElementById("reinfStairName");
const reinfStairNameField   = document.getElementById("reinfStairNameField");
const reinfFloorEl          = document.getElementById("reinfFloor");
const reinfAxisLetterFromEl = document.getElementById("reinfAxisLetterFrom");
const reinfAxisLetterToEl   = document.getElementById("reinfAxisLetterTo");
const reinfAxisNumberFromEl = document.getElementById("reinfAxisNumberFrom");
const reinfAxisNumberToEl   = document.getElementById("reinfAxisNumberTo");
const reinfLocationEl       = document.getElementById("reinfLocation");
const reinfLocationFields   = document.getElementById("reinfLocationFields");
const reinfColumnFields    = document.getElementById("reinfColumnFields");
const reinfColumnFloorEl    = document.getElementById("reinfColumnFloor");
const reinfColumnsList     = document.getElementById("reinfColumnsList");
const reinfBeamFields      = document.getElementById("reinfBeamFields");
const reinfBeamFloorEl     = document.getElementById("reinfBeamFloor");
const reinfBeamsList       = document.getElementById("reinfBeamsList");
const reinfWallFields      = document.getElementById("reinfWallFields");
const reinfWallFloorEl      = document.getElementById("reinfWallFloor");
const reinfWallsList       = document.getElementById("reinfWallsList");
const reinfCommonFields    = document.getElementById("reinfCommonFields");
const projDia     = document.getElementById("projDia");
const factDia     = document.getElementById("factDia");
const projStep    = document.getElementById("projStep");
const factStep    = document.getElementById("factStep");
const projCover   = document.getElementById("projCover");
const factCover   = document.getElementById("factCover");
const reinfResult = document.getElementById("reinforcementResult");

// ============================
//  Утилиты для работы с числами
// ============================

/**
 * Парсит строковое значение в число, поддерживая как точку, так и запятую в качестве разделителя
 * @param {string|number|null|undefined} value - Значение для парсинга
 * @returns {number|null} - Распарсенное число или null, если значение пустое или невалидное
 */
function parseDecimal(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  
  // Если уже число, возвращаем как есть
  if (typeof value === "number") {
    return isNaN(value) ? null : value;
  }
  
  // Преобразуем в строку и нормализуем (запятая -> точка)
  const str = String(value).trim().replace(",", ".");
  
  // Парсим
  const num = parseFloat(str);
  
  // Возвращаем null для NaN, иначе число
  return isNaN(num) ? null : num;
}

// Геометрия
const projThick       = document.getElementById("projThick");

// Прочность
const strengthFloorEl = document.getElementById("strengthFloor");
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
const mark           = document.getElementById("mark");
const days           = document.getElementById("days");
const actual         = document.getElementById("actual");
const strengthResult = document.getElementById("strengthResult");

// Итог
// ============================
//  Блокировка / разблокировка модулей
// ============================
let setModulesEnabled = (_enabled) => {};

// ============================
//  Тема (dark / light)
// ============================
initThemeControls();
initSettingsPanel();

// ============================
//  Константы допусков
// ============================
// ============================
//  Наборы осей
// ============================

construction.addEventListener("change", () => {
  // Сохраняем выбранную конструкцию в localStorage
  if (getCurrentConstructionKey()) {
    localStorage.setItem("selected_construction", getCurrentConstructionKey());
  }
  // Смена конструкции должна начинать новую проверку в каждом модуле
  currentReinfCheckId = null;
  currentGeomCheckId = null;
  setCurrentStrengthCheckId(strengthState, null);
  updateReinfLocationFieldsVisibility(true); // Передаём true для сброса при изменении
  geodesyRuntime.updateGeoFieldsVisibility();
  updateGeomFieldsVisibility();
  updateStrengthFieldsVisibility();
  // Обновляем вкладку "Итог" при изменении конструкции
  updateSummaryTab();
});

// ============================
//  Управление колоннами и балками в разделе армирования
// ============================
// Shared state for geo nodes and plate opening points remains in app bootstrap.



// ============================
//  Дата
// ============================
dateInput.valueAsDate = new Date();

// Стилизация попапа календаря
initDatepickerStyles();

const geodesyRuntime = createGeodesyRuntime({
  state: geodesyNodeState,
  service: geodesyService,
  dom: geodesyDom,
  construction: construction as HTMLElement,
  constructionFieldShell,
  storage: localStorage,
  storageKey: LS.nodes,
  inspectionState: state,
  inspectionChecked: checked,
  getCurrentProjectId: () => currentProjectId,
  getCurrentConstructionKey,
  getCurrentConstructionLabel,
  getCurrentConstructionSubtype,
  getCurrentPileElement,
  getGeoConstructionFlags,
  setConstructionAndTrigger,
  buildCurrentConstructionPayload,
  getCurrentIfcFile: () => getCurrentIfcFileFromInput(ifcFileInput),
  resetImportedModelState: () =>
    ifcImportRuntime?.resetImportedModelState(),
  syncIfcImportControls,
  saveMeta,
  cancelProjectDesignAutosave: () => projectDesignAutosave.cancel(),
  saveProjectDesign: () => saveProjectDesignToFirestore(),
  updateSummaryTab: () => appModuleBridge.updateSummaryTab(),
  upsertJournalEntry: (payload) => appModuleBridge.upsertJournalEntry(payload),
  safeValue,
  showConfirm,
  showNotification
});
geodesyRuntimeRef = geodesyRuntime;
geodesyRuntime.start();

if (construction) {
  const savedConstruction = localStorage.getItem("selected_construction");
  initializeConstructionControls(savedConstruction || APP_CONFIG.DEFAULT_CONSTRUCTION);
}
construction.addEventListener(
  "change",
  geodesyRuntime.updateGeoFieldsVisibility
);
geodesyRuntime.updateGeoFieldsVisibility();

// Функция для переключения конструкции и вызова обработчиков
function setConstructionAndTrigger(constructionType, constructionSubtype = "", constructionPileElement = "") {
  if (!construction) {
    console.error("Элемент construction не найден");
    return false;
  }

  const resolvedConstruction = normalizeConstructionKey(constructionType);
  const nextConstructionValue = resolvedConstruction || constructionType;
  const selectionState = getConstructionSelectionState(nextConstructionValue, "floor_slab", constructionSubtype);
  const options = Array.from(construction.options);
  if (!resolvedConstruction && !options.some((opt) => opt.value === constructionType)) {
    console.error(`Конструкция "${constructionType}" не найдена в списке options`);
    return false;
  }
  const hasOption = options.some((opt) => opt.value === selectionState.legacyType);

  if (!hasOption) {
    console.error(`Конструкция "${constructionType}" не найдена в списке options`);
    return false;
  }

  syncConstructionSelectionState(nextConstructionValue, {
    syncVisibleControls: true,
    nextSubtypeValue: selectionState.subtypeKey,
    nextPileElementValue: constructionPileElement || getCurrentPileElement()
  });
  localStorage.setItem("selected_construction", selectionState.key);

  // Используем тот же путь, что и при ручном выборе конструкции.
  construction.dispatchEvent(new Event("change", { bubbles: true }));

  return true;
}

function updateReinfLocationFieldsVisibility(shouldReset = true) {
  return appModuleBridge.updateReinfLocationFieldsVisibility(shouldReset);
}

function checkReinfColumnDuplicate(marking, excludeId = null) {
  return appModuleBridge.checkReinfColumnDuplicate(marking, excludeId);
}

function removeReinfColumn(id) {
  return appModuleBridge.removeReinfColumn(id);
}

function renderReinfColumns() {
  return appModuleBridge.renderReinfColumns();
}

function checkReinfBeamDuplicate(marking, excludeId = null) {
  return appModuleBridge.checkReinfBeamDuplicate(marking, excludeId);
}

function removeReinfBeam(id) {
  return appModuleBridge.removeReinfBeam(id);
}

function renderReinfBeams() {
  return appModuleBridge.renderReinfBeams();
}

function checkReinfWallDuplicate(
  bindingType,
  numberAxis,
  letterAxis1,
  letterAxis2,
  letterAxis,
  numberAxis1,
  numberAxis2,
  excludeId = null
) {
  return appModuleBridge.checkReinfWallDuplicate(
    bindingType,
    numberAxis,
    letterAxis1,
    letterAxis2,
    letterAxis,
    numberAxis1,
    numberAxis2,
    excludeId
  );
}

function bindReinfWallButton() {
  return appModuleBridge.bindReinfWallButton();
}

function removeReinfWall(id) {
  return appModuleBridge.removeReinfWall(id);
}

function saveReinfWallsDraft() {
  return appModuleBridge.saveReinfWallsDraft();
}

function loadReinfWallsDraft() {
  return appModuleBridge.loadReinfWallsDraft();
}

function renderReinfWalls() {
  return appModuleBridge.renderReinfWalls();
}

function updateStrengthFieldsVisibility() {
  return appModuleBridge.updateStrengthFieldsVisibility();
}

const appModuleBridge = createAppModuleBridge({
  strength: {
    state: strengthState,
    service: strengthService,
    inspectionState: state,
    inspectionChecked: checked,
    getCurrentProjectId: () => currentProjectId,
    showNotification
  },
  journalGeodesy: {
    nodes,
    saveNodes: geodesyRuntime.saveNodes,
    renderNodes: geodesyRuntime.renderNodes,
    loadNode: geodesyRuntime.loadNode,
    resetCurrentNodeKeys: geodesyRuntime.resetCurrentNodeKeys,
    clearCurrentNodeKey: geodesyRuntime.clearCurrentNodeKey,
    resetInspectionStatus: () => {
      state.geo = false;
      checked.geo = false;
    }
  },
  onJournalTabActivated: () => {
    journalFilterModule = null;
    journalFilterConstruction = null;
    appModuleBridge.applyJournalFilter();
    appModuleBridge.renderJournal();
  }
});

const {
  loadJournal,
  saveJournal,
  renderJournal,
  loadJournalSessionsForProject,
  loadJournalFromFirestore,
  applyJournalFilter,
  setJournalFilters,
  addJournalEntry,
  upsertJournalEntry,
  notifyFirestoreSyncStatus,
  withGeometryModule,
  loadGeomChecks,
  saveGeomChecks,
  renderGeomChecks,
  loadGeomCheck,
  updateGeomFieldsVisibility,
  refreshGeometryBimElementsIfLoaded,
  refreshReinforcementBimElementsIfLoaded,
  loadReinfChecks,
  saveReinfChecks,
  renderReinfChecks,
  loadReinfCheck,
  clearReinfForm,
  loadStrengthChecks,
  saveStrengthChecks,
  renderStrengthChecks,
  loadStrengthCheck,
  clearStrengthForm,
  refreshStrengthBimElementsIfLoaded,
  updateSummaryTab
} = appModuleBridge;

applyLaunchParamsFromUrl({
  setConstructionAndTrigger
});
appModuleBridge.initNavigation();
updateGeomFieldsVisibility();


// ============================
//  Мета формы + автосохранение
// ============================
const projectDesignAutosave = createProjectDesignAutosave({
  delayMs: 500,
  canSchedule: () => !!currentProjectId,
  onSave: () => saveProjectDesignToFirestore(),
  onError: (err) => console.error("Ошибка автосохранения проекта:", err)
});

function scheduleProjectDesignSave() {
  projectDesignAutosave.schedule();
}

async function saveProjectDesignToFirestore() {
  if (!currentProjectId) return;

  return saveProjectDesignToProject({
    projectId: currentProjectId,
    currentUserId,
    getProjectDocSnapshot,
    mergeProjectDoc,
    parseDecimal,
    getEngineerValue,
    projectNameValue: "",
    dateValue: String(dateInput?.value || ""),
    constructionValue: String(getCurrentConstructionKey() || ""),
    inputs: {
      projX: projX as HTMLInputElement | null,
      projY: projY as HTMLInputElement | null,
      projH: projH as HTMLInputElement | null,
      projDia: projDia as HTMLInputElement | null,
      projStep: projStep as HTMLInputElement | null,
      projCover: projCover as HTMLInputElement | null,
      projThick: projThick as HTMLInputElement | null,
      mark: mark as HTMLInputElement | HTMLSelectElement | null
    }
  });
}

function saveMeta() {
  const axisState = geodesyRuntime.getGeoAxisState(construction.value || "");
  const meta = {
    date:         dateInput.value || "",
    construction: getCurrentConstructionKey() || "",
    floor:        floorEl.value || "",
    letter:       axisLetterEl.value,
    number:       axisNumberEl.value,
    letterFrom:   axisState.isPlate ? axisState.letterFrom : "",
    letterTo:     axisState.isPlate ? axisState.letterTo : "",
    numberFrom:   axisState.isPlate ? axisState.numberFrom : "",
    numberTo:     axisState.isPlate ? axisState.numberTo : ""
  };
  localStorage.setItem(LS.meta, JSON.stringify(meta));
  scheduleProjectDesignSave();
}

function loadMeta() {
  const raw = localStorage.getItem(LS.meta);
  if (!raw) return;
  try {
    const m = JSON.parse(raw);
    if (m.date)         dateInput.value     = m.date;
    if (m.construction) setConstructionAndTrigger(m.construction);
    if (m.floor)        floorEl.value       = m.floor;
    if (m.letter && isValidLetterAxis(m.letter))
      axisLetterEl.value = m.letter;
    if (m.number && defaultNumbers.includes(m.number))
      axisNumberEl.value = m.number;
    if (m.letterFrom && isValidLetterAxis(m.letterFrom) && axisLetterFromEl)
      axisLetterFromEl.value = m.letterFrom;
    if (m.letterTo && isValidLetterAxis(m.letterTo) && axisLetterToEl)
      axisLetterToEl.value = m.letterTo;
    if (m.numberFrom && defaultNumbers.includes(m.numberFrom) && axisNumberFromEl)
      axisNumberFromEl.value = m.numberFrom;
    if (m.numberTo && defaultNumbers.includes(m.numberTo) && axisNumberToEl)
      axisNumberToEl.value = m.numberTo;
    geodesyRuntime.normalizeGeoPlateAxisDefaults();
    geodesyRuntime.updateGeoFieldsVisibility();
    geodesyRuntime.updateNodeId();
  } catch (e) {
    console.warn("loadMeta error", e);
  }
}

["date", "construction"].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", saveMeta);
});

["projX","projY","projH","projDia","projStep","projCover","projThick","mark"].forEach(
  id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        scheduleProjectDesignSave();
      });
    }
  }
);

loadMeta();
// updateGeomFieldsVisibility будет вызвана после загрузки DOM

// ============================
//  Объекты (projects)
// ============================
function resetFormForNewProject() {
  construction.value = "Плита";
  dateInput.valueAsDate = new Date();

  floorEl.value = "";
  [projX, factX, projY, factY, projH, factH].forEach(el => (el.value = ""));
  void geodesyRuntime.bim.loadProjectElements(null);
  geoResult.className = "result";
  geoResult.innerHTML = "";

  nodes.clear();
  geodesyRuntime.renderNodes();
  geodesyRuntime.saveNodes();

  void clearReinfForm();

  void withGeometryModule((module) => module.clearGeomForm());

  void clearStrengthForm();

  state.geo           = false;
  state.reinforcement = false;
  state.geometry      = false;
  state.strength      = false;

  checked.geo           = false;
  checked.reinforcement = false;
  checked.geometry      = false;
  checked.strength      = false;

  reinfChecks.clear();
  geomChecks.clear();
  strengthChecks.clear();
  setCurrentStrengthCheckId(strengthState, null);
  renderReinfChecks();
  renderGeomChecks();
  renderStrengthChecks();
}

async function selectProject(projectId) {
  return projectRuntime.selectProject(projectId);
}

async function loadProjects() {
  return projectRuntime.loadProjects();
}

const projectRuntime = createProjectRuntime({
  getCurrentUserId: () => currentUserId,
  getCurrentProjectId: () => currentProjectId,
  setCurrentProjectId: setCurrentProjectIdState,
  projectSelector: projectSelector as HTMLSelectElement | null,
  resetFormForNewProject,
  loadGeoNodesForProject: geodesyRuntime.loadProjectNodes,
  loadProjectBimElements: geodesyRuntime.bim.loadProjectElements,
  loadJournal,
  renderJournal,
  loadJournalSessionsForProject,
  loadReinfChecks,
  renderReinfChecks,
  loadGeomChecks,
  renderGeomChecks,
  loadStrengthChecks,
  renderStrengthChecks,
  nodes,
  reinfChecks,
  geomChecks,
  strengthChecks,
  state,
  checked,
  construction: construction as HTMLSelectElement | null,
  dateInput: dateInput as HTMLInputElement | null,
  setConstructionAndTrigger,
  projX: projX as HTMLInputElement | null,
  projY: projY as HTMLInputElement | null,
  projH: projH as HTMLInputElement | null,
  projDia: projDia as HTMLInputElement | null,
  projStep: projStep as HTMLInputElement | null,
  projCover: projCover as HTMLInputElement | null,
  projThick: projThick as HTMLInputElement | null,
  mark: mark as HTMLInputElement | HTMLSelectElement | null,
  updateReinfLocationFieldsVisibility,
  updateGeoFieldsVisibility: geodesyRuntime.updateGeoFieldsVisibility,
  updateGeomFieldsVisibility,
  updateStrengthFieldsVisibility,
  updateSummaryTab
});

setModulesEnabled = projectRuntime.setModulesEnabled;
setModulesEnabled(!!currentProjectId);

initAuthBootstrap({
  auth,
  pendingWelcomeKey: PENDING_WELCOME_KEY,
  pendingWelcomeNewUser: PENDING_WELCOME_NEW_USER,
  setCurrentUserId: (uid) => {
    currentUserId = uid;
  },
  loadCurrentUserEngineerName,
  clearCurrentUserContext: profileRuntime.clearCurrentUserContext,
  loadProjects,
  setCurrentProjectId: setCurrentProjectIdState,
  setModulesEnabled
});

initProjectSelectorBinding({
  projectSelector: projectSelector as HTMLSelectElement | null,
  setCurrentProjectId: setCurrentProjectIdState,
  setModulesEnabled,
  resetFormForNewProject,
  selectProject
});

ifcImportRuntime = createIfcImportRuntime({
  auth,
  getCurrentProjectId: () => currentProjectId,
  getImportedElementsCount: () => bimElements.length,
  getImportedIfcCount: () => {
    const sourceIds = new Set(
      bimElements
        .map((element) => String(element.sourceModelId || "").trim())
        .filter(Boolean)
    );
    return sourceIds.size || (bimElements.length > 0 ? 1 : 0);
  },
  ifcFileInput: ifcFileInput as HTMLInputElement | null,
  btnImportIfc: btnImportIfc as HTMLButtonElement | null,
  btnClearIfcImport: btnClearIfcImport as HTMLButtonElement | null,
  btnChooseAnotherIfc: btnChooseAnotherIfc as HTMLButtonElement | null,
  btnResetSelectedIfc: btnResetSelectedIfc as HTMLButtonElement | null,
  btnIfcMoreActions: btnIfcMoreActions as HTMLButtonElement | null,
  ifcActionsMenu,
  bimImportFileState: bimImportFileState as HTMLElement | null,
  bimImportStatus: bimImportStatus as HTMLElement | null,
  bimImportedIfcCount: bimImportedIfcCount as HTMLElement | null,
  loadProjectBimElements: geodesyRuntime.bim.loadProjectElements,
  refreshReinforcementBimElementsIfLoaded,
  refreshGeometryBimElementsIfLoaded,
  refreshStrengthBimElementsIfLoaded
});

initIfcBindings({
  ifcFileInput: ifcFileInput as HTMLInputElement | null,
  btnImportIfc: btnImportIfc as HTMLButtonElement | null,
  btnClearIfcImport: btnClearIfcImport as HTMLButtonElement | null,
  btnChooseAnotherIfc: btnChooseAnotherIfc as HTMLButtonElement | null,
  btnResetSelectedIfc: btnResetSelectedIfc as HTMLButtonElement | null,
  btnIfcMoreActions: btnIfcMoreActions as HTMLButtonElement | null,
  ifcActionsMenu,
  isIfcOperationInFlight,
  syncIfcImportControls,
  setBimImportStatus,
  handleIfcImport,
  handleIfcImportDelete,
  toggleIfcActionsMenu,
  closeIfcActionsMenu,
  clearPendingIfcSelection,
  positionIfcActionsMenu
});

syncIfcImportControls();

initStaticBootstrap({
  regulatoryDocs: REGULATORY_DOCS,
  showNotification
});

// ============================
//  Геодезия
// ============================

// Очистка сохранённых проверок прочности бетона



// ============================
//  Связки для модуля Итога
// ============================
const exposeSummaryBinding = (name, getter, setter) => {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get: getter,
    set: setter
  });
};

exposeSummaryBinding("currentProjectId", () => currentProjectId, (value) => {
  setCurrentProjectIdState(value);
});
exposeSummaryBinding("journal", () => journal, (value) => {
  journal = value;
});
exposeSummaryBinding("journalEntries", () => journalEntries, (value) => {
  journalEntries = value;
});
exposeSummaryBinding("journalFilteredEntries", () => journalFilteredEntries, (value) => {
  journalFilteredEntries = value;
});
exposeSummaryBinding("journalFilterModule", () => journalFilterModule, (value) => {
  journalFilterModule = value;
});
exposeSummaryBinding("journalFilterConstruction", () => journalFilterConstruction, (value) => {
  journalFilterConstruction = value;
});
exposeSummaryBinding("currentReinfCheckId", () => currentReinfCheckId, (value) => {
  currentReinfCheckId = value;
});
exposeSummaryBinding("currentGeomCheckId", () => currentGeomCheckId, (value) => {
  currentGeomCheckId = value;
});

globalThis.applyJournalFilter = applyJournalFilter;
globalThis.loadJournalFromFirestore = loadJournalFromFirestore;
globalThis.setJournalFilters = setJournalFilters;
globalThis.addJournalEntry = addJournalEntry;
globalThis.upsertJournalEntry = upsertJournalEntry;
globalThis.notifyFirestoreSyncStatus = notifyFirestoreSyncStatus;
globalThis.updateSummaryTab = updateSummaryTab;
globalThis.state = state;
globalThis.checked = checked;
globalThis.saveReinfChecks = saveReinfChecks;
globalThis.renderReinfChecks = renderReinfChecks;
globalThis.saveGeomChecks = saveGeomChecks;
globalThis.renderGeomChecks = renderGeomChecks;
globalThis.saveStrengthChecks = saveStrengthChecks;
globalThis.renderStrengthChecks = renderStrengthChecks;
globalThis.loadReinfCheck = loadReinfCheck;
globalThis.loadGeomCheck = loadGeomCheck;
globalThis.loadStrengthCheck = loadStrengthCheck;
globalThis.setConstructionAndTrigger = setConstructionAndTrigger;
globalThis.projectSelector = projectSelector as HTMLSelectElement | null;
globalThis.engineer = null;
globalThis.dateInput = dateInput as HTMLInputElement | null;
globalThis.construction = construction as HTMLSelectElement | null;
globalThis.nodes = nodes;
globalThis.reinfChecks = reinfChecks;
globalThis.geomChecks = geomChecks;

// ============================
//  Нормализация ввода дробных чисел (запятая -> точка)
// ============================
initDecimalInputNormalization();

// ============================
//  Меню действий
// ============================
initActionMenus();

// ============================
//  Отслеживание сетевого состояния
// ============================
initNetworkStatus();
