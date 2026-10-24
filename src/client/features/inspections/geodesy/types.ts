import type { AcceptanceCriteria } from "../acceptance.js";
import type { BimElement, GeoPrefill } from "../../../types/domain.js";

export type GeodesyStatus = "empty" | "pending" | "ok" | "bad" | "not-ok";
export type GeodesyDataStatus =
  | "empty"
  | "project_only"
  | "fact_only"
  | "checked";
export type GeodesyBindingType = "number_letters" | "letter_numbers";

export interface GeodesyEvaluation {
  status: "empty" | "ok" | "bad";
  hasAllData: boolean;
  hasProjXY: boolean;
  hasFactXY: boolean;
}

export interface GeodesyCoordinateEvaluation extends GeodesyEvaluation {
  details: Array<{
    axis: "X" | "Y" | "H";
    dev: number;
    ok: boolean;
    tol: number;
  }>;
}

export interface GeodesyColumnDraft {
  id: number;
  mark: string;
  projX: string;
  factX: string;
  projY: string;
  factY: string;
}

export interface GeodesyLinearDraft {
  id: number;
  bindingType: GeodesyBindingType;
  numberAxis: string;
  letterAxis1: string;
  letterAxis2: string;
  letterAxis: string;
  numberAxis1: string;
  numberAxis2: string;
  projX_num_let1: string;
  factX_num_let1: string;
  projY_num_let1: string;
  factY_num_let1: string;
  projX_num_let2: string;
  factX_num_let2: string;
  projY_num_let2: string;
  factY_num_let2: string;
  projX_let_num1: string;
  factX_let_num1: string;
  projY_let_num1: string;
  factY_let_num1: string;
  projX_let_num2: string;
  factX_let_num2: string;
  projY_let_num2: string;
  factY_let_num2: string;
}

export interface GeodesyOpeningPointDraft {
  id: string | number;
  projX: string;
  projY: string;
  factX: string;
  factY: string;
}

export interface GeodesyCoordinateDraft {
  projX: number | null;
  factX: number | null;
  projY: number | null;
  factY: number | null;
  projH: number | null;
  factH: number | null;
}

export interface GeodesyBimNodeData extends Partial<GeoPrefill> {
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
  bimLineStartX?: number | null;
  bimLineStartY?: number | null;
  bimLineEndX?: number | null;
  bimLineEndY?: number | null;
  construction?: string | null;
  constructionCategory?: string | null;
  constructionLabel?: string | null;
  constructionType?: string | null;
  constructionSubtype?: string | null;
  constructionSubtypeLabel?: string | null;
  stairName?: string | null;
  plateFlatnessChecked?: boolean | null;
  summaryText?: string | null;
  status?: string | null;
  createdAt?: number | null;
}

export interface GeodesySingleAxisHint {
  letter?: string | null;
  number?: string | number | null;
}

export interface GeodesyLinearBindingHint {
  bindingType?: GeodesyBindingType | string | null;
  numberAxis?: string | number | null;
  letterAxis1?: string | null;
  letterAxis2?: string | null;
  letterAxis?: string | null;
  numberAxis1?: string | number | null;
  numberAxis2?: string | number | null;
}

export interface GeodesyBimElement
  extends BimElement, Record<string, unknown> {
  geoBindingHint?: GeodesyLinearBindingHint | null;
  geoSingleAxisHint?: GeodesySingleAxisHint | null;
}

export interface GeodesyBimBindingSnapshot {
  resolved: boolean;
  title: string;
  elementId: string;
  sourceModelId: string;
  ifcGuid: string;
  rawType: string;
  typeLabel: string;
  projectX: number | null;
  projectY: number | null;
  projectH: number | null;
  mark: string;
  axes: string;
}

export interface GeodesyBimApi {
  clear(options?: { keepManualFields?: boolean }): void;
  collectNodeData(): GeodesyBimNodeData;
  syncFromNode(node: GeodesyNodeRecord): void;
  updateControls(): void;
}

export interface GeodesyNodeRecord
  extends GeodesyBimNodeData, Record<string, unknown> {
  acceptanceCriteria?: AcceptanceCriteria | null;
  coordinateUnit?: "m";
  deviationUnit?: "mm";
  measurementSchemaVersion?: 2;
  type?: "columns" | "walls" | "beams" | string | null;
  constructionSubtype?: string | null;
  constructionPileElement?: string | null;
  floor?: string | null;
  letter?: string | null;
  number?: string | number | null;
  location?: string | null;
  axisMode?: string | null;
  axisLetterFrom?: string | null;
  axisLetterTo?: string | null;
  axisNumberFrom?: string | number | null;
  axisNumberTo?: string | number | null;
  columnMark?: string | null;
  projX?: number | null;
  factX?: number | null;
  projY?: number | null;
  factY?: number | null;
  projH?: number | null;
  factH?: number | null;
  stairName?: string | null;
  plateFlatnessChecked?: boolean | null;
  plateFlatnessActual?: string | number | null;
  plateFlatnessBase?: string | number | null;
  plateFlatnessClass?: string | null;
  plateFlatnessTolerance?: string | number | null;
  status?: GeodesyStatus | string | null;
  dataStatus?: GeodesyDataStatus | string | null;
  lastMsg?: string | null;
  deleted?: boolean | null;
  columns?: Array<Record<string, unknown>> | null;
  walls?: Array<Record<string, unknown>> | null;
  beams?: Array<Record<string, unknown>> | null;
  openingPoints?: Array<Record<string, unknown>> | null;
}

export interface GeodesyJournalPayload {
  evaluationSchemaVersion?: number;
  module: "Геодезия";
  status: "ok" | "exceeded";
  context: string;
  details: string;
  sourceId: string;
  construction: string;
}

export interface GeodesyCurrentNodeKeys {
  column: string | null;
  wall: string | null;
  beam: string | null;
}
