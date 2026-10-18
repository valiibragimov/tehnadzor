import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

// The production repositories and services run unchanged; faults occur only at
// the Firestore SDK boundary. Batches stage writes until commit succeeds.
const records = new Map();
let sequence = 0, failWrite = null, readGate = null, partialCache = false;
const ref = (...parts) => ({ path: parts.filter(part => typeof part === "string").join("/"), get id() { return this.path.split("/").at(-1); } });
function mergeFields(previous = {}, incoming) {
  const result = structuredClone(previous);
  for (const [key, value] of Object.entries(incoming)) result[key] = value && typeof value === "object" && !Array.isArray(value) ? mergeFields(result[key], value) : structuredClone(value);
  return result;
}
function snapshot(reference) {
  const value = records.get(reference.path);
  return { id: reference.id, ref: reference, exists: () => value !== undefined, data: () => structuredClone(value) };
}
function writer() {
  const writes = [], paths = [];
  const api = {
    set(reference, value, options) { paths.push(reference.path); writes.push(() => records.set(reference.path, options?.merge ? mergeFields(records.get(reference.path), value) : structuredClone(value))); return api; },
    delete(reference) { paths.push(reference.path); writes.push(() => records.delete(reference.path)); return api; },
    async commit() { if (failWrite && failWrite(paths)) { failWrite = null; const error = new Error("batch rejected"); error.stack = error.message; throw error; } writes.forEach(write => write()); },
    async get(reference) { return snapshot(reference); }
  };
  return api;
}
const sdk = {
  collection: (_, ...parts) => ref(...parts),
  doc: (parent, ...parts) => typeof parent?.path === "string" ? ref(parent.path, ...(parts.length ? parts : [`auto-${++sequence}`])) : ref(...parts),
  getDoc: async reference => snapshot(reference),
  getDocs: async reference => { const docs = [...records.keys()].filter(path => path.startsWith(reference.path + "/") && !path.slice(reference.path.length + 1).includes("/")).map(path => snapshot(ref(path))); if (readGate) await readGate(reference.path); return { docs, empty: !docs.length, size: docs.length, forEach: callback => docs.forEach(callback) }; },
  setDoc: async (...args) => { const batch = writer(); batch.set(...args); await batch.commit(); },
  deleteDoc: async reference => { const batch = writer(); batch.delete(reference); await batch.commit(); },
  addDoc: async (parent, data) => { const reference = sdk.doc(parent); await sdk.setDoc(reference, data); return reference; },
  writeBatch: writer,
  runTransaction: async (_, callback) => { const transaction = writer(); const result = await callback(transaction); await transaction.commit(); return result; },
  serverTimestamp: () => 1800000000000,
  onSnapshot() {}, orderBy() {}, query: reference => reference, where() {}
};
sdk.getDocsFromServer = sdk.getDocs;
const readDocs = sdk.getDocs;
sdk.getDocs = async reference => partialCache && reference.path.endsWith("/inspections")
  ? { docs: [], empty: true, size: 0, forEach() {} }
  : readDocs(reference);
globalThis.inspectionTestSdk = sdk;
const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: `export { createFirestoreGeodesyService } from './src/client/features/inspections/geodesy/firestore-service.ts'; export { createFirestoreStrengthService } from './src/client/features/inspections/strength/firestore-service.ts'; export { createFirestoreReinforcementService } from './src/client/features/inspections/reinforcement/firestore-service.ts'; export * from './src/client/app/repositories/firestore-repository.ts'; export * from './src/client/app/services/analytics-current.ts'; export * from './src/client/app/services/inspection-sync.ts';` },
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "firestore-boundary", setup(context) {
    context.onResolve({ filter: /infrastructure\/firebase\/firestore\.js$/ }, () => ({ path: "sdk", namespace: "fixture" }));
    context.onResolve({ filter: /(?:^|\/)firebase\.js$/ }, () => ({ path: "db", namespace: "fixture" }));
    context.onResolve({ filter: /bim-repository\.js$/ }, () => ({ path: "bim", namespace: "fixture" }));
    context.onResolve({ filter: /infrastructure\/firebase\/auth\.js$/ }, () => ({ path: "auth", namespace: "fixture" }));
    context.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "sdk" ? Object.keys(sdk).map(name => `export const ${name}=globalThis.inspectionTestSdk.${name};`).join("\n") : args.path === "db" ? "export const db={};" : args.path === "auth" ? "export const getAuth=()=>({currentUser:{uid:'owner'}});" : "export function getProjectBimSnapshot(){throw Error('BIM outside this test');} export function hideProjectBimModels(){}" }));
  } }]
});
const runtime = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const service = runtime.createFirestoreStrengthService({ getCurrentUserId: () => "owner" });
const project = "synthetic-project";
function reset() { records.clear(); failWrite = null; readGate = null; partialCache = false; records.set(`projects/${project}`, { ownerUid: "owner", createdBy: "owner" }); }

