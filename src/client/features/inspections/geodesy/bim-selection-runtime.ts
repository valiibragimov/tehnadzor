import { t, translateEngineeringLabel } from "../../../shared/i18n/index.js";
import { setBimResultHint } from "../../../app/ui/bim-result-hint.js";
import {
  getConstructionLabel,
  normalizeConstructionKey
} from "../../../app/construction.js";
import {
  buildBimElementFilterOptions,
  buildBimElementOptionLabel,
  buildGeoPrefillFromBimElement as buildRawGeoPrefill,
  getTehnadzorTypeByBimType
} from "../../../app/services/bim-elements.js";
import { ensureBimVisualPanel } from "../../../app/services/bim-visual-panel.js";
import { onAppTabActivated } from "../../../app/services/module-activation.js";
import { APP_CONFIG } from "../../../config.js";
import type { GeoPrefill } from "../../../types/domain.js";
import { debounce } from "../../../utils.js";
import {
  buildGeoAxisEntries,
  buildGeodesyBimBindingSnapshot,
  collectGeodesyBimNodeData,
  createGeoLinearPrefillPoints,
  filterGeodesyBimElements,
  findNearestGeoAxisLabel,
  formatGeoBimDisplayValue,
  formatGeoBimNumericField,
  formatGeoBimShortGuid,
  formatResolvedLinearAxes,
  getBimAxesValue,
  groupGeoGridSamples,
  hasGeoBimValue,
  inferAxisCoordinateKey,
  normalizeGeodesyBimFilterValue,
  normalizeGeodesyBimRecords,
  parseGeoBimFiniteNumber,
  pushGeoGridSample,
  resolveGeodesyBimSelection,
  restoreGeodesyBimSelection
} from "./bim-selection.js";
import type { createGeodesyDomBindings } from "./dom.js";
import type { GeodesyFormRuntime } from "./form.js";
import type { GeodesyService } from "./service.js";
import { replaceGeodesyItems, type GeodesyState } from "./state.js";
import type {
  GeodesyBimElement,
  GeodesyLinearBindingHint,
  GeodesyLinearDraft,
  GeodesyNodeRecord,
  GeodesySingleAxisHint
} from "./types.js";

type GeodesyDomBindings = ReturnType<typeof createGeodesyDomBindings>;

function buildGeoPrefillFromBimElement(element: Parameters<typeof buildRawGeoPrefill>[0]) {
  const prefill = buildRawGeoPrefill(element);
  for (const key of ["projX", "projY", "projH", "lineStartX", "lineStartY", "lineStartH", "lineEndX", "lineEndY", "lineEndH"] as const) {
    if (prefill[key] != null) prefill[key] /= 1000;
  }
  return prefill;
}

interface GeodesyBimConstructionFlags {
  isBeam: boolean;
  isColumn: boolean;
  isRangeLocation: boolean;
  isWall: boolean;
  usesWallsSheet?: boolean;
}

interface GeodesyBimSelectionDependencies {
  state: GeodesyState;
  service: GeodesyService;
  dom: GeodesyDomBindings;
  construction: HTMLElement;
  constructionFieldShell: HTMLElement | null;
  getCurrentProjectId(): string | null;
  getCurrentConstructionKey(): string;
  getCurrentConstructionLabel(): string;
  getGeoConstructionFlags(value?: string): GeodesyBimConstructionFlags;
  setConstructionAndTrigger(constructionType: string): boolean;
  getCurrentIfcFile(): File | null;
  resetImportedModelState(): void;
  syncIfcImportControls(): void;
  getForm(): GeodesyFormRuntime;
}

const BIM_MANUAL_MODE_MESSAGE = "";
const BIM_LOAD_ERROR_MESSAGE =
  "Не удалось загрузить BIM-элементы. Можно продолжить ручной ввод.";

