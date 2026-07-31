type Input = HTMLInputElement | null;
type Select = HTMLSelectElement | null;

export interface ReinforcementDomBindings {
  document: Document;
  construction: HTMLSelectElement | null;
  reinfBimSearchInput: Input;
  reinfBimTypeFilter: Select;
  reinfBimAxesFilter: Select;
  reinfBimElementSelect: Select;
  reinfBimElementStatus: HTMLElement | null;
  reinfBimSourceCard: HTMLElement | null;
  reinfBimSourceTitle: HTMLElement | null;
  reinfBimSourceState: HTMLElement | null;
  reinfBimSourceMeta: HTMLElement | null;
  reinfBimAppliedTypeEl: HTMLElement | null;
  reinfBimAppliedFloorEl: HTMLElement | null;
  reinfBimAppliedMarkEl: HTMLElement | null;
  reinfBimAppliedAxesEl: HTMLElement | null;
  reinfBimAppliedRebarEl: HTMLElement | null;
  reinfBimSourceHint: HTMLElement | null;
  reinfBimMarkEl: Input;
  reinfBimAxesEl: Input;
  btnClearReinfBimSelection: HTMLButtonElement | null;
  reinfManualAssistNote: HTMLElement | null;
  reinfBimPanelHost: Element | null;
  reinfStairNameEl: Input;
  reinfStairNameField: HTMLElement | null;
  reinfFloorEl: Input;
  reinfAxisLetterFromEl: Select;
  reinfAxisLetterToEl: Select;
  reinfAxisNumberFromEl: Select;
  reinfAxisNumberToEl: Select;
  reinfStripAxisModeField: HTMLElement | null;
  reinfStripAxisModeEl: Select;
  reinfAxisLetterFromField: HTMLElement | null;
  reinfAxisLetterToField: HTMLElement | null;
  reinfAxisNumberFromField: HTMLElement | null;
  reinfAxisNumberToField: HTMLElement | null;
  reinfAxisLetterFromLabel: HTMLElement | null;
  reinfAxisLetterToLabel: HTMLElement | null;
  reinfAxisNumberFromLabel: HTMLElement | null;
  reinfAxisNumberToLabel: HTMLElement | null;
  reinfLocationEl: Input;
  reinfLocationFields: HTMLElement | null;
  reinfColumnFields: HTMLElement | null;
  reinfColumnFloorEl: Input;
  reinfColumnsList: HTMLElement | null;
  btnAddReinfColumn: HTMLButtonElement | null;
  reinfBeamFields: HTMLElement | null;
  reinfBeamFloorEl: Input;
  reinfBeamsList: HTMLElement | null;
  btnAddReinfBeam: HTMLButtonElement | null;
  reinfWallFields: HTMLElement | null;
  reinfWallFloorEl: Input;
  reinfWallsList: HTMLElement | null;
  reinfWallsLimitLabel: HTMLElement | null;
  btnAddReinfWall: HTMLButtonElement | null;
  reinfCommonFields: HTMLElement | null;
  projDia: Input;
  factDia: Input;
  projStep: Input;
  factStep: Input;
  projCover: Input;
  factCover: Input;
  projStepField: HTMLElement | null;
  factStepField: HTMLElement | null;
  reinfResult: HTMLElement | null;
  reinfBehaviorMessage: HTMLElement | null;
  reinfProjHoopsStepField: HTMLElement | null;
  reinfFactHoopsStepField: HTMLElement | null;
  reinfProjHoopsStepEl: Input;
  reinfFactHoopsStepEl: Input;
  reinfChecksList: HTMLElement | null;
  btnReinf: HTMLButtonElement | null;
  btnSaveReinfCheck: HTMLButtonElement | null;
  btnClearReinfForm: HTMLButtonElement | null;
  btnClearReinfChecks: HTMLButtonElement | null;
}

function input(document: Document, id: string) {
  return document.getElementById(id) as HTMLInputElement | null;
}

function select(document: Document, id: string) {
  return document.getElementById(id) as HTMLSelectElement | null;
}

function button(document: Document, id: string) {
  return document.getElementById(id) as HTMLButtonElement | null;
}

