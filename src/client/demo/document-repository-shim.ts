// The public demo never uploads private project PDFs or contacts Cloud Storage.
export function createFirebaseDocumentRepository(): any { return {}; }
export async function getDocumentAccess() { return "none"; }
export async function listDocuments(): Promise<any> { return { items: [], hasMore: false }; }
export async function listDocumentVersions(): Promise<any> { return { items: [], hasMore: false }; }
export async function setDocumentMember() { throw new Error("DEMO_STORAGE_UNAVAILABLE"); }
