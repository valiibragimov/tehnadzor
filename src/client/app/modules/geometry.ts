import { evaluateGeometryCheck as evaluateGeomCheck } from "../../features/inspections/geometry/evaluation.js";
import { commonDimensionKeys, elementDimensionKeys, type PhysicalDimensions } from "../../features/inspections/geometry/dimensions.js";
import { mountPhysicalDimensions } from "../ui/physical-dimensions.js";
import { mountAcceptanceCriteria, readAcceptanceCriteria, restoreAcceptanceCriteria } from "../ui/acceptance-criteria.js";
import { t, translateEngineeringLabel } from "../../shared/i18n/index.js";
import { setBimResultHint } from "../ui/bim-result-hint.js";
import type { WorkspaceContext } from "../workspace-context.js";
import { APP_CONFIG, UI_TEXT } from "../../config.js";
import {
  getConstructionCategoryKey,
  getConstructionEntityLabels,
  getConstructionLabel,
  getConstructionModuleBehavior,
  getConstructionModuleFallbackMessage,
  getConstructionProfile,
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
  showConfirm,
  defaultRusLetters,
  defaultNumbers,
  normalizeMarking,
  parseDecimal,
  escapeHtml,
  sanitizeHtml,
  formatNodeValue
} from "../../utils.js";
import {
  addGeomColumn as geomAddColumn,
  removeGeomColumn as geomRemoveColumn,
  getGeomColumns as geomGetColumns,
  setGeomColumns as geomSetColumns,
  checkGeomColumnDuplicate as geomCheckColumnDuplicate,
  addGeomWall as geomAddWall,
  removeGeomWall as geomRemoveWall,
  getGeomWalls as geomGetWalls,
  setGeomWalls as geomSetWalls,
  checkGeomWallDuplicate as geomCheckWallDuplicate,
  addGeomStair as geomAddStair,
  removeGeomStair as geomRemoveStair,
  getGeomStairs as geomGetStairs,
  setGeomStairs as geomSetStairs,
  checkGeomStairDuplicate as geomCheckStairDuplicate,
  addGeomBeam as geomAddBeam,
  removeGeomBeam as geomRemoveBeam,
  getGeomBeams as geomGetBeams,
  setGeomBeams as geomSetBeams,
  checkGeomBeamDuplicate as geomCheckBeamDuplicate,
  clearByType as geomClearByType
} from "./geometry/data.js";
import {
  clearInspectionSourceDocs,
  saveInspectionSourceDoc,
  deleteInspectionSourceDocs,
  getProjectDocSnapshot,
  getProjectCollectionSnapshot
} from "../repositories/firestore-repository.js";
import {
  clearInspectionsByModuleAndRefreshAnalytics
} from "../services/inspection-sync.js";
import { refreshPendingProjectAnalytics } from "../services/analytics-current.js";
import type {
  GeometryBeamRecord,
  GeometryCheckRecord,
  GeometryColumnRecord,
  GeometryStairRecord,
  GeometryWallRecord,
  InspectionPayload
} from "../../types/module-records.js";
import { getRegulatoryBasisEntries } from "../services/regulatory-basis.js";
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
  getCurrentIfcFileFromInput
} from "../services/bim-runtime-context.js";
import { onAppTabActivated } from "../services/module-activation.js";
import {
  buildNodeDeleteIconButton,
  setupNodeCardInteractions
} from "../ui/node-card-interactions.js";
import { APP_STORAGE_KEYS } from "../storage.js";
import { getAuth } from "../../infrastructure/firebase/auth.js";

const safeValue = (value) => escapeHtml(value == null ? "" : String(value));
const BIM_MANUAL_MODE_MESSAGE = "";
const BIM_LOAD_ERROR_MESSAGE = "Не удалось загрузить BIM-элементы. Можно продолжить ручной ввод.";

const getCurrentProjectId = () => geometryContext.getProjectId();
const getCurrentIfcFile = getCurrentIfcFileFromInput;
type GeometryContext = Pick<WorkspaceContext, "getProjectId" | "geometryChecks" | "geometryCheckId" | "inspectionState" | "inspectionChecked" | "setConstruction">;
let geometryContext: GeometryContext;
let geometryActions: { updateSummary(): unknown; addJournalEntry(params: unknown): unknown; upsertJournalEntry(params: unknown): unknown; notifySync(ref: unknown): unknown };
export function configureGeometryWorkspace(context: GeometryContext, actions: typeof geometryActions) { geometryContext = context; geometryActions = actions; geomChecks = context.geometryChecks; }
const setCurrentGeomCheckId = (value: string | null) => { geometryContext.geometryCheckId = value; };
const getCurrentGeomCheckId = () => geometryContext.geometryCheckId;
const getState = () => geometryContext.inspectionState;
const getChecked = () => geometryContext.inspectionChecked;
const updateSummary = () => geometryActions.updateSummary();
const addJournalEntrySafe = (params: unknown) => geometryActions.addJournalEntry(params);
const upsertJournalEntrySafe = (params: unknown) => geometryActions.upsertJournalEntry(params);
const notifyFirestoreSyncStatusSafe = (ref: unknown) => geometryActions.notifySync(ref);

const auth = getAuth();

async function saveGeomInspection(projectId, inspectionId, checkData) {
  const projectSnap = await getProjectDocSnapshot(projectId);
  const projectData = projectSnap.exists() ? projectSnap.data() || {} : {};
  const authUid = String(auth.currentUser?.uid || "").trim();
  const ownerUid = String(projectData.ownerUid || projectData.createdBy || authUid || "").trim();
  const createdBy = String(projectData.createdBy || projectData.ownerUid || authUid || "").trim();
  const contractorName = String(projectData.contractorName || "").trim();

  const inspectionPayload: InspectionPayload = {
    projectId,
    module: "Геометрия",
    moduleKey: "geometry",
    sourceCollection: "geomChecks",
    sourceId: inspectionId,
    sourceDocId: inspectionId,
    construction: checkData?.construction || "",
    constructionSubtype: checkData?.constructionSubtype || "",
    constructionSubtypeLabel: checkData?.constructionSubtypeLabel || "",
    evaluationSchemaVersion: checkData.evaluationSchemaVersion || null,
    checkStatus: checkData?.status || null,
    summaryText: checkData?.summaryText || "",
    createdAt: checkData?.createdAt || Date.now(),
    updatedAt: Date.now(),
    contractorName
  };
  if (ownerUid) inspectionPayload.ownerUid = ownerUid;
  if (createdBy) inspectionPayload.createdBy = createdBy;

  const saved = await saveInspectionSourceDoc(projectId, "geomChecks", inspectionId,
    { ...checkData, updatedAt: Date.now() }, inspectionPayload);
  await refreshPendingProjectAnalytics(projectId);
  return saved;
}

async function clearGeomInspectionDualWrite(projectId) {
  return clearInspectionsByModuleAndRefreshAnalytics(projectId, {
    sourceCollection: "geomChecks",
    moduleKey: "geometry"
  });
}

let commonPhysicalDimensions: PhysicalDimensions = {};
function renderCommonDimensions() {
  const root = document.querySelector<HTMLElement>("#geometry [data-step='2']");
  if (!root) return;
  root.querySelector(":scope > [data-physical-dimensions]")?.remove();
  mountPhysicalDimensions(root, commonPhysicalDimensions, commonDimensionKeys(getSelectedConstructionKey(), getSelectedPileElement()));
  mountAcceptanceCriteria(root, [
    { key: "dimensions", label: t("physical_dimensions") }, { key: "section", label: t("dimension_section") },
    { key: "thickness", label: t("dimension_thickness") }, { key: "vertical", label: t("form_vertical_deviation_mm") },
    { key: "flatness", label: t("form_measured_flatness_deviation_mm") }, { key: "opening", label: t("dimension_opening") },
    { key: "step", label: t("dimension_step") }
  ]);
}
let geomChecks: Map<string, GeometryCheckRecord>;
let geometryInitialized = false;
let geomAxesInitialized = false;
let skipGeomJournalOnce = false;
let geomBimElements = [];
let selectedGeomBimElementId = "";
let geomBimBindingSnapshot = null;
let geomBimVisualPanel = null;
const geomBimElementsById = new Map();
const geomBimFilters = {
  search: "",
  type: "all",
  axes: "all"
};

// ============================
//  Геометрия: DOM элементы
// ============================
const construction = document.getElementById("construction");
const geomBimSearchInput = document.getElementById("geomBimSearchInput");
const geomBimTypeFilter = document.getElementById("geomBimTypeFilter");
const geomBimAxesFilter = document.getElementById("geomBimAxesFilter");
const geomBimElementSelect = document.getElementById("geomBimElementSelect");
const geomBimElementStatus = document.getElementById("geomBimElementStatus");
const geomBimSourceCard = document.getElementById("geomBimSourceCard");
const geomBimSourceTitle = document.getElementById("geomBimSourceTitle");
const geomBimSourceState = document.getElementById("geomBimSourceState");
const geomBimSourceMeta = document.getElementById("geomBimSourceMeta");
const geomBimAppliedTypeEl = document.getElementById("geomBimAppliedType");
const geomBimAppliedMarkEl = document.getElementById("geomBimAppliedMark");
const geomBimAppliedAxesEl = document.getElementById("geomBimAppliedAxes");
const geomBimAppliedGeometryEl = document.getElementById("geomBimAppliedGeometry");
const geomBimAppliedProjXEl = document.getElementById("geomBimAppliedProjX");
const geomBimAppliedProjYHEl = document.getElementById("geomBimAppliedProjYH");
const geomBimSourceHint = document.getElementById("geomBimSourceHint");
const geomBimMarkEl = document.getElementById("geomBimMark");
const geomBimAxesEl = document.getElementById("geomBimAxes");
const btnClearGeomBimSelection = document.getElementById("btnClearGeomBimSelection");
const geomManualAssistNote = document.getElementById("geomManualAssistNote");
const geomBehaviorMessage = document.getElementById("geomBehaviorMessage");
const geomBimPanelHost = geomBimSourceCard?.parentElement || geomBimElementSelect?.closest(".geo-bim-card");
const geomFloorEl = document.getElementById("geomFloor");
const geomFloorField = document.getElementById("geomFloorField");
const geomSheetTriggerRow = document.getElementById("geomSheetTriggerRow");
const geomFormworkFields = document.getElementById("geomFormworkFields");
const geomFormworkTypeEl = document.getElementById("geomFormworkType") as HTMLSelectElement | null;
const geomFormworkFloorEl = document.getElementById("geomFormworkFloor") as HTMLInputElement | null;
const geomFormworkElementNameEl = document.getElementById("geomFormworkElementName") as HTMLInputElement | null;
const geomFormworkAreaEl = document.getElementById("geomFormworkArea") as HTMLInputElement | null;
const geomFormworkProjHeightEl = document.getElementById("geomFormworkProjHeight") as HTMLInputElement | null;
const geomFormworkFactHeightEl = document.getElementById("geomFormworkFactHeight") as HTMLInputElement | null;
const geomFormworkProjWidthEl = document.getElementById("geomFormworkProjWidth") as HTMLInputElement | null;
const geomFormworkFactWidthEl = document.getElementById("geomFormworkFactWidth") as HTMLInputElement | null;
const geomFormworkProjThicknessEl = document.getElementById("geomFormworkProjThickness") as HTMLInputElement | null;
const geomFormworkFactThicknessEl = document.getElementById("geomFormworkFactThickness") as HTMLInputElement | null;
const geomFormworkVerticalDeviationEl = document.getElementById("geomFormworkVerticalDeviation") as HTMLInputElement | null;
const geomFormworkVerticalToleranceEl = document.getElementById("geomFormworkVerticalTolerance") as HTMLInputElement | null;
const geomFormworkBasisEl = document.getElementById("geomFormworkBasis") as HTMLSelectElement | null;
const geomFormworkNoteEl = document.getElementById("geomFormworkNote") as HTMLTextAreaElement | null;
  const projThick = document.getElementById("projThick");
  const factThick = document.getElementById("factThick");
  const vertDev = document.getElementById("vertDev");

  const geomPlateFields = document.getElementById("geomPlateFields");
  const geomPlateThickFields = document.getElementById("geomPlateThickFields");
  const geomColumnFields = document.getElementById("geomColumnFields");
  const geomWallFields = document.getElementById("geomWallFields");
const geomStairFields = document.getElementById("geomStairFields");
const geomBeamFields = document.getElementById("geomBeamFields");
const geomCommonFields = document.getElementById("geomCommonFields");
const geomStripAxisModeField = document.getElementById("geomStripAxisModeField");
const geomStripAxisModeEl = document.getElementById("geomStripAxisMode") as HTMLSelectElement | null;
const geomAxisLetterFromField = document.getElementById("geomAxisLetterFromField");
const geomAxisLetterToField = document.getElementById("geomAxisLetterToField");
const geomAxisNumberFromField = document.getElementById("geomAxisNumberFromField");
const geomAxisNumberToField = document.getElementById("geomAxisNumberToField");
const geomAxisLetterFromLabel = document.getElementById("geomAxisLetterFromLabel");
const geomAxisLetterToLabel = document.getElementById("geomAxisLetterToLabel");
const geomAxisNumberFromLabel = document.getElementById("geomAxisNumberFromLabel");
const geomAxisNumberToLabel = document.getElementById("geomAxisNumberToLabel");
const geomAxisLetterFromEl = document.getElementById("geomAxisLetterFrom");
const geomAxisLetterToEl = document.getElementById("geomAxisLetterTo");
const geomAxisNumberFromEl = document.getElementById("geomAxisNumberFrom");
const geomAxisNumberToEl = document.getElementById("geomAxisNumberTo");
  const geomLocationEl = document.getElementById("geomLocation");

  const projPlateHeightEl = document.getElementById("projPlateHeight");
  const factPlateHeightEl = document.getElementById("factPlateHeight");
  const geomPlateOpeningSizesEl = document.getElementById("geomPlateOpeningSizes");
  const geomPlateFactOpeningSizesEl = document.getElementById("geomPlateFactOpeningSizes");
  const factPlateFlatnessEl = document.getElementById("factPlateFlatness");
  const geomNoteEl = document.getElementById("geomNote");
  const geometryResult = document.getElementById("geometryResult");
  const geomProjPlateHeightLabel = document.getElementById("geomProjPlateHeightLabel");
  const geomFactPlateHeightLabel = document.getElementById("geomFactPlateHeightLabel");
  const geomProjOpeningSizesField = document.getElementById("geomProjOpeningSizesField");
  const geomFactOpeningSizesField = document.getElementById("geomFactOpeningSizesField");
  const geomProjOpeningSizesLabel = document.getElementById("geomProjOpeningSizesLabel");
  const geomFactOpeningSizesLabel = document.getElementById("geomFactOpeningSizesLabel");
  const geomPlateFlatnessValueField = document.getElementById("geomPlateFlatnessValueField");
  const geomPlateFlatnessLabel = document.getElementById("geomPlateFlatnessLabel");
  const geomProjThickLabel = document.getElementById("geomProjThickLabel");
  const geomFactThickLabel = document.getElementById("geomFactThickLabel");
  const geomVertDevField = document.getElementById("geomVertDevField");
  const geomVertDevLabel = document.getElementById("geomVertDevLabel");
  const geomNoteField = document.getElementById("geomNoteField");
  const factPlateFlatnessHelpContent = document.getElementById("factPlateFlatnessHelpContent");

const geomColumnsList = document.getElementById("geomColumnsList");
const btnAddGeomColumn = document.getElementById("btnAddGeomColumn");
const geomWallsList = document.getElementById("geomWallsList");
const btnAddGeomWall = document.getElementById("btnAddGeomWall");
const geomWallsLimitLabel = document.getElementById("geomWallsLimitLabel");
const geomStairsList = document.getElementById("geomStairsList");
const geomStairNameEl = document.getElementById("geomStairName");
const geomStairNameField = document.getElementById("geomStairNameField");
const btnAddGeomStair = document.getElementById("btnAddGeomStair");
const geomBeamsList = document.getElementById("geomBeamsList");
const btnAddGeomBeam = document.getElementById("btnAddGeomBeam");

function ensureGeomBimVisualSelector() {
  if (geomBimVisualPanel) return geomBimVisualPanel;

  geomBimVisualPanel = ensureBimVisualPanel({
    host: geomBimPanelHost,
    sourceCard: geomBimSourceCard,
    getAllElements: () => geomBimElements,
    getFilteredElements: () => getFilteredGeomBimElements(),
    getSelectedElement: () => getSelectedGeomBimElement(),
    getSelectedId: () => selectedGeomBimElementId,
    getCurrentProjectId,
    getCurrentIfcFile,
    onSelect: (elementId) => {
      applyGeomBimElementSelection(elementId);
    },
    labelBuilder: (element) => buildBimElementOptionLabel(element),
    moduleKey: "geometry"
  });

  return geomBimVisualPanel;
}

function renderGeomBimVisualPanel() {
  ensureGeomBimVisualSelector()?.render();
}

// ============================
//  Геометрия: helpers
// ============================
function fmtDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const FORMWORK_SUBTYPE_LABELS: Record<string, string> = {
  temporary: "Временная",
  permanent: "Несъёмная"
};
const FORMWORK_BASIS_LABELS: Record<string, string> = {
  project: "По проекту",
  ppr: "По ППР",
  sp_gost: "По СП/ГОСТ"
};

function readTextInputValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null) {
  return element ? element.value.trim() : "";
}

function readDecimalInputValue(element: HTMLInputElement | null) {
  const value = readTextInputValue(element);
  return value === "" ? null : parseDecimal(value);
}

function setTextInputValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null, value: unknown) {
  if (!element) return;
  element.value = value == null ? "" : String(value);
}

function formatFormworkSubtypeLabel(value: unknown) {
  const key = String(value || "").trim();
  return FORMWORK_SUBTYPE_LABELS[key] || key || "Не указано";
}

function formatFormworkBasisLabel(value: unknown) {
  const key = String(value || "").trim();
  return FORMWORK_BASIS_LABELS[key] || key || "Не указано";
}

function clearGeomFormworkFields() {
  setTextInputValue(geomFormworkTypeEl, getSelectedConstructionSubtype() || "temporary");
  [
    geomFormworkFloorEl,
    geomFormworkElementNameEl,
    geomFormworkAreaEl,
    geomFormworkProjHeightEl,
    geomFormworkFactHeightEl,
    geomFormworkProjWidthEl,
    geomFormworkFactWidthEl,
    geomFormworkProjThicknessEl,
    geomFormworkFactThicknessEl,
    geomFormworkVerticalDeviationEl,
    geomFormworkVerticalToleranceEl,
    geomFormworkNoteEl
  ].forEach((element) => setTextInputValue(element, ""));
  setTextInputValue(geomFormworkBasisEl, "project");
}

function getNextDifferentOption(options, currentValue) {
  return options.find((item) => item !== currentValue) || options[0] || "";
}

