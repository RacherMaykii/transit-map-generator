import type { ServicePattern } from "./types";

/** Expand line and service-pattern filters into physical line IDs. */
export function expandServicePatternFilter(
  lineIds: string[],
  servicePatternIds: string[],
  patterns: ServicePattern[],
): Set<string> {
  const expanded = new Set(lineIds);
  for (const patternId of servicePatternIds) {
    const pattern = patterns.find((item) => item.id === patternId && item.visible);
    pattern?.memberLineIds.forEach((lineId) => expanded.add(lineId));
  }
  return expanded;
}
