import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { resolve } from "node:path";

// Exercise the production plan and journal/issue readers with the existing demo
// persistence adapter. Only storage varies; domain rules are not mocked.
const values = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  }
});
const bundle = await build({
  stdin: {
    contents: `export { loadProjectControlPlan } from "./src/client/features/control-plan/service.ts";
      export { createDemoDatabaseStore } from "./src/client/demo/storage.ts";`,
    resolveDir: process.cwd()
  },
  bundle: true, write: false, format: "esm", platform: "node",
  plugins: [{
    name: "demo-persistence",
    setup(context) {
      context.onResolve({ filter: /firestore-repository\.js$/ }, () => ({
        path: resolve("src/client/demo/repositories/app-repository.ts")
      }));
      context.onResolve({ filter: /infrastructure\/firebase\/firestore\.js$/ }, () => ({
        path: resolve("src/client/demo/firebase-firestore-shim.ts")
      }));
    }
  }]
});
const { loadProjectControlPlan, createDemoDatabaseStore } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const store = createDemoDatabaseStore(localStorage);
const projectId = "synthetic-control-plan";
const checkedAt = Date.UTC(2026, 6, 24, 9, 30);

function check(overrides = {}) {
  return {
    evaluationSchemaVersion: 2, projectId, module: "Геометрия", moduleKey: "geometry",
    construction: "foundation_slab", context: "А-Г, 1-4",
    status: "exceeded", createdAt: checkedAt, ...overrides
  };
}

async function planTask({ journal = {}, inspections = {}, geomChecks = {}, issues = {}, collections = {}, moduleKey = "geometry" } = {}) {
  store.write({
    schemaVersion: 2, users: {}, projects: { [projectId]: { id: projectId } },
    journal,
    projectCollections: { [projectId]: { inspections, geomChecks, issues, ...collections } }
  });
  const plan = await loadProjectControlPlan(projectId);
  return plan.rows.find(row => row.context === "А-Г, 1-4")?.tasks.find(task => task.moduleKey === moduleKey);
}

test("control plan counts one inspection once across journal, registry and source", async () => {
  const task = await planTask({
    journal: { "journal-1": check({ sourceId: "check-1" }) },
    inspections: { "registry-1": check({ sourceId: "check-1", sourceCollection: "geomChecks", checkStatus: "exceeded" }) },
    geomChecks: { "check-1": check() }
  });
  assert.deepEqual(
    { checks: task.checksCount, exceeded: task.exceededCount, status: task.status },
    { checks: 1, exceeded: 1, status: "deviation" }
  );
});

test("control plan treats negative legacy results as deviations, never as successful checks", async () => {
  for (const status of ["не соответствует", "не в норме", "не соответствует норме", "bad", "ошибка", "недобор", "failed"]) {
    const task = await planTask({ journal: { "journal-1": check({ status }) } });
    assert.deepEqual(
      { exceeded: task.exceededCount, status: task.status },
      { exceeded: 1, status: "deviation" },
      status
    );
  }
});

test("a closed issue cannot resolve an unrelated inspection in the same position", async () => {
  const task = await planTask({
    journal: { "journal-1": check({ sourceId: "check-1" }) },
    issues: { "issue-other": check({ status: "closed", sourceInspectionId: "other-check" }) }
  });
  assert.equal(task.status, "deviation");
});

test("historical closures retain their links but cannot prove a successful repeat control", async () => {
  for (const link of [
    { sourceInspectionId: "check-1" },
    { sourceInspectionId: "registry-1" },
    { sourceJournalEntryId: "journal-1" }
  ]) {
    const task = await planTask({
      journal: {
        "journal-1": check({ sourceId: "check-1" }),
        "journal-2": check({ sourceId: "check-1", createdAt: checkedAt + 1000 })
      },
      inspections: { "registry-1": check({ sourceId: "check-1", sourceCollection: "geomChecks" }) },
      geomChecks: { "check-1": check() },
      issues: { "issue-1": check({ status: "closed", ...link }) }
    });
    assert.deepEqual(
      { checks: task.checksCount, exceeded: task.exceededCount, status: task.status },
      { checks: 1, exceeded: 1, status: "deviation" },
      JSON.stringify(link)
    );
  }
});

test("an inspection identity from another module cannot supply a missing check", async () => {
  const task = await planTask({
    moduleKey: "geo",
    journal: { "journal-1": check({ sourceId: "shared-id", status: "ok" }) },
    collections: { geoNodes: { "shared-id": check({ module: "Геодезия", moduleKey: "geo", status: "ok" }) } }
  });
  assert.deepEqual({ checks: task.checksCount, status: task.status }, { checks: 0, status: "required" });
});

