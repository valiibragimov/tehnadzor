import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

import {
  getProjectDocSnapshot,
  getUserDocSnapshot,
  mergeProjectDoc
} from "./app/repositories/firestore-repository.js";
import { initAuthBootstrap, initStaticBootstrap } from "./app/bootstrap.js";
import type {
  EnrichedBimElement,
  GeoBimBindingSnapshot,
  GeoBimBindingSnapshotBuildOptions,
  GeoBimNodeData,
  GeoNodesRegistry,
  JournalFilterValue
} from "./app/geo-bim-types.js";
import { createIfcImportRuntime } from "./app/ifc-import-runtime.js";
import {
  getConstructionLabel,
  getConstructionModuleBehavior,
  getConstructionModuleFallbackMessage,
  getConstructionProfile,
  getConstructionSelectionState,
  isConstructionSupportedInModule,
  normalizeConstructionKey
} from "./app/construction.js";
import {
  evaluateReinfCheck,
  evaluateStrengthCheck
} from "./app/inspection-evaluation.js";
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
  createFirestoreGeodesyService,
  replaceGeodesyItems
} from "./features/inspections/geodesy/index.js";
import {
  buildGeoAxisEntries,
  createGeoLinearPrefillPoints,
  findNearestGeoAxisLabel,
  formatGeoBimDisplayValue,
  formatGeoBimNumericField,
  formatGeoBimShortGuid,
  formatResolvedLinearAxes,
  getBimAxesValue,
  groupGeoGridSamples,
  hasGeoBimValue,
  inferAxisCoordinateKey,
  normalizeGeoBimSnapshotValue,
  parseGeoBimFiniteNumber,
  pushGeoGridSample
} from "./app/geo-bim-utils.js";
import { getCurrentIfcFileFromInput } from "./app/services/bim-runtime-context.js";
import {
  buildBimElementFilterOptions,
  buildBimElementOptionLabel,
  buildBimElementSearchText,
  buildGeoPrefillFromBimElement,
  formatBimElementLabel,
  getTehnadzorTypeByBimType,
  normalizeProjectBimElement,
  sortProjectBimElements
} from "./app/services/bim-elements.js";
import { ensureBimVisualPanel } from "./app/services/bim-visual-panel.js";
import { onAppTabActivated } from "./app/services/module-activation.js";
import { initDatepickerStyles } from "./app/ui/datepicker.js";
import {
  initGeoBimBindings,
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
import type { BimElement, GeoPrefill } from "./types/domain.js";
import {
  debounce,
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
const BIM_MANUAL_MODE_MESSAGE = "";
const BIM_LOAD_ERROR_MESSAGE = "Не удалось загрузить BIM-элементы. Можно продолжить ручной ввод.";

type BimVisualPanelApi = ReturnType<typeof ensureBimVisualPanel>;

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
let geoNodesRegistry: GeoNodesRegistry | null = null;

function setCurrentProjectIdState(projectId) {
  currentProjectId = writeStoredProjectId(projectId);
  if (typeof syncIfcImportControls === "function") {
    syncIfcImportControls();
  }
  if (typeof updateGeoBimControlsState === "function") {
    updateGeoBimControlsState();
  }
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
} = createGeodesyDomBindings(document);

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
const strengthChecks = globalThis.strengthChecks instanceof Map ? globalThis.strengthChecks : new Map();
let currentStrengthCheckId = null;

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
const geodesyNodeState = createGeodesyState<
  EnrichedBimElement,
  GeoBimBindingSnapshot,
  BimVisualPanelApi
>();
const nodes = geodesyNodeState.nodes;
const bimElements = geodesyNodeState.bimElements;
const bimElementsById = geodesyNodeState.bimElementsById;
const geoBimFilters = geodesyNodeState.bimFilters;
const columns = geodesyNodeState.columns;
const walls = geodesyNodeState.walls;
const beams = geodesyNodeState.beams;
const plateOpeningPoints = geodesyNodeState.plateOpeningPoints;
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

function getSelectedGeoBimElement(): EnrichedBimElement | null {
  return bimElementsById.get(geodesyNodeState.selectedBimElementId) || null;
}

function ensureGeoBimVisualSelector() {
  if (geodesyNodeState.bimVisualPanel) return geodesyNodeState.bimVisualPanel;

  geodesyNodeState.bimVisualPanel = ensureBimVisualPanel({
    host: geoBimPanelHost,
    sourceCard: geoBimSourceCard,
    getAllElements: () => bimElements as Array<Partial<BimElement> & Record<string, unknown>>,
    getFilteredElements: () =>
      getFilteredGeoBimElements() as Array<Partial<BimElement> & Record<string, unknown>>,
    getSelectedElement: () =>
      getSelectedGeoBimElement() as (Partial<BimElement> & Record<string, unknown>) | null,
    getSelectedId: () => geodesyNodeState.selectedBimElementId,
    getCurrentProjectId: () => currentProjectId,
    getCurrentIfcFile: () => getCurrentIfcFileFromInput(ifcFileInput),
    onSelect: (elementId) => {
      applyGeoBimElementSelection(elementId);
    },
    labelBuilder: (element) => buildBimElementOptionLabel(element),
    moduleKey: "geo"
  });

  return geodesyNodeState.bimVisualPanel;
}

function renderGeoBimVisualPanel() {
  ensureGeoBimVisualSelector()?.render();
}

onAppTabActivated("geo", renderGeoBimVisualPanel);

function getGeoBimFieldShell(fieldEl) {
  if (!fieldEl) return null;
  if (fieldEl === construction && constructionFieldShell) {
    return constructionFieldShell;
  }
  return fieldEl.closest("div");
}

function setGeoBimFieldAutofilled(fieldEl, isAutofilled) {
  const nextState = Boolean(isAutofilled);
  const shell = getGeoBimFieldShell(fieldEl);

  if (shell) {
    shell.classList.toggle("geo-bim-field--autofilled", nextState);
  }
  if (fieldEl) {
    fieldEl.classList.toggle("geo-bim-input--autofilled", nextState);
  }
}

function buildGeoBimBindingSnapshot({
  element = null,
  nodeData = null,
  constructionType = null
}: GeoBimBindingSnapshotBuildOptions = {}) {
  const selectedElement = element || null;
  const fallbackData = nodeData || {};
  const elementId =
    normalizeGeoBimSnapshotValue(selectedElement?.elementId) ||
    normalizeGeoBimSnapshotValue(selectedElement?.id) ||
    normalizeGeoBimSnapshotValue(fallbackData.bimElementId);

  const rawType =
    normalizeGeoBimSnapshotValue(selectedElement?.type)?.toLowerCase() ||
    normalizeGeoBimSnapshotValue(fallbackData.bimType)?.toLowerCase();

  const typeLabel =
    getConstructionLabel(constructionType) ||
    getConstructionLabel(getTehnadzorTypeByBimType(rawType)) ||
    getConstructionLabel(fallbackData.construction) ||
    getConstructionLabel(fallbackData.constructionType) ||
    normalizeGeoBimSnapshotValue(fallbackData.constructionLabel) ||
    normalizeGeoBimSnapshotValue(fallbackData.constructionType);

  const mark =
    normalizeGeoBimSnapshotValue(selectedElement?.mark) ||
    normalizeGeoBimSnapshotValue(fallbackData.bimMark);

  const axes =
    normalizeGeoBimSnapshotValue(selectedElement?.resolvedAxes || selectedElement?.axes) ||
    normalizeGeoBimSnapshotValue(fallbackData.bimAxes);

  const sourceModelId =
    normalizeGeoBimSnapshotValue(selectedElement?.sourceModelId) ||
    normalizeGeoBimSnapshotValue(fallbackData.bimSourceModelId);

  const ifcGuid =
    normalizeGeoBimSnapshotValue(selectedElement?.ifcGuid) ||
    normalizeGeoBimSnapshotValue(fallbackData.bimIfcGuid);

  const projectX = selectedElement?.projectX ?? fallbackData.bimProjectX ?? null;
  const projectY = selectedElement?.projectY ?? fallbackData.bimProjectY ?? null;
  const projectH = selectedElement?.projectH ?? fallbackData.bimProjectH ?? null;

  if (!elementId && !rawType && !mark && !axes && !sourceModelId && !ifcGuid && !hasGeoBimValue(projectX) && !hasGeoBimValue(projectY) && !hasGeoBimValue(projectH)) {
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
    mark,
    axes,
    sourceModelId,
    ifcGuid,
    projectX,
    projectY,
    projectH,
    title
  };
}

function collectGeoGridSamples() {
  const samples = [];
  if (!geoNodesRegistry) {
    return samples;
  }

  geoNodesRegistry.forEach((nodeData) => {
    if (!nodeData || nodeData.deleted) return;
    const floor = String(nodeData.floor || "").trim();

    pushGeoGridSample(samples, {
      floor,
      letter: String(nodeData.letter || "").trim(),
      number: String(nodeData.number || "").trim(),
      x: nodeData.projX,
      y: nodeData.projY
    });

    if (nodeData.type === "walls" && Array.isArray(nodeData.walls)) {
      nodeData.walls.forEach((wall) => {
        if (wall?.bindingType === "number_letters") {
          pushGeoGridSample(samples, {
            floor,
            letter: String(wall.letterAxis1 || "").trim(),
            number: String(wall.numberAxis || "").trim(),
            x: wall.projX_num_let1,
            y: wall.projY_num_let1
          });
          pushGeoGridSample(samples, {
            floor,
            letter: String(wall.letterAxis2 || "").trim(),
            number: String(wall.numberAxis || "").trim(),
            x: wall.projX_num_let2,
            y: wall.projY_num_let2
          });
        } else if (wall?.bindingType === "letter_numbers") {
          pushGeoGridSample(samples, {
            floor,
            letter: String(wall.letterAxis || "").trim(),
            number: String(wall.numberAxis1 || "").trim(),
            x: wall.projX_let_num1,
            y: wall.projY_let_num1
          });
          pushGeoGridSample(samples, {
            floor,
            letter: String(wall.letterAxis || "").trim(),
            number: String(wall.numberAxis2 || "").trim(),
            x: wall.projX_let_num2,
            y: wall.projY_let_num2
          });
        }
      });
    }

    if (nodeData.type === "beams" && Array.isArray(nodeData.beams)) {
      nodeData.beams.forEach((beam) => {
        if (beam?.bindingType === "number_letters") {
          pushGeoGridSample(samples, {
            floor,
            letter: String(beam.letterAxis1 || "").trim(),
            number: String(beam.numberAxis || "").trim(),
            x: beam.projX_num_let1,
            y: beam.projY_num_let1
          });
          pushGeoGridSample(samples, {
            floor,
            letter: String(beam.letterAxis2 || "").trim(),
            number: String(beam.numberAxis || "").trim(),
            x: beam.projX_num_let2,
            y: beam.projY_num_let2
          });
        } else if (beam?.bindingType === "letter_numbers") {
          pushGeoGridSample(samples, {
            floor,
            letter: String(beam.letterAxis || "").trim(),
            number: String(beam.numberAxis1 || "").trim(),
            x: beam.projX_let_num1,
            y: beam.projY_let_num1
          });
          pushGeoGridSample(samples, {
            floor,
            letter: String(beam.letterAxis || "").trim(),
            number: String(beam.numberAxis2 || "").trim(),
            x: beam.projX_let_num2,
            y: beam.projY_let_num2
          });
        }
      });
    }
  });

  return samples;
}

function buildGeoGridCatalog(floorValue = "") {
  const normalizedFloor = String(floorValue || "").trim();
  const allSamples = collectGeoGridSamples();
  const filteredSamples = normalizedFloor
    ? allSamples.filter((sample) => sample.floor === normalizedFloor)
    : allSamples;
  const effectiveSamples = filteredSamples.length > 0 ? filteredSamples : allSamples;

  if (effectiveSamples.length === 0) {
    return null;
  }

  const letters = groupGeoGridSamples(effectiveSamples, "letter");
  const numbers = groupGeoGridSamples(effectiveSamples, "number");
  if (letters.size === 0 || numbers.size === 0) {
    return null;
  }

  const letterCoordKey = inferAxisCoordinateKey(letters, "x");
  let numberCoordKey = inferAxisCoordinateKey(numbers, letterCoordKey === "x" ? "y" : "x");
  if (numberCoordKey === letterCoordKey) {
    numberCoordKey = letterCoordKey === "x" ? "y" : "x";
  }

  return {
    letters: buildGeoAxisEntries(letters, letterCoordKey),
    numbers: buildGeoAxisEntries(numbers, numberCoordKey),
    letterCoordKey,
    numberCoordKey
  };
}

function resolveSingleGeoAxisHint(prefill: Partial<GeoPrefill> = {}, floorValue = "") {
  const catalog = buildGeoGridCatalog(floorValue);
  if (!catalog) return null;

  const projX = parseGeoBimFiniteNumber(prefill.projX);
  const projY = parseGeoBimFiniteNumber(prefill.projY);
  if (projX == null || projY == null) {
    return null;
  }

  return {
    letter: findNearestGeoAxisLabel(catalog.letters, catalog.letterCoordKey === "x" ? projX : projY),
    number: findNearestGeoAxisLabel(catalog.numbers, catalog.numberCoordKey === "x" ? projX : projY)
  };
}

function resolveLinearGeoBindingHint(prefill = {}, floorValue = "") {
  const catalog = buildGeoGridCatalog(floorValue);
  const points = createGeoLinearPrefillPoints(prefill);
  if (!catalog || !points) return null;

  const startLetter = findNearestGeoAxisLabel(
    catalog.letters,
    catalog.letterCoordKey === "x" ? points.startX : points.startY
  );
  const endLetter = findNearestGeoAxisLabel(
    catalog.letters,
    catalog.letterCoordKey === "x" ? points.endX : points.endY
  );
  const startNumber = findNearestGeoAxisLabel(
    catalog.numbers,
    catalog.numberCoordKey === "x" ? points.startX : points.startY
  );
  const endNumber = findNearestGeoAxisLabel(
    catalog.numbers,
    catalog.numberCoordKey === "x" ? points.endX : points.endY
  );

  const deltaAlongLetters = Math.abs(
    (catalog.letterCoordKey === "x" ? points.endX - points.startX : points.endY - points.startY)
  );
  const deltaAlongNumbers = Math.abs(
    (catalog.numberCoordKey === "x" ? points.endX - points.startX : points.endY - points.startY)
  );
  const midX = (points.startX + points.endX) / 2;
  const midY = (points.startY + points.endY) / 2;
  const midLetter = findNearestGeoAxisLabel(
    catalog.letters,
    catalog.letterCoordKey === "x" ? midX : midY
  );
  const midNumber = findNearestGeoAxisLabel(
    catalog.numbers,
    catalog.numberCoordKey === "x" ? midX : midY
  );

  if (startNumber && endNumber && startNumber === endNumber && startLetter && endLetter) {
    return {
      bindingType: "number_letters",
      numberAxis: startNumber,
      letterAxis1: startLetter,
      letterAxis2: endLetter
    };
  }

  if (startLetter && endLetter && startLetter === endLetter && startNumber && endNumber) {
    return {
      bindingType: "letter_numbers",
      letterAxis: startLetter,
      numberAxis1: startNumber,
      numberAxis2: endNumber
    };
  }

  if (deltaAlongLetters >= deltaAlongNumbers && startLetter && endLetter && midNumber) {
    return {
      bindingType: "number_letters",
      numberAxis: midNumber,
      letterAxis1: startLetter,
      letterAxis2: endLetter
    };
  }

  if (startNumber && endNumber && midLetter) {
    return {
      bindingType: "letter_numbers",
      letterAxis: midLetter,
      numberAxis1: startNumber,
      numberAxis2: endNumber
    };
  }

  return null;
}

function refreshBimElementGeoHints() {
  bimElements.forEach((element) => {
    const prefill = buildGeoPrefillFromBimElement(element);
    const floorValue = String(element?.floor || "").trim();
    const hasNativeAxes = String(element?.axes || "").trim() !== "";

    element.geoBindingHint =
      element.type === "wall" || element.type === "beam"
        ? resolveLinearGeoBindingHint(prefill, floorValue)
        : null;
    element.geoSingleAxisHint =
      element.type !== "wall" && element.type !== "beam"
        ? resolveSingleGeoAxisHint(prefill, floorValue)
        : null;

    if (hasNativeAxes) {
      element.resolvedAxes = String(element.axes || "").trim();
      return;
    }

    const resolvedLinearAxes = formatResolvedLinearAxes(element.geoBindingHint);
    if (resolvedLinearAxes) {
      element.resolvedAxes = resolvedLinearAxes;
      return;
    }

    const singleAxisHint = element.geoSingleAxisHint;
    if (singleAxisHint?.letter && singleAxisHint?.number) {
      element.resolvedAxes = `${singleAxisHint.letter}-${singleAxisHint.number}`;
      return;
    }

    element.resolvedAxes = null;
  });
}

function renderGeoBimBindingSnapshot() {
  const snapshot = geodesyNodeState.bimBindingSnapshot;
  const hasLink = Boolean(snapshot);

  if (geoBimSourceCard) {
    geoBimSourceCard.hidden = !hasLink;
    geoBimSourceCard.classList.toggle("is-linked", hasLink);
    geoBimSourceCard.classList.toggle("is-stale", hasLink && !snapshot?.resolved);
  }

  if (geoManualAssistNote) {
    const noteText = hasLink
      ? snapshot.resolved
        ? "Подсвеченные поля ниже подставлены из BIM. Их можно править вручную, BIM-привязка сохранится отдельно."
        : "BIM-привязка сохранена, но сам импортированный элемент сейчас недоступен. Поля можно продолжать редактировать вручную."
      : BIM_MANUAL_MODE_MESSAGE;
    geoManualAssistNote.textContent = noteText;
    geoManualAssistNote.hidden = !noteText;
    geoManualAssistNote.classList.toggle("is-linked", hasLink);
    geoManualAssistNote.classList.toggle("is-stale", hasLink && !snapshot?.resolved);
  }

  if (!hasLink) {
    setGeoBimFieldAutofilled(construction, false);
    setGeoBimFieldAutofilled(projX, false);
    setGeoBimFieldAutofilled(projY, false);
    setGeoBimFieldAutofilled(projH, false);
    setGeoBimFieldAutofilled(columnMarkEl, false);
    setGeoBimFieldAutofilled(geoBimMarkEl, false);
    setGeoBimFieldAutofilled(geoBimAxesEl, false);
    return;
  }

  if (geoBimSourceTitle) {
    geoBimSourceTitle.textContent = snapshot.title;
  }
  if (geoBimSourceState) {
    geoBimSourceState.textContent = snapshot.resolved ? "Связка активна" : "Источник недоступен";
  }
  if (geoBimSourceMeta) {
    const metaParts = [];
    if (snapshot.elementId) metaParts.push(`ID ${snapshot.elementId}`);
    if (snapshot.sourceModelId) metaParts.push(`Модель ${snapshot.sourceModelId}`);
    if (snapshot.ifcGuid) metaParts.push(`GUID ${formatGeoBimShortGuid(snapshot.ifcGuid)}`);
    geoBimSourceMeta.textContent = metaParts.join(" · ");
  }
  if (geoBimAppliedTypeEl) geoBimAppliedTypeEl.textContent = formatGeoBimDisplayValue(snapshot.typeLabel);
  if (geoBimAppliedProjXEl) geoBimAppliedProjXEl.textContent = formatGeoBimDisplayValue(snapshot.projectX);
  if (geoBimAppliedProjYEl) geoBimAppliedProjYEl.textContent = formatGeoBimDisplayValue(snapshot.projectY);
  if (geoBimAppliedProjHEl) geoBimAppliedProjHEl.textContent = formatGeoBimDisplayValue(snapshot.projectH);
  if (geoBimAppliedMarkEl) geoBimAppliedMarkEl.textContent = formatGeoBimDisplayValue(snapshot.mark);
  if (geoBimAppliedAxesEl) geoBimAppliedAxesEl.textContent = formatGeoBimDisplayValue(snapshot.axes);
  if (geoBimSourceHint) {
    geoBimSourceHint.textContent = snapshot.resolved
      ? "Подсвеченные поля ниже подставлены из BIM. Их можно скорректировать вручную, BIM-привязка сохранится отдельно."
      : "BIM-связка сохранена в узле, но этот элемент сейчас не найден среди импортированных элементов проекта.";
  }

  setGeoBimFieldAutofilled(construction, hasGeoBimValue(snapshot.typeLabel));
  setGeoBimFieldAutofilled(projX, hasGeoBimValue(snapshot.projectX));
  setGeoBimFieldAutofilled(projY, hasGeoBimValue(snapshot.projectY));
  setGeoBimFieldAutofilled(projH, hasGeoBimValue(snapshot.projectH));
  setGeoBimFieldAutofilled(columnMarkEl, construction?.value === "Колонна" && hasGeoBimValue(snapshot.mark));
  setGeoBimFieldAutofilled(geoBimMarkEl, hasGeoBimValue(snapshot.mark));
  setGeoBimFieldAutofilled(geoBimAxesEl, hasGeoBimValue(snapshot.axes));
}

function setGeoBimStatus(message, tone = "muted") {
  if (!geoBimElementStatus) return;
  const hasMessage = Boolean(String(message || "").trim());
  geoBimElementStatus.textContent = message;
  geoBimElementStatus.hidden = !hasMessage;
  geoBimElementStatus.dataset.empty = hasMessage ? "0" : "1";
  const statusField = geoBimElementStatus.closest(".geo-bim-status-field") as HTMLElement | null;
  if (statusField) statusField.hidden = !hasMessage;
  geoBimElementStatus.style.color =
    tone === "error"
      ? "#fca5a5"
      : tone === "success"
        ? "#86efac"
        : tone === "info"
          ? "#93c5fd"
          : "#E6B450";
}

function normalizeGeoBimFilterValue(value, fallback = "all") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function resetGeoBimFilters() {
  geoBimFilters.search = "";
  geoBimFilters.type = "all";
  geoBimFilters.axes = "all";
}

function syncGeoBimFilterControlsFromState() {
  if (geoBimSearchInput && geoBimSearchInput.value !== geoBimFilters.search) {
    geoBimSearchInput.value = geoBimFilters.search;
  }
  if (geoBimTypeFilter && geoBimTypeFilter.value !== geoBimFilters.type) {
    geoBimTypeFilter.value = geoBimFilters.type;
  }
  if (geoBimAxesFilter && geoBimAxesFilter.value !== geoBimFilters.axes) {
    geoBimAxesFilter.value = geoBimFilters.axes;
  }
}

function hasActiveGeoBimFilters() {
  return (
    String(geoBimFilters.search || "").trim() !== "" ||
    geoBimFilters.type !== "all" ||
    geoBimFilters.axes !== "all"
  );
}

function getFilteredGeoBimElements(): EnrichedBimElement[] {
  refreshBimElementGeoHints();
  const searchQuery = String(geoBimFilters.search || "").trim().toLowerCase();

  return bimElements.filter((element) => {
    if (geoBimFilters.type !== "all" && element.type !== geoBimFilters.type) {
      return false;
    }

    const axesValue = getBimAxesValue(element);
    if (geoBimFilters.axes !== "all" && axesValue !== geoBimFilters.axes) {
      return false;
    }

    if (searchQuery && !buildBimElementSearchText(element).includes(searchQuery)) {
      return false;
    }

    return true;
  });
}

function fillGeoBimFilterSelect(selectEl, options, defaultLabel, nextValue) {
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
  selectEl.disabled = !currentProjectId || bimElements.length === 0;
}

function renderGeoBimFilterOptions() {
  refreshBimElementGeoHints();
  const filterOptions = buildBimElementFilterOptions(bimElements);
  const nextType = normalizeGeoBimFilterValue(geoBimFilters.type, "all");
  const nextAxes = normalizeGeoBimFilterValue(geoBimFilters.axes, "all");

  fillGeoBimFilterSelect(geoBimTypeFilter, filterOptions.types, "Все типы", nextType);
  fillGeoBimFilterSelect(geoBimAxesFilter, filterOptions.axes, "Все оси", nextAxes);

  geoBimFilters.type = geoBimTypeFilter ? geoBimTypeFilter.value : nextType;
  geoBimFilters.axes = geoBimAxesFilter ? geoBimAxesFilter.value : nextAxes;
  syncGeoBimFilterControlsFromState();
}

function renderGeoBimElementOptions(
  selectedId = geodesyNodeState.selectedBimElementId
) {
  if (!geoBimElementSelect) return;
  refreshBimElementGeoHints();

  const previousValue = selectedId || "";
  const filteredElements = getFilteredGeoBimElements();
  const visibleElements = [...filteredElements];
  const selectedElement = previousValue ? bimElementsById.get(previousValue) : null;
  geoBimElementSelect.innerHTML = "";

  const manualOption = document.createElement("option");
  manualOption.value = "";
  manualOption.textContent = "Ручной ввод без BIM";
  geoBimElementSelect.appendChild(manualOption);

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
    geoBimElementSelect.appendChild(option);
  });

  if (!selectedElement && filteredElements.length === 0 && bimElements.length > 0) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "__empty__";
    emptyOption.textContent = "По текущим фильтрам BIM-элементы не найдены";
    emptyOption.disabled = true;
    geoBimElementSelect.appendChild(emptyOption);
  }

  const hasPreviousValue =
    previousValue === "" ||
    visibleElements.some((element) => (element.elementId || element.id || "") === previousValue);
  geoBimElementSelect.value = hasPreviousValue ? previousValue : "";
  renderGeoBimVisualPanel();
}

