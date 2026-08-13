import type {
  DiagramModule,
  ModuleConnection,
  ModulePort,
  ModuleTemplate,
  PortRole,
  TrackControlPoint,
  TemplateTrack,
} from "./types";
import { buildControlPointPathD, portsCompatible, rebuildTracksFromControlPoints, worldPortPosition } from "./types";

export interface ConnectionEndpoint {
  moduleId: string;
  portId: string;
  module: DiagramModule;
  template: ModuleTemplate;
  port: ModulePort;
}

export type ConnectionValidation =
  | { valid: true }
  | { valid: false; reason: "same-port" | "same-module" | "missing-port" | "role" | "direction" | "duplicate" | "occupied" };

export function getConnectionEndpoint(
  moduleId: string,
  portId: string,
  modules: DiagramModule[],
  templates: Map<string, ModuleTemplate>,
): ConnectionEndpoint | null {
  const diagramModule = modules.find((candidate) => candidate.id === moduleId);
  if (!diagramModule) return null;
  const template = templates.get(moduleId) || templates.get(diagramModule.templateId);
  const port = template?.ports.find((candidate) => candidate.id === portId);
  return template && port ? { moduleId, portId, module: diagramModule, template, port } : null;
}

export function endpointsFaceEachOther(from: ConnectionEndpoint, to: ConnectionEndpoint): boolean {
  const fromDirection = worldPortPosition(from.module, from.template, from.portId).direction;
  const toDirection = worldPortPosition(to.module, to.template, to.portId).direction;
  return ((fromDirection - toDirection + 360) % 360) === 180;
}

/** 端口角色兼容性：同角色精确匹配，或同类角色（up_main↔down_main, yard↔branch）兼容。 */
export function connectionRolesCompatible(from: PortRole, to: PortRole): boolean {
  return portsCompatible(from, to);
}

export function connectionExists(
  connections: ModuleConnection[],
  fromModuleId: string,
  fromPortId: string,
  toModuleId: string,
  toPortId: string,
): boolean {
  return connections.some((connection) =>
    (connection.fromModuleId === fromModuleId && connection.fromPortId === fromPortId && connection.toModuleId === toModuleId && connection.toPortId === toPortId)
    || (connection.fromModuleId === toModuleId && connection.fromPortId === toPortId && connection.toModuleId === fromModuleId && connection.toPortId === fromPortId),
  );
}

export function portIsOccupied(connections: ModuleConnection[], moduleId: string, portId: string): boolean {
  return connections.some((connection) =>
    (connection.fromModuleId === moduleId && connection.fromPortId === portId)
    || (connection.toModuleId === moduleId && connection.toPortId === portId),
  );
}

export function validateConnection(
  from: ConnectionEndpoint | null,
  to: ConnectionEndpoint | null,
  connections: ModuleConnection[],
): ConnectionValidation {
  if (!from || !to) return { valid: false, reason: "missing-port" };
  if (from.moduleId === to.moduleId && from.portId === to.portId) return { valid: false, reason: "same-port" };
  if (from.moduleId === to.moduleId) return { valid: false, reason: "same-module" };
  if (!connectionRolesCompatible(from.port.role, to.port.role)) return { valid: false, reason: "role" };
  // The curve solver uses both outward port normals as endpoint tangents, so
  // compatible ports may be connected at any relative orientation.
  if (connectionExists(connections, from.moduleId, from.portId, to.moduleId, to.portId)) return { valid: false, reason: "duplicate" };
  if (portIsOccupied(connections, from.moduleId, from.portId) || portIsOccupied(connections, to.moduleId, to.portId)) return { valid: false, reason: "occupied" };
  return { valid: true };
}

function pairedMainRole(role: PortRole): PortRole | null {
  if (role === "up_main") return "down_main";
  if (role === "down_main") return "up_main";
  return null;
}

function portLaneKey(portId: string): string {
  const match = portId.match(/(?:up|dn)(\d*)$/);
  return match?.[1] || "";
}

/** Finds the other half of a standard up/down pair on the same module side. */
export function findDoubleTrackPartner(template: ModuleTemplate, port: ModulePort): ModulePort | null {
  const wantedRole = pairedMainRole(port.role);
  if (!wantedRole) return null;
  const laneKey = portLaneKey(port.id);
  const candidates = template.ports.filter((candidate) => candidate.side === port.side && candidate.role === wantedRole);
  return candidates.find((candidate) => portLaneKey(candidate.id) === laneKey) || candidates[0] || null;
}

