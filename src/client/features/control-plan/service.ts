import {
  getConstructionCategoryLabel,
  getConstructionLabel,
  getConstructionModuleBehavior,
  normalizeConstructionKey
} from "../../app/construction.js";
import {
  getInspectionConfig,
  getInspectionModuleStatus,
  type InspectionModule,
  type InspectionStatus
} from "../../app/inspection-registry.js";
import { getProjectCollectionSnapshot } from "../../app/repositories/firestore-repository.js";
import { loadJournalEntries } from "../journal/index.js";
import {
  getRuntimeIssueStatus,
  hasIssueRepeatControl,
  loadProjectIssues
} from "../../app/services/issues.js";
import type { IssueRecord, JournalEntryRecord, ProjectInspectionSources, SummaryRecord } from "../../types/module-records.js";

export type ControlPlanTaskStatus =
  | "required"
  | "done"
  | "deviation"
  | "issue_open"
  | "resolved"
  | "factory_control";

export type ControlPlanConstructionStatus =
  | "not_started"
  | "in_progress"
  | "missing_required"
  | "blocked"
  | "ready";

export interface ControlPlanModuleDefinition {
  key: string;
  inspectionModule: InspectionModule;
}

export interface ControlPlanTask {
  id: string;
  moduleKey: string;
  status: ControlPlanTaskStatus;
  inspectionStatus: InspectionStatus;
  normativeBasis: string;
  latestAt: number | null;
  latestDetails: string;
  checksCount: number;
  exceededCount: number;
  openIssues: number;
  closedIssues: number;
  repeatControls: number;
  actionTarget: string;
}

export interface ControlPlanRow {
  id: string;
  constructionKey: string;
  constructionLabel: string;
  constructionCategory: string;
  constructionCategoryLabel: string;
  context: string;
  displayName: string;
  status: ControlPlanConstructionStatus;
  progressDone: number;
  progressTotal: number;
  openIssues: number;
  overdueIssues: number;
  nextAction: "accept" | "open_issue" | "deviation" | "documents" | "inspect" | "no_data";
  nextActionModule: string;
  nextActionTarget: string;
  tasks: ControlPlanTask[];
}

export interface ControlPlanSummary {
  totalRows: number;
  readyRows: number;
  blockedRows: number;
  missingRows: number;
  totalTasks: number;
  doneTasks: number;
  missingTasks: number;
  openIssues: number;
  overdueIssues: number;
}

export interface ControlPlanResult {
  rows: ControlPlanRow[];
  summary: ControlPlanSummary;
  generatedAt: number;
}

const CONTROL_PLAN_MODULES: readonly ControlPlanModuleDefinition[] = Object.freeze([
  {
    key: "geo",
    inspectionModule: "geodesy",
  },
  {
    key: "reinforcement",
    inspectionModule: "reinforcement",
  },
  {
    key: "geometry",
    inspectionModule: "geometry",
  },
  {
    key: "strength",
    inspectionModule: "strength",
  }
]);

const MODULE_LABEL_TO_KEY: Readonly<Record<string, string>> = Object.freeze({
  геодезия: "geo",
  армирование: "reinforcement",
  геометрия: "geometry",
  прочность: "strength",
  "прочность бетона": "strength"
});

const MODULE_COLLECTIONS = Object.freeze({
  geo: "geoNodes",
  reinforcement: "reinfChecks",
  geometry: "geomChecks",
  strength: "strengthChecks"
});

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLocaleLowerCase("ru");
}

function normalizeModuleKey(value: unknown) {
  const normalized = normalizeLower(value);
  if (!normalized) return "";
  if (MODULE_LABEL_TO_KEY[normalized]) return MODULE_LABEL_TO_KEY[normalized];
  if (normalized === "geo" || normalized.includes("геод")) return "geo";
  if (normalized === "reinforcement" || normalized === "reinf" || normalized.includes("арм")) return "reinforcement";
  if (normalized === "geometry" || normalized === "geom" || normalized.includes("геометр")) return "geometry";
  if (normalized === "strength" || normalized.includes("проч")) return "strength";
  return "";
}

