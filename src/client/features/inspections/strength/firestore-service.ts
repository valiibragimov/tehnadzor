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
  const repository: StrengthRepository = {
    loadChecks(projectId) {
      return getProjectCollectionSnapshot(projectId, "strengthChecks");
    },

    loadBimElements(projectId) {
      return getProjectCollectionSnapshot(projectId, "elements");
    },

    async createCheck(projectId, data) {
      const result = await createProjectCollectionDoc(
        projectId,
        "strengthChecks",
        data
      );
      return { id: result.id, ref: result.ref };
    },

    async updateCheck(projectId, checkId, data) {
      const result = await updateProjectCollectionDoc(
        projectId,
        "strengthChecks",
        checkId,
        data
      );
      return { id: result.id, ref: result.ref };
    },

    deleteCheck(projectId, checkId) {
      return deleteProjectCollectionDoc(
        projectId,
        "strengthChecks",
        checkId
      );
    },

    clearChecks(projectId) {
      return clearProjectCollection(projectId, "strengthChecks");
    },

    async upsertInspection(projectId, checkId, data) {
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
        sourceCollection: "strengthChecks",
        moduleKey: "strength"
      });
    }
  };

  return createStrengthService(repository);
}
