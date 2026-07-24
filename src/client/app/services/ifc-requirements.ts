import type {
  BimElement,
  IfcRequirementCheck,
  IfcRequirementSeverity,
  IfcRequirementSummary
} from "../../types/domain.js";

type RequirementElement = Partial<BimElement> & Record<string, unknown>;

const STRUCTURAL_TYPES = new Set(["slab", "column", "wall", "beam", "stair", "roof"]);
const SUPPORTED_SCHEMAS = new Set(["IFC2X3", "IFC4", "IFC4X1", "IFC4X2", "IFC4X3"]);
const MAX_SAMPLE_IDS = 4;

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getElementId(element: RequirementElement, index: number) {
  return normalizeText(element.elementId || element.id) || `Элемент ${index + 1}`;
}

function isStructuralElement(element: RequirementElement) {
  return STRUCTURAL_TYPES.has(normalizeText(element.type).toLowerCase());
}

function hasMeaningfulName(element: RequirementElement) {
  const value = normalizeText(element.name);
  if (value.length < 2 || value.length > 160 || !/\p{L}/u.test(value)) return false;
  const guid = normalizeText(element.ifcGuid);
  return !guid || value.toLowerCase() !== guid.toLowerCase();
}

function hasValidGuid(element: RequirementElement) {
  const value = normalizeText(element.ifcGuid);
  return /^[0-9A-Za-z_$]{22}$/u.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function hasFloor(element: RequirementElement) {
  const value = normalizeText(element.floor);
  return Boolean(value && !/^(нет данных|unknown|n\/a|null|undefined)$/iu.test(value));
}

function hasAxes(element: RequirementElement) {
  const value = normalizeText(element.resolvedAxes || element.axes);
  return Boolean(value && !/^(нет данных|unknown|n\/a|null|undefined)$/iu.test(value));
}

function hasMark(element: RequirementElement) {
  const value = normalizeText(element.mark || element.rawMark);
  return Boolean(value && value.length <= 80 && /[\p{L}\p{N}]/u.test(value));
}

function hasPlacement(element: RequirementElement) {
  if ("hasPlacement" in element && element.hasPlacement !== true) return false;
  return [element.projectX, element.projectY, element.projectH].every((value) => {
    if (value == null) return false;
    return Number.isFinite(Number(value));
  });
}

function extractIfcSchema(ifcText: string) {
  const match = String(ifcText || "").match(
    /FILE_SCHEMA\s*\(\s*\(\s*['"]([^'"]+)['"]/iu
  );
  return normalizeText(match?.[1]).toUpperCase() || null;
}

function createCheck({
  id,
  label,
  description,
  severity,
  candidates,
  predicate
}: {
  id: string;
  label: string;
  description: string;
  severity: IfcRequirementSeverity;
  candidates: RequirementElement[];
  predicate: (element: RequirementElement) => boolean;
}): IfcRequirementCheck {
  const failed = candidates.filter((element) => !predicate(element));
  return {
    id,
    label,
    description,
    severity,
    passed: failed.length === 0,
    passedCount: candidates.length - failed.length,
    totalCount: candidates.length,
    affectedCount: failed.length,
    sampleElementIds: failed
      .slice(0, MAX_SAMPLE_IDS)
      .map((element, index) => getElementId(element, index))
  };
}

function createFileCheck({
  id,
  label,
  description,
  severity,
  passed
}: {
  id: string;
  label: string;
  description: string;
  severity: IfcRequirementSeverity;
  passed: boolean;
}): IfcRequirementCheck {
  return {
    id,
    label,
    description,
    severity,
    passed,
    passedCount: passed ? 1 : 0,
    totalCount: 1,
    affectedCount: passed ? 0 : 1,
    sampleElementIds: []
  };
}

export function analyzeIfcRequirements(
  ifcText: string,
  sourceElements: RequirementElement[] = []
): IfcRequirementSummary {
  const normalizedIfcText = String(ifcText || "");
  const elements = Array.isArray(sourceElements) ? sourceElements : [];
  const structuralElements = elements.filter(isStructuralElement);
  const schema = extractIfcSchema(normalizedIfcText);
  const hasSupportedSchema = Boolean(
    schema &&
    [...SUPPORTED_SCHEMAS].some((supportedSchema) =>
      schema === supportedSchema || schema.startsWith(`${supportedSchema}_`)
    )
  );
  const hasStepEnvelope =
    /\bISO-10303-21\s*;/iu.test(normalizedIfcText) &&
    /\bHEADER\s*;/iu.test(normalizedIfcText) &&
    /\bDATA\s*;/iu.test(normalizedIfcText) &&
    /\bEND-ISO-10303-21\s*;/iu.test(normalizedIfcText);

  const guidCounts = new Map<string, number>();
  for (const element of elements) {
    const guid = normalizeText(element.ifcGuid);
    if (!guid) continue;
    guidCounts.set(guid, (guidCounts.get(guid) || 0) + 1);
  }

  const checks: IfcRequirementCheck[] = [
    createFileCheck({
      id: "step-envelope",
      label: "Структура IFC-файла",
      description: "Файл должен содержать корректную оболочку STEP: HEADER, DATA и завершающий маркер.",
      severity: "error",
      passed: hasStepEnvelope
    }),
    createFileCheck({
      id: "supported-elements",
      label: "Поддерживаемые элементы",
      description: "В модели должен быть хотя бы один строительный IFC-элемент, доступный для импорта.",
      severity: "error",
      passed: elements.length > 0
    }),
    createFileCheck({
      id: "schema",
      label: "Версия IFC",
      description: "Рекомендуются IFC2X3, IFC4 или IFC4X3 с явно указанной FILE_SCHEMA.",
      severity: "warning",
      passed: hasSupportedSchema
    }),
    createCheck({
      id: "guid",
      label: "Уникальный IFC GUID",
      description: "Каждый элемент должен иметь корректный GlobalId.",
      severity: "warning",
      candidates: elements,
      predicate: hasValidGuid
    }),
    createCheck({
      id: "guid-unique",
      label: "Отсутствие дубликатов GUID",
      description: "GlobalId элемента не должен повторяться в пределах модели.",
      severity: "warning",
      candidates: elements,
      predicate: (element) => {
        const guid = normalizeText(element.ifcGuid);
        return Boolean(guid && guidCounts.get(guid) === 1);
      }
    }),
    createCheck({
      id: "name",
      label: "Наименование элемента",
      description: "Наименование должно быть осмысленным текстом, а не числовым кодом или GUID.",
      severity: "warning",
      candidates: elements,
      predicate: hasMeaningfulName
    }),
    createCheck({
      id: "floor",
      label: "Привязка к уровню",
      description: "Для основных конструкций должен быть указан этаж или уровень размещения.",
      severity: "warning",
      candidates: structuralElements,
      predicate: hasFloor
    }),
    createCheck({
      id: "axes",
      label: "Привязка к координационным осям",
      description: "Для основных конструкций должна быть сформирована привязка к осям.",
      severity: "warning",
      candidates: structuralElements,
      predicate: hasAxes
    }),
    createCheck({
      id: "mark",
      label: "Марка или позиция",
      description: "Для основных конструкций должна быть задана марка, позиция или номер элемента.",
      severity: "warning",
      candidates: structuralElements,
      predicate: hasMark
    }),
    createCheck({
      id: "placement",
      label: "Координаты размещения",
      description: "Элемент должен иметь конечные проектные координаты X, Y и H.",
      severity: "warning",
      candidates: elements,
      predicate: hasPlacement
    })
  ];

  const attributeChecks = checks.filter((check) =>
    ["guid", "guid-unique", "name", "floor", "axes", "mark", "placement"].includes(check.id)
  );
  const attributeTotal = attributeChecks.reduce((sum, check) => sum + check.totalCount, 0);
  const attributePassed = attributeChecks.reduce((sum, check) => sum + check.passedCount, 0);
  const score = attributeTotal > 0 ? Math.round((attributePassed / attributeTotal) * 100) : 0;

  const conformingElements = elements.filter((element) => {
    const structural = isStructuralElement(element);
    return hasValidGuid(element) &&
      guidCounts.get(normalizeText(element.ifcGuid)) === 1 &&
      hasMeaningfulName(element) &&
      hasPlacement(element) &&
      (!structural || (hasFloor(element) && hasAxes(element) && hasMark(element)));
  }).length;

  const failedChecks = checks.filter((check) => !check.passed);
  const errorCount = failedChecks.filter((check) => check.severity === "error").length;
  const warningCount = failedChecks.filter((check) => check.severity === "warning").length;
  const canImport = errorCount === 0;

  return {
    status: canImport ? (warningCount > 0 ? "warning" : "passed") : "blocked",
    canImport,
    schema,
    totalElements: elements.length,
    conformingElements,
    score,
    errorCount,
    warningCount,
    checks
  };
}
