import type { Station, Transfer, TransitData, TransitLine } from "./types";

export type SourceEntityType = "line" | "station" | "transfer" | "service";
export type ChangeSeverity = "info" | "warning" | "error";
export type SourceChangeStatus = "unresolved" | "accepted" | "ignored";

export interface SourceChange {
  id: string;
  entityType: SourceEntityType;
  entityId: string;
  changeType: string;
  severity: ChangeSeverity;
  oldValue?: unknown;
  newValue?: unknown;
  affectedObjectIds: string[];
  status: SourceChangeStatus;
  requiresPlacement: boolean;
}

export type SourceObjectBindings = Record<string, string[]>;
export type SourceFingerprints = Record<string, string>;

type SourceEntity = TransitLine | Station | Transfer;
type FieldRule = { severity: ChangeSeverity };

const LINE_FIELD_RULES: Record<string, FieldRule> = {
  nameZh: { severity: "info" },
  nameEn: { severity: "info" },
  lineColor: { severity: "info" },
  stationColor: { severity: "info" },
  currentColor: { severity: "info" },
  passedColor: { severity: "info" },
  textColor: { severity: "info" },
  number: { severity: "info" },
  code: { severity: "info" },
  description: { severity: "info" },
  kind: { severity: "warning" },
};

const STATION_FIELD_RULES: Record<string, FieldRule> = {
  nameZh: { severity: "info" },
  nameEn: { severity: "info" },
  code: { severity: "info" },
  markerColor: { severity: "info" },
  isOpen: { severity: "info" },
  icon: { severity: "info" },
  notes: { severity: "info" },
  terminalType: { severity: "warning" },
  throughLineIds: { severity: "warning" },
  lineId: { severity: "error" },
  sequence: { severity: "error" },
};

const TRANSFER_FIELD_RULES: Record<string, FieldRule> = {
  hidden: { severity: "warning" },
  colorOverride: { severity: "warning" },
  order: { severity: "warning" },
  stationId: { severity: "error" },
  targetLineId: { severity: "error" },
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function sourceFingerprint(value: unknown): string {
  const input = JSON.stringify(canonicalize(value));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function computeSourceFingerprints(data: Pick<TransitData, "lines" | "stations" | "transfers">): SourceFingerprints {
  const result: SourceFingerprints = {};
  for (const line of data.lines) result[`line:${line.id}`] = sourceFingerprint(line);
  for (const station of data.stations) result[`station:${station.id}`] = sourceFingerprint(station);
  for (const transfer of data.transfers) result[`transfer:${transfer.id}`] = sourceFingerprint(transfer);
  return result;
}

function bindingIds(bindings: SourceObjectBindings, entityType: SourceEntityType, entityId: string): string[] {
  return [...new Set(bindings[`${entityType}:${entityId}`] || bindings[entityId] || [])];
}

function createChange(
  entityType: SourceEntityType,
  entityId: string,
  changeType: string,
  severity: ChangeSeverity,
  bindings: SourceObjectBindings,
  oldValue?: unknown,
  newValue?: unknown,
  requiresPlacement = false,
): SourceChange {
  return {
    id: `${entityType}:${entityId}:${changeType}`,
    entityType,
    entityId,
    changeType,
    severity,
    oldValue,
    newValue,
    affectedObjectIds: bindingIds(bindings, entityType, entityId),
    status: "unresolved",
    requiresPlacement,
  };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function diffEntityCollection<T extends SourceEntity>(
  entityType: Exclude<SourceEntityType, "service">,
  before: T[],
  after: T[],
  rules: Record<string, FieldRule>,
  bindings: SourceObjectBindings,
): SourceChange[] {
  const changes: SourceChange[] = [];
  const previousById = new Map(before.map((item) => [item.id, item]));
  const nextById = new Map(after.map((item) => [item.id, item]));

  for (const item of after) {
    const previous = previousById.get(item.id);
    if (!previous) {
      const requiresPlacement = entityType === "station";
      const severity: ChangeSeverity = entityType === "line" ? "warning" : "error";
      changes.push(createChange(entityType, item.id, "added", severity, bindings, undefined, item, requiresPlacement));
      continue;
    }
    for (const [field, rule] of Object.entries(rules)) {
      const oldValue = (previous as unknown as Record<string, unknown>)[field];
      const newValue = (item as unknown as Record<string, unknown>)[field];
      if (!valuesEqual(oldValue, newValue)) {
        changes.push(createChange(entityType, item.id, `field:${field}`, rule.severity, bindings, oldValue, newValue));
      }
    }
  }

  for (const item of before) {
    if (!nextById.has(item.id)) {
      const severity: ChangeSeverity = entityType === "line" ? "warning" : "error";
      changes.push(createChange(entityType, item.id, "removed", severity, bindings, item, undefined));
    }
  }
  return changes;
}

export function generateSourceChanges(
  before: Pick<TransitData, "lines" | "stations" | "transfers">,
  after: Pick<TransitData, "lines" | "stations" | "transfers">,
  bindings: SourceObjectBindings = {},
): SourceChange[] {
  return [
    ...diffEntityCollection("line", before.lines, after.lines, LINE_FIELD_RULES, bindings),
    ...diffEntityCollection("station", before.stations, after.stations, STATION_FIELD_RULES, bindings),
    ...diffEntityCollection("transfer", before.transfers, after.transfers, TRANSFER_FIELD_RULES, bindings),
  ];
}

export function updateSourceChangeStatus(
  changes: SourceChange[],
  changeIds: string[],
  status: SourceChangeStatus,
): SourceChange[] {
  const selected = new Set(changeIds);
  return changes.map((change) => selected.has(change.id) ? { ...change, status } : change);
}

export function pendingPlacementChanges(changes: SourceChange[]): SourceChange[] {
  return changes.filter((change) => change.status === "unresolved" && change.requiresPlacement);
}
