import { createSourceModelIdFromFile } from "./ifc-identity.js";
export { createSourceModelIdFromFile } from "./ifc-identity.js";
import { APP_CONFIG } from "../../config.js";
import { publishProjectBimModel, hideProjectBimModels } from "../repositories/bim-repository.js";
import { getBimTypeLabel } from "./bim-elements.js";
import type {
  IfcImportProgress,
  IfcImportResult,
  IfcRequirementSummary
} from "../../types/domain.js";
import {
  IFC_NANOCAD_WARNING_MESSAGE,
  shouldShowIfcCoordinateWarning
} from "./ifc-diagnostics.js";


interface IfcImportOptions {
  sourceModelId: string;
  fileName: string;
}

interface IfcImportSummaryResult extends Partial<IfcImportResult> {
  countsByLabel?: Record<string, number>;
}

interface ImportIfcIntoProjectArgs {
  projectId?: string | null;
  file?: File | null;
  onProgress?: (progress: IfcImportProgress) => void;
  onValidation?: (summary: IfcRequirementSummary) => boolean | Promise<boolean>;
}

export class IfcImportCancelledError extends Error {
  constructor(message = "Импорт отменён после проверки IFC.") {
    super(message);
    this.name = "IfcImportCancelledError";
  }
}

async function parseIfcFile(
  file: File,
  options: IfcImportOptions,
  onProgress?: (progress: IfcImportProgress) => void
): Promise<IfcImportSummaryResult> {
  if (file.size > APP_CONFIG.IFC_MAX_FILE_BYTES) {
    throw new Error(`IFC file exceeds ${Math.round(APP_CONFIG.IFC_MAX_FILE_BYTES / 1024 / 1024)} MB`);
  }
  if (typeof Worker !== "function") throw new Error("IFC import requires a browser with Web Worker support");

  return new Promise<IfcImportSummaryResult>((resolve, reject) => {
    const worker = new Worker(new URL("./ifc-import-worker.js", import.meta.url), {
      type: "module"
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("IFC import timed out"));
    }, APP_CONFIG.IFC_IMPORT_TIMEOUT_MS);
    const terminate = () => { clearTimeout(timeout); worker.terminate(); };

    worker.addEventListener("message", (event) => {
      const data = event?.data || {};
      if (data.type === "status") {
        onProgress?.(data);
        return;
      }

      if (data.type === "result") {
        terminate();
        resolve(data.result);
        return;
      }

      if (data.type === "error") {
        terminate();
        reject(new Error(data.error || "Не удалось разобрать IFC-файл."));
      }
    });

    worker.addEventListener("error", (event) => {
      terminate();
      reject(event?.error || new Error("Ошибка фонового импорта IFC."));
    });

    worker.postMessage({
      type: "parse-ifc",
      file,
      options
    });
  });
}

export function formatIfcImportSummary(result: IfcImportSummaryResult = {}) {
  const total = Number(result.importedCount || 0);
  if (!total) return "Поддерживаемые IFC-элементы не найдены.";

  const countsByType = result.countsByType || {};
  const parts = Object.entries(countsByType)
    .filter(([, count]) => Number(count) > 0)
    .map(([type, count]) => `${getBimTypeLabel(type) || type}: ${count}`);

  const suffix = parts.length ? ` (${parts.join(", ")})` : "";
  return `Импортировано ${total} элементов${suffix}.`;
}

export function formatIfcDiagnosticWarning(result: IfcImportSummaryResult = {}) {
  return shouldShowIfcCoordinateWarning(result.diagnosticSummary)
    ? IFC_NANOCAD_WARNING_MESSAGE
    : "";
}

export async function importIfcIntoProject({
  projectId,
  file,
  onProgress,
  onValidation
}: ImportIfcIntoProjectArgs) {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) {
    throw new Error("Не выбран объект для BIM-импорта.");
  }

  if (!(file instanceof File)) {
    throw new Error("Не выбран IFC-файл.");
  }

  if (!String(file.name || "").toLowerCase().endsWith(".ifc")) {
    throw new Error("Поддерживаются только файлы IFC (.ifc).");
  }

  const requestedSourceModelId = createSourceModelIdFromFile(file);
  const parsedImport = await parseIfcFile(file, {
    sourceModelId: requestedSourceModelId,
    fileName: file.name || "model.ifc"
  }, onProgress);

  onProgress?.({
    phase: "validate",
    importedCount: parsedImport.importedCount,
    sourceModelId: parsedImport.sourceModelId
  });

  if (onValidation) {
    const approved = await onValidation(parsedImport.requirementSummary);
    if (!approved) {
      throw new IfcImportCancelledError();
    }
  }

  if (!parsedImport.importedCount) {
    throw new Error("В IFC-файле не найдены поддерживаемые элементы.");
  }

  onProgress?.({
    phase: "replace",
    importedCount: parsedImport.importedCount,
    sourceModelId: parsedImport.sourceModelId
  });

  onProgress?.({
    phase: "write",
    importedCount: parsedImport.importedCount,
    sourceModelId: parsedImport.sourceModelId
  });

  const { writtenCount: importedCount, removedCount: replacedCount } = await publishProjectBimModel(
    normalizedProjectId, parsedImport.sourceModelId, parsedImport.elements as Array<{ elementId: string; sourceModelId: string; [key: string]: unknown }>
  );

  return {
    ok: true,
    projectId: normalizedProjectId,
    sourceModelId: parsedImport.sourceModelId,
    fileName: parsedImport.fileName,
    importedCount,
    replacedCount,
    countsByType: parsedImport.countsByType,
    countsByLabel: parsedImport.countsByLabel,
    diagnosticSummary: parsedImport.diagnosticSummary,
    requirementSummary: parsedImport.requirementSummary
  };
}

export async function deleteImportedBimElements({
  projectId,
  sourceModelId
}: {
  projectId?: string | null;
  sourceModelId?: string | null;
}) {
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) {
    throw new Error("Не выбран объект для очистки BIM-элементов.");
  }

  const normalizedSourceModelId = String(sourceModelId || "").trim();
  const deletedCount = await hideProjectBimModels(normalizedProjectId, normalizedSourceModelId || undefined);

  return {
    ok: true,
    projectId: normalizedProjectId,
    sourceModelId: normalizedSourceModelId || null,
    deletedCount
  };
}
