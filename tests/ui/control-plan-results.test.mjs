import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";

test("control plan resolves only its linked inspection after successful repeat control", { timeout: 45000 }, async () => {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${server.url}/demo.html`);
    await page.locator('.tabs [data-target="controlPlan"]').click();
    await page.locator("#controlPlanTableBody tr").first().waitFor();
    // Read existing-format synthetic data: a legacy closure must not turn a
    // failed repeat control into a successful acceptance.
    await page.evaluate(() => {
      const key = "tehnadzor-demo:v2:database";
      const state = JSON.parse(localStorage.getItem(key));
      Object.assign(state.projectCollections["demo-project"].issues["issue-demo-1"], {
        sourceInspectionId: "geom-demo-1", sourceJournalEntryId: "journal-demo-2",
        status: "closed", repeatControlInspectionId: "repeat-1", repeatControlStatus: "exceeded"
      });
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.locator("#btnControlPlanRefresh").click();
    const geometry = page.locator(".control-plan-task-detail").filter({ has: page.locator("strong", { hasText: "Геометрия" }) });
    await page.locator("#controlPlanTableBody summary").first().click();
    await geometry.locator(".control-plan-task-detail__head span").filter({ hasText: "Отклонение" }).waitFor({ timeout: 5000 });
    assert.match(await geometry.innerText(), /Проверок: 1/u);
    assert.match(await geometry.innerText(), /Нарушения: 1/u);

    await page.evaluate(() => {
      const key = "tehnadzor-demo:v2:database";
      const state = JSON.parse(localStorage.getItem(key));
      const records = state.projectCollections["demo-project"];
      const original = records.geomChecks["geom-demo-1"];
      records.geomChecks["repeat-1"] = {
        ...original, evaluationSchemaVersion: 2, id: "repeat-1", status: "ok", summaryText: "в норме",
        factThick: 500, factPlateHeight: 500, createdAt: original.createdAt + 60000
      };
      records.inspections["registry-repeat-1"] = {
        ...records.geomChecks["repeat-1"], id: "registry-repeat-1", sourceId: "repeat-1",
        sourceCollection: "geomChecks", moduleKey: "geometry", checkStatus: "ok"
      };
      state.journal["journal-repeat-1"] = {
        ...state.journal["journal-demo-2"], evaluationSchemaVersion: 2, id: "journal-repeat-1", sourceId: "repeat-1",
        status: "ok", details: "Повторный контроль: в норме", timestamp: original.createdAt + 60000
      };
      Object.assign(records.issues["issue-demo-1"], {
        repeatControlStatus: "ok", repeatControlJournalEntryId: "journal-repeat-1"
      });
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.locator("#btnControlPlanRefresh").click();
    await geometry.locator(".control-plan-task-detail__head span").filter({ hasText: "Устранено" }).waitFor({ state: "attached" });
    await page.locator("#controlPlanTableBody summary").first().click();
    assert.match(await geometry.innerText(), /Проверок: 2/u);
    assert.match(await geometry.innerText(), /Нарушения: 1/u);
    await page.locator('.tabs [data-target="journal"]').click();
    await page.locator('#journalTable tbody tr[data-entry-id="journal-demo-2"]').click();
    await page.locator("#geometry.active").waitFor();
    await page.waitForFunction(() => document.getElementById("factPlateHeight").value === "514");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
