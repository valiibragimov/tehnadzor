import {
  clearInspectionSourceDocs,
  deleteInspectionSourceDocs,
  getProjectCollectionSnapshot,
  getProjectDocSnapshot,
  saveInspectionSourceDoc
} from "../../../app/repositories/firestore-repository.js";
import {
  clearInspectionsByModuleAndRefreshAnalytics
} from "../../../app/services/inspection-sync.js";
import { recomputeAndPersistProjectAnalyticsCurrent, refreshPendingProjectAnalytics } from "../../../app/services/analytics-current.js";
import type { Project } from "../../../types/domain.js";
import {
  createStrengthService,
  type StrengthRepository,
  type StrengthService
} from "./service.js";

export interface StrengthFirestoreContext {
  getCurrentUserId(): string | null;
}

export function createFirestoreStrengthService(
  context: StrengthFirestoreContext
): StrengthService {
  async function buildInspection(projectId: string, checkId: string, data: Record<string, unknown>) {
    const projectSnapshot = await getProjectDocSnapshot(projectId);
    const projectData = (
      projectSnapshot.exists() ? projectSnapshot.data() || {} : {}
    ) as Partial<Project>;
    const currentUserId = String(context.getCurrentUserId() || "").trim();
    const ownerUid = String(
      projectData.ownerUid || projectData.createdBy || currentUserId
    ).trim();
    const createdBy = String(
      projectData.createdBy || projectData.ownerUid || currentUserId
    ).trim();

    const inspectionPayload: Record<string, unknown> = {
      projectId,
      module: "Прочность",
      moduleKey: "strength",
      sourceCollection: "strengthChecks",
      sourceId: checkId,
      sourceDocId: checkId,
      construction: data.construction || "",
      constructionSubtype: data.constructionSubtype || "",
      constructionSubtypeLabel: data.constructionSubtypeLabel || "",
      checkStatus: data.status || null,
      summaryText: data.summaryText || "",
      createdAt: data.createdAt || Date.now(),
      updatedAt: Date.now(),
      contractorName: String(projectData.contractorName || "").trim()
    };
    if (ownerUid) inspectionPayload.ownerUid = ownerUid;
    if (createdBy) inspectionPayload.createdBy = createdBy;

    return inspectionPayload;
  }
  const repository: StrengthRepository = {
    async loadChecks(projectId) {
      await refreshPendingProjectAnalytics(projectId);
      return getProjectCollectionSnapshot(projectId, "strengthChecks");
    },

    loadBimElements(projectId) {
      return getProjectCollectionSnapshot(projectId, "elements");
    },

    async createCheck(projectId, data) {
      const checkId = String(data.id || crypto.randomUUID());
      data.id = checkId;
      data.createdAt ??= Date.now();
      const result = await saveInspectionSourceDoc(projectId, "strengthChecks", checkId,
        data, await buildInspection(projectId, checkId, data));
      return { id: result.id, ref: result.ref };
    },

    async updateCheck(projectId, checkId, data) {
      const result = await saveInspectionSourceDoc(projectId, "strengthChecks", checkId,
        { ...data, updatedAt: Date.now() }, await buildInspection(projectId, checkId, data));
      return { id: result.id, ref: result.ref };
    },

    deleteCheck(projectId, checkId) {
      return deleteInspectionSourceDocs(projectId, "strengthChecks", [checkId]);
    },

    clearChecks(projectId) {
      return clearInspectionSourceDocs(projectId, "strengthChecks");
    },

    async refreshAnalytics(projectId) {
      await recomputeAndPersistProjectAnalyticsCurrent(projectId);
    },


    clearInspections(projectId) {
      return clearInspectionsByModuleAndRefreshAnalytics(projectId, {
        sourceCollection: "strengthChecks",
        moduleKey: "strength"
      });
    }
  };

  return createStrengthService(repository);
}