export interface ConnectionGeometry {
  from: { x: number; y: number };
  to: { x: number; y: number };
  fromDir: number;
  toDir: number;
  controlPoints: TrackControlPoint[];
  tracks: TemplateTrack[];
}

interface ControlPointIds {
  from?: string;
  middle?: string;
  to?: string;
}

function unitVector(direction: number): { x: number; y: number } {
  const radians = (direction * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function normalizeVector(vector: { x: number; y: number }, fallback: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(vector.x, vector.y);
  return length > 1e-6 ? { x: vector.x / length, y: vector.y / length } : fallback;
}

function directionOf(vector: { x: number; y: number }): number {
  return (Math.atan2(vector.y, vector.x) * 180) / Math.PI;
}

/** Returns the forward intersection of two rays, when one exists. */
function forwardRayIntersection(
  originA: { x: number; y: number },
  directionA: { x: number; y: number },
  originB: { x: number; y: number },
  directionB: { x: number; y: number },
): { point: { x: number; y: number }; distanceA: number; distanceB: number } | null {
  const determinant = directionA.x * directionB.y - directionA.y * directionB.x;
  if (Math.abs(determinant) < 1e-6) return null;
  const dx = originB.x - originA.x;
  const dy = originB.y - originA.y;
  const distanceA = (dx * directionB.y - dy * directionB.x) / determinant;
  const distanceB = (dx * directionA.y - dy * directionA.x) / determinant;
  if (distanceA <= 1e-3 || distanceB <= 1e-3) return null;
  return {
    point: { x: originA.x + directionA.x * distanceA, y: originA.y + directionA.y * distanceA },
    distanceA,
    distanceB,
  };
}

/**
 * Creates an automatic direction-only knot. The station ports are the actual
 * endpoints; no fixed-length endpoint anchors are inserted. Handle lengths are
 * derived from each local segment during path construction.
 */
export function createAutoControlPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromDir: number,
  toDir: number,
  ids: ControlPointIds = {},
): TrackControlPoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-3) return [];

  const fromTangent = unitVector(fromDir);
  // A path arrives at the target in the direction opposite its outward port normal.
  const toTangent = { x: -unitVector(toDir).x, y: -unitVector(toDir).y };
  const chord = { x: dx / distance, y: dy / distance };
  const tangentAlignment = fromTangent.x * toTangent.x + fromTangent.y * toTangent.y;
  const isStraight =
    fromTangent.x * chord.x + fromTangent.y * chord.y > 0.995
    && toTangent.x * chord.x + toTangent.y * chord.y > 0.995;
  if (isStraight) return [];

  const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };

  // Parallel endpoint directions with a lateral offset use one editable
  // centre knot. Its tangent follows the chord, giving the expected cubic
  // transition while keeping the automatic result directly editable.
  const lateralAxis = { x: -fromTangent.y, y: fromTangent.x };
  const forwardDistance = dx * fromTangent.x + dy * fromTangent.y;
  const lateralOffset = dx * lateralAxis.x + dy * lateralAxis.y;
  if (tangentAlignment > 0.985 && forwardDistance > 1e-3 && Math.abs(lateralOffset) > Math.max(2, distance * 0.015)) {
    const tangentDirection = directionOf(chord);
    return [{
      id: ids.middle || "middle",
      x: midpoint.x,
      y: midpoint.y,
      curved: true,
      handleX: chord.x * 18,
      handleY: chord.y * 18,
      directionOnly: true,
      tangentDirection,
    }];
  }

  const corner = forwardRayIntersection(from, fromTangent, to, unitVector(toDir));
  const useCorner = corner && corner.distanceA <= distance * 2.5 && corner.distanceB <= distance * 2.5;
  const turn = fromTangent.x * toTangent.y - fromTangent.y * toTangent.x;
  const perpendicular = { x: -chord.y, y: chord.x };
  const fallbackOffset = Math.abs(turn) > 1e-3 ? Math.sign(turn) * Math.min(distance * 0.1, 32) : 0;
  // Any non-parallel station orientation with a nearby forward tangent-guide
  // intersection has one unambiguous turn. This includes modules rotated by
  // 45-degree increments, not only a perpendicular 90-degree arrangement.
  // Using the intersection as one quadratic Bezier control keeps both endpoint
  // tangents exact and avoids the S-shaped fallback previously seen at 45°,
  // 135° and their mirrored rotations. Parallel orientations stay on the cubic
  // direction-only solver because they may need a genuine lateral S curve.
  const useQuadraticTurn = useCorner && Math.abs(turn) > 1e-3;
  const middlePosition = useQuadraticTurn
    // Keep the selectable node on the curve. The quadratic tangent-guide
    // intersection is reconstructed while rendering, rather than displayed
    // as an off-track control node.
    ? {
      x: (from.x + 2 * corner.point.x + to.x) / 4,
      y: (from.y + 2 * corner.point.y + to.y) / 4,
    }
    : { x: midpoint.x + perpendicular.x * fallbackOffset, y: midpoint.y + perpendicular.y * fallbackOffset };
  const middleTangent = normalizeVector(
    { x: fromTangent.x + toTangent.x, y: fromTangent.y + toTangent.y },
    chord,
  );
  const displayHandleLength = 18;
  const middle: TrackControlPoint = {
    id: ids.middle || "middle",
    x: middlePosition.x,
    y: middlePosition.y,
    curved: true,
    handleX: middleTangent.x * displayHandleLength,
    handleY: middleTangent.y * displayHandleLength,
    directionOnly: true,
    tangentDirection: directionOf(middleTangent),
    curveKind: useQuadraticTurn ? "quadratic" : undefined,
  };
  return [middle];
}

