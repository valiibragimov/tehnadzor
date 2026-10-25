export type PhysicalDimensions = Record<string, { project: string | number | null; actual: string | number | null }>;

export function commonDimensionKeys(construction: string, pileElement = "") {
  if (construction === "elevator_shaft") return ["clearLength", "clearWidth"];
  if (construction === "pile_grillage" && pileElement === "pile") return ["diameter"];
  return ["excavation", "foundation_slab", "strip_foundation", "pile_grillage", "floor_slab", "stair_core"].includes(construction) ? ["length", "width"] : [];
}

export function elementDimensionKeys(kind: string) {
  return kind === "walls" ? ["length", "height"] : kind === "columns" ? ["height"] : ["length"];
}
