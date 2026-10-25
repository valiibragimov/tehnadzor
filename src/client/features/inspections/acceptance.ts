export interface AcceptanceCriteria {
  reference: string;
  confirmed: boolean;
  limits: Record<string, { min: number | null; max: number | null }>;
}

export function measurementNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const number = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

/** Limits are signed deviations in mm, explicitly supplied for this inspection. */
export function compareMeasurement(project: unknown, actual: unknown, key: string, criteria?: AcceptanceCriteria | null) {
  const design = measurementNumber(project);
  const measured = measurementNumber(actual);
  if (design == null || measured == null) return "incomplete" as const;
  const limits = criteria?.limits?.[key];
  if (!criteria?.confirmed || !criteria.reference.trim() || limits?.min == null || limits.max == null ||
      !Number.isFinite(limits.min) || !Number.isFinite(limits.max) || limits.min > limits.max) return "unverified" as const;
  const delta = measured - design;
  return delta >= limits.min - 1e-7 && delta <= limits.max + 1e-7 ? "ok" as const : "exceeded" as const;
}

/** Physical dimensions, bar spacing and cover must be strictly positive. */
export function comparePhysicalMeasurement(project: unknown, actual: unknown, key: string, criteria?: AcceptanceCriteria | null) {
  const p = measurementNumber(project), a = measurementNumber(actual);
  return p == null || a == null || p <= 0 || a <= 0 ? "incomplete" as const : compareMeasurement(p, a, key, criteria);
}

export function summarizeMeasurements(results: Array<ReturnType<typeof compareMeasurement>>) {
  const status = results.includes("exceeded") ? "exceeded" : results.length > 0 && results.every(result => result === "ok") ? "ok" : "empty";
  const hasIncompleteMeasurements = results.length === 0 || results.some(result => result === "incomplete" || result === "unverified");
  return { status, hasIncompleteMeasurements, summaryText: status === "ok" ? "в норме" : status === "exceeded" ? hasIncompleteMeasurements ? "превышено; проверка неполна или не подтверждена" : "превышено" : "Требует проверки" } as const;
}
