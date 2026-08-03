export type DemoInspectionModule = "geodesy" | "reinforcement" | "geometry" | "strength";
export type DemoTaskScope = "object" | "factory" | "notApplicable";
export type DemoTaskStatus = "required" | "done" | "resolved" | "deviation" | "issue_open";
export type DemoInspectionStatus = "done" | "deviation" | "empty";
export type DemoIssueStatus = "open" | "resolved";

export interface DemoProject {
  id: string;
  name: string;
  organization: string;
  structureType: string;
}

export interface DemoBimElement {
  id: string;
  type: string;
  mark: string;
  level: string;
}

export interface DemoControlTask {
  id: string;
  module: DemoInspectionModule;
  title: string;
  constructionMark: string;
  inspectionStatus: DemoTaskScope;
  status: DemoTaskStatus;
}

export interface DemoMeasurement {
  label: string;
  projectValue: number;
  actualValue: number;
  unit: string;
}

export interface DemoInspection {
  id: string;
  module: DemoInspectionModule;
  title: string;
  constructionMark: string;
  createdAt: string;
  status: DemoInspectionStatus;
  summary: string;
  measurements: DemoMeasurement[];
}

export interface DemoIssue {
  id: string;
  title: string;
  constructionMark: string;
  description: string;
  createdAt: string;
  status: DemoIssueStatus;
  linkedTaskId: string | null;
  repeatControlAt: string | null;
}

export interface DemoJournalEntry {
  id: string;
  createdAt: string;
  kind: "inspection" | "issue" | "repeat-control";
  title: string;
  description: string;
  status: DemoTaskStatus;
}

export interface DemoState {
  schemaVersion: number;
  project: DemoProject;
  bimElements: DemoBimElement[];
  controlPlan: DemoControlTask[];
  inspections: DemoInspection[];
  issues: DemoIssue[];
  journal: DemoJournalEntry[];
}

export interface DemoInspectionInput {
  module: Exclude<DemoInspectionModule, "geodesy">;
  constructionMark: string;
  projectValue: number | null;
  actualValue: number | null;
  tolerance: number;
  unit: string;
}

export interface DemoIssueInput {
  title: string;
  constructionMark: string;
  description: string;
}

export interface DemoReadinessMetrics {
  completed: number;
  total: number;
  percent: number;
  openIssues: number;
  deviations: number;
  factoryTasks: number;
}
