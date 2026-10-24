import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";
import { resolve } from "node:path";

test("workspace: navigation, themes, language, mobile layout and persistence", async () => {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(`${server.url}/demo.html`);
    await page.locator("#overviewReadinessValue").filter({ hasText: "0%" }).waitFor();
    const sidebar = await page.locator(".tabs").boundingBox();
    assert.equal(sidebar.x, 0);
    assert.equal(sidebar.y, 64);
    await page.locator('.tabs [data-target="geo"]').click();
    assert.equal(await page.locator("#geo").isVisible(), true);
    await page.locator('.tabs [data-target="strength"]').click();
    assert.equal(await page.locator("#strength").isVisible(), true);
    await page.locator('.tabs [data-target="reinforcement"]').click();
    assert.equal(await page.locator("#reinforcement").isVisible(), true);
    await page.locator('.tabs [data-target="geometry"]').click();
    assert.equal(await page.locator("#geometry").isVisible(), true);
    await page.locator('.tabs [data-target="journal"]').click();
    assert.equal(await page.locator("#journal").isVisible(), true);
    assert.equal(await page.locator("#constructionCategory").isVisible(), false);
    const journalHeading = await page.locator("#journal h2").boundingBox();
    assert.ok(journalHeading.y < 370, `Journal starts too far down: ${journalHeading.y}`);
    await page.locator("#journalTable tbody tr[data-entry-id]").first().waitFor();
    const rows = await page.locator("#journalTable tbody tr[data-entry-id]").count();
    await page.locator("#journalSearch").fill("no-matching-inspection-123");
    assert.equal(await page.locator("#journalTable tbody tr[data-entry-id]").count(), 0);
    await page.locator("#journalSearch").fill("");
    assert.equal(await page.locator("#journalTable tbody tr[data-entry-id]").count(), rows);
    await page.locator("#bimModelManager summary").click();
    assert.equal(await page.locator("#btnImportIfc").isVisible(), true);
    await page.locator("#bimModelManager summary").click();
    assert.equal(await page.locator("#btnImportIfc").isVisible(), false);
    await page.locator("#journalTable tbody tr[data-entry-id]").filter({ hasText: "Геометрия" }).click();
    await page.locator("#geometry.active").waitFor();
    await page.waitForFunction(() => document.getElementById("factPlateHeight").value === "514");
    assert.equal(await page.locator("#geomFloor").inputValue(), "-1");
    await page.locator("#btnGeom").click();
    await page.waitForFunction(() => {
      const checks = JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].geomChecks;
      return Object.keys(checks).length === 1 && checks["geom-demo-1"].factPlateHeight === 514 && checks["geom-demo-1"].lastMsg;
    });
    await page.waitForFunction(() => document.getElementById("geometryResult").textContent.includes("514"));
    assert.equal(await page.locator("#geometryResult").evaluate(e => e.classList.contains("ok")), false);
    assert.match(await page.locator("#geometryResult").innerText(), /Требует проверки/u);
    await page.locator('.tabs [data-target="summary"]').click();
    assert.equal(await page.locator("#summary").isVisible(), true);
    await page.locator("#analyticsBlock").waitFor();
    await page.locator('.tabs [data-target="overview"]').click();
    await page.locator("#workspaceLanguage").selectOption("en");
    await page.locator('h2[data-i18n="overview"]').filter({ hasText: "Project overview" }).waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    await page.locator('.tabs [data-target="controlPlan"]').click();
    await page.locator('#controlPlan h2').filter({ hasText: "Control plan" }).waitFor();
    assert.equal(await page.locator("#constructionCategory").isVisible(), false);
    assert.equal(await page.locator("#controlPlanSearch").getAttribute("placeholder"), "Search structures");
    await page.locator("#controlPlanTableBody .control-plan-status").filter({ hasText: "Blocked" }).first().waitFor();
    await page.locator("#controlPlanSearch").fill("unmatched-structure-123");
    await page.locator("#controlPlanEmpty").filter({ hasText: "No structures match" }).waitFor();
    await page.locator("#workspaceLanguage").selectOption("ru");
    await page.locator("#controlPlanEmpty").filter({ hasText: "Нет конструкций" }).waitFor();
    await page.locator("#workspaceLanguage").selectOption("en");
    await page.locator("#controlPlanSearch").fill("");
    await page.locator('.tabs [data-target="overview"]').click();
    await page.reload();
    await page.locator('h2[data-i18n="overview"]').filter({ hasText: "Project overview" }).waitFor();
    await page.locator("#themeToggleBtn").click();
    assert.equal(await page.locator("body").evaluate(e => e.classList.contains("theme-dark")), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator(".tabs").isVisible(), false);
    const context = await page.locator("main > .construction-bar").boundingBox();
    assert.ok(context.height < 190, `Mobile project context is too tall: ${context.height}`);
    for (const target of ["overview", "controlPlan", "summary", "journal", "knowledge"]) {
      const rect = await page.locator(`#bottomNav [data-tab="${target}"]`).boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= 390, `Mobile navigation hides ${target}`);
    }
    await page.locator('#bottomNav [data-tab="controlPlan"]').click();
    await page.locator("#controlPlanTableBody tr").first().waitFor();
    const action = page.locator(".control-plan-next-action").first();
    await action.scrollIntoViewIfNeeded();
    const actionRect = await action.boundingBox();
    assert.ok(actionRect.x >= 0 && actionRect.x + actionRect.width <= 390, "Mobile plan action requires horizontal scrolling");
    assert.ok(await page.evaluate(() => window.scrollY > 0), "Workspace must use document scrolling");
    await page.locator("#controlPlanTableBody summary").first().click();
    await page.locator(".control-plan-task-detail").first().waitFor({ state: "visible" });
    await page.locator("#themeToggleBtn").click();
    assert.equal(await page.locator("body").evaluate(e => e.classList.contains("theme-light")), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#bottomNav [data-tab="journal"]').click();
    assert.equal(await page.locator("#journal").isVisible(), true);
    await page.locator('#bottomNav [data-tab="knowledge"]').click();
    await page.locator("#btnAllArticles").click();
    await page.locator("#knowledgeArticlesGrid").waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => typeof window.openArticle), "undefined");
    await page.locator("[data-workspace-home]").focus();
    await page.keyboard.press("Enter");
    await page.locator("#overview.active").waitFor();
    await page.locator('#bottomNav [data-tab="controlPlan"]').click();
    await page.locator("#controlPlan .module-help-toggle").first().click();
    await page.locator("#workspaceHelp:popover-open").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#workspaceHelp").evaluate(e => e.matches(":popover-open")), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});


