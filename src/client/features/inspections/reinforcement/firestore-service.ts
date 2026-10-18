import { getAuth } from "../../../infrastructure/firebase/auth.js";
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
import { refreshPendingProjectAnalytics } from "../../../app/services/analytics-current.js";
import type { Project } from "../../../types/domain.js";
import {
  createReinforcementService,
  type ReinforcementRepository,
  type ReinforcementService
} from "./service.js";

export interface ReinforcementFirestoreContext {
  getCurrentUserId?(): string | null;
}

export function createFirestoreReinforcementService(
  context: ReinforcementFirestoreContext = {}
): ReinforcementService {
  async function buildInspection(projectId: string, checkId: string, data: Record<string, unknown>) {
    const projectSnapshot = await getProjectDocSnapshot(projectId);
    const projectData = (
      projectSnapshot.exists() ? projectSnapshot.data() || {} : {}
    ) as Partial<Project>;
    const authUid = String(
      context.getCurrentUserId?.() || getAuth().currentUser?.uid || ""
    ).trim();
    const ownerUid = String(
      projectData.ownerUid || projectData.createdBy || authUid
    ).trim();
    const createdBy = String(
      projectData.createdBy || projectData.ownerUid || authUid
    ).trim();
    const inspectionPayload: Record<string, unknown> = {
      projectId,
      module: "Армирование",
      moduleKey: "reinforcement",
      sourceCollection: "reinfChecks",
      sourceId: checkId,
      sourceDocId: checkId,
      construction: data.construction || "",
      constructionCategory: data.constructionCategory || "",
      constructionLabel: data.constructionLabel || "",
      constructionType: data.constructionType || "",
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
  const repository: ReinforcementRepository = {
    async loadChecks(projectId) {
      await refreshPendingProjectAnalytics(projectId);
      return getProjectCollectionSnapshot(projectId, "reinfChecks");
    },

    loadBimElements(projectId) {
      return getProjectCollectionSnapshot(projectId, "elements");
    },

    async createCheck(projectId, data) {
      const checkId = String(data.id || crypto.randomUUID());
      data.id = checkId;
      data.createdAt ??= Date.now();
      const result = await saveInspectionSourceDoc(projectId, "reinfChecks", checkId,
        data, await buildInspection(projectId, checkId, data));
      return { id: result.id, ref: result.ref };
    },

    async updateCheck(projectId, checkId, data) {
      const result = await saveInspectionSourceDoc(projectId, "reinfChecks", checkId,
        { ...data, updatedAt: Date.now() }, await buildInspection(projectId, checkId, data));
      return { id: result.id, ref: result.ref };
    },

    deleteCheck(projectId, checkId) {
      return deleteInspectionSourceDocs(projectId, "reinfChecks", [checkId]);
    },

    clearChecks(projectId) {
      return clearInspectionSourceDocs(projectId, "reinfChecks");
    },

    async refreshAnalytics(projectId) {
      await refreshPendingProjectAnalytics(projectId);
    },


    clearInspections(projectId) {
      return clearInspectionsByModuleAndRefreshAnalytics(projectId, {
        sourceCollection: "reinfChecks",
        moduleKey: "reinforcement"
      });
    }
  };

  return createReinforcementService(repository);
}
