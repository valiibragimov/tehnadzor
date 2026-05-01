import { db } from "../../firebase.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  type OrderByDirection,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

export async function getProjectCollectionSnapshot(projectId, collectionName) {
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

export async function clearProjectCollection(projectId, collectionName) {
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
  batchLimit = 500
) {
  const normalizedBatchLimit = Math.max(1, Number(batchLimit) || 500);
  const snap = await getDocs(
    query(getProjectCollectionRef(projectId, collectionName), where(field, "==", value))
  );
  if (snap.empty) return 0;

  const docs = snap.docs;
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
