import { createModuleRuntime } from "./module-runtime.js";
import { APP_STORAGE_KEYS } from "./storage.js";

interface AppModuleBridgeOptions {
  onJournalTabActivated?: () => void;
}

type JournalModule = typeof import("./modules/journal.js");
type GeometryModule = typeof import("./modules/geometry.js");
type ReinforcementModule = typeof import("./modules/reinforcement.js");
type StrengthModule = typeof import("./modules/strength.js");

type ModuleAction<TModule, TResult> = (module: TModule) => TResult | Promise<TResult>;

export function createAppModuleBridge({
  onJournalTabActivated
}: AppModuleBridgeOptions) {
  let moduleRuntime: ReturnType<typeof createModuleRuntime> | null = null;

  function getModuleRuntime() {
    if (!moduleRuntime) {
      moduleRuntime = createModuleRuntime({
        onJournalTabActivated
      });
    }
    return moduleRuntime;
  }

  function loadJournal() {
    return getModuleRuntime().loadJournal();
  }

  function saveJournal() {
    return getModuleRuntime().saveJournal();
  }

  function renderJournal() {
    return getModuleRuntime().renderJournal();
  }

  function loadJournalSessionsForProject(projectId: string) {
    return getModuleRuntime().loadJournalSessionsForProject(projectId);
  }

  function loadJournalFromFirestore() {
    return getModuleRuntime().loadJournalFromFirestore();
  }

  function applyJournalFilter() {
    return getModuleRuntime().applyJournalFilter();
  }

  function setJournalFilters(moduleKey: string | null = null, constructionValue: string | null = null) {
    return getModuleRuntime().setJournalFilters(moduleKey, constructionValue);
  }

  function addJournalEntry(params: unknown) {
    return getModuleRuntime().addJournalEntry(params);
  }

  function upsertJournalEntry(params: unknown) {
    return getModuleRuntime().upsertJournalEntry(params);
  }

  function notifyFirestoreSyncStatus(docRef: unknown) {
    return getModuleRuntime().notifyFirestoreSyncStatus(docRef);
  }

  function withGeometryModule<TResult = unknown>(
    action: ModuleAction<GeometryModule, TResult>,
    fallback?: TResult
  ) {
    return getModuleRuntime().withGeometryModule(action, fallback);
  }

  function loadGeomChecks() {
    return getModuleRuntime().loadGeomChecks();
  }

  function saveGeomChecks() {
    return getModuleRuntime().saveGeomChecks();
  }

  function renderGeomChecks() {
    return getModuleRuntime().renderGeomChecks();
  }

  function loadGeomCheck(id: string) {
    return getModuleRuntime().loadGeomCheck(id);
  }

  function updateGeomFieldsVisibility() {
    return getModuleRuntime().updateGeomFieldsVisibility();
  }

  function refreshGeometryBimElementsIfLoaded() {
    return getModuleRuntime().refreshGeometryBimElementsIfLoaded();
  }

  function refreshReinforcementBimElementsIfLoaded() {
    return getModuleRuntime().refreshReinforcementBimElementsIfLoaded();
  }

  function withReinforcementModule<TResult = unknown>(
    action: ModuleAction<ReinforcementModule, TResult>,
    fallback?: TResult
  ) {
    return getModuleRuntime().withReinforcementModule(action, fallback);
  }

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

  function withStrengthModule<TResult = unknown>(
    action: ModuleAction<StrengthModule, TResult>,
    fallback?: TResult
  ) {
    return getModuleRuntime().withStrengthModule(action, fallback);
  }

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

  function refreshStrengthBimElementsIfLoaded() {
    return getModuleRuntime().refreshStrengthBimElementsIfLoaded();
  }

  function updateSummaryTab() {
    return getModuleRuntime().updateSummaryTab();
  }

  function initNavigation(storageKey = APP_STORAGE_KEYS.tab) {
    getModuleRuntime().initTabsNavigation(storageKey);

    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          getModuleRuntime().initBottomNav(storageKey);
        },
        { once: true }
      );
      return;
    }

    getModuleRuntime().initBottomNav(storageKey);
  }

  globalThis.loadReinfChecks = loadReinfChecks;
  globalThis.saveReinfChecks = saveReinfChecks;
  globalThis.renderReinfChecks = renderReinfChecks;
  globalThis.loadReinfCheck = loadReinfCheck;
  globalThis.updateReinfLocationFieldsVisibility = updateReinfLocationFieldsVisibility;

  globalThis.loadStrengthChecks = loadStrengthChecks;
  globalThis.saveStrengthChecks = saveStrengthChecks;
  globalThis.renderStrengthChecks = renderStrengthChecks;
  globalThis.loadStrengthCheck = loadStrengthCheck;
  globalThis.updateStrengthFieldsVisibility = updateStrengthFieldsVisibility;
  globalThis.LS = APP_STORAGE_KEYS;

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
