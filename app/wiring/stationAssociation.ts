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

/**
 * Move one associated station while keeping the array as the single source of
 * truth for platform/line colour order. The order is intentionally persisted
 * in DiagramModule.sourceStationIds.
 */
export function moveStationAssociation(stationIds: string[], stationId: string, offset: -1 | 1): string[] {
  const from = stationIds.indexOf(stationId);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= stationIds.length) return stationIds;
  const next = [...stationIds];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * Refresh line membership without silently reverting a user's saved colour
 * order to the CSV/default line order. Existing valid entries keep their
 * relative order; newly introduced lines are appended in association order.
 */
export function reconcileLineIdsForStationAssociations(
  currentLineIds: string[],
  stationIds: string[],
  stations: Station[],
): string[] {
  const associatedLineIds = lineIdsForStationAssociations(stationIds, stations);
  const associated = new Set(associatedLineIds);
  const result = currentLineIds.filter((lineId, index) =>
    associated.has(lineId) && currentLineIds.indexOf(lineId) === index);
  const seen = new Set(result);
  for (const lineId of associatedLineIds) {
    if (seen.has(lineId)) continue;
    seen.add(lineId);
    result.push(lineId);
  }
  return result;
}