function getAvailableWallAxes(bindingType, excludeId = null) {
  if (bindingType === "letter_numbers") {
    for (const letterAxis of defaultRusLetters) {
      for (let firstIndex = 0; firstIndex < defaultNumbers.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < defaultNumbers.length; secondIndex += 1) {
          const numberAxis1 = defaultNumbers[firstIndex];
          const numberAxis2 = defaultNumbers[secondIndex];
          if (!checkGeomWallDuplicate(bindingType, "", "", "", letterAxis, numberAxis1, numberAxis2, excludeId)) {
            return { letterAxis, numberAxis1, numberAxis2 };
          }
        }
      }
    }

    return {
      letterAxis: defaultRusLetters[0] || "",
      numberAxis1: defaultNumbers[0] || "",
      numberAxis2: defaultNumbers[1] || defaultNumbers[0] || ""
    };
  }

  for (const numberAxis of defaultNumbers) {
    for (let firstIndex = 0; firstIndex < defaultRusLetters.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < defaultRusLetters.length; secondIndex += 1) {
        const letterAxis1 = defaultRusLetters[firstIndex];
        const letterAxis2 = defaultRusLetters[secondIndex];
        if (!checkGeomWallDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, "", "", "", excludeId)) {
          return { numberAxis, letterAxis1, letterAxis2 };
        }
      }
    }
  }

  return {
    numberAxis: defaultNumbers[0] || "",
    letterAxis1: defaultRusLetters[0] || "",
    letterAxis2: defaultRusLetters[1] || defaultRusLetters[0] || ""
  };
}

function ensureWallAxesDefaults(wall) {
  if (!wall) return;

  if (wall.bindingType === "letter_numbers") {
    wall.letterAxis = wall.letterAxis || defaultRusLetters[0] || "";
    wall.numberAxis1 = wall.numberAxis1 || defaultNumbers[0] || "";
    wall.numberAxis2 = wall.numberAxis2 && wall.numberAxis2 !== wall.numberAxis1
      ? wall.numberAxis2
      : getNextDifferentOption(defaultNumbers, wall.numberAxis1);

    if (checkGeomWallDuplicate(
      wall.bindingType,
      wall.numberAxis,
      wall.letterAxis1,
      wall.letterAxis2,
      wall.letterAxis,
      wall.numberAxis1,
      wall.numberAxis2,
      wall.id
    )) {
      Object.assign(wall, getAvailableWallAxes("letter_numbers", wall.id));
    }

    return;
  }

  wall.numberAxis = wall.numberAxis || defaultNumbers[0] || "";
  wall.letterAxis1 = wall.letterAxis1 || defaultRusLetters[0] || "";
  wall.letterAxis2 = wall.letterAxis2 && wall.letterAxis2 !== wall.letterAxis1
    ? wall.letterAxis2
    : getNextDifferentOption(defaultRusLetters, wall.letterAxis1);

  if (checkGeomWallDuplicate(
    wall.bindingType,
    wall.numberAxis,
    wall.letterAxis1,
    wall.letterAxis2,
    wall.letterAxis,
    wall.numberAxis1,
    wall.numberAxis2,
    wall.id
  )) {
    Object.assign(wall, getAvailableWallAxes("number_letters", wall.id));
  }
}

function ensureStairAxesDefaults(stair) {
  if (!stair) return;

  if (stair.bindingType === "letter_numbers") {
    stair.letterAxis = stair.letterAxis || defaultRusLetters[0] || "";
    stair.numberAxis1 = stair.numberAxis1 || defaultNumbers[0] || "";
    stair.numberAxis2 = stair.numberAxis2 && stair.numberAxis2 !== stair.numberAxis1
      ? stair.numberAxis2
      : getNextDifferentOption(defaultNumbers, stair.numberAxis1);
    return;
  }

  stair.numberAxis = stair.numberAxis || defaultNumbers[0] || "";
  stair.letterAxis1 = stair.letterAxis1 || defaultRusLetters[0] || "";
  stair.letterAxis2 = stair.letterAxis2 && stair.letterAxis2 !== stair.letterAxis1
    ? stair.letterAxis2
    : getNextDifferentOption(defaultRusLetters, stair.letterAxis1);
}

function normalizeOpeningSizesText(value) {
  return String(value ?? "").trim();
}

function formatOpeningSizesForNode(projectValue, actualValue) {
  const projectText = normalizeOpeningSizesText(projectValue);
  const actualText = normalizeOpeningSizesText(actualValue);

  if (projectText && actualText) {
    return `проект: ${projectText}; факт: ${actualText}`;
  }

  return projectText || actualText || "";
}


function moduleStorageKey(base) {
  const id = getCurrentProjectId() || "no_project";
  return `${base}_${id}`;
}

function getStorageKey() {
  return APP_STORAGE_KEYS.geom;
}

function normalizeGeomBimValue(value) {
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

function getGeomWallEntityLabel() {
  return getConstructionEntityLabels(getSelectedConstructionKey(), "geometry", getSelectedConstructionSubtype()).singular;
}

function getGeomWallEntityPlural() {
  return getConstructionEntityLabels(getSelectedConstructionKey(), "geometry", getSelectedConstructionSubtype()).plural;
}

function getGeomWallEntityPluralGenitive() {
  return getConstructionEntityLabels(getSelectedConstructionKey(), "geometry", getSelectedConstructionSubtype()).pluralGenitive;
}

function getGeomWallEntityAddText() {
  return getConstructionEntityLabels(getSelectedConstructionKey(), "geometry", getSelectedConstructionSubtype()).addText;
}

function getGeomWallEntityRequiredText() {
  return getConstructionEntityLabels(getSelectedConstructionKey(), "geometry", getSelectedConstructionSubtype()).requiredText;
}

function getGeometryConstructionProfile(value = getSelectedConstructionKey() || construction?.value || "") {
  return getConstructionProfile(value, "geometry");
}

function getGeometryConstructionFlags(value = getSelectedConstructionKey() || construction?.value || "") {
  const behavior = getConstructionModuleBehavior(value, "geometry", getSelectedConstructionSubtype(), getSelectedPileElement());
  const profile = behavior.profile || getGeometryConstructionProfile(value);
  return {
    profile,
    behavior,
    isPlate: profile === "plate",
    isColumn: profile === "column",
    isWall: profile === "wall",
    isBeam: profile === "beam",
    isStair: profile === "stair",
    isFormwork: profile === "formwork",
    isUnsupported: behavior.supported === false || profile === "unsupported",
    floorVisible: behavior.floorVisible !== false,
    locationMode: behavior.locationMode || "none",
    maxWalls: behavior.maxWalls ?? APP_CONFIG.MAX_ELEMENTS
  };
}

function getGeomWallLimit(flags = getGeometryConstructionFlags()) {
  return flags.maxWalls || APP_CONFIG.MAX_ELEMENTS;
}

function updateGeomWallsLimitUi(flags = getGeometryConstructionFlags()) {
  const maxWalls = getGeomWallLimit(flags);
  if (geomWallsLimitLabel) {
    geomWallsLimitLabel.textContent = `${getGeomWallEntityPlural()} (до ${maxWalls})`;
  }
  if (btnAddGeomWall) {
    const addGeomWallButton = btnAddGeomWall as HTMLButtonElement;
    const label = addGeomWallButton.querySelector(".lg-btn__label");
    if (label) label.textContent = `+ Добавить ${getGeomWallEntityAddText()}`;
    const isAtLimit = geomGetWalls().length >= maxWalls;
    addGeomWallButton.disabled = isAtLimit;
    addGeomWallButton.title = isAtLimit ? `Достигнут лимит ${maxWalls}: ${getGeomWallEntityPluralGenitive()}` : "";
  }
}

function setGeometryUnsupportedState({ notify = false } = {}) {
  const message = getConstructionModuleFallbackMessage(
    getSelectedConstructionKey() || construction?.value || "",
    "geometry",
    "",
    getSelectedConstructionSubtype()
  );
  const registryStatus = getInspectionStatus(
    getSelectedConstructionKey() || construction?.value || "",
    "geometry",
    getSelectedConstructionSubtype()
  );
  const showOnlyBehaviorMessage = registryStatus === "factory" || registryStatus === "notApplicable";
  if (geometryResult) {
    geometryResult.className = "result";
    geometryResult.textContent = showOnlyBehaviorMessage ? "" : message;
    geometryResult.style.display = showOnlyBehaviorMessage ? "none" : "";
  }
  if (geomBehaviorMessage) {
    geomBehaviorMessage.hidden = false;
    geomBehaviorMessage.textContent = message;
  }
  const state = getState();
  const checked = getChecked();
  state.geometry = false;
  checked.geometry = false;
  if (notify) {
    showNotification(message, "warning");
  }
  return message;
}

if (factPlateFlatnessHelpContent) {
  factPlateFlatnessHelpContent.textContent = UI_TEXT.PLATE_FLATNESS_HELP;
}

function hasGeomBimValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function formatGeomBimDisplayValue(value, fallback = "Нет данных") {
  return hasGeomBimValue(value) ? String(value) : fallback;
}

function toFiniteGeomNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function formatGeomBimNumber(value) {
  const normalized = toFiniteGeomNumber(value);
  if (normalized == null) return null;
  return `${normalized}`;
}

function matchesGeomBimNumber(currentValue, bimValue) {
  const currentNumber = toFiniteGeomNumber(String(currentValue ?? "").replace(",", "."));
  const sourceNumber = toFiniteGeomNumber(bimValue);
  if (currentNumber == null || sourceNumber == null) return false;
  return Math.abs(currentNumber - sourceNumber) < 0.0001;
}

function formatGeomBimShortGuid(value) {
  const normalized = normalizeGeomBimValue(value);
  if (!normalized) return null;
  return normalized.length > 16
    ? `${normalized.slice(0, 6)}...${normalized.slice(-6)}`
    : normalized;
}

function getSelectedGeomBimElement() {
  return geomBimElementsById.get(selectedGeomBimElementId) || null;
}

function buildGeomBimGeometrySummary(element = null) {
  if (!element) return "Нет надёжных размеров";

  const thickness = formatGeomBimNumber(element.thickness);
  const beamWidth = formatGeomBimNumber(element.width);
  const beamHeight = formatGeomBimNumber(element.height);
  const columnWidth = formatGeomBimNumber(element.sectionWidth);
  const columnHeight = formatGeomBimNumber(element.sectionHeight);

  if (element.type === "slab" && thickness) {
    return `Толщина ${thickness} мм`;
  }
  if (element.type === "beam" && beamWidth && beamHeight) {
    return `Сечение ${beamWidth} x ${beamHeight} мм`;
  }
  if (element.type === "column" && columnWidth && columnHeight) {
    return `Сечение ${columnWidth} x ${columnHeight} мм`;
  }

  return "Нет надёжных размеров";
}

function writeGeomBimNumericField(fieldEl, bimValue, { overwrite = false } = {}) {
  if (!fieldEl) return false;

  const normalizedBimValue = formatGeomBimNumber(bimValue);
  if (!normalizedBimValue) return false;

  const currentValue = String(fieldEl.value || "").trim();
  if (!currentValue || overwrite) {
    fieldEl.value = normalizedBimValue;
  }

  return matchesGeomBimNumber(fieldEl.value, bimValue);
}

function writeGeomBimStateNumber(sourceObject, key, bimValue, { overwrite = false } = {}) {
  if (!sourceObject || !key) return false;

  const normalizedBimValue = formatGeomBimNumber(bimValue);
  if (!normalizedBimValue) return false;

  const currentValue = String(sourceObject[key] || "").trim();
  if (!currentValue || overwrite) {
    sourceObject[key] = normalizedBimValue;
  }

  return matchesGeomBimNumber(sourceObject[key], bimValue);
}

function setGeomBimStatus(message, tone = "muted") {
  if (!geomBimElementStatus) return;
  const hasMessage = Boolean(String(message || "").trim());
  geomBimElementStatus.textContent = message;
  geomBimElementStatus.hidden = !hasMessage;
  geomBimElementStatus.dataset.empty = hasMessage ? "0" : "1";
  const statusField = geomBimElementStatus.closest(".geo-bim-status-field") as HTMLElement | null;
  if (statusField) statusField.hidden = !hasMessage;
  geomBimElementStatus.style.color =
    tone === "error"
      ? "#fca5a5"
      : tone === "success"
        ? "#86efac"
        : tone === "info"
          ? "#93c5fd"
          : "#E6B450";
}

function normalizeGeomBimFilterValue(value, fallback = "all") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function resetGeomBimFilters() {
  geomBimFilters.search = "";
  geomBimFilters.type = "all";
  geomBimFilters.axes = "all";
}

function syncGeomBimFilterControlsFromState() {
  if (geomBimSearchInput && geomBimSearchInput.value !== geomBimFilters.search) {
    geomBimSearchInput.value = geomBimFilters.search;
  }
  if (geomBimTypeFilter && geomBimTypeFilter.value !== geomBimFilters.type) {
    geomBimTypeFilter.value = geomBimFilters.type;
  }
  if (geomBimAxesFilter && geomBimAxesFilter.value !== geomBimFilters.axes) {
    geomBimAxesFilter.value = geomBimFilters.axes;
  }
}

function hasActiveGeomBimFilters() {
  return (
    String(geomBimFilters.search || "").trim() !== "" ||
    geomBimFilters.type !== "all" ||
    geomBimFilters.axes !== "all"
  );
}

function getFilteredGeomBimElements() {
  const searchQuery = String(geomBimFilters.search || "").trim().toLowerCase();

  return geomBimElements.filter((element) => {
    if (geomBimFilters.type !== "all" && element.type !== geomBimFilters.type) {
      return false;
    }

    const axesValue = String(element.axes || "").trim();
    if (geomBimFilters.axes !== "all" && axesValue !== geomBimFilters.axes) {
      return false;
    }

    if (searchQuery && !buildBimElementSearchText(element).includes(searchQuery)) {
      return false;
    }

    return true;
  });
}

function fillGeomBimFilterSelect(selectEl, options, defaultLabel, nextValue) {
  if (!selectEl) return;

  selectEl.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "all";
  defaultOption.textContent = translateEngineeringLabel(defaultLabel);
  selectEl.appendChild(defaultOption);

  const visibleOptions = options.slice(0, 100);
  const activeOption = options.find(option => option.value === nextValue);
  if (activeOption && !visibleOptions.includes(activeOption)) visibleOptions.unshift(activeOption);
  setBimResultHint(selectEl, options.length);
  visibleOptions.forEach((optionData) => {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    selectEl.appendChild(option);
  });

  const hasNextValue = nextValue === "all" || options.some((optionData) => optionData.value === nextValue);
  selectEl.value = hasNextValue ? nextValue : "all";
  selectEl.disabled = !getCurrentProjectId() || geomBimElements.length === 0;
}

function renderGeomBimFilterOptions() {
  const filterOptions = buildBimElementFilterOptions(geomBimElements);
  const nextType = normalizeGeomBimFilterValue(geomBimFilters.type, "all");
  const nextAxes = normalizeGeomBimFilterValue(geomBimFilters.axes, "all");

  fillGeomBimFilterSelect(geomBimTypeFilter, filterOptions.types, "Все типы", nextType);
  fillGeomBimFilterSelect(geomBimAxesFilter, filterOptions.axes, "Все оси", nextAxes);

  geomBimFilters.type = geomBimTypeFilter ? geomBimTypeFilter.value : nextType;
  geomBimFilters.axes = geomBimAxesFilter ? geomBimAxesFilter.value : nextAxes;
  syncGeomBimFilterControlsFromState();
}

function renderGeomBimElementOptions(selectedId = selectedGeomBimElementId) {
  if (!geomBimElementSelect) return;

  const previousValue = selectedId || "";
  const filteredElements = getFilteredGeomBimElements();
  const visibleElements = filteredElements.slice(0, 100);
  const selectedElement = previousValue ? geomBimElementsById.get(previousValue) : null;
  geomBimElementSelect.innerHTML = "";

  const manualOption = document.createElement("option");
  manualOption.value = "";
  manualOption.textContent = t("form_manual_entry_without_bim");
  geomBimElementSelect.appendChild(manualOption);

  if (selectedElement) {
    const selectedKey = selectedElement.elementId || selectedElement.id || "";
    const alreadyVisible = visibleElements.some((element) => (element.elementId || element.id || "") === selectedKey);
    if (!alreadyVisible) {
      visibleElements.unshift(selectedElement);
    }
  }

  setBimResultHint(geomBimElementSelect, filteredElements.length);

  visibleElements.forEach((element) => {
    const option = document.createElement("option");
    option.value = element.elementId || element.id || "";
    option.textContent = buildBimElementOptionLabel(element);
    geomBimElementSelect.appendChild(option);
  });

  if (!selectedElement && filteredElements.length === 0 && geomBimElements.length > 0) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "__empty__";
    emptyOption.textContent = "По текущим фильтрам BIM-элементы не найдены";
    emptyOption.disabled = true;
    geomBimElementSelect.appendChild(emptyOption);
  }

  const hasPreviousValue =
    previousValue === "" ||
    visibleElements.some((element) => (element.elementId || element.id || "") === previousValue);
  geomBimElementSelect.value = hasPreviousValue ? previousValue : "";
  renderGeomBimVisualPanel();
}

function getGeomBimFieldShell(fieldEl) {
  if (!fieldEl) return null;
  if (fieldEl === geomStairNameEl) return geomStairNameField;
  return fieldEl.closest("div");
}

function setGeomBimFieldAutofilled(fieldEl, isAutofilled) {
  const nextState = Boolean(isAutofilled);
  const shell = getGeomBimFieldShell(fieldEl);

  if (shell) {
    shell.classList.toggle("geo-bim-field--autofilled", nextState);
  }
  if (fieldEl) {
    fieldEl.classList.toggle("geo-bim-input--autofilled", nextState);
  }
}

function buildGeomBimBindingSnapshot({ element = null, checkData = null, constructionType = null } = {}) {
  const selectedElement = element || null;
  const fallbackData = checkData || {};
  const elementId =
    normalizeGeomBimValue(selectedElement?.elementId) ||
    normalizeGeomBimValue(selectedElement?.id) ||
    normalizeGeomBimValue(fallbackData.bimElementId);

  const rawType =
    normalizeGeomBimValue(selectedElement?.type)?.toLowerCase() ||
    normalizeGeomBimValue(fallbackData.bimType)?.toLowerCase();

  const typeLabel =
    getConstructionLabel(constructionType) ||
    getConstructionLabel(getTehnadzorTypeByBimType(rawType)) ||
    getConstructionLabel(fallbackData.construction) ||
    getConstructionLabel(fallbackData.constructionType) ||
    normalizeGeomBimValue(fallbackData.constructionLabel) ||
    normalizeGeomBimValue(fallbackData.construction);

  const mark =
    normalizeGeomBimValue(selectedElement?.mark) ||
    normalizeGeomBimValue(fallbackData.bimMark);

  const axes =
    normalizeGeomBimValue(selectedElement?.axes) ||
    normalizeGeomBimValue(fallbackData.bimAxes);

  const sourceModelId =
    normalizeGeomBimValue(selectedElement?.sourceModelId) ||
    normalizeGeomBimValue(fallbackData.bimSourceModelId);

  const ifcGuid =
    normalizeGeomBimValue(selectedElement?.ifcGuid) ||
    normalizeGeomBimValue(fallbackData.bimIfcGuid);

  const projectX = selectedElement?.projectX ?? fallbackData.bimProjectX ?? null;
  const projectY = selectedElement?.projectY ?? fallbackData.bimProjectY ?? null;
  const projectH = selectedElement?.projectH ?? fallbackData.bimProjectH ?? null;
  const thickness = selectedElement?.thickness ?? null;
  const width = selectedElement?.width ?? null;
  const height = selectedElement?.height ?? null;
  const sectionWidth = selectedElement?.sectionWidth ?? null;
  const sectionHeight = selectedElement?.sectionHeight ?? null;

  if (
    !elementId &&
    !rawType &&
    !mark &&
    !axes &&
    !sourceModelId &&
    !ifcGuid &&
    !hasGeomBimValue(projectX) &&
    !hasGeomBimValue(projectY) &&
    !hasGeomBimValue(projectH) &&
    !hasGeomBimValue(thickness) &&
    !hasGeomBimValue(width) &&
    !hasGeomBimValue(height) &&
    !hasGeomBimValue(sectionWidth) &&
    !hasGeomBimValue(sectionHeight)
  ) {
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
    thickness,
    width,
    height,
    sectionWidth,
    sectionHeight,
    title
  };
}

