import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { withClientCancellation } = require("../../server/dist/server/src/infrastructure/http-operation.js");

test("a completed HTTP body is not cancellation, but an unfinished response disconnect is", { timeout: 5000 }, async () => {
  let entered, cancelled;
  const started = new Promise(resolve => { entered = resolve; });
  const aborted = new Promise(resolve => { cancelled = resolve; });
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", async () => {
      await withClientCancellation(req, res, async signal => {
        assert.equal(signal.aborted, false);
        entered();
        await new Promise(resolve => signal.addEventListener("abort", () => { cancelled(); resolve(); }, { once: true }));
      });
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const client = request({ host: "127.0.0.1", port: server.address().port, method: "POST" });
  client.on("error", () => {});
  try {
    client.end("synthetic");
    await started;
    client.destroy();
    await aborted;
  } finally { client.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test("disconnecting a real HTTP client cancels IFC CPU work without publishing data", { timeout: 10000 }, async () => {
  const { createHeavyOperationRunner } = require("../../server/dist/server/src/services/heavy-operations.js");
  const { createIfcImportService } = require("../../server/dist/server/src/application/import-ifc.js");
  const { createIfcWorkerPool } = require("../../server/dist/server/src/services/ifc-worker-pool.js");
  const runner = createHeavyOperationRunner();
  const pool = createIfcWorkerPool({ workerFile: resolve("tests/fixtures/controlled-ifc-worker.cjs") });
  const state = new Int32Array(new SharedArrayBuffer(8));
  let writes = 0, finished;
  const completed = new Promise(resolve => { finished = resolve; });
  const execute = createIfcImportService({ parse: (bytes, options, signal) => pool.parse(bytes, options, signal), save: async () => { writes++; return { writtenCount: 1, removedCount: 0 }; } });
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", async () => {
      try {
        await withClientCancellation(req, res, signal => runner.run({ key: "model", rateMax: 2 }, signal => execute("synthetic", new Uint8Array(state.buffer), {}, signal), signal));
      } catch (error) { assert.equal(error.status, 499); }
      finally { finished(); }
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const client = request({ host: "127.0.0.1", port: server.address().port, method: "POST" });
  client.on("error", () => {});
  try {
    client.end("synthetic");
    for (let index = 0; index < 500 && !Atomics.load(state, 0); index++) await delay(5);
    assert.equal(Atomics.load(state, 0), 1);
    client.destroy();
    await completed;
    assert.equal(writes, 0);
    assert.equal(await runner.run({ key: "model", rateMax: 2 }, async () => "retry"), "retry");
  } finally { client.destroy(); server.closeAllConnections(); await runner.close(); await pool.close(); await new Promise(resolve => server.close(resolve)); }
});
