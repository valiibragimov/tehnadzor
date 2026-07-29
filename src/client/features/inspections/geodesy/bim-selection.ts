import { getConstructionLabel } from "../../../app/construction.js";
import {
  buildBimElementSearchText,
  formatBimElementLabel,
  getTehnadzorTypeByBimType,
  normalizeProjectBimElement,
  sortProjectBimElements
} from "../../../app/services/bim-elements.js";
import type { BimElement, GeoPrefill } from "../../../types/domain.js";
import type {
  GeodesyBimBindingSnapshot,
  GeodesyBimElement,
  GeodesyBimNodeData,
  GeodesyNodeRecord
} from "./types.js";

interface GeoGridSample {
  floor: string;
  letter: string;
  number: string;
  x: number;
  y: number;
}

interface GeoAxisEntry {
  label: string;
  coord: number;
}

export function normalizeGeoBimSnapshotValue(value: unknown) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function hasGeoBimValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function formatGeoBimDisplayValue(value: unknown) {
  return hasGeoBimValue(value) ? String(value) : "Нет данных";
}

export function formatGeoBimShortGuid(value: unknown) {
  const normalized = normalizeGeoBimSnapshotValue(value);
  if (!normalized) return null;
  return normalized.length > 16
    ? `${normalized.slice(0, 6)}...${normalized.slice(-6)}`
    : normalized;
}

export function getBimAxesValue(element: Partial<GeodesyBimElement> = {}) {
  return String(element?.resolvedAxes || element?.axes || "").trim();
}

export function parseGeoBimFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
}

export function formatGeoBimNumericField(value: unknown) {
  const numeric = parseGeoBimFiniteNumber(value);
  return numeric == null ? "" : String(numeric);
}

export function pushGeoGridSample(
  samples: GeoGridSample[],
  { floor = "", letter = "", number = "", x = null, y = null } = {}
) {
  const normalizedLetter = String(letter || "").trim().toUpperCase();
  const normalizedNumber = String(number || "").trim();
  const normalizedFloor = String(floor || "").trim();
  const projX = parseGeoBimFiniteNumber(x);
  const projY = parseGeoBimFiniteNumber(y);

  if (!normalizedLetter || !normalizedNumber || projX == null || projY == null) {
    return;
  }

  samples.push({
    floor: normalizedFloor,
    letter: normalizedLetter,
    number: normalizedNumber,
    x: projX,
    y: projY
  });
}

export function groupGeoGridSamples(samples: GeoGridSample[], key: "letter" | "number") {
  const grouped = new Map<string, GeoGridSample[]>();
  samples.forEach((sample) => {
    const label = String(sample?.[key] || "").trim();
    if (!label) return;
    if (!grouped.has(label)) {
      grouped.set(label, []);
    }
    grouped.get(label)?.push(sample);
  });
  return grouped;
}

export function calculateGroupedAxisSpread(
  groupedSamples: Map<string, GeoGridSample[]>,
  coordKey: "x" | "y"
) {
  const spreads: number[] = [];

  groupedSamples.forEach((entries) => {
    if (!Array.isArray(entries) || entries.length < 2) return;
    const values = entries
      .map((entry) => parseGeoBimFiniteNumber(entry?.[coordKey]))
      .filter((value): value is number => value != null);
    if (values.length < 2) return;
    spreads.push(Math.max(...values) - Math.min(...values));
  });

  if (spreads.length === 0) return Infinity;
  return spreads.reduce((sum, value) => sum + value, 0) / spreads.length;
}

export function inferAxisCoordinateKey(
  groupedSamples: Map<string, GeoGridSample[]>,
  preferredKey: "x" | "y"
) {
  const xSpread = calculateGroupedAxisSpread(groupedSamples, "x");
  const ySpread = calculateGroupedAxisSpread(groupedSamples, "y");

  if (!Number.isFinite(xSpread) && !Number.isFinite(ySpread)) {
    return preferredKey;
  }
  return xSpread <= ySpread ? "x" : "y";
}