function renderGeomBimBindingSnapshot() {
  const snapshot = geomBimBindingSnapshot;
  const hasLink = Boolean(snapshot);

  if (geomBimSourceCard) {
    geomBimSourceCard.hidden = !hasLink;
    geomBimSourceCard.classList.toggle("is-linked", hasLink);
    geomBimSourceCard.classList.toggle("is-stale", hasLink && !snapshot?.resolved);
  }

  if (geomManualAssistNote) {
    const noteText = hasLink
      ? snapshot.resolved
        ? "Подсвеченные поля ниже подставлены из BIM. Для плит доступна толщина, для балок и колонн доступны проектные сечения. Остальное можно править вручную."
        : "BIM-привязка сохранена, но сам импортированный элемент сейчас недоступен. Геометрические поля можно продолжать редактировать вручную."
      : BIM_MANUAL_MODE_MESSAGE;
    geomManualAssistNote.textContent = noteText;
    geomManualAssistNote.hidden = !noteText;
    geomManualAssistNote.classList.toggle("is-linked", hasLink);
    geomManualAssistNote.classList.toggle("is-stale", hasLink && !snapshot?.resolved);
  }

  if (!hasLink) {
    setGeomBimFieldAutofilled(geomBimMarkEl, false);
    setGeomBimFieldAutofilled(geomBimAxesEl, false);
    setGeomBimFieldAutofilled(geomStairNameEl, false);
    setGeomBimFieldAutofilled(projPlateHeightEl, false);
    return;
  }

  if (geomBimSourceTitle) geomBimSourceTitle.textContent = snapshot.title;
  if (geomBimSourceState) geomBimSourceState.textContent = snapshot.resolved ? "Связка активна" : "Источник недоступен";
  if (geomBimSourceMeta) {
    const metaParts = [];
    if (snapshot.elementId) metaParts.push(`ID ${snapshot.elementId}`);
    if (snapshot.sourceModelId) metaParts.push(`Модель ${snapshot.sourceModelId}`);
    if (snapshot.ifcGuid) metaParts.push(`GUID ${formatGeomBimShortGuid(snapshot.ifcGuid)}`);
    geomBimSourceMeta.textContent = metaParts.join(" · ");
  }
  if (geomBimAppliedTypeEl) geomBimAppliedTypeEl.textContent = formatGeomBimDisplayValue(snapshot.typeLabel);
  if (geomBimAppliedMarkEl) geomBimAppliedMarkEl.textContent = formatGeomBimDisplayValue(snapshot.mark);
  if (geomBimAppliedAxesEl) geomBimAppliedAxesEl.textContent = formatGeomBimDisplayValue(snapshot.axes);
  if (geomBimAppliedGeometryEl) {
    geomBimAppliedGeometryEl.textContent = buildGeomBimGeometrySummary(
      snapshot.resolved ? getSelectedGeomBimElement() : null
    );
  }
  if (geomBimAppliedProjXEl) geomBimAppliedProjXEl.textContent = formatGeomBimDisplayValue(snapshot.projectX, "Не используется");
  if (geomBimAppliedProjYHEl) {
    const yText = hasGeomBimValue(snapshot.projectY) ? snapshot.projectY : "—";
    const hText = hasGeomBimValue(snapshot.projectH) ? snapshot.projectH : "—";
    geomBimAppliedProjYHEl.textContent = `Y ${yText} · H ${hText}`;
  }
  if (geomBimSourceHint) {
    geomBimSourceHint.textContent = snapshot.resolved
      ? "Из текущего BIM-MVP в геометрию надёжно приходят тип, марка, BIM-оси и часть проектных размеров: толщина плиты, сечение балки и сечение колонны."
      : "BIM-связка сохранена в проверке, но этот элемент сейчас не найден среди импортированных элементов проекта.";
  }

  setGeomBimFieldAutofilled(geomBimMarkEl, hasGeomBimValue(snapshot.mark));
  setGeomBimFieldAutofilled(geomBimAxesEl, hasGeomBimValue(snapshot.axes));
  setGeomBimFieldAutofilled(geomStairNameEl, construction?.value === "Лестница" && hasGeomBimValue(snapshot.mark));
  setGeomBimFieldAutofilled(
    projPlateHeightEl,
    construction?.value === "Плита" && matchesGeomBimNumber(projPlateHeightEl?.value, snapshot.thickness)
  );
}

function updateGeomBimControlsState() {
  const filteredElements = getFilteredGeomBimElements();
  const snapshot = geomBimBindingSnapshot;
  const projectId = getCurrentProjectId();

  if (geomBimElementSelect) geomBimElementSelect.disabled = !projectId || geomBimElements.length === 0;
  if (geomBimSearchInput) geomBimSearchInput.disabled = !projectId || geomBimElements.length === 0;
  if (geomBimTypeFilter) geomBimTypeFilter.disabled = !projectId || geomBimElements.length === 0;
  if (geomBimAxesFilter) geomBimAxesFilter.disabled = !projectId || geomBimElements.length === 0;
  if (btnClearGeomBimSelection) btnClearGeomBimSelection.disabled = !selectedGeomBimElementId;

  if (!projectId) {
    setGeomBimStatus("Сначала выберите объект. После этого станут доступны BIM-элементы проекта.", "muted");
    return;
  }

  const selectedElement = getSelectedGeomBimElement();
  if (!selectedElement && snapshot && !snapshot.resolved) {
    setGeomBimStatus(
      "BIM-привязка сохранена в проверке, но сам импортированный элемент сейчас не найден в проекте. Можно перепривязать элемент или продолжить вручную.",
      "info"
    );
    return;
  }

  if (geomBimElements.length === 0) {
    setGeomBimStatus(BIM_MANUAL_MODE_MESSAGE, "muted");
    return;
  }

  if (!selectedElement) {
    if (hasActiveGeomBimFilters()) {
      if (filteredElements.length === 0) {
        setGeomBimStatus("По текущим фильтрам BIM-элементы не найдены. Можно ослабить фильтры или продолжить вручную.", "info");
        return;
      }
      setGeomBimStatus(`Найдено ${filteredElements.length} BIM-элементов. Выберите элемент или продолжайте ручной ввод.`, "info");
      return;
    }
    setGeomBimStatus(BIM_MANUAL_MODE_MESSAGE, "muted");
    return;
  }

  const typeLabel = getConstructionLabel(getTehnadzorTypeByBimType(selectedElement.type), "Элемент");
  setGeomBimStatus(
    `Выбран ${typeLabel}${selectedElement.mark ? ` ${selectedElement.mark}` : ""}. Тип, марка, BIM-оси и доступные проектные размеры подставлены в форму.`,
    "success"
  );
}
function updateGeomLocation() {
  if (!geomAxisLetterFromEl || !geomAxisLetterToEl || !geomAxisNumberFromEl || !geomAxisNumberToEl || !geomLocationEl) return;
  const { behavior } = getGeometryConstructionFlags();
  const isStripFoundation = behavior.locationMode === "strip_foundation";
  const stripMode = geomStripAxisModeEl?.value || "letter_numbers";
  const letterFrom = geomAxisLetterFromEl.value;
  const letterTo = geomAxisLetterToEl.value;
  const numberFrom = geomAxisNumberFromEl.value;
  const numberTo = geomAxisNumberToEl.value;

  if (isStripFoundation) {
    if (stripMode === "letter_numbers") {
      if (letterFrom && letterTo && numberFrom && letterFrom !== letterTo) {
        geomLocationEl.value = `${numberFrom}, ${letterFrom}-${letterTo}`;
      } else {
        geomLocationEl.value = "";
      }
      return;
    }

    if (numberFrom && numberTo && letterFrom && numberFrom !== numberTo) {
      geomLocationEl.value = `${numberFrom}-${numberTo}, ${letterFrom}`;
    } else {
      geomLocationEl.value = "";
    }
    return;
  }

  if (letterFrom && letterTo && numberFrom && numberTo) {
    if (letterFrom === letterTo) {
      geomLocationEl.value = "";
      return;
    }
    if (numberFrom === numberTo) {
      geomLocationEl.value = "";
      return;
    }
    geomLocationEl.value = `${letterFrom}-${letterTo}, ${numberFrom}-${numberTo}`;
  } else {
    geomLocationEl.value = "";
  }
}

function applyDefaultGeomAxesSelection(force = false) {
  if (!geomAxisLetterFromEl || !geomAxisLetterToEl || !geomAxisNumberFromEl || !geomAxisNumberToEl) return;
  const { behavior } = getGeometryConstructionFlags();
  const isStripFoundation = behavior.locationMode === "strip_foundation";
  const stripMode = geomStripAxisModeEl?.value || "letter_numbers";

  const firstLetter = defaultRusLetters[0] || "";
  const secondLetter = defaultRusLetters[1] || firstLetter;
  const firstNumber = defaultNumbers[0] || "";
  const secondNumber = defaultNumbers[1] || firstNumber;

  if (force || !geomAxisLetterFromEl.value) geomAxisLetterFromEl.value = firstLetter;
  if (force || !geomAxisLetterToEl.value || geomAxisLetterToEl.value === geomAxisLetterFromEl.value) {
    geomAxisLetterToEl.value = secondLetter;
  }
  if (force || !geomAxisNumberFromEl.value) geomAxisNumberFromEl.value = firstNumber;
  if (force || !geomAxisNumberToEl.value || geomAxisNumberToEl.value === geomAxisNumberFromEl.value) {
    geomAxisNumberToEl.value = secondNumber;
  }

  if (isStripFoundation && stripMode === "letter_numbers") {
    geomAxisNumberToEl.value = "";
  }
  if (isStripFoundation && stripMode === "number_letters") {
    geomAxisLetterToEl.value = "";
  }

  updateGeomLocation();
}

function updateGeomFieldsVisibility() {
  renderCommonDimensions();
  if (!construction) return;

  const {
    behavior,
    isPlate,
    isColumn,
    isWall,
    isStair,
    isBeam,
    isFormwork,
    isUnsupported
  } = getGeometryConstructionFlags();
  const isStripFoundation = behavior.locationMode === "strip_foundation";
  const isBoredPileFoundation = getSelectedConstructionKey() === "pile_grillage";
  const boredPileElement = getSelectedPileElement();
  const showRangeLocation =
    behavior.locationMode === "plate_range" || behavior.locationMode === "strip_foundation";
  const showPlateNumbers = isPlate && !isUnsupported;

  if (geomBehaviorMessage) {
    geomBehaviorMessage.hidden = !isUnsupported;
    geomBehaviorMessage.textContent = isUnsupported
      ? getConstructionModuleFallbackMessage(getSelectedConstructionKey() || construction?.value || "", "geometry", "", getSelectedConstructionSubtype())
      : "";
  }
  if (!isUnsupported && geometryResult) {
    geometryResult.style.display = "";
  }

  if (geomFormworkFields) {
    geomFormworkFields.style.display = isFormwork ? "block" : "none";
  }
  if (geomBimPanelHost instanceof HTMLElement) {
    geomBimPanelHost.style.display = isFormwork ? "none" : "";
  }
  if (geomSheetTriggerRow) {
    geomSheetTriggerRow.style.display = isFormwork || isUnsupported ? "none" : "";
  }
  if (isFormwork && geomFormworkTypeEl && getSelectedConstructionSubtype()) {
    geomFormworkTypeEl.value = getSelectedConstructionSubtype();
  }

  if (geomFloorField) {
    geomFloorField.style.display = behavior.floorVisible === false || isFormwork ? "none" : "block";
  } else if (geomFloorEl?.parentElement) {
    geomFloorEl.parentElement.style.display = behavior.floorVisible === false || isFormwork ? "none" : "block";
  }

  if (geomPlateFields) geomPlateFields.style.display = showRangeLocation && !isUnsupported ? "block" : "none";
  if (geomPlateThickFields) geomPlateThickFields.style.display = showPlateNumbers ? "block" : "none";
  if (geomStripAxisModeField) geomStripAxisModeField.style.display = isStripFoundation && !isUnsupported ? "block" : "none";
  if (geomAxisLetterFromLabel) geomAxisLetterFromLabel.textContent = isStripFoundation ? "Буквенная ось" : "От буквенной оси";
  if (geomAxisLetterToLabel) geomAxisLetterToLabel.textContent = t("form_to_letter_grid_axis");
  if (geomAxisNumberFromLabel) geomAxisNumberFromLabel.textContent = isStripFoundation ? "Цифровая ось" : "От цифровой оси";
  if (geomAxisNumberToLabel) geomAxisNumberToLabel.textContent = t("form_to_number_grid_axis");
  const stripMode = geomStripAxisModeEl?.value || "letter_numbers";
  if (geomAxisLetterFromField) geomAxisLetterFromField.style.display = showRangeLocation && !isUnsupported ? "" : "none";
  if (geomAxisLetterToField) {
    geomAxisLetterToField.style.display = showRangeLocation && !isUnsupported && (!isStripFoundation || stripMode === "letter_numbers") ? "" : "none";
  }
  if (geomAxisNumberFromField) geomAxisNumberFromField.style.display = showRangeLocation && !isUnsupported ? "" : "none";
  if (geomAxisNumberToField) {
    geomAxisNumberToField.style.display = showRangeLocation && !isUnsupported && (!isStripFoundation || stripMode === "number_letters") ? "" : "none";
  }

  if (geomColumnFields) geomColumnFields.style.display = isColumn ? "block" : "none";
  if (isColumn) {
    renderGeomColumns();
  }
  if (!isColumn) {
    geomSetColumns([]);
    renderGeomColumns();
  }

  if (geomWallFields) geomWallFields.style.display = isWall ? "block" : "none";
  if (isWall) {
    const maxWalls = getGeomWallLimit();
    if (geomGetWalls().length > maxWalls) {
      geomSetWalls(geomGetWalls().slice(0, maxWalls));
    }
    updateGeomWallsLimitUi();
    renderGeomWalls();
  }
  if (!isWall) {
    geomClearByType("Стена");
    renderGeomWalls();
  }

  if (geomStairFields) geomStairFields.style.display = isStair ? "block" : "none";
  if (isStair) {
    renderGeomStairs();
  }
  if (!isStair) {
    geomSetStairs([]);
    if (geomStairNameEl) geomStairNameEl.value = "";
    renderGeomStairs();
  }

  if (geomBeamFields) geomBeamFields.style.display = isBeam ? "block" : "none";
  if (isBeam) {
    renderGeomBeams();
  }
  if (!isBeam) {
    geomClearByType("Балка");
    renderGeomBeams();
  }

  if (geomCommonFields) {
    geomCommonFields.style.display = behavior.showCommonWidth ? "block" : "none";
  }
  if (geomVertDevField) {
    geomVertDevField.style.display = behavior.showCommonVerticalDeviation ? "block" : "none";
  }
  if (geomNoteField) {
    geomNoteField.style.display = behavior.showNote ? "block" : "none";
  }

  const boredHeightProjectLabel = boredPileElement === "grillage" ? "Проектная высота ростверка" : "Проектная высота сваи";
  const boredHeightFactLabel = boredPileElement === "grillage" ? "Фактическая высота ростверка" : "Фактическая высота сваи";
  const boredWidthProjectLabel = boredPileElement === "grillage" ? "Проектная ширина ростверка" : "Проектный диаметр сваи";
  const boredWidthFactLabel = boredPileElement === "grillage" ? "Фактическая ширина ростверка" : "Фактический диаметр сваи";

  if (geomProjPlateHeightLabel) geomProjPlateHeightLabel.textContent = isBoredPileFoundation ? boredHeightProjectLabel : (behavior.geometryProjectHeightLabel || "Проектная толщина плиты");
  if (geomFactPlateHeightLabel) geomFactPlateHeightLabel.textContent = isBoredPileFoundation ? boredHeightFactLabel : (behavior.geometryFactHeightLabel || "Фактическая толщина плиты");
  if (geomProjOpeningSizesLabel) geomProjOpeningSizesLabel.textContent = isBoredPileFoundation ? boredWidthProjectLabel : (behavior.geometryProjectOpeningLabel || "Проектные размеры проёмов");
  if (geomFactOpeningSizesLabel) geomFactOpeningSizesLabel.textContent = isBoredPileFoundation ? boredWidthFactLabel : (behavior.geometryFactOpeningLabel || "Фактические размеры проёмов");
  if (geomPlateFlatnessLabel) geomPlateFlatnessLabel.textContent = behavior.geometryFlatnessLabel || "Фактическая плоскостность плиты";
  if (geomProjThickLabel) geomProjThickLabel.textContent = behavior.geometryCommonProjectWidthLabel || "Проектная толщина элемента";
  if (geomFactThickLabel) geomFactThickLabel.textContent = behavior.geometryCommonFactWidthLabel || "Фактическая толщина элемента";
  if (geomVertDevLabel) geomVertDevLabel.textContent = behavior.geometryCommonVerticalDeviationLabel || "Отклонение по вертикали";
  if (geomPlateOpeningSizesEl) {
    geomPlateOpeningSizesEl.setAttribute("placeholder", isStripFoundation || isBoredPileFoundation ? "Напр.: 400" : "Ш×В, Ш×В");
  }
  if (geomPlateFactOpeningSizesEl) {
    geomPlateFactOpeningSizesEl.setAttribute("placeholder", isStripFoundation || isBoredPileFoundation ? "Напр.: 400" : "Ш×В, Ш×В");
  }

  if (geomProjOpeningSizesField) geomProjOpeningSizesField.style.display = behavior.showOpeningSizes && !isBoredPileFoundation && !isStripFoundation ? "block" : "none";
  if (geomFactOpeningSizesField) geomFactOpeningSizesField.style.display = behavior.showOpeningSizes && !isBoredPileFoundation && !isStripFoundation ? "block" : "none";
  if (geomPlateFlatnessValueField) geomPlateFlatnessValueField.style.display = behavior.showPlateFlatness ? "block" : "none";

  if (showRangeLocation && !isUnsupported) {
    applyDefaultGeomAxesSelection();
    updateGeomLocation();
  } else {
    if (geomAxisLetterFromEl) geomAxisLetterFromEl.value = "";
    if (geomAxisLetterToEl) geomAxisLetterToEl.value = "";
    if (geomAxisNumberFromEl) geomAxisNumberFromEl.value = "";
    if (geomAxisNumberToEl) geomAxisNumberToEl.value = "";
    if (geomLocationEl) geomLocationEl.value = "";
  }

  if (isUnsupported) {
    setGeometryUnsupportedState();
  }

  renderGeomBimBindingSnapshot();
}

