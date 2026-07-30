import {
  validateProject,
  showConfirm,
  normalizeMarking
} from "../../utils.js";
import { getConstructionLabel } from "../construction.js";
import { ensureChartJsLoaded } from "../ui/lazy-libs.js";
import {
  createStrengthDomBindings,
  createStrengthRuntime,
  type StrengthChartConstructor,
  type StrengthCheckRecord,
  type StrengthRuntime,
  type StrengthService,
  type StrengthState
} from "../../features/inspections/strength/index.js";
import { renderRegulatoryBasisHtml } from "../services/regulatory-basis.js";
import {
  buildBimElementFilterOptions,
  buildBimElementOptionLabel,
  buildBimElementSearchText,
  formatBimElementLabel,
  getTehnadzorTypeByBimType,
  normalizeProjectBimElement,
  sortProjectBimElements
} from "../services/bim-elements.js";
import { ensureBimVisualPanel } from "../services/bim-visual-panel.js";
import {
  getCurrentIfcFileFromInput
} from "../services/bim-runtime-context.js";
import { onAppTabActivated } from "../services/module-activation.js";
import { APP_STORAGE_KEYS } from "../storage.js";

export interface StrengthModuleDependencies {
  state: StrengthState;
  service: StrengthService;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  getCurrentProjectId(): string | null;
  updateSummary(): unknown;
  addJournalEntry(params: Record<string, unknown>): unknown;
  upsertJournalEntry(params: Record<string, unknown>): unknown;
  notifyFirestoreSyncStatus(docRef: unknown): unknown;
  showNotification(message: string, tone?: string): void;
  setConstruction(
    construction: string,
    subtype?: string,
    pileElement?: string
  ): unknown;
}

let dependencies: StrengthModuleDependencies | null = null;
let runtime: StrengthRuntime | null = null;

export function configureStrengthModule(
  nextDependencies: StrengthModuleDependencies
) {
  dependencies = nextDependencies;
}

function getDependencies() {
  if (!dependencies) {
    throw new Error("Strength module dependencies are not configured.");
  }
  return dependencies;
}

const BIM_MANUAL_MODE_MESSAGE = "";
const BIM_LOAD_ERROR_MESSAGE = "Не удалось загрузить BIM-элементы. Можно продолжить ручной ввод.";

const getCurrentProjectId = () => getDependencies().getCurrentProjectId();
const getCurrentIfcFile = getCurrentIfcFileFromInput;
let strengthInitialized = false;
let strengthBimElements = [];
let selectedStrengthBimElementId = "";
let strengthBimBindingSnapshot = null;
let strengthBimVisualPanel = null;
const strengthBimElementsById = new Map();
const strengthBimFilters = {
  search: "",
  type: "all",
  axes: "all"
};

const strengthDom = createStrengthDomBindings(document);
const {
  construction,
  bimSearchInput: strengthBimSearchInput,
  bimTypeFilter: strengthBimTypeFilter,
  bimAxesFilter: strengthBimAxesFilter,
  bimElementSelect: strengthBimElementSelect,
  bimElementStatus: strengthBimElementStatus,
  bimSourceCard: strengthBimSourceCard,
  bimSourceTitle: strengthBimSourceTitle,
  bimSourceState: strengthBimSourceState,
  bimSourceMeta: strengthBimSourceMeta,
  bimAppliedType: strengthBimAppliedTypeEl,
  bimAppliedFloor: strengthBimAppliedFloorEl,
  bimAppliedMark: strengthBimAppliedMarkEl,
  bimAppliedAxes: strengthBimAppliedAxesEl,
  bimAppliedStrength: strengthBimAppliedStrengthEl,
  bimSourceHint: strengthBimSourceHint,
  bimMark: strengthBimMarkEl,
  bimAxes: strengthBimAxesEl,
  clearBimSelectionButton: btnClearStrengthBimSelection,
  manualAssistNote: strengthManualAssistNote,
  bimPanelHost: strengthBimPanelHost,
  floor: strengthFloorEl,
  marking: strengthMarkingEl,
  axisLetterFrom: strengthAxisLetterFromEl,
  axisLetterTo: strengthAxisLetterToEl,
  axisNumberFrom: strengthAxisNumberFromEl,
  axisNumberTo: strengthAxisNumberToEl
} = strengthDom;

function ensureStrengthBimVisualSelector() {
  if (strengthBimVisualPanel) return strengthBimVisualPanel;

  strengthBimVisualPanel = ensureBimVisualPanel({
    host: strengthBimPanelHost,
    sourceCard: strengthBimSourceCard,
    getAllElements: () => strengthBimElements,
    getFilteredElements: () => getFilteredStrengthBimElements(),
    getSelectedElement: () => getSelectedStrengthBimElement(),
    getSelectedId: () => selectedStrengthBimElementId,
    getCurrentProjectId,
    getCurrentIfcFile,
    onSelect: (elementId) => {
      applyStrengthBimElementSelection(elementId);
    },
    labelBuilder: (element) => buildBimElementOptionLabel(element),
    moduleKey: "strength"
  });

  return strengthBimVisualPanel;
}

