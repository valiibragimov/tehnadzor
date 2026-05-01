import { auth } from "../../firebase.js";
import { runSingleFlight, setButtonBusyState, showNotification } from "../../utils.js";
import {
  ensureChartJsLoaded as ensureSharedChartJsLoaded,
  ensureJsPdfLoaded
} from "../../app/ui/lazy-libs.js";
import { ensurePdfFontLoaded, registerPdfFont } from "../../app/pdf/pdf-font.js";
import {
  getProjectCollectionDocSnapshot,
  getProjectCollectionSnapshot,
  getProjectsByFieldSnapshot,
  getProjectsSnapshot,
  mergeProjectDoc
} from "../../app/repositories/firestore-repository.js";
import {
  QUALITY_INDEX_WEIGHTS,
  clamp,
  escapeHtml,
  formatNumber,
  formatPercent,
  getGradeClass,
  getQualityInterpretation,
  normalizeConstructionName,
  normalizeModuleName,
  normalizeText,
  summarizeMeasurementBreakdown
} from "./analytics-core.js";
import {
  LEGACY_SOURCE_COLLECTIONS,
  MIN_MEASUREMENTS,
  MIN_TREND_CHECKS,
  calculateContractors,
  calculateProjectAnalytics,
  inspectionNeedsLegacySource,
  isInspectionSupportedForAnalytics,
  normalizeContractorInfo,
  rankProjects,
  resolveInspectionSourceCollection,
  resolveInspectionSourceId
} from "./analytics-data.js";

interface SaveProjectContractorOptions {
  showWarning?: boolean;
}

interface AnalyticsPdfTextOptions {
  indent?: number;
  size?: number;
  bold?: boolean;
  lineHeight?: number;
  width?: number;
}

interface ContractorStatePatch {
  contractorId?: string;
  contractorUid?: string;
  contractorName?: string;
}

const PROJECTS_CACHE_TTL_MS = 30_000;
const PROJECT_SOURCES_CACHE_TTL_MS = 45_000;

let projectsChart = null;
let distributionChart = null;
let trendChart = null;
let lastRunId = 0;
let carouselResizeTimer = null;
const contractorSaveInProgress = new Set();
const analyticsProjectsCache = new Map();
const analyticsProjectSourcesCache = new Map();
const analyticsState = {
  ui: null,
  fullList: [],
  ranked: [],
  contractors: [],
  selectedProjectId: "",
  currentPage: 0,
  drilldownProjectId: "",
  selectedConstructionLabel: "",
  selectedModuleLabel: "",
  selectedConstructionRawLabel: "",
  selectedModuleRawLabel: "",
  editingContractorProjectId: ""
};

function getAnalyticsPagerState() {
  return {
    currentPage: analyticsState.currentPage || 0,
    totalPages: Array.isArray(analyticsState.ui?.pages) ? analyticsState.ui.pages.length : 0
  };
}