function initGeomAxes() {
  if (geomAxesInitialized) return;
  if (!geomAxisLetterFromEl || !geomAxisLetterToEl || !geomAxisNumberFromEl || !geomAxisNumberToEl) return;

  geomAxesInitialized = true;

  defaultRusLetters.forEach(l => {
    const opt1 = document.createElement("option");
    opt1.value = l;
    opt1.textContent = l;
    geomAxisLetterFromEl.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = l;
    opt2.textContent = l;
    geomAxisLetterToEl.appendChild(opt2);
  });

  defaultNumbers.forEach(n => {
    const opt1 = document.createElement("option");
    opt1.value = n;
    opt1.textContent = n;
    geomAxisNumberFromEl.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = n;
    opt2.textContent = n;
    geomAxisNumberToEl.appendChild(opt2);
  });

  applyDefaultGeomAxesSelection(true);

  [geomAxisLetterFromEl, geomAxisLetterToEl, geomAxisNumberFromEl, geomAxisNumberToEl].forEach(el => {
    if (!el) return;
    el.addEventListener("change", () => {
      const { behavior } = getGeometryConstructionFlags();
      const isStripFoundation = behavior.locationMode === "strip_foundation";
      const stripMode = geomStripAxisModeEl?.value || "letter_numbers";
      if ((!isStripFoundation || stripMode === "letter_numbers") && geomAxisLetterFromEl.value && geomAxisLetterToEl.value && geomAxisLetterFromEl.value === geomAxisLetterToEl.value) {
        showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
        applyDefaultGeomAxesSelection();
        return;
      }
      if ((!isStripFoundation || stripMode === "number_letters") && geomAxisNumberFromEl.value && geomAxisNumberToEl.value && geomAxisNumberFromEl.value === geomAxisNumberToEl.value) {
        showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
        applyDefaultGeomAxesSelection();
        return;
      }
      updateGeomLocation();
    });
  });
  geomStripAxisModeEl?.addEventListener("change", () => {
    applyDefaultGeomAxesSelection(true);
    updateGeomFieldsVisibility();
  });
}

function clearGeomDynamicBimFlags() {
  geomSetColumns(geomGetColumns().map((column) => ({
    ...column,
    bimAutofilledMark: false,
    bimAutofilledProjSize1: false,
    bimAutofilledProjSize2: false
  })));
  geomSetBeams(geomGetBeams().map((beam) => ({
    ...beam,
    bimAutofilledMark: false,
    bimAutofilledProjBeamWidth: false,
    bimAutofilledProjBeamHeight: false
  })));
  setGeomBimFieldAutofilled(projPlateHeightEl, false);
}

function ensureGeomColumnPrefillRow() {
  const geomColumns = geomGetColumns();
  if (geomColumns.length === 0) {
    const newColumns = [{
      id: Date.now(),
      marking: "",
      projSize1: "",
      factSize1: "",
      projSize2: "",
      factSize2: "",
      vertDev: "",
      bimAutofilledMark: false,
      bimAutofilledProjSize1: false,
      bimAutofilledProjSize2: false
    }];
    geomSetColumns(newColumns);
    return newColumns[0];
  }
  return geomColumns[0];
}

function ensureGeomBeamPrefillRow() {
  const geomBeams = geomGetBeams();
  if (geomBeams.length === 0) {
    const newBeams = [{
      id: Date.now(),
      marking: "",
      projBeamWidth: "",
      factBeamWidth: "",
      projBeamHeight: "",
      factBeamHeight: "",
      bimAutofilledMark: false,
      bimAutofilledProjBeamWidth: false,
      bimAutofilledProjBeamHeight: false
    }];
    geomSetBeams(newBeams);
    return newBeams[0];
  }
  return geomBeams[0];
}

function markGeomDynamicBimFields(snapshot = geomBimBindingSnapshot) {
  const mark = normalizeGeomBimValue(snapshot?.mark);
  const thickness = snapshot?.thickness;
  const beamWidth = snapshot?.width;
  const beamHeight = snapshot?.height;
  const columnWidth = snapshot?.sectionWidth;
  const columnHeight = snapshot?.sectionHeight;

  setGeomBimFieldAutofilled(
    projPlateHeightEl,
    construction?.value === "Плита" && matchesGeomBimNumber(projPlateHeightEl?.value, thickness)
  );

  if (construction?.value === "Колонна") {
    const nextColumns = geomGetColumns().map((column, index) => ({
      ...column,
      bimAutofilledMark: Boolean(mark) && (normalizeGeomBimValue(column.marking) === mark || (index === 0 && !normalizeGeomBimValue(column.marking))),
      bimAutofilledProjSize1: index === 0 && matchesGeomBimNumber(column.projSize1, columnWidth),
      bimAutofilledProjSize2: index === 0 && matchesGeomBimNumber(column.projSize2, columnHeight)
    }));
    geomSetColumns(nextColumns);
    renderGeomColumns();
  }

  if (construction?.value === "Балка") {
    const nextBeams = geomGetBeams().map((beam, index) => ({
      ...beam,
      bimAutofilledMark: Boolean(mark) && (normalizeGeomBimValue(beam.marking) === mark || (index === 0 && !normalizeGeomBimValue(beam.marking))),
      bimAutofilledProjBeamWidth: index === 0 && matchesGeomBimNumber(beam.projBeamWidth, beamWidth),
      bimAutofilledProjBeamHeight: index === 0 && matchesGeomBimNumber(beam.projBeamHeight, beamHeight)
    }));
    geomSetBeams(nextBeams);
    renderGeomBeams();
  }
}

function applyGeomBimDimensionPrefill(element, { overwrite = false } = {}) {
  if (element) {
    const assign = (values: PhysicalDimensions, key: string, source: unknown) => {
      const value = typeof source === "number" && Number.isFinite(source) && source > 0 ? source : null;
      if (value == null) return;
      values[key] ||= { project: "", actual: "" };
      if (overwrite || values[key].project === "" || values[key].project == null) values[key].project = value;
    };
    const constructionKey = getSelectedConstructionKey();
    for (const key of commonDimensionKeys(constructionKey, getSelectedPileElement())) {
      if (key === "length" || key === "width") assign(commonPhysicalDimensions, key, element[key]);
    }
    const flags = getGeometryConstructionFlags();
    const row = flags.isWall ? geomGetWalls()[0] : flags.isColumn ? ensureGeomColumnPrefillRow() : flags.isBeam ? ensureGeomBeamPrefillRow() : flags.isStair ? geomGetStairs()[0] : null;
    if (row) {
      row.physicalDimensions ||= {};
      if (flags.isWall || flags.isBeam || flags.isStair) assign(row.physicalDimensions, "length", element.length);
      if (flags.isWall || flags.isColumn) assign(row.physicalDimensions, "height", element.height);
    }
    renderCommonDimensions(); renderGeomWalls(); renderGeomStairs();
  }

  if (!element) {
    markGeomDynamicBimFields(null);
    return;
  }

  if (construction?.value === "Плита" && projPlateHeightEl && element.thickness != null) {
    writeGeomBimNumericField(projPlateHeightEl, element.thickness, { overwrite });
  }

  if (construction?.value === "Колонна" && (element.sectionWidth != null || element.sectionHeight != null)) {
    const firstColumn = ensureGeomColumnPrefillRow();
    if (element.sectionWidth != null) {
      writeGeomBimStateNumber(firstColumn, "projSize1", element.sectionWidth, { overwrite });
    }
    if (element.sectionHeight != null) {
      writeGeomBimStateNumber(firstColumn, "projSize2", element.sectionHeight, { overwrite });
    }
    geomSetColumns([...geomGetColumns()]);
  }

  if (construction?.value === "Балка" && (element.width != null || element.height != null)) {
    const firstBeam = ensureGeomBeamPrefillRow();
    if (element.width != null) {
      writeGeomBimStateNumber(firstBeam, "projBeamWidth", element.width, { overwrite });
    }
    if (element.height != null) {
      writeGeomBimStateNumber(firstBeam, "projBeamHeight", element.height, { overwrite });
    }
    geomSetBeams([...geomGetBeams()]);
  }

  markGeomDynamicBimFields(buildGeomBimBindingSnapshot({
    element,
    constructionType: construction?.value || getTehnadzorTypeByBimType(element.type)
  }));
}

function tryApplyPlateAxesFromBim(rawAxes) {
  const axesValue = String(rawAxes || "").trim();
  if (!axesValue) return false;

  const normalized = axesValue.replace(/\s+/g, "").toUpperCase();
  const match = normalized.match(/^([A-ZА-Я])-([A-ZА-Я]),?(\d+)-(\d+)$/u);
  if (!match) return false;

  const [, letterFrom, letterTo, numberFrom, numberTo] = match;
  const hasLetterFrom = Array.from(geomAxisLetterFromEl?.options || []).some((option) => option.value === letterFrom);
  const hasLetterTo = Array.from(geomAxisLetterToEl?.options || []).some((option) => option.value === letterTo);
  const hasNumberFrom = Array.from(geomAxisNumberFromEl?.options || []).some((option) => option.value === numberFrom);
  const hasNumberTo = Array.from(geomAxisNumberToEl?.options || []).some((option) => option.value === numberTo);
  if (!hasLetterFrom || !hasLetterTo || !hasNumberFrom || !hasNumberTo) return false;

  geomAxisLetterFromEl.value = letterFrom;
  geomAxisLetterToEl.value = letterTo;
  geomAxisNumberFromEl.value = numberFrom;
  geomAxisNumberToEl.value = numberTo;
  updateGeomLocation();
  return true;
}

function syncGeomBimFieldsFromState() {
  const selectedElement = getSelectedGeomBimElement();
  if (!selectedElement) {
    renderGeomBimElementOptions("");
    if (geomBimElementSelect) geomBimElementSelect.value = "";
    if (geomBimMarkEl) geomBimMarkEl.value = geomBimBindingSnapshot?.mark || "";
    if (geomBimAxesEl) geomBimAxesEl.value = geomBimBindingSnapshot?.axes || "";
    renderGeomBimBindingSnapshot();
    updateGeomBimControlsState();
    return;
  }

  if (geomBimElementSelect) {
    renderGeomBimElementOptions(selectedElement.elementId || selectedElement.id || "");
    geomBimElementSelect.value = selectedElement.elementId || selectedElement.id || "";
  }
  if (geomBimMarkEl) geomBimMarkEl.value = selectedElement.mark || "";
  if (geomBimAxesEl) geomBimAxesEl.value = selectedElement.axes || "";
  geomBimBindingSnapshot = buildGeomBimBindingSnapshot({ element: selectedElement });
  renderGeomBimBindingSnapshot();
  updateGeomBimControlsState();
}

function clearGeomBimSelection({ keepManualFields = true } = {}) {
  selectedGeomBimElementId = "";
  geomBimBindingSnapshot = null;
  renderGeomBimElementOptions("");
  if (geomBimElementSelect) geomBimElementSelect.value = "";

  if (!keepManualFields) {
    if (geomBimMarkEl) geomBimMarkEl.value = "";
    if (geomBimAxesEl) geomBimAxesEl.value = "";
  }

  clearGeomDynamicBimFlags();
  renderGeomColumns();
  renderGeomBeams();
  renderGeomBimBindingSnapshot();
  updateGeomBimControlsState();
}

async function loadGeomBimElements(projectId = getCurrentProjectId()) {
  geomBimElements = [];
  geomBimElementsById.clear();
  selectedGeomBimElementId = "";
  geomBimBindingSnapshot = null;
  resetGeomBimFilters();
  syncGeomBimFilterControlsFromState();
  if (geomBimMarkEl) geomBimMarkEl.value = "";
  if (geomBimAxesEl) geomBimAxesEl.value = "";
  clearGeomDynamicBimFlags();
  renderGeomBimBindingSnapshot();
  renderGeomBimFilterOptions();
  renderGeomBimElementOptions("");

  if (!projectId || String(projectId).trim() === "") {
    updateGeomBimControlsState();
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

    geomBimElements = sortProjectBimElements(loadedElements);
    geomBimElements.forEach((element) => {
      const key = element.elementId || element.id;
      if (key) geomBimElementsById.set(key, element);
    });
    renderGeomBimFilterOptions();
    renderGeomBimElementOptions("");
    updateGeomBimControlsState();
  } catch (error) {
    console.error("Ошибка загрузки BIM-элементов для геометрии:", error);
    setGeomBimStatus(BIM_LOAD_ERROR_MESSAGE, "error");
  }
}

function applyGeomBimElementSelection(elementId) {
  const nextId = String(elementId || "").trim();
  if (!nextId) {
    clearGeomBimSelection({ keepManualFields: true });
    return;
  }

  const element = geomBimElementsById.get(nextId);
  if (!element) {
    setGeomBimStatus("Выбранный BIM-элемент не найден в проекте. Обновите список элементов.", "error");
    return;
  }

  selectedGeomBimElementId = nextId;
  clearGeomDynamicBimFlags();
  syncGeomBimFieldsFromState();

  const targetConstruction = getTehnadzorTypeByBimType(element.type) || construction?.value || "";
  const targetFlags = getGeometryConstructionFlags(targetConstruction);
  if (construction && targetConstruction) {
    if (geometryContext.setConstruction) {
      geometryContext.setConstruction(targetConstruction);
    } else {
      construction.value = targetConstruction;
      updateGeomFieldsVisibility();
    }
  }

  geomBimBindingSnapshot = buildGeomBimBindingSnapshot({
    element,
    constructionType: targetConstruction
  });

  if (geomFloorEl && !geomFloorEl.value && element.floor) {
    geomFloorEl.value = element.floor;
  }

  if (targetFlags.isColumn && element.mark) {
    const firstColumn = ensureGeomColumnPrefillRow();
    firstColumn.marking = element.mark;
    firstColumn.bimAutofilledMark = true;
    geomSetColumns([...geomGetColumns()]);
    renderGeomColumns();
  } else if (targetFlags.isBeam && element.mark) {
    const firstBeam = ensureGeomBeamPrefillRow();
    firstBeam.marking = element.mark;
    firstBeam.bimAutofilledMark = true;
    geomSetBeams([...geomGetBeams()]);
    renderGeomBeams();
  } else if (targetFlags.isStair && geomStairNameEl && element.mark) {
    geomStairNameEl.value = element.mark;
  } else {
    markGeomDynamicBimFields(geomBimBindingSnapshot);
  }

  if (targetFlags.isPlate) {
    tryApplyPlateAxesFromBim(element.axes);
  }

  applyGeomBimDimensionPrefill(element, { overwrite: true });
  renderGeomBimBindingSnapshot();
  updateGeomBimControlsState();
}

function syncGeomBimSelectionFromCheck(checkData: GeometryCheckRecord = {}) {
  const nextId = String(checkData.bimElementId || "").trim();
  selectedGeomBimElementId = nextId;
  const selectedElement = nextId ? geomBimElementsById.get(nextId) || null : null;

  renderGeomBimElementOptions(nextId);
  if (geomBimElementSelect) {
    geomBimElementSelect.value = nextId && geomBimElementsById.has(nextId) ? nextId : "";
  }
  if (geomBimMarkEl) {
    geomBimMarkEl.value = checkData.bimMark || (selectedElement?.mark || "");
  }
  if (geomBimAxesEl) {
    geomBimAxesEl.value = checkData.bimAxes || (selectedElement?.axes || "");
  }

  geomBimBindingSnapshot = buildGeomBimBindingSnapshot({
    element: selectedElement,
    checkData,
    constructionType: checkData.construction || checkData.constructionType || getSelectedConstructionKey()
  });

  if (geomBimBindingSnapshot?.mark && construction?.value === "Лестница" && geomStairNameEl && !geomStairNameEl.value) {
    geomStairNameEl.value = geomBimBindingSnapshot.mark;
  }

  if (selectedElement) {
    applyGeomBimDimensionPrefill(selectedElement, { overwrite: false });
  } else {
    markGeomDynamicBimFields(geomBimBindingSnapshot);
  }

  renderGeomBimBindingSnapshot();
  updateGeomBimControlsState();
}

function collectGeomBimCheckData(): GeometryCheckRecord {
  const selectedElement = getSelectedGeomBimElement();
  return {
    bimElementId: selectedGeomBimElementId || null,
    bimSourceModelId: selectedElement?.sourceModelId || geomBimBindingSnapshot?.sourceModelId || null,
    bimIfcGuid: selectedElement?.ifcGuid || geomBimBindingSnapshot?.ifcGuid || null,
    bimType: selectedElement?.type || geomBimBindingSnapshot?.rawType || null,
    bimMark: normalizeGeomBimValue(geomBimMarkEl?.value) || null,
    bimAxes: normalizeGeomBimValue(geomBimAxesEl?.value) || null,
    bimProjectX: selectedElement?.projectX ?? geomBimBindingSnapshot?.projectX ?? null,
    bimProjectY: selectedElement?.projectY ?? geomBimBindingSnapshot?.projectY ?? null,
    bimProjectH: selectedElement?.projectH ?? geomBimBindingSnapshot?.projectH ?? null
  };
}
// ============================
//  Геометрия: Колонны
// ============================
function checkGeomColumnDuplicate(marking, excludeId = null) {
  return geomCheckColumnDuplicate(marking, excludeId);
}

