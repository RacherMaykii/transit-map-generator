// ──────────────────────────────────────────────
// 配线图 · 站点/线路删除后的解除关联逻辑（纯函数）
// ──────────────────────────────────────────────
// 在配线图同步到最新 TransitData 时，把已经不存在的站点/线路 ID 从各类对象中
// 移除，并让受影响的元件进入"未分配"状态。绝不删除任何几何内容、不移动
// 元件、不改变未受影响站点的关联顺序。
//
// 本模块只做数据改造，不做持久化。调用方（synchronizeWiringProjectSource、
// 配线图编辑器的"重新读取项目 CSV"、TransitMapApp 的删除确认弹窗）负责把
// 结果写回当前 projectId 对应的 wiring 文档。

import type { Station, TransitData } from "../transit/types";
import type { ProjectFile } from "./projectStore";
import type {
  DiagramModule,
  FilterState,
  LabelObject,
  PendingPlacement,
  PhysicalStation,
  PlatformObject,
  ServicePattern,
  SourceMapping,
  TransferGroup,
} from "./types";
import { reconcileLineIdsForStationAssociations } from "./stationAssociation";

export interface StationAssociationUnlinkResult {
  modules: DiagramModule[];
  platforms: PlatformObject[];
  labels: LabelObject[];
  transferGroups: TransferGroup[];
  servicePatterns: ServicePattern[];
  physicalStations: PhysicalStation[];
  sourceMappings: SourceMapping[];
  filters: FilterState;
  pendingPlacement: PendingPlacement | null;
  /** 变为"未分配"状态的模块数（关联站点被清空） */
  unlinkedModuleCount: number;
  /** 清除了站点或线路绑定、但保留全部几何的站台对象数 */
  unlinkedPlatformCount: number;
  /** 变为"未分配"状态的换乘组合数 */
  unlinkedTransferGroupCount: number;
  /** 因无 diagramObjectId 而被移除的 SourceMapping 数 */
  removedMappingCount: number;
  /** 因 sourceStationIds 清空而被移除的 PhysicalStation 数 */
  removedPhysicalStationCount: number;
  /** 进入"未分配"状态的元件 id（模块 + 站台 + 换乘组合） */
  unlinkedObjectIds: string[];
}

export interface WiringAssociationSummary {
  /** 关联到这些站点的模块数（任一引用） */
  affectedModuleCount: number;
  /** 会因这些站点删除而完全变为"未分配"的模块数 */
  unlinkedModuleCount: number;
  /** 关联到这些站点的换乘组合数（任一引用） */
  affectedTransferGroupCount: number;
  /** 会完全变为"未分配"的换乘组合数 */
  unlinkedTransferGroupCount: number;
  /** 关联到待删除站点/线路的物化站台数 */
  affectedPlatformCount: number;
  /** 删除后会清空站点与线路绑定的物化站台数 */
  unlinkedPlatformCount: number;
  /** 是否存在任何配线图对象引用这些站点 */
  hasAssociation: boolean;
}

/** 汇总一组站点在配线图中的关联，用于删除确认弹窗（删除前统计）。
 *  接受完整 ProjectFile 或序列化后的 wiring 文档（只读取关联字段）。 */
