import type { AcceptanceCriteria } from "../acceptance.js";
import type {
  GeodesyColumnDraft,
  GeodesyCoordinateDraft,
  GeodesyCoordinateEvaluation,
  GeodesyEvaluation,
  GeodesyJournalPayload,
  GeodesyLinearDraft
} from "./types.js";

const numericValue = (value: string | number | null | undefined) => {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export type GeodesyTolerance = number | { min: number; max: number };
function geoLimits(tolerance: GeodesyTolerance) {
  const bounds = typeof tolerance === "number" ? { min: -tolerance, max: tolerance } : tolerance;
  return Number.isFinite(bounds.min) && Number.isFinite(bounds.max) && bounds.min <= bounds.max ? bounds : null;
}
function withinGeoTolerance(delta: number, tolerance: GeodesyTolerance) {
  const bounds = geoLimits(tolerance);
  return !!bounds && delta >= bounds.min - 1e-7 && delta <= bounds.max + 1e-7;
}

export function evaluateGeoColumnNode(
  columns: GeodesyColumnDraft[],
  tolerance: GeodesyTolerance = NaN
): GeodesyEvaluation {
  return evaluateRows(
    columns,
    (column) => [column.projX, column.projY],
    (column) => [column.factX, column.factY],
    tolerance
  );
}

export function evaluateGeoWallNode(
  walls: GeodesyLinearDraft[],
  tolerance: GeodesyTolerance = NaN
): GeodesyEvaluation {
  return evaluateLinearRows(walls, tolerance);
}

export function evaluateGeoBeamNode(
  beams: GeodesyLinearDraft[],
  tolerance: GeodesyTolerance = NaN
): GeodesyEvaluation {
  return evaluateLinearRows(beams, tolerance);
}

export function evaluateGeoNode(
  node: GeodesyCoordinateDraft,
  toleranceXY: GeodesyTolerance = NaN,
  toleranceH: GeodesyTolerance = NaN
): GeodesyCoordinateEvaluation {
  const projectX = numericValue(node.projX);
  const projectY = numericValue(node.projY);
  const actualX = numericValue(node.factX);
  const actualY = numericValue(node.factY);
  const projectH = numericValue(node.projH);
  const actualH = numericValue(node.factH);
  const hasProjXY = projectX != null && projectY != null;
  const hasFactXY = actualX != null && actualY != null;

  const hasAllData = hasProjXY && hasFactXY && projectH != null && actualH != null;
  const details: GeodesyCoordinateEvaluation["details"] = [];
  for (const [axis, project, actual, tolerance] of [
    ["X", projectX, actualX, toleranceXY], ["Y", projectY, actualY, toleranceXY], ["H", projectH, actualH, toleranceH]
  ] as const) {
    if (project != null && actual != null) details.push(buildCoordinateCheck(axis, project, actual, tolerance));
  }
  return {
    status: details.some(check => Number.isFinite(check.tol) && !check.ok) ? "bad" :
      hasAllData && details.every(check => Number.isFinite(check.tol) && check.ok) ? "ok" : "empty",
    details, hasAllData, hasProjXY, hasFactXY
  };
}

export function buildColumnJournalPayload({
  key,
  construction,
  columnMark,
  floor,
  columns,
  status
}: {
  key: string;
  construction: string;
  columnMark: string;
  floor: string;
  columns: GeodesyColumnDraft[];
  status: "ok" | "bad";
}): GeodesyJournalPayload {
  const details = columns
    .map((column, index) => {
      const projectX = numericValue(column.projX);
      const projectY = numericValue(column.projY);
      const actualX = numericValue(column.factX);
      const actualY = numericValue(column.factY);
      if (
        projectX == null ||
        projectY == null ||
        actualX == null ||
        actualY == null
      ) {
        return null;
      }
      return `К${index + 1}: ΔX=${(Math.abs(actualX - projectX) * 1000).toFixed(1)}, ΔY=${(Math.abs(actualY - projectY) * 1000).toFixed(1)}`;
    })
    .filter((detail): detail is string => detail != null)
    .join("; ");

  return {
    evaluationSchemaVersion: 2,
    module: "Геодезия",
    status: status === "ok" ? "ok" : "exceeded",
    context: [columnMark, floor].filter(Boolean).join(", ") || "Колонны",
    details: details || "Проверка колонн",
    sourceId: key,
    construction
  };
}

export function buildLinearJournalPayload({
  key,
  construction,
  floor,
  rows,
  status,
  entityLabel,
  entityPlural,
  emptyDetails
}: {
  key: string;
  construction: string;
  floor: string;
  rows: GeodesyLinearDraft[];
  status: "ok" | "bad";
  entityLabel: string;
  entityPlural: string;
  emptyDetails: string;
}): GeodesyJournalPayload {
  const details = rows
    .map((row, index) => {
      const coordinates =
        row.bindingType === "number_letters"
          ? [
              row.projX_num_let1,
              row.projY_num_let1,
              row.factX_num_let1,
              row.factY_num_let1
            ]
          : [
              row.projX_let_num1,
              row.projY_let_num1,
              row.factX_let_num1,
              row.factY_let_num1
            ];
      const [projectX, projectY, actualX, actualY] =
        coordinates.map(numericValue);
      if (
        projectX == null ||
        projectY == null ||
        actualX == null ||
        actualY == null
      ) {
        return null;
      }
      return `${entityLabel}${index + 1}: ΔX=${(Math.abs(actualX - projectX) * 1000).toFixed(1)}, ΔY=${(Math.abs(actualY - projectY) * 1000).toFixed(1)}`;
    })
    .filter((detail): detail is string => detail != null)
    .join("; ");

  return {
    evaluationSchemaVersion: 2,
    module: "Геодезия",
    status: status === "ok" ? "ok" : "exceeded",
    context: floor ? `Этаж ${floor}, ${entityPlural}` : entityPlural,
    details: details || emptyDetails,
    sourceId: key,
    construction
  };
}

function evaluateRows<T>(
  rows: T[],
  getProject: (row: T) => Array<string | number | null | undefined>,
  getActual: (row: T) => Array<string | number | null | undefined>,
  tolerance: GeodesyTolerance
): GeodesyEvaluation {
  if (rows.length === 0) {
    return {
      status: "empty",
      hasAllData: false,
      hasProjXY: false,
      hasFactXY: false
    };
  }

  let hasAnyProject = false;
  let hasAnyActual = false;
  let allHaveProject = true;
  let allHaveActual = true;
  let allOk = true;

  for (const row of rows) {
    const project = getProject(row).map(numericValue);
    const actual = getActual(row).map(numericValue);
    const hasProject = project.every((value) => value != null);
    const hasActual = actual.every((value) => value != null);
    hasAnyProject ||= hasProject;
    hasAnyActual ||= hasActual;
    allHaveProject &&= hasProject;
    allHaveActual &&= hasActual;

    for (let index = 0; index < project.length; index++) {
      if (project[index] != null && actual[index] != null) allOk &&= withinGeoTolerance((actual[index] - project[index]) * 1000, tolerance);
    }
  }

  const hasAllData = allHaveProject && allHaveActual;
  return {
    status: !geoLimits(tolerance) ? "empty" : !allOk ? "bad" : hasAllData ? "ok" : "empty",
    hasAllData,
    hasProjXY: hasAnyProject,
    hasFactXY: hasAnyActual
  };
}

function evaluateLinearRows(
  rows: GeodesyLinearDraft[],
  tolerance: GeodesyTolerance
) {
  return evaluateRows(
    rows,
    (row) =>
      row.bindingType === "number_letters"
        ? [
            row.projX_num_let1,
            row.projY_num_let1,
            row.projX_num_let2,
            row.projY_num_let2
          ]
        : [
            row.projX_let_num1,
            row.projY_let_num1,
            row.projX_let_num2,
            row.projY_let_num2
          ],
    (row) =>
      row.bindingType === "number_letters"
        ? [
            row.factX_num_let1,
            row.factY_num_let1,
            row.factX_num_let2,
            row.factY_num_let2
          ]
        : [
            row.factX_let_num1,
            row.factY_let_num1,
            row.factX_let_num2,
            row.factY_let_num2
          ],
    tolerance
  );
}

function buildCoordinateCheck(
  axis: "X" | "Y" | "H",
  project: number,
  actual: number,
  tolerance: GeodesyTolerance
) {
  const delta = Number(((actual - project) * 1000).toFixed(6));
  const bounds = geoLimits(tolerance);
  return { axis, dev: Math.abs(delta), delta,
    ok: withinGeoTolerance(delta, tolerance),
    tol: bounds ? Math.max(Math.abs(bounds.min), Math.abs(bounds.max)) : NaN,
    lower: bounds?.min ?? null, upper: bounds?.max ?? null };
}

export function getConfirmedGeoTolerance(criteria: AcceptanceCriteria | null | undefined, key: string): GeodesyTolerance {
  const bounds = criteria?.limits[key];
  return criteria?.confirmed && criteria.reference.trim() && bounds?.min != null && bounds.max != null &&
    Number.isFinite(bounds.min) && Number.isFinite(bounds.max) && bounds.min <= bounds.max ? { min: bounds.min, max: bounds.max } : NaN;
}
