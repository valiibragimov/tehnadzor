import { FieldValue, getFirestore } from "firebase-admin/firestore";

export async function ensureProjectAccess(projectId, uid) {
  const projectSnap = await getFirestore().collection("projects").doc(projectId).get();
  if (!projectSnap.exists) return { ok: false, reason: "project-not-found" };

  const data = projectSnap.data() || {};
  const ownerUid = String(data.ownerUid || "").trim();
  const createdBy = String(data.createdBy || "").trim();
  if (uid && (ownerUid === uid || createdBy === uid)) {
    return { ok: true, data };
  }

  return { ok: false, reason: "forbidden" };
}

export async function clearExistingElementsBySourceModelId(projectId, sourceModelId, retainedIds: string[] = []) {
  const collectionRef = getFirestore().collection("projects").doc(projectId).collection("elements");
  const snap = await collectionRef.where("sourceModelId", "==", sourceModelId).get();
  if (snap.empty) return 0;

  let deleted = 0;
  let batch = getFirestore().batch();
  let batchSize = 0;

  const retained = new Set(retainedIds);
  for (const docSnap of snap.docs) {
    if (retained.has(docSnap.id)) continue;
    batch.delete(docSnap.ref);
    batchSize += 1;
    deleted += 1;

    if (batchSize >= 400) {
      await batch.commit();
      batch = getFirestore().batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  return deleted;
}

export async function clearProjectElements(projectId, sourceModelId) {
  const collectionRef = getFirestore().collection("projects").doc(projectId).collection("elements");
  const normalizedSourceModelId = String(sourceModelId || "").trim();
  const targetRef = normalizedSourceModelId
    ? collectionRef.where("sourceModelId", "==", normalizedSourceModelId)
    : collectionRef;
  const snap = await targetRef.get();
  if (snap.empty) return 0;

  let deleted = 0;
  let batch = getFirestore().batch();
  let batchSize = 0;

  for (const docSnap of snap.docs) {
    batch.delete(docSnap.ref);
    batchSize += 1;
    deleted += 1;

    if (batchSize >= 400) {
      await batch.commit();
      batch = getFirestore().batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  return deleted;
}

export async function writeImportedElements(projectId, elements) {
  if (!Array.isArray(elements) || elements.length === 0) return 0;

  const collectionRef = getFirestore().collection("projects").doc(projectId).collection("elements");
  let written = 0;
  let batch = getFirestore().batch();
  let batchSize = 0;

  for (const element of elements) {
    const docRef = collectionRef.doc(element.elementId);
    batch.set(docRef, {
      ...element,
      importedAt: FieldValue.serverTimestamp()
    });
    batchSize += 1;
    written += 1;

    if (batchSize >= 400) {
      await batch.commit();
      batch = getFirestore().batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  return written;
}
