import type { BimElement } from "../../../types/domain.js";

export type ReinforcementStatus = "empty" | "ok" | "exceeded";
export type ReinforcementConstructionType = "Колонна" | "Балка" | "Стена";
export type ReinforcementWallBindingType =
  | "number_letters"
  | "letter_numbers";

export interface ReinforcementMeasurements extends Record<string, unknown> {
  projDia?: number | string | null;
  factDia?: number | string | null;
  projStep?: number | string | null;
  factStep?: number | string | null;
  projCover?: number | string | null;
  factCover?: number | string | null;
  projHoopsStep?: number | string | null;
  factHoopsStep?: number | string | null;
}

export interface ReinforcementColumn extends ReinforcementMeasurements {
  id: number;
  marking: string;
}

export interface ReinforcementBeam extends ReinforcementMeasurements {
  id: number;
  marking: string;
}

export interface ReinforcementWall extends ReinforcementMeasurements {
  id: number;
  bindingType: ReinforcementWallBindingType;
  numberAxis: string;
  letterAxis1: string;
  letterAxis2: string;
  letterAxis: string;
  numberAxis1: string;
  numberAxis2: string;
}

export interface ReinforcementLinearRecord
  extends ReinforcementMeasurements {
  id?: number;
  marking?: string | null;
  bindingType?: ReinforcementWallBindingType | string | null;
  numberAxis?: string | number | null;
  letterAxis1?: string | null;
  letterAxis2?: string | null;
  letterAxis?: string | null;
  numberAxis1?: string | number | null;
  numberAxis2?: string | number | null;
}

export interface ReinforcementBimFields extends Record<string, unknown> {
  bimElementId?: string | null;
  bimSourceModelId?: string | null;
  bimIfcGuid?: string | null;
  bimType?: string | null;
  bimFloor?: string | null;
  bimMark?: string | null;
  bimAxes?: string | null;
  bimProjectX?: number | null;
  bimProjectY?: number | null;
  bimProjectH?: number | null;
}

export interface ReinforcementBimElementRecord
  extends Record<string, unknown> {
  id: string;
}

export type ReinforcementBimElement = BimElement &
  Record<string, unknown>;

export interface ReinforcementBimFilters {
  search: string;
  type: string;
  axes: string;
}

export interface ReinforcementBimBindingSnapshot {
  resolved: boolean;
  elementId: string | null;
  rawType: string | null;
  typeLabel: string | null;
  floor: string | null;
  mark: string | null;
  axes: string | null;
  sourceModelId: string | null;
  ifcGuid: string | null;
  title: string;
}

export interface ReinforcementCheckRecord
  extends ReinforcementBimFields, ReinforcementMeasurements {
  id?: string | null;
  projectId?: string | null;
  module?: string | null;
  construction?: string | null;
  constructionCategory?: string | null;
  constructionLabel?: string | null;
  constructionType?: string | null;
  constructionSubtype?: string | null;
  constructionSubtypeLabel?: string | null;
  constructionPileElement?: string | null;
  constructionPileElementLabel?: string | null;
  checkKind?: string | null;
  stairName?: string | null;
  floor?: string | null;
  axisLetterFrom?: string | null;
  axisLetterTo?: string | null;
  axisNumberFrom?: string | number | null;
  axisNumberTo?: string | number | null;
  axisMode?: string | null;
  location?: string | null;
  columns?: ReinforcementLinearRecord[] | null;
  beams?: ReinforcementLinearRecord[] | null;
  walls?: ReinforcementLinearRecord[] | null;
  status?: ReinforcementStatus | string | null;
  summaryText?: string | null;
  lastMsg?: string | null;
  createdAt?: number | null;
  deleted?: boolean | null;
}

export interface ReinforcementState {
  checks: Map<string, ReinforcementCheckRecord>;
  currentCheckId: string | null;
  columns: ReinforcementColumn[];
  beams: ReinforcementBeam[];
  walls: ReinforcementWall[];
}

export interface ReinforcementEvaluation {
  status: ReinforcementStatus;
  summaryText: "Не заполнено" | "в норме" | "превышено";
  hasAnyData: boolean;
  hasRequiredData: boolean;
  allOk: boolean;
}

export interface ReinforcementJournalPayload
  extends Record<string, unknown> {
  module: "Армирование";
  status: "ok" | "exceeded";
  context: string;
  details: string;
  construction: string;
  sourceId?: string;
}

export interface ReinforcementDocumentSnapshot {
  id: string;
  data(): ReinforcementCheckRecord;
}

export interface ReinforcementCollectionSnapshot {
  forEach(
    callback: (document: ReinforcementDocumentSnapshot) => void
  ): void;
}

export interface ReinforcementWriteResult {
  id: string;
  ref?: unknown;
}
