import { worldPortPosition } from "./types";
import type { AttachedGraphic, BackgroundImageObject, DiagramModule, LabelObject, LayerNode, ModuleConnection, ModulePort, ModuleTemplate, PlatformObject, PortRole, TransferGroup } from "./types";
import { defaultModuleLayerId, defaultPlatformLayerId } from "./layerAssignment";

/** 画布尺寸调整方式：infinite=无限流自动适应内容 / manual=手动固定尺寸（关闭自动调整） */
export type CanvasFlowMode = "infinite" | "manual";

export interface CanvasPageSettings {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  layerRootIds: string[];
  objectIds: string[];
  viewport: { panX: number; panY: number; scale: number };
  gridSize: number;
  showGrid: boolean;
  orientation: "landscape" | "portrait";
  /**
   * 无限流（infinite）或手动尺寸（manual）。旧工程缺省按 infinite，保留原有自动增长行为。
   * infinite：元件放到画布外自动扩大、画布为空自动缩回基准尺寸。
   * manual：画布保持固定尺寸，不做任何自动调整。
   */
  flowMode?: CanvasFlowMode;
  /** 基准尺寸：新建画布或手动应用时设定；自动增长不改动，空画布收缩回此尺寸。 */
  baseWidth?: number;
  baseHeight?: number;
}

export interface CanvasPreset {
  id: string;
  name: string;
  width: number;
  height: number;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: "hd", name: "1920 × 1080", width: 1920, height: 1080 },
  { id: "qhd", name: "2560 × 1440", width: 2560, height: 1440 },
  { id: "a4", name: "A4 横向", width: 1123, height: 794 },
  { id: "a3", name: "A3 横向", width: 1587, height: 1123 },
];

export function createCanvasPage(input: Partial<CanvasPageSettings> & Pick<CanvasPageSettings, "id" | "name">): CanvasPageSettings {
  const width = Math.max(320, Math.round(input.width ?? 1920));
  const height = Math.max(320, Math.round(input.height ?? 1080));
  return {
    id: input.id,
    name: input.name.trim() || "未命名画布",
    width,
    height,
    backgroundColor: input.backgroundColor || "#FFFFFF",
    layerRootIds: input.layerRootIds || [],
    objectIds: input.objectIds || [],
    viewport: input.viewport || { panX: 100, panY: 60, scale: 0.75 },
    gridSize: Math.max(5, Math.round(input.gridSize ?? 20)),
    showGrid: input.showGrid ?? true,
    orientation: input.orientation || (width >= height ? "landscape" : "portrait"),
    flowMode: input.flowMode ?? "infinite",
    baseWidth: Math.max(320, Math.round(input.baseWidth ?? width)),
    baseHeight: Math.max(320, Math.round(input.baseHeight ?? height)),
  };
}

export function updateCanvasPage(
  pages: CanvasPageSettings[],
  pageId: string,
  patch: Partial<Omit<CanvasPageSettings, "id">>,
): CanvasPageSettings[] {
  // 手动修改宽高时同步基准尺寸：自动增长不经过 updateCanvasPage，因此不会覆盖 base。
  const target = pages.find((page) => page.id === pageId);
  const next: typeof patch = { ...patch };
  if (next.width !== undefined || next.height !== undefined) {
    const w = next.width ?? target?.width ?? 1920;
    const h = next.height ?? target?.height ?? 1080;
    next.baseWidth = Math.max(320, Math.round(w));
    next.baseHeight = Math.max(320, Math.round(h));
  }
  return pages.map((page) => page.id === pageId ? createCanvasPage({ ...page, ...next, id: page.id, name: patch.name ?? page.name }) : page);
}

/** Grow a canvas at its right and bottom edges without changing object coordinates. */
export function expandCanvasToFitBounds(
  page: CanvasPageSettings,
  bounds: readonly { x: number; y: number; width: number; height: number }[],
  padding = 120,
  minimumGrowth = 320,
): CanvasPageSettings {
  if (!bounds.length) return page;
  const right = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height));
  const roundToGrid = (value: number) => Math.ceil(value / page.gridSize) * page.gridSize;
  const width = right + padding > page.width
    ? roundToGrid(Math.max(right + padding, page.width + minimumGrowth))
    : page.width;
  const height = bottom + padding > page.height
    ? roundToGrid(Math.max(bottom + padding, page.height + minimumGrowth))
    : page.height;
  return width === page.width && height === page.height
    ? page
    : createCanvasPage({ ...page, width, height });
}

// ── 画布调整（PS 式锚点九宫格）──────────────────

/** 九宫格锚点索引：0=左上 … 4=中心 … 8=右下 */
export type CanvasAnchor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * 九宫格锚点定义。fx/fy 为锚点在旧画布中的位置比例（0/0.5/1），
 * arrow 为选中该锚点后画布向箭头方向扩张（锚点处内容保持不动）。
 */
export const CANVAS_ANCHORS: { fx: number; fy: number; arrow: string }[] = [
  { fx: 0, fy: 0, arrow: "↘" },   // 左上：向右、向下扩
  { fx: 0.5, fy: 0, arrow: "↓" }, // 上：向下扩
  { fx: 1, fy: 0, arrow: "↙" },   // 右上：向左、向下扩
  { fx: 0, fy: 0.5, arrow: "→" }, // 左：向右扩
  { fx: 0.5, fy: 0.5, arrow: "✛" }, // 中心：四向平均扩
  { fx: 1, fy: 0.5, arrow: "←" }, // 右：向左扩
  { fx: 0, fy: 1, arrow: "↗" },   // 左下：向右、向上扩
  { fx: 0.5, fy: 1, arrow: "↑" }, // 下：向上扩
  { fx: 1, fy: 1, arrow: "↖" },   // 右下：向左、向上扩
];

