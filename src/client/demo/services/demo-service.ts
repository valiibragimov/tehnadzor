import type { DemoRepository } from "../repositories/demo-repository.js";
import type {
  DemoInspection,
  DemoInspectionInput,
  DemoIssue,
  DemoIssueInput,
  DemoReadinessMetrics,
  DemoState
} from "../types.js";

const MODULE_TITLES = {
  reinforcement: "Проверка армирования",
  geometry: "Геометрический контроль",
  strength: "Контроль прочности"
} as const;

export interface DemoClock {
  now(): string;
}

export interface DemoService {
  getState(): DemoState;
  getMetrics(): DemoReadinessMetrics;
  createInspection(input: DemoInspectionInput): DemoInspection;
  createIssue(input: DemoIssueInput): DemoIssue;
  resolveIssueWithRepeatControl(id: string): DemoIssue | null;
  reset(): DemoState;
}

export function buildDemoReadinessMetrics(state: DemoState): DemoReadinessMetrics {
  const requiredTasks = state.controlPlan.filter((task) => task.inspectionStatus === "object");
  const completed = requiredTasks.filter((task) =>
    task.status === "done" || task.status === "resolved"
  ).length;

  return {
    completed,
    total: requiredTasks.length,
    percent: requiredTasks.length ? Math.round((completed / requiredTasks.length) * 100) : 0,
    openIssues: state.issues.filter((issue) => issue.status === "open").length,
    deviations: requiredTasks.filter((task) =>
      task.status === "deviation" || task.status === "issue_open"
    ).length,
    factoryTasks: state.controlPlan.filter((task) => task.inspectionStatus === "factory").length
  };
}

function evaluateInspection(input: DemoInspectionInput) {
  if (input.projectValue == null || input.actualValue == null) {
    return {
      status: "empty" as const,
      summary: "Проверка сохранена с неполными демонстрационными данными."
    };
  }

  const difference = Math.abs(input.actualValue - input.projectValue);
  const compliant =
    input.module === "strength"
      ? input.actualValue >= input.projectValue
      : difference <= input.tolerance;

  return compliant
    ? { status: "done" as const, summary: "Параметры находятся в пределах демонстрационного допуска." }
    : { status: "deviation" as const, summary: "Есть отклонение, требуется корректирующее действие." };
}

export function createDemoService(
  repository: DemoRepository,
  clock: DemoClock = { now: () => new Date().toISOString() }
): DemoService {
  const findTargetTask = (input: DemoInspectionInput) => {
    const state = repository.getState();
    return state.controlPlan.find(
      (task) =>
        task.module === input.module &&
        task.inspectionStatus === "object" &&
        task.status !== "resolved"
    );
  };

  return {
    getState: () => repository.getState(),
    getMetrics: () => buildDemoReadinessMetrics(repository.getState()),
    createInspection: (input) => {
      const evaluated = evaluateInspection(input);
      const createdAt = clock.now();
      const title = `${MODULE_TITLES[input.module]} ${input.constructionMark}`.trim();
      const inspection = repository.createInspection({
        module: input.module,
        title,
        constructionMark: input.constructionMark,
        createdAt,
        status: evaluated.status,
        summary: evaluated.summary,
        measurements:
          input.projectValue == null || input.actualValue == null
            ? []
            : [
                {
                  label:
                    input.module === "reinforcement"
                      ? "Диаметр"
                      : input.module === "strength"
                        ? "Прочность"
                        : "Отклонение",
                  projectValue: input.projectValue,
                  actualValue: input.actualValue,
                  unit: input.unit
                }
              ]
      });

      const task = findTargetTask(input);
      if (task && evaluated.status !== "empty") {
        repository.updateTask(task.id, {
          status: evaluated.status === "done" ? "done" : "deviation"
        });
      }

      if (evaluated.status !== "empty") {
        repository.createJournalEntry({
          createdAt,
          kind: "inspection",
          title: MODULE_TITLES[input.module],
          description: `${input.constructionMark}: ${evaluated.summary}`,
          status: evaluated.status === "done" ? "done" : "deviation"
        });
      }

      return inspection;
    },
    createIssue: (input) => {
      const createdAt = clock.now();
      const issue = repository.createIssue({
        ...input,
        createdAt,
        status: "open",
        linkedTaskId: null,
        repeatControlAt: null
      });
      repository.createJournalEntry({
        createdAt,
        kind: "issue",
        title: "Открыто замечание",
        description: `${input.constructionMark}: ${input.title}`,
        status: "issue_open"
      });
      return issue;
    },
    resolveIssueWithRepeatControl: (id) => {
      const state = repository.getState();
      const issue = state.issues.find((record) => record.id === id);
      if (!issue || issue.status === "resolved") return issue || null;

      const repeatControlAt = clock.now();
      const updated = repository.updateIssue(id, { status: "resolved", repeatControlAt });
      if (!updated) return null;

      if (issue.linkedTaskId) repository.updateTask(issue.linkedTaskId, { status: "resolved" });
      repository.createJournalEntry({
        createdAt: repeatControlAt,
        kind: "repeat-control",
        title: "Повторный контроль",
        description: `${issue.constructionMark}: замечание закрыто после повторного контроля.`,
        status: "resolved"
      });
      return updated;
    },
    reset: () => repository.reset()
  };
}
