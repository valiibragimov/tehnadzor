import type {
  StrengthCheckRecord,
  StrengthState
} from "./types.js";

export function createStrengthState(): StrengthState {
  return {
    checks: new Map<string, StrengthCheckRecord>(),
    currentCheckId: null
  };
}

export function setCurrentStrengthCheckId(
  state: StrengthState,
  checkId: string | null | undefined
) {
  const normalized = String(checkId || "").trim();
  state.currentCheckId = normalized || null;
  return state.currentCheckId;
}

export function replaceStrengthChecks(
  state: StrengthState,
  checks: Map<string, StrengthCheckRecord>
) {
  state.checks.clear();
  checks.forEach((check, id) => {
    state.checks.set(id, check);
  });
}
