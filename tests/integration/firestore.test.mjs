import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
const require = createRequire(import.meta.url);
const serverRequire = createRequire(new URL("../../server/package.json", import.meta.url));
const { initializeApp, deleteApp } = serverRequire("firebase-admin/app");
const { getFirestore } = serverRequire("firebase-admin/firestore");
const { createAdminBimStore } = require("../../server/dist/server/src/repositories/bim-repository.js");
const { publishBimModel, loadPublishedBimElements, hideBimModels } = require("../../server/dist/src/shared/bim/publication.js");
const address = process.env.FIRESTORE_EMULATOR_HOST || "";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(address)) throw new Error("Integration tests require a local Firestore emulator; live access is forbidden.");
const projectId = "demo-tehnadzor-test";
const elements = (count, label) => Array.from({ length: count }, (_, index) => ({ elementId: `model_${index}`, sourceModelId: "model", name: label, projectX: index * 1000 }));

test("Firestore publication is atomic, conflict-safe, owner-scoped and backward-readable", { timeout: 60000 }, async t => {
  const [host, port] = address.split(":");
  const environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile("firestore.rules", "utf8") } });
  const app = initializeApp({ projectId });
  const store = createAdminBimStore("project");
  try {
    await environment.clearFirestore();
    await getFirestore().doc("projects/project").set({ ownerUid: "alice", createdBy: "alice" });
    await getFirestore().doc("projects/project/elements/model_0").set(elements(1, "legacy")[0]);
    await t.test("legacy data is read until a complete generation is published", async () => {
      assert.equal((await loadPublishedBimElements(store))[0].data.name, "legacy");
      const result = await publishBimModel(store, "model", elements(450, "complete"));
      assert.equal(result.removedCount, 1);
      const history = await store.list("bimPublications");
      assert.equal(history.length, 1);
      assert.equal(history[0].data.schemaVersion, 1);
      assert.equal(history[0].data.count, 450);
      const records = await loadPublishedBimElements(store);
      assert.equal(records.length, 450);
      assert.equal(records[0].data.name, "complete");
      assert.equal((await getFirestore().doc("projects/project/elements/model_0").get()).data().name, "legacy");
    });
    await t.test("failure in a later batch never changes the visible generation", async () => {
      let batches = 0;
      const failing = { ...store, batch: entries => { if (++batches === 2) throw new Error("simulated storage failure"); return store.batch(entries); } };
      await assert.rejects(publishBimModel(failing, "model", elements(450, "partial")), /simulated/);
      assert.equal((await loadPublishedBimElements(store)).length, 450);
      assert.equal((await loadPublishedBimElements(store))[0].data.name, "complete");
      assert.equal((await store.list("bimPublications")).length, 1);
    });
    await t.test("simultaneous publishers from separate adapters cannot mix models", async () => {
      let entered = 0, release;
      const barrier = new Promise(resolve => { release = resolve; });
      const gate = adapter => ({ ...adapter, async batch(entries) { if (++entered <= 2) { if (entered === 2) release(); await barrier; } return adapter.batch(entries); } });
      const results = await Promise.allSettled([publishBimModel(gate(store), "model", elements(2, "first")), publishBimModel(gate(createAdminBimStore("project")), "model", elements(3, "second"))]);
      assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
      const rejected = results.find(result => result.status === "rejected");
      assert.equal(rejected.reason.status, 409);
      const visible = await loadPublishedBimElements(store);
      assert.equal(new Set(visible.map(doc => doc.data.name)).size, 1);
    });
    await t.test("delete wins over an import that started before deletion", async () => {
      let started, release;
      const entered = new Promise(resolve => { started = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const pending = publishBimModel({ ...store, async batch(entries) { started(); await gate; return store.batch(entries); } }, "model", elements(1, "late"));
      await entered;
      await hideBimModels(store);
      release();
      await assert.rejects(pending, { status: 409 });
      assert.deepEqual(await loadPublishedBimElements(store), []);
      await publishBimModel(store, "model", elements(2, "after-clear"));
      assert.equal((await loadPublishedBimElements(store)).length, 2);
      await hideBimModels(store, "model");
      assert.deepEqual(await loadPublishedBimElements(store), []);
    });
    await t.test("source deletion also fences a pending publisher", async () => {
      await publishBimModel(store, "model", elements(1, "before-delete"));
      let started, release;
      const entered = new Promise(resolve => { started = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const pending = publishBimModel({ ...store, async batch(entries) { started(); await gate; return store.batch(entries); } }, "model", elements(2, "pending"));
      await entered;
      await hideBimModels(store, "model");
      release();
      await assert.rejects(pending, { status: 409 });
      assert.deepEqual(await loadPublishedBimElements(store), []);
    });
    await t.test("incomplete published generations fail closed instead of returning partial data", async () => {
      await publishBimModel(store, "model", elements(2, "complete"));
      const manifest = await store.get("bimModels/model");
      await getFirestore().doc(`projects/project/bimElements/${manifest.generation}_model_0`).delete();
      await assert.rejects(loadPublishedBimElements(store), /generation is incomplete/);
    });
    await t.test("deleting the parent project prevents delayed Admin publication", async () => {
      const project = getFirestore().doc("projects/deleted-project");
      await project.set({ ownerUid: "alice", createdBy: "alice" });
      const adapter = createAdminBimStore("deleted-project");
      let started, release;
      const entered = new Promise(resolve => { started = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const pending = publishBimModel({ ...adapter, async batch(entries) { started(); await gate; return adapter.batch(entries); } }, "model", elements(1, "late"));
      await entered;
      await project.delete();
      release();
      await assert.rejects(pending, { status: 404 });
      assert.equal((await project.collection("bimModels").get()).empty, true);
    });
    await t.test("an authenticated browser-sized chunk fits the Firestore rules access budget", async () => {
      const database = environment.authenticatedContext("alice").firestore();
      const batch = writeBatch(database);
      for (let index = 0; index < 200; index++) batch.set(doc(database, `projects/project/bimElements/permissions_${index}`), { sourceModelId: "permissions", bimGeneration: "permissions", elementId: `permissions_${index}` });
      await batch.commit();
      assert.equal((await store.list("bimElements", { field: "bimGeneration", value: "permissions" })).length, 200);
    });
    await t.test("rules deny cross-owner writes and manifest reads", async () => {
      const bob = environment.authenticatedContext("bob").firestore();
      await assertFails(getDoc(doc(bob, "projects/project/bimModels/model")));
      await assertFails(setDoc(doc(bob, "projects/project/bimState/current"), { epoch: 999 }));
      const alice = environment.authenticatedContext("alice").firestore();
      assert.equal((await getDoc(doc(alice, "projects/project/bimModels/model"))).exists(), true);
    });
  } finally { await environment.cleanup(); await deleteApp(app); }
});
