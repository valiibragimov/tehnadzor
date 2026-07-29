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

export function evaluateGeoColumnNode(
  columns: GeodesyColumnDraft[],
  tolerance = 8
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
  tolerance = 8
): GeodesyEvaluation {
  return evaluateLinearRows(walls, tolerance);
}

export function evaluateGeoBeamNode(
  beams: GeodesyLinearDraft[],
  tolerance = 8
): GeodesyEvaluation {
  return evaluateLinearRows(beams, tolerance);
}

export function evaluateGeoNode(
  node: GeodesyCoordinateDraft,
  toleranceXY = 8,
  toleranceH = 10
): GeodesyCoordinateEvaluation {
  const projectX = numericValue(node.projX);
  const projectY = numericValue(node.projY);
  const actualX = numericValue(node.factX);
  const actualY = numericValue(node.factY);
  const projectH = numericValue(node.projH);
  const actualH = numericValue(node.factH);
  const hasProjXY = projectX != null && projectY != null;
  const hasFactXY = actualX != null && actualY != null;

  if (!hasProjXY || !hasFactXY) {
    return {
      status: "empty",
      details: [],
      hasAllData: false,
      hasProjXY,
      hasFactXY
    };
  }

  const details: GeodesyCoordinateEvaluation["details"] = [
    buildCoordinateCheck("X", projectX, actualX, toleranceXY),
    buildCoordinateCheck("Y", projectY, actualY, toleranceXY)
  ];
  if (projectH != null && actualH != null) {
    details.push(buildCoordinateCheck("H", projectH, actualH, toleranceH));
  }

  return {
    status: details.every((check) => check.ok) ? "ok" : "bad",
    details,
    hasAllData: true,
    hasProjXY: true,
    hasFactXY: true
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
      return `К${index + 1}: ΔX=${Math.abs(actualX - projectX).toFixed(1)}, ΔY=${Math.abs(actualY - projectY).toFixed(1)}`;
    })
    .filter((detail): detail is string => detail != null)
    .join("; ");

  return {
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
      return `${entityLabel}${index + 1}: ΔX=${Math.abs(actualX - projectX).toFixed(1)}, ΔY=${Math.abs(actualY - projectY).toFixed(1)}`;
    })
    .filter((detail): detail is string => detail != null)
    .join("; ");

  return {
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
  tolerance: number
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

    if (hasProject && hasActual) {
      allOk &&= project.every(
        (value, index) =>
          value != null &&
          actual[index] != null &&
          Math.abs(actual[index] - value) <= tolerance
      );
    }
  }

  const hasAllData = allHaveProject && allHaveActual;
  return {
    status: hasAllData ? (allOk ? "ok" : "bad") : "empty",
    hasAllData,
    hasProjXY: hasAnyProject,
    hasFactXY: hasAnyActual
  };
}

function evaluateLinearRows(
  rows: GeodesyLinearDraft[],
  tolerance: number
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
  tolerance: number
) {
  const deviation = Math.abs(actual - project);
  return {
    axis,
    dev: deviation,
    ok: deviation <= tolerance,
    tol: tolerance
  };
}
