import { linesFromCsv, parseCsv, stationsFromCsv, transfersFromCsv } from "../transit/csv-io";
import {
  DEFAULT_LAYOUT,
  DEFAULT_LOOP_LAYOUT,
  DEFAULT_PULSE_LAYOUT,
  DEFAULT_SCENIC_LAYOUT,
  normalizeTransitData,
  type RevisionInfo,
  type TransitData,
} from "../transit/types";
import {
  DEFAULT_PROJECT_ID,
  type ProjectAsset,
  type ProjectCapabilities,
  type ProjectRepository,
  type ProjectSummary,
  type StorageMode,
} from "./types";
import { openProjectDatabase } from "./database";
import { siteUrl } from "../site";

export type { ProjectAsset, ProjectCapabilities, ProjectRepository, ProjectSummary, StorageMode } from "./types";
export { DEFAULT_PROJECT_ID } from "./types";

const HTTP_CAPABILITIES: ProjectCapabilities = {
  canCreateProjects: true, canDeleteProjects: true, canSaveTransitData: true,
  canSaveLayout: true, canManageAssets: true, canRestoreRevisions: true,
};
const BROWSER_CAPABILITIES: ProjectCapabilities = {
  canCreateProjects: true, canDeleteProjects: true, canSaveTransitData: true,
  canSaveLayout: true, canManageAssets: true, canRestoreRevisions: true,
};
const STATIC_CAPABILITIES: ProjectCapabilities = {
  canCreateProjects: false, canDeleteProjects: false, canSaveTransitData: false,
  canSaveLayout: false, canManageAssets: false, canRestoreRevisions: false,
};

function unsupported(operation: string): never {
  throw new Error(`${operation} is not available for this storage mode`);
}

function now(): string { return new Date().toISOString(); }
function safeName(name: string): string { return name.trim() || "Untitled project"; }
function projectId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `project-${uuid}` : `project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function cloneData(data: TransitData): TransitData { return structuredClone(normalizeTransitData(data)); }

/** A new city project starts with editor defaults, but no city-specific lines or stations. */
export function createEmptyTransitData(): TransitData {
  return cloneData({
    schemaVersion: 1,
    lines: [],
    stations: [],
    transfers: [],
    layout: DEFAULT_LAYOUT,
    activeStyleTemplate: "classic",
    layoutTemplates: {
      classic: DEFAULT_LAYOUT,
      loop: DEFAULT_LOOP_LAYOUT,
      scenic: DEFAULT_SCENIC_LAYOUT,
      pulse: DEFAULT_PULSE_LAYOUT,
    },
  });
}

function sampleDataUrl(root: string, name: string): string {
  return `${root.replace(/\/$/, "")}/${name}`;
}

function sampleAssetRoot(dataRoot: string): string {
  return dataRoot.replace(/\/sample-data\/?$/, "/sample-icons");
}

async function listSampleAssets(fetcher: typeof fetch, dataRoot: string): Promise<string[]> {
  const response = await fetcher(sampleDataUrl(sampleAssetRoot(dataRoot), "manifest.json"), { cache: "no-store" });
  if (!response.ok) return [];
  const names = await response.json().catch(() => []) as unknown;
  return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : [];
}

async function getSampleAsset(fetcher: typeof fetch, dataRoot: string, name: string): Promise<ProjectAsset | null> {
  const response = await fetcher(sampleDataUrl(sampleAssetRoot(dataRoot), encodeURIComponent(name)), { cache: "force-cache" });
  if (!response.ok) return null;
  return { name, blob: await response.blob(), updatedAt: "" };
}

/** Reads the deployable sample CSV files and supplies the normal editor defaults. */
export async function loadSampleTransitData(fetcher: typeof fetch = fetch, publicRoot = siteUrl("sample-data")): Promise<TransitData> {
  const [lines, stations, transfers] = await Promise.all(["lines.csv", "stations.csv", "transfers.csv"].map(async (name) => {
    const response = await fetcher(sampleDataUrl(publicRoot, name), { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load sample data: ${name}`);
    return response.text();
  }));
  return normalizeTransitData({
    schemaVersion: 1,
    lines: linesFromCsv(parseCsv(lines)),
    stations: stationsFromCsv(parseCsv(stations)),
    transfers: transfersFromCsv(parseCsv(transfers)),
    layout: DEFAULT_LAYOUT,
    activeStyleTemplate: "classic",
    layoutTemplates: { classic: DEFAULT_LAYOUT, loop: DEFAULT_LOOP_LAYOUT, scenic: DEFAULT_SCENIC_LAYOUT, pulse: DEFAULT_PULSE_LAYOUT },
  });
}

