import { createHash } from "node:crypto";
import { validatePdfBytes } from "../../../src/shared/documents";

export interface DocumentUploadTarget { projectId: string; documentId: string; versionId: string }
interface PendingVersion { sha256: string; size: number; status: string; createdBy: string }
export interface DocumentUploadPorts {
  loadAuthorized(target: DocumentUploadTarget, uid: string): Promise<PendingVersion>;
  saveImmutable(target: DocumentUploadTarget, bytes: Uint8Array, sha256: string): Promise<void>;
  finalizeAuthorized(target: DocumentUploadTarget, uid: string): Promise<void>;
}
export function createDocumentUploader(ports: DocumentUploadPorts) {
  return async (target: DocumentUploadTarget, uid: string, bytes: Uint8Array) => {
    const version = await ports.loadAuthorized(target, uid);
    if (bytes.length) {
      validatePdfBytes(bytes);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== version.sha256 || bytes.length !== version.size || version.createdBy !== uid) throw Object.assign(new Error("DOCUMENT_CONTENT_MISMATCH"), { status: 422 });
      if (version.status !== "ready") await ports.saveImmutable(target, bytes, sha256);
    }
    await ports.finalizeAuthorized(target, uid);
    return { ok: true as const, versionId: target.versionId };
  };
}
