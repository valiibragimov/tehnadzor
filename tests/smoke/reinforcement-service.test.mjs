import assert from "node:assert/strict";
import test from "node:test";

const {
  buildReinforcementJournalPayload,
  evaluateReinforcementCheck,
  isMeasurementWithinTolerance,
  isStrictMeasurementMatch
} = await import(
  "../../dist/features/inspections/reinforcement/evaluation.js"
);
const { createReinforcementService } = await import(
  "../../dist/features/inspections/reinforcement/service.js"
);
const {
  addReinforcementBeam,
  addReinforcementColumn,
  addReinforcementWall,
  clearReinforcementRows,
  clearReinforcementRowsByType,
  createReinforcementState,
  hasDuplicateBeamMarking,
  hasDuplicateColumnMarking,
  hasDuplicateWallAxes,
  removeReinforcementBeam,
  removeReinforcementColumn,
  removeReinforcementWall,
  setCurrentReinforcementCheckId
} = await import(
  "../../dist/features/inspections/reinforcement/state.js"
);

function createRepository(overrides = {}) {
  const calls = [];
  return {
    calls,
    repository: {
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
        return 3;
      },
      async refreshAnalytics(...args) {
        calls.push(["refreshAnalytics", ...args]);
      },
      async clearInspections(...args) {
        calls.push(["clearInspections", ...args]);
        return 2;
      },
      ...overrides
    }
  };
}

test("reinforcement state adds and removes columns, beams and walls", () => {
  const state = createReinforcementState();
  addReinforcementColumn(state, 10, 1);
  addReinforcementBeam(state, 10, 2);
  addReinforcementWall(state, 10, 3);

  assert.deepEqual(
    [state.columns[0].id, state.beams[0].id, state.walls[0].id],
    [1, 2, 3]
  );

  removeReinforcementColumn(state, 1);
  removeReinforcementBeam(state, 2);
  removeReinforcementWall(state, 3);
  assert.deepEqual(
    [state.columns.length, state.beams.length, state.walls.length],
    [0, 0, 0]
  );
});

test("reinforcement state enforces per-construction limits", () => {
  const state = createReinforcementState();
  assert.equal(addReinforcementColumn(state, 1, 1).added, true);
  assert.deepEqual(addReinforcementColumn(state, 1, 2), {
    added: false,
    reason: "limit"
  });
  assert.equal(addReinforcementBeam(state, 1, 3).added, true);
  assert.equal(addReinforcementBeam(state, 1, 4).added, false);
  assert.equal(addReinforcementWall(state, 1, 5).added, true);
  assert.equal(addReinforcementWall(state, 1, 6).added, false);
});

test("reinforcement state detects normalized duplicate markings", () => {
  const state = createReinforcementState();
  addReinforcementColumn(state, 10, 1);
  addReinforcementBeam(state, 10, 2);
  state.columns[0].marking = " К-1 ";
  state.beams[0].marking = "Б  2";

  assert.equal(hasDuplicateColumnMarking(state, "к-1"), true);
  assert.equal(hasDuplicateColumnMarking(state, "К-1", 1), false);
  assert.equal(hasDuplicateBeamMarking(state, "б 2"), true);
});

test("reinforcement walls treat reversed extreme axes as duplicates", () => {
  const state = createReinforcementState();
  addReinforcementWall(state, 10, 1);
  Object.assign(state.walls[0], {
    numberAxis: "5",
    letterAxis1: "А",
    letterAxis2: "Г"
  });
  assert.equal(hasDuplicateWallAxes(state, {
    bindingType: "number_letters",
    numberAxis: "5",
    letterAxis1: "Г",
    letterAxis2: "А",
    letterAxis: "",
    numberAxis1: "",
    numberAxis2: ""
  }), true);

  state.walls[0].bindingType = "letter_numbers";
  Object.assign(state.walls[0], {
    letterAxis: "Б",
    numberAxis1: "12",
    numberAxis2: "3"
  });
  assert.equal(hasDuplicateWallAxes(state, {
    bindingType: "letter_numbers",
    numberAxis: "",
    letterAxis1: "",
    letterAxis2: "",
    letterAxis: "Б",
    numberAxis1: "3",
    numberAxis2: "12"
  }), true);
});

