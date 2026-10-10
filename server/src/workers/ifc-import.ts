import { parseIfcElements } from "../services/ifc-import";
import { InvalidIfcModelError } from "../../../src/shared/bim/ifc-model";
export default async function importIfc(task: { bytes: Uint8Array; options: { sourceModelId?: string; fileName?: string } }) {
  try { return { ok: true as const, model: await parseIfcElements(task.bytes, task.options) }; }
  catch (error) {
    if (error instanceof InvalidIfcModelError) return { ok: false as const, error: error.message };
    throw error;
  }
}
