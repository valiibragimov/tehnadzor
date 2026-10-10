export function readIfcModel(bytes: Uint8Array, options: { fileName?: string; sourceModelId?: string; wasmPath?: string }): Promise<{
  sourceModelId: string; fileName: string; importedCount: number; countsByType: Record<string, number>;
  elements: Array<Record<string, unknown>>; schema: string;
}>;
