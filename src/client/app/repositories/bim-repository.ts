import { auth, db } from "../../firebase.js";
import { collection, doc, getDocFromServer, getDocsFromServer, query, where, runTransaction, writeBatch, serverTimestamp, documentId, orderBy, startAfter, limit, type QueryConstraint } from "../../infrastructure/firebase/firestore.js";
import { publishBimModel, hideBimModels, readPublishedBimPages, type BimStore, type BimElementRecord } from "../../infrastructure/bim-publication.js";

function createBrowserBimStore(projectId: string): BimStore {
  const document = (path: string) => doc(db, "projects", projectId, ...path.split("/") as [string, string]);
  return {
    id: () => crypto.randomUUID(),
    timestamp: serverTimestamp,
    async page(name, options) {
      const constraints: QueryConstraint[] = [orderBy(documentId()), limit(options.limit)];
      if (options.filter) constraints.push(where(options.filter.field, "==", options.filter.value));
      if (options.after) constraints.push(startAfter(options.after));
      const snapshot = await getDocsFromServer(query(collection(db, "projects", projectId, name), ...constraints));
      return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    },
    async get(path) { return (await getDocFromServer(document(path))).data() || null; },
    async list(name, filter) {
      const documents = [];
      let after: string | undefined;
      for (;;) {
        const page = await this.page(name, { filter, after, limit: 200 });
        documents.push(...page);
        if (page.length < 200) return documents;
        after = page[page.length - 1].id;
      }
    },
    async batch(documents, guard) {
      if (guard) return this.transaction(async tx => { await guard(tx); for (const entry of documents) tx.set(entry.path, entry.data); });
      const batch = writeBatch(db);
      for (const entry of documents) batch.set(document(entry.path), entry.data);
      await batch.commit();
    },
    transaction: action => runTransaction(db, async transaction => {
      if (!(await transaction.get(doc(db, "projects", projectId))).exists()) throw Object.assign(new Error("Project not found"), { status: 404 });
      return action({
        async get(path) { return (await transaction.get(document(path))).data() || null; },
        set(path, data) { transaction.set(document(path), data); },
        delete(path) { transaction.delete(document(path)); }
      });
    })
  };
}
type BimSnapshot = { docs: Array<{ id: string; data(): Record<string, any> }>; size: number; empty: boolean; forEach(callback: (doc: BimSnapshot["docs"][number]) => void): void };
// Keep only one project/version. Never reuse across identities or trust a cached catalog.
let cached: { key: string; snapshot: Promise<BimSnapshot> } | null = null;
let requestSequence = 0;
export async function getProjectBimSnapshot(projectId: string): Promise<BimSnapshot> {
  const sequence = ++requestSequence;
  const store = createBrowserBimStore(projectId);
  const state = await store.get("bimState/current");
  const manifests = await store.list("bimModels");
  const key = JSON.stringify([auth.currentUser?.uid, projectId, state?.epoch, state?.legacyHidden,
    manifests.map(m => [m.id, m.data.generation, m.data.revision, m.data.deleted])]);
  if (cached?.key === key) return cached.snapshot;
  const snapshot = (async () => {
    const docs: BimSnapshot["docs"] = [];
    for await (const page of readPublishedBimPages(store)) for (const record of page) {
      const data = Object.freeze({ ...record.data, id: record.id });
      docs.push({ id: record.id, data: () => data });
    }
    return { docs, size: docs.length, empty: !docs.length, forEach: callback => docs.forEach(callback) };
  })();
  if (sequence === requestSequence) cached = { key, snapshot };
  try { return await snapshot; }
  catch (error) { if (cached?.snapshot === snapshot) cached = null; throw error; }
}
export function publishProjectBimModel(projectId: string, sourceModelId: string, elements: BimElementRecord[]) {
  cached = null;
  return publishBimModel(createBrowserBimStore(projectId), sourceModelId, elements);
}
export function hideProjectBimModels(projectId: string, sourceModelId?: string) {
  cached = null;
  return hideBimModels(createBrowserBimStore(projectId), sourceModelId);
}