function updateGeoBimControlsState() {
  const filteredElements = getFilteredGeoBimElements();
  const snapshot = geodesyNodeState.bimBindingSnapshot;

  if (geoBimElementSelect) {
    geoBimElementSelect.disabled = !currentProjectId || bimElements.length === 0;
  }
  if (geoBimSearchInput) {
    geoBimSearchInput.disabled = !currentProjectId || bimElements.length === 0;
  }
  if (geoBimTypeFilter) {
    geoBimTypeFilter.disabled = !currentProjectId || bimElements.length === 0;
  }
  if (geoBimAxesFilter) {
    geoBimAxesFilter.disabled = !currentProjectId || bimElements.length === 0;
  }
  if (btnClearGeoBimSelection) {
    btnClearGeoBimSelection.disabled = !geodesyNodeState.selectedBimElementId;
  }

  if (!currentProjectId) {
    setGeoBimStatus("Сначала выберите объект. После этого станут доступны BIM-элементы проекта.", "muted");
    return;
  }

  const selectedElement = getSelectedGeoBimElement();
  if (!selectedElement && snapshot && !snapshot.resolved) {
    setGeoBimStatus(
      "BIM-привязка сохранена в узле, но сам импортированный элемент сейчас не найден в проекте. Можно перепривязать элемент или продолжить вручную.",
      "info"
    );
    return;
  }

  if (bimElements.length === 0) {
    setGeoBimStatus(BIM_MANUAL_MODE_MESSAGE, "muted");
    return;
  }

  if (!selectedElement) {
    if (hasActiveGeoBimFilters()) {
      if (filteredElements.length === 0) {
        setGeoBimStatus("По текущим фильтрам BIM-элементы не найдены. Можно ослабить фильтры или продолжить вручную.", "info");
        return;
      }
      setGeoBimStatus(`Найдено ${filteredElements.length} BIM-элементов. Выберите элемент или продолжайте ручной ввод.`, "info");
      return;
    }
    setGeoBimStatus(BIM_MANUAL_MODE_MESSAGE, "muted");
    return;
  }

  const typeLabel = getConstructionLabel(getTehnadzorTypeByBimType(selectedElement.type), "Элемент");
  setGeoBimStatus(
    `Выбран ${typeLabel}${selectedElement.mark ? ` ${selectedElement.mark}` : ""}. Координаты X/Y/H подставлены, ручное редактирование сохранено.`,
    "success"
  );
}

