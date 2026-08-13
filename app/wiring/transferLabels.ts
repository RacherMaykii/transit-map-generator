import type { LabelObject, TransferGroup } from "./types";

function isStationNameLabel(label: LabelObject): boolean {
  return !!label.attachedToId && (!!label.sourceStationId || label.language === "zh" || label.language === "en");
}

/**
 * A transfer group represents one physical station. Keep one module's bilingual
 * station name and suppress the duplicated member names at render/avoidance time.
 * Nothing is deleted, so ungrouping restores all original labels.
 */
export function duplicateTransferStationLabelIds(labels: LabelObject[], groups: TransferGroup[]): Set<string> {
  const result = new Set<string>();
  for (const group of groups) {
    if (group.visible === false || group.moduleIds.length < 2) continue;
    const primaryModuleId = group.moduleIds.find((moduleId) =>
      labels.some((label) => label.attachedToId === moduleId && isStationNameLabel(label)),
    ) ?? group.moduleIds[0];
    const memberIds = new Set(group.moduleIds.filter((moduleId) => moduleId !== primaryModuleId));
    for (const label of labels) {
      if (label.attachedToId && memberIds.has(label.attachedToId) && isStationNameLabel(label)) result.add(label.id);
    }
  }
  return result;
}