export class StaticProjectRepository implements ProjectRepository {
  readonly mode: StorageMode = "static";
  readonly capabilities = STATIC_CAPABILITIES;
  private readonly fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = fetch, private readonly publicRoot = siteUrl("sample-data")) {
    // 绑定 this，避免以 this.fetcher(...) 调用原生 fetch 时 this 非 Window 触发 Illegal invocation
    this.fetcher = fetcher.bind(globalThis);
  }
  async listProjects(): Promise<ProjectSummary[]> {
    return [{ id: DEFAULT_PROJECT_ID, name: "Sample project", createdAt: "", updatedAt: "", storageMode: this.mode }];
  }
  async createProject(_name: string): Promise<ProjectSummary> { return unsupported("Creating projects"); }
  async deleteProject(_projectId: string): Promise<void> { return unsupported("Deleting projects"); }
  async loadTransitData(_projectId: string): Promise<TransitData> { return loadSampleTransitData(this.fetcher, this.publicRoot); }
  async saveTransitData(_projectId: string, _data: TransitData): Promise<{ revision?: RevisionInfo }> { return unsupported("Saving data"); }
  async saveLayout(_projectId: string, _data: TransitData): Promise<TransitData> { return unsupported("Saving layout"); }
  async listRevisions(_projectId: string): Promise<RevisionInfo[]> { return []; }
  async restoreRevision(_projectId: string, _revisionId: string): Promise<TransitData> { return unsupported("Restoring revisions"); }
  async listAssets(_projectId: string): Promise<string[]> { return listSampleAssets(this.fetcher, this.publicRoot); }
  async listCustomAssets(_projectId: string): Promise<string[]> { return []; }
  async getAsset(_projectId: string, name: string): Promise<ProjectAsset | null> { return getSampleAsset(this.fetcher, this.publicRoot, name); }
  async putAsset(_projectId: string, _name: string, _blob: Blob): Promise<void> { return unsupported("Saving assets"); }
  async deleteAsset(_projectId: string, _name: string): Promise<void> { return unsupported("Deleting assets"); }
}

/** Adapter for the local-data-server API, namespaced by project. */
export class HttpProjectRepository implements ProjectRepository {
  readonly mode: StorageMode = "http";
  readonly capabilities = HTTP_CAPABILITIES;
  private readonly fetcher: typeof fetch;
  constructor(private readonly apiBase = "http://127.0.0.1:4175/api", fetcher: typeof fetch = fetch) {
    // 绑定 this，避免以 this.fetcher(...) 调用原生 fetch 时 this 非 Window 触发 Illegal invocation
    this.fetcher = fetcher.bind(globalThis);
  }
  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.apiBase}${path}`, init);
    const body = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
    return body;
  }
  private projectQuery(id: string): string { return `?project=${encodeURIComponent(id)}`; }
  async listProjects(): Promise<ProjectSummary[]> { return this.json<ProjectSummary[]>("/projects", { cache: "no-store" }); }
  async createProject(name: string): Promise<ProjectSummary> {
    return this.json<ProjectSummary>("/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  }
  async deleteProject(id: string): Promise<void> { await this.json(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" }); }
  async loadTransitData(id: string): Promise<TransitData> { return normalizeTransitData(await this.json<TransitData>(`/data${this.projectQuery(id)}`, { cache: "no-store" })); }
  async saveTransitData(id: string, data: TransitData): Promise<{ revision?: RevisionInfo }> {
    const result = await this.json<{ revision?: string }>(`/save${this.projectQuery(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    return result.revision ? { revision: { id: result.revision, createdAt: now(), kind: "saved" } } : {};
  }
  async saveLayout(id: string, data: TransitData): Promise<TransitData> {
    const result = await this.json<Partial<TransitData>>(`/save-layout${this.projectQuery(id)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeStyleTemplate: data.activeStyleTemplate, layoutTemplates: { ...data.layoutTemplates, [data.activeStyleTemplate]: data.layout }, lineStyleTemplates: data.lineStyleTemplates || {} }),
    });
    return normalizeTransitData({ ...data, ...result, layout: result.layout || data.layout });
  }
  async listRevisions(id: string): Promise<RevisionInfo[]> { return this.json<RevisionInfo[]>(`/revisions${this.projectQuery(id)}`, { cache: "no-store" }); }
  async restoreRevision(id: string, revisionId: string): Promise<TransitData> {
    return normalizeTransitData(await this.json<TransitData>(`/restore${this.projectQuery(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: revisionId }) }));
  }
  async listAssets(id: string): Promise<string[]> { return this.json<string[]>(`/icons${this.projectQuery(id)}`, { cache: "no-store" }); }
  async listCustomAssets(id: string): Promise<string[]> { return this.json<string[]>(`/custom-assets${this.projectQuery(id)}`, { cache: "no-store" }); }
  async getAsset(id: string, name: string): Promise<ProjectAsset | null> {
    const response = await this.fetcher(`${this.apiBase}/icons/${encodeURIComponent(name)}${this.projectQuery(id)}`, { cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Unable to load asset: ${name}`);
    return { name, blob: await response.blob(), updatedAt: "" };
  }
  async putAsset(id: string, name: string, blob: Blob): Promise<void> {
    const data = await blobToBase64(blob);
    await this.json(`/upload-icon${this.projectQuery(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: name, data }) });
  }
  async deleteAsset(id: string, name: string): Promise<void> {
    await this.json(`/icons/${encodeURIComponent(name)}${this.projectQuery(id)}`, { method: "DELETE" });
  }
}

