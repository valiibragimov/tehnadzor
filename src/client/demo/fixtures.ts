import type { Project, BimElement, Inspection } from "../types/domain.js";
import type { ReinforcementCheckRecord } from "../features/inspections/reinforcement/index.js";
import type { StrengthCheckRecord } from "../features/inspections/strength/index.js";
import type { GeometryCheckRecord, IssueRecord, JournalEntryRecord } from "../types/module-records.js";
import { DEMO_PROJECT_ID, DEMO_USER_ID } from "./runtime-context.js";

export interface DemoDatabaseState {
  schemaVersion: 2;
  projects: Record<string, Project>;
  users: Record<string, Record<string, unknown>>;
  projectCollections: Record<string, Record<string, Record<string, Record<string, unknown>>>>;
  journal: Record<string, JournalEntryRecord>;
}

const checkedAt = Date.UTC(2026, 6, 24, 9, 30);

export function createDemoFixtures(): DemoDatabaseState {
  const project: Project = {
    id: DEMO_PROJECT_ID,
    name: "ЖК «Демонстрационный»",
    ownerUid: DEMO_USER_ID,
    createdBy: DEMO_USER_ID,
    engineer: "Демо-инженер",
    contractorName: "ООО «СтройДемо»",
    construction: "foundation_slab",
    date: "2026-07-24",
    projectGeo: { projX: null, projY: null, projH: 0 },
    reinfDesign: { projDia: 16, projStep: 200, projCover: 40 },
    geomDesign: { projThick: 500, tolThick: 10, tolVert: 8 },
    strengthDesign: { mark: "B25" }
  };

  const reinforcement: ReinforcementCheckRecord = {
    id: "reinf-demo-1",
    projectId: DEMO_PROJECT_ID,
    module: "Армирование",
    construction: "foundation_slab",
    constructionCategory: "foundation",
    constructionLabel: "Монолитная железобетонная плита",
    floor: "-1",
    location: "А-Г, 1-4",
    projDia: 16,
    factDia: 16,
    projStep: 200,
    factStep: 198,
    projCover: 40,
    factCover: 41,
    status: "ok",
    summaryText: "в норме",
    createdAt: checkedAt
  };
  const geometry: GeometryCheckRecord = {
    id: "geom-demo-1",
    projectId: DEMO_PROJECT_ID,
    module: "Геометрия",
    construction: "foundation_slab",
    constructionCategory: "foundation",
    constructionLabel: "Монолитная железобетонная плита",
    floor: "-1",
    location: "А-Г, 1-4",
    axisLetterFrom: "А",
    axisLetterTo: "Г",
    axisNumberFrom: "1",
    axisNumberTo: "4",
    projThick: 500,
    factThick: 514,
    projPlateHeight: 500,
    factPlateHeight: 514,
    status: "exceeded",
    summaryText: "превышено",
    createdAt: checkedAt + 3_600_000
  };
  const strength: StrengthCheckRecord = {
    id: "strength-demo-1",
    projectId: DEMO_PROJECT_ID,
    module: "Прочность",
    construction: "foundation_slab",
    constructionCategory: "foundation",
    constructionLabel: "Монолитная железобетонная плита",
    floor: "-1",
    location: "А-Г, 1-4",
    mark: "B25",
    markValue: 25,
    days: 28,
    actual: 27.2,
    status: "ok",
    summaryText: "в норме",
    createdAt: checkedAt + 7_200_000
  };
  const inspectionRecords: Record<string, Inspection> = {
    "inspection-reinf-demo-1": { ...reinforcement, id: "inspection-reinf-demo-1", sourceCollection: "reinfChecks", sourceId: "reinf-demo-1", moduleKey: "reinforcement", checkStatus: "ok" },
    "inspection-geom-demo-1": { ...geometry, id: "inspection-geom-demo-1", sourceCollection: "geomChecks", sourceId: "geom-demo-1", moduleKey: "geometry", checkStatus: "exceeded" },
    "inspection-strength-demo-1": { ...strength, id: "inspection-strength-demo-1", sourceCollection: "strengthChecks", sourceId: "strength-demo-1", moduleKey: "strength", checkStatus: "ok" }
  };
  const issue: IssueRecord = {
    id: "issue-demo-1",
    projectId: DEMO_PROJECT_ID,
    module: "Геометрия",
    moduleKey: "geometry",
    construction: "foundation_slab",
    constructionLabel: "Монолитная железобетонная плита",
    context: "А-Г, 1-4",
    title: "Отклонение толщины защитного слоя",
    description: "Зафиксировано демонстрационное отклонение.",
    correctiveAction: "Выполнить корректировку и повторный контроль.",
    responsibleName: "Демо-инженер",
    status: "issued",
    severity: "medium",
    createdAt: checkedAt + 3_900_000,
    dueDate: checkedAt + 7 * 86_400_000
  };
  const bimElement: BimElement = {
    id: "bim-demo-slab",
    elementId: "bim-demo-slab",
    sourceModelId: "synthetic-metadata",
    ifcGuid: null,
    type: "slab",
    name: "Фундаментная плита",
    description: "Синтетические BIM-метаданные",
    objectType: "Foundation slab",
    rawMark: "ФП-01",
    mark: "ФП-01",
    floor: "Подземный уровень",
    axes: "А-Г, 1-4",
    resolvedAxes: "А-Г, 1-4",
    projectX: null,
    projectY: null,
    projectH: 0
  };

  return {
    schemaVersion: 2,
    projects: { [DEMO_PROJECT_ID]: project },
    users: {
      [DEMO_USER_ID]: {
        uid: DEMO_USER_ID,
        firstName: "Демо",
        lastName: "Инженер",
        email: "demo@local.invalid",
        role: "engineer"
      }
    },
    projectCollections: {
      [DEMO_PROJECT_ID]: {
        geoNodes: {},
        reinfChecks: { "reinf-demo-1": reinforcement as Record<string, unknown> },
        geomChecks: { "geom-demo-1": geometry as Record<string, unknown> },
        strengthChecks: { "strength-demo-1": strength as Record<string, unknown> },
        inspections: inspectionRecords as Record<string, Record<string, unknown>>,
        issues: { "issue-demo-1": issue as Record<string, unknown> },
        elements: { "bim-demo-slab": bimElement as unknown as Record<string, unknown> },
        journalSessions: {}
      }
    },
    journal: {
      "journal-demo-1": {
        id: "journal-demo-1",
        projectId: DEMO_PROJECT_ID,
        module: "Армирование",
        construction: "foundation_slab",
        constructionLabel: "Монолитная железобетонная плита",
        context: "А-Г, 1-4",
        status: "ok",
        details: "Параметры армирования соответствуют проекту.",
        sourceId: "reinf-demo-1",
        timestamp: checkedAt
      },
      "journal-demo-2": {
        id: "journal-demo-2",
        projectId: DEMO_PROJECT_ID,
        module: "Геометрия",
        construction: "foundation_slab",
        constructionLabel: "Монолитная железобетонная плита",
        context: "А-Г, 1-4",
        status: "exceeded",
        details: "Обнаружено демонстрационное отклонение.",
        sourceId: "geom-demo-1",
        timestamp: checkedAt + 3_600_000
      }
    }
  };
}
