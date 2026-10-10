import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";

test("IFC viewer renders geometry and supports floor, 2D/3D and selection", { timeout: 45000 }, async () => {
  const server = await startStaticServer(resolve("."));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  try {
    const page = await browser.newPage();
    const externalRequests = [];
    page.on("request", request => { if (new URL(request.url()).origin !== server.url) externalRequests.push(request.url()); });
    await page.goto(`${server.url}/tools/viewer-harness/index.html?autotest=1`);
    await page.waitForFunction(() => document.querySelector("#autotestResult")?.textContent.includes("RESULT:"), { timeout: 35000 });
    const result = await page.locator("#autotestResult").textContent();
    assert.match(result, /RESULT: PASS/, result);
    assert.match(result, /"pickableCount": 1/);
    assert.match(result, /7\. selected element:/);
    assert.deepEqual(externalRequests, [], "Viewer must load without Firebase or remote infrastructure");
  } finally { await browser.close(); await server.close(); }
});
