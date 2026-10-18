import {
  commitInspectionRegistryDocs,
  deleteOrphanInspectionDoc,
  getProjectCollectionSnapshot,
  saveJournalInspectionSession
} from "../repositories/firestore-repository.js";
import { refreshPendingProjectAnalytics } from "./analytics-current.js";

function normalizeSelectorValue(value) {
  return String(value == null ? "" : value).trim().toLocaleLowerCase("ru");
}

interface InspectionSelector {
  sourceCollection?: string | null;
  moduleKey?: string | null;
}

function matchesInspectionSelector(inspection, selector: InspectionSelector = {}) {
  if (!inspection || typeof inspection !== "object") return false;
  const sourceCollection = normalizeSelectorValue(selector.sourceCollection);
  const moduleKey = normalizeSelectorValue(selector.moduleKey);

  if (!sourceCollection && !moduleKey) return true;

  const inspectionSourceCollection = normalizeSelectorValue(inspection.sourceCollection);
  const inspectionModuleKey = normalizeSelectorValue(inspection.moduleKey);

  if (sourceCollection && inspectionSourceCollection === sourceCollection) return true;
  if (moduleKey && inspectionModuleKey === moduleKey) return true;
  return false;
}

export async function saveInspectionAndRefreshAnalytics(
  projectId,
  inspectionId,
  inspectionPayload,
  options = { merge: true }
) {
  if (!projectId || !inspectionId) return null;
  await commitInspectionRegistryDocs(projectId, [{ id: inspectionId, data: inspectionPayload, merge: options.merge }]);
  await refreshPendingProjectAnalytics(projectId);
  return inspectionId;
}

export async function deleteInspectionAndRefreshAnalytics(projectId, inspectionId) {
  if (!projectId || !inspectionId) return;
  await commitInspectionRegistryDocs(projectId, [{ id: inspectionId }]);
  await refreshPendingProjectAnalytics(projectId);
}

export async function saveJournalSessionAndRefreshAnalytics(projectId: string, sessionId: string, payload: Record<string, unknown>) {
  const result = await saveJournalInspectionSession(projectId, sessionId, payload);
  await refreshPendingProjectAnalytics(projectId);
  return result;
}

export async function clearInspectionsByModuleAndRefreshAnalytics(projectId, selector: InspectionSelector = {}) {
  if (!projectId) return 0;

  const inspectionsSnap = await getProjectCollectionSnapshot(projectId, "inspections");

  const candidates: Array<{ id: string; sourceCollection: string }> = [];
  inspectionsSnap.forEach((docSnap) => {
    const inspection = docSnap.data() || {};
    if (matchesInspectionSelector(inspection, selector)) {
      candidates.push({ id: docSnap.id, sourceCollection: inspection.sourceCollection || selector.sourceCollection || "" });
    }
  });

  let deletedCount = 0;
  for (const candidate of candidates) {
    if (await deleteOrphanInspectionDoc(projectId, candidate.id, candidate.sourceCollection)) deletedCount += 1;
  }
  await refreshPendingProjectAnalytics(projectId);
  return deletedCount;
}
