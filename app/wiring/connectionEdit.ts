// 配线图编辑器的纯双轨/连接几何编辑逻辑。
// 不含组件状态、history 或 setter；依赖的数据（modules/connections/templates）全部显式传入，
// 由 WiringDiagramApp 的绑定 wrapper 提供当前值。代码与原组件内实现逐字一致。

import {
  endpointsForConnection,
  findDoubleTrackPartner,
  findPairedConnection,
  getConnectionEndpoint,
  getConnectionGeometry,
  type ConnectionGeometry,
  type PairedCurveEndpoints,
} from "./connectionLogic";
import { buildResolvedTemplateMap } from "./templates";
import {
  genId,
  worldPortPosition,
  type DiagramModule,
  type ModuleConnection,
  type ModuleTemplate,
  type TrackControlPoint,
} from "./types";

/** 计算连接两端端口的世界坐标 */
export function getConnectionEndpoints(
  conn: ModuleConnection,
  sourceModules: DiagramModule[],
  sourceTemplates: Map<string, ModuleTemplate>,
): { from: { x: number; y: number }; to: { x: number; y: number }; fromDir: number; toDir: number } | null {
  const from = getConnectionEndpoint(conn.fromModuleId, conn.fromPortId, sourceModules, sourceTemplates);
  const to = getConnectionEndpoint(conn.toModuleId, conn.toPortId, sourceModules, sourceTemplates);
  if (!from || !to) return null;
  const fp = worldPortPosition(from.module, from.template, from.portId);
  const tp = worldPortPosition(to.module, to.template, to.portId);
  const fromDir = fp.direction;
  const toDir = tp.direction;
  return { from: { x: fp.x, y: fp.y }, to: { x: tp.x, y: tp.y }, fromDir, toDir };
}

/** Curve endpoints derived from two chosen ports. */
export function curveEndpointsFor(
  from: NonNullable<ReturnType<typeof getConnectionEndpoint>>,
  to: NonNullable<ReturnType<typeof getConnectionEndpoint>>,
): PairedCurveEndpoints {
  const fromPos = worldPortPosition(from.module, from.template, from.portId);
  const toPos = worldPortPosition(to.module, to.template, to.portId);
  return {
    from: { x: fromPos.x, y: fromPos.y },
    to: { x: toPos.x, y: toPos.y },
    fromDir: fromPos.direction,
    toDir: toPos.direction,
  };
}

/** Endpoints of a connection's double-track partner, when one exists. */
export function pairedEndpointsFor(
  conn: ModuleConnection,
  candidates: ModuleConnection[],
  sourceModules: DiagramModule[],
  sourceTemplates: Map<string, ModuleTemplate>,
): PairedCurveEndpoints | undefined {
  const partner = findPairedConnection(conn, candidates, sourceModules, sourceTemplates);
  if (!partner) return undefined;
  return endpointsForConnection(partner, sourceModules, sourceTemplates) ?? undefined;
}

/** Geometry resolved together with the double-track partner so the pair stays parallel. */
export function geometryForConnection(
  conn: ModuleConnection,
  candidates: ModuleConnection[],
  sourceModules: DiagramModule[],
  sourceTemplates: Map<string, ModuleTemplate>,
): ConnectionGeometry | null {
  return getConnectionGeometry(conn, sourceModules, sourceTemplates, pairedEndpointsFor(conn, candidates, sourceModules, sourceTemplates));
}

/** Rebuild from authoritative ports on every render, so endpoints follow a drag immediately. */
export function rebuildConnectionTrackCache(
  conn: ModuleConnection,
  candidates: ModuleConnection[],
  sourceModules: DiagramModule[],
  sourceTemplates: Map<string, ModuleTemplate>,
) {
  return geometryForConnection(conn, candidates, sourceModules, sourceTemplates)?.tracks || conn.tracks;
}

export type ConnectionFrame = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export function frameVector(frame: ConnectionFrame) {
  const dx = frame.to.x - frame.from.x;
  const dy = frame.to.y - frame.from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    length,
    tangent: { x: dx / length, y: dy / length },
    normal: { x: -dy / length, y: dx / length },
  };
}

export function mirrorPointAcrossPairedFrames(
  point: { x: number; y: number },
  source: ConnectionFrame,
  target: ConnectionFrame,
) {
  const sourceVector = frameVector(source);
  const targetVector = frameVector(target);
  const relative = { x: point.x - source.from.x, y: point.y - source.from.y };
  const along = (relative.x * sourceVector.tangent.x + relative.y * sourceVector.tangent.y) / sourceVector.length;
  const lateral = relative.x * sourceVector.normal.x + relative.y * sourceVector.normal.y;
  return {
    x: target.from.x + targetVector.tangent.x * targetVector.length * along + targetVector.normal.x * lateral,
    y: target.from.y + targetVector.tangent.y * targetVector.length * along + targetVector.normal.y * lateral,
  };
}

export function mirrorVectorAcrossPairedFrames(
  vector: { x: number; y: number },
  source: ConnectionFrame,
  target: ConnectionFrame,
) {
  const sourceVector = frameVector(source);
  const targetVector = frameVector(target);
  const along = vector.x * sourceVector.tangent.x + vector.y * sourceVector.tangent.y;
  const lateral = vector.x * sourceVector.normal.x + vector.y * sourceVector.normal.y;
  return {
    x: targetVector.tangent.x * along + targetVector.normal.x * lateral,
    y: targetVector.tangent.y * along + targetVector.normal.y * lateral,
  };
}

