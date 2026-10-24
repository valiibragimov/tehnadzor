import { REGULATORY_DOCS } from "../../config.js";
import { escapeHtml } from "../../utils.js";
import {
  getInspectionNormativeDocs,
  toInspectionModule
} from "../inspection-registry.js";
import { normalizeConstructionKey, normalizeConstructionSubtype } from "../construction.js";

const REGULATORY_BASIS = {
  geo: { default: [{ document: "СП 126.13330.2017", clause: "разд. 5–8", tolerance: "Условия и точность геодезического контроля; приёмочные допуски задаются по применимому основанию", url: REGULATORY_DOCS.SP_126_13330_2017 }] },
  reinforcement: { default: [{ document: "СП 70.13330.2012", clause: "разд. 5.16", tolerance: "Арматурные работы: допуск зависит от параметра, сечения и проектных требований", url: REGULATORY_DOCS.SP_70_13330_2012 }] },
  geometry: { default: [{ document: "СП 70.13330.2012", clause: "разд. 5.18, табл. 5.12", tolerance: "Применимость строки таблицы и редакции проверяется для конкретной конструкции", url: REGULATORY_DOCS.SP_70_13330_2012 }] },
  strength: { default: [{ document: "ГОСТ 18105-2018", clause: "разд. 8", tolerance: "Схема, метод и объём контроля; подтверждённое заключение вместо универсальной возрастной кривой", url: REGULATORY_DOCS.GOST_18105_2018 }] }
};
export const REGULATORY_BASIS_MAP = REGULATORY_BASIS;

interface RegulatoryBasisHtmlOptions {
  moduleKey?: string;
  checkKind?: string;
  helpTargetId?: string;
  subtype?: string;
}

export function getRegulatoryBasisEntries(moduleKey, checkKind = "default", subtype = "") {
  const key = moduleKey === "geodesy" ? "geo" : moduleKey;
  const entries = [...(REGULATORY_BASIS[key]?.default || [])];
  const construction = normalizeConstructionKey(checkKind, "");
  if (["foundation_slab", "strip_foundation", "pile_grillage"].includes(construction) && key === "geo") entries.push({
    document: "СП 45.13330.2017", clause: "разд. 12 — для свайных работ", tolerance: "Положение свай оценивается с учётом типа, диаметра и схемы расположения; требуется проверка применимости", url: "https://protect.gost.ru/sp/changesdetails/af748f79-c5de-443b-a10f-7542d35b9bce"
  });
  return entries;
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

