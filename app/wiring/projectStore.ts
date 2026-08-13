// ──────────────────────────────────────────────
// 配线图编辑器 · 工程序列化 + IndexedDB 持久化
// ──────────────────────────────────────────────

import type {
  BackgroundImageObject,
  AssetRecord,
  AttachedGraphic,
  DiagramModule,
  FilterState,
  LabelObject,
  LayerNode,
  ModuleConnection,
  ServicePattern,
  PlatformObject,
  PendingPlacement,
  PhysicalStation,
  SourceChange,
  SourceLine,
  SourceMapping,
  SourceStationOnLine,
  TransferGroup,
  ViewportState,
} from "./types";
import { DEFAULT_LAYERS } from "./types";
import { createCanvasPage, leafLayerIds, type CanvasPageSettings } from "./canvasLogic";
import { MODULE_TEMPLATES } from "./templates";
import { defaultConnectionLayerId, defaultGraphicLayerId, defaultLabelLayerId, defaultModuleLayerId, defaultPlatformLayerId } from "./layerAssignment";
import {
  DEFAULT_LAYOUT,
  DEFAULT_LOOP_LAYOUT,
  DEFAULT_PULSE_LAYOUT,
  DEFAULT_SCENIC_LAYOUT,
  normalizeTransitData,
  type TransitData,
} from "../transit/types";
import { linesFromCsv, parseCsv, stationsFromCsv, transfersFromCsv } from "../transit/csv-io";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { buildSourceIdentityRecords } from "./sourceIdentity";

/** 工程文件 schema 版本 */
export const SCHEMA_VERSION = 5;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 2000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

/** IndexedDB 数据库名 */
const DB_NAME = "metro-wiring-editor";
/** IndexedDB 存储名 */
const STORE_NAME = "projects";

const LEGACY_SYSTEM_LAYER_MIGRATIONS: Record<string, { previousParents: Array<string | null>; nextParent: string; previousName: string; nextName: string }> = {
  "layer-bg": { previousParents: [null], nextParent: "layer-background", previousName: "背景图", nextName: "底图" },
  "layer-label": { previousParents: ["layer-annotation"], nextParent: "layer-text", previousName: "文字", nextName: "站名" },
  "layer-icon": { previousParents: ["layer-annotation"], nextParent: "layer-icons", previousName: "图标", nextName: "站点图标" },
  "layer-transfer": { previousParents: ["layer-aux"], nextParent: "layer-annotation", previousName: "换乘组合", nextName: "换乘通道" },
};

/** Add newly introduced system layers without replacing user layer settings or custom nodes. */
export function mergeDefaultLayers(layers: LayerNode[] = []): LayerNode[] {
  const merged = layers.map((layer, index) => ({
    ...layer,
    parentId: layer.parentId ?? null,
    order: typeof layer.order === "number" ? layer.order : index,
    expanded: typeof layer.expanded === "boolean" ? layer.expanded : true,
  }));
  const knownIds = new Set(merged.map((layer) => layer.id));
  for (const defaultLayer of DEFAULT_LAYERS) {
    if (!knownIds.has(defaultLayer.id)) merged.push({ ...defaultLayer });
  }
  return merged.map((layer) => {
    const migration = LEGACY_SYSTEM_LAYER_MIGRATIONS[layer.id];
    if (!migration) return layer;
    const shouldReparent = migration.previousParents.includes(layer.parentId);
    const shouldRename = layer.name === migration.previousName && (shouldReparent || layer.parentId === migration.nextParent);
    if (!shouldReparent && !shouldRename) return layer;
    return {
      ...layer,
      parentId: shouldReparent ? migration.nextParent : layer.parentId,
      name: shouldRename ? migration.nextName : layer.name,
    };
  });
}

/** 画布页定义 */
export type DiagramPage = CanvasPageSettings;

