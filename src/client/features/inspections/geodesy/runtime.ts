import {
  evaluateGeoBeamNode,
  evaluateGeoColumnNode,
  evaluateGeoNode,
  evaluateGeoWallNode
} from "./evaluation.js";
import { createGeodesyBimSelectionRuntime } from "./bim-selection-runtime.js";
import {
  createGeodesyForm,
  type GeodesyConstructionFlags,
  type GeodesyFormRuntime
} from "./form.js";
import { bindGeodesyHandlers } from "./handlers.js";
import { createGeodesyNodeActions } from "./node-actions.js";
import { renderGeoNodesList } from "./node-list.js";
import type { createGeodesyDomBindings } from "./dom.js";
import type { GeodesyService } from "./service.js";
import type { GeodesyState } from "./state.js";
import type {
  GeodesyJournalPayload,
  GeodesyNodeRecord
} from "./types.js";

type GeodesyDomBindings = ReturnType<typeof createGeodesyDomBindings>;

interface GeodesyRuntimeDependencies {
  state: GeodesyState;
  service: GeodesyService;
  dom: GeodesyDomBindings;
  construction: HTMLElement;
  constructionFieldShell: HTMLElement | null;
  storage: Storage;
  storageKey: string;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  getCurrentProjectId(): string | null;
  getCurrentConstructionKey(): string;
  getCurrentConstructionLabel(): string;
  getCurrentConstructionSubtype(): string;
  getCurrentPileElement(): string;
  getGeoConstructionFlags(value?: string): GeodesyConstructionFlags;
  setConstructionAndTrigger(
    constructionType: string,
    constructionSubtype?: string,
    constructionPileElement?: string
  ): boolean;
  buildCurrentConstructionPayload(): Record<string, unknown>;
  getCurrentIfcFile(): File | null;
  resetImportedModelState(): void;
  syncIfcImportControls(): void;
  saveMeta(): void;
  cancelProjectDesignAutosave(): void;
  saveProjectDesign(): Promise<unknown>;
  updateSummaryTab(): void;
  upsertJournalEntry(payload: GeodesyJournalPayload): Promise<unknown>;
  safeValue(value: unknown): string;
  showConfirm(
    message: string,
    options?: { anchor?: HTMLElement | null }
  ): Promise<boolean>;
  showNotification(message: string, tone?: string): void;
  onLoadError?(error: unknown): void;
}

