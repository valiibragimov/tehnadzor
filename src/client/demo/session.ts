import { createDemoFixtures, DEMO_SCHEMA_VERSION } from "./fixtures.js";
import type { DemoStorage } from "./storage.js";
import type { DemoState } from "./types.js";

const SCHEMA_KEY = "schema";
const STATE_KEY = "state";

function cloneState(state: DemoState): DemoState {
  return structuredClone(state);
}

export interface DemoSession {
  initialize(): DemoState;
  read(): DemoState;
  write(state: DemoState): DemoState;
  reset(): DemoState;
}

export function createDemoSession(storage: DemoStorage): DemoSession {
  const persist = (state: DemoState) => {
    storage.set(SCHEMA_KEY, String(DEMO_SCHEMA_VERSION));
    storage.set(STATE_KEY, JSON.stringify(state));
    return cloneState(state);
  };

  const initialize = () => {
    const schema = Number(storage.get(SCHEMA_KEY) || 0);
    const storedState = storage.get(STATE_KEY);

    if (schema === DEMO_SCHEMA_VERSION && storedState) {
      try {
        const parsed = JSON.parse(storedState) as DemoState;
        if (parsed?.schemaVersion === DEMO_SCHEMA_VERSION) return cloneState(parsed);
      } catch {
        // Corrupted demo state is replaced only inside the isolated demo namespace.
      }
    }

    return persist(createDemoFixtures());
  };

  return {
    initialize,
    read: initialize,
    write: (state) => persist(state),
    reset: () => {
      storage.clearNamespace();
      return persist(createDemoFixtures());
    }
  };
}
