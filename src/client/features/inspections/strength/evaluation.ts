import type {
  StrengthCheckRecord,
  StrengthEvaluation,
  StrengthResultSeries
} from "./types.js";

function numericValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number.parseFloat(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseConcreteStrengthValue(value: unknown) {
  if (!value) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const normalized = String(value).trim();
  const classMatch = normalized.match(/B(\d+(?:\.\d+)?)/iu);
  if (classMatch) return Number.parseFloat(classMatch[1]);

  const markMatch = normalized.match(/М(\d+(?:\.\d+)?)/iu);
  if (markMatch) return Number.parseFloat(markMatch[1]) / 7.5;

  const parsed = Number.parseFloat(normalized.replace(/[^\d.-]/gu, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getNormativeStrength(
  markValue: unknown,
  daysValue: unknown
) {
  const mark = numericValue(markValue);
  const days = numericValue(daysValue);
  if (mark == null || mark <= 0 || days == null || days <= 0) return null;
  if (days < 1) return mark * 0.2;
  if (days >= 28) return mark;
  return mark * Math.log10(days) / Math.log10(28);
}

export function evaluateStrengthCheck(
  check: Pick<StrengthCheckRecord, "mark" | "markValue" | "days" | "actual">
): StrengthEvaluation {
  const markValue =
    parseConcreteStrengthValue(check.mark) ??
    parseConcreteStrengthValue(check.markValue);
  const days = numericValue(check.days);
  const actual = numericValue(check.actual);
  const normativeStrength = getNormativeStrength(markValue, days);
  const hasRequiredData =
    markValue != null &&
    markValue > 0 &&
    days != null &&
    days > 0 &&
    normativeStrength != null;
  const hasActual = actual != null;

  if (!hasRequiredData || !hasActual) {
    return {
      status: "empty",
      summaryText: "Не заполнено",
      markValue,
      days,
      actual,
      normativeStrength,
      hasRequiredData,
      hasActual,
      isCompliant: null,
      normativePercent:
        markValue && normativeStrength != null
          ? normativeStrength / markValue * 100
          : null,
      actualPercent:
        markValue && actual != null ? actual / markValue * 100 : null
    };
  }

  const isCompliant = actual >= normativeStrength;
  return {
    status: isCompliant ? "ok" : "exceeded",
    summaryText: isCompliant ? "в норме" : "превышено",
    markValue,
    days,
    actual,
    normativeStrength,
    hasRequiredData,
    hasActual,
    isCompliant,
    normativePercent: normativeStrength / markValue * 100,
    actualPercent: actual / markValue * 100
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

  const wholeDays = Math.max(7, Math.ceil(days));
  const labels = Array.from({ length: wholeDays }, (_, index) => index + 1);
  return {
    labels,
    normative: labels.map((day) => getNormativeStrength(mark, day) ?? 0),
    actual: labels.map((day) =>
      actual != null && day === days ? actual : null
    )
  };
}
