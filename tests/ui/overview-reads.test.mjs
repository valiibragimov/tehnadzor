import test from "node:test";
import assert from "node:assert/strict";
import { startProjectUpdateHarness } from "./helpers/project-update-harness.mjs";

test("overview shares one issues read with its control plan on each refresh", async () => {
  const harness = await startProjectUpdateHarness();
  try {
    const { page } = harness;
    const reads = await page.evaluate(async () => {
      const key = "tehnadzor-demo:v2:database", state = JSON.parse(localStorage.getItem(key));
      state.projectCollections["project-a"].issues = {
        "open-issue": { status: "open", moduleKey: "geometry", sourceInspectionId: "project-a-0", createdAt: Date.UTC(2026, 6, 24) }
      };
      localStorage.setItem(key, JSON.stringify(state));
      window.race.reads.length = 0;
      await window.race.renderOverview();
      await window.race.renderOverview();
      return window.race.reads;
    });
    for (const collection of ["inspections", "geoNodes", "reinfChecks", "geomChecks", "strengthChecks", "issues"]) {
      assert.equal(reads.filter(read => read.project === "project-a" && read.collection === collection).length, 2, collection);
    }
    assert.equal(await page.locator("#overviewProjectName").innerText(), "Project A");
    assert.equal(await page.locator("#overviewIssuesCount").innerText(), "1");
    assert.equal(await page.locator("#objectOverview").getAttribute("aria-busy"), "false");
  } finally { await harness.close(); }
});

test("overview retries unavailable issues for the plan instead of reusing a false empty result", async () => {
  const harness = await startProjectUpdateHarness();
  try {
    const { page } = harness;
    await page.evaluate(() => {
      window.race.reads.length = 0;
      window.race.hold("getProjectCollectionOrderedSnapshot", "project-a", "issues");
      window.race.start("failed", "renderOverview");
    });
    await page.waitForFunction(() => window.race.gates[0].started);
    await page.evaluate(async () => { window.race.release(0, "synthetic read failure"); await window.race.finish("failed"); });
    const count = await page.evaluate(() => window.race.reads.filter(read => read.project === "project-a" && read.collection === "issues").length);
    assert.equal(count, 2);
    assert.equal(await page.locator("#overviewStatusBadge").getAttribute("data-tone"), "danger");
    assert.equal(await page.locator("#objectOverview").getAttribute("aria-busy"), "false");
    await page.evaluate(() => { window.race.reads.length = 0; return window.race.renderOverview(); });
    assert.equal(await page.evaluate(() => window.race.reads.filter(read => read.collection === "issues").length), 1);
  } finally { await harness.close(); }
});

for (const lateError of [undefined, "synthetic late failure"]) {
  test(`overview discards a late project A ${lateError ? "error" : "response"} after B renders`, async () => {
    const harness = await startProjectUpdateHarness();
    try {
      const { page } = harness;
      await page.evaluate(() => {
        window.race.hold("getProjectCollectionOrderedSnapshot", "project-a", "issues");
        window.race.start("old", "renderOverview");
      });
      await page.waitForFunction(() => window.race.gates[0].started);
      await page.evaluate(async () => { window.race.select("project-b"); await window.race.renderOverview(); });
      const readiness = await page.locator("#overviewModulesCount").innerText();
      await page.evaluate(async error => { window.race.release(0, error); await window.race.finish("old"); }, lateError);
      assert.equal(await page.locator("#overviewProjectName").innerText(), "Project B");
      assert.equal(await page.locator("#overviewModulesCount").innerText(), readiness);
      assert.equal(await page.locator("#objectOverview").getAttribute("aria-busy"), "false");
    } finally { await harness.close(); }
  });
}
