import test from "node:test";
import assert from "node:assert/strict";
import { startProjectUpdateHarness } from "./helpers/project-update-harness.mjs";

test("a late control plan for project A cannot overwrite the selected project B", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => {
      window.race.hold("getProjectCollectionSnapshot", "project-a", "inspections");
      window.race.start("old", "updateControlPlan");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    await page.evaluate(async () => { window.race.select("project-b"); await window.race.updateControlPlan(); });
    assert.match(await page.locator("#controlPlanTableBody").innerText(), /Project B position/u);
    await page.evaluate(async () => { window.race.release(0); await window.race.finish("old"); });
    const result = await page.locator("#controlPlanTableBody").innerText();
    assert.match(result, /Project B position/u);
    assert.doesNotMatch(result, /Project A position/u);
  } finally { await harness.close(); }
});

test("a late summary for project A cannot replace project B statistics", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => {
      window.race.hold("getProjectCollectionSnapshot", "project-a", "inspections");
      window.race.start("old", "updateSummaryTab");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    await page.evaluate(async () => { window.race.select("project-b"); await window.race.updateSummaryTab(); });
    const count = page.locator("#summaryModuleStatsGeom .summary-module-stat-value").first();
    assert.equal(await count.innerText(), "2");
    await page.evaluate(async () => { window.race.release(0); await window.race.finish("old"); });
    assert.equal(await count.innerText(), "2");
    assert.equal(await page.locator("#summaryParamProject").innerText(), "Project B");
  } finally { await harness.close(); }
});

test("switching projects clears the previous plan while the new plan is pending", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => window.race.updateControlPlan());
    assert.match(await page.locator("#controlPlanTableBody").innerText(), /Project A position/u);
    await page.evaluate(() => {
      window.race.select("project-b");
      window.race.hold("getProjectCollectionSnapshot", "project-b", "inspections");
      window.race.start("new", "updateControlPlan");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    assert.doesNotMatch(await page.locator("#controlPlanTableBody").innerText(), /Project A position/u);
    await page.evaluate(async () => { window.race.release(0); await window.race.finish("new"); });
    assert.match(await page.locator("#controlPlanTableBody").innerText(), /Project B position/u);
  } finally { await harness.close(); }
});

test("switching projects does not display the old summary under the new project name", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => window.race.updateSummaryTab());
    const count = page.locator("#summaryModuleStatsGeom .summary-module-stat-value").first();
    assert.equal(await count.innerText(), "1");
    await page.evaluate(() => {
      window.race.select("project-b");
      window.race.hold("getProjectCollectionSnapshot", "project-b", "inspections");
      window.race.start("new", "updateSummaryTab");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    assert.equal(await page.locator("#summaryParamProject").innerText(), "Project B");
    assert.notEqual(await count.innerText(), "1");
    await page.evaluate(async () => { window.race.release(0); await window.race.finish("new"); });
    assert.equal(await count.innerText(), "2");
  } finally { await harness.close(); }
});

test("a superseded plan error neither notifies nor clears the newer request busy state", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => {
      window.race.hold("getProjectCollectionSnapshot", "project-a", "inspections");
      window.race.start("old", "updateControlPlan");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    await page.evaluate(() => {
      window.race.hold("getProjectCollectionSnapshot", "project-a", "inspections");
      window.race.start("new", "updateControlPlan");
    });
    await page.waitForFunction(() => window.race.gates[1].started);
    await page.evaluate(async () => { window.race.release(0, "late obsolete failure"); await window.race.finish("old"); });
    assert.equal(await page.locator("#btnControlPlanRefresh").isDisabled(), true);
    assert.equal(await page.locator("#notification-container").count(), 0);
    await page.evaluate(async () => { window.race.release(1); await window.race.finish("new"); });
    assert.equal(await page.locator("#btnControlPlanRefresh").isDisabled(), false);
    assert.match(await page.locator("#controlPlanTableBody").innerText(), /Project A position/u);
  } finally { await harness.close(); }
});

test("a late analytics error cannot replace the newer summary analytics state", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => {
      window.race.hold("getProjectsSnapshot");
      window.race.start("old", "updateSummaryTab");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    await page.evaluate(async () => { window.race.select("project-b"); await window.race.updateSummaryTab(); });
    const currentAnalytics = await page.locator("#analyticsBlockContainer").innerText();
    await page.evaluate(async () => { window.race.release(0, "late obsolete analytics failure"); await window.race.finish("old"); });
    assert.equal(await page.locator("#analyticsBlockContainer").innerText(), currentAnalytics);
    assert.doesNotMatch(await page.locator("#analyticsBlockContainer").innerText(), /late obsolete analytics failure/u);
    assert.equal(await page.locator("#summaryModuleStatsGeom .summary-module-stat-value").first().innerText(), "2");
  } finally { await harness.close(); }
});