function sourceCollectionToModuleKey(value: unknown) {
  const normalized = normalizeLower(value).replace(/\s+/g, "");
  if (normalized === "geonodes") return "geo";
  if (normalized === "reinfchecks") return "reinforcement";
  if (normalized === "geomchecks") return "geometry";
  if (normalized === "strengthchecks") return "strength";
  return "";
}

function parseTimestampMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return asNumber > 0 && asNumber < 1e12 ? Math.round(asNumber * 1000) : Math.round(asNumber);
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === "object" && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    const ms = date instanceof Date ? date.getTime() : Number.NaN;
    return Number.isFinite(ms) ? ms : null;
  }
  if (
    typeof value === "object" &&
    Number.isFinite((value as Record<string, number>).seconds) &&
    Number.isFinite((value as Record<string, number>).nanoseconds)
  ) {
    const timestamp = value as Record<string, number>;
    return Math.round(timestamp.seconds * 1000 + timestamp.nanoseconds / 1e6);
  }
  return null;
}

function resolveRecordTimestampMs(record: Record<string, unknown>) {
  return (
    parseTimestampMs(record.updatedAt) ??
    parseTimestampMs(record.timestamp) ??
    parseTimestampMs(record.checkedAt) ??
    parseTimestampMs(record.createdAt) ??
    parseTimestampMs(record.date)
  );
}

function resolveRecordStatus(record: Record<string, unknown>) {
  if (getRecordModuleKey(record) === "geo" && record.evaluationSchemaVersion !== 2) return "";
  const normalized = normalizeLower(record.checkStatus ?? record.status ?? record.summaryText);
  const compact = normalized.replace(/\s+/g, "");
  if (["exceeded", "bad", "ошибка", "недобор", "fail", "failed"].includes(compact) ||
      /не\s*соответ|не\s*в\s*норм|несоответств|превыш|отклон/u.test(normalized)) {
    return "exceeded";
  }
  if (record.evaluationSchemaVersion !== 2) return "";
  if (["ok", "внорме", "соответствует"].includes(compact) || /^(?:в\s*норме|соответствует)(?:\s|$)/u.test(normalized)) return "ok";
  return "";
}

function getRecordModuleKey(record: Record<string, unknown>) {
  return (
    normalizeModuleKey(record.moduleKey) ||
    normalizeModuleKey(record.module) ||
    normalizeModuleKey(record.moduleName) ||
    sourceCollectionToModuleKey(record.sourceCollection)
  );
}

function getRecordConstructionKey(record: Record<string, unknown>, fallback = "floor_slab") {
  return normalizeConstructionKey(
    record.construction ??
      record.constructionType ??
      record.constructionLabel ??
      record.checkKind,
    fallback
  );
}

function getRecordConstructionLabel(record: Record<string, unknown>, constructionKey: string) {
  return normalizeText(record.constructionLabel) ||
    getConstructionLabel(constructionKey) ||
    normalizeText(record.construction) ||
    normalizeText(record.constructionType) ||
    "Конструкция";
}