/** 九宫格锚点的中文名，与索引一一对应。 */
export const CANVAS_ANCHOR_NAMES = [
  "左上", "上", "右上",
  "左", "中心", "右",
  "左下", "下", "右下",
] as const;

/**
 * 以某个锚点为固定点时，九宫格每个格子应显示的箭头：锚点格显示 ●（固定点），
 * 其余格子按相对锚点的方向显示 单/对角 箭头，直观体现画布向哪些方向扩张。
 * 返回 9 个字符串，按行优先排列。
 */
export function canvasAnchorArrowGrid(anchor: CanvasAnchor): string[] {
  const anchorRow = Math.floor(anchor / 3);
  const anchorCol = anchor % 3;
  const diagonal: Record<string, string> = { "→↓": "↘", "→↑": "↗", "←↓": "↙", "←↑": "↖" };
  const cells: string[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (row === anchorRow && col === anchorCol) {
        cells.push("●");
        continue;
      }
      let arrow = "";
      if (col > anchorCol) arrow += "→";
      else if (col < anchorCol) arrow += "←";
      if (row > anchorRow) arrow += "↓";
      else if (row < anchorRow) arrow += "↑";
      if (arrow.length === 2) arrow = diagonal[arrow] ?? arrow;
      cells.push(arrow || "·");
    }
  }
  return cells;
}

/** 描述某个锚点对应的扩张方向，供九宫格下方的预览文案使用。 */
export function canvasAnchorDescription(anchor: CanvasAnchor): string {
  const { fx, fy } = CANVAS_ANCHORS[anchor];
  if (fx === 0.5 && fy === 0.5) return "画布将向四周平均扩展";
  const parts: string[] = [];
  if (fx === 0) parts.push("向右");
  else if (fx === 1) parts.push("向左");
  else parts.push("向左右");
  if (fy === 0) parts.push("向下");
  else if (fy === 1) parts.push("向上");
  else parts.push("向上下");
  return `画布将${parts.join("、")}扩展`;
}

/** 站台缩放最小尺寸（属性面板与拖拽共用）。 */
export const MIN_PLATFORM_WIDTH = 4;
export const MIN_PLATFORM_HEIGHT = 4;

/** 描述某个站台缩放锚点：锚点处固定不动，其余方向随之调整。 */
export function platformAnchorDescription(anchor: CanvasAnchor): string {
  const { fx, fy } = CANVAS_ANCHORS[anchor];
  const parts: string[] = [];
  if (fx === 0) parts.push("向右");
  else if (fx === 1) parts.push("向左");
  else parts.push("向左右");
  if (fy === 0) parts.push("向下");
  else if (fy === 1) parts.push("向上");
  else parts.push("向上下");
  return `以「${CANVAS_ANCHOR_NAMES[anchor]}」为锚点：长度${parts[0]}、厚度${parts[1]}调整`;
}

export interface PlatformResizeResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 按目标尺寸反解站台 x/y：锚点（fx/fy 为本地坐标比例）在世界坐标中保持不动。
 * 供属性面板直接输入长度/厚度时使用；也供 computePlatformResize 在钳制尺寸后重算位置。
 * 旋转绕中心进行，故位置解包含「中心平移 + 锚点本地偏移差旋转」两部分。
 */
export function computePlatformResizeFromSize(
  platform: Pick<PlatformObject, "x" | "y" | "width" | "height" | "rotation">,
  anchor: CanvasAnchor,
  newWidth: number,
  newHeight: number,
  minWidth = MIN_PLATFORM_WIDTH,
  minHeight = MIN_PLATFORM_HEIGHT,
): PlatformResizeResult {
  const { fx, fy } = CANVAS_ANCHORS[anchor] ?? CANVAS_ANCHORS[0];
  const rot = platform.rotation ?? 0;
  const newW = Math.max(minWidth, newWidth);
  const newH = Math.max(minHeight, newHeight);
  const centerShiftX = (platform.width - newW) / 2;
  const centerShiftY = (platform.height - newH) / 2;
  const anchorShift = rotateAround(
    { x: (fx - 0.5) * (platform.width - newW), y: (fy - 0.5) * (platform.height - newH) },
    { x: 0, y: 0 },
    rot,
  );
  return {
    x: platform.x + centerShiftX + anchorShift.x,
    y: platform.y + centerShiftY + anchorShift.y,
    width: newW,
    height: newH,
  };
}

/**
 * 拖拽缩放站台：手柄位于与锚点相对的那条边角（fx=0→右侧、fx=1→左侧、fy=0→下侧、fy=1→上侧）。
 * dx/dy 为世界坐标拖拽位移；先把位移转到本地坐标再解算，最后按锚点不动重算位置。
 */
export function computePlatformResize(
  platform: Pick<PlatformObject, "x" | "y" | "width" | "height" | "rotation">,
  anchor: CanvasAnchor,
  dx: number,
  dy: number,
  minWidth = MIN_PLATFORM_WIDTH,
  minHeight = MIN_PLATFORM_HEIGHT,
): PlatformResizeResult {
  const { fx, fy } = CANVAS_ANCHORS[anchor] ?? CANVAS_ANCHORS[0];
  const hx = fx === 1 ? 0 : 1;
  const hy = fy === 1 ? 0 : 1;
  const rot = platform.rotation ?? 0;
  // 世界位移 → 本地坐标（旋转逆变换）
  const inv = rotateAround({ x: dx, y: dy }, { x: 0, y: 0 }, -rot);
  // 手柄相对锚点的比例差 (hx-fx) 恒为 1 / 0.5 / -1，不会为 0
  const newW = Math.max(minWidth, platform.width + inv.x / (hx - fx));
  const newH = Math.max(minHeight, platform.height + inv.y / (hy - fy));
  return computePlatformResizeFromSize(platform, anchor, newW, newH, minWidth, minHeight);
}

