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
  upsertInspection(
    projectId: string,
    checkId: string,
    data: ReinforcementCheckRecord
  ): Promise<void>;
  deleteInspection(projectId: string, checkId: string): Promise<void>;
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
  async function dualWriteSafely(
    projectId: string,
    checkId: string,
    data: ReinforcementCheckRecord
  ) {
    try {
      await repository.upsertInspection(projectId, checkId, data);
    } catch (error) {
      logger.warn(
        "[DualWrite][reinforcement] inspections upsert failed:",
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
      await dualWriteSafely(projectId, result.id, data);
      return result;
    },

    async updateCheck(projectId, checkId, data) {
      const result = await repository.updateCheck(projectId, checkId, data);
      await dualWriteSafely(projectId, checkId, data);
      return result;
    },

    async deleteCheck(projectId, checkId) {
      await repository.deleteCheck(projectId, checkId);
      await repository.deleteInspection(projectId, checkId);
    },

    async clearChecks(projectId) {
      const deletedCount = await repository.clearChecks(projectId);
      const deletedDualWriteCount =
        await repository.clearInspections(projectId);
      return { deletedCount, deletedDualWriteCount };
    }
  };
}
