import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";
import { resolve } from "node:path";
import { modelFixture } from "../fixtures/ifc.mjs";

test("first offline IFC import uses precached parser and WASM", { timeout: 60000 }, async () => {
  const server = await startStaticServer(resolve("."));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  try {
    const page = await browser.newPage();
    await page.goto(`${server.url}/dist-demo/demo.html`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    });
    const cached = await page.evaluate(async () => Promise.all(["/dist/app/vendor/ifc-model.bundle.js", "/dist/app/vendor/web-ifc.wasm"].map(async path => !!await caches.match(path))));
    assert.deepEqual(cached, [true, true]);
    await page.context().setOffline(true);
    const result = await page.evaluate(({ bytes, url }) => new Promise((resolve, reject) => {
      const worker = new Worker(url, { type: "module" });
      const timeout = setTimeout(() => { worker.terminate(); reject(new Error("IFC worker timed out")); }, 15000);
      worker.onerror = event => { clearTimeout(timeout); worker.terminate(); reject(new Error(event.message)); };
      worker.onmessage = ({ data }) => {
        if (data.type === "result" || data.type === "error") {
          clearTimeout(timeout); worker.terminate();
          if (data.type === "error") reject(new Error(data.error)); else resolve(data.result);
        }
      };
      worker.postMessage({ type: "parse-ifc", file: new File([new Uint8Array(bytes)], "fixture.ifc"), options: { sourceModelId: "browser" } });
    }), { bytes: [...modelFixture()], url: `${server.url}/dist/app/services/ifc-import-worker.js` });
    assert.equal(result.importedCount, 1);
    const element = result.elements[0];
    assert.deepEqual([element.projectX, element.projectY, element.projectH], [1000, 2000, 3000]);
    assert.equal(element.sectionWidth, 300);
    assert.equal(element.axes, "A-1");
    assert.equal(result.requirementSummary.canImport, true);
  } finally { await browser.close(); await server.close(); }
});
