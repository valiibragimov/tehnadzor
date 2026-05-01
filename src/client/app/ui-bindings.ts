interface ProjectSelectorBindingOptions {
  projectSelector: HTMLSelectElement | null;
  setCurrentProjectId: (projectId: string | null) => unknown;
  setModulesEnabled: (enabled: boolean) => void;
  resetFormForNewProject: () => void | Promise<void>;
  selectProject: (projectId: string) => Promise<unknown> | unknown;
}

interface GeoBimBindingsOptions {
  geoBimElementSelect: HTMLSelectElement | null;
  onGeoBimElementSelect: (elementId: string) => void;
  geoBimSearchInput: HTMLInputElement | null;
  onGeoBimSearchInput: () => void;
  geoBimTypeFilter: HTMLSelectElement | null;
  onGeoBimTypeFilterChange: () => void;
  geoBimAxesFilter: HTMLSelectElement | null;
  onGeoBimAxesFilterChange: () => void;
  btnClearGeoBimSelection: HTMLButtonElement | null;
  onGeoBimSelectionClear: () => void;
}

interface IfcBindingsOptions {
  ifcFileInput: HTMLInputElement | null;
  btnImportIfc: HTMLButtonElement | null;
  btnClearIfcImport: HTMLButtonElement | null;
  btnChooseAnotherIfc: HTMLButtonElement | null;
  btnResetSelectedIfc: HTMLButtonElement | null;
  btnIfcMoreActions: HTMLButtonElement | null;
  ifcActionsMenu: HTMLElement | null;
  isIfcOperationInFlight: () => boolean;
  syncIfcImportControls: () => void;
  setBimImportStatus: (message: string, tone?: string) => void;
  handleIfcImport: () => Promise<unknown> | unknown;
  handleIfcImportDelete: () => Promise<unknown> | unknown;
  toggleIfcActionsMenu: () => void;
  closeIfcActionsMenu: () => void;
  clearPendingIfcSelection: () => void;
  positionIfcActionsMenu: () => void;
}

export function initProjectSelectorBinding({
  projectSelector,
  setCurrentProjectId,
  setModulesEnabled,
  resetFormForNewProject,
  selectProject
}: ProjectSelectorBindingOptions) {
  if (!projectSelector) return;

  projectSelector.addEventListener("change", async () => {
    const projectId = projectSelector.value;
    if (!projectId || projectId === "Нет объектов" || projectId.trim() === "") {
      setCurrentProjectId(null);
      setModulesEnabled(false);
      await resetFormForNewProject();
      return;
    }

    await selectProject(projectId);
  });
}

export function initGeoBimBindings({
  geoBimElementSelect,
  onGeoBimElementSelect,
  geoBimSearchInput,
  onGeoBimSearchInput,
  geoBimTypeFilter,
  onGeoBimTypeFilterChange,
  geoBimAxesFilter,
  onGeoBimAxesFilterChange,
  btnClearGeoBimSelection,
  onGeoBimSelectionClear
}: GeoBimBindingsOptions) {
  if (geoBimElementSelect) {
    geoBimElementSelect.addEventListener("change", () => {
      onGeoBimElementSelect(geoBimElementSelect.value);
    });
  }

  if (geoBimSearchInput) {
    geoBimSearchInput.addEventListener("input", onGeoBimSearchInput);
  }

  if (geoBimTypeFilter) {
    geoBimTypeFilter.addEventListener("change", onGeoBimTypeFilterChange);
  }

  if (geoBimAxesFilter) {
    geoBimAxesFilter.addEventListener("change", onGeoBimAxesFilterChange);
  }

  if (btnClearGeoBimSelection) {
    btnClearGeoBimSelection.addEventListener("click", onGeoBimSelectionClear);
  }
}

export function initIfcBindings({
  ifcFileInput,
  btnImportIfc,
  btnClearIfcImport,
  btnChooseAnotherIfc,
  btnResetSelectedIfc,
  btnIfcMoreActions,
  ifcActionsMenu,
  isIfcOperationInFlight,
  syncIfcImportControls,
  setBimImportStatus,
  handleIfcImport,
  handleIfcImportDelete,
  toggleIfcActionsMenu,
  closeIfcActionsMenu,
  clearPendingIfcSelection,
  positionIfcActionsMenu
}: IfcBindingsOptions) {
  if (ifcFileInput) {
    ifcFileInput.addEventListener("change", () => {
      const file = ifcFileInput.files?.[0];
      if (file) {
        setBimImportStatus("Файл готов к импорту.", "muted");
      }
      syncIfcImportControls();
    });
  }

  if (btnImportIfc) {
    btnImportIfc.addEventListener("click", async () => {
      if (isIfcOperationInFlight()) return;
      if (!ifcFileInput?.files?.[0]) {
        ifcFileInput?.click();
        return;
      }
      await handleIfcImport();
    });
  }

  if (btnIfcMoreActions) {
    btnIfcMoreActions.addEventListener("click", (event) => {
      if (isIfcOperationInFlight()) return;
      event.stopPropagation();
      toggleIfcActionsMenu();
    });
  }

  if (btnChooseAnotherIfc) {
    btnChooseAnotherIfc.addEventListener("click", () => {
      if (isIfcOperationInFlight()) return;
      closeIfcActionsMenu();
      ifcFileInput?.click();
    });
  }

  if (btnResetSelectedIfc) {
    btnResetSelectedIfc.addEventListener("click", () => {
      if (isIfcOperationInFlight()) return;
      clearPendingIfcSelection();
      closeIfcActionsMenu();
      setBimImportStatus("Выбор IFC очищен.", "muted");
      syncIfcImportControls();
    });
  }

  if (btnClearIfcImport) {
    btnClearIfcImport.addEventListener("click", async () => {
      if (isIfcOperationInFlight()) return;
      closeIfcActionsMenu();
      await handleIfcImportDelete();
    });
  }

  document.addEventListener("click", (event) => {
    if (!ifcActionsMenu?.classList.contains("open")) return;
    const clickedInsideIfcMenu =
      event.target instanceof Element && event.target.closest(".bim-import-menu");
    if (!clickedInsideIfcMenu) {
      closeIfcActionsMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ifcActionsMenu?.classList.contains("open")) {
      closeIfcActionsMenu();
    }
  });

  window.addEventListener("resize", () => {
    syncIfcImportControls();
    if (ifcActionsMenu?.classList.contains("open")) {
      positionIfcActionsMenu();
    }
  });
}
