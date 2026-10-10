import { t, translateEngineeringLabel } from "../../../shared/i18n/index.js";
import { setBimResultHint } from "../../../app/ui/bim-result-hint.js";
import { getConstructionLabel } from "../../../app/construction.js";
import {
  buildBimElementFilterOptions,
  buildBimElementOptionLabel,
  getTehnadzorTypeByBimType
} from "../../../app/services/bim-elements.js";
import { ensureBimVisualPanel } from "../../../app/services/bim-visual-panel.js";
import { onAppTabActivated } from "../../../app/services/module-activation.js";
import {
  buildStrengthBimBindingSnapshot,
  clearStrengthBimManualFields,
  collectStrengthBimPayload,
  filterStrengthBimElements,
  formatStrengthBimDisplayValue,
  formatStrengthBimShortGuid,
  hasStrengthBimBindingData,
  matchesStrengthBimMark,
  matchesStrengthBimText,
  normalizeStrengthBimFilterValue,
  normalizeStrengthBimRecords,
  normalizeStrengthBimValue,
  parseSimpleStrengthAxes,
  resolveStrengthBimSelection,
  restoreStrengthBimSelection
} from "./bim-selection.js";
import type { StrengthDomBindings } from "./dom.js";
import type { StrengthForm } from "./form.js";
import type { StrengthService } from "./service.js";
import type {
  StrengthBimBindingSnapshot,
  StrengthBimElement,
  StrengthBimFilters,
  StrengthCheckRecord
} from "./types.js";

interface StrengthBimSelectionRuntimeDependencies {
  service: StrengthService;
  dom: StrengthDomBindings;
  getCurrentProjectId(): string | null;
  getCurrentIfcFile(): File | null;
  setConstruction(
    construction: string,
    subtype?: string,
    pileElement?: string
  ): unknown;
  getForm(): StrengthForm;
}

const BIM_MANUAL_MODE_MESSAGE = "";
const BIM_LOAD_ERROR_MESSAGE =
  "Не удалось загрузить BIM-элементы. Можно продолжить ручной ввод.";

