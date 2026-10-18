import type { DemoDatabaseState } from "../fixtures.js";
import type { AnalyticsCurrent } from "../../types/domain.js";
import { createDemoDatabaseStore } from "../storage.js";

type RecordData = Record<string, unknown>;
type DemoDocRef = { id: string; path: string };

const store = createDemoDatabaseStore(localStorage);
let sequence = 0;

function nextId(prefix = "demo") {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function docRef(path: string, id: string): DemoDocRef {
  return { id, path: `${path}/${id}` };
}

function docSnapshot(path: string, id: string, data?: RecordData) {
  const exists = !!data;
  return {
    id,
    ref: docRef(path, id),
    metadata: { hasPendingWrites: false },
    exists: () => exists,
    data: () => data ? clone(data) : undefined
  };
}

function collectionSnapshot(path: string, records: Record<string, RecordData>) {
  const docs = Object.entries(records).map(([id, data]) => docSnapshot(path, id, data));
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach(callback: (snapshot: ReturnType<typeof docSnapshot>) => void) {
      docs.forEach(callback);
    }
  };
}

function mutate(mutator: (state: DemoDatabaseState) => void) {
  const state = store.read();
  mutator(state);
  store.write(state);
}

function getProjectCollection(state: DemoDatabaseState, projectId: string, collectionName: string) {
  state.projectCollections[projectId] ||= {};
  state.projectCollections[projectId][collectionName] ||= {};
  return state.projectCollections[projectId][collectionName];
}

export async function getProjectCollectionSnapshot(projectId: string, collectionName: string) {
  const state = store.read();
  return collectionSnapshot(`projects/${projectId}/${collectionName}`, getProjectCollection(state, projectId, collectionName));
}

export async function getProjectCollectionOrderedSnapshot(projectId: string, collectionName: string) {
  return getProjectCollectionSnapshot(projectId, collectionName);
}

export function getInspectionRegistrySnapshot(projectId: string) {
  return getProjectCollectionSnapshot(projectId, "inspections");
}

export async function getProjectCollectionDocSnapshot(projectId: string, collectionName: string, id: string) {
  const state = store.read();
  return docSnapshot(`projects/${projectId}/${collectionName}`, id, getProjectCollection(state, projectId, collectionName)[id]);
}

export async function createProjectCollectionDoc(projectId: string, collectionName: string, data: RecordData) {
  return addProjectCollectionDoc(projectId, collectionName, { ...data, createdAt: Date.now() });
}

export async function addProjectCollectionDoc(projectId: string, collectionName: string, data: RecordData) {
  const id = nextId(collectionName);
  mutate((state) => { getProjectCollection(state, projectId, collectionName)[id] = clone(data); });
  return { id, ref: docRef(`projects/${projectId}/${collectionName}`, id) };
}

export async function updateProjectCollectionDoc(projectId: string, collectionName: string, id: string, data: RecordData) {
  mutate((state) => { getProjectCollection(state, projectId, collectionName)[id] = { ...clone(data), updatedAt: Date.now() }; });
  return { id, ref: docRef(`projects/${projectId}/${collectionName}`, id) };
}

export async function setProjectCollectionDoc(projectId: string, collectionName: string, id: string, data: RecordData, options: { merge?: boolean } = {}) {
  mutate((state) => {
    const records = getProjectCollection(state, projectId, collectionName);
    records[id] = options.merge ? { ...(records[id] || {}), ...clone(data) } : clone(data);
  });
  return { id, ref: docRef(`projects/${projectId}/${collectionName}`, id) };
}

export async function deleteProjectCollectionDoc(projectId: string, collectionName: string, id: string) {
  mutate((state) => { delete getProjectCollection(state, projectId, collectionName)[id]; });
}

export async function saveInspectionSourceDoc(projectId: string, collectionName: string, id: string, source: RecordData, inspection: RecordData, options: { merge?: boolean } = {}) {
  mutate(state => {
    const records = getProjectCollection(state, projectId, collectionName);
    records[id] = options.merge ? { ...records[id], ...clone(source) } : clone(source);
    const inspections = getProjectCollection(state, projectId, "inspections");
    const matching = Object.entries(inspections).filter(([registryId, record]) => record.sourceCollection === collectionName && String(record.sourceId || record.sourceDocId || registryId) === id).map(([registryId]) => registryId);
    if (!matching.length) {
      const registryId = `${collectionName}_${id}`;
      if (inspections[registryId]) throw new Error("Inspection registry identity is already occupied.");
      matching.push(registryId);
    }
    for (const registryId of matching) inspections[registryId] = { ...inspections[registryId], ...clone(inspection) };
    state.projects[projectId].inspectionSync = { version: 1, revision: crypto.randomUUID(), pending: true };
  });
  return { id, ref: docRef(`projects/${projectId}/${collectionName}`, id) };
}