function getFreshAnalyticsCache(cache, key, ttlMs) {
  const entry = cache.get(key);
  if (!entry) return null;
  if ((Date.now() - entry.timestamp) > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setFreshAnalyticsCache(cache, key, value) {
  cache.set(key, {
    value,
    timestamp: Date.now()
  });
  return value;
}

function invalidateAnalyticsCaches({ userId = "", projectId = "" } = {}) {
  if (userId) {
    analyticsProjectsCache.delete(userId);
  }
  if (projectId) {
    analyticsProjectSourcesCache.delete(projectId);
  }
}

function getCurrentProjectId() {
  return (
    localStorage.getItem("currentProjectId") ||
    localStorage.getItem("current_project_id") ||
    globalThis.currentProjectId ||
    ""
  );
}

function hideStates(ui) {
  ui.loader.hidden = true;
  ui.empty.hidden = true;
  ui.error.hidden = true;
  ui.content.hidden = true;
}

function showLoader(ui) {
  hideStates(ui);
  ui.loader.hidden = false;
}

function showEmpty(ui, message) {
  hideStates(ui);
  ui.empty.textContent = message;
  ui.empty.hidden = false;
}

function showError(ui, message) {
  hideStates(ui);
  ui.error.textContent = message;
  ui.error.hidden = false;
}

function showContent(ui) {
  hideStates(ui);
  ui.content.hidden = false;
}

function destroyCharts() {
  if (projectsChart) {
    projectsChart.destroy();
    projectsChart = null;
  }
  if (distributionChart) {
    distributionChart.destroy();
    distributionChart = null;
  }
  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }
  if (carouselResizeTimer) {
    clearTimeout(carouselResizeTimer);
    carouselResizeTimer = null;
  }
}

async function ensureChartJsLoaded() {
  const loaded = await ensureSharedChartJsLoaded();
  if (!loaded) {
    throw new Error("Не удалось загрузить Chart.js");
  }
}

function getUiElements() {
  const root = document.getElementById("analyticsBlock");
  if (!root) return null;

  return {
    root,
    loader: document.getElementById("analyticsLoader"),
    empty: document.getElementById("analyticsEmpty"),
    error: document.getElementById("analyticsError"),
    content: document.getElementById("analyticsContent"),
    toolbar: root.querySelector(".analytics-toolbar"),
    carousel: root.querySelector(".analytics-carousel"),
    projectSelect: document.getElementById("analyticsProjectSelect"),
    exportPdfBtn: document.getElementById("analyticsExportPdfBtn"),
    prevBtn: document.getElementById("analyticsPrevBtn"),
    nextBtn: document.getElementById("analyticsNextBtn"),
    pageIndicator: document.getElementById("analyticsPageIndicator"),
    dots: document.getElementById("analyticsDots"),
    pagesTrack: document.getElementById("analyticsPagesTrack"),
    pages: Array.from(root.querySelectorAll(".analytics-page")),
    qualityIndex: document.getElementById("analyticsQualityIndex"),
    qualityGrade: document.getElementById("analyticsQualityGrade"),
    qualityInterpretation: document.getElementById("analyticsQualityInterpretation"),
    meanDeviation: document.getElementById("analyticsMeanDeviation"),
    measurementsCount: document.getElementById("analyticsMeasurementsCount"),
    complianceRate: document.getElementById("analyticsComplianceRate"),
    complianceNote: document.getElementById("analyticsComplianceNote"),
    projectsChartCanvas: document.getElementById("analyticsProjectsChart"),
    positionText: document.getElementById("analyticsPositionText"),
    projectsTableBody: document.getElementById("analyticsProjectsTableBody"),
    contractorsGrid: document.getElementById("analyticsContractorsGrid"),
    drilldownSummary: document.getElementById("analyticsDrilldownSummary"),
    constructionTableBody: document.getElementById("analyticsConstructionTableBody"),
    moduleTableBody: document.getElementById("analyticsModuleTableBody"),
    statMean: document.getElementById("analyticsStatMean"),
    statMedian: document.getElementById("analyticsStatMedian"),
    statStdDev: document.getElementById("analyticsStatStdDev"),
    statCv: document.getElementById("analyticsStatCV"),
    recommendationsList: document.getElementById("analyticsRecommendationsList"),
    distributionCanvas: document.getElementById("analyticsDistributionChart"),
    trendCanvas: document.getElementById("analyticsTrendChart"),
    trendNote: document.getElementById("analyticsTrendNote")
  };
}

function medalByRank(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
}

function renderCurrentProject(ui, currentProject) {
  if (!currentProject) return;

  ui.qualityIndex.textContent = formatNumber(currentProject.qualityIndex, 1);
  ui.qualityGrade.textContent = currentProject.grade;
  ui.qualityGrade.className = `analytics-grade-badge ${getGradeClass(currentProject.grade)}`;
  ui.qualityInterpretation.textContent = currentProject.hasData
    ? getQualityInterpretation(currentProject.qualityIndex)
    : "По выбранному объекту пока недостаточно замеров.";

  ui.meanDeviation.textContent = formatPercent(currentProject.meanDeviationPercent, 1);
  ui.measurementsCount.textContent = `Измерений: ${currentProject.measurementCount} • Проверок: ${currentProject.inspectionsCount || 0}`;

  ui.complianceRate.textContent = formatPercent(currentProject.compliancePercent, 1);
  ui.complianceNote.textContent = currentProject.measurementCount > 0
    ? `${currentProject.inToleranceCount} из ${currentProject.measurementCount} в допуске`
    : "Нет данных для расчёта";

  ui.statMean.textContent = formatPercent(currentProject.meanDeviationPercent, 1);
  ui.statMedian.textContent = formatPercent(currentProject.medianDeviationPercent, 1);
  ui.statStdDev.textContent = formatPercent(currentProject.stdDeviationPercent, 1);
  ui.statCv.textContent = formatNumber(currentProject.cv, 2);

  const syncMetricTooltip = (key, text) => {
    const tooltipButton = document.querySelector(`[data-tooltip-key="${key}"]`);
    if (!tooltipButton) return;
    tooltipButton.setAttribute("data-tooltip", text);
    tooltipButton.setAttribute("title", text);
    const tooltipId = tooltipButton.getAttribute("aria-describedby");
    if (!tooltipId) return;
    const tooltipNode = document.getElementById(tooltipId);
    if (tooltipNode) {
      tooltipNode.textContent = text;
    }
  };

  syncMetricTooltip(
    "compliance",
    `Доля замеров, у которых отклонение не превышает допуск. ${formatPercent(currentProject.compliancePercent, 1)} означает, что ${currentProject.inToleranceCount} из ${currentProject.measurementCount} замеров в пределах нормы.`
  );

  syncMetricTooltip(
    "mean",
    "Среднее значение |факт − проект| / допуск по всем замерам, выраженное в процентах. 100% означает что отклонение в среднем равно допуску. Чем меньше значение — тем лучше качество работ."
  );

  syncMetricTooltip(
    "quality",
    `Комплексный балл от 0 до 100. Формула: ${Math.round(QUALITY_INDEX_WEIGHTS.compliance * 100)}% соответствия нормам + ${Math.round(QUALITY_INDEX_WEIGHTS.stability * 100)}% стабильности замеров минус штраф за критические нарушения. Текущее соответствие: ${formatPercent(currentProject.compliancePercent, 1)}. Оценка: ${currentProject.grade}.`
  );
}

function getRecommendationAction(moduleName, constructionName) {
  const module = normalizeModuleName(moduleName, "Прочее");
  const construction = normalizeConstructionName(constructionName, "Не указано");

  if (module === "Геодезия" && construction === "Колонна") {
    return "проверьте установку опалубки и повторите геодезическую выверку осей перед бетонированием.";
  }
  if (module === "Геодезия") {
    return "перепроверьте разбивку осей и фактические координаты по исполнительной схеме.";
  }
  if (module === "Армирование") {
    return "проверьте фиксаторы, шаг арматуры и защитный слой по рабочим чертежам.";
  }
  if (module === "Геометрия") {
    return "усильте контроль геометрии опалубки и допусков перед следующей заливкой.";
  }
  if (module === "Прочность") {
    return "проверьте режим ухода за бетоном и актуальность графика отбора/испытаний.";
  }
  return "проведите повторный контроль проблемного участка и скорректируйте технологический процесс.";
}

function buildSmartRecommendations(project) {
  if (!project || !project.measurementCount) {
    return ["Недостаточно данных для рекомендаций. Добавьте измерения в модулях контроля."];
  }

  const recommendations = [];
  const measurementRows = Array.isArray(project.drilldownMeasurementRows) ? project.drilldownMeasurementRows : [];
  const exceededRows = measurementRows
    .filter((row) => row.exceeded)
    .sort((a, b) => b.relativeDeviation - a.relativeDeviation);

  if (exceededRows.length > 0) {
    const top = exceededRows[0];
    const deviationToToleranceRatio = Number(top.relativeDeviation).toFixed(1);
    recommendations.push(
      `Модуль «${top.module}», конструкция «${top.construction}»: отклонение превышает допуск в ${deviationToToleranceRatio} раз по параметру «${top.parameterName}» — ${getRecommendationAction(top.module, top.construction)}`
    );
  }

  if (project.drilldownExceededCount > 0 && Array.isArray(project.measurementsByConstruction)) {
    const topConstruction = project.measurementsByConstruction.find((item) => item.exceededMeasurements > 0) || null;
    if (topConstruction) {
      const share = (topConstruction.exceededMeasurements / project.drilldownExceededCount) * 100;
      if (share >= 45 && project.drilldownExceededCount >= 3) {
        recommendations.push(
          `${formatPercent(share, 1)} нарушений сосредоточены в конструкции «${topConstruction.label}» — возможна системная проблема на этом типе элементов.`
        );
      }
    }
  }

  if (project.drilldownExceededCount > 0 && Array.isArray(project.measurementsByModule)) {
    const topModule = project.measurementsByModule.find((item) => item.exceededMeasurements > 0) || null;
    if (topModule) {
      const share = (topModule.exceededMeasurements / project.drilldownExceededCount) * 100;
      if (share >= 50 && project.drilldownExceededCount >= 3) {
        recommendations.push(
          `${formatPercent(share, 1)} нарушений приходятся на модуль «${topModule.label}» — стоит провести целевой аудит процесса и чек-листа этого модуля.`
        );
      }
    }
  }

  const meanDev = project.meanDeviationPercent || 0;
  const medianDev = project.medianDeviationPercent || 0;
  if (meanDev >= 8 && medianDev <= meanDev * 0.45) {
    recommendations.push(
      `Медиана ${formatPercent(medianDev, 1)} при среднем ${formatPercent(meanDev, 1)} указывает на единичные грубые нарушения, а не на равномерный системный брак.`
    );
  } else if (meanDev >= 6 && medianDev >= meanDev * 0.8) {
    recommendations.push(
      `Медиана ${formatPercent(medianDev, 1)} близка к среднему ${formatPercent(meanDev, 1)} — отклонения носят системный характер, нужен общий пересмотр технологии.`
    );
  }

  if (project.criticalCount > 0 && project.measurementCount > 0) {
    const criticalShare = (project.criticalCount / project.measurementCount) * 100;
    recommendations.push(
      `Критических нарушений: ${project.criticalCount} (${formatPercent(criticalShare, 1)} от всех замеров) — закройте их в первую очередь до следующих этапов работ.`
    );
  }

  if (Array.isArray(project.qualityTrend) && project.qualityTrend.length >= 2) {
    const first = project.qualityTrend[0];
    const last = project.qualityTrend[project.qualityTrend.length - 1];
    const delta = last.qualityIndex - first.qualityIndex;
    if (delta <= -4) {
      recommendations.push(
        `Индекс качества по тренду снижается на ${formatNumber(Math.abs(delta), 1)} п.п. — усилите входной контроль и повторную проверку перед сдачей этапа.`
      );
    } else if (delta >= 4) {
      recommendations.push(
        `Индекс качества растёт на ${formatNumber(delta, 1)} п.п. — закрепите текущие меры и перенесите практику на проблемные участки.`
      );
    }
  }

  if (!recommendations.length) {
    recommendations.push("Значимых отклонений не обнаружено. Поддерживайте текущий режим контроля и выборочный повторный мониторинг.");
  }

  return recommendations.slice(0, 5);
}

function renderSmartRecommendations(ui, currentProject) {
  if (!ui.recommendationsList) return;

  const recommendations = buildSmartRecommendations(currentProject);
  ui.recommendationsList.innerHTML = recommendations
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function getDrilldownRiskClass(exceededRate) {
  if (exceededRate >= 30) return "analytics-drilldown-risk-high";
  if (exceededRate > 0) return "analytics-drilldown-risk-medium";
  return "analytics-drilldown-risk-low";
}

function buildDrilldownDetailsHtml(currentProject, mode, selectedLabel) {
  const allRows = currentProject?.drilldownMeasurementRows || [];
  const primaryField = mode === "construction" ? "construction" : "module";
  const secondaryField = mode === "construction" ? "module" : "construction";
  const secondaryTitle = mode === "construction" ? "модулям" : "конструкциям";
  const secondaryColumnTitle = mode === "construction" ? "Модуль" : "Конструкция";

  const filtered = allRows.filter((row) => row?.[primaryField] === selectedLabel);
  if (!filtered.length) {
    return "<div class=\"analytics-drilldown-muted\">Нет данных для детализации.</div>";
  }

  const secondaryRows = summarizeMeasurementBreakdown(filtered, secondaryField, "Не указано");
  const topExceeded = filtered
    .filter((row) => row.exceeded)
    .sort((a, b) => b.relativeDeviation - a.relativeDeviation)
    .slice(0, 8);

  const secondaryRowsHtml = secondaryRows.length
    ? secondaryRows.map((item) => `
      <tr class="${item.exceededMeasurements > 0 ? "analytics-drilldown-has-issues" : ""}">
        <td>${escapeHtml(item.label)}</td>
        <td>${item.totalMeasurements}</td>
        <td>${item.exceededMeasurements}</td>
        <td>${formatPercent(item.exceededRate, 1)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="analytics-drilldown-empty">Нет данных</td></tr>`;

  const exceededHtml = topExceeded.length
    ? `<ul class="analytics-drilldown-list">
      ${topExceeded.map((item) => `
        <li>
          <strong>${escapeHtml(item.parameterName)}</strong>
          <span>${escapeHtml(item.module)} / ${escapeHtml(item.construction)} • ${item.relativeDeviation <= 1
            ? `в допуске (${formatPercent(item.relativeDeviation * 100, 1)})`
            : `превышает допуск в ${item.relativeDeviation.toFixed(1)} раз`}</span>
        </li>
      `).join("")}
    </ul>`
    : "<div class=\"analytics-drilldown-muted\">Нарушений по выбранной строке нет.</div>";

  return `
    <div class="analytics-drilldown-detail">
      <div class="analytics-drilldown-detail-title">
        Детализация «${escapeHtml(selectedLabel)}» по ${secondaryTitle}
      </div>
      <div class="analytics-drilldown-detail-grid">
        <div class="analytics-drilldown-detail-block">
          <div class="analytics-drilldown-detail-caption">Разбивка</div>
          <div class="analytics-table-wrap analytics-drilldown-subtable-wrap">
            <table class="analytics-drilldown-subtable">
              <thead>
                <tr>
                  <th>${secondaryColumnTitle}</th>
                  <th>Замеров</th>
                  <th>Нарушений</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>${secondaryRowsHtml}</tbody>
            </table>
          </div>
        </div>
        <div class="analytics-drilldown-detail-block">
          <div class="analytics-drilldown-detail-caption">Топ отклонений</div>
          ${exceededHtml}
        </div>
      </div>
    </div>
  `;
}

function renderBreakdownTable({
  tableBody,
  rows,
  emptyText,
  selectedLabel,
  onToggle,
  detailHtmlResolver
}) {
  if (!tableBody) return;

  if (!Array.isArray(rows) || rows.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td class="analytics-drilldown-empty" colspan="4">${escapeHtml(emptyText)}</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = rows.map((item) => {
    const hasIssues = item.exceededMeasurements > 0;
    const isSelected = selectedLabel === item.label;
    const detailLabel = item.rawLabel || item.label;
    const riskClass = getDrilldownRiskClass(item.exceededRate);
    const rowClass = [
      "analytics-drilldown-row",
      riskClass,
      hasIssues ? "analytics-drilldown-has-issues" : "",
      isSelected ? "analytics-drilldown-selected" : ""
    ].filter(Boolean).join(" ");

    const detailsRow = isSelected && typeof detailHtmlResolver === "function"
      ? `<tr class="analytics-drilldown-detail-row"><td colspan="4">${detailHtmlResolver(detailLabel)}</td></tr>`
      : "";

    return `
      <tr class="${rowClass}">
        <td>
          <button type="button" class="analytics-drilldown-trigger" data-label="${escapeHtml(item.label)}" data-raw-label="${escapeHtml(item.rawLabel || item.label)}" aria-expanded="${isSelected ? "true" : "false"}">
            <span class="analytics-drilldown-chevron">${isSelected ? "▾" : "▸"}</span>
            <span>${escapeHtml(item.label)}</span>
          </button>
        </td>
        <td>${item.totalMeasurements}</td>
        <td>${item.exceededMeasurements} (${formatPercent(item.exceededRate, 1)})</td>
        <td>${formatPercent(item.exceededRate, 1)}</td>
      </tr>
      ${detailsRow}
    `;
  }).join("");

  if (typeof onToggle === "function") {
    tableBody.querySelectorAll(".analytics-drilldown-trigger[data-label]").forEach((button) => {
      button.addEventListener("click", () => {
        const label = button.getAttribute("data-label") || "";
        const rawLabel = button.getAttribute("data-raw-label") || label;
        onToggle(label, rawLabel);
      });
    });
  }
}

function renderProjectDrilldown(ui, currentProject) {
  if (!currentProject) return;

  if (analyticsState.drilldownProjectId !== currentProject.projectId) {
    analyticsState.drilldownProjectId = currentProject.projectId;
    analyticsState.selectedConstructionLabel = "";
    analyticsState.selectedModuleLabel = "";
    analyticsState.selectedConstructionRawLabel = "";
    analyticsState.selectedModuleRawLabel = "";
  }

  const byConstruction = currentProject.measurementsByConstruction || [];
  const byModule = currentProject.measurementsByModule || [];

  if (!byConstruction.some((item) => item.label === analyticsState.selectedConstructionLabel)) {
    analyticsState.selectedConstructionLabel = "";
  }
  if (!byModule.some((item) => item.label === analyticsState.selectedModuleLabel)) {
    analyticsState.selectedModuleLabel = "";
  }

  renderBreakdownTable({
    tableBody: ui.constructionTableBody,
    rows: byConstruction,
    emptyText: "Нет данных по конструкциям.",
    selectedLabel: analyticsState.selectedConstructionLabel,
    onToggle: (label, rawLabel) => {
      analyticsState.selectedConstructionLabel =
        analyticsState.selectedConstructionLabel === label ? "" : label;
      analyticsState.selectedConstructionRawLabel =
        analyticsState.selectedConstructionLabel ? (rawLabel || label) : "";
      renderProjectDrilldown(ui, currentProject);
    },
    detailHtmlResolver: (label) => buildDrilldownDetailsHtml(
      currentProject, "construction", analyticsState.selectedConstructionRawLabel || label
    )
  });

  renderBreakdownTable({
    tableBody: ui.moduleTableBody,
    rows: byModule,
    emptyText: "Нет данных по модулям.",
    selectedLabel: analyticsState.selectedModuleLabel,
    onToggle: (label, rawLabel) => {
      analyticsState.selectedModuleLabel =
        analyticsState.selectedModuleLabel === label ? "" : label;
      analyticsState.selectedModuleRawLabel =
        analyticsState.selectedModuleLabel ? (rawLabel || label) : "";
      renderProjectDrilldown(ui, currentProject);
    },
    detailHtmlResolver: (label) => buildDrilldownDetailsHtml(
      currentProject, "module", analyticsState.selectedModuleRawLabel || label
    )
  });

  if (!ui.drilldownSummary) return;

  const totalMeasurements = currentProject.drilldownMeasurementsCount || 0;
  const exceededMeasurements = currentProject.drilldownExceededCount || 0;
  if (totalMeasurements === 0) {
    ui.drilldownSummary.textContent = "Недостаточно данных: нет замеров для детализации.";
    return;
  }

  const failureRate = (exceededMeasurements / totalMeasurements) * 100;
  const topConstruction = byConstruction.find((item) => item.exceededMeasurements > 0) || null;
  const topModule = byModule.find((item) => item.exceededMeasurements > 0) || null;

  const summaryParts = [
    `Замеров: ${totalMeasurements}`,
    `нарушений: ${exceededMeasurements} (${formatPercent(failureRate, 1)})`
  ];

  if (topConstruction) {
    summaryParts.push(`самая проблемная конструкция: «${topConstruction.label}» (${topConstruction.exceededMeasurements})`);
  }
  if (topModule) {
    summaryParts.push(`самый проблемный модуль: «${topModule.label}» (${topModule.exceededMeasurements})`);
  }

  ui.drilldownSummary.textContent = summaryParts.join(" • ");

  // После раскрытия/сворачивания деталей пересчитываем высоту активной страницы,
  // чтобы контент не обрезался каруселью.
  requestAnimationFrame(() => {
    updateCarouselHeight(ui);
  });
}

function renderPositionText(ui, currentProject, rankedProjectsLength) {
  if (!currentProject || !currentProject.rank || rankedProjectsLength === 0) {
    ui.positionText.textContent = "Выбранный объект пока не ранжирован: недостаточно измерений.";
    return;
  }

  const percentile = Math.round((currentProject.rank / rankedProjectsLength) * 100);
  ui.positionText.textContent = `${currentProject.rank} место из ${rankedProjectsLength} объектов (${percentile}-й перцентиль)`;
}

function isProjectContractorMissing(project) {
  if (!project) return true;
  if (project.contractorUnknown) return true;

  const contractorName = String(project.contractorName || "").trim();
  if (!contractorName) return true;

  const normalized = normalizeText(contractorName);
  return normalized === "не указан" || normalized.startsWith("не указан");
}

function startProjectContractorEdit(projectId) {
  const safeProjectId = String(projectId || "").trim();
  if (!safeProjectId || contractorSaveInProgress.has(safeProjectId)) return;
  analyticsState.editingContractorProjectId = safeProjectId;
  renderAnalyticsSelection();

  requestAnimationFrame(() => {
    const input = getContractorInputByProjectId(analyticsState.ui?.projectsTableBody, safeProjectId);
    if (input) {
      input.focus();
      input.select();
    }
  });
}

function cancelProjectContractorEdit() {
  analyticsState.editingContractorProjectId = "";
  renderAnalyticsSelection();
}

function getProjectContractorDisplayHtml(project) {
  const isEditing = analyticsState.editingContractorProjectId === project.projectId;
  const isBusy = contractorSaveInProgress.has(project.projectId);
  const isMissing = isProjectContractorMissing(project);
  const currentName = String(project.contractorName || "").trim();

  if (isEditing) {
    return `
      <div class="analytics-inline-editor" data-inline-editor>
        <input
          type="text"
          class="analytics-inline-input"
          data-contractor-input="${escapeHtml(project.projectId)}"
          data-contractor-original="${escapeHtml(currentName)}"
          value="${escapeHtml(currentName)}"
          placeholder="Введите подрядчика"
          maxlength="120"
          ${isBusy ? "disabled" : ""}
        />
      </div>
    `;
  }

  return `
    <div class="analytics-contractor-inline" data-inline-editor>
      <span
        class="analytics-contractor-inline-text analytics-contractor-inline-text-action${isMissing ? " analytics-missing-contractor" : ""}${isBusy ? " analytics-contractor-inline-text-busy" : ""}"
        data-start-contractor="${escapeHtml(project.projectId)}"
        role="button"
        tabindex="0"
        title="${isMissing ? "Указать подрядчика" : "Изменить подрядчика"}"
        aria-label="${isMissing ? "Указать подрядчика" : "Изменить подрядчика"}"
      >
        ${escapeHtml(isMissing ? "Не указан" : currentName)}
      </span>
      ${isBusy ? '<span class="analytics-contractor-inline-pending">...</span>' : ""}
    </div>
  `;
}

async function saveProjectContractor(projectId, contractorNameValue) {
  const safeProjectId = String(projectId || "").trim();
  if (!safeProjectId || contractorSaveInProgress.has(safeProjectId)) return;
  const currentUserId = String(auth.currentUser?.uid || "").trim();

  const project = analyticsState.fullList.find((item) => item.projectId === safeProjectId);
  if (!project) {
    showNotification("Не удалось найти объект для обновления подрядчика.", "error");
    return;
  }

  const normalizedName = String(contractorNameValue || "").trim();
  if (normalizedName.length < 2) {
    showNotification("Укажите корректное имя подрядчика (минимум 2 символа).", "warning");
    return;
  }

  contractorSaveInProgress.add(safeProjectId);
  analyticsState.editingContractorProjectId = safeProjectId;
  renderAnalyticsSelection();

  try {
    await mergeProjectDoc(safeProjectId, {
      contractorName: normalizedName
    });

    invalidateAnalyticsCaches({
      userId: currentUserId,
      projectId: safeProjectId
    });
    refreshAnalyticsAfterContractorChange(safeProjectId, {
      contractorName: normalizedName
    });
    showNotification("Подрядчик обновлён.", "success");
  } catch (error) {
    console.error("[Analytics] contractor update failed", error);
    showNotification(`Не удалось обновить подрядчика: ${error.message || "неизвестная ошибка"}`, "error");
  } finally {
    contractorSaveInProgress.delete(safeProjectId);
    renderAnalyticsSelection();
  }
}

async function removeProjectContractor(projectId) {
  const safeProjectId = String(projectId || "").trim();
  if (!safeProjectId || contractorSaveInProgress.has(safeProjectId)) return;
  const currentUserId = String(auth.currentUser?.uid || "").trim();

  const project = analyticsState.fullList.find((item) => item.projectId === safeProjectId);
  if (!project) {
    showNotification("Не удалось найти объект для удаления подрядчика.", "error");
    return;
  }

  contractorSaveInProgress.add(safeProjectId);
  analyticsState.editingContractorProjectId = "";
  renderAnalyticsSelection();

  try {
    await mergeProjectDoc(safeProjectId, {
      contractorName: "",
      contractorId: "",
      contractorUid: "",
      contractor: {
        id: "",
        name: ""
      }
    });

    invalidateAnalyticsCaches({
      userId: currentUserId,
      projectId: safeProjectId
    });
    refreshAnalyticsAfterContractorChange(safeProjectId, {
      contractorName: "",
      contractorId: "",
      contractorUid: ""
    });
    showNotification("Подрядчик удалён.", "success");
  } catch (error) {
    console.error("[Analytics] contractor remove failed", error);
    showNotification(`Не удалось удалить подрядчика: ${error.message || "неизвестная ошибка"}`, "error");
  } finally {
    contractorSaveInProgress.delete(safeProjectId);
    renderAnalyticsSelection();
  }
}

function finalizeProjectContractorEdit(projectId, nextValue, originalValue, options: SaveProjectContractorOptions = {}) {
  const safeProjectId = String(projectId || "").trim();
  if (!safeProjectId || contractorSaveInProgress.has(safeProjectId)) return;

  const normalizedNext = String(nextValue || "").trim();
  const normalizedOriginal = String(originalValue || "").trim();

  if (normalizedNext === normalizedOriginal) {
    cancelProjectContractorEdit();
    return;
  }

  if (!normalizedNext) {
    if (normalizedOriginal) {
      removeProjectContractor(safeProjectId);
    } else {
      cancelProjectContractorEdit();
    }
    return;
  }

  if (normalizedNext.length < 2) {
    if (options.showWarning) {
      showNotification("Укажите корректное имя подрядчика (минимум 2 символа).", "warning");
    }
    cancelProjectContractorEdit();
    return;
  }

  saveProjectContractor(safeProjectId, normalizedNext);
}

function getContractorInputByProjectId(container, projectId) {
  if (!container || !projectId) return null;
  const inputs = container.querySelectorAll("input[data-contractor-input]");
  for (const input of inputs) {
    if (input.getAttribute("data-contractor-input") === projectId) {
      return input;
    }
  }
  return null;
}

function renderProjectsTable(ui, projects, currentProjectId, selectedProjectId) {
  ui.projectsTableBody.innerHTML = "";

  const rowsHtml = projects.map((project) => {
    const isCurrent = project.projectId === currentProjectId;
    const isSelected = project.projectId === selectedProjectId;
    const rankLabel = project.rank
      ? `${medalByRank(project.rank) ? `<span class="analytics-medal">${medalByRank(project.rank)}</span>` : ""}${project.rank}`
      : "—";
    const rowNotes = [];
    if (isSelected) rowNotes.push("<span class=\"analytics-selected-note\">(выбран)</span>");
    if (isCurrent) rowNotes.push("<span class=\"analytics-current-note\">(текущий)</span>");
    const notesHtml = rowNotes.length > 0 ? ` ${rowNotes.join(" ")}` : "";
    const deviation = project.hasData ? formatPercent(project.meanDeviationPercent, 1) : "—";
    const compliance = project.hasData ? formatPercent(project.compliancePercent, 1) : "—";

    return `
      <tr class="${isCurrent ? "analytics-row-current" : ""} ${isSelected ? "analytics-row-selected" : ""}" data-project-id="${escapeHtml(project.projectId)}">
        <td>${rankLabel}</td>
        <td>${escapeHtml(project.projectName)}${notesHtml}</td>
        <td>${getProjectContractorDisplayHtml(project)}</td>
        <td>${deviation}</td>
        <td>${project.inspectionsCount}</td>
        <td>${compliance}</td>
        <td><span class="analytics-grade ${getGradeClass(project.grade)}">${project.grade}</span></td>
      </tr>
    `;
  }).join("");

  ui.projectsTableBody.innerHTML = rowsHtml;
  ui.projectsTableBody.querySelectorAll("tr[data-project-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const nextId = row.getAttribute("data-project-id");
      if (!nextId || analyticsState.selectedProjectId === nextId) return;
      analyticsState.selectedProjectId = nextId;
      renderAnalyticsSelection();
    });
  });

  ui.projectsTableBody.querySelectorAll("[data-start-contractor]").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const targetProjectId = trigger.getAttribute("data-start-contractor");
      if (!targetProjectId) return;
      startProjectContractorEdit(targetProjectId);
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      const targetProjectId = trigger.getAttribute("data-start-contractor");
      if (!targetProjectId) return;
      startProjectContractorEdit(targetProjectId);
    });
  });

  ui.projectsTableBody.querySelectorAll("input[data-contractor-input]").forEach((input) => {
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    input.addEventListener("blur", () => {
      const targetProjectId = input.getAttribute("data-contractor-input");
      if (!targetProjectId) return;
      const originalValue = input.getAttribute("data-contractor-original") || "";
      finalizeProjectContractorEdit(targetProjectId, input.value || "", originalValue, { showWarning: false });
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const targetProjectId = input.getAttribute("data-contractor-input");
        if (!targetProjectId) return;
        const originalValue = input.getAttribute("data-contractor-original") || "";
        finalizeProjectContractorEdit(targetProjectId, input.value || "", originalValue, { showWarning: true });
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelProjectContractorEdit();
      }
    });
  });

  ui.projectsTableBody.querySelectorAll("[data-inline-editor]").forEach((editor) => {
    editor.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });
}