test("a rejected inspection batch leaves both the previous source and registry intact", async () => {
  reset();
  await service.updateCheck(project, "check", { status: "ok", actual: 31 });
  failWrite = paths => paths.some(path => path.includes("/inspections/"));
  await assert.rejects(service.updateCheck(project, "check", { status: "exceeded", actual: 20 }), /batch rejected/);
  assert.equal((await service.loadChecks(project)).get("check").actual, 31);
  assert.equal((await runtime.getProjectCollectionDocSnapshot(project, "inspections", "strengthChecks_check")).data().checkStatus, "ok");
});

test("opening checks after a failed analytics refresh recovers the saved result", async () => {
  reset();
  await service.updateCheck(project, "check", { status: "ok" });
  failWrite = paths => paths.length === 1 && paths[0] === `projects/${project}`;
  await service.updateCheck(project, "check", { status: "exceeded" });
  assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.exceededCount, 0);
  // A new service instance represents reopening the project after a reload.
  const reopened = runtime.createFirestoreStrengthService({ getCurrentUserId: () => "owner" });
  assert.equal((await reopened.loadChecks(project)).get("check").status, "exceeded");
  const recovered = (await runtime.getProjectDocSnapshot(project)).data();
  assert.equal(recovered.analyticsCurrent.exceededCount, 1);
  assert.equal(recovered.inspectionSync.pending, false);
});

test("retrying creation with the same inspection identity creates one check", async () => {
  reset();
  const data = { id: "stable-check", status: "exceeded", createdAt: 1800000000000 };
  const first = await service.createCheck(project, data);
  const repeated = await service.createCheck(project, { ...data });
  assert.equal(first.id, "stable-check");
  assert.equal(repeated.id, first.id);
  assert.equal((await service.loadChecks(project)).size, 1);
  assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.totalChecks, 1);
});

test("a failed deletion preserves both representations and retry removes both", async () => {
  reset();
  await service.updateCheck(project, "check", { status: "ok" });
  failWrite = paths => paths.some(path => path.includes("/inspections/"));
  await assert.rejects(service.deleteCheck(project, "check"), /batch rejected/);
  assert.equal((await service.loadChecks(project)).size, 1);
  assert.equal((await runtime.getProjectCollectionDocSnapshot(project, "inspections", "strengthChecks_check")).exists(), true);
  await service.deleteCheck(project, "check");
  await service.deleteCheck(project, "check");
  assert.equal((await service.loadChecks(project)).size, 0);
  assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.totalChecks, 0);
});

test("a delayed analytics snapshot cannot overwrite a more recent inspection result", async () => {
  reset();
  await service.updateCheck(project, "check", { status: "ok" });
  let entered, release;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  readGate = async path => { if (path.endsWith("/inspections")) { readGate = null; entered(); await gate; } };
  const delayed = runtime.recomputeAndPersistProjectAnalyticsCurrent(project);
  await waiting;
  await service.updateCheck(project, "check", { status: "exceeded" });
  release();
  await delayed;
  assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.exceededCount, 1);
});

test("clearing more than one batch can resume after a partial failure", async () => {
  reset();
  for (let index = 0; index < 251; index += 1) await service.updateCheck(project, `check-${index}`, { status: "ok" });
  let batches = 0;
  failWrite = paths => paths.some(path => path.includes("/inspections/")) && ++batches === 2;
  await assert.rejects(service.clearChecks(project), /batch rejected/);
  assert.equal((await service.loadChecks(project)).size, 2);
  assert.equal((await runtime.getProjectCollectionSnapshot(project, "inspections")).size, 2);
  await service.clearChecks(project);
  await service.clearChecks(project);
  assert.equal((await service.loadChecks(project)).size, 0);
  assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.totalChecks, 0);
});

test("reinforcement retries retain identity and a projection failure cannot replace saved evidence", async () => {
  reset();
  const reinforcement = runtime.createFirestoreReinforcementService({ getCurrentUserId: () => "owner" });
  const data = { id: "rebar", status: "ok", factDia: 16 };
  await reinforcement.createCheck(project, data);
  await reinforcement.createCheck(project, { ...data });
  assert.equal((await reinforcement.loadChecks(project)).size, 1);
  failWrite = paths => paths.some(path => path.includes("/inspections/"));
  await assert.rejects(reinforcement.updateCheck(project, "rebar", { status: "exceeded", factDia: 12 }), /batch rejected/);
  assert.equal((await reinforcement.loadChecks(project)).get("rebar").factDia, 16);
});