export function createStrengthBimSelectionRuntime({
  service,
  dom,
  getCurrentProjectId,
  getCurrentIfcFile,
  setConstruction,
  getForm
}: StrengthBimSelectionRuntimeDependencies) {
  let elements: StrengthBimElement[] = [];
  const elementsById = new Map<string, StrengthBimElement>();
  let selectedElementId = "";
  let bindingSnapshot: StrengthBimBindingSnapshot | null = null;
  const filters: StrengthBimFilters = {
    search: "",
    type: "all",
    axes: "all"
  };
  let visualPanel: ReturnType<typeof ensureBimVisualPanel> | null = null;
  let bindingsInitialized = false;

  function getSelectedElement() {
    return elementsById.get(selectedElementId) || null;
  }

  function getFilteredElements() {
    return filterStrengthBimElements(elements, filters);
  }

  function ensureVisualSelector() {
    if (visualPanel) return visualPanel;

    visualPanel = ensureBimVisualPanel({
      host: dom.bimPanelHost,
      sourceCard: dom.bimSourceCard,
      getAllElements: () => elements,
      getFilteredElements,
      getSelectedElement,
      getSelectedId: () => selectedElementId,
      getCurrentProjectId,
      getCurrentIfcFile,
      onSelect: applySelection,
      labelBuilder: buildBimElementOptionLabel,
      moduleKey: "strength"
    });

    return visualPanel;
  }

  function renderVisualPanel() {
    void ensureVisualSelector()?.render();
  }

  function getFieldShell(field: HTMLElement | null) {
    return field?.closest("div") || null;
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

  function clearStaticHighlights() {
    [
      dom.bimMark,
      dom.bimAxes,
      dom.floor,
      dom.axisLetterFrom,
      dom.axisLetterTo,
      dom.axisNumberFrom,
      dom.axisNumberTo,
      dom.marking
    ].forEach((field) => setFieldAutofilled(field, false));
  }

  function tryApplyPlateAxes(
    rawAxes: unknown,
    { overwrite = false } = {}
  ) {
    const parsedAxes = parseSimpleStrengthAxes(rawAxes);
    if (!parsedAxes) return false;

    const hasManualAxes = [
      dom.axisLetterFrom?.value,
      dom.axisLetterTo?.value,
      dom.axisNumberFrom?.value,
      dom.axisNumberTo?.value
    ].some((value) => String(value || "").trim() !== "");
    if (hasManualAxes && !overwrite) return false;

    const hasOption = (
      select: HTMLSelectElement | null,
      value: string
    ) => Array.from(select?.options || []).some(
      (option) => option.value === value
    );
    if (
      !hasOption(dom.axisLetterFrom, parsedAxes.axisLetterFrom) ||
      !hasOption(dom.axisLetterTo, parsedAxes.axisLetterTo) ||
      !hasOption(dom.axisNumberFrom, parsedAxes.axisNumberFrom) ||
      !hasOption(dom.axisNumberTo, parsedAxes.axisNumberTo)
    ) {
      return false;
    }

    if (dom.axisLetterFrom) {
      dom.axisLetterFrom.value = parsedAxes.axisLetterFrom;
    }
    if (dom.axisLetterTo) {
      dom.axisLetterTo.value = parsedAxes.axisLetterTo;
    }
    if (dom.axisNumberFrom) {
      dom.axisNumberFrom.value = parsedAxes.axisNumberFrom;
    }
    if (dom.axisNumberTo) {
      dom.axisNumberTo.value = parsedAxes.axisNumberTo;
    }
    getForm().updateLocation();
    return true;
  }

  function resetFilters() {
    filters.search = "";
    filters.type = "all";
    filters.axes = "all";
  }

  function syncFilterControls() {
    if (dom.bimSearchInput?.value !== filters.search) {
      if (dom.bimSearchInput) dom.bimSearchInput.value = filters.search;
    }
    if (dom.bimTypeFilter?.value !== filters.type) {
      if (dom.bimTypeFilter) dom.bimTypeFilter.value = filters.type;
    }
    if (dom.bimAxesFilter?.value !== filters.axes) {
      if (dom.bimAxesFilter) dom.bimAxesFilter.value = filters.axes;
    }
  }

  function hasActiveFilters() {
    return (
      filters.search.trim() !== "" ||
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

    const defaultOption = dom.document.createElement("option");
    defaultOption.value = "all";
    defaultOption.textContent = translateEngineeringLabel(defaultLabel);
    select.appendChild(defaultOption);

    const visibleOptions = options.slice(0, 100);
  const activeOption = options.find(option => option.value === nextValue);
  if (activeOption && !visibleOptions.includes(activeOption)) visibleOptions.unshift(activeOption);
  setBimResultHint(select, options.length);
  visibleOptions.forEach((optionData) => {
      const option = dom.document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      select.appendChild(option);
    });

    const hasNextValue =
      nextValue === "all" ||
      options.some((optionData) => optionData.value === nextValue);
    select.value = hasNextValue ? nextValue : "all";
    select.disabled = !getCurrentProjectId() || elements.length === 0;
  }

  function renderFilterOptions() {
    const options = buildBimElementFilterOptions(elements);
    const typeOptions = options.types.map((option) => ({
      value: String(option.value),
      label: String(option.label)
    }));
    const axesOptions = options.axes.map((option) => ({
      value: String(option.value),
      label: String(option.label)
    }));
    const nextType = normalizeStrengthBimFilterValue(filters.type);
    const nextAxes = normalizeStrengthBimFilterValue(filters.axes);

    fillFilterSelect(
      dom.bimTypeFilter,
      typeOptions,
      "Все типы",
      nextType
    );
    fillFilterSelect(
      dom.bimAxesFilter,
      axesOptions,
      "Все оси",
      nextAxes
    );

    filters.type = dom.bimTypeFilter?.value || nextType;
    filters.axes = dom.bimAxesFilter?.value || nextAxes;
    syncFilterControls();
  }

  function renderElementOptions(selectedId = selectedElementId) {
    if (!dom.bimElementSelect) return;

    const previousValue = selectedId || "";
    const filteredElements = getFilteredElements();
    const visibleElements = filteredElements.slice(0, 100);
    const selectedElement = previousValue
      ? elementsById.get(previousValue) || null
      : null;
    dom.bimElementSelect.innerHTML = "";

    const manualOption = dom.document.createElement("option");
    manualOption.value = "";
    manualOption.textContent = t("form_manual_entry_without_bim");
    dom.bimElementSelect.appendChild(manualOption);

    if (selectedElement) {
      const selectedKey =
        selectedElement.elementId || selectedElement.id || "";
      const alreadyVisible = visibleElements.some(
        (element) =>
          (element.elementId || element.id || "") === selectedKey
      );
      if (!alreadyVisible) visibleElements.unshift(selectedElement);
    }

  setBimResultHint(dom.bimElementSelect, filteredElements.length);

    visibleElements.forEach((element) => {
      const option = dom.document.createElement("option");
      option.value = element.elementId || element.id || "";
      option.textContent = buildBimElementOptionLabel(element);
      dom.bimElementSelect?.appendChild(option);
    });

    if (
      !selectedElement &&
      filteredElements.length === 0 &&
      elements.length > 0
    ) {
      const emptyOption = dom.document.createElement("option");
      emptyOption.value = "__empty__";
      emptyOption.textContent =
        "По текущим фильтрам BIM-элементы не найдены";
      emptyOption.disabled = true;
      dom.bimElementSelect.appendChild(emptyOption);
    }

    const hasPreviousValue =
      previousValue === "" ||
      visibleElements.some(
        (element) =>
          (element.elementId || element.id || "") === previousValue
      );
    dom.bimElementSelect.value = hasPreviousValue ? previousValue : "";
    renderVisualPanel();
  }

  function setStatus(message: string, tone = "muted") {
    if (!dom.bimElementStatus) return;
    const hasMessage = Boolean(message.trim());
    dom.bimElementStatus.textContent = message;
    dom.bimElementStatus.hidden = !hasMessage;
    dom.bimElementStatus.dataset.empty = hasMessage ? "0" : "1";
    const statusField = dom.bimElementStatus.closest(
      ".geo-bim-status-field"
    ) as HTMLElement | null;
    if (statusField) statusField.hidden = !hasMessage;
    dom.bimElementStatus.style.color =
      tone === "error"
        ? "#fca5a5"
        : tone === "success"
          ? "#86efac"
          : tone === "info"
            ? "#93c5fd"
            : "#E6B450";
  }

  function updateHighlights(snapshot = bindingSnapshot) {
    clearStaticHighlights();
    if (!snapshot) return;

    setFieldAutofilled(
      dom.bimMark,
      matchesStrengthBimText(dom.bimMark?.value, snapshot.mark)
    );
    setFieldAutofilled(
      dom.bimAxes,
      matchesStrengthBimText(dom.bimAxes?.value, snapshot.axes)
    );
    setFieldAutofilled(
      dom.floor,
      matchesStrengthBimText(dom.floor?.value, snapshot.floor)
    );

    const form = getForm();
    const construction =
      form.getSelectedConstructionKey() || dom.construction?.value || "";
    const flags = form.getConstructionFlags(construction);
    if (flags.isPlate || flags.isStair) {
      const parsedAxes = parseSimpleStrengthAxes(snapshot.axes);
      setFieldAutofilled(
        dom.axisLetterFrom,
        Boolean(
          parsedAxes &&
            matchesStrengthBimText(
              dom.axisLetterFrom?.value,
              parsedAxes.axisLetterFrom
            )
        )
      );
      setFieldAutofilled(
        dom.axisLetterTo,
        Boolean(
          parsedAxes &&
            matchesStrengthBimText(
              dom.axisLetterTo?.value,
              parsedAxes.axisLetterTo
            )
        )
      );
      setFieldAutofilled(
        dom.axisNumberFrom,
        Boolean(
          parsedAxes &&
            matchesStrengthBimText(
              dom.axisNumberFrom?.value,
              parsedAxes.axisNumberFrom
            )
        )
      );
      setFieldAutofilled(
        dom.axisNumberTo,
        Boolean(
          parsedAxes &&
            matchesStrengthBimText(
              dom.axisNumberTo?.value,
              parsedAxes.axisNumberTo
            )
        )
      );
    }

    if (flags.isColumn || flags.isBeam) {
      setFieldAutofilled(
        dom.marking,
        matchesStrengthBimMark(dom.marking?.value, snapshot.mark)
      );
    }
  }

  function renderBinding() {
    const snapshot = bindingSnapshot;
    const hasLink = Boolean(snapshot);

    if (dom.bimSourceCard) {
      dom.bimSourceCard.hidden = !hasLink;
      dom.bimSourceCard.classList.toggle("is-linked", hasLink);
      dom.bimSourceCard.classList.toggle(
        "is-stale",
        hasLink && !snapshot?.resolved
      );
    }

    if (dom.manualAssistNote) {
      const noteText = hasLink
        ? snapshot.resolved
          ? "Подсвеченные поля ниже подставлены из BIM там, где данные надёжны. Класс бетона и количество дней пока остаются ручными."
          : "BIM-привязка сохранена, но сам импортированный элемент сейчас недоступен. Поля можно продолжать редактировать вручную."
        : BIM_MANUAL_MODE_MESSAGE;
      dom.manualAssistNote.textContent = noteText;
      dom.manualAssistNote.hidden = !noteText;
      dom.manualAssistNote.classList.toggle("is-linked", hasLink);
      dom.manualAssistNote.classList.toggle(
        "is-stale",
        hasLink && !snapshot?.resolved
      );
    }

    if (!hasLink) {
      if (dom.bimSourceTitle) {
        dom.bimSourceTitle.textContent = t("form_no_bim_element_selected");
      }
      if (dom.bimSourceState) {
        dom.bimSourceState.textContent = BIM_MANUAL_MODE_MESSAGE;
      }
      if (dom.bimSourceMeta) dom.bimSourceMeta.textContent = "";
      if (dom.bimAppliedType) dom.bimAppliedType.textContent = t("form_no_data");
      if (dom.bimAppliedFloor) {
        dom.bimAppliedFloor.textContent = t("form_no_data");
      }
      if (dom.bimAppliedMark) dom.bimAppliedMark.textContent = t("form_no_data");
      if (dom.bimAppliedAxes) dom.bimAppliedAxes.textContent = t("form_no_data");
      if (dom.bimAppliedStrength) {
        dom.bimAppliedStrength.textContent = t("form_manual_entry");
      }
      if (dom.bimSourceHint) {
        dom.bimSourceHint.textContent =
          t("form_bim_supplies_type_floor_grid_axes_and_column_beam_marks_enter_concrete");
      }
      clearStaticHighlights();
      return;
    }

    if (dom.bimSourceTitle) dom.bimSourceTitle.textContent = snapshot.title;
    if (dom.bimSourceState) {
      dom.bimSourceState.textContent = snapshot.resolved
        ? "Связка активна"
        : "Источник недоступен";
    }
    if (dom.bimSourceMeta) {
      const metaParts: string[] = [];
      if (snapshot.elementId) metaParts.push(`ID ${snapshot.elementId}`);
      if (snapshot.sourceModelId) {
        metaParts.push(`Модель ${snapshot.sourceModelId}`);
      }
      if (snapshot.ifcGuid) {
        metaParts.push(
          `GUID ${formatStrengthBimShortGuid(snapshot.ifcGuid)}`
        );
      }
      dom.bimSourceMeta.textContent = metaParts.join(" · ");
    }
    if (dom.bimAppliedType) {
      dom.bimAppliedType.textContent = formatStrengthBimDisplayValue(
        snapshot.typeLabel
      );
    }
    if (dom.bimAppliedFloor) {
      dom.bimAppliedFloor.textContent = formatStrengthBimDisplayValue(
        snapshot.floor
      );
    }
    if (dom.bimAppliedMark) {
      dom.bimAppliedMark.textContent = formatStrengthBimDisplayValue(
        snapshot.mark
      );
    }
    if (dom.bimAppliedAxes) {
      dom.bimAppliedAxes.textContent = formatStrengthBimDisplayValue(
        snapshot.axes
      );
    }
    if (dom.bimAppliedStrength) {
      dom.bimAppliedStrength.textContent = snapshot.resolved
        ? "Класс бетона и дни пока вручную"
        : "Источник недоступен";
    }
    if (dom.bimSourceHint) {
      dom.bimSourceHint.textContent = snapshot.resolved
        ? "Из текущего BIM-MVP в прочность надёжно приходят тип, этаж, BIM-оси и марка для колонн/балок. Класс бетона и количество дней пока вводятся вручную."
        : "BIM-связка сохранена в проверке, но этот элемент сейчас не найден среди импортированных элементов проекта.";
    }

    updateHighlights(snapshot);
  }

  function updateControls() {
    const filteredElements = getFilteredElements();
    const projectId = getCurrentProjectId();
    const controlsDisabled = !projectId || elements.length === 0;
    if (dom.bimElementSelect) {
      dom.bimElementSelect.disabled = controlsDisabled;
    }
    if (dom.bimSearchInput) dom.bimSearchInput.disabled = controlsDisabled;
    if (dom.bimTypeFilter) dom.bimTypeFilter.disabled = controlsDisabled;
    if (dom.bimAxesFilter) dom.bimAxesFilter.disabled = controlsDisabled;
    if (dom.clearBimSelectionButton) {
      dom.clearBimSelectionButton.disabled = !selectedElementId;
    }

    if (!projectId) {
      setStatus(
        "Сначала выберите объект. После этого станут доступны BIM-элементы проекта."
      );
      return;
    }

    const selectedElement = getSelectedElement();
    if (!selectedElement && bindingSnapshot && !bindingSnapshot.resolved) {
      setStatus(
        "BIM-привязка сохранена в проверке, но сам импортированный элемент сейчас не найден в проекте. Можно перепривязать элемент или продолжить вручную.",
        "info"
      );
      return;
    }

    if (elements.length === 0) {
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
      `${typeLabel} выбран из BIM. Привязка сохранится вместе с проверкой.`,
      "success"
    );
  }

  function collectCheckData() {
    return collectStrengthBimPayload({
      selectedId: selectedElementId,
      selectedElement: getSelectedElement(),
      snapshot: bindingSnapshot,
      mark: dom.bimMark?.value,
      axes: dom.bimAxes?.value
    });
  }

  function applyPrefill(
    element: StrengthBimElement | null,
    { overwrite = false } = {}
  ) {
    if (!element) return;
    if (
      dom.floor &&
      element.floor &&
      (overwrite || !dom.floor.value.trim())
    ) {
      dom.floor.value = element.floor;
    }

    const targetConstruction =
      dom.construction?.value ||
      getTehnadzorTypeByBimType(element.type) ||
      "";
    const flags = getForm().getConstructionFlags(targetConstruction);
    if ((flags.isPlate || flags.isStair) && element.axes) {
      tryApplyPlateAxes(element.axes, { overwrite });
    }
    if (
      (flags.isColumn || flags.isBeam) &&
      dom.marking &&
      element.mark &&
      (overwrite || !normalizeStrengthBimValue(dom.marking.value))
    ) {
      dom.marking.value = element.mark;
    }
  }

  function restoreSelection(check: StrengthCheckRecord = {}) {
    const restored = restoreStrengthBimSelection(
      elementsById,
      check,
      String(
        check.construction ||
          check.constructionType ||
          getForm().getSelectedConstructionKey() ||
          ""
      )
    );
    selectedElementId = restored.selectedId;
    bindingSnapshot = restored.snapshot;

    renderElementOptions(restored.selectedId);
    if (dom.bimElementSelect) {
      dom.bimElementSelect.value =
        restored.mode === "selected" ? restored.selectedId : "";
    }
    if (dom.bimMark) {
      dom.bimMark.value =
        check.bimMark || restored.element?.mark || "";
    }
    if (dom.bimAxes) {
      dom.bimAxes.value =
        check.bimAxes || restored.element?.axes || "";
    }
    if (restored.element) applyPrefill(restored.element);
    renderBinding();
    updateControls();
  }

  function clearSelection({ keepManualFields = true } = {}) {
    selectedElementId = "";
    bindingSnapshot = null;
    const manualFields = clearStrengthBimManualFields({
      keepManualFields,
      mark: dom.bimMark?.value || "",
      axes: dom.bimAxes?.value || ""
    });
    if (dom.bimMark) dom.bimMark.value = manualFields.mark;
    if (dom.bimAxes) dom.bimAxes.value = manualFields.axes;
    renderElementOptions("");
    if (dom.bimElementSelect) dom.bimElementSelect.value = "";
    renderBinding();
    updateControls();
  }

  function applySelection(elementId: string) {
    const resolution = resolveStrengthBimSelection(
      elementsById,
      elementId
    );
    if (resolution.mode === "manual") {
      clearSelection({ keepManualFields: true });
      return;
    }
    if (!resolution.element) {
      setStatus(
        "Выбранный BIM-элемент не найден в проекте. Обновите список элементов.",
        "error"
      );
      return;
    }

    selectedElementId = resolution.selectedId;
    const targetConstruction =
      getTehnadzorTypeByBimType(resolution.element.type) ||
      dom.construction?.value ||
      "";
    if (dom.construction && targetConstruction) {
      setConstruction(targetConstruction);
    }

    renderElementOptions(resolution.selectedId);
    if (dom.bimElementSelect) {
      dom.bimElementSelect.value = resolution.selectedId;
    }
    if (dom.bimMark) dom.bimMark.value = resolution.element.mark || "";
    if (dom.bimAxes) dom.bimAxes.value = resolution.element.axes || "";
    bindingSnapshot = buildStrengthBimBindingSnapshot({
      element: resolution.element,
      constructionType: targetConstruction
    });
    applyPrefill(resolution.element);
    renderBinding();
    updateControls();
  }

  async function loadElements(projectId = getCurrentProjectId()) {
    const preservedBinding = collectCheckData();
    elements = [];
    elementsById.clear();
    selectedElementId = "";
    bindingSnapshot = null;
    resetFilters();
    syncFilterControls();
    if (dom.bimMark) dom.bimMark.value = "";
    if (dom.bimAxes) dom.bimAxes.value = "";
    renderBinding();
    renderFilterOptions();
    renderElementOptions("");

    if (!projectId?.trim()) {
      updateControls();
      return;
    }

    try {
      elements = normalizeStrengthBimRecords(
        await service.loadBimElements(projectId)
      );
      elements.forEach((element) => {
        const key = element.elementId || element.id;
        if (key) elementsById.set(key, element);
      });
      renderFilterOptions();
      renderElementOptions("");

      if (hasStrengthBimBindingData(preservedBinding)) {
        restoreSelection(preservedBinding as StrengthCheckRecord);
      } else {
        renderBinding();
        updateControls();
      }
    } catch (error) {
      console.error(
        "Ошибка загрузки BIM-элементов для прочности:",
        error
      );
      setStatus(BIM_LOAD_ERROR_MESSAGE, "error");
    }
  }

  function initBindings() {
    if (bindingsInitialized) return;
    bindingsInitialized = true;
    dom.document.addEventListener("app:language-changed", () => { renderFilterOptions(); renderElementOptions(); });
    renderFilterOptions();
    renderElementOptions("");
    renderBinding();
    updateControls();

    dom.bimElementSelect?.addEventListener("change", (event) => {
      const nextId = (event.currentTarget as HTMLSelectElement).value;
      if (nextId !== "__empty__") applySelection(nextId);
    });
    dom.bimSearchInput?.addEventListener("input", (event) => {
      filters.search = (
        event.currentTarget as HTMLInputElement
      ).value.trim();
      renderElementOptions();
      updateControls();
    });
    dom.bimTypeFilter?.addEventListener("change", (event) => {
      filters.type = normalizeStrengthBimFilterValue(
        (event.currentTarget as HTMLSelectElement).value
      );
      renderElementOptions();
      updateControls();
    });
    dom.bimAxesFilter?.addEventListener("change", (event) => {
      filters.axes = normalizeStrengthBimFilterValue(
        (event.currentTarget as HTMLSelectElement).value
      );
      renderElementOptions();
      updateControls();
    });
    dom.clearBimSelectionButton?.addEventListener("click", () => {
      clearSelection({ keepManualFields: true });
      setStatus(
        "BIM-привязка снята. Текущие значения в форме сохранены для ручного редактирования.",
        "info"
      );
    });
    [dom.floor, dom.bimMark, dom.bimAxes, dom.marking].forEach(
      (field) => field?.addEventListener("input", () => updateHighlights())
    );
    onAppTabActivated("strength", renderVisualPanel);
  }

  return {
    collectCheckData,
    restoreSelection,
    clearSelection,
    renderBinding,
    updateControls,
    updateHighlights,
    initBindings,
    loadElements,
    renderVisualPanel
  };
}

export type StrengthBimSelectionRuntime = ReturnType<
  typeof createStrengthBimSelectionRuntime
>;
