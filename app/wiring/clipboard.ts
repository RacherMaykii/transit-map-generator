// ──────────────────────────────────────────────
// 配线图编辑器 · 元件复制/粘贴（纯函数）
// 复制时保留模块参数与所属对象；连接仅在两模块及以上复制时保留内部连接。
// ──────────────────────────────────────────────

import { genId as defaultGenId } from "./geometry";
import {
  type AttachedGraphic,
  type DiagramModule,
  type LabelObject,
  type ModuleConnection,
  type PlatformObject,
  type TemplateTrack,
} from "./types";

/** 剪贴板载荷：复制时刻的深度快照（structuredClone） */
export interface ClipboardPayload {
  kind: "modules";
  modules: DiagramModule[];
  platforms: PlatformObject[];
  labels: LabelObject[];
  graphics: AttachedGraphic[];
  connections: ModuleConnection[];
}

export interface BuildCopyPayloadInput {
  selectedIds: string[];
  modules: DiagramModule[];
  platforms: PlatformObject[];
  labels: LabelObject[];
  graphics: AttachedGraphic[];
  connections: ModuleConnection[];
  isOnActivePage: (pageId?: string) => boolean;
  isLayerLocked: (layerId: string) => boolean;
}

/**
 * 从当前选择构建复制载荷。
 * - 仅收集在当前页、未锁定（模块自身或所在图层）的模块；
 * - 所属站台/站名/图标随模块复制；
 * - 连接仅当选中模块 ≥2 时保留（两端都在复制集内）。
 * 返回 null 表示无可复制内容。
 */
export function buildCopyPayload(input: BuildCopyPayloadInput): ClipboardPayload | null {
  const { selectedIds, modules, platforms, labels, graphics, connections, isOnActivePage, isLayerLocked } = input;
  const selected = new Set(selectedIds);
  const copiedModules = modules.filter(
    (module) => selected.has(module.id) && isOnActivePage(module.pageId) && !module.locked && !isLayerLocked(module.layerId),
  );
  if (copiedModules.length === 0) return null;
  const copiedModuleIds = new Set(copiedModules.map((module) => module.id));
  const copiedConnections = copiedModules.length >= 2
    ? connections.filter(
        (connection) =>
          isOnActivePage(connection.pageId) &&
          copiedModuleIds.has(connection.fromModuleId) &&
          copiedModuleIds.has(connection.toModuleId),
      )
    : [];
  return structuredClone({
    kind: "modules",
    modules: copiedModules,
    platforms: platforms.filter((platform) => platform.moduleId && copiedModuleIds.has(platform.moduleId)),
    labels: labels.filter((label) => label.attachedToId && copiedModuleIds.has(label.attachedToId)),
    graphics: graphics.filter((graphic) => graphic.attachedToId && copiedModuleIds.has(graphic.attachedToId)),
    connections: copiedConnections,
  });
}

export interface PasteDataOptions {
  pageId: string;
  createdOrderBase: number;
  zIndexBases: { modules: number; platforms: number; labels: number; graphics: number; connections: number };
  genId?: (prefix: string) => string;
}

export interface PasteResult {
  modules: DiagramModule[];
  platforms: PlatformObject[];
  labels: LabelObject[];
  graphics: AttachedGraphic[];
  connections: ModuleConnection[];
  /** 旧 id → 新 id（模块与连接） */
  idMap: Map<string, string>;
}

const movePoint = <T extends { x: number; y: number }>(point: T, dx: number, dy: number): T => ({
  ...point,
  x: point.x + dx,
  y: point.y + dy,
});

const moveTrack = (track: TemplateTrack, dx: number, dy: number): TemplateTrack => ({
  ...track,
  x1: track.x1 + dx,
  y1: track.y1 + dy,
  x2: track.x2 + dx,
  y2: track.y2 + dy,
  ...(typeof track.cx === "number" ? { cx: track.cx + dx } : {}),
  ...(typeof track.cy === "number" ? { cy: track.cy + dy } : {}),
  ...(typeof track.cx2 === "number" ? { cx2: track.cx2 + dx } : {}),
  ...(typeof track.cy2 === "number" ? { cy2: track.cy2 + dy } : {}),
});