export interface CanvasResizeTransform {
  width: number;
  height: number;
  /** 世界坐标平移量：应用后把新画布原点重定为 (0,0)，保持元件相对锚点位置不变。 */
  offsetX: number;
  offsetY: number;
  /** 新画布在旧世界坐标中的矩形（用于判定画布外元件）。 */
  rect: { x: number; y: number; width: number; height: number };
}

/**
 * 计算锚点缩放变换：锚点在世界坐标中固定，新画布围绕锚点取新尺寸，
 * 返回整体平移量 offset（重定原点用）与新画布矩形（判定画布外元件用）。
 */
/** 把 -0 归零：0 乘负数在 JS 会产生 -0，深比较会区分 ±0。 */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

export function computeCanvasResizeTransform(
  page: CanvasPageSettings,
  width: number,
  height: number,
  anchor: CanvasAnchor,
): CanvasResizeTransform {
  const { fx, fy } = CANVAS_ANCHORS[anchor];
  const w = Math.max(320, Math.round(width));
  const h = Math.max(320, Math.round(height));
  const offsetX = normalizeZero(fx * (w - page.width));
  const offsetY = normalizeZero(fy * (h - page.height));
  return {
    width: w,
    height: h,
    offsetX,
    offsetY,
    rect: { x: normalizeZero(-offsetX), y: normalizeZero(-offsetY), width: w, height: h },
  };
}

/** 计算"适应内容"变换：画布恰好包裹元件范围 + 留白，内容平移使元件从留白处开始。 */
export function computeCanvasFitTransform(
  page: CanvasPageSettings,
  bounds: { x: number; y: number; width: number; height: number },
  padding = 120,
): CanvasResizeTransform {
  const w = Math.max(320, Math.ceil((bounds.width + padding * 2) / page.gridSize) * page.gridSize);
  const h = Math.max(320, Math.ceil((bounds.height + padding * 2) / page.gridSize) * page.gridSize);
  const offsetX = normalizeZero(padding - bounds.x);
  const offsetY = normalizeZero(padding - bounds.y);
  return {
    width: w,
    height: h,
    offsetX,
    offsetY,
    rect: { x: normalizeZero(-offsetX), y: normalizeZero(-offsetY), width: w, height: h },
  };
}

/** 生成新尺寸的页面，并把该尺寸作为新的基准尺寸（新建/手动应用语义）。 */
export function createResizedCanvasPage(
  page: CanvasPageSettings,
  width: number,
  height: number,
): CanvasPageSettings {
  return createCanvasPage({ ...page, width, height, baseWidth: width, baseHeight: height, flowMode: "manual" });
}

/** rect 是否完全落在 container 之外（无任何重叠）。 */
export function rectFullyOutside(
  rect: { x: number; y: number; width: number; height: number },
  container: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    rect.x + rect.width <= container.x
    || rect.y + rect.height <= container.y
    || rect.x >= container.x + container.width
    || rect.y >= container.y + container.height
  );
}

function directionAxis(direction: number): "horizontal" | "vertical" {
  const normalized = ((direction % 360) + 360) % 360;
  return normalized === 90 || normalized === 270 ? "vertical" : "horizontal";
}

/** 两端口外法线方向相差约 180°（归一化差值 ≥120°）即视为相对而望、可对接。 */
function portsFaceEachOther(dirA: number, dirB: number): boolean {
  return Math.abs(((dirA - dirB + 540) % 360) - 180) >= 120;
}

/**
 * 端口外法线方向是否大致指向目标端口。同排相对的两个端口约 ±1；上下并行错开的
 * 轨道（端口各朝左/右、彼此不相望）点积为负，靠它排除，避免把相邻并行线吸到一起。
 */
function portPointsToward(own: { x: number; y: number; direction: number }, target: { x: number; y: number }): boolean {
  const radians = (own.direction * Math.PI) / 180;
  const forward = { x: Math.cos(radians), y: Math.sin(radians) };
  const dx = target.x - own.x;
  const dy = target.y - own.y;
  const dist = Math.hypot(dx, dy) || 1;
  return (dx * forward.x + dy * forward.y) / dist > 0.5;
}

/**
 * 端口车道号：双线端口带 1/2 后缀（直股=1、支线=2），无后缀的标准端口视作车道 1。
 * 用于在"同角色同轴向"的多个端口里挑出应相连的那一对——分叉同侧的直股/支线同为
 * up_main/down_main，若只按角色对齐，算法会误把最近（但不相连）的支线当目标。
 */
function portLaneKey(portId: string): string {
  const match = portId.match(/(?:up|dn)(\d*)$/);
  return match?.[1] || "1";
}

/** 与 findDoubleTrackPartner 同规则：同一模块同一侧的 up/dn 配对端口（同车道优先）。 */
function doubleTrackPartner(template: ModuleTemplate, port: ModulePort): ModulePort | null {
  const wantedRole: PortRole | null =
    port.role === "up_main" ? "down_main" : port.role === "down_main" ? "up_main" : null;
  if (!wantedRole) return null;
  const laneKey = portLaneKey(port.id);
  const candidates = template.ports.filter((candidate) => candidate.side === port.side && candidate.role === wantedRole);
  return candidates.find((candidate) => portLaneKey(candidate.id) === laneKey) || candidates[0] || null;
}

/**
 * Align one module's track ports with matching ports on nearby modules.
 * This intentionally changes only the cross-axis: horizontal rail groups keep
 * their manually chosen longitudinal spacing while their rail heights match.
 *
 * 端口对被判定为"应相连"（角色相同、轴向相同、外法线相对而望、车道号一致、且该端口
 * 朝向目标端口）时，阈值放宽到 gridSize*2，使模块被平移到端点对齐——覆盖分叉输入
 * 端口相对标准端口的 40px 偏移（默认线间距 40，grid 20）。其余情况（并行错开不相望、
 * 或车道号不一致，如相邻但不相连的轨道）仍用传入的紧阈值，避免把别的轨道吸到一起。
 */
