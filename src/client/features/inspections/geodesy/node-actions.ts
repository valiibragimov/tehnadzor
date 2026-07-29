import { saveGeoNodesToStorage } from "./node-list.js";
import {
  resetGeodesyCurrentNodeKeys,
  type GeodesyNodeState
} from "./state.js";
import type { GeodesyService } from "./service.js";

interface GeodesyNodeActionsOptions {
  state: GeodesyNodeState;
  service: GeodesyService;
  storage: Storage;
  storageKey: string;
  renderNodes(): void;
  onLoadError?(error: unknown): void;
}

export function createGeodesyNodeActions({
  state,
  service,
  storage,
  storageKey,
  renderNodes,
  onLoadError = (error) =>
    console.error("Ошибка загрузки узлов проекта:", error)
}: GeodesyNodeActionsOptions) {
  const saveNodes = () => {
    saveGeoNodesToStorage({
      nodes: state.nodes,
      storage,
      storageKey
    });
  };

  return {
    saveNodes,

    async loadProjectNodes(projectId: string | null) {
      state.nodes.clear();
      renderNodes();
      if (!projectId?.trim()) return;

      try {
        const loadedNodes = await service.loadNodes(projectId);
        loadedNodes.forEach((data, id) => state.nodes.set(id, data));
        renderNodes();
        saveNodes();
      } catch (error) {
        onLoadError(error);
      }
    },

    async saveProjectNode(
      projectId: string | null,
      nodeId: string,
      data: Record<string, unknown>
    ) {
      if (!projectId) throw new Error("PROJECT_ID_REQUIRED");
      await service.saveNode(projectId, nodeId, data);
    },

    async deleteProjectNode(projectId: string | null, nodeId: string) {
      if (!projectId) return;
      await service.deleteNode(projectId, nodeId);
    },

    async clearProjectNodes(projectId: string | null) {
      if (!projectId) throw new Error("PROJECT_ID_REQUIRED");
      const result = await service.clearNodes(projectId);
      state.nodes.clear();
      resetGeodesyCurrentNodeKeys(state);
      saveNodes();
      renderNodes();
      return result;
    }
  };
}
