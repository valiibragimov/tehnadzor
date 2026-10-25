import { currentAssessmentStatus } from "../../../features/inspections/assessment-status.js";
import { getConfirmedGeoTolerance } from "../../../features/inspections/geodesy/evaluation.js";
import { TOLERANCES } from "../../../config.js";
import {
  calculateQualityIndex,
  coefficientOfVariation,
  getGrade,
  inferConstructionFromText,
  inferModuleFromText,
  mean,
  median,
  moduleKeyToModuleName,
  moduleKeyToSourceCollection,
  normalizeCheckStatus,
  normalizeConstructionName,
  normalizeInspectionModuleKey,
  normalizeModuleName,
  normalizeSourceCollectionName,
  parseNumber,
  pushMeasurement,
  pushOpeningMeasurements,
  resolveGeoConstruction,
  resolveGeomConstruction,
  resolveReinfConstruction,
  sourceCollectionToModuleKey,
  stdDev,
  summarizeMeasurementBreakdown
} from "./analytics-core.js";

interface AnalyticsMeasurementDefaults {
  moduleName?: string;
  construction?: string;
}

export interface AnalyticsContractor {
  contractorGroupKey: string;
  contractorId: string;
  contractorName: string;
  contractorUnknown: boolean;
  objectsCount: number;
  totalMeasurements: number;
  avgMeanDeviationPercent: number;
  avgCompliancePercent: number;
  avgQualityIndex: number;
  confidence: string;
  grade: string;
  rank?: number | null;
}

export const MIN_MEASUREMENTS = 5;
export const MIN_TREND_CHECKS = 2;
export const LEGACY_SOURCE_COLLECTIONS = ["geoNodes", "reinfChecks", "geomChecks", "strengthChecks"];

function resolveInspectionModuleKey(inspection) {
  if (!inspection || typeof inspection !== "object") return "";

  const fromModuleKey = normalizeInspectionModuleKey(inspection.moduleKey);
  if (fromModuleKey) return fromModuleKey;

  const fromSourceCollection = sourceCollectionToModuleKey(inspection.sourceCollection);
  if (fromSourceCollection) return fromSourceCollection;

  return normalizeInspectionModuleKey(
    pickFirstValue(inspection, ["module", "moduleName", "section"])
  );
}

export function resolveInspectionSourceCollection(inspection) {
  const fromSourceCollection = normalizeSourceCollectionName(inspection?.sourceCollection);
  if (fromSourceCollection) return fromSourceCollection;

  const moduleKey = resolveInspectionModuleKey(inspection);
  return moduleKeyToSourceCollection(moduleKey);
}

export function isInspectionSupportedForAnalytics(inspection) {
  return Boolean(resolveInspectionModuleKey(inspection));
}

export function resolveInspectionSourceId(inspection) {
  const value = pickFirstValue(inspection, ["sourceId", "sourceDocId", "_docId", "id"]);
  const normalized = String(value || "").trim();
  return normalized || "";
}

export function inspectionNeedsLegacySource(inspection) {
  const moduleKey = resolveInspectionModuleKey(inspection);
  if (moduleKey !== "geo" && moduleKey !== "reinforcement" && moduleKey !== "geometry") {
    return false;
  }

  const moduleName = moduleKeyToModuleName(moduleKey);
  const constructionName = normalizeConstructionName(
    pickFirstValue(inspection, ["construction", "constructionType", "elementType"]),
    "Не указано"
  );
  const measurements = extractMeasurements(inspection, {
    moduleName,
    construction: constructionName
  });
  return measurements.length === 0;
}

function buildSourceDocMap(items) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || typeof item !== "object") return;
    const ids = [
      item._docId,
      item.id,
      item.sourceId,
      item.sourceDocId
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    ids.forEach((id) => {
      if (!map.has(id)) {
        map.set(id, item);
      }
    });
  });
  return map;
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

  if (
    typeof value === "object" &&
    Number.isFinite(value.seconds) &&
    Number.isFinite(value.nanoseconds)
  ) {
    return Math.round(value.seconds * 1000 + value.nanoseconds / 1e6);
  }

  return null;
}

