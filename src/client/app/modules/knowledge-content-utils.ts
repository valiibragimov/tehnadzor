interface ExpandedKnowledgeSectionsConfig {
  prefix?: string;
  checklistTitle?: string;
  checklistItems?: readonly string[];
  documentationTitle?: string;
  documentationItems?: readonly string[];
  risksTitle?: string;
  risksItems?: readonly string[];
  finalTitle?: string;
  finalParagraphs?: readonly string[];
}

export interface KnowledgeNormativeDocument {
  key: string;
  title: string;
  url?: string;
  modules?: readonly string[];
}

export interface KnowledgeRegistryNormativeDocument {
  key: string;
  document: string;
  clause?: string;
  tolerance?: string;
  url?: string;
}

export const KNOWLEDGE_NORMATIVE_DOCUMENTS: readonly KnowledgeNormativeDocument[] = Object.freeze([
  {
    key: "SP_70_13330_2012",
    title: "СП 70.13330.2012 “Несущие и ограждающие конструкции”",
    modules: ["geo", "geometry", "reinforcement", "strength"]
  },
  {
    key: "SP_126_13330_2017",
    title: "СП 126.13330.2017 “Геодезические работы в строительстве”",
    modules: ["geo"]
  },
  {
    key: "SP_63_13330_2018",
    title: "СП 63.13330.2018 “Бетонные и железобетонные конструкции”",
    modules: ["reinforcement", "strength"]
  },
  {
    key: "SP_371_1325800_2017",
    title: "СП 371.1325800.2017 “Опалубка. Правила проектирования”",
    modules: ["geometry"]
  },
  {
    key: "GOST_34329_2017",
    title: "ГОСТ 34329-2017 “Опалубка. Общие технические условия”",
    modules: ["geometry"]
  },
  {
    key: "GOST_34028_2016",
    title: "ГОСТ 34028-2016 “Прокат арматурный для железобетонных конструкций”",
    modules: ["reinforcement"]
  },
  {
    key: "GOST_18105_2018",
    title: "ГОСТ 18105-2018 “Бетоны. Правила контроля и оценки прочности”",
    modules: ["strength"]
  },
  {
    key: "GOST_22690_2015",
    title: "ГОСТ 22690-2015 “Бетоны. Определение прочности механическими методами неразрушающего контроля”",
    modules: ["strength"]
  },
  {
    key: "GOST_17624_2021",
    title: "ГОСТ 17624-2021 “Бетоны. Ультразвуковой метод определения прочности”",
    modules: ["strength"]
  }
]);

export function buildKnowledgeList(items: readonly string[] = []) {
  return items.map((item) => `<li>${item}</li>`).join("");
}

export function buildKnowledgeParagraphs(paragraphs: readonly string[] = []) {
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

function formatRegistryNormativeDoc(doc: KnowledgeRegistryNormativeDocument) {
  const title = [
    doc.document,
    doc.clause ? `(${doc.clause})` : "",
    doc.tolerance ? `- ${doc.tolerance}` : ""
  ].filter(Boolean).join(" ");
  if (!doc.url) return title;
  return `<a href="${doc.url}" target="_blank" rel="noopener noreferrer">${title}</a>`;
}

export function buildKnowledgeNormativeList(
  moduleKey = "",
  urls: Record<string, string> = {},
  registryDocs: readonly KnowledgeRegistryNormativeDocument[] = []
) {
  if (registryDocs.length) {
    return buildKnowledgeList(registryDocs.map(formatRegistryNormativeDoc));
  }

  const docs = KNOWLEDGE_NORMATIVE_DOCUMENTS.filter((doc) => (
    !doc.modules?.length || !moduleKey || doc.modules.includes(moduleKey)
  ));

  return buildKnowledgeList(docs.map((doc) => {
    const url = urls[doc.key];
    if (!url) return doc.title;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${doc.title}</a>`;
  }));
}

export function buildExpandedKnowledgeSections({
  prefix = "knowledge-extra",
  checklistTitle = "Практический чек-лист технадзора",
  checklistItems = [],
  documentationTitle = "Что фиксировать в журнале и актах",
  documentationItems = [],
  risksTitle = "Сигналы риска, требующие отдельного внимания",
  risksItems = [],
  finalTitle = "Практический вывод",
  finalParagraphs = []
}: ExpandedKnowledgeSectionsConfig = {}) {
  return `
    <h2 id="${prefix}-checklist">${checklistTitle}</h2>
    <ul>
      ${buildKnowledgeList(checklistItems)}
    </ul>

    <h2 id="${prefix}-documentation">${documentationTitle}</h2>
    <ul>
      ${buildKnowledgeList(documentationItems)}
    </ul>

    <h2 id="${prefix}-risks">${risksTitle}</h2>
    <ul>
      ${buildKnowledgeList(risksItems)}
    </ul>

    <h2 id="${prefix}-final">${finalTitle}</h2>
    ${buildKnowledgeParagraphs(finalParagraphs)}
  `;
}
