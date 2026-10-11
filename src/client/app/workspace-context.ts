import type { GeometryCheckRecord } from "../types/module-records.js";
export interface WorkspaceContext {
  getProjectId(): string | null;
  selectProject(projectId: string): unknown;
  getEngineerName(): string;
  projectSelector: HTMLSelectElement | null;
  construction: HTMLSelectElement | null;
  dateInput: HTMLInputElement | null;
  nodes: Map<string, any>;
  geometryChecks: Map<string, GeometryCheckRecord>;
  geometryCheckId: string | null;
  inspectionState: Record<string, boolean>;
  inspectionChecked: Record<string, boolean>;
  setConstruction(value: string, subtype?: string, pileElement?: string): unknown;
}