function resolveCheckTimestampMs(record) {
  if (!record || typeof record !== "object") return null;

  const direct = pickFirstValue(record, [
    "createdAt",
    "timestamp",
    "ts",
    "updatedAt",
    "checkedAt",
    "date"
  ]);

  const directMs = parseTimestampMs(direct);
  if (directMs != null) return directMs;

  const docId = String(record._docId || "").trim();
  if (docId) {
    const tail13 = docId.match(/(\d{13})(?!.*\d)/);
    if (tail13) {
      const ms = Number(tail13[1]);
      if (Number.isFinite(ms)) return ms;
    }
    const tail10 = docId.match(/(\d{10})(?!.*\d)/);
    if (tail10) {
      const seconds = Number(tail10[1]);
      if (Number.isFinite(seconds)) return seconds * 1000;
    }
  }

  const docIdFallbackTried = !!docId;
  if (docIdFallbackTried) {
    console.warn("[analytics] Trend point skipped: _docId fallback did not yield a timestamp.", {
      docId,
      recordKeys: Object.keys(record)
    });
  }

  return null;
}

function formatTrendLabel(timestampMs) {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function calculateCheckMetricsFromRatios(ratios) {
  const safeRatios = Array.isArray(ratios)
    ? ratios.filter((value) => Number.isFinite(value) && value >= 0)
    : [];

  const measurementCount = safeRatios.length;
  if (!measurementCount) {
    return {
      measurementCount: 0,
      violations: 0,
      qualityIndex: null,
      compliancePercent: 0
    };
  }

  const meanRatio = mean(safeRatios);
  const stdRatio = stdDev(safeRatios);
  const cv = coefficientOfVariation(meanRatio, stdRatio);
  const inToleranceCount = safeRatios.filter((value) => value <= 1).length;
  const criticalCount = safeRatios.filter((value) => value > 2).length;
  const violations = safeRatios.filter((value) => value > 1).length;
  const compliancePercent = (inToleranceCount / measurementCount) * 100;
  const criticalShare = criticalCount / measurementCount;

  return {
    measurementCount,
    violations,
    qualityIndex: calculateQualityIndex({
      compliancePercent,
      cv,
      criticalShare
    }),
    compliancePercent
  };
}

function buildTrendPoint({
  source,
  moduleName,
  construction,
  measurements
}) {
  const timestampMs = resolveCheckTimestampMs(source);
  if (timestampMs == null) return null;

  const normalizedModule = normalizeModuleName(moduleName, "Прочее");
  const normalizedConstruction = normalizeConstructionName(construction, "Не указано");
  const status = currentAssessmentStatus(source);
  if (!status) return null;

  const ratios = Array.isArray(measurements)
    ? measurements.map((item) => Number(item?.relativeDeviation)).filter((value) => Number.isFinite(value))
    : [];

  const metrics = calculateCheckMetricsFromRatios(ratios);
  let qualityIndex = metrics.qualityIndex;
  let violations = metrics.violations;
  let measurementCount = metrics.measurementCount;
  let compliancePercent = metrics.compliancePercent;

  if (measurementCount === 0 && status) {
    qualityIndex = status === "ok" ? 100 : 0;
    violations = status === "ok" ? 0 : 1;
    measurementCount = 1;
    compliancePercent = status === "ok" ? 100 : 0;
  }

  if (qualityIndex == null) return null;

  return {
    timestampMs,
    module: normalizedModule,
    construction: normalizedConstruction,
    qualityIndex,
    violations,
    measurementCount,
    compliancePercent
  };
}

function pickFirstValue(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] != null) {
      return obj[key];
    }
  }
  return null;
}

export function normalizeContractorInfo(data, projectId) {
  const rawId = String(data.contractorId || data.contractor?.id || data.contractorUid || "").trim();
  const rawName = String(data.contractorName || data.contractor?.name || "").trim();

  if (rawId) {
    return {
      contractorId: rawId,
      contractorName: rawName || "Подрядчик",
      contractorGroupKey: `id:${rawId}`,
      contractorUnknown: false
    };
  }

  if (rawName) {
    const key = rawName.toLocaleLowerCase("ru");
    return {
      contractorId: "",
      contractorName: rawName,
      contractorGroupKey: `name:${key}`,
      contractorUnknown: false
    };
  }

  return {
    contractorId: "",
    contractorName: "Не указан",
    contractorGroupKey: `unknown:${projectId}`,
    contractorUnknown: true
  };
}

