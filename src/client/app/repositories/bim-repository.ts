import { db } from "../../firebase.js";
import { collection, doc, getDoc, getDocs, query, where, runTransaction, writeBatch } from "../../infrastructure/firebase/firestore.js";
import { publishBimModel, hideBimModels, loadPublishedBimElements, type BimStore, type BimElementRecord } from "../../infrastructure/bim-publication.js";

function createBrowserBimStore(projectId: string): BimStore {
  const document = (path: string) => doc(db, "projects", projectId, ...path.split("/") as [string, string]);
  return {
    id: () => crypto.randomUUID(),
    async get(path) { return (await getDoc(document(path))).data() || null; },
    async list(name, filter) {
      const ref = collection(db, "projects", projectId, name);
      const snapshot = await getDocs(filter ? query(ref, where(filter.field, "==", filter.value)) : ref);
      return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    },
    async batch(documents) {
      const batch = writeBatch(db);
      for (const entry of documents) batch.set(document(entry.path), entry.data);
      await batch.commit();
    },
    transaction: action => runTransaction(db, async transaction => {
      if (!(await transaction.get(doc(db, "projects", projectId))).exists()) throw Object.assign(new Error("Project not found"), { status: 404 });
      return action({
        async get(path) { return (await transaction.get(document(path))).data() || null; },
        set(path, data) { transaction.set(document(path), data); }
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
