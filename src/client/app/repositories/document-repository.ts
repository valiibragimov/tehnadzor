import { createDocumentApi } from "../../infrastructure/api/client.js";
import { APP_CONFIG } from "../../config.js";
import { auth, db } from "../../firebase.js";
import { collection, doc, getDocFromServer, getDocsFromServer, limit, orderBy, query, serverTimestamp, setDoc, deleteDoc, writeBatch, startAfter, type QueryDocumentSnapshot } from "../../infrastructure/firebase/firestore.js";
import { type DocumentRepository, type DocumentVersion } from "../../features/documents/service.js";

const segment = (value: string) => {
  if (!value || value.length > 128 || /[/\u0000-\u001f]/u.test(value) || value === "." || value === "..") throw new Error("DOCUMENT_INVALID_ID");
  return value;
};
const path = (project: string, document: string, version: string) => `projects/${segment(project)}/documents/${segment(document)}/versions/${segment(version)}/file.pdf`;
const versions = (project: string, document: string) => collection(db, "projects", segment(project), "documents", segment(document), "versions");
const versionRef = (project: string, document: string, version: string) => doc(versions(project, document), segment(version));

export function createFirebaseDocumentRepository(): DocumentRepository {
  const api = createDocumentApi(APP_CONFIG.DOCUMENT_API_BASE || location.origin);
  const token = async () => {
    if (!auth.currentUser) throw new Error("AUTH_REQUIRED");
    return auth.currentUser.getIdToken();
  };
  return {
    listDocuments: (projectId, cursor) => listDocuments(projectId, cursor as QueryDocumentSnapshot | undefined),
    listVersions: (projectId, documentId, cursor) => listDocumentVersions(projectId, documentId, cursor as QueryDocumentSnapshot | undefined),
    getAccess: getDocumentAccess,
    setMember: setDocumentMember,
    async prepare(projectId, documentId, versionId, draft, file, sha256, isNew) {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("AUTH_REQUIRED");
      if (draft.inspectionId) {
        if (!["geoNodes", "reinfChecks", "geomChecks", "strengthChecks"].includes(draft.inspectionCollection)) throw new Error("DOCUMENT_INVALID_LINK");
        // Server rules also validate that the referenced inspection belongs to this project.
      } else if (draft.inspectionCollection) throw new Error("DOCUMENT_INVALID_LINK");
      const batch = writeBatch(db);
      if (isNew) batch.set(doc(db, "projects", segment(projectId), "documents", segment(documentId)), {
        title: draft.title, kind: draft.kind, createdBy: uid, createdAt: serverTimestamp()
      });
      batch.set(versionRef(projectId, documentId, versionId), {
        ...draft, fileName: file.name, size: file.size, sha256,
        status: "uploading", createdBy: uid, createdAt: serverTimestamp(),
        storagePath: path(projectId, documentId, versionId)
      });
      await batch.commit();
    },
    async upload(projectId, documentId, versionId, file) {
      await api.upload({ projectId, documentId, versionId }, await token(), file);
    },
    async finalize(projectId, documentId, versionId) {
      await api.upload({ projectId, documentId, versionId }, await token());
    },
    async download(projectId, version) {
      // Construct the path from trusted scope, never from a stored URL or arbitrary storagePath.
      return api.download({ projectId, documentId: version.documentId, versionId: version.id }, await token());
    }
  };
}

export async function listDocuments(projectId: string, cursor?: QueryDocumentSnapshot) {
  const base = collection(db, "projects", segment(projectId), "documents");
  const snapshot = await getDocsFromServer(query(base, orderBy("createdAt", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(30)));
  return { items: snapshot.docs.map(record => ({ title: String(record.data().title || ""), kind: String(record.data().kind || ""), id: record.id })), cursor: snapshot.docs.at(-1), hasMore: snapshot.size === 30 };
}
export async function listDocumentVersions(projectId: string, documentId: string, cursor?: QueryDocumentSnapshot) {
  const snapshot = await getDocsFromServer(query(versions(projectId, documentId), orderBy("createdAt", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(30)));
  return { items: snapshot.docs.map(record => ({ ...record.data(), id: record.id, documentId } as DocumentVersion)), cursor: snapshot.docs.at(-1), hasMore: snapshot.size === 30 };
}
export async function setDocumentMember(projectId: string, uid: string, role: "editor" | "reader" | "none") {
  const target = doc(db, "projects", segment(projectId), "documentMembers", segment(uid));
  if (role === "none") await deleteDoc(target);
  else await setDoc(target, { role });
}

export async function getDocumentAccess(projectId: string): Promise<"owner" | "editor" | "reader" | "none"> {
  const uid = auth.currentUser?.uid;
  if (!uid) return "none";
  try {
    const project = await getDocFromServer(doc(db, "projects", segment(projectId)));
    const data = project.data();
    if (data?.ownerUid === uid || data?.createdBy === uid) return "owner";
  } catch { /* Document-only participants do not receive access to other project data. */ }
  const member = await getDocFromServer(doc(db, "projects", segment(projectId), "documentMembers", uid));
  const role = member.data()?.role;
  return role === "editor" || role === "reader" ? role : "none";
}
