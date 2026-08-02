import { getConstructionLabel } from "../../../app/construction.js";
import {
  buildBimElementSearchText,
  formatBimElementLabel,
  getTehnadzorTypeByBimType,
  normalizeProjectBimElement,
  sortProjectBimElements
} from "../../../app/services/bim-elements.js";
import type {
  ReinforcementBimBindingSnapshot,
  ReinforcementBimElement,
  ReinforcementBimElementRecord,
  ReinforcementBimFields,
  ReinforcementBimFilters,
  ReinforcementCheckRecord
} from "./types.js";

export interface ReinforcementBimSelectionResolution {
  mode: "manual" | "selected" | "unavailable";
  selectedId: string;
  element: ReinforcementBimElement | null;
}

export interface ReinforcementAxisRange {
  axisLetterFrom: string;
  axisLetterTo: string;
  axisNumberFrom: string;
  axisNumberTo: string;
}

export function normalizeReinforcementBimValue(value: unknown) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function hasReinforcementBimValue(value: unknown) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ""
  );
}

export function formatReinforcementBimDisplayValue(
  value: unknown,
  fallback = "Нет данных"
) {
  return hasReinforcementBimValue(value) ? String(value) : fallback;
}

export function formatReinforcementBimShortGuid(value: unknown) {
  const normalized = normalizeReinforcementBimValue(value);
  if (!normalized) return null;
  return normalized.length > 16
    ? `${normalized.slice(0, 6)}...${normalized.slice(-6)}`
    : normalized;
}

export function matchesReinforcementBimText(
  currentValue: unknown,
  bimValue: unknown
) {
  return (
    normalizeReinforcementBimValue(currentValue) ===
    normalizeReinforcementBimValue(bimValue)
  );
}

export function matchesReinforcementBimMark(
  currentValue: unknown,
  bimValue: unknown
) {
  const normalizeMarking = (value: unknown) =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return normalizeMarking(currentValue) === normalizeMarking(bimValue);
}

export function parseSimpleReinforcementAxes(
  rawAxes: unknown
): ReinforcementAxisRange | null {
  const axesValue = String(rawAxes || "").trim();
  if (!axesValue) return null;

  const normalized = axesValue.replace(/\s+/g, "").toUpperCase();
  const letterFirst = normalized.match(
    /^([A-ZА-ЯЁ])[-–—]([A-ZА-ЯЁ])[,;/]?(\d+)[-–—](\d+)$/u
  );
  if (letterFirst) {
    return {
      axisLetterFrom: letterFirst[1],
      axisLetterTo: letterFirst[2],
      axisNumberFrom: letterFirst[3],
      axisNumberTo: letterFirst[4]
    };
  }

  const numberFirst = normalized.match(
    /^(\d+)[-–—](\d+)[,;/]?([A-ZА-ЯЁ])[-–—]([A-ZА-ЯЁ])$/u
  );
  if (!numberFirst) return null;
  return {
    axisLetterFrom: numberFirst[3],
    axisLetterTo: numberFirst[4],
    axisNumberFrom: numberFirst[1],
    axisNumberTo: numberFirst[2]
  };
}

export function normalizeReinforcementBimFilterValue(
  value: unknown,
  fallback = "all"
) {
  return normalizeReinforcementBimValue(value) || fallback;
}

export function normalizeReinforcementBimRecords(
  records: ReinforcementBimElementRecord[]
) {
  const elements = records.flatMap((record) => {
    if (record.deleted === true) return [];
    const normalized = normalizeProjectBimElement(record.id, record);
    if (!normalized.elementId || !normalized.type) return [];
    return [normalized as ReinforcementBimElement];
  });
  return sortProjectBimElements(elements) as ReinforcementBimElement[];
}

export function filterReinforcementBimElements(
  elements: ReinforcementBimElement[],
  filters: ReinforcementBimFilters
) {
  const searchQuery = String(filters.search || "").trim().toLowerCase();
  return elements.filter((element) => {
    if (filters.type !== "all" && element.type !== filters.type) {
      return false;
    }
    const axesValue = String(element.axes || "").trim();
    if (filters.axes !== "all" && axesValue !== filters.axes) {
      return false;
    }
    return (
      !searchQuery ||
      buildBimElementSearchText(element).includes(searchQuery)
    );
  });
}

export function resolveReinforcementBimSelection(
  elementsById: Map<string, ReinforcementBimElement>,
  elementId: unknown
): ReinforcementBimSelectionResolution {
  const selectedId = String(elementId || "").trim();
  if (!selectedId) {
    return { mode: "manual", selectedId: "", element: null };
  }
  const element = elementsById.get(selectedId) || null;
  return {
    mode: element ? "selected" : "unavailable",
    selectedId,
    element
  };
}

