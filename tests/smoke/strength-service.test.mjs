import assert from "node:assert/strict";
import test from "node:test";

const {
  buildStrengthResultSeries,
  evaluateStrengthCheck,
  getNormativeStrength
} = await import(
  "../../dist/features/inspections/strength/evaluation.js"
);
const { createStrengthService } = await import(
  "../../dist/features/inspections/strength/service.js"
);
const {
  createStrengthState,
  setCurrentStrengthCheckId
} = await import(
  "../../dist/features/inspections/strength/state.js"
);

function createRepository(overrides = {}) {
  const calls = [];
  const repository = {
    async loadChecks() {
      return { forEach() {} };
    },
    async loadBimElements() {
      return { forEach() {} };
    },
    async createCheck(...args) {
      calls.push(["createCheck", ...args]);
      return { id: "created-check", ref: { path: "source/create" } };
    },
    async updateCheck(...args) {
      calls.push(["updateCheck", ...args]);
      return { id: args[1], ref: { path: "source/update" } };
    },
    async deleteCheck(...args) {
      calls.push(["deleteCheck", ...args]);
    },
    async clearChecks(...args) {
      calls.push(["clearChecks", ...args]);
      return 0;
    },
    async refreshAnalytics(...args) {
      calls.push(["refreshAnalytics", ...args]);
    },
    async clearInspections(...args) {
      calls.push(["clearInspections", ...args]);
      return 0;
    },
    ...overrides
  };
  return { repository, calls };
}

test("age alone does not define a normative acceptance strength", () => {
  for (const age of [0.5, 7, 28, 45]) assert.equal(getNormativeStrength(30, age), null);
});

test("strength evaluation reports incomplete input and missing actual strength", () => {
  const incomplete = evaluateStrengthCheck({
    mark: null,
    markValue: null,
    days: 7,
    actual: 15
  });
  const withoutActual = evaluateStrengthCheck({
    mark: "B30",
    markValue: 30,
    days: 7,
    actual: null
  });

  assert.equal(incomplete.status, "empty");
  assert.equal(incomplete.hasRequiredData, false);
  assert.equal(withoutActual.status, "empty");
  assert.equal(withoutActual.hasRequiredData, true);
  assert.equal(withoutActual.hasActual, false);
});

test("strength acceptance requires a confirmed assessment with applicability", () => {
  const base = { construction: "floor_slab", mark: "B30", days: 28, actual: 31 };
  assert.equal(evaluateStrengthCheck(base).status, "empty");
  const assessment = { reference: "Laboratory report 17, assessed B30", responsible: "Laboratory", date: "2026-10-20", confirmed: true, verdict: "conforms" };
  assert.equal(evaluateStrengthCheck({ ...base, assessment }).status, "ok");
  assert.equal(evaluateStrengthCheck({ ...base, assessment: { ...assessment, verdict: "nonconforms" } }).status, "exceeded");
});

test("strength chart shows measured evidence without a fabricated normative curve", () => {
  assert.deepEqual(buildStrengthResultSeries(30, 7, 20), { labels: [7], normative: [], actual: [20] });
});

test("strength service loads active checks and excludes soft-deleted records", async () => {
  const { repository } = createRepository({
    async loadChecks(projectId) {
      assert.equal(projectId, "project-1");
      const documents = [
        {
          id: "active",
          data: () => ({
            status: "ok",
            createdAt: { toMillis: () => 1234 }
          })
        },
        {
          id: "deleted",
          data: () => ({ deleted: true, status: "exceeded" })
        }
      ];
      return {
        forEach(callback) {
          documents.forEach(callback);
        }
      };
    }
  });
  const service = createStrengthService(repository);

  const checks = await service.loadChecks("project-1");

  assert.deepEqual([...checks.entries()], [
    ["active", { id: "active", status: "ok", createdAt: 1234 }]
  ]);
});

test("strength service saves a check before refreshing analytics", async () => {
  const { repository, calls } = createRepository();
  const service = createStrengthService(repository);
  const payload = { status: "ok", markValue: 30, actual: 31 };

  const result = await service.createCheck("project-1", payload);

  assert.equal(result.id, "created-check");
  assert.deepEqual(calls, [
    ["createCheck", "project-1", payload],
    ["refreshAnalytics", "project-1"]
  ]);
});

test("strength service updates a check before refreshing analytics", async () => {
  const { repository, calls } = createRepository();
  const service = createStrengthService(repository);
  const payload = { status: "exceeded", markValue: 30, actual: 28 };

  await service.updateCheck("project-1", "check-1", payload);

  assert.deepEqual(calls, [
    ["updateCheck", "project-1", "check-1", payload],
    ["refreshAnalytics", "project-1"]
  ]);
});

test("strength service keeps a saved source check when analytics refresh fails", async () => {
  const warnings = [];
  const { repository, calls } = createRepository({
    async refreshAnalytics() {
      throw new Error("offline");
    }
  });
  const service = createStrengthService(repository, {
    warn(...args) {
      warnings.push(args);
    }
  });

  const result = await service.createCheck("project-1", { status: "ok" });

  assert.equal(result.id, "created-check");
  assert.equal(calls[0][0], "createCheck");
  assert.equal(warnings.length, 1);
});

test("strength service deletes and clears source and inspection projections", async () => {
  const { repository, calls } = createRepository({
    async clearChecks(...args) {
      calls.push(["clearChecks", ...args]);
      return 3;
    },
    async clearInspections(...args) {
      calls.push(["clearInspections", ...args]);
      return 2;
    }
  });
  const service = createStrengthService(repository);

  await service.deleteCheck("project-1", "check-1");
  const result = await service.clearChecks("project-1");

  assert.deepEqual(calls, [
    ["deleteCheck", "project-1", "check-1"],
    ["refreshAnalytics", "project-1"],
    ["clearChecks", "project-1"],
    ["clearInspections", "project-1"]
  ]);
  assert.deepEqual(result, {
    deletedCount: 3,
    deletedDualWriteCount: 2
  });
});

test("strength state changes and clears the current check id explicitly", () => {
  const state = createStrengthState();

  assert.equal(state.currentCheckId, null);
  assert.equal(setCurrentStrengthCheckId(state, " check-1 "), "check-1");
  assert.equal(state.currentCheckId, "check-1");
  assert.equal(setCurrentStrengthCheckId(state, null), null);
  assert.equal(state.currentCheckId, null);
});