export function wiringAssociationsForStationIds(
  project: {
    modules?: Array<{ id?: string; sourceStationIds?: string[]; lineIds?: string[] }>;
    platforms?: Array<{ id?: string; moduleId?: string; sourceStationId?: string; sourceLineId?: string }>;
    transferGroups?: Array<{ sourceStationIds?: string[]; lineIds?: string[] }>;
    labels?: Array<{ sourceStationId?: string; sourceLineId?: string }>;
    physicalStations?: Array<{ sourceStationIds?: string[] }>;
    sourceMappings?: Array<{ sourceStationId?: string; sourceStationOnLineId?: string; sourceLineId?: string }>;
    pendingPlacement?: { sourceStationId?: string } | null;
  },
  stationIds: Iterable<string>,
  lineIds: Iterable<string> = [],
): WiringAssociationSummary {
  const ids = new Set(stationIds);
  const deletedLineIds = new Set(lineIds);
  const modules = project.modules || [];
  const platforms = project.platforms || [];
  const transferGroups = project.transferGroups || [];
  const labels = project.labels || [];
  const physicalStations = project.physicalStations || [];
  const sourceMappings = project.sourceMappings || [];

  const affectedModules = modules.filter((module) =>
    (module.sourceStationIds || []).some((id) => ids.has(id))
    || (module.lineIds || []).some((id) => deletedLineIds.has(id)));
  const affectedGroups = transferGroups.filter((group) =>
    (group.sourceStationIds || []).some((id) => ids.has(id))
    || (group.lineIds || []).some((id) => deletedLineIds.has(id)));
  const affectedPlatforms = platforms.filter((platform) =>
    Boolean(platform.sourceStationId && ids.has(platform.sourceStationId))
    || Boolean(platform.sourceLineId && deletedLineIds.has(platform.sourceLineId)));
  const labelRefs = labels.filter((label) =>
    Boolean(label.sourceStationId && ids.has(label.sourceStationId))
    || Boolean(label.sourceLineId && deletedLineIds.has(label.sourceLineId)));
  const physicalRefs = physicalStations.filter((physical) =>
    (physical.sourceStationIds || []).some((id) => ids.has(id)));
  const mappingRefs = sourceMappings.filter((mapping) =>
    Boolean(mapping.sourceStationId && ids.has(mapping.sourceStationId))
    || Boolean(mapping.sourceStationOnLineId && ids.has(mapping.sourceStationOnLineId))
    || Boolean(mapping.sourceLineId && deletedLineIds.has(mapping.sourceLineId)));
  const pendingRef = Boolean(project.pendingPlacement?.sourceStationId && ids.has(project.pendingPlacement.sourceStationId));

  const unlinkedModules = affectedModules.filter((module) => {
    const sourceStationIds = module.sourceStationIds || [];
    const sourceLineIds = module.lineIds || [];
    if (sourceStationIds.length > 0) return sourceStationIds.every((id) => ids.has(id));
    return sourceLineIds.length > 0 && sourceLineIds.every((id) => deletedLineIds.has(id));
  });
  const unlinkedGroups = affectedGroups.filter((group) => {
    const sourceStationIds = group.sourceStationIds || [];
    const sourceLineIds = group.lineIds || [];
    if (sourceStationIds.length > 0) return sourceStationIds.every((id) => ids.has(id));
    return sourceLineIds.length > 0 && sourceLineIds.every((id) => deletedLineIds.has(id));
  });
  const unlinkedModuleIds = new Set(unlinkedModules.flatMap((module) => module.id ? [module.id] : []));
  const unlinkedPlatforms = affectedPlatforms.filter((platform) => !platform.moduleId || !unlinkedModuleIds.has(platform.moduleId));

  return {
    affectedModuleCount: affectedModules.length,
    unlinkedModuleCount: unlinkedModules.length,
    affectedTransferGroupCount: affectedGroups.length,
    unlinkedTransferGroupCount: unlinkedGroups.length,
    affectedPlatformCount: affectedPlatforms.length,
    unlinkedPlatformCount: unlinkedPlatforms.length,
    hasAssociation: affectedModules.length > 0
      || affectedGroups.length > 0
      || affectedPlatforms.length > 0
      || labelRefs.length > 0
      || physicalRefs.length > 0
      || mappingRefs.length > 0
      || pendingRef,
  };
}

/**
 * 把 project 中引用已删除站点/线路的关联全部解除。输入来自最新 TransitData，
 * 只包含仍然存在的站点与线路。
 *
 * 规则要点：
 * - DiagramModule：sourceStationIds 过滤为仍存在的 ID；为空时 lineIds=[]，
 *   进入未分配状态，但几何、位置、站台、轨道、连接、图层与样式全部保留。
 * - PlatformObject：清除失效的 sourceStationId/sourceLineId，完整保留站台几何。
 * - LabelObject：清除不存在的站点/线路引用，保留文字与排版，视为自定义文字。
 * - TransferGroup：过滤失效关联并按剩余站点重算 lineIds，不拆散同台换乘站。
 * - PhysicalStation：清空后删除；只剩一个站点时保留记录。
 * - SourceMapping：有 diagramObjectId 保留并转 unmapped，否则删除。
 * - pendingPlacement：指向已删除站点时清空。
 * - ServicePattern / FilterState：过滤已删除的站点与线路 ID。
 */