function normalizeMeasurement(measurement, defaults: AnalyticsMeasurementDefaults = {}) {
  if (!measurement || typeof measurement !== "object") return null;

  const designValue = parseNumber(
    pickFirstValue(measurement, ["designValue", "projectValue", "targetValue", "normValue"])
  );
  const actualValue = parseNumber(
    pickFirstValue(measurement, ["actualValue", "factValue", "measuredValue", "value"])
  );
  const tolerance = parseNumber(
    pickFirstValue(measurement, ["tolerance", "tol", "allowedDeviation", "limit"])
  );

  if (designValue == null || actualValue == null || tolerance == null || tolerance <= 0) {
    return null;
  }

  const parameterName = pickFirstValue(measurement, ["parameterName", "parameter", "name"]) || "Параметр";
  const moduleCandidate = pickFirstValue(measurement, ["moduleName", "module", "moduleKey", "section"]);
  const constructionCandidate = pickFirstValue(measurement, ["construction", "constructionType", "elementType"]);
  const fallbackModule = inferModuleFromText(parameterName, normalizeModuleName(defaults.moduleName, "Прочее"));
  const fallbackConstruction = inferConstructionFromText(
    parameterName,
    normalizeConstructionName(defaults.construction, "Не указано")
  );

  return {
    parameterName,
    unit: pickFirstValue(measurement, ["unit", "measureUnit"]) || "",
    designValue,
    actualValue,
    tolerance,
    relativeDeviation: Math.abs(actualValue - designValue) / tolerance,
    moduleName: normalizeModuleName(moduleCandidate, fallbackModule),
    construction: normalizeConstructionName(constructionCandidate, fallbackConstruction)
  };
}

function extractMeasurements(inspectionData, defaults: AnalyticsMeasurementDefaults = {}) {
  if (!inspectionData || inspectionData.evaluationSchemaVersion !== 2) return [];

  const candidates = [
    inspectionData.measurements,
    inspectionData.measurementList,
    inspectionData.results?.measurements,
    inspectionData.payload?.measurements,
    inspectionData.data?.measurements
  ];

  const extracted = [];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      extracted.push(...candidate);
      continue;
    }

    if (candidate && typeof candidate === "object") {
      extracted.push(...Object.values(candidate));
    }
  }

  return extracted
    .map((measurement) => normalizeMeasurement(measurement, defaults))
    .filter(Boolean);
}

