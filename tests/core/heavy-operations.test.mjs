import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createHeavyOperationRunner } = require("../../server/dist/server/src/services/heavy-operations.js");
const options = key => ({ key, rateWindowMs: 1000, rateMax: 1 });

test("expired rate keys release bounded capacity without weakening active limits", async () => {
  let now = 0;
  const runner = createHeavyOperationRunner({ maxKeys: 2, retentionMs: 1000, now: () => now });
  try {
    await runner.run(options("a"), async () => "a");
    await runner.run(options("b"), async () => "b");
    await assert.rejects(runner.run(options("a"), async () => "wrong"), { status: 429 });
    await assert.rejects(runner.run(options("c"), async () => "wrong"), { status: 503 });
    now = 1001;
    assert.equal(await runner.run(options("c"), async () => "c"), "c");
  } finally { await runner.close(); }
});

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test("shutdown rejects new work and retains the lock until started persistence settles", async () => {
  const runner = createHeavyOperationRunner();
  const entered = deferred(), commit = deferred();
  let observedSignal, settled = false;
  const running = runner.run(options("publication"), async signal => { observedSignal = signal; entered.resolve(); await commit.promise; return "committed"; });
  await entered.promise;
  await assert.rejects(runner.run(options("publication"), async () => "wrong"), { status: 409 });
  const closing = runner.close().then(() => { settled = true; });
  assert.equal(observedSignal.aborted, true);
  await assert.rejects(runner.run(options("other"), async () => "wrong"), { status: 503 });
  await Promise.resolve();
  assert.equal(settled, false);
  commit.resolve();
  assert.equal(await running, "committed");
  await closing;
  await runner.close();
});

test("failure releases an operation lock while retaining its rate limit", async () => {
  const runner = createHeavyOperationRunner();
  try {
    await assert.rejects(runner.run({ ...options("a"), rateMax: 2 }, async () => { throw new Error("write failed"); }), /write failed/);
    assert.equal(await runner.run({ ...options("a"), rateMax: 2 }, async () => "retry"), "retry");
    await assert.rejects(runner.run({ ...options("a"), rateMax: 2 }, async () => "wrong"), { status: 429 });
  } finally { await runner.close(); }
});


test("a shorter delete window cannot erase import history on their shared mutation key", async () => {
  let now = 0;
  const runner = createHeavyOperationRunner({ retentionMs: 60000, now: () => now });
  try {
    await runner.run({ key: "bimMutation", rateWindowMs: 60000, rateMax: 2 }, async () => "import");
    now = 40000;
    await runner.run({ key: "bimMutation", rateWindowMs: 30000, rateMax: 3 }, async () => "delete");
    now = 50000;
    await assert.rejects(runner.run({ key: "bimMutation", rateWindowMs: 60000, rateMax: 2 }, async () => "wrong"), { status: 429 });
    now = 60001;
    assert.equal(await runner.run({ key: "bimMutation", rateWindowMs: 60000, rateMax: 2 }, async () => "retry"), "retry");
  } finally { await runner.close(); }
});
