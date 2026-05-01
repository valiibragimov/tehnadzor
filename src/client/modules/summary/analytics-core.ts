import {
  getConstructionLabel,
  normalizeConstructionKey
} from "../../app/construction.js";

export const QUALITY_INDEX_WEIGHTS = Object.freeze({
  compliance: 0.74,
  stability: 0.26
});

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function parseNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/,/g, ".").replace(/\s+/g, "").trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOpeningSizes(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  const items = [];
  const chunks = raw
    .split(/[\n;,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const normalizedChunk = chunk.replace(/[xх]/gi, "×");
    const match = normalizedChunk.match(/^(-?\d+(?:[.,]\d+)?)\s*×\s*(-?\d+(?:[.,]\d+)?)$/);
    if (!match) return [];

    const width = parseNumber(match[1]);
    const height = parseNumber(match[2]);
    if (width == null || height == null) return [];

    items.push({ width, height });
  }

  items.sort((left, right) => {
    if (left.width !== right.width) return left.width - right.width;
    return left.height - right.height;
  });

  return items;
}

export function normalizeText(value) {
  return String(value ?? "").trim().toLocaleLowerCase("ru");
}

export function normalizeModuleName(value, fallback = "Прочее") {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;

  if (normalized.includes("геод") || normalized === "geo") return "Геодезия";
  if (normalized.includes("арм") || normalized.includes("reinf")) return "Армирование";
  if (normalized.includes("геометр") || normalized.includes("geometry")) return "Геометрия";
  if (normalized.includes("проч") || normalized.includes("strength")) return "Прочность";
  return fallback;
}

export function normalizeConstructionName(value, fallback = "Не указано") {
  const normalizedKey = normalizeConstructionKey(value);
  if (normalizedKey) {
    return getConstructionLabel(normalizedKey, fallback);
  }

  const normalized = normalizeText(value);
  if (!normalized) return fallback;

  if (normalized.includes("плит") || normalized.includes("slab") || normalized.includes("plate")) return "Плита";
  if (normalized.includes("колон") || normalized.includes("column")) return "Колонна";
  if (normalized.includes("стен") || normalized.includes("wall")) return "Стена";
  if (normalized.includes("лест") || normalized.includes("stair")) return "Лестница";
  if (normalized.includes("балк") || normalized.includes("beam")) return "Балка";
  return fallback;
}

export function inferConstructionFromText(text, fallback = "Не указано") {
  return normalizeConstructionName(text, fallback);
}

export function inferModuleFromText(text, fallback = "Прочее") {
  return normalizeModuleName(text, fallback);
}

export function summarizeMeasurementBreakdown(rows, field, emptyLabel) {
  const groups = new Map();
  const isUnclassifiedLabel = (value) => {
    const normalized = String(value || "").trim().toLocaleLowerCase("ru");
    return (
      normalized === String(emptyLabel || "").trim().toLocaleLowerCase("ru") ||
      normalized === "не указано" ||
      normalized === "прочее"
    );
  };

  rows.forEach((row) => {
    if (!row) return;
    const label = String(row[field] || emptyLabel).trim() || emptyLabel;
    if (!groups.has(label)) {
      groups.set(label, {
        label,
        totalMeasurements: 0,
        exceededMeasurements: 0,
        exceededRate: 0
      });
    }

    const group = groups.get(label);
    group.totalMeasurements += 1;
    if (row.exceeded) {
      group.exceededMeasurements += 1;
    }
  });

  const totalMeasurements = Array.isArray(rows) ? rows.length : 0;

  return [...groups.values()]
    .map((group) => {
      const unclassified = isUnclassifiedLabel(group.label);
      const rawLabel = group.label;
      const label = unclassified
        ? `Не классифицировано (${rawLabel})`
        : rawLabel;

      return {
        ...group,
        label,
        rawLabel,
        exceededRate: group.totalMeasurements > 0
          ? (group.exceededMeasurements / group.totalMeasurements) * 100
          : 0
      };
    })
    .filter((group) => {
      if (!isUnclassifiedLabel(group.rawLabel)) return true;
      if (totalMeasurements <= 0) return false;
      return (group.totalMeasurements / totalMeasurements) >= 0.05;
    })
    .sort((a, b) => {
      const aUnclassified = isUnclassifiedLabel(a.rawLabel);
      const bUnclassified = isUnclassifiedLabel(b.rawLabel);
      if (aUnclassified !== bUnclassified) return aUnclassified ? 1 : -1;
      if (a.exceededMeasurements !== b.exceededMeasurements) return b.exceededMeasurements - a.exceededMeasurements;
      if (a.exceededRate !== b.exceededRate) return b.exceededRate - a.exceededRate;
      if (a.totalMeasurements !== b.totalMeasurements) return b.totalMeasurements - a.totalMeasurements;
      return a.label.localeCompare(b.label, "ru");
    });
}

export function resolveGeoConstruction(geoNode) {
  const explicit = normalizeConstructionName(
    geoNode?.construction || geoNode?.constructionType,
    ""
  );
  if (explicit) return explicit;

  if (geoNode?.type === "columns") return "Колонна";
  if (geoNode?.type === "walls") return "Стена";
  if (geoNode?.type === "beams") return "Балка";
  return "Плита";
}

export function resolveReinfConstruction(reinfCheck) {
  const explicit = normalizeConstructionName(
    reinfCheck?.construction || reinfCheck?.constructionType,
    ""
  );
  if (explicit) return explicit;

  if (Array.isArray(reinfCheck?.columns) && reinfCheck.columns.length > 0) return "Колонна";
  if (Array.isArray(reinfCheck?.walls) && reinfCheck.walls.length > 0) return "Стена";
  if (Array.isArray(reinfCheck?.beams) && reinfCheck.beams.length > 0) return "Балка";
  if (Array.isArray(reinfCheck?.stairs) && reinfCheck.stairs.length > 0) return "Лестница";
  return "Не указано";
}

export function resolveGeomConstruction(geomCheck) {
  const explicit = normalizeConstructionName(
    geomCheck?.construction || geomCheck?.constructionType,
    ""
  );
  if (explicit) return explicit;

  if (Array.isArray(geomCheck?.columns) && geomCheck.columns.length > 0) return "Колонна";
  if (Array.isArray(geomCheck?.walls) && geomCheck.walls.length > 0) return "Стена";
  if (Array.isArray(geomCheck?.stairs) && geomCheck.stairs.length > 0) return "Лестница";
  if (Array.isArray(geomCheck?.beams) && geomCheck.beams.length > 0) return "Балка";
  if (geomCheck?.projPlateHeight != null || geomCheck?.factPlateHeight != null) return "Плита";
  if (geomCheck?.projThick != null || geomCheck?.factThick != null) return "Стена";
  return "Не указано";
}

export function pushMeasurement(target, {
  parameterName,
  designValue,
  actualValue,
  tolerance,
  unit = "мм",
  moduleName = "",
  construction = ""
}) {
  const design = parseNumber(designValue);
  const actual = parseNumber(actualValue);
  const tol = parseNumber(tolerance);

  if (design == null || actual == null || tol == null || tol <= 0) {
    return;
  }

  target.push({
    parameterName: parameterName || "Параметр",
    unit,
    designValue: design,
    actualValue: actual,
    tolerance: tol,
    relativeDeviation: Math.abs(actual - design) / tol,
    moduleName: normalizeModuleName(moduleName, "Прочее"),
    construction: normalizeConstructionName(
      construction,
      inferConstructionFromText(parameterName || "", "Не указано")
    )
  });
}

export function pushOpeningMeasurements(measurements, {
  parameterPrefix,
  designValue,
  actualValue,
  tolerance,
  moduleName,
  construction
}) {
  const projectItems = parseOpeningSizes(designValue);
  const actualItems = parseOpeningSizes(actualValue);
  if (!projectItems.length || projectItems.length !== actualItems.length) return;

  projectItems.forEach((projectItem, index) => {
    const actualItem = actualItems[index];
    pushMeasurement(measurements, {
      parameterName: `${parameterPrefix} ${index + 1} ширина`,
      designValue: projectItem.width,
      actualValue: actualItem.width,
      tolerance,
      moduleName,
      construction
    });
    pushMeasurement(measurements, {
      parameterName: `${parameterPrefix} ${index + 1} высота`,
      designValue: projectItem.height,
      actualValue: actualItem.height,
      tolerance,
      moduleName,
      construction
    });
  });
}

export function mean(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

export function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function stdDev(values) {
  if (!values || values.length === 0) return 0;
  const avg = mean(values);
  const variance = mean(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
}

export function coefficientOfVariation(meanValue, stdValue) {
  if (Math.abs(meanValue) < 1e-9) {
    if (Math.abs(stdValue) < 1e-9) return 0.0;
    return 1.0;
  }
  const cv = stdValue / meanValue;
  return Math.min(cv, 10.0);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatPercent(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

export function formatNumber(value, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

export function normalizeCheckStatus(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  if (normalized === "ok" || normalized === "внорме" || normalized === "соответствует") {
    return "ok";
  }

  if (
    normalized === "exceeded" ||
    normalized === "bad" ||
    normalized === "превышено" ||
    normalized === "недобор" ||
    normalized === "ошибка" ||
    normalized === "pending"
  ) {
    return normalized === "pending" ? null : "exceeded";
  }

  return null;
}

export function normalizeSourceCollectionName(value) {
  const normalized = normalizeText(value).replace(/\s+/g, "");
  if (!normalized) return "";
  if (normalized === "geonodes") return "geoNodes";
  if (normalized === "reinfchecks") return "reinfChecks";
  if (normalized === "geomchecks") return "geomChecks";
  if (normalized === "strengthchecks") return "strengthChecks";
  return "";
}

export function normalizeInspectionModuleKey(value) {
  const normalized = normalizeText(value).replace(/\s+/g, "");
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

export function sourceCollectionToModuleKey(sourceCollection) {
  const normalized = normalizeSourceCollectionName(sourceCollection);
  if (!normalized) return "";
  if (normalized === "geoNodes") return "geo";
  if (normalized === "reinfChecks") return "reinforcement";
  if (normalized === "geomChecks") return "geometry";
  if (normalized === "strengthChecks") return "strength";
  return "";
}

export function moduleKeyToSourceCollection(moduleKey) {
  const normalized = normalizeInspectionModuleKey(moduleKey);
  if (!normalized) return "";
  if (normalized === "geo") return "geoNodes";
  if (normalized === "reinforcement") return "reinfChecks";
  if (normalized === "geometry") return "geomChecks";
  if (normalized === "strength") return "strengthChecks";
  return "";
}

export function moduleKeyToModuleName(moduleKey) {
  const normalized = normalizeInspectionModuleKey(moduleKey);
  if (normalized === "geo") return "Геодезия";
  if (normalized === "reinforcement") return "Армирование";
  if (normalized === "geometry") return "Геометрия";
  if (normalized === "strength") return "Прочность";
  return "Прочее";
}

export function getGrade(score) {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "B+";
  if (score >= 75) return "B";
  if (score >= 65) return "C+";
  if (score >= 55) return "C";
  if (score >= 45) return "D";
  return "F";
}

export function getGradeClass(grade) {
  if (grade.startsWith("A")) return "analytics-grade-a";
  if (grade.startsWith("B")) return "analytics-grade-b";
  if (grade.startsWith("C")) return "analytics-grade-c";
  if (grade.startsWith("D")) return "analytics-grade-d";
  return "analytics-grade-f";
}

export function getQualityInterpretation(score) {
  if (score >= 90) return "Отличная стабильность и минимальные отклонения.";
  if (score >= 75) return "Хорошее качество с умеренной вариативностью.";
  if (score >= 60) return "Удовлетворительно, требуются корректирующие меры.";
  if (score >= 45) return "Низкая стабильность, необходим усиленный контроль.";
  return "Критический уровень качества. Требуется немедленная корректировка.";
}

function calculateStabilityScore(cv) {
  const safeCv = clamp(Number.isFinite(cv) ? cv : 0, 0, 10);
  return 100 / (1 + 0.25 * safeCv + 0.05 * safeCv * safeCv);
}

function calculateCriticalPenalty(criticalShare) {
  const safeCriticalShare = clamp(Number.isFinite(criticalShare) ? criticalShare : 0, 0, 1);
  return Math.min(60 * safeCriticalShare + 25 * safeCriticalShare * safeCriticalShare, 35);
}

export function calculateQualityIndex({ compliancePercent, cv, criticalShare }) {
  const compliance = clamp(Number.isFinite(compliancePercent) ? compliancePercent : 0, 0, 100);
  const stability = calculateStabilityScore(cv);
  const criticalPenalty = calculateCriticalPenalty(criticalShare);
  const index = (
    QUALITY_INDEX_WEIGHTS.compliance * compliance +
    QUALITY_INDEX_WEIGHTS.stability * stability -
    criticalPenalty
  );

  return clamp(index, 0, 100);
}
