// ──────────────────────────────────────────────
// 配线图编辑器 · 标签/图标自动避让
// 站名标签（LabelObject）与站点图标（AttachedGraphic）可能相互遮挡，
// 尤其在换乘站中多个模块共享同一 sourceStationId 时。本模块提供纯函数的
// 碰撞检测与最小位移避让：优先移动优先级低的元素（图标 < 英文站名 < 中文站名），
// 每次只沿重叠最小的轴向推开，避免图标遮挡站名文字。
// ──────────────────────────────────────────────

import type { AttachedGraphic, DiagramModule, LabelObject, PlatformObject } from "./types";

/** 世界坐标轴对齐包围盒 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 参与避让的单个元素（标签、图标或平台） */
interface Glyph {
  kind: "label" | "icon" | "platform";
  id: string;
  /** 锚点（标签）或左上角（图标）的世界坐标 */
  x: number;
  y: number;
  bbox: Box;
  cx: number;
  cy: number;
  /** 3=中文站名 2=英文站名 1=站点图标；数值越大越优先（越不该被移动） */
  priority: number;
  movable: boolean;
  /** 本轮避让前的原始位置，用于限制单次累计位移 */
  anchorX: number;
  anchorY: number;
  ownerModuleId?: string;
  /** Attached objects move along their module's local axes. */
  axisRotation?: number;
}

/** 元素四周保留的最小视觉间隙 */
const AVOID_PADDING = 4;
/** 单个元素相对锚点的最大累计位移 */
const MAX_SHIFT = 64;
/** 迭代解析轮数上限（级联碰撞逐步收敛） */
const MAX_ITERATIONS = 6;

function rotateAround(px: number, py: number, cx: number, cy: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

function aabbFromCorners(corners: Array<{ x: number; y: number }>): Box {
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** 字符宽度估算：空白 0.28em、ASCII 0.56em、CJK 1em（与线路预览的度量一致）。 */
function measureTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) width += fontSize * 0.28;
    else if (/[\x00-\xff]/.test(ch)) width += fontSize * 0.56;
    else width += fontSize;
  }
  return width;
}

/**
 * 站名标签的世界坐标包围盒。
 * 站名标签 anchor 为 "top"（水平居中、底部边缘对齐锚点），渲染组以
 * (x, y) 为原点、按 label.rotation 旋转，所以包围盒在锚点上方。
 */
export function computeLabelBbox(label: LabelObject): Box {
  const localBox = computeLabelLocalBox(label);
  const rotation = label.rotation ?? 0;
  const corners = [
    { x: localBox.x, y: localBox.y },
    { x: localBox.x + localBox.w, y: localBox.y },
    { x: localBox.x + localBox.w, y: localBox.y + localBox.h },
    { x: localBox.x, y: localBox.y + localBox.h },
  ].map((point) => rotateAround(point.x, point.y, 0, 0, rotation));
  const box = aabbFromCorners(corners);
  return { x: box.x + label.x, y: box.y + label.y, w: box.w, h: box.h };
}

/** Estimated unrotated box relative to the label anchor, shared by SVG background rendering. */
export function computeLabelLocalBox(label: LabelObject): Box {
  const width = Math.max(20, measureTextWidth(label.text, label.fontSize));
  const height = label.fontSize * 1.4;
  const anchor = label.anchor && label.anchor in {
    top: true, bottom: true, left: true, right: true,
    top_left: true, top_right: true, bottom_left: true, bottom_right: true,
  } ? label.anchor : "top";
  const horizontal = anchor.endsWith("_left") || anchor === "left"
    ? { min: -width, max: 0 }
    : anchor.endsWith("_right") || anchor === "right"
      ? { min: 0, max: width }
      : { min: -width / 2, max: width / 2 };
  const vertical = anchor.startsWith("bottom") || anchor === "bottom"
    ? { min: 0, max: height }
    : anchor === "left" || anchor === "right"
      ? { min: -height / 2, max: height / 2 }
      : { min: -height, max: 0 };
  return { x: horizontal.min, y: vertical.min, w: width, h: height };
}

