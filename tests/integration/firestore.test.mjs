import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import * as clientFirestore from "firebase/firestore";
import { doc, getDoc, setDoc, writeBatch, runTransaction, serverTimestamp } from "firebase/firestore";
const require = createRequire(import.meta.url);
const serverRequire = createRequire(new URL("../../server/package.json", import.meta.url));
const { initializeApp, deleteApp } = serverRequire("firebase-admin/app");
const { getFirestore } = serverRequire("firebase-admin/firestore");
const { createAdminBimStore } = require("../../server/dist/server/src/repositories/bim-repository.js");
const { publishBimModel, loadPublishedBimElements, hideBimModels, readPublishedBimPages, collectBimGenerations } = require("../../server/dist/src/shared/bim/publication.js");
const address = process.env.FIRESTORE_EMULATOR_HOST || "";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(address)) throw new Error("Integration tests require a local Firestore emulator; live access is forbidden.");
const projectId = "demo-tehnadzor-test";
const elements = (count, label) => Array.from({ length: count }, (_, index) => ({ elementId: `model_${index}`, sourceModelId: "model", name: label, projectX: index * 1000 }));

test("Firestore publication is atomic, conflict-safe, owner-scoped and backward-readable", { timeout: 120000 }, async t => {
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
      const failing = { ...store, batch: (entries, guard) => { if (++batches === 2) throw new Error("simulated storage failure"); return store.batch(entries, guard); } };
      await assert.rejects(publishBimModel(failing, "model", elements(450, "partial")), /simulated/);
      assert.equal((await loadPublishedBimElements(store)).length, 450);
      assert.equal((await loadPublishedBimElements(store))[0].data.name, "complete");
      assert.equal((await store.list("bimPublications")).length, 1);
      const abandoned = (await store.list("bimGenerations")).find(r => r.data.status === "staging");
      await getFirestore().doc(`projects/project/bimGenerations/${abandoned.id}`).update({ updatedAt: 0 });
      assert.equal((await collectBimGenerations(store, { stagingMs: 300000 })).elements, 200);
      assert.equal((await loadPublishedBimElements(store)).length, 450);
    });
    await t.test("simultaneous publishers from separate adapters cannot mix models", async () => {
      let entered = 0, release;
      const barrier = new Promise(resolve => { release = resolve; });
      const gate = adapter => ({ ...adapter, async batch(entries, guard) { if (++entered <= 2) { if (entered === 2) release(); await barrier; } return adapter.batch(entries, guard); } });
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
      const pending = publishBimModel({ ...store, async batch(entries, guard) { started(); await gate; return store.batch(entries, guard); } }, "model", elements(1, "late"));
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
      const pending = publishBimModel({ ...store, async batch(entries, guard) { started(); await gate; return store.batch(entries, guard); } }, "model", elements(2, "pending"));
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
      assert.equal(await hideBimModels(store, "model"), 2);
      assert.deepEqual(await loadPublishedBimElements(store), []);
    });
    await t.test("deleting the parent project prevents delayed Admin publication", async () => {
      const project = getFirestore().doc("projects/deleted-project");
      await project.set({ ownerUid: "alice", createdBy: "alice" });
      const adapter = createAdminBimStore("deleted-project");
      let started, release;
      const entered = new Promise(resolve => { started = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      const pending = publishBimModel({ ...adapter, async batch(entries, guard) { started(); await gate; return adapter.batch(entries, guard); } }, "model", elements(1, "late"));
      await entered;
      await project.delete();
      release();
      await assert.rejects(pending, { status: 404 });
      assert.equal((await project.collection("bimModels").get()).empty, true);
    });
    await t.test("paged readers retain one catalog across replacement and cleanup", async () => {
      await publishBimModel(store, "model", elements(7, "pinned"));
      const old = await store.get("bimModels/model");
      const pages = readPublishedBimPages(store, 2);
      const first = await pages.next();
      assert.equal(first.value.length, 2);
      await publishBimModel(store, "model", elements(3, "replacement"));
      await getFirestore().doc(`projects/project/bimGenerations/${old.generation}`).update({ retiredAt: 0 });
      await collectBimGenerations(store, { retentionMs: 300000, stagingMs: 300000 });
      assert.equal((await store.get(`bimGenerations/${old.generation}`)).status, "ready");
      const records = [...first.value];
      for await (const page of pages) { assert.ok(page.length <= 2); records.push(...page); }
      assert.equal(records.length, 7);
      assert.equal(new Set(records.map(r => r.id)).size, 7);
      assert.ok(records.every(r => r.data.name === "pinned"));
      const collected = await collectBimGenerations(store, { retentionMs: 300000, stagingMs: 300000 });
      assert.ok(collected.generations >= 1);
      assert.equal((await store.get(`bimGenerations/${old.generation}`)).status, "purged");
      assert.equal((await store.list("bimElements", { field: "bimGeneration", value: old.generation })).length, 0);
      assert.ok((await loadPublishedBimElements(store)).every(r => r.data.name === "replacement"));
      assert.deepEqual(await collectBimGenerations(store, { retentionMs: 300000, stagingMs: 300000 }), { generations: 0, elements: 0 });
    });
    await t.test("cleanup fences an abandoned importer before its next chunk", async () => {
      let started, release;
      const entered = new Promise(resolve => { started = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      let generation;
      const pending = publishBimModel({ ...store, async batch(entries, guard) {
        generation = entries[0].data.bimGeneration;
        started(); await gate;
        return store.batch(entries, guard);
      } }, "model", elements(3, "abandoned"));
      await entered;
      await getFirestore().doc(`projects/project/bimGenerations/${generation}`).update({ updatedAt: 0 });
      await collectBimGenerations(store, { retentionMs: 300000, stagingMs: 300000 });
      release();
      await assert.rejects(pending, { status: 409 });
      assert.equal((await store.list("bimElements", { field: "bimGeneration", value: generation })).length, 0);
    });
    await t.test("expired readers cannot resume after cleanup", async () => {
      await publishBimModel(store, "model", elements(4, "expired"));
      const pages = readPublishedBimPages(store, 1);
      await pages.next();
      const old = await store.get("bimModels/model");
      await publishBimModel(store, "model", elements(2, "current"));
      await getFirestore().doc(`projects/project/bimGenerations/${old.generation}`).update({ retiredAt: 0 });
      for (const reader of await store.list("bimReaders")) await getFirestore().doc(`projects/project/bimReaders/${reader.id}`).update({ updatedAt: 0 });
      await collectBimGenerations(store, { retentionMs: 300000, stagingMs: 300000 });
      await assert.rejects(pages.next(), { status: 409 });
      assert.equal((await loadPublishedBimElements(store)).length, 2);
    });
    await t.test("cleanup resumes interrupted deletion and preserves unmanaged legacy documents", async () => {
      await store.batch([{ path: "bimGenerations/interrupted", data: { sourceModelId: "model", status: "deleting", updatedAt: 0 } }, ...elements(450, "garbage").map(e => ({ path: `bimElements/interrupted_${e.elementId}`, data: { ...e, bimGeneration: "interrupted" } }))]);
      let deletionBatches = 0;
      const interrupted = { ...store, transaction: action => store.transaction(async tx => {
        const pending = [];
        const result = await action({ ...tx, delete(path) { pending.push(path); } });
        if (pending.some(path => path.startsWith("bimElements/")) && ++deletionBatches === 2) throw new Error("simulated collector interruption");
        for (const path of pending) tx.delete(path);
        return result;
      }) };
      await assert.rejects(collectBimGenerations(interrupted), /collector interruption/);
      assert.equal((await store.get("bimGenerations/interrupted")).status, "deleting");
      const collected = await collectBimGenerations(store);
      assert.equal(collected.elements, 250);
      assert.equal((await store.get("bimGenerations/interrupted")).status, "purged");
      assert.ok((await store.get("elements/model_0")));
    });
    await t.test("catalog acquisition retries when publication changes between queries", async () => {
      let changed = false;
      const racing = { ...store, async list(name, filter) {
        const records = await store.list(name, filter);
        if (name === "bimModels" && !changed) { changed = true; await publishBimModel(store, "model", elements(5, "new-catalog")); }
        return records;
      } };
      const result = await loadPublishedBimElements(racing);
      assert.equal(result.length, 5);
      assert.ok(result.every(r => r.data.name === "new-catalog"));
    });
    await t.test("reader renewal fences a collector that scanned an expired lease", async () => {
      await publishBimModel(store, "model", elements(5, "reader-renewal"));
      const pages = readPublishedBimPages(store, 1);
      await pages.next();
      const old = await store.get("bimModels/model");
      await publishBimModel(store, "model", elements(2, "after-renewal"));
      await getFirestore().doc(`projects/project/bimGenerations/${old.generation}`).update({ retiredAt: 0 });
      for (const reader of await store.list("bimReaders")) await getFirestore().doc(`projects/project/bimReaders/${reader.id}`).update({ updatedAt: 0 });
      let renewed = false;
      const collector = { ...store, async list(name, filter) {
        const records = await store.list(name, filter);
        if (name === "bimReaders" && !renewed) { renewed = true; await pages.next(); }
        return records;
      } };
      await collectBimGenerations(collector, { retentionMs: 300000 });
      assert.equal((await store.get(`bimGenerations/${old.generation}`)).status, "ready");
      await pages.return();
      assert.equal((await store.list("bimReaders")).length, 0);
    });
    await t.test("global clear preserves an already pinned historical snapshot", async () => {
      await publishBimModel(store, "model", elements(3, "before-global-clear"));
      const pages = readPublishedBimPages(store, 1);
      await pages.next();
      await hideBimModels(store);
      assert.deepEqual(await loadPublishedBimElements(store), []);
      const rest = [];
      for await (const page of pages) rest.push(...page);
      assert.equal(rest.length, 2);
      assert.ok(rest.every(r => r.data.name === "before-global-clear"));
    });
    await t.test("an authenticated browser-sized chunk fits the Firestore rules access budget", async () => {
      const database = environment.authenticatedContext("alice").firestore();
      const registry = doc(database, "projects/project/bimGenerations/permissions");
      await setDoc(registry, { status: "staging", sourceModelId: "permissions", updatedAt: serverTimestamp() });
      const batch = writeBatch(database);
      batch.set(registry, { status: "staging", sourceModelId: "permissions", updatedAt: serverTimestamp() });
      for (let index = 0; index < 200; index++) batch.set(doc(database, `projects/project/bimElements/permissions_${index}`), { sourceModelId: "permissions", bimGeneration: "permissions", elementId: `permissions_${index}` });
      await batch.commit();
      assert.equal((await store.list("bimElements", { field: "bimGeneration", value: "permissions" })).length, 200);
      await setDoc(doc(database, "projects/project/bimGenerations/browser-chunk"), { status: "staging", sourceModelId: "browser-chunk", updatedAt: serverTimestamp() });
      await runTransaction(database, async tx => {
        assert.equal((await tx.get(doc(database, "projects/project"))).exists(), true);
        const registry = doc(database, "projects/project/bimGenerations/browser-chunk");
        assert.equal((await tx.get(registry)).data().status, "staging");
        tx.set(registry, { status: "staging", sourceModelId: "browser-chunk", updatedAt: serverTimestamp() });
        for (let index = 0; index < 200; index++) tx.set(doc(database, `projects/project/bimElements/browser_${index}`), { elementId: `browser_${index}`, sourceModelId: "browser-chunk", bimGeneration: "browser-chunk" });
      });
    });
    await t.test("browser publication, paging and deletion obey immutable lifecycle rules", async () => {
      const database = environment.authenticatedContext("alice").firestore();
      const document = path => doc(database, "projects", "project", ...path.split("/"));
      const browserStore = {
        id: () => crypto.randomUUID(), timestamp: serverTimestamp,
        async get(path) { return (await clientFirestore.getDocFromServer(document(path))).data() || null; },
        async page(name, options) {
          const constraints = [clientFirestore.orderBy(clientFirestore.documentId()), clientFirestore.limit(options.limit)];
          if (options.filter) constraints.push(clientFirestore.where(options.filter.field, "==", options.filter.value));
          if (options.after) constraints.push(clientFirestore.startAfter(options.after));
          return (await clientFirestore.getDocsFromServer(clientFirestore.query(clientFirestore.collection(database, "projects/project/" + name), ...constraints))).docs.map(d => ({ id: d.id, data: d.data() }));
        },
        async list(name, filter) { const result = []; let after; for (;;) { const page = await this.page(name, { filter, after, limit: 200 }); result.push(...page); if (page.length < 200) return result; after = page.at(-1).id; } },
        async batch(entries, guard) { await this.transaction(async tx => { if (guard) await guard(tx); for (const e of entries) tx.set(e.path, e.data); }); },
        transaction: action => runTransaction(database, async tx => {
          await tx.get(doc(database, "projects/project"));
          return action({ async get(path) { return (await tx.get(document(path))).data() || null; }, set(path, data) { tx.set(document(path), data); }, delete(path) { tx.delete(document(path)); } });
        })
      };
      const records = elements(3, "browser-owned").map(e => ({ ...e, sourceModelId: "browser-model", elementId: "browser-" + e.elementId }));
      await publishBimModel(browserStore, "browser-model", records);
      assert.equal((await loadPublishedBimElements(browserStore)).length, 3);
      const manifest = await browserStore.get("bimModels/browser-model");
      await assertFails(setDoc(document(`bimElements/${manifest.generation}_${records[0].elementId}`), { ...records[0], bimGeneration: manifest.generation }));
      await assertFails(setDoc(document("bimModels/browser-model"), { ...manifest, count: 999 }));
      await assertFails(clientFirestore.deleteDoc(document(`bimGenerations/${manifest.generation}`)));
      await assertFails(setDoc(document("elements/model_0"), { ...records[0] }));
      await publishBimModel(browserStore, "browser-model", records.slice(0, 2));
      assert.equal((await loadPublishedBimElements(browserStore)).length, 2);
      await hideBimModels(browserStore, "browser-model");
      assert.deepEqual(await loadPublishedBimElements(browserStore), []);
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
