import { analyzeIfcModelDiagnostics } from "./ifc-diagnostics.js";
import { analyzeIfcRequirements } from "./ifc-requirements.js";
import { getBimTypeLabel } from "./bim-elements.js";
import type { BimElement } from "../../types/domain.js";

export async function parseIfcElements(source: Uint8Array | string, options: { fileName?: string; sourceModelId?: string } = {}) {
  const bytes = typeof source === "string" ? new TextEncoder().encode(source) : source;
  const adapterUrl = new URL("../vendor/ifc-model.bundle.js", import.meta.url);
  const { readIfcModel } = await import(adapterUrl.href) as typeof import("../vendor/ifc-model.bundle.js");
  const result = await readIfcModel(bytes, { ...options, wasmPath: new URL("../vendor/", import.meta.url).href });
  const elements = result.elements as Array<Partial<BimElement> & Record<string, unknown>>;
  const header = new TextDecoder().decode(bytes.subarray(0, 262144));
  return { ...result, elements,
    countsByLabel: Object.fromEntries(Object.entries(result.countsByType).map(([type, count]) => [getBimTypeLabel(type) || type, count])),
    diagnosticSummary: analyzeIfcModelDiagnostics(header, elements),
    requirementSummary: analyzeIfcRequirements(header, elements)
  };
}
