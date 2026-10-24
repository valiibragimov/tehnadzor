import { currentAssessmentStatus } from "../../features/inspections/assessment-status.js";
import {
  getInspectionRegistrySnapshot,
  getProjectDocSnapshot,
  persistInspectionAnalyticsIfCurrent
} from "../repositories/firestore-repository.js";

const ANALYTICS_MODULE_KEYS = ["geo", "reinforcement", "geometry", "strength"];

function normalizeLowerText(value) {
  return String(value == null ? "" : value).trim().toLocaleLowerCase("ru");
}

function normalizeModuleKey(value) {
  const normalized = normalizeLowerText(value).replace(/\s+/g, "");
  if (!normalized) return "";

  if (normalized === "geo" || normalized.includes("геод")) return "geo";
  if (normalized === "reinforcement" || normalized === "reinf" || normalized.includes("арм")) {
    return "reinforcement";
  }
  if (normalized === "geometry" || normalized === "geom" || normalized.includes("геометр")) {
    return "geometry";
  }
  if (normalized === "strength" || normalized.includes("проч")) return "strength";
  return "";
}

function sourceCollectionToModuleKey(value) {
  const normalized = normalizeLowerText(value).replace(/\s+/g, "");
  if (!normalized) return "";
  if (normalized === "geonodes") return "geo";
  if (normalized === "reinfchecks") return "reinforcement";
  if (normalized === "geomchecks") return "geometry";
  if (normalized === "strengthchecks") return "strength";
  return "";
}

function normalizeInspectionStatus(value) {
  const normalized = normalizeLowerText(value);
  if (!normalized) return null;

  if (normalized === "ok" || normalized === "внорме" || normalized === "соответствует") {
    return "ok";
  }

  if (
    normalized === "exceeded" ||
    normalized === "bad" ||
    normalized === "превышено" ||
    normalized === "ошибка" ||
    normalized === "недобор" ||
    normalized === "fail" ||
    normalized === "failed"
  ) {
    return "exceeded";
  }

  return null;
}

function parseTimestampMs(value) {
  if (value == null) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 0 && value < 1e12) return Math.round(value * 1000);
    return Math.round(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      if (asNumber > 0 && asNumber < 1e12) return Math.round(asNumber * 1000);
      return Math.round(asNumber);
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value?.toMillis === "function") {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    const ms = date instanceof Date ? date.getTime() : Number.NaN;
    return Number.isFinite(ms) ? ms : null;
  }

  if (
    typeof value === "object" &&
    Number.isFinite(value.seconds) &&
    Number.isFinite(value.nanoseconds)
  ) {
    return Math.round(value.seconds * 1000 + value.nanoseconds / 1e6);
  }

  return null;
}

function resolveInspectionTimestampMs(record) {
  if (!record || typeof record !== "object") return null;

  const candidates = [
    record.createdAt,
    record.timestamp,
    record.ts,
    record.updatedAt,
    record.checkedAt,
    record.date
  ];

  for (const candidate of candidates) {
    const ms = parseTimestampMs(candidate);
    if (ms != null) return ms;
  }

  return null;
}

function resolveInspectionId(record) {
  const candidates = [
    record?.sourceId,
    record?.sourceDocId,
    record?._docId,
    record?.id
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (normalized) return normalized;
  }

  return "";
}

function resolveInspectionModuleKey(record) {
  const fromModuleKey = normalizeModuleKey(record?.moduleKey);
  if (fromModuleKey) return fromModuleKey;

  const fromSourceCollection = sourceCollectionToModuleKey(record?.sourceCollection);
  if (fromSourceCollection) return fromSourceCollection;

  return normalizeModuleKey(record?.module || record?.moduleName || record?.section);
}

function createAggregate() {
  return {
    geo: { total: 0, exceeded: 0, lastCheck: null, ids: new Set() },
    reinforcement: { total: 0, exceeded: 0, lastCheck: null, ids: new Set() },
    geometry: { total: 0, exceeded: 0, lastCheck: null, ids: new Set() },
    strength: { total: 0, exceeded: 0, lastCheck: null, ids: new Set() }
  };
}

function addInspectionToAggregate(aggregate, inspection) {
  const moduleKey = resolveInspectionModuleKey(inspection);
  if (!moduleKey || !aggregate[moduleKey]) return;

  const normalizedStatus = currentAssessmentStatus(inspection);
  if (!normalizedStatus) return;

  const bucket = aggregate[moduleKey];
  const recordId = resolveInspectionId(inspection);
  if (recordId && bucket.ids.has(recordId)) return;
  if (recordId) bucket.ids.add(recordId);

  bucket.total += 1;
  if (normalizedStatus === "exceeded") {
    bucket.exceeded += 1;
  }

  const timestampMs = resolveInspectionTimestampMs(inspection);
  if (Number.isFinite(timestampMs) && (bucket.lastCheck == null || timestampMs > bucket.lastCheck)) {
    bucket.lastCheck = timestampMs;
  }
}

function finalizeAggregate(aggregate) {
  const byModule = {};
  let totalChecks = 0;
  let exceededCount = 0;
  let lastInspectionAt = null;

  ANALYTICS_MODULE_KEYS.forEach((moduleKey) => {
    const bucket = aggregate[moduleKey] || { total: 0, exceeded: 0, lastCheck: null };
    const total = bucket.total || 0;
    const exceeded = bucket.exceeded || 0;
    const status = total === 0 ? "empty" : (exceeded > 0 ? "exceeded" : "ok");
    const lastCheck = Number.isFinite(bucket.lastCheck) ? bucket.lastCheck : null;

    byModule[moduleKey] = {
      status,
      total,
      exceeded,
      lastCheck
    };

    totalChecks += total;
    exceededCount += exceeded;
    if (lastCheck != null && (lastInspectionAt == null || lastCheck > lastInspectionAt)) {
      lastInspectionAt = lastCheck;
    }
  });

  return {
    totalChecks,
    exceededCount,
    lastInspectionAt,
    byModule,
    source: "inspections",
    version: 1,
    evaluationSchemaVersion: 2,
    updatedAt: Date.now()
  };
}

async function recomputeFromProject(projectId: string, initialProject: Awaited<ReturnType<typeof getProjectDocSnapshot>>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const project = attempt === 0 ? initialProject : await getProjectDocSnapshot(projectId);
    const revision = project.data()?.inspectionSync?.revision || "";
    const inspectionsSnapshot = await getInspectionRegistrySnapshot(projectId);
    const aggregate = createAggregate();
    inspectionsSnapshot.forEach((inspectionDoc) => {
      addInspectionToAggregate(aggregate, {
        ...inspectionDoc.data(),
        _docId: inspectionDoc.id
      });
    });
    const analyticsCurrent = finalizeAggregate(aggregate);
    if (await persistInspectionAnalyticsIfCurrent(projectId, revision, analyticsCurrent)) return analyticsCurrent;
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
