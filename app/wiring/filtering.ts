import type { FilterState, SourceChangeStatus } from "./types";

export type FilterResult = "show" | "dim" | "hide";

export interface FilterableObject {
  lineIds?: string[];
  servicePatternIds?: string[];
  stationStatus?: "open" | "closed" | "terminal";
  objectType: string;
  placed?: boolean;
  changeStatus?: SourceChangeStatus;
  hasDataChanges?: boolean;
  layerId?: string;
  isTransferHint?: boolean;
  transferLineIds?: string[];
}

function intersects(selected: string[] | undefined, actual: string[] | undefined): boolean {
  if (!selected?.length) return true;
  if (!actual?.length) return false;
  const actualSet = new Set(actual);
  return selected.some((value) => actualSet.has(value));
}

export function evaluateFilter(object: FilterableObject, filter: FilterState): FilterResult {
  if (filter.servicePatternIds?.length && !intersects(filter.servicePatternIds, object.servicePatternIds)) return "hide";
  if (filter.stationStatuses?.length && (!object.stationStatus || !filter.stationStatuses.includes(object.stationStatus))) return "hide";
  if (filter.objectTypes?.length && !filter.objectTypes.includes(object.objectType)) return "hide";
  if (filter.changeStatuses?.length && (!object.changeStatus || !filter.changeStatuses.includes(object.changeStatus))) return "hide";
  if (filter.layerIds?.length && (!object.layerId || !filter.layerIds.includes(object.layerId))) return "hide";
  if (filter.placement === "placed" && object.placed !== true) return "hide";
  if (filter.placement === "unplaced" && object.placed !== false) return "hide";
  if (filter.hasDataChanges !== undefined && Boolean(object.hasDataChanges) !== filter.hasDataChanges) return "hide";

  if (!filter.lineIds.length || intersects(filter.lineIds, object.lineIds)) return "show";
  if (filter.mode === "dim_others") return "dim";
  if (filter.mode === "retain_transfers" && object.isTransferHint && intersects(filter.lineIds, object.transferLineIds)) return "show";
  return "hide";
}