export async function deleteInspectionSourceDocs(projectId: string, collectionName: string, ids: string[], softDelete = false) {
  for (let offset = 0; offset < ids.length; offset += 249) {
    mutate(state => {
      const records = getProjectCollection(state, projectId, collectionName);
      const inspections = getProjectCollection(state, projectId, "inspections");
      for (const id of ids.slice(offset, offset + 249)) {
        if (softDelete) records[id] = { ...records[id], deleted: true };
        else delete records[id];
        for (const [registryId, inspection] of Object.entries(inspections)) {
          if (inspection.sourceCollection === collectionName && String(inspection.sourceId || inspection.sourceDocId || registryId) === id) delete inspections[registryId];
        }
      }
      state.projects[projectId].inspectionSync = { version: 1, revision: crypto.randomUUID(), pending: true };
    });
  }
}

export async function clearInspectionSourceDocs(projectId: string, collectionName: string) {
  const snapshot = await getProjectCollectionSnapshot(projectId, collectionName);
  await deleteInspectionSourceDocs(projectId, collectionName, snapshot.docs.map(document => document.id));
  return snapshot.size;
}

export async function persistInspectionAnalyticsIfCurrent(projectId: string, revision: string, analyticsCurrent: AnalyticsCurrent) {
  let persisted = false;
  mutate(state => {
    const project = state.projects[projectId];
    if (!project) throw new Error("Inspection project no longer exists.");
    const sync = project.inspectionSync;
    if ((sync?.revision || "") !== revision) return;
    project.analyticsCurrent = clone(analyticsCurrent);
    project.inspectionSync = { version: 1, revision: revision || crypto.randomUUID(), pending: false };
    persisted = true;
  });
  return persisted;
}

export async function commitInspectionRegistryDocs(projectId: string, entries: Array<{ id: string; data?: RecordData; merge?: boolean }>) {
  for (let offset = 0; offset < entries.length; offset += 499) {
    mutate(state => {
      const inspections = getProjectCollection(state, projectId, "inspections");
      for (const entry of entries.slice(offset, offset + 499)) {
        if (entry.data) inspections[entry.id] = entry.merge === false ? clone(entry.data) : { ...inspections[entry.id], ...clone(entry.data) };
        else delete inspections[entry.id];
      }
      state.projects[projectId].inspectionSync = { version: 1, revision: crypto.randomUUID(), pending: true };
    });
  }
}

export async function deleteOrphanInspectionDoc(projectId: string, inspectionId: string, sourceCollection: string) {
  if (!sourceCollection) return false;
  let deleted = false;
  mutate(state => {
    const inspections = getProjectCollection(state, projectId, "inspections");
    const inspection = inspections[inspectionId];
    if (!inspection || (inspection.sourceCollection && inspection.sourceCollection !== sourceCollection)) return;
    const sourceId = String(inspection.sourceId || inspection.sourceDocId || inspection.sourceSessionId || inspectionId);
    const source = getProjectCollection(state, projectId, sourceCollection)[sourceId];
    if (source && !source.deleted) return;
    delete inspections[inspectionId];
    state.projects[projectId].inspectionSync = { version: 1, revision: crypto.randomUUID(), pending: true };
    deleted = true;
  });
  return deleted;
}

export async function saveJournalInspectionSession(projectId: string, sessionId: string, payload: RecordData) {
  let checkNumber = 0;
  mutate(state => {
    const project = state.projects[projectId];
    if (!project) throw new Error("Inspection project no longer exists.");
    const sessions = getProjectCollection(state, projectId, "journalSessions");
    if (sessions[sessionId]) { checkNumber = Number(sessions[sessionId].checkNumber); return; }
    checkNumber = (Number(project.lastCheckNumber) || 0) + 1;
    const session = { ...clone(payload), checkNumber };
    sessions[sessionId] = session;
    getProjectCollection(state, projectId, "inspections")[sessionId] = {
      ...session, projectId, sessionId, sourceCollection: "journalSessions", sourceSessionId: sessionId,
      entriesCount: Array.isArray(payload.entries) ? payload.entries.length : 0
    };
    project.lastCheckNumber = checkNumber;
    project.lastCheckDate = payload.date as number;
    project.inspectionSync = { version: 1, revision: crypto.randomUUID(), pending: true };
  });
  return { id: sessionId, checkNumber };
}

export async function clearProjectCollection(projectId: string, collectionName: string) {
  let count = 0;
  mutate((state) => {
    const records = getProjectCollection(state, projectId, collectionName);
    count = Object.keys(records).length;
    state.projectCollections[projectId][collectionName] = {};
  });
  return count;
}

export async function deleteProjectCollectionDocsByField(projectId: string, collectionName: string, field: string, value: unknown, _batchLimit = 500, retainedIds: string[] = []) {
  let count = 0;
  mutate((state) => {
    const records = getProjectCollection(state, projectId, collectionName);
    for (const [id, record] of Object.entries(records)) {
      if (record[field] === value && !retainedIds.includes(id)) { delete records[id]; count += 1; }
    }
  });
  return count;
}