export function mirrorControlPoints(
  sourcePoints: TrackControlPoint[],
  sourceFrame: ConnectionFrame,
  targetFrame: ConnectionFrame,
  existingTargetPoints: TrackControlPoint[],
): TrackControlPoint[] {
  return sourcePoints.map((point, index) => {
    const position = mirrorPointAcrossPairedFrames(point, sourceFrame, targetFrame);
    const handle = mirrorVectorAcrossPairedFrames({ x: point.handleX, y: point.handleY }, sourceFrame, targetFrame);
    const tangent = typeof point.tangentDirection === "number"
      ? mirrorVectorAcrossPairedFrames({ x: Math.cos((point.tangentDirection * Math.PI) / 180), y: Math.sin((point.tangentDirection * Math.PI) / 180) }, sourceFrame, targetFrame)
      : null;
    return {
      ...point,
      id: existingTargetPoints[index]?.id || genId("cp"),
      x: position.x,
      y: position.y,
      handleX: handle.x,
      handleY: handle.y,
      tangentDirection: tangent ? (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI : undefined,
    };
  });
}

export function findPairedRail(
  connection: ModuleConnection,
  candidates: ModuleConnection[],
  sourceModules: DiagramModule[],
  templateMap: Map<string, ModuleTemplate>,
): ModuleConnection | undefined {
  if (connection.pairedConnectionId) {
    return candidates.find((candidate) => candidate.id === connection.pairedConnectionId);
  }
  const templates = buildResolvedTemplateMap(templateMap, sourceModules);
  const from = getConnectionEndpoint(connection.fromModuleId, connection.fromPortId, sourceModules, templates);
  const to = getConnectionEndpoint(connection.toModuleId, connection.toPortId, sourceModules, templates);
  if (!from || !to) return undefined;
  const fromPartner = findDoubleTrackPartner(from.template, from.port);
  const toPartner = findDoubleTrackPartner(to.template, to.port);
  if (!fromPartner || !toPartner) return undefined;
  return candidates.find((candidate) =>
    candidate.fromModuleId === connection.fromModuleId
    && candidate.fromPortId === fromPartner.id
    && candidate.toModuleId === connection.toModuleId
    && candidate.toPortId === toPartner.id
    && (!candidate.pairedConnectionId || candidate.pairedConnectionId === connection.id),
  );
}

/** Applies a curve edit to both rails of a newly-created double-track pair. */
export function updateConnectionAndPairedRail(
  previous: ModuleConnection[],
  connectionId: string,
  update: (connection: ModuleConnection) => ModuleConnection,
  sourceModules: DiagramModule[],
  templateMap: Map<string, ModuleTemplate>,
): ModuleConnection[] {
  const source = previous.find((connection) => connection.id === connectionId);
  if (!source) return previous;
  const paired = findPairedRail(source, previous, sourceModules, templateMap);
  const changed = paired ? { ...update(source), pairedConnectionId: paired.id } : update(source);
  const templates = buildResolvedTemplateMap(templateMap, sourceModules);
  const sourceGeometry = geometryForConnection(changed, previous, sourceModules, templates);
  const updatedSource = sourceGeometry
    ? { ...changed, controlPoints: sourceGeometry.controlPoints, tracks: sourceGeometry.tracks }
    : changed;
  if (!paired) {
    return previous.map((connection) => connection.id === source.id ? updatedSource : connection);
  }

  const pairedGeometry = geometryForConnection(paired, previous, sourceModules, templates);
  if (!sourceGeometry || !pairedGeometry || updatedSource.autoCurve !== false) {
    // Automatic mode is regenerated independently from each rail's live ports.
    return previous.map((connection) => {
      if (connection.id === source.id) return updatedSource;
      if (connection.id === paired.id) {
        const refreshed = geometryForConnection({ ...connection, autoCurve: updatedSource.autoCurve }, previous, sourceModules, templates);
        return refreshed
          ? { ...connection, pairedConnectionId: source.id, autoCurve: updatedSource.autoCurve, controlPoints: refreshed.controlPoints, tracks: refreshed.tracks }
          : { ...connection, pairedConnectionId: source.id, autoCurve: updatedSource.autoCurve };
      }
      return connection;
    });
  }

  const mirroredPoints = mirrorControlPoints(
    updatedSource.controlPoints,
    sourceGeometry,
    pairedGeometry,
    paired.controlPoints,
  );
  const pairedDraft = { ...paired, pairedConnectionId: source.id, autoCurve: false, controlPoints: mirroredPoints };
  const updatedPairedGeometry = geometryForConnection(pairedDraft, previous, sourceModules, templates);
  const updatedPaired = updatedPairedGeometry
    ? { ...pairedDraft, controlPoints: updatedPairedGeometry.controlPoints, tracks: updatedPairedGeometry.tracks }
    : pairedDraft;
  return previous.map((connection) => {
    if (connection.id === source.id) return updatedSource;
    if (connection.id === paired.id) return updatedPaired;
    return connection;
  });
}