function extractGeoNodeMeasurements(geoNode) {
  const measurements = [];
  if (!geoNode || typeof geoNode !== "object" || geoNode.coordinateUnit !== "m" || !currentAssessmentStatus(geoNode)) return measurements;

  const tolXY = getConfirmedGeoTolerance(geoNode.acceptanceCriteria, "geoPlan");
  const tolH = getConfirmedGeoTolerance(geoNode.acceptanceCriteria, "geoHeight");
  const type = geoNode.type || "";
  const defaultConstruction = resolveGeoConstruction(geoNode);

  const toleranceAt = (bounds, project, actual) => typeof bounds === "number" ? bounds : parseNumber(actual) < parseNumber(project) ? Math.abs(bounds.min) : Math.abs(bounds.max);
  const addXY = (prefix, projX, factX, projY, factY, constructionName = defaultConstruction) => {
    pushMeasurement(measurements, {
      parameterName: `${prefix} X`,
      designValue: parseNumber(projX) == null ? null : parseNumber(projX) * 1000,
      actualValue: parseNumber(factX) == null ? null : parseNumber(factX) * 1000,
      tolerance: toleranceAt(tolXY, projX, factX),
      moduleName: "Геодезия",
      construction: constructionName
    });
    pushMeasurement(measurements, {
      parameterName: `${prefix} Y`,
      designValue: parseNumber(projY) == null ? null : parseNumber(projY) * 1000,
      actualValue: parseNumber(factY) == null ? null : parseNumber(factY) * 1000,
      tolerance: toleranceAt(tolXY, projY, factY),
      moduleName: "Геодезия",
      construction: constructionName
    });
  };

  if (type === "columns" && Array.isArray(geoNode.columns)) {
    geoNode.columns.forEach((column, index) => {
      addXY(`Колонна ${index + 1}`, column?.projX, column?.factX, column?.projY, column?.factY, "Колонна");
    });
    return measurements;
  }

  if ((type === "walls" || type === "beams") && Array.isArray(geoNode[type])) {
    geoNode[type].forEach((item, index) => {
      const baseLabel = type === "walls" ? `Стена ${index + 1}` : `Балка ${index + 1}`;
      const constructionName = type === "walls" ? "Стена" : "Балка";

      addXY(`${baseLabel}, т.1`, item?.projX_num_let1 ?? item?.projX_let_num1, item?.factX_num_let1 ?? item?.factX_let_num1, item?.projY_num_let1 ?? item?.projY_let_num1, item?.factY_num_let1 ?? item?.factY_let_num1, constructionName);
      addXY(`${baseLabel}, т.2`, item?.projX_num_let2 ?? item?.projX_let_num2, item?.factX_num_let2 ?? item?.factX_let_num2, item?.projY_num_let2 ?? item?.projY_let_num2, item?.factY_num_let2 ?? item?.factY_let_num2, constructionName);
    });
    return measurements;
  }

  addXY("Узел", geoNode.projX, geoNode.factX, geoNode.projY, geoNode.factY);
  pushMeasurement(measurements, {
    parameterName: "Узел H",
    designValue: parseNumber(geoNode.projH) == null ? null : parseNumber(geoNode.projH) * 1000,
    actualValue: parseNumber(geoNode.factH) == null ? null : parseNumber(geoNode.factH) * 1000,
    tolerance: toleranceAt(tolH, geoNode.projH, geoNode.factH),
    moduleName: "Геодезия",
    construction: defaultConstruction
  });

  return measurements;
}

function confirmedMetric(record, item, projectKey, actualKey, limitKey, label, moduleName) {
  if (!currentAssessmentStatus(record) || !record.acceptanceCriteria?.confirmed || !record.acceptanceCriteria.reference) return null;
  const p = parseNumber(item[projectKey]), a = parseNumber(item[actualKey]);
  const bounds = record.acceptanceCriteria.limits[limitKey];
  if (p == null || a == null || bounds?.min == null || bounds.max == null || bounds.min > bounds.max) return null;
  const tolerance = a < p ? Math.abs(bounds.min) : Math.abs(bounds.max);
  return normalizeMeasurement({ parameterName: label, designValue: p, actualValue: a, tolerance, moduleName, construction: record.construction, unit: "мм" });
}
function extractReinfMeasurements(check) {
  const results = [];
  for (const item of check.columns || check.beams || check.walls || [check]) {
    for (const [project, actual, key, label] of [["projStep", "factStep", "step", "Шаг арматуры"], ["projCover", "factCover", "cover", "Защитный слой"], ["projHoopsStep", "factHoopsStep", "hoopsStep", "Шаг хомутов"]]) {
      const result = confirmedMetric(check, item, project, actual, key, label, "Армирование");
      if (result) results.push(result);
    }
  }
  return results;
}

function extractGeomMeasurements(check) {
  const results = [];
  const rows = [check, ...(check.columns || []), ...(check.walls || []), ...(check.beams || []), ...(check.stairs || [])];
  for (const row of rows) {
    for (const [key, dimensions] of Object.entries(row.physicalDimensions || {}) as Array<[string, Record<string, unknown>]>) {
      const result = confirmedMetric(check, dimensions, "project", "actual", "dimensions", key, "Геометрия");
      if (result) results.push(result);
    }
    for (const [project, actual, key] of [["projPlateHeight", "factPlateHeight", "thickness"], ["projThick", "factThick", "thickness"], ["projSize1", "factSize1", "section"], ["projSize2", "factSize2", "section"], ["projBeamWidth", "factBeamWidth", "section"], ["projBeamHeight", "factBeamHeight", "section"], ["projFlightWidth", "factFlightWidth", "dimensions"], ["projStepHeight", "factStepHeight", "step"], ["projStepWidth", "factStepWidth", "step"]]) {
      const result = confirmedMetric(check, row, project, actual, key, key, "Геометрия");
      if (result) results.push(result);
    }
  }
  return results;
}