function syncGeoBimFieldsFromState() {
  const selectedElement = getSelectedGeoBimElement();
  if (!selectedElement) {
    renderGeoBimElementOptions("");
    if (geoBimElementSelect) geoBimElementSelect.value = "";
    if (geoBimMarkEl && !geoBimMarkEl.dataset.lockedByNode) geoBimMarkEl.value = "";
    if (geoBimAxesEl && !geoBimAxesEl.dataset.lockedByNode) geoBimAxesEl.value = "";
    renderGeoBimBindingSnapshot();
    updateGeoBimControlsState();
    return;
  }

  if (geoBimElementSelect) {
    renderGeoBimElementOptions(selectedElement.elementId || selectedElement.id || "");
    geoBimElementSelect.value = selectedElement.elementId || selectedElement.id || "";
  }
  if (geoBimMarkEl) geoBimMarkEl.value = selectedElement.mark || "";
  if (geoBimAxesEl) geoBimAxesEl.value = getBimAxesValue(selectedElement);
  geodesyNodeState.bimBindingSnapshot = buildGeoBimBindingSnapshot({
    element: selectedElement
  });
  renderGeoBimBindingSnapshot();
  updateGeoBimControlsState();
}

function clearGeoBimSelection({ keepManualFields = true } = {}) {
  geodesyNodeState.selectedBimElementId = "";
  geodesyNodeState.bimBindingSnapshot = null;
  renderGeoBimElementOptions("");
  if (geoBimElementSelect) geoBimElementSelect.value = "";

  if (!keepManualFields) {
    if (geoBimMarkEl) geoBimMarkEl.value = "";
    if (geoBimAxesEl) geoBimAxesEl.value = "";
  }

  renderGeoBimBindingSnapshot();
  updateGeoBimControlsState();
}