test("a new summary request invalidates old analytics before its own statistics finish", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => {
      window.race.hold("getProjectsSnapshot");
      window.race.start("old", "updateSummaryTab");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    await page.evaluate(() => {
      window.race.hold("getProjectCollectionSnapshot", "project-a", "inspections");
      window.race.start("new", "updateSummaryTab");
    });
    await page.waitForFunction(() => window.race.gates[1].started);
    await page.evaluate(async () => { window.race.release(0, "obsolete error while new request is pending"); await window.race.finish("old"); });
    assert.doesNotMatch(await page.locator("#analyticsBlockContainer").innerText(), /obsolete error/u);
    await page.evaluate(async () => { window.race.release(1); await window.race.finish("new"); });
    assert.equal(await page.locator("#summaryModuleStatsGeom .summary-module-stat-value").first().innerText(), "1");
  } finally { await harness.close(); }
});

test("the latest summary request wins even when the project ID is unchanged", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => {
      window.race.hold("getProjectCollectionSnapshot", "project-a", "inspections");
      window.race.start("old", "updateSummaryTab");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    await page.evaluate(async () => {
      const key = "tehnadzor-demo:v2:database", state = JSON.parse(localStorage.getItem(key));
      state.projectCollections["project-a"] = structuredClone(state.projectCollections["project-b"]);
      localStorage.setItem(key, JSON.stringify(state));
      await window.race.updateSummaryTab();
    });
    const count = page.locator("#summaryModuleStatsGeom .summary-module-stat-value").first();
    assert.equal(await count.innerText(), "2");
    await page.evaluate(async () => { window.race.release(0); await window.race.finish("old"); });
    assert.equal(await count.innerText(), "2");
  } finally { await harness.close(); }
});

test("the latest plan request wins even when the project ID is unchanged", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => {
      window.race.hold("getProjectCollectionSnapshot", "project-a", "inspections");
      window.race.start("old", "updateControlPlan");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    await page.evaluate(async () => {
      const key = "tehnadzor-demo:v2:database", state = JSON.parse(localStorage.getItem(key));
      for (const records of Object.values(state.projectCollections["project-a"])) {
        for (const record of Object.values(records)) record.context = "Refreshed A position";
      }
      for (const entry of Object.values(state.journal)) if (entry.projectId === "project-a") entry.context = "Refreshed A position";
      localStorage.setItem(key, JSON.stringify(state));
      await window.race.updateControlPlan();
    });
    await page.evaluate(async () => { window.race.release(0); await window.race.finish("old"); });
    assert.match(await page.locator("#controlPlanTableBody").innerText(), /Refreshed A position/u);
    assert.doesNotMatch(await page.locator("#controlPlanTableBody").innerText(), /Project A position/u);
  } finally { await harness.close(); }
});

test("clearing the selected project discards pending plan and summary results", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => {
      window.race.hold("getProjectCollectionSnapshot", "project-a", "inspections");
      window.race.hold("getProjectCollectionSnapshot", "project-a", "inspections");
      window.race.start("plan", "updateControlPlan");
      window.race.start("summary", "updateSummaryTab");
    });
    await page.waitForFunction(() => window.race.gates.every(gate => gate.started));
    await page.evaluate(async () => {
      window.race.select(null);
      await Promise.all([window.race.updateControlPlan(), window.race.updateSummaryTab()]);
      window.race.release(0); window.race.release(1);
      await Promise.all([window.race.finish("plan"), window.race.finish("summary")]);
    });
    assert.equal(await page.locator("#controlPlanTableBody tr").count(), 0);
    assert.equal(await page.locator("#summaryModuleStatsGeom .summary-module-stat-value").first().innerText(), "Пока нет");
    assert.equal(await page.locator("#btnControlPlanRefresh").isDisabled(), false);
  } finally { await harness.close(); }
});

test("an initialized control plan refreshes when the project context changes", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => window.race.initializePlan());
    await page.locator("#controlPlanTableBody").filter({ hasText: "Project A position" }).waitFor();
    await page.evaluate(() => {
      window.race.select("project-b");
      document.dispatchEvent(new CustomEvent("app:project-context-updated", { detail: { projectId: "project-b" } }));
    });
    await page.locator("#controlPlanTableBody").filter({ hasText: "Project B position" }).waitFor({ timeout: 5000 });
    assert.doesNotMatch(await page.locator("#controlPlanTableBody").innerText(), /Project A position/u);
  } finally { await harness.close(); }
});

