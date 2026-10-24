import { getConstructionModuleBehavior, normalizeConstructionKey } from "../../../app/construction.js";
import { compareMeasurement, summarizeMeasurements } from "../acceptance.js";
import { getInspectionStatus } from "../../../app/inspection-registry.js";
import type {
  ReinforcementCheckRecord,
  ReinforcementEvaluation,
  ReinforcementJournalPayload,
  ReinforcementMeasurements
} from "./types.js";

function parseMeasurement(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function isStrictMeasurementMatch(
  project: unknown,
  actual: unknown
) {
  const projectValue = parseMeasurement(project);
  const actualValue = parseMeasurement(actual);
  if (projectValue == null || actualValue == null) return null;
  return Math.abs(actualValue - projectValue) === 0;
}

export function isMeasurementWithinTolerance(
  project: unknown,
  actual: unknown,
  tolerance: number
) {
  const projectValue = parseMeasurement(project);
  const actualValue = parseMeasurement(actual);
  if (projectValue == null || actualValue == null) return null;
  return Math.abs(actualValue - projectValue) <= tolerance;
}

export function evaluateReinforcementCheck(check: ReinforcementCheckRecord): ReinforcementEvaluation {
  const applicability = getInspectionStatus(normalizeConstructionKey(check.construction || check.constructionType, ""), "reinforcement", check.constructionSubtype || "", check.constructionPileElement || "");
  if (applicability !== "object") return { ...summarizeMeasurements([]), hasAnyData: false, hasRequiredData: false, allOk: false };
  const items = check.columns || check.beams || check.walls || [check];
  const includeHoops = !!check.columns || !!check.beams || getConstructionModuleBehavior(check.construction, "reinforcement", check.constructionSubtype || "", check.constructionPileElement || "").showReinforcementHoopsStep === true;
  const results = items.flatMap(item => {
    const diameter = Number(item.projDia) > 0 && Number(item.factDia) > 0 ? isStrictMeasurementMatch(item.projDia, item.factDia) : null;
    const checks: Array<ReturnType<typeof compareMeasurement>> = [
      diameter == null ? "incomplete" : diameter ? "ok" : "exceeded",
      ...(check.construction === "pile_grillage" && check.constructionPileElement === "pile" ? [] : [compareMeasurement(item.projStep, item.factStep, "step", check.acceptanceCriteria)]),
      compareMeasurement(item.projCover, item.factCover, "cover", check.acceptanceCriteria)
    ];
    if (includeHoops) checks.push(compareMeasurement(item.projHoopsStep, item.factHoopsStep, "hoopsStep", check.acceptanceCriteria));
    return checks;
  });
  const result = summarizeMeasurements(results);
  return { ...result, hasAnyData: results.some(value => value !== "incomplete"),
    hasRequiredData: results.length > 0 && !results.includes("incomplete"), allOk: result.status === "ok" };
}

function appendJournalDifferences(details: string[], measurements: ReinforcementMeasurements, check: ReinforcementCheckRecord) {
  if (isStrictMeasurementMatch(measurements.projDia, measurements.factDia) === false) {
    details.push(`Диаметр: ${measurements.projDia}→${measurements.factDia}`);
  }
  for (const [project, actual, key, label] of [
    [measurements.projStep, measurements.factStep, "step", "Шаг"],
    [measurements.projCover, measurements.factCover, "cover", "Защитный слой"],
    [measurements.projHoopsStep, measurements.factHoopsStep, "hoopsStep", "Шаг хомутов"]
  ] as const) {
    if (compareMeasurement(project, actual, key, check.acceptanceCriteria) === "exceeded") details.push(`${label}: ${project}→${actual}`);
  }
}

export function buildReinforcementJournalPayload(
  check: ReinforcementCheckRecord,
  sourceId?: string
): ReinforcementJournalPayload {
  const evaluation = evaluateReinforcementCheck(check);
  const context = [
    check.floor ? `Этаж ${check.floor}` : "",
    check.stairName || "",
    check.location || ""
  ].filter(Boolean).join(", ") || "Армирование";
  const details: string[] = [];
  (check.columns || check.beams || check.walls || [check]).forEach(item => appendJournalDifferences(details, item, check));
  return {
    evaluationSchemaVersion: 2,
    module: "Армирование",
    status: evaluation.status === "ok" ? "ok" : evaluation.status === "empty" ? "empty" : "exceeded",
    context,
    details: details.join("; ") ||
      evaluation.summaryText ||
      "Проверка армирования",
    construction: String(check.construction || ""),
    ...(sourceId ? { sourceId } : {})
  };
}
