import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { publishBimModel, hideBimModels, collectBimGenerations, type BimStore } from "../../../src/shared/bim/publication";
import type { IfcModelData } from "../../../src/shared/bim/types";

export async function ensureProjectAccess(projectId: string, uid: string) {
  const project = await getFirestore().doc(`projects/${projectId}`).get();
  if (!project.exists) return { ok: false, reason: "project-not-found" };
  const data = project.data() || {};
  return uid && (data.ownerUid === uid || data.createdBy === uid) ? { ok: true, data } : { ok: false, reason: "forbidden" };
}

export function createAdminBimStore(projectId: string): BimStore {
  const database = getFirestore();
  const root = database.doc(`projects/${projectId}`);
  const document = (path: string) => root.collection(path.split("/")[0]).doc(path.split("/")[1]);
  return {
    id: randomUUID,
    timestamp: () => FieldValue.serverTimestamp(),
    async page(name, options) {
      let request = root.collection(name).orderBy(FieldPath.documentId()).limit(options.limit);
      if (options.filter) request = request.where(options.filter.field, "==", options.filter.value);
      if (options.after) request = request.startAfter(options.after);
      return (await request.get()).docs.map(doc => ({ id: doc.id, data: doc.data() }));
    },
    async get(path) { return (await document(path).get()).data() || null; },
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
      const batch = database.batch();
      for (const entry of documents) batch.set(document(entry.path), entry.data);
      await batch.commit();
    },
    transaction: action => database.runTransaction(async transaction => {
      if (!(await transaction.get(root)).exists) throw Object.assign(new Error("Project not found"), { status: 404 });
      return action({
        async get(path) { return (await transaction.get(document(path))).data() || null; },
        set(path, data) { transaction.set(document(path), data); },
        delete(path) { transaction.delete(document(path)); }
      });
    })
  };
}

export function publishProjectBimModel(projectId: string, model: IfcModelData) {
  return publishBimModel(createAdminBimStore(projectId), model.sourceModelId, model.elements);
}
export function clearProjectElements(projectId: string, sourceModelId?: string) {
  return hideBimModels(createAdminBimStore(projectId), sourceModelId);
}

export function collectProjectBimGenerations(projectId: string) {
  return collectBimGenerations(createAdminBimStore(projectId));
}