function addGeomColumn() {
  geomAddColumn(() => {
    renderGeomColumns();
    setTimeout(() => {
      const lastCol = geomColumnsList?.querySelector(".card:last-child");
      if (lastCol) {
        lastCol.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
  });
}

function removeGeomColumn(id) {
  geomRemoveColumn(id, renderGeomColumns);
}

function renderGeomColumns() {
  if (!geomColumnsList) return;
  const geomColumns = geomGetColumns();
  geomColumnsList.innerHTML = "";

  if (geomColumns.length === 0) {
    geomColumnsList.innerHTML = '<div class="caption" style="padding: 8px;">Нет добавленных колонн. Нажмите "Добавить колонну" для начала.</div>';
    return;
  }

  geomColumns.forEach((column, index) => {
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
        <label data-i18n="form_column_marking">Маркировка колонны </label>
        <input type="text" class="geom-col-marking ${column.bimAutofilledMark ? "geo-bim-input--autofilled" : ""}" data-id="${safeValue(column.id)}" placeholder="Напр.: К 1.12" value="${safeValue(column.marking || "")}" required />
      </div>
      <div class="grid-2 mt8">
        <div class="${column.bimAutofilledProjSize1 ? "geo-bim-field--autofilled" : ""}">
          <label>Проектный размер сечения 1</label>
          <input type="number" inputmode="decimal" class="geom-col-projSize1 ${column.bimAutofilledProjSize1 ? "geo-bim-input--autofilled" : ""}" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.projSize1 || "")}" />
        </div>
        <div>
          <label>Фактический размер сечения 1</label>
          <input type="number" inputmode="decimal" class="geom-col-factSize1" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.factSize1 || "")}" />
        </div>
        <div class="${column.bimAutofilledProjSize2 ? "geo-bim-field--autofilled" : ""}">
          <label>Проектный размер сечения 2</label>
          <input type="number" inputmode="decimal" class="geom-col-projSize2 ${column.bimAutofilledProjSize2 ? "geo-bim-input--autofilled" : ""}" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.projSize2 || "")}" />
        </div>
        <div>
          <label>Фактический размер сечения 2</label>
          <input type="number" inputmode="decimal" class="geom-col-factSize2" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.factSize2 || "")}" />
        </div>
        <div>
        </div>
        <div>
          <label>Фактическое отклонение по вертикали</label>
          <input type="number" inputmode="decimal" class="geom-col-vertDev" data-id="${safeValue(column.id)}" placeholder="мм" value="${safeValue(column.vertDev || "")}" />
        </div>
      </div>
    `;

    column.physicalDimensions ||= {};
    mountPhysicalDimensions(colDiv, column.physicalDimensions, elementDimensionKeys("columns"));
    colDiv.querySelectorAll("input").forEach(input => {
      input.addEventListener("input", (e) => {
        const geomColumns = geomGetColumns();
        const colItem = geomColumns.find(c => c.id === column.id);
        if (!colItem) return;
        if (e.target.classList.contains("geom-col-marking")) {
          colItem.marking = e.target.value;
        } else if (e.target.classList.contains("geom-col-projSize1")) {
          colItem.projSize1 = e.target.value;
          colItem.bimAutofilledProjSize1 =
            geomGetColumns()[0]?.id === column.id &&
            matchesGeomBimNumber(e.target.value, geomBimBindingSnapshot?.sectionWidth);
          e.target.classList.toggle("geo-bim-input--autofilled", colItem.bimAutofilledProjSize1);
          e.target.closest("div")?.classList.toggle("geo-bim-field--autofilled", colItem.bimAutofilledProjSize1);
        }
        else if (e.target.classList.contains("geom-col-factSize1")) colItem.factSize1 = e.target.value;
        else if (e.target.classList.contains("geom-col-projSize2")) {
          colItem.projSize2 = e.target.value;
          colItem.bimAutofilledProjSize2 =
            geomGetColumns()[0]?.id === column.id &&
            matchesGeomBimNumber(e.target.value, geomBimBindingSnapshot?.sectionHeight);
          e.target.classList.toggle("geo-bim-input--autofilled", colItem.bimAutofilledProjSize2);
          e.target.closest("div")?.classList.toggle("geo-bim-field--autofilled", colItem.bimAutofilledProjSize2);
        }
        else if (e.target.classList.contains("geom-col-factSize2")) colItem.factSize2 = e.target.value;
        else if (e.target.classList.contains("geom-col-vertDev")) colItem.vertDev = e.target.value;
      });
    });

    const markingInput = colDiv.querySelector(".geom-col-marking");
    if (markingInput) {
      markingInput.addEventListener("blur", (e) => {
        const geomColumns = geomGetColumns();
        const colItem = geomColumns.find(c => c.id === column.id);
        if (!colItem) return;
        const newMarking = normalizeMarking(e.target.value);
        if (newMarking && checkGeomColumnDuplicate(newMarking, column.id)) {
          showNotification("Колонна с такой маркировкой уже существует. Введите другую маркировку.", "warning");
          e.target.value = colItem.marking || "";
          e.target.focus();
          return;
        }
        colItem.marking = newMarking;
        geomSetColumns(geomColumns);
      });
    }

    colDiv.querySelector(`[data-remove="${column.id}"]`).addEventListener("click", () => {
      removeGeomColumn(column.id);
    });

    geomColumnsList.appendChild(colDiv);
  });
}
// ============================
//  Геометрия: Стены
// ============================
function checkGeomWallDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis, numberAxis1, numberAxis2, excludeId = null) {
  return geomCheckWallDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis, numberAxis1, numberAxis2, excludeId);
}

function addGeomWall() {
  geomAddWall(() => {
    renderGeomWalls();
    setTimeout(() => {
      const lastWall = geomWallsList?.querySelector(".card:last-child");
      if (lastWall) {
        lastWall.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
  }, getGeomWallLimit());
}

function removeGeomWall(id) {
  geomRemoveWall(id, renderGeomWalls);
}

function renderGeomWalls() {
  if (!geomWallsList) return;
  updateGeomWallsLimitUi();
  const geomWalls = geomGetWalls();
  geomWallsList.innerHTML = "";

  if (geomWalls.length === 0) {
    geomWallsList.innerHTML = `<div class="caption" style="padding: 8px;">Нет добавленных ${getGeomWallEntityPluralGenitive()}. Нажмите "Добавить ${getGeomWallEntityAddText()}" для начала.</div>`;
    return;
  }

  geomWalls.forEach((wall, index) => {
    ensureWallAxesDefaults(wall);
    const wallDiv = document.createElement("div");
    wallDiv.className = "card";
    wallDiv.style.marginBottom = "8px";
    wallDiv.style.padding = "12px";

    const isNumberLetters = wall.bindingType === "number_letters";
    const flatnessHelpId = `factWallFlatnessHelpContent-${safeValue(wall.id)}`;
    const openingSizesHelpId = `openingSizesHelpContent-${safeValue(wall.id)}`;
    const wallEntityLabel = getGeomWallEntityLabel().toLocaleLowerCase("ru");

    wallDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <b>${getGeomWallEntityLabel()} ${index + 1}</b>
        <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact" data-remove="${safeValue(wall.id)}">
          <span class="lg-btn__label">Удалить</span>
          <span class="lg-btn__glow" aria-hidden="true"></span>
        </button>
      </div>
      <div class="mt8">
        <label data-i18n="form_grid_binding">Тип привязки</label>
        <select class="geom-wall-binding-type ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
          <option value="number_letters" ${isNumberLetters ? "selected" : ""}>Одна цифровая, две буквенные (например, 1, В-Г)</option>
          <option value="letter_numbers" ${!isNumberLetters ? "selected" : ""}>Одна буквенная, две цифровые (например, Г, 6-7)</option>
        </select>
      </div>
      ${isNumberLetters ? `
        <div class="grid-3 mt8">
          <div>
            <label data-i18n="form_number_grid_axis">Цифровая ось </label>
            <select class="geom-wall-number-axis ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              ${defaultNumbers.map(n => `<option value="${n}" ${wall.numberAxis === n ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
          <div>
            <label data-i18n="form_letter_grid_axis_1">Буквенная ось 1 </label>
            <select class="geom-wall-letter-axis1 ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              ${defaultRusLetters.map(l => `<option value="${l}" ${wall.letterAxis1 === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div>
            <label data-i18n="form_letter_grid_axis_2">Буквенная ось 2 </label>
            <select class="geom-wall-letter-axis2 ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              ${defaultRusLetters.map(l => `<option value="${l}" ${wall.letterAxis2 === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
        </div>
      ` : `
        <div class="grid-3 mt8">
          <div>
            <label data-i18n="form_letter_grid_axis">Буквенная ось </label>
            <select class="geom-wall-letter-axis ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              ${defaultRusLetters.map(l => `<option value="${l}" ${wall.letterAxis === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div>
            <label data-i18n="form_number_grid_axis_1">Цифровая ось 1 </label>
            <select class="geom-wall-number-axis1 ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              ${defaultNumbers.map(n => `<option value="${n}" ${wall.numberAxis1 === n ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
          <div>
            <label data-i18n="form_number_grid_axis_2">Цифровая ось 2 </label>
            <select class="geom-wall-number-axis2 ui-select" data-id="${safeValue(wall.id)}" style="width: 100%;">
              ${defaultNumbers.map(n => `<option value="${n}" ${wall.numberAxis2 === n ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
        </div>
      `}
      <div class="grid-2 mt8">
        <div>
          <label>Проектная толщина ${wallEntityLabel}</label>
          <input type="number" inputmode="decimal" class="geom-wall-projThick" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.projThick || "")}" />
        </div>
        <div>
          <label>Фактическая толщина ${wallEntityLabel}</label>
          <input type="number" inputmode="decimal" class="geom-wall-factThick" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.factThick || "")}" />
        </div>
        <div>
          <label>Проектная высота расположения проёмов</label>
          <input type="number" inputmode="decimal" class="geom-wall-projOpeningHeight" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.projOpeningHeight || "")}" />
        </div>
        <div>
          <label>Фактическая высота расположения проёмов</label>
          <input type="number" inputmode="decimal" class="geom-wall-factOpeningHeight" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.factOpeningHeight || "")}" />
        </div>
        <div>
          <div class="field-label-row">
            <label for="geom-wall-projOpeningSizes-${safeValue(wall.id)}" data-i18n="form_design_opening_dimensions">Проектные размеры проёмов</label>
            <button type="button" class="module-help-toggle" data-help-target="${openingSizesHelpId}" aria-label="Как заполнять размеры проёмов"></button>
          </div>
          <input type="text" id="geom-wall-projOpeningSizes-${safeValue(wall.id)}" class="geom-wall-projOpeningSizes" data-id="${safeValue(wall.id)}" placeholder="Ш×В, Ш×В" value="${safeValue(wall.projOpeningSizes || wall.openingSizes || "")}" />
        </div>
        <div>
          <label for="geom-wall-factOpeningSizes-${safeValue(wall.id)}" data-i18n="form_measured_opening_dimensions">Фактические размеры проёмов</label>
          <input type="text" id="geom-wall-factOpeningSizes-${safeValue(wall.id)}" class="geom-wall-factOpeningSizes" data-id="${safeValue(wall.id)}" placeholder="Ш×В, Ш×В" value="${safeValue(wall.factOpeningSizes || "")}" />
        </div>
        <div>
        </div>
        <div>
          <div class="field-label-row">
            <label for="factWallFlatness-${safeValue(wall.id)}">Фактическая плоскостность ${wallEntityLabel}</label>
            <button type="button" class="module-help-toggle" data-help-target="${flatnessHelpId}" aria-label="Как проверять плоскостность ${wallEntityLabel}"></button>
          </div>
          <input type="number" inputmode="decimal" id="factWallFlatness-${safeValue(wall.id)}" class="geom-wall-factWallFlatness" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.factWallFlatness || "")}" />
        </div>
        <div>
        </div>
        <div>
          <label>Фактическое отклонение по вертикали</label>
          <input type="number" inputmode="decimal" class="geom-wall-vertDev" data-id="${safeValue(wall.id)}" placeholder="мм" value="${safeValue(wall.vertDev || "")}" />
        </div>
      </div>
      <div class="module-help-content" id="${flatnessHelpId}" hidden>
        Приложите двухметровую рейку к ${wallEntityLabel === "пилон" ? "пилону" : "стене"} и зафиксируйте самый большой просвет.
      </div>
      <div class="module-help-content" id="${openingSizesHelpId}" hidden>
        Указывайте каждый проём в формате Ш×В через запятую. Порядок проёмов в проекте и факте должен совпадать.
      </div>
    `;

    wallDiv.querySelector(".geom-wall-binding-type").addEventListener("change", (e) => {
      const geomWalls = geomGetWalls();
      const wallItem = geomWalls.find(w => w.id === wall.id);
      if (!wallItem) return;
      const oldBindingType = wallItem.bindingType;
      wallItem.bindingType = e.target.value;
      ensureWallAxesDefaults(wallItem);

      if (wallItem.bindingType === "number_letters") {
        if (wallItem.letterAxis1 && wallItem.letterAxis2 && wallItem.letterAxis1 === wallItem.letterAxis2) {
          wallItem.bindingType = oldBindingType;
          showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
          renderGeomWalls();
          return;
        }
      } else if (wallItem.numberAxis1 && wallItem.numberAxis2 && wallItem.numberAxis1 === wallItem.numberAxis2) {
        wallItem.bindingType = oldBindingType;
        showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
        renderGeomWalls();
        return;
      }

      if (checkGeomWallDuplicate(
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
        showNotification(`${getGeomWallEntityLabel()} с такой привязкой по осям уже существует.`, "warning");
        renderGeomWalls();
        return;
      }

      renderGeomWalls();
    });

    wallDiv.querySelectorAll("select").forEach(select => {
      if (select.classList.contains("geom-wall-binding-type")) return;

      select.addEventListener("change", (e) => {
        const geomWalls = geomGetWalls();
        const wallItem = geomWalls.find(w => w.id === wall.id);
        if (!wallItem) return;
        const className = e.target.className;
        if (className.includes("geom-wall-number-axis")) {
          wallItem.numberAxis = e.target.value;
        } else if (className.includes("geom-wall-letter-axis1")) {
          if (wallItem.bindingType === "number_letters" && wallItem.letterAxis2 && e.target.value === wallItem.letterAxis2) {
            showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
            e.target.value = wallItem.letterAxis1 || "";
            renderGeomWalls();
            return;
          }
          wallItem.letterAxis1 = e.target.value;
        } else if (className.includes("geom-wall-letter-axis2")) {
          if (wallItem.bindingType === "number_letters" && wallItem.letterAxis1 && e.target.value === wallItem.letterAxis1) {
            showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
            e.target.value = wallItem.letterAxis2 || "";
            renderGeomWalls();
            return;
          }
          wallItem.letterAxis2 = e.target.value;
        } else if (className.includes("geom-wall-letter-axis")) {
          wallItem.letterAxis = e.target.value;
        } else if (className.includes("geom-wall-number-axis1")) {
          if (wallItem.bindingType === "letter_numbers" && wallItem.numberAxis2 && e.target.value === wallItem.numberAxis2) {
            showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
            e.target.value = wallItem.numberAxis1 || "";
            renderGeomWalls();
            return;
          }
          wallItem.numberAxis1 = e.target.value;
        } else if (className.includes("geom-wall-number-axis2")) {
          if (wallItem.bindingType === "letter_numbers" && wallItem.numberAxis1 && e.target.value === wallItem.numberAxis1) {
            showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
            e.target.value = wallItem.numberAxis2 || "";
            renderGeomWalls();
            return;
          }
          wallItem.numberAxis2 = e.target.value;
        }

        if (checkGeomWallDuplicate(
          wallItem.bindingType,
          wallItem.numberAxis,
          wallItem.letterAxis1,
          wallItem.letterAxis2,
          wallItem.letterAxis,
          wallItem.numberAxis1,
          wallItem.numberAxis2,
          wallItem.id
        )) {
          showNotification(`${getGeomWallEntityLabel()} с такой привязкой по осям уже существует.`, "warning");
          if (className.includes("geom-wall-number-axis")) wallItem.numberAxis = "";
          else if (className.includes("geom-wall-letter-axis1")) wallItem.letterAxis1 = "";
          else if (className.includes("geom-wall-letter-axis2")) wallItem.letterAxis2 = "";
          else if (className.includes("geom-wall-letter-axis")) wallItem.letterAxis = "";
          else if (className.includes("geom-wall-number-axis1")) wallItem.numberAxis1 = "";
          else if (className.includes("geom-wall-number-axis2")) wallItem.numberAxis2 = "";
          renderGeomWalls();
          return;
        }
      });
    });

    wallDiv.querySelectorAll<HTMLInputElement>('[class*="OpeningHeight"]').forEach(input => { input.closest("div")!.hidden = true; });
    wall.physicalDimensions ||= {};
    mountPhysicalDimensions(wallDiv, wall.physicalDimensions, elementDimensionKeys("walls"));
    wallDiv.querySelectorAll("input").forEach(input => {
      input.addEventListener("input", (e) => {
        const geomWalls = geomGetWalls();
        const wallItem = geomWalls.find(w => w.id === wall.id);
        if (!wallItem) return;
        const className = e.target.className;
        if (className.includes("geom-wall-projThick")) wallItem.projThick = e.target.value;
        else if (className.includes("geom-wall-factThick")) wallItem.factThick = e.target.value;
        else if (className.includes("geom-wall-projOpeningHeight")) wallItem.projOpeningHeight = e.target.value;
        else if (className.includes("geom-wall-factOpeningHeight")) wallItem.factOpeningHeight = e.target.value;
        else if (className.includes("geom-wall-projOpeningSizes")) wallItem.projOpeningSizes = e.target.value;
        else if (className.includes("geom-wall-factOpeningSizes")) wallItem.factOpeningSizes = e.target.value;
        else if (className.includes("geom-wall-factWallFlatness")) wallItem.factWallFlatness = e.target.value;
        else if (className.includes("geom-wall-vertDev")) wallItem.vertDev = e.target.value;
      });
    });

    wallDiv.querySelector(`[data-remove=\"${wall.id}\"]`).addEventListener("click", () => {
      removeGeomWall(wall.id);
    });

    geomWallsList.appendChild(wallDiv);
  });
}
// ============================
//  Геометрия: Лестницы
// ============================
function checkGeomStairDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis, numberAxis1, numberAxis2, excludeId = null) {
  return geomCheckStairDuplicate(bindingType, numberAxis, letterAxis1, letterAxis2, letterAxis, numberAxis1, numberAxis2, null, excludeId);
}

