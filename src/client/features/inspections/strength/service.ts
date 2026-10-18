import type {
  StrengthCheckRecord,
  StrengthBimElementRecord,
  StrengthCollectionSnapshot,
  StrengthWriteResult
} from "./types.js";

export interface StrengthRepository {
  loadChecks(projectId: string): Promise<StrengthCollectionSnapshot>;
  loadBimElements(projectId: string): Promise<StrengthCollectionSnapshot>;
  createCheck(
    projectId: string,
    data: StrengthCheckRecord
  ): Promise<StrengthWriteResult>;
  updateCheck(
    projectId: string,
    checkId: string,
    data: StrengthCheckRecord
  ): Promise<StrengthWriteResult>;
  deleteCheck(projectId: string, checkId: string): Promise<void>;
  clearChecks(projectId: string): Promise<number>;
  refreshAnalytics(projectId: string): Promise<void>;
  clearInspections(projectId: string): Promise<number>;
}

export interface StrengthService {
  loadChecks(projectId: string): Promise<Map<string, StrengthCheckRecord>>;
  loadBimElements(projectId: string): Promise<StrengthBimElementRecord[]>;
  createCheck(
    projectId: string,
    data: StrengthCheckRecord
  ): Promise<StrengthWriteResult>;
  updateCheck(
    projectId: string,
    checkId: string,
    data: StrengthCheckRecord
  ): Promise<StrengthWriteResult>;
  deleteCheck(projectId: string, checkId: string): Promise<void>;
  clearChecks(projectId: string): Promise<{
    deletedCount: number;
    deletedDualWriteCount: number;
  }>;
}

function normalizeCreatedAt(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }
  return typeof value === "number" ? value : null;
}

export function createStrengthService(
  repository: StrengthRepository,
  logger: Pick<Console, "warn"> = console
): StrengthService {
  async function refreshAnalyticsSafely(projectId: string) {
    try {
      await repository.refreshAnalytics(projectId);
    } catch (error) {
      logger.warn("[Inspections][strength] analytics refresh remains pending:", error);
    }
  }

  return {
    async loadChecks(projectId) {
      const checks = new Map<string, StrengthCheckRecord>();
      if (!projectId.trim()) return checks;

      const snapshot = await repository.loadChecks(projectId);
      snapshot.forEach((document) => {
        const data = document.data();
        if (data.deleted) return;
        checks.set(document.id, {
          ...data,
          id: document.id,
          createdAt: normalizeCreatedAt(data.createdAt)
        });
      });
      return checks;
    },

    async loadBimElements(projectId) {
      if (!projectId.trim()) return [];
      const elements: StrengthBimElementRecord[] = [];
      const snapshot = await repository.loadBimElements(projectId);
      snapshot.forEach((document) => {
        const data = document.data();
        if (data.deleted) return;
        elements.push(data.id === document.id ? data as StrengthBimElementRecord : { ...data, id: document.id });
      });
      return elements;
    },

    async createCheck(projectId, data) {
      const result = await repository.createCheck(projectId, data);
      await refreshAnalyticsSafely(projectId);
      return result;
    },

    async updateCheck(projectId, checkId, data) {
      const result = await repository.updateCheck(projectId, checkId, data);
      await refreshAnalyticsSafely(projectId);
      return result;
    },

    async deleteCheck(projectId, checkId) {
      await repository.deleteCheck(projectId, checkId);
      await refreshAnalyticsSafely(projectId);
    },

    async clearChecks(projectId) {
      const deletedCount = await repository.clearChecks(projectId);
      const deletedDualWriteCount =
        await repository.clearInspections(projectId);
      return { deletedCount, deletedDualWriteCount };
    }
  };
}
