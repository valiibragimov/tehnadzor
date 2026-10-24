import { completeSlabAcceptance } from "./helpers/engineering-forms.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { startProjectUpdateHarness } from "./helpers/project-update-harness.mjs";

test("geometry retains saved evidence when its registry write fails, then retries once", { timeout: 45000 }, async () => {
  const harness = await startProjectUpdateHarness({ production: true });
  const { page } = harness;
  try {
    await page.locator('.tabs [data-target="journal"]').click();
    await page.locator('#journalTable tbody tr[data-entry-id="journal-demo-2"]').click();
    await page.locator("#geometry.active").waitFor();
    await page.waitForFunction(() => document.getElementById("factPlateHeight").value === "514");
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === "tehnadzor-demo:v2:database" && !window.inspectionFaultObserved) {
          const inspections = JSON.parse(value).projectCollections["demo-project"].inspections;
          if (Object.values(inspections).some(record => record.sourceId === "geom-demo-1" && record.checkStatus === "ok")) {
            window.inspectionFaultObserved = true;
            throw new Error("synthetic registry storage failure");
          }
        }
        return original.call(this, key, value);
      };
    });
    await page.locator("#factPlateHeight").fill("500");
    await completeSlabAcceptance(page);
    await page.locator("#btnGeom").click();
    await page.waitForFunction(() => window.inspectionFaultObserved);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].geomChecks["geom-demo-1"].factPlateHeight), 514);
    await page.locator("#btnGeom").click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].geomChecks["geom-demo-1"].factPlateHeight === 500);
    await page.locator('.tabs [data-target="summary"]').click();
    await page.waitForFunction(() => document.querySelector("#summaryModuleStatsGeom .summary-module-stat-value").textContent === "1");
    assert.equal(await page.locator("#summaryModuleStatsGeom .summary-module-stat-value").nth(1).innerText(), "0");
  } finally { await harness.close(); }
});

test("retrying a strength save after a lost acknowledgement retains one new inspection", { timeout: 45000 }, async () => {
  const harness = await startProjectUpdateHarness({ production: true });
  const { page } = harness;
  try {
    await page.locator('.tabs [data-target="strength"]').click();
    await page.evaluate(() => { document.getElementById("strengthFloor").value = "1"; });
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        original.call(this, key, value);
        if (key === "tehnadzor-demo:v2:database" && !window.lostAcknowledgement && Object.keys(JSON.parse(value).projectCollections["demo-project"].strengthChecks).length > 1) {
          window.lostAcknowledgement = true;
          throw new Error("synthetic lost acknowledgement");
        }
      };
    });
    await page.locator("#btnSaveStrengthCheck").dispatchEvent("click");
    await page.waitForFunction(() => window.lostAcknowledgement);
    await page.locator("#btnSaveStrengthCheck").dispatchEvent("click");
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projects["demo-project"].inspectionSync?.pending);
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].strengthChecks).length), 2);
  } finally { await harness.close(); }
});

test("retrying a reinforcement save after a lost acknowledgement retains one new inspection", { timeout: 45000 }, async () => {
  const harness = await startProjectUpdateHarness({ production: true });
  const { page } = harness;
  try {
    await page.locator('.tabs [data-target="reinforcement"]').click();
    await page.evaluate(() => { document.getElementById("reinfFloor").value = "1"; });
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        original.call(this, key, value);
        if (key === "tehnadzor-demo:v2:database" && !window.lostAcknowledgement && Object.keys(JSON.parse(value).projectCollections["demo-project"].reinfChecks).length > 1) {
          window.lostAcknowledgement = true;
          throw new Error("synthetic lost acknowledgement");
        }
      };
    });
    await page.locator("#btnSaveReinfCheck").dispatchEvent("click");
    await page.waitForFunction(() => window.lostAcknowledgement);
    await page.locator("#btnSaveReinfCheck").dispatchEvent("click");
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projects["demo-project"].inspectionSync?.pending);
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].reinfChecks).length), 2);
  } finally { await harness.close(); }
});

test("summary does not resurrect deleted checks from analytics awaiting repair", async () => {
  const harness = await startProjectUpdateHarness();
  const { page } = harness;
  try {
    await page.evaluate(async () => {
      const key = "tehnadzor-demo:v2:database", state = JSON.parse(localStorage.getItem(key));
      state.projectCollections["project-a"] = { inspections: {}, geomChecks: {}, geoNodes: {}, reinfChecks: {}, strengthChecks: {}, issues: {} };
      state.projects["project-a"].inspectionSync = { version: 1, revision: "interrupted-delete", pending: true };
      state.projects["project-a"].analyticsCurrent = { byModule: { geometry: { total: 9, exceeded: 4, status: "exceeded", lastCheck: null } } };
      localStorage.setItem(key, JSON.stringify(state));
      await window.race.updateSummaryTab();
    });
    assert.equal(await page.locator("#summaryModuleStatsGeom .summary-module-stat-value").first().innerText(), "Пока нет");
  } finally { await harness.close(); }
});

test("saving a journal session retries its projection and number without a duplicate", { timeout: 45000 }, async () => {
  const harness = await startProjectUpdateHarness({ production: true });
  const { page } = harness;
  try {
    await page.locator('.tabs [data-target="journal"]').click();
    await page.locator("#journalTable tbody tr[data-entry-id]").first().waitFor();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === "tehnadzor-demo:v2:database" && !window.sessionFaultObserved && Object.values(JSON.parse(value).projectCollections["demo-project"].inspections).some(record => record.sourceCollection === "journalSessions")) {
          window.sessionFaultObserved = true;
          throw new Error("synthetic session projection failure");
        }
        original.call(this, key, value);
      };
    });
    await page.locator("#btnJournalSaveToProject").dispatchEvent("click");
    await page.waitForFunction(() => window.sessionFaultObserved);
    assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].journalSessions || {}).length), 0);
    await page.locator("#btnJournalSaveToProject").dispatchEvent("click");
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projects["demo-project"].lastCheckNumber === 1);
    const saved = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database"));
      return { sessions: Object.values(state.projectCollections["demo-project"].journalSessions), inspections: Object.values(state.projectCollections["demo-project"].inspections).filter(record => record.sourceCollection === "journalSessions") };
    });
    assert.equal(saved.sessions.length, 1);
    assert.equal(saved.inspections.length, 1);
    assert.equal(saved.sessions[0].checkNumber, 1);
  } finally { await harness.close(); }
});
