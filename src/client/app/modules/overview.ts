import { getRuntimeIssueStatus, loadProjectIssues } from "../services/issues.js";
import {
  loadProjectControlPlan,
  type ControlPlanResult
} from "../../features/control-plan/index.js";
import type { IssueRecord } from "../../types/module-records.js";
import {
  buildOverviewReadinessMetrics,
  getOverviewModulePresentation,
  type OverviewModuleReadiness
} from "./overview-metrics.js";

const MODULES = [
  { key: "geo", countId: "overviewGeoCount", statusId: "overviewGeoStatus" },
  { key: "reinforcement", countId: "overviewReinforcementCount", statusId: "overviewReinforcementStatus" },
  { key: "geometry", countId: "overviewGeometryCount", statusId: "overviewGeometryStatus" },
  { key: "strength", countId: "overviewStrengthCount", statusId: "overviewStrengthStatus" }
] as const;

const MODULE_ALIASES: Record<string, string> = {
  geo: "geo",
  geodesy: "geo",
  reinforcement: "reinforcement",
  reinf: "reinforcement",
  geometry: "geometry",
  geom: "geometry",
  strength: "strength",
  concrete: "strength"
};

let overviewInitialized = false;
let renderSequence = 0;
let getStrengthChecksCount = () => 0;
let getReinforcementChecksCount = () => 0;

export function configureOverviewStrength(
  getCount: () => number
) {
  getStrengthChecksCount = getCount;
}

export function configureOverviewReinforcement(
  getCount: () => number
) {
  getReinforcementChecksCount = getCount;
}

function setText(id: string, value: string | number) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function getCollectionSize(value: unknown) {
  if (value instanceof Map || value instanceof Set) return value.size;
  if (Array.isArray(value)) return value.length;
  return 0;
}

