"use strict";

const SUPPORTED_IFC_TYPES = Object.freeze({
  IFCSLAB: "slab",
  IFCCOLUMN: "column",
  IFCWALL: "wall",
  IFCWALLSTANDARDCASE: "wall",
  IFCBEAM: "beam",
  IFCSTAIR: "stair",
  IFCSTAIRFLIGHT: "stair"
});

const BIM_TO_TEHNADZOR_TYPE = Object.freeze({
  slab: "Плита",
  column: "Колонна",
  wall: "Стена",
  beam: "Балка",
  stair: "Лестница"
});

function normalizeIfcText(source) {
  return removeBlockComments(String(source || ""))
    .replace(/\uFEFF/g, "")
    .replace(/\r/g, "");
}

function removeBlockComments(source) {
  let output = "";
  let inBlockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        output += " ";
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function collectEntityStatements(ifcText) {
  const lines = normalizeIfcText(ifcText).split("\n");
  const statements = [];
  let buffer = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;

    buffer += (buffer ? " " : "") + line;
    if (!line.endsWith(";")) continue;

    statements.push(buffer);
    buffer = "";
  }

  return statements;
}

function splitTopLevelArgs(input) {
  const args = [];
  let current = "";
  let depth = 0;
  let inString = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "'") {
      current += char;
      if (inString && next === "'") {
        current += next;
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "(") {
        depth += 1;
        current += char;
        continue;
      }
      if (char === ")") {
        depth = Math.max(0, depth - 1);
        current += char;
        continue;
      }
      if (char === "," && depth === 0) {
        args.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim() || input.endsWith(",")) {
    args.push(current.trim());
  }

  return args;
}

function parseEntities(ifcText) {
  const entities = new Map();
  const statements = collectEntityStatements(ifcText);

  for (const statement of statements) {
    const match = statement.match(/^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*)\)\s*;$/i);
    if (!match) continue;

    const id = Number(match[1]);
    const entityType = String(match[2] || "").toUpperCase();
    const argsText = match[3] || "";
    entities.set(id, {
      id,
      type: entityType,
      args: splitTopLevelArgs(argsText),
      raw: statement
    });
  }

  return entities;
}