export function calculateProjectAnalytics(project, sources) {
  const scope = project.data().qualityIndexScope;
  const scopedIds = scope?.moduleKey === "geo" && Array.isArray(scope.sourceIds) ? new Set(scope.sourceIds) : null;
  const allMeasurements = [];
  const trendPoints = [];
  const inspections = Array.isArray(sources?.inspections) ? sources.inspections : [];
  const geoNodes = Array.isArray(sources?.geoNodes) ? sources.geoNodes : [];
  const reinfChecks = Array.isArray(sources?.reinfChecks) ? sources.reinfChecks : [];
  const geomChecks = Array.isArray(sources?.geomChecks) ? sources.geomChecks : [];
  const strengthChecks = Array.isArray(sources?.strengthChecks) ? sources.strengthChecks : [];
  const hasInspections = inspections.length > 0;

  const geoById = buildSourceDocMap(geoNodes);
  const reinfById = buildSourceDocMap(reinfChecks);
  const geomById = buildSourceDocMap(geomChecks);

  if (hasInspections) {
    inspections.forEach((inspection) => {
      const moduleKey = resolveInspectionModuleKey(inspection);
      if (!moduleKey || !currentAssessmentStatus(inspection)) return;

      const moduleName = moduleKeyToModuleName(moduleKey);
      const sourceId = resolveInspectionSourceId(inspection);
      if (scopedIds && (moduleKey !== "geo" || !scopedIds.has(sourceId))) return;
      let fallbackSource = null;
      if (sourceId) {
        if (moduleKey === "geo") fallbackSource = geoById.get(sourceId) || null;
        if (moduleKey === "reinforcement") fallbackSource = reinfById.get(sourceId) || null;
        if (moduleKey === "geometry") fallbackSource = geomById.get(sourceId) || null;
      }

      let constructionName = normalizeConstructionName(
        pickFirstValue(inspection, ["construction", "constructionType", "elementType"]),
        "Не указано"
      );
      if (constructionName === "Не указано" && fallbackSource) {
        if (moduleKey === "geo") constructionName = resolveGeoConstruction(fallbackSource);
        if (moduleKey === "reinforcement") constructionName = resolveReinfConstruction(fallbackSource);
        if (moduleKey === "geometry") constructionName = resolveGeomConstruction(fallbackSource);
      }

      let measurements = extractMeasurements(inspection, {
        moduleName,
        construction: constructionName
      });

      if (!measurements.length && fallbackSource) {
        if (moduleKey === "geo") measurements = extractGeoNodeMeasurements(fallbackSource);
        if (moduleKey === "reinforcement") measurements = extractReinfMeasurements(fallbackSource);
        if (moduleKey === "geometry") measurements = extractGeomMeasurements(fallbackSource);
      }

      allMeasurements.push(...measurements);

      const trendPointFromInspection = buildTrendPoint({
        source: inspection,
        moduleName,
        construction: constructionName,
        measurements
      });
      if (trendPointFromInspection) {
        trendPoints.push(trendPointFromInspection);
        return;
      }

      if (fallbackSource) {
        const trendPointFromFallback = buildTrendPoint({
          source: fallbackSource,
          moduleName,
          construction: constructionName,
          measurements
        });
        if (trendPointFromFallback) {
          trendPoints.push(trendPointFromFallback);
        }
      }
    });
  } else {
    geoNodes.forEach((node) => {
      if (scopedIds && !scopedIds.has(node.id)) return;
      const constructionName = resolveGeoConstruction(node);
      const measurements = extractGeoNodeMeasurements(node);
      allMeasurements.push(...measurements);

      const trendPoint = buildTrendPoint({
        source: node,
        moduleName: "Геодезия",
        construction: constructionName,
        measurements
      });
      if (trendPoint) trendPoints.push(trendPoint);
    });

    reinfChecks.forEach((check) => {
      if (scopedIds) return;
      const constructionName = resolveReinfConstruction(check);
      const measurements = extractReinfMeasurements(check);
      allMeasurements.push(...measurements);

      const trendPoint = buildTrendPoint({
        source: check,
        moduleName: "Армирование",
        construction: constructionName,
        measurements
      });
      if (trendPoint) trendPoints.push(trendPoint);
    });

    geomChecks.forEach((check) => {
      if (scopedIds) return;
      const constructionName = resolveGeomConstruction(check);
      const measurements = extractGeomMeasurements(check);
      allMeasurements.push(...measurements);

      const trendPoint = buildTrendPoint({
        source: check,
        moduleName: "Геометрия",
        construction: constructionName,
        measurements
      });
      if (trendPoint) trendPoints.push(trendPoint);
    });

    strengthChecks.forEach((check) => {
      const trendPoint = buildTrendPoint({
        source: check,
        moduleName: "Прочность",
        construction: normalizeConstructionName(check?.construction || check?.constructionType, "Не указано"),
        measurements: []
      });
      if (trendPoint) trendPoints.push(trendPoint);
    });
  }

  const ratios = allMeasurements.map((item) => item.relativeDeviation);
  const measurementCount = ratios.length;

  const meanRatio = mean(ratios);
  const medianRatio = median(ratios);
  const stdRatio = stdDev(ratios);
  const cv = coefficientOfVariation(meanRatio, stdRatio);

  const inToleranceCount = ratios.filter((value) => value <= 1).length;
  const smallCount = ratios.filter((value) => value > 1 && value <= 1.5).length;
  const largeCount = ratios.filter((value) => value > 1.5 && value <= 2).length;
  const criticalCount = ratios.filter((value) => value > 2).length;

  const compliancePercent = measurementCount > 0
    ? (inToleranceCount / measurementCount) * 100
    : 0;
  const criticalShare = measurementCount > 0
    ? criticalCount / measurementCount
    : 0;

  const qualityIndex = measurementCount > 0
    ? calculateQualityIndex({
      compliancePercent,
      cv,
      criticalShare
    })
    : 0;

  const data = project.data();
  const projectName = data.name?.trim() || `Проект ${project.id.slice(0, 8)}`;
  const contractorInfo = normalizeContractorInfo(data, project.id);

  const measurementRows = allMeasurements.map((measurement, index) => ({
    id: `m_${index}`,
    module: normalizeModuleName(measurement.moduleName, inferModuleFromText(measurement.parameterName, "Прочее")),
    construction: normalizeConstructionName(
      measurement.construction,
      inferConstructionFromText(measurement.parameterName, "Не указано")
    ),
    parameterName: measurement.parameterName || "Параметр",
    relativeDeviation: Number(measurement.relativeDeviation) || 0,
    exceeded: (Number(measurement.relativeDeviation) || 0) > 1
  }));

  const measurementsByConstruction = summarizeMeasurementBreakdown(measurementRows, "construction", "Не указано");
  const measurementsByModule = summarizeMeasurementBreakdown(measurementRows, "module", "Прочее");
  const exceededMeasurementsCount = measurementRows.filter((row) => row.exceeded).length;
  const qualityTrend = trendPoints
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .map((point, index) => ({
      ...point,
      pointId: `${project.id}_${index}`,
      label: formatTrendLabel(point.timestampMs)
    }));

  return {
    projectId: project.id,
    projectName,
    contractorId: contractorInfo.contractorId,
    contractorName: contractorInfo.contractorName,
    contractorGroupKey: contractorInfo.contractorGroupKey,
    contractorUnknown: contractorInfo.contractorUnknown,
    inspectionsCount: hasInspections
      ? inspections.length
      : (geoNodes.length + reinfChecks.length + geomChecks.length + strengthChecks.length),
    measurements: allMeasurements,
    measurementCount,
    meanDeviationRatio: meanRatio,
    medianDeviationRatio: medianRatio,
    stdDeviationRatio: stdRatio,
    cv,
    meanDeviationPercent: meanRatio * 100,
    medianDeviationPercent: medianRatio * 100,
    stdDeviationPercent: stdRatio * 100,
    compliancePercent,
    inToleranceCount,
    smallCount,
    largeCount,
    criticalCount,
    criticalShare,
    qualityScopeLabel: scopedIds ? String(scope.label || "Ограниченная выборка геодезических измерений; не оценка объекта в целом") : "",
    qualityIndex,
    measurementsByConstruction,
    measurementsByModule,
    drilldownMeasurementRows: measurementRows,
    drilldownMeasurementsCount: measurementRows.length,
    drilldownExceededCount: exceededMeasurementsCount,
    qualityTrend,
    grade: getGrade(qualityIndex),
    rank: null,
    hasData: measurementCount > 0
  };
}

