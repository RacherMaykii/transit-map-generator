import type { Station } from "../transit/types";

/** Resolve every line represented by a module's associated station records. */
export function lineIdsForStationAssociations(stationIds: string[], stations: Station[]): string[] {
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const result: string[] = [];
  const seen = new Set<string>();
  for (const stationId of stationIds) {
    const station = stationById.get(stationId);
    if (!station) continue;
    for (const lineId of [station.lineId, ...(station.throughLineIds || [])]) {
      if (!lineId || seen.has(lineId)) continue;
      seen.add(lineId);
      result.push(lineId);
    }
  }
  return result;
}

export function addStationAssociation(stationIds: string[], stationId: string): string[] {
  return stationId && !stationIds.includes(stationId) ? [...stationIds, stationId] : stationIds;
}

export function removeStationAssociation(stationIds: string[], stationId: string): string[] {
  return stationIds.filter((candidate) => candidate !== stationId);
}
