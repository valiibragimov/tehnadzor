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
    async upsertInspection(...args) {
      calls.push(["upsertInspection", ...args]);
    },
    async deleteInspection(...args) {
      calls.push(["deleteInspection", ...args]);
    },
    async clearInspections(...args) {
      calls.push(["clearInspections", ...args]);
      return 0;
    },
    ...overrides
  };
  return { repository, calls };
}

test("strength normative calculation preserves age boundaries", () => {
  assert.equal(getNormativeStrength(30, 0.5), 6);
  assert.ok(
    Math.abs(
      getNormativeStrength(30, 7) -
        (30 * Math.log10(7)) / Math.log10(28)
    ) < 1e-10
  );
  assert.equal(getNormativeStrength(30, 28), 30);
  assert.equal(getNormativeStrength(30, 45), 30);
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

test("strength evaluation distinguishes compliance and shortfall", () => {
  const compliant = evaluateStrengthCheck({
    mark: "B30",
    markValue: 30,
    days: 28,
    actual: 31
  });
  const shortfall = evaluateStrengthCheck({
    mark: "B30",
    markValue: 30,
    days: 28,
    actual: 29
  });

  assert.equal(compliant.status, "ok");
  assert.equal(compliant.isCompliant, true);
  assert.equal(shortfall.status, "exceeded");
  assert.equal(shortfall.isCompliant, false);
});

test("strength chart data uses the same normative calculation", () => {
  const series = buildStrengthResultSeries(30, 7, 20);

  assert.equal(series.labels.length, 7);
  assert.equal(series.normative[6], getNormativeStrength(30, 7));
  assert.equal(series.actual[6], 20);
  assert.equal(series.actual.slice(0, 6).every((value) => value === null), true);
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

test("strength service saves source before creating its inspection projection", async () => {
  const { repository, calls } = createRepository();
  const service = createStrengthService(repository);
  const payload = { status: "ok", markValue: 30, actual: 31 };

  const result = await service.createCheck("project-1", payload);

  assert.equal(result.id, "created-check");
  assert.deepEqual(calls, [
    ["createCheck", "project-1", payload],
    ["upsertInspection", "project-1", "created-check", payload]
  ]);
});

test("strength service updates source before updating its inspection projection", async () => {
  const { repository, calls } = createRepository();
  const service = createStrengthService(repository);
  const payload = { status: "exceeded", markValue: 30, actual: 28 };

  await service.updateCheck("project-1", "check-1", payload);

  assert.deepEqual(calls, [
    ["updateCheck", "project-1", "check-1", payload],
    ["upsertInspection", "project-1", "check-1", payload]
  ]);
});

test("strength service keeps a saved source check when dual-write fails", async () => {
  const warnings = [];
  const { repository, calls } = createRepository({
    async upsertInspection() {
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
    ["deleteInspection", "project-1", "check-1"],
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