test("an issue cannot use its original inspection as a successful repeat control", async () => {
  const task = await planTask({
    journal: { "journal-1": check({ sourceId: "check-1" }) },
    issues: { "issue-1": check({
      status: "closed", sourceInspectionId: "check-1",
      repeatControlInspectionId: "check-1", repeatControlStatus: "ok"
    }) }
  });
  assert.equal(task.status, "deviation");
});

test("canonical checkStatus takes precedence over a stale display status", async () => {
  const task = await planTask({
    journal: { "journal-1": check({ status: "в норме", checkStatus: "exceeded" }) }
  });
  assert.equal(task.status, "deviation");
});

test("registry records without context do not copy deviations into another position", async () => {
  const task = await planTask({
    journal: {
      "journal-1": check({ sourceId: "check-1", status: "ok" }),
      "journal-2": check({ sourceId: "check-2", context: "Д-Ж, 5-8" })
    },
    inspections: { "registry-2": check({ sourceId: "check-2", context: undefined }) }
  });
  assert.deepEqual({ checks: task.checksCount, status: task.status }, { checks: 1, status: "done" });
});

test("journal references to registry IDs retain the identity of the original inspection", async () => {
  const task = await planTask({
    journal: { "journal-1": check({ sourceId: "registry-1" }) },
    inspections: { "registry-1": check({ sourceId: "check-1", sourceCollection: "geomChecks" }) },
    geomChecks: { "check-1": check() },
    issues: { "issue-1": check({ status: "closed", sourceInspectionId: "registry-1" }) }
  });
  assert.deepEqual(
    { checks: task.checksCount, exceeded: task.exceededCount, status: task.status },
    { checks: 1, exceeded: 1, status: "deviation" }
  );
});

test("a later negative update takes precedence over an earlier successful journal entry", async () => {
  const task = await planTask({
    journal: { "journal-1": check({ sourceId: "check-1", status: "ok", createdAt: undefined, timestamp: checkedAt + 1000 }) },
    inspections: { "registry-1": check({ sourceId: "check-1", checkStatus: "exceeded", updatedAt: checkedAt + 2000 }) },
    geomChecks: { "check-1": check({ updatedAt: checkedAt + 2000 }) }
  });
  assert.deepEqual({ checks: task.checksCount, exceeded: task.exceededCount, status: task.status },
    { checks: 1, exceeded: 1, status: "deviation" });
});

test("registry aliases still load a newer original result when the registry is stale", async () => {
  const task = await planTask({
    journal: { "journal-1": check({ sourceId: "registry-1", status: "ok", createdAt: undefined, timestamp: checkedAt + 1000 }) },
    inspections: { "registry-1": check({ sourceId: "check-1", status: "ok", checkStatus: "ok" }) },
    geomChecks: { "check-1": check({ updatedAt: checkedAt + 2000 }) }
  });
  assert.deepEqual({ checks: task.checksCount, exceeded: task.exceededCount, status: task.status },
    { checks: 1, exceeded: 1, status: "deviation" });
});

test("an issue without position metadata belongs only to the inspection it references", async () => {
  const task = await planTask({
    journal: {
      "journal-1": check({ sourceId: "check-1", status: "ok" }),
      "journal-2": check({ sourceId: "check-2", context: "Д-Ж, 5-8" })
    },
    issues: { "issue-2": check({ sourceInspectionId: "check-2", context: undefined, status: "issued" }) }
  });
  assert.deepEqual({ openIssues: task.openIssues, status: task.status }, { openIssues: 0, status: "done" });
});

test("conflicting source and journal links cannot resolve two distinct inspections", async () => {
  const task = await planTask({
    journal: {
      "journal-1": check({ sourceId: "check-1" }),
      "journal-2": check({ sourceId: "check-2" })
    },
    issues: { "issue-1": check({ status: "closed", sourceInspectionId: "check-1", sourceJournalEntryId: "journal-2" }) }
  });
  assert.deepEqual({ checks: task.checksCount, exceeded: task.exceededCount, status: task.status },
    { checks: 2, exceeded: 2, status: "deviation" });
});

test("legacy positive statuses remain successful while unknown or empty results remain required", async () => {
  for (const [status, expected] of [
    ["ok", "done"], ["в норме", "done"], ["соответствует", "done"],
    ["Соответствует проекту", "done"], ["Не заполнено", "required"], ["pending", "required"]
  ]) {
    const task = await planTask({ journal: { "journal-1": check({ status }) } });
    assert.equal(task.status, expected, status);
  }
});

test("a legacy positive geodesy result without explicit units cannot complete a plan task", async () => {
  const task = await planTask({ journal: { old: check({ moduleKey: "geo", module: "Геодезия", status: "ok", evaluationSchemaVersion: undefined }) }, moduleKey: "geo" });
  assert.equal(task.status, "required");
});
