export interface StrengthDomBindings {
  document: Document;
  construction: HTMLSelectElement | null;
  bimSearchInput: HTMLInputElement | null;
  bimTypeFilter: HTMLSelectElement | null;
  bimAxesFilter: HTMLSelectElement | null;
  bimElementSelect: HTMLSelectElement | null;
  bimElementStatus: HTMLElement | null;
  bimSourceCard: HTMLElement | null;
  bimSourceTitle: HTMLElement | null;
  bimSourceState: HTMLElement | null;
  bimSourceMeta: HTMLElement | null;
  bimAppliedType: HTMLInputElement | null;
  bimAppliedFloor: HTMLInputElement | null;
  bimAppliedMark: HTMLInputElement | null;
  bimAppliedAxes: HTMLInputElement | null;
  bimAppliedStrength: HTMLInputElement | null;
  bimSourceHint: HTMLElement | null;
  bimMark: HTMLInputElement | null;
  bimAxes: HTMLInputElement | null;
  clearBimSelectionButton: HTMLButtonElement | null;
  manualAssistNote: HTMLElement | null;
  bimPanelHost: HTMLElement | null;
  floor: HTMLInputElement | null;
  mark: HTMLSelectElement | null;
  days: HTMLInputElement | null;
  actual: HTMLInputElement | null;
  result: HTMLElement | null;
  behaviorMessage: HTMLElement | null;
  unsupportedOnlyMessage: HTMLElement | null;
  stairNameField: HTMLElement | null;
  stairName: HTMLInputElement | null;
  canvas: HTMLCanvasElement | null;
  locationFields: HTMLElement | null;
  axisLetterFrom: HTMLSelectElement | null;
  axisLetterTo: HTMLSelectElement | null;
  axisNumberFrom: HTMLSelectElement | null;
  axisNumberTo: HTMLSelectElement | null;
  location: HTMLInputElement | null;
  markingFields: HTMLElement | null;
  marking: HTMLInputElement | null;
  wallFields: HTMLElement | null;
  wallBindingType: HTMLSelectElement | null;
  wallLetterNumbers: HTMLElement | null;
  wallNumberLetters: HTMLElement | null;
  wallLetterAxis: HTMLSelectElement | null;
  wallNumberAxis1: HTMLSelectElement | null;
  wallNumberAxis2: HTMLSelectElement | null;
  wallNumberAxis: HTMLSelectElement | null;
  wallLetterAxis1: HTMLSelectElement | null;
  wallLetterAxis2: HTMLSelectElement | null;
  checksList: HTMLElement | null;
  checkButton: HTMLButtonElement | null;
  saveButton: HTMLButtonElement | null;
  clearFormButton: HTMLButtonElement | null;
  clearChecksButton: HTMLButtonElement | null;
  workAreaElements: HTMLElement[];
}

function byId<TElement extends HTMLElement>(
  document: Document,
  id: string
) {
  return document.getElementById(id) as TElement | null;
}

export function createStrengthDomBindings(
  document: Document
): StrengthDomBindings {
  const bimSourceCard = byId<HTMLElement>(document, "strengthBimSourceCard");
  const bimElementSelect = byId<HTMLSelectElement>(
    document,
    "strengthBimElementSelect"
  );

  return {
    document,
    construction: byId<HTMLSelectElement>(document, "construction"),
    bimSearchInput: byId<HTMLInputElement>(
      document,
      "strengthBimSearchInput"
    ),
    bimTypeFilter: byId<HTMLSelectElement>(
      document,
      "strengthBimTypeFilter"
    ),
    bimAxesFilter: byId<HTMLSelectElement>(
      document,
      "strengthBimAxesFilter"
    ),
    bimElementSelect,
    bimElementStatus: byId(document, "strengthBimElementStatus"),
    bimSourceCard,
    bimSourceTitle: byId(document, "strengthBimSourceTitle"),
    bimSourceState: byId(document, "strengthBimSourceState"),
    bimSourceMeta: byId(document, "strengthBimSourceMeta"),
    bimAppliedType: byId(document, "strengthBimAppliedType"),
    bimAppliedFloor: byId(document, "strengthBimAppliedFloor"),
    bimAppliedMark: byId(document, "strengthBimAppliedMark"),
    bimAppliedAxes: byId(document, "strengthBimAppliedAxes"),
    bimAppliedStrength: byId(document, "strengthBimAppliedStrength"),
    bimSourceHint: byId(document, "strengthBimSourceHint"),
    bimMark: byId(document, "strengthBimMark"),
    bimAxes: byId(document, "strengthBimAxes"),
    clearBimSelectionButton: byId(
      document,
      "btnClearStrengthBimSelection"
    ),
    manualAssistNote: byId(document, "strengthManualAssistNote"),
    bimPanelHost: (
      bimSourceCard?.parentElement ||
      bimElementSelect?.closest(".geo-bim-card") ||
      null
    ) as HTMLElement | null,
    floor: byId(document, "strengthFloor"),
    mark: byId(document, "mark"),
    days: byId(document, "days"),
    actual: byId(document, "actual"),
    result: byId(document, "strengthResult"),
    behaviorMessage: byId(document, "strengthBehaviorMessage"),
    unsupportedOnlyMessage: byId(
      document,
      "strengthUnsupportedOnlyMessage"
    ),
    stairNameField: byId(document, "strengthStairNameField"),
    stairName: byId(document, "strengthStairName"),
    canvas: byId(document, "strengthChart"),
    locationFields: byId(document, "strengthLocationFields"),
    axisLetterFrom: byId(document, "strengthAxisLetterFrom"),
    axisLetterTo: byId(document, "strengthAxisLetterTo"),
    axisNumberFrom: byId(document, "strengthAxisNumberFrom"),
    axisNumberTo: byId(document, "strengthAxisNumberTo"),
    location: byId(document, "strengthLocation"),
    markingFields: byId(document, "strengthMarkingFields"),
    marking: byId(document, "strengthMarking"),
    wallFields: byId(document, "strengthWallFields"),
    wallBindingType: byId(document, "strengthWallBindingType"),
    wallLetterNumbers: byId(document, "strengthWallLetterNumbers"),
    wallNumberLetters: byId(document, "strengthWallNumberLetters"),
    wallLetterAxis: byId(document, "strengthWallLetterAxis"),
    wallNumberAxis1: byId(document, "strengthWallNumberAxis1"),
    wallNumberAxis2: byId(document, "strengthWallNumberAxis2"),
    wallNumberAxis: byId(document, "strengthWallNumberAxis"),
    wallLetterAxis1: byId(document, "strengthWallLetterAxis1"),
    wallLetterAxis2: byId(document, "strengthWallLetterAxis2"),
    checksList: byId(document, "strengthChecksList"),
    checkButton: byId(document, "btnStrength"),
    saveButton: byId(document, "btnSaveStrengthCheck"),
    clearFormButton: byId(document, "btnClearStrengthForm"),
    clearChecksButton: byId(document, "btnClearStrengthChecks"),
    workAreaElements: Array.from(
      document.querySelectorAll<HTMLElement>(
        "#strength .geo-bim-card, #strength .wizard-header, " +
          "#strength .wizard-steps, #strength [data-wizard-footer]"
      )
    )
  };
}