async function loadProjectBimElements(projectId) {
  bimElements.length = 0;
  bimElementsById.clear();
  geodesyNodeState.selectedBimElementId = "";
  geodesyNodeState.bimBindingSnapshot = null;
  resetGeoBimFilters();
  syncGeoBimFilterControlsFromState();
  if (geoBimMarkEl) geoBimMarkEl.value = "";
  if (geoBimAxesEl) geoBimAxesEl.value = "";
  renderGeoBimBindingSnapshot();
  renderGeoBimFilterOptions();
  renderGeoBimElementOptions("");
  syncIfcImportControls();

  if (!projectId || String(projectId).trim() === "") {
    updateGeoBimControlsState();
    return;
  }

  try {
    const elements = await geodesyService.loadBimElements(projectId);
    const loadedElements: EnrichedBimElement[] = [];
    elements.forEach(({ id, data }) => {
      const normalized = normalizeProjectBimElement(id, data);
      if (!normalized.elementId || !normalized.type) return;
      loadedElements.push(normalized as EnrichedBimElement);
    });

    replaceGeodesyItems(
      bimElements,
      sortProjectBimElements(loadedElements)
    );
    bimElements.forEach((element) => {
      const key = element.elementId || element.id;
      if (key) bimElementsById.set(key, element);
    });
    if (!getCurrentIfcFileFromInput(ifcFileInput) && bimElements.length === 0) {
      ifcImportRuntime?.resetImportedModelState();
    }
    renderGeoBimFilterOptions();
    renderGeoBimElementOptions("");
    updateGeoBimControlsState();
    syncIfcImportControls();
  } catch (error) {
    console.error("Ошибка загрузки BIM-элементов:", error);
    setGeoBimStatus(BIM_LOAD_ERROR_MESSAGE, "error");
    syncIfcImportControls();
  }
}


