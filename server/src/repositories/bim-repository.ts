import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { publishBimModel, hideBimModels, type BimStore } from "../../../src/shared/bim/publication";
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
    async get(path) { return (await document(path).get()).data() || null; },
    async list(name, filter) {
      const collection = root.collection(name);
      const snapshot = await (filter ? collection.where(filter.field, "==", filter.value) : collection).get();
      return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    },
    async batch(documents) {
      const batch = database.batch();
      for (const entry of documents) batch.set(document(entry.path), entry.data);
      await batch.commit();
    },
    transaction: action => database.runTransaction(async transaction => {
      if (!(await transaction.get(root)).exists) throw Object.assign(new Error("Project not found"), { status: 404 });
      return action({
        async get(path) { return (await transaction.get(document(path))).data() || null; },
        set(path, data) { transaction.set(document(path), data); }
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
