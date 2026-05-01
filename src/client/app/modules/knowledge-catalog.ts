import {
  CONSTRUCTION_CATEGORIES,
  getConstructionModuleBehavior,
  getConstructionOptionsByCategory,
  getConstructionSubtypeLabel,
  getConstructionSubtypeOptions
} from "../construction.js";
import type {
  ConstructionBehaviorModule,
  ConstructionSubtypeOption
} from "../construction.js";
import {
  getInspectionConfig,
  getInspectionFields,
  getInspectionInfoMessage,
  getInspectionNormativeDocs,
  getInspectionStatus,
  getInspectionStatusLabel,
  toInspectionModule
} from "../inspection-registry.js";
import type { InspectionStatus } from "../inspection-registry.js";
import type {
  KnowledgeConstructionCard,
  KnowledgeModuleItem,
  KnowledgeSubcategory
} from "../../types/module-records.js";

interface KnowledgeCategory {
  title: string;
  icon: string;
  subcategories: Record<string, KnowledgeSubcategory>;
}

interface KnowledgeModuleDescriptor {
  key: Extract<ConstructionBehaviorModule, "geo" | "reinforcement" | "geometry" | "strength">;
  label: string;
  articleSuffix: string;
}

const KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  stiffness_cores: "Ядра жёсткости"
};

const KNOWLEDGE_CATEGORY_ICONS: Record<string, string> = {
  foundation: "Ф",
  vertical_load_bearing: "В",
  horizontal_load_bearing: "Г",
  stiffness_cores: "Я",
  formwork: "О"
};

const KNOWLEDGE_CONSTRUCTION_ICONS: Record<string, string> = {
  foundation_slab: "ФП",
  strip_foundation: "ЛФ",
  pile_grillage: "СФ",
  wall: "СТ",
  column: "КЛ",
  pylon: "ПЛ",
  floor_slab: "ПР",
  beam: "БЛ",
  elevator_shaft: "ШЛ",
  stair_core: "ЛК",
  formwork: "ОП"
};

export const KNOWLEDGE_MODULES: readonly KnowledgeModuleDescriptor[] = Object.freeze([
  { key: "geo", label: "Геодезическая привязка", articleSuffix: "geo" },
  { key: "reinforcement", label: "Армирование", articleSuffix: "reinf" },
  { key: "geometry", label: "Геометрия", articleSuffix: "geom" },
  { key: "strength", label: "Прочность бетона", articleSuffix: "strength" }
]);

export const KNOWLEDGE_SCROLL_TOP_THRESHOLD = 280;

const INSPECTION_STATUS_TO_KNOWLEDGE: Record<InspectionStatus, NonNullable<KnowledgeModuleItem["status"]>> = {
  object: "object_control",
  factory: "factory_control",
  notApplicable: "not_applicable"
};

function displayCategoryLabel(categoryKey: string, fallback: string) {
  return KNOWLEDGE_CATEGORY_LABELS[categoryKey] || fallback;
}

function displaySubtypeLabel(_constructionKey: string, subtype: ConstructionSubtypeOption) {
  return subtype.label;
}

function getDisabledKnowledgeNote(constructionKey: string, moduleKey: KnowledgeModuleDescriptor["key"], subtypeKey = "") {
  const behavior = getConstructionModuleBehavior(constructionKey, moduleKey, subtypeKey);
  if (behavior.message?.toLocaleLowerCase("ru").includes("завод")) {
    return "заводской контроль";
  }
  return "не применяется";
}

function getFallbackInspectionStatus(constructionKey: string, moduleKey: KnowledgeModuleDescriptor["key"], subtypeKey = ""): InspectionStatus {
  const behavior = getConstructionModuleBehavior(constructionKey, moduleKey, subtypeKey);
  if (behavior.supported !== false) return "object";
  return getDisabledKnowledgeNote(constructionKey, moduleKey, subtypeKey) === "заводской контроль"
    ? "factory"
    : "notApplicable";
}

