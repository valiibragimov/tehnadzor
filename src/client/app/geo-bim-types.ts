import type { BimElement, GeoPrefill } from "../types/domain.js";

export interface GeoBimNodeData extends Partial<GeoPrefill> {
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

export interface GeoSingleAxisHint {
  letter?: string | null;
  number?: string | number | null;
}

export interface GeoLinearNodeRecord extends Record<string, unknown> {
  bindingType?: string | null;
  letterAxis1?: string | null;
  letterAxis2?: string | null;
  letterAxis?: string | null;
  numberAxis?: string | number | null;
  numberAxis1?: string | number | null;
  numberAxis2?: string | number | null;
  projX_num_let1?: number | string | null;
  projY_num_let1?: number | string | null;
  projX_num_let2?: number | string | null;
  projY_num_let2?: number | string | null;
  projX_let_num1?: number | string | null;
  projY_let_num1?: number | string | null;
  projX_let_num2?: number | string | null;
  projY_let_num2?: number | string | null;
}

export interface GeoLinearBindingHint {
  bindingType?: string | null;
  numberAxis?: string | number | null;
  letterAxis1?: string | null;
  letterAxis2?: string | null;
  letterAxis?: string | null;
  numberAxis1?: string | number | null;
  numberAxis2?: string | number | null;
}

export interface EnrichedBimElement extends BimElement {
  geoBindingHint?: GeoLinearBindingHint | null;
  geoSingleAxisHint?: GeoSingleAxisHint | null;
}

export interface GeoNodeRegistryRecord extends GeoBimNodeData {
  deleted?: boolean | null;
  floor?: string | null;
  letter?: string | null;
  number?: string | number | null;
  type?: string | null;
  columns?: Array<Record<string, unknown>> | null;
  walls?: GeoLinearNodeRecord[] | null;
  beams?: GeoLinearNodeRecord[] | null;
}

export interface GeoBimBindingSnapshot {
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

export interface GeoBimBindingSnapshotBuildOptions {
  element?: Partial<EnrichedBimElement> | null;
  nodeData?: GeoBimNodeData | null;
  constructionType?: string | null;
}

export interface GeoPlateOpeningPoint {
  id?: string | number;
  projX?: string | number | null;
  projY?: string | number | null;
  factX?: string | number | null;
  factY?: string | number | null;
}

export type GeoNodesRegistry = Map<string, GeoNodeRegistryRecord>;
export type JournalFilterValue = string | null;