function renderContractors(ui, contractors, selectedProject = null) {
  if (!contractors.length) {
    ui.contractorsGrid.innerHTML = "<div class=\"analytics-state\">Нет данных по подрядчикам.</div>";
    return;
  }

  const selectedGroupKey = selectedProject?.contractorGroupKey || "";
  const knownContractors = contractors.filter((contractor) => !contractor.contractorUnknown);
  const unknownCount = contractors.length - knownContractors.length;

  const notes = [];
  if (knownContractors.length < 2) {
    notes.push("Сравнение ограничено: для корректного рейтинга нужно минимум 2 подрядчика с заполненными данными.");
  }
  if (unknownCount > 0) {
    notes.push(`${unknownCount} объект(ов) имеют неполные данные подрядчика и показаны отдельно.`);
  }

  const summaryHtml = notes.length
    ? `<div class="analytics-contractors-note">${notes.map((note) => `<div>${escapeHtml(note)}</div>`).join("")}</div>`
    : "";

  const cardsHtml = contractors.map((contractor) => {
    const medal = contractor.rank && contractor.rank <= 3 ? ["🥇", "🥈", "🥉"][contractor.rank - 1] : "";
    const isSelectedContractor = selectedGroupKey && selectedProject?.contractorGroupKey === contractor.contractorGroupKey;
    const selectedClass = isSelectedContractor ? " analytics-contractor-selected" : "";
    const displayName = contractor.contractorName;

    return `
      <article class="analytics-contractor-card${selectedClass}">
        <div class="analytics-contractor-header">
          <div class="analytics-contractor-name">${medal ? `${medal} ` : ""}${escapeHtml(displayName)}</div>
          <span class="analytics-grade ${getGradeClass(contractor.grade)}">${contractor.grade}</span>
        </div>
        <div class="analytics-contractor-stats">
          <span>Количество объектов: ${contractor.objectsCount}</span>
          <span>Измерений: ${contractor.totalMeasurements}</span>
          <span>Ср. отклонение: ${formatPercent(contractor.avgMeanDeviationPercent, 1)}</span>
          <span>Соответствие нормам: ${formatPercent(contractor.avgCompliancePercent, 1)}</span>
          <span>Индекс качества: ${formatNumber(contractor.avgQualityIndex, 1)}</span>
          <span>Достоверность: ${contractor.confidence}</span>
        </div>
      </article>
    `;
  }).join("");

  ui.contractorsGrid.innerHTML = `${summaryHtml}${cardsHtml}`;
}

