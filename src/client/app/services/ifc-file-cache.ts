interface IfcCacheRecord {
  key: string;
  projectId: string;
  sourceModelId: string;
  fileName: string;
  file: Blob | File | null;
  updatedAt: number;
}

interface IfcCacheLookup {
  projectId?: string | null;
  sourceModelId?: string | null;
}

interface IfcCacheWrite extends IfcCacheLookup {
  fileName?: string | null;
  file?: Blob | File | null;
}

const DB_NAME = "tehnadzor-bim-viewer";
const DB_VERSION = 1;
const STORE_NAME = "ifc-files";
const PROJECT_INDEX = "by-project";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function supportsIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function normalizeKeyPart(value) {
  return String(value || "").trim();
}

function composeCacheKey(projectId, sourceModelId) {
  const normalizedProjectId = normalizeKeyPart(projectId);
  const normalizedSourceModelId = normalizeKeyPart(sourceModelId);
  if (!normalizedProjectId || !normalizedSourceModelId) {
    return "";
  }
  return `${normalizedProjectId}::${normalizedSourceModelId}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!supportsIndexedDb()) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(request.error || new Error("Не удалось открыть IndexedDB для BIM-viewer."));
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        let store: IDBObjectStore;

        if (db.objectStoreNames.contains(STORE_NAME)) {
          store = request.transaction.objectStore(STORE_NAME);
        } else {
          store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }

        if (!store.indexNames.contains(PROJECT_INDEX)) {
          store.createIndex(PROJECT_INDEX, "projectId", { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

function runRequest<T>(request: IDBRequest<T>, fallbackMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error || new Error(fallbackMessage));
    };
  });
}

export async function getCachedProjectIfcFile({ projectId, sourceModelId }: IfcCacheLookup = {}) {
  const key = composeCacheKey(projectId, sourceModelId);
  if (!key) return null;

  const db = await openDatabase();
  if (!db) return null;

  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const record = await runRequest<IfcCacheRecord | undefined>(
    store.get(key),
    "Не удалось прочитать IFC-файл из локального кэша."
  );

  if (!record) return null;

  return {
    key: record.key,
    projectId: record.projectId,
    sourceModelId: record.sourceModelId,
    fileName: record.fileName,
    file: record.file instanceof Blob ? record.file : null,
    updatedAt: Number(record.updatedAt || 0)
  };
}

export async function cacheProjectIfcFile({
  projectId,
  sourceModelId,
  fileName,
  file
}: IfcCacheWrite = {}) {
  const key = composeCacheKey(projectId, sourceModelId);
  if (!key || !(file instanceof Blob)) {
    return null;
  }

  const db = await openDatabase();
  if (!db) return null;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => {
      reject(tx.error || new Error("Не удалось сохранить IFC-файл для BIM-viewer."));
    };
    tx.oncomplete = () => resolve();

    tx.objectStore(STORE_NAME).put({
      key,
      projectId: normalizeKeyPart(projectId),
      sourceModelId: normalizeKeyPart(sourceModelId),
      fileName: normalizeKeyPart(fileName) || normalizeKeyPart(file instanceof File ? file.name : "") || "model.ifc",
      file,
      updatedAt: Date.now()
    });
  });

  return key;
}

export async function deleteCachedProjectIfcFile({ projectId, sourceModelId }: IfcCacheLookup = {}) {
  const key = composeCacheKey(projectId, sourceModelId);
  if (!key) return false;

  const db = await openDatabase();
  if (!db) return false;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => {
      reject(tx.error || new Error("Не удалось удалить IFC-файл из локального кэша."));
    };
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).delete(key);
  });

  return true;
}

export async function deleteAllCachedProjectIfcFiles(projectId) {
  const normalizedProjectId = normalizeKeyPart(projectId);
  if (!normalizedProjectId) return 0;

  const db = await openDatabase();
  if (!db) return 0;

  let deletedCount = 0;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => {
      reject(tx.error || new Error("Не удалось очистить IFC-кэш проекта."));
    };
    tx.oncomplete = () => resolve();

    const store = tx.objectStore(STORE_NAME);
    const index = store.index(PROJECT_INDEX);
    const request = index.openCursor(IDBKeyRange.only(normalizedProjectId));

    request.onerror = () => {
      reject(request.error || new Error("Не удалось перечислить IFC-файлы проекта."));
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      deletedCount += 1;
      cursor.continue();
    };
  });

  return deletedCount;
}
