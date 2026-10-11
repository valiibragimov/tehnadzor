import { translateEngineeringLabel } from "../../shared/i18n/index.js";
import { APP_CONFIG } from "../../config.js";
import {
  CONSTRUCTION_CATEGORIES,
  getConstructionCategory,
  getConstructionCategoryKey,
  getConstructionLabel,
  getConstructionOptionsByCategory,
  getConstructionSelectionState,
  getConstructionSubtypeLabel,
  getConstructionSubtypeOptionLabel,
  getConstructionSubtypeOptions,
  getLegacyConstructionType,
  isConstructionVisibleInSelector,
  normalizeConstructionKey,
  normalizeConstructionSubtype
} from "../../app/construction.js";
import { hasInspectionField } from "../../app/inspection-registry.js";

interface ConstructionSelectionElements {
  construction: HTMLSelectElement | null;
  category: HTMLSelectElement | null;
  type: HTMLSelectElement | null;
  subtype: HTMLSelectElement | null;
  subtypeShell: HTMLElement | null;
  subtypeLabel: HTMLElement | null;
  pileElement: HTMLSelectElement | null;
  pileElementShell: HTMLElement | null;
  pileElementLabel: HTMLElement | null;
}

interface SyncConstructionOptions {
  syncVisibleControls?: boolean;
  nextSubtypeValue?: string;
  nextPileElementValue?: string;
}

