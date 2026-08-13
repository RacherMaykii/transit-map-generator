/** Shared browser persistence database for project records and editor documents. */
export const PROJECT_DATABASE_NAME = "metro-project-repository";
export const PROJECT_DATABASE_VERSION = 2;

export function openProjectDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // v1 repository stores. Keep checks so pre-existing v1 installations upgrade in place.
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("data")) db.createObjectStore("data");
      if (!db.objectStoreNames.contains("revisions")) {
        const store = db.createObjectStore("revisions", { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
      if (!db.objectStoreNames.contains("assets")) {
        const store = db.createObjectStore("assets", { keyPath: "key" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
      // v2: separate editor documents, keyed by the logical [projectId, editorKind] pair.
      if (!db.objectStoreNames.contains("editorDocuments")) {
        const store = db.createObjectStore("editorDocuments", { keyPath: "key" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

