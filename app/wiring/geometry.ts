// 配线图编辑器的纯几何/标识工具函数。
// 从 types.ts 拆出（原 674–1035 工具带的一部分）；types.ts 末尾 barrel re-export，
// 因此既有 `from "./types"` 导入零改动。不依赖组件状态。

import { GRID_SIZE, type DiagramModule, type ModuleTemplate, type PortRole, type TemplateTrack, type TrackControlPoint } from "./types";

export function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 吸附到网格 */
export function snapToGrid(value: number, gridSize: number = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Every exposed rail endpoint may connect to another exposed rail endpoint. */
export function portsCompatible(_roleA: PortRole, _roleB: PortRole): boolean {
  return true;
}

/** 将模块局部坐标旋转到世界坐标 */
export function rotatePoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rotation: number,
): { x: number; y: number } {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

/** 获取模块端口在世界坐标中的位置 */
export function worldPortPosition(
  module: DiagramModule,
  template: ModuleTemplate,
  portId: string,
): { x: number; y: number; direction: number } {
  const port = template.ports.find((p) => p.id === portId);
  if (!port) return { x: module.x, y: module.y, direction: 0 };
  const cx = template.width / 2;
  const cy = template.height / 2;
  // 镜像在模块局部坐标中先作用（左右/上下翻转），再旋转到世界坐标。
  let lx = port.x;
  let ly = port.y;
  let dir = port.direction;
  if (module.mirrorX) {
    lx = template.width - lx;
    // 水平翻转（x→−x）：角度 θ → 180°−θ
    dir = (180 - dir + 360) % 360;
  }
  if (module.mirrorY) {
    ly = template.height - ly;
    // 垂直翻转（y→−y）：角度 θ → −θ
    dir = (360 - dir) % 360;
  }
  const rotated = rotatePoint(lx, ly, cx, cy, module.rotation);
  return {
    // DiagramModule.x/y are the template's top-left position.  The SVG module
    // group rotates around the template centre, so the rotated local point is
    // still relative to that top-left origin.
    x: module.x + rotated.x,
    y: module.y + rotated.y,
    direction: (dir + module.rotation) % 360,
  };
}

/**
 * 根据控制点路径重建连接轨道段。
 *
 * 语义化轨道模型的核心：当连接存在控制点时，连接轨道不再是单一直线，
 * 而是由 [from, ...controlPoints, to] 串联的折线/曲线。
 *
 * - 直线段（curved=false）：使用 line 端点。
 * - 曲线段（curved=true）：附带 cx/cy（控制柄绝对坐标），渲染时用 SVG Q 命令。
 *
 * 返回的 TemplateTrack[] 同时被交叉点计算复用（使用直线投影）。
 */
export function rebuildTracksFromControlPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  controlPoints: TrackControlPoint[],
): TemplateTrack[] {
  const pts = [from, ...controlPoints, to];
  const tracks: TemplateTrack[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const track: TemplateTrack = { x1: a.x, y1: a.y, x2: b.x, y2: b.y, type: "main" };
    // 该段由第 i 个控制点起始（controlPoints[i] 对应 pts[i+0]，即段 i 的起点），
    // 若该控制点启用曲率，记录弧线信息供渲染使用。
    if (i < controlPoints.length && controlPoints[i].curved) {
      const cp = controlPoints[i];
      track.curved = true;
      track.cx = cp.x + cp.handleX;
      track.cy = cp.y + cp.handleY;
    }
    tracks.push(track);
  }
  return tracks;
}

/**
 * 生成 SVG path 字符串：从 from 经控制点到 to，使用三次贝塞尔（C 命令）实现平滑曲线。
 *
 * 路径结构：
 *   from ─(L)─► implicit1 ─(C)─► …midCPs… ─(C)─► implicit2 ─(L)─► to
 *
 * - 端口→隐式锚点：直线段（L），确保轨道沿端口方向笔直引出
 * - 锚点→锚点/中间 CP：三次贝塞尔（C），对称手柄保证 C1 平滑
 * - 隐式锚点手柄 = 端口方向 × 投影幅值（指向中间，平行于线路）
 * - 中间 CP 手柄 = 对称手柄，幅度为总距离的 15%（上限 50px）
 * - 非隐式、非曲线 CP（用户添加的折线节点）：直线连接（L）
 */