test("a late issue-loading failure cannot clear the newer summary issues", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => {
      const key = "tehnadzor-demo:v2:database", state = JSON.parse(localStorage.getItem(key));
      for (const [id, name] of [["project-a", "Project A"], ["project-b", "Project B"]]) {
        state.projectCollections[id].issues = { issue: {
          projectId:id, module:"Геометрия", moduleKey:"geometry", construction:"foundation_slab",
          context:name+" position", title:name+" issue", status:"issued", createdAt:Date.now()
        } };
      }
      localStorage.setItem(key, JSON.stringify(state));
      window.race.hold("getProjectCollectionOrderedSnapshot", "project-a", "issues");
      window.race.start("old", "updateSummaryTab");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    await page.evaluate(async () => { window.race.select("project-b"); await window.race.updateSummaryTab(); });
    assert.match(await page.locator("#summaryIssuesList").innerText(), /Project B position/u);
    await page.evaluate(async () => { window.race.release(0, "late issue load failure"); await window.race.finish("old"); });
    assert.match(await page.locator("#summaryIssuesList").innerText(), /Project B position/u);
    assert.doesNotMatch(await page.locator("#summaryIssuesList").innerText(), /Project A position/u);
    assert.equal(await page.locator("#summaryModuleStatsGeom .summary-module-stat-value").first().innerText(), "2");
  } finally { await harness.close(); }
});

test("a current plan error remains visible and restores the refresh button", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(() => {
      window.race.hold("getProjectCollectionSnapshot", "project-a", "inspections");
      window.race.start("current", "updateControlPlan");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    await page.evaluate(async () => { window.race.release(0, "current load failure"); await window.race.finish("current"); });
    assert.match(await page.locator("#notification-container").innerText(), /Не удалось обновить план контроля/u);
    assert.equal(await page.locator("#btnControlPlanRefresh").isDisabled(), false);
  } finally { await harness.close(); }
});

test("deselecting a project through the real application clears plan and summary", async () => {
  const harness = await startProjectUpdateHarness({ production: true });
  const { page } = harness;
  try {
    await page.locator("#overviewReadinessValue").filter({ hasText: "25%" }).waitFor();
    await page.locator('.tabs [data-target="summary"]').click();
    await page.waitForFunction(() => document.querySelector("#summaryModuleStatsGeom .summary-module-stat-value").textContent === "1");
    await page.locator('.tabs [data-target="controlPlan"]').click();
    await page.locator("#controlPlanTableBody tr").first().waitFor();
    await page.locator("#projectSelector").evaluate(selector => selector.add(new Option("No project", "")));
    await page.locator("#projectSelector").selectOption("");
    await page.waitForFunction(() => document.querySelectorAll("#controlPlanTableBody tr").length === 0, undefined, { timeout: 5000 });
    assert.equal(await page.locator("#summaryModuleStatsGeom .summary-module-stat-value").first().innerText(), "Пока нет");
  } finally { await harness.close(); }
});

test("the real selector invalidates previous panels immediately when another project starts loading", async () => {
  const harness = await startProjectUpdateHarness({ production: true });
  const { page } = harness;
  try {
    await page.locator("#overviewReadinessValue").filter({ hasText: "25%" }).waitFor();
    await page.locator('.tabs [data-target="summary"]').click();
    await page.waitForFunction(() => document.querySelector("#summaryModuleStatsGeom .summary-module-stat-value").textContent === "1");
    await page.locator('.tabs [data-target="controlPlan"]').click();
    await page.locator("#controlPlanTableBody tr").first().waitFor();
    const immediate = await page.evaluate(() => {
      const key = "tehnadzor-demo:v2:database", state = JSON.parse(localStorage.getItem(key));
      state.projects["project-b"] = { ...state.projects["demo-project"], id:"project-b", name:"Project B" };
      state.projectCollections["project-b"] = { inspections:{}, geomChecks:{}, issues:{}, geoNodes:{}, reinfChecks:{}, strengthChecks:{}, elements:{} };
      localStorage.setItem(key, JSON.stringify(state));
      const selector = document.getElementById("projectSelector");
      selector.add(new Option("Project B", "project-b")); selector.value = "project-b";
      selector.dispatchEvent(new Event("change", { bubbles:true }));
      return { planRows:document.querySelectorAll("#controlPlanTableBody tr").length,
        summaryCount:document.querySelector("#summaryModuleStatsGeom .summary-module-stat-value").textContent };
    });
    assert.deepEqual(immediate, { planRows:0, summaryCount:"Пока нет" });
    await page.waitForFunction(() => document.getElementById("summaryParamProject").textContent === "Project B");
  } finally { await harness.close(); }
});
