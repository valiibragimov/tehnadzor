import { normalizeConstructionKey } from "../construction.js";

export const PROJECT_ID_STORAGE_KEY = "current_project_id";

export const MODULE_SECTIONS = [
  "sectionGeo",
  "sectionReinf",
  "sectionGeom",
  "sectionStrength",
  "sectionSummary",
  "sectionJournal",
  "sectionKnowledge"
];

interface ProjectContextDeps {
  construction?: HTMLSelectElement | null;
  setConstructionAndTrigger?: (value: string) => void;
  updateReinfLocationFieldsVisibility: (force?: boolean) => void;
  updateGeoFieldsVisibility: () => void;
  updateGeomFieldsVisibility: () => void;
  updateStrengthFieldsVisibility: () => void;
}

interface SelectProjectDeps {
  setCurrentProjectId: (projectId: string | null) => void;
  setModulesEnabled: (enabled: boolean) => void;
  resetFormForNewProject: () => void;
  loadProjectData: (projectId: string, options?: Record<string, unknown>) => Promise<unknown>;
  loadGeoNodesForProject: (projectId: string) => Promise<unknown>;
  loadJournal: () => void;
  renderJournal: () => void;
  loadJournalSessionsForProject: (projectId: string) => Promise<unknown>;
  loadProjectBimElements?: (projectId: string) => Promise<unknown>;
  loadReinfChecks: () => Promise<unknown>;
  renderReinfChecks: () => void;
  loadGeomChecks: () => Promise<unknown>;
  renderGeomChecks: () => void;
  loadStrengthChecks: () => Promise<unknown>;
  renderStrengthChecks: () => void;
  nodes: Map<string, unknown>;
  reinfChecks: Map<string, unknown>;
  geomChecks: Map<string, unknown>;
  strengthChecks: Map<string, unknown>;
  state: Record<string, boolean>;
  checked: Record<string, boolean>;
  restoreSelectedProjectState?: () => { construction: string | null; source: string };
  updateSummaryTab: () => void;
}

interface LoadProjectsDeps {
  currentUserId: string | null;
  getCurrentProjectId: () => string | null;
  setCurrentProjectId: (projectId: string | null) => void;
  getProjectsByFieldSnapshot: (field: string, value: string) => Promise<{ size: number; forEach: (cb: (docSnap: { id: string; data: () => Record<string, unknown> }) => void) => void }>;
  projectSelector: HTMLSelectElement;
  resetFormForNewProject: () => void;
  setModulesEnabled: (enabled: boolean) => void;
  selectProject: (projectId: string) => Promise<unknown>;
}

function normalizeProjectId(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized === "Нет объектов") return null;
  return normalized;
}

export function readStoredProjectId(storage = globalThis.localStorage) {
  return normalizeProjectId(storage?.getItem(PROJECT_ID_STORAGE_KEY));
}

export function writeStoredProjectId(projectId, storage = globalThis.localStorage) {
  const normalized = normalizeProjectId(projectId);
  if (!normalized) {
    storage?.removeItem(PROJECT_ID_STORAGE_KEY);
    return null;
  }
  storage?.setItem(PROJECT_ID_STORAGE_KEY, normalized);
  return normalized;
}

export function clearStoredProjectId(storage = globalThis.localStorage) {
  storage?.removeItem(PROJECT_ID_STORAGE_KEY);
}

export function setModulesEnabled(enabled, sectionIds = MODULE_SECTIONS) {
  sectionIds.forEach((id) => {
    const root = document.getElementById(id);
    if (!root) return;
    root.querySelectorAll("input, select, button, textarea").forEach((el) => {
      if (el.dataset && el.dataset.ignoreLock === "1") return;
      el.disabled = !enabled;
    });
  });
}

export function restoreSelectedProjectState({
  construction,
  setConstructionAndTrigger,
  updateReinfLocationFieldsVisibility,
  updateGeoFieldsVisibility,
  updateGeomFieldsVisibility,
  updateStrengthFieldsVisibility
}: ProjectContextDeps) {
  const savedConstruction = localStorage.getItem("selected_construction");
  if (!construction) return { construction: null, source: "none" };

  const normalizedSavedConstruction = normalizeConstructionKey(savedConstruction);
  if (!normalizedSavedConstruction) {
    return { construction: null, source: "none" };
  }

  if (construction.dataset.machineValue === normalizedSavedConstruction) {
    return { construction: normalizedSavedConstruction, source: "storage" };
  }

  if (typeof setConstructionAndTrigger === "function") {
    setConstructionAndTrigger(normalizedSavedConstruction);
    return { construction: normalizedSavedConstruction, source: "storage" };
  }

  construction.dataset.machineValue = normalizedSavedConstruction;
  updateReinfLocationFieldsVisibility(true);
  updateGeoFieldsVisibility();
  updateGeomFieldsVisibility();
  updateStrengthFieldsVisibility();
  return { construction: normalizedSavedConstruction, source: "storage" };
}