export function createGeodesyRuntime(
  dependencies: GeodesyRuntimeDependencies
) {
  const {
    state,
    service,
    dom,
    storage,
    storageKey,
    getCurrentProjectId,
    updateSummaryTab,
    safeValue,
    showConfirm,
    onLoadError
  } = dependencies;
  let form: GeodesyFormRuntime | null = null;
  let nodeActions: ReturnType<typeof createGeodesyNodeActions> | null = null;
  let started = false;

  const getForm = () => {
    if (!form) throw new Error("GEODESY_RUNTIME_NOT_STARTED");
    return form;
  };
  const getNodeActions = () => {
    if (!nodeActions) throw new Error("GEODESY_RUNTIME_NOT_STARTED");
    return nodeActions;
  };
  const bim = createGeodesyBimSelectionRuntime({
    ...dependencies,
    getForm
  });

  const saveNodes = () => getNodeActions().saveNodes();

  const renderNodes = () => {
    const activeForm = getForm();
    renderGeoNodesList({
      nodes: state.nodes,
      listElement: dom.nodesList,
      safeValue,
      evaluateGeoColumnNode,
      evaluateGeoNode,
      evaluateGeoWallNode,
      evaluateGeoBeamNode,
      loadNode: activeForm.loadNode,
      onDeleteNode: deleteNodeWithSync
    });
  };

  async function deleteNodeWithSync(
    nodeId: string,
    nodeData: GeodesyNodeRecord,
    anchorElement?: HTMLElement | null
  ) {
    if (
      !(await showConfirm("Удалить этот узел?", {
        anchor: anchorElement
      }))
    ) {
      return false;
    }

    state.nodes.delete(nodeId);
    renderNodes();
    saveNodes();

    if (
      nodeData?.type === "columns" ||
      nodeData?.type === "walls" ||
      nodeData?.type === "beams"
    ) {
      updateSummaryTab();
    }

    try {
      await getNodeActions().deleteProjectNode(getCurrentProjectId(), nodeId);
    } catch (error) {
      console.error("Ошибка удаления узла в Firebase:", error);
    }
    return true;
  }

  const start = () => {
    if (started) return api;

    form = createGeodesyForm({
      ...dependencies,
      bim
    });
    nodeActions = createGeodesyNodeActions({
      state,
      service,
      storage,
      storageKey,
      renderNodes,
      onLoadError
    });
    bindGeodesyHandlers({
      ...dependencies,
      bim,
      form,
      nodeActions,
      renderNodes,
      saveNodes
    });
    bim.start();
    started = true;
    return api;
  };

  const api = {
    start,
    bim,
    get nodes() {
      return state.nodes;
    },
    get currentNodeKeys() {
      return state.currentNodeKeys;
    },
    addGeoPlateOpeningPoint: (...args: Parameters<GeodesyFormRuntime["addGeoPlateOpeningPoint"]>) =>
      getForm().addGeoPlateOpeningPoint(...args),
    createEmptyBeamRow: (...args: Parameters<GeodesyFormRuntime["createEmptyBeamRow"]>) =>
      getForm().createEmptyBeamRow(...args),
    createEmptyWallRow: (...args: Parameters<GeodesyFormRuntime["createEmptyWallRow"]>) =>
      getForm().createEmptyWallRow(...args),
    ensureColumnPrefillRow: () => getForm().ensureColumnPrefillRow(),
    getGeoAxisState: (...args: Parameters<GeodesyFormRuntime["getGeoAxisState"]>) =>
      getForm().getGeoAxisState(...args),
    loadNode: (key: string) => getForm().loadNode(key),
    loadProjectNodes: (projectId: string | null) =>
      getNodeActions().loadProjectNodes(projectId),
    normalizeGeoPlateAxisDefaults: () =>
      getForm().normalizeGeoPlateAxisDefaults(),
    renderBeams: () => getForm().renderBeams(),
    renderColumns: () => getForm().renderColumns(),
    renderGeoPlateOpeningPoints: () =>
      getForm().renderGeoPlateOpeningPoints(),
    renderNodes,
    renderWalls: () => getForm().renderWalls(),
    resetCurrentNodeKeys() {
      state.currentNodeKeys.column = null;
      state.currentNodeKeys.wall = null;
      state.currentNodeKeys.beam = null;
    },
    clearCurrentNodeKey(nodeId: string) {
      if (state.currentNodeKeys.column === nodeId) {
        state.currentNodeKeys.column = null;
      }
      if (state.currentNodeKeys.wall === nodeId) {
        state.currentNodeKeys.wall = null;
      }
      if (state.currentNodeKeys.beam === nodeId) {
        state.currentNodeKeys.beam = null;
      }
    },
    resetGeoPlateAxisFields: (...args: Parameters<GeodesyFormRuntime["resetGeoPlateAxisFields"]>) =>
      getForm().resetGeoPlateAxisFields(...args),
    saveNodes,
    setGeoUnsupportedState: (...args: Parameters<GeodesyFormRuntime["setGeoUnsupportedState"]>) =>
      getForm().setGeoUnsupportedState(...args),
    syncGeoPlateAxisPrevValues: () =>
      getForm().syncGeoPlateAxisPrevValues(),
    updateGeoPlateFlatnessCalculatedFields: () =>
      getForm().updateGeoPlateFlatnessCalculatedFields(),
    updateGeoFieldsVisibility: () =>
      getForm().updateGeoFieldsVisibility(),
    updateGeoWallsLimitUi: () => getForm().updateGeoWallsLimitUi(),
    updateNodeId: () => getForm().updateNodeId(),
    validateGeoPlateAxisRange: (...args: Parameters<GeodesyFormRuntime["validateGeoPlateAxisRange"]>) =>
      getForm().validateGeoPlateAxisRange(...args)
  };

  return api;
}

export type GeodesyRuntime = ReturnType<typeof createGeodesyRuntime>;
