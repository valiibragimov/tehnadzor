import { createHash } from "node:crypto";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import type { DocumentUploadPorts, DocumentUploadTarget } from "../application/upload-document";

const versionRef = (target: DocumentUploadTarget) => getFirestore().doc(`projects/${target.projectId}/documents/${target.documentId}/versions/${target.versionId}`);
const objectPath = (target: DocumentUploadTarget) => versionRef(target).path + "/file.pdf";
const file = (target: DocumentUploadTarget) => {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucket) throw Object.assign(new Error("DOCUMENT_STORAGE_NOT_CONFIGURED"), { status: 503 });
  return getStorage().bucket(bucket).file(objectPath(target));
};
const fail = (status: number, message: string) => { throw Object.assign(new Error(message), { status }); };

export const firebaseDocumentUploadPorts: DocumentUploadPorts = {
  async loadAuthorized(target, uid) {
    if (!uid) return fail(401, "AUTH_REQUIRED");
    const db = getFirestore();
    const [project, member, version] = await Promise.all([
      db.doc(`projects/${target.projectId}`).get(),
      db.doc(`projects/${target.projectId}/documentMembers/${uid}`).get(),
      versionRef(target).get()
    ]);
    const owner = project.data()?.ownerUid === uid || project.data()?.createdBy === uid;
    if (!owner && member.data()?.role !== "editor") return fail(403, "DOCUMENT_ACCESS_DENIED");
    const data = version.data();
    if (!data || !["uploading", "ready"].includes(data.status) || data.storagePath !== objectPath(target)) return fail(404, "DOCUMENT_NOT_FOUND");
    return data as { sha256: string; size: number; status: string; createdBy: string };
  },
  async saveImmutable(target, bytes, sha256) {
    try {
      // Admin/GCS writes do not create Firebase download tokens. Never accept client metadata.
      await file(target).save(Buffer.from(bytes), { resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: {
        contentType: "application/pdf", cacheControl: "private, no-store", metadata: { sha256 }
      } });
    } catch (error) {
      if ((error as { code?: number }).code !== 412) throw error;
      const [metadata] = await file(target).getMetadata();
      if (metadata.metadata?.sha256 !== sha256 || Number(metadata.size) !== bytes.length) return fail(409, "DOCUMENT_IMMUTABLE_CONFLICT");
    }
  },
  async finalizeAuthorized(target, uid) {
    const [metadata] = await file(target).getMetadata();
    if (metadata.metadata?.firebaseStorageDownloadTokens) return fail(409, "DOCUMENT_PUBLIC_TOKEN_FORBIDDEN");
    await getFirestore().runTransaction(async transaction => {
      const project = await transaction.get(getFirestore().doc(`projects/${target.projectId}`));
      const member = await transaction.get(getFirestore().doc(`projects/${target.projectId}/documentMembers/${uid}`));
      const snapshot = await transaction.get(versionRef(target));
      const owner = project.data()?.ownerUid === uid || project.data()?.createdBy === uid;
      if (!owner && member.data()?.role !== "editor") return fail(403, "DOCUMENT_ACCESS_DENIED");
      const version = snapshot.data();
      if (!version || Number(metadata.size) !== version.size || metadata.metadata?.sha256 !== version.sha256) return fail(422, "DOCUMENT_CONTENT_MISMATCH");
      if (version.status === "ready") return;
      transaction.update(snapshot.ref, { status: "ready", uploadedAt: FieldValue.serverTimestamp() });
    });
  }
};

export async function downloadDocument(target: DocumentUploadTarget, uid: string) {
  if (!uid) return fail(401, "AUTH_REQUIRED");
  const db = getFirestore();
  const [project, member, snapshot] = await Promise.all([db.doc(`projects/${target.projectId}`).get(), db.doc(`projects/${target.projectId}/documentMembers/${uid}`).get(), versionRef(target).get()]);
  const owner = project.data()?.ownerUid === uid || project.data()?.createdBy === uid;
  if (!owner && !["editor", "reader"].includes(member.data()?.role)) return fail(403, "DOCUMENT_ACCESS_DENIED");
  const version = snapshot.data();
  if (!version || version.status !== "ready") return fail(404, "DOCUMENT_NOT_READY");
  const [bytes] = await file(target).download({ validation: "crc32c" });
  if (bytes.length !== version.size || createHash("sha256").update(bytes).digest("hex") !== version.sha256) return fail(422, "DOCUMENT_CONTENT_MISMATCH");
  return { bytes, fileName: String(version.fileName) };
}