/** Converts legacy manual handles into direction-only knots for the shared curve solver. */
function normalizeManualCurvePoints(points: TrackControlPoint[], to: { x: number; y: number }): TrackControlPoint[] {
  return points.map((point, index) => {
    if (!point.curved || point.directionOnly) return point;
    const next = points[index + 1] || to;
    const source = Math.hypot(point.handleX, point.handleY) > 1e-6
      ? { x: point.handleX, y: point.handleY }
      : { x: next.x - point.x, y: next.y - point.y };
    const direction = normalizeVector(source, { x: 1, y: 0 });
    return {
      ...point,
      handleX: direction.x * 18,
      handleY: direction.y * 18,
      directionOnly: true,
      tangentDirection: directionOf(direction),
    };
  });
}

/** Port endpoints and exit directions of one rail of a double-track pair. */
export interface PairedCurveEndpoints {
  from: { x: number; y: number };
  to: { x: number; y: number };
  fromDir: number;
  toDir: number;
}

type PathSample = { x: number; y: number; tangentX: number; tangentY: number };

function samplePathForOffset(pathD: string, stepsPerCurve = 24): PathSample[] {
  const commands = pathD.match(/[MLCQ][^MLCQ]*/g) || [];
  const samples: PathSample[] = [];
  let current: { x: number; y: number } | null = null;
  for (const command of commands) {
    const values = (command.slice(1).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (command[0] === "M") {
      current = { x: values[0], y: values[1] };
      continue;
    }
    if (!current) continue;
    if (command[0] === "L") {
      const end = { x: values[0], y: values[1] };
      samples.push({ x: current.x, y: current.y, tangentX: end.x - current.x, tangentY: end.y - current.y });
      samples.push({ x: end.x, y: end.y, tangentX: end.x - current.x, tangentY: end.y - current.y });
      current = end;
      continue;
    }
    if (command[0] === "Q") {
      const [x1, y1, x2, y2] = values;
      const start = current;
      for (let index = 0; index <= stepsPerCurve; index++) {
        if (samples.length && index === 0) continue;
        const t = index / stepsPerCurve;
        const mt = 1 - t;
        const x = mt * mt * start.x + 2 * mt * t * x1 + t * t * x2;
        const y = mt * mt * start.y + 2 * mt * t * y1 + t * t * y2;
        const tangentX = 2 * mt * (x1 - start.x) + 2 * t * (x2 - x1);
        const tangentY = 2 * mt * (y1 - start.y) + 2 * t * (y2 - y1);
        samples.push({ x, y, tangentX, tangentY });
      }
      current = { x: x2, y: y2 };
      continue;
    }
    if (command[0] === "C") {
      const [x1, y1, x2, y2, x3, y3] = values;
      const start = current;
      for (let index = 0; index <= stepsPerCurve; index++) {
        if (samples.length && index === 0) continue;
        const t = index / stepsPerCurve;
        const mt = 1 - t;
        const x = mt * mt * mt * start.x + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
        const y = mt * mt * mt * start.y + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
        const tangentX = 3 * mt * mt * (x1 - start.x) + 6 * mt * t * (x2 - x1) + 3 * t * t * (x3 - x2);
        const tangentY = 3 * mt * mt * (y1 - start.y) + 6 * mt * t * (y2 - y1) + 3 * t * t * (y3 - y2);
        samples.push({ x, y, tangentX, tangentY });
      }
      current = { x: x3, y: y3 };
    }
  }
  return samples;
}

/**
 * True when two rendered path strings genuinely cross. Sampling follows the same
 * [MLCQ] walk as {@link samplePathForOffset}; a tangential touch (an endpoint
 * resting on the other path) is NOT counted, so parallel rails meeting end-to-end
 * or a curve passing exactly beside another do not trigger.
 */
export function pathsCross(pathA: string, pathB: string, stepsPerCurve = 40): boolean {
  const p1 = samplePathForOffset(pathA, stepsPerCurve);
  const p2 = samplePathForOffset(pathB, stepsPerCurve);
  const orient = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSeg = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  for (let i = 0; i < p1.length - 1; i++) {
    for (let j = 0; j < p2.length - 1; j++) {
      const a = p1[i];
      const b = p1[i + 1];
      const c = p2[j];
      const d = p2[j + 1];
      const o1 = orient(a, b, c);
      const o2 = orient(a, b, d);
      const o3 = orient(c, d, a);
      const o4 = orient(c, d, b);
      const touch = (o1 === 0 && onSeg(a, c, b)) || (o2 === 0 && onSeg(a, d, b)) || (o3 === 0 && onSeg(c, a, d)) || (o4 === 0 && onSeg(c, b, d));
      if (touch) continue;
      if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;
    }
  }
  // A crossing that lands exactly on a sample vertex of BOTH curves is missed by
  // the segment pass above (every surrounding segment pair looks like a touch).
  // Symmetric layouts cross at the shared midpoint t=0.5, which is exactly such a
  // vertex. Count it when the shared vertex is interior to both curves and their
  // tangents differ (a real X/+ crossing); an endpoint rest or a tangential
  // graze has parallel tangents and stays a non-crossing.
  for (let i = 1; i < p1.length - 1; i++) {
    for (let j = 1; j < p2.length - 1; j++) {
      if (p1[i].x !== p2[j].x || p1[i].y !== p2[j].y) continue;
      const cross = p1[i].tangentX * p2[j].tangentY - p1[i].tangentY * p2[j].tangentX;
      if (Math.abs(cross) > 1e-6) return true;
    }
  }
  return false;
}

/**
 * Samples a single clean cubic Bezier centreline between the two endpoints,
 * honouring both port tangents. A single cubic with monotonic tangent rotation
 * has no inflection, so a perpendicular offset never folds a rail back over the
 * centerline. A straight connection collapses to a straight segment.
 */
function sampleCleanCenterline(
  centerFrom: { x: number; y: number },
  centerTo: { x: number; y: number },
  fromDir: number,
  toDir: number,
): PathSample[] {
  const dx = centerTo.x - centerFrom.x;
  const dy = centerTo.y - centerFrom.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-3) return [];
  const fromTangent = unitVector(fromDir);
  const arrive = { x: -unitVector(toDir).x, y: -unitVector(toDir).y };
  const chord = { x: dx / distance, y: dy / distance };
  const isStraight =
    fromTangent.x * chord.x + fromTangent.y * chord.y > 0.995
    && arrive.x * chord.x + arrive.y * chord.y > 0.995;
  if (isStraight) {
    return [
      { x: centerFrom.x, y: centerFrom.y, tangentX: dx, tangentY: dy },
      { x: centerTo.x, y: centerTo.y, tangentX: dx, tangentY: dy },
    ];
  }
  // Handle length scales with the chord but is capped so very short runs keep a
  // gentle bend and very long runs never overshoot past the far port. The floor
  // is kept small so a near-coincident port pair (a few px apart) does not blow
  // the curve up into a loop many times longer than the chord itself.
  const handle = Math.max(3, Math.min(distance * 0.4, distance * 0.6));
  const p1 = { x: centerFrom.x + fromTangent.x * handle, y: centerFrom.y + fromTangent.y * handle };
  const p2 = { x: centerTo.x - arrive.x * handle, y: centerTo.y - arrive.y * handle };
  const steps = 48;
  const samples: PathSample[] = [];
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const mt = 1 - t;
    samples.push({
      x: mt * mt * mt * centerFrom.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * centerTo.x,
      y: mt * mt * mt * centerFrom.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * centerTo.y,
      tangentX: 3 * mt * mt * (p1.x - centerFrom.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t * t * (centerTo.x - p2.x),
      tangentY: 3 * mt * mt * (p1.y - centerFrom.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t * t * (centerTo.y - p2.y),
    });
  }
  return samples;
}

/**
 * Builds one rail of an automatic double track by offsetting a shared centre
 * curve. This keeps the track separation stable when the port offset rotates,
 * such as between a vertical station and a horizontal station.
 *
 * The two rails are mirrored through the centreline: the partner rail is the
 * negated offset of this one, so the gap between them is constant at every
 * point. The offset follows the centreline's local perpendicular, which gives
 * true parallel rails on the clean single-cubic centreline.
 *
 * When the port offset reverses side between the two ends (one rail connects to
 * the partner's upper port on one module and lower on the other), the rails
 * genuinely cross and cannot stay on opposite sides of a shared centreline. In
 * that case each rail is rendered as its own clean curve, so the pair braids
 * through exactly one crossover instead of folding back over the centreline.
 */
export function buildPairedOffsetPathD(
  thisRail: PairedCurveEndpoints,
  pairedRail: PairedCurveEndpoints,
): string | null {
  const offsetFrom = { x: pairedRail.from.x - thisRail.from.x, y: pairedRail.from.y - thisRail.from.y };
  const offsetTo = { x: pairedRail.to.x - thisRail.to.x, y: pairedRail.to.y - thisRail.to.y };
  const spacingFrom = Math.hypot(offsetFrom.x, offsetFrom.y);
  const spacingTo = Math.hypot(offsetTo.x, offsetTo.y);
  if (spacingFrom < 1e-6 || spacingTo < 1e-6) return null;

  // The shared-centreline offsetting requires the port offset to stay roughly
  // parallel between the two ends. When it rotates substantially — a genuine
  // swap (offsets point opposite, so the rail's side flips between modules) or
  // a perpendicular corner (offsets rotate ~90°, as between a vertical station
  // and a horizontal one) — the fixed branch sign puts the far end on the wrong
  // side of the centreline and folds the rail back across its partner. Render
  // each rail independently so the pair braids through clean curves instead.
  const offsetCosine = (offsetFrom.x * offsetTo.x + offsetFrom.y * offsetTo.y) / (spacingFrom * spacingTo);
  const rotated = offsetCosine < 0.7;
  if (rotated) {
    const samples = sampleCleanCenterline(thisRail.from, thisRail.to, thisRail.fromDir, thisRail.toDir);
    if (samples.length < 2) return null;
    return samples.reduce(
      (path, point, index) => `${path}${index === 0 ? "M" : " L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
      "",
    );
  }

  const centerFrom = { x: (thisRail.from.x + pairedRail.from.x) / 2, y: (thisRail.from.y + pairedRail.from.y) / 2 };
  const centerTo = { x: (thisRail.to.x + pairedRail.to.x) / 2, y: (thisRail.to.y + pairedRail.to.y) / 2 };
  const centerSamples = sampleCleanCenterline(centerFrom, centerTo, thisRail.fromDir, thisRail.toDir);
  if (centerSamples.length < 2) return null;

  // Even with a parallel port offset, when both ports face away from the chord
  // the centreline must double back, rotating its perpendicular through ~180°.
  // The fixed ±half-spacing branch then flips side and folds one rail back
  // across the other. Render each rail as its own clean curve in that case.
  const centerChordX = centerTo.x - centerFrom.x;
  const centerChordY = centerTo.y - centerFrom.y;
  const centerChordLen = Math.hypot(centerChordX, centerChordY);
  const fromTangentU = unitVector(thisRail.fromDir);
  const arriveU = { x: -unitVector(thisRail.toDir).x, y: -unitVector(thisRail.toDir).y };
  const hairpin = centerChordLen > 1e-3
    && (fromTangentU.x * centerChordX + fromTangentU.y * centerChordY) / centerChordLen < 0
    && (arriveU.x * centerChordX + arriveU.y * centerChordY) / centerChordLen < 0;
  if (hairpin) {
    const independent = sampleCleanCenterline(thisRail.from, thisRail.to, thisRail.fromDir, thisRail.toDir);
    if (independent.length < 2) return null;
    return independent.reduce(
      (path, point, index) => `${path}${index === 0 ? "M" : " L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
      "",
    );
  }

  const offsetStart = { x: thisRail.from.x - centerFrom.x, y: thisRail.from.y - centerFrom.y };
  // Choose the perpendicular branch ONCE from the from-port side, then follow it
  // for the whole curve. A per-sample reference flip would switch branch at the
  // point where the normal sits perpendicular to the reference, putting the end
  // of the rail on the wrong side of the centreline and folding it across the
  // partner. A single global sign keeps one continuous branch, so the offset
  // lands on the correct side at the to-port as well.
  const firstTangentLength = Math.hypot(centerSamples[0].tangentX, centerSamples[0].tangentY) || 1;
  const firstNormalX = -centerSamples[0].tangentY / firstTangentLength;
  const firstNormalY = centerSamples[0].tangentX / firstTangentLength;
  const branchSign = firstNormalX * offsetStart.x + firstNormalY * offsetStart.y < 0 ? -1 : 1;

  const halfSpacingFrom = spacingFrom / 2;
  const halfSpacingTo = spacingTo / 2;
  const pathPoints = centerSamples.map((sample, index) => {
    const progress = centerSamples.length <= 1 ? 0 : index / (centerSamples.length - 1);
    const halfSpacing = halfSpacingFrom + (halfSpacingTo - halfSpacingFrom) * progress;
    const tangentLength = Math.hypot(sample.tangentX, sample.tangentY) || 1;
    const normalX = branchSign * (-sample.tangentY / tangentLength);
    const normalY = branchSign * (sample.tangentX / tangentLength);
    return { x: sample.x + normalX * halfSpacing, y: sample.y + normalY * halfSpacing };
  });
  pathPoints[0] = thisRail.from;
  pathPoints[pathPoints.length - 1] = thisRail.to;
  return pathPoints.reduce(
    (path, point, index) => `${path}${index === 0 ? "M" : " L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
    "",
  );
}

/** Places the visible automatic node on the actual offset rail, not its centreline. */
function placePairedAutoControlPointsOnTrack(
  points: TrackControlPoint[],
  thisRail: PairedCurveEndpoints,
  pairedRail: PairedCurveEndpoints,
): TrackControlPoint[] {
  if (points.length !== 1) return points;
  const path = buildPairedOffsetPathD(thisRail, pairedRail);
  if (!path) return points;
  const samples = samplePathForOffset(path);
  const sample = samples[Math.floor(samples.length / 2)];
  if (!sample) return points;
  const tangentLength = Math.hypot(sample.tangentX, sample.tangentY);
  if (tangentLength < 1e-6) return points;
  const tangentX = sample.tangentX / tangentLength;
  const tangentY = sample.tangentY / tangentLength;
  return [{
    ...points[0],
    x: sample.x,
    y: sample.y,
    handleX: tangentX * 18,
    handleY: tangentY * 18,
    tangentDirection: directionOf({ x: tangentX, y: tangentY }),
  }];
}

/**
 * Unit vector pointing from `primary` toward `secondary`, perpendicular to the
 * track chord. Falls back to a chord normal when the port offset is parallel to
 * the chord (rails laid end-to-end rather than side by side).
 */
function perpendicularUnitBetween(
  primary: PairedCurveEndpoints,
  secondary: PairedCurveEndpoints,
): { x: number; y: number } {
  const ox = secondary.from.x - primary.from.x;
  const oy = secondary.from.y - primary.from.y;
  const dx = primary.to.x - primary.from.x;
  const dy = primary.to.y - primary.from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return { x: 0, y: 1 };
  const chord = { x: dx / length, y: dy / length };
  const along = ox * chord.x + oy * chord.y;
  let px = ox - along * chord.x;
  let py = oy - along * chord.y;
  const perpLength = Math.hypot(px, py);
  if (perpLength < 1e-6) {
    px = -chord.y;
    py = chord.x;
  } else {
    px /= perpLength;
    py /= perpLength;
  }
  if (px * ox + py * oy < 0) {
    px = -px;
    py = -py;
  }
  return { x: px, y: py };
}

/**
 * Coordinates an automatic double-track pair so the two rails stay parallel.
 * Both rails share a centreline between the four port anchors; each rail's
 * single middle knot is placed half the port spacing away from the centreline,
 * perpendicular to the track direction, with a tangent aligned to the chord.
 * Without this, both rails bend through their own midpoints with port-aligned
 * tangents and visibly converge on steep diagonals.
 */
export function createPairedAutoControlPoints(
  thisRail: PairedCurveEndpoints,
  pairedRail: PairedCurveEndpoints,
  ids: ControlPointIds = {},
): TrackControlPoint[] {
  // Only coordinate a genuinely parallel pair: both ends must share the same
  // port offset (e.g. two unrotated stations). Twisted pairs, where one rail
  // connects to a rotated module, fall back to independent generation.
  const offsetFrom = { x: pairedRail.from.x - thisRail.from.x, y: pairedRail.from.y - thisRail.from.y };
  const offsetTo = { x: pairedRail.to.x - thisRail.to.x, y: pairedRail.to.y - thisRail.to.y };
  const magFrom = Math.hypot(offsetFrom.x, offsetFrom.y);
  const magTo = Math.hypot(offsetTo.x, offsetTo.y);
  const parallel = magFrom > 1e-6 && magTo > 1e-6
    && (offsetFrom.x * offsetTo.x + offsetFrom.y * offsetTo.y) / (magFrom * magTo) > 0.7;
  if (!parallel) {
    return placePairedAutoControlPointsOnTrack(
      createAutoControlPoints(thisRail.from, thisRail.to, thisRail.fromDir, thisRail.toDir, ids),
      thisRail,
      pairedRail,
    );
  }

  const centerFrom = { x: (thisRail.from.x + pairedRail.from.x) / 2, y: (thisRail.from.y + pairedRail.from.y) / 2 };
  const centerTo = { x: (thisRail.to.x + pairedRail.to.x) / 2, y: (thisRail.to.y + pairedRail.to.y) / 2 };
  const centerPoints = createAutoControlPoints(centerFrom, centerTo, thisRail.fromDir, thisRail.toDir, ids);
  if (centerPoints.length === 0) {
    // The centreline is straight, so this rail is straight too.
    return createAutoControlPoints(thisRail.from, thisRail.to, thisRail.fromDir, thisRail.toDir, ids);
  }
  const perp = perpendicularUnitBetween(thisRail, pairedRail);
  const spacing = Math.hypot(pairedRail.from.x - thisRail.from.x, pairedRail.from.y - thisRail.from.y);
  const half = spacing / 2;
  return placePairedAutoControlPointsOnTrack(centerPoints.map((centerPoint, index) => ({
    ...centerPoint,
    id: index === 0 ? (ids.middle || "middle") : `${ids.middle || "middle"}:${index + 1}`,
    x: centerPoint.x - perp.x * half,
    y: centerPoint.y - perp.y * half,
  })), thisRail, pairedRail);
}

/** Finds the other rail of a double-track pair among the given connections. */
export function findPairedConnection(
  connection: ModuleConnection,
  connections: ModuleConnection[],
  modules: DiagramModule[],
  templates: Map<string, ModuleTemplate>,
): ModuleConnection | undefined {
  if (connection.pairedConnectionId) {
    return connections.find((candidate) => candidate.id === connection.pairedConnectionId);
  }
  const from = getConnectionEndpoint(connection.fromModuleId, connection.fromPortId, modules, templates);
  const to = getConnectionEndpoint(connection.toModuleId, connection.toPortId, modules, templates);
  if (!from || !to) return undefined;
  const fromPartner = findDoubleTrackPartner(from.template, from.port);
  const toPartner = findDoubleTrackPartner(to.template, to.port);
  if (!fromPartner || !toPartner) return undefined;
  return connections.find((candidate) =>
    candidate.fromModuleId === connection.fromModuleId
    && candidate.fromPortId === fromPartner.id
    && candidate.toModuleId === connection.toModuleId
    && candidate.toPortId === toPartner.id
  );
}

/** Port endpoints and directions of a connection, as used by the curve solver. */
export function endpointsForConnection(
  connection: ModuleConnection,
  modules: DiagramModule[],
  templates: Map<string, ModuleTemplate>,
): PairedCurveEndpoints | null {
  const from = getConnectionEndpoint(connection.fromModuleId, connection.fromPortId, modules, templates);
  const to = getConnectionEndpoint(connection.toModuleId, connection.toPortId, modules, templates);
  if (!from || !to) return null;
  const fromPosition = worldPortPosition(from.module, from.template, from.portId);
  const toPosition = worldPortPosition(to.module, to.template, to.portId);
  return {
    from: { x: fromPosition.x, y: fromPosition.y },
    to: { x: toPosition.x, y: toPosition.y },
    fromDir: fromPosition.direction,
    toDir: toPosition.direction,
  };
}

/** Rebuilds automatic direction-only knots and removes obsolete endpoint anchors. */
export function reconcileConnectionControlPoints(
  connection: ModuleConnection,
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromDir: number,
  toDir: number,
  pairedEndpoints?: PairedCurveEndpoints,
): TrackControlPoint[] {
  const implicitPoints = connection.controlPoints.filter((point) => point.implicit);
  const userPoints = connection.controlPoints.filter((point) => !point.implicit);
  const ids: ControlPointIds = {
    from: implicitPoints[0]?.id || `${connection.id}:endpoint-from`,
    middle: userPoints[0]?.id || `${connection.id}:middle`,
    to: implicitPoints.at(-1)?.id || `${connection.id}:endpoint-to`,
  };

  if (connection.autoCurve !== false) {
    return pairedEndpoints
      ? createPairedAutoControlPoints({ from, to, fromDir, toDir }, pairedEndpoints, ids)
      : createAutoControlPoints(from, to, fromDir, toDir, ids);
  }
  // `autoCurve: false` with no controls is the explicit straight-line mode.
  if (connection.controlPoints.length === 0) return [];
  // A legacy manual curve with only old endpoint anchors becomes a single
  // direction-only knot. Existing user-authored points remain untouched.
  return userPoints.length > 0 ? normalizeManualCurvePoints(userPoints, to) : createAutoControlPoints(from, to, fromDir, toDir, ids);
}

export function getConnectionGeometry(
  connection: ModuleConnection,
  modules: DiagramModule[],
  templates: Map<string, ModuleTemplate>,
  pairedEndpoints?: PairedCurveEndpoints,
): ConnectionGeometry | null {
  const from = getConnectionEndpoint(connection.fromModuleId, connection.fromPortId, modules, templates);
  const to = getConnectionEndpoint(connection.toModuleId, connection.toPortId, modules, templates);
  if (!from || !to) return null;
  const fromPosition = worldPortPosition(from.module, from.template, from.portId);
  const toPosition = worldPortPosition(to.module, to.template, to.portId);
  const controlPoints = reconcileConnectionControlPoints(
    connection,
    { x: fromPosition.x, y: fromPosition.y },
    { x: toPosition.x, y: toPosition.y },
    fromPosition.direction,
    toPosition.direction,
    pairedEndpoints,
  );
  return {
    from: { x: fromPosition.x, y: fromPosition.y },
    to: { x: toPosition.x, y: toPosition.y },
    fromDir: fromPosition.direction,
    toDir: toPosition.direction,
    controlPoints,
    tracks: rebuildTracksFromControlPoints({ x: fromPosition.x, y: fromPosition.y }, { x: toPosition.x, y: toPosition.y }, controlPoints),
  };
}

export function getConnectionTracks(
  connection: ModuleConnection,
  modules: DiagramModule[],
  templates: Map<string, ModuleTemplate>,
): TemplateTrack[] {
  return getConnectionGeometry(connection, modules, templates)?.tracks || connection.tracks;
}

/** Refreshes derived endpoint anchors and persisted track caches after module movement. */
export function synchronizeConnectionTracks(
  connections: ModuleConnection[],
  modules: DiagramModule[],
  templates: Map<string, ModuleTemplate>,
): ModuleConnection[] {
  return connections.map((connection) => {
    const partner = findPairedConnection(connection, connections, modules, templates);
    const pairedEndpoints = partner ? endpointsForConnection(partner, modules, templates) : undefined;
    const geometry = getConnectionGeometry(connection, modules, templates, pairedEndpoints ?? undefined);
    return geometry ? { ...connection, controlPoints: geometry.controlPoints, tracks: geometry.tracks } : connection;
  });
}