function createGeoLinearRowFromBim(
  prefill: Partial<GeoPrefill> = {},
  bindingHint = null,
  previousRow = null,
  createRow
) {
  const row = createRow();
  const points = createGeoLinearPrefillPoints(prefill);
  if (!points) {
    return row;
  }

  const nextBindingType =
    bindingHint?.bindingType ||
    (Math.abs(points.endX - points.startX) >= Math.abs(points.endY - points.startY)
      ? "number_letters"
      : "letter_numbers");

  row.bindingType = nextBindingType;

  if (nextBindingType === "number_letters") {
    row.numberAxis = bindingHint?.numberAxis || "";
    row.letterAxis1 = bindingHint?.letterAxis1 || "";
    row.letterAxis2 = bindingHint?.letterAxis2 || "";
    row.projX_num_let1 = formatGeoBimNumericField(points.startX);
    row.projY_num_let1 = formatGeoBimNumericField(points.startY);
    row.projX_num_let2 = formatGeoBimNumericField(points.endX);
    row.projY_num_let2 = formatGeoBimNumericField(points.endY);
    if (previousRow) {
      row.factX_num_let1 = previousRow.factX_num_let1 || "";
      row.factY_num_let1 = previousRow.factY_num_let1 || "";
      row.factX_num_let2 = previousRow.factX_num_let2 || "";
      row.factY_num_let2 = previousRow.factY_num_let2 || "";
    }
    return row;
  }

  row.letterAxis = bindingHint?.letterAxis || "";
  row.numberAxis1 = bindingHint?.numberAxis1 || "";
  row.numberAxis2 = bindingHint?.numberAxis2 || "";
  row.projX_let_num1 = formatGeoBimNumericField(points.startX);
  row.projY_let_num1 = formatGeoBimNumericField(points.startY);
  row.projX_let_num2 = formatGeoBimNumericField(points.endX);
  row.projY_let_num2 = formatGeoBimNumericField(points.endY);
  if (previousRow) {
    row.factX_let_num1 = previousRow.factX_let_num1 || "";
    row.factY_let_num1 = previousRow.factY_let_num1 || "";
    row.factX_let_num2 = previousRow.factX_let_num2 || "";
    row.factY_let_num2 = previousRow.factY_let_num2 || "";
  }
  return row;
}

