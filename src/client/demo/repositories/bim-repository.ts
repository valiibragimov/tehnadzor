import { getProjectCollectionSnapshot, setProjectCollectionDocs, deleteProjectCollectionDocsByField, clearProjectCollection } from "./app-repository.js";
export async function publishProjectBimModel(projectId: string, sourceModelId: string, elements: Array<Record<string, unknown>>) {
  const writtenCount = await setProjectCollectionDocs(projectId, "elements", elements, { idField: "elementId" });
  const removedCount = await deleteProjectCollectionDocsByField(projectId, "elements", "sourceModelId", sourceModelId, 500, elements.map(element => String(element.elementId)));
  return { writtenCount, removedCount };
}
export function hideProjectBimModels(projectId: string, sourceModelId?: string) {
  return sourceModelId ? deleteProjectCollectionDocsByField(projectId, "elements", "sourceModelId", sourceModelId) : clearProjectCollection(projectId, "elements");
}
export const getProjectBimSnapshot = (projectId: string) => getProjectCollectionSnapshot(projectId, "elements");
