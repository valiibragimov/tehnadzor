import {
  clearProjectCollection,
  getProjectCollectionSnapshot,
  getProjectDocSnapshot,
  setProjectCollectionDoc
} from "../../../app/repositories/firestore-repository.js";
import {
  clearInspectionsByModuleAndRefreshAnalytics,
  deleteInspectionAndRefreshAnalytics,
  saveInspectionAndRefreshAnalytics
} from "../../../app/services/inspection-sync.js";
import type { Project } from "../../../types/domain.js";
import {
  createGeodesyService,
  type GeodesyRepository,
  type GeodesyService
} from "./service.js";

export interface GeodesyInspectionContext {
  getCurrentUserId(): string | null;
  getCurrentConstructionKey(): string;
  getCurrentConstructionCategoryKey(): string;
  getCurrentConstructionLabel(): string;
  getCurrentConstructionType(): string;
}

export function createFirestoreGeodesyService(
  context: GeodesyInspectionContext
): GeodesyService {
  const repository: GeodesyRepository = {
    loadNodes(projectId) {
      return getProjectCollectionSnapshot(projectId, "geoNodes");
    },

    loadBimElements(projectId) {
      return getProjectCollectionSnapshot(projectId, "elements");
    },

    saveNode(projectId, nodeId, data) {
      return setProjectCollectionDoc(projectId, "geoNodes", nodeId, data);
    },

    markNodeDeleted(projectId, nodeId) {
      return setProjectCollectionDoc(
        projectId,
        "geoNodes",
        nodeId,
        { deleted: true },
        { merge: true }
      );
    },

    clearNodes(projectId) {
      return clearProjectCollection(projectId, "geoNodes");
    },

    async upsertInspection(projectId, sourceId, nodeData) {
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
      const rawStatus = String(nodeData.status || "").trim().toLowerCase();
      const normalizedStatus = rawStatus === "bad" ? "exceeded" : rawStatus || null;

      const payload: Record<string, unknown> = {
        projectId,
        module: "Геодезия",
        moduleKey: "geo",
        sourceCollection: "geoNodes",
        sourceId,
        sourceDocId: sourceId,
        construction: nodeData.construction || context.getCurrentConstructionKey(),
        constructionCategory:
          nodeData.constructionCategory || context.getCurrentConstructionCategoryKey(),
        constructionLabel:
          nodeData.constructionLabel || context.getCurrentConstructionLabel(),
        constructionType:
          nodeData.constructionType || context.getCurrentConstructionType() || "Плита",
        checkStatus: normalizedStatus,
        summaryText: nodeData.summaryText || "",
        createdAt: nodeData.createdAt || Date.now(),
        updatedAt: Date.now(),
        contractorName: String(projectData.contractorName || "").trim()
      };
      if (ownerUid) payload.ownerUid = ownerUid;
      if (createdBy) payload.createdBy = createdBy;

      await saveInspectionAndRefreshAnalytics(projectId, sourceId, payload, {
        merge: true
      });
    },

    async deleteInspection(projectId, sourceId) {
      await deleteInspectionAndRefreshAnalytics(projectId, sourceId);
    },

    clearInspections(projectId) {
      return clearInspectionsByModuleAndRefreshAnalytics(projectId, {
        sourceCollection: "geoNodes",
        moduleKey: "geo"
      });
    }
  };

  return createGeodesyService(repository);
}