function populateProjectSelect(ui, projects, selectedProjectId, currentProjectId) {
  if (!ui.projectSelect) return;

  const selected = projects.some((project) => project.projectId === selectedProjectId)
    ? selectedProjectId
    : (projects[0]?.projectId || "");

  ui.projectSelect.innerHTML = projects.map((project) => {
    const tags = [];
    if (project.projectId === currentProjectId) tags.push("текущий");
    if (!project.hasData) tags.push("нет данных");
    const suffix = tags.length ? ` [${tags.join(", ")}]` : "";
    return `<option value="${escapeHtml(project.projectId)}">${escapeHtml(project.projectName)}${suffix}</option>`;
  }).join("");

  ui.projectSelect.value = selected;
}

function renderCarouselDots(ui) {
  if (!ui?.dots) return;
  ui.dots.innerHTML = "";
}

function updateCarouselHeight(ui) {
  if (!ui?.carousel || !ui?.pages || ui.pages.length === 0) return;
  if (window.matchMedia?.("(max-width: 768px)").matches) {
    ui.carousel.style.height = "";
    return;
  }
  const activePage = ui.pages[analyticsState.currentPage];
  if (!activePage) return;

  const height = activePage.offsetHeight;
  if (height > 0) {
    ui.carousel.style.height = `${height}px`;
  }
}

