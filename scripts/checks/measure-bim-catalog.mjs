/* global window, Worker, location */
// Synthetic local benchmark; run after build. No Firebase or production data.
import { chromium } from "playwright";
import { startStaticServer } from "../../tests/smoke/helpers/static-server.mjs";
import { modelFixture } from "../../tests/fixtures/ifc.mjs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const server = await startStaticServer(resolve("."));
const browser = await chromium.launch({ headless: true, args: ["--js-flags=--expose-gc"], ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
try {
  const page = await browser.newPage();
  await page.route("**/*", route => new URL(route.request().url()).origin === server.url ? route.continue() : route.abort());
  await page.goto(server.url + "/login.html");
  const session = await page.context().newCDPSession(page);
  await session.send("Performance.enable");
  const heap = async () => {
    await session.send("HeapProfiler.collectGarbage");
    const { metrics } = await session.send("Performance.getMetrics");
    return metrics.find(metric => metric.name === "JSHeapUsedSize").value / 1048576;
  };
  for (const count of [10000, 50000, 100000]) {
    const before = await heap();
    const catalog = await page.evaluate(async count => {
      const { normalizeGeodesyBimRecords, filterGeodesyBimElements } = await import("/dist/features/inspections/geodesy/bim-selection.js");
      const records = Array.from({ length: count }, (_, i) => ({ id: `e${i}`, data: Object.freeze({ elementId: `e${i}`, type: "column", name: `Column ${count-i}`, mark: `C-${count-i}`, axes: `A-${i%30}`, projectX: i }) }));
      const start = performance.now();
      window.benchmarkElements = normalizeGeodesyBimRecords(records);
      const loadMs = performance.now() - start;
      const searchMs = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        filterGeodesyBimElements(window.benchmarkElements, { type: "all", axes: "all", search: "c-123" });
        searchMs.push(performance.now() - start);
      }
      return { loadMs, searchMs };
    }, count);
    const retainedMiB = await heap() - before;
    await page.evaluate(() => { window.benchmarkElements = null; });
    const releasedMiB = await heap() - before;
    const fixture = new TextDecoder().decode(modelFixture());
    const column = fixture.match(/^#9=.*$/m)[0];
    const columns = Array.from({ length: count }, (_, i) => column.replace("#9=", `#${1000+i}=`).replace("'1ABCDEFGHIJKLMNOPQRSTU'", `'${String(i).padStart(22, "0")}'`)).join("\n");
    const source = fixture.replace(column, columns);
    const worker = await page.evaluate(source => new Promise((resolve, reject) => {
      const start = performance.now();
      const workerSource = `const send = self.postMessage.bind(self); self.postMessage = data => send(data.type === 'result' ? {...data, postedAt: performance.timeOrigin + performance.now()} : data); await import('${location.origin}/dist/app/services/ifc-import-worker.js'); self.postMessage({type:'ready'});`;
      const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
      const worker = new Worker(workerUrl, { type: "module" });
      URL.revokeObjectURL(workerUrl);
      const timer = setTimeout(() => { worker.terminate(); reject(new Error("Benchmark worker timeout")); }, 180000);
      worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
      worker.onmessage = ({ data }) => {
        if (data.type === "ready") {
          worker.postMessage({ type: "parse-ifc", file: new File([source], "synthetic.ifc"), options: { sourceModelId: "benchmark" } });
          return;
        }
        if (data.type !== "result" && data.type !== "error") return;
        clearTimeout(timer); worker.terminate();
        if (data.type === "error") { reject(new Error(data.error)); return; }
        const transferMs = performance.timeOrigin + performance.now() - data.postedAt;
        const result = data.result;
        window.benchmarkElements = result.elements;
        resolve({ totalMs: performance.now() - start, transferMs, importedCount: result.importedCount, firstX: result.elements[0]?.projectX, lastX: result.elements.at(-1)?.projectX, payloadBytes: new TextEncoder().encode(JSON.stringify(result)).byteLength });
      };
    }), source);
    assert.equal(worker.importedCount, count);
    assert.equal(worker.firstX, 1000);
    assert.equal(worker.lastX, 1000);
    const workerResultHeapMiB = await heap();
    await page.evaluate(() => { window.benchmarkElements = null; });
    console.log(JSON.stringify({ count, catalog, retainedMiB, releasedMiB, worker, workerResultHeapMiB, afterWorkerReleaseMiB: await heap() }));
  }
} finally { await browser.close(); await server.close(); }