export function buildControlPointPathD(
  from: { x: number; y: number },
  to: { x: number; y: number },
  controlPoints: TrackControlPoint[],
  fromDir: number,
  toDir: number,
): string {
  if (controlPoints.length === 0) {
    return `M${from.x.toFixed(2)},${from.y.toFixed(2)} L${to.x.toFixed(2)},${to.y.toFixed(2)}`;
  }

  if (controlPoints.some((point) => point.directionOnly)) {
    return buildDirectionOnlyControlPointPathD(from, to, controlPoints, fromDir, toDir);
  }

  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const fromRad = (fromDir * Math.PI) / 180;
  const toRad = (toDir * Math.PI) / 180;
  const endHandleMag = Math.min(dist * 0.15, 30);

  let d = `M${from.x.toFixed(2)},${from.y.toFixed(2)}`;

  // 遍历所有 controlPoints，不跳过隐式锚点
  for (let i = 0; i < controlPoints.length; i++) {
    const cp = controlPoints[i];
    const isFirst = i === 0;
    const isLast = i === controlPoints.length - 1;
    const prev = i > 0 ? controlPoints[i - 1] : null;

    // 决定前一段的起始点（用于计算手柄）
    const segStart = prev || from;

    if (cp.implicit && isFirst) {
      // from → implicit1：直线，沿端口方向引出
      d += ` L${cp.x.toFixed(2)},${cp.y.toFixed(2)}`;
    } else if (cp.implicit && isLast) {
      // prev → implicit2 → to：
      //   prev→implicit2 用 C（若 prev 为曲线），implicit2→to 为直线
      if (prev && prev.curved && (prev.handleX !== 0 || prev.handleY !== 0)) {
        const outHx = prev.handleX;
        const outHy = prev.handleY;
        const inHx = cp.handleX;
        const inHy = cp.handleY;
        d += ` C${(prev.x + outHx).toFixed(2)},${(prev.y + outHy).toFixed(2)} ${(cp.x - inHx).toFixed(2)},${(cp.y - inHy).toFixed(2)} ${cp.x.toFixed(2)},${cp.y.toFixed(2)}`;
      } else {
        d += ` L${cp.x.toFixed(2)},${cp.y.toFixed(2)}`;
      }
      // implicit2 → to：直线
      d += ` L${to.x.toFixed(2)},${to.y.toFixed(2)}`;
    } else if (cp.curved && (cp.handleX !== 0 || cp.handleY !== 0)) {
      // 曲线段：使用三次贝塞尔，对称手柄
      // 出向控制点 = prev + prev.handle（或 from + fromExit）
      // 入向控制点 = cp - cp.handle
      const outHx = prev && prev.curved ? prev.handleX : isFirst ? Math.cos(fromRad) * endHandleMag : 0;
      const outHy = prev && prev.curved ? prev.handleY : isFirst ? Math.sin(fromRad) * endHandleMag : 0;
      d += ` C${(segStart.x + outHx).toFixed(2)},${(segStart.y + outHy).toFixed(2)} ${(cp.x - cp.handleX).toFixed(2)},${(cp.y - cp.handleY).toFixed(2)} ${cp.x.toFixed(2)},${cp.y.toFixed(2)}`;
    } else {
      // 直线段
      d += ` L${cp.x.toFixed(2)},${cp.y.toFixed(2)}`;
    }
  }

  // 如果最后一个 CP 不是隐式锚点，追加到 to 的直线
  const lastCP = controlPoints[controlPoints.length - 1];
  if (!lastCP.implicit) {
    if (lastCP.curved && (lastCP.handleX !== 0 || lastCP.handleY !== 0)) {
      d += ` C${(lastCP.x + lastCP.handleX).toFixed(2)},${(lastCP.y + lastCP.handleY).toFixed(2)} ${(to.x - Math.cos(toRad) * endHandleMag).toFixed(2)},${(to.y - Math.sin(toRad) * endHandleMag).toFixed(2)} ${to.x.toFixed(2)},${to.y.toFixed(2)}`;
    } else {
      d += ` L${to.x.toFixed(2)},${to.y.toFixed(2)}`;
    }
  }

  return d;
}

