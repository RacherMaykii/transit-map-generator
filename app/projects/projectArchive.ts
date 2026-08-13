import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { AssetRecord, BackgroundImageObject } from "../wiring/types";
import type { ProjectFile } from "../wiring/projectStore";
import { normalizeTransitData, type TransitData } from "../transit/types";
import { BrowserEditorDocumentStore, type EditorKind, type JsonEditorDocument } from "./editorDocumentStore";
import type { ProjectRepository, ProjectSummary } from "./types";

const ARCHIVE_SCHEMA_VERSION = 2;
const MAX_ARCHIVE_BYTES = 120 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;

export type RailArchiveMode = "full" | "project";

type AssetBinding =
  | { kind: "repository"; name: string }
  | { kind: "wiring-icon"; id: string }
  | { kind: "wiring-background"; id: string };

interface ArchiveAssetEntry {
  id: string;
  name: string;
  path?: string;
  type: string;
  size: number;
  sha256: string;
  bindings: AssetBinding[];
}

interface RailCityManifestV2 {
  kind: "railcity-project";
  schemaVersion: 2;
  mode: RailArchiveMode;
  exportedAt: string;
  project: { sourceId: string; name: string };
  assets: ArchiveAssetEntry[];
  editors: Partial<Record<EditorKind, string>>;
  wiringProjectPath?: string;
}

interface RailAssetsManifest {
  kind: "railcity-assets";
  schemaVersion: 1;
  exportedAt: string;
  project: { sourceId: string; name: string };
  assets: ArchiveAssetEntry[];
}

interface LegacyManifest {
  kind: "railcity-project";
  schemaVersion: 1;
  project: { sourceId: string; name: string };
  assets: Array<{ name: string; path: string; type: string }>;
  editors: Partial<Record<EditorKind, string>>;
  wiringProjectPath?: string;
}

interface CollectedAsset {
  blob: Blob;
  entry: ArchiveAssetEntry;
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2));
}

function readJson<T>(entries: Record<string, Uint8Array>, path: string): T {
  const bytes = entries[path];
  if (!bytes) throw new Error(`项目包缺少 ${path}`);
  try { return JSON.parse(strFromU8(bytes)) as T; }
  catch { throw new Error(`项目包中的 ${path} 不是有效 JSON`); }
}

function validateEntries(entries: Record<string, Uint8Array>): void {
  const paths = Object.keys(entries);
  if (paths.length > MAX_ENTRIES) throw new Error("项目包文件数量过多");
  let total = 0;
  for (const path of paths) {
    if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) throw new Error("项目包包含不安全路径");
    total += entries[path].byteLength;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new Error("项目包解压后过大");
  }
}