function addGeomStair() {
  geomAddStair(() => {
    renderGeomStairs();
    setTimeout(() => {
      const lastStair = geomStairsList?.querySelector(".card:last-child");
      if (lastStair) {
        lastStair.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
  });
}

function removeGeomStair(id) {
  geomRemoveStair(id, renderGeomStairs);
}

function renderGeomStairs() {
  if (!geomStairsList) return;
  const geomStairs = geomGetStairs();
  geomStairsList.innerHTML = "";

  if (geomStairs.length === 0) {
    geomStairsList.innerHTML = '<div class="caption" style="padding: 8px;">Нет добавленных лестниц. Нажмите "Добавить лестницу" для начала.</div>';
    return;
  }

  geomStairs.forEach((stair, index) => {
    ensureStairAxesDefaults(stair);
    const stairDiv = document.createElement("div");
    stairDiv.className = "card";
    stairDiv.style.marginBottom = "8px";
    stairDiv.style.padding = "12px";

    const isNumberLetters = stair.bindingType === "number_letters";

    stairDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <b>Лестница ${index + 1}</b>
        <button type="button" class="btn-small btn-secondary lg-btn lg-btn--pill lg-btn--compact" data-remove="${safeValue(stair.id)}">
          <span class="lg-btn__label">Удалить</span>
          <span class="lg-btn__glow" aria-hidden="true"></span>
        </button>
      </div>
      <div class="mt8">
        <label data-i18n="form_grid_binding">Тип привязки</label>
        <select class="geom-stair-binding-type ui-select" data-id="${safeValue(stair.id)}" style="width: 100%;">
          <option value="number_letters" ${isNumberLetters ? "selected" : ""}>Одна цифровая, две буквенные (например, 1, В-Г)</option>
          <option value="letter_numbers" ${!isNumberLetters ? "selected" : ""}>Одна буквенная, две цифровые (например, Г, 6-7)</option>
        </select>
      </div>
      ${isNumberLetters ? `
        <div class="grid-3 mt8">
          <div>
            <label data-i18n="form_number_grid_axis">Цифровая ось </label>
            <select class="geom-stair-number-axis ui-select" data-id="${safeValue(stair.id)}" style="width: 100%;">
              ${defaultNumbers.map(n => `<option value="${n}" ${stair.numberAxis === n ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
          <div>
            <label data-i18n="form_letter_grid_axis_1">Буквенная ось 1 </label>
            <select class="geom-stair-letter-axis1 ui-select" data-id="${safeValue(stair.id)}" style="width: 100%;">
              ${defaultRusLetters.map(l => `<option value="${l}" ${stair.letterAxis1 === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div>
            <label data-i18n="form_letter_grid_axis_2">Буквенная ось 2 </label>
            <select class="geom-stair-letter-axis2 ui-select" data-id="${safeValue(stair.id)}" style="width: 100%;">
              ${defaultRusLetters.map(l => `<option value="${l}" ${stair.letterAxis2 === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
        </div>
      ` : `
        <div class="grid-3 mt8">
          <div>
            <label data-i18n="form_letter_grid_axis">Буквенная ось </label>
            <select class="geom-stair-letter-axis ui-select" data-id="${safeValue(stair.id)}" style="width: 100%;">
              ${defaultRusLetters.map(l => `<option value="${l}" ${stair.letterAxis === l ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div>
            <label data-i18n="form_number_grid_axis_1">Цифровая ось 1 </label>
            <select class="geom-stair-number-axis1 ui-select" data-id="${safeValue(stair.id)}" style="width: 100%;">
              ${defaultNumbers.map(n => `<option value="${n}" ${stair.numberAxis1 === n ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
          <div>
            <label data-i18n="form_number_grid_axis_2">Цифровая ось 2 </label>
            <select class="geom-stair-number-axis2 ui-select" data-id="${safeValue(stair.id)}" style="width: 100%;">
              ${defaultNumbers.map(n => `<option value="${n}" ${stair.numberAxis2 === n ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </div>
        </div>
      `}
      <div class="grid-2 mt8">
        <div>
          <label>Проектная высота подступенка / ступени</label>
          <input type="number" inputmode="decimal" class="geom-stair-projStepHeight" data-id="${safeValue(stair.id)}" placeholder="мм" value="${safeValue(stair.projStepHeight || "")}" />
        </div>
        <div>
          <label>Фактическая высота подступенка / ступени</label>
          <input type="number" inputmode="decimal" class="geom-stair-factStepHeight" data-id="${safeValue(stair.id)}" placeholder="мм" value="${safeValue(stair.factStepHeight || "")}" />
        </div>
        <div>
          <label>Проектная ширина проступи</label>
          <input type="number" inputmode="decimal" class="geom-stair-projStepWidth" data-id="${safeValue(stair.id)}" placeholder="мм" value="${safeValue(stair.projStepWidth || "")}" />
        </div>
        <div>
          <label>Фактическая ширина проступи</label>
          <input type="number" inputmode="decimal" class="geom-stair-factStepWidth" data-id="${safeValue(stair.id)}" placeholder="мм" value="${safeValue(stair.factStepWidth || "")}" />
        </div>
        <div>
          <label data-i18n="form_design_width_mm">Проектная ширина, мм</label>
          <input type="number" inputmode="decimal" class="geom-stair-projFlightWidth" data-id="${safeValue(stair.id)}" placeholder="мм" value="${safeValue(stair.projFlightWidth || "")}" />
        </div>
        <div>
          <label data-i18n="form_measured_width_mm">Фактическая ширина, мм</label>
          <input type="number" inputmode="decimal" class="geom-stair-factFlightWidth" data-id="${safeValue(stair.id)}" placeholder="мм" value="${safeValue(stair.factFlightWidth || "")}" />
        </div>
      </div>
    `;

    stairDiv.querySelector(".geom-stair-binding-type").addEventListener("change", (e) => {
      const geomStairs = geomGetStairs();
      const stairItem = geomStairs.find(s => s.id === stair.id);
      if (!stairItem) return;
      const oldBindingType = stairItem.bindingType;
      stairItem.bindingType = e.target.value;
      ensureStairAxesDefaults(stairItem);

      if (stairItem.bindingType === "number_letters") {
        if (stairItem.letterAxis1 && stairItem.letterAxis2 && stairItem.letterAxis1 === stairItem.letterAxis2) {
          stairItem.bindingType = oldBindingType;
          showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
          renderGeomStairs();
          return;
        }
      } else if (stairItem.numberAxis1 && stairItem.numberAxis2 && stairItem.numberAxis1 === stairItem.numberAxis2) {
        stairItem.bindingType = oldBindingType;
        showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
        renderGeomStairs();
        return;
      }

      if (checkGeomStairDuplicate(
        stairItem.bindingType,
        stairItem.numberAxis,
        stairItem.letterAxis1,
        stairItem.letterAxis2,
        stairItem.letterAxis,
        stairItem.numberAxis1,
        stairItem.numberAxis2,
        stairItem.id
      )) {
        stairItem.bindingType = oldBindingType;
        showNotification("Лестница с такой привязкой по осям уже существует.", "warning");
        renderGeomStairs();
        return;
      }

      renderGeomStairs();
    });

    stair.physicalDimensions ||= {};
    mountPhysicalDimensions(stairDiv, stair.physicalDimensions, elementDimensionKeys("stairs"));
    const elementType = document.createElement("select");
    elementType.setAttribute("aria-label", t("stair_element_type"));
    for (const value of ["flight", "landing"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = t("stair_" + value);
      elementType.append(option);
    }
    elementType.value = String(stair.elementType || "flight");
    elementType.addEventListener("change", () => { stair.elementType = elementType.value; renderGeomStairs(); });
    stairDiv.prepend(elementType);
    stairDiv.querySelectorAll<HTMLElement>('[class*="geom-stair-"]').forEach(control => {
      if (/binding|axis/u.test(control.className)) control.closest("div")!.hidden = true;
    });
    const positionLabel = document.createElement("label");
    positionLabel.textContent = t("element_position");
    const position = document.createElement("input");
    position.value = String(stair.position || "");
    position.addEventListener("input", () => { stair.position = position.value; });
    positionLabel.append(position);
    stairDiv.prepend(positionLabel);

    if (elementType.value === "landing") stairDiv.querySelectorAll<HTMLInputElement>('[class*="Step"]').forEach(input => { input.closest("div")!.hidden = true; });
    stairDiv.querySelectorAll("select").forEach(select => {
      if (select.classList.contains("geom-stair-binding-type")) return;

      select.addEventListener("change", (e) => {
        const geomStairs = geomGetStairs();
        const stairItem = geomStairs.find(s => s.id === stair.id);
        if (!stairItem) return;
        const className = e.target.className;
        if (className.includes("geom-stair-number-axis")) {
          stairItem.numberAxis = e.target.value;
        } else if (className.includes("geom-stair-letter-axis1")) {
          if (stairItem.bindingType === "number_letters" && stairItem.letterAxis2 && e.target.value === stairItem.letterAxis2) {
            showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
            e.target.value = stairItem.letterAxis1 || "";
            renderGeomStairs();
            return;
          }
          stairItem.letterAxis1 = e.target.value;
        } else if (className.includes("geom-stair-letter-axis2")) {
          if (stairItem.bindingType === "number_letters" && stairItem.letterAxis1 && e.target.value === stairItem.letterAxis1) {
            showNotification("Буквенные оси не должны повторяться. Выберите разные буквенные оси.", "warning");
            e.target.value = stairItem.letterAxis2 || "";
            renderGeomStairs();
            return;
          }
          stairItem.letterAxis2 = e.target.value;
        } else if (className.includes("geom-stair-letter-axis")) {
          stairItem.letterAxis = e.target.value;
        } else if (className.includes("geom-stair-number-axis1")) {
          if (stairItem.bindingType === "letter_numbers" && stairItem.numberAxis2 && e.target.value === stairItem.numberAxis2) {
            showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
            e.target.value = stairItem.numberAxis1 || "";
            renderGeomStairs();
            return;
          }
          stairItem.numberAxis1 = e.target.value;
        } else if (className.includes("geom-stair-number-axis2")) {
          if (stairItem.bindingType === "letter_numbers" && stairItem.numberAxis1 && e.target.value === stairItem.numberAxis1) {
            showNotification("Цифровые оси не должны повторяться. Выберите разные цифровые оси.", "warning");
            e.target.value = stairItem.numberAxis2 || "";
            renderGeomStairs();
            return;
          }
          stairItem.numberAxis2 = e.target.value;
        }

        if (checkGeomStairDuplicate(
          stairItem.bindingType,
          stairItem.numberAxis,
          stairItem.letterAxis1,
          stairItem.letterAxis2,
          stairItem.letterAxis,
          stairItem.numberAxis1,
          stairItem.numberAxis2,
          stairItem.id
        )) {
          showNotification("Лестница с такой привязкой по осям уже существует.", "warning");
          if (className.includes("geom-stair-number-axis")) stairItem.numberAxis = "";
          else if (className.includes("geom-stair-letter-axis1")) stairItem.letterAxis1 = "";
          else if (className.includes("geom-stair-letter-axis2")) stairItem.letterAxis2 = "";
          else if (className.includes("geom-stair-letter-axis")) stairItem.letterAxis = "";
          else if (className.includes("geom-stair-number-axis1")) stairItem.numberAxis1 = "";
          else if (className.includes("geom-stair-number-axis2")) stairItem.numberAxis2 = "";
          renderGeomStairs();
          return;
        }
      });
    });

    stairDiv.querySelectorAll("input[type=\"number\"]").forEach(input => {
      input.addEventListener("input", (e) => {
        const geomStairs = geomGetStairs();
        const stairItem = geomStairs.find(s => s.id === stair.id);
        if (!stairItem) return;
        const className = e.target.className;
        if (className.includes("geom-stair-projStepHeight")) stairItem.projStepHeight = e.target.value;
        else if (className.includes("geom-stair-factStepHeight")) stairItem.factStepHeight = e.target.value;
        else if (className.includes("geom-stair-projStepWidth")) stairItem.projStepWidth = e.target.value;
        else if (className.includes("geom-stair-factStepWidth")) stairItem.factStepWidth = e.target.value;
        else if (className.includes("geom-stair-projFlightWidth")) stairItem.projFlightWidth = e.target.value;
        else if (className.includes("geom-stair-factFlightWidth")) stairItem.factFlightWidth = e.target.value;
      });
    });

    stairDiv.querySelector(`[data-remove=\"${stair.id}\"]`).addEventListener("click", () => {
      removeGeomStair(stair.id);
    });

    geomStairsList.appendChild(stairDiv);
  });
}
// ============================
//  Геометрия: Балки
// ============================
function checkGeomBeamDuplicate(marking, excludeId = null) {
  return geomCheckBeamDuplicate(marking, excludeId);
}

function addGeomBeam() {
  geomAddBeam(() => {
    renderGeomBeams();
    setTimeout(() => {
      const lastBeam = geomBeamsList?.querySelector(".card:last-child");
      if (lastBeam) {
        lastBeam.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 100);
  });
}

function removeGeomBeam(id) {
  geomRemoveBeam(id, renderGeomBeams);
}

function renderGeomBeams() {
  if (!geomBeamsList) return;
  const geomBeams = geomGetBeams();
  geomBeamsList.innerHTML = "";

  if (geomBeams.length === 0) {
    geomBeamsList.innerHTML = '<div class="caption" style="padding: 8px;">Нет добавленных балок. Нажмите "Добавить балку" для начала.</div>';
    return;
  }

  geomBeams.forEach((beam, index) => {
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
        <input type="text" class="geom-beam-marking ${beam.bimAutofilledMark ? "geo-bim-input--autofilled" : ""}" data-id="${safeValue(beam.id)}" placeholder="Напр.: БМ 1" value="${safeValue(beam.marking || "")}" required />
      </div>
      <div class="grid-2 mt8">
        <div class="${beam.bimAutofilledProjBeamWidth ? "geo-bim-field--autofilled" : ""}">
          <label>Проектная ширина балки</label>
          <input type="number" inputmode="decimal" class="geom-beam-projBeamWidth ${beam.bimAutofilledProjBeamWidth ? "geo-bim-input--autofilled" : ""}" data-id="${safeValue(beam.id)}" placeholder="мм" value="${safeValue(beam.projBeamWidth || "")}" />
        </div>
        <div>
          <label>Фактическая ширина балки</label>
          <input type="number" inputmode="decimal" class="geom-beam-factBeamWidth" data-id="${safeValue(beam.id)}" placeholder="мм" value="${safeValue(beam.factBeamWidth || "")}" />
        </div>
        <div class="${beam.bimAutofilledProjBeamHeight ? "geo-bim-field--autofilled" : ""}">
          <label>Проектная высота балки</label>
          <input type="number" inputmode="decimal" class="geom-beam-projBeamHeight ${beam.bimAutofilledProjBeamHeight ? "geo-bim-input--autofilled" : ""}" data-id="${safeValue(beam.id)}" placeholder="мм" value="${safeValue(beam.projBeamHeight || "")}" />
        </div>
        <div>
          <label>Фактическая высота балки</label>
          <input type="number" inputmode="decimal" class="geom-beam-factBeamHeight" data-id="${safeValue(beam.id)}" placeholder="мм" value="${safeValue(beam.factBeamHeight || "")}" />
        </div>
      </div>
    `;

    beam.physicalDimensions ||= {};
    mountPhysicalDimensions(beamDiv, beam.physicalDimensions, elementDimensionKeys("beams"));
    beamDiv.querySelectorAll("input").forEach(input => {
      input.addEventListener("input", (e) => {
        const geomBeams = geomGetBeams();
        const beamItem = geomBeams.find(b => b.id === beam.id);
        if (!beamItem) return;
        if (e.target.classList.contains("geom-beam-marking")) {
          beamItem.marking = e.target.value;
        } else if (e.target.classList.contains("geom-beam-projBeamWidth")) {
          beamItem.projBeamWidth = e.target.value;
          beamItem.bimAutofilledProjBeamWidth =
            geomGetBeams()[0]?.id === beam.id &&
            matchesGeomBimNumber(e.target.value, geomBimBindingSnapshot?.width);
          e.target.classList.toggle("geo-bim-input--autofilled", beamItem.bimAutofilledProjBeamWidth);
          e.target.closest("div")?.classList.toggle("geo-bim-field--autofilled", beamItem.bimAutofilledProjBeamWidth);
        }
        else if (e.target.classList.contains("geom-beam-factBeamWidth")) beamItem.factBeamWidth = e.target.value;
        else if (e.target.classList.contains("geom-beam-projBeamHeight")) {
          beamItem.projBeamHeight = e.target.value;
          beamItem.bimAutofilledProjBeamHeight =
            geomGetBeams()[0]?.id === beam.id &&
            matchesGeomBimNumber(e.target.value, geomBimBindingSnapshot?.height);
          e.target.classList.toggle("geo-bim-input--autofilled", beamItem.bimAutofilledProjBeamHeight);
          e.target.closest("div")?.classList.toggle("geo-bim-field--autofilled", beamItem.bimAutofilledProjBeamHeight);
        }
        else if (e.target.classList.contains("geom-beam-factBeamHeight")) beamItem.factBeamHeight = e.target.value;
      });
    });

    const markingInput = beamDiv.querySelector(".geom-beam-marking");
    if (markingInput) {
      markingInput.addEventListener("blur", (e) => {
        const geomBeams = geomGetBeams();
        const beamItem = geomBeams.find(b => b.id === beam.id);
        if (!beamItem) return;
        const newMarking = normalizeMarking(e.target.value);
        if (newMarking && checkGeomBeamDuplicate(newMarking, beam.id)) {
          showNotification("Балка с такой маркировкой уже существует. Введите другую маркировку.", "warning");
          e.target.value = beamItem.marking || "";
          e.target.focus();
          return;
        }
        beamItem.marking = newMarking;
        geomSetBeams(geomBeams);
      });
    }

    beamDiv.querySelector(`[data-remove="${beam.id}"]`).addEventListener("click", () => {
      removeGeomBeam(beam.id);
    });

    geomBeamsList.appendChild(beamDiv);
  });
}
// ============================
//  Сохранённые проверки геометрии
// ============================
function saveGeomChecks() {
  const payload = Array.from(geomChecks.entries());
  const key = moduleStorageKey(getStorageKey());
  console.log("[saveGeomChecks] Сохранение проверок геометрии, ключ:", key, "currentProjectId:", getCurrentProjectId(), "количество:", payload.length);
  localStorage.setItem(key, JSON.stringify(payload));
}

async function loadGeomChecks() {
  geomChecks.clear();
  console.log("[loadGeomChecks] Загрузка проверок геометрии, currentProjectId:", getCurrentProjectId());

  await loadGeomBimElements(getCurrentProjectId());

  if (!getCurrentProjectId()) {
    console.log("[loadGeomChecks] currentProjectId отсутствует, пропускаем загрузку");
    return;
  }

  try {
    const projectId = getCurrentProjectId();
    await refreshPendingProjectAnalytics(projectId);
    const snap = await getProjectCollectionSnapshot(projectId, "geomChecks");
    console.log("[loadGeomChecks] Загружено из Firestore проверок:", snap.size);
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;
      if (data.createdAt && data.createdAt.toMillis) {
        data.createdAt = data.createdAt.toMillis();
      }
      geomChecks.set(id, { ...data, id });
    });
    saveGeomChecks();
  } catch (e) {
    console.error("[loadGeomChecks] Ошибка загрузки из Firestore:", e);
    const key = moduleStorageKey(getStorageKey());
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const arr = JSON.parse(raw);
        console.log("[loadGeomChecks] Загружено из localStorage проверок:", arr.length);
        arr.forEach(([id, data]) => geomChecks.set(id, data));
      } catch (parseErr) {
        console.warn("[loadGeomChecks] Ошибка парсинга localStorage:", parseErr);
      }
    }
  }
}

function renderGeomChecks() {
  const list = document.getElementById("geomChecksList");
  if (!list) return;
  list.innerHTML = "";

  if (!geomChecks.size) {
    list.innerHTML = '<div class="caption" data-i18n="saved_empty_geometry">Пока нет сохранённых проверок геометрии.</div>';
    return;
  }

  const items = Array.from(geomChecks.entries()).sort(
    (a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0)
  );

  items.forEach(([id, d]) => {
    const row = document.createElement("div");
    row.className = "node node-enhanced";
    let icon = "📐";
    let dataRows = "";
    const constructionProfile = getGeometryConstructionProfile(d.construction || d.constructionType || "");

    if (constructionProfile === "formwork") {
      icon = "📏";
      dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_type">Тип:</span><span class="node-values">${safeValue(formatFormworkSubtypeLabel(d.formworkType || d.constructionSubtype))}</span></div>`;
      if (d.formworkElementName) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_element">Элемент:</span><span class="node-values">${safeValue(d.formworkElementName)}</span></div>`;
      }
      if (d.formworkArea) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_area">Участок:</span><span class="node-values">${safeValue(d.formworkArea)}</span></div>`;
      }
      if (d.formworkVerticalDeviation != null || d.formworkVerticalTolerance != null) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_vertical">Вертикаль:</span><span class="node-values">${formatNodeValue(d.formworkVerticalDeviation)} / ${formatNodeValue(d.formworkVerticalTolerance)} мм</span></div>`;
      }
      if (d.formworkBasis) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_basis">Основание:</span><span class="node-values">${safeValue(formatFormworkBasisLabel(d.formworkBasis))}</span></div>`;
      }
    } else if (constructionProfile === "plate") {
      icon = "📐";
      if (d.location) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_location">Местоположение:</span><span class="node-values">${safeValue(d.location)}</span></div>`;
      }
      const plateOpeningsText = formatOpeningSizesForNode(d.projOpeningSizes ?? d.openingSizes, d.factOpeningSizes);
      if (plateOpeningsText) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_openings">Проёмы:</span><span class="node-values">${safeValue(plateOpeningsText)}</span></div>`;
      }
      if (d.projPlateHeight != null && d.factPlateHeight != null) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_thickness">Толщина:</span><span class="node-values">${formatNodeValue(d.projPlateHeight)}/${formatNodeValue(d.factPlateHeight)} мм</span></div>`;
      }
      if (d.factPlateFlatness != null) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_flatness">Плоскостность:</span><span class="node-values">${formatNodeValue(d.factPlateFlatness)} мм</span></div>`;
      }
    } else if (constructionProfile === "column") {
      icon = "🏛️";
      const count = d.columns ? d.columns.length : 0;
      const markings = d.columns ? d.columns.map((c: GeometryColumnRecord) => safeValue(c.marking)).filter((m) => m).join(", ") : "";
      dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_columns">Колонн:</span><span class="node-values"><strong>${count} шт.</strong>${markings ? ` (${markings})` : ""}</span></div>`;
    } else if (constructionProfile === "wall") {
      icon = "🧱";
      const count = d.walls ? d.walls.length : 0;
      const wallsInfo = d.walls ? d.walls.map((w: GeometryWallRecord) => {
        if (w.bindingType === "number_letters" && w.numberAxis && w.letterAxis1 && w.letterAxis2) {
          return `${safeValue(w.numberAxis)}, ${safeValue(w.letterAxis1)}-${safeValue(w.letterAxis2)}`;
        } else if (w.bindingType === "letter_numbers" && w.letterAxis && w.numberAxis1 && w.numberAxis2) {
          return `${safeValue(w.letterAxis)}, ${safeValue(w.numberAxis1)}-${safeValue(w.numberAxis2)}`;
        }
        return "";
      }).filter(i => i).join("; ") : "";
      dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_walls">Стен:</span><span class="node-values"><strong>${count} шт.</strong>${wallsInfo ? ` (${wallsInfo})` : ""}</span></div>`;
      const openingWallsCount = d.walls ? d.walls.filter((wall: GeometryWallRecord) => {
        const projValue = wall.projOpeningSizes ?? wall.openingSizes;
        return String(projValue ?? "").trim() || String(wall.factOpeningSizes ?? "").trim();
      }).length : 0;
      const openingHeightWallsCount = d.walls ? d.walls.filter((wall: GeometryWallRecord) => wall.projOpeningHeight != null || wall.factOpeningHeight != null).length : 0;
      const flatnessWallsCount = d.walls ? d.walls.filter((wall: GeometryWallRecord) => wall.factWallFlatness != null).length : 0;
      if (openingWallsCount > 0) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_openings">Проёмы:</span><span class="node-values">заполнено для ${openingWallsCount} из ${count} стен</span></div>`;
      } else if (d.openingSizes) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_openings">Проёмы:</span><span class="node-values">${safeValue(d.openingSizes)}</span></div>`;
      }
      if (openingHeightWallsCount > 0) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_opening_height">Высота проёмов:</span><span class="node-values">заполнено для ${openingHeightWallsCount} из ${count} стен</span></div>`;
      }
      if (flatnessWallsCount > 0) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_flatness">Плоскостность:</span><span class="node-values">заполнено для ${flatnessWallsCount} из ${count} стен</span></div>`;
      } else if (d.factWallFlatness != null) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_flatness">Плоскостность:</span><span class="node-values">${formatNodeValue(d.factWallFlatness)} мм</span></div>`;
      }
    } else if (constructionProfile === "stair") {
      icon = "🪜";
      const count = d.stairs ? d.stairs.length : 0;
      const stairNameInfo = d.stairName ? `${safeValue(d.stairName)}, ` : "";
      const stairsInfo = d.stairs ? d.stairs.map((s: GeometryStairRecord) => {
        if (s.bindingType === "number_letters" && s.numberAxis && s.letterAxis1 && s.letterAxis2) {
          return `${safeValue(s.numberAxis)}, ${safeValue(s.letterAxis1)}-${safeValue(s.letterAxis2)}`;
        } else if (s.bindingType === "letter_numbers" && s.letterAxis && s.numberAxis1 && s.numberAxis2) {
          return `${safeValue(s.letterAxis)}, ${safeValue(s.numberAxis1)}-${safeValue(s.numberAxis2)}`;
        }
        return "";
      }).filter(i => i).join("; ") : "";
      dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_stairs">Лестниц:</span><span class="node-values"><strong>${count} шт.</strong>${stairNameInfo}${stairsInfo ? ` (${stairsInfo})` : ""}</span></div>`;
    } else if (constructionProfile === "beam") {
      icon = "📏";
      const count = d.beams ? d.beams.length : 0;
      const markings = d.beams ? d.beams.map((b: GeometryBeamRecord) => safeValue(b.marking)).filter((m) => m).join(", ") : "";
      dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_beams">Балок:</span><span class="node-values"><strong>${count} шт.</strong>${markings ? ` (${markings})` : ""}</span></div>`;
    } else {
      dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_thickness">Толщина:</span><span class="node-values">${formatNodeValue(d.projThick)}/${formatNodeValue(d.factThick)} мм</span></div>`;
      if (d.vertDev != null) {
        dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_vertical">Вертикаль:</span><span class="node-values">${formatNodeValue(d.vertDev)} мм</span></div>`;
      }
    }

    if (d.floor) {
      dataRows += `<div class="node-data-row"><span class="node-label" data-i18n="saved_floor">Этаж:</span><span class="node-values">${safeValue(d.floor)}</span></div>`;
    }

    const evaluation = evaluateGeomCheck(d);

    let statusTag = "";
    if (evaluation.status === "exceeded") {
      statusTag = '<span class="tag bad" data-i18n="saved_exceeded">превышено</span>';
    } else if (evaluation.status === "ok") {
      statusTag = '<span class="tag ok" data-i18n="saved_ok">в норме</span>';
    } else {
      statusTag = '<span class="tag" data-i18n="saved_empty">не заполнено</span>';
    }

    row.innerHTML = `
      <div class="node-content">
        <div class="node-header">
          <div class="node-title">
            <span class="node-icon">${icon}</span>
            <span data-i18n="saved_inspection_on">Проверка от</span> ${fmtDate(d.createdAt || Date.now())}
          </div>
          <div class="node-header-controls">
            ${statusTag}
            ${buildNodeDeleteIconButton("Удалить проверку")}
          </div>
        </div>
        <div class="node-data">
          ${dataRows}
        </div>
      </div>
    `;
    setupNodeCardInteractions(row, {
      onOpen: () => loadGeomCheck(id),
      onDelete: async () => {
        if (await showConfirm("Удалить эту проверку?")) {
          if (getCurrentGeomCheckId() === id) setCurrentGeomCheckId(null);
          geomChecks.delete(id);
          saveGeomChecks();
          renderGeomChecks();
          updateSummary();

          const projectId = getCurrentProjectId();
          if (projectId) {
            try {
              await deleteInspectionSourceDocs(projectId, "geomChecks", [id]);
              await refreshPendingProjectAnalytics(projectId);
            } catch (error) {
              console.error("[Geometry] Ошибка удаления проверки из Firestore:", error);
            }
          }
        }
      }
    });
    list.appendChild(row);
  });
}
function loadGeomCheck(id) {
  const d = geomChecks.get(id);
  if (!d) return;
    if (geometryContext.setConstruction) {
      geometryContext.setConstruction(d.construction || d.constructionType || "", d.constructionSubtype || "", d.constructionPileElement || "");
    } else if (construction && d.constructionType) {
      construction.value = d.constructionType;
    }
    updateGeomFieldsVisibility();

    if (geomFloorEl) geomFloorEl.value = d.floor || "";

  const flags = getGeometryConstructionFlags(d.construction || d.constructionType || "");

  if (flags.isFormwork) {
    setTextInputValue(geomFormworkTypeEl, d.formworkType || d.constructionSubtype || getSelectedConstructionSubtype() || "temporary");
    setTextInputValue(geomFormworkFloorEl, d.floor);
    setTextInputValue(geomFormworkElementNameEl, d.formworkElementName);
    setTextInputValue(geomFormworkAreaEl, d.formworkArea);
    setTextInputValue(geomFormworkProjHeightEl, d.formworkProjHeight);
    setTextInputValue(geomFormworkFactHeightEl, d.formworkFactHeight);
    setTextInputValue(geomFormworkProjWidthEl, d.formworkProjWidth);
    setTextInputValue(geomFormworkFactWidthEl, d.formworkFactWidth);
    setTextInputValue(geomFormworkProjThicknessEl, d.formworkProjThickness);
    setTextInputValue(geomFormworkFactThicknessEl, d.formworkFactThickness);
    setTextInputValue(geomFormworkVerticalDeviationEl, d.formworkVerticalDeviation);
    setTextInputValue(geomFormworkVerticalToleranceEl, d.formworkVerticalTolerance);
    setTextInputValue(geomFormworkBasisEl, d.formworkBasis || "project");
    setTextInputValue(geomFormworkNoteEl, d.note || d.formworkNote);
    } else if (flags.isPlate) {
    if (geomStripAxisModeEl && flags.behavior.locationMode === "strip_foundation") {
      geomStripAxisModeEl.value = d.axisMode || (d.axisNumberTo ? "number_letters" : "letter_numbers");
      updateGeomFieldsVisibility();
    }
    if (geomAxisLetterFromEl && d.axisLetterFrom) geomAxisLetterFromEl.value = d.axisLetterFrom;
    if (geomAxisLetterToEl && d.axisLetterTo) geomAxisLetterToEl.value = d.axisLetterTo;
    if (geomAxisNumberFromEl && d.axisNumberFrom) geomAxisNumberFromEl.value = String(d.axisNumberFrom);
    if (geomAxisNumberToEl && d.axisNumberTo) geomAxisNumberToEl.value = String(d.axisNumberTo);
    if (geomLocationEl && d.location) geomLocationEl.value = String(d.location);
    if (projPlateHeightEl) projPlateHeightEl.value = String(d.projPlateHeight ?? "");
    if (factPlateHeightEl) factPlateHeightEl.value = String(d.factPlateHeight ?? "");
    if (geomPlateOpeningSizesEl) geomPlateOpeningSizesEl.value = d.projOpeningSizes ?? d.openingSizes ?? "";
    if (geomPlateFactOpeningSizesEl) geomPlateFactOpeningSizesEl.value = d.factOpeningSizes ?? "";
    if (factPlateFlatnessEl) factPlateFlatnessEl.value = String(d.factPlateFlatness ?? "");
    updateGeomLocation();
  } else if (flags.isColumn) {
    if (d.columns && Array.isArray(d.columns)) {
      const newColumns = d.columns.map((col: GeometryColumnRecord, idx) => ({
        id: col.id ?? Date.now() + idx,
        physicalDimensions: structuredClone(col.physicalDimensions || {}),
        marking: normalizeMarking(col.marking) || "",
        projSize1: col.projSize1?.toString() || "",
        factSize1: col.factSize1?.toString() || "",
        projSize2: col.projSize2?.toString() || "",
        factSize2: col.factSize2?.toString() || "",
        vertDev: col.vertDev?.toString() || "",
        bimAutofilledMark: false,
        bimAutofilledProjSize1: false,
        bimAutofilledProjSize2: false
      }));
      geomSetColumns(newColumns);
      renderGeomColumns();
    }
  } else if (flags.isWall) {
    if (d.walls && Array.isArray(d.walls)) {
      const legacyOpeningSizes = d.openingSizes ?? "";
      const legacyWallFlatness = d.factWallFlatness ?? "";
      const newWalls = d.walls.map((wall: GeometryWallRecord, idx) => ({
        id: wall.id ?? Date.now() + idx,
        physicalDimensions: structuredClone(wall.physicalDimensions || {}),
        bindingType: wall.bindingType || "number_letters",
        numberAxis: wall.numberAxis?.toString() || "",
        letterAxis1: wall.letterAxis1?.toString() || "",
        letterAxis2: wall.letterAxis2?.toString() || "",
        letterAxis: wall.letterAxis?.toString() || "",
        numberAxis1: wall.numberAxis1?.toString() || "",
        numberAxis2: wall.numberAxis2?.toString() || "",
        projThick: wall.projThick?.toString() || "",
        factThick: wall.factThick?.toString() || "",
        vertDev: wall.vertDev?.toString() || "",
        projOpeningSizes: wall.projOpeningSizes?.toString() || wall.openingSizes?.toString() || legacyOpeningSizes?.toString() || "",
        factOpeningSizes: wall.factOpeningSizes?.toString() || "",
        projOpeningHeight: wall.projOpeningHeight?.toString() || "",
        factOpeningHeight: wall.factOpeningHeight?.toString() || "",
        factWallFlatness: wall.factWallFlatness?.toString() || legacyWallFlatness?.toString() || ""
      }));
      geomSetWalls(newWalls);
      renderGeomWalls();
    }
  } else if (flags.isStair) {
    if (geomStairNameEl && d.stairName) geomStairNameEl.value = d.stairName;
    if (d.stairs && Array.isArray(d.stairs)) {
      const newStairs = d.stairs.map((stair: GeometryStairRecord, idx) => ({
        id: stair.id ?? Date.now() + idx,
        physicalDimensions: structuredClone(stair.physicalDimensions || {}),
        bindingType: stair.bindingType || "number_letters",
        numberAxis: stair.numberAxis?.toString() || "",
        letterAxis1: stair.letterAxis1?.toString() || "",
        letterAxis2: stair.letterAxis2?.toString() || "",
        letterAxis: stair.letterAxis?.toString() || "",
        numberAxis1: stair.numberAxis1?.toString() || "",
        numberAxis2: stair.numberAxis2?.toString() || "",
        elementType: stair.elementType || "flight",
        position: stair.position || [stair.numberAxis, stair.letterAxis1, stair.letterAxis2, stair.letterAxis, stair.numberAxis1, stair.numberAxis2].filter(Boolean).join(" / "),
        projStepHeight: stair.projStepHeight?.toString() || "",
        factStepHeight: stair.factStepHeight?.toString() || "",
        projStepWidth: stair.projStepWidth?.toString() || "",
        factStepWidth: stair.factStepWidth?.toString() || "",
        projFlightWidth: stair.projFlightWidth?.toString() || "",
        factFlightWidth: stair.factFlightWidth?.toString() || ""
      }));
      geomSetStairs(newStairs);
      renderGeomStairs();
    }
  } else if (flags.isBeam) {
    if (d.beams && Array.isArray(d.beams)) {
      const newBeams = d.beams.map((beam: GeometryBeamRecord, idx) => ({
        id: beam.id ?? Date.now() + idx,
        physicalDimensions: structuredClone(beam.physicalDimensions || {}),
        marking: normalizeMarking(beam.marking) || "",
        projBeamWidth: beam.projBeamWidth?.toString() || "",
        factBeamWidth: beam.factBeamWidth?.toString() || "",
        projBeamHeight: beam.projBeamHeight?.toString() || "",
        factBeamHeight: beam.factBeamHeight?.toString() || "",
        bimAutofilledMark: false,
        bimAutofilledProjBeamWidth: false,
        bimAutofilledProjBeamHeight: false
      }));
      geomSetBeams(newBeams);
      renderGeomBeams();
    }
  } else {
    if (projThick) projThick.value = String(d.projThick ?? "");
    if (factThick) factThick.value = String(d.factThick ?? "");
    if (vertDev) vertDev.value = String(d.vertDev ?? "");
  }

  if (projThick) projThick.value = d.projThick == null ? "" : String(d.projThick);
  if (factThick) factThick.value = d.factThick == null ? "" : String(d.factThick);
  if (vertDev) vertDev.value = d.vertDev == null ? "" : String(d.vertDev);
  if (geomNoteEl) geomNoteEl.value = d.note || "";

  if (geometryResult) {
  geometryResult.className = "result";
  if (evaluateGeomCheck(d).status === "ok") geometryResult.classList.add("ok");
  if (evaluateGeomCheck(d).status === "exceeded") geometryResult.classList.add("not-ok");
  geometryResult.textContent = t(evaluateGeomCheck(d).status === "ok" ? "engineering_conforms" : evaluateGeomCheck(d).status === "exceeded" ? "engineering_nonconforms" : "engineering_requires_review");
  if (evaluateGeomCheck(d).status === "exceeded" && evaluateGeomCheck(d).hasIncompleteMeasurements) geometryResult.append(` — ${t("engineering_incomplete")}`);
}

  syncGeomBimSelectionFromCheck(d);
  // Restoring construction emits change and clears edit IDs; restore identity last.
  commonPhysicalDimensions = structuredClone(d.physicalDimensions || {});
  renderCommonDimensions();
  restoreAcceptanceCriteria(document.getElementById("geometry"), d.acceptanceCriteria);
  setCurrentGeomCheckId(id);
  document.querySelector<HTMLButtonElement>('#geometry [data-wizard-step="2"]')?.click();
}
async function saveGeomCheck({ skipJournalOnce = false } = {}) {
  if (!validateProject(getCurrentProjectId())) return;
  console.log("[btnSaveGeomCheck] currentProjectId:", getCurrentProjectId());

  const existing = getCurrentGeomCheckId() && geomChecks.has(getCurrentGeomCheckId())
    ? geomChecks.get(getCurrentGeomCheckId())
    : null;
  const id = existing ? getCurrentGeomCheckId() : crypto.randomUUID();
  const flags = getGeometryConstructionFlags();
  if (flags.isUnsupported) {
    setGeometryUnsupportedState({ notify: true });
    return;
  }
  const behavior = flags.behavior;
  const isFormwork = flags.isFormwork;
  if (!isFormwork && behavior.floorRequired !== false && !validateRequiredField(geomFloorEl, "Этаж")) return;
  const floor = isFormwork
    ? readTextInputValue(geomFormworkFloorEl)
    : (behavior.floorVisible === false ? "" : (geomFloorEl ? geomFloorEl.value.trim() : ""));
  const isPlate = flags.isPlate;
  const isColumn = flags.isColumn;
  const isWall = flags.isWall;
  const isStair = flags.isStair;
  const isBeam = flags.isBeam;
  const isStripFoundation = behavior.locationMode === "strip_foundation";
  const isBoredPileFoundation = getSelectedConstructionKey() === "pile_grillage";
  const stripAxisMode = geomStripAxisModeEl?.value || "letter_numbers";
  const formworkType = isFormwork ? (readTextInputValue(geomFormworkTypeEl) || getSelectedConstructionSubtype() || "temporary") : "";
  const formworkTypeLabel = isFormwork ? formatFormworkSubtypeLabel(formworkType) : "";
  const wallItems = isWall ? geomGetWalls() : [];
  const wallOpeningSizesAlias = isWall
    ? (() => {
        const values = wallItems.map((wall) => (wall.projOpeningSizes || wall.openingSizes || "").trim()).filter(Boolean);
        if (!values.length) return null;
        return values.join("; ");
      })()
    : null;
  const wallFlatnessAlias = isWall
    ? (() => {
        const values = wallItems
          .map((wall) => (wall.factWallFlatness === "" ? null : +wall.factWallFlatness))
          .filter((value) => value != null && !Number.isNaN(value));
        if (!values.length) return null;
        return Math.max(...values.map((value) => Math.abs(value)));
      })()
    : null;

  const data: GeometryCheckRecord = {
    ...existing,
    evaluationSchemaVersion: 2,
    physicalDimensions: structuredClone(commonPhysicalDimensions),
    acceptanceCriteria: readAcceptanceCriteria(document.getElementById("geometry")),
    createdAt: existing?.createdAt || Date.now(),
    construction: getSelectedConstructionKey(),
    constructionCategory: getSelectedConstructionCategory(),
    constructionLabel: getSelectedConstructionLabel(),
    constructionType: construction?.value || "",
    constructionSubtype: isFormwork ? formworkType : (construction?.dataset?.subtypeKey || ""),
    constructionSubtypeLabel: isFormwork ? formworkTypeLabel : (construction?.dataset?.subtypeLabel || ""),
    constructionPileElement: isBoredPileFoundation ? getSelectedPileElement() : "",
    constructionPileElementLabel: isBoredPileFoundation ? (getSelectedPileElement() === "grillage" ? "Ростверк" : "Свая") : "",
    ...(isFormwork ? {} : collectGeomBimCheckData()),
    floor: isFormwork || behavior.floorVisible !== false ? (floor || null) : null,
    axisMode: isStripFoundation ? stripAxisMode : null,
    axisLetterFrom: behavior.locationMode === "plate_range" || behavior.locationMode === "strip_foundation"
      ? (geomAxisLetterFromEl ? geomAxisLetterFromEl.value : null)
      : null,
    axisLetterTo: behavior.locationMode === "plate_range" || behavior.locationMode === "strip_foundation"
      ? (isStripFoundation && stripAxisMode === "number_letters" ? null : (geomAxisLetterToEl ? geomAxisLetterToEl.value : null))
      : null,
    axisNumberFrom: behavior.locationMode === "plate_range" || behavior.locationMode === "strip_foundation"
      ? (geomAxisNumberFromEl ? geomAxisNumberFromEl.value : null)
      : null,
    axisNumberTo: behavior.locationMode === "plate_range" || behavior.locationMode === "strip_foundation"
      ? (isStripFoundation && stripAxisMode === "letter_numbers" ? null : (geomAxisNumberToEl ? geomAxisNumberToEl.value : null))
      : null,
    location: behavior.locationMode === "plate_range" || behavior.locationMode === "strip_foundation"
      ? (geomLocationEl ? geomLocationEl.value : null)
      : null,
    openingSizes: behavior.showOpeningSizes
      ? (geomPlateOpeningSizesEl ? geomPlateOpeningSizesEl.value.trim() || null : null)
      : wallOpeningSizesAlias,
    projOpeningSizes: behavior.showOpeningSizes
      ? (geomPlateOpeningSizesEl ? geomPlateOpeningSizesEl.value.trim() || null : null)
      : null,
    factOpeningSizes: behavior.showOpeningSizes
      ? (geomPlateFactOpeningSizesEl ? geomPlateFactOpeningSizesEl.value.trim() || null : null)
      : null,
    projPlateHeight: isPlate
      ? (projPlateHeightEl ? (projPlateHeightEl.value === "" ? null : +projPlateHeightEl.value) : null)
      : null,
    factPlateHeight: isPlate
      ? (factPlateHeightEl ? (factPlateHeightEl.value === "" ? null : +factPlateHeightEl.value) : null)
      : null,
    factPlateFlatness: behavior.showPlateFlatness
      ? (factPlateFlatnessEl ? (factPlateFlatnessEl.value === "" ? null : +factPlateFlatnessEl.value) : null)
      : null,
    projThick: getSelectedConstructionKey() === "elevator_shaft" ? existing?.projThick ?? null : isFormwork ? null : (projThick ? (projThick.value === "" ? null : +projThick.value) : null),
    factThick: getSelectedConstructionKey() === "elevator_shaft" ? existing?.factThick ?? null : isFormwork ? null : (factThick ? (factThick.value === "" ? null : +factThick.value) : null),
    vertDev: getSelectedConstructionKey() === "elevator_shaft" ? existing?.vertDev ?? null : isFormwork ? null : (vertDev ? (vertDev.value === "" ? null : +vertDev.value) : null),
    note: isFormwork ? (readTextInputValue(geomFormworkNoteEl) || null) : (geomNoteEl ? (geomNoteEl.value.trim() || null) : null),
    formworkType: isFormwork ? formworkType : null,
    formworkElementName: isFormwork ? (readTextInputValue(geomFormworkElementNameEl) || null) : null,
    formworkArea: isFormwork ? (readTextInputValue(geomFormworkAreaEl) || null) : null,
    formworkProjHeight: isFormwork ? readDecimalInputValue(geomFormworkProjHeightEl) : null,
    formworkFactHeight: isFormwork ? readDecimalInputValue(geomFormworkFactHeightEl) : null,
    formworkProjWidth: isFormwork ? readDecimalInputValue(geomFormworkProjWidthEl) : null,
    formworkFactWidth: isFormwork ? readDecimalInputValue(geomFormworkFactWidthEl) : null,
    formworkProjThickness: isFormwork ? readDecimalInputValue(geomFormworkProjThicknessEl) : null,
    formworkFactThickness: isFormwork ? readDecimalInputValue(geomFormworkFactThicknessEl) : null,
    formworkVerticalDeviation: isFormwork ? readDecimalInputValue(geomFormworkVerticalDeviationEl) : null,
    formworkVerticalTolerance: isFormwork ? readDecimalInputValue(geomFormworkVerticalToleranceEl) : null,
    formworkBasis: isFormwork ? (readTextInputValue(geomFormworkBasisEl) || "project") : null,
    formworkResult: null,
    columns: isColumn ? geomGetColumns().map(c => ({
      id: c.id, physicalDimensions: c.physicalDimensions || {},
      marking: c.marking || "",
      projSize1: c.projSize1 === "" ? null : +c.projSize1,
      factSize1: c.factSize1 === "" ? null : +c.factSize1,
      projSize2: c.projSize2 === "" ? null : +c.projSize2,
      factSize2: c.factSize2 === "" ? null : +c.factSize2,
      vertDev: c.vertDev === "" ? null : +c.vertDev
    })) : null,
    walls: isWall ? wallItems.map(w => ({
      id: w.id, physicalDimensions: w.physicalDimensions || {},
      bindingType: w.bindingType || "number_letters",
      numberAxis: w.numberAxis || "",
      letterAxis1: w.letterAxis1 || "",
      letterAxis2: w.letterAxis2 || "",
      letterAxis: w.letterAxis || "",
      numberAxis1: w.numberAxis1 || "",
      numberAxis2: w.numberAxis2 || "",
      projThick: w.projThick === "" ? null : +w.projThick,
      factThick: w.factThick === "" ? null : +w.factThick,
      vertDev: w.vertDev === "" ? null : +w.vertDev,
      openingSizes: (w.projOpeningSizes || w.openingSizes || "").trim() || null,
      projOpeningSizes: (w.projOpeningSizes || w.openingSizes || "").trim() || null,
      factOpeningSizes: (w.factOpeningSizes || "").trim() || null,
      projOpeningHeight: w.projOpeningHeight === "" ? null : +w.projOpeningHeight,
      factOpeningHeight: w.factOpeningHeight === "" ? null : +w.factOpeningHeight,
      factWallFlatness: w.factWallFlatness === "" ? null : +w.factWallFlatness
    })) : null,
    factWallFlatness: wallFlatnessAlias,
    stairName: isStair ? (geomStairNameEl ? geomStairNameEl.value.trim() || null : null) : null,
    stairs: isStair ? geomGetStairs().map(s => ({
      id: s.id, physicalDimensions: s.physicalDimensions || {},
      elementType: s.elementType || "flight",
      position: s.position || "",
      bindingType: s.bindingType || "number_letters",
      numberAxis: s.numberAxis || "",
      letterAxis1: s.letterAxis1 || "",
      letterAxis2: s.letterAxis2 || "",
      letterAxis: s.letterAxis || "",
      numberAxis1: s.numberAxis1 || "",
      numberAxis2: s.numberAxis2 || "",
      projStepHeight: s.projStepHeight === "" ? null : +s.projStepHeight,
      factStepHeight: s.factStepHeight === "" ? null : +s.factStepHeight,
      projStepWidth: s.projStepWidth === "" ? null : +s.projStepWidth,
      factStepWidth: s.factStepWidth === "" ? null : +s.factStepWidth,
      projFlightWidth: s.projFlightWidth === "" ? null : +s.projFlightWidth,
      factFlightWidth: s.factFlightWidth === "" ? null : +s.factFlightWidth
    })) : null,
    beams: isBeam ? geomGetBeams().map(b => ({
      id: b.id, physicalDimensions: b.physicalDimensions || {},
      marking: b.marking || "",
      projBeamWidth: b.projBeamWidth === "" ? null : +b.projBeamWidth,
      factBeamWidth: b.factBeamWidth === "" ? null : +b.factBeamWidth,
      projBeamHeight: b.projBeamHeight === "" ? null : +b.projBeamHeight,
      factBeamHeight: b.factBeamHeight === "" ? null : +b.factBeamHeight
    })) : null
  };

  const evaluation = evaluateGeomCheck(data);
  data.status = evaluation.status === "empty" ? "empty" : (evaluation.status === "ok" ? "ok" : "exceeded");
  data.summaryText = evaluation.summaryText;
  if (isFormwork) data.formworkResult = evaluation.summaryText;
  getState().geometry = evaluation.status === "ok";
  getChecked().geometry = evaluation.status !== "empty";
  if (geometryResult) {
    geometryResult.className = evaluation.status === "ok" ? "result ok" : evaluation.status === "exceeded" ? "result not-ok" : "result";
    geometryResult.textContent = t(evaluation.status === "ok" ? "engineering_conforms" : evaluation.status === "exceeded" ? "engineering_nonconforms" : "engineering_requires_review");
    if (evaluation.status === "exceeded" && evaluation.hasIncompleteMeasurements) geometryResult.append(` — ${t("engineering_incomplete")}`);
    const rows = [data, ...(data.columns || []), ...(data.walls || []), ...(data.beams || []), ...(data.stairs || [])];
    for (const [index, row] of rows.entries()) {
      const values = row.physicalDimensions || {};
      for (const [key, pair] of Object.entries(values)) {
        const line = document.createElement("div");
        line.textContent = `${index || ""} ${t("dimension_" + key)}: ${pair.project || "—"} / ${pair.actual || "—"} mm`;
        geometryResult.append(line);
      }
      for (const [project, actual] of [["projPlateHeight", "factPlateHeight"], ["projThick", "factThick"], ["projSize1", "factSize1"], ["projSize2", "factSize2"], ["projBeamWidth", "factBeamWidth"], ["projBeamHeight", "factBeamHeight"], ["projFlightWidth", "factFlightWidth"], ["projStepHeight", "factStepHeight"], ["projStepWidth", "factStepWidth"]]) {
        if (row[project] == null && row[actual] == null) continue;
        const line = document.createElement("div");
        line.textContent = `${row[project] ?? "—"} / ${row[actual] ?? "—"} mm`;
        geometryResult.append(line);
      }
    }

  }
  data.lastMsg = geometryResult ? (geometryResult.innerHTML || "") : "";

  data.projectId = getCurrentProjectId();
  data.module = "geometry";
  const createdAtClient = existing?.createdAt || Date.now();
  data.createdAt = createdAtClient;

  data.id = id;
  setCurrentGeomCheckId(id);
  geomChecks.set(id, data);
  saveGeomChecks();
  renderGeomChecks();

  const skipJournal = skipJournalOnce || skipGeomJournalOnce;
  skipGeomJournalOnce = false;

  try {
    const finalId = id;
    const projectId = getCurrentProjectId();
    const saved = await saveGeomInspection(projectId, id, data);
    notifyFirestoreSyncStatusSafe(saved.ref);
    setCurrentGeomCheckId(finalId);

    if (!skipJournal && data.status !== "empty") {
      let context = "";
      if (floor) {
        context = `Этаж ${floor}`;
      }
      const constructionValue = construction ? construction.value : "";
      if (constructionValue === "Плита" && data.location) {
        context = floor ? `Этаж ${floor}, ${data.location}` : data.location;
      }
      if (isFormwork) {
        const target = data.formworkElementName || data.formworkArea || "";
        context = ["Опалубка", target, floor ? `этаж ${floor}` : ""].filter(Boolean).join(", ");
      }
      if (!context) context = "Геометрия";

      await upsertJournalEntrySafe({
        evaluationSchemaVersion: 2,
        module: "Геометрия",
        status: data.status === "ok" ? "ok" : "exceeded",
        context: context,
        details: evaluation.summaryText || "Проверка геометрии",
        sourceId: finalId,
        construction: data.construction || getSelectedConstructionKey()
      });
    }
  } catch (err) {
    console.error("[btnSaveGeomCheck] Ошибка сохранения в Firestore:", err);
    showNotification("Ошибка сохранения в Firestore.", "error");
  }

  updateSummary();
}

