import { getAuth } from "../../../infrastructure/firebase/auth.js";
import {
  clearProjectCollection,
  createProjectCollectionDoc,
  deleteProjectCollectionDoc,
  getProjectCollectionSnapshot,
  getProjectDocSnapshot,
  updateProjectCollectionDoc
} from "../../../app/repositories/firestore-repository.js";
import {
  clearInspectionsByModuleAndRefreshAnalytics,
  deleteInspectionAndRefreshAnalytics,
  saveInspectionAndRefreshAnalytics
} from "../../../app/services/inspection-sync.js";
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
  const repository: ReinforcementRepository = {
    loadChecks(projectId) {
      return getProjectCollectionSnapshot(projectId, "reinfChecks");
    },

    loadBimElements(projectId) {
      return getProjectCollectionSnapshot(projectId, "elements");
    },

    async createCheck(projectId, data) {
      const result = await createProjectCollectionDoc(
        projectId,
        "reinfChecks",
        data
      );
      return { id: result.id, ref: result.ref };
    },

    async updateCheck(projectId, checkId, data) {
      const result = await updateProjectCollectionDoc(
        projectId,
        "reinfChecks",
        checkId,
        data
      );
      return { id: result.id, ref: result.ref };
    },

    deleteCheck(projectId, checkId) {
      return deleteProjectCollectionDoc(projectId, "reinfChecks", checkId);
    },

    clearChecks(projectId) {
      return clearProjectCollection(projectId, "reinfChecks");
    },

    async upsertInspection(projectId, checkId, data) {
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

      await saveInspectionAndRefreshAnalytics(
        projectId,
        checkId,
        inspectionPayload,
        { merge: true }
      );
    },

    deleteInspection(projectId, checkId) {
      return deleteInspectionAndRefreshAnalytics(projectId, checkId);
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