interface BrowserRevision extends RevisionInfo { projectId: string; data: TransitData; }
interface BrowserAsset extends ProjectAsset { projectId: string; key: string; }
function requestValue<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function transactionDone(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }

export class BrowserProjectRepository implements ProjectRepository {
  readonly mode: StorageMode = "browser";
  readonly capabilities = BROWSER_CAPABILITIES;
  private readonly fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = fetch, private readonly publicRoot = siteUrl("sample-data")) {
    // 绑定 this，避免以 this.fetcher(...) 调用原生 fetch 时 this 非 Window 触发 Illegal invocation
    this.fetcher = fetcher.bind(globalThis);
  }
  private async withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> { const db = await openProjectDatabase(); try { return await fn(db); } finally { db.close(); } }
  async listProjects(): Promise<ProjectSummary[]> { return this.withDb(async (db) => requestValue(db.transaction("projects", "readonly").objectStore("projects").getAll())); }
  async createProject(name: string): Promise<ProjectSummary> {
    const timestamp = now(); const project: ProjectSummary = { id: projectId(), name: safeName(name), createdAt: timestamp, updatedAt: timestamp, storageMode: this.mode };
    return this.withDb(async (db) => {
      const tx = db.transaction(["projects", "data"], "readwrite");
      tx.objectStore("projects").add(project);
      tx.objectStore("data").add(createEmptyTransitData(), project.id);
      await transactionDone(tx);
      return project;
    });
  }
  async deleteProject(id: string): Promise<void> {
    return this.withDb(async (db) => {
      const read = db.transaction(["revisions", "assets"], "readonly");
      const revisionKeys = await requestValue(read.objectStore("revisions").index("projectId").getAllKeys(id));
      const assetKeys = await requestValue(read.objectStore("assets").index("projectId").getAllKeys(id));
      await transactionDone(read);
      const tx = db.transaction(["projects", "data", "revisions", "assets"], "readwrite");
      tx.objectStore("projects").delete(id); tx.objectStore("data").delete(id);
      revisionKeys.forEach((key) => tx.objectStore("revisions").delete(key));
      assetKeys.forEach((key) => tx.objectStore("assets").delete(key));
      await transactionDone(tx);
    });
  }
  async loadTransitData(id: string): Promise<TransitData> {
    const stored = await this.withDb(async (db) => requestValue<TransitData | undefined>(db.transaction("data", "readonly").objectStore("data").get(id)));
    if (stored) return normalizeTransitData(stored);
    const seed = id === DEFAULT_PROJECT_ID
      ? await loadSampleTransitData(this.fetcher, this.publicRoot)
      : createEmptyTransitData();
    await this.saveRecord(id, seed, false);
    return seed;
  }
  private async saveRecord(id: string, data: TransitData, revision: boolean): Promise<{ revision?: RevisionInfo }> {
    const normalized = cloneData(data); const timestamp = now();
    return this.withDb(async (db) => {
      const read = db.transaction("projects", "readonly");
      const previous = await requestValue<ProjectSummary | undefined>(read.objectStore("projects").get(id));
      await transactionDone(read);
      const tx = db.transaction(["projects", "data", "revisions"], "readwrite");
      const projects = tx.objectStore("projects");
      projects.put({ id, name: previous?.name || "Untitled project", createdAt: previous?.createdAt || timestamp, updatedAt: timestamp, storageMode: this.mode } satisfies ProjectSummary);
      tx.objectStore("data").put(normalized, id);
      const record = revision ? { id: `saved-${timestamp.replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`, projectId: id, createdAt: timestamp, kind: "saved" as const, data: normalized } satisfies BrowserRevision : undefined;
      if (record) tx.objectStore("revisions").put(record);
      await transactionDone(tx);
      return record ? { revision: { id: record.id, createdAt: record.createdAt, kind: record.kind } } : {};
    });
  }
  async saveTransitData(id: string, data: TransitData): Promise<{ revision?: RevisionInfo }> { return this.saveRecord(id, data, true); }
  async saveLayout(id: string, data: TransitData): Promise<TransitData> { await this.saveRecord(id, data, false); return normalizeTransitData(data); }
  async listRevisions(id: string): Promise<RevisionInfo[]> { return this.withDb(async (db) => { const values = await requestValue<BrowserRevision[]>(db.transaction("revisions", "readonly").objectStore("revisions").index("projectId").getAll(id)); return values.map(({ id: revisionId, createdAt, kind }) => ({ id: revisionId, createdAt, kind })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }); }
  async restoreRevision(id: string, revisionId: string): Promise<TransitData> { const record = await this.withDb(async (db) => requestValue<BrowserRevision | undefined>(db.transaction("revisions", "readonly").objectStore("revisions").get(revisionId))); if (!record || record.projectId !== id) throw new Error("Revision not found in this project"); await this.saveRecord(id, record.data, false); return cloneData(record.data); }
  async listAssets(id: string): Promise<string[]> {
    const [stored, samples] = await Promise.all([
      this.withDb(async (db) => { const assets = await requestValue<BrowserAsset[]>(db.transaction("assets", "readonly").objectStore("assets").index("projectId").getAll(id)); return assets.map((asset) => asset.name); }),
      listSampleAssets(this.fetcher, this.publicRoot),
    ]);
    return Array.from(new Set([...stored, ...samples])).sort();
  }
  async listCustomAssets(id: string): Promise<string[]> {
    return this.withDb(async (db) => {
      const assets = await requestValue<BrowserAsset[]>(db.transaction("assets", "readonly").objectStore("assets").index("projectId").getAll(id));
      return assets.map((asset) => asset.name).sort();
    });
  }
  async getAsset(id: string, name: string): Promise<ProjectAsset | null> {
    const stored = await this.withDb(async (db) => requestValue<BrowserAsset | undefined>(db.transaction("assets", "readonly").objectStore("assets").get(`${id}:${name}`)));
    return stored ? { name: stored.name, blob: stored.blob, updatedAt: stored.updatedAt } : getSampleAsset(this.fetcher, this.publicRoot, name);
  }
  async putAsset(id: string, name: string, blob: Blob): Promise<void> { return this.withDb(async (db) => { const tx = db.transaction("assets", "readwrite"); tx.objectStore("assets").put({ key: `${id}:${name}`, projectId: id, name, blob, updatedAt: now() } satisfies BrowserAsset); await transactionDone(tx); }); }
  async deleteAsset(id: string, name: string): Promise<void> { return this.withDb(async (db) => { const tx = db.transaction("assets", "readwrite"); tx.objectStore("assets").delete(`${id}:${name}`); await transactionDone(tx); }); }
}

export interface ProjectRepositoryFactoryOptions { storageMode?: StorageMode; host?: string; fetcher?: typeof fetch; publicRoot?: string; }
export function createProjectRepository(options: ProjectRepositoryFactoryOptions = {}): ProjectRepository {
  const mode = options.storageMode || (options.host ? "http" : "browser");
  if (mode === "static") return new StaticProjectRepository(options.fetcher, options.publicRoot);
  if (mode === "http") return new HttpProjectRepository(options.host || "http://127.0.0.1:4175/api", options.fetcher);
  return new BrowserProjectRepository(options.fetcher, options.publicRoot);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary);
}