/**
 * Чистая функция для вычисления статуса проверки геометрии
 * @param {Object} checkData - Данные проверки геометрии
 * @returns {Object} - { status: "ok"|"exceeded"|"empty", summaryText: string }
 */
function runGeomCheck() {
  void saveGeomCheck();
}

function clearGeomForm() {
  commonPhysicalDimensions = {};
  renderCommonDimensions();
  restoreAcceptanceCriteria(document.getElementById("geometry"));
  setCurrentGeomCheckId(null);
  clearGeomBimSelection({ keepManualFields: false });
  const flags = getGeometryConstructionFlags();

  if (geomFloorEl) geomFloorEl.value = "";

  if (geomAxisLetterFromEl) geomAxisLetterFromEl.value = "";
  if (geomAxisLetterToEl) geomAxisLetterToEl.value = "";
  if (geomAxisNumberFromEl) geomAxisNumberFromEl.value = "";
  if (geomAxisNumberToEl) geomAxisNumberToEl.value = "";
  if (geomLocationEl) geomLocationEl.value = "";

  if (flags.isPlate) {
    applyDefaultGeomAxesSelection(true);
  }

  [projThick, factThick, vertDev].forEach(el => { if (el) el.value = ""; });
  if (projPlateHeightEl) projPlateHeightEl.value = "";
  if (factPlateHeightEl) factPlateHeightEl.value = "";
  if (geomPlateOpeningSizesEl) geomPlateOpeningSizesEl.value = "";
  if (geomPlateFactOpeningSizesEl) geomPlateFactOpeningSizesEl.value = "";
  if (factPlateFlatnessEl) factPlateFlatnessEl.value = "";
  clearGeomFormworkFields();

  geomSetColumns([]);
  geomSetWalls([]);
  geomSetStairs([]);
  geomSetBeams([]);
  renderGeomColumns();
  renderGeomWalls();
  renderGeomStairs();
  renderGeomBeams();
  if (geomStairNameEl) geomStairNameEl.value = "";
  if (geometryResult) {
    geometryResult.className = "result";
    geometryResult.innerHTML = "";
  }

  const state = getState();
  const checked = getChecked();
  state.geometry = false;
  checked.geometry = false;
  updateGeomFieldsVisibility();
}