function getIfcCount() {
  const text = document.getElementById("bimImportedIfcCount")?.textContent || "";
  const parsed = Number(text.match(/\d+/u)?.[0] || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getProjectName() {
  const selector = globalThis.projectSelector;
  const option = selector && selector.selectedIndex >= 0
    ? selector.options[selector.selectedIndex]
    : null;
  return option?.textContent?.trim() || "Объект не выбран";
}

function normalizeIssueModule(issue: IssueRecord) {
  const raw = String(issue.moduleKey || issue.module || "").trim().toLowerCase();
  return MODULE_ALIASES[raw] || raw;
}

function activateTarget(target: string) {
  const trigger = document.querySelector<HTMLElement>(`.tab[data-target="${target}"]`);
  trigger?.click();
}

function bindOverviewActions() {
  document.querySelectorAll<HTMLElement>("[data-overview-target], [data-overview-action]").forEach((button) => {
    if (button.dataset.overviewBound === "true") return;
    button.dataset.overviewBound = "true";
    button.addEventListener("click", () => {
      const target = button.dataset.overviewTarget;
      if (target) {
        activateTarget(target);
        return;
      }
      if (button.dataset.overviewAction === "ifc") {
        const importButton = document.getElementById("btnImportIfc");
        importButton?.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => importButton?.focus(), 320);
      }
    });
  });
}

function setNextAction({
  title,
  description,
  label,
  target,
  action,
  tone
}: {
  title: string;
  description: string;
  label: string;
  target?: string;
  action?: string;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  setText("overviewNextTitle", title);
  setText("overviewNextDescription", description);
  const button = document.getElementById("overviewNextAction") as HTMLButtonElement | null;
  const marker = document.getElementById("overviewActionMarker");
  if (marker) marker.dataset.tone = tone;
  if (!button) return;

  button.textContent = label;
  button.disabled = !target && !action;
  delete button.dataset.overviewTarget;
  delete button.dataset.overviewAction;
  if (target) button.dataset.overviewTarget = target;
  if (action) button.dataset.overviewAction = action;
}

function setModuleState(
  key: string,
  count: number,
  openIssues: number,
  hasProject: boolean,
  readiness: OverviewModuleReadiness
) {
  const moduleConfig = MODULES.find((module) => module.key === key);
  const row = document.querySelector<HTMLElement>(`.overview-module-row[data-overview-target="${key}"]`);
  if (!moduleConfig || !row) return;

  setText(moduleConfig.countId, count);
  const presentation = getOverviewModulePresentation(readiness, openIssues, hasProject);
  row.dataset.tone = presentation.tone;
  setText(moduleConfig.statusId, presentation.status);
}

export async function renderOverview() {
  const root = document.getElementById("objectOverview");
  if (!root) return;

  const sequence = ++renderSequence;
  const projectId = String(globalThis.currentProjectId || "").trim();
  const hasProject = Boolean(projectId);
  const moduleCounts = {
    geo: getCollectionSize(globalThis.nodes),
    reinforcement: getReinforcementChecksCount(),
    geometry: getCollectionSize(globalThis.geomChecks),
    strength: getStrengthChecksCount()
  };
  const totalChecks = Object.values(moduleCounts).reduce((sum, count) => sum + count, 0);
  const ifcCount = getIfcCount();

  root.setAttribute("aria-busy", "true");
  root.classList.add("is-loading");
  setText("overviewProjectName", hasProject ? getProjectName() : "Выберите объект, чтобы увидеть текущее состояние контроля.");
  setText("overviewChecksCount", totalChecks);
  setText("overviewIfcCount", ifcCount);

  let issues: IssueRecord[] = [];
  let controlPlan: ControlPlanResult | null = null;
  if (hasProject) {
    const fallbackConstruction = globalThis.construction?.dataset?.machineValue
      || globalThis.construction?.value
      || "";
    [issues, controlPlan] = await Promise.all([
      loadProjectIssues(projectId).catch(() => []),
      loadProjectControlPlan(projectId, {
        fallbackConstruction,
        fallbackConstructionLabel: globalThis.construction?.dataset?.displayLabel
          || globalThis.construction?.value
          || ""
      }).catch(() => null)
    ]);
  }

  if (sequence !== renderSequence) return;

  const openIssues = issues.filter((issue) => getRuntimeIssueStatus(issue) !== "closed");
  const overdueIssues = openIssues.filter((issue) => getRuntimeIssueStatus(issue) === "overdue");
  const issuesByModule = new Map<string, number>();
  openIssues.forEach((issue) => {
    const moduleKey = normalizeIssueModule(issue);
    issuesByModule.set(moduleKey, (issuesByModule.get(moduleKey) || 0) + 1);
  });

  const planSummary = controlPlan?.summary;
  const blockedRows = Number(planSummary?.blockedRows || 0);
  const readinessMetrics = buildOverviewReadinessMetrics(controlPlan);
  const missingTasks = readinessMetrics.incompleteRequiredTasks;
  const readiness = hasProject ? readinessMetrics.readinessPercent : 0;
  const hasDeviations = blockedRows > 0 || readinessMetrics.deviationTasks > 0;

  setText("overviewIssuesCount", openIssues.length);
  setText(
    "overviewIssuesNote",
    overdueIssues.length > 0 ? `просрочено: ${overdueIssues.length}` : openIssues.length > 0 ? "требуют закрытия" : "нет активных"
  );
  setText("overviewReadinessValue", `${readiness}%`);
  setText(
    "overviewModulesCount",
    `${readinessMetrics.completedRequiredTasks} / ${readinessMetrics.totalRequiredTasks}`
  );
  setText(
    "overviewReadinessNote",
    !hasProject
      ? "Данные появятся после выбора объекта."
      : `Полностью готово: ${readinessMetrics.readyPositions} из ${readinessMetrics.totalPositions} позиций контроля.`
  );

  const progress = document.getElementById("overviewProgress");
  const progressBar = document.getElementById("overviewProgressBar");
  progress?.setAttribute("aria-valuenow", String(readiness));
  progressBar?.style.setProperty("--overview-progress", `${readiness}%`);

  MODULES.forEach(({ key }) => {
    setModuleState(
      key,
      moduleCounts[key],
      issuesByModule.get(key) || 0,
      hasProject,
      readinessMetrics.modules[key]
    );
  });

  const badge = document.getElementById("overviewStatusBadge");
  if (badge) {
    if (!hasProject) {
      badge.dataset.tone = "neutral";
      badge.textContent = "Нет данных";
    } else if (hasDeviations || openIssues.length > 0 || overdueIssues.length > 0) {
      badge.dataset.tone = "danger";
      badge.textContent = "Есть отклонения";
    } else if (missingTasks > 0) {
      badge.dataset.tone = "warning";
      badge.textContent = "Требуется внимание";
    } else if (readinessMetrics.totalRequiredTasks === 0) {
      badge.dataset.tone = "neutral";
      badge.textContent = "Нет обязательных задач";
    } else {
      badge.dataset.tone = "success";
      badge.textContent = "Готово к приёмке";
    }
  }

  if (!hasProject) {
    setNextAction({
      title: "Выберите объект",
      description: "После загрузки объекта обзор покажет проверки, замечания и готовность к приёмке.",
      label: "Объект не выбран",
      tone: "neutral"
    });
  } else if (overdueIssues.length > 0) {
    setNextAction({
      title: "Закройте просроченные замечания",
      description: `Просрочено замечаний: ${overdueIssues.length}. Они блокируют итоговую готовность объекта.`,
      label: "Открыть журнал",
      target: "journal",
      tone: "danger"
    });
  } else if (openIssues.length > 0 || hasDeviations) {
    setNextAction({
      title: "Устраните открытые отклонения",
      description: `Открытых замечаний: ${openIssues.length}. Позиций с отклонениями: ${Math.max(blockedRows, readinessMetrics.deviationTasks)}.`,
      label: "Открыть замечания",
      target: "journal",
      tone: "danger"
    });
  } else if (missingTasks > 0) {
    setNextAction({
      title: "Продолжите обязательные проверки",
      description: `По плану контроля не выполнено объектовых задач: ${missingTasks}.`,
      label: "Открыть план контроля",
      target: "controlPlan",
      tone: "warning"
    });
  } else if (ifcCount === 0) {
    setNextAction({
      title: "Добавьте IFC-модель",
      description: "Модель позволит связывать проверки с элементами и контролировать состав данных до импорта.",
      label: "Загрузить IFC",
      action: "ifc",
      tone: "warning"
    });
  } else if (readinessMetrics.totalRequiredTasks === 0) {
    setNextAction({
      title: "Проверьте план контроля",
      description: "Для выбранных позиций нет обязательных объектовых задач.",
      label: "Открыть план контроля",
      target: "controlPlan",
      tone: "neutral"
    });
  } else {
    setNextAction({
      title: "Подготовьте итоговое заключение",
      description: "Обязательные разделы заполнены, открытых замечаний нет.",
      label: "Перейти к итогу",
      target: "summary",
      tone: "success"
    });
  }

  root.classList.remove("is-loading");
  root.setAttribute("aria-busy", "false");
}

export function initOverviewModule() {
  if (overviewInitialized) {
    void renderOverview();
    return;
  }
  overviewInitialized = true;
  bindOverviewActions();
  document.addEventListener("app:project-context-updated", () => void renderOverview());
  document.addEventListener("app:ifc-count-updated", () => void renderOverview());
  void renderOverview();
}