/** 工程文件完整结构 */
export interface ProjectFile {
  schemaVersion: number;
  projectInfo: {
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  pages: DiagramPage[];
  layers: LayerNode[];
  modules: DiagramModule[];
  connections: ModuleConnection[];
  backgroundImages: BackgroundImageObject[];
  labels: LabelObject[];
  servicePatterns: ServicePattern[];
  transferGroups: TransferGroup[];
  platforms: PlatformObject[];
  graphics: AttachedGraphic[];
  assets: AssetRecord[];
  sourceLines: SourceLine[];
  sourceStationsOnLine: SourceStationOnLine[];
  physicalStations: PhysicalStation[];
  sourceMappings: SourceMapping[];
  filters: FilterState;
  unresolvedChanges: SourceChange[];
  pendingPlacement: PendingPlacement | null;
  thumbnailPath?: string;
  /** Transient data URL used to write thumbnails/preview.png; omitted from project.json. */
  thumbnailDataUrl?: string;
  /** Resource paths which were referenced by the project but absent from the ZIP. */
  assetLoadErrors?: string[];
  viewport: ViewportState;
  sourceDataSnapshot?: TransitData;
}

/** 工程序列化参数 */
export interface SerializeParams {
  projectName: string;
  modules: DiagramModule[];
  connections: ModuleConnection[];
  layers: LayerNode[];
  viewport: ViewportState;
  servicePatterns?: ServicePattern[];
  backgroundImages?: BackgroundImageObject[];
  labels?: LabelObject[];
  transferGroups?: TransferGroup[];
  pages?: DiagramPage[];
  sourceDataSnapshot?: TransitData;
  platforms?: PlatformObject[];
  graphics?: AttachedGraphic[];
  assets?: AssetRecord[];
  sourceLines?: SourceLine[];
  sourceStationsOnLine?: SourceStationOnLine[];
  physicalStations?: PhysicalStation[];
  sourceMappings?: SourceMapping[];
  filters?: FilterState;
  unresolvedChanges?: SourceChange[];
  pendingPlacement?: PendingPlacement | null;
  thumbnailDataUrl?: string;
}

/** 序列化工程为 ProjectFile */
export function serializeProject(params: SerializeParams): ProjectFile {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    projectInfo: {
      name: params.projectName,
      createdAt: now,
      updatedAt: now,
    },
    pages: (params.pages?.length ? params.pages : [createCanvasPage({ id: "page-1", name: "主画布" })]).map((page) => ({
      ...page,
      layerRootIds: params.layers.filter((layer) => layer.parentId === null).map((layer) => layer.id),
      objectIds: [
        ...params.modules.filter((item) => (item.pageId || "page-1") === page.id).map((item) => item.id),
        ...(params.backgroundImages || []).filter((item) => (item.pageId || "page-1") === page.id).map((item) => item.id),
        ...(params.labels || []).filter((item) => (item.pageId || "page-1") === page.id).map((item) => item.id),
        ...(params.transferGroups || []).filter((item) => (item.pageId || "page-1") === page.id).map((item) => item.id),
        ...(params.platforms || []).filter((item) => (item.pageId || "page-1") === page.id).map((item) => item.id),
        ...(params.graphics || []).filter((item) => (item.pageId || "page-1") === page.id).map((item) => item.id),
      ],
      viewport: page.id === "page-1" && !params.pages ? params.viewport : page.viewport,
    })),
    layers: params.layers,
    modules: params.modules,
    connections: params.connections,
    backgroundImages: params.backgroundImages || [],
    labels: params.labels || [],
    servicePatterns: params.servicePatterns || [],
    transferGroups: params.transferGroups || [],
    platforms: params.platforms || [],
    graphics: params.graphics || [],
    assets: params.assets || [],
    sourceLines: params.sourceLines || [],
    sourceStationsOnLine: params.sourceStationsOnLine || [],
    physicalStations: params.physicalStations || [],
    sourceMappings: params.sourceMappings || [],
    filters: params.filters || { lineIds: [] },
    unresolvedChanges: params.unresolvedChanges || [],
    pendingPlacement: params.pendingPlacement || null,
    thumbnailPath: "thumbnails/preview.png",
    thumbnailDataUrl: params.thumbnailDataUrl,
    viewport: params.viewport,
    sourceDataSnapshot: params.sourceDataSnapshot,
  };
}

