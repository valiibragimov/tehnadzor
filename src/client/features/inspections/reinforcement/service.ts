import type {
  ReinforcementCheckRecord,
  ReinforcementCollectionSnapshot,
  ReinforcementWriteResult
} from "./types.js";

export interface ReinforcementRepository {
  loadChecks(projectId: string): Promise<ReinforcementCollectionSnapshot>;
  loadBimElements(
    projectId: string
  ): Promise<ReinforcementCollectionSnapshot>;
  createCheck(
    projectId: string,
    data: ReinforcementCheckRecord
  ): Promise<ReinforcementWriteResult>;
  updateCheck(
    projectId: string,
    checkId: string,
    data: ReinforcementCheckRecord
  ): Promise<ReinforcementWriteResult>;
  deleteCheck(projectId: string, checkId: string): Promise<void>;
  clearChecks(projectId: string): Promise<number>;
  refreshAnalytics(projectId: string): Promise<void>;
  clearInspections(projectId: string): Promise<number>;
}

export interface ReinforcementService {
  loadChecks(projectId: string): Promise<Map<string, ReinforcementCheckRecord>>;
  loadBimElements(projectId: string): Promise<ReinforcementCollectionSnapshot>;
  createCheck(
    projectId: string,
    data: ReinforcementCheckRecord
  ): Promise<ReinforcementWriteResult>;
  updateCheck(
    projectId: string,
    checkId: string,
    data: ReinforcementCheckRecord
  ): Promise<ReinforcementWriteResult>;
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
  ) return value.toMillis();
  return typeof value === "number" ? value : null;
}

export function createReinforcementService(
  repository: ReinforcementRepository,
  logger: Pick<Console, "warn"> = console
): ReinforcementService {
  async function refreshAnalyticsSafely(projectId: string) {
    try {
      await repository.refreshAnalytics(projectId);
    } catch (error) {
      logger.warn(
        "[Inspections][reinforcement] analytics refresh remains pending:",
        error
      );
    }
  }

  return {
    async loadChecks(projectId) {
      const checks = new Map<string, ReinforcementCheckRecord>();
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

    loadBimElements(projectId) {
      return repository.loadBimElements(projectId);
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
