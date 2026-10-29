import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { modelFixture } from "../fixtures/ifc.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createIfcWorkerPool } = require("../../server/dist/server/src/services/ifc-worker-pool.js");

test("a closed IFC pool rejects new work with a retryable status", async () => {
  const pool = createIfcWorkerPool();
  await pool.close();
  await assert.rejects(pool.parse(new Uint8Array(), {}), { status: 503 });
});

function configuredPool(t, timeout = "5000") {
  for (const [name, value] of Object.entries({ IFC_WORKER_THREADS: "1", IFC_WORKER_QUEUE: "1", IFC_WORKER_TIMEOUT_MS: timeout })) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => previous == null ? delete process.env[name] : process.env[name] = previous);
  }
  return createIfcWorkerPool({ workerFile: resolve("tests/fixtures/controlled-ifc-worker.cjs") });
}
async function waitStarted(state) {
  for (let attempt = 0; attempt < 500; attempt++) { if (Atomics.load(state, 0)) return; await delay(5); }
  throw new Error("Synthetic worker did not start");
}
function input() { const state = new Int32Array(new SharedArrayBuffer(8)); return { state, bytes: new Uint8Array(state.buffer) }; }

test("a full queue rejects extra work; cancelling a queued task releases its place", { timeout: 10000 }, async t => {
  const pool = configuredPool(t), first = input(), queued = input();
  const controller = new AbortController();
  const running = pool.parse(first.bytes, {});
  try {
    await waitStarted(first.state);
    const waiting = pool.parse(queued.bytes, {}, controller.signal);
    const rejected = assert.rejects(waiting, { name: "AbortError" });
    assert.equal(pool.queueSize, 1);
    await assert.rejects(pool.parse(input().bytes, {}), { status: 503 });
    controller.abort();
    await rejected;
    assert.equal(pool.queueSize, 0);
    Atomics.store(first.state, 1, 1); Atomics.notify(first.state, 1);
    assert.equal((await running).importedCount, 1);
  } finally { Atomics.store(first.state, 1, 1); Atomics.notify(first.state, 1); await pool.close(); await running.catch(() => {}); }
});

test("execution timeout aborts CPU work and the pool accepts a subsequent task", { timeout: 10000 }, async t => {
  const pool = configuredPool(t, "100"), blocked = input();
  try {
    await assert.rejects(pool.parse(blocked.bytes, {}), { status: 503 });
    process.env.IFC_WORKER_TIMEOUT_MS = "5000";
    const next = input(); Atomics.store(next.state, 1, 1);
    assert.equal((await pool.parse(next.bytes, {})).importedCount, 1);
  } finally { await pool.close(); }
});

test("closing the pool settles active and queued jobs without leaking workers", { timeout: 10000 }, async t => {
  const pool = configuredPool(t), blocked = input();
  const running = pool.parse(blocked.bytes, {});
  try {
    await waitStarted(blocked.state);
    const waiting = pool.parse(input().bytes, {});
    const settled = Promise.all([assert.rejects(running, { status: 503 }), assert.rejects(waiting, { status: 503 })]);
    await pool.close();
    await settled;
    await pool.close();
  } finally { await pool.close(); }
});

test("the production IFC worker still preserves physical units and rejects oversized input", async () => {
  const pool = createIfcWorkerPool();
  try {
    const model = await pool.parse(modelFixture(), { sourceModelId: "synthetic" });
    assert.equal(model.importedCount, 1);
    assert.equal(model.elements[0].height, 3000);
    await assert.rejects(pool.parse(new Uint8Array(25 * 1024 * 1024 + 1), {}), { status: 413 });
  } finally { await pool.close(); }
});