/** 平台的世界坐标包围盒（渲染组以平台中心为旋转原点）。 */
export function computePlatformBbox(platform: PlatformObject): Box {
  const cx = platform.width / 2;
  const cy = platform.height / 2;
  const rotation = platform.rotation ?? 0;
  const corners = [
    { x: 0, y: 0 },
    { x: platform.width, y: 0 },
    { x: platform.width, y: platform.height },
    { x: 0, y: platform.height },
  ].map((point) => rotateAround(point.x, point.y, cx, cy, rotation));
  const box = aabbFromCorners(corners);
  return { x: box.x + platform.x, y: box.y + platform.y, w: box.w, h: box.h };
}

/** 图标的世界坐标包围盒（渲染组以图标中心为旋转原点）。 */
export function computeGraphicBbox(graphic: AttachedGraphic): Box {
  const cx = graphic.width / 2;
  const cy = graphic.height / 2;
  const rotation = graphic.rotation ?? 0;
  const corners = [
    { x: 0, y: 0 },
    { x: graphic.width, y: 0 },
    { x: graphic.width, y: graphic.height },
    { x: 0, y: graphic.height },
  ].map((point) => rotateAround(point.x, point.y, cx, cy, rotation));
  const box = aabbFromCorners(corners);
  return { x: box.x + graphic.x, y: box.y + graphic.y, w: box.w, h: box.h };
}