function decodeSourceContext(value: unknown, constructionKey: string) {
  const text = normalizeText(value);
  if (!text || !text.includes(":")) return "";

  const [rawPrefix, ...rest] = text.split(":");
  const prefixKey = normalizeConstructionKey(rawPrefix, "");
  if (!prefixKey || prefixKey !== constructionKey || rest.length === 0) return "";

  return rest.join(":")
    .replace(/_/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function getRecordContext(record: Record<string, unknown>) {
  const constructionKey = getRecordConstructionKey(record);
  const formworkTarget = normalizeText(record.formworkElementName ?? record.formworkArea);
  if (formworkTarget) {
    const floor = normalizeText(record.floor);
    return ["Опалубка", formworkTarget, floor ? `этаж ${floor}` : ""].filter(Boolean).join(", ");
  }

  const explicitContext = normalizeText(
    record.context ??
      record.node ??
      record.location ??
      record.marking ??
      record.stairName ??
      record.formworkElementName ??
      ""
  );
  if (explicitContext) return decodeSourceContext(explicitContext, constructionKey) || explicitContext;
  return decodeSourceContext(record.sourceId, constructionKey);
}

function getContextKey(value: unknown) {
  return normalizeLower(value)
    .replace(/[×xх]/g, "-")
    .replace(/[:_]+/g, "-")
    .replace(/[,\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getRowId(constructionKey: string, context: string) {
  return `${constructionKey}::${getContextKey(context) || "overall"}`;
}

function getIssueConstructionKey(issue: IssueRecord) {
  return normalizeConstructionKey(issue.construction ?? issue.constructionLabel, "floor_slab");
}

function issueMatchesRow(issue: IssueRecord, row: { constructionKey: string; context: string }, inspections: Record<string, unknown>[][] = []) {
  const linked = findIssueInspection(issue, inspections);
  if (linked) return recordMatchesRow(linked.find(record => record.sourceCollection === "journal") || linked[0], row);
  if (getIssueConstructionKey(issue) !== row.constructionKey) return false;
  const issueContext = getContextKey(issue.context);
  const rowContext = getContextKey(row.context);
  if (!rowContext || !issueContext) return true;
  return issueContext === rowContext;
}

function recordHasJournalLink(record: Record<string, unknown>, sourceRowMap: Map<string, string>) {
  const candidates = [
    record.sourceId,
    record.sourceDocId,
    record.sourceInspectionId,
    record._docId,
    record.id
  ];
  return candidates.some((value) => {
    const sourceId = normalizeText(value);
    return sourceId && sourceRowMap.has(`${getRecordModuleKey(record)}:${sourceId}`);
  });
}

function recordMatchesRow(record: Record<string, unknown>, row: { constructionKey: string; context: string }) {
  if (getRecordConstructionKey(record, row.constructionKey) !== row.constructionKey) return false;
  const recordContext = getContextKey(getRecordContext(record));
  const rowContext = getContextKey(row.context);
  if (!rowContext || !recordContext) return true;
  return recordContext === rowContext;
}

function formatNormativeBasis(constructionKey: string, module: ControlPlanModuleDefinition, subtype = "") {
  const config = getInspectionConfig(constructionKey, module.inspectionModule, subtype);
  const docs = config?.normativeDocs || [];
  if (!docs.length) return "Нормативная матрица Tehnadzor";
  return docs
    .map((doc) => [doc.document, doc.clause, doc.tolerance].filter(Boolean).join(", "))
    .filter(Boolean)
    .join("; ");
}

function getTaskActionTarget(status: ControlPlanTaskStatus, moduleKey: string) {
  if (status === "deviation" || status === "issue_open") return "journal";
  return moduleKey === "geo" ? "geo" : moduleKey;
}

function uniqueInspectionRecords(records: Record<string, unknown>[]) {
  const byIdentity = new Map<string, Record<string, unknown>[]>();
  const inspections = new Set<Record<string, unknown>[]>();
  for (const record of records) {
    const sourceIds = [record.sourceId, record.sourceDocId].map(normalizeText).filter(Boolean);
    const documentId = normalizeText(record._docId) || normalizeText(record.id);
    const moduleKey = getRecordModuleKey(record);
    const keys = sourceIds.map(id => `${moduleKey}:source:${id}`);
    if (documentId) keys.push(`${moduleKey}:${record.sourceCollection === "journal" ? "journal" : "source"}:${documentId}`);
    const matches = [...new Set(keys.map(key => byIdentity.get(key)).filter(Boolean))];
    const inspection = matches[0] || [];
    for (const other of matches.slice(1)) {
      inspection.push(...other);
      inspections.delete(other);
      for (const [key, group] of byIdentity) if (group === other) byIdentity.set(key, inspection);
    }
    inspection.push(record);
    inspections.add(inspection);
    for (const key of keys) byIdentity.set(key, inspection);
  }
  // Joining aliases can merge groups created at different times.
  return [...inspections].map(inspection => inspection.sort((a, b) =>
    (resolveRecordTimestampMs(b) || 0) - (resolveRecordTimestampMs(a) || 0)
  )).sort((a, b) => (resolveRecordTimestampMs(b[0]) || 0) - (resolveRecordTimestampMs(a[0]) || 0));
}

function issueReferencesRecord(issue: IssueRecord, record: Record<string, unknown>) {
  const sourceId = normalizeText(issue.sourceInspectionId);
  const journalId = normalizeText(issue.sourceJournalEntryId);
  if (journalId && record.sourceCollection === "journal" && journalId === normalizeText(record.id)) return true;
  return Boolean(sourceId && [record.sourceId, record.sourceDocId,
    ...(record.sourceCollection === "journal" ? [] : [record._docId, record.id])
  ].some(id => normalizeText(id) === sourceId));
}

function findIssueInspection(issue: IssueRecord, inspections: Record<string, unknown>[][]) {
  const moduleKey = getRecordModuleKey(issue);
  const links: IssueRecord[] = [];
  if (normalizeText(issue.sourceInspectionId)) links.push({ sourceInspectionId: issue.sourceInspectionId });
  if (normalizeText(issue.sourceJournalEntryId)) links.push({ sourceJournalEntryId: issue.sourceJournalEntryId });
  if (!links.length) return undefined;
  return inspections.find(inspection => getRecordModuleKey(inspection[0]) === moduleKey &&
    links.every(link => inspection.some(record => issueReferencesRecord(link, record)))
  );
}

function repeatControlSucceeded(issue: IssueRecord, original: Record<string, unknown>[], inspections: Record<string, unknown>[][]) {
  if (issue.repeatControlStatus && issue.repeatControlStatus !== "ok") return false;
  const sourceInspectionId = normalizeText(issue.repeatControlInspectionId);
  const sourceJournalEntryId = normalizeText(issue.repeatControlJournalEntryId);
  // Historical closures remain stored, but cannot prove a successful repeat control.
  if (!sourceInspectionId && !sourceJournalEntryId) return false;
  const repeat = findIssueInspection({ moduleKey: getRecordModuleKey(issue), sourceInspectionId, sourceJournalEntryId }, inspections);
  return Boolean(repeat && repeat !== original && resolveRecordStatus(repeat[0]) === "ok");
}

function buildTask(
  row: { constructionKey: string; context: string },
  module: ControlPlanModuleDefinition,
  inspections: Record<string, unknown>[][],
  issues: readonly IssueRecord[]
): ControlPlanTask | null {
  const inspectionStatus = getInspectionModuleStatus(row.constructionKey, module.inspectionModule);
  const behavior = getConstructionModuleBehavior(row.constructionKey, module.key === "geo" ? "geo" : module.key as never);
  if (inspectionStatus === "notApplicable" || behavior.supported === false) return null;

  const moduleInspections = inspections
    .filter(inspection => getRecordModuleKey(inspection[0]) === module.key)
    .filter(inspection => recordMatchesRow(
      inspection.find(record => record.sourceCollection === "journal") || inspection[0], row
    ));
  const moduleRecords = moduleInspections.map(inspection => inspection[0]);
  const moduleIssues = issues.filter((issue) => {
    const issueModuleKey = normalizeModuleKey(issue.moduleKey || issue.module);
    return issueModuleKey === module.key && issueMatchesRow(issue, row, inspections);
  });
  const openIssues = moduleIssues.filter((issue) => getRuntimeIssueStatus(issue) !== "closed").length;
  const closedIssues = moduleIssues.filter((issue) => getRuntimeIssueStatus(issue) === "closed").length;
  const repeatControls = moduleIssues.filter((issue) => hasIssueRepeatControl(issue)).length;
  const exceededInspections = moduleInspections.filter(inspection => resolveRecordStatus(inspection[0]) === "exceeded");
  const exceededCount = exceededInspections.length;
  const unresolvedRecords = exceededInspections.filter(inspection => !moduleIssues.some(issue =>
    getRuntimeIssueStatus(issue) === "closed" &&
    repeatControlSucceeded(issue, inspection, moduleInspections) &&
    findIssueInspection(issue, inspections) === inspection
  ));
  const okCount = moduleRecords.filter((record) => resolveRecordStatus(record) === "ok").length;
  const latest = moduleRecords[0] || null;

  let status: ControlPlanTaskStatus = "required";
  if (openIssues > 0) {
    status = "issue_open";
  } else if (unresolvedRecords.length > 0) {
    status = "deviation";
  } else if (exceededCount > 0) {
    status = "resolved";
  } else if (okCount > 0) {
    status = "done";
  } else if (inspectionStatus === "factory") {
    status = "factory_control";
  }

  return {
    id: `${row.constructionKey}-${module.key}`,
    moduleKey: module.key,
    status,
    inspectionStatus,
    normativeBasis: formatNormativeBasis(row.constructionKey, module),
    latestAt: latest ? resolveRecordTimestampMs(latest) : null,
    latestDetails: latest ? normalizeText(latest.details ?? latest.summaryText ?? latest.result ?? "") : "",
    checksCount: moduleRecords.length,
    exceededCount,
    openIssues,
    closedIssues,
    repeatControls,
    actionTarget: getTaskActionTarget(status, module.key)
  };
}

function buildConstructionStatus(tasks: ControlPlanTask[]): ControlPlanConstructionStatus {
  if (tasks.length === 0) return "not_started";
  if (tasks.some((task) => task.status === "issue_open" || task.status === "deviation")) return "blocked";
  if (tasks.some((task) => task.status === "required")) {
    return tasks.some((task) => task.checksCount > 0 || task.status === "resolved" || task.status === "done")
      ? "missing_required"
      : "not_started";
  }
  if (tasks.every((task) => task.status === "done" || task.status === "resolved" || task.status === "factory_control")) return "ready";
  return "in_progress";
}

function buildNextAction(tasks: ControlPlanTask[]): Pick<ControlPlanRow, "nextAction" | "nextActionModule" | "nextActionTarget"> {
  const actionTask =
    tasks.find((task) => task.status === "issue_open") ||
    tasks.find((task) => task.status === "deviation") ||
    tasks.find((task) => task.status === "required") ||
    tasks.find((task) => task.status === "factory_control") ||
    null;

  return {
    nextAction: !actionTask ? "accept" : actionTask.status === "issue_open" ? "open_issue" : actionTask.status === "deviation" ? "deviation" : actionTask.status === "factory_control" ? "documents" : "inspect",
    nextActionModule: actionTask?.moduleKey || "",
    nextActionTarget: actionTask?.actionTarget || "summary"
  };
}

function addRowCandidate(
  map: Map<string, ControlPlanRow>,
  source: Record<string, unknown>,
  fallbackConstructionKey = "floor_slab"
) {
  const constructionKey = getRecordConstructionKey(source, fallbackConstructionKey);
  const context = getRecordContext(source);
  const id = getRowId(constructionKey, context);
  if (map.has(id)) return map.get(id) || null;

  const category = normalizeText(source.constructionCategory) || "";
  const constructionLabel = getRecordConstructionLabel(source, constructionKey);
  const row: ControlPlanRow = {
    id,
    constructionKey,
    constructionLabel,
    constructionCategory: category,
    constructionCategoryLabel: category ? getConstructionCategoryLabel(category) : "",
    context,
    displayName: context ? `${constructionLabel}, ${context}` : constructionLabel,
    status: "not_started",
    progressDone: 0,
    progressTotal: 0,
    openIssues: 0,
    overdueIssues: 0,
    nextAction: "no_data",
    nextActionModule: "",
    nextActionTarget: "controlPlan",
    tasks: []
  };
  map.set(id, row);
  return row;
}

async function loadProjectCollectionRecords(projectId: string, sources?: ProjectInspectionSources) {
  const collections = ["inspections", ...Object.values(MODULE_COLLECTIONS)];
  const nested = await Promise.all(
    collections.map(async (collectionName) => {
      const records = sources?.collections[collectionName];
      if (records) return records.map(record => ({ ...record, sourceCollection: collectionName }));
      const snap = await getProjectCollectionSnapshot(projectId, collectionName);
      return snap.docs.map((docRef) => ({
        ...docRef.data(),
        _docId: docRef.id,
        sourceCollection: collectionName
      }));
    })
  );
  return nested.flat() as SummaryRecord[];
}

export async function loadProjectControlPlan(
  projectId: string,
  options: { fallbackConstruction?: string | null; fallbackConstructionLabel?: string | null; sources?: ProjectInspectionSources } = {}
): Promise<ControlPlanResult> {
  const generatedAt = Date.now();
  if (!projectId) {
    return {
      generatedAt,
      rows: [],
      summary: {
        totalRows: 0,
        readyRows: 0,
        blockedRows: 0,
        missingRows: 0,
        totalTasks: 0,
        doneTasks: 0,
        missingTasks: 0,
        openIssues: 0,
        overdueIssues: 0
      }
    };
  }

  if (options.sources && options.sources.projectId !== projectId) throw new Error("Inspection sources belong to another project.");
  const [journalEntries, projectRecords, issues] = await Promise.all([
    loadJournalEntries(projectId),
    loadProjectCollectionRecords(projectId, options.sources),
    options.sources?.issues ?? loadProjectIssues(projectId)
  ]);

  const inspections = uniqueInspectionRecords([
    ...(journalEntries as JournalEntryRecord[]).map(entry => ({ ...entry, sourceCollection: "journal" })),
    ...projectRecords
  ]);
  const rowMap = new Map<string, ControlPlanRow>();
  const sourceRowMap = new Map<string, string>();

  (journalEntries as JournalEntryRecord[]).forEach((entry) => {
    const row = addRowCandidate(rowMap, entry as Record<string, unknown>);
    const rowId = row?.id || "";
    [entry.id, entry.sourceId].forEach((value) => {
      const sourceId = normalizeText(value);
      if (sourceId && rowId) sourceRowMap.set(`${getRecordModuleKey(entry)}:${sourceId}`, rowId);
    });
  });

  issues.forEach((issue) => {
    const linked = findIssueInspection(issue, inspections);
    const journalRecord = linked?.find(record => record.sourceCollection === "journal");
    const row = addRowCandidate(rowMap, journalRecord || issue as Record<string, unknown>);
    const rowId = row?.id || "";
    [
      issue.sourceInspectionId,
      issue.sourceJournalEntryId,
      issue.repeatControlInspectionId,
      issue.repeatControlJournalEntryId
    ].forEach((value) => {
      const sourceId = normalizeText(value);
      if (sourceId && rowId) sourceRowMap.set(`${getRecordModuleKey(issue)}:${sourceId}`, rowId);
    });
  });

  // Join identities before selecting linked records, including sources reached
  // through a registry document ID rather than directly from the journal.
  const allInspections = inspections.filter(inspection => inspection.some(record =>
    record.sourceCollection === "journal" || recordHasJournalLink(record, sourceRowMap)
  ));

  const rows = Array.from(rowMap.values()).map((row) => {
    const tasks = CONTROL_PLAN_MODULES
      .map((module) => buildTask(row, module, allInspections, issues))
      .filter(Boolean) as ControlPlanTask[];
    const status = buildConstructionStatus(tasks);
    const progressDone = tasks.filter((task) =>
      task.status === "done" ||
      task.status === "resolved" ||
      task.status === "factory_control"
    ).length;
    const rowIssues = issues.filter((issue) => issueMatchesRow(issue, row, allInspections));
    const openIssues = rowIssues.filter((issue) => getRuntimeIssueStatus(issue) !== "closed").length;
    const overdueIssues = rowIssues.filter((issue) => getRuntimeIssueStatus(issue) === "overdue").length;
    const nextAction = buildNextAction(tasks);

    return {
      ...row,
      status,
      progressDone,
      progressTotal: tasks.length,
      openIssues,
      overdueIssues,
      ...nextAction,
      tasks
    };
  }).sort((a, b) => {
    const order: Record<ControlPlanConstructionStatus, number> = {
      blocked: 0,
      missing_required: 1,
      in_progress: 2,
      not_started: 3,
      ready: 4
    };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.displayName.localeCompare(b.displayName, "ru");
  });

  const summary: ControlPlanSummary = {
    totalRows: rows.length,
    readyRows: rows.filter((row) => row.status === "ready").length,
    blockedRows: rows.filter((row) => row.status === "blocked").length,
    missingRows: rows.filter((row) => row.status === "missing_required" || row.status === "not_started").length,
    totalTasks: rows.reduce((sum, row) => sum + row.progressTotal, 0),
    doneTasks: rows.reduce((sum, row) => sum + row.progressDone, 0),
    missingTasks: rows.reduce((sum, row) => sum + row.tasks.filter((task) => task.status === "required").length, 0),
    openIssues: rows.reduce((sum, row) => sum + row.openIssues, 0),
    overdueIssues: rows.reduce((sum, row) => sum + row.overdueIssues, 0)
  };

  return { rows, summary, generatedAt };
}