async function clearGeomChecks() {
  if (!(await showConfirm("Удалить все сохранённые проверки геометрии для текущего проекта?"))) return;
  const projectId = getCurrentProjectId();
  if (!projectId) {
    showNotification("Сначала создайте объект или выберите существующий.", "warning");
    return;
  }

  console.log("[btnClearGeomChecks] Очистка проверок геометрии");
  console.log("[btnClearGeomChecks] projectId:", projectId);
  console.log("[btnClearGeomChecks] Путь Firestore: projects/" + projectId + "/geomChecks");

  try {
    const deletedCount = await clearInspectionSourceDocs(projectId, "geomChecks");
    const deletedDualWriteCount = await clearGeomInspectionDualWrite(projectId);
    console.log("[btnClearGeomChecks] Найдено документов в Firestore:", deletedCount);
    console.log("[btnClearGeomChecks] Удалено документов из Firestore:", deletedCount);
    console.log("[btnClearGeomChecks] Удалено документов dual-write из inspections:", deletedDualWriteCount);

    geomChecks.clear();
    setCurrentGeomCheckId(null);

    saveGeomChecks();
    renderGeomChecks();
    updateSummary();

    const state = getState();
    const checked = getChecked();
    if (state.geometry) {
      state.geometry = false;
      checked.geometry = false;
    }

    showNotification("Сохранённые проверки геометрии удалены.", "success");
  } catch (e) {
    console.error("[btnClearGeomChecks] Ошибка удаления из Firestore:", e);
    showNotification("Ошибка удаления проверок: " + e.message, "error");
  }
}

function initGeometryHandlers() {
  if (btnAddGeomColumn) {
    btnAddGeomColumn.addEventListener("click", addGeomColumn);
  }
  if (btnAddGeomWall) {
    btnAddGeomWall.addEventListener("click", addGeomWall);
  }
  if (btnAddGeomStair) {
    btnAddGeomStair.addEventListener("click", addGeomStair);
  }
  if (btnAddGeomBeam) {
    btnAddGeomBeam.addEventListener("click", addGeomBeam);
  }

  const btnGeom = document.getElementById("btnGeom");
  if (btnGeom) {
    btnGeom.addEventListener("click", runGeomCheck);
  }

  const btnSaveGeomCheck = document.getElementById("btnSaveGeomCheck");
  if (btnSaveGeomCheck) {
    btnSaveGeomCheck.addEventListener("click", () => {
      void saveGeomCheck();
    });
  }

  const btnClearGeomForm = document.getElementById("btnClearGeomForm");
  if (btnClearGeomForm) {
    btnClearGeomForm.addEventListener("click", clearGeomForm);
  }

  const btnClearGeomChecks = document.getElementById("btnClearGeomChecks");
  if (btnClearGeomChecks) {
    btnClearGeomChecks.addEventListener("click", () => {
      void clearGeomChecks();
    });
  }

  document.addEventListener("app:language-changed", () => { renderGeomBimFilterOptions(); renderGeomBimElementOptions(); renderCommonDimensions(); renderGeomColumns(); renderGeomWalls(); renderGeomStairs(); renderGeomBeams(); });
  if (geomBimElementSelect) {
    geomBimElementSelect.addEventListener("change", (event) => {
      const nextId = event.target?.value || "";
      if (nextId === "__empty__") return;
      applyGeomBimElementSelection(nextId);
    });
  }

  if (geomBimSearchInput) {
    geomBimSearchInput.addEventListener("input", (event) => {
      geomBimFilters.search = String(event.target?.value || "").trim();
      renderGeomBimElementOptions();
      updateGeomBimControlsState();
    });
  }

  if (geomBimTypeFilter) {
    geomBimTypeFilter.addEventListener("change", (event) => {
      geomBimFilters.type = normalizeGeomBimFilterValue(event.target?.value, "all");
      renderGeomBimElementOptions();
      updateGeomBimControlsState();
    });
  }

  if (geomBimAxesFilter) {
    geomBimAxesFilter.addEventListener("change", (event) => {
      geomBimFilters.axes = normalizeGeomBimFilterValue(event.target?.value, "all");
      renderGeomBimElementOptions();
      updateGeomBimControlsState();
    });
  }

  if (btnClearGeomBimSelection) {
    btnClearGeomBimSelection.addEventListener("click", () => {
      clearGeomBimSelection({ keepManualFields: true });
    });
  }

  if (projPlateHeightEl) {
    projPlateHeightEl.addEventListener("input", () => {
      setGeomBimFieldAutofilled(
        projPlateHeightEl,
        construction?.value === "Плита" &&
          matchesGeomBimNumber(projPlateHeightEl.value, geomBimBindingSnapshot?.thickness)
      );
    });
  }

  if (construction) {
    let previousConstruction = `${getSelectedConstructionKey()}:${getSelectedConstructionSubtype()}:${getSelectedPileElement()}`;
    construction.addEventListener("change", () => {
      const current = `${getSelectedConstructionKey()}:${getSelectedConstructionSubtype()}:${getSelectedPileElement()}`;
      if (current !== previousConstruction) {
        commonPhysicalDimensions = {};
        restoreAcceptanceCriteria(document.getElementById("geometry"));
        setCurrentGeomCheckId(null);
      }
      previousConstruction = current;
      updateGeomFieldsVisibility();
      markGeomDynamicBimFields(geomBimBindingSnapshot);
    });
  }
}

export function initGeometryModule() {
  if (geometryInitialized) return;
  geometryInitialized = true;

  onAppTabActivated("geometry", renderGeomBimVisualPanel);
  initGeomAxes();
  renderGeomBimFilterOptions();
  renderGeomBimElementOptions("");
  renderGeomBimBindingSnapshot();
  updateGeomBimControlsState();
  initGeometryHandlers();
  void loadGeomBimElements(getCurrentProjectId());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      updateGeomFieldsVisibility();
    });
  } else {
    updateGeomFieldsVisibility();
  }
}

export {
  updateGeomFieldsVisibility,
  loadGeomChecks,
  saveGeomChecks,
  renderGeomChecks,
  loadGeomCheck,
  saveGeomCheck,
  clearGeomChecks,
  clearGeomForm,
  loadGeomBimElements,
  renderGeomBimVisualPanel
};

