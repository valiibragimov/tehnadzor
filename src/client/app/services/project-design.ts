import { normalizeConstructionKey } from "../construction.js";

function normalizeProjectId(value) {
  if (value == null) return "";
  return String(value).trim();
}

function parseProjectGeoFloat(value) {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

interface ProjectDesignInputRefs {
  projX?: HTMLInputElement | null;
  projY?: HTMLInputElement | null;
  projH?: HTMLInputElement | null;
  projDia?: HTMLInputElement | null;
  projStep?: HTMLInputElement | null;
  projCover?: HTMLInputElement | null;
  projThick?: HTMLInputElement | null;
  tolThick?: HTMLInputElement | null;
  tolVert?: HTMLInputElement | null;
  mark?: HTMLInputElement | HTMLSelectElement | null;
}

interface ProjectDesignFormRefs extends ProjectDesignInputRefs {
  dateInput?: HTMLInputElement | null;
  construction?: HTMLSelectElement | null;
  setConstructionAndTrigger?: (value: string) => void;
  preserveConstruction?: boolean;
  getCurrentConstructionPreference?: () => string | null;
}

export function collectProjectDesignPayload({ inputs, parseDecimal }: { inputs: ProjectDesignInputRefs; parseDecimal: (value: unknown) => number | null }) {
  const {
    projX,
    projY,
    projH,
    projDia,
    projStep,
    projCover,
    projThick,
    tolThick,
    tolVert,
    mark
  } = inputs;

  const projectGeo = {
    projX: parseProjectGeoFloat(projX?.value),
    projY: parseProjectGeoFloat(projY?.value),
    projH: parseProjectGeoFloat(projH?.value)
  };

  const reinfDesign = {
    projDia: parseDecimal(projDia ? projDia.value : null),
    projStep: parseDecimal(projStep ? projStep.value : null),
    projCover: parseDecimal(projCover ? projCover.value : null)
  };

  const geomDesign = {
    projThick: parseDecimal(projThick ? projThick.value : null),
    tolThick: parseDecimal(tolThick ? tolThick.value : null),
    tolVert: parseDecimal(tolVert ? tolVert.value : null)
  };

  const strengthDesign = {
    mark: (mark && mark.value.trim()) ? mark.value.trim() : null
  };

  return {
    projectGeo,
    reinfDesign,
    geomDesign,
    strengthDesign
  };
}

export async function saveProjectDesignToProject({
  projectId,
  currentUserId,
  getProjectDocSnapshot,
  mergeProjectDoc,
  parseDecimal,
  getEngineerValue,
  projectNameValue,
  dateValue,
  constructionValue,
  inputs
}: {
  projectId: string | null;
  currentUserId: string | null;
  getProjectDocSnapshot: (projectId: string) => Promise<{ exists: () => boolean; data: () => Record<string, unknown> }>;
  mergeProjectDoc: (projectId: string, payload: Record<string, unknown>) => Promise<unknown>;
  parseDecimal: (value: unknown) => number | null;
  getEngineerValue: (fallback?: string) => string;
  projectNameValue: string;
  dateValue: string;
  constructionValue: string;
  inputs: ProjectDesignInputRefs;
}) {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) return;

  const { projectGeo, reinfDesign, geomDesign, strengthDesign } = collectProjectDesignPayload({
    inputs,
    parseDecimal
  });

  const currentDoc = await getProjectDocSnapshot(normalizedProjectId);
  const currentData = currentDoc.exists() ? currentDoc.data() : {};
  const normalizedOwnerUid = String(
    currentData.ownerUid || currentData.createdBy || currentUserId || ""
  ).trim();
  const normalizedCreatedBy = String(
    currentData.createdBy || currentData.ownerUid || currentUserId || ""
  ).trim();
  const normalizedContractor = String(currentData.contractorName || "").trim();

  await mergeProjectDoc(normalizedProjectId, {
    name: String(currentData.name || projectNameValue || ""),
    engineer: getEngineerValue(String(currentData.engineer || "")),
    date: dateValue || "",
    construction: constructionValue || "",
    ownerUid: normalizedOwnerUid,
    createdBy: normalizedCreatedBy,
    contractorName: normalizedContractor,
    projectGeo,
    reinfDesign,
    geomDesign,
    strengthDesign
  });
}

