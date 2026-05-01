import { REGULATORY_DOCS } from "../../config.js";
import { escapeHtml } from "../../utils.js";
import {
  getInspectionNormativeDocs,
  toInspectionModule
} from "../inspection-registry.js";
import { normalizeConstructionKey, normalizeConstructionSubtype } from "../construction.js";

const REGULATORY_BASIS = Object.freeze({
  geo: Object.freeze({
    default: Object.freeze([
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "допуск X/Y ±8 мм, H ±10 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      },
      {
        document: "СП 126.13330.2017",
        clause: "разд. 5-8",
        tolerance: "геодезические работы и порядок измерений",
        url: REGULATORY_DOCS.SP_126_13330_2017
      }
    ]),
    "плита": Object.freeze([
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "допуск X/Y ±8 мм, H ±10 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      },
      {
        document: "СП 126.13330.2017",
        clause: "разд. 5-8",
        tolerance: "геодезические работы и порядок измерений",
        url: REGULATORY_DOCS.SP_126_13330_2017
      }
    ]),
    "лестница": Object.freeze([
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "допуск X/Y ±8 мм, H ±10 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      },
      {
        document: "СП 126.13330.2017",
        clause: "разд. 5-8",
        tolerance: "геодезические работы и порядок измерений",
        url: REGULATORY_DOCS.SP_126_13330_2017
      }
    ]),
    "колонна": Object.freeze([
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "допуск координат X/Y ±8 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      },
      {
        document: "СП 126.13330.2017",
        clause: "разд. 5-8",
        tolerance: "геодезические работы и порядок измерений",
        url: REGULATORY_DOCS.SP_126_13330_2017
      }
    ]),
    "стена": Object.freeze([
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "допуск координат X/Y ±8 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      },
      {
        document: "СП 126.13330.2017",
        clause: "разд. 5-8",
        tolerance: "геодезические работы и порядок измерений",
        url: REGULATORY_DOCS.SP_126_13330_2017
      }
    ]),
    "балка": Object.freeze([
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "допуск координат X/Y ±8 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      },
      {
        document: "СП 126.13330.2017",
        clause: "разд. 5-8",
        tolerance: "геодезические работы и порядок измерений",
        url: REGULATORY_DOCS.SP_126_13330_2017
      }
    ])
  }),
  reinforcement: Object.freeze({
    default: Object.freeze([
      {
        document: "ГОСТ Р 57997-2017",
        clause: "разд. 5",
        tolerance: "диаметр строго; шаг ±20 мм",
        url: REGULATORY_DOCS.GOST_R_57997_2017
      },
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "защитный слой ±5 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ]),
    "плита": Object.freeze([
      {
        document: "ГОСТ Р 57997-2017",
        clause: "разд. 5",
        tolerance: "диаметр строго; шаг ±20 мм",
        url: REGULATORY_DOCS.GOST_R_57997_2017
      },
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "защитный слой ±5 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ]),
    "лестница": Object.freeze([
      {
        document: "ГОСТ Р 57997-2017",
        clause: "разд. 5",
        tolerance: "диаметр строго; шаг ±20 мм",
        url: REGULATORY_DOCS.GOST_R_57997_2017
      },
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "защитный слой ±5 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ]),
    "колонна": Object.freeze([
      {
        document: "ГОСТ Р 57997-2017",
        clause: "разд. 5",
        tolerance: "диаметр строго; шаг/хомуты ±20 мм",
        url: REGULATORY_DOCS.GOST_R_57997_2017
      },
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "защитный слой ±5 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ]),
    "стена": Object.freeze([
      {
        document: "ГОСТ Р 57997-2017",
        clause: "разд. 5",
        tolerance: "диаметр строго; шаг ±20 мм",
        url: REGULATORY_DOCS.GOST_R_57997_2017
      },
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "защитный слой ±5 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ]),
    "балка": Object.freeze([
      {
        document: "ГОСТ Р 57997-2017",
        clause: "разд. 5",
        tolerance: "диаметр строго; шаг ±20 мм",
        url: REGULATORY_DOCS.GOST_R_57997_2017
      },
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "защитный слой ±5 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ])
  }),
  geometry: Object.freeze({
    default: Object.freeze([
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "толщина ±5 мм; вертикальность ±8 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ]),
    "плита": Object.freeze([
      {
        document: "ГОСТ 9561-2016",
        clause: "разд. 5-8",
        tolerance: "высота ±5 мм",
        url: REGULATORY_DOCS.GOST_9561_2016
      },
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "прогиб/плоскостность ±5 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ]),
    "колонна": Object.freeze([
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "размеры/вертикальность ±8 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ]),
    "стена": Object.freeze([
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "толщина ±5 мм; вертикальность ±8 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ]),
    "лестница": Object.freeze([
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "ступени: высота/ширина ±5 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ]),
    "балка": Object.freeze([
      {
        document: "СП 70.13330.2012",
        clause: "табл. 5.1",
        tolerance: "размеры ±8 мм; прогиб ±5 мм",
        url: REGULATORY_DOCS.SP_70_13330_2012
      }
    ])
  }),
  strength: Object.freeze({
    default: Object.freeze([
      {
        document: "ГОСТ 18105-2018",
        clause: "п. 5.6",
        tolerance: "R(t)=R28×lg(t)/lg(28)",
        url: REGULATORY_DOCS.GOST_18105_2018
      }
    ])
  })
});

const normalizeKey = (value) => String(value == null ? "" : value).trim().toLocaleLowerCase("ru");
const isRegistryModuleKey = (value) => ["geo", "geodesy", "reinforcement", "geometry", "strength"].includes(value);

export const REGULATORY_BASIS_MAP = REGULATORY_BASIS;

interface RegulatoryBasisHtmlOptions {
  moduleKey?: string;
  checkKind?: string;
  helpTargetId?: string;
  subtype?: string;
}

export function getRegulatoryBasisEntries(moduleKey, checkKind = "default", subtype = "") {
  const normalizedModule = normalizeKey(moduleKey);
  if (isRegistryModuleKey(normalizedModule)) {
    const constructionKey = normalizeConstructionKey(checkKind, String(checkKind || ""));
    const subtypeKey = normalizeConstructionSubtype(constructionKey, subtype);
    const registryDocs = getInspectionNormativeDocs(
      constructionKey,
      toInspectionModule(normalizedModule as "geo" | "geodesy" | "reinforcement" | "geometry" | "strength"),
      subtypeKey
    );
    if (registryDocs.length) {
      return registryDocs;
    }
  }

  const moduleMap = REGULATORY_BASIS[normalizedModule];
  if (!moduleMap) return [];

  const normalizedKind = normalizeKey(checkKind || "default");
  return moduleMap[normalizedKind] || moduleMap.default || [];
}

export function renderRegulatoryBasisHtml({
  moduleKey,
  checkKind = "default",
  subtype = ""
}: RegulatoryBasisHtmlOptions = {}) {
  const entries = getRegulatoryBasisEntries(moduleKey, checkKind, subtype);
  if (!entries.length) return "";

  const rows = entries.map((entry) => {
    const safeDocument = escapeHtml(entry.document || "—");
    const safeClause = escapeHtml(entry.clause || "—");
    const safeSourceUrl = typeof entry.url === "string" ? entry.url.trim() : "";
    const sourceHtml = safeSourceUrl
      ? `<a class="reg-basis-source-link reg-basis-more" href="${escapeHtml(safeSourceUrl)}" target="_blank" rel="noopener noreferrer" title="Открыть нормативный документ">Подробнее</a>`
      : `<span class="reg-basis-source-fallback">Источник не задан</span>`;
    const safeTolerance = entry.tolerance
      ? `
        <span class="reg-basis-item-field">
          <span class="reg-basis-item-label">Допуск:</span>
          <span class="reg-basis-item-value">${escapeHtml(entry.tolerance)}</span>
        </span>
      `
      : "";

    return `
      <div class="reg-basis-item">
        <span class="reg-basis-item-field">
          <span class="reg-basis-item-label">Документ:</span>
          <span class="reg-basis-item-value">${safeDocument}</span>
        </span>
        <span class="reg-basis-item-field">
          <span class="reg-basis-item-label">Пункт:</span>
          <span class="reg-basis-item-value">${safeClause}</span>
        </span>
        ${safeTolerance}
        <span class="reg-basis-item-field reg-basis-source">
          ${sourceHtml}
        </span>
      </div>
    `;
  }).join("");

  return `
    <div class="reg-basis">
      <div class="reg-basis-title">Нормативное основание</div>
      <div class="reg-basis-list">
        ${rows}
      </div>
    </div>
  `;
}

