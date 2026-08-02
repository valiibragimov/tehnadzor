import type { ControlPlanResult, ControlPlanTaskStatus } from "../../features/control-plan/index.js";

export type OverviewModuleKey = "geo" | "reinforcement" | "geometry" | "strength";

export interface OverviewModuleReadiness {
  applicable: boolean;
  completedTasks: number;
  totalTasks: number;
  incompleteTasks: number;
  deviationTasks: number;
  openIssueTasks: number;
}

export interface OverviewReadinessMetrics {
  completedRequiredTasks: number;
  totalRequiredTasks: number;
  incompleteRequiredTasks: number;
  readinessPercent: number;
  deviationTasks: number;
  openIssueTasks: number;
  readyPositions: number;
  totalPositions: number;
  modules: Record<OverviewModuleKey, OverviewModuleReadiness>;
}

export interface OverviewModulePresentation {
  tone: "neutral" | "success" | "warning" | "danger";
  status: string;
}

const MODULE_ALIASES: Readonly<Record<string, OverviewModuleKey>> = Object.freeze({
  geo: "geo",
  geodesy: "geo",
  reinforcement: "reinforcement",
  reinf: "reinforcement",
  geometry: "geometry",
  geom: "geometry",
  strength: "strength",
  concrete: "strength"
});

const COMPLETED_STATUSES: ReadonlySet<ControlPlanTaskStatus> = new Set(["done", "resolved"]);

function createModuleReadiness(): OverviewModuleReadiness {
  return {
    applicable: false,
    completedTasks: 0,
    totalTasks: 0,
    incompleteTasks: 0,
    deviationTasks: 0,
    openIssueTasks: 0
  };
}

function normalizeModuleKey(value: unknown): OverviewModuleKey | null {
  return MODULE_ALIASES[String(value || "").trim().toLowerCase()] || null;
}

export function buildOverviewReadinessMetrics(
  controlPlan: Pick<ControlPlanResult, "rows" | "summary"> | null | undefined
): OverviewReadinessMetrics {
  const modules: Record<OverviewModuleKey, OverviewModuleReadiness> = {
    geo: createModuleReadiness(),
    reinforcement: createModuleReadiness(),
    geometry: createModuleReadiness(),
    strength: createModuleReadiness()
  };

  let completedRequiredTasks = 0;
  let totalRequiredTasks = 0;
  let deviationTasks = 0;
  let openIssueTasks = 0;

  for (const row of controlPlan?.rows || []) {
    for (const task of row.tasks || []) {
      const moduleKey = normalizeModuleKey(task.moduleKey);
      if (!moduleKey || task.inspectionStatus !== "object") continue;

      const module = modules[moduleKey];
      const completed = COMPLETED_STATUSES.has(task.status);
      module.applicable = true;
      module.totalTasks += 1;
      totalRequiredTasks += 1;

      if (completed) {
        module.completedTasks += 1;
        completedRequiredTasks += 1;
      } else {
        module.incompleteTasks += 1;
      }

      if (task.status === "deviation") {
        module.deviationTasks += 1;
        deviationTasks += 1;
      }
      if (task.status === "issue_open") {
        module.openIssueTasks += 1;
        openIssueTasks += 1;
      }
    }
  }

  return {
    completedRequiredTasks,
    totalRequiredTasks,
    incompleteRequiredTasks: totalRequiredTasks - completedRequiredTasks,
    readinessPercent: totalRequiredTasks > 0
      ? Math.round((completedRequiredTasks / totalRequiredTasks) * 100)
      : 0,
    deviationTasks,
    openIssueTasks,
    readyPositions: Number(controlPlan?.summary.readyRows || 0),
    totalPositions: Number(controlPlan?.summary.totalRows || 0),
    modules
  };
}

export function getOverviewModulePresentation(
  module: OverviewModuleReadiness,
  openIssues: number,
  hasProject: boolean
): OverviewModulePresentation {
  if (!hasProject) return { tone: "neutral", status: "Нет данных" };
  if (!module.applicable) return { tone: "neutral", status: "Не требуется по плану" };
  if (openIssues > 0) return { tone: "danger", status: `Открытых замечаний: ${openIssues}` };
  if (module.deviationTasks > 0 || module.openIssueTasks > 0) {
    return { tone: "danger", status: "Есть отклонения или замечания" };
  }
  if (module.incompleteTasks > 0) return { tone: "warning", status: "Требуется выполнить" };
  return { tone: "success", status: "Выполнено без открытых замечаний" };
}