function parseSingleGeoAxes(rawAxes) {
  const axesValue = String(rawAxes || "").trim();
  if (!axesValue) return null;

  const normalizedAxes = axesValue.replace(/\s+/g, "");
  const match = normalizedAxes.match(/^([A-Za-zА-Яа-я])[-xX×:]?(\d+)$/u);
  if (!match) return null;

  const [, letter, number] = match;
  return {
    letter: letter.toUpperCase(),
    number
  };
}

function parsePlateGeoAxes(rawAxes) {
  const axesValue = String(rawAxes || "").trim();
  if (!axesValue) return null;

  const normalizedAxes = axesValue.replace(/\s+/g, "").toUpperCase();
  const rangeMatch = normalizedAxes.match(/^([A-ZА-Я])[-–—]([A-ZА-Я])(?:[,;/|]|[X×Х])(\d+)[-–—](\d+)$/u);
  if (rangeMatch) {
    const [, letterFrom, letterTo, numberFrom, numberTo] = rangeMatch;
    return { letterFrom, letterTo, numberFrom, numberTo };
  }

  const singleAxes = parseSingleGeoAxes(rawAxes);
  if (!singleAxes) return null;

  return {
    letterFrom: singleAxes.letter,
    letterTo: singleAxes.letter,
    numberFrom: singleAxes.number,
    numberTo: singleAxes.number
  };
}

