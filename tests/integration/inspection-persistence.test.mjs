import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import * as firestore from "firebase/firestore";

const address = process.env.FIRESTORE_EMULATOR_HOST || "";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(address)) throw new Error("A loopback Firestore emulator is required.");

test("inspection persistence is atomic, recoverable and revision guarded in Firestore", { timeout: 120000 }, async t => {
  const [host, port] = address.split(":");
  const environment = await initializeTestEnvironment({ projectId: "demo-inspection-consistency", firestore: { host, port: Number(port), rules: await readFile("firestore.rules", "utf8") } });
  let failRefresh = false, readGate = null;
  const db = environment.authenticatedContext("owner").firestore();
  const sdk = {
    ...firestore,
    async runTransaction(...args) { if (failRefresh) { failRefresh = false; throw new Error("synthetic analytics interruption"); } return firestore.runTransaction(...args); },
    async getDocs(reference) { const result = await firestore.getDocs(reference); if (readGate) await readGate(reference.path); return result; }
  };
  sdk.getDocsFromServer = async reference => { const result = await firestore.getDocsFromServer(reference); if (readGate) await readGate(reference.path); return result; };
  globalThis.integrationInspectionSdk = sdk;
  globalThis.integrationInspectionDb = db;
  try {
    const bundle = await build({
      stdin: { resolveDir: process.cwd(), contents: `export * from './src/client/app/repositories/firestore-repository.ts'; export * from './src/client/app/services/analytics-current.ts'; export * from './src/client/app/services/inspection-sync.ts'; export { createFirestoreStrengthService } from './src/client/features/inspections/strength/firestore-service.ts';` },
      bundle: true, write: false, platform: "node", format: "esm",
      plugins: [{ name: "emulator-sdk", setup(context) {
        context.onResolve({ filter: /infrastructure\/firebase\/firestore\.js$/ }, () => ({ path: "sdk", namespace: "emulator" }));
        context.onResolve({ filter: /(?:^|\/)firebase\.js$/ }, () => ({ path: "db", namespace: "emulator" }));
        context.onResolve({ filter: /bim-repository\.js$/ }, () => ({ path: "bim", namespace: "emulator" }));
        context.onLoad({ filter: /.*/, namespace: "emulator" }, args => ({ contents: args.path === "sdk" ? Object.keys(sdk).map(name => `export const ${name}=globalThis.integrationInspectionSdk.${name};`).join("\n") : args.path === "db" ? "export const db=globalThis.integrationInspectionDb;" : "export function getProjectBimSnapshot(){} export function hideProjectBimModels(){}" }));
      } }]
    });
    const runtime = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
    const project = "inspection-project";
    await firestore.setDoc(firestore.doc(db, "projects", project), { ownerUid: "owner", createdBy: "owner" });
    const service = runtime.createFirestoreStrengthService({ getCurrentUserId: () => "owner" });
    await t.test("Firestore rejection cannot commit just one representation", async () => {
      await assertFails(runtime.saveInspectionSourceDoc(project, "elements", "forbidden", { name: "forbidden BIM write" }, { moduleKey: "strength", checkStatus: "ok" }));
      assert.equal((await runtime.getProjectCollectionDocSnapshot(project, "inspections", "elements_forbidden")).exists(), false);
      assert.equal((await runtime.getProjectDocSnapshot(project)).data().inspectionSync, undefined);
    });
    await t.test("saved evidence survives interruption and a reopened service repairs analytics", async () => {
      const input = { id: "check", status: "exceeded", actual: 20 };
      failRefresh = true;
      await service.createCheck(project, input);
      assert.equal((await runtime.getProjectDocSnapshot(project)).data().inspectionSync.pending, true);
      const reopened = runtime.createFirestoreStrengthService({ getCurrentUserId: () => "owner" });
      assert.equal((await reopened.loadChecks(project)).get("check").actual, 20);
      await reopened.createCheck(project, { ...input });
      const saved = (await runtime.getProjectDocSnapshot(project)).data();
      assert.equal(saved.analyticsCurrent.totalChecks, 1);
      assert.equal(saved.analyticsCurrent.exceededCount, 1);
      assert.equal(saved.inspectionSync.pending, false);
    });
    await t.test("a stale snapshot cannot clear the marker of a newer save", async () => {
      let entered, release;
      const waiting = new Promise(resolve => { entered = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      readGate = async path => { if (path.endsWith("/inspections")) { readGate = null; entered(); await gate; } };
      const delayed = runtime.recomputeAndPersistProjectAnalyticsCurrent(project);
      await waiting;
      await service.updateCheck(project, "check", { status: "ok", actual: 31 });
      release();
      await delayed;
      assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.exceededCount, 0);
      await service.deleteCheck(project, "check");
      await service.deleteCheck(project, "check");
      assert.equal((await service.loadChecks(project)).size, 0);
      assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.totalChecks, 0);
    });
    await t.test("journal session numbers are atomic and retrying an operation does not consume another number", async () => {
      const payload = { date: 1800000000000, createdAt: 1800000000000, entries: [{ module: "Геометрия", status: "ok" }] };
      const results = await Promise.all([
        runtime.saveJournalSessionAndRefreshAnalytics(project, "session-a", payload),
        runtime.saveJournalSessionAndRefreshAnalytics(project, "session-b", payload)
      ]);
      assert.deepEqual(results.map(result => result.checkNumber).sort(), [1, 2]);
      const repeated = await runtime.saveJournalSessionAndRefreshAnalytics(project, "session-a", payload);
      assert.equal(repeated.checkNumber, results[0].checkNumber);
      assert.equal((await runtime.getProjectCollectionSnapshot(project, "journalSessions")).size, 2);
      assert.equal((await runtime.getProjectDocSnapshot(project)).data().lastCheckNumber, 2);
      assert.equal((await runtime.getProjectCollectionDocSnapshot(project, "inspections", "session-a")).data().sessionId, "session-a");
    });
  } finally {
    delete globalThis.integrationInspectionSdk;
    delete globalThis.integrationInspectionDb;
    await environment.cleanup();
  }
});
