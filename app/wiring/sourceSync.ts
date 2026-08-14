import { generateSourceChanges, pendingPlacementChanges } from "../transit/sourceChanges";
import type { TransitData } from "../transit/types";
import type { ProjectFile } from "./projectStore";
import { buildSourceIdentityRecords } from "./sourceIdentity";
import { reconcileLineIdsForStationAssociations } from "./stationAssociation";

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
 */
export function synchronizeWiringProjectSource(project: ProjectFile, currentData: TransitData): ProjectFile {
  const bindings = Object.fromEntries(project.modules.flatMap((module) =>
    module.sourceStationIds.map((id) => [`station:${id}`, [module.id]]),
  ));
  const changes = project.sourceDataSnapshot
    ? generateSourceChanges(project.sourceDataSnapshot, currentData, bindings)
    : [];
  const stations = new Map(currentData.stations.map((station) => [station.id, station]));
  const modules = project.modules.map((module) => {
    const linked = module.sourceStationIds.flatMap((id) => {
      const station = stations.get(id);
      return station ? [station] : [];
    });
    if (!linked.length) return module;
    return {
      ...module,
      customLabel: linked[0].nameZh,
      lineIds: reconcileLineIdsForStationAssociations(
        module.lineIds,
        module.sourceStationIds,
        currentData.stations,
      ),
    };
  });
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const labels = project.labels.map((label) => {
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
  return {
    ...project,
    modules,
    labels,
    graphics,
    sourceLines: identity.sourceLines,
    sourceStationsOnLine: identity.sourceStationsOnLine,
    unresolvedChanges: changes,
    pendingPlacement: pending ? { sourceStationId: pending.entityId } : null,
    sourceDataSnapshot: currentData,
  };
}
