import {
  CONSTRUCTION_CATEGORIES,
  getConstructionModuleBehavior,
  getConstructionOptionsByCategory,
  getConstructionSubtypeOptions
} from "../construction.js";
import type { KnowledgeArticle, KnowledgeModuleItem } from "../../types/module-records.js";
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
import {
  KNOWLEDGE_MODULES,
  getKnowledgeConstructionCard
} from "./knowledge-catalog.js";

function formatArticleTitle(moduleLabel: string, constructionLabel: string, statusLabel: string) {
  const suffix = statusLabel && statusLabel !== "объектовый контроль" ? ` (${statusLabel})` : "";
  if (moduleLabel === "Прочность бетона") {
    return `Прочность бетона: ${constructionLabel}${suffix}`;
  }
  return `${moduleLabel}: ${constructionLabel}${suffix}`;
}

function getModuleItem(items: KnowledgeModuleItem[] | undefined, moduleKey: string) {
  return items?.find((item) => item.moduleKey === moduleKey) || null;
}

function getControlStatusFromItem(item: KnowledgeModuleItem | null) {
  if (item?.status === "factory_control") {
    return { status: "factory_control", label: "заводской контроль" };
  }
  if (item?.status === "not_applicable") {
    return { status: "not_applicable", label: "не применяется" };
  }
  return { status: "object_control", label: "объектовый контроль" };
}

function getArticleControlStatus(status: InspectionStatus) {
  const label = getInspectionStatusLabel(status);
  if (status === "factory") return { status: "factory_control", label };
  if (status === "notApplicable") return { status: "not_applicable", label };
  return { status: "object_control", label };
}

function getFallbackInspectionStatus(constructionKey: string, moduleKey: string, subtypeKey = ""): InspectionStatus {
  const behavior = getConstructionModuleBehavior(constructionKey, moduleKey as "geo" | "reinforcement" | "geometry" | "strength", subtypeKey);
  if (behavior.supported !== false) return "object";
  if (behavior.message?.toLocaleLowerCase("ru").includes("завод")) return "factory";
  return "notApplicable";
}

function getRegistryArticleSnapshot(constructionKey: string, moduleKey: string, subtypeKey = "") {
  const inspectionModule = toInspectionModule(moduleKey as "geo" | "reinforcement" | "geometry" | "strength");
  const registryConfig = getInspectionConfig(constructionKey, inspectionModule, subtypeKey);
  const status = getInspectionStatus(constructionKey, inspectionModule, subtypeKey)
    || getFallbackInspectionStatus(constructionKey, moduleKey, subtypeKey);

  return {
    hasRegistry: !!registryConfig,
    status,
    fields: registryConfig
      ? getInspectionFields(constructionKey, inspectionModule, subtypeKey).map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          unit: field.unit,
          required: field.required
        }))
      : [],
    normativeDocs: registryConfig
      ? getInspectionNormativeDocs(constructionKey, inspectionModule, subtypeKey).map((doc) => ({
          key: doc.key,
          document: doc.document,
          clause: doc.clause,
          tolerance: doc.tolerance,
          url: doc.url
        }))
      : [],
    infoMessage: registryConfig ? getInspectionInfoMessage(constructionKey, inspectionModule, subtypeKey) : ""
  };
}

function snapshotSignature(snapshot: ReturnType<typeof getRegistryArticleSnapshot>) {
  return JSON.stringify({
    status: snapshot.status,
    fields: snapshot.fields.map((field) => [field.key, field.label, field.unit || ""]),
    docs: snapshot.normativeDocs.map((doc) => [doc.key, doc.document, doc.clause || "", doc.tolerance || ""]),
    message: snapshot.infoMessage
  });
}

function shouldSplitSubtypeArticles(constructionKey: string, moduleKey: string) {
  const subtypes = getConstructionSubtypeOptions(constructionKey);
  if (!subtypes.length) return false;
  const signatures = new Set(subtypes.map((subtype) => snapshotSignature(getRegistryArticleSnapshot(constructionKey, moduleKey, subtype.key))));
  return signatures.size > 1;
}