function syncAnalyticsToolbarPlacement(ui) {
  if (!ui?.toolbar || !ui?.carousel || !ui?.content || !ui?.pages?.length) return;
  const isMobile = window.matchMedia?.("(max-width: 768px)").matches;
  const firstPage = ui.pages[0];

  if (isMobile) {
    if (firstPage && ui.toolbar.parentElement !== firstPage) {
      firstPage.prepend(ui.toolbar);
    }
    return;
  }

  if (ui.toolbar.parentElement !== ui.content || ui.toolbar.nextElementSibling !== ui.carousel) {
    ui.content.insertBefore(ui.toolbar, ui.carousel);
  }
}

function getChartCanvasSize(canvas) {
  const wrap = canvas?.closest?.(".analytics-chart-wrap");
  const wrapRect = wrap?.getBoundingClientRect?.();
  const canvasRect = canvas?.getBoundingClientRect?.();
  const width = Math.floor(wrapRect?.width || canvasRect?.width || 0);
  const height = Math.floor(canvasRect?.height || 0);
  return { width, height };
}

function resizeChartToCanvas(chart, canvas) {
  if (!chart || !canvas) return;
  const { width, height } = getChartCanvasSize(canvas);
  if (width > 0 && height > 0) {
    chart.resize(width, height);
    return;
  }
  chart.resize();
}

function resizeAnalyticsCharts() {
  requestAnimationFrame(() => {
    const ui = analyticsState.ui;
    resizeChartToCanvas(projectsChart, ui?.projectsChartCanvas);
    resizeChartToCanvas(distributionChart, ui?.distributionCanvas);
    resizeChartToCanvas(trendChart, ui?.trendCanvas);
    requestAnimationFrame(() => {
      resizeChartToCanvas(distributionChart, ui?.distributionCanvas);
      resizeChartToCanvas(trendChart, ui?.trendCanvas);
    });
  });
}

function syncCarouselUi(ui) {
  if (!ui?.pagesTrack || !ui?.pages || ui.pages.length === 0) return;

  const maxPage = ui.pages.length - 1;
  analyticsState.currentPage = clamp(analyticsState.currentPage, 0, maxPage);
  ui.pagesTrack.style.transform = window.matchMedia?.("(max-width: 768px)").matches
    ? "none"
    : `translateX(-${analyticsState.currentPage * 100}%)`;

  if (ui.prevBtn) ui.prevBtn.disabled = analyticsState.currentPage <= 0;
  if (ui.nextBtn) ui.nextBtn.disabled = analyticsState.currentPage >= maxPage;
  if (ui.pageIndicator) {
    ui.pageIndicator.textContent = `${analyticsState.currentPage + 1} / ${ui.pages.length}`;
  }

  if (carouselResizeTimer) {
    clearTimeout(carouselResizeTimer);
  }

  const projectsChartPageIndex = ui.projectsChartCanvas
    ? ui.pages.findIndex((page) => page.contains(ui.projectsChartCanvas))
    : -1;
  const distributionPageIndex = ui.distributionCanvas
    ? ui.pages.findIndex((page) => page.contains(ui.distributionCanvas))
    : -1;
  const trendPageIndex = ui.trendCanvas
    ? ui.pages.findIndex((page) => page.contains(ui.trendCanvas))
    : -1;

  carouselResizeTimer = setTimeout(() => {
    updateCarouselHeight(ui);
    if (analyticsState.currentPage === projectsChartPageIndex && projectsChart) {
      projectsChart.resize();
    }
    if (analyticsState.currentPage === distributionPageIndex && distributionChart) {
      distributionChart.resize();
    }
    if (analyticsState.currentPage === trendPageIndex && trendChart) {
      trendChart.resize();
    }
    resizeAnalyticsCharts();
  }, 180);
}

function setAnalyticsPage(ui, nextPage) {
  const maxPage = Array.isArray(ui?.pages) ? Math.max(ui.pages.length - 1, 0) : 0;
  analyticsState.currentPage = clamp(Number.isFinite(nextPage) ? nextPage : 0, 0, maxPage);
  syncCarouselUi(ui);
}

export function setAnalyticsWorkspacePage(nextPage) {
  if (!analyticsState.ui) return;
  setAnalyticsPage(analyticsState.ui, nextPage);
}

export function getAnalyticsWorkspaceState() {
  return getAnalyticsPagerState();
}

function getSelectedAnalyticsProject() {
  return (
    analyticsState.fullList.find((item) => item.projectId === analyticsState.selectedProjectId) ||
    analyticsState.ranked[0] ||
    analyticsState.fullList[0] ||
    null
  );
}