function unquoteIfcString(token) {
  if (!token || token === "$" || token === "*") return null;
  if (!/^'.*'$/.test(token)) return null;
  return decodeIfcUnicodeEscapes(token.slice(1, -1).replace(/''/g, "'"));
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

function parseRef(token) {
  const match = String(token || "").trim().match(/^#(\d+)$/);
  return match ? Number(match[1]) : null;
}

function parseNumber(token) {
  if (token == null) return null;
  const normalized = String(token).trim();
  if (!normalized || normalized === "$" || normalized === "*") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseTuple(token) {
  const normalized = String(token || "").trim();
  if (!normalized.startsWith("(") || !normalized.endsWith(")")) return [];
  return splitTopLevelArgs(normalized.slice(1, -1));
}

function parseRefList(token) {
  return parseTuple(token)
    .map((item) => parseRef(item))
    .filter((value) => Number.isFinite(value));
}

function decodeIfcValue(token) {
  const normalized = String(token || "").trim();
  if (!normalized || normalized === "$" || normalized === "*") return null;

  const unquoted = unquoteIfcString(normalized);
  if (unquoted != null) return unquoted;

  if (/^#\d+$/.test(normalized)) return normalized;

  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return numeric;

  const typedValueMatch = normalized.match(/^[A-Z0-9_]+\(([\s\S]*)\)$/i);
  if (typedValueMatch) {
    const inner = typedValueMatch[1].trim();
    if (!inner) return null;
    if (inner.startsWith("(") && inner.endsWith(")")) {
      return parseTuple(inner).map((item) => decodeIfcValue(item));
    }
    return decodeIfcValue(inner);
  }

  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    return parseTuple(normalized).map((item) => decodeIfcValue(item));
  }

  return normalized;
}

function normalizePropertyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function sanitizeSourceModelId(value) {
  const input = String(value || "").trim().toLowerCase();
  if (!input) return "";
  const slug = input
    .replace(/\.ifc$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "";
}

function makeHash(input) {
  let hash = 2166136261;
  const source = String(input || "");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildStableElementId(sourceModelId, entityId) {
  return `${sourceModelId}_${entityId}`;
}

function normalizeVector(vector, fallback) {
  const source = Array.isArray(vector) ? vector : fallback;
  const x = Number(source?.[0] ?? 0);
  const y = Number(source?.[1] ?? 0);
  const z = Number(source?.[2] ?? 0);
  const length = Math.hypot(x, y, z);
  if (!length) {
    const safeFallback = Array.isArray(fallback) ? fallback : [1, 0, 0];
    return [...safeFallback];
  }
  return [x / length, y / length, z / length];
}

function dot(a, b) {
  return (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]);
}

function cross(a, b) {
  return [
    (a[1] * b[2]) - (a[2] * b[1]),
    (a[2] * b[0]) - (a[0] * b[2]),
    (a[0] * b[1]) - (a[1] * b[0])
  ];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector, factor) {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function multiplyBasisAndVector(basis, vector) {
  const xAxis = basis[0];
  const yAxis = basis[1];
  const zAxis = basis[2];
  return [
    (xAxis[0] * vector[0]) + (yAxis[0] * vector[1]) + (zAxis[0] * vector[2]),
    (xAxis[1] * vector[0]) + (yAxis[1] * vector[1]) + (zAxis[1] * vector[2]),
    (xAxis[2] * vector[0]) + (yAxis[2] * vector[1]) + (zAxis[2] * vector[2])
  ];
}

function multiplyBasis(parentBasis, localBasis) {
  return [
    multiplyBasisAndVector(parentBasis, localBasis[0]),
    multiplyBasisAndVector(parentBasis, localBasis[1]),
    multiplyBasisAndVector(parentBasis, localBasis[2])
  ];
}

function identityTransform() {
  return {
    origin: [0, 0, 0],
    basis: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]
  };
}

function roundCoordinate(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1000) / 1000;
}

function createBounds() {
  return {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
}

function includePointInBounds(bounds, point) {
  if (!bounds || !Array.isArray(point)) return;

  const x = Number(point[0]);
  const y = Number(point[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function mergeBounds(target, source) {
  if (!target || !source) return;
  includePointInBounds(target, [source.minX, source.minY]);
  includePointInBounds(target, [source.maxX, source.maxY]);
}

function finalizeBounds(bounds) {
  if (!bounds) return null;

  const values = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
  if (!values.every((value) => Number.isFinite(value))) {
    return null;
  }

  return bounds;
}

function normalizeAngleDegrees(value) {
  if (!Number.isFinite(value)) return null;
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function isAngleOnSweep(angle, startAngle, endAngle, isCounterClockwise) {
  const normalizedAngle = normalizeAngleDegrees(angle);
  const normalizedStart = normalizeAngleDegrees(startAngle);
  const normalizedEnd = normalizeAngleDegrees(endAngle);

  if (
    normalizedAngle == null ||
    normalizedStart == null ||
    normalizedEnd == null
  ) {
    return false;
  }

  if (normalizedStart === normalizedEnd) {
    return true;
  }

  const forwardSpan = (normalizedEnd - normalizedStart + 360) % 360;
  const candidateForward = (normalizedAngle - normalizedStart + 360) % 360;

  if (isCounterClockwise) {
    return candidateForward <= forwardSpan;
  }

  const backwardSpan = (normalizedStart - normalizedEnd + 360) % 360;
  const candidateBackward = (normalizedStart - normalizedAngle + 360) % 360;
  return candidateBackward <= backwardSpan;
}

function sortAscendingPair(first, second) {
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return [null, null];
  }
  return first <= second ? [first, second] : [second, first];
}

function sortDescendingPair(first, second) {
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return [null, null];
  }
  return first >= second ? [first, second] : [second, first];
}

function createEmptyGeometryFields() {
  return {
    thickness: null,
    length: null,
    width: null,
    height: null,
    sectionWidth: null,
    sectionHeight: null
  };
}

function mapGeometryFields(normalizedType, geometryMetrics) {
  const fields = createEmptyGeometryFields();
  if (!geometryMetrics) {
    return fields;
  }

  const depth = roundCoordinate(geometryMetrics.depth);
  const spanX = roundCoordinate(geometryMetrics.spanX);
  const spanY = roundCoordinate(geometryMetrics.spanY);
  const [smallerSpan, largerSpan] = sortAscendingPair(spanX, spanY);
  const [longerSpan, shorterSpan] = sortDescendingPair(spanX, spanY);

  if (normalizedType === "slab") {
    fields.thickness = depth;
    fields.length = longerSpan;
    fields.width = shorterSpan;
    return fields;
  }

  if (normalizedType === "beam") {
    fields.length = depth;
    fields.width = smallerSpan;
    fields.height = largerSpan;
    return fields;
  }

  if (normalizedType === "column") {
    fields.sectionWidth = smallerSpan;
    fields.sectionHeight = largerSpan;
    return fields;
  }

  return fields;
}

function createIfcModelIndex(entities) {
  const cartesianPoints = new Map();
  const directions = new Map();
  const axisPlacements = new Map();
  const localPlacements = new Map();
  const productDefinitionShapes = new Map();
  const shapeRepresentations = new Map();
  const representationMaps = new Map();
  const storeys = new Map();
  const storeyByPlacementRef = new Map();
  const directStoreyByElement = new Map();
  const referencedSpatialByElement = new Map();
  const parentByChild = new Map();
  const polyLines = new Map();
  const compositeCurveSegments = new Map();
  const compositeCurves = new Map();
  const trimmedCurves = new Map();
  const circles = new Map();
  const propertySets = new Map();
  const propertyValues = new Map();
  const propertyRefsByElement = new Map();

  for (const entity of entities.values()) {
    if (entity.type === "IFCCARTESIANPOINT") {
      const values = parseTuple(entity.args[0]).map((token) => parseNumber(token) ?? 0);
      cartesianPoints.set(entity.id, [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]);
      continue;
    }

    if (entity.type === "IFCDIRECTION") {
      const values = parseTuple(entity.args[0]).map((token) => parseNumber(token) ?? 0);
      directions.set(entity.id, [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]);
      continue;
    }

    if (entity.type === "IFCAXIS2PLACEMENT3D" || entity.type === "IFCAXIS2PLACEMENT2D") {
      axisPlacements.set(entity.id, entity);
      continue;
    }

    if (entity.type === "IFCLOCALPLACEMENT") {
      localPlacements.set(entity.id, {
        relTo: parseRef(entity.args[0]),
        relativePlacement: parseRef(entity.args[1])
      });
      continue;
    }

    if (entity.type === "IFCPRODUCTDEFINITIONSHAPE") {
      productDefinitionShapes.set(entity.id, parseRefList(entity.args[2]));
      continue;
    }

    if (entity.type === "IFCSHAPEREPRESENTATION" || entity.type === "IFCREPRESENTATION") {
      shapeRepresentations.set(entity.id, {
        identifier: unquoteIfcString(entity.args[1]) || null,
        representationType: unquoteIfcString(entity.args[2]) || null,
        itemRefs: parseRefList(entity.args[3])
      });
      continue;
    }

    if (entity.type === "IFCREPRESENTATIONMAP") {
      representationMaps.set(entity.id, {
        mappedRepresentationRef: parseRef(entity.args[1])
      });
      continue;
    }

    if (entity.type === "IFCBUILDINGSTOREY") {
      const placementRef = parseRef(entity.args[5]);
      storeys.set(entity.id, {
        id: entity.id,
        name: unquoteIfcString(entity.args[2]) || null,
        longName: unquoteIfcString(entity.args[7]) || null,
        elevation: parseNumber(entity.args[entity.args.length - 1]),
        placementRef
      });
      if (placementRef) {
        storeyByPlacementRef.set(placementRef, entity.id);
      }
      continue;
    }

    if (entity.type === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
      const relatedElements = parseRefList(entity.args[4]);
      const storeyRef = parseRef(entity.args[5]);
      for (const relatedRef of relatedElements) {
        directStoreyByElement.set(relatedRef, storeyRef);
      }
      continue;
    }

    if (entity.type === "IFCRELREFERENCEDINSPATIALSTRUCTURE") {
      const relatedElements = parseRefList(entity.args[4]);
      const structureRef = parseRef(entity.args[5]);
      for (const relatedRef of relatedElements) {
        if (!referencedSpatialByElement.has(relatedRef)) {
          referencedSpatialByElement.set(relatedRef, []);
        }
        if (structureRef) {
          referencedSpatialByElement.get(relatedRef).push(structureRef);
        }
      }
      continue;
    }

    if (entity.type === "IFCRELAGGREGATES") {
      const parentRef = parseRef(entity.args[4]);
      const childRefs = parseRefList(entity.args[5]);
      for (const childRef of childRefs) {
        parentByChild.set(childRef, parentRef);
      }
      continue;
    }

    if (entity.type === "IFCPOLYLINE") {
      polyLines.set(entity.id, parseRefList(entity.args[0]));
      continue;
    }

    if (entity.type === "IFCCOMPOSITECURVESEGMENT") {
      compositeCurveSegments.set(entity.id, parseRef(entity.args[2]));
      continue;
    }

    if (entity.type === "IFCCOMPOSITECURVE") {
      compositeCurves.set(entity.id, parseRefList(entity.args[0]));
      continue;
    }

    if (entity.type === "IFCTRIMMEDCURVE") {
      trimmedCurves.set(entity.id, {
        basisCurveRef: parseRef(entity.args[0]),
        trim1: parseTuple(entity.args[1]),
        trim2: parseTuple(entity.args[2]),
        sameSense: String(entity.args[3] || "").trim().toUpperCase() === ".T."
      });
      continue;
    }

    if (entity.type === "IFCCIRCLE") {
      circles.set(entity.id, {
        positionRef: parseRef(entity.args[0]),
        radius: parseNumber(entity.args[1])
      });
      continue;
    }

    if (entity.type === "IFCPROPERTYSET") {
      propertySets.set(entity.id, parseRefList(entity.args[4]));
      continue;
    }

    if (entity.type === "IFCPROPERTYSINGLEVALUE") {
      const name = unquoteIfcString(entity.args[0]) || "";
      const normalizedName = normalizePropertyName(name);
      if (normalizedName) {
        propertyValues.set(entity.id, {
          name,
          normalizedName,
          value: decodeIfcValue(entity.args[2])
        });
      }
      continue;
    }

    if (entity.type === "IFCRELDEFINESBYPROPERTIES") {
      const objectRefs = parseRefList(entity.args[4]);
      const propertySetRef = parseRef(entity.args[5]);
      if (!propertySetRef) continue;

      for (const objectRef of objectRefs) {
        const refs = propertyRefsByElement.get(objectRef) || [];
        refs.push(propertySetRef);
        propertyRefsByElement.set(objectRef, refs);
      }
    }
  }

  const axisPlacementTransformCache = new Map();
  const localPlacementTransformCache = new Map();
  const floorCache = new Map();
  const propertyCache = new Map();
  const placementStoreyCache = new Map();
  const curveBoundsCache = new Map();
  const profileMetricsCache = new Map();
  const extrudedSolidMetricsCache = new Map();
  const geometryMetricsCache = new Map();

  function resolveAxisPlacementTransform(axisPlacementRef) {
    if (!axisPlacementRef || !axisPlacements.has(axisPlacementRef)) {
      return identityTransform();
    }
    if (axisPlacementTransformCache.has(axisPlacementRef)) {
      return axisPlacementTransformCache.get(axisPlacementRef);
    }

    const entity = axisPlacements.get(axisPlacementRef);
    const point = cartesianPoints.get(parseRef(entity.args[0])) || [0, 0, 0];
    let transform = identityTransform();

    if (entity.type === "IFCAXIS2PLACEMENT2D") {
      const xDirection = directions.get(parseRef(entity.args[1])) || [1, 0, 0];
      const xAxis = normalizeVector([xDirection[0], xDirection[1], 0], [1, 0, 0]);
      const yAxis = normalizeVector([-xAxis[1], xAxis[0], 0], [0, 1, 0]);
      transform = {
        origin: [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0],
        basis: [
          xAxis,
          yAxis,
          [0, 0, 1]
        ]
      };
    } else {
      const zDirection = directions.get(parseRef(entity.args[1])) || [0, 0, 1];
      let zAxis = normalizeVector(zDirection, [0, 0, 1]);

      const refDirection = directions.get(parseRef(entity.args[2])) || [1, 0, 0];
      let xAxis = subtract(refDirection, scale(zAxis, dot(refDirection, zAxis)));
      xAxis = normalizeVector(xAxis, [1, 0, 0]);

      if (Math.abs(dot(xAxis, zAxis)) > 0.999) {
        zAxis = [0, 0, 1];
        xAxis = [1, 0, 0];
      }

      const yAxis = normalizeVector(cross(zAxis, xAxis), [0, 1, 0]);
      transform = {
        origin: [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0],
        basis: [
          xAxis,
          yAxis,
          zAxis
        ]
      };
    }

    axisPlacementTransformCache.set(axisPlacementRef, transform);
    return transform;
  }

  function resolveLocalPlacementTransform(localPlacementRef, stack = new Set()) {
    if (!localPlacementRef || !localPlacements.has(localPlacementRef)) {
      return identityTransform();
    }
    if (localPlacementTransformCache.has(localPlacementRef)) {
      return localPlacementTransformCache.get(localPlacementRef);
    }
    if (stack.has(localPlacementRef)) {
      return identityTransform();
    }

    stack.add(localPlacementRef);
    const placement = localPlacements.get(localPlacementRef);
    const parentTransform = resolveLocalPlacementTransform(placement.relTo, stack);
    const localTransform = resolveAxisPlacementTransform(placement.relativePlacement);
    stack.delete(localPlacementRef);

    const combined = {
      origin: add(
        parentTransform.origin,
        multiplyBasisAndVector(parentTransform.basis, localTransform.origin)
      ),
      basis: multiplyBasis(parentTransform.basis, localTransform.basis)
    };

    localPlacementTransformCache.set(localPlacementRef, combined);
    return combined;
  }

  function resolveStoreyFromSpatialRef(spatialRef) {
    let currentRef = spatialRef;
    const visited = new Set();

    while (currentRef && !visited.has(currentRef)) {
      visited.add(currentRef);
      if (storeys.has(currentRef)) {
        return storeys.get(currentRef);
      }
      currentRef = parentByChild.get(currentRef) || null;
    }

    return null;
  }

  function resolveStoreyFromPlacement(localPlacementRef) {
    if (!localPlacementRef) return null;
    if (placementStoreyCache.has(localPlacementRef)) {
      return placementStoreyCache.get(localPlacementRef);
    }

    let currentPlacementRef = localPlacementRef;
    const visited = new Set();

    while (currentPlacementRef && !visited.has(currentPlacementRef)) {
      visited.add(currentPlacementRef);

      const directStoreyRef = storeyByPlacementRef.get(currentPlacementRef);
      if (directStoreyRef && storeys.has(directStoreyRef)) {
        const floorInfo = storeys.get(directStoreyRef);
        placementStoreyCache.set(localPlacementRef, floorInfo);
        return floorInfo;
      }

      const placement = localPlacements.get(currentPlacementRef);
      currentPlacementRef = placement?.relTo || null;
    }

    placementStoreyCache.set(localPlacementRef, null);
    return null;
  }

  function resolveFloorInfo(elementId) {
    if (floorCache.has(elementId)) {
      return floorCache.get(elementId);
    }

    let currentId = elementId;
    const visited = new Set();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);

      const directFloorInfo = resolveStoreyFromSpatialRef(directStoreyByElement.get(currentId));
      if (directFloorInfo) {
        floorCache.set(elementId, directFloorInfo);
        return directFloorInfo;
      }

      const referencedSpatialRefs = referencedSpatialByElement.get(currentId) || [];
      for (const spatialRef of referencedSpatialRefs) {
        const referencedFloorInfo = resolveStoreyFromSpatialRef(spatialRef);
        if (referencedFloorInfo) {
          floorCache.set(elementId, referencedFloorInfo);
          return referencedFloorInfo;
        }
      }

      currentId = parentByChild.get(currentId) || null;
      if (currentId && storeys.has(currentId)) {
        const floorInfo = storeys.get(currentId);
        floorCache.set(elementId, floorInfo);
        return floorInfo;
      }
    }

    const placementRef = parseRef(entities.get(elementId)?.args?.[5]);
    const placementFloorInfo = resolveStoreyFromPlacement(placementRef);
    if (placementFloorInfo) {
      floorCache.set(elementId, placementFloorInfo);
      return placementFloorInfo;
    }

    floorCache.set(elementId, null);
    return null;
  }

  function resolvePropertyBag(elementId) {
    if (propertyCache.has(elementId)) {
      return propertyCache.get(elementId);
    }

    const refs = propertyRefsByElement.get(elementId) || [];
    const bag = Object.create(null);

    for (const ref of refs) {
      const propertyRefs = propertySets.get(ref) || [];
      for (const propertyRef of propertyRefs) {
        const property = propertyValues.get(propertyRef);
        if (!property || !property.normalizedName) continue;
        if (bag[property.normalizedName] == null) {
          bag[property.normalizedName] = property.value;
        }
      }
    }

    propertyCache.set(elementId, bag);
    return bag;
  }

  function resolveTransformationScale(operatorRef) {
    if (!operatorRef) return 1;

    const entity = entities.get(operatorRef);
    if (!entity) return null;

    if (
      entity.type === "IFCCARTESIANTRANSFORMATIONOPERATOR2D" ||
      entity.type === "IFCCARTESIANTRANSFORMATIONOPERATOR3D"
    ) {
      return parseNumber(entity.args[3]) ?? 1;
    }

    return null;
  }

  function resolveCurvePoint(pointRef) {
    const point = cartesianPoints.get(pointRef);
    if (!point) return null;
    return [Number(point[0] ?? 0), Number(point[1] ?? 0)];
  }

  function resolveCircleAngleFromTrim(trimTokens, circle) {
    if (!Array.isArray(trimTokens) || !trimTokens.length || !circle) return null;

    for (const token of trimTokens) {
      const parameterMatch = String(token || "")
        .trim()
        .match(/^IFCPARAMETERVALUE\(([\s\S]+)\)$/i);
      if (parameterMatch) {
        const angle = parseNumber(parameterMatch[1]);
        if (Number.isFinite(angle)) {
          return normalizeAngleDegrees(angle);
        }
      }

      const pointRef = parseRef(token);
      const point = resolveCurvePoint(pointRef);
      if (!point) continue;

      const transform = resolveAxisPlacementTransform(circle.positionRef);
      const delta = [point[0] - transform.origin[0], point[1] - transform.origin[1], 0];
      const xAxis = transform.basis[0];
      const yAxis = transform.basis[1];
      const localX = dot(delta, xAxis);
      const localY = dot(delta, yAxis);
      return normalizeAngleDegrees((Math.atan2(localY, localX) * 180) / Math.PI);
    }

    return null;
  }

  function buildCircleBounds(circle, startAngle, endAngle, sameSense) {
    if (!circle || !Number.isFinite(circle.radius) || circle.radius <= 0) {
      return null;
    }

    const transform = resolveAxisPlacementTransform(circle.positionRef);
    const xAxis = transform.basis[0];
    const yAxis = transform.basis[1];
    const bounds = createBounds();

    function includeAngle(angle) {
      const radians = (angle * Math.PI) / 180;
      const point = add(
        transform.origin,
        add(
          scale(xAxis, circle.radius * Math.cos(radians)),
          scale(yAxis, circle.radius * Math.sin(radians))
        )
      );
      includePointInBounds(bounds, point);
    }

    if (startAngle == null || endAngle == null) {
      for (const angle of [0, 90, 180, 270]) {
        includeAngle(angle);
      }
      return finalizeBounds(bounds);
    }

    includeAngle(startAngle);
    includeAngle(endAngle);

    for (const angle of [0, 90, 180, 270]) {
      if (isAngleOnSweep(angle, startAngle, endAngle, sameSense)) {
        includeAngle(angle);
      }
    }

    return finalizeBounds(bounds);
  }

  function resolveCurveBounds(curveRef, stack = new Set()) {
    if (!curveRef) return null;
    if (curveBoundsCache.has(curveRef)) {
      return curveBoundsCache.get(curveRef);
    }
    if (stack.has(curveRef)) {
      return null;
    }

    stack.add(curveRef);
    let bounds = null;
    const entity = entities.get(curveRef);

    if (entity?.type === "IFCPOLYLINE") {
      const nextBounds = createBounds();
      for (const pointRef of polyLines.get(curveRef) || []) {
        includePointInBounds(nextBounds, resolveCurvePoint(pointRef));
      }
      bounds = finalizeBounds(nextBounds);
    } else if (entity?.type === "IFCCOMPOSITECURVESEGMENT") {
      bounds = resolveCurveBounds(compositeCurveSegments.get(curveRef), stack);
    } else if (entity?.type === "IFCCOMPOSITECURVE") {
      const nextBounds = createBounds();
      let isReliable = false;

      for (const segmentRef of compositeCurves.get(curveRef) || []) {
        const segmentBounds = resolveCurveBounds(segmentRef, stack);
        if (!segmentBounds) {
          isReliable = false;
          bounds = null;
          break;
        }
        mergeBounds(nextBounds, segmentBounds);
        isReliable = true;
      }

      if (isReliable) {
        bounds = finalizeBounds(nextBounds);
      }
    } else if (entity?.type === "IFCTRIMMEDCURVE") {
      const trimmedCurve = trimmedCurves.get(curveRef);
      const circle = circles.get(trimmedCurve?.basisCurveRef);
      if (circle) {
        const startAngle = resolveCircleAngleFromTrim(trimmedCurve.trim1, circle);
        const endAngle = resolveCircleAngleFromTrim(trimmedCurve.trim2, circle);
        bounds = buildCircleBounds(circle, startAngle, endAngle, trimmedCurve.sameSense);
      }
    } else if (entity?.type === "IFCCIRCLE") {
      bounds = buildCircleBounds(circles.get(curveRef), null, null, true);
    }

    stack.delete(curveRef);
    curveBoundsCache.set(curveRef, bounds);
    return bounds;
  }

  function resolveProfileMetrics(profileRef) {
    if (!profileRef) return null;
    if (profileMetricsCache.has(profileRef)) {
      return profileMetricsCache.get(profileRef);
    }

    const entity = entities.get(profileRef);
    let metrics = null;

    if (
      entity?.type === "IFCRECTANGLEPROFILEDEF" ||
      entity?.type === "IFCRECTANGLEHOLLOWPROFILEDEF"
    ) {
      const spanX = parseNumber(entity.args[3]);
      const spanY = parseNumber(entity.args[4]);
      if (Number.isFinite(spanX) && Number.isFinite(spanY)) {
        metrics = {
          spanX,
          spanY,
          source: "rectangle-profile"
        };
      }
    } else if (
      entity?.type === "IFCCIRCLEPROFILEDEF" ||
      entity?.type === "IFCCIRCLEHOLLOWPROFILEDEF"
    ) {
      const radius = parseNumber(entity.args[3]);
      if (Number.isFinite(radius) && radius > 0) {
        metrics = {
          spanX: radius * 2,
          spanY: radius * 2,
          source: "circle-profile"
        };
      }
    } else if (
      entity?.type === "IFCARBITRARYCLOSEDPROFILEDEF" ||
      entity?.type === "IFCARBITRARYPROFILEDEFWITHVOIDS"
    ) {
      const outerCurveRef = parseRef(entity.args[2]);
      const bounds = resolveCurveBounds(outerCurveRef);
      if (bounds) {
        metrics = {
          spanX: bounds.maxX - bounds.minX,
          spanY: bounds.maxY - bounds.minY,
          source: "profile-bounds"
        };
      }
    }

    profileMetricsCache.set(profileRef, metrics);
    return metrics;
  }

  function resolveExtrudedSolidMetrics(solidRef, scaleFactor = 1) {
    const cacheKey = `${solidRef}:${scaleFactor}`;
    if (extrudedSolidMetricsCache.has(cacheKey)) {
      return extrudedSolidMetricsCache.get(cacheKey);
    }

    const entity = entities.get(solidRef);
    let metrics = null;

    if (entity?.type === "IFCEXTRUDEDAREASOLID") {
      const profileMetrics = resolveProfileMetrics(parseRef(entity.args[0]));
      const depth = parseNumber(entity.args[3]);

      if (Number.isFinite(depth)) {
        metrics = {
          depth: depth * scaleFactor,
          spanX: Number.isFinite(profileMetrics?.spanX) ? profileMetrics.spanX * scaleFactor : null,
          spanY: Number.isFinite(profileMetrics?.spanY) ? profileMetrics.spanY * scaleFactor : null,
          source: profileMetrics?.source || "extruded-solid"
        };
      }
    }

    extrudedSolidMetricsCache.set(cacheKey, metrics);
    return metrics;
  }

  function collectExtrudedSolidMetrics(ref, scaleFactor = 1, stack = new Set()) {
    if (!ref || stack.has(ref)) return [];

    stack.add(ref);
    const entity = entities.get(ref);
    let metrics = [];

    if (entity?.type === "IFCPRODUCTDEFINITIONSHAPE") {
      for (const representationRef of productDefinitionShapes.get(ref) || []) {
        metrics = metrics.concat(collectExtrudedSolidMetrics(representationRef, scaleFactor, stack));
      }
    } else if (entity?.type === "IFCSHAPEREPRESENTATION" || entity?.type === "IFCREPRESENTATION") {
      for (const itemRef of shapeRepresentations.get(ref)?.itemRefs || []) {
        metrics = metrics.concat(collectExtrudedSolidMetrics(itemRef, scaleFactor, stack));
      }
    } else if (entity?.type === "IFCMAPPEDITEM") {
      const mappingSourceRef = parseRef(entity.args[0]);
      const targetScale = resolveTransformationScale(parseRef(entity.args[1]));
      if (Number.isFinite(targetScale) && targetScale > 0) {
        metrics = metrics.concat(
          collectExtrudedSolidMetrics(mappingSourceRef, scaleFactor * targetScale, stack)
        );
      }
    } else if (entity?.type === "IFCREPRESENTATIONMAP") {
      const mappedRepresentationRef = representationMaps.get(ref)?.mappedRepresentationRef;
      metrics = metrics.concat(
        collectExtrudedSolidMetrics(mappedRepresentationRef, scaleFactor, stack)
      );
    } else if (entity?.type === "IFCEXTRUDEDAREASOLID") {
      const resolvedMetrics = resolveExtrudedSolidMetrics(ref, scaleFactor);
      if (resolvedMetrics) {
        metrics.push(resolvedMetrics);
      }
    }

    stack.delete(ref);
    return metrics;
  }

  function resolveGeometryMetrics(elementId) {
    if (geometryMetricsCache.has(elementId)) {
      return geometryMetricsCache.get(elementId);
    }

    const product = entities.get(elementId);
    const representationRef = parseRef(product?.args?.[6]);
    const candidates = collectExtrudedSolidMetrics(representationRef);
    let bestCandidate = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      const spanX = Number.isFinite(candidate?.spanX) ? candidate.spanX : 0;
      const spanY = Number.isFinite(candidate?.spanY) ? candidate.spanY : 0;
      const depth = Number.isFinite(candidate?.depth) ? candidate.depth : 0;
      const score = (spanX * spanY * depth) || (spanX * spanY) || depth;

      if (score > bestScore) {
        bestCandidate = candidate;
        bestScore = score;
      }
    }

    geometryMetricsCache.set(elementId, bestCandidate || null);
    return bestCandidate || null;
  }

  return {
    resolveLocalPlacementTransform,
    resolveFloorInfo,
    resolvePropertyBag,
    resolveGeometryMetrics
  };
}

function normalizeTextValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const flattened = value
      .map((item) => normalizeTextValue(item))
      .filter(Boolean)
      .join(" ");
    return flattened || null;
  }
  if (typeof value === "string" && /^#\d+$/.test(value.trim())) {
    return null;
  }
  const normalized = decodeIfcUnicodeEscapes(String(value)).trim();
  return normalized || null;
}

function pickFirstText(...values) {
  for (const value of values) {
    const normalized = normalizeTextValue(value);
    if (normalized) return normalized;
  }
  return null;
}

function extractCompactIdentifierFromText(value) {
  const normalized = normalizeTextValue(value);
  if (!normalized) return null;

  const compact = normalized.replace(/\s+/g, " ").trim();
  if (!compact) return null;

  if (
    compact.length <= 36 &&
    compact.split(/\s+/u).length <= 3 &&
    /^[A-ZА-Я0-9][A-ZА-Я0-9 ._/-]{0,35}$/iu.test(compact)
  ) {
    return compact;
  }

  return extractCompactCodeFromText(compact);
}

function extractCompactCodeFromText(value) {
  const normalized = normalizeTextValue(value);
  if (!normalized) return null;

  const compact = normalized.replace(/\s+/g, " ").trim();
  if (!compact) return null;

  const codeLikeMatch = compact.match(/\b([A-ZА-Я]{0,4}\d{4,}[A-ZА-Я0-9._/-]*)\b/u);
  if (codeLikeMatch) {
    return codeLikeMatch[1];
  }

  const digitsMatch = compact.match(/\b(\d{4,})\b/u);
  if (digitsMatch) {
    return digitsMatch[1];
  }

  return null;
}

function isIdentifierRedundantForType(identifier, normalizedType) {
  const typeLabel = BIM_TO_TEHNADZOR_TYPE[normalizedType];
  if (!typeLabel || !identifier) return false;

  const normalizedIdentifier = String(identifier).trim().toLowerCase();
  const normalizedTypeLabel = typeLabel.toLowerCase();
  return (
    normalizedIdentifier === normalizedTypeLabel ||
    normalizedIdentifier.startsWith(`${normalizedTypeLabel} `)
  );
}

function pickBestElementIdentifier(normalizedType, ...values) {
  const primaryCandidates = values.slice(0, 5);
  const secondaryCandidates = values.slice(5);

  for (const value of primaryCandidates) {
    const compactIdentifier = extractCompactIdentifierFromText(value);
    if (!compactIdentifier) continue;

    if (!isIdentifierRedundantForType(compactIdentifier, normalizedType)) {
      return compactIdentifier;
    }

    const compactCode = extractCompactCodeFromText(value);
    if (compactCode && !isIdentifierRedundantForType(compactCode, normalizedType)) {
      return compactCode;
    }
  }

  for (const value of secondaryCandidates) {
    const compactCode = extractCompactCodeFromText(value);
    if (compactCode && !isIdentifierRedundantForType(compactCode, normalizedType)) {
      return compactCode;
    }
  }

  return null;
}

function normalizeFloorLabel(value) {
  const normalized = normalizeTextValue(value);
  if (!normalized) return null;

  const compact = normalized.replace(/\s+/g, " ").trim();
  if (!compact || compact.length > 48) return null;
  if (/[|;]{2,}/.test(compact)) return null;

  const storeyNamedMatch = compact.match(/^(этаж|эт\.?|level|storey|story)\s*[:#-]?\s*(.+)$/iu);
  if (storeyNamedMatch) {
    const namedValue = normalizeFloorLabel(storeyNamedMatch[2]);
    return namedValue || compact;
  }

  if (/^(подвал|цоколь|кровля|техэтаж|roof)$/iu.test(compact)) {
    return compact;
  }

  if (/^-?\d+(?:[.,]\d+)?$/u.test(compact)) {
    return compact.replace(",", ".");
  }

  if (/^[A-ZА-Я0-9][A-ZА-Я0-9 ._/-]{0,31}$/iu.test(compact)) {
    return compact;
  }

  return null;
}

function normalizeAxisLetterToken(token) {
  const normalized = normalizeTextValue(token)?.toUpperCase().replace(/\s+/g, "");
  if (!normalized) return null;
  return /^[A-ZА-Я]$/u.test(normalized) ? normalized : null;
}

function normalizeAxisNumberToken(token) {
  const normalized = normalizeTextValue(token)?.replace(/\s+/g, "");
  if (!normalized) return null;
  return /^\d{1,4}$/u.test(normalized) ? normalized : null;
}

function normalizeAxisRange(startToken, endToken, type) {
  const normalizeToken = type === "letter" ? normalizeAxisLetterToken : normalizeAxisNumberToken;
  const start = normalizeToken(startToken);
  const end = normalizeToken(endToken);
  if (!start || !end) return null;
  return `${start}-${end}`;
}

function normalizeAxesCandidate(value) {
  const source = normalizeTextValue(value);
  if (!source) return null;

  const cleaned = source
    .replace(/[–—−]/g, "-")
    .replace(/[\\]/g, "/")
    .replace(/\b(оси|ось|axis|axes|grid|grids|coordgrid|gridline|gridlines|between|coord)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const upperCleaned = cleaned.toUpperCase();

  if (!upperCleaned) return null;

  const mixedDirect = upperCleaned.match(/\b([A-ZА-Я])\s*[-/:xX]\s*(\d{1,4})\b/u);
  if (mixedDirect) {
    return `${mixedDirect[1].toUpperCase()}-${mixedDirect[2]}`;
  }

  const mixedReverse = upperCleaned.match(/\b(\d{1,4})\s*[-/:xX]\s*([A-ZА-Я])\b/u);
  if (mixedReverse) {
    return `${mixedReverse[2].toUpperCase()}-${mixedReverse[1]}`;
  }

  const letterRangeMatch =
    upperCleaned.match(/\b([A-ZА-Я])\s*-\s*([A-ZА-Я])\b/u) ||
    upperCleaned.match(/([A-ZА-Я])\s*-\s*([A-ZА-Я])/u);
  const numberRangeMatch =
    upperCleaned.match(/\b(\d{1,4})\s*-\s*(\d{1,4})\b/u) ||
    upperCleaned.match(/(\d{1,4})\s*-\s*(\d{1,4})/u);
  const letterRange = letterRangeMatch
    ? normalizeAxisRange(letterRangeMatch[1], letterRangeMatch[2], "letter")
    : null;
  const numberRange = numberRangeMatch
    ? normalizeAxisRange(numberRangeMatch[1], numberRangeMatch[2], "number")
    : null;

  if (letterRange && numberRange) {
    return `${letterRange}, ${numberRange}`;
  }
  if (letterRange) return letterRange;
  if (numberRange) return numberRange;

  const singleLetter = upperCleaned.match(/\b([A-ZА-Я])\b/u);
  const singleNumber = upperCleaned.match(/\b(\d{1,4})\b/u);
  if (singleLetter && singleNumber && upperCleaned.length <= 12) {
    return `${singleLetter[1].toUpperCase()}-${singleNumber[1]}`;
  }

  const normalizedSingleLetter = normalizeAxisLetterToken(upperCleaned);
  if (normalizedSingleLetter) return normalizedSingleLetter;

  const normalizedSingleNumber = normalizeAxisNumberToken(upperCleaned);
  if (normalizedSingleNumber) return normalizedSingleNumber;

  return null;
}

function extractAxesFromText(...values) {
  for (const value of values) {
    const normalized = normalizeAxesCandidate(value);
    if (normalized) return normalized;
  }
  return null;
}

function formatFloorValue(floorInfo, fallbackValue) {
  const fromInfo = normalizeFloorLabel(floorInfo?.name) || normalizeFloorLabel(floorInfo?.longName);
  if (fromInfo) return fromInfo;

  const fromFallback = normalizeFloorLabel(fallbackValue);
  if (fromFallback) return fromFallback;

  if (Number.isFinite(floorInfo?.elevation)) {
    return `${roundCoordinate(floorInfo.elevation)}`;
  }

  return null;
}

function collectCounts(elements) {
  const countsByType = {
    slab: 0,
    column: 0,
    wall: 0,
    beam: 0,
    stair: 0
  };

  for (const element of elements) {
    if (countsByType[element.type] == null) continue;
    countsByType[element.type] += 1;
  }

  return countsByType;
}

interface ParseIfcOptions {
  fileName?: string;
  sourceModelId?: string;
}

function parseIfcElements(ifcText, options: ParseIfcOptions = {}) {
  const entities = parseEntities(ifcText);
  const index = createIfcModelIndex(entities);
  const fileName = String(options.fileName || "").trim() || "model.ifc";
  const requestedSourceModelId = String(options.sourceModelId || "").trim();
  const sourceModelId =
    sanitizeSourceModelId(requestedSourceModelId) ||
    `ifc-model-${makeHash(fileName).slice(0, 6)}`;

  const elements = [];

  for (const entity of entities.values()) {
    const normalizedType = SUPPORTED_IFC_TYPES[entity.type];
    if (!normalizedType) continue;

    const propertyBag = index.resolvePropertyBag(entity.id);
    const placementRef = parseRef(entity.args[5]);
    const placement = index.resolveLocalPlacementTransform(placementRef);
    const floorInfo = index.resolveFloorInfo(entity.id);
    const geometryFields = mapGeometryFields(
      normalizedType,
      index.resolveGeometryMetrics(entity.id)
    );

    const ifcGuid = normalizeTextValue(unquoteIfcString(entity.args[0]));
    const name = normalizeTextValue(unquoteIfcString(entity.args[2]));
    const description = normalizeTextValue(unquoteIfcString(entity.args[3]));
    const objectType = normalizeTextValue(unquoteIfcString(entity.args[4]));
    const tag = normalizeTextValue(unquoteIfcString(entity.args[7]));

    const mark = pickBestElementIdentifier(
      normalizedType,
      propertyBag.mark,
      propertyBag["марка"],
      propertyBag.tag,
      propertyBag.positionnumber,
      tag,
      name,
      objectType
    );

    const axes = pickFirstText(
      extractAxesFromText(
        propertyBag.axes,
        propertyBag.axis,
        propertyBag["оси"],
        propertyBag.gridaxis,
        propertyBag.gridintersection,
        propertyBag.grid,
        propertyBag.coordgrid,
        tag,
        name,
        description,
        objectType
      ),
      normalizeAxesCandidate(propertyBag.axes),
      normalizeAxesCandidate(propertyBag["оси"]),
      normalizeAxesCandidate(propertyBag.axis)
    );

    const floor = formatFloorValue(
      floorInfo,
      pickFirstText(
        propertyBag.level,
        propertyBag["этаж"],
        propertyBag.storey,
        propertyBag.buildingstorey,
        propertyBag.baselevel,
        propertyBag.referencelevel,
        propertyBag.levelname
      )
    );

    elements.push({
      elementId: buildStableElementId(sourceModelId, entity.id),
      sourceModelId,
      ifcGuid,
      type: normalizedType,
      name,
      description,
      objectType,
      floor,
      axes,
      mark,
      projectX: roundCoordinate(placement.origin[0]),
      projectY: roundCoordinate(placement.origin[1]),
      projectH: roundCoordinate(placement.origin[2]),
      thickness: geometryFields.thickness,
      length: geometryFields.length,
      width: geometryFields.width,
      height: geometryFields.height,
      sectionWidth: geometryFields.sectionWidth,
      sectionHeight: geometryFields.sectionHeight
    });
  }

  return {
    sourceModelId,
    fileName,
    importedCount: elements.length,
    countsByType: collectCounts(elements),
    countsByLabel: Object.fromEntries(
      Object.entries(collectCounts(elements)).map(([type, count]) => [
        BIM_TO_TEHNADZOR_TYPE[type] || type,
        count
      ])
    ),
    elements
  };
}

export {
  BIM_TO_TEHNADZOR_TYPE,
  SUPPORTED_IFC_TYPES,
  parseIfcElements
};
