import type { TransitData } from "../transit/types";
import type { PhysicalStation, SourceLine, SourceMapping, SourceStationOnLine } from "./types";

export interface PhysicalStationSuggestion {
  id: string;
  displayName: string;
  sourceStationIds: string[];
  reason: "transfer_and_name" | "same_name";
  ambiguous: boolean;
}

export function buildSourceIdentityRecords(data: Pick<TransitData, "lines" | "stations">): {
  sourceLines: SourceLine[];
  sourceStationsOnLine: SourceStationOnLine[];
} {
  return {
    sourceLines: data.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      number: line.number,
      nameZh: line.nameZh,
      nameEn: line.nameEn || undefined,
      code: line.code || undefined,
      lineColor: line.lineColor,
      stationColor: line.stationColor || undefined,
      currentColor: line.currentColor || undefined,
      passedColor: line.passedColor || undefined,
      textColor: line.textColor || undefined,
      description: line.description || undefined,
    })),
    sourceStationsOnLine: data.stations.map((station) => ({
      id: station.id,
      lineId: station.lineId,
      sequence: station.sequence,
      nameZh: station.nameZh,
      nameEn: station.nameEn || undefined,
      code: station.code || undefined,
      markerColor: station.markerColor || undefined,
      terminalType: station.terminalType,
      throughLineIds: [...station.throughLineIds],
      notes: station.notes || undefined,
      isOpen: station.isOpen,
      icon: station.icon || undefined,
    })),
  };
}

export function suggestPhysicalStations(
  data: Pick<TransitData, "stations" | "transfers">,
  mappings: SourceMapping[] = [],
): PhysicalStationSuggestion[] {
  const mapped = new Set(mappings.filter((mapping) => mapping.physicalStationId).map((mapping) => mapping.sourceStationId));
  const suggestions = new Map<string, PhysicalStationSuggestion>();
  for (const station of data.stations) {
    if (mapped.has(station.id)) continue;
    const transferLines = data.transfers.filter((transfer) => transfer.stationId === station.id && !transfer.hidden).map((transfer) => transfer.targetLineId);
    const candidates = data.stations.filter((candidate) => candidate.id !== station.id && candidate.nameZh === station.nameZh && (transferLines.length === 0 || transferLines.includes(candidate.lineId)) && !mapped.has(candidate.id));
    if (!candidates.length) continue;
    const ids = [station.id, ...candidates.map((candidate) => candidate.id)].sort();
    const key = ids.join("|");
    suggestions.set(key, {
      id: `physical-suggestion:${key}`,
      displayName: station.nameZh,
      sourceStationIds: ids,
      reason: transferLines.length ? "transfer_and_name" : "same_name",
      ambiguous: candidates.length > 1,
    });
  }
  return [...suggestions.values()];
}

export function confirmPhysicalStationSuggestion(
  suggestion: PhysicalStationSuggestion,
): { physicalStation: PhysicalStation; mappings: SourceMapping[] } {
  const physicalStationId = `physical:${suggestion.sourceStationIds.slice().sort().join("+")}`;
  return {
    physicalStation: { id: physicalStationId, displayName: suggestion.displayName, sourceStationIds: [...suggestion.sourceStationIds] },
    mappings: suggestion.sourceStationIds.map((sourceStationId) => ({
      id: `mapping:${sourceStationId}`,
      sourceStationId,
      physicalStationId,
      status: "mapped",
    })),
  };
}
