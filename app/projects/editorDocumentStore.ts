import { openProjectDatabase } from "./database";

export type EditorKind = "transit" | "entrance" | "wiring";
export type JsonEditorDocument = Record<string, unknown> | unknown[] | string | number | boolean | null;

interface StoredEditorDocument {
  key: string;
  projectId: string;
  editorKind: EditorKind;
  document: JsonEditorDocument;
  updatedAt: string;
}

const EDITOR_KINDS = new Set<EditorKind>(["transit", "entrance", "wiring"]);

/** Stable, collision-free representation of the logical compound key [projectId, editorKind]. */
export function editorDocumentKey(projectId: string, editorKind: EditorKind): string {
  if (!projectId.trim()) throw new Error("projectId is required");
  if (!EDITOR_KINDS.has(editorKind)) throw new Error("Unknown editor kind");
  return JSON.stringify([projectId, editorKind]);
}

/**
 * A document is deliberately JSON-only: no functions, blobs, cyclic references,
 * or accidental live object references can leak between editor state and storage.
 */
export function cloneEditorDocument<T extends JsonEditorDocument>(document: T): T {
  assertJsonValue(document, new WeakSet<object>());
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(document);
  } catch {
    throw new Error("Editor document must be JSON-serializable");
  }
  if (encoded === undefined) throw new Error("Editor document must be JSON-serializable");
  return JSON.parse(encoded) as T;
}

function assertJsonValue(value: unknown, seen: WeakSet<object>): asserts value is JsonEditorDocument {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error("Editor document must be JSON-serializable");
  }
  if (typeof value !== "object") throw new Error("Editor document must be JSON-serializable");
  if (seen.has(value)) throw new Error("Editor document must be JSON-serializable");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) throw new Error("Editor document must be JSON-serializable");
  seen.add(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) assertJsonValue(item, seen);
  seen.delete(value);
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
}

/** Browser-only editor state persistence, intentionally independent from ProjectRepository mode. */
export class BrowserEditorDocumentStore {
  private async withDb<T>(action: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await openProjectDatabase();
    try { return await action(db); } finally { db.close(); }
  }

  async save<T extends JsonEditorDocument>(projectId: string, editorKind: EditorKind, document: T): Promise<void> {
    const key = editorDocumentKey(projectId, editorKind);
    const record: StoredEditorDocument = { key, projectId, editorKind, document: cloneEditorDocument(document), updatedAt: new Date().toISOString() };
    await this.withDb(async (db) => {
      const transaction = db.transaction("editorDocuments", "readwrite");
      transaction.objectStore("editorDocuments").put(record);
      await transactionDone(transaction);
    });
  }

  async load<T extends JsonEditorDocument>(projectId: string, editorKind: EditorKind): Promise<T | null> {
    const key = editorDocumentKey(projectId, editorKind);
    return this.withDb(async (db) => {
      const transaction = db.transaction("editorDocuments", "readonly");
      const record = await requestValue<StoredEditorDocument | undefined>(transaction.objectStore("editorDocuments").get(key));
      return record ? cloneEditorDocument(record.document) as T : null;
    });
  }

  async deleteProjectDocuments(projectId: string): Promise<void> {
    if (!projectId.trim()) throw new Error("projectId is required");
    await this.withDb(async (db) => {
      const read = db.transaction("editorDocuments", "readonly");
      const keys = await requestValue(read.objectStore("editorDocuments").index("projectId").getAllKeys(projectId));
      await transactionDone(read);
      const write = db.transaction("editorDocuments", "readwrite");
      keys.forEach((key) => write.objectStore("editorDocuments").delete(key));
      await transactionDone(write);
    });
  }
}
