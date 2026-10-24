import { MAX_PDF_BYTES, validatePdfBytes } from "../../infrastructure/document-validation.js";
export { MAX_PDF_BYTES };
export const DOCUMENT_KINDS = ["aosr", "asBuilt", "certificate", "passport", "laboratory"] as const;
export type DocumentKind = typeof DOCUMENT_KINDS[number];
export interface DocumentLinks {
  construction: string;
  inspectionCollection: string;
  inspectionId: string;
  bimElementId: string;
}
export interface DocumentDraft extends DocumentLinks { title: string; kind: DocumentKind }
export interface DocumentVersion extends DocumentDraft {
  id: string;
  documentId: string;
  fileName: string;
  size: number;
  sha256: string;
  status: "uploading" | "ready";
  storagePath: string;
  createdBy: string;
}
export interface DocumentRepository {
  prepare(projectId: string, documentId: string, versionId: string, draft: DocumentDraft, file: File, sha256: string, isNew: boolean): Promise<void>;
  upload(projectId: string, documentId: string, versionId: string, file: File, sha256: string): Promise<void>;
  finalize(projectId: string, documentId: string, versionId: string): Promise<void>;
  download(projectId: string, version: DocumentVersion): Promise<Blob>;
}

export async function validatePdf(file: File) {
  if (!file || file.size <= 0 || file.size > MAX_PDF_BYTES || !/\.pdf$/iu.test(file.name) ||
      (file.type && file.type !== "application/pdf")) throw new Error("PDF_INVALID_OR_TOO_LARGE");
  validatePdfBytes(new Uint8Array(await file.arrayBuffer()));
}

export async function pdfDigest(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

export function createDocumentService(repository: DocumentRepository) {
  return {
    async addVersion(projectId: string, draft: DocumentDraft, file: File, existingDocumentId?: string) {
      await validatePdf(file);
      if (!draft.title.trim() || draft.title.length > 200 || !DOCUMENT_KINDS.includes(draft.kind)) throw new Error("DOCUMENT_INVALID");
      const documentId = existingDocumentId || crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const sha256 = await pdfDigest(file);
      await repository.prepare(projectId, documentId, versionId, draft, file, sha256, !existingDocumentId);
      // A failed upload stays visible as pending. It never becomes a usable version.
      await repository.upload(projectId, documentId, versionId, file, sha256);
      return { documentId, versionId };
    },
    async download(projectId: string, version: DocumentVersion) {
      if (version.status !== "ready") throw new Error("DOCUMENT_NOT_READY");
      const blob = await repository.download(projectId, version);
      if (blob.size !== version.size || await pdfDigest(blob) !== version.sha256) throw new Error("DOCUMENT_INTEGRITY_FAILED");
      return blob;
    },
    finalize: (projectId: string, documentId: string, versionId: string) => repository.finalize(projectId, documentId, versionId)
  };
}