function getKnowledgeModuleSnapshot(
  constructionKey: string,
  module: KnowledgeModuleDescriptor,
  subtypeKey = ""
) {
  const inspectionModule = toInspectionModule(module.key);
  const registryConfig = getInspectionConfig(constructionKey, inspectionModule, subtypeKey);
  const registryStatus = getInspectionStatus(constructionKey, inspectionModule, subtypeKey);
  const status = registryStatus || getFallbackInspectionStatus(constructionKey, module.key, subtypeKey);
  const infoMessage = registryConfig
    ? getInspectionInfoMessage(constructionKey, inspectionModule, subtypeKey)
    : "";
  const fields = registryConfig
    ? getInspectionFields(constructionKey, inspectionModule, subtypeKey).map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        unit: field.unit,
        required: field.required
      }))
    : [];
  const normativeDocs = registryConfig
    ? getInspectionNormativeDocs(constructionKey, inspectionModule, subtypeKey).map((doc) => ({
        key: doc.key,
        document: doc.document,
        clause: doc.clause,
        tolerance: doc.tolerance,
        url: doc.url
      }))
    : [];
  const note = infoMessage || getInspectionStatusLabel(status);

  return {
    status,
    note,
    infoMessage,
    fields,
    normativeDocs,
    source: registryConfig ? "registry" as const : "fallback" as const
  };
}

function buildRegularModuleItem(constructionKey: string, module: KnowledgeModuleDescriptor): KnowledgeModuleItem {
  const snapshot = getKnowledgeModuleSnapshot(constructionKey, module);
  const note = snapshot.note || getInspectionStatusLabel(snapshot.status);
  return {
    label: module.label,
    moduleKey: module.key,
    status: INSPECTION_STATUS_TO_KNOWLEDGE[snapshot.status],
    note,
    articleAvailable: snapshot.status !== "notApplicable",
    statusSource: snapshot.source,
    registryStatus: snapshot.status,
    infoMessage: snapshot.infoMessage,
    fields: snapshot.fields,
    normativeDocs: snapshot.normativeDocs,
    tags: [
      module.label,
      note,
      ...snapshot.fields.map((field) => field.label),
      ...snapshot.normativeDocs.map((doc) => `${doc.document} ${doc.clause || ""}`)
    ].filter(Boolean)
  };
}

function buildSubtypeAwareModuleItem(
  constructionKey: string,
  module: KnowledgeModuleDescriptor,
  subtypes: ConstructionSubtypeOption[]
): KnowledgeModuleItem {
  const subtypeSnapshots = subtypes.map((subtype) => ({
    key: subtype.key,
    label: displaySubtypeLabel(constructionKey, subtype),
    ...getKnowledgeModuleSnapshot(constructionKey, module, subtype.key)
  }));

  const objectSubtypes = subtypeSnapshots
    .filter((subtype) => subtype.status === "object")
    .map((subtype) => subtype.label);
  const factorySubtypes = subtypeSnapshots
    .filter((subtype) => subtype.status === "factory")
    .map((subtype) => subtype.label);
  const notApplicableSubtypes = subtypeSnapshots
    .filter((subtype) => subtype.status === "notApplicable")
    .map((subtype) => subtype.label);
  const sharedInfoMessage = subtypeSnapshots[0]?.infoMessage && subtypeSnapshots
    .every((subtype) => subtype.infoMessage === subtypeSnapshots[0]?.infoMessage)
    ? subtypeSnapshots[0].infoMessage
    : "";

  const notes = sharedInfoMessage
    ? [sharedInfoMessage]
    : [
        objectSubtypes.length ? `объектовый контроль: ${objectSubtypes.join(", ")}` : "",
        factorySubtypes.length ? `заводской контроль: ${factorySubtypes.join(", ")}` : "",
        notApplicableSubtypes.length ? `не применяется: ${notApplicableSubtypes.join(", ")}` : ""
      ].filter(Boolean);

  const aggregateStatus: InspectionStatus = objectSubtypes.length
    ? "object"
    : factorySubtypes.length
      ? "factory"
      : "notApplicable";

  return {
    label: module.label,
    moduleKey: module.key,
    status: INSPECTION_STATUS_TO_KNOWLEDGE[aggregateStatus],
    note: notes.join("; "),
    articleAvailable: aggregateStatus !== "notApplicable",
    statusSource: subtypeSnapshots.some((subtype) => subtype.source === "registry") ? "registry" : "fallback",
    registryStatus: aggregateStatus,
    infoMessage: sharedInfoMessage,
    fields: subtypeSnapshots[0]?.fields || [],
    normativeDocs: subtypeSnapshots[0]?.normativeDocs || [],
    tags: [
      module.label,
      ...objectSubtypes,
      ...factorySubtypes,
      ...notApplicableSubtypes,
      ...subtypeSnapshots.flatMap((subtype) => [
        subtype.note,
        ...subtype.fields.map((field) => field.label),
        ...subtype.normativeDocs.map((doc) => `${doc.document} ${doc.clause || ""}`)
      ])
    ]
  };
}

