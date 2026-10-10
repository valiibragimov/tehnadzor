export interface IfcModelOptions { fileName?: string; sourceModelId?: string; wasmPath?: string }
export interface IfcElementData {
  elementId: string; expressId: number; sourceModelId: string; type: string;
  ifcGuid: string | null; name: string | null; description: string | null; objectType: string | null;
  mark: string | null; axes: string | null; floor: string | null; hasPlacement: boolean;
  projectX: number | null; projectY: number | null; projectH: number | null;
  [key: string]: unknown;
}

export interface IfcModelData {
  sourceModelId: string; fileName: string; importedCount: number;
  countsByType: Record<string, number>; elements: IfcElementData[]; schema: string;
}
