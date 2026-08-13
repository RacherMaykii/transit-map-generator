import type { AttachedGraphic, LabelObject, ModuleTemplate } from "./types";

type LineKindRef = { id: string; kind: string };
type ModuleLineRef = { lineIds: string[] };

const SPECIAL_PLATFORM_TEMPLATES = new Set([
  "cross_platform",
  "double_island",
  "spanish_platform",
  "two_island_three_track",
  "triple_island",
]);

/** Choose the default leaf layer from an object's semantic role. */
export function moduleUsesTramLine(module: ModuleLineRef | undefined, sourceLines: readonly LineKindRef[]): boolean {
  const primaryLineId = module?.lineIds[0];
  return Boolean(primaryLineId && sourceLines.find((line) => line.id === primaryLineId)?.kind === "tram");
}

export function defaultModuleLayerId(
  template?: Pick<ModuleTemplate, "id" | "category" | "platforms">,
  module?: ModuleLineRef,
  sourceLines: readonly LineKindRef[] = [],
): string {
  if (moduleUsesTramLine(module, sourceLines)) return "layer-track-tram";
  if (!template) return "layer-track-main";
  if (template.category === "turnout") return "layer-track-turnout";
  if (template.category === "yard") {
    if (template.id.includes("siding")) return "layer-track-siding";
    if (template.id.includes("access")) return "layer-track-depot-access";
    return "layer-track-yard";
  }
  return template.platforms.length > 0 ? "layer-track-station" : "layer-track-main";
}

export function defaultConnectionLayerId(
  fromModule: ModuleLineRef | undefined,
  toModule: ModuleLineRef | undefined,
  sourceLines: readonly LineKindRef[],
): string {
  return moduleUsesTramLine(fromModule, sourceLines) && moduleUsesTramLine(toModule, sourceLines)
    ? "layer-track-tram"
    : "layer-track-main";
}

export function defaultPlatformLayerId(templateId?: string): string {
  return templateId && SPECIAL_PLATFORM_TEMPLATES.has(templateId)
    ? "layer-platform-special"
    : "layer-platform-normal";
}

export function defaultLabelLayerId(label: Pick<LabelObject, "attachedToId" | "sourceStationId" | "numeralType">): string {
  if (label.attachedToId || label.sourceStationId) return "layer-label";
  if (label.numeralType === "track") return "layer-text-track-number";
  if (label.numeralType === "switch") return "layer-text-switch-number";
  return "layer-text-note";
}

export function defaultGraphicLayerId(graphic: Pick<AttachedGraphic, "attachedToId" | "shapeType">): string {
  return graphic.attachedToId && !graphic.shapeType ? "layer-icon" : "layer-icon-facility";
}