test("reinforcement state clears all rows or one construction type", () => {
  const state = createReinforcementState();
  addReinforcementColumn(state, 10, 1);
  addReinforcementBeam(state, 10, 2);
  addReinforcementWall(state, 10, 3);
  clearReinforcementRowsByType(state, "Балка");
  assert.deepEqual(
    [state.columns.length, state.beams.length, state.walls.length],
    [1, 0, 1]
  );
  clearReinforcementRows(state);
  assert.deepEqual(
    [state.columns.length, state.beams.length, state.walls.length],
    [0, 0, 0]
  );
});

test("reinforcement evaluation applies tolerance and strict matching", () => {
  assert.equal(isMeasurementWithinTolerance(100, 105, 5), true);
  assert.equal(isMeasurementWithinTolerance(100, 106, 5), false);
  assert.equal(isStrictMeasurementMatch(12, 12), true);
  assert.equal(isStrictMeasurementMatch(12, 12.1), false);

  const ok = evaluateReinforcementCheck(
    { projDia: 12, factDia: 12, projStep: 100, factStep: 105 },
    { step: 5, cover: 5, hoopsStep: 5 }
  );
  const exceeded = evaluateReinforcementCheck(
    { projDia: 12, factDia: 14, projStep: 100, factStep: 106 },
    { step: 5, cover: 5, hoopsStep: 5 }
  );
  assert.equal(ok.status, "ok");
  assert.equal(exceeded.status, "exceeded");
});

test("reinforcement evaluation and journal payload preserve incomplete behavior", () => {
  const incomplete = evaluateReinforcementCheck(
    { projDia: 12 },
    { step: 5, cover: 5, hoopsStep: 5 }
  );
  const payload = buildReinforcementJournalPayload({
    construction: "column",
    floor: "2",
    columns: [{ projDia: 12, factDia: 14, projStep: 100, factStep: 107 }]
  });

  assert.equal(incomplete.status, "empty");
  assert.equal(payload.context, "Этаж 2");
  assert.match(payload.details, /Диаметр: 12→14/);
  assert.match(payload.details, /Шаг: 100→107/);
});

test("reinforcement service loads active documents only", async () => {
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
  const service = createReinforcementService(repository);

  assert.deepEqual([...await service.loadChecks("project-1")], [
    ["active", { id: "active", status: "ok", createdAt: 1234 }]
  ]);
});

test("reinforcement service creates and updates with dual-write", async () => {
  const { repository, calls } = createRepository();
  const service = createReinforcementService(repository);
  const created = { status: "ok" };
  const updated = { status: "exceeded" };

  await service.createCheck("project-1", created);
  await service.updateCheck("project-1", "check-1", updated);

  assert.deepEqual(calls, [
    ["createCheck", "project-1", created],
    ["refreshAnalytics", "project-1"],
    ["updateCheck", "project-1", "check-1", updated],
    ["refreshAnalytics", "project-1"]
  ]);
});

test("reinforcement service preserves source save on dual-write error", async () => {
  const warnings = [];
  const { repository } = createRepository({
    async refreshAnalytics() {
      throw new Error("offline");
    }
  });
  const service = createReinforcementService(repository, {
    warn(...args) {
      warnings.push(args);
    }
  });

  const result = await service.createCheck("project-1", { status: "ok" });
  assert.equal(result.id, "created-check");
  assert.equal(warnings.length, 1);
});

test("reinforcement service deletes and clears source plus projection", async () => {
  const { repository, calls } = createRepository();
  const service = createReinforcementService(repository);

  await service.deleteCheck("project-1", "check-1");
  const cleared = await service.clearChecks("project-1");

  assert.deepEqual(calls, [
    ["deleteCheck", "project-1", "check-1"],
    ["refreshAnalytics", "project-1"],
    ["clearChecks", "project-1"],
    ["clearInspections", "project-1"]
  ]);
  assert.deepEqual(cleared, {
    deletedCount: 3,
    deletedDualWriteCount: 2
  });
});

test("reinforcement current check id is explicit state", () => {
  const state = createReinforcementState();
  assert.equal(setCurrentReinforcementCheckId(state, " check-1 "), "check-1");
  assert.equal(state.currentCheckId, "check-1");
  assert.equal(setCurrentReinforcementCheckId(state, null), null);
});