function buildKnowledgeModuleItems(constructionKey: string): KnowledgeModuleItem[] {
  const subtypes = getConstructionSubtypeOptions(constructionKey);
  if (subtypes.length) {
    return KNOWLEDGE_MODULES.map((module) => buildSubtypeAwareModuleItem(constructionKey, module, subtypes));
  }
  return KNOWLEDGE_MODULES.map((module) => buildRegularModuleItem(constructionKey, module));
}

function buildKnowledgeConstructionCard(categoryKey: string, categoryTitle: string, option: ReturnType<typeof getConstructionOptionsByCategory>[number]): KnowledgeConstructionCard {
  const subtypes = getConstructionSubtypeOptions(option.key);
  const subtypeLabel = getConstructionSubtypeLabel(option.key, "");
  const subtypeItems = subtypes.map((subtype) => displaySubtypeLabel(option.key, subtype));
  const moduleItems = buildKnowledgeModuleItems(option.key);
  return {
    key: option.key,
    title: option.label,
    icon: KNOWLEDGE_CONSTRUCTION_ICONS[option.key] || "",
    categoryKey,
    categoryTitle,
    subtypeLabel,
    subtypeItems,
    items: moduleItems,
    tags: [
      categoryTitle,
      option.label,
      subtypeLabel,
      ...subtypeItems,
      ...moduleItems.flatMap((item) => [item.label, item.note || "", ...(item.tags || [])])
    ].filter(Boolean)
  };
}

function buildKnowledgeSubcategories(): Record<string, KnowledgeSubcategory> {
  return CONSTRUCTION_CATEGORIES.reduce((acc, category) => {
    const categoryTitle = displayCategoryLabel(category.key, category.label);
    const constructions = getConstructionOptionsByCategory(category.key)
      .map((option) => buildKnowledgeConstructionCard(category.key, categoryTitle, option));
    if (!constructions.length) return acc;

    acc[category.key] = {
      title: categoryTitle,
      icon: KNOWLEDGE_CATEGORY_ICONS[category.key] || "",
      constructions,
      tags: [
        categoryTitle,
        ...constructions.flatMap((construction) => construction.tags || [])
      ]
    };
    return acc;
  }, {} as Record<string, KnowledgeSubcategory>);
}

export function getKnowledgeConstructionCard(constructionKey: string) {
  const groups = KNOWLEDGE_CATEGORIES.structures.subcategories;
  for (const group of Object.values(groups)) {
    const match = group.constructions?.find((construction) => construction.key === constructionKey);
    if (match) return match;
  }
  return null;
}

export const KNOWLEDGE_CATEGORIES: Record<string, KnowledgeCategory> = {
  structures: {
    title: "Конструкции",
    icon: "",
    subcategories: buildKnowledgeSubcategories()
  }
};