export function buildReinforcementBimBindingSnapshot({
  element = null,
  checkData = null,
  constructionType = null
}: {
  element?: Partial<ReinforcementBimElement> | null;
  checkData?: Partial<ReinforcementCheckRecord> | null;
  constructionType?: string | null;
} = {}): ReinforcementBimBindingSnapshot | null {
  const fallbackData = checkData || {};
  const elementId =
    normalizeReinforcementBimValue(element?.elementId) ||
    normalizeReinforcementBimValue(element?.id) ||
    normalizeReinforcementBimValue(fallbackData.bimElementId);
  const rawType =
    normalizeReinforcementBimValue(element?.type)?.toLowerCase() ||
    normalizeReinforcementBimValue(fallbackData.bimType)?.toLowerCase();
  const typeLabel =
    getConstructionLabel(constructionType) ||
    getConstructionLabel(getTehnadzorTypeByBimType(rawType)) ||
    getConstructionLabel(fallbackData.construction) ||
    getConstructionLabel(fallbackData.constructionType) ||
    normalizeReinforcementBimValue(fallbackData.constructionLabel) ||
    normalizeReinforcementBimValue(fallbackData.construction);
  const floor =
    normalizeReinforcementBimValue(element?.floor) ||
    normalizeReinforcementBimValue(fallbackData.bimFloor);
  const mark =
    normalizeReinforcementBimValue(element?.mark) ||
    normalizeReinforcementBimValue(fallbackData.bimMark);
  const axes =
    normalizeReinforcementBimValue(element?.axes) ||
    normalizeReinforcementBimValue(fallbackData.bimAxes);
  const sourceModelId =
    normalizeReinforcementBimValue(element?.sourceModelId) ||
    normalizeReinforcementBimValue(fallbackData.bimSourceModelId);
  const ifcGuid =
    normalizeReinforcementBimValue(element?.ifcGuid) ||
    normalizeReinforcementBimValue(fallbackData.bimIfcGuid);

  if (
    !elementId && !rawType && !floor && !mark && !axes &&
    !sourceModelId && !ifcGuid
  ) return null;

  let title = "BIM-элемент";
  if (element) {
    title = formatBimElementLabel(element);
  } else if (typeLabel && mark) {
    title = `${typeLabel} ${mark}`;
  } else if (typeLabel) {
    title = elementId ? `${typeLabel} · ID ${elementId}` : typeLabel;
  } else if (mark) {
    title = `Элемент ${mark}`;
  } else if (elementId) {
    title = `Элемент ID ${elementId}`;
  }

  return {
    resolved: Boolean(element),
    elementId,
    rawType,
    typeLabel,
    floor,
    mark,
    axes,
    sourceModelId,
    ifcGuid,
    title
  };
}

export function restoreReinforcementBimSelection(
  elementsById: Map<string, ReinforcementBimElement>,
  check: Partial<ReinforcementCheckRecord>,
  constructionType = ""
) {
  const resolution = resolveReinforcementBimSelection(
    elementsById,
    check.bimElementId
  );
  return {
    ...resolution,
    snapshot: buildReinforcementBimBindingSnapshot({
      element: resolution.element,
      checkData: check,
      constructionType
    })
  };
}

export function hasReinforcementBimBindingData(
  data: Partial<ReinforcementBimFields> = {}
) {
  return Boolean(
    normalizeReinforcementBimValue(data.bimElementId) ||
    normalizeReinforcementBimValue(data.bimSourceModelId) ||
    normalizeReinforcementBimValue(data.bimIfcGuid) ||
    normalizeReinforcementBimValue(data.bimType) ||
    normalizeReinforcementBimValue(data.bimFloor) ||
    normalizeReinforcementBimValue(data.bimMark) ||
    normalizeReinforcementBimValue(data.bimAxes)
  );
}

export function collectReinforcementBimPayload({
  selectedId,
  selectedElement,
  snapshot,
  mark,
  axes
}: {
  selectedId: string;
  selectedElement: ReinforcementBimElement | null;
  snapshot: ReinforcementBimBindingSnapshot | null;
  mark: unknown;
  axes: unknown;
}): ReinforcementBimFields {
  if (!selectedElement && !snapshot) {
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
    bimElementId: selectedId || null,
    bimSourceModelId:
      selectedElement?.sourceModelId || snapshot?.sourceModelId || null,
    bimIfcGuid: selectedElement?.ifcGuid || snapshot?.ifcGuid || null,
    bimType: selectedElement?.type || snapshot?.rawType || null,
    bimFloor: selectedElement?.floor || snapshot?.floor || null,
    bimMark: normalizeReinforcementBimValue(mark),
    bimAxes: normalizeReinforcementBimValue(axes)
  };
}

export function clearReinforcementBimBinding({
  keepManualFields,
  mark,
  axes
}: {
  keepManualFields: boolean;
  mark: string;
  axes: string;
}) {
  return {
    selectedId: "",
    snapshot: null,
    mark: keepManualFields ? mark : "",
    axes: keepManualFields ? axes : ""
  } as const;
}