export function buildGeoAxisEntries(
  groupedSamples: Map<string, GeoGridSample[]>,
  coordKey: "x" | "y"
) {
  return Array.from(groupedSamples.entries())
    .map(([label, entries]) => {
      const coords = entries
        .map((entry) => parseGeoBimFiniteNumber(entry?.[coordKey]))
        .filter((value): value is number => value != null);
      if (coords.length === 0) return null;
      const averageCoord = coords.reduce((sum, value) => sum + value, 0) / coords.length;
      return {
        label,
        coord: averageCoord
      };
    })
    .filter((entry): entry is GeoAxisEntry => Boolean(entry))
    .sort((left, right) => left.coord - right.coord);
}

export function findNearestGeoAxisLabel(axisEntries: GeoAxisEntry[], coordinate: unknown) {
  const value = parseGeoBimFiniteNumber(coordinate);
  if (value == null || !Array.isArray(axisEntries) || axisEntries.length === 0) {
    return null;
  }

  let bestEntry: GeoAxisEntry | null = null;
  let bestDistance = Infinity;

  axisEntries.forEach((entry) => {
    const distance = Math.abs(value - entry.coord);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestEntry = entry;
    }
  });

  return bestEntry?.label || null;
}

export function createGeoLinearPrefillPoints(prefill: Partial<GeoPrefill> = {}) {
  const startX = parseGeoBimFiniteNumber(prefill.lineStartX ?? prefill.projX);
  const startY = parseGeoBimFiniteNumber(prefill.lineStartY ?? prefill.projY);
  const endX = parseGeoBimFiniteNumber(prefill.lineEndX);
  const endY = parseGeoBimFiniteNumber(prefill.lineEndY);

  if (startX == null || startY == null) {
    return null;
  }

  return {
    startX,
    startY,
    endX: endX ?? startX,
    endY: endY ?? startY
  };
}

export function formatResolvedLinearAxes(bindingHint) {
  if (!bindingHint) return "";
  if (bindingHint.bindingType === "number_letters") {
    const numberAxis = String(bindingHint.numberAxis || "").trim();
    const letterAxis1 = String(bindingHint.letterAxis1 || "").trim();
    const letterAxis2 = String(bindingHint.letterAxis2 || "").trim();
    if (numberAxis && letterAxis1 && letterAxis2) {
      return `${letterAxis1}-${letterAxis2}, ${numberAxis}`;
    }
    return "";
  }

  const letterAxis = String(bindingHint.letterAxis || "").trim();
  const numberAxis1 = String(bindingHint.numberAxis1 || "").trim();
  const numberAxis2 = String(bindingHint.numberAxis2 || "").trim();
  if (letterAxis && numberAxis1 && numberAxis2) {
    return `${letterAxis}, ${numberAxis1}-${numberAxis2}`;
  }
  return "";
}

export interface GeodesyBimFilters {
  search: string;
  type: string;
  axes: string;
}

export interface GeodesyBimSelectionResolution {
  mode: "manual" | "selected" | "unavailable";
  selectedId: string;
  element: GeodesyBimElement | null;
}

export function normalizeGeodesyBimFilterValue(
  value: unknown,
  fallback = "all"
) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function normalizeGeodesyBimRecords(
  records: Array<{ id: string; data: GeodesyNodeRecord }>
) {
  const elements = records.flatMap(({ id, data }) => {
    if (data.deleted === true) return [];
    const normalized = normalizeProjectBimElement(
      id,
      data as Partial<BimElement> & Record<string, unknown>
    );
    if (!normalized.elementId || !normalized.type) return [];
    return [{ ...normalized } as GeodesyBimElement];
  });

  return sortProjectBimElements(elements) as GeodesyBimElement[];
}

export function filterGeodesyBimElements(
  elements: GeodesyBimElement[],
  filters: GeodesyBimFilters
) {
  const searchQuery = String(filters.search || "").trim().toLowerCase();

  return elements.filter((element) => {
    if (filters.type !== "all" && element.type !== filters.type) {
      return false;
    }

    if (filters.axes !== "all" && getBimAxesValue(element) !== filters.axes) {
      return false;
    }

    return (
      !searchQuery ||
      buildBimElementSearchText(element).includes(searchQuery)
    );
  });
}