function tryApplySingleAxisHint(axisHint) {
  if (!axisHint?.letter || !axisHint?.number) return false;

  const hasLetterOption = Array.from(axisLetterEl?.options || []).some((option) => option.value === axisHint.letter);
  const hasNumberOption = Array.from(axisNumberEl?.options || []).some((option) => option.value === axisHint.number);
  if (!hasLetterOption || !hasNumberOption) return false;

  axisLetterEl.value = axisHint.letter;
  axisNumberEl.value = axisHint.number;
  return true;
}

function tryApplyAxisFieldsFromBimAxes(rawAxes, constructionType = construction?.value || "") {
  const geoFlags = getGeoConstructionFlags(constructionType);
  if (geoFlags.isRangeLocation) {
    const rangeAxes = parsePlateGeoAxes(rawAxes);
    if (!rangeAxes) return false;

    const { letterFrom, letterTo, numberFrom, numberTo } = rangeAxes;
    const hasLetterFromOption = Array.from(axisLetterFromEl?.options || []).some((option) => option.value === letterFrom);
    const hasLetterToOption = Array.from(axisLetterToEl?.options || []).some((option) => option.value === letterTo);
    const hasNumberFromOption = Array.from(axisNumberFromEl?.options || []).some((option) => option.value === numberFrom);
    const hasNumberToOption = Array.from(axisNumberToEl?.options || []).some((option) => option.value === numberTo);
    if (!hasLetterFromOption || !hasLetterToOption || !hasNumberFromOption || !hasNumberToOption) {
      return false;
    }

    if (axisLetterFromEl) axisLetterFromEl.value = letterFrom;
    if (axisLetterToEl) axisLetterToEl.value = letterTo;
    if (axisNumberFromEl) axisNumberFromEl.value = numberFrom;
    if (axisNumberToEl) axisNumberToEl.value = numberTo;
    return true;
  }

  const singleAxes = parseSingleGeoAxes(rawAxes);
  if (!singleAxes) return false;

  const { letter, number } = singleAxes;
  const hasLetterOption = Array.from(axisLetterEl?.options || []).some((option) => option.value === letter);
  const hasNumberOption = Array.from(axisNumberEl?.options || []).some((option) => option.value === number);
  if (!hasLetterOption || !hasNumberOption) return false;

  axisLetterEl.value = letter;
  axisNumberEl.value = number;
  return true;
}

function applyGeoBimElementSelection(elementId, { preserveManualFacts = true }: { preserveManualFacts?: boolean } = {}) {
  const nextId = String(elementId || "").trim();
  if (!nextId) {
    clearGeoBimSelection({ keepManualFields: true });
    return;
  }

  const element = bimElementsById.get(nextId);
  if (!element) {
    setGeoBimStatus("Выбранный BIM-элемент не найден в проекте. Обновите список элементов.", "error");
    return;
  }

  geodesyNodeState.selectedBimElementId = nextId;
  syncGeoBimFieldsFromState();

  const targetConstruction =
    getTehnadzorTypeByBimType(element.type) ||
    getCurrentConstructionKey() ||
    normalizeConstructionKey(APP_CONFIG.DEFAULT_CONSTRUCTION, "floor_slab");
  const targetGeoFlags = getGeoConstructionFlags(targetConstruction);
  setConstructionAndTrigger(targetConstruction);
  geodesyNodeState.bimBindingSnapshot = buildGeoBimBindingSnapshot({
    element,
    constructionType: targetConstruction
  });

  const prefill = buildGeoPrefillFromBimElement(element);
  projX.value = formatGeoBimNumericField(prefill.projX);
  projY.value = formatGeoBimNumericField(prefill.projY);
  projH.value = formatGeoBimNumericField(prefill.projH);

  floorEl.value = element.floor || "";
    if (!targetGeoFlags.isColumn && !targetGeoFlags.isWall && !targetGeoFlags.isBeam && !targetGeoFlags.usesWallsSheet) {
      const rawAxesValue = getBimAxesValue(element);
      const appliedNativeAxes = rawAxesValue
        ? tryApplyAxisFieldsFromBimAxes(rawAxesValue, targetConstruction)
        : false;
      if (!appliedNativeAxes && !targetGeoFlags.isRangeLocation) {
        tryApplySingleAxisHint(element.geoSingleAxisHint);
      }
      geodesyRuntime.syncGeoPlateAxisPrevValues();
  }

  if (targetGeoFlags.isColumn) {
    columnMarkEl.value = element.mark || "";
    const firstColumn = geodesyRuntime.ensureColumnPrefillRow();
    firstColumn.mark = element.mark || firstColumn.mark || "";
    firstColumn.projX = prefill.projX == null ? "" : String(prefill.projX);
    firstColumn.projY = prefill.projY == null ? "" : String(prefill.projY);
    if (!preserveManualFacts) {
      firstColumn.factX = "";
      firstColumn.factY = "";
    }
    geodesyRuntime.renderColumns();
  }

  if (targetGeoFlags.isWall) {
    const previousWall = preserveManualFacts ? walls[0] || null : null;
    const prefilledWall = createGeoLinearRowFromBim(
      prefill,
      element.geoBindingHint,
      previousWall,
      geodesyRuntime.createEmptyWallRow
    );
    replaceGeodesyItems(walls, [prefilledWall]);
    geodesyRuntime.renderWalls();
  }

  if (targetGeoFlags.isBeam) {
    const previousBeam = preserveManualFacts ? beams[0] || null : null;
    const prefilledBeam = createGeoLinearRowFromBim(
      prefill,
      element.geoBindingHint,
      previousBeam,
      geodesyRuntime.createEmptyBeamRow
    );
    replaceGeodesyItems(beams, [prefilledBeam]);
    geodesyRuntime.renderBeams();
  }

  renderGeoBimBindingSnapshot();
  geodesyRuntime.updateNodeId();

  updateGeoBimControlsState();

  if (targetGeoFlags.isWall || targetGeoFlags.isBeam) {
    const resolvedAxes = getBimAxesValue(element);
    setGeoBimStatus(
      `${getCurrentConstructionLabel()}${element.mark ? ` ${element.mark}` : ""}: подставлены две проектные точки${resolvedAxes ? ` и оси ${resolvedAxes}` : ""}.`,
      "success"
    );
    return;
  }
}

