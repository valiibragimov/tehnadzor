import assert from "node:assert/strict";
import test from "node:test";

const {
  buildOverviewReadinessMetrics,
  getOverviewModulePresentation
} = await import("../../dist/app/modules/overview-metrics.js");

function createTask(status, inspectionStatus = "object", moduleKey = "geo") {
  return { status, inspectionStatus, moduleKey };
}

function createControlPlan(tasks, summary = {}) {
  return {
    rows: [{ tasks }],
    summary: {
      readyRows: 0,
      totalRows: 1,
      ...summary
    }
  };
}

test("overview readiness rounds object tasks without a fixed module denominator", () => {
  const oneOfThree = buildOverviewReadinessMetrics(createControlPlan([
    createTask("done"),
    createTask("required", "object", "reinforcement"),
    createTask("required", "object", "geometry")
  ]));
  const twoOfThree = buildOverviewReadinessMetrics(createControlPlan([
    createTask("done"),
    createTask("resolved", "object", "reinforcement"),
    createTask("required", "object", "geometry")
  ]));
  const threeOfThree = buildOverviewReadinessMetrics(createControlPlan([
    createTask("done"),
    createTask("resolved", "object", "reinforcement"),
    createTask("done", "object", "geometry")
  ]));

  assert.equal(oneOfThree.readinessPercent, 33);
  assert.equal(twoOfThree.readinessPercent, 67);
  assert.equal(threeOfThree.readinessPercent, 100);
  assert.equal(buildOverviewReadinessMetrics(createControlPlan([createTask("done")])).readinessPercent, 100);
});

test("overview readiness excludes factory, not applicable and unsupported tasks", () => {
  const metrics = buildOverviewReadinessMetrics(createControlPlan([
    createTask("done"),
    createTask("factory_control", "factory", "reinforcement"),
    createTask("done", "notApplicable", "geometry"),
    createTask("done", "object", "unsupported-module")
  ]));

  assert.equal(metrics.completedRequiredTasks, 1);
  assert.equal(metrics.totalRequiredTasks, 1);
  assert.equal(metrics.readinessPercent, 100);
});

test("resolved is complete while issue_open remains incomplete", () => {
  const metrics = buildOverviewReadinessMetrics(createControlPlan([
    createTask("resolved"),
    createTask("issue_open", "object", "reinforcement")
  ]));

  assert.equal(metrics.completedRequiredTasks, 1);
  assert.equal(metrics.incompleteRequiredTasks, 1);
  assert.equal(metrics.openIssueTasks, 1);
  assert.equal(metrics.readinessPercent, 50);
});

test("fully ready positions stay separate from task readiness", () => {
  const metrics = buildOverviewReadinessMetrics(
    createControlPlan([createTask("done"), createTask("required")], { readyRows: 2, totalRows: 5 })
  );

  assert.equal(metrics.readinessPercent, 50);
  assert.equal(metrics.readyPositions, 2);
  assert.equal(metrics.totalPositions, 5);
});

test("non-applicable overview module is labelled as not required by plan", () => {
  const metrics = buildOverviewReadinessMetrics(createControlPlan([
    createTask("done", "object", "geo")
  ]));

  assert.deepEqual(
    getOverviewModulePresentation(metrics.modules.strength, 0, true),
    { tone: "neutral", status: "Не требуется по плану" }
  );
});