export function alignModuleToTrackPorts(input: {
  module: DiagramModule;
  template: ModuleTemplate;
  others: DiagramModule[];
  templates: Map<string, ModuleTemplate>;
  threshold?: number;
}): { x: number; y: number; aligned: boolean } {
  const { module, template, others, templates, threshold = 12 } = input;
  let best: { deltaX: number; deltaY: number; distance: number } | null = null;
  for (const port of template.ports) {
    const own = worldPortPosition(module, template, port.id);
    const axis = directionAxis(own.direction);
    for (const other of others) {
      if (other.id === module.id || other.pageId !== module.pageId) continue;
      const otherTemplate = templates.get(other.id) || templates.get(other.templateId);
      if (!otherTemplate) continue;
      for (const otherPort of otherTemplate.ports) {
        if (otherPort.role !== port.role) continue;
        const target = worldPortPosition(other, otherTemplate, otherPort.id);
        if (directionAxis(target.direction) !== axis) continue;
        const intendedPair = portsFaceEachOther(own.direction, target.direction)
          && portLaneKey(port.id) === portLaneKey(otherPort.id)
          && portPointsToward(own, target);
        const effectiveThreshold = intendedPair ? threshold * 2 : threshold;
        const deltaX = axis === "vertical" ? target.x - own.x : 0;
        const deltaY = axis === "horizontal" ? target.y - own.y : 0;
        const distance = Math.abs(deltaX || deltaY);
        if (distance > effectiveThreshold || (best && distance >= best.distance)) continue;
        // 双线整对一致性：若两端都带配对的 up/dn 端口，平移后配对端口必须仍在阈值内。
        // 否则该对齐会把整对拆散成单线（如 180° 翻转模块的“上下行换位”，同角色端口的
        // 平移会让另一根轨道偏移超出阈值）。
        const ownPartner = doubleTrackPartner(template, port);
        const otherPartner = doubleTrackPartner(otherTemplate, otherPort);
        if (ownPartner && otherPartner) {
          const ownPartnerWorld = worldPortPosition(module, template, ownPartner.id);
          const otherPartnerWorld = worldPortPosition(other, otherTemplate, otherPartner.id);
          const partnerGap =
            axis === "vertical"
              ? Math.abs(otherPartnerWorld.x - (ownPartnerWorld.x + deltaX))
              : Math.abs(otherPartnerWorld.y - (ownPartnerWorld.y + deltaY));
          if (partnerGap > effectiveThreshold) continue;
        }
        best = { deltaX, deltaY, distance };
      }
    }
  }
  return best
    ? { x: module.x + best.deltaX, y: module.y + best.deltaY, aligned: true }
    : { x: module.x, y: module.y, aligned: false };
}

export function deleteCanvasPage(
  pages: CanvasPageSettings[],
  pageId: string,
  activePageId: string,
): { pages: CanvasPageSettings[]; activePageId: string } {
  if (pages.length <= 1 || !pages.some((page) => page.id === pageId)) return { pages, activePageId };
  const nextPages = pages.filter((page) => page.id !== pageId);
  return { pages: nextPages, activePageId: activePageId === pageId ? nextPages[0].id : activePageId };
}

export function fitBackgroundToCanvas(image: BackgroundImageObject, page: CanvasPageSettings): BackgroundImageObject {
  const scale = Math.min(page.width / image.naturalWidth, page.height / image.naturalHeight);
  return {
    ...image,
    scale,
    x: (page.width - image.naturalWidth * scale) / 2,
    y: (page.height - image.naturalHeight * scale) / 2,
  };
}

export function centerBackgroundOnCanvas(image: BackgroundImageObject, page: CanvasPageSettings): BackgroundImageObject {
  return {
    ...image,
    x: (page.width - image.naturalWidth * image.scale) / 2,
    y: (page.height - image.naturalHeight * image.scale) / 2,
  };
}

export function restoreBackgroundSize(image: BackgroundImageObject): BackgroundImageObject {
  return { ...image, scale: 1 };
}