function sanitizePdfFilePart(value, maxLength = 36) {
  const normalized = String(value || "")
    .replace(/[^a-zA-Zа-яА-Я0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();

  if (!normalized) return "объект";
  return normalized.slice(0, maxLength);
}

function formatDateForFileName(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getAnalyticsPdfFlightKey() {
  const selectedProject = getSelectedAnalyticsProject();
  const projectId = String(selectedProject?.projectId || analyticsState.selectedProjectId || "no-project")
    .trim() || "no-project";
  return `analytics-export-pdf:${projectId}`;
}

async function exportAnalyticsPdf() {
  const ui = analyticsState.ui;

  await runSingleFlight(getAnalyticsPdfFlightKey(), async () => {
    const selectedProject = getSelectedAnalyticsProject();
    if (!selectedProject) {
      showNotification("Нет данных для экспорта PDF.", "warning");
      return;
    }

    try {
      setButtonBusyState(ui?.exportPdfBtn, true, { busyLabel: "Экспорт..." });

      const jsPdfReady = await ensureJsPdfLoaded();
      if (!jsPdfReady || !window.jspdf || !window.jspdf.jsPDF) {
        showNotification("jsPDF не загружен. Экспорт PDF недоступен.", "warning");
        return;
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const fontReady = await ensurePdfFontLoaded();
      const pdfFontLoaded = fontReady ? registerPdfFont(doc) : false;
      if (!pdfFontLoaded) {
        showNotification("Шрифт для PDF не загружен. Кириллица может отображаться некорректно.", "warning");
      }

      const pageLeft = 14;
      const pageRight = 196;
      const pageBottom = 282;
      const contentWidth = pageRight - pageLeft;
      let y = 16;

      const applyFont = (size = 10, bold = false) => {
        doc.setFontSize(size);
        if (pdfFontLoaded) {
          doc.setFont("Roboto", "normal");
        } else {
          doc.setFont("helvetica", bold ? "bold" : "normal");
        }
      };

      const ensureSpace = (heightNeeded = 6) => {
        if (y + heightNeeded <= pageBottom) return;
        doc.addPage();
        y = 16;
        if (pdfFontLoaded) {
          doc.setFont("Roboto", "normal");
        }
      };

      const drawWrapped = (text, options: AnalyticsPdfTextOptions = {}) => {
        const {
          indent = 0,
          size = 10,
          bold = false,
          lineHeight = 5,
          width = contentWidth - indent
        } = options;

        applyFont(size, bold);
        const safeText = text == null ? "—" : String(text);
        const lines = doc.splitTextToSize(safeText, Math.max(20, width));
        lines.forEach((line) => {
          ensureSpace(lineHeight);
          doc.text(line, pageLeft + indent, y);
          y += lineHeight;
        });
      };

      const drawSectionTitle = (title) => {
        y += 2;
        drawWrapped(title, { size: 12, bold: true, lineHeight: 6 });
        y += 1;
      };

      const drawTable = (headers, rows, widths = []) => {
        const colCount = headers.length;
        if (!colCount) return;

        const totalDefined = widths.reduce((sum, value) => sum + (Number(value) || 0), 0);
        const defaultWidth = contentWidth / colCount;
        const columnWidths = headers.map((_, index) => {
          if (totalDefined > 0 && Number(widths[index]) > 0) {
            return (Number(widths[index]) / totalDefined) * contentWidth;
          }
          return defaultWidth;
        });

        const drawRow = (cells, isHeader = false) => {
          const textPaddingX = 1.4;
          const lineHeight = 4.1;
          const wrappedCells = cells.map((cell, index) => {
            const width = Math.max(16, columnWidths[index] - textPaddingX * 2);
            return doc.splitTextToSize(String(cell ?? ""), width);
          });
          const maxLines = Math.max(...wrappedCells.map((lines) => Math.max(lines.length, 1)));
          const rowHeight = Math.max(6.8, maxLines * lineHeight + 2);

          ensureSpace(rowHeight + 1);
          let x = pageLeft;
          columnWidths.forEach((width, index) => {
            doc.rect(x, y, width, rowHeight);
            applyFont(isHeader ? 9.3 : 9, isHeader);
            const lines = wrappedCells[index].length ? wrappedCells[index] : [""];
            lines.forEach((line, lineIndex) => {
              doc.text(line, x + textPaddingX, y + 4 + lineIndex * lineHeight);
            });
            x += width;
          });
          y += rowHeight;
        };

        drawRow(headers, true);
        rows.forEach((row) => drawRow(row, false));
      };

      const tryDrawCanvasImage = (canvas, title) => {
        if (!canvas || canvas.hidden) return;
        let imageData = "";
        try {
          imageData = canvas.toDataURL("image/png");
        } catch (error) {
          console.warn("[Analytics] Canvas export failed:", error);
          return;
        }
        if (!imageData || !imageData.startsWith("data:image")) return;

        drawWrapped(title, { size: 10, bold: true, lineHeight: 5 });
        const ratio = canvas.width > 0 && canvas.height > 0 ? (canvas.height / canvas.width) : 0.56;
        const imageHeight = clamp(contentWidth * ratio, 48, 112);
        ensureSpace(imageHeight + 3);
        doc.addImage(imageData, "PNG", pageLeft, y, contentWidth, imageHeight);
        y += imageHeight + 3;
      };

      const generatedAt = new Date();
      applyFont(16, true);
      doc.text("Аналитика качества объекта", (pageLeft + pageRight) / 2, y, { align: "center" });
      y += 7;
      doc.setLineWidth(0.45);
      doc.line(pageLeft, y, pageRight, y);
      y += 7;

      drawSectionTitle("1. Ключевые показатели");
      drawWrapped(`Объект: ${selectedProject.projectName}`);
      drawWrapped(`Дата выгрузки: ${generatedAt.toLocaleString("ru-RU")}`);
      drawWrapped(`Индекс качества: ${formatNumber(selectedProject.qualityIndex, 1)} (${selectedProject.grade})`);
      drawWrapped(`Интерпретация: ${getQualityInterpretation(selectedProject.qualityIndex)}`);
      drawWrapped(`Среднее отклонение: ${formatPercent(selectedProject.meanDeviationPercent, 1)}`);
      drawWrapped(`Соответствие нормам: ${formatPercent(selectedProject.compliancePercent, 1)} (${selectedProject.inToleranceCount} из ${selectedProject.measurementCount})`);
      drawWrapped(`Проверок: ${selectedProject.inspectionsCount}; замеров: ${selectedProject.measurementCount}`);

      drawSectionTitle("2. Drill-down по конструкциям и модулям");
      const constructionRows = (selectedProject.measurementsByConstruction || []).map((item) => ([
        item.label,
        item.totalMeasurements,
        `${item.exceededMeasurements} (${formatPercent(item.exceededRate, 1)})`,
        formatPercent(item.exceededRate, 1)
      ]));
      if (constructionRows.length) {
        drawWrapped("По конструкциям", { size: 10, bold: true, lineHeight: 5 });
        drawTable(
          ["Конструкция", "Замеров", "Нарушений", "% нарушений"],
          constructionRows,
          [38, 16, 24, 18]
        );
      } else {
        drawWrapped("По конструкциям: нет данных.", { size: 10, lineHeight: 5 });
      }

      y += 2;
      const moduleRows = (selectedProject.measurementsByModule || []).map((item) => ([
        item.label,
        item.totalMeasurements,
        `${item.exceededMeasurements} (${formatPercent(item.exceededRate, 1)})`,
        formatPercent(item.exceededRate, 1)
      ]));
      if (moduleRows.length) {
        drawWrapped("По модулям", { size: 10, bold: true, lineHeight: 5 });
        drawTable(
          ["Модуль", "Замеров", "Нарушений", "% нарушений"],
          moduleRows,
          [34, 16, 24, 18]
        );
      } else {
        drawWrapped("По модулям: нет данных.", { size: 10, lineHeight: 5 });
      }

      drawSectionTitle("3. Выводы и рекомендации");
      const recommendations = buildSmartRecommendations(selectedProject);
      recommendations.forEach((item) => {
        drawWrapped(`- ${item}`, { size: 10, lineHeight: 5 });
      });

      drawSectionTitle("4. Динамика во времени");
      const trend = Array.isArray(selectedProject.qualityTrend) ? selectedProject.qualityTrend : [];
      if (trend.length < MIN_TREND_CHECKS) {
        drawWrapped(`Для отображения тренда необходимо минимум ${MIN_TREND_CHECKS} проверок. Сейчас: ${trend.length}.`);
      } else {
        const first = trend[0];
        const last = trend[trend.length - 1];
        const delta = last.qualityIndex - first.qualityIndex;
        const direction = delta > 0.5 ? "растёт" : (delta < -0.5 ? "снижается" : "стабилен");
        drawWrapped(`Проверок в тренде: ${trend.length}. Индекс качества ${direction} (изменение ${formatNumber(delta, 1)} п.п.).`);

        const trendRows = trend.slice(-20).map((point) => ([
          point.label,
          `${point.module} / ${point.construction}`,
          formatNumber(point.qualityIndex, 1),
          point.violations,
          point.measurementCount
        ]));
        drawTable(
          ["Дата", "Узел", "Индекс", "Нарушений", "Замеров"],
          trendRows,
          [22, 44, 12, 12, 12]
        );
        y += 2;
        tryDrawCanvasImage(ui?.trendCanvas, "График тренда индекса качества и нарушений");
      }

      const fileName = `Аналитика_${sanitizePdfFilePart(selectedProject.projectName)}_${formatDateForFileName(generatedAt)}.pdf`;
      doc.save(fileName);
      showNotification("Аналитика экспортирована в PDF.", "success");
    } catch (error) {
      console.error("[Analytics] PDF export failed", error);
      showNotification(`Не удалось экспортировать PDF: ${error.message || "неизвестная ошибка"}`, "error");
    } finally {
      setButtonBusyState(ui?.exportPdfBtn, false);
    }
  });
}

function bindAnalyticsControls(ui) {
  if (!ui || ui.root?.dataset.controlsBound === "1") return;
  syncAnalyticsToolbarPlacement(ui);

  if (ui.prevBtn) {
    ui.prevBtn.addEventListener("click", () => setAnalyticsPage(ui, analyticsState.currentPage - 1));
  }

  if (ui.nextBtn) {
    ui.nextBtn.addEventListener("click", () => setAnalyticsPage(ui, analyticsState.currentPage + 1));
  }

  if (ui.projectSelect) {
    ui.projectSelect.addEventListener("change", () => {
      analyticsState.selectedProjectId = ui.projectSelect.value;
      renderAnalyticsSelection();
    });
  }

  if (ui.exportPdfBtn) {
    ui.exportPdfBtn.addEventListener("click", () => {
      exportAnalyticsPdf();
    });
  }

  renderCarouselDots(ui);
  const refreshLayout = () => {
    syncAnalyticsToolbarPlacement(ui);
    updateCarouselHeight(ui);
    resizeAnalyticsCharts();
  };
  window.addEventListener("resize", refreshLayout);
  document.getElementById("summaryWorkspaceCarousel")?.addEventListener("scroll", refreshLayout, { passive: true });
  ui.carousel?.addEventListener("scroll", refreshLayout, { passive: true });
  if (globalThis.ResizeObserver) {
    const observer = new ResizeObserver(refreshLayout);
    observer.observe(ui.root);
    ui.pages?.forEach((page) => observer.observe(page));
  }
  if (globalThis.IntersectionObserver) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        refreshLayout();
      }
    }, { threshold: 0.35 });
    [ui.projectsChartCanvas, ui.distributionCanvas, ui.trendCanvas]
      .filter(Boolean)
      .forEach((canvas) => observer.observe(canvas));
  }
  ui.root.dataset.controlsBound = "1";
}

function renderAnalyticsSelection() {
  const ui = analyticsState.ui;
  if (!ui) return;
  syncAnalyticsToolbarPlacement(ui);

  const currentProjectId = getCurrentProjectId();
  populateProjectSelect(ui, analyticsState.fullList, analyticsState.selectedProjectId, currentProjectId);
  analyticsState.selectedProjectId = ui.projectSelect?.value || analyticsState.selectedProjectId;

  const selectedProject = getSelectedAnalyticsProject();

  if (!selectedProject) return;

  renderCurrentProject(ui, selectedProject);
  renderSmartRecommendations(ui, selectedProject);
  renderProjectDrilldown(ui, selectedProject);
  renderProjectsChart(ui, analyticsState.ranked, selectedProject.projectId);
  renderPositionText(ui, selectedProject, analyticsState.ranked.length);
  renderProjectsTable(ui, analyticsState.fullList, currentProjectId, selectedProject.projectId);
  renderContractors(ui, analyticsState.contractors, selectedProject);
  renderDistributionChart(ui, selectedProject);
  renderTrendChart(ui, selectedProject);
  syncCarouselUi(ui);
}

function renderProjectsChart(ui, rankedProjects, currentProjectId) {
  if (!ui.projectsChartCanvas || !globalThis.Chart) return;

  const isLight = document.body.classList.contains("theme-light");
  const axisColor = isLight ? "#475569" : "#cbd5e1";
  const gridColor = isLight ? "rgba(15,23,42,0.12)" : "rgba(148,163,184,0.2)";

  const labels = rankedProjects.map((project) => project.projectName);
  const rawData = rankedProjects.map((project) => project.meanDeviationPercent);
  const data = rawData.map((value) => (value <= 0 ? 0.0001 : value));
  const colors = rankedProjects.map((project) =>
    project.projectId === currentProjectId ? "#2196F3" : "#64748b"
  );

  const targetHeight = Math.max(240, rankedProjects.length * 36);
  ui.projectsChartCanvas.height = targetHeight;

  if (projectsChart) {
    projectsChart.destroy();
  }

  projectsChart = new globalThis.Chart(ui.projectsChartCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Среднее отклонение, %",
          data,
          borderRadius: 8,
          backgroundColor: colors,
          barThickness: 14,
          maxBarThickness: 16,
          minBarLength: 6
        }
      ]
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label(context) {
              const index = context.dataIndex;
              const value = rawData[index] ?? 0;
              return `Среднее отклонение: ${formatPercent(value, 2)}`;
            }
          }
        },
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: axisColor,
            font: {
              size: 11
            }
          },
          grid: {
            color: gridColor
          },
          title: {
            display: true,
            text: "Среднее отклонение (%)",
            color: axisColor,
            font: {
              size: 11
            }
          }
        },
        y: {
          ticks: {
            autoSkip: false,
            color: axisColor,
            font: {
              size: 11
            }
          },
          grid: {
            color: "transparent"
          }
        }
      }
    }
  });
}