function syncGeoBimSelectionFromNode(nodeData: GeoBimNodeData = {}) {
  const nextId = String(nodeData.bimElementId || "").trim();
  geodesyNodeState.selectedBimElementId = nextId;
  const selectedElement = nextId ? bimElementsById.get(nextId) || null : null;

  renderGeoBimElementOptions(nextId);
  if (geoBimElementSelect) {
    geoBimElementSelect.value = nextId && bimElementsById.has(nextId) ? nextId : "";
  }
  if (geoBimMarkEl) {
    geoBimMarkEl.value = nodeData.bimMark || (selectedElement?.mark || "");
  }
  if (geoBimAxesEl) {
    geoBimAxesEl.value = nodeData.bimAxes || getBimAxesValue(selectedElement);
  }
  geodesyNodeState.bimBindingSnapshot = buildGeoBimBindingSnapshot({
    element: selectedElement,
    nodeData,
    constructionType: nodeData.construction || nodeData.constructionType || getCurrentConstructionKey()
  });
  renderGeoBimBindingSnapshot();
  updateGeoBimControlsState();
}

function collectGeoBimNodeData() {
  const selectedElement = getSelectedGeoBimElement();
  return {
    bimElementId: geodesyNodeState.selectedBimElementId || null,
    bimSourceModelId: selectedElement?.sourceModelId || null,
    bimIfcGuid: selectedElement?.ifcGuid || null,
    bimType: selectedElement?.type || null,
    bimMark: geoBimMarkEl?.value.trim() || null,
    bimAxes: geoBimAxesEl?.value.trim() || null,
    bimProjectX: selectedElement?.projectX ?? null,
    bimProjectY: selectedElement?.projectY ?? null,
    bimProjectH: selectedElement?.projectH ?? null,
    bimLineStartX: selectedElement?.lineStartX ?? null,
    bimLineStartY: selectedElement?.lineStartY ?? null,
    bimLineEndX: selectedElement?.lineEndX ?? null,
    bimLineEndY: selectedElement?.lineEndY ?? null
  };
}

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
  currentStrengthCheckId = null;
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
  dom: {
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
  },
  construction: construction as HTMLElement,
  storage: localStorage,
  storageKey: LS.nodes,
  inspectionState: state,
  inspectionChecked: checked,
  getCurrentProjectId: () => currentProjectId,
  getCurrentConstructionKey,
  getCurrentConstructionSubtype,
  getCurrentPileElement,
  getGeoConstructionFlags,
  setConstructionAndTrigger,
  buildCurrentConstructionPayload,
  collectGeoBimNodeData,
  syncGeoBimSelectionFromNode,
  clearGeoBimSelection,
  saveMeta,
  updateGeoBimControlsState,
  cancelProjectDesignAutosave: () => projectDesignAutosave.cancel(),
  saveProjectDesign: () => saveProjectDesignToFirestore(),
  updateSummaryTab: () => appModuleBridge.updateSummaryTab(),
  upsertJournalEntry: (payload) => appModuleBridge.upsertJournalEntry(payload),
  safeValue,
  showConfirm,
  showNotification
});
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
  bimElements.length = 0;
  bimElementsById.clear();
  if (geoBimMarkEl) geoBimMarkEl.value = "";
  if (geoBimAxesEl) geoBimAxesEl.value = "";
  clearGeoBimSelection({ keepManualFields: true });
  renderGeoBimElementOptions("");
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
  loadProjectBimElements,
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

const applyGeoBimFiltersDebounced = debounce(() => {
  renderGeoBimElementOptions(geodesyNodeState.selectedBimElementId);
  updateGeoBimControlsState();
}, 160);

initProjectSelectorBinding({
  projectSelector: projectSelector as HTMLSelectElement | null,
  setCurrentProjectId: setCurrentProjectIdState,
  setModulesEnabled,
  resetFormForNewProject,
  selectProject
});

initGeoBimBindings({
  geoBimElementSelect: geoBimElementSelect as HTMLSelectElement | null,
  onGeoBimElementSelect: (elementId) => {
    applyGeoBimElementSelection(elementId);
  },
  geoBimSearchInput: geoBimSearchInput as HTMLInputElement | null,
  onGeoBimSearchInput: () => {
    geoBimFilters.search = geoBimSearchInput.value || "";
    applyGeoBimFiltersDebounced();
  },
  geoBimTypeFilter: geoBimTypeFilter as HTMLSelectElement | null,
  onGeoBimTypeFilterChange: () => {
    geoBimFilters.type = normalizeGeoBimFilterValue(geoBimTypeFilter.value, "all");
    renderGeoBimElementOptions(geodesyNodeState.selectedBimElementId);
    updateGeoBimControlsState();
  },
  geoBimAxesFilter: geoBimAxesFilter as HTMLSelectElement | null,
  onGeoBimAxesFilterChange: () => {
    geoBimFilters.axes = normalizeGeoBimFilterValue(geoBimAxesFilter.value, "all");
    renderGeoBimElementOptions(geodesyNodeState.selectedBimElementId);
    updateGeoBimControlsState();
  },
  btnClearGeoBimSelection: btnClearGeoBimSelection as HTMLButtonElement | null,
  onGeoBimSelectionClear: () => {
    clearGeoBimSelection({ keepManualFields: true });
    setGeoBimStatus("BIM-привязка снята. Текущие значения в форме сохранены для ручного редактирования.", "info");
  }
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
  loadProjectBimElements,
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

renderGeoBimElementOptions("");
updateGeoBimControlsState();
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
exposeSummaryBinding("currentStrengthCheckId", () => currentStrengthCheckId, (value) => {
  currentStrengthCheckId = value;
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
globalThis.strengthChecks = strengthChecks;

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
