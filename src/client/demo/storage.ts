import { createDemoFixtures, type DemoDatabaseState } from "./fixtures.js";
import { DEMO_DATABASE_KEY, DEMO_STORAGE_NAMESPACE } from "./runtime-context.js";

export interface StorageLike {
  readonly length: number;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface DemoDatabaseStore {
  read(): DemoDatabaseState;
  write(state: DemoDatabaseState): void;
  reset(): DemoDatabaseState;
  clearNamespace(): void;
  listKeys(): string[];
}

function isDemoDatabaseState(value: unknown): value is DemoDatabaseState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DemoDatabaseState>;
  return state.schemaVersion === 2 && !!state.projects && !!state.projectCollections && !!state.journal;
}

export function createDemoDatabaseStore(storage: StorageLike): DemoDatabaseStore {
  const listKeys = () => {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(DEMO_STORAGE_NAMESPACE)) keys.push(key);
    }
    return keys.sort();
  };
  const write = (state: DemoDatabaseState) => storage.setItem(DEMO_DATABASE_KEY, JSON.stringify(state));
  const reset = () => {
    for (const key of listKeys()) storage.removeItem(key);
    const fixtures = createDemoFixtures();
    write(fixtures);
    return fixtures;
  };
  const read = () => {
    const raw = storage.getItem(DEMO_DATABASE_KEY);
    if (!raw) return reset();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isDemoDatabaseState(parsed)) return parsed;
    } catch {
      // Invalid visitor data is safely replaced with deterministic fixtures.
    }
    return reset();
  };

  return {
    read,
    write,
    reset,
    clearNamespace: () => {
      for (const key of listKeys()) storage.removeItem(key);
    },
    listKeys
  };
}
