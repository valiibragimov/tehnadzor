import type { BimElement, BimElementType, GeoPrefill } from "../../types/domain.js";

const BIM_DISPLAY_LABELS = Object.freeze({
  slab: "Плита",
  column: "Колонна",
  wall: "Стена",
  beam: "Балка",
  stair: "Лестница",
  roof: "Кровля",
  window: "Окно",
  door: "Дверь",
  opening: "Проём",
  railing: "Ограждение",
  other: "Прочее"
});

export const BIM_TO_TEHNADZOR_TYPE = Object.freeze({
  slab: "floor_slab",
  column: "column",
  wall: "wall",
  beam: "beam",
  stair: "stair_core",
  roof: "floor_slab"
});

const BIM_TYPE_SORT_ORDER = Object.freeze({
  column: 0,
  wall: 1,
  beam: 2,
  slab: 3,
  roof: 4,
  stair: 5,
  railing: 6,
  door: 7,
  window: 8,
  opening: 9,
  other: 10
});

function normalizeTextValue(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function decodeIfcUnicodeCodeUnits(hexBody, unitSize) {
  const normalizedHex = String(hexBody || "").trim();
  if (!normalizedHex || normalizedHex.length % unitSize !== 0) {
    return null;
  }

  const chars = [];
  for (let index = 0; index < normalizedHex.length; index += unitSize) {
    const codeUnit = normalizedHex.slice(index, index + unitSize);
    if (!/^[0-9A-F]+$/iu.test(codeUnit)) {
      return null;
    }

    const codePoint = Number.parseInt(codeUnit, 16);
    if (!Number.isFinite(codePoint)) {
      return null;
    }

    if (unitSize === 4) {
      chars.push(String.fromCharCode(codePoint));
    } else {
      chars.push(String.fromCodePoint(codePoint));
    }
  }

  return chars.join("");
}

function decodeIfcUnicodeEscapes(value) {
  if (value == null) return null;

  return String(value).replace(/\\(X2|X4)\\([0-9A-F]+)\\X0\\/giu, (match, kind, hexBody) => {
    const decoded = decodeIfcUnicodeCodeUnits(hexBody, kind === "X4" ? 8 : 4);
    return decoded == null ? match : decoded;
  });
}

function normalizeIfcTextValue(value) {
  if (value == null) return null;
  const normalized = decodeIfcUnicodeEscapes(String(value))
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function getDisplayTypeLabel(type) {
  return BIM_DISPLAY_LABELS[String(type || "").trim().toLowerCase()] || null;
}

function normalizeBimType(value: unknown): BimElementType | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized in BIM_DISPLAY_LABELS
    ? (normalized as BimElementType)
    : normalized === "other"
      ? "other"
      : null;
}

function getElementAxesValue(element: Partial<BimElement> = {}) {
  return normalizeIfcTextValue(element.resolvedAxes || element.axes);
}

function extractCompactCode(value) {
  const normalized = normalizeIfcTextValue(value);
  if (!normalized) return null;

  const codeLikeMatch = normalized.match(/\b([A-ZА-Я]{0,4}\d{4,}[A-ZА-Я0-9._/-]*)\b/u);
  if (codeLikeMatch) {
    return codeLikeMatch[1];
  }

  const digitsMatch = normalized.match(/\b(\d{4,})\b/u);
  if (digitsMatch) {
    return digitsMatch[1];
  }

  return null;
}

function extractCompactIdentifier(value) {
  const normalized = normalizeIfcTextValue(value);
  if (!normalized) return null;

  if (
    normalized.length <= 36 &&
    normalized.split(/\s+/u).length <= 3 &&
    /^[A-ZА-Я0-9][A-ZА-Я0-9 ._/-]{0,35}$/iu.test(normalized)
  ) {
    return normalized;
  }

  return extractCompactCode(normalized);
}

function isIdentifierRedundantForType(identifier, typeLabel) {
  if (!identifier || !typeLabel) return false;

  const normalizedIdentifier = String(identifier).trim().toLowerCase();
  const normalizedTypeLabel = String(typeLabel).trim().toLowerCase();
  return (
    normalizedIdentifier === normalizedTypeLabel ||
    normalizedIdentifier.startsWith(`${normalizedTypeLabel} `)
  );
}

function pickBestBimIdentifier(element: Partial<BimElement> = {}) {
  const typeLabel = getDisplayTypeLabel(element.type);
  const primaryCandidates = [element.mark, element.rawMark];
  const secondaryCandidates = [element.name, element.objectType];

  for (const candidate of primaryCandidates) {
    const identifier = extractCompactIdentifier(candidate);
    if (!identifier) continue;

    if (!isIdentifierRedundantForType(identifier, typeLabel)) {
      return identifier;
    }

    const compactCode = extractCompactCode(candidate);
    if (compactCode && !isIdentifierRedundantForType(compactCode, typeLabel)) {
      return compactCode;
    }
  }

  for (const candidate of secondaryCandidates) {
    const compactCode = extractCompactCode(candidate);
    if (compactCode && !isIdentifierRedundantForType(compactCode, typeLabel)) {
      return compactCode;
    }
  }

  return null;
}

function toFiniteNumber(value) {
  if (value == null) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function compareLocale(left, right) {
  return String(left || "").localeCompare(String(right || ""), "ru", {
    numeric: true,
    sensitivity: "base"
  });
}

export function getTehnadzorTypeByBimType(type) {
  return BIM_TO_TEHNADZOR_TYPE[String(type || "").trim().toLowerCase()] || null;
}

export function getBimTypeLabel(type) {
  return getDisplayTypeLabel(type) || "Элемент";
}

export function buildGeoPrefillFromBimElement(element: Partial<BimElement> = {}): GeoPrefill {
  return {
    projX: toFiniteNumber(element.projectX),
    projY: toFiniteNumber(element.projectY),
    projH: toFiniteNumber(element.projectH),
    length: toFiniteNumber(element.length),
    width: toFiniteNumber(element.width),
    height: toFiniteNumber(element.height),
    thickness: toFiniteNumber(element.thickness),
    sectionWidth: toFiniteNumber(element.sectionWidth),
    sectionHeight: toFiniteNumber(element.sectionHeight),
    directionX: toFiniteNumber(element.directionX),
    directionY: toFiniteNumber(element.directionY),
    lineStartX: toFiniteNumber(element.lineStartX),
    lineStartY: toFiniteNumber(element.lineStartY),
    lineStartH: toFiniteNumber(element.lineStartH),
    lineEndX: toFiniteNumber(element.lineEndX),
    lineEndY: toFiniteNumber(element.lineEndY),
    lineEndH: toFiniteNumber(element.lineEndH)
  };
}

export function normalizeProjectBimElement(
  docId,
  data: Partial<BimElement> & Record<string, unknown> = {}
): BimElement {
  const name = normalizeIfcTextValue(data.name);
  const description = normalizeIfcTextValue(data.description);
  const objectType = normalizeIfcTextValue(data.objectType);
  const rawMark = normalizeIfcTextValue(data.mark);
  const type = normalizeBimType(data.type);

  return {
    id: normalizeTextValue(docId),
    elementId: normalizeTextValue(data.elementId) || normalizeTextValue(docId),
    sourceModelId: normalizeTextValue(data.sourceModelId),
    ifcGuid: normalizeTextValue(data.ifcGuid),
    type,
    name,
    description,
    objectType,
    rawMark,
    floor: normalizeIfcTextValue(data.floor),
    axes: normalizeIfcTextValue(data.axes),
    mark: pickBestBimIdentifier({
      type,
      mark: rawMark,
      name,
      objectType
    }),
    projectX: toFiniteNumber(data.projectX),
    projectY: toFiniteNumber(data.projectY),
    projectH: toFiniteNumber(data.projectH),
    thickness: toFiniteNumber(data.thickness),
    length: toFiniteNumber(data.length),
    width: toFiniteNumber(data.width),
    height: toFiniteNumber(data.height),
    sectionWidth: toFiniteNumber(data.sectionWidth),
    sectionHeight: toFiniteNumber(data.sectionHeight),
    directionX: toFiniteNumber(data.directionX),
    directionY: toFiniteNumber(data.directionY),
    lineStartX: toFiniteNumber(data.lineStartX),
    lineStartY: toFiniteNumber(data.lineStartY),
    lineStartH: toFiniteNumber(data.lineStartH),
    lineEndX: toFiniteNumber(data.lineEndX),
    lineEndY: toFiniteNumber(data.lineEndY),
    lineEndH: toFiniteNumber(data.lineEndH),
    resolvedAxes: normalizeIfcTextValue(data.resolvedAxes)
  };
}

export function formatBimElementLabel(element: Partial<BimElement> = {}) {
  const typeLabel = getDisplayTypeLabel(element.type) || "Элемент IFC";
  const identifier = pickBestBimIdentifier(element);
  return identifier ? `${typeLabel} ${identifier}` : typeLabel;
}

export function buildBimElementOptionLabel(element: Partial<BimElement> = {}) {
  const baseLabel = formatBimElementLabel(element);
  const details = [];
  const axes = getElementAxesValue(element);
  const floor = normalizeIfcTextValue(element.floor);

  if (axes) {
    details.push(`оси ${axes}`);
  }
  if (floor) {
    details.push(`этаж ${floor}`);
  }

  if (details.length > 0) {
    return `${baseLabel} · ${details.join(" · ")}`;
  }

  const typeLabel = getDisplayTypeLabel(element.type);
  if (typeLabel && !pickBestBimIdentifier(element)) {
    return `${typeLabel} без марки`;
  }

  return baseLabel || "Элемент IFC";
}

export function buildBimElementSearchText(element: Partial<BimElement> = {}) {
  return [
    buildBimElementOptionLabel(element),
    formatBimElementLabel(element),
    getBimTypeLabel(element.type),
    normalizeTextValue(element.type),
    normalizeTextValue(element.mark),
    normalizeIfcTextValue(element.rawMark),
    normalizeIfcTextValue(element.name),
    normalizeIfcTextValue(element.description),
    normalizeIfcTextValue(element.objectType),
    normalizeTextValue(getElementAxesValue(element)),
    normalizeTextValue(element.floor),
    normalizeTextValue(element.ifcGuid),
    normalizeTextValue(element.elementId),
    normalizeTextValue(element.id),
    normalizeTextValue(element.sourceModelId)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function buildBimElementFilterOptions(elements: Array<Partial<BimElement>> = []) {
  const typeOptions = [];
  const knownTypes = new Set();
  const axesValues = new Set();

  elements.forEach((element) => {
    const type = normalizeTextValue(element?.type)?.toLowerCase();
    if (type && !knownTypes.has(type)) {
      knownTypes.add(type);
      typeOptions.push({
        value: type,
        label: getBimTypeLabel(type)
      });
    }

    const axes = normalizeTextValue(getElementAxesValue(element));
    if (axes) axesValues.add(axes);
  });

  typeOptions.sort((left, right) => {
    const leftOrder = BIM_TYPE_SORT_ORDER[left.value] ?? 999;
    const rightOrder = BIM_TYPE_SORT_ORDER[right.value] ?? 999;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return compareLocale(left.label, right.label);
  });

  const axesOptions = Array.from(axesValues)
    .sort(compareLocale)
    .map((value) => ({
      value,
      label: value
    }));

  return {
    types: typeOptions,
    axes: axesOptions
  };
}

export function sortProjectBimElements(elements: BimElement[] = []) {
  return [...elements].sort((left, right) => {
    const leftOrder = BIM_TYPE_SORT_ORDER[left?.type] ?? 999;
    const rightOrder = BIM_TYPE_SORT_ORDER[right?.type] ?? 999;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    const leftMark = pickBestBimIdentifier(left) || normalizeIfcTextValue(left?.rawMark) || normalizeIfcTextValue(left?.name) || "";
    const rightMark = pickBestBimIdentifier(right) || normalizeIfcTextValue(right?.rawMark) || normalizeIfcTextValue(right?.name) || "";
    const markCompare = compareLocale(leftMark, rightMark);
    if (markCompare !== 0) return markCompare;

    const leftAxes = String(left?.axes || "").trim();
    const rightAxes = String(right?.axes || "").trim();
    return compareLocale(leftAxes, rightAxes);
  });
}