export function createReinforcementDomBindings(
  document: Document
): ReinforcementDomBindings {
  const reinfBimSourceCard = document.getElementById("reinfBimSourceCard");
  const reinfBimElementSelect = select(document, "reinfBimElementSelect");
  const projStep = input(document, "projStep");
  const factStep = input(document, "factStep");

  return {
    document,
    construction: select(document, "construction"),
    reinfBimSearchInput: input(document, "reinfBimSearchInput"),
    reinfBimTypeFilter: select(document, "reinfBimTypeFilter"),
    reinfBimAxesFilter: select(document, "reinfBimAxesFilter"),
    reinfBimElementSelect,
    reinfBimElementStatus: document.getElementById("reinfBimElementStatus"),
    reinfBimSourceCard,
    reinfBimSourceTitle: document.getElementById("reinfBimSourceTitle"),
    reinfBimSourceState: document.getElementById("reinfBimSourceState"),
    reinfBimSourceMeta: document.getElementById("reinfBimSourceMeta"),
    reinfBimAppliedTypeEl: document.getElementById("reinfBimAppliedType"),
    reinfBimAppliedFloorEl: document.getElementById("reinfBimAppliedFloor"),
    reinfBimAppliedMarkEl: document.getElementById("reinfBimAppliedMark"),
    reinfBimAppliedAxesEl: document.getElementById("reinfBimAppliedAxes"),
    reinfBimAppliedRebarEl: document.getElementById("reinfBimAppliedRebar"),
    reinfBimSourceHint: document.getElementById("reinfBimSourceHint"),
    reinfBimMarkEl: input(document, "reinfBimMark"),
    reinfBimAxesEl: input(document, "reinfBimAxes"),
    btnClearReinfBimSelection: button(
      document,
      "btnClearReinfBimSelection"
    ),
    reinfManualAssistNote: document.getElementById("reinfManualAssistNote"),
    reinfBimPanelHost:
      reinfBimSourceCard?.parentElement ||
      reinfBimElementSelect?.closest(".geo-bim-card") ||
      null,
    reinfStairNameEl: input(document, "reinfStairName"),
    reinfStairNameField: document.getElementById("reinfStairNameField"),
    reinfFloorEl: input(document, "reinfFloor"),
    reinfAxisLetterFromEl: select(document, "reinfAxisLetterFrom"),
    reinfAxisLetterToEl: select(document, "reinfAxisLetterTo"),
    reinfAxisNumberFromEl: select(document, "reinfAxisNumberFrom"),
    reinfAxisNumberToEl: select(document, "reinfAxisNumberTo"),
    reinfStripAxisModeField: document.getElementById(
      "reinfStripAxisModeField"
    ),
    reinfStripAxisModeEl: select(document, "reinfStripAxisMode"),
    reinfAxisLetterFromField: document.getElementById(
      "reinfAxisLetterFromField"
    ),
    reinfAxisLetterToField: document.getElementById(
      "reinfAxisLetterToField"
    ),
    reinfAxisNumberFromField: document.getElementById(
      "reinfAxisNumberFromField"
    ),
    reinfAxisNumberToField: document.getElementById(
      "reinfAxisNumberToField"
    ),
    reinfAxisLetterFromLabel: document.getElementById(
      "reinfAxisLetterFromLabel"
    ),
    reinfAxisLetterToLabel: document.getElementById(
      "reinfAxisLetterToLabel"
    ),
    reinfAxisNumberFromLabel: document.getElementById(
      "reinfAxisNumberFromLabel"
    ),
    reinfAxisNumberToLabel: document.getElementById(
      "reinfAxisNumberToLabel"
    ),
    reinfLocationEl: input(document, "reinfLocation"),
    reinfLocationFields: document.getElementById("reinfLocationFields"),
    reinfColumnFields: document.getElementById("reinfColumnFields"),
    reinfColumnFloorEl: input(document, "reinfColumnFloor"),
    reinfColumnsList: document.getElementById("reinfColumnsList"),
    btnAddReinfColumn: button(document, "btnAddReinfColumn"),
    reinfBeamFields: document.getElementById("reinfBeamFields"),
    reinfBeamFloorEl: input(document, "reinfBeamFloor"),
    reinfBeamsList: document.getElementById("reinfBeamsList"),
    btnAddReinfBeam: button(document, "btnAddReinfBeam"),
    reinfWallFields: document.getElementById("reinfWallFields"),
    reinfWallFloorEl: input(document, "reinfWallFloor"),
    reinfWallsList: document.getElementById("reinfWallsList"),
    reinfWallsLimitLabel: document.getElementById("reinfWallsLimitLabel"),
    btnAddReinfWall: button(document, "btnAddReinfWall"),
    reinfCommonFields: document.getElementById("reinfCommonFields"),
    projDia: input(document, "projDia"),
    factDia: input(document, "factDia"),
    projStep,
    factStep,
    projCover: input(document, "projCover"),
    factCover: input(document, "factCover"),
    projStepField: projStep?.parentElement || null,
    factStepField: factStep?.parentElement || null,
    reinfResult: document.getElementById("reinforcementResult"),
    reinfBehaviorMessage: document.getElementById("reinfBehaviorMessage"),
    reinfProjHoopsStepField: document.getElementById(
      "reinfProjHoopsStepField"
    ),
    reinfFactHoopsStepField: document.getElementById(
      "reinfFactHoopsStepField"
    ),
    reinfProjHoopsStepEl: input(document, "reinfProjHoopsStep"),
    reinfFactHoopsStepEl: input(document, "reinfFactHoopsStep"),
    reinfChecksList: document.getElementById("reinfChecksList"),
    btnReinf: button(document, "btnReinf"),
    btnSaveReinfCheck: button(document, "btnSaveReinfCheck"),
    btnClearReinfForm: button(document, "btnClearReinfForm"),
    btnClearReinfChecks: button(document, "btnClearReinfChecks")
  };
}
