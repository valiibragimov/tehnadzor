import test from "node:test";
import assert from "node:assert/strict";
import { startProjectUpdateHarness } from "./helpers/project-update-harness.mjs";

test("summary cards, control plan and detailed analytics reuse this request's inspection reads", async () => {
  const harness = await startProjectUpdateHarness();
  try {
    const { page } = harness;
    const reads = await page.evaluate(async () => {
      const key = "tehnadzor-demo:v2:database", state = JSON.parse(localStorage.getItem(key));
      for (const project of Object.values(state.projects)) { project.ownerUid = "demo-user"; project.createdBy = "demo-user"; }
      localStorage.setItem(key, JSON.stringify(state));
      window.race.reads.length = 0;
      await window.race.updateSummaryTab();
      return window.race.reads;
    });
    for (const collection of ["inspections", "geoNodes", "reinfChecks", "geomChecks", "strengthChecks", "issues"]) {
      assert.equal(reads.filter(read => read.project === "project-a" && read.collection === collection).length, 1, collection);
    }
    assert.equal(reads.filter(read => read.project === "project-a" && read.method === "getProjectCollectionDocSnapshot").length, 0);
    assert.equal(await page.locator("#summaryModuleStatsGeom .summary-module-stat-value").first().innerText(), "1");
    assert.equal(await page.locator("#summaryModuleStatsGeom .summary-module-stat-value").nth(1).innerText(), "1");
  } finally { await harness.close(); }
});