export function rankProjects(projects) {
  const withData = projects
    .filter((project) => project.hasData && !project.qualityScopeLabel)
    .sort((a, b) => {
      if (a.meanDeviationRatio === b.meanDeviationRatio) {
        return b.qualityIndex - a.qualityIndex;
      }
      return a.meanDeviationRatio - b.meanDeviationRatio;
    });

  withData.forEach((project, index) => {
    project.rank = index + 1;
  });

  const withoutData = projects
    .filter((project) => !project.hasData || project.qualityScopeLabel)
    .sort((a, b) => a.projectName.localeCompare(b.projectName, "ru"));

  return {
    ranked: withData,
    fullList: [...withData, ...withoutData]
  };
}

export function calculateContractors(projectsWithData): AnalyticsContractor[] {
  const groups = new Map();

  projectsWithData.forEach((project) => {
    if (project.qualityScopeLabel) return;
    const key = project.contractorGroupKey || `unknown:${project.projectId}`;
    const weight = Math.max(1, project.measurementCount || 0);

    if (!groups.has(key)) {
      groups.set(key, {
        contractorGroupKey: key,
        contractorId: project.contractorId || "",
        contractorName: project.contractorName || "Не указан",
        contractorUnknown: Boolean(project.contractorUnknown),
        projects: [],
        weightedMeanDeviation: 0,
        weightedCompliance: 0,
        weightedQuality: 0,
        totalWeight: 0,
        totalMeasurements: 0
      });
    }

    const group = groups.get(key);
    group.projects.push(project);
    group.totalMeasurements += project.measurementCount || 0;
    group.totalWeight += weight;
    group.weightedMeanDeviation += project.meanDeviationPercent * weight;
    group.weightedCompliance += project.compliancePercent * weight;
    group.weightedQuality += project.qualityIndex * weight;
  });

  const contractors: AnalyticsContractor[] = [...groups.values()]
    .map((group) => {
      const denominator = group.totalWeight || 1;
      const meanDeviation = group.weightedMeanDeviation / denominator;
      const compliance = group.weightedCompliance / denominator;
      const quality = group.weightedQuality / denominator;

      let confidence = "низкая";
      if (group.totalMeasurements >= 120) {
        confidence = "высокая";
      } else if (group.totalMeasurements >= 40) {
        confidence = "средняя";
      }

      return {
        contractorGroupKey: group.contractorGroupKey,
        contractorId: group.contractorId,
        contractorName: group.contractorName,
        contractorUnknown: group.contractorUnknown,
        objectsCount: group.projects.length,
        totalMeasurements: group.totalMeasurements,
        avgMeanDeviationPercent: meanDeviation,
        avgCompliancePercent: compliance,
        avgQualityIndex: quality,
        confidence,
        grade: getGrade(quality)
      };
    })
    .sort((a, b) => {
      if (a.contractorUnknown !== b.contractorUnknown) {
        return a.contractorUnknown ? 1 : -1;
      }
      return a.avgMeanDeviationPercent - b.avgMeanDeviationPercent;
    });

  let rank = 0;
  contractors.forEach((contractor) => {
    if (!contractor.contractorUnknown) {
      rank += 1;
      contractor.rank = rank;
    } else {
      contractor.rank = null;
    }
  });

  return contractors;
}