function renderDistributionChart(ui, currentProject) {
  if (!ui.distributionCanvas || !globalThis.Chart) return;

  const isLight = document.body.classList.contains("theme-light");
  const axisColor = isLight ? "#475569" : "#cbd5e1";
  const gridColor = isLight ? "rgba(15,23,42,0.12)" : "rgba(148,163,184,0.2)";

  if (distributionChart) {
    distributionChart.destroy();
  }

  distributionChart = new globalThis.Chart(ui.distributionCanvas, {
    type: "bar",
    data: {
      labels: ["В допуске", "Малые", "Крупные", "Критические"],
      datasets: [
        {
          label: "Количество измерений",
          data: [
            currentProject.inToleranceCount,
            currentProject.smallCount,
            currentProject.largeCount,
            currentProject.criticalCount
          ],
          backgroundColor: ["#22c55e", "#eab308", "#f97316", "#ef4444"],
          borderRadius: 8,
          barThickness: 24,
          maxBarThickness: 28
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: axisColor,
            font: {
              size: 11
            }
          },
          grid: {
            color: gridColor
          }
        },
        x: {
          ticks: {
            color: axisColor,
            font: {
              size: 11
            }
          },
          grid: {
            color: "transparent"
          }
        }
      }
    }
  });
  resizeAnalyticsCharts();
}