function rotateAround(point: { x: number; y: number }, pivot: { x: number; y: number }, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return { x: pivot.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: pivot.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
}

function normalizedRotationDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** Keep attached station text aligned to the module without upside-down glyphs. */
export function readableLabelRotation(rotation: number): number {
  const normalized = ((rotation % 360) + 360) % 360;
  const halfTurn = normalized % 180;
  return halfTurn > 90 ? halfTurn - 180 : halfTurn;
}

export function rotateModuleOwnedObjects(input: {
  module: DiagramModule;
  template: ModuleTemplate;
  nextRotation: number;
  platforms: PlatformObject[];
  labels: LabelObject[];
  graphics: AttachedGraphic[];
}): Pick<typeof input, "platforms" | "labels" | "graphics"> {
  const { module, template, nextRotation } = input;
  const delta = normalizedRotationDelta(module.rotation, nextRotation);
  if (delta === 0) return { platforms: input.platforms, labels: input.labels, graphics: input.graphics };
  const pivot = { x: module.x + template.width / 2, y: module.y + template.height / 2 };
  const rotateChild = (x: number, y: number) => rotateAround({ x, y }, pivot, delta);
  return {
    platforms: input.platforms.map((platform) => {
      if (platform.moduleId !== module.id) return platform;
      const center = rotateChild(platform.x + platform.width / 2, platform.y + platform.height / 2);
      return { ...platform, x: center.x - platform.width / 2, y: center.y - platform.height / 2, rotation: (platform.rotation + delta + 360) % 360 };
    }),
    labels: input.labels.map((label) => {
      if (label.attachedToId !== module.id) return label;
      const point = rotateChild(label.x, label.y);
      return {
        ...label,
        x: point.x,
        y: point.y,
        rotation: readableLabelRotation((label.rotation ?? 0) + delta),
        offsetX: point.x - module.x,
        offsetY: point.y - module.y,
      };
    }),
    graphics: input.graphics.map((graphic) => {
      if (graphic.attachedToId !== module.id) return graphic;
      const center = rotateChild(graphic.x + graphic.width / 2, graphic.y + graphic.height / 2);
      const x = center.x - graphic.width / 2;
      const y = center.y - graphic.height / 2;
      return { ...graphic, x, y, rotation: (graphic.rotation + delta + 360) % 360, offsetX: x - module.x, offsetY: y - module.y };
    }),
  };
}

/**
 * 模块开启/关闭镜像后，把自有的站台/站名/图标同步翻到镜像位置并修正各自朝向。
 *
 * 模块局部坐标先镜像再旋转；这里以模块中心为支点，在世界坐标中对附着对象做同样
 * 的反射：局部 x 翻转对应世界夹角「rotation+90°」的直线反射，局部 y 翻转对应
 * 「rotation」的直线反射，两个都翻转等价于绕模块中心旋转 180°。
 *
 * - 站台/文字（无镜像标记）：位置反射，朝向用镜像后的角度表示（文字再经
 *   readableLabelRotation 保持可读）。
 * - 图形（自带 mirrorX/mirrorY）：位置反射，朝向分解进镜像标记（单轴翻 → 角度取
 *   反并切换对应标记；双轴翻 → 角度 +180°）。
 */
export function mirrorModuleOwnedObjects(input: {
  module: DiagramModule;
  template: ModuleTemplate;
  nextMirrorX: boolean;
  nextMirrorY: boolean;
  platforms: PlatformObject[];
  labels: LabelObject[];
  graphics: AttachedGraphic[];
}): Pick<typeof input, "platforms" | "labels" | "graphics"> {
  const { module, template, nextMirrorX, nextMirrorY } = input;
  const toggledX = (!!module.mirrorX) !== nextMirrorX;
  const toggledY = (!!module.mirrorY) !== nextMirrorY;
  if (!toggledX && !toggledY) return { platforms: input.platforms, labels: input.labels, graphics: input.graphics };
  const rot = ((module.rotation % 360) + 360) % 360;
  const cx = module.x + template.width / 2;
  const cy = module.y + template.height / 2;
  const reflectPoint = (px: number, py: number, axisAngle: number) => {
    const radians = (axisAngle * Math.PI) / 180;
    const ux = Math.cos(radians);
    const uy = Math.sin(radians);
    const dx = px - cx;
    const dy = py - cy;
    const dot = dx * ux + dy * uy;
    return { x: cx + 2 * dot * ux - dx, y: cy + 2 * dot * uy - dy };
  };
  const mirrorPosition = (px: number, py: number) => {
    let p = { x: px, y: py };
    if (toggledX) p = reflectPoint(p.x, p.y, rot + 90);
    if (toggledY) p = reflectPoint(p.x, p.y, rot);
    return p;
  };
  const mirroredRotation = (value: number) => {
    let out = ((value % 360) + 360) % 360;
    if (toggledX && toggledY) out = (out + 180) % 360;
    else if (toggledX) out = (2 * rot + 180 - out) % 360;
    else if (toggledY) out = (2 * rot - out) % 360;
    return ((out % 360) + 360) % 360;
  };
  const platforms = input.platforms.map((platform) => {
    if (platform.moduleId !== module.id) return platform;
    const center = mirrorPosition(platform.x + platform.width / 2, platform.y + platform.height / 2);
    return { ...platform, x: center.x - platform.width / 2, y: center.y - platform.height / 2, rotation: mirroredRotation(platform.rotation) };
  });
  const labels = input.labels.map((label) => {
    if (label.attachedToId !== module.id) return label;
    const point = mirrorPosition(label.x, label.y);
    return { ...label, x: point.x, y: point.y, rotation: readableLabelRotation(mirroredRotation(label.rotation ?? 0)), offsetX: point.x - module.x, offsetY: point.y - module.y };
  });
  const graphics = input.graphics.map((graphic) => {
    if (graphic.attachedToId !== module.id) return graphic;
    const center = mirrorPosition(graphic.x + graphic.width / 2, graphic.y + graphic.height / 2);
    const x = center.x - graphic.width / 2;
    const y = center.y - graphic.height / 2;
    let rotation = ((graphic.rotation % 360) + 360) % 360;
    let mirrorX = graphic.mirrorX;
    let mirrorY = graphic.mirrorY;
    if (toggledX && toggledY) {
      rotation = (rotation + 180) % 360;
    } else if (toggledX) {
      rotation = ((2 * rot - rotation) % 360 + 360) % 360;
      mirrorX = !mirrorX;
    } else if (toggledY) {
      rotation = ((2 * rot - rotation) % 360 + 360) % 360;
      mirrorY = !mirrorY;
    }
    const result: AttachedGraphic = { ...graphic, x, y, rotation, offsetX: x - module.x, offsetY: y - module.y };
    if (toggledX) result.mirrorX = mirrorX;
    if (toggledY) result.mirrorY = mirrorY;
    return result;
  });
  return { platforms, labels, graphics };
}

/** 模板切换后按新模板重建模块自有的站台/站名/图标。站台数量与位置都可能变化，必须整体重建。 */
export function relayoutModuleOwnedObjects(input: {
  module: DiagramModule;
  nextTemplate: ModuleTemplate;
  previousTemplate?: ModuleTemplate;
  platforms: PlatformObject[];
  labels: LabelObject[];
  graphics: AttachedGraphic[];
  nextId: (prefix: string) => string;
}): Pick<typeof input, "platforms" | "labels" | "graphics"> {
  const { module, nextTemplate, previousTemplate, nextId } = input;
  // 局部坐标 → 世界坐标。pivot 用模板中心，模板切换前后宽高可能不同，必须按各模板自身尺寸取支点。
  const worldFromLocal = (template: ModuleTemplate, localX: number, localY: number) => {
    const radians = (module.rotation * Math.PI) / 180;
    const pivot = { x: module.x + template.width / 2, y: module.y + template.height / 2 };
    const dx = module.x + localX - pivot.x;
    const dy = module.y + localY - pivot.y;
    return { x: pivot.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: pivot.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
  };
  const localToWorld = (localX: number, localY: number) => worldFromLocal(nextTemplate, localX, localY);
  // 站台：以新模板的平台布局为准，保留前缀旧站台的 id/来源绑定，数量变化时补齐或裁掉。
  const owned = input.platforms.filter((platform) => platform.moduleId === module.id);
  const rebuilt = nextTemplate.platforms.map((layout, index) => {
    const old = owned[index];
    const followsTemplateLayer = !old
      || old.layerId === "layer-track-main"
      || old.layerId === defaultPlatformLayerId(previousTemplate?.id)
      || old.layerId === defaultModuleLayerId(previousTemplate);
    const center = localToWorld(layout.x + layout.width / 2, layout.y + layout.height / 2);
    const base = old ?? {
      id: nextId("platform"),
      moduleId: module.id,
      sourceStationId: owned[0]?.sourceStationId,
      sourceLineId: owned[0]?.sourceLineId,
      platformType: layout.type,
      attachedTrackIds: [],
      fill: "#D7B06A",
      layerId: defaultPlatformLayerId(nextTemplate.id),
      zIndexMode: "auto",
      zIndex: module.zIndex + index,
      pageId: module.pageId,
      createdOrder: Date.now(),
      visible: true,
      locked: false,
    };
    return {
      ...base,
      layerId: followsTemplateLayer ? defaultPlatformLayerId(nextTemplate.id) : base.layerId,
      x: center.x - layout.width / 2,
      y: center.y - layout.height / 2,
      width: layout.width,
      height: layout.height,
      rotation: module.rotation,
      platformType: layout.type,
      label: layout.label,
    };
  });
  // 站名标签：中文锚点 = 模板"站名"标签位置；英文锚点 = 模板 "Station" 标签位置（站台下方）。
  // 旧逻辑把英文放在中文下方 16px，恰好压在站台上导致"站点遮挡文字"。
  const templateLabelAnchor = (template: ModuleTemplate, isEnglish: boolean) => {
    const zhLabel = template.labels.find((label) => label.text === "站名");
    const enLabel = template.labels.find((label) => label.text === "Station");
    const baseX = zhLabel?.x ?? template.width / 2;
    const baseY = zhLabel?.y ?? -10;
    const localX = isEnglish ? (enLabel?.x ?? baseX) : baseX;
    const localY = isEnglish ? (enLabel?.y ?? baseY + 16) : baseY;
    return worldFromLocal(template, localX, localY);
  };
  const labels = input.labels.map((label) => {
    if (label.attachedToId !== module.id || !label.sourceStationId) return label;
    const isEnglish = label.language === "en";
    const point = templateLabelAnchor(nextTemplate, isEnglish);
    // 保留标签相对"旧模板锚点"的世界坐标位移（手动拖动或自动避让产生），只平移锚点：
    // 否则每次编辑元件（改参数/切模板）都会把斜向站名弹回模板默认位置。
    let displacement = { x: 0, y: 0 };
    if (previousTemplate) {
      const oldPoint = templateLabelAnchor(previousTemplate, isEnglish);
      displacement = { x: label.x - oldPoint.x, y: label.y - oldPoint.y };
    }
    const x = point.x + displacement.x;
    const y = point.y + displacement.y;
    return { ...label, x, y, rotation: readableLabelRotation(module.rotation), offsetX: x - module.x, offsetY: y - module.y };
  });
  // 站点图标：锚点 (模板宽/2, -26)。只移动最接近旧锚点的那个附着图形，避免动到用户自加的图形。
  let graphics = input.graphics;
  if (previousTemplate) {
    const oldRadians = (module.rotation * Math.PI) / 180;
    const oldPivot = { x: module.x + previousTemplate.width / 2, y: module.y + previousTemplate.height / 2 };
    const oldDx = module.x + previousTemplate.width / 2 - oldPivot.x;
    const oldDy = module.y - 26 - oldPivot.y;
    const oldIcon = {
      x: oldPivot.x + oldDx * Math.cos(oldRadians) - oldDy * Math.sin(oldRadians),
      y: oldPivot.y + oldDx * Math.sin(oldRadians) + oldDy * Math.cos(oldRadians),
    };
    const icon = input.graphics.filter((g) => g.attachedToId === module.id).reduce<{ graphic: AttachedGraphic; distance: number } | null>((best, g) => {
      const distance = Math.hypot(g.x + g.width / 2 - oldIcon.x, g.y + g.height / 2 - oldIcon.y);
      return !best || distance < best.distance ? { graphic: g, distance } : best;
    }, null)?.graphic;
    if (icon) {
      const center = localToWorld(nextTemplate.width / 2, -26);
      const gx = center.x - icon.width / 2;
      const gy = center.y - icon.height / 2;
      graphics = input.graphics.map((g) => g.id === icon.id ? { ...g, x: gx, y: gy, offsetX: gx - module.x, offsetY: gy - module.y } : g);
    }
  }
  return {
    platforms: [...input.platforms.filter((platform) => platform.moduleId !== module.id), ...rebuilt],
    labels,
    graphics,
  };
}

export function toggleOwnedModuleSelection(
  selectedIds: readonly string[],
  ownerModuleId: string,
  childOwners: readonly { id: string; ownerModuleId?: string }[],
): string[] {
  const ownerByChildId = new Map(childOwners.flatMap((child) => child.ownerModuleId ? [[child.id, child.ownerModuleId] as const] : []));
  const normalized = [...new Set(selectedIds.map((id) => ownerByChildId.get(id) ?? id))];
  return normalized.includes(ownerModuleId)
    ? normalized.filter((id) => id !== ownerModuleId)
    : [...normalized, ownerModuleId];
}

export interface ModuleGroupCanvasObjects {
  modules: DiagramModule[];
  connections: ModuleConnection[];
  platforms: PlatformObject[];
  labels: LabelObject[];
  graphics: AttachedGraphic[];
}

export interface CanvasSelectionObjects extends ModuleGroupCanvasObjects {
  backgroundImages: BackgroundImageObject[];
  transferGroups: TransferGroup[];
}

/**
 * Translates the objects captured by a canvas marquee as one logical selection.
 *
 * A marquee can contain both a station module and the platform/label/graphic
 * owned by that module. Owner-aware movement prevents those children from
 * being translated twice. Connection guide geometry follows only when both
 * endpoint modules move, so lines leading outside the selection stay anchored.
 */
export function translateCanvasSelection(
  input: CanvasSelectionObjects,
  selectedIds: readonly string[],
  dx: number,
  dy: number,
): CanvasSelectionObjects {
  if ((!dx && !dy) || selectedIds.length === 0) return input;
  const selected = new Set(selectedIds);
  const movingModuleIds = new Set(
    input.modules.filter((module) => selected.has(module.id)).map((module) => module.id),
  );
  for (const group of input.transferGroups) {
    if (selected.has(group.id)) group.moduleIds.forEach((moduleId) => movingModuleIds.add(moduleId));
  }
  const movePoint = <T extends { x: number; y: number }>(point: T): T => ({
    ...point,
    x: point.x + dx,
    y: point.y + dy,
  });
  const movedModules = input.modules.map((module) => movingModuleIds.has(module.id) ? movePoint(module) : module);
  const moduleById = new Map(movedModules.map((module) => [module.id, module] as const));
  const moveAttachedObject = <T extends {
    id: string;
    x: number;
    y: number;
    positionMode?: "attached" | "independent";
    attachedToId?: string;
    offsetX?: number;
    offsetY?: number;
  }>(object: T): T => {
    const ownerMoves = object.positionMode === "attached" && Boolean(object.attachedToId && movingModuleIds.has(object.attachedToId));
    if (!ownerMoves && !selected.has(object.id)) return object;
    const moved = movePoint(object);
    if (ownerMoves || object.positionMode !== "attached" || !object.attachedToId) return moved;
    const owner = moduleById.get(object.attachedToId);
    return owner ? { ...moved, offsetX: moved.x - owner.x, offsetY: moved.y - owner.y } as T : moved;
  };

  return {
    modules: movedModules,
    platforms: input.platforms.map((platform) => (
      (platform.moduleId && movingModuleIds.has(platform.moduleId)) || selected.has(platform.id)
        ? movePoint(platform)
        : platform
    )),
    labels: input.labels.map(moveAttachedObject),
    graphics: input.graphics.map(moveAttachedObject),
    backgroundImages: input.backgroundImages.map((image) => selected.has(image.id) ? movePoint(image) : image),
    transferGroups: input.transferGroups,
    connections: input.connections.map((connection) => {
      if (!movingModuleIds.has(connection.fromModuleId) || !movingModuleIds.has(connection.toModuleId)) return connection;
      return {
        ...connection,
        tracks: connection.tracks.map((track) => ({
          ...track,
          x1: track.x1 + dx,
          y1: track.y1 + dy,
          x2: track.x2 + dx,
          y2: track.y2 + dy,
          ...(typeof track.cx === "number" ? { cx: track.cx + dx } : {}),
          ...(typeof track.cy === "number" ? { cy: track.cy + dy } : {}),
          ...(typeof track.cx2 === "number" ? { cx2: track.cx2 + dx } : {}),
          ...(typeof track.cy2 === "number" ? { cy2: track.cy2 + dy } : {}),
        })),
        controlPoints: connection.controlPoints.map(movePoint),
        crossingPoints: connection.crossingPoints.map(movePoint),
      };
    }),
  };
}

/**
 * Translates a logical module group as one canvas object.
 *
 * Owned station furniture follows its module. Manual control and crossing
 * points only move when both connection endpoints belong to the group; a
 * connection leading outside the group remains anchored to the outside
 * geometry and is re-solved from its ports by the caller.
 */
export function translateModuleGroup(
  input: ModuleGroupCanvasObjects,
  moduleIds: readonly string[],
  dx: number,
  dy: number,
): ModuleGroupCanvasObjects {
  if ((!dx && !dy) || moduleIds.length === 0) return input;
  const memberIds = new Set(moduleIds);
  const movePoint = <T extends { x: number; y: number }>(point: T): T => ({
    ...point,
    x: point.x + dx,
    y: point.y + dy,
  });
  return {
    modules: input.modules.map((module) => memberIds.has(module.id) ? movePoint(module) : module),
    platforms: input.platforms.map((platform) => platform.moduleId && memberIds.has(platform.moduleId) ? movePoint(platform) : platform),
    labels: input.labels.map((label) => label.positionMode === "attached" && label.attachedToId && memberIds.has(label.attachedToId) ? movePoint(label) : label),
    graphics: input.graphics.map((graphic) => graphic.positionMode === "attached" && graphic.attachedToId && memberIds.has(graphic.attachedToId) ? movePoint(graphic) : graphic),
    connections: input.connections.map((connection) => {
      if (!memberIds.has(connection.fromModuleId) || !memberIds.has(connection.toModuleId)) return connection;
      return {
        ...connection,
        tracks: connection.tracks.map((track) => ({
          ...track,
          x1: track.x1 + dx,
          y1: track.y1 + dy,
          x2: track.x2 + dx,
          y2: track.y2 + dy,
          ...(typeof track.cx === "number" ? { cx: track.cx + dx } : {}),
          ...(typeof track.cy === "number" ? { cy: track.cy + dy } : {}),
          ...(typeof track.cx2 === "number" ? { cx2: track.cx2 + dx } : {}),
          ...(typeof track.cy2 === "number" ? { cy2: track.cy2 + dy } : {}),
        })),
        controlPoints: connection.controlPoints.map(movePoint),
        crossingPoints: connection.crossingPoints.map(movePoint),
      };
    }),
  };
}

/** 图层树的深度优先顺序与对象 zIndex 共同决定最终绘制顺序。 */
export function createLayerRank(layers: LayerNode[]): Map<string, number> {
  const rank = new Map<string, number>();
  const walk = (parentId: string | null) => {
    layers
      .filter((layer) => layer.parentId === parentId)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .forEach((layer) => {
        rank.set(layer.id, rank.size);
        walk(layer.id);
      });
  };
  walk(null);
  return rank;
}

export function compareRenderOrder<T extends { layerId: string; zIndex: number }>(
  a: T,
  b: T,
  layerRank: Map<string, number>,
  creationIndex: (item: T) => number,
  isStackObject: (item: T) => boolean = () => false,
): number {
  // 站台堆叠：模块轨道、所属站台、连接线这三类"层叠栈"对象按有效层级交错排序，
  // 而不是先按图层边界隔开。否则前置模块的轨道虽在同一图层内盖过其它模块的轨道，
  // 却仍被"站台层永远压住轨道层"的规则盖住（后放站台的站台会压在它上面，错位）。
  // 站台/标签/图标等非栈对象保持"图层优先"，保证备注文字永远在最上层可读。
  if (isStackObject(a) && isStackObject(b)) {
    const stackZDifference = a.zIndex - b.zIndex;
    if (stackZDifference) return stackZDifference;
  }
  const layerDifference = (layerRank.get(a.layerId) ?? Number.MAX_SAFE_INTEGER) - (layerRank.get(b.layerId) ?? Number.MAX_SAFE_INTEGER);
  if (layerDifference) return layerDifference;
  const zDifference = a.zIndex - b.zIndex;
  if (zDifference) return zDifference;
  return creationIndex(a) - creationIndex(b);
}

/**
 * 连接的实际绘制层级。自动模式始终读取两端模块的最新 zIndex，因而无需在模块
 * 调层时逐条回写连接；旧工程未保存模式时也按自动模式处理。
 */
export function effectiveConnectionZIndex(
  connection: Pick<ModuleConnection, "fromModuleId" | "toModuleId" | "zIndex" | "zIndexMode">,
  modules: readonly Pick<DiagramModule, "id" | "zIndex">[],
): number {
  if (connection.zIndexMode === "manual") return connection.zIndex;
  const from = modules.find((module) => module.id === connection.fromModuleId);
  const to = modules.find((module) => module.id === connection.toModuleId);
  if (!from || !to) return connection.zIndex;
  return (from.zIndex + to.zIndex) / 2;
}

/** 所属站台默认紧随模块并略高于模块绘制；独立或手动站台使用保存值。 */
export function effectivePlatformZIndex(
  platform: Pick<PlatformObject, "moduleId" | "zIndex" | "zIndexMode">,
  modules: readonly Pick<DiagramModule, "id" | "zIndex">[],
  ownedPlatformIndex = 0,
): number {
  if (platform.zIndexMode === "manual" || !platform.moduleId) return platform.zIndex;
  const owner = modules.find((module) => module.id === platform.moduleId);
  if (!owner) return platform.zIndex;
  return owner.zIndex + (Math.max(0, ownedPlatformIndex) + 1) / 1000;
}

/** 物化站名标签（附着到模块）跟随所属模块层级，略高于本模块站台，作为整座车站的一部分
 *  一起升降；独立文字（备注等）保留自己的 zIndex，始终按图层浮在可读的最上层。 */
export function effectiveLabelZIndex(
  label: Pick<LabelObject, "attachedToId" | "positionMode" | "zIndex">,
  modules: readonly Pick<DiagramModule, "id" | "zIndex">[],
): number {
  if (label.positionMode === "attached" && label.attachedToId) {
    const owner = modules.find((module) => module.id === label.attachedToId);
    if (owner) return owner.zIndex + 0.01;
  }
  return label.zIndex;
}

/** 模块 zIndex 变化时，把同一增量同步给所属站台。
 *  站台 zIndex 在创建时固化为 mod.zIndex+index，不会自动跟随模块；
 *  不同步的话，"置于顶层/改 Z-Index" 后站台仍停在旧层级，连接线会盖在站台上方。 */
export function shiftOwnedPlatformZIndex(
  platforms: PlatformObject[],
  moduleId: string,
  delta: number,
): PlatformObject[] {
  if (!delta) return platforms;
  return platforms.map((platform) => platform.moduleId === moduleId ? { ...platform, zIndex: platform.zIndex + delta } : platform);
}

/** 模块图层变化时，所属站台跟随（站台创建时按 mod.layerId 归属同层）。 */
export function moveOwnedPlatformLayer(
  platforms: PlatformObject[],
  moduleId: string,
  layerId: string,
): PlatformObject[] {
  return platforms.map((platform) => platform.moduleId === moduleId ? { ...platform, layerId } : platform);
}

export function leafLayerIds(layers: LayerNode[]): string[] {
  const parents = new Set(layers.map((layer) => layer.parentId).filter((id): id is string => id !== null));
  return layers.filter((layer) => !parents.has(layer.id)).map((layer) => layer.id);
}

/** 图层和全部祖先图层的透明度相乘，缺失图层按 1 处理。 */
export function effectiveLayerOpacity(layers: LayerNode[], layerId: string): number {
  let opacity = 1;
  let current = layers.find((layer) => layer.id === layerId);
  while (current) {
    opacity *= current.opacity;
    current = current.parentId ? layers.find((layer) => layer.id === current!.parentId) : undefined;
  }
  return opacity;
}
