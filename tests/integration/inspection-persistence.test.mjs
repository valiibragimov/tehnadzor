import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import * as firestore from "firebase/firestore";

const address = process.env.FIRESTORE_EMULATOR_HOST || "";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(address)) throw new Error("A loopback Firestore emulator is required.");

test("inspection persistence is atomic, recoverable and revision guarded in Firestore", { timeout: 120000 }, async t => {
  const [host, port] = address.split(":");
  const environment = await initializeTestEnvironment({ projectId: "demo-inspection-consistency", firestore: { host, port: Number(port), rules: await readFile("firestore.rules", "utf8") } });
  let failRefresh = false, readGate = null, fullScans = 0;
  const db = environment.authenticatedContext("owner").firestore();
  const sdk = {
    ...firestore,
    async runTransaction(...args) { if (failRefresh) { failRefresh = false; throw new Error("synthetic analytics interruption"); } return firestore.runTransaction(...args); },
    async getDocs(reference) { const result = await firestore.getDocs(reference); if (readGate) await readGate(reference.path); return result; }
  };
  sdk.getDocsFromServer = async reference => {
    if (reference.path?.endsWith("/inspections")) fullScans += 1;
    const result = await firestore.getDocsFromServer(reference);
    if (readGate) await readGate(reference.path);
    return result;
  };
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
    await t.test("unauthenticated and foreign users cannot save inspection evidence", async () => {
      for (const [name, context] of [["anonymous", environment.unauthenticatedContext()], ["foreign", environment.authenticatedContext("foreign")]]) {
        globalThis.integrationInspectionDb = context.firestore();
        const deniedRuntime = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}#${name}`);
        await assertFails(deniedRuntime.saveInspectionSourceDoc(project, "strengthChecks", "denied", { actual: 20 }, { sourceCollection: "strengthChecks", sourceId: "denied" }));
        assert.equal((await runtime.getProjectCollectionDocSnapshot(project, "strengthChecks", "denied")).exists(), false);
        assert.equal((await runtime.getProjectCollectionDocSnapshot(project, "inspections", "strengthChecks_denied")).exists(), false);
        assert.equal((await runtime.getProjectDocSnapshot(project)).data().inspectionSync, undefined);
      }
      globalThis.integrationInspectionDb = db;
    });
    await t.test("Firestore rejection cannot commit just one representation", async () => {
      await assertFails(runtime.saveInspectionSourceDoc(project, "elements", "forbidden", { name: "forbidden BIM write" }, { moduleKey: "strength", evaluationSchemaVersion: 2, checkStatus: "ok" }));
      assert.equal((await runtime.getProjectCollectionDocSnapshot(project, "inspections", "elements_forbidden")).exists(), false);
      assert.equal((await runtime.getProjectDocSnapshot(project)).data().inspectionSync, undefined);
    });
    await t.test("saved evidence survives interruption and a reopened service repairs analytics", async () => {
      const input = { id: "check", evaluationSchemaVersion: 2, status: "exceeded", actual: 20 };
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
      await service.updateCheck(project, "check", { evaluationSchemaVersion: 2, status: "ok", actual: 31 });
      release();
      await delayed;
      assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.exceededCount, 0);
      await service.deleteCheck(project, "check");
      await service.deleteCheck(project, "check");
      assert.equal((await service.loadChecks(project)).size, 0);
      assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.totalChecks, 0);
    });
    await t.test("journal session numbers are atomic and retrying an operation does not consume another number", async () => {
      const payload = { date: 1800000000000, createdAt: 1800000000000, entries: [{ module: "Геометрия", evaluationSchemaVersion: 2, status: "ok" }] };
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
    await t.test("targeted queries preserve legacy aliases and shared repairs scan Firestore once", async () => {
      await runtime.setProjectCollectionDoc(project, "inspections", "legacy-check", { sourceCollection: "strengthChecks", moduleKey: "strength", evaluationSchemaVersion: 2, checkStatus: "exceeded" });
      await runtime.setProjectCollectionDoc(project, "inspections", "legacy-alias", { sourceCollection: "strengthChecks", sourceDocId: "legacy-check", moduleKey: "strength", evaluationSchemaVersion: 2, checkStatus: "exceeded" });
      fullScans = 0;
      await service.updateCheck(project, "legacy-check", { evaluationSchemaVersion: 2, status: "ok", actual: 31 });
      assert.equal(fullScans, 1);
      for (const id of ["legacy-check", "legacy-alias"]) assert.equal((await runtime.getProjectCollectionDocSnapshot(project, "inspections", id)).data().checkStatus, "ok");
      await runtime.commitInspectionRegistryDocs(project, [{ id: "repair", data: { moduleKey: "geometry", evaluationSchemaVersion: 2, checkStatus: "exceeded" } }]);
      fullScans = 0;
      const repaired = await Promise.all(Array.from({ length: 4 }, () => runtime.refreshPendingProjectAnalytics(project)));
      assert.equal(fullScans, 1);
      assert.equal(repaired.every(result => result.exceededCount === 1), true);
    });
  } finally {
    delete globalThis.integrationInspectionSdk;
    delete globalThis.integrationInspectionDb;
    await environment.cleanup();
  }
});


