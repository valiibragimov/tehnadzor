import type { WorkspaceContext } from "./workspace-context.js";
import { createModuleRuntime } from "./module-runtime.js";
import type {
  ReinforcementRuntimeDependencies,
  StrengthRuntimeDependencies
} from "./module-runtime.js";
import { APP_STORAGE_KEYS } from "./storage.js";
import type { JournalGeodesyApi } from "./modules/journal.js";

interface AppModuleBridgeOptions {
  workspace: WorkspaceContext;
  onJournalTabActivated?: () => void;
  journalGeodesy: JournalGeodesyApi;
  reinforcement: ReinforcementRuntimeDependencies;
  strength: StrengthRuntimeDependencies;
}

export function createAppModuleBridge({
  workspace,
  onJournalTabActivated,
  journalGeodesy,
  reinforcement,
  strength
}: AppModuleBridgeOptions) {
  const moduleRuntime = createModuleRuntime({ workspace, onJournalTabActivated, journalGeodesy, reinforcement, strength });

  const loadJournal = moduleRuntime.loadJournal;

  const saveJournal = moduleRuntime.saveJournal;

  const renderJournal = moduleRuntime.renderJournal;

  const loadJournalSessionsForProject = moduleRuntime.loadJournalSessionsForProject;

  const loadJournalFromFirestore = moduleRuntime.loadJournalFromFirestore;

  const applyJournalFilter = moduleRuntime.applyJournalFilter;

  const setJournalFilters = moduleRuntime.setJournalFilters;

  const addJournalEntry = moduleRuntime.addJournalEntry;

  const upsertJournalEntry = moduleRuntime.upsertJournalEntry;

  const notifyFirestoreSyncStatus = moduleRuntime.notifyFirestoreSyncStatus;

  const withGeometryModule = moduleRuntime.withGeometryModule;

  const loadGeomChecks = moduleRuntime.loadGeomChecks;

  const saveGeomChecks = moduleRuntime.saveGeomChecks;

  const renderGeomChecks = moduleRuntime.renderGeomChecks;

  const loadGeomCheck = moduleRuntime.loadGeomCheck;

  const updateGeomFieldsVisibility = moduleRuntime.updateGeomFieldsVisibility;

  const refreshGeometryBimElementsIfLoaded = moduleRuntime.refreshGeometryBimElementsIfLoaded;

  const refreshReinforcementBimElementsIfLoaded = moduleRuntime.refreshReinforcementBimElementsIfLoaded;

  const withReinforcementModule = moduleRuntime.withReinforcementModule;

  function updateReinfLocationFieldsVisibility(shouldReset = true) {
    return withReinforcementModule((module) => module.updateReinfLocationFieldsVisibility(shouldReset));
  }

  function checkReinfColumnDuplicate(marking: string, excludeId: number | null = null) {
    return withReinforcementModule((module) => module.checkReinfColumnDuplicate(marking, excludeId), false);
  }

  function removeReinfColumn(id: number) {
    return withReinforcementModule((module) => module.removeReinfColumn(id));
  }

  function renderReinfColumns() {
    return withReinforcementModule((module) => module.renderReinfColumns());
  }

  function checkReinfBeamDuplicate(marking: string, excludeId: number | null = null) {
    return withReinforcementModule((module) => module.checkReinfBeamDuplicate(marking, excludeId), false);
  }

  function removeReinfBeam(id: number) {
    return withReinforcementModule((module) => module.removeReinfBeam(id));
  }

  function renderReinfBeams() {
    return withReinforcementModule((module) => module.renderReinfBeams());
  }

  function checkReinfWallDuplicate(
    bindingType: string,
    numberAxis: string,
    letterAxis1: string,
    letterAxis2: string,
    letterAxis: string,
    numberAxis1: string,
    numberAxis2: string,
    excludeId: number | null = null
  ) {
    return withReinforcementModule(
      (module) =>
        module.checkReinfWallDuplicate(
          bindingType,
          numberAxis,
          letterAxis1,
          letterAxis2,
          letterAxis,
          numberAxis1,
          numberAxis2,
          excludeId
        ),
      false
    );
  }

  function bindReinfWallButton() {
    return withReinforcementModule((module) => module.bindReinfWallButton());
  }

  function removeReinfWall(id: number) {
    return withReinforcementModule((module) => module.removeReinfWall(id));
  }

  function saveReinfWallsDraft() {
    return withReinforcementModule((module) => module.saveReinfWallsDraft());
  }

  function loadReinfWallsDraft() {
    return withReinforcementModule((module) => module.loadReinfWallsDraft());
  }

  function renderReinfWalls() {
    return withReinforcementModule((module) => module.renderReinfWalls());
  }

  function loadReinfChecks() {
    return withReinforcementModule((module) => module.loadReinfChecks());
  }

  function saveReinfChecks() {
    return withReinforcementModule((module) => module.saveReinfChecks());
  }

  function renderReinfChecks() {
    return withReinforcementModule((module) => module.renderReinfChecks());
  }

  function loadReinfCheck(id: string) {
    return withReinforcementModule((module) => module.loadReinfCheck(id));
  }

  function clearReinfForm() {
    return withReinforcementModule((module) => module.clearReinfForm());
  }

  const withStrengthModule = moduleRuntime.withStrengthModule;

  function updateStrengthFieldsVisibility() {
    return withStrengthModule((module) => module.updateStrengthFieldsVisibility());
  }

  function loadStrengthChecks() {
    return withStrengthModule((module) => module.loadStrengthChecks());
  }

  function saveStrengthChecks() {
    return withStrengthModule((module) => module.saveStrengthChecks());
  }

  function renderStrengthChecks() {
    return withStrengthModule((module) => module.renderStrengthChecks());
  }

  function loadStrengthCheck(id: string) {
    return withStrengthModule((module) => module.loadStrengthCheck(id));
  }

  function clearStrengthForm() {
    return withStrengthModule((module) => module.clearStrengthForm());
  }

  const refreshStrengthBimElementsIfLoaded = moduleRuntime.refreshStrengthBimElementsIfLoaded;

  const updateSummaryTab = moduleRuntime.updateSummaryTab;

  const initNavigation = moduleRuntime.initNavigation;

  return {
    initNavigation,
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
    withReinforcementModule,
    updateReinfLocationFieldsVisibility,
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
    loadReinfChecks,
    saveReinfChecks,
    renderReinfChecks,
    loadReinfCheck,
    clearReinfForm,
    withStrengthModule,
    updateStrengthFieldsVisibility,
    loadStrengthChecks,
    saveStrengthChecks,
    renderStrengthChecks,
    loadStrengthCheck,
    clearStrengthForm,
    refreshStrengthBimElementsIfLoaded,
    updateSummaryTab
  };
}