test("workspace layouts and geometry form work in both themes on desktop and mobile", async () => {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(`${server.url}/demo.html`);
    await page.locator("#overviewReadinessValue").filter({ hasText: "0%" }).waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const theme of ["light", "dark"]) {
        if (!await page.locator("body").evaluate((e, theme) => e.classList.contains(`theme-${theme}`), theme)) await page.locator("#themeToggleBtn").click();
        for (const target of ["overview", "controlPlan", "journal", "geo", "reinforcement", "geometry", "strength", "summary", "knowledge"]) {
          if (width === 1440) await page.locator(`.tabs [data-target="${target}"]`).click();
          else if (["geo", "reinforcement", "geometry", "strength"].includes(target)) {
            await page.locator('#bottomNav [data-tab-group="inspections"]').click();
            await page.locator(`#bottomInspectionMenu [data-tab="${target}"]`).click();
          } else await page.locator(`#bottomNav [data-tab="${target}"]`).click();
          await page.locator(`#${target}.active`).waitFor();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${target}, ${width}, ${theme}: page overflow`);
          assert.equal(await page.locator(`#${target}`).evaluate(e => getComputedStyle(e).opacity), "1");
          if (target === "geometry") {
            assert.equal(await page.locator("#geomBimElementSelect").isVisible(), false);
            if (width === 390) await page.locator('#geometry [data-wizard-step="2"]').click();
            if (width === 390) await page.locator('[data-sheet-target="geomNumbersSheet"]').click();
            await page.locator("#factPlateHeight").fill("518");
            assert.equal(await page.locator("#factPlateHeight").inputValue(), "518");
            if (width === 390) {
              const dialog = await page.locator("#geomNumbersSheet .wizard-sheet-panel").boundingBox();
              assert.ok(dialog.x >= 0 && dialog.x + dialog.width <= width);
              assert.equal(await page.locator("#geomNumbersSheet").evaluate(e => e.matches(":modal")), true);
              if (theme === "light") {
                await page.keyboard.press("Escape");
                assert.equal(await page.locator('[data-sheet-target="geomNumbersSheet"]').evaluate(e => e === document.activeElement), true);
              } else await page.locator("#geomNumbersSheet .wizard-sheet-close").click();
              assert.equal(await page.locator("#geomNumbersSheet").evaluate(e => e.open), false);
            }
          }
        }
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});