test("geodesy saves and soft deletion are atomic and recoverable", async () => {
  reset();
  const geo = runtime.createFirestoreGeodesyService({ getCurrentUserId: () => "owner", getCurrentConstructionKey: () => "foundation_slab", getCurrentConstructionCategoryKey: () => "foundation", getCurrentConstructionLabel: () => "Slab", getCurrentConstructionType: () => "Плита" });
  await geo.saveNode(project, "node", { status: "ok", factX: 10 });
  failWrite = paths => paths.some(path => path.includes("/inspections/"));
  await assert.rejects(geo.saveNode(project, "node", { status: "bad", factX: 20 }), /batch rejected/);
  assert.equal((await geo.loadNodes(project)).get("node").factX, 10);
  failWrite = paths => paths.some(path => path.includes("/inspections/"));
  await assert.rejects(geo.deleteNode(project, "node"), /batch rejected/);
  assert.equal((await geo.loadNodes(project)).size, 1);
  await geo.deleteNode(project, "node");
  await geo.deleteNode(project, "node");
  assert.equal((await geo.loadNodes(project)).size, 0);
  assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.totalChecks, 0);
});

test("updating a legacy registry identity preserves links and refreshes its result", async () => {
  reset();
  await runtime.setProjectCollectionDoc(project, "inspections", "legacy-registry", { sourceId: "old-check", sourceCollection: "strengthChecks", moduleKey: "strength", checkStatus: "exceeded" });
  await service.updateCheck(project, "old-check", { status: "ok" });
  assert.equal((await runtime.getProjectCollectionDocSnapshot(project, "inspections", "legacy-registry")).data().checkStatus, "ok");
  assert.equal((await runtime.getProjectCollectionSnapshot(project, "inspections")).size, 1);
  assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.exceededCount, 0);
  await service.deleteCheck(project, "old-check");
  assert.equal((await runtime.getProjectCollectionSnapshot(project, "inspections")).size, 0);
});


test("registry-only synchronization retains a durable retry after analytics failure", async () => {
  reset();
  failWrite = paths => paths.length === 1 && paths[0] === `projects/${project}`;
  await runtime.saveInspectionAndRefreshAnalytics(project, "legacy-only", { moduleKey: "geometry", checkStatus: "ok" });
  assert.equal((await runtime.getProjectDocSnapshot(project)).data().inspectionSync.pending, true);
  await runtime.refreshPendingProjectAnalytics(project);
  assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.totalChecks, 1);
});

test("a check saved during module clearing keeps its registry representation", async () => {
  reset();
  await service.updateCheck(project, "old", { status: "ok" });
  let entered, release;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  readGate = async path => { if (path.endsWith("/strengthChecks")) { readGate = null; entered(); await gate; } };
  const clearing = service.clearChecks(project);
  await waiting;
  await service.updateCheck(project, "new", { status: "exceeded" });
  release();
  await clearing;
  assert.deepEqual([...(await service.loadChecks(project)).keys()], ["new"]);
  assert.equal((await runtime.getProjectCollectionDocSnapshot(project, "inspections", "strengthChecks_new")).data().checkStatus, "exceeded");
  assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.totalChecks, 1);
});

test("simultaneous first saves in different modules cannot overwrite each other's registry", async () => {
  reset();
  const geo = runtime.createFirestoreGeodesyService({ getCurrentUserId: () => "owner", getCurrentConstructionKey: () => "foundation_slab", getCurrentConstructionCategoryKey: () => "foundation", getCurrentConstructionLabel: () => "Slab", getCurrentConstructionType: () => "Плита" });
  await Promise.all([geo.saveNode(project, "same-id", { status: "bad" }), service.updateCheck(project, "same-id", { status: "ok" })]);
  assert.equal((await runtime.getProjectCollectionSnapshot(project, "inspections")).size, 2);
  await runtime.refreshPendingProjectAnalytics(project);
  const analytics = (await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent;
  assert.equal(analytics.byModule.geo.total, 1);
  assert.equal(analytics.byModule.strength.total, 1);
});

test("analytics repair cannot publish a partial offline cache as the complete registry", async () => {
  reset();
  await service.updateCheck(project, "check", { status: "exceeded" });
  partialCache = true;
  await runtime.recomputeAndPersistProjectAnalyticsCurrent(project);
  assert.equal((await runtime.getProjectDocSnapshot(project)).data().analyticsCurrent.totalChecks, 1);
});