export async function setProjectCollectionDocs(projectId: string, collectionName: string, items: RecordData[], options: { idField?: string; merge?: boolean; serverTimestampField?: string } = {}) {
  const idField = options.idField || "id";
  let count = 0;
  mutate((state) => {
    const records = getProjectCollection(state, projectId, collectionName);
    for (const item of items) {
      const id = String(item[idField] || "").trim();
      if (!id) continue;
      const payload = clone(item);
      if (options.serverTimestampField) payload[options.serverTimestampField] = Date.now();
      records[id] = options.merge ? { ...(records[id] || {}), ...payload } : payload;
      count += 1;
    }
  });
  return count;
}

export async function getProjectsByFieldSnapshot(field: string, value: unknown) {
  const projects = Object.fromEntries(Object.entries(store.read().projects).filter(([, project]) => project[field] === value)) as Record<string, RecordData>;
  return collectionSnapshot("projects", projects);
}

export async function getProjectsSnapshot() {
  return collectionSnapshot("projects", store.read().projects as Record<string, RecordData>);
}

export async function createProjectDoc(data: RecordData) {
  const id = nextId("project");
  mutate((state) => { state.projects[id] = { id, ...clone(data) }; });
  return { id, ref: docRef("projects", id) };
}

export async function getProjectDocSnapshot(projectId: string) {
  return docSnapshot("projects", projectId, store.read().projects[projectId] as RecordData | undefined);
}

export async function getUserDocSnapshot(uid: string) {
  return docSnapshot("users", uid, store.read().users[uid]);
}

export async function mergeUserDoc(uid: string, data: RecordData) {
  mutate((state) => { state.users[uid] = { ...(state.users[uid] || {}), ...clone(data) }; });
  return docRef("users", uid);
}

export async function mergeProjectDoc(projectId: string, data: RecordData) {
  mutate((state) => { state.projects[projectId] = { ...(state.projects[projectId] || { id: projectId }), ...clone(data) }; });
  return docRef("projects", projectId);
}

export async function deleteProjectDoc(projectId: string) {
  mutate((state) => { delete state.projects[projectId]; delete state.projectCollections[projectId]; });
}

export function watchDocSync(ref: DemoDocRef, onData: (snapshot: ReturnType<typeof docSnapshot>) => void) {
  queueMicrotask(() => onData(docSnapshot(ref.path.replace(/\/[^/]+$/u, ""), ref.id, {})));
  return () => undefined;
}

export async function addJournalEntryDoc(entry: RecordData) {
  const id = nextId("journal");
  mutate((state) => { state.journal[id] = { id, ...clone(entry) }; });
  return { id, ref: docRef("journal", id) };
}

export async function addJournalEntryDocs(entries: RecordData[]) {
  for (const entry of entries) await addJournalEntryDoc(entry);
  return entries.length;
}

export async function getJournalEntriesSnapshot(projectId: string) {
  const entries = Object.fromEntries(Object.entries(store.read().journal).filter(([, entry]) => entry.projectId === projectId)) as Record<string, RecordData>;
  return collectionSnapshot("journal", entries);
}

export async function getJournalEntriesFilteredSnapshot(projectId: string, filters: { module?: string | null; construction?: string | null } = {}) {
  const snapshot = await getJournalEntriesSnapshot(projectId);
  const records = Object.fromEntries(snapshot.docs.filter((item) => {
    const data = item.data() || {};
    return (!filters.module || data.module === filters.module) && (!filters.construction || data.construction === filters.construction);
  }).map((item) => [item.id, item.data() || {}]));
  return collectionSnapshot("journal", records);
}

export async function deleteJournalEntryDoc(id: string) {
  mutate((state) => { delete state.journal[id]; });
}

export async function clearJournalEntriesByProject(projectId: string) {
  let count = 0;
  mutate((state) => {
    for (const [id, entry] of Object.entries(state.journal)) {
      if (entry.projectId === projectId) { delete state.journal[id]; count += 1; }
    }
  });
  return count;
}

export async function setDocByCollectionPath(path: string, id: string, data: RecordData, options: { merge?: boolean } = {}) {
  const [root, projectId, collectionName] = path.split("/");
  if (root === "projects" && projectId && collectionName) return setProjectCollectionDoc(projectId, collectionName, id, data, options);
  throw new Error(`Unsupported demo collection path: ${path}`);
}

export async function getDocByCollectionPath(path: string, id: string) {
  const [root, projectId, collectionName] = path.split("/");
  if (root === "projects" && projectId && collectionName) return getProjectCollectionDocSnapshot(projectId, collectionName, id);
  return docSnapshot(path, id);
}

export async function getCollectionSnapshotByPath(path: string) {
  const [root, projectId, collectionName] = path.split("/");
  if (root === "projects" && projectId && collectionName) return getProjectCollectionSnapshot(projectId, collectionName);
  return collectionSnapshot(path, {});
}

export function resetDemoRepository() {
  return store.reset();
}

export function getDemoRepositoryState() {
  return store.read();
}
