import { normalizeConstructionKey } from "../../../app/construction.js";
import { getInspectionStatus } from "../../../app/inspection-registry.js";
import type {
  StrengthCheckRecord,
  StrengthEvaluation,
  StrengthJournalPayload,
  StrengthResultSeries
} from "./types.js";

function numericValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseConcreteStrengthValue(value: unknown) {
  if (!value) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const normalized = String(value).trim();
  const classMatch = normalized.match(/^[BВ](\d+(?:[.,]\d+)?)(?:\([MМ]\d+\))?$/iu);
  if (classMatch) return Number(classMatch[1].replace(",", "."));

  // A historical M grade cannot be converted into an acceptance class by a fixed ratio.
  return null;
}

// Kept for callers of older clients; age alone is not an acceptance criterion.
export function getNormativeStrength(_markValue: unknown, _daysValue: unknown): number | null {
  return null;
}

export function evaluateStrengthCheck(check: Partial<StrengthCheckRecord>): StrengthEvaluation {
  const markValue = parseConcreteStrengthValue(check.mark) ?? parseConcreteStrengthValue(check.markValue);
  const days = numericValue(check.days);
  const actual = numericValue(check.actual);
  const assessment = check.assessment;
  const applicable = getInspectionStatus(normalizeConstructionKey(check.construction || check.constructionType, ""), "strength", check.constructionSubtype || "", check.constructionPileElement || "") === "object";
  const hasActual = actual != null && actual > 0;
  const hasRequiredData = markValue != null && markValue > 0 && days != null && days > 0;
  const confirmed = applicable && hasRequiredData && hasActual && assessment?.confirmed === true &&
    !!assessment.reference?.trim() && !!assessment.responsible?.trim() &&
    /^\d{4}-\d{2}-\d{2}$/u.test(assessment.date || "") && Number.isFinite(Date.parse(assessment.date)) && new Date(assessment.date).toISOString().slice(0, 10) === assessment.date &&
    ["conforms", "nonconforms"].includes(assessment.verdict || "");
  const isCompliant = confirmed ? assessment?.verdict === "conforms" : null;
  return {
    status: isCompliant == null ? "empty" : isCompliant ? "ok" : "exceeded",
    summaryText: isCompliant == null ? "Требует проверки" : isCompliant ? "в норме" : "превышено",
    markValue, days, actual, normativeStrength: null, hasRequiredData, hasActual, isCompliant,
    normativePercent: null,
    actualPercent: markValue && actual != null ? actual / markValue * 100 : null
  };
}

export function buildStrengthResultSeries(
  markValue: unknown,
  daysValue: unknown,
  actualValue: unknown
): StrengthResultSeries {
  const mark = numericValue(markValue);
  const days = numericValue(daysValue);
  const actual = numericValue(actualValue);
  if (mark == null || mark <= 0 || days == null || days <= 0) {
    return { labels: [], normative: [], actual: [] };
  }

  return { labels: [days], normative: [], actual: [actual] };
}

export function buildStrengthJournalPayload(
  check: StrengthCheckRecord,
  options: {
    sourceId?: string | null;
    runtimeStatus?: boolean;
  } = {}
): StrengthJournalPayload | null {
  const evaluation = evaluateStrengthCheck(check);
  if (
    !evaluation.hasRequiredData ||
    !evaluation.hasActual ||
    evaluation.isCompliant == null ||
    evaluation.actual == null
  ) {
    return null;
  }

  const contextParts: string[] = [];
  if (check.floor) contextParts.push(`Этаж ${check.floor}`);
  if (check.days) contextParts.push(`день=${check.days}`);
  const payload: StrengthJournalPayload = {
    evaluationSchemaVersion: 2,
    module: "Прочность",
    status: options.runtimeStatus
      ? evaluation.isCompliant
        ? "соответствует"
        : "недобор"
      : evaluation.isCompliant
        ? "ok"
        : "exceeded",
    context: contextParts.join(", ") || "Прочность бетона",
    details:
      `основание=${check.assessment?.reference || ""}; ` +
      `факт=${evaluation.actual.toFixed(1)} МПа`,
    construction: String(check.construction || "")
  };
  if (options.sourceId) payload.sourceId = options.sourceId;
  return payload;
}
