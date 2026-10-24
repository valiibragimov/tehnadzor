/** The stored result is current only when produced with explicit engineering criteria. */
export function currentAssessmentStatus(record: Record<string, any> | null | undefined) {
  if (record?.evaluationSchemaVersion !== 2) return null;
  const value = record.checkStatus ?? record.status;
  return value === "ok" ? "ok" : value === "exceeded" || value === "bad" ? "exceeded" : null;
}