export function applyProjectDataToForm(data: Record<string, any>, refs: ProjectDesignFormRefs) {
  const {
    dateInput,
    construction,
    setConstructionAndTrigger,
    preserveConstruction = false,
    getCurrentConstructionPreference,
    projX,
    projY,
    projH,
    projDia,
    projStep,
    projCover,
    projThick,
    tolThick,
    tolVert,
    mark
  } = refs;

  if (dateInput) dateInput.value = data.date || "";
  if (construction) {
    const projectConstruction = normalizeConstructionKey(data.construction, "");
    const preferredConstructionRaw =
      typeof getCurrentConstructionPreference === "function"
        ? getCurrentConstructionPreference()
        : null;
    const preferredConstruction = normalizeConstructionKey(preferredConstructionRaw, "");
    const shouldPreserveCurrentConstruction =
      preserveConstruction ||
      (!!preferredConstruction && construction.dataset.machineValue === preferredConstruction);

    if (projectConstruction && !shouldPreserveCurrentConstruction) {
      if (typeof setConstructionAndTrigger === "function") {
        setConstructionAndTrigger(projectConstruction);
      } else {
        construction.dataset.machineValue = projectConstruction;
      }
    }
  }

  const parseProjectGeoNumber = (value) => {
    if (value === "" || value == null) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const isLegacyDefaultProjectGeo = (geo) => {
    if (!geo || typeof geo !== "object") return false;
    const x = parseProjectGeoNumber(geo.projX);
    const y = parseProjectGeoNumber(geo.projY);
    const h = parseProjectGeoNumber(geo.projH);
    return x === 1 && y === 1 && h === 1;
  };

  if (data.projectGeo && !isLegacyDefaultProjectGeo(data.projectGeo)) {
    if (projX) projX.value = data.projectGeo.projX ?? "";
    if (projY) projY.value = data.projectGeo.projY ?? "";
    if (projH) projH.value = data.projectGeo.projH ?? "";
  } else {
    if (data.projectGeo && isLegacyDefaultProjectGeo(data.projectGeo)) {
      console.log("[loadProjectData] Игнорируем legacy-значения projectGeo=1/1/1");
    }
    if (projX) projX.value = "";
    if (projY) projY.value = "";
    if (projH) projH.value = "";
  }

  if (data.reinfDesign) {
    if (projDia) projDia.value = data.reinfDesign.projDia ?? "";
    if (projStep) projStep.value = data.reinfDesign.projStep ?? "";
    if (projCover) projCover.value = data.reinfDesign.projCover ?? "";
  } else {
    if (projDia) projDia.value = "";
    if (projStep) projStep.value = "";
    if (projCover) projCover.value = "";
  }

  if (data.geomDesign) {
    if (projThick) projThick.value = data.geomDesign.projThick ?? "";
    if (tolThick) tolThick.value = String(data.geomDesign.tolThick ?? 10);
    if (tolVert) tolVert.value = String(data.geomDesign.tolVert ?? 8);
  } else {
    if (projThick) projThick.value = "";
    if (tolThick) tolThick.value = "10";
    if (tolVert) tolVert.value = "8";
  }

  if (data.strengthDesign) {
    if (mark) mark.value = data.strengthDesign.mark ?? "";
  } else {
    if (mark) mark.value = "";
  }
}

export async function loadProjectDataIntoForm(projectId, deps) {
  const normalizedProjectId = normalizeProjectId(projectId);
  if (!normalizedProjectId) {
    console.warn("loadProjectData: невалидный projectId");
    return;
  }

  const {
    getProjectDocSnapshot,
    dateInput,
    construction,
    setConstructionAndTrigger,
    preserveConstruction,
    getCurrentConstructionPreference,
    projX,
    projY,
    projH,
    projDia,
    projStep,
    projCover,
    projThick,
    tolThick,
    tolVert,
    mark
  } = deps;

  try {
    const snap = await getProjectDocSnapshot(normalizedProjectId);
    if (!snap.exists()) return;

    const data = snap.data();
    applyProjectDataToForm(data, {
      dateInput,
      construction,
      setConstructionAndTrigger,
      preserveConstruction,
      getCurrentConstructionPreference,
      projX,
      projY,
      projH,
      projDia,
      projStep,
      projCover,
      projThick,
      tolThick,
      tolVert,
      mark
    });

    console.log("Проектные данные загружены", data);
  } catch (err) {
    console.error("Ошибка загрузки проекта:", err);
  }
}

export function createProjectDesignAutosave({
  delayMs = 500,
  canSchedule,
  onSave,
  onError
}) {
  let timeoutId = null;

  const schedule = () => {
    if (typeof canSchedule === "function" && !canSchedule()) return;

    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      Promise.resolve(onSave?.()).catch((error) => {
        if (typeof onError === "function") {
          onError(error);
          return;
        }
        console.error("Project design autosave error:", error);
      });
    }, delayMs);
  };

  const cancel = () => {
    if (!timeoutId) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  };

  return {
    schedule,
    cancel
  };
}
