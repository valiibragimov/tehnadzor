import {
  deleteProjectCollectionDoc,
  getProjectCollectionSnapshot,
  setProjectCollectionDoc
} from "../repositories/firestore-repository.js";
import { recomputeAndPersistProjectAnalyticsCurrent } from "./analytics-current.js";

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
  await setProjectCollectionDoc(projectId, "inspections", inspectionId, inspectionPayload, options);
  await recomputeAndPersistProjectAnalyticsCurrent(projectId);
  return inspectionId;
}

export async function deleteInspectionAndRefreshAnalytics(projectId, inspectionId) {
  if (!projectId || !inspectionId) return;
  await deleteProjectCollectionDoc(projectId, "inspections", inspectionId);
  await recomputeAndPersistProjectAnalyticsCurrent(projectId);
}

export async function clearInspectionsByModuleAndRefreshAnalytics(projectId, selector: InspectionSelector = {}) {
  if (!projectId) return 0;

  const inspectionsSnap = await getProjectCollectionSnapshot(projectId, "inspections");
  if (inspectionsSnap.empty) return 0;

  const idsToDelete = [];
  inspectionsSnap.forEach((docSnap) => {
    const inspection = docSnap.data() || {};
    if (matchesInspectionSelector(inspection, selector)) {
      idsToDelete.push(docSnap.id);
    }
  });

  if (!idsToDelete.length) return 0;
  await Promise.all(
    idsToDelete.map((docId) => deleteProjectCollectionDoc(projectId, "inspections", docId))
  );
  await recomputeAndPersistProjectAnalyticsCurrent(projectId);
  return idsToDelete.length;
}
