import type { DemoSession } from "../session.js";
import type {
  DemoControlTask,
  DemoInspection,
  DemoIssue,
  DemoJournalEntry,
  DemoState
} from "../types.js";

export interface DemoRepositoryOptions {
  session: DemoSession;
  createId?: (prefix: string) => string;
}

export interface DemoRepository {
  getState(): DemoState;
  reset(): DemoState;
  createInspection(value: Omit<DemoInspection, "id">): DemoInspection;
  updateInspection(id: string, patch: Partial<DemoInspection>): DemoInspection | null;
  deleteInspection(id: string): boolean;
  createIssue(value: Omit<DemoIssue, "id">): DemoIssue;
  updateIssue(id: string, patch: Partial<DemoIssue>): DemoIssue | null;
  deleteIssue(id: string): boolean;
  createJournalEntry(value: Omit<DemoJournalEntry, "id">): DemoJournalEntry;
  updateTask(id: string, patch: Partial<DemoControlTask>): DemoControlTask | null;
}

export function createDemoRepository({ session, createId }: DemoRepositoryOptions): DemoRepository {
  let sequence = 0;
  const nextId = createId || ((prefix: string) => `${prefix}-${Date.now()}-${++sequence}`);

  const mutate = <T>(callback: (state: DemoState) => T): T => {
    const state = session.read();
    const result = callback(state);
    session.write(state);
    return result;
  };

  return {
    getState: () => session.read(),
    reset: () => session.reset(),
    createInspection: (value) =>
      mutate((state) => {
        const record = { ...value, id: nextId("inspection") };
        state.inspections.unshift(record);
        return record;
      }),
    updateInspection: (id, patch) =>
      mutate((state) => {
        const index = state.inspections.findIndex((record) => record.id === id);
        if (index < 0) return null;
        state.inspections[index] = { ...state.inspections[index], ...patch, id };
        return state.inspections[index];
      }),
    deleteInspection: (id) =>
      mutate((state) => {
        const previousLength = state.inspections.length;
        state.inspections = state.inspections.filter((record) => record.id !== id);
        return state.inspections.length !== previousLength;
      }),
    createIssue: (value) =>
      mutate((state) => {
        const record = { ...value, id: nextId("issue") };
        state.issues.unshift(record);
        return record;
      }),
    updateIssue: (id, patch) =>
      mutate((state) => {
        const index = state.issues.findIndex((record) => record.id === id);
        if (index < 0) return null;
        state.issues[index] = { ...state.issues[index], ...patch, id };
        return state.issues[index];
      }),
    deleteIssue: (id) =>
      mutate((state) => {
        const previousLength = state.issues.length;
        state.issues = state.issues.filter((record) => record.id !== id);
        return state.issues.length !== previousLength;
      }),
    createJournalEntry: (value) =>
      mutate((state) => {
        const record = { ...value, id: nextId("journal") };
        state.journal.unshift(record);
        return record;
      }),
    updateTask: (id, patch) =>
      mutate((state) => {
        const index = state.controlPlan.findIndex((task) => task.id === id);
        if (index < 0) return null;
        state.controlPlan[index] = { ...state.controlPlan[index], ...patch, id };
        return state.controlPlan[index];
      })
  };
}
