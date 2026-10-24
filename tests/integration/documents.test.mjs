import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDocFromServer, updateDoc, deleteDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { ref, uploadBytes, getBytes, updateMetadata, deleteObject } from "firebase/storage";

for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/u.test(process.env[name] || "")) throw new Error("Loopback emulators required: " + name);
}

test("PDF versions and document-only roles are enforced in Firestore and Storage", { timeout: 120000 }, async t => {
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":");
  const environment = await initializeTestEnvironment({ projectId: "demo-tehnadzor-documents", firestore: { host, port: Number(port), rules: await readFile("firestore.rules", "utf8") }, storage: { host: storageHost, port: Number(storagePort), rules: await readFile("storage.rules", "utf8") } });
  const owner = environment.authenticatedContext("owner");
  const editor = environment.authenticatedContext("editor");
  const reader = environment.authenticatedContext("reader");
  const foreign = environment.authenticatedContext("foreign");
  const anonymous = environment.unauthenticatedContext();
  const versionPath = "projects/p/documents/d/versions/v1";
  const objectPath = versionPath + "/file.pdf";
  const bytes = new TextEncoder().encode("%PDF-1.7\nsynthetic fixture\n%%EOF");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const require = createRequire(new URL("../../server/package.json", import.meta.url));
  const admin = require("firebase-admin/app");
  process.env.FIREBASE_STORAGE_BUCKET = "demo-tehnadzor-documents.appspot.com";
  if (!admin.getApps().length) admin.initializeApp({ projectId: "demo-tehnadzor-documents" });
  const { createDocumentUploader } = require("./dist/server/src/application/upload-document.js");
  const { firebaseDocumentUploadPorts, downloadDocument } = require("./dist/server/src/repositories/document-repository.js");
  const uploadDocument = createDocumentUploader(firebaseDocumentUploadPorts);
  const target = { projectId: "p", documentId: "d", versionId: "v1" };
  try {
    await setDoc(doc(owner.firestore(), "projects/p"), { ownerUid: "owner", createdBy: "owner" });
    await setDoc(doc(owner.firestore(), "projects/p/geomChecks/check1"), { status: "empty" });
    await setDoc(doc(owner.firestore(), "projects/p/documentMembers/editor"), { role: "editor" });
    await setDoc(doc(owner.firestore(), "projects/p/documentMembers/reader"), { role: "reader" });
    await t.test("owner grants document roles without exposing inspections or project settings", async () => {
      await assertSucceeds(getDocFromServer(doc(editor.firestore(), "projects/p/documentMembers/editor")));
      await assertFails(getDocFromServer(doc(editor.firestore(), "projects/p/geomChecks/check1")));
      await assertFails(updateDoc(doc(editor.firestore(), "projects/p"), { ownerUid: "editor" }));
      await assertFails(setDoc(doc(reader.firestore(), "projects/p/documentMembers/reader"), { role: "editor" }));
    });
    const version = {
      title: "Synthetic report", kind: "laboratory", construction: "wall", inspectionCollection: "geomChecks", inspectionId: "check1", bimElementId: "",
      fileName: "report.pdf", size: bytes.length, sha256, status: "uploading", createdBy: "editor", createdAt: serverTimestamp(), storagePath: objectPath
    };
    await t.test("editor stages a linked immutable version atomically", async () => {
      const batch = writeBatch(editor.firestore());
      batch.set(doc(editor.firestore(), "projects/p/documents/d"), { title: version.title, kind: version.kind, createdBy: "editor", createdAt: serverTimestamp() });
      batch.set(doc(editor.firestore(), versionPath), version);
      await assertSucceeds(batch.commit());
      await assertFails(setDoc(doc(editor.firestore(), "projects/p/documents/d/versions/cross-project"), { ...version, inspectionId: "absent", storagePath: "projects/p/documents/d/versions/cross-project/file.pdf" }));
      await assertFails(setDoc(doc(reader.firestore(), "projects/p/documents/new"), { title: "bad", kind: "laboratory", createdBy: "reader", createdAt: serverTimestamp() }));
    });
    await t.test("upload requires metadata, author, PDF type, size and scoped path", async () => {
      const metadata = { contentType: "application/pdf", cacheControl: "private, no-store", customMetadata: { sha256 } };
      await assertFails(uploadBytes(ref(reader.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath), bytes, metadata));
      await assertFails(uploadBytes(ref(editor.storage("gs://demo-tehnadzor-documents.appspot.com"), "projects/p/documents/d/versions/unregistered/file.pdf"), bytes, metadata));
      await assertFails(uploadBytes(ref(editor.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath), bytes, { ...metadata, contentType: "text/plain" }));
      await assertFails(uploadBytes(ref(editor.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath), bytes, { ...metadata, customMetadata: { sha256, firebaseStorageDownloadTokens: "public" } }));
      await assertFails(uploadBytes(ref(editor.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath), bytes, metadata));
      await assert.rejects(uploadDocument(target, "reader", bytes), { status: 403 });
      await uploadDocument(target, "editor", bytes);
      // Upload is atomically finalized by the authorized API; no public token is created.
      const [storedMetadata] = await require("firebase-admin/storage").getStorage().bucket(process.env.FIREBASE_STORAGE_BUCKET).file(objectPath).getMetadata();
      assert.equal(storedMetadata.metadata?.firebaseStorageDownloadTokens, undefined);
      await assertFails(getBytes(ref(editor.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath)));
    });
    await t.test("ready versions are readable only by authorized participants and cannot be overwritten", async () => {
      await assertFails(updateDoc(doc(editor.firestore(), versionPath), { status: "ready", uploadedAt: serverTimestamp() }));
      await uploadDocument(target, "editor", bytes);
      assert.deepEqual(new Uint8Array((await downloadDocument(target, "reader")).bytes), bytes);
      await assertFails(getBytes(ref(reader.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath)));
      await assert.rejects(downloadDocument(target, "foreign"), { status: 403 });
      await assertFails(getBytes(ref(foreign.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath)));
      await assertFails(getBytes(ref(anonymous.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath)));
      await assertFails(updateDoc(doc(owner.firestore(), versionPath), { title: "rewritten" }));
      await assertFails(deleteDoc(doc(owner.firestore(), versionPath)));
      await assertFails(deleteObject(ref(owner.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath)));
      await assertFails(updateMetadata(ref(owner.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath), { customMetadata: { firebaseStorageDownloadTokens: "public" } }));
      await assertFails(uploadBytes(ref(editor.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath), bytes, { contentType: "application/pdf" }));
    });
    await t.test("revocation blocks future reads of every version", async () => {
      await deleteDoc(doc(owner.firestore(), "projects/p/documentMembers/reader"));
      await assertFails(getDocFromServer(doc(reader.firestore(), versionPath)));
      await assert.rejects(downloadDocument(target, "reader"), { status: 403 });
      await assertFails(getBytes(ref(reader.storage("gs://demo-tehnadzor-documents.appspot.com"), objectPath)));
    });
  } finally { await environment.cleanup(); await Promise.all(admin.getApps().map(app => admin.deleteApp(app))); }
});