export function resolveGeodesyBimSelection(
  elementsById: Map<string, GeodesyBimElement>,
  elementId: unknown
): GeodesyBimSelectionResolution {
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

export function buildGeodesyBimBindingSnapshot({
  element = null,
  nodeData = null,
  constructionType = null
}: {
  element?: Partial<GeodesyBimElement> | null;
  nodeData?: GeodesyBimNodeData | null;
  constructionType?: string | null;
} = {}): GeodesyBimBindingSnapshot | null {
  const fallbackData = nodeData || {};
  const elementId =
    normalizeGeoBimSnapshotValue(element?.elementId) ||
    normalizeGeoBimSnapshotValue(element?.id) ||
    normalizeGeoBimSnapshotValue(fallbackData.bimElementId) ||
    "";
  const rawType =
    normalizeGeoBimSnapshotValue(element?.type)?.toLowerCase() ||
    normalizeGeoBimSnapshotValue(fallbackData.bimType)?.toLowerCase() ||
    "";
  const typeLabel =
    getConstructionLabel(constructionType) ||
    getConstructionLabel(getTehnadzorTypeByBimType(rawType)) ||
    getConstructionLabel(fallbackData.construction) ||
    getConstructionLabel(fallbackData.constructionType) ||
    normalizeGeoBimSnapshotValue(fallbackData.constructionLabel) ||
    normalizeGeoBimSnapshotValue(fallbackData.constructionType) ||
    "";
  const mark =
    normalizeGeoBimSnapshotValue(element?.mark) ||
    normalizeGeoBimSnapshotValue(fallbackData.bimMark) ||
    "";
  const axes =
    normalizeGeoBimSnapshotValue(element?.resolvedAxes || element?.axes) ||
    normalizeGeoBimSnapshotValue(fallbackData.bimAxes) ||
    "";
  const sourceModelId =
    normalizeGeoBimSnapshotValue(element?.sourceModelId) ||
    normalizeGeoBimSnapshotValue(fallbackData.bimSourceModelId) ||
    "";
  const ifcGuid =
    normalizeGeoBimSnapshotValue(element?.ifcGuid) ||
    normalizeGeoBimSnapshotValue(fallbackData.bimIfcGuid) ||
    "";
  const projectX = element?.projectX ?? fallbackData.bimProjectX ?? null;
  const projectY = element?.projectY ?? fallbackData.bimProjectY ?? null;
  const projectH = element?.projectH ?? fallbackData.bimProjectH ?? null;

  if (
    !elementId &&
    !rawType &&
    !mark &&
    !axes &&
    !sourceModelId &&
    !ifcGuid &&
    !hasGeoBimValue(projectX) &&
    !hasGeoBimValue(projectY) &&
    !hasGeoBimValue(projectH)
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
    title,
    elementId,
    sourceModelId,
    ifcGuid,
    rawType,
    typeLabel,
    projectX,
    projectY,
    projectH,
    mark,
    axes
  };
}

export function restoreGeodesyBimSelection(
  elementsById: Map<string, GeodesyBimElement>,
  node: GeodesyNodeRecord,
  constructionType = ""
) {
  const resolution = resolveGeodesyBimSelection(
    elementsById,
    node.bimElementId
  );
  return {
    ...resolution,
    snapshot: buildGeodesyBimBindingSnapshot({
      element: resolution.element,
      nodeData: node,
      constructionType
    })
  };
}

export function collectGeodesyBimNodeData({
  selectedId,
  selectedElement,
  mark,
  axes
}: {
  selectedId: string;
  selectedElement: GeodesyBimElement | null;
  mark: string;
  axes: string;
}): GeodesyBimNodeData {
  return {
    bimElementId: selectedId || null,
    bimSourceModelId: selectedElement?.sourceModelId || null,
    bimIfcGuid: selectedElement?.ifcGuid || null,
    bimType: selectedElement?.type || null,
    bimMark: String(mark || "").trim() || null,
    bimAxes: String(axes || "").trim() || null,
    bimProjectX: selectedElement?.projectX ?? null,
    bimProjectY: selectedElement?.projectY ?? null,
    bimProjectH: selectedElement?.projectH ?? null,
    bimLineStartX: selectedElement?.lineStartX ?? null,
    bimLineStartY: selectedElement?.lineStartY ?? null,
    bimLineEndX: selectedElement?.lineEndX ?? null,
    bimLineEndY: selectedElement?.lineEndY ?? null
  };
}
