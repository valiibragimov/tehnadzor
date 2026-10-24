import {
  clearInspectionSourceDocs,
  getProjectCollectionSnapshot,
  getProjectDocSnapshot,
  saveInspectionSourceDoc,
  deleteInspectionSourceDocs
} from "../../../app/repositories/firestore-repository.js";
import {
  clearInspectionsByModuleAndRefreshAnalytics
} from "../../../app/services/inspection-sync.js";
import { refreshPendingProjectAnalytics } from "../../../app/services/analytics-current.js";
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
  async function buildInspection(projectId: string, sourceId: string, nodeData: Record<string, unknown>) {
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
      evaluationSchemaVersion: nodeData.evaluationSchemaVersion || null,
      checkStatus: normalizedStatus,
      summaryText: nodeData.summaryText || "",
      createdAt: nodeData.createdAt || Date.now(),
      updatedAt: Date.now(),
      contractorName: String(projectData.contractorName || "").trim()
    };
    if (ownerUid) payload.ownerUid = ownerUid;
    if (createdBy) payload.createdBy = createdBy;

    return payload;
  }
  const repository: GeodesyRepository = {
    async loadNodes(projectId) {
      await refreshPendingProjectAnalytics(projectId);
      return getProjectCollectionSnapshot(projectId, "geoNodes");
    },

    loadBimElements(projectId) {
      return getProjectCollectionSnapshot(projectId, "elements");
    },

    async saveNode(projectId, nodeId, data) {
      return saveInspectionSourceDoc(projectId, "geoNodes", nodeId, data, await buildInspection(projectId, nodeId, data));
    },

    markNodeDeleted(projectId, nodeId) {
      return deleteInspectionSourceDocs(projectId, "geoNodes", [nodeId], true);
    },

    clearNodes(projectId) {
      return clearInspectionSourceDocs(projectId, "geoNodes");
    },

    async refreshAnalytics(projectId) {
      await refreshPendingProjectAnalytics(projectId);
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
