import type { DemoState } from "./types.js";

export const DEMO_SCHEMA_VERSION = 1;

export function createDemoFixtures(): DemoState {
  return {
    schemaVersion: DEMO_SCHEMA_VERSION,
    project: {
      id: "demo-project",
      name: "Демонстрационный объект",
      organization: "ООО «СтройДемо»",
      structureType: "Монолитный каркас"
    },
    bimElements: [
      { id: "demo-slab-01", type: "Плита", mark: "ПЛ-01", level: "Этаж 2" },
      { id: "demo-column-01", type: "Колонна", mark: "К-01", level: "Этаж 1" },
      { id: "demo-beam-01", type: "Балка", mark: "Б-01", level: "Этаж 2" },
      { id: "demo-wall-01", type: "Стена", mark: "СТ-01", level: "Этаж 1" }
    ],
    controlPlan: [
      {
        id: "task-geo-slab",
        module: "geodesy",
        title: "Положение плиты",
        constructionMark: "ПЛ-01",
        inspectionStatus: "object",
        status: "done"
      },
      {
        id: "task-reinf-column",
        module: "reinforcement",
        title: "Армирование колонны",
        constructionMark: "К-01",
        inspectionStatus: "object",
        status: "done"
      },
      {
        id: "task-geometry-wall",
        module: "geometry",
        title: "Геометрия стены",
        constructionMark: "СТ-01",
        inspectionStatus: "object",
        status: "issue_open"
      },
      {
        id: "task-strength-beam",
        module: "strength",
        title: "Прочность балки",
        constructionMark: "Б-01",
        inspectionStatus: "object",
        status: "required"
      },
      {
        id: "task-repeat-slab",
        module: "geometry",
        title: "Повторный контроль плиты",
        constructionMark: "ПЛ-01",
        inspectionStatus: "object",
        status: "resolved"
      },
      {
        id: "task-factory-beam",
        module: "strength",
        title: "Входной контроль бетонной смеси",
        constructionMark: "Б-01",
        inspectionStatus: "factory",
        status: "done"
      },
      {
        id: "task-na-wall",
        module: "reinforcement",
        title: "Сварные соединения стены",
        constructionMark: "СТ-01",
        inspectionStatus: "notApplicable",
        status: "required"
      }
    ],
    inspections: [
      {
        id: "inspection-geo-01",
        module: "geodesy",
        title: "Геодезический контроль ПЛ-01",
        constructionMark: "ПЛ-01",
        createdAt: "2026-07-18T09:30:00.000Z",
        status: "done",
        summary: "Положение конструкции соответствует заданным параметрам.",
        measurements: []
      },
      {
        id: "inspection-reinf-01",
        module: "reinforcement",
        title: "Проверка армирования К-01",
        constructionMark: "К-01",
        createdAt: "2026-07-19T11:20:00.000Z",
        status: "done",
        summary: "Диаметр и шаг арматуры соответствуют проектным значениям.",
        measurements: [
          { label: "Диаметр", projectValue: 16, actualValue: 16, unit: "мм" },
          { label: "Шаг", projectValue: 200, actualValue: 198, unit: "мм" }
        ]
      },
      {
        id: "inspection-geometry-01",
        module: "geometry",
        title: "Геометрический контроль СТ-01",
        constructionMark: "СТ-01",
        createdAt: "2026-07-20T08:45:00.000Z",
        status: "deviation",
        summary: "Обнаружено превышение демонстрационного допуска.",
        measurements: [
          { label: "Отклонение", projectValue: 0, actualValue: 14, unit: "мм" }
        ]
      },
      {
        id: "inspection-repeat-01",
        module: "geometry",
        title: "Повторный контроль ПЛ-01",
        constructionMark: "ПЛ-01",
        createdAt: "2026-07-22T13:15:00.000Z",
        status: "done",
        summary: "Корректирующее действие подтверждено повторным контролем.",
        measurements: [
          { label: "Отклонение", projectValue: 0, actualValue: 3, unit: "мм" }
        ]
      }
    ],
    issues: [
      {
        id: "issue-open-01",
        title: "Отклонение положения стены",
        constructionMark: "СТ-01",
        description: "Требуется локальная корректировка положения опалубки.",
        createdAt: "2026-07-20T09:10:00.000Z",
        status: "open",
        linkedTaskId: "task-geometry-wall",
        repeatControlAt: null
      },
      {
        id: "issue-resolved-01",
        title: "Отметка плиты скорректирована",
        constructionMark: "ПЛ-01",
        description: "Корректировка выполнена и подтверждена повторным контролем.",
        createdAt: "2026-07-21T10:00:00.000Z",
        status: "resolved",
        linkedTaskId: "task-repeat-slab",
        repeatControlAt: "2026-07-22T13:15:00.000Z"
      }
    ],
    journal: [
      {
        id: "journal-01",
        createdAt: "2026-07-18T09:30:00.000Z",
        kind: "inspection",
        title: "Геодезический контроль",
        description: "ПЛ-01 — проверка завершена.",
        status: "done"
      },
      {
        id: "journal-02",
        createdAt: "2026-07-19T11:20:00.000Z",
        kind: "inspection",
        title: "Проверка армирования",
        description: "К-01 — отклонений не выявлено.",
        status: "done"
      },
      {
        id: "journal-03",
        createdAt: "2026-07-20T09:10:00.000Z",
        kind: "issue",
        title: "Открыто замечание",
        description: "СТ-01 — требуется корректировка.",
        status: "issue_open"
      },
      {
        id: "journal-04",
        createdAt: "2026-07-22T13:15:00.000Z",
        kind: "repeat-control",
        title: "Повторный контроль",
        description: "ПЛ-01 — замечание закрыто.",
        status: "resolved"
      }
    ]
  };
}
