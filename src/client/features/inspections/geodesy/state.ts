import type {
  GeodesyBimBindingSnapshot,
  GeodesyBimElement,
  GeodesyColumnDraft,
  GeodesyCurrentNodeKeys,
  GeodesyLinearDraft,
  GeodesyNodeRecord,
  GeodesyOpeningPointDraft
} from "./types.js";

export interface GeodesyNodeState {
  nodes: Map<string, GeodesyNodeRecord>;
  currentNodeKeys: GeodesyCurrentNodeKeys;
}

export type GeodesyFormCollection = "column" | "wall" | "beam" | "node";

export interface GeodesyState extends GeodesyNodeState {
  bimElements: GeodesyBimElement[];
  selectedBimElementId: string;
  bimBindingSnapshot: GeodesyBimBindingSnapshot | null;
  bimVisualPanel: { render(): void } | null;
  bimElementsById: Map<string, GeodesyBimElement>;
  bimFilters: {
    search: string;
    type: string;
    axes: string;
  };
  columns: GeodesyColumnDraft[];
  walls: GeodesyLinearDraft[];
  beams: GeodesyLinearDraft[];
  plateOpeningPoints: GeodesyOpeningPointDraft[];
  skipJournalOnce: boolean;
}

export function createGeodesyState(): GeodesyState {
  return {
    nodes: new Map<string, GeodesyNodeRecord>(),
    currentNodeKeys: {
      column: null,
      wall: null,
      beam: null
    },
    bimElements: [],
    selectedBimElementId: "",
    bimBindingSnapshot: null,
    bimVisualPanel: null,
    bimElementsById: new Map<string, GeodesyBimElement>(),
    bimFilters: {
      search: "",
      type: "all",
      axes: "all"
    },
    columns: [],
    walls: [],
    beams: [],
    plateOpeningPoints: [],
    skipJournalOnce: false
  };
}

export function createGeodesyNodeState(): GeodesyNodeState {
  return createGeodesyState();
}

export function replaceGeodesyItems<T>(target: T[], nextItems: T[]) {
  target.splice(0, target.length, ...nextItems);
}

export function resetGeodesyCurrentNodeKeys(state: GeodesyNodeState) {
  state.currentNodeKeys.column = null;
  state.currentNodeKeys.wall = null;
  state.currentNodeKeys.beam = null;
}

export function resetGeodesyFormState(
  state: GeodesyState,
  collection: GeodesyFormCollection
) {
  resetGeodesyCurrentNodeKeys(state);
  state.plateOpeningPoints.length = 0;
  if (collection === "column") state.columns.length = 0;
  if (collection === "wall") state.walls.length = 0;
  if (collection === "beam") state.beams.length = 0;
}
