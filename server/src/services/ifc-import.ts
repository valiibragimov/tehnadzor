import { readIfcModel } from "../../../src/shared/bim/ifc-model";
export function parseIfcElements(bytes: Uint8Array, options: { sourceModelId?: string; fileName?: string } = {}) {
  return readIfcModel(bytes, options);
}
