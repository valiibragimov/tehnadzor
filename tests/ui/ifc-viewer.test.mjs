import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { engineeringFixtures } from "../fixtures/ifc.mjs";
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
    for (let cycle = 0; cycle < 2; cycle++) {
      const closed = await page.evaluate(async () => {
        const api = document.querySelector("#host .bim-viewer-launcher").__thatopenBimApi;
        api.close();
        return { debug: await api.debug(), canvases: document.querySelectorAll(".bim-workspace canvas").length };
      });
      assert.deepEqual(closed, { debug: null, canvases: 0 }, "Closing must release the heavy viewer");
      const reopened = await page.evaluate(async () => {
        const api = document.querySelector("#host .bim-viewer-launcher").__thatopenBimApi;
        api.open(); await api.render(); return api.debug();
      });
      assert.equal(reopened.pickableCount, 1, "Reopening reconstructs a usable scene");
    }
    for (const [name, bytes] of Object.entries(engineeringFixtures())) {
      await page.locator("#ifcFile").setInputFiles({ name: name + ".ifc", mimeType: "application/octet-stream", buffer: Buffer.from(bytes) });
      await page.waitForFunction(name => document.getElementById("status").textContent.includes(name + ".ifc") && document.getElementById("status").textContent.includes("Загружено"), name);
      const debug = await page.evaluate(async () => {
        const api = document.querySelector("#host .bim-viewer-launcher").__thatopenBimApi;
        await api.render(); return api.debug();
      });
      assert.equal(debug.pickableCount, 1, name);
      assert.deepEqual(debug.missingSources, [], name);
      const box = debug.worldBox;
      // Viewer units are metres; large engineering origins are recentered for float geometry.
      const expectedWidth = name === "nestedRotation" ? 0.4 : 0.3;
      assert.ok(Math.abs(box.max.x - box.min.x - expectedWidth) < 1e-5, name);
      assert.ok(Math.abs(box.max.y - box.min.y - 3) < 1e-5, name);
    }
    assert.deepEqual(externalRequests, [], "Viewer must load without Firebase or remote infrastructure");
  } finally { await browser.close(); await server.close(); }
});