function buildKnowledgeArticle({
  category,
  construction,
  module,
  card,
  subtypeKey = "",
  subtypeLabel = ""
}: {
  category: (typeof CONSTRUCTION_CATEGORIES)[number];
  construction: ReturnType<typeof getConstructionOptionsByCategory>[number];
  module: (typeof KNOWLEDGE_MODULES)[number];
  card: ReturnType<typeof getKnowledgeConstructionCard>;
  subtypeKey?: string;
  subtypeLabel?: string;
}): KnowledgeArticle | null {
  const item = getModuleItem(card?.items, module.key);
  const snapshot = getRegistryArticleSnapshot(construction.key, module.key, subtypeKey);
  const control = snapshot.hasRegistry ? getArticleControlStatus(snapshot.status) : getControlStatusFromItem(item);
  const registryStatus = snapshot.hasRegistry ? snapshot.status : (
    control.status === "factory_control" ? "factory" : control.status === "not_applicable" ? "notApplicable" : "object"
  );

  if (registryStatus === "notApplicable") return null;

  const constructionTitle = subtypeLabel ? `${construction.label} — ${subtypeLabel}` : construction.label;
  const title = formatArticleTitle(module.label, constructionTitle, control.label);
  const id = subtypeKey
    ? `${construction.key}-${subtypeKey}-${module.articleSuffix}`
    : `${construction.key}-${module.articleSuffix}`;
  const subtypeText = subtypeLabel || card?.subtypeItems?.join(", ") || "";

  return {
    id,
    title,
    content: "",
    constructionKey: construction.key,
    constructionCategory: card?.categoryTitle || category.label,
    constructionCategoryKey: category.key,
    construction: construction.label,
    constructionType: construction.label,
    constructionSubtypeKey: subtypeKey,
    constructionSubtype: subtypeText,
    constructionSubtypeLabel: subtypeText,
    moduleKey: module.key,
    applicability: control.label,
    controlStatus: control.status,
    controlStatusLabel: control.label,
    controlNote: snapshot.infoMessage || item?.note || control.label,
    registryStatus,
    infoMessage: snapshot.infoMessage,
    fields: snapshot.fields,
    normativeDocs: snapshot.normativeDocs,
    isRegistryFallback: snapshot.hasRegistry,
    category: module.label,
    subcategory: module.label,
    tags: [
      card?.categoryTitle || category.label,
      construction.label,
      subtypeKey,
      subtypeLabel,
      module.label,
      module.key,
      getInspectionStatusLabel(registryStatus),
      snapshot.infoMessage,
      item?.note || "",
      ...snapshot.fields.map((field) => field.label),
      ...snapshot.normativeDocs.map((doc) => `${doc.document} ${doc.clause || ""}`),
      ...(card?.subtypeItems || [])
    ].filter(Boolean) as string[]
  };
}

function buildKnowledgeArticles() {
  const articles: KnowledgeArticle[] = [];

  CONSTRUCTION_CATEGORIES.forEach((category) => {
    getConstructionOptionsByCategory(category.key).forEach((construction) => {
      const card = getKnowledgeConstructionCard(construction.key);
      KNOWLEDGE_MODULES.forEach((module) => {
        const subtypes = getConstructionSubtypeOptions(construction.key);
        if (shouldSplitSubtypeArticles(construction.key, module.key)) {
          subtypes.forEach((subtype) => {
            const article = buildKnowledgeArticle({
              category,
              construction,
              module,
              card,
              subtypeKey: subtype.key,
              subtypeLabel: subtype.label
            });
            if (article) articles.push(article);
          });
          return;
        }

        const article = buildKnowledgeArticle({ category, construction, module, card });
        if (article) articles.push(article);
      });
    });
  });

  return articles;
}

// Static runtime metadata is generated from the construction selector matrix.
export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = buildKnowledgeArticles();
