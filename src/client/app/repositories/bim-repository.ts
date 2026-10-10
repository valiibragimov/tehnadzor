import { db } from "../../firebase.js";
import { collection, doc, getDocFromServer, getDocsFromServer, query, where, runTransaction, writeBatch, serverTimestamp, documentId, orderBy, startAfter, limit, type QueryConstraint } from "../../infrastructure/firebase/firestore.js";
import { publishBimModel, hideBimModels, loadPublishedBimElements, type BimStore, type BimElementRecord } from "../../infrastructure/bim-publication.js";

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
export async function getProjectBimSnapshot(projectId: string) {
  const records = await loadPublishedBimElements(createBrowserBimStore(projectId));
  const docs = records.map(record => ({ id: record.id, data: (): Record<string, any> => record.data }));
  return { docs, size: docs.length, empty: !docs.length, forEach: (callback: (doc: typeof docs[number]) => void) => docs.forEach(callback) };
}
export function publishProjectBimModel(projectId: string, sourceModelId: string, elements: BimElementRecord[]) {
  return publishBimModel(createBrowserBimStore(projectId), sourceModelId, elements);
}
export function hideProjectBimModels(projectId: string, sourceModelId?: string) {
  return hideBimModels(createBrowserBimStore(projectId), sourceModelId);
}