/** 两个包围盒是否重叠（保留 padding 间隙）。 */
export function bboxesOverlap(a: Box, b: Box, padding = AVOID_PADDING): boolean {
  return !(a.x + a.w + padding <= b.x || b.x + b.w + padding <= a.x || a.y + a.h + padding <= b.y || b.y + b.h + padding <= a.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function moveGlyph(glyph: Glyph, dx: number, dy: number): boolean {
  if (!dx && !dy) return false;
  const nextX = clamp(glyph.x + dx, glyph.anchorX - MAX_SHIFT, glyph.anchorX + MAX_SHIFT);
  const nextY = clamp(glyph.y + dy, glyph.anchorY - MAX_SHIFT, glyph.anchorY + MAX_SHIFT);
  const movedX = nextX - glyph.x;
  const movedY = nextY - glyph.y;
  if (!movedX && !movedY) return false;
  glyph.x = nextX;
  glyph.y = nextY;
  glyph.bbox = { x: glyph.bbox.x + movedX, y: glyph.bbox.y + movedY, w: glyph.bbox.w, h: glyph.bbox.h };
  glyph.cx += movedX;
  glyph.cy += movedY;
  return true;
}

/** 沿 X 轴把 mover 从 stayer 身上完整推开（边缘到边缘 + 间隙）。 */
function pushAlongX(mover: Glyph, stayer: Glyph): { dx: number; dy: number } {
  const a = mover.bbox;
  const b = stayer.bbox;
  const dx = mover.cx <= stayer.cx
    ? b.x - (a.x + a.w) - AVOID_PADDING
    : b.x + b.w + AVOID_PADDING - a.x;
  return { dx, dy: 0 };
}

/** 沿 Y 轴把 mover 从 stayer 身上完整推开（边缘到边缘 + 间隙）。 */
function pushAlongY(mover: Glyph, stayer: Glyph): { dx: number; dy: number } {
  const a = mover.bbox;
  const b = stayer.bbox;
  const dy = mover.cy <= stayer.cy
    ? b.y - (a.y + a.h) - AVOID_PADDING
    : b.y + b.h + AVOID_PADDING - a.y;
  return { dx: 0, dy };
}

/**
 * 将 mover 从 stayer 身上沿重叠最小的轴向推开，返回位移向量。
 * 位移 = mover 该侧边缘越过 stayer 对侧边缘 + 间隙所需的总距离，
 * 即使 mover 在重叠轴上完全包裹 stayer 也能正确分离。
 */
function separationVector(mover: Glyph, stayer: Glyph): { dx: number; dy: number } {
  const a = mover.bbox;
  const b = stayer.bbox;
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return overlapX < overlapY ? pushAlongX(mover, stayer) : pushAlongY(mover, stayer);
}

/** 与最小重叠轴相对的候选位移（沿重叠更大的轴向做完整分离）。 */
function separationVectorOtherAxis(mover: Glyph, stayer: Glyph): { dx: number; dy: number } {
  const a = mover.bbox;
  const b = stayer.bbox;
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return overlapX < overlapY ? pushAlongY(mover, stayer) : pushAlongX(mover, stayer);
}

function overlapArea(a: Box, b: Box): number {
  const ow = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ow > 0 && oh > 0 ? ow * oh : 0;
}

/**
 * 候选位移引入的新重叠代价：与其它元素（不含 mover/stayer）的重叠面积之和。
 * 位移先按 MAX_SHIFT 限制：若限制范围内仍无法与 stayer 彻底分离，视为不可行（代价无穷大），
 * 避免选中一个看似空旷却因位移上限而无法真正落位的方向。
 */
function candidateCost(glyphs: Glyph[], mover: Glyph, stayer: Glyph, dx: number, dy: number): number {
  const nextX = clamp(mover.x + dx, mover.anchorX - MAX_SHIFT, mover.anchorX + MAX_SHIFT);
  const nextY = clamp(mover.y + dy, mover.anchorY - MAX_SHIFT, mover.anchorY + MAX_SHIFT);
  const candidate = { x: mover.bbox.x + (nextX - mover.x), y: mover.bbox.y + (nextY - mover.y), w: mover.bbox.w, h: mover.bbox.h };
  if (bboxesOverlap(candidate, stayer.bbox, 0)) return Infinity;
  let cost = 0;
  for (const other of glyphs) {
    if (other === mover || other === stayer) continue;
    cost += overlapArea(candidate, other.bbox);
  }
  return cost;
}

/**
 * 将 mover 推开并选择代价最小的方向。候选为沿 X/Y 轴各两个方向的完整边缘分离：
 * - 优先重叠最小的轴，且同轴内优先"沿中心方向"的常规解（保持既有行为）；
 * - 当常规方向会把 mover 推进其它元素（如被夹在高优先级标签与不可移动平台之间反复弹跳）
 *   或超出 MAX_SHIFT 时，自动选择其它方向"转角逃生"，保证总能收敛。
 */
function moveMoverAway(glyphs: Glyph[], mover: Glyph, stayer: Glyph): boolean {
  if (mover.axisRotation && Math.abs(mover.axisRotation % 90) > 0.01) {
    const radians = mover.axisRotation * Math.PI / 180;
    const axes = [
      { x: Math.cos(radians), y: Math.sin(radians) },
      { x: -Math.sin(radians), y: Math.cos(radians) },
    ];
    const candidates: Array<{ dx: number; dy: number }> = [];
    for (const axis of axes) {
      for (const sign of [-1, 1]) {
        for (let distance = 1; distance <= MAX_SHIFT * Math.SQRT2; distance += 1) {
          const dx = axis.x * distance * sign;
          const dy = axis.y * distance * sign;
          const candidate = { x: mover.bbox.x + dx, y: mover.bbox.y + dy, w: mover.bbox.w, h: mover.bbox.h };
          if (!bboxesOverlap(candidate, stayer.bbox, 0)) {
            candidates.push({ dx, dy });
            break;
          }
        }
      }
    }
    let best: { dx: number; dy: number } | undefined;
    let bestCost = Infinity;
    for (const candidate of candidates) {
      const cost = candidateCost(glyphs, mover, stayer, candidate.dx, candidate.dy)
        + Math.hypot(candidate.dx, candidate.dy) * 0.001;
      if (cost < bestCost) {
        best = candidate;
        bestCost = cost;
      }
    }
    if (best && moveGlyph(mover, best.dx, best.dy)) return true;
  }
  const a = mover.bbox;
  const b = stayer.bbox;
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const left = { dx: b.x - (a.x + a.w) - AVOID_PADDING, dy: 0 };
  const right = { dx: b.x + b.w + AVOID_PADDING - a.x, dy: 0 };
  const up = { dx: 0, dy: b.y - (a.y + a.h) - AVOID_PADDING };
  const down = { dx: 0, dy: b.y + b.h + AVOID_PADDING - a.y };
  const preferX = mover.cx <= stayer.cx ? left : right;
  const preferY = mover.cy <= stayer.cy ? up : down;
  const otherX = preferX === left ? right : left;
  const otherY = preferY === up ? down : up;
  const candidates = overlapX < overlapY
    ? [preferX, preferY, otherY, otherX]
    : [preferY, preferX, otherX, otherY];
  let best = 0;
  let bestCost = Infinity;
  for (let k = 0; k < candidates.length; k++) {
    const cost = candidateCost(glyphs, mover, stayer, candidates[k].dx, candidates[k].dy);
    if (cost < bestCost) {
      bestCost = cost;
      best = k;
    }
  }
  if (moveGlyph(mover, candidates[best].dx, candidates[best].dy)) return true;
  // 首选方向被 MAX_SHIFT 限制而无法执行时，依次尝试其余方向，避免卡死在原处。
  for (let k = 0; k < candidates.length; k++) {
    if (k !== best && moveGlyph(mover, candidates[k].dx, candidates[k].dy)) return true;
  }
  return false;
}

/** 解析一对重叠元素：低优先级移动；同优先级双方各推一半。返回是否发生了位移。 */
function resolvePair(glyphs: Glyph[], i: number, j: number): boolean {
  const a = glyphs[i];
  const b = glyphs[j];
  // 碰撞判定只看真实重叠（padding 0），相邻但未重叠的元素（如默认的 zh/en 站名）
  // 不会被误判；分离时才补足 AVOID_PADDING 的视觉间隙。
  if (!bboxesOverlap(a.bbox, b.bbox, 0)) return false;
  if (a.movable && b.movable && a.priority === b.priority) {
    const vector = separationVector(a, b);
    const movedA = moveGlyph(a, vector.dx / 2, vector.dy / 2);
    const movedB = moveGlyph(b, -vector.dx / 2, -vector.dy / 2);
    return movedA || movedB;
  }
  const mover = !a.movable ? (b.movable ? b : null) : !b.movable ? a : a.priority <= b.priority ? a : b;
  if (!mover) return false;
  const stayer = mover === a ? b : a;
  return moveMoverAway(glyphs, mover, stayer);
}

export interface AvoidancePatch {
  id: string;
  kind: "label" | "icon";
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
}

export interface AvoidanceResult {
  labels: LabelObject[];
  graphics: AttachedGraphic[];
  patches: AvoidancePatch[];
  changed: boolean;
}

/**
 * 自动避让：解析站名标签、站点图标与站台之间的重叠。
 *
 * 参与避让的元素：
 * - 站名标签（带 sourceStationId）与已挂接的站点图标；
 * - 附着的标签/图标按优先级（图标 1 < 英文站名 2 < 中文站名 3）被移动；
 * - 平台是固定障碍物，只推开压在上面的标签/图标、自己不动（解决"站点遮挡文字"）；
 * - 锁定的附着元素、独立（用户解耦）的站名标签是不可移动的障碍物，只推开别人、自己不动；
 * - 装饰性标签、独立图标不参与避让。
 *
 * 传入/返回完整的 labels、graphics 数组（会保留非候选元素），避免调用方丢失数据。
 */
export function resolveLabelIconOverlaps(params: {
  modules: DiagramModule[];
  labels: LabelObject[];
  graphics: AttachedGraphic[];
  platforms?: PlatformObject[];
  activePageId?: string;
  ignoredLabelIds?: Iterable<string>;
}): AvoidanceResult {
  const { modules, labels, graphics, platforms = [], activePageId } = params;
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const ignoredLabelIds = new Set(params.ignoredLabelIds || []);

  const glyphs: Glyph[] = [];
  const onPage = (pageId?: string) => !activePageId || (pageId || "page-1") === activePageId;

  // 标签：只处理站名标签（带 sourceStationId）。
  // - 附着的可被移动（优先级 中文 3 > 英文 2）
  // - 锁定的附着标签、用户解耦成独立模式的标签 → 不可移动的障碍物（推动别人，自己不动）
  for (const label of labels) {
    if (ignoredLabelIds.has(label.id)) continue;
    if (!onPage(label.pageId)) continue;
    if (label.visible === false) continue;
    // Attached template labels without a source station (for example a
    // manually placed component showing the default "站名" placeholder) are
    // still real drawable text and must participate in avoidance.
    if (!label.sourceStationId && !label.attachedToId) continue;
    const mode = label.positionMode ?? (label.attachedToId ? "attached" : "independent");
    const hasOwner = !!label.attachedToId && moduleById.has(label.attachedToId);
    const movable = mode === "attached" && !label.locked && hasOwner;
    const bbox = computeLabelBbox(label);
    glyphs.push({
      kind: "label",
      id: label.id,
      x: label.x,
      y: label.y,
      bbox,
      cx: bbox.x + bbox.w / 2,
      cy: bbox.y + bbox.h / 2,
      priority: label.language === "en" ? 2 : 3,
      movable,
      anchorX: label.x,
      anchorY: label.y,
      ownerModuleId: movable ? label.attachedToId : undefined,
      axisRotation: hasOwner ? moduleById.get(label.attachedToId!)?.rotation : undefined,
    });
  }

  // 图标：只处理附着的站点图标；锁定的作为不可移动障碍物。
  for (const graphic of graphics) {
    if (!onPage(graphic.pageId)) continue;
    if (graphic.visible === false) continue;
    const mode = graphic.positionMode ?? (graphic.attachedToId ? "attached" : "independent");
    if (mode !== "attached" || !graphic.attachedToId) continue;
    const movable = !graphic.locked && moduleById.has(graphic.attachedToId);
    const bbox = computeGraphicBbox(graphic);
    glyphs.push({
      kind: "icon",
      id: graphic.id,
      x: graphic.x,
      y: graphic.y,
      bbox,
      cx: bbox.x + bbox.w / 2,
      cy: bbox.y + bbox.h / 2,
      priority: 1,
      movable,
      anchorX: graphic.x,
      anchorY: graphic.y,
      ownerModuleId: movable ? graphic.attachedToId : undefined,
      axisRotation: moduleById.get(graphic.attachedToId)?.rotation,
    });
  }

  // 平台：作为不可移动的障碍物，只推开压在上面的标签/图标、自己不动。
  // 解决"站点遮挡文字"（站名/图标压在站台上）以及换乘站里标签压到相邻模块站台的问题。
  for (const platform of platforms) {
    if (!onPage(platform.pageId)) continue;
    if (platform.visible === false) continue;
    const bbox = computePlatformBbox(platform);
    glyphs.push({
      kind: "platform",
      id: platform.id,
      x: platform.x,
      y: platform.y,
      bbox,
      cx: bbox.x + bbox.w / 2,
      cy: bbox.y + bbox.h / 2,
      priority: 0,
      movable: false,
      anchorX: platform.x,
      anchorY: platform.y,
    });
  }

  // 迭代解析：每轮解决当前所有重叠，级联碰撞在后续轮次收敛。
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let moved = false;
    for (let i = 0; i < glyphs.length; i++) {
      for (let j = i + 1; j < glyphs.length; j++) {
        if (resolvePair(glyphs, i, j)) moved = true;
      }
    }
    if (!moved) break;
  }

  // 生成补丁：只记录确实发生位移的元素，并重算相对模块的 offset。
  const patches: AvoidancePatch[] = [];
  for (const glyph of glyphs) {
    if (Math.hypot(glyph.x - glyph.anchorX, glyph.y - glyph.anchorY) < 0.01) continue;
    if (glyph.kind === "platform") continue; // 平台是障碍物，从不产生位移补丁
    const owner = glyph.ownerModuleId ? moduleById.get(glyph.ownerModuleId) : undefined;
    if (!owner) continue;
    patches.push({
      id: glyph.id,
      kind: glyph.kind,
      x: glyph.x,
      y: glyph.y,
      offsetX: glyph.x - owner.x,
      offsetY: glyph.y - owner.y,
    });
  }

  if (!patches.length) return { labels, graphics, patches, changed: false };
  const patchById = new Map(patches.map((patch) => [patch.id, patch]));
  return {
    labels: labels.map((label) => {
      const patch = patchById.get(label.id);
      return patch ? { ...label, x: patch.x, y: patch.y, offsetX: patch.offsetX, offsetY: patch.offsetY } : label;
    }),
    graphics: graphics.map((graphic) => {
      const patch = patchById.get(graphic.id);
      return patch ? { ...graphic, x: patch.x, y: patch.y, offsetX: patch.offsetX, offsetY: patch.offsetY } : graphic;
    }),
    patches,
    changed: true,
  };
}
