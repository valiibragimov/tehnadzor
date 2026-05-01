import {
  getProjectsByFieldSnapshot,
  getProjectDocSnapshot
} from "./repositories/firestore-repository.js";
import {
  MODULE_SECTIONS as PROJECT_MODULE_SECTIONS,
  loadProjects as loadProjectsFromService,
  restoreSelectedProjectState as restoreSelectedProjectStateFromService,
  selectProject as selectProjectFromService,
  setModulesEnabled as setProjectModulesEnabled
} from "./services/project-context.js";
import { loadProjectDataIntoForm } from "./services/project-design.js";

interface GeoProjectDataLoadOptions {
  preserveConstruction?: boolean;
}

interface ProjectRuntimeOptions {
  getCurrentUserId: () => string | null;
  getCurrentProjectId: () => string | null;
  setCurrentProjectId: (projectId: string | null) => string | null;
  projectSelector: HTMLSelectElement | null;
  resetFormForNewProject: () => void | Promise<void>;
  loadGeoNodesForProject: (projectId: string) => Promise<unknown> | unknown;
  loadProjectBimElements: (projectId: string) => Promise<unknown> | unknown;
  loadJournal: () => Promise<unknown> | unknown;
  renderJournal: () => Promise<unknown> | unknown;
  loadJournalSessionsForProject: (projectId: string) => Promise<unknown> | unknown;
  loadReinfChecks: () => Promise<unknown> | unknown;
  renderReinfChecks: () => Promise<unknown> | unknown;
  loadGeomChecks: () => Promise<unknown> | unknown;
  renderGeomChecks: () => Promise<unknown> | unknown;
  loadStrengthChecks: () => Promise<unknown> | unknown;
  renderStrengthChecks: () => Promise<unknown> | unknown;
  nodes: Map<unknown, unknown>;
  reinfChecks: Map<unknown, unknown>;
  geomChecks: Map<unknown, unknown>;
  strengthChecks: Map<unknown, unknown>;
  state: Record<string, boolean>;
  checked: Record<string, boolean>;
  construction: HTMLSelectElement | null;
  dateInput: HTMLInputElement | null;
  setConstructionAndTrigger: (constructionType: string) => void;
  projX: HTMLInputElement | null;
  projY: HTMLInputElement | null;
  projH: HTMLInputElement | null;
  projDia: HTMLInputElement | null;
  projStep: HTMLInputElement | null;
  projCover: HTMLInputElement | null;
  projThick: HTMLInputElement | null;
  mark: HTMLInputElement | HTMLSelectElement | null;
  updateReinfLocationFieldsVisibility: (shouldReset?: boolean) => Promise<unknown> | unknown;
  updateGeoFieldsVisibility: () => Promise<unknown> | unknown;
  updateGeomFieldsVisibility: () => Promise<unknown> | unknown;
  updateStrengthFieldsVisibility: () => Promise<unknown> | unknown;
  updateSummaryTab: () => Promise<unknown> | unknown;
}

export function createProjectRuntime(options: ProjectRuntimeOptions) {
  const setModulesEnabled = (enabled: boolean) => {
    setProjectModulesEnabled(enabled, PROJECT_MODULE_SECTIONS);
  };

  const loadProjectData = (projectId: string, loadOptions: GeoProjectDataLoadOptions = {}) =>
    loadProjectDataIntoForm(projectId, {
      getProjectDocSnapshot,
      dateInput: options.dateInput,
      construction: options.construction,
      setConstructionAndTrigger: options.setConstructionAndTrigger,
      preserveConstruction: !!loadOptions.preserveConstruction,
      getCurrentConstructionPreference: () => localStorage.getItem("selected_construction"),
      projX: options.projX,
      projY: options.projY,
      projH: options.projH,
      projDia: options.projDia,
      projStep: options.projStep,
      projCover: options.projCover,
      projThick: options.projThick,
      mark: options.mark
    });

  const selectProject = (projectId: string) =>
    selectProjectFromService(projectId, {
      setCurrentProjectId: options.setCurrentProjectId,
      setModulesEnabled,
      resetFormForNewProject: options.resetFormForNewProject,
      loadProjectData,
      loadGeoNodesForProject: options.loadGeoNodesForProject as any,
      loadProjectBimElements: options.loadProjectBimElements as any,
      loadJournal: options.loadJournal as any,
      renderJournal: options.renderJournal as any,
      loadJournalSessionsForProject: options.loadJournalSessionsForProject as any,
      loadReinfChecks: options.loadReinfChecks as any,
      renderReinfChecks: options.renderReinfChecks as any,
      loadGeomChecks: options.loadGeomChecks as any,
      renderGeomChecks: options.renderGeomChecks as any,
      loadStrengthChecks: options.loadStrengthChecks as any,
      renderStrengthChecks: options.renderStrengthChecks as any,
      nodes: options.nodes as any,
      reinfChecks: options.reinfChecks as any,
      geomChecks: options.geomChecks as any,
      strengthChecks: options.strengthChecks as any,
      state: options.state,
      checked: options.checked,
      restoreSelectedProjectState: () =>
        restoreSelectedProjectStateFromService({
          construction: options.construction,
          setConstructionAndTrigger: options.setConstructionAndTrigger,
          updateReinfLocationFieldsVisibility: options.updateReinfLocationFieldsVisibility,
          updateGeoFieldsVisibility: options.updateGeoFieldsVisibility,
          updateGeomFieldsVisibility: options.updateGeomFieldsVisibility,
          updateStrengthFieldsVisibility: options.updateStrengthFieldsVisibility
        }),
      updateSummaryTab: options.updateSummaryTab
    });

  const loadProjects = () =>
    loadProjectsFromService({
      currentUserId: options.getCurrentUserId(),
      getCurrentProjectId: options.getCurrentProjectId,
      setCurrentProjectId: options.setCurrentProjectId,
      getProjectsByFieldSnapshot,
      projectSelector: options.projectSelector as HTMLSelectElement,
      resetFormForNewProject: options.resetFormForNewProject,
      setModulesEnabled,
      selectProject: selectProject as any
    });

  return {
    setModulesEnabled,
    loadProjectData,
    selectProject,
    loadProjects
  };
}
