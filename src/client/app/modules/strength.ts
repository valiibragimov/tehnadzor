import {
  showConfirm,
  validateProject
} from "../../utils.js";
import { ensureChartJsLoaded } from "../ui/lazy-libs.js";
import {
  createStrengthBimSelectionRuntime,
  createStrengthDomBindings,
  createStrengthRuntime,
  type StrengthChartConstructor,
  type StrengthRuntime,
  type StrengthService,
  type StrengthState
} from "../../features/inspections/strength/index.js";
import { renderRegulatoryBasisHtml } from "../services/regulatory-basis.js";
import { getCurrentIfcFileFromInput } from "../services/bim-runtime-context.js";
import { APP_STORAGE_KEYS } from "../storage.js";

export interface StrengthModuleDependencies {
  state: StrengthState;
  service: StrengthService;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  getCurrentProjectId(): string | null;
  updateSummary(): unknown;
  addJournalEntry(params: Record<string, unknown>): unknown;
  upsertJournalEntry(params: Record<string, unknown>): unknown;
  notifyFirestoreSyncStatus(docRef: unknown): unknown;
  showNotification(message: string, tone?: string): void;
  setConstruction(
    construction: string,
    subtype?: string,
    pileElement?: string
  ): unknown;
}

let dependencies: StrengthModuleDependencies | null = null;
let runtime: StrengthRuntime | null = null;

export function configureStrengthModule(
  nextDependencies: StrengthModuleDependencies
) {
  dependencies = nextDependencies;
}

function getDependencies() {
  if (!dependencies) {
    throw new Error("Strength module dependencies are not configured.");
  }
  return dependencies;
}

export function initStrengthModule() {
  if (runtime) return;
  const configured = getDependencies();
  const dom = createStrengthDomBindings(document);
  const bim = createStrengthBimSelectionRuntime({
    service: configured.service,
    dom,
    getCurrentProjectId: configured.getCurrentProjectId,
    getCurrentIfcFile: getCurrentIfcFileFromInput,
    setConstruction: configured.setConstruction,
    getForm: () => {
      if (!runtime) {
        throw new Error("Strength runtime is not initialized.");
      }
      return runtime.form;
    }
  });

  runtime = createStrengthRuntime({
    state: configured.state,
    service: configured.service,
    dom,
    bim,
    inspectionState: configured.inspectionState,
    inspectionChecked: configured.inspectionChecked,
    storage: localStorage,
    storageKey: APP_STORAGE_KEYS.streng,
    getCurrentProjectId: configured.getCurrentProjectId,
    validateProject,
    setConstruction: configured.setConstruction,
    getChartConstructor: () =>
      (window.Chart as unknown as StrengthChartConstructor | undefined) ||
      null,
    ensureChartJsLoaded,
    renderRegulatoryBasis: renderRegulatoryBasisHtml,
    notify: configured.showNotification,
    confirm: showConfirm,
    updateSummary: configured.updateSummary,
    addJournalEntry: configured.addJournalEntry,
    upsertJournalEntry: configured.upsertJournalEntry,
    notifyFirestoreSyncStatus: configured.notifyFirestoreSyncStatus
  });
  runtime.init();
}

export function updateStrengthFieldsVisibility() {
  return runtime?.form.updateFieldsVisibility();
}

export function saveStrengthChecks() {
  return runtime?.saveChecks();
}

export async function loadStrengthChecks() {
  await runtime?.loadChecks();
}

export function renderStrengthChecks() {
  return runtime?.renderChecks();
}

export function loadStrengthCheck(id: string) {
  return runtime?.loadCheck(id);
}

export function saveStrengthCheck(
  { skipJournalOnce = false } = {}
) {
  return runtime?.saveCheck({ skipJournalOnce });
}

export function clearStrengthForm() {
  return runtime?.clearForm();
}

export function clearStrengthChecks() {
  return runtime?.clearChecks();
}

export function loadStrengthBimElements() {
  return runtime?.loadBimElements();
}

export function renderStrengthBimVisualPanel() {
  return runtime?.renderBimVisualPanel();
}