export async function selectProject(projectId, deps: SelectProjectDeps) {
  const normalizedProjectId = normalizeProjectId(projectId);
  const {
    setCurrentProjectId,
    setModulesEnabled: setModulesEnabledFn,
    resetFormForNewProject,
    loadProjectData: loadProjectDataFn,
    loadGeoNodesForProject,
    loadJournal,
    renderJournal,
    loadJournalSessionsForProject,
    loadProjectBimElements,
    loadReinfChecks,
    renderReinfChecks,
    loadGeomChecks,
    renderGeomChecks,
    loadStrengthChecks,
    renderStrengthChecks,
    nodes,
    reinfChecks,
    geomChecks,
    strengthChecks,
    state,
    checked,
    restoreSelectedProjectState: restoreSelectedProjectStateFn,
    updateSummaryTab
  } = deps;

  if (!normalizedProjectId) {
    setCurrentProjectId(null);
    setModulesEnabledFn(false);
    resetFormForNewProject();
    return;
  }

  setCurrentProjectId(normalizedProjectId);
  console.log("Текущий объект:", normalizedProjectId);

  setModulesEnabledFn(true);
  const restoredState = restoreSelectedProjectStateFn?.() || { construction: null, source: "none" };
  const projectDataPromise = loadProjectDataFn(normalizedProjectId, {
    preserveConstruction: restoredState.source === "storage"
  });

  await loadGeoNodesForProject(normalizedProjectId);
  if (typeof loadProjectBimElements === "function") {
    await loadProjectBimElements(normalizedProjectId);
  }

  loadJournal();
  renderJournal();
  await loadJournalSessionsForProject(normalizedProjectId);

  await loadReinfChecks();
  renderReinfChecks();
  await loadGeomChecks();
  renderGeomChecks();
  await loadStrengthChecks();
  renderStrengthChecks();
  await projectDataPromise;

  console.log("[selectProject] Все данные загружены:", {
    geoNodes: nodes.size,
    reinfChecks: reinfChecks.size,
    geomChecks: geomChecks.size,
    strengthChecks: strengthChecks.size
  });

  state.geo = false;
  state.reinforcement = false;
  state.geometry = false;
  state.strength = false;

  checked.geo = false;
  checked.reinforcement = false;
  checked.geometry = false;
  checked.strength = false;

  updateSummaryTab();
}

export async function loadProjects(deps: LoadProjectsDeps) {
  const {
    currentUserId,
    getCurrentProjectId,
    setCurrentProjectId,
    getProjectsByFieldSnapshot,
    projectSelector,
    resetFormForNewProject,
    setModulesEnabled: setModulesEnabledFn,
    selectProject: selectProjectFn
  } = deps;

  if (!currentUserId) return;

  const querySnapshot = await getProjectsByFieldSnapshot("ownerUid", currentUserId);
  projectSelector.innerHTML = "";

  if (querySnapshot.size === 0) {
    const opt = document.createElement("option");
    opt.disabled = true;
    opt.textContent = "Нет объектов";
    projectSelector.appendChild(opt);

    setCurrentProjectId(null);
    resetFormForNewProject();
    setModulesEnabledFn(false);
    return;
  }

  querySnapshot.forEach((docSnap) => {
    const option = document.createElement("option");
    option.value = docSnap.id;
    const projectData = docSnap.data();
    const projectName = String(projectData.name || "");
    option.textContent = projectName.trim()
      ? projectName.trim()
      : `Проект ${docSnap.id.substring(0, 8)}`;
    const engineerValue = String(projectData.engineer || "");
    option.dataset.engineer = engineerValue;
    option.setAttribute("data-engineer", engineerValue);
    projectSelector.appendChild(option);
  });

  const currentProjectId = getCurrentProjectId();
  let hasCurrent = false;
  if (currentProjectId) {
    hasCurrent = Array.from(projectSelector.options).some(
      (option) => option.value === currentProjectId && option.value !== "" && option.value !== "Нет объектов"
    );
  }

  if (!hasCurrent && projectSelector.options.length > 0) {
    projectSelector.selectedIndex = 0;
    const firstProjectId = normalizeProjectId(projectSelector.value);
    if (firstProjectId) {
      setCurrentProjectId(firstProjectId);
      await selectProjectFn(firstProjectId);
    } else {
      setCurrentProjectId(null);
      setModulesEnabledFn(false);
      resetFormForNewProject();
    }
  } else if (hasCurrent) {
    projectSelector.value = currentProjectId;
    await selectProjectFn(currentProjectId);
  } else {
    setCurrentProjectId(null);
    setModulesEnabledFn(false);
    resetFormForNewProject();
  }
}
