export interface GeodesyNodeState {
  nodes: Map<string, any>;
  currentNodeKeys: {
    column: string | null;
    wall: string | null;
    beam: string | null;
  };
}

export interface GeodesyState<
  TBimElement = Record<string, unknown>,
  TBimBinding = unknown,
  TBimPanel = unknown
> extends GeodesyNodeState {
  bimElements: TBimElement[];
  selectedBimElementId: string;
  bimBindingSnapshot: TBimBinding | null;
  bimVisualPanel: TBimPanel | null;
  bimElementsById: Map<string, TBimElement>;
  bimFilters: {
    search: string;
    type: string;
    axes: string;
  };
  columns: any[];
  walls: any[];
  beams: any[];
  plateOpeningPoints: any[];
  skipJournalOnce: boolean;
}

export function createGeodesyState<
  TBimElement = Record<string, unknown>,
  TBimBinding = unknown,
  TBimPanel = unknown
>(): GeodesyState<TBimElement, TBimBinding, TBimPanel> {
  return {
    nodes: new Map<string, any>(),
    currentNodeKeys: {
      column: null,
      wall: null,
      beam: null
    },
    bimElements: [],
    selectedBimElementId: "",
    bimBindingSnapshot: null,
    bimVisualPanel: null,
    bimElementsById: new Map<string, TBimElement>(),
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
