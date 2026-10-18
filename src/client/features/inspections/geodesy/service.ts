export interface GeodesyDocumentSnapshot {
  id: string;
  data(): Record<string, unknown>;
}

export interface GeodesyCollectionSnapshot {
  forEach(callback: (document: GeodesyDocumentSnapshot) => void): void;
}

export interface GeodesyRepository {
  loadNodes(projectId: string): Promise<GeodesyCollectionSnapshot>;
  loadBimElements(projectId: string): Promise<GeodesyCollectionSnapshot>;
  saveNode(
    projectId: string,
    nodeId: string,
    data: Record<string, unknown>
  ): Promise<unknown>;
  markNodeDeleted(projectId: string, nodeId: string): Promise<unknown>;
  clearNodes(projectId: string): Promise<number>;
  refreshAnalytics(projectId: string): Promise<void>;
  clearInspections(projectId: string): Promise<number>;
}

export interface GeodesyService {
  loadNodes(projectId: string): Promise<Map<string, Record<string, unknown>>>;
  loadBimElements(
    projectId: string
  ): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  saveNode(
    projectId: string,
    nodeId: string,
    data: Record<string, unknown>
  ): Promise<void>;
  deleteNode(projectId: string, nodeId: string): Promise<void>;
  clearNodes(projectId: string): Promise<{
    deletedCount: number;
    deletedDualWriteCount: number;
  }>;
}

export function createGeodesyService(
  repository: GeodesyRepository,
  logger: Pick<Console, "warn"> = console
): GeodesyService {
  async function refreshAnalyticsSafely(projectId: string) {
    try {
      await repository.refreshAnalytics(projectId);
    } catch (error) {
      logger.warn("[Inspections][geo] analytics refresh remains pending:", error);
    }
  }
  return {
    async loadNodes(projectId) {
      const nodes = new Map<string, Record<string, unknown>>();
      if (!projectId.trim()) return nodes;

      const snapshot = await repository.loadNodes(projectId);
      snapshot.forEach((document) => {
        const data = document.data();
        if (data.deleted) return;
        nodes.set(document.id, data);
      });
      return nodes;
    },

    async loadBimElements(projectId) {
      if (!projectId.trim()) return [];
      const elements: Array<{
        id: string;
        data: Record<string, unknown>;
      }> = [];
      const snapshot = await repository.loadBimElements(projectId);
      snapshot.forEach((document) => {
        elements.push({ id: document.id, data: document.data() });
      });
      return elements;
    },

    async saveNode(projectId, nodeId, data) {
      await repository.saveNode(projectId, nodeId, data);
      await refreshAnalyticsSafely(projectId);
    },

    async deleteNode(projectId, nodeId) {
      await repository.markNodeDeleted(projectId, nodeId);
      await refreshAnalyticsSafely(projectId);
    },

    async clearNodes(projectId) {
      const deletedCount = await repository.clearNodes(projectId);
      const deletedDualWriteCount = await repository.clearInspections(projectId);
      return { deletedCount, deletedDualWriteCount };
    }
  };
}