type PathPoint = { x: number; y: number };

function directionUnit(direction: number): PathPoint {
  const radians = (direction * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function pointDirection(point: TrackControlPoint): PathPoint | null {
  if (point.directionOnly && typeof point.tangentDirection === "number") {
    return directionUnit(point.tangentDirection);
  }
  if (!point.curved) return null;
  const length = Math.hypot(point.handleX, point.handleY);
  return length > 1e-6 ? { x: point.handleX / length, y: point.handleY / length } : null;
}

function derivedHandleLength(
  start: PathPoint,
  end: PathPoint,
  tangent: PathPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return 0;
  const chord = { x: dx / length, y: dy / length };
  // The handle depends only on this local segment. There is intentionally no
  // fixed minimum: near a station it shrinks with the available distance.
  const alignment = Math.max(0, tangent.x * chord.x + tangent.y * chord.y);
  return length * (0.14 + alignment * 0.14);
}

/**
 * The control point of a quadratic quarter turn is the intersection of the
 * two endpoint tangent guides. The editable node itself is stored separately
 * on the curve, so it can be selected and dragged without appearing off-track.
 */
function quadraticTangentIntersection(
  from: PathPoint,
  to: PathPoint,
  fromDir: number,
  toDir: number,
): PathPoint | null {
  const fromTangent = directionUnit(fromDir);
  const toOutward = directionUnit(toDir);
  const determinant = fromTangent.x * toOutward.y - fromTangent.y * toOutward.x;
  if (Math.abs(determinant) < 1e-8) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distanceAlongFrom = (dx * toOutward.y - dy * toOutward.x) / determinant;
  return {
    x: from.x + fromTangent.x * distanceAlongFrom,
    y: from.y + fromTangent.y * distanceAlongFrom,
  };
}

/**
 * Renders direction-constrained knots. Endpoints and these knots carry only
 * a tangent direction; the actual Bezier control lengths are derived locally
 * and never stored in the project.
 */
export function buildDirectionOnlyControlPointPathD(
  from: PathPoint,
  to: PathPoint,
  controlPoints: TrackControlPoint[],
  fromDir: number,
  toDir: number,
): string {
  const quadraticPoint = controlPoints.length === 1 && controlPoints[0].curveKind === "quadratic"
    ? controlPoints[0]
    : undefined;
  if (quadraticPoint) {
    const tangentIntersection = quadraticTangentIntersection(from, to, fromDir, toDir) || quadraticPoint;
    return `M${from.x.toFixed(2)},${from.y.toFixed(2)} Q${tangentIntersection.x.toFixed(2)},${tangentIntersection.y.toFixed(2)} ${to.x.toFixed(2)},${to.y.toFixed(2)}`;
  }

  const points: PathPoint[] = [from, ...controlPoints, to];
  const tangents: Array<PathPoint | null> = [
    directionUnit(fromDir),
    ...controlPoints.map(pointDirection),
    directionUnit((toDir + 180) % 360),
  ];
  let d = `M${from.x.toFixed(2)},${from.y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index];
    const end = points[index + 1];
    const startTangent = tangents[index];
    const endTangent = tangents[index + 1];
    if (!startTangent || !endTangent) {
      d += ` L${end.x.toFixed(2)},${end.y.toFixed(2)}`;
      continue;
    }

    const startLength = derivedHandleLength(start, end, startTangent);
    const incomingDirection = { x: -endTangent.x, y: -endTangent.y };
    const endLength = derivedHandleLength(end, start, incomingDirection);
    d += ` C${(start.x + startTangent.x * startLength).toFixed(2)},${(start.y + startTangent.y * startLength).toFixed(2)} ${(end.x - endTangent.x * endLength).toFixed(2)},${(end.y - endTangent.y * endLength).toFixed(2)} ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
  }

  return d;
}