export function unlinkDeletedStationAssociations(
  project: ProjectFile,
  currentData: Pick<TransitData, "stations" | "lines">,
): StationAssociationUnlinkResult {
  const stations = new Map(currentData.stations.map((station) => [station.id, station]));
  const lineIds = new Set(currentData.lines.map((line) => line.id));
  const stationList = currentData.stations;
  const unlinkedObjectIds: string[] = [];

  // ── DiagramModule ──
  let unlinkedModuleCount = 0;
  const unlinkedModuleIds = new Set<string>();
  const modules = project.modules.map((module) => {
    const sourceStationIds = module.sourceStationIds || [];
    const validStationIds = sourceStationIds.filter((id) => stations.has(id));
    const validDirectLineIds = (module.lineIds || []).filter((id) => lineIds.has(id));
    const linked = validStationIds.map((id) => stations.get(id)!);
    if (validStationIds.length === sourceStationIds.length) {
      // 没有失效关联：保留原有 sourceStationIds 与顺序，仅刷新派生字段。
      if (!linked.length) {
        if (validDirectLineIds.length === (module.lineIds || []).length) return module;
        if ((module.lineIds || []).length > 0 && validDirectLineIds.length === 0) {
          unlinkedModuleCount += 1;
          unlinkedModuleIds.add(module.id);
          unlinkedObjectIds.push(module.id);
        }
        return { ...module, lineIds: validDirectLineIds };
      }
      return {
        ...module,
        customLabel: linked[0].nameZh,
        lineIds: reconcileLineIdsForStationAssociations(module.lineIds, validStationIds, stationList),
      };
    }
    if (!linked.length) {
      unlinkedModuleCount += 1;
      unlinkedModuleIds.add(module.id);
      unlinkedObjectIds.push(module.id);
      return { ...module, sourceStationIds: [], lineIds: [], customLabel: module.customLabel };
    }
    return {
      ...module,
      sourceStationIds: validStationIds,
      customLabel: linked[0].nameZh,
      lineIds: reconcileLineIdsForStationAssociations(module.lineIds, validStationIds, stationList),
    };
  });
  const moduleById = new Map(modules.map((module) => [module.id, module]));

  // ── PlatformObject ──
  // 站台是独立持久化的几何对象。只清除失效来源绑定，不删除、移动或重建站台。
  let unlinkedPlatformCount = 0;
  const platforms = (project.platforms || []).map((platform) => {
    const stationDeleted = Boolean(platform.sourceStationId && !stations.has(platform.sourceStationId));
    const lineDeleted = Boolean(platform.sourceLineId && !lineIds.has(platform.sourceLineId));
    if (!stationDeleted && !lineDeleted) return platform;
    if (!platform.moduleId || !unlinkedModuleIds.has(platform.moduleId)) unlinkedPlatformCount += 1;
    unlinkedObjectIds.push(platform.id);
    return {
      ...platform,
      sourceStationId: stationDeleted ? undefined : platform.sourceStationId,
      // 站点绑定失效时同步清除其派生线路绑定；仅删除线路时也清除该线路引用。
      sourceLineId: stationDeleted || lineDeleted ? undefined : platform.sourceLineId,
    };
  });

  // ── LabelObject ──
  // 已删除站点的站名标签：保留文字、字号、颜色、位置与层级，清除绑定，
  // 视为自定义文字，不再跟随 CSV 自动更新；不删除标签与附属图标。
  const labels = project.labels.map((label) => {
    const explicitStationId = label.sourceStationId;
    const stationId = explicitStationId
      || (label.attachedToId ? moduleById.get(label.attachedToId)?.sourceStationIds[0] : undefined);
    const station = stationId ? stations.get(stationId) : undefined;
    const stationDeleted = Boolean(explicitStationId && !station);
    const lineDeleted = Boolean(label.sourceLineId && !lineIds.has(label.sourceLineId));
    if (!stationDeleted && !lineDeleted) return label;
    return {
      ...label,
      sourceStationId: stationDeleted ? undefined : label.sourceStationId,
      language: stationDeleted ? undefined : label.language,
      sourceLineId: lineDeleted ? undefined : label.sourceLineId,
    };
  });

  // ── TransferGroup ──
  let unlinkedTransferGroupCount = 0;
  const transferGroups = project.transferGroups.map((group) => {
    const sourceStationIds = group.sourceStationIds || [];
    const validStationIds = sourceStationIds.filter((id) => stations.has(id));
    if (validStationIds.length === sourceStationIds.length) {
      if (!validStationIds.length) {
        const validGroupLineIds = (group.lineIds || []).filter((id) => lineIds.has(id));
        if (validGroupLineIds.length === (group.lineIds || []).length) return group;
        if ((group.lineIds || []).length > 0 && validGroupLineIds.length === 0) {
          unlinkedTransferGroupCount += 1;
          unlinkedObjectIds.push(group.id);
        }
        return { ...group, lineIds: validGroupLineIds };
      }
      return {
        ...group,
        lineIds: reconcileLineIdsForStationAssociations(group.lineIds || [], validStationIds, stationList),
      };
    }
    if (!validStationIds.length) {
      unlinkedTransferGroupCount += 1;
      unlinkedObjectIds.push(group.id);
      return { ...group, sourceStationIds: [], lineIds: [] };
    }
    return {
      ...group,
      sourceStationIds: validStationIds,
      lineIds: reconcileLineIdsForStationAssociations(group.lineIds || [], validStationIds, stationList),
    };
  });

  // ── PhysicalStation ──
  let removedPhysicalStationCount = 0;
  const removedPhysicalStationIds = new Set<string>();
  const physicalStations: PhysicalStation[] = [];
  for (const physical of project.physicalStations || []) {
    const sourceStationIds = physical.sourceStationIds || [];
    const validIds = sourceStationIds.filter((id) => stations.has(id));
    if (sourceStationIds.length > 0 && !validIds.length) {
      removedPhysicalStationIds.add(physical.id);
      removedPhysicalStationCount += 1;
      continue;
    }
    physicalStations.push(validIds.length === sourceStationIds.length
      ? physical
      : { ...physical, sourceStationIds: validIds });
  }

  // ── SourceMapping ──
  let removedMappingCount = 0;
  const stationGone = (id?: string) => (id ? !stations.has(id) : false);
  const lineGone = (id?: string) => (id ? !lineIds.has(id) : false);
  const sourceMappings: SourceMapping[] = [];
  for (const mapping of project.sourceMappings || []) {
    const referencesDeletedStation = stationGone(mapping.sourceStationId)
      || stationGone(mapping.sourceStationOnLineId);
    const referencesDeletedLine = lineGone(mapping.sourceLineId);
    if ((referencesDeletedStation || referencesDeletedLine) && !mapping.diagramObjectId) {
      removedMappingCount += 1;
      continue;
    }
    let next = mapping;
    if (referencesDeletedStation) {
      next = { ...next, sourceStationId: undefined, sourceStationOnLineId: undefined, status: "unmapped" };
    }
    if (referencesDeletedLine) {
      next = { ...next, sourceLineId: undefined, status: "unmapped" };
    }
    if (next.physicalStationId && removedPhysicalStationIds.has(next.physicalStationId)) {
      next = { ...next, physicalStationId: undefined, status: next.status === "mapped" ? "unmapped" : next.status };
    }
    sourceMappings.push(next);
  }

  // ── pendingPlacement ──
  let pendingPlacement = project.pendingPlacement;
  if (pendingPlacement && !stations.has(pendingPlacement.sourceStationId)) pendingPlacement = null;

  // ── ServicePattern / FilterState ──
  // 交路与筛选器不是画布几何，但同样不能保留已删除的线路/站点 ID。
  const servicePatterns = (project.servicePatterns || []).map((pattern) => ({
    ...pattern,
    memberLineIds: pattern.memberLineIds.filter((id) => lineIds.has(id)),
    stationPathIds: pattern.stationPathIds.filter((id) => stations.has(id)),
  }));
  const filters: FilterState = {
    ...(project.filters || { lineIds: [] }),
    lineIds: (project.filters?.lineIds || []).filter((id) => lineIds.has(id)),
  };

  return {
    modules,
    platforms,
    labels,
    transferGroups,
    servicePatterns,
    physicalStations,
    sourceMappings,
    filters,
    pendingPlacement,
    unlinkedModuleCount,
    unlinkedPlatformCount,
    unlinkedTransferGroupCount,
    removedMappingCount,
    removedPhysicalStationCount,
    unlinkedObjectIds,
  };
}
