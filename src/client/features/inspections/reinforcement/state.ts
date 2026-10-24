import type {
  ReinforcementBeam,
  ReinforcementCheckRecord,
  ReinforcementColumn,
  ReinforcementConstructionType,
  ReinforcementState,
  ReinforcementWall,
  ReinforcementWallBindingType
} from "./types.js";

export type ReinforcementAddResult<T> =
  | { added: true; item: T }
  | { added: false; reason: "limit" };

const emptyMeasurements = () => ({
  projDia: "",
  factDia: "",
  projStep: "",
  factStep: "",
  projCover: "",
  factCover: ""
});

export function createReinforcementState(): ReinforcementState {
  return {
    checks: new Map(),
    currentCheckId: null,
    columns: [],
    beams: [],
    walls: []
  };
}

export function setCurrentReinforcementCheckId(
  state: ReinforcementState,
  checkId: string | null | undefined
) {
  const normalized = String(checkId || "").trim();
  state.currentCheckId = normalized || null;
  return state.currentCheckId;
}

export function replaceReinforcementChecks(
  state: ReinforcementState,
  checks: Map<string, ReinforcementCheckRecord>
) {
  state.checks.clear();
  checks.forEach((check, id) => state.checks.set(id, check));
}

export function createReinforcementColumn(id = Date.now()): ReinforcementColumn {
  return {
    id,
    marking: "",
    ...emptyMeasurements(),
    projHoopsStep: "",
    factHoopsStep: ""
  };
}

export function createReinforcementBeam(id = Date.now()): ReinforcementBeam {
  return { id, marking: "", ...emptyMeasurements(), projHoopsStep: "", factHoopsStep: "" };
}

export function createReinforcementWall(id = Date.now()): ReinforcementWall {
  return {
    id,
    bindingType: "number_letters",
    numberAxis: "",
    letterAxis1: "",
    letterAxis2: "",
    letterAxis: "",
    numberAxis1: "",
    numberAxis2: "",
    ...emptyMeasurements()
  };
}

function addWithinLimit<T>(
  target: T[],
  item: T,
  maxElements: number
): ReinforcementAddResult<T> {
  if (target.length >= maxElements) return { added: false, reason: "limit" };
  target.push(item);
  return { added: true, item };
}

export function addReinforcementColumn(
  state: ReinforcementState,
  maxElements: number,
  id = Date.now()
) {
  return addWithinLimit(
    state.columns,
    createReinforcementColumn(id),
    maxElements
  );
}

export function addReinforcementBeam(
  state: ReinforcementState,
  maxElements: number,
  id = Date.now()
) {
  return addWithinLimit(
    state.beams,
    createReinforcementBeam(id),
    maxElements
  );
}

export function addReinforcementWall(
  state: ReinforcementState,
  maxElements: number,
  id = Date.now()
) {
  return addWithinLimit(
    state.walls,
    createReinforcementWall(id),
    maxElements
  );
}

export function removeReinforcementColumn(
  state: ReinforcementState,
  id: number
) {
  state.columns = state.columns.filter((item) => item.id !== id);
}

export function removeReinforcementBeam(
  state: ReinforcementState,
  id: number
) {
  state.beams = state.beams.filter((item) => item.id !== id);
}

export function removeReinforcementWall(
  state: ReinforcementState,
  id: number
) {
  state.walls = state.walls.filter((item) => item.id !== id);
}

export function setReinforcementColumns(
  state: ReinforcementState,
  columns: ReinforcementColumn[] | null | undefined
) {
  state.columns = columns || [];
}

export function setReinforcementBeams(
  state: ReinforcementState,
  beams: ReinforcementBeam[] | null | undefined
) {
  state.beams = beams || [];
}

export function setReinforcementWalls(
  state: ReinforcementState,
  walls: ReinforcementWall[] | null | undefined
) {
  state.walls = walls || [];
}

function normalizeMarking(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
}

export function hasDuplicateColumnMarking(
  state: ReinforcementState,
  marking: string,
  excludeId: number | null = null
) {
  const normalized = normalizeMarking(marking);
  return !!normalized && state.columns.some((item) =>
    item.id !== excludeId && normalizeMarking(item.marking) === normalized
  );
}

export function hasDuplicateBeamMarking(
  state: ReinforcementState,
  marking: string,
  excludeId: number | null = null
) {
  const normalized = normalizeMarking(marking);
  return !!normalized && state.beams.some((item) =>
    item.id !== excludeId && normalizeMarking(item.marking) === normalized
  );
}

function normalizedStringPair(first: string, second: string) {
  return [String(first), String(second)].sort().join("-");
}

function normalizedNumberPair(first: string, second: string) {
  return [String(first), String(second)]
    .sort((a, b) => Number.parseInt(a) - Number.parseInt(b))
    .join("-");
}

export interface ReinforcementWallAxes {
  bindingType: ReinforcementWallBindingType;
  numberAxis: string;
  letterAxis1: string;
  letterAxis2: string;
  letterAxis: string;
  numberAxis1: string;
  numberAxis2: string;
}

export function hasDuplicateWallAxes(
  state: ReinforcementState,
  axes: ReinforcementWallAxes,
  excludeId: number | null = null
) {
  if (
    axes.bindingType === "number_letters" &&
    (!axes.numberAxis || !axes.letterAxis1 || !axes.letterAxis2)
  ) return false;
  if (
    axes.bindingType === "letter_numbers" &&
    (!axes.letterAxis || !axes.numberAxis1 || !axes.numberAxis2)
  ) return false;

  return state.walls.some((wall) => {
    if (wall.id === excludeId || wall.bindingType !== axes.bindingType) {
      return false;
    }
    if (axes.bindingType === "number_letters") {
      return !!wall.numberAxis && !!wall.letterAxis1 && !!wall.letterAxis2 &&
        axes.numberAxis === wall.numberAxis &&
        normalizedStringPair(axes.letterAxis1, axes.letterAxis2) ===
          normalizedStringPair(wall.letterAxis1, wall.letterAxis2);
    }
    return !!wall.letterAxis && !!wall.numberAxis1 && !!wall.numberAxis2 &&
      axes.letterAxis === wall.letterAxis &&
      normalizedNumberPair(axes.numberAxis1, axes.numberAxis2) ===
        normalizedNumberPair(wall.numberAxis1, wall.numberAxis2);
  });
}

export function clearReinforcementRows(state: ReinforcementState) {
  state.columns = [];
  state.beams = [];
  state.walls = [];
}

export function clearReinforcementRowsByType(
  state: ReinforcementState,
  constructionType: ReinforcementConstructionType
) {
  if (constructionType === "Колонна") state.columns = [];
  if (constructionType === "Балка") state.beams = [];
  if (constructionType === "Стена") state.walls = [];
}