export function createConstructionSelectionRuntime(
  elements: ConstructionSelectionElements
) {
  const {
    construction,
    category,
    type,
    subtype,
    subtypeShell,
    subtypeLabel,
    pileElement,
    pileElementShell,
    pileElementLabel
  } = elements;

  let currentConstructionKey = normalizeConstructionKey(
    APP_CONFIG.DEFAULT_CONSTRUCTION,
    "floor_slab"
  );
  let currentConstructionSubtype = "";
  let currentPileElement = "pile";

  function getCurrentConstructionKey() {
    return (
      construction?.dataset.machineValue ||
      currentConstructionKey ||
      APP_CONFIG.DEFAULT_CONSTRUCTION
    );
  }

  function getCurrentConstructionSubtype() {
    return construction?.dataset.subtypeKey || currentConstructionSubtype || "";
  }

  function getCurrentConstructionSubtypeLabel() {
    return (
      construction?.dataset.subtypeLabel ||
      getConstructionSubtypeOptionLabel(
        getCurrentConstructionKey(),
        getCurrentConstructionSubtype(),
        ""
      )
    );
  }

  function getCurrentPileElement() {
    return construction?.dataset.pileElementKey || currentPileElement || "pile";
  }

  function getCurrentPileElementLabel() {
    return (
      construction?.dataset.pileElementLabel ||
      (getCurrentPileElement() === "grillage" ? "Ростверк" : "Свая")
    );
  }

  function getCurrentConstructionLabel() {
    return (
      construction?.dataset.displayLabel ||
      getConstructionLabel(
        getCurrentConstructionKey(),
        construction?.value || ""
      )
    );
  }

  function getCurrentConstructionCategoryKey() {
    return (
      construction?.dataset.categoryKey ||
      getConstructionCategoryKey(getCurrentConstructionKey(), "")
    );
  }

  function buildCurrentConstructionPayload() {
    const constructionKey = getCurrentConstructionKey();
    const subtypeKey = getCurrentConstructionSubtype();
    const includePileElement = hasInspectionField(
      constructionKey,
      "geo",
      "constructionPileElement",
      subtypeKey
    );

    return {
      construction: constructionKey,
      constructionCategory: getCurrentConstructionCategoryKey(),
      constructionLabel: getCurrentConstructionLabel(),
      constructionType:
        construction?.value || getLegacyConstructionType(constructionKey),
      constructionSubtype: subtypeKey,
      constructionSubtypeLabel: getCurrentConstructionSubtypeLabel(),
      constructionPileElement: includePileElement
        ? getCurrentPileElement()
        : "",
      constructionPileElementLabel: includePileElement
        ? getCurrentPileElementLabel()
        : ""
    };
  }

  function fillConstructionCategorySelect(selectedCategoryKey: string) {
    if (!category) return;

    category.textContent = "";
    CONSTRUCTION_CATEGORIES.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.key;
      option.textContent = translateEngineeringLabel(item.label);
      category.appendChild(option);
    });

    const selectedCategory = getConstructionCategory(selectedCategoryKey);
    if (
      selectedCategoryKey &&
      selectedCategory &&
      !CONSTRUCTION_CATEGORIES.some(
        (item) => item.key === selectedCategoryKey
      )
    ) {
      const hiddenOption = document.createElement("option");
      hiddenOption.value = selectedCategory.key;
      hiddenOption.textContent = translateEngineeringLabel(selectedCategory.label);
      hiddenOption.hidden = true;
      category.appendChild(hiddenOption);
    }

    if (selectedCategoryKey) {
      category.value = selectedCategoryKey;
    }
  }

  function fillConstructionTypeSelect(
    categoryKey: string,
    selectedConstructionKey: string
  ) {
    if (!type) return false;

    const options = getConstructionOptionsByCategory(categoryKey);
    const fallbackOption = options[0] || null;
    const normalizedSelectedKey = normalizeConstructionKey(
      selectedConstructionKey,
      fallbackOption?.key || currentConstructionKey
    );

    type.textContent = "";
    options.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.key;
      option.textContent = translateEngineeringLabel(item.label);
      type.appendChild(option);
    });

    if (
      normalizedSelectedKey &&
      !options.some((item) => item.key === normalizedSelectedKey) &&
      !isConstructionVisibleInSelector(normalizedSelectedKey)
    ) {
      const hiddenSelection = getConstructionSelectionState(
        normalizedSelectedKey,
        fallbackOption?.key || "floor_slab"
      );
      const hiddenOption = document.createElement("option");
      hiddenOption.value = hiddenSelection.key;
      hiddenOption.textContent = translateEngineeringLabel(hiddenSelection.label || hiddenSelection.key);
      hiddenOption.hidden = true;
      type.appendChild(hiddenOption);
    }

    const hasSelectedOption = Array.from(type.options).some(
      (item) => item.value === normalizedSelectedKey
    );
    const finalOption = hasSelectedOption
      ? normalizedSelectedKey
      : fallbackOption?.key || "";
    if (finalOption) {
      type.value = finalOption;
    }

    return Boolean(finalOption);
  }

  function fillConstructionSubtypeSelect(
    constructionKey: string,
    selectedSubtypeValue = ""
  ) {
    if (!subtype || !subtypeShell || !subtypeLabel) {
      return "";
    }

    const options = getConstructionSubtypeOptions(constructionKey);
    const controlLabel = getConstructionSubtypeLabel(
      constructionKey,
      "Подтип"
    );
    subtype.textContent = "";

    if (!options.length) {
      subtypeShell.hidden = true;
      subtypeShell.style.display = "none";
      subtypeLabel.textContent = "";
      subtype.value = "";
      return "";
    }

    subtypeShell.hidden = false;
    subtypeShell.style.display = "";
    subtypeLabel.textContent = translateEngineeringLabel(controlLabel);
    options.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.key;
      option.textContent = translateEngineeringLabel(item.label);
      subtype.appendChild(option);
    });

    const normalizedSubtype = normalizeConstructionSubtype(
      constructionKey,
      selectedSubtypeValue,
      constructionKey
    );
    subtype.value = normalizedSubtype || options[0]?.key || "";
    return subtype.value;
  }

  function syncPileElementSelect(
    constructionKey: string,
    subtypeKey: string,
    selectedPileElement = getCurrentPileElement()
  ) {
    const showPileElement = hasInspectionField(
      constructionKey,
      "geo",
      "constructionPileElement",
      subtypeKey
    );
    if (!pileElementShell || !pileElement) {
      return showPileElement ? selectedPileElement : "";
    }

    pileElementShell.hidden = !showPileElement;
    pileElementShell.style.display = showPileElement ? "" : "none";
    if (pileElementLabel) {
      pileElementLabel.textContent = translateEngineeringLabel("Элемент");
    }

    if (!showPileElement) {
      pileElement.value = "pile";
      return "";
    }

    const normalized =
      selectedPileElement === "grillage" ||
      selectedPileElement === "Ростверк"
        ? "grillage"
        : "pile";
    pileElement.value = normalized;
    return normalized;
  }

  function syncConstructionSelectionState(
    nextConstructionValue: string,
    {
      syncVisibleControls = true,
      nextSubtypeValue = getCurrentConstructionSubtype(),
      nextPileElementValue = getCurrentPileElement()
    }: SyncConstructionOptions = {}
  ) {
    if (!construction) return false;

    const selection = getConstructionSelectionState(
      nextConstructionValue,
      normalizeConstructionKey(APP_CONFIG.DEFAULT_CONSTRUCTION, "floor_slab"),
      nextSubtypeValue
    );

    currentConstructionKey = selection.key;
    currentConstructionSubtype = selection.subtypeKey;
    currentPileElement =
      syncPileElementSelect(
        selection.key,
        selection.subtypeKey,
        nextPileElementValue
      ) || "pile";

    if (syncVisibleControls) {
      fillConstructionCategorySelect(selection.categoryKey);
      fillConstructionTypeSelect(selection.categoryKey, selection.key);
      fillConstructionSubtypeSelect(selection.key, selection.subtypeKey);
      currentPileElement =
        syncPileElementSelect(
          selection.key,
          selection.subtypeKey,
          nextPileElementValue
        ) || "pile";
    }

    construction.value = selection.legacyType;
    construction.dataset.machineValue = selection.key;
    construction.dataset.displayLabel = selection.label;
    construction.dataset.categoryKey = selection.categoryKey;
    construction.dataset.categoryLabel = selection.categoryLabel;
    construction.dataset.legacyType = selection.legacyType;
    construction.dataset.subtypeKey = selection.subtypeKey || "";
    construction.dataset.subtypeLabel = selection.subtypeLabel || "";
    construction.dataset.subtypeControlLabel =
      selection.subtypeControlLabel || "";
    construction.dataset.pileElementKey = hasInspectionField(
      selection.key,
      "geo",
      "constructionPileElement",
      selection.subtypeKey
    )
      ? currentPileElement
      : "";
    construction.dataset.pileElementLabel =
      construction.dataset.pileElementKey
        ? currentPileElement === "grillage"
          ? "Ростверк"
          : "Свая"
        : "";

    return true;
  }

  function initializeConstructionControls(initialConstructionValue: string) {
    if (!construction || !category || !type) {
      return;
    }

    syncConstructionSelectionState(initialConstructionValue, {
      syncVisibleControls: true
    });

    document.addEventListener("app:language-changed", () => { syncConstructionSelectionState(getCurrentConstructionKey()); });

    category.addEventListener("change", () => {
      const hasSelection = fillConstructionTypeSelect(category.value, "");
      if (!hasSelection) return;

      const nextSubtypeValue = fillConstructionSubtypeSelect(type.value, "");
      syncConstructionSelectionState(type.value, {
        syncVisibleControls: false,
        nextSubtypeValue
      });
      construction.dispatchEvent(new Event("change", { bubbles: true }));
    });

    type.addEventListener("change", () => {
      const nextSubtypeValue = fillConstructionSubtypeSelect(type.value, "");
      syncConstructionSelectionState(type.value, {
        syncVisibleControls: false,
        nextSubtypeValue
      });
      construction.dispatchEvent(new Event("change", { bubbles: true }));
    });

    subtype?.addEventListener("change", () => {
      const nextPileElementValue =
        syncPileElementSelect(
          type.value,
          subtype.value,
          getCurrentPileElement()
        ) || "pile";
      syncConstructionSelectionState(type.value, {
        syncVisibleControls: false,
        nextSubtypeValue: subtype.value,
        nextPileElementValue
      });
      construction.dispatchEvent(new Event("change", { bubbles: true }));
    });

    pileElement?.addEventListener("change", () => {
      syncConstructionSelectionState(type.value, {
        syncVisibleControls: false,
        nextSubtypeValue: getCurrentConstructionSubtype(),
        nextPileElementValue: pileElement.value
      });
      construction.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  return {
    buildCurrentConstructionPayload,
    getCurrentConstructionCategoryKey,
    getCurrentConstructionKey,
    getCurrentConstructionLabel,
    getCurrentConstructionSubtype,
    getCurrentConstructionSubtypeLabel,
    getCurrentPileElement,
    getCurrentPileElementLabel,
    initializeConstructionControls,
    syncConstructionSelectionState
  };
}
