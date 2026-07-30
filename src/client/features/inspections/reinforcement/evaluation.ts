import { TOLERANCES } from "../../../config.js";
import { getInspectionToleranceValue } from "../../../app/inspection-registry.js";
import type {
  ReinforcementCheckRecord,
  ReinforcementEvaluation,
  ReinforcementJournalPayload,
  ReinforcementMeasurements
} from "./types.js";

export interface ReinforcementTolerances {
  step: number;
  cover: number;
  hoopsStep: number;
}

function parseMeasurement(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function getReinforcementTolerances(
  check: ReinforcementCheckRecord
): ReinforcementTolerances {
  const construction =
    check.construction || check.constructionType || check.checkKind || "";
  const subtype = check.constructionSubtype || "";
  return {
    step: getInspectionToleranceValue(
      construction,
      "reinforcement",
      "rebarStep",
      TOLERANCES.STEP,
      subtype
    ),
    cover: getInspectionToleranceValue(
      construction,
      "reinforcement",
      "rebarCover",
      TOLERANCES.COVER,
      subtype
    ),
    hoopsStep: getInspectionToleranceValue(
      construction,
      "reinforcement",
      "hoopsStep",
      TOLERANCES.HOOPS_STEP,
      subtype
    )
  };
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

function evaluatePair(
  project: unknown,
  actual: unknown,
  tolerance: number | null
) {
  const projectValue = parseMeasurement(project);
  const actualValue = parseMeasurement(actual);
  return {
    hasAny: projectValue != null || actualValue != null,
    complete: projectValue != null && actualValue != null,
    ok: projectValue != null && actualValue != null
      ? tolerance == null
        ? Math.abs(actualValue - projectValue) === 0
        : Math.abs(actualValue - projectValue) <= tolerance
      : true
  };
}

function evaluateMeasurements(
  measurements: ReinforcementMeasurements,
  tolerances: ReinforcementTolerances,
  includeHoops: boolean
) {
  const pairs = [
    evaluatePair(measurements.projDia, measurements.factDia, null),
    evaluatePair(
      measurements.projStep,
      measurements.factStep,
      tolerances.step
    ),
    evaluatePair(
      measurements.projCover,
      measurements.factCover,
      tolerances.cover
    )
  ];
  if (includeHoops) {
    pairs.push(evaluatePair(
      measurements.projHoopsStep,
      measurements.factHoopsStep,
      tolerances.hoopsStep
    ));
  }
  return pairs;
}

export function evaluateReinforcementCheck(
  check: ReinforcementCheckRecord,
  tolerances = getReinforcementTolerances(check)
): ReinforcementEvaluation {
  let items: ReinforcementMeasurements[];
  let includeHoops = true;
  if (check.columns || check.beams || check.walls) {
    items = check.columns || check.beams || check.walls || [];
    includeHoops = !!check.columns;
  } else {
    items = [check];
  }

  const pairs = items.flatMap((item) =>
    evaluateMeasurements(item, tolerances, includeHoops)
  );
  const hasAnyData = pairs.some((pair) => pair.hasAny);
  const hasRequiredData = pairs.some((pair) => pair.complete);
  const allOk = pairs.every((pair) => pair.ok);

  if (!hasAnyData || !hasRequiredData) {
    return {
      status: "empty",
      summaryText: "Не заполнено",
      hasAnyData,
      hasRequiredData,
      allOk
    };
  }
  return {
    status: allOk ? "ok" : "exceeded",
    summaryText: allOk ? "в норме" : "превышено",
    hasAnyData,
    hasRequiredData,
    allOk
  };
}

function appendJournalDifferences(
  details: string[],
  measurements: ReinforcementMeasurements
) {
  const diameter = evaluatePair(
    measurements.projDia,
    measurements.factDia,
    null
  );
  if (diameter.complete && !diameter.ok) {
    details.push(`Диаметр: ${measurements.projDia}→${measurements.factDia}`);
  }
  const step = evaluatePair(
    measurements.projStep,
    measurements.factStep,
    5
  );
  if (step.complete && !step.ok) {
    details.push(`Шаг: ${measurements.projStep}→${measurements.factStep}`);
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
  if (check.columns) {
    check.columns.forEach((item) => appendJournalDifferences(details, item));
  } else {
    appendJournalDifferences(details, check);
  }
  return {
    module: "Армирование",
    status: evaluation.status === "ok" ? "ok" : "exceeded",
    context,
    details: details.join("; ") ||
      evaluation.summaryText ||
      "Проверка армирования",
    construction: String(check.construction || ""),
    ...(sourceId ? { sourceId } : {})
  };
}