export function createGeodesyBimSelectionRuntime(
  dependencies: GeodesyBimSelectionDependencies
) {
  const {
    state,
    service,
    dom,
    construction,
    constructionFieldShell,
    getCurrentProjectId,
    getCurrentConstructionKey,
    getCurrentConstructionLabel,
    getGeoConstructionFlags,
    setConstructionAndTrigger,
    getCurrentIfcFile,
    resetImportedModelState,
    syncIfcImportControls,
    getForm
  } = dependencies;
  const ownerDocument = construction.ownerDocument;
  const elements = state.bimElements;
  const elementsById = state.bimElementsById;
  const filters = state.bimFilters;
  const elementSelect = dom.geoBimElementSelect as HTMLSelectElement | null;
  const searchInput = dom.geoBimSearchInput as HTMLInputElement | null;
  const typeFilter = dom.geoBimTypeFilter as HTMLSelectElement | null;
  const axesFilter = dom.geoBimAxesFilter as HTMLSelectElement | null;
  const markInput = dom.geoBimMarkEl as HTMLInputElement | null;
  const axesInput = dom.geoBimAxesEl as HTMLInputElement | null;
  const projectXInput = dom.projX as HTMLInputElement;
  const projectYInput = dom.projY as HTMLInputElement;
  const projectHInput = dom.projH as HTMLInputElement;
  const floorInput = dom.floorEl as HTMLInputElement;
  const columnMarkInput = dom.columnMarkEl as HTMLInputElement;
  const axisLetter = dom.axisLetterEl as HTMLSelectElement;
  const axisNumber = dom.axisNumberEl as HTMLSelectElement;
  const axisLetterFrom = dom.axisLetterFromEl as HTMLSelectElement | null;
  const axisLetterTo = dom.axisLetterToEl as HTMLSelectElement | null;
  const axisNumberFrom = dom.axisNumberFromEl as HTMLSelectElement | null;
  const axisNumberTo = dom.axisNumberToEl as HTMLSelectElement | null;
  let started = false;

  function getSelectedElement() {
    return elementsById.get(state.selectedBimElementId) || null;
  }

  function ensureVisualSelector() {
    if (state.bimVisualPanel) return state.bimVisualPanel;

    state.bimVisualPanel = ensureBimVisualPanel({
      host: dom.geoBimPanelHost,
      sourceCard: dom.geoBimSourceCard,
      getAllElements: () => elements,
      getFilteredElements,
      getSelectedElement,
      getSelectedId: () => state.selectedBimElementId,
      getCurrentProjectId,
      getCurrentIfcFile,
      onSelect: (elementId) => {
        applySelection(elementId);
      },
      labelBuilder: buildBimElementOptionLabel,
      moduleKey: "geo"
    });

    return state.bimVisualPanel;
  }

  function renderVisualPanel() {
    ensureVisualSelector()?.render();
  }

  function getFieldShell(field: HTMLElement | null) {
    if (!field) return null;
    if (field === construction && constructionFieldShell) {
      return constructionFieldShell;
    }
    return field.closest("div");
  }

  function setFieldAutofilled(
    field: HTMLElement | null,
    isAutofilled: boolean
  ) {
    const nextState = Boolean(isAutofilled);
    getFieldShell(field)?.classList.toggle(
      "geo-bim-field--autofilled",
      nextState
    );
    field?.classList.toggle("geo-bim-input--autofilled", nextState);
  }

  function collectGridSamples() {
    const samples: Parameters<typeof pushGeoGridSample>[0] = [];

    state.nodes.forEach((node) => {
      if (node.coordinateUnit !== "m") return;
      if (!node || node.deleted) return;
      const floor = String(node.floor || "").trim();

      pushGeoGridSample(samples, {
        floor,
        letter: String(node.letter || "").trim(),
        number: String(node.number || "").trim(),
        x: node.projX,
        y: node.projY
      });

      const appendLinearRows = (
        rows: Array<Record<string, unknown>> | null | undefined
      ) => {
        rows?.forEach((row) => {
          if (row.bindingType === "number_letters") {
            pushGeoGridSample(samples, {
              floor,
              letter: String(row.letterAxis1 || "").trim(),
              number: String(row.numberAxis || "").trim(),
              x: row.projX_num_let1,
              y: row.projY_num_let1
            });
            pushGeoGridSample(samples, {
              floor,
              letter: String(row.letterAxis2 || "").trim(),
              number: String(row.numberAxis || "").trim(),
              x: row.projX_num_let2,
              y: row.projY_num_let2
            });
            return;
          }
          if (row.bindingType === "letter_numbers") {
            pushGeoGridSample(samples, {
              floor,
              letter: String(row.letterAxis || "").trim(),
              number: String(row.numberAxis1 || "").trim(),
              x: row.projX_let_num1,
              y: row.projY_let_num1
            });
            pushGeoGridSample(samples, {
              floor,
              letter: String(row.letterAxis || "").trim(),
              number: String(row.numberAxis2 || "").trim(),
              x: row.projX_let_num2,
              y: row.projY_let_num2
            });
          }
        });
      };

      if (node.type === "walls") appendLinearRows(node.walls);
      if (node.type === "beams") appendLinearRows(node.beams);
    });

    return samples;
  }

  function buildGridCatalog(floorValue = "") {
    const normalizedFloor = String(floorValue || "").trim();
    const allSamples = collectGridSamples();
    const filteredSamples = normalizedFloor
      ? allSamples.filter((sample) => sample.floor === normalizedFloor)
      : allSamples;
    const effectiveSamples =
      filteredSamples.length > 0 ? filteredSamples : allSamples;
    if (effectiveSamples.length === 0) return null;

    const letters = groupGeoGridSamples(effectiveSamples, "letter");
    const numbers = groupGeoGridSamples(effectiveSamples, "number");
    if (letters.size === 0 || numbers.size === 0) return null;

    const letterCoordKey = inferAxisCoordinateKey(letters, "x");
    let numberCoordKey = inferAxisCoordinateKey(
      numbers,
      letterCoordKey === "x" ? "y" : "x"
    );
    if (numberCoordKey === letterCoordKey) {
      numberCoordKey = letterCoordKey === "x" ? "y" : "x";
    }

    return {
      letters: buildGeoAxisEntries(letters, letterCoordKey),
      numbers: buildGeoAxisEntries(numbers, numberCoordKey),
      letterCoordKey,
      numberCoordKey
    };
  }

  function resolveSingleAxisHint(
    prefill: Partial<GeoPrefill> = {},
    floorValue = ""
  ): GeodesySingleAxisHint | null {
    const catalog = buildGridCatalog(floorValue);
    const projX = parseGeoBimFiniteNumber(prefill.projX);
    const projY = parseGeoBimFiniteNumber(prefill.projY);
    if (!catalog || projX == null || projY == null) return null;

    return {
      letter: findNearestGeoAxisLabel(
        catalog.letters,
        catalog.letterCoordKey === "x" ? projX : projY
      ),
      number: findNearestGeoAxisLabel(
        catalog.numbers,
        catalog.numberCoordKey === "x" ? projX : projY
      )
    };
  }

  function resolveLinearBindingHint(
    prefill: Partial<GeoPrefill> = {},
    floorValue = ""
  ): GeodesyLinearBindingHint | null {
    const catalog = buildGridCatalog(floorValue);
    const points = createGeoLinearPrefillPoints(prefill);
    if (!catalog || !points) return null;

    const startLetter = findNearestGeoAxisLabel(
      catalog.letters,
      catalog.letterCoordKey === "x" ? points.startX : points.startY
    );
    const endLetter = findNearestGeoAxisLabel(
      catalog.letters,
      catalog.letterCoordKey === "x" ? points.endX : points.endY
    );
    const startNumber = findNearestGeoAxisLabel(
      catalog.numbers,
      catalog.numberCoordKey === "x" ? points.startX : points.startY
    );
    const endNumber = findNearestGeoAxisLabel(
      catalog.numbers,
      catalog.numberCoordKey === "x" ? points.endX : points.endY
    );
    const deltaAlongLetters = Math.abs(
      catalog.letterCoordKey === "x"
        ? points.endX - points.startX
        : points.endY - points.startY
    );
    const deltaAlongNumbers = Math.abs(
      catalog.numberCoordKey === "x"
        ? points.endX - points.startX
        : points.endY - points.startY
    );
    const midX = (points.startX + points.endX) / 2;
    const midY = (points.startY + points.endY) / 2;
    const midLetter = findNearestGeoAxisLabel(
      catalog.letters,
      catalog.letterCoordKey === "x" ? midX : midY
    );
    const midNumber = findNearestGeoAxisLabel(
      catalog.numbers,
      catalog.numberCoordKey === "x" ? midX : midY
    );

    if (
      startNumber &&
      endNumber &&
      startNumber === endNumber &&
      startLetter &&
      endLetter
    ) {
      return {
        bindingType: "number_letters",
        numberAxis: startNumber,
        letterAxis1: startLetter,
        letterAxis2: endLetter
      };
    }
    if (
      startLetter &&
      endLetter &&
      startLetter === endLetter &&
      startNumber &&
      endNumber
    ) {
      return {
        bindingType: "letter_numbers",
        letterAxis: startLetter,
        numberAxis1: startNumber,
        numberAxis2: endNumber
      };
    }
    if (
      deltaAlongLetters >= deltaAlongNumbers &&
      startLetter &&
      endLetter &&
      midNumber
    ) {
      return {
        bindingType: "number_letters",
        numberAxis: midNumber,
        letterAxis1: startLetter,
        letterAxis2: endLetter
      };
    }
    if (startNumber && endNumber && midLetter) {
      return {
        bindingType: "letter_numbers",
        letterAxis: midLetter,
        numberAxis1: startNumber,
        numberAxis2: endNumber
      };
    }
    return null;
  }

  function refreshElementGeoHints() {
    elements.forEach((element) => {
      const prefill = buildGeoPrefillFromBimElement(element);
      const floor = String(element.floor || "").trim();
      const hasNativeAxes = String(element.axes || "").trim() !== "";

      element.geoBindingHint =
        element.type === "wall" || element.type === "beam"
          ? resolveLinearBindingHint(prefill, floor)
          : null;
      element.geoSingleAxisHint =
        element.type !== "wall" && element.type !== "beam"
          ? resolveSingleAxisHint(prefill, floor)
          : null;

      if (hasNativeAxes) {
        element.resolvedAxes = String(element.axes || "").trim();
      } else {
        element.resolvedAxes =
          formatResolvedLinearAxes(element.geoBindingHint) ||
          (element.geoSingleAxisHint?.letter &&
          element.geoSingleAxisHint?.number
            ? `${element.geoSingleAxisHint.letter}-${element.geoSingleAxisHint.number}`
            : null);
      }
    });
  }

  function getFilteredElements() {
    refreshElementGeoHints();
    return filterGeodesyBimElements(elements, filters);
  }

  function renderBindingSnapshot() {
    const snapshot = state.bimBindingSnapshot;
    const hasLink = Boolean(snapshot);

    if (dom.geoBimSourceCard) {
      dom.geoBimSourceCard.hidden = !hasLink;
      dom.geoBimSourceCard.classList.toggle("is-linked", hasLink);
      dom.geoBimSourceCard.classList.toggle(
        "is-stale",
        hasLink && !snapshot?.resolved
      );
    }

    if (dom.geoManualAssistNote) {
      const noteText = hasLink
        ? snapshot?.resolved
          ? "Подсвеченные поля ниже подставлены из BIM. Их можно править вручную, BIM-привязка сохранится отдельно."
          : "BIM-привязка сохранена, но сам импортированный элемент сейчас недоступен. Поля можно продолжать редактировать вручную."
        : BIM_MANUAL_MODE_MESSAGE;
      dom.geoManualAssistNote.textContent = noteText;
      dom.geoManualAssistNote.hidden = !noteText;
      dom.geoManualAssistNote.classList.toggle("is-linked", hasLink);
      dom.geoManualAssistNote.classList.toggle(
        "is-stale",
        hasLink && !snapshot?.resolved
      );
    }

    if (!snapshot) {
      [
        construction,
        projectXInput,
        projectYInput,
        projectHInput,
        columnMarkInput,
        markInput,
        axesInput
      ].forEach((field) => setFieldAutofilled(field, false));
      return;
    }

    if (dom.geoBimSourceTitle) {
      dom.geoBimSourceTitle.textContent = snapshot.title;
    }
    if (dom.geoBimSourceState) {
      dom.geoBimSourceState.textContent = snapshot.resolved
        ? "Связка активна"
        : "Источник недоступен";
    }
    if (dom.geoBimSourceMeta) {
      const metaParts: string[] = [];
      if (snapshot.elementId) metaParts.push(`ID ${snapshot.elementId}`);
      if (snapshot.sourceModelId) {
        metaParts.push(`Модель ${snapshot.sourceModelId}`);
      }
      if (snapshot.ifcGuid) {
        metaParts.push(`GUID ${formatGeoBimShortGuid(snapshot.ifcGuid)}`);
      }
      dom.geoBimSourceMeta.textContent = metaParts.join(" · ");
    }

    const values: Array<[HTMLElement | null, unknown]> = [
      [dom.geoBimAppliedTypeEl, snapshot.typeLabel],
      [dom.geoBimAppliedProjXEl, snapshot.projectX == null ? null : snapshot.projectX / 1000],
      [dom.geoBimAppliedProjYEl, snapshot.projectY == null ? null : snapshot.projectY / 1000],
      [dom.geoBimAppliedProjHEl, snapshot.projectH == null ? null : snapshot.projectH / 1000],
      [dom.geoBimAppliedMarkEl, snapshot.mark],
      [dom.geoBimAppliedAxesEl, snapshot.axes]
    ];
    values.forEach(([element, value]) => {
      if (element) element.textContent = formatGeoBimDisplayValue(value);
    });

    if (dom.geoBimSourceHint) {
      dom.geoBimSourceHint.textContent = snapshot.resolved
        ? "Подсвеченные поля ниже подставлены из BIM. Их можно скорректировать вручную, BIM-привязка сохранится отдельно."
        : "BIM-связка сохранена в узле, но этот элемент сейчас не найден среди импортированных элементов проекта.";
    }

    setFieldAutofilled(construction, hasGeoBimValue(snapshot.typeLabel));
    setFieldAutofilled(projectXInput, hasGeoBimValue(snapshot.projectX));
    setFieldAutofilled(projectYInput, hasGeoBimValue(snapshot.projectY));
    setFieldAutofilled(projectHInput, hasGeoBimValue(snapshot.projectH));
    setFieldAutofilled(
      columnMarkInput,
      (construction as HTMLSelectElement).value === "Колонна" &&
        hasGeoBimValue(snapshot.mark)
    );
    setFieldAutofilled(markInput, hasGeoBimValue(snapshot.mark));
    setFieldAutofilled(axesInput, hasGeoBimValue(snapshot.axes));
  }

  function setStatus(message: string, tone = "muted") {
    const status = dom.geoBimElementStatus;
    if (!status) return;
    const hasMessage = Boolean(String(message || "").trim());
    status.textContent = message;
    status.hidden = !hasMessage;
    status.dataset.empty = hasMessage ? "0" : "1";
    const statusField = status.closest(
      ".geo-bim-status-field"
    ) as HTMLElement | null;
    if (statusField) statusField.hidden = !hasMessage;
    status.style.color =
      tone === "error"
        ? "#fca5a5"
        : tone === "success"
          ? "#86efac"
          : tone === "info"
            ? "#93c5fd"
            : "#E6B450";
  }

  function resetFilters() {
    filters.search = "";
    filters.type = "all";
    filters.axes = "all";
  }

  function syncFilterControls() {
    if (searchInput && searchInput.value !== filters.search) {
      searchInput.value = filters.search;
    }
    if (typeFilter && typeFilter.value !== filters.type) {
      typeFilter.value = filters.type;
    }
    if (axesFilter && axesFilter.value !== filters.axes) {
      axesFilter.value = filters.axes;
    }
  }

  function hasActiveFilters() {
    return (
      String(filters.search || "").trim() !== "" ||
      filters.type !== "all" ||
      filters.axes !== "all"
    );
  }

  function fillFilterSelect(
    select: HTMLSelectElement | null,
    options: Array<{ value: string; label: string }>,
    defaultLabel: string,
    nextValue: string
  ) {
    if (!select) return;
    select.innerHTML = "";

    const defaultOption = ownerDocument.createElement("option");
    defaultOption.value = "all";
    defaultOption.textContent = translateEngineeringLabel(defaultLabel);
    select.appendChild(defaultOption);

    const visibleOptions = options.slice(0, 100);
  const activeOption = options.find(option => option.value === nextValue);
  if (activeOption && !visibleOptions.includes(activeOption)) visibleOptions.unshift(activeOption);
  setBimResultHint(select, options.length);
  visibleOptions.forEach((optionData) => {
      const option = ownerDocument.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      select.appendChild(option);
    });

    const hasNextValue =
      nextValue === "all" ||
      options.some((option) => option.value === nextValue);
    select.value = hasNextValue ? nextValue : "all";
    select.disabled = !getCurrentProjectId() || elements.length === 0;
  }

  function renderFilterOptions() {
    refreshElementGeoHints();
    const options = buildBimElementFilterOptions(elements);
    const nextType = normalizeGeodesyBimFilterValue(filters.type);
    const nextAxes = normalizeGeodesyBimFilterValue(filters.axes);

    fillFilterSelect(typeFilter, options.types, "Все типы", nextType);
    fillFilterSelect(
      axesFilter,
      options.axes.map((option) => ({
        value: String(option.value ?? ""),
        label: String(option.label ?? "")
      })),
      "Все оси",
      nextAxes
    );

    filters.type = typeFilter?.value || nextType;
    filters.axes = axesFilter?.value || nextAxes;
    syncFilterControls();
  }

  function renderElementOptions(selectedId = state.selectedBimElementId) {
    if (!elementSelect) return;
    refreshElementGeoHints();

    const previousValue = selectedId || "";
    const filteredElements = getFilteredElements();
    const visibleElements = filteredElements.slice(0, 100);
    const selectedElement = previousValue
      ? elementsById.get(previousValue)
      : null;
    elementSelect.innerHTML = "";

    const manualOption = ownerDocument.createElement("option");
    manualOption.value = "";
    manualOption.textContent = t("form_manual_entry_without_bim");
    elementSelect.appendChild(manualOption);

    if (selectedElement) {
      const selectedKey =
        selectedElement.elementId || selectedElement.id || "";
      if (
        !visibleElements.some(
          (element) => (element.elementId || element.id || "") === selectedKey
        )
      ) {
        visibleElements.unshift(selectedElement);
      }
    }

  setBimResultHint(elementSelect, filteredElements.length);

    visibleElements.forEach((element) => {
      const option = ownerDocument.createElement("option");
      option.value = element.elementId || element.id || "";
      option.textContent = buildBimElementOptionLabel(element);
      elementSelect.appendChild(option);
    });

    if (
      !selectedElement &&
      filteredElements.length === 0 &&
      elements.length > 0
    ) {
      const emptyOption = ownerDocument.createElement("option");
      emptyOption.value = "__empty__";
      emptyOption.textContent =
        "По текущим фильтрам BIM-элементы не найдены";
      emptyOption.disabled = true;
      elementSelect.appendChild(emptyOption);
    }

    const hasPreviousValue =
      previousValue === "" ||
      visibleElements.some(
        (element) =>
          (element.elementId || element.id || "") === previousValue
      );
    elementSelect.value = hasPreviousValue ? previousValue : "";
    renderVisualPanel();
  }

  function updateControls() {
    const filteredElements = getFilteredElements();
    const snapshot = state.bimBindingSnapshot;
    const hasProject = Boolean(getCurrentProjectId());
    const hasElements = elements.length > 0;

    [elementSelect, searchInput, typeFilter, axesFilter].forEach((control) => {
      if (control) control.disabled = !hasProject || !hasElements;
    });
    if (dom.btnClearGeoBimSelection) {
      (dom.btnClearGeoBimSelection as HTMLButtonElement).disabled =
        !state.selectedBimElementId;
    }

    if (!hasProject) {
      setStatus(
        "Сначала выберите объект. После этого станут доступны BIM-элементы проекта."
      );
      return;
    }

    const selectedElement = getSelectedElement();
    if (!selectedElement && snapshot && !snapshot.resolved) {
      setStatus(
        "BIM-привязка сохранена в узле, но сам импортированный элемент сейчас не найден в проекте. Можно перепривязать элемент или продолжить вручную.",
        "info"
      );
      return;
    }
    if (!hasElements) {
      setStatus(BIM_MANUAL_MODE_MESSAGE);
      return;
    }
    if (!selectedElement) {
      if (hasActiveFilters()) {
        setStatus(
          filteredElements.length === 0
            ? "По текущим фильтрам BIM-элементы не найдены. Можно ослабить фильтры или продолжить вручную."
            : `Найдено ${filteredElements.length} BIM-элементов. Выберите элемент или продолжайте ручной ввод.`,
          "info"
        );
        return;
      }
      setStatus(BIM_MANUAL_MODE_MESSAGE);
      return;
    }

    const typeLabel = getConstructionLabel(
      getTehnadzorTypeByBimType(selectedElement.type),
      "Элемент"
    );
    setStatus(
      `Выбран ${typeLabel}${selectedElement.mark ? ` ${selectedElement.mark}` : ""}. Координаты X/Y/H подставлены, ручное редактирование сохранено.`,
      "success"
    );
  }

  function syncFieldsFromState() {
    const selectedElement = getSelectedElement();
    if (!selectedElement) {
      renderElementOptions("");
      if (elementSelect) elementSelect.value = "";
      if (markInput && !markInput.dataset.lockedByNode) markInput.value = "";
      if (axesInput && !axesInput.dataset.lockedByNode) axesInput.value = "";
      renderBindingSnapshot();
      updateControls();
      return;
    }

    const selectedId =
      selectedElement.elementId || selectedElement.id || "";
    renderElementOptions(selectedId);
    if (elementSelect) elementSelect.value = selectedId;
    if (markInput) markInput.value = selectedElement.mark || "";
    if (axesInput) axesInput.value = getBimAxesValue(selectedElement);
    state.bimBindingSnapshot = buildGeodesyBimBindingSnapshot({
      element: selectedElement
    });
    renderBindingSnapshot();
    updateControls();
  }

  function clear({ keepManualFields = true } = {}) {
    state.selectedBimElementId = "";
    state.bimBindingSnapshot = null;
    renderElementOptions("");
    if (elementSelect) elementSelect.value = "";
    if (!keepManualFields) {
      if (markInput) markInput.value = "";
      if (axesInput) axesInput.value = "";
    }
    renderBindingSnapshot();
    updateControls();
  }

  async function loadProjectElements(projectId: string | null) {
    elements.length = 0;
    elementsById.clear();
    state.selectedBimElementId = "";
    state.bimBindingSnapshot = null;
    resetFilters();
    syncFilterControls();
    if (markInput) markInput.value = "";
    if (axesInput) axesInput.value = "";
    renderBindingSnapshot();
    renderFilterOptions();
    renderElementOptions("");
    syncIfcImportControls();

    if (!projectId || String(projectId).trim() === "") {
      updateControls();
      return;
    }

    try {
      const records = await service.loadBimElements(projectId);
      replaceGeodesyItems(
        elements,
        normalizeGeodesyBimRecords(records)
      );
      elements.forEach((element) => {
        const key = element.elementId || element.id;
        if (key) elementsById.set(key, element);
      });
      if (!getCurrentIfcFile() && elements.length === 0) {
        resetImportedModelState();
      }
      renderFilterOptions();
      renderElementOptions("");
      updateControls();
      syncIfcImportControls();
    } catch (error) {
      console.error("Ошибка загрузки BIM-элементов:", error);
      setStatus(BIM_LOAD_ERROR_MESSAGE, "error");
      syncIfcImportControls();
    }
  }

  function createLinearRowFromBim(
    prefill: Partial<GeoPrefill>,
    bindingHint: GeodesyLinearBindingHint | null,
    previousRow: GeodesyLinearDraft | null,
    createRow: () => GeodesyLinearDraft
  ) {
    const row = createRow();
    const points = createGeoLinearPrefillPoints(prefill);
    if (!points) return row;

    const nextBindingType =
      bindingHint?.bindingType ||
      (Math.abs(points.endX - points.startX) >=
      Math.abs(points.endY - points.startY)
        ? "number_letters"
        : "letter_numbers");
    row.bindingType =
      nextBindingType === "letter_numbers"
        ? "letter_numbers"
        : "number_letters";

    if (row.bindingType === "number_letters") {
      row.numberAxis = String(bindingHint?.numberAxis || "");
      row.letterAxis1 = String(bindingHint?.letterAxis1 || "");
      row.letterAxis2 = String(bindingHint?.letterAxis2 || "");
      row.projX_num_let1 = formatGeoBimNumericField(points.startX);
      row.projY_num_let1 = formatGeoBimNumericField(points.startY);
      row.projX_num_let2 = formatGeoBimNumericField(points.endX);
      row.projY_num_let2 = formatGeoBimNumericField(points.endY);
      if (previousRow) {
        row.factX_num_let1 = previousRow.factX_num_let1 || "";
        row.factY_num_let1 = previousRow.factY_num_let1 || "";
        row.factX_num_let2 = previousRow.factX_num_let2 || "";
        row.factY_num_let2 = previousRow.factY_num_let2 || "";
      }
      return row;
    }

    row.letterAxis = String(bindingHint?.letterAxis || "");
    row.numberAxis1 = String(bindingHint?.numberAxis1 || "");
    row.numberAxis2 = String(bindingHint?.numberAxis2 || "");
    row.projX_let_num1 = formatGeoBimNumericField(points.startX);
    row.projY_let_num1 = formatGeoBimNumericField(points.startY);
    row.projX_let_num2 = formatGeoBimNumericField(points.endX);
    row.projY_let_num2 = formatGeoBimNumericField(points.endY);
    if (previousRow) {
      row.factX_let_num1 = previousRow.factX_let_num1 || "";
      row.factY_let_num1 = previousRow.factY_let_num1 || "";
      row.factX_let_num2 = previousRow.factX_let_num2 || "";
      row.factY_let_num2 = previousRow.factY_let_num2 || "";
    }
    return row;
  }

  function parseSingleAxes(rawAxes: unknown) {
    const normalized = String(rawAxes || "")
      .trim()
      .replace(/\s+/g, "");
    const match = normalized.match(
      /^([A-Za-zА-Яа-я])[-xX×:]?(\d+)$/u
    );
    if (!match) return null;
    return {
      letter: match[1].toUpperCase(),
      number: match[2]
    };
  }

  function parseRangeAxes(rawAxes: unknown) {
    const normalized = String(rawAxes || "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();
    const match = normalized.match(
      /^([A-ZА-Я])[-–—]([A-ZА-Я])(?:[,;/|]|[X×Х])(\d+)[-–—](\d+)$/u
    );
    if (match) {
      return {
        letterFrom: match[1],
        letterTo: match[2],
        numberFrom: match[3],
        numberTo: match[4]
      };
    }

    const single = parseSingleAxes(rawAxes);
    return single
      ? {
          letterFrom: single.letter,
          letterTo: single.letter,
          numberFrom: single.number,
          numberTo: single.number
        }
      : null;
  }

  function selectHasOption(
    select: HTMLSelectElement | null,
    value: string
  ) {
    return Array.from(select?.options || []).some(
      (option) => option.value === value
    );
  }

  function tryApplySingleAxisHint(
    hint: GeodesySingleAxisHint | null | undefined
  ) {
    const letter = String(hint?.letter || "");
    const number = String(hint?.number || "");
    if (
      !letter ||
      !number ||
      !selectHasOption(axisLetter, letter) ||
      !selectHasOption(axisNumber, number)
    ) {
      return false;
    }
    axisLetter.value = letter;
    axisNumber.value = number;
    return true;
  }

  function tryApplyAxes(rawAxes: unknown, constructionType: string) {
    const flags = getGeoConstructionFlags(constructionType);
    if (flags.isRangeLocation) {
      const range = parseRangeAxes(rawAxes);
      if (
        !range ||
        !selectHasOption(axisLetterFrom, range.letterFrom) ||
        !selectHasOption(axisLetterTo, range.letterTo) ||
        !selectHasOption(axisNumberFrom, range.numberFrom) ||
        !selectHasOption(axisNumberTo, range.numberTo)
      ) {
        return false;
      }
      if (axisLetterFrom) axisLetterFrom.value = range.letterFrom;
      if (axisLetterTo) axisLetterTo.value = range.letterTo;
      if (axisNumberFrom) axisNumberFrom.value = range.numberFrom;
      if (axisNumberTo) axisNumberTo.value = range.numberTo;
      return true;
    }

    const single = parseSingleAxes(rawAxes);
    if (
      !single ||
      !selectHasOption(axisLetter, single.letter) ||
      !selectHasOption(axisNumber, single.number)
    ) {
      return false;
    }
    axisLetter.value = single.letter;
    axisNumber.value = single.number;
    return true;
  }

  function applySelection(
    elementId: string,
    { preserveManualFacts = true } = {}
  ) {
    const resolution = resolveGeodesyBimSelection(elementsById, elementId);
    if (resolution.mode === "manual") {
      clear({ keepManualFields: true });
      return false;
    }
    if (!resolution.element) {
      setStatus(
        "Выбранный BIM-элемент не найден в проекте. Обновите список элементов.",
        "error"
      );
      return false;
    }

    const element = resolution.element;
    const form = getForm();
    state.selectedBimElementId = resolution.selectedId;
    syncFieldsFromState();

    const targetConstruction =
      getTehnadzorTypeByBimType(element.type) ||
      getCurrentConstructionKey() ||
      normalizeConstructionKey(
        APP_CONFIG.DEFAULT_CONSTRUCTION,
        "floor_slab"
      );
    const flags = getGeoConstructionFlags(targetConstruction);
    setConstructionAndTrigger(targetConstruction);
    state.bimBindingSnapshot = buildGeodesyBimBindingSnapshot({
      element,
      constructionType: targetConstruction
    });

    const prefill = buildGeoPrefillFromBimElement(element);
    for (const field of [projectXInput, projectYInput, projectHInput]) delete field.dataset.unitUnconfirmed;
    projectXInput.value = formatGeoBimNumericField(prefill.projX);
    projectYInput.value = formatGeoBimNumericField(prefill.projY);
    projectHInput.value = formatGeoBimNumericField(prefill.projH);
    floorInput.value = element.floor || "";

    if (
      !flags.isColumn &&
      !flags.isWall &&
      !flags.isBeam &&
      !flags.usesWallsSheet
    ) {
      const rawAxes = getBimAxesValue(element);
      const appliedNativeAxes = rawAxes
        ? tryApplyAxes(rawAxes, targetConstruction)
        : false;
      if (!appliedNativeAxes && !flags.isRangeLocation) {
        tryApplySingleAxisHint(element.geoSingleAxisHint);
      }
      form.syncGeoPlateAxisPrevValues();
    }

    if (flags.isColumn) {
      columnMarkInput.value = element.mark || "";
      const firstColumn = form.ensureColumnPrefillRow();
      firstColumn.mark = element.mark || firstColumn.mark || "";
      firstColumn.projX = formatGeoBimNumericField(prefill.projX);
      firstColumn.projY = formatGeoBimNumericField(prefill.projY);
      if (!preserveManualFacts) {
        firstColumn.factX = "";
        firstColumn.factY = "";
      }
      form.renderColumns();
    }

    if (flags.isWall) {
      const previousWall = preserveManualFacts
        ? state.walls[0] || null
        : null;
      replaceGeodesyItems(state.walls, [
        createLinearRowFromBim(
          prefill,
          element.geoBindingHint || null,
          previousWall,
          form.createEmptyWallRow
        )
      ]);
      form.renderWalls();
    }

    if (flags.isBeam) {
      const previousBeam = preserveManualFacts
        ? state.beams[0] || null
        : null;
      replaceGeodesyItems(state.beams, [
        createLinearRowFromBim(
          prefill,
          element.geoBindingHint || null,
          previousBeam,
          form.createEmptyBeamRow
        )
      ]);
      form.renderBeams();
    }

    renderBindingSnapshot();
    form.updateNodeId();
    updateControls();

    if (flags.isWall || flags.isBeam) {
      const resolvedAxes = getBimAxesValue(element);
      setStatus(
        `${getCurrentConstructionLabel()}${element.mark ? ` ${element.mark}` : ""}: подставлены две проектные точки${resolvedAxes ? ` и оси ${resolvedAxes}` : ""}.`,
        "success"
      );
    }
    return true;
  }

  function syncFromNode(node: GeodesyNodeRecord) {
    const restored = restoreGeodesyBimSelection(
      elementsById,
      node,
      node.construction ||
        node.constructionType ||
        getCurrentConstructionKey()
    );
    state.selectedBimElementId = restored.selectedId;
    state.bimBindingSnapshot = restored.snapshot;

    renderElementOptions(restored.selectedId);
    if (elementSelect) {
      elementSelect.value =
        restored.mode === "selected" ? restored.selectedId : "";
    }
    if (markInput) {
      markInput.value = node.bimMark || restored.element?.mark || "";
    }
    if (axesInput) {
      axesInput.value =
        node.bimAxes || getBimAxesValue(restored.element);
    }
    renderBindingSnapshot();
    updateControls();
  }

  function collectNodeData() {
    return collectGeodesyBimNodeData({
      selectedId: state.selectedBimElementId,
      selectedElement: getSelectedElement(),
      mark: markInput?.value || "",
      axes: axesInput?.value || ""
    });
  }

  const renderFilteredElements = debounce(() => {
    renderElementOptions(state.selectedBimElementId);
    updateControls();
  }, 160);

  function start() {
    if (started) return api;
    started = true;
    ownerDocument.addEventListener("app:language-changed", () => { renderFilterOptions(); renderElementOptions(); });

    elementSelect?.addEventListener("change", () => {
      applySelection(elementSelect.value);
    });
    searchInput?.addEventListener("input", () => {
      filters.search = searchInput.value || "";
      renderFilteredElements();
    });
    typeFilter?.addEventListener("change", () => {
      filters.type = normalizeGeodesyBimFilterValue(typeFilter.value);
      renderElementOptions(state.selectedBimElementId);
      updateControls();
    });
    axesFilter?.addEventListener("change", () => {
      filters.axes = normalizeGeodesyBimFilterValue(axesFilter.value);
      renderElementOptions(state.selectedBimElementId);
      updateControls();
    });
    dom.btnClearGeoBimSelection?.addEventListener("click", () => {
      clear({ keepManualFields: true });
      setStatus(
        "BIM-привязка снята. Текущие значения в форме сохранены для ручного редактирования.",
        "info"
      );
    });
    onAppTabActivated("geo", renderVisualPanel);
    renderFilterOptions();
    renderElementOptions("");
    updateControls();
    return api;
  }

  const api = {
    start,
    applySelection,
    clear,
    collectNodeData,
    getFilteredElements,
    loadProjectElements,
    syncFromNode,
    updateControls
  };

  return api;
}

export type GeodesyBimSelectionRuntime = ReturnType<
  typeof createGeodesyBimSelectionRuntime
>;