async function unpack(file: Blob): Promise<Record<string, Uint8Array>> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("项目包超过 120 MB 限制");
  try {
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    validateEntries(entries);
    return entries;
  } catch (reason) {
    if (reason instanceof Error && /项目包/.test(reason.message)) throw reason;
    throw new Error("无法解压项目包");
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return bytesToHex(new Uint8Array(digest));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function dataUrlBlob(dataUrl?: string): Blob | null {
  const match = dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

function extensionFor(blob: Blob, name: string): string {
  const existing = name.split(".").pop()?.toLowerCase();
  if (existing && /^[a-z0-9]{1,8}$/.test(existing)) return existing;
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/webp") return "webp";
  if (blob.type === "image/svg+xml") return "svg";
  if (blob.type === "image/jpeg") return "jpg";
  return "bin";
}

async function collectCustomAssets(
  project: ProjectSummary,
  repository: ProjectRepository,
  wiringProject: ProjectFile | null,
): Promise<CollectedAsset[]> {
  const byHash = new Map<string, CollectedAsset>();
  const add = async (blob: Blob, name: string, binding: AssetBinding) => {
    const hash = await sha256(blob);
    const existing = byHash.get(hash);
    if (existing) {
      if (!existing.entry.bindings.some((candidate) => JSON.stringify(candidate) === JSON.stringify(binding))) existing.entry.bindings.push(binding);
      return;
    }
    byHash.set(hash, {
      blob,
      entry: { id: `asset:${hash}`, name, type: blob.type || "application/octet-stream", size: blob.size, sha256: hash, bindings: [binding] },
    });
  };

  const customNames = await repository.listCustomAssets(project.id).catch(() => []);
  for (const name of customNames) {
    const asset = await repository.getAsset(project.id, name).catch(() => null);
    if (asset) await add(asset.blob, name, { kind: "repository", name });
  }
  for (const asset of wiringProject?.assets || []) {
    const blob = dataUrlBlob(asset.dataUrl);
    if (blob) await add(blob, asset.name, { kind: "wiring-icon", id: asset.id });
  }
  for (const image of wiringProject?.backgroundImages || []) {
    const blob = dataUrlBlob(image.src);
    if (blob) await add(blob, image.name, { kind: "wiring-background", id: image.id });
  }
  return [...byHash.values()];
}

function portableWiringProject(project: ProjectFile | null): ProjectFile | null {
  if (!project) return null;
  return {
    ...project,
    sourceDataSnapshot: undefined,
    assets: project.assets.map((asset): AssetRecord => ({ ...asset, dataUrl: undefined, missing: Boolean(asset.dataUrl) })),
    backgroundImages: project.backgroundImages.map((image): BackgroundImageObject => ({
      ...image,
      src: image.src.startsWith("data:") ? "" : image.src,
      previewSrc: undefined,
    })),
  };
}

async function loadProjectParts(project: ProjectSummary, repository: ProjectRepository, documentStore: BrowserEditorDocumentStore) {
  const transitData = await repository.loadTransitData(project.id);
  const documents: Partial<Record<EditorKind, JsonEditorDocument>> = {};
  for (const kind of ["transit", "entrance", "wiring"] as const) {
    const document = await documentStore.load(project.id, kind).catch(() => null);
    if (document !== null) documents[kind] = document;
  }
  const { loadFromIndexedDB } = await import("../wiring/projectStore");
  const wiringProject = await loadFromIndexedDB(`wiring:${project.id}:autosave`).catch(() => null);
  return { transitData, documents, wiringProject };
}

function addAssetFiles(entries: Record<string, Uint8Array>, assets: CollectedAsset[]): ArchiveAssetEntry[] {
  return assets.map(({ blob, entry }, index) => {
    const path = `assets/${String(index + 1).padStart(4, "0")}-${entry.sha256.slice(0, 12)}.${extensionFor(blob, entry.name)}`;
    return { ...entry, path };
  });
}

async function writeAssetFiles(entries: Record<string, Uint8Array>, assets: CollectedAsset[], manifestAssets: ArchiveAssetEntry[]): Promise<void> {
  await Promise.all(manifestAssets.map(async (entry, index) => {
    if (entry.path) entries[entry.path] = new Uint8Array(await assets[index].blob.arrayBuffer());
  }));
}

export async function createRailProjectArchive(
  project: ProjectSummary,
  repository: ProjectRepository,
  mode: RailArchiveMode = "full",
  documentStore = new BrowserEditorDocumentStore(),
): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  const { transitData, documents, wiringProject } = await loadProjectParts(project, repository, documentStore);
  entries["data/transit.json"] = jsonBytes(transitData);
  const editors: RailCityManifestV2["editors"] = {};
  for (const [kind, document] of Object.entries(documents) as [EditorKind, JsonEditorDocument][]) {
    const path = `editors/${kind}.json`;
    entries[path] = jsonBytes(document);
    editors[kind] = path;
  }
  const portableWiring = portableWiringProject(wiringProject);
  if (portableWiring) entries["editors/wiring-project.json"] = jsonBytes(portableWiring);
  const collected = await collectCustomAssets(project, repository, wiringProject);
  const assets = mode === "full" ? addAssetFiles(entries, collected) : collected.map(({ entry }) => entry);
  if (mode === "full") await writeAssetFiles(entries, collected, assets);
  const manifest: RailCityManifestV2 = {
    kind: "railcity-project",
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    mode,
    exportedAt: new Date().toISOString(),
    project: { sourceId: project.id, name: project.name },
    assets,
    editors,
    wiringProjectPath: portableWiring ? "editors/wiring-project.json" : undefined,
  };
  entries["manifest.json"] = jsonBytes(manifest);
  return new Blob([zipSync(entries, { level: 6 }) as BlobPart], { type: mode === "full" ? "application/vnd.railcity.project+zip" : "application/vnd.railcity.main+zip" });
}

/** Backward-compatible alias: a normal railcity export is always complete. */
export function createRailCityArchive(project: ProjectSummary, repository: ProjectRepository, documentStore = new BrowserEditorDocumentStore()): Promise<Blob> {
  return createRailProjectArchive(project, repository, "full", documentStore);
}

export async function createRailAssetsArchive(
  project: ProjectSummary,
  repository: ProjectRepository,
): Promise<Blob> {
  const { loadFromIndexedDB } = await import("../wiring/projectStore");
  const wiringProject = await loadFromIndexedDB(`wiring:${project.id}:autosave`).catch(() => null);
  const collected = await collectCustomAssets(project, repository, wiringProject);
  const entries: Record<string, Uint8Array> = {};
  const assets = addAssetFiles(entries, collected);
  await writeAssetFiles(entries, collected, assets);
  const manifest: RailAssetsManifest = {
    kind: "railcity-assets",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    project: { sourceId: project.id, name: project.name },
    assets,
  };
  entries["manifest.json"] = jsonBytes(manifest);
  return new Blob([zipSync(entries, { level: 6 }) as BlobPart], { type: "application/vnd.railcity.assets+zip" });
}

async function applyAssets(
  entries: Record<string, Uint8Array>,
  assets: ArchiveAssetEntry[],
  projectId: string,
  repository: ProjectRepository,
): Promise<{ imported: number; missing: string[] }> {
  const { loadFromIndexedDB, saveToIndexedDB } = await import("../wiring/projectStore");
  const wiringProject = await loadFromIndexedDB(`wiring:${projectId}:autosave`).catch(() => null);
  let wiringChanged = false;
  const missing: string[] = [];
  let imported = 0;
  for (const asset of assets) {
    const bytes = asset.path ? entries[asset.path] : undefined;
    if (!bytes) { missing.push(asset.name); continue; }
    const blob = new Blob([bytes as BlobPart], { type: asset.type || "application/octet-stream" });
    if (await sha256(blob) !== asset.sha256) throw new Error(`素材校验失败：${asset.name}`);
    const dataUrl = `data:${blob.type || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
    for (const binding of asset.bindings || []) {
      if (binding.kind === "repository") await repository.putAsset(projectId, binding.name, blob);
      if (binding.kind === "wiring-icon" && wiringProject) {
        wiringProject.assets = wiringProject.assets.map((item) => item.id === binding.id ? { ...item, dataUrl, missing: false } : item);
        wiringChanged = true;
      }
      if (binding.kind === "wiring-background" && wiringProject) {
        wiringProject.backgroundImages = wiringProject.backgroundImages.map((item) => item.id === binding.id ? { ...item, src: dataUrl } : item);
        wiringChanged = true;
      }
    }
    imported += 1;
  }
  if (wiringProject && wiringChanged) await saveToIndexedDB(wiringProject, `wiring:${projectId}:autosave`);
  return { imported, missing };
}

function assertProjectManifest(value: unknown): RailCityManifestV2 | LegacyManifest {
  const manifest = value as RailCityManifestV2 | LegacyManifest;
  if (manifest?.kind !== "railcity-project" || (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2)) throw new Error("不支持的城市项目包格式");
  if (!manifest.project || typeof manifest.project.name !== "string" || !Array.isArray(manifest.assets)) throw new Error("城市项目包清单不完整");
  return manifest;
}

export async function importRailProjectArchive(
  file: Blob,
  repository: ProjectRepository,
  documentStore = new BrowserEditorDocumentStore(),
): Promise<{ project: ProjectSummary; missingAssets: string[] }> {
  if (!repository.capabilities.canCreateProjects) throw new Error("当前存储模式不能导入城市项目包");
  const entries = await unpack(file);
  const manifest = assertProjectManifest(readJson(entries, "manifest.json"));
  const transitData = normalizeTransitData(readJson<TransitData>(entries, "data/transit.json"));
  const created = await repository.createProject(manifest.project.name || "导入的城市项目");
  try {
    await repository.saveTransitData(created.id, transitData);
    for (const kind of ["transit", "entrance", "wiring"] as const) {
      const path = manifest.editors?.[kind];
      if (path) await documentStore.save(created.id, kind, readJson<JsonEditorDocument>(entries, path));
    }
    if (manifest.wiringProjectPath) {
      const wiring = readJson<ProjectFile>(entries, manifest.wiringProjectPath);
      const { saveToIndexedDB } = await import("../wiring/projectStore");
      await saveToIndexedDB(wiring, `wiring:${created.id}:autosave`);
    }
    if (manifest.schemaVersion === 1) {
      for (const asset of manifest.assets) {
        const bytes = entries[asset.path];
        if (bytes) await repository.putAsset(created.id, asset.name, new Blob([bytes as BlobPart], { type: asset.type || "application/octet-stream" }));
      }
      return { project: created, missingAssets: [] };
    }
    const applied = await applyAssets(entries, manifest.assets, created.id, repository);
    return { project: created, missingAssets: applied.missing };
  } catch (reason) {
    await documentStore.deleteProjectDocuments(created.id).catch(() => undefined);
    await repository.deleteProject(created.id).catch(() => undefined);
    throw reason;
  }
}

/** Backward-compatible import API. */
export async function importRailCityArchive(file: Blob, repository: ProjectRepository, documentStore = new BrowserEditorDocumentStore()): Promise<ProjectSummary> {
  return (await importRailProjectArchive(file, repository, documentStore)).project;
}

export async function importRailAssetsArchive(
  file: Blob,
  targetProjectId: string,
  repository: ProjectRepository,
): Promise<{ imported: number; missing: string[]; sourceProjectName: string }> {
  if (!repository.capabilities.canManageAssets) throw new Error("当前存储模式不能导入资源包");
  const entries = await unpack(file);
  const manifest = readJson<RailAssetsManifest>(entries, "manifest.json");
  if (manifest?.kind !== "railcity-assets" || manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) throw new Error("不支持的资源包格式");
  const result = await applyAssets(entries, manifest.assets, targetProjectId, repository);
  return { ...result, sourceProjectName: manifest.project?.name || "未知项目" };
}
