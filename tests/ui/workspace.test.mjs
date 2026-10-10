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
    await page.locator("#overviewReadinessValue").filter({ hasText: "25%" }).waitFor();
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
    await page.locator('.tabs [data-target="summary"]').click();
    assert.equal(await page.locator("#summary").isVisible(), true);
    await page.locator("#analyticsBlock").waitFor();
    await page.locator('.tabs [data-target="overview"]').click();
    await page.locator("#workspaceLanguage").selectOption("en");
    await page.locator('h2[data-i18n="overview"]').filter({ hasText: "Project overview" }).waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    await page.reload();
    await page.locator('h2[data-i18n="overview"]').filter({ hasText: "Project overview" }).waitFor();
    await page.locator("#themeToggleBtn").click();
    assert.equal(await page.locator("body").evaluate(e => e.classList.contains("theme-dark")), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#bottomNav [data-tab="journal"]').click();
    assert.equal(await page.locator("#journal").isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});
