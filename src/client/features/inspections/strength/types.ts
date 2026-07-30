export type StrengthStatus = "empty" | "ok" | "exceeded";

export interface StrengthBimFields {
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

export interface StrengthCheckRecord
  extends StrengthBimFields, Record<string, unknown> {
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
  floor?: string | null;
  location?: string | null;
  marking?: string | null;
  stairName?: string | null;
  axisLetterFrom?: string | null;
  axisLetterTo?: string | null;
  axisNumberFrom?: string | number | null;
  axisNumberTo?: string | number | null;
  wallBindingType?: string | null;
  wallLetterAxis?: string | null;
  wallNumberAxis1?: string | number | null;
  wallNumberAxis2?: string | number | null;
  wallNumberAxis?: string | number | null;
  wallLetterAxis1?: string | null;
  wallLetterAxis2?: string | null;
  mark?: string | null;
  markValue?: number | null;
  days?: number | string | null;
  actual?: number | string | null;
  status?: StrengthStatus | string | null;
  summaryText?: string | null;
  lastMsg?: string | null;
  createdAt?: number | null;
  deleted?: boolean | null;
}

export interface StrengthEvaluation {
  status: StrengthStatus;
  summaryText: "Не заполнено" | "в норме" | "превышено";
  markValue: number | null;
  days: number | null;
  actual: number | null;
  normativeStrength: number | null;
  hasRequiredData: boolean;
  hasActual: boolean;
  isCompliant: boolean | null;
  normativePercent: number | null;
  actualPercent: number | null;
}

export interface StrengthResultSeries {
  labels: number[];
  normative: number[];
  actual: Array<number | null>;
}

export interface StrengthState {
  checks: Map<string, StrengthCheckRecord>;
  currentCheckId: string | null;
}

export interface StrengthDocumentSnapshot {
  id: string;
  data(): StrengthCheckRecord;
}

export interface StrengthCollectionSnapshot {
  forEach(callback: (document: StrengthDocumentSnapshot) => void): void;
}

export interface StrengthWriteResult {
  id: string;
  ref?: unknown;
}

export interface StrengthBimElementRecord extends Record<string, unknown> {
  id: string;
}
