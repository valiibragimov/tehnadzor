import { getProjectBimSnapshot, hideProjectBimModels } from "./bim-repository.js";
import { db } from "../../firebase.js";
import { appendNewInspectionAnalytics } from "../inspection-analytics.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  type OrderByDirection,
  type QuerySnapshot,
  type DocumentData,
  orderBy,
  query,
  runTransaction,
  setDoc,
  serverTimestamp,
  where,
  writeBatch
} from "../../infrastructure/firebase/firestore.js";

const JOURNAL_COLLECTION = "journal";
type FirestoreRecord = Record<string, unknown>;

interface StandardProjectFields {
  ownerUid?: string;
  createdBy?: string;
  contractorName?: string;
  createdAt?: number | unknown;
  updatedAt?: unknown;
}

type ProjectPayload = FirestoreRecord & StandardProjectFields;

interface SetProjectCollectionDocsOptions {
  idField?: string;
  merge?: boolean;
  serverTimestampField?: string;
  batchLimit?: number;
}

interface JournalEntryFilters {
  module?: string | null;
  construction?: string | null;
}

function hasOwn(source: unknown, key: string) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function normalizeUid(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function normalizeContractorName(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function withStandardProjectFields(
  data: FirestoreRecord = {},
  mode: "create" | "merge" | "set" = "merge"
): ProjectPayload {
  const payload: ProjectPayload = { ...data };

  const ownerUid = normalizeUid(payload.ownerUid);
  const createdBy = normalizeUid(payload.createdBy);
  delete payload.ownerUid;
  delete payload.createdBy;

  let resolvedOwnerUid = ownerUid;
  let resolvedCreatedBy = createdBy;
  if (!resolvedOwnerUid && resolvedCreatedBy) {
    resolvedOwnerUid = resolvedCreatedBy;
  } else if (!resolvedCreatedBy && resolvedOwnerUid) {
    resolvedCreatedBy = resolvedOwnerUid;
  }
  if (resolvedOwnerUid) payload.ownerUid = resolvedOwnerUid;
  if (resolvedCreatedBy) payload.createdBy = resolvedCreatedBy;

  if (mode === "create" && !hasOwn(payload, "contractorName")) {
    payload.contractorName = "";
  }
  if (hasOwn(payload, "contractorName")) {
    payload.contractorName = normalizeContractorName(payload.contractorName);
  }

  if ((mode === "create" || mode === "set") && !hasOwn(payload, "createdAt")) {
    payload.createdAt = Date.now();
  }

  payload.updatedAt = serverTimestamp();
  return payload;
}

function getProjectCollectionRef(projectId: string, collectionName: string) {
  return collection(db, "projects", projectId, collectionName);
}

function toPathParts(path: unknown) {
  return String(path || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getProjectDocRef(projectId: string) {
  return doc(db, "projects", projectId);
}

function getProjectCollectionDocRef(projectId: string, collectionName: string, docId: string) {
  return doc(db, "projects", projectId, collectionName, docId);
}

function getUserDocRef(uid: string) {
  return doc(db, "users", uid);
}

export function getProjectCollectionSnapshot(projectId: string, collectionName: "elements"): ReturnType<typeof getProjectBimSnapshot>;
export function getProjectCollectionSnapshot(projectId: string, collectionName: string): Promise<QuerySnapshot<DocumentData>>;
export async function getProjectCollectionSnapshot(projectId, collectionName) {
  if (collectionName === "elements") return getProjectBimSnapshot(projectId);
  return getDocs(getProjectCollectionRef(projectId, collectionName));
}

export async function getProjectCollectionOrderedSnapshot(
  projectId,
  collectionName,
  field,
  direction: OrderByDirection = "asc"
) {
  const q = query(
    getProjectCollectionRef(projectId, collectionName),
    orderBy(field, direction)
  );
  return getDocs(q);
}

export async function getProjectCollectionDocSnapshot(projectId, collectionName, docId) {
  return getDoc(getProjectCollectionDocRef(projectId, collectionName, docId));
}

export async function createProjectCollectionDoc(
  projectId: string,
  collectionName: string,
  data: FirestoreRecord
) {
  const payload = {
    ...data,
    createdAt: serverTimestamp()
  };
  const ref = await addDoc(getProjectCollectionRef(projectId, collectionName), payload);
  return { id: ref.id, ref };
}

export async function addProjectCollectionDoc(
  projectId: string,
  collectionName: string,
  data: FirestoreRecord
) {
  const ref = await addDoc(getProjectCollectionRef(projectId, collectionName), data);
  return { id: ref.id, ref };
}

export async function updateProjectCollectionDoc(
  projectId: string,
  collectionName: string,
  docId: string,
  data: FirestoreRecord
) {
  const payload = {
    ...data,
    updatedAt: serverTimestamp()
  };
  const ref = getProjectCollectionDocRef(projectId, collectionName, docId);
  await setDoc(ref, payload);
  return { id: docId, ref };
}

export async function setProjectCollectionDoc(
  projectId: string,
  collectionName: string,
  docId: string,
  data: FirestoreRecord,
  options: { merge?: boolean } = {}
) {
  const ref = getProjectCollectionDocRef(projectId, collectionName, docId);
  await setDoc(ref, data, options);
  return { id: docId, ref };
}

export async function deleteProjectCollectionDoc(projectId, collectionName, docId) {
  const ref = getProjectCollectionDocRef(projectId, collectionName, docId);
  await deleteDoc(ref);
}

// Source evidence and its read model must either both change or neither change.
// The additive v1 marker survives a failed analytics refresh and a browser restart.
function inspectionRepresentsSource(document, sourceCollection: string, sourceId: string) {
  const data = document.data();
  return data.sourceCollection === sourceCollection &&
    String(data.sourceId || data.sourceDocId || document.id) === sourceId;
}

export function getInspectionRegistrySnapshot(projectId: string) {
  // A partial offline cache must never become the authoritative analytics snapshot
  // or decide which persisted legacy aliases need updating.
  return getDocsFromServer(getProjectCollectionRef(projectId, "inspections"));
}

async function getInspectionSourceSnapshot(projectId: string, sourceCollection: string, sourceIds: string[]) {
  const registry = getProjectCollectionRef(projectId, "inspections");
  if (sourceIds.length !== 1) {
    return getDocsFromServer(query(registry, where("sourceCollection", "==", sourceCollection)));
  }
  const sourceId = sourceIds[0];
  // Mixing field filters and document IDs in one OR requires an additional
  // production index (the emulator does not enforce it). Separate simple
  // queries use automatic indexes and retain every supported legacy identity.
  // Fail closed: never write from an incomplete alias lookup or offline cache.
  const snapshots = await Promise.all([
    getDocsFromServer(query(registry, where("sourceId", "==", sourceId))),
    getDocsFromServer(query(registry, where("sourceDocId", "==", sourceId))),
    getDocsFromServer(query(registry, where(documentId(), "in", [sourceId, `${sourceCollection}_${sourceId}`])))
  ]);
  const documents = new Map(snapshots.flatMap(snapshot => snapshot.docs.map(document => [document.id, document] as const)));
  return { docs: [...documents.values()] };
}

export async function saveInspectionSourceDoc(
  projectId: string,
  sourceCollection: string,
  sourceId: string,
  source: FirestoreRecord,
  inspection: FirestoreRecord,
  options: { merge?: boolean } = {}
) {
  // Capture the revision BEFORE the alias queries. Any cooperating writer
  // invalidates this observation; the ordinary pending/recovery path remains.
  const before = await getProjectDocSnapshot(projectId);
  const inspections = await getInspectionSourceSnapshot(projectId, sourceCollection, [sourceId]);
  const matching = inspections.docs.filter(document => inspectionRepresentsSource(document, sourceCollection, sourceId));
  const registryIds = matching.map(document => document.id);
  if (!registryIds.length) {
    const registryId = `${sourceCollection}_${sourceId}`;
    if (inspections.docs.some(document => document.id === registryId)) throw new Error("Inspection registry identity is already occupied.");
    registryIds.push(registryId);
  }
  if (registryIds.length > 498) throw new Error("Too many inspection aliases for an atomic save.");
  const ref = getProjectCollectionDocRef(projectId, sourceCollection, sourceId);
  const beforeSync = before.data()?.inspectionSync;
  if (inspections.docs.length === 0 && beforeSync?.version === 1 && beforeSync.pending === false &&
      beforeSync.revision && beforeSync.analyticsRevision === beforeSync.revision &&
      sourceId && sourceId === sourceId.trim() &&
      inspection.sourceCollection === sourceCollection && inspection.sourceId === sourceId) {
    const projectRef = getProjectDocRef(projectId);
    const registryRef = getProjectCollectionDocRef(projectId, "inspections", registryIds[0]);
    const saved = await runTransaction(db, async transaction => {
      const project = await transaction.get(projectRef);
      const sourceExists = await transaction.get(ref);
      const aliasExists = await transaction.get(registryRef);
      const sync = project.data()?.inspectionSync;
      if (!project.exists() || sourceExists.exists() || aliasExists.exists() ||
          sync?.version !== 1 || sync.pending !== false || sync.revision !== beforeSync.revision || sync.analyticsRevision !== sync.revision) return false;
      const analyticsCurrent = appendNewInspectionAnalytics(project.data()?.analyticsCurrent, inspection);
      if (!analyticsCurrent) return false;
      const revision = crypto.randomUUID();
      transaction.set(ref, source, options);
      transaction.set(registryRef, inspection, { merge: true });
      transaction.set(projectRef, { analyticsCurrent,
        inspectionSync: { version: 1, revision, analyticsRevision: revision, pending: false } }, { merge: true });
      return true;
    });
    if (saved) return { id: sourceId, ref };
  }
  const batch = writeBatch(db);
  batch.set(ref, source, options);
  for (const registryId of registryIds) {
    batch.set(getProjectCollectionDocRef(projectId, "inspections", registryId), inspection, { merge: true });
  }
  batch.set(getProjectDocRef(projectId), {
    inspectionSync: { version: 1, revision: crypto.randomUUID(), pending: true }
  }, { merge: true });
  await batch.commit();
  return { id: sourceId, ref };
}

export async function deleteInspectionSourceDocs(
  projectId: string, sourceCollection: string, sourceIds: string[], softDelete = false
) {
  if (!sourceIds.length) return;
  const inspections = await getInspectionSourceSnapshot(projectId, sourceCollection, sourceIds);
  const aliasesBySource = new Map<string, typeof inspections.docs>();
  for (const document of inspections.docs) {
    const data = document.data();
    if (data.sourceCollection !== sourceCollection) continue;
    const sourceId = String(data.sourceId || data.sourceDocId || document.id);
    const aliases = aliasesBySource.get(sourceId) || [];
    aliases.push(document);
    aliasesBySource.set(sourceId, aliases);
  }
  // Keep each source and all its legacy aliases together within the 500 write limit.
  let offset = 0;
  while (offset < sourceIds.length) {
    const batch = writeBatch(db);
    let writes = 1;
    while (offset < sourceIds.length) {
      const sourceId = sourceIds[offset];
      const matching = aliasesBySource.get(sourceId) || [];
      if (matching.length > 498) throw new Error("Too many inspection aliases for an atomic deletion.");
      if (writes + 1 + matching.length > 500) break;
      const ref = getProjectCollectionDocRef(projectId, sourceCollection, sourceId);
      if (softDelete) batch.set(ref, { deleted: true }, { merge: true });
      else batch.delete(ref);
      for (const document of matching) batch.delete(document.ref);
      writes += 1 + matching.length;
      offset += 1;
    }
    batch.set(getProjectDocRef(projectId), {
      inspectionSync: { version: 1, revision: crypto.randomUUID(), pending: true }
    }, { merge: true });
    await batch.commit();
  }
}

export async function persistInspectionAnalyticsIfCurrent(
  projectId: string, revision: string, analyticsCurrent: FirestoreRecord, targetedIdentities = false
) {
  return runTransaction(db, async transaction => {
    const ref = getProjectDocRef(projectId);
    const project = await transaction.get(ref);
    if (!project.exists()) throw new Error("Inspection project no longer exists.");
    if ((project.data().inspectionSync?.revision || "") !== revision) return false;
    transaction.set(ref, {
      analyticsCurrent,
      inspectionSync: { version: 1, revision: revision || crypto.randomUUID(), analyticsRevision: targetedIdentities ? revision : "", pending: false }
    }, { merge: true });
    return true;
  });
}

export async function clearInspectionSourceDocs(projectId: string, sourceCollection: string) {
  const snapshot = await getDocsFromServer(getProjectCollectionRef(projectId, sourceCollection));
  await deleteInspectionSourceDocs(projectId, sourceCollection, snapshot.docs.map(document => document.id));
  return snapshot.size;
}

export async function commitInspectionRegistryDocs(
  projectId: string, entries: Array<{ id: string; data?: FirestoreRecord; merge?: boolean }>
) {
  for (let offset = 0; offset < entries.length; offset += 499) {
    const batch = writeBatch(db);
    for (const entry of entries.slice(offset, offset + 499)) {
      const ref = getProjectCollectionDocRef(projectId, "inspections", entry.id);
      if (entry.data) batch.set(ref, entry.data, { merge: entry.merge ?? true });
      else batch.delete(ref);
    }
    batch.set(getProjectDocRef(projectId), {
      inspectionSync: { version: 1, revision: crypto.randomUUID(), pending: true }
    }, { merge: true });
    await batch.commit();
  }
}

export async function deleteOrphanInspectionDoc(projectId: string, inspectionId: string, sourceCollection: string) {
  if (!sourceCollection) return false;
  return runTransaction(db, async transaction => {
    const inspectionRef = getProjectCollectionDocRef(projectId, "inspections", inspectionId);
    const inspection = await transaction.get(inspectionRef);
    if (!inspection.exists()) return false;
    const data = inspection.data();
    if (data.sourceCollection && data.sourceCollection !== sourceCollection) return false;
    const sourceId = String(data.sourceId || data.sourceDocId || data.sourceSessionId || inspectionId);
    const source = await transaction.get(getProjectCollectionDocRef(projectId, sourceCollection, sourceId));
    if (source.exists() && !source.data().deleted) return false;
    transaction.delete(inspectionRef);
    transaction.set(getProjectDocRef(projectId), {
      inspectionSync: { version: 1, revision: crypto.randomUUID(), pending: true }
    }, { merge: true });
    return true;
  });
}

export async function saveJournalInspectionSession(projectId: string, sessionId: string, payload: FirestoreRecord) {
  return runTransaction(db, async transaction => {
    const projectRef = getProjectDocRef(projectId);
    const sessionRef = getProjectCollectionDocRef(projectId, "journalSessions", sessionId);
    const project = await transaction.get(projectRef);
    const existing = await transaction.get(sessionRef);
    if (!project.exists()) throw new Error("Inspection project no longer exists.");
    if (existing.exists()) return { id: sessionId, checkNumber: Number(existing.data().checkNumber) };
    const checkNumber = (Number(project.data().lastCheckNumber) || 0) + 1;
    const session = { ...payload, checkNumber };
    transaction.set(sessionRef, session);
    transaction.set(getProjectCollectionDocRef(projectId, "inspections", sessionId), {
      ...session, projectId, sessionId, sourceCollection: "journalSessions", sourceSessionId: sessionId,
      entriesCount: Array.isArray(payload.entries) ? payload.entries.length : 0
    });
    transaction.set(projectRef, {
      lastCheckNumber: checkNumber, lastCheckDate: payload.date,
      inspectionSync: { version: 1, revision: crypto.randomUUID(), pending: true }
    }, { merge: true });
    return { id: sessionId, checkNumber };
  });
}

export async function clearProjectCollection(projectId: string, collectionName: string) {
  if (collectionName === "elements") return hideProjectBimModels(projectId);
  const snap = await getProjectCollectionSnapshot(projectId, collectionName);
  if (snap.empty) return 0;

  const docs = snap.docs;
  const batchLimit = 500;
  for (let index = 0; index < docs.length; index += batchLimit) {
    const chunk = docs.slice(index, index + batchLimit);
    const batch = writeBatch(db);
    chunk.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  }
  return snap.size;
}

export async function deleteProjectCollectionDocsByField(
  projectId,
  collectionName,
  field,
  value,
  batchLimit = 500,
  retainedIds: string[] = []
) {
  const normalizedBatchLimit = Math.max(1, Number(batchLimit) || 500);
  const snap = await getDocs(
    query(getProjectCollectionRef(projectId, collectionName), where(field, "==", value))
  );
  if (snap.empty) return 0;

  const retained = new Set(retainedIds);
  const docs = snap.docs.filter(doc => !retained.has(doc.id));
  for (let index = 0; index < docs.length; index += normalizedBatchLimit) {
    const chunk = docs.slice(index, index + normalizedBatchLimit);
    const batch = writeBatch(db);
    chunk.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  }

  return docs.length;
}

export async function setProjectCollectionDocs(
  projectId: string,
  collectionName: string,
  items: FirestoreRecord[],
  options: SetProjectCollectionDocsOptions = {}
) {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const {
    idField = "id",
    merge = false,
    serverTimestampField = "",
    batchLimit = 500
  } = options;
  const normalizedBatchLimit = Math.max(1, Number(batchLimit) || 500);

  let written = 0;
  let batch = writeBatch(db);
  let batchSize = 0;

  for (const item of items) {
    const docId = String(item?.[idField] || "").trim();
    if (!docId) continue;

    const ref = getProjectCollectionDocRef(projectId, collectionName, docId);
    const payload: FirestoreRecord = { ...item };
    if (serverTimestampField) {
      payload[serverTimestampField] = serverTimestamp();
    }

    batch.set(ref, payload, merge ? { merge: true } : undefined);
    batchSize += 1;
    written += 1;

    if (batchSize >= normalizedBatchLimit) {
      await batch.commit();
      batch = writeBatch(db);
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
  }

  return written;
}

export async function getProjectsByFieldSnapshot(field, value) {
  return getDocs(query(collection(db, "projects"), where(field, "==", value)));
}

export async function getProjectsSnapshot() {
  return getDocs(collection(db, "projects"));
}

export async function createProjectDoc(data: FirestoreRecord) {
  const payload = withStandardProjectFields(data, "create");
  const ref = await addDoc(collection(db, "projects"), payload);
  return { id: ref.id, ref };
}

export async function getProjectDocSnapshot(projectId) {
  return getDoc(getProjectDocRef(projectId));
}

export async function getUserDocSnapshot(uid) {
  return getDoc(getUserDocRef(uid));
}

export async function mergeUserDoc(uid: string, data: FirestoreRecord) {
  const ref = getUserDocRef(uid);
  await setDoc(ref, data, { merge: true });
  return ref;
}

export async function mergeProjectDoc(projectId: string, data: FirestoreRecord) {
  const ref = getProjectDocRef(projectId);
  const payload = withStandardProjectFields(data, "merge");
  await setDoc(ref, payload, { merge: true });
  return ref;
}

export async function deleteProjectDoc(projectId) {
  const ref = getProjectDocRef(projectId);
  await deleteDoc(ref);
}

export function watchDocSync(docRef: Parameters<typeof onSnapshot>[0], onData: (...args: unknown[]) => void, onError?: (...args: unknown[]) => void) {
  return onSnapshot(
    docRef,
    { includeMetadataChanges: true },
    onData,
    onError
  );
}

export async function addJournalEntryDoc(entry: FirestoreRecord) {
  const ref = await addDoc(collection(db, JOURNAL_COLLECTION), entry);
  return { id: ref.id, ref };
}

export async function addJournalEntryDocs(entries: FirestoreRecord[]) {
  if (!Array.isArray(entries) || entries.length === 0) return 0;
  const batch = writeBatch(db);
  const journalRef = collection(db, JOURNAL_COLLECTION);
  entries.forEach((entry) => {
    const entryRef = doc(journalRef);
    batch.set(entryRef, entry);
  });
  await batch.commit();
  return entries.length;
}

export async function getJournalEntriesSnapshot(projectId) {
  const q = query(
    collection(db, JOURNAL_COLLECTION),
    where("projectId", "==", projectId),
    orderBy("timestamp", "desc")
  );
  return getDocs(q);
}

export async function getJournalEntriesFilteredSnapshot(
  projectId: string,
  filters: JournalEntryFilters = {}
) {
  let q = query(
    collection(db, JOURNAL_COLLECTION),
    where("projectId", "==", projectId),
    orderBy("timestamp", "desc")
  );

  if (filters.module) {
    q = query(q, where("module", "==", filters.module));
  }
  if (filters.construction) {
    q = query(q, where("construction", "==", filters.construction));
  }
  return getDocs(q);
}

export async function deleteJournalEntryDoc(entryId) {
  await deleteDoc(doc(db, JOURNAL_COLLECTION, entryId));
}

export async function clearJournalEntriesByProject(projectId) {
  const snap = await getJournalEntriesSnapshot(projectId);
  if (snap.empty) return 0;

  const batch = writeBatch(db);
  snap.forEach((entryDoc) => {
    batch.delete(doc(db, JOURNAL_COLLECTION, entryDoc.id));
  });
  await batch.commit();
  return snap.size;
}

export async function setDocByCollectionPath(
  collectionPath: string,
  docId: string,
  data: FirestoreRecord,
  options: { merge?: boolean } = {}
) {
  const pathParts = toPathParts(collectionPath);
  if (!pathParts.length) {
    throw new Error("Collection path is required.");
  }
  const docPath = [...pathParts, docId];
  const ref = doc(db, ...((docPath as unknown) as [string, string, ...string[]]));
  await setDoc(ref, data, options);
  return ref;
}

export async function getDocByCollectionPath(collectionPath: string, docId: string) {
  const pathParts = toPathParts(collectionPath);
  if (!pathParts.length) {
    throw new Error("Collection path is required.");
  }
  const docPath = [...pathParts, docId];
  const ref = doc(db, ...((docPath as unknown) as [string, string, ...string[]]));
  return getDoc(ref);
}

export async function getCollectionSnapshotByPath(collectionPath: string) {
  const pathParts = toPathParts(collectionPath);
  const ref = collection(db, ...(pathParts as [string, ...string[]]));
  return getDocs(ref);
}
