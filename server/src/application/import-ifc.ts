import type { IfcModelData, IfcModelOptions } from "../../../src/shared/bim/types";

export interface IfcImportPorts {
  parse: (bytes: Uint8Array, options: IfcModelOptions, signal?: AbortSignal) => Promise<IfcModelData>;
  save: (projectId: string, model: IfcModelData) => Promise<{ writtenCount: number; removedCount: number }>;
}

/** Application policy: reject empty imports before touching stored model data. */
export function createIfcImportService(ports: IfcImportPorts) {
  return async (projectId: string, bytes: Uint8Array, options: IfcModelOptions, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const model = await ports.parse(bytes, options, signal);
    signal?.throwIfAborted();
    if (!model.importedCount) throw Object.assign(new Error("No supported IFC elements were found in the file"), { status: 422 });
    // Publication owns its atomicity/recovery. Once started, finish even if the client leaves.
    const saved = await ports.save(projectId, model);
    return { sourceModelId: model.sourceModelId, fileName: model.fileName, importedCount: saved.writtenCount, replacedCount: saved.removedCount, countsByType: model.countsByType };
  };
}
