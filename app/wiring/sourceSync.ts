import { generateSourceChanges, pendingPlacementChanges, type SourceChange } from "../transit/sourceChanges";
import type { TransitData } from "../transit/types";
import type { ProjectFile } from "./projectStore";
import { buildSourceIdentityRecords } from "./sourceIdentity";
import { unlinkDeletedStationAssociations } from "./stationUnlink";

function projectTimestamp(project: ProjectFile | null): number {
  const value = project?.projectInfo?.updatedAt ? Date.parse(project.projectInfo.updatedAt) : 0;
  return Number.isFinite(value) ? value : 0;
}

export function newestWiringProject(...projects: Array<ProjectFile | null>): ProjectFile | null {
  return projects.reduce<ProjectFile | null>((newest, candidate) =>
    candidate && (!newest || projectTimestamp(candidate) > projectTimestamp(newest)) ? candidate : newest, null);
}

/**
 * Keep the saved canvas, but always resolve its source-facing labels and records
 * against the current project CSV. The saved snapshot is only the comparison
 * baseline used to report changes made since the last wiring save.
 *
 * When a source station no longer exists in the current CSV, its wiring
 * associations are unlinked (see unlinkDeletedStationAssociations): modules and
 * transfer groups become "unassigned" while keeping their full geometry, labels
 * become custom text, and dangling SourceMapping / PhysicalStation / pending
 * placement records are cleaned. Unresolved changes that reference removed
 * entities are dropped so they no longer surface "source data deleted" warnings.
 */
export function synchronizeWiringProjectSource(project: ProjectFile, currentData: TransitData): ProjectFile {
  const bindings = Object.fromEntries(project.modules.flatMap((module) =>
    module.sourceStationIds.map((id) => [`station:${id}`, [module.id]]),
  ));
  const changes = project.sourceDataSnapshot
    ? generateSourceChanges(project.sourceDataSnapshot, currentData, bindings)
    : [];
  const stations = new Map(currentData.stations.map((station) => [station.id, station]));

  // 1) 解除已删除站点的关联（模块、标签、换乘组合、物理站、映射、待放置）。
  const unlinked = unlinkDeletedStationAssociations(project, currentData);
  const moduleById = new Map(unlinked.modules.map((module) => [module.id, module]));

  // 2) 仍然存在的站点继续跟随 CSV 刷新站名与图标；已解除绑定的标签/图标保留现状。
  const labels = unlinked.labels.map((label) => {
    const stationId = label.sourceStationId || (label.attachedToId ? moduleById.get(label.attachedToId)?.sourceStationIds[0] : undefined);
    const station = stationId ? stations.get(stationId) : undefined;
    if (!station || !label.language || label.language === "neutral") return label;
    return { ...label, sourceStationId: station.id, text: label.language === "en" ? station.nameEn : station.nameZh };
  });
  const assetsByName = new Map(project.assets.map((asset) => [asset.name.toLocaleLowerCase(), asset]));
  const graphics = project.graphics.map((graphic) => {
    const stationId = graphic.attachedToId ? moduleById.get(graphic.attachedToId)?.sourceStationIds[0] : undefined;
    const icon = stationId ? stations.get(stationId)?.icon : undefined;
    const asset = icon ? assetsByName.get(icon.toLocaleLowerCase()) : undefined;
    return asset ? { ...graphic, assetId: asset.id } : graphic;
  });
  const identity = buildSourceIdentityRecords(currentData);
  const pending = pendingPlacementChanges(changes)[0];
  const computedPending = pending ? { sourceStationId: pending.entityId } : null;
  const pendingPlacement = computedPending
    || (unlinked.pendingPlacement && stations.has(unlinked.pendingPlacement.sourceStationId) ? unlinked.pendingPlacement : null);

  // 3) 清理指向已删除实体的未处理变更：已经自动解除关联的对象不再悬挂警告。
  const stationIds = new Set(currentData.stations.map((station) => station.id));
  const transferIds = new Set(currentData.transfers.map((transfer) => transfer.id));
  const lineIds = new Set(currentData.lines.map((line) => line.id));
  const entityGone = (change: SourceChange) =>
    (change.entityType === "station" && !stationIds.has(change.entityId))
    || (change.entityType === "transfer" && !transferIds.has(change.entityId))
    || (change.entityType === "line" && !lineIds.has(change.entityId));
  const unresolvedChanges: SourceChange[] = changes.filter((change) => !entityGone(change));

  // 4) 已处理信息记录：源站点/线路已删除，N 个配线图元件恢复为未分配状态。
  const totalUnlinked = unlinked.unlinkedModuleCount
    + unlinked.unlinkedPlatformCount
    + unlinked.unlinkedTransferGroupCount;
  if (totalUnlinked > 0) {
    const removedStationId = (project.sourceDataSnapshot?.stations || [])
      .filter((station) => !stationIds.has(station.id))
      .map((station) => station.id)[0];
    const removedLineId = (project.sourceDataSnapshot?.lines || [])
      .filter((line) => !lineIds.has(line.id))
      .map((line) => line.id)[0];
    unresolvedChanges.push({
      id: "deleted-source-unlinked",
      entityType: removedStationId ? "station" : "line",
      entityId: removedStationId || removedLineId || "deleted-source",
      changeType: "unlinked",
      severity: "info",
      newValue: {
        unlinkedModuleCount: unlinked.unlinkedModuleCount,
        unlinkedPlatformCount: unlinked.unlinkedPlatformCount,
        unlinkedTransferGroupCount: unlinked.unlinkedTransferGroupCount,
      },
      notes: `站点或线路已从源数据删除，${totalUnlinked} 个配线图元件已恢复为未分配状态`,
      affectedObjectIds: [...unlinked.unlinkedObjectIds],
      status: "unresolved",
      requiresPlacement: false,
    });
  }

  return {
    ...project,
    modules: unlinked.modules,
    platforms: unlinked.platforms,
    labels,
    graphics,
    transferGroups: unlinked.transferGroups,
    servicePatterns: unlinked.servicePatterns,
    physicalStations: unlinked.physicalStations,
    sourceMappings: unlinked.sourceMappings,
    filters: unlinked.filters,
    sourceLines: identity.sourceLines,
    sourceStationsOnLine: identity.sourceStationsOnLine,
    unresolvedChanges,
    pendingPlacement,
    sourceDataSnapshot: currentData,
  };
}