function renderStrengthBimVisualPanel() {
  ensureStrengthBimVisualSelector()?.render();
}

function normalizeStrengthBimValue(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function hasStrengthBimValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function formatStrengthBimDisplayValue(value, fallback = "Нет данных") {
  return hasStrengthBimValue(value) ? String(value) : fallback;
}

function formatStrengthBimShortGuid(value) {
  const normalized = normalizeStrengthBimValue(value);
  if (!normalized) return null;
  return normalized.length > 16
    ? `${normalized.slice(0, 6)}...${normalized.slice(-6)}`
    : normalized;
}

function matchesStrengthBimText(currentValue, bimValue) {
  return normalizeStrengthBimValue(currentValue) === normalizeStrengthBimValue(bimValue);
}

function matchesStrengthBimMark(currentValue, bimValue) {
  return normalizeMarking(currentValue) === normalizeMarking(bimValue);
}

function getSelectedStrengthBimElement() {
  return strengthBimElementsById.get(selectedStrengthBimElementId) || null;
}

function getStrengthBimFieldShell(fieldEl) {
  if (!fieldEl) return null;
  return fieldEl.closest("div");
}

function setStrengthBimFieldAutofilled(fieldEl, isAutofilled) {
  const nextState = Boolean(isAutofilled);
  const shell = getStrengthBimFieldShell(fieldEl);

  if (shell) {
    shell.classList.toggle("geo-bim-field--autofilled", nextState);
  }
  if (fieldEl) {
    fieldEl.classList.toggle("geo-bim-input--autofilled", nextState);
  }
}

function clearStrengthStaticBimFieldHighlights() {
  [
    strengthBimMarkEl,
    strengthBimAxesEl,
    strengthFloorEl,
    strengthAxisLetterFromEl,
    strengthAxisLetterToEl,
    strengthAxisNumberFromEl,
    strengthAxisNumberToEl,
    strengthMarkingEl
  ].forEach((fieldEl) => setStrengthBimFieldAutofilled(fieldEl, false));
}

function parseSimpleStrengthAxes(rawAxes) {
  const axesValue = String(rawAxes || "").trim();
  if (!axesValue) return null;

  const normalized = axesValue.replace(/\s+/g, "").toUpperCase();
  const letterFirst = normalized.match(/^([A-ZА-ЯЁ])[-–—]([A-ZА-ЯЁ])[,;/]?(\d+)[-–—](\d+)$/u);
  if (letterFirst) {
    return {
      axisLetterFrom: letterFirst[1],
      axisLetterTo: letterFirst[2],
      axisNumberFrom: letterFirst[3],
      axisNumberTo: letterFirst[4]
    };
  }

  const numberFirst = normalized.match(/^(\d+)[-–—](\d+)[,;/]?([A-ZА-ЯЁ])[-–—]([A-ZА-ЯЁ])$/u);
  if (!numberFirst) return null;

  return {
    axisLetterFrom: numberFirst[3],
    axisLetterTo: numberFirst[4],
    axisNumberFrom: numberFirst[1],
    axisNumberTo: numberFirst[2]
  };
}

function tryApplyStrengthPlateAxesFromBim(rawAxes, { overwrite = false } = {}) {
  const parsedAxes = parseSimpleStrengthAxes(rawAxes);
  if (!parsedAxes) return false;

  const hasManualAxes = [
    strengthAxisLetterFromEl?.value,
    strengthAxisLetterToEl?.value,
    strengthAxisNumberFromEl?.value,
    strengthAxisNumberToEl?.value
  ].some((value) => String(value || "").trim() !== "");
  if (hasManualAxes && !overwrite) return false;

  const hasLetterFrom = Array.from(strengthAxisLetterFromEl?.options || []).some((option) => option.value === parsedAxes.axisLetterFrom);
  const hasLetterTo = Array.from(strengthAxisLetterToEl?.options || []).some((option) => option.value === parsedAxes.axisLetterTo);
  const hasNumberFrom = Array.from(strengthAxisNumberFromEl?.options || []).some((option) => option.value === parsedAxes.axisNumberFrom);
  const hasNumberTo = Array.from(strengthAxisNumberToEl?.options || []).some((option) => option.value === parsedAxes.axisNumberTo);
  if (!hasLetterFrom || !hasLetterTo || !hasNumberFrom || !hasNumberTo) return false;

  if (strengthAxisLetterFromEl) strengthAxisLetterFromEl.value = parsedAxes.axisLetterFrom;
  if (strengthAxisLetterToEl) strengthAxisLetterToEl.value = parsedAxes.axisLetterTo;
  if (strengthAxisNumberFromEl) strengthAxisNumberFromEl.value = parsedAxes.axisNumberFrom;
  if (strengthAxisNumberToEl) strengthAxisNumberToEl.value = parsedAxes.axisNumberTo;
  runtime?.form.updateLocation();
  return true;
}

function normalizeStrengthBimFilterValue(value, fallback = "all") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function resetStrengthBimFilters() {
  strengthBimFilters.search = "";
  strengthBimFilters.type = "all";
  strengthBimFilters.axes = "all";
}

function syncStrengthBimFilterControlsFromState() {
  if (strengthBimSearchInput && strengthBimSearchInput.value !== strengthBimFilters.search) {
    strengthBimSearchInput.value = strengthBimFilters.search;
  }
  if (strengthBimTypeFilter && strengthBimTypeFilter.value !== strengthBimFilters.type) {
    strengthBimTypeFilter.value = strengthBimFilters.type;
  }
  if (strengthBimAxesFilter && strengthBimAxesFilter.value !== strengthBimFilters.axes) {
    strengthBimAxesFilter.value = strengthBimFilters.axes;
  }
}

function hasActiveStrengthBimFilters() {
  return (
    String(strengthBimFilters.search || "").trim() !== "" ||
    strengthBimFilters.type !== "all" ||
    strengthBimFilters.axes !== "all"
  );
}

function getFilteredStrengthBimElements() {
  const searchQuery = String(strengthBimFilters.search || "").trim().toLowerCase();

  return strengthBimElements.filter((element) => {
    if (strengthBimFilters.type !== "all" && element.type !== strengthBimFilters.type) {
      return false;
    }

    const axesValue = String(element.axes || "").trim();
    if (strengthBimFilters.axes !== "all" && axesValue !== strengthBimFilters.axes) {
      return false;
    }

    if (searchQuery && !buildBimElementSearchText(element).includes(searchQuery)) {
      return false;
    }

    return true;
  });
}

function fillStrengthBimFilterSelect(selectEl, options, defaultLabel, nextValue) {
  if (!selectEl) return;

  selectEl.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "all";
  defaultOption.textContent = defaultLabel;
  selectEl.appendChild(defaultOption);

  options.forEach((optionData) => {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    selectEl.appendChild(option);
  });

  const hasNextValue = nextValue === "all" || options.some((optionData) => optionData.value === nextValue);
  selectEl.value = hasNextValue ? nextValue : "all";
  selectEl.disabled = !getCurrentProjectId() || strengthBimElements.length === 0;
}

function renderStrengthBimFilterOptions() {
  const filterOptions = buildBimElementFilterOptions(strengthBimElements);
  const nextType = normalizeStrengthBimFilterValue(strengthBimFilters.type, "all");
  const nextAxes = normalizeStrengthBimFilterValue(strengthBimFilters.axes, "all");

  fillStrengthBimFilterSelect(strengthBimTypeFilter, filterOptions.types, "Все типы", nextType);
  fillStrengthBimFilterSelect(strengthBimAxesFilter, filterOptions.axes, "Все оси", nextAxes);

  strengthBimFilters.type = strengthBimTypeFilter ? strengthBimTypeFilter.value : nextType;
  strengthBimFilters.axes = strengthBimAxesFilter ? strengthBimAxesFilter.value : nextAxes;
  syncStrengthBimFilterControlsFromState();
}

function renderStrengthBimElementOptions(selectedId = selectedStrengthBimElementId) {
  if (!strengthBimElementSelect) return;

  const previousValue = selectedId || "";
  const filteredElements = getFilteredStrengthBimElements();
  const visibleElements = [...filteredElements];
  const selectedElement = previousValue ? strengthBimElementsById.get(previousValue) : null;
  strengthBimElementSelect.innerHTML = "";

  const manualOption = document.createElement("option");
  manualOption.value = "";
  manualOption.textContent = "Ручной ввод без BIM";
  strengthBimElementSelect.appendChild(manualOption);

  if (selectedElement) {
    const selectedKey = selectedElement.elementId || selectedElement.id || "";
    const alreadyVisible = visibleElements.some((element) => (element.elementId || element.id || "") === selectedKey);
    if (!alreadyVisible) visibleElements.unshift(selectedElement);
  }

  visibleElements.forEach((element) => {
    const option = document.createElement("option");
    option.value = element.elementId || element.id || "";
    option.textContent = buildBimElementOptionLabel(element);
    strengthBimElementSelect.appendChild(option);
  });

  if (!selectedElement && filteredElements.length === 0 && strengthBimElements.length > 0) {
    const emptyOption = document.createElement("option");
    emptyOption.value = "__empty__";
    emptyOption.textContent = "По текущим фильтрам BIM-элементы не найдены";
    emptyOption.disabled = true;
    strengthBimElementSelect.appendChild(emptyOption);
  }

  const hasPreviousValue =
    previousValue === "" ||
    visibleElements.some((element) => (element.elementId || element.id || "") === previousValue);
  strengthBimElementSelect.value = hasPreviousValue ? previousValue : "";
  renderStrengthBimVisualPanel();
}

function setStrengthBimStatus(message, tone = "muted") {
  if (!strengthBimElementStatus) return;
  const hasMessage = Boolean(String(message || "").trim());
  strengthBimElementStatus.textContent = message;
  strengthBimElementStatus.hidden = !hasMessage;
  strengthBimElementStatus.dataset.empty = hasMessage ? "0" : "1";
  const statusField = strengthBimElementStatus.closest(".geo-bim-status-field") as HTMLElement | null;
  if (statusField) statusField.hidden = !hasMessage;
  strengthBimElementStatus.style.color =
    tone === "error"
      ? "#fca5a5"
      : tone === "success"
        ? "#86efac"
        : tone === "info"
          ? "#93c5fd"
          : "#E6B450";
}

function buildStrengthBimBindingSnapshot({ element = null, checkData = null, constructionType = null } = {}) {
  const selectedElement = element || null;
  const fallbackData = checkData || {};
  const elementId =
    normalizeStrengthBimValue(selectedElement?.elementId) ||
    normalizeStrengthBimValue(selectedElement?.id) ||
    normalizeStrengthBimValue(fallbackData.bimElementId);
  const rawType =
    normalizeStrengthBimValue(selectedElement?.type)?.toLowerCase() ||
    normalizeStrengthBimValue(fallbackData.bimType)?.toLowerCase();
  const typeLabel =
    getConstructionLabel(constructionType) ||
    getConstructionLabel(getTehnadzorTypeByBimType(rawType)) ||
    getConstructionLabel(fallbackData.construction) ||
    getConstructionLabel(fallbackData.constructionType) ||
    normalizeStrengthBimValue(fallbackData.constructionLabel) ||
    normalizeStrengthBimValue(fallbackData.construction);
  const floor =
    normalizeStrengthBimValue(selectedElement?.floor) ||
    normalizeStrengthBimValue(fallbackData.bimFloor);
  const markValue =
    normalizeStrengthBimValue(selectedElement?.mark) ||
    normalizeStrengthBimValue(fallbackData.bimMark);
  const axes =
    normalizeStrengthBimValue(selectedElement?.axes) ||
    normalizeStrengthBimValue(fallbackData.bimAxes);
  const sourceModelId =
    normalizeStrengthBimValue(selectedElement?.sourceModelId) ||
    normalizeStrengthBimValue(fallbackData.bimSourceModelId);
  const ifcGuid =
    normalizeStrengthBimValue(selectedElement?.ifcGuid) ||
    normalizeStrengthBimValue(fallbackData.bimIfcGuid);

  if (!elementId && !rawType && !floor && !markValue && !axes && !sourceModelId && !ifcGuid) {
    return null;
  }

  let title = "BIM-элемент";
  if (selectedElement) {
    title = formatBimElementLabel(selectedElement);
  } else if (typeLabel && markValue) {
    title = `${typeLabel} ${markValue}`;
  } else if (typeLabel) {
    title = elementId ? `${typeLabel} · ID ${elementId}` : typeLabel;
  } else if (markValue) {
    title = `Элемент ${markValue}`;
  } else if (elementId) {
    title = `Элемент ID ${elementId}`;
  }

  return {
    resolved: Boolean(selectedElement),
    elementId,
    rawType,
    typeLabel,
    floor,
    mark: markValue,
    axes,
    sourceModelId,
    ifcGuid,
    title
  };
}

function updateStrengthStaticBimHighlights(snapshot = strengthBimBindingSnapshot) {
  clearStrengthStaticBimFieldHighlights();
  if (!snapshot) return;

  setStrengthBimFieldAutofilled(
    strengthBimMarkEl,
    matchesStrengthBimText(strengthBimMarkEl?.value, snapshot.mark)
  );
  setStrengthBimFieldAutofilled(
    strengthBimAxesEl,
    matchesStrengthBimText(strengthBimAxesEl?.value, snapshot.axes)
  );
  setStrengthBimFieldAutofilled(
    strengthFloorEl,
    matchesStrengthBimText(strengthFloorEl?.value, snapshot.floor)
  );

  const currentConstruction =
    runtime?.form.getSelectedConstructionKey() || construction?.value || "";
  const currentFlags = runtime?.form.getConstructionFlags(
    currentConstruction
  );
  if (currentFlags.isPlate || currentFlags.isStair) {
    const parsedAxes = parseSimpleStrengthAxes(snapshot.axes);
    setStrengthBimFieldAutofilled(
      strengthAxisLetterFromEl,
      parsedAxes && matchesStrengthBimText(strengthAxisLetterFromEl?.value, parsedAxes.axisLetterFrom)
    );
    setStrengthBimFieldAutofilled(
      strengthAxisLetterToEl,
      parsedAxes && matchesStrengthBimText(strengthAxisLetterToEl?.value, parsedAxes.axisLetterTo)
    );
    setStrengthBimFieldAutofilled(
      strengthAxisNumberFromEl,
      parsedAxes && matchesStrengthBimText(strengthAxisNumberFromEl?.value, parsedAxes.axisNumberFrom)
    );
    setStrengthBimFieldAutofilled(
      strengthAxisNumberToEl,
      parsedAxes && matchesStrengthBimText(strengthAxisNumberToEl?.value, parsedAxes.axisNumberTo)
    );
  }

  if (currentFlags.isColumn || currentFlags.isBeam) {
    setStrengthBimFieldAutofilled(
      strengthMarkingEl,
      matchesStrengthBimMark(strengthMarkingEl?.value, snapshot.mark)
    );
  }
}

function renderStrengthBimBindingSnapshot() {
  const snapshot = strengthBimBindingSnapshot;
  const hasLink = Boolean(snapshot);

  if (strengthBimSourceCard) {
    strengthBimSourceCard.hidden = !hasLink;
    strengthBimSourceCard.classList.toggle("is-linked", hasLink);
    strengthBimSourceCard.classList.toggle("is-stale", hasLink && !snapshot?.resolved);
  }

  if (strengthManualAssistNote) {
    const noteText = hasLink
      ? snapshot.resolved
        ? "Подсвеченные поля ниже подставлены из BIM там, где данные надёжны. Класс бетона и количество дней пока остаются ручными."
        : "BIM-привязка сохранена, но сам импортированный элемент сейчас недоступен. Поля можно продолжать редактировать вручную."
      : BIM_MANUAL_MODE_MESSAGE;
    strengthManualAssistNote.textContent = noteText;
    strengthManualAssistNote.hidden = !noteText;
    strengthManualAssistNote.classList.toggle("is-linked", hasLink);
    strengthManualAssistNote.classList.toggle("is-stale", hasLink && !snapshot?.resolved);
  }

  if (!hasLink) {
    if (strengthBimSourceTitle) strengthBimSourceTitle.textContent = "BIM-элемент не выбран";
    if (strengthBimSourceState) strengthBimSourceState.textContent = BIM_MANUAL_MODE_MESSAGE;
    if (strengthBimSourceMeta) strengthBimSourceMeta.textContent = "";
    if (strengthBimAppliedTypeEl) strengthBimAppliedTypeEl.textContent = "Нет данных";
    if (strengthBimAppliedFloorEl) strengthBimAppliedFloorEl.textContent = "Нет данных";
    if (strengthBimAppliedMarkEl) strengthBimAppliedMarkEl.textContent = "Нет данных";
    if (strengthBimAppliedAxesEl) strengthBimAppliedAxesEl.textContent = "Нет данных";
    if (strengthBimAppliedStrengthEl) strengthBimAppliedStrengthEl.textContent = "Пока ручной ввод";
    if (strengthBimSourceHint) {
      strengthBimSourceHint.textContent = "Из текущего BIM-MVP в прочность надёжно приходят тип, этаж, BIM-оси и марка для колонн/балок. Класс бетона и количество дней пока вводятся вручную.";
    }
    clearStrengthStaticBimFieldHighlights();
    return;
  }

  if (strengthBimSourceTitle) strengthBimSourceTitle.textContent = snapshot.title;
  if (strengthBimSourceState) strengthBimSourceState.textContent = snapshot.resolved ? "Связка активна" : "Источник недоступен";
  if (strengthBimSourceMeta) {
    const metaParts = [];
    if (snapshot.elementId) metaParts.push(`ID ${snapshot.elementId}`);
    if (snapshot.sourceModelId) metaParts.push(`Модель ${snapshot.sourceModelId}`);
    if (snapshot.ifcGuid) metaParts.push(`GUID ${formatStrengthBimShortGuid(snapshot.ifcGuid)}`);
    strengthBimSourceMeta.textContent = metaParts.join(" · ");
  }
  if (strengthBimAppliedTypeEl) strengthBimAppliedTypeEl.textContent = formatStrengthBimDisplayValue(snapshot.typeLabel);
  if (strengthBimAppliedFloorEl) strengthBimAppliedFloorEl.textContent = formatStrengthBimDisplayValue(snapshot.floor);
  if (strengthBimAppliedMarkEl) strengthBimAppliedMarkEl.textContent = formatStrengthBimDisplayValue(snapshot.mark);
  if (strengthBimAppliedAxesEl) strengthBimAppliedAxesEl.textContent = formatStrengthBimDisplayValue(snapshot.axes);
  if (strengthBimAppliedStrengthEl) {
    strengthBimAppliedStrengthEl.textContent = snapshot.resolved
      ? "Класс бетона и дни пока вручную"
      : "Источник недоступен";
  }
  if (strengthBimSourceHint) {
    strengthBimSourceHint.textContent = snapshot.resolved
      ? "Из текущего BIM-MVP в прочность надёжно приходят тип, этаж, BIM-оси и марка для колонн/балок. Класс бетона и количество дней пока вводятся вручную."
      : "BIM-связка сохранена в проверке, но этот элемент сейчас не найден среди импортированных элементов проекта.";
  }

  updateStrengthStaticBimHighlights(snapshot);
}

function updateStrengthBimControlsState() {
  const filteredElements = getFilteredStrengthBimElements();
  const snapshot = strengthBimBindingSnapshot;
  const projectId = getCurrentProjectId();

  if (strengthBimElementSelect) strengthBimElementSelect.disabled = !projectId || strengthBimElements.length === 0;
  if (strengthBimSearchInput) strengthBimSearchInput.disabled = !projectId || strengthBimElements.length === 0;
  if (strengthBimTypeFilter) strengthBimTypeFilter.disabled = !projectId || strengthBimElements.length === 0;
  if (strengthBimAxesFilter) strengthBimAxesFilter.disabled = !projectId || strengthBimElements.length === 0;
  if (btnClearStrengthBimSelection) btnClearStrengthBimSelection.disabled = !selectedStrengthBimElementId;

  if (!projectId) {
    setStrengthBimStatus("Сначала выберите объект. После этого станут доступны BIM-элементы проекта.", "muted");
    return;
  }

  const selectedElement = getSelectedStrengthBimElement();
  if (!selectedElement && snapshot && !snapshot.resolved) {
    setStrengthBimStatus(
      "BIM-привязка сохранена в проверке, но сам импортированный элемент сейчас не найден в проекте. Можно перепривязать элемент или продолжить вручную.",
      "info"
    );
    return;
  }

  if (strengthBimElements.length === 0) {
    setStrengthBimStatus(BIM_MANUAL_MODE_MESSAGE, "muted");
    return;
  }

  if (!selectedElement) {
    if (hasActiveStrengthBimFilters()) {
      if (filteredElements.length === 0) {
        setStrengthBimStatus("По текущим фильтрам BIM-элементы не найдены. Можно ослабить фильтры или продолжить вручную.", "info");
      } else {
        setStrengthBimStatus(`Найдено ${filteredElements.length} BIM-элементов. Выберите элемент или продолжайте ручной ввод.`, "info");
      }
      return;
    }

    setStrengthBimStatus(BIM_MANUAL_MODE_MESSAGE, "muted");
    return;
  }

  const typeLabel = getConstructionLabel(getTehnadzorTypeByBimType(selectedElement.type), "Элемент");
  setStrengthBimStatus(`${typeLabel} выбран из BIM. Привязка сохранится вместе с проверкой.`, "success");
}

function collectStrengthBimCheckData() {
  const selectedElement = getSelectedStrengthBimElement();
  if (!selectedElement && !strengthBimBindingSnapshot) {
    return {
      bimElementId: null,
      bimSourceModelId: null,
      bimIfcGuid: null,
      bimType: null,
      bimFloor: null,
      bimMark: null,
      bimAxes: null
    };
  }

  return {
    bimElementId: selectedStrengthBimElementId || null,
    bimSourceModelId: selectedElement?.sourceModelId || strengthBimBindingSnapshot?.sourceModelId || null,
    bimIfcGuid: selectedElement?.ifcGuid || strengthBimBindingSnapshot?.ifcGuid || null,
    bimType: selectedElement?.type || strengthBimBindingSnapshot?.rawType || null,
    bimFloor: selectedElement?.floor || strengthBimBindingSnapshot?.floor || null,
    bimMark: normalizeStrengthBimValue(strengthBimMarkEl?.value) || null,
    bimAxes: normalizeStrengthBimValue(strengthBimAxesEl?.value) || null
  };
}

function hasStrengthBimBindingData(data: StrengthCheckRecord = {}) {
  return Boolean(
    normalizeStrengthBimValue(data.bimElementId) ||
    normalizeStrengthBimValue(data.bimSourceModelId) ||
    normalizeStrengthBimValue(data.bimIfcGuid) ||
    normalizeStrengthBimValue(data.bimType) ||
    normalizeStrengthBimValue(data.bimFloor) ||
    normalizeStrengthBimValue(data.bimMark) ||
    normalizeStrengthBimValue(data.bimAxes)
  );
}

function applyStrengthBimPrefillFromElement(element, { overwrite = false } = {}) {
  if (!element) return;

  if (strengthFloorEl && element.floor && (overwrite || !String(strengthFloorEl.value || "").trim())) {
    strengthFloorEl.value = element.floor;
  }

  const targetConstruction = construction?.value || getTehnadzorTypeByBimType(element.type) || "";
  const targetFlags = runtime?.form.getConstructionFlags(targetConstruction);
  if ((targetFlags?.isPlate || targetFlags?.isStair) && element.axes) {
    tryApplyStrengthPlateAxesFromBim(element.axes, { overwrite });
  }

  if ((targetFlags?.isColumn || targetFlags?.isBeam) && strengthMarkingEl && element.mark) {
    if (overwrite || !normalizeStrengthBimValue(strengthMarkingEl.value)) {
      strengthMarkingEl.value = element.mark;
    }
  }
}

function syncStrengthBimSelectionFromCheck(checkData: StrengthCheckRecord = {}) {
  const nextId = String(checkData.bimElementId || "").trim();
  selectedStrengthBimElementId = nextId;
  const selectedElement = nextId ? strengthBimElementsById.get(nextId) || null : null;

  renderStrengthBimElementOptions(nextId);
  if (strengthBimElementSelect) {
    strengthBimElementSelect.value = nextId && strengthBimElementsById.has(nextId) ? nextId : "";
  }
  if (strengthBimMarkEl) {
    strengthBimMarkEl.value = checkData.bimMark || (selectedElement?.mark || "");
  }
  if (strengthBimAxesEl) {
    strengthBimAxesEl.value = checkData.bimAxes || (selectedElement?.axes || "");
  }

  strengthBimBindingSnapshot = buildStrengthBimBindingSnapshot({
    element: selectedElement,
    checkData,
    constructionType:
      checkData.construction ||
      checkData.constructionType ||
      runtime?.form.getSelectedConstructionKey()
  });

  if (selectedElement) {
    applyStrengthBimPrefillFromElement(selectedElement, { overwrite: false });
  }

  renderStrengthBimBindingSnapshot();
  updateStrengthBimControlsState();
}

function clearStrengthBimSelection({ keepManualFields = true } = {}) {
  selectedStrengthBimElementId = "";
  strengthBimBindingSnapshot = null;
  renderStrengthBimElementOptions("");
  if (strengthBimElementSelect) strengthBimElementSelect.value = "";

  if (!keepManualFields) {
    if (strengthBimMarkEl) strengthBimMarkEl.value = "";
    if (strengthBimAxesEl) strengthBimAxesEl.value = "";
  }

  renderStrengthBimBindingSnapshot();
  updateStrengthBimControlsState();
}

function applyStrengthBimElementSelection(elementId) {
  const nextId = String(elementId || "").trim();
  if (!nextId) {
    clearStrengthBimSelection({ keepManualFields: true });
    return;
  }

  const element = strengthBimElementsById.get(nextId);
  if (!element) {
    setStrengthBimStatus("Выбранный BIM-элемент не найден в проекте. Обновите список элементов.", "error");
    return;
  }

  selectedStrengthBimElementId = nextId;
  const targetConstruction = getTehnadzorTypeByBimType(element.type) || construction?.value || "";
  if (construction && targetConstruction) {
    getDependencies().setConstruction(targetConstruction);
  }

  if (strengthBimElementSelect) {
    renderStrengthBimElementOptions(nextId);
    strengthBimElementSelect.value = nextId;
  }
  if (strengthBimMarkEl) strengthBimMarkEl.value = element.mark || "";
  if (strengthBimAxesEl) strengthBimAxesEl.value = element.axes || "";

  strengthBimBindingSnapshot = buildStrengthBimBindingSnapshot({
    element,
    constructionType: targetConstruction
  });

  applyStrengthBimPrefillFromElement(element, { overwrite: false });
  renderStrengthBimBindingSnapshot();
  updateStrengthBimControlsState();
}

async function loadStrengthBimElements(projectId = getCurrentProjectId()) {
  const preservedBinding = collectStrengthBimCheckData();

  strengthBimElements = [];
  strengthBimElementsById.clear();
  selectedStrengthBimElementId = "";
  strengthBimBindingSnapshot = null;
  resetStrengthBimFilters();
  syncStrengthBimFilterControlsFromState();
  if (strengthBimMarkEl) strengthBimMarkEl.value = "";
  if (strengthBimAxesEl) strengthBimAxesEl.value = "";
  renderStrengthBimBindingSnapshot();
  renderStrengthBimFilterOptions();
  renderStrengthBimElementOptions("");

  if (!projectId || String(projectId).trim() === "") {
    updateStrengthBimControlsState();
    return;
  }

  try {
    const loadedElements = [];
    const storedElements = await getDependencies().service.loadBimElements(projectId);
    storedElements.forEach((storedElement) => {
      const normalized = normalizeProjectBimElement(storedElement.id, storedElement);
      if (!normalized.elementId || !normalized.type) return;
      loadedElements.push(normalized);
    });

    strengthBimElements = sortProjectBimElements(loadedElements);
    strengthBimElements.forEach((element) => {
      const key = element.elementId || element.id;
      if (key) strengthBimElementsById.set(key, element);
    });

    renderStrengthBimFilterOptions();
    renderStrengthBimElementOptions("");

    if (hasStrengthBimBindingData(preservedBinding || {})) {
      syncStrengthBimSelectionFromCheck(preservedBinding);
    } else {
      renderStrengthBimBindingSnapshot();
      updateStrengthBimControlsState();
    }
  } catch (error) {
    console.error("Ошибка загрузки BIM-элементов для прочности:", error);
    setStrengthBimStatus(BIM_LOAD_ERROR_MESSAGE, "error");
  }
}

function updateStrengthFieldsVisibility() {
  return runtime?.form.updateFieldsVisibility();
}

function saveStrengthChecks() {
  return runtime?.saveChecks();
}

async function loadStrengthChecks() {
  await runtime?.loadChecks();
}

function renderStrengthChecks() {
  return runtime?.renderChecks();
}

function loadStrengthCheck(id) {
  return runtime?.loadCheck(id);
}

async function saveStrengthCheck({ skipJournalOnce = false } = {}) {
  return runtime?.saveCheck({ skipJournalOnce });
}

function clearStrengthForm() {
  return runtime?.clearForm();
}

async function clearStrengthChecks() {
  return runtime?.clearChecks();
}

function initStrengthBimHandlers() {
  if (strengthBimElementSelect) {
    strengthBimElementSelect.addEventListener("change", (event) => {
      const nextId = event.target?.value || "";
      if (nextId === "__empty__") return;
      applyStrengthBimElementSelection(nextId);
    });
  }

  if (strengthBimSearchInput) {
    strengthBimSearchInput.addEventListener("input", (event) => {
      strengthBimFilters.search = String(event.target?.value || "").trim();
      renderStrengthBimElementOptions();
      updateStrengthBimControlsState();
    });
  }

  if (strengthBimTypeFilter) {
    strengthBimTypeFilter.addEventListener("change", (event) => {
      strengthBimFilters.type = normalizeStrengthBimFilterValue(event.target?.value, "all");
      renderStrengthBimElementOptions();
      updateStrengthBimControlsState();
    });
  }

  if (strengthBimAxesFilter) {
    strengthBimAxesFilter.addEventListener("change", (event) => {
      strengthBimFilters.axes = normalizeStrengthBimFilterValue(event.target?.value, "all");
      renderStrengthBimElementOptions();
      updateStrengthBimControlsState();
    });
  }

  if (btnClearStrengthBimSelection) {
    btnClearStrengthBimSelection.addEventListener("click", () => {
      clearStrengthBimSelection({ keepManualFields: true });
      setStrengthBimStatus("BIM-привязка снята. Текущие значения в форме сохранены для ручного редактирования.", "info");
    });
  }

  [
    strengthFloorEl,
    strengthBimMarkEl,
    strengthBimAxesEl,
    strengthMarkingEl
  ].forEach((fieldEl) => {
    if (!fieldEl) return;
    fieldEl.addEventListener("input", () => {
      updateStrengthStaticBimHighlights();
    });
  });

}

export function initStrengthModule() {
  if (strengthInitialized) return;
  strengthInitialized = true;

  const configured = getDependencies();
  runtime = createStrengthRuntime({
    state: configured.state,
    service: configured.service,
    dom: strengthDom,
    bim: {
      collectCheckData: collectStrengthBimCheckData,
      restoreSelection: syncStrengthBimSelectionFromCheck,
      clearSelection: clearStrengthBimSelection,
      renderBinding: renderStrengthBimBindingSnapshot,
      updateControls: updateStrengthBimControlsState,
      updateHighlights: updateStrengthStaticBimHighlights,
      initBindings: () => {
        renderStrengthBimFilterOptions();
        renderStrengthBimElementOptions("");
        renderStrengthBimBindingSnapshot();
        updateStrengthBimControlsState();
        initStrengthBimHandlers();
      },
      loadElements: loadStrengthBimElements,
      renderVisualPanel: renderStrengthBimVisualPanel
    },
    inspectionState: configured.inspectionState,
    inspectionChecked: configured.inspectionChecked,
    storage: localStorage,
    storageKey: APP_STORAGE_KEYS.streng,
    getCurrentProjectId: configured.getCurrentProjectId,
    validateProject,
    setConstruction: configured.setConstruction,
    getChartConstructor: () =>
      (window.Chart as unknown as StrengthChartConstructor | undefined) ||
      null,
    ensureChartJsLoaded,
    renderRegulatoryBasis: renderRegulatoryBasisHtml,
    notify: configured.showNotification,
    confirm: showConfirm,
    updateSummary: configured.updateSummary,
    addJournalEntry: configured.addJournalEntry,
    upsertJournalEntry: configured.upsertJournalEntry,
    notifyFirestoreSyncStatus: configured.notifyFirestoreSyncStatus
  });
  onAppTabActivated("strength", renderStrengthBimVisualPanel);
  runtime.init();
}

export {
  updateStrengthFieldsVisibility,
  loadStrengthChecks,
  saveStrengthChecks,
  renderStrengthChecks,
  loadStrengthCheck,
  saveStrengthCheck,
  clearStrengthChecks,
  clearStrengthForm,
  loadStrengthBimElements,
  renderStrengthBimVisualPanel
};