/**
 * 将复制载荷转换为粘贴数据：
 * - 模块/所属对象整体平移 (dx, dy)；站台/标签/图形的 offset 相对量不变；
 * - 所有 id 重新生成；moduleId/attachedToId/fromModuleId/toModuleId/pairedConnectionId 经 idMap 重映射；
 * - 连接轨道段/控制点/交叉点世界坐标平移（贝塞尔控制柄、角度、t 值不变）；
 * - 目标页 pageId、zIndex（底 + 序号，置顶）、createdOrder 统一设置；锁定解除。
 * 参数（customParams）与其余字段经展开原样保留。
 */
export function buildPasteData(
  payload: ClipboardPayload,
  dx: number,
  dy: number,
  options: PasteDataOptions,
): PasteResult {
  const { pageId, createdOrderBase, zIndexBases, genId = defaultGenId } = options;
  const { modules: srcModules, platforms: srcPlatforms, labels: srcLabels, graphics: srcGraphics, connections: srcConnections } = payload;
  const idMap = new Map<string, string>();

  const moduleIds = srcModules.map((module) => {
    const id = genId("module");
    idMap.set(module.id, id);
    return id;
  });
  // 先为全部连接生成新 id，保证 pairedConnectionId 双向都能经 idMap 重映射。
  const connectionIds = srcConnections.map((connection) => {
    const id = genId("connection");
    idMap.set(connection.id, id);
    return id;
  });

  const modules = srcModules.map((module, index) => ({
    ...module,
    id: moduleIds[index],
    x: module.x + dx,
    y: module.y + dy,
    pageId,
    zIndex: zIndexBases.modules + index,
    createdOrder: createdOrderBase + index,
    locked: false,
  }));

  const platforms = srcPlatforms.map((platform, index) => ({
    ...platform,
    id: genId("platform"),
    moduleId: platform.moduleId ? idMap.get(platform.moduleId) ?? platform.moduleId : platform.moduleId,
    x: platform.x + dx,
    y: platform.y + dy,
    pageId,
    zIndex: zIndexBases.platforms + index,
    createdOrder: createdOrderBase + index,
  }));

  const labels = srcLabels.map((label, index) => ({
    ...label,
    id: genId("label"),
    attachedToId: label.attachedToId ? idMap.get(label.attachedToId) ?? label.attachedToId : label.attachedToId,
    x: label.x + dx,
    y: label.y + dy,
    pageId,
    zIndex: zIndexBases.labels + index,
    createdOrder: createdOrderBase + index,
  }));

  const graphics = srcGraphics.map((graphic, index) => ({
    ...graphic,
    id: genId("graphic"),
    attachedToId: graphic.attachedToId ? idMap.get(graphic.attachedToId) ?? graphic.attachedToId : graphic.attachedToId,
    x: graphic.x + dx,
    y: graphic.y + dy,
    pageId,
    zIndex: zIndexBases.graphics + index,
    createdOrder: createdOrderBase + index,
  }));

  const connections = srcConnections.map((connection, index) => ({
    ...connection,
    id: connectionIds[index],
    fromModuleId: idMap.get(connection.fromModuleId) ?? connection.fromModuleId,
    toModuleId: idMap.get(connection.toModuleId) ?? connection.toModuleId,
    pairedConnectionId: connection.pairedConnectionId ? idMap.get(connection.pairedConnectionId) : undefined,
    tracks: connection.tracks.map((track) => moveTrack(track, dx, dy)),
    controlPoints: connection.controlPoints.map((point) => movePoint(point, dx, dy)),
    crossingPoints: connection.crossingPoints.map((point) => movePoint(point, dx, dy)),
    pageId,
    zIndex: zIndexBases.connections + index,
    createdOrder: createdOrderBase + index,
  }));

  return { modules, platforms, labels, graphics, connections, idMap };
}
