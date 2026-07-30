import { getConstructionLabel } from "../../../app/construction.js";
import {
  buildBimElementSearchText,
  formatBimElementLabel,
  getTehnadzorTypeByBimType,
  normalizeProjectBimElement,
  sortProjectBimElements
} from "../../../app/services/bim-elements.js";
import type {
  StrengthBimBindingSnapshot,
  StrengthBimElement,
  StrengthBimElementRecord,
  StrengthBimFields,
  StrengthBimFilters,
  StrengthCheckRecord
} from "./types.js";

export interface StrengthBimSelectionResolution {
  mode: "manual" | "selected" | "unavailable";
  selectedId: string;
  element: StrengthBimElement | null;
}

export interface StrengthAxisRange {
  axisLetterFrom: string;
  axisLetterTo: string;
  axisNumberFrom: string;
  axisNumberTo: string;
}

export function normalizeStrengthBimValue(value: unknown) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function hasStrengthBimValue(value: unknown) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ""
  );
}

export function formatStrengthBimDisplayValue(
  value: unknown,
  fallback = "Нет данных"
) {
  return hasStrengthBimValue(value) ? String(value) : fallback;
}

export function formatStrengthBimShortGuid(value: unknown) {
  const normalized = normalizeStrengthBimValue(value);
  if (!normalized) return null;
  return normalized.length > 16
    ? `${normalized.slice(0, 6)}...${normalized.slice(-6)}`
    : normalized;
}

export function matchesStrengthBimText(
  currentValue: unknown,
  bimValue: unknown
) {
  return (
    normalizeStrengthBimValue(currentValue) ===
    normalizeStrengthBimValue(bimValue)
  );
}

export function matchesStrengthBimMark(
  currentValue: unknown,
  bimValue: unknown
) {
  const normalizeMarking = (value: unknown) =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return normalizeMarking(currentValue) === normalizeMarking(bimValue);
}

export function parseSimpleStrengthAxes(
  rawAxes: unknown
): StrengthAxisRange | null {
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

export function normalizeStrengthBimFilterValue(
  value: unknown,
  fallback = "all"
) {
  return normalizeStrengthBimValue(value) || fallback;
}

export function normalizeStrengthBimRecords(
  records: StrengthBimElementRecord[]
) {
  const elements = records.flatMap((record) => {
    if (record.deleted === true) return [];
    const normalized = normalizeProjectBimElement(record.id, record);
    if (!normalized.elementId || !normalized.type) return [];
    return [normalized as StrengthBimElement];
  });

  return sortProjectBimElements(elements) as StrengthBimElement[];
}

export function filterStrengthBimElements(
  elements: StrengthBimElement[],
  filters: StrengthBimFilters
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

export function resolveStrengthBimSelection(
  elementsById: Map<string, StrengthBimElement>,
  elementId: unknown
): StrengthBimSelectionResolution {
  const selectedId = String(elementId || "").trim();
  if (!selectedId) {
    return {
      mode: "manual",
      selectedId: "",
      element: null
    };
  }

  const element = elementsById.get(selectedId) || null;
  return {
    mode: element ? "selected" : "unavailable",
    selectedId,
    element
  };
}

export function buildStrengthBimBindingSnapshot({
  element = null,
  checkData = null,
  constructionType = null
}: {
  element?: Partial<StrengthBimElement> | null;
  checkData?: Partial<StrengthCheckRecord> | null;
  constructionType?: string | null;
} = {}): StrengthBimBindingSnapshot | null {
  const fallbackData = checkData || {};
  const elementId =
    normalizeStrengthBimValue(element?.elementId) ||
    normalizeStrengthBimValue(element?.id) ||
    normalizeStrengthBimValue(fallbackData.bimElementId);
  const rawType =
    normalizeStrengthBimValue(element?.type)?.toLowerCase() ||
    normalizeStrengthBimValue(fallbackData.bimType)?.toLowerCase();
  const typeLabel =
    getConstructionLabel(constructionType) ||
    getConstructionLabel(getTehnadzorTypeByBimType(rawType)) ||
    getConstructionLabel(fallbackData.construction) ||
    getConstructionLabel(fallbackData.constructionType) ||
    normalizeStrengthBimValue(fallbackData.constructionLabel) ||
    normalizeStrengthBimValue(fallbackData.construction);
  const floor =
    normalizeStrengthBimValue(element?.floor) ||
    normalizeStrengthBimValue(fallbackData.bimFloor);
  const mark =
    normalizeStrengthBimValue(element?.mark) ||
    normalizeStrengthBimValue(fallbackData.bimMark);
  const axes =
    normalizeStrengthBimValue(element?.axes) ||
    normalizeStrengthBimValue(fallbackData.bimAxes);
  const sourceModelId =
    normalizeStrengthBimValue(element?.sourceModelId) ||
    normalizeStrengthBimValue(fallbackData.bimSourceModelId);
  const ifcGuid =
    normalizeStrengthBimValue(element?.ifcGuid) ||
    normalizeStrengthBimValue(fallbackData.bimIfcGuid);

  if (
    !elementId &&
    !rawType &&
    !floor &&
    !mark &&
    !axes &&
    !sourceModelId &&
    !ifcGuid
  ) {
    return null;
  }

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

export function restoreStrengthBimSelection(
  elementsById: Map<string, StrengthBimElement>,
  check: Partial<StrengthCheckRecord>,
  constructionType = ""
) {
  const resolution = resolveStrengthBimSelection(
    elementsById,
    check.bimElementId
  );
  return {
    ...resolution,
    snapshot: buildStrengthBimBindingSnapshot({
      element: resolution.element,
      checkData: check,
      constructionType
    })
  };
}

export function hasStrengthBimBindingData(
  data: Partial<StrengthBimFields> = {}
) {
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

export function collectStrengthBimPayload({
  selectedId,
  selectedElement,
  snapshot,
  mark,
  axes
}: {
  selectedId: string;
  selectedElement: StrengthBimElement | null;
  snapshot: StrengthBimBindingSnapshot | null;
  mark: unknown;
  axes: unknown;
}): StrengthBimFields {
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
    bimMark: normalizeStrengthBimValue(mark),
    bimAxes: normalizeStrengthBimValue(axes)
  };
}

export function clearStrengthBimManualFields({
  keepManualFields,
  mark,
  axes
}: {
  keepManualFields: boolean;
  mark: string;
  axes: string;
}) {
  return keepManualFields ? { mark, axes } : { mark: "", axes: "" };
}