function renderTrendChart(ui, currentProject) {
  if (!ui.trendCanvas || !globalThis.Chart) return;

  const isLight = document.body.classList.contains("theme-light");
  const axisColor = isLight ? "#475569" : "#cbd5e1";
  const gridColor = isLight ? "rgba(15,23,42,0.12)" : "rgba(148,163,184,0.2)";
  const trend = Array.isArray(currentProject?.qualityTrend) ? currentProject.qualityTrend : [];

  if (trendChart) {
    trendChart.destroy();
    trendChart = null;
  }
  const refreshHeight = () => {
    requestAnimationFrame(() => updateCarouselHeight(ui));
  };

  if (!trend.length) {
    const ctx = ui.trendCanvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, ui.trendCanvas.width, ui.trendCanvas.height);
    }
    ui.trendCanvas.hidden = true;
    if (ui.trendNote) {
      ui.trendNote.textContent = `Для отображения тренда необходимо минимум ${MIN_TREND_CHECKS} проверок.`;
    }
    refreshHeight();
    return;
  }

  if (trend.length < MIN_TREND_CHECKS) {
    const ctx = ui.trendCanvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, ui.trendCanvas.width, ui.trendCanvas.height);
    }
    ui.trendCanvas.hidden = true;
    if (ui.trendNote) {
      ui.trendNote.textContent = `Для отображения тренда необходимо минимум ${MIN_TREND_CHECKS} проверок. Сейчас: ${trend.length}.`;
    }
    refreshHeight();
    return;
  }

  ui.trendCanvas.hidden = false;
  const labels = trend.map((point) => point.label);
  const qualityData = trend.map((point) => Number(point.qualityIndex.toFixed(1)));
  const violationsData = trend.map((point) => point.violations);
  const measurementCountData = trend.map((point) => point.measurementCount);

  if (ui.trendNote) {
    const first = trend[0];
    const last = trend[trend.length - 1];
    const delta = last.qualityIndex - first.qualityIndex;
    const direction = delta > 0.5 ? "растёт" : (delta < -0.5 ? "снижается" : "стабилен");
    ui.trendNote.textContent = `Проверок в тренде: ${trend.length}. Индекс качества ${direction} (изменение ${formatNumber(delta, 1)} п.п.).`;
  }

  trendChart = new globalThis.Chart(ui.trendCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Нарушений",
          data: violationsData,
          yAxisID: "yViol",
          backgroundColor: "rgba(239, 68, 68, 0.32)",
          borderColor: "rgba(239, 68, 68, 0.85)",
          borderWidth: 0,
          borderRadius: 6,
          barThickness: 8,
          maxBarThickness: 10,
          barPercentage: 0.35,
          categoryPercentage: 0.68
        },
        {
          type: "line",
          label: "Индекс качества",
          data: qualityData,
          yAxisID: "yQuality",
          borderColor: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.22)",
          tension: 0.28,
          fill: false,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "#22c55e",
          pointBorderColor: "#052e16",
          pointBorderWidth: 2,
          borderWidth: 2
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: axisColor
          }
        },
        tooltip: {
          callbacks: {
            afterBody(items) {
              const index = items?.[0]?.dataIndex;
              const point = Number.isInteger(index) ? trend[index] : null;
              if (!point) return [];
              return [
                `${point.module} / ${point.construction}`,
                `Замеров: ${measurementCountData[index]}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: axisColor,
            font: {
              size: 10
            },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8
          },
          grid: {
            color: "transparent"
          }
        },
        yQuality: {
          type: "linear",
          position: "left",
          min: 0,
          max: 100,
          ticks: {
            color: axisColor,
            font: {
              size: 11
            }
          },
          title: {
            display: true,
            text: "Индекс качества",
            color: axisColor,
            font: {
              size: 11
            }
          },
          grid: {
            color: gridColor
          }
        },
        yViol: {
          type: "linear",
          position: "right",
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: axisColor,
            font: {
              size: 11
            }
          },
          title: {
            display: true,
            text: "Нарушения",
            color: axisColor,
            font: {
              size: 11
            }
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });
  resizeAnalyticsCharts();
  refreshHeight();
}

async function getProjectsForUser(userId) {
  const cachedProjects = getFreshAnalyticsCache(analyticsProjectsCache, userId, PROJECTS_CACHE_TTL_MS);
  if (cachedProjects) {
    return cachedProjects;
  }

  const uniqueProjects = new Map();

  const addDocs = (snapshot) => {
    snapshot.forEach((docRef) => {
      uniqueProjects.set(docRef.id, docRef);
    });
  };

  const [byOwnerResult, byCreatorResult] = await Promise.allSettled([
    getProjectsByFieldSnapshot("ownerUid", userId),
    getProjectsByFieldSnapshot("createdBy", userId)
  ]);

  if (byOwnerResult.status === "fulfilled") {
    addDocs(byOwnerResult.value);
  } else {
    console.warn("[Analytics] ownerUid query failed", byOwnerResult.reason);
  }

  if (byCreatorResult.status === "fulfilled") {
    addDocs(byCreatorResult.value);
  } else {
    console.warn("[Analytics] createdBy query failed", byCreatorResult.reason);
  }

  if (uniqueProjects.size > 0) {
    return setFreshAnalyticsCache(
      analyticsProjectsCache,
      userId,
      [...uniqueProjects.values()]
    );
  }

  // fallback на случай нестандартной структуры данных или прав доступа
  const allProjectsSnap = await getProjectsSnapshot();
  return setFreshAnalyticsCache(
    analyticsProjectsCache,
    userId,
    allProjectsSnap.docs.filter((docRef) => {
      const data = docRef.data();
      return data?.ownerUid === userId || data?.createdBy === userId;
    })
  );
}

function updateProjectContractorInAnalyticsState(projectId, nextState: ContractorStatePatch = {}) {
  const safeProjectId = String(projectId || "").trim();
  if (!safeProjectId) return false;

  const applyToProject = (project) => {
    if (!project || project.projectId !== safeProjectId) return false;

    const contractorId = Object.prototype.hasOwnProperty.call(nextState, "contractorId")
      ? nextState.contractorId
      : project.contractorId;
    const contractorUid = Object.prototype.hasOwnProperty.call(nextState, "contractorUid")
      ? nextState.contractorUid
      : "";
    const contractorName = Object.prototype.hasOwnProperty.call(nextState, "contractorName")
      ? nextState.contractorName
      : project.contractorName;
    const contractorInfo = normalizeContractorInfo({
      contractorId,
      contractorUid,
      contractorName
    }, safeProjectId);

    project.contractorId = contractorInfo.contractorId;
    project.contractorName = contractorInfo.contractorName;
    project.contractorGroupKey = contractorInfo.contractorGroupKey;
    project.contractorUnknown = contractorInfo.contractorUnknown;
    return true;
  };

  let updated = false;
  analyticsState.fullList.forEach((project) => {
    updated = applyToProject(project) || updated;
  });
  analyticsState.ranked.forEach((project) => {
    updated = applyToProject(project) || updated;
  });

  if (!updated) return false;

  analyticsState.contractors = calculateContractors(analyticsState.ranked);
  return true;
}

function refreshAnalyticsAfterContractorChange(projectId, nextState = {}) {
  updateProjectContractorInAnalyticsState(projectId, nextState);
  analyticsState.editingContractorProjectId = "";
  renderAnalyticsSelection();
}

async function getProjectSources(projectId) {
  const currentProjectId = getCurrentProjectId();
  const isCurrentProject = projectId === currentProjectId;
  if (!isCurrentProject) {
    const cachedSources = getFreshAnalyticsCache(
      analyticsProjectSourcesCache,
      projectId,
      PROJECT_SOURCES_CACHE_TTL_MS
    );
    if (cachedSources) {
      return cachedSources;
    }
  }

  let inspections = await getCollectionDocs(projectId, "inspections");
  inspections = inspections.filter(isInspectionSupportedForAnalytics);

  let geoNodes = [];
  let reinfChecks = [];
  let geomChecks = [];
  let strengthChecks = [];

  if (!inspections.length) {
    const loadedCollections = await Promise.all(
      LEGACY_SOURCE_COLLECTIONS.map(async (collectionName) => ({
        collectionName,
        docs: await getCollectionDocs(projectId, collectionName)
      }))
    );

    loadedCollections.forEach(({ collectionName, docs }) => {
      if (collectionName === "geoNodes") geoNodes = docs;
      if (collectionName === "reinfChecks") reinfChecks = docs;
      if (collectionName === "geomChecks") geomChecks = docs;
      if (collectionName === "strengthChecks") strengthChecks = docs;
    });

    if (isCurrentProject) {
      if (!geoNodes.length && globalThis.nodes instanceof Map) {
        geoNodes = Array.from(globalThis.nodes.entries()).map(([id, data]) => ({
          ...(data || {}),
          _docId: id
        }));
      }
      if (!reinfChecks.length && globalThis.reinfChecks instanceof Map) {
        reinfChecks = Array.from(globalThis.reinfChecks.entries()).map(([id, data]) => ({
          ...(data || {}),
          _docId: id
        }));
      }
      if (!geomChecks.length && globalThis.geomChecks instanceof Map) {
        geomChecks = Array.from(globalThis.geomChecks.entries()).map(([id, data]) => ({
          ...(data || {}),
          _docId: id
        }));
      }
      if (!strengthChecks.length && globalThis.strengthChecks instanceof Map) {
        strengthChecks = Array.from(globalThis.strengthChecks.entries()).map(([id, data]) => ({
          ...(data || {}),
          _docId: id
        }));
      }
    }

    const result = {
      inspections,
      geoNodes,
      reinfChecks,
      geomChecks,
      strengthChecks
    };

    return isCurrentProject
      ? result
      : setFreshAnalyticsCache(analyticsProjectSourcesCache, projectId, result);
  }

  const neededDocIdsByCollection = new Map();
  inspections.forEach((inspection) => {
    if (!inspectionNeedsLegacySource(inspection)) return;

    const sourceCollection = resolveInspectionSourceCollection(inspection);
    const sourceId = resolveInspectionSourceId(inspection);
    if (!sourceCollection || !sourceId) return;

    if (!neededDocIdsByCollection.has(sourceCollection)) {
      neededDocIdsByCollection.set(sourceCollection, new Set());
    }
    neededDocIdsByCollection.get(sourceCollection).add(sourceId);
  });

  const loadedByCollection = await Promise.all(
    [...neededDocIdsByCollection.entries()].map(async ([collectionName, idsSet]) => {
      const ids = [...idsSet];
      const { docs, missingIds } = await getCollectionDocsByIds(projectId, collectionName, ids);
      let resolvedDocs = docs;

      if (isCurrentProject && missingIds.length > 0) {
        const localDocs = getLocalLegacyDocsByIds(collectionName, missingIds);
        if (localDocs.length > 0) {
          const seen = new Set(resolvedDocs.map((doc) => String(doc?._docId || "").trim()).filter(Boolean));
          localDocs.forEach((doc) => {
            const docId = String(doc?._docId || "").trim();
            if (!docId || seen.has(docId)) return;
            seen.add(docId);
            resolvedDocs.push(doc);
          });
        }
      }

      return { collectionName, docs: resolvedDocs };
    })
  );

  loadedByCollection.forEach(({ collectionName, docs }) => {
    if (collectionName === "geoNodes") geoNodes = docs;
    if (collectionName === "reinfChecks") reinfChecks = docs;
    if (collectionName === "geomChecks") geomChecks = docs;
    if (collectionName === "strengthChecks") strengthChecks = docs;
  });

  const result = {
    inspections,
    geoNodes,
    reinfChecks,
    geomChecks,
    strengthChecks
  };

  return isCurrentProject
    ? result
    : setFreshAnalyticsCache(analyticsProjectSourcesCache, projectId, result);
}

async function getCollectionDocs(projectId, collectionName) {
  try {
    const snap = await getProjectCollectionSnapshot(projectId, collectionName);
    return snap.docs.map((docRef) => ({
      ...docRef.data(),
      _docId: docRef.id
    }));
  } catch (error) {
    console.warn(`[Analytics] ${collectionName} load failed for ${projectId}`, error);
    return [];
  }
}

async function getCollectionDocById(projectId, collectionName, docId) {
  try {
    const snap = await getProjectCollectionDocSnapshot(projectId, collectionName, docId);
    if (!snap.exists()) return null;
    return {
      ...snap.data(),
      _docId: snap.id
    };
  } catch (error) {
    console.warn(`[Analytics] ${collectionName}/${docId} load failed for ${projectId}`, error);
    return null;
  }
}

async function getCollectionDocsByIds(projectId, collectionName, docIds) {
  const uniqueDocIds = [...new Set(
    (Array.isArray(docIds) ? docIds : [])
      .map((docId) => String(docId || "").trim())
      .filter(Boolean)
  )];

  if (!uniqueDocIds.length) {
    return { docs: [], missingIds: [] };
  }

  const docs = [];
  const missingIds = [];
  const loaded = await Promise.all(
    uniqueDocIds.map(async (docId) => ({
      docId,
      doc: await getCollectionDocById(projectId, collectionName, docId)
    }))
  );

  loaded.forEach(({ docId, doc }) => {
    if (doc) {
      docs.push(doc);
    } else {
      missingIds.push(docId);
    }
  });

  return { docs, missingIds };
}

function getLocalLegacyMapByCollection(collectionName) {
  if (collectionName === "geoNodes" && globalThis.nodes instanceof Map) return globalThis.nodes;
  if (collectionName === "reinfChecks" && globalThis.reinfChecks instanceof Map) return globalThis.reinfChecks;
  if (collectionName === "geomChecks" && globalThis.geomChecks instanceof Map) return globalThis.geomChecks;
  if (collectionName === "strengthChecks" && globalThis.strengthChecks instanceof Map) return globalThis.strengthChecks;
  return null;
}

function getLocalLegacyDocsByIds(collectionName, docIds) {
  const map = getLocalLegacyMapByCollection(collectionName);
  if (!(map instanceof Map)) return [];
  return [...new Set(Array.isArray(docIds) ? docIds : [])]
    .map((docId) => String(docId || "").trim())
    .filter(Boolean)
    .filter((docId) => map.has(docId))
    .map((docId) => ({
      ...(map.get(docId) || {}),
      _docId: docId
    }));
}


export async function loadAnalytics() {
  const ui = getUiElements();
  if (!ui) return;

  const runId = ++lastRunId;
  destroyCharts();
  showLoader(ui);

  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showEmpty(ui, "Недостаточно данных: пользователь не авторизован.");
      return;
    }

    const [projectDocs] = await Promise.all([
      getProjectsForUser(currentUser.uid),
      ensureChartJsLoaded()
    ]);
    if (runId !== lastRunId) return;

    if (!projectDocs.length) {
      showEmpty(ui, "Недостаточно данных: проекты не найдены.");
      return;
    }

    const sourcesPerProject = await Promise.all(
      projectDocs.map(async (project) => {
        try {
          const sources = await getProjectSources(project.id);
          return { project, sources };
        } catch (error) {
          console.warn(`[Analytics] sources load failed for ${project.id}`, error);
          return {
            project,
            sources: {
              inspections: [],
              geoNodes: [],
              reinfChecks: [],
              geomChecks: [],
              strengthChecks: []
            }
          };
        }
      })
    );

    if (runId !== lastRunId) return;

    const projectAnalytics = sourcesPerProject.map(({ project, sources }) =>
      calculateProjectAnalytics(project, sources)
    );

    console.log(
      "[Analytics] measurements per project:",
      projectAnalytics.map((item) => ({
        projectId: item.projectId,
        projectName: item.projectName,
        checks: item.inspectionsCount,
        measurements: item.measurementCount
      }))
    );

    const totalMeasurements = projectAnalytics.reduce((sum, item) => sum + item.measurementCount, 0);

    if (totalMeasurements < MIN_MEASUREMENTS) {
      showEmpty(ui, `Недостаточно данных для аналитики. Нужно минимум ${MIN_MEASUREMENTS} измерений.`);
      return;
    }

    const { ranked, fullList } = rankProjects(projectAnalytics);
    if (!ranked.length) {
      showEmpty(ui, "Недостаточно данных для ранжирования объектов.");
      return;
    }

    const contractors = calculateContractors(ranked);

    analyticsState.ui = ui;
    analyticsState.fullList = fullList;
    analyticsState.ranked = ranked;
    analyticsState.contractors = contractors;

    const currentProjectId = getCurrentProjectId();
    const stillExists = fullList.some((item) => item.projectId === analyticsState.selectedProjectId);
    analyticsState.selectedProjectId = stillExists
      ? analyticsState.selectedProjectId
      : (fullList.find((item) => item.projectId === currentProjectId)?.projectId || ranked[0].projectId);

    showContent(ui);
    bindAnalyticsControls(ui);
    renderAnalyticsSelection();
  } catch (error) {
    console.error("[Analytics] loadAnalytics failed", error);
    showError(ui, `Ошибка загрузки аналитики: ${error.message || "неизвестная ошибка"}`);
  }
}

export async function warmupAnalyticsData() {
  const currentUser = auth.currentUser;
  if (!currentUser) return false;

  try {
    const projectDocs = await getProjectsForUser(currentUser.uid);
    if (!projectDocs.length) return true;

    await Promise.allSettled(
      projectDocs.map((project) => getProjectSources(project.id))
    );
    return true;
  } catch (error) {
    console.warn("[Analytics] warmupAnalyticsData failed", error);
    return false;
  }
}