/** 序列化为 JSON 字符串 */
export function projectToJson(project: ProjectFile): string {
  const persisted = { ...project };
  delete persisted.thumbnailDataUrl;
  return JSON.stringify(persisted, null, 2);
}

function csvEscape(value: unknown): string {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvText(headers: string[], rows: Record<string, unknown>[]): string {
  return `\uFEFF${headers.join(",")}\r\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")).join("\r\n")}\r\n`;
}

function sourceCsvEntries(data?: TransitData): Record<string, Uint8Array> {
  if (!data) return {};
  return {
    "source/lines.csv": strToU8(csvText(
      ["id", "kind", "number", "name_zh", "name_en", "code", "line_color", "station_color", "current_color", "passed_color", "text_color", "description"],
      data.lines.map((line) => ({ id: line.id, kind: line.kind, number: line.number, name_zh: line.nameZh, name_en: line.nameEn, code: line.code, line_color: line.lineColor, station_color: line.stationColor, current_color: line.currentColor, passed_color: line.passedColor, text_color: line.textColor, description: line.description })),
    )),
    "source/stations.csv": strToU8(csvText(
      ["id", "line_id", "sequence", "name_zh", "name_en", "code", "marker_color", "terminal_type", "through_line_ids", "notes", "is_open", "icon"],
      data.stations.map((station) => ({ id: station.id, line_id: station.lineId, sequence: station.sequence, name_zh: station.nameZh, name_en: station.nameEn, code: station.code, marker_color: station.markerColor, terminal_type: station.terminalType, through_line_ids: station.throughLineIds, notes: station.notes, is_open: station.isOpen ? 1 : 0, icon: station.icon || "" })),
    )),
    "source/transfers.csv": strToU8(csvText(
      ["id", "station_id", "target_line_id", "order", "color_override", "hidden"],
      data.transfers.map((transfer) => ({ id: transfer.id, station_id: transfer.stationId, target_line_id: transfer.targetLineId, order: transfer.order, color_override: transfer.colorOverride, hidden: transfer.hidden ? 1 : 0 })),
    )),
  };
}

function backgroundEntries(project: ProjectFile): Record<string, Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  for (const image of project.backgroundImages || []) {
    const match = image.src.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) continue;
    const extension = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
    entries[`assets/backgrounds/${image.id}.${extension}`] = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  }
  return entries;
}

function assetEntries(project: ProjectFile): Record<string, Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  for (const asset of project.assets || []) {
    const match = asset.dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) continue;
    const extension = asset.name.includes(".") ? asset.name.split(".").pop()! : (match[1].split("/")[1] || "bin");
    entries[asset.archivePath || `assets/icons/${asset.id}.${extension}`] = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  }
  return entries;
}

export function projectToArchive(project: ProjectFile): Uint8Array {
  const previewMatch = project.thumbnailDataUrl?.match(/^data:image\/png;base64,(.+)$/);
  const preview = previewMatch
    ? Uint8Array.from(atob(previewMatch[1]), (char) => char.charCodeAt(0))
    : Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1Y4WQAAAABJRU5ErkJggg=="), (char) => char.charCodeAt(0));
  return zipSync({
    "project.json": strToU8(projectToJson(project)),
    ...sourceCsvEntries(project.sourceDataSnapshot),
    ...backgroundEntries(project),
    ...assetEntries(project),
    "thumbnails/preview.png": preview,
  }, { level: 6 });
}

function mimeTypeForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function dataUrlFromEntry(bytes: Uint8Array, path: string): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeTypeForPath(path)};base64,${btoa(binary)}`;
}

/** Rehydrate archive-backed background/icon assets without failing an otherwise valid legacy project. */
export function restoreArchiveAssets(project: ProjectFile, entries: Record<string, Uint8Array>): ProjectFile {
  const restored = migrateProjectSchema(project);
  const errors: string[] = [];
  restored.backgroundImages = restored.backgroundImages.map((image) => {
    const path = image.archivePath || Object.keys(entries).find((entry) => entry.startsWith(`assets/backgrounds/${image.id}.`));
    if (!path) {
      if (image.archivePath) errors.push(image.archivePath);
      return image;
    }
    const bytes = entries[path];
    if (!bytes) { errors.push(path); return image; }
    return { ...image, src: dataUrlFromEntry(bytes, path), archivePath: path };
  });
  restored.assets = restored.assets.map((asset) => {
    const path = asset.archivePath || Object.keys(entries).find((entry) => entry.startsWith(`assets/icons/${asset.id}.`));
    if (!path || !entries[path]) {
      if (path || asset.archivePath) errors.push(path || asset.archivePath!);
      return { ...asset, missing: Boolean(path || asset.archivePath) };
    }
    return { ...asset, archivePath: path, dataUrl: dataUrlFromEntry(entries[path], path), missing: false };
  });
  return { ...restored, assetLoadErrors: errors };
}

/** 从 JSON 字符串反序列化 */
export function jsonToProject(json: string): ProjectFile {
  const parsed = JSON.parse(json) as ProjectFile;
  return migrateProjectSchema(parsed);
}

/** Schema 版本迁移（目前只有 v1，保留迁移入口） */
export function migrateProjectSchema(project: ProjectFile): ProjectFile {
  const sourceVersion = project.schemaVersion || 1;
  if (sourceVersion > SCHEMA_VERSION) throw new Error(`工程版本 ${sourceVersion} 高于当前支持的版本 ${SCHEMA_VERSION}`);
  const migrated = JSON.parse(JSON.stringify(project)) as ProjectFile;

  // 向后兼容：旧工程可能没有 labels 字段
  if (!migrated.labels) migrated.labels = [];

  // 向后兼容：旧工程可能没有 transferGroups 字段
  if (!migrated.transferGroups) migrated.transferGroups = [];
  migrated.platforms = migrated.platforms || [];
  migrated.graphics = migrated.graphics || [];
  migrated.assets = migrated.assets || [];
  migrated.sourceLines = migrated.sourceLines || [];
  migrated.sourceStationsOnLine = migrated.sourceStationsOnLine || [];
  if (migrated.sourceDataSnapshot && (!migrated.sourceLines.length || !migrated.sourceStationsOnLine.length)) {
    const normalizedSource = normalizeTransitData(migrated.sourceDataSnapshot);
    const identity = buildSourceIdentityRecords(normalizedSource);
    if (!migrated.sourceLines.length) migrated.sourceLines = identity.sourceLines;
    if (!migrated.sourceStationsOnLine.length) migrated.sourceStationsOnLine = identity.sourceStationsOnLine;
    migrated.sourceDataSnapshot = normalizedSource;
  }
  migrated.physicalStations = migrated.physicalStations || [];
  migrated.sourceMappings = migrated.sourceMappings || [];
  migrated.filters = migrated.filters || { lineIds: [] };
  migrated.unresolvedChanges = migrated.unresolvedChanges || [];
  migrated.pendingPlacement = migrated.pendingPlacement || null;
  migrated.thumbnailPath = migrated.thumbnailPath || "thumbnails/preview.png";
  if (!migrated.servicePatterns) migrated.servicePatterns = [];
  migrated.servicePatterns = migrated.servicePatterns.map((pattern) => ({
    ...pattern,
    stationPathIds: pattern.stationPathIds || [],
    segmentPathIds: pattern.segmentPathIds || [],
  }));
  if (!migrated.pages?.length) {
    migrated.pages = [createCanvasPage({ id: "page-1", name: "主画布", viewport: migrated.viewport || { panX: 100, panY: 60, scale: 0.75 } })];
  } else {
    migrated.pages = migrated.pages.map((page) => createCanvasPage(page));
  }

  // 向后兼容：旧连接可能没有 crossingType / crossingPoints / controlPoints / autoCurve / lineStyle 字段
  migrated.connections = migrated.connections.map((c, index) => ({
    ...c,
    crossingType: c.crossingType || "plain",
    lineStyle: c.lineStyle || "solid",
    crossingPoints: c.crossingPoints || [],
    controlPoints: c.controlPoints || [],
    autoCurve: typeof c.autoCurve === "boolean" ? c.autoCurve : true,
    layerId: c.layerId || "layer-track-main",
    zIndexMode: c.zIndexMode === "manual" ? "manual" : "auto",
    zIndex: typeof c.zIndex === "number" ? c.zIndex : index,
    pageId: c.pageId || "page-1",
    createdOrder: typeof c.createdOrder === "number" ? c.createdOrder : index,
    colorMode: c.colorMode ?? "auto",
    color: c.color ?? undefined,
  }));

  migrated.modules = migrated.modules.map((item, index) => ({ ...item, pageId: item.pageId || "page-1", createdOrder: typeof item.createdOrder === "number" ? item.createdOrder : index, trackColorMode: item.trackColorMode ?? "line", trackColor: item.trackColor ?? undefined, labelColorMode: item.labelColorMode ?? "line" }));
  migrated.backgroundImages = (migrated.backgroundImages || []).map((item, index) => ({ ...item, rotation: item.rotation ?? 0, pageId: item.pageId || "page-1", createdOrder: typeof item.createdOrder === "number" ? item.createdOrder : index }));
  migrated.labels = migrated.labels.map((item, index) => ({ ...item, pageId: item.pageId || "page-1", createdOrder: typeof item.createdOrder === "number" ? item.createdOrder : index, positionMode: item.positionMode || (item.attachedToId ? "attached" : "independent"), offsetX: item.offsetX ?? 0, offsetY: item.offsetY ?? 0, colorMode: item.colorMode === "default" && /^.+:template-label:(?:zh|en)$/.test(item.id || "") ? undefined : item.colorMode }));
  migrated.transferGroups = migrated.transferGroups.map((item, index) => ({ ...item, moduleIds: item.moduleIds?.length ? item.moduleIds : ((item as unknown as Record<string, unknown>).memberModuleIds as string[] || []), pageId: item.pageId || "page-1", createdOrder: typeof item.createdOrder === "number" ? item.createdOrder : index }));
  migrated.platforms = migrated.platforms.map((item, index) => ({ ...item, attachedTrackIds: item.attachedTrackIds || [], pageId: item.pageId || "page-1", createdOrder: typeof item.createdOrder === "number" ? item.createdOrder : index, visible: item.visible ?? true, locked: item.locked ?? false, colorMode: item.colorMode ?? "line", zIndexMode: item.zIndexMode === "manual" ? "manual" : "auto" }));
  migrated.graphics = migrated.graphics.map((item, index) => ({ ...item, positionMode: item.positionMode || (item.attachedToId ? "attached" : "independent"), offsetX: item.offsetX ?? 0, offsetY: item.offsetY ?? 0, pageId: item.pageId || "page-1", createdOrder: typeof item.createdOrder === "number" ? item.createdOrder : index, visible: item.visible ?? true, locked: item.locked ?? false, shapeType: item.shapeType, fill: item.fill ?? "#cce6f5", stroke: item.stroke ?? "#202124" }));

  const templateById = new Map(MODULE_TEMPLATES.map((template) => [template.id, template]));
  const originalModuleLayerById = new Map(migrated.modules.map((item) => [item.id, item.layerId]));

  // v4: old creation paths put almost every object in one generic layer. Reclassify only
  // those legacy defaults once; later manually selected valid leaf layers remain untouched.
  if (sourceVersion < 4) {
    migrated.modules = migrated.modules.map((item) => item.layerId === "layer-track-main"
      ? { ...item, layerId: defaultModuleLayerId(templateById.get(item.templateId), item, migrated.sourceLines) }
      : item);
    const moduleById = new Map(migrated.modules.map((item) => [item.id, item]));
    migrated.platforms = migrated.platforms.map((item) => {
      const owner = item.moduleId ? moduleById.get(item.moduleId) : undefined;
      const oldOwnerLayer = item.moduleId ? originalModuleLayerById.get(item.moduleId) : undefined;
      return item.layerId === "layer-track-main" || item.layerId === oldOwnerLayer || item.layerId === "layer-platform"
        ? { ...item, layerId: defaultPlatformLayerId(owner?.templateId) }
        : item;
    });
    migrated.labels = migrated.labels.map((item) => item.layerId === "layer-label"
      ? { ...item, layerId: defaultLabelLayerId(item) }
      : item);
    migrated.graphics = migrated.graphics.map((item) => item.layerId === "layer-icon"
      ? { ...item, layerId: defaultGraphicLayerId(item) }
      : item);
  }

  // v5: tram-linked modules and the connections between them get a dedicated layer.
  // Only former automatic layers are changed, so explicit custom layer choices survive.
  if (sourceVersion < 5) {
    migrated.modules = migrated.modules.map((item) => {
      const template = templateById.get(item.templateId);
      return item.layerId === defaultModuleLayerId(template)
        ? { ...item, layerId: defaultModuleLayerId(template, item, migrated.sourceLines) }
        : item;
    });
    const tramModuleById = new Map(migrated.modules.map((item) => [item.id, item]));
    migrated.connections = migrated.connections.map((item) => item.layerId === "layer-track-main"
      ? { ...item, layerId: defaultConnectionLayerId(tramModuleById.get(item.fromModuleId), tramModuleById.get(item.toModuleId), migrated.sourceLines) }
      : item);
  }

  // 补齐新增的系统图层；保留用户名称、显隐、锁定、排序和自定义图层。
  migrated.layers = mergeDefaultLayers(migrated.layers || []);
  const validLeafLayers = new Set(leafLayerIds(migrated.layers));
  const moduleById = new Map(migrated.modules.map((item) => [item.id, item]));
  migrated.modules = migrated.modules.map((item) => validLeafLayers.has(item.layerId)
    ? item
    : { ...item, layerId: defaultModuleLayerId(templateById.get(item.templateId), item, migrated.sourceLines) });
  migrated.connections = migrated.connections.map((item) => validLeafLayers.has(item.layerId)
    ? item
    : { ...item, layerId: defaultConnectionLayerId(moduleById.get(item.fromModuleId), moduleById.get(item.toModuleId), migrated.sourceLines) });
  migrated.backgroundImages = migrated.backgroundImages.map((item) => validLeafLayers.has(item.layerId)
    ? item
    : { ...item, layerId: "layer-bg" });
  migrated.labels = migrated.labels.map((item) => validLeafLayers.has(item.layerId)
    ? item
    : { ...item, layerId: defaultLabelLayerId(item) });
  migrated.transferGroups = migrated.transferGroups.map((item) => validLeafLayers.has(item.layerId)
    ? item
    : { ...item, layerId: "layer-transfer" });
  migrated.platforms = migrated.platforms.map((item) => validLeafLayers.has(item.layerId)
    ? item
    : { ...item, layerId: defaultPlatformLayerId(item.moduleId ? moduleById.get(item.moduleId)?.templateId : undefined) });
  migrated.graphics = migrated.graphics.map((item) => validLeafLayers.has(item.layerId)
    ? item
    : { ...item, layerId: defaultGraphicLayerId(item) });
  const rootLayerIds = migrated.layers.filter((layer) => layer.parentId === null).map((layer) => layer.id);
  migrated.pages = migrated.pages.map((page) => ({
    ...page,
    layerRootIds: [...new Set([...(page.layerRootIds || []), ...rootLayerIds])],
  }));

  // v3：颜色模式默认改为跟随线路。旧工程里由早期迁移写入的显式 "default"（深灰轨道 /
  // 沙色站台 / 深灰站名）在载入时一次性转换为 "line"，让已有对象默认跟随线路。
  // 此后用户手动选择"深灰"仍会保留（migration 只在 sourceVersion < 3 时执行一次）。
  // 独立标签不转换——普通注释文字保持用户选择；物化站名标签由上方规则复位为
  // undefined 后经 line 回退自动跟随模块线路。
  if (sourceVersion < 3) {
    migrated.modules = migrated.modules.map((item) => item.trackColorMode === "default" ? { ...item, trackColorMode: "line" } : item);
    migrated.modules = migrated.modules.map((item) => item.labelColorMode === "default" ? { ...item, labelColorMode: "line" } : item);
    migrated.platforms = (migrated.platforms || []).map((item) => item.colorMode === "default" ? { ...item, colorMode: "line" } : item);
  }

  migrated.schemaVersion = SCHEMA_VERSION;
  return migrated;
}

// ── IndexedDB 持久化 ──────────────────────────

/** 打开 IndexedDB */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 保存工程到 IndexedDB。key 必须按项目作用域传入（如 `wiring:<projectId>:autosave`），
 * 不得使用全局裸 key，否则不同工程会互相覆盖。
 */
export async function saveToIndexedDB(project: ProjectFile, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(project, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** 从 IndexedDB 加载工程（key 为项目作用域键，见 saveToIndexedDB） */
export async function loadFromIndexedDB(key: string): Promise<ProjectFile | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      db.close();
      resolve(request.result ? migrateProjectSchema(request.result as ProjectFile) : null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/** 删除 IndexedDB 中的工程（key 为项目作用域键，见 saveToIndexedDB） */
export async function deleteFromIndexedDB(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** 下载 Blob 辅助（实现在 ../lib/browser，三处编辑器共用） */
import { downloadBlob } from "../lib/browser";
export { downloadBlob };

/** 保存工程为包含 project.json、源 CSV 与资源的 ZIP 工程包。 */
export function exportProjectJson(project: ProjectFile, filename: string = "配线图工程.metroproj"): void {
  const archive = projectToArchive(project);
  downloadBlob(new Blob([archive.buffer as ArrayBuffer], { type: "application/vnd.metro-project+zip" }), filename);
}

/** 从 File 对象读取工程 */
export async function importProjectFile(file: File): Promise<ProjectFile> {
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("工程包超过 100 MB 限制");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = unzipSync(bytes);
    const paths = Object.keys(entries);
    if (paths.length > MAX_ARCHIVE_ENTRIES) throw new Error("工程包资源数量超过限制");
    const uncompressedSize = Object.values(entries).reduce((total, entry) => total + entry.length, 0);
    if (uncompressedSize > MAX_UNCOMPRESSED_BYTES) throw new Error("工程包解压后超过 200 MB 限制");
    const projectJson = entries["project.json"];
    if (!projectJson) throw new Error("工程包缺少 project.json");
    const restored = restoreArchiveAssets(jsonToProject(strFromU8(projectJson)), entries);
    if (!restored.sourceDataSnapshot && entries["source/lines.csv"] && entries["source/stations.csv"] && entries["source/transfers.csv"]) {
      restored.sourceDataSnapshot = normalizeTransitData({
        schemaVersion: 1,
        lines: linesFromCsv(parseCsv(strFromU8(entries["source/lines.csv"]))),
        stations: stationsFromCsv(parseCsv(strFromU8(entries["source/stations.csv"]))),
        transfers: transfersFromCsv(parseCsv(strFromU8(entries["source/transfers.csv"]))),
        layout: DEFAULT_LAYOUT,
        activeStyleTemplate: "classic",
        layoutTemplates: { classic: DEFAULT_LAYOUT, loop: DEFAULT_LOOP_LAYOUT, scenic: DEFAULT_SCENIC_LAYOUT, pulse: DEFAULT_PULSE_LAYOUT },
      });
      const identity = buildSourceIdentityRecords(restored.sourceDataSnapshot);
      if (!restored.sourceLines.length) restored.sourceLines = identity.sourceLines;
      if (!restored.sourceStationsOnLine.length) restored.sourceStationsOnLine = identity.sourceStationsOnLine;
    }
    return restored;
  }
  return jsonToProject(strFromU8(bytes));
}