test("browser Firestore channel cancellation does not leak AbortError on rejected reads and reconnects", { timeout: 60000 }, async () => {
  const { chromium } = await import("playwright");
  const { startStaticServer } = await import("../smoke/helpers/static-server.mjs");
  const { resolve } = await import("node:path");
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "tehnadzor-channel-"));
  await build({
    entryPoints: ["app", "auth", "firestore"].map(name => resolve(`src/client/infrastructure/firebase/${name}.ts`)),
    outdir: resolve(temporaryRoot, "infrastructure/firebase"), entryNames: "[name]",
    bundle: true, splitting: true, format: "esm", platform: "browser", target: "es2022"
  });
  const server = await startStaticServer(temporaryRoot);
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.route("**/*", route => {
      const origin = new URL(route.request().url()).origin;
      return origin === server.url || origin === `http://${address}` ? route.continue() : route.abort();
    });
    await page.goto(server.url + "/infrastructure/firebase/app.js");
    const result = await page.evaluate(async address => {
      const appSdk = await import("/infrastructure/firebase/app.js");
      const sdk = await import("/infrastructure/firebase/firestore.js");
      const app = appSdk.initializeApp({ apiKey: "demo-key", projectId: "demo-inspection-consistency", appId: "demo-browser" });
      const db = sdk.initializeFirestore(app, { localCache: sdk.persistentLocalCache({ tabManager: sdk.persistentMultipleTabManager() }) });
      const [host, port] = address.split(":");
      sdk.connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: "foreign" } });
      const unhandled = [], reasons = [];
      globalThis.addEventListener("unhandledrejection", event => unhandled.push(String(event.reason)));
      const abort = AbortController.prototype.abort;
      AbortController.prototype.abort = function(...args) {
        const result = abort.apply(this, args);
        reasons.push(this.signal.reason?.name);
        return result;
      };
      let denied = 0;
      try {
        for (let cycle = 0; cycle < 5; cycle += 1) {
          await sdk.getDocsFromServer(sdk.collection(db, "projects", "inspection-project", "inspections")).catch(error => {
            if (error.code !== "permission-denied") throw error;
            denied += 1;
          });
          await sdk.disableNetwork(db);
          await sdk.enableNetwork(db);
        }
        await sdk.terminate(db);
        await sdk.clearIndexedDbPersistence(db);
        await appSdk.deleteApp(app);
        await new Promise(resolve => setTimeout(resolve, 100));
      } finally { AbortController.prototype.abort = abort; }
      return { denied, unhandled, reasons };
    }, address);
    assert.equal(result.denied, 5);
    assert.deepEqual(result.unhandled, []);
    assert.deepEqual(errors, []);
    assert.ok(result.reasons.includes("AbortError"), "exercise real SDK channel cancellation");
  } finally { await browser.close(); await server.close(); await rm(temporaryRoot, { recursive: true, force: true }); }
});
