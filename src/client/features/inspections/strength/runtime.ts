import { createStrengthChartController } from "./chart.js";
import type { StrengthChartConstructor } from "./chart.js";
import type { StrengthDomBindings } from "./dom.js";
import {
  createStrengthForm,
  type StrengthBimFormApi
} from "./form.js";
import { createStrengthActions } from "./handlers.js";
import type { StrengthService } from "./service.js";
import type { StrengthState } from "./types.js";

export interface StrengthBimRuntimeApi extends StrengthBimFormApi {
  initBindings(): void;
  loadElements(projectId?: string | null): Promise<void>;
  renderVisualPanel(): void;
}

export interface StrengthRuntimeDependencies {
  state: StrengthState;
  service: StrengthService;
  dom: StrengthDomBindings;
  bim: StrengthBimRuntimeApi;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
  storageKey: string;
  getCurrentProjectId(): string | null;
  validateProject(projectId: string | null): boolean;
  setConstruction(
    construction: string,
    subtype?: string,
    pileElement?: string
  ): unknown;
  getChartConstructor(): StrengthChartConstructor | null;
  ensureChartJsLoaded(): Promise<boolean>;
  renderRegulatoryBasis(options: {
    moduleKey: string;
    checkKind: string;
    subtype: string;
    helpTargetId: string;
  }): string;
  notify(message: string, tone?: string): void;
  confirm(message: string): boolean | Promise<boolean>;
  updateSummary(): unknown;
  addJournalEntry(payload: Record<string, unknown>): unknown;
  upsertJournalEntry(payload: Record<string, unknown>): unknown;
  notifyFirestoreSyncStatus(docRef: unknown): unknown;
}

export function createStrengthRuntime(
  dependencies: StrengthRuntimeDependencies
) {
  const chart = createStrengthChartController({
    canvas: dependencies.dom.canvas,
    getChartConstructor: dependencies.getChartConstructor
  });
  const form = createStrengthForm({
    dom: dependencies.dom,
    bim: dependencies.bim,
    inspectionState: dependencies.inspectionState,
    inspectionChecked: dependencies.inspectionChecked,
    notify: dependencies.notify,
    setConstruction: dependencies.setConstruction,
    destroyChart: chart.destroy
  });
  const actions = createStrengthActions({
    state: dependencies.state,
    service: dependencies.service,
    form,
    chart,
    dom: dependencies.dom,
    inspectionState: dependencies.inspectionState,
    inspectionChecked: dependencies.inspectionChecked,
    storage: dependencies.storage,
    storageKey: dependencies.storageKey,
    getCurrentProjectId: dependencies.getCurrentProjectId,
    validateProject: dependencies.validateProject,
    loadBimElements: dependencies.bim.loadElements,
    ensureChartJsLoaded: dependencies.ensureChartJsLoaded,
    renderRegulatoryBasis: dependencies.renderRegulatoryBasis,
    notify: dependencies.notify,
    confirm: dependencies.confirm,
    updateSummary: dependencies.updateSummary,
    addJournalEntry: dependencies.addJournalEntry,
    upsertJournalEntry: dependencies.upsertJournalEntry,
    notifyFirestoreSyncStatus:
      dependencies.notifyFirestoreSyncStatus
  });
  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    form.init();
    dependencies.bim.initBindings();
    actions.bind();
    void dependencies.bim.loadElements(
      dependencies.getCurrentProjectId()
    );
    if (dependencies.dom.document.readyState === "loading") {
      dependencies.dom.document.addEventListener(
        "DOMContentLoaded",
        form.updateFieldsVisibility,
        { once: true }
      );
    } else {
      form.updateFieldsVisibility();
    }
  }

  return {
    init,
    form,
    runCheck: actions.runCheck,
    saveCheck: actions.saveCheck,
    loadCheck: actions.loadCheck,
    deleteCheck: actions.deleteCheck,
    clearForm: actions.clearForm,
    clearChecks: actions.clearChecks,
    loadChecks: actions.loadChecks,
    saveChecks: actions.saveLocalChecks,
    renderChecks: actions.renderChecks,
    loadBimElements: dependencies.bim.loadElements,
    renderBimVisualPanel: dependencies.bim.renderVisualPanel
  };
}

export type StrengthRuntime = ReturnType<typeof createStrengthRuntime>;
