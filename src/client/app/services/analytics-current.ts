import { createAggregate, addInspectionToAggregate, finalizeAggregate } from "../inspection-analytics.js";
import {
  getInspectionRegistrySnapshot,
  getProjectDocSnapshot,
  persistInspectionAnalyticsIfCurrent
} from "../repositories/firestore-repository.js";

async function recomputeFromProject(projectId: string, initialProject: Awaited<ReturnType<typeof getProjectDocSnapshot>>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const project = attempt === 0 ? initialProject : await getProjectDocSnapshot(projectId);
    const revision = project.data()?.inspectionSync?.revision || "";
    const inspectionsSnapshot = await getInspectionRegistrySnapshot(projectId);
    const aggregate = createAggregate();
    let targetedIdentities = true;
    inspectionsSnapshot.forEach((inspectionDoc) => {
      const data = inspectionDoc.data();
      // Legacy numeric/whitespace identities deduplicate after normalization,
      // but cannot be exhaustively found with the exact-match alias queries.
      for (const value of [data.sourceId, data.sourceDocId]) {
        if (value && (typeof value !== "string" || value !== value.trim())) targetedIdentities = false;
      }
      if (inspectionDoc.id !== inspectionDoc.id.trim()) targetedIdentities = false;
      addInspectionToAggregate(aggregate, {
        ...data,
        _docId: inspectionDoc.id
      });
    });
    const analyticsCurrent = finalizeAggregate(aggregate);
    if (await persistInspectionAnalyticsIfCurrent(projectId, revision, analyticsCurrent, targetedIdentities)) return analyticsCurrent;
  }
  throw new Error("Inspection analytics changed during refresh; retry required.");
}

export async function recomputeAndPersistProjectAnalyticsCurrent(projectId) {
  if (!projectId) return null;
  return recomputeFromProject(projectId, await getProjectDocSnapshot(projectId));
}

const pendingRefreshes = new Map<string, {
  promise: ReturnType<typeof recomputeAndPersistProjectAnalyticsCurrent>;
  requested: boolean;
}>();

export function refreshPendingProjectAnalytics(projectId: string): ReturnType<typeof recomputeAndPersistProjectAnalyticsCurrent> {
  if (!projectId) return Promise.resolve(null);
  const active = pendingRefreshes.get(projectId);
  if (active) {
    active.requested = true;
    return active.promise;
  }
  const refresh = { promise: Promise.resolve(null) as ReturnType<typeof recomputeAndPersistProjectAnalyticsCurrent>, requested: true };
  pendingRefreshes.set(projectId, refresh);
  refresh.promise = (async () => {
    let result = null;
    try {
      do {
        refresh.requested = false;
        const project = await getProjectDocSnapshot(projectId);
        if (project.data()?.inspectionSync?.pending) result = await recomputeFromProject(projectId, project);
      } while (refresh.requested);
      return result;
    } catch (error) {
      // Source and registry are committed; keep the durable marker for retry.
      console.warn("[Inspections] Analytics refresh remains pending:", error);
      return null;
    } finally {
      // Remove before settling the promise: a later save must start a fresh check.
      pendingRefreshes.delete(projectId);
    }
  })();
  return refresh.promise;
}
