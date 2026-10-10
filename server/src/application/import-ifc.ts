import type { IfcModelData, IfcModelOptions } from "../../../src/shared/bim/types";

export interface IfcImportPorts {
  parse: (bytes: Uint8Array, options: IfcModelOptions) => Promise<IfcModelData>;
  save: (projectId: string, model: IfcModelData) => Promise<{ writtenCount: number; removedCount: number }>;
}

/** Application policy: reject empty imports before touching stored model data. */
export function createIfcImportService(ports: IfcImportPorts) {
  return async (projectId: string, bytes: Uint8Array, options: IfcModelOptions) => {
    const model = await ports.parse(bytes, options);
    if (!model.importedCount) throw Object.assign(new Error("No supported IFC elements were found in the file"), { status: 422 });
    const saved = await ports.save(projectId, model);
    return { sourceModelId: model.sourceModelId, fileName: model.fileName, importedCount: saved.writtenCount, replacedCount: saved.removedCount, countsByType: model.countsByType };
  };
}
