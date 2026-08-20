// ──────────────────────────────────────────────
// 配线图编辑器 · 模块模板系统（薄 barrel）
// 模板常量按分类拆到 templates/{helpers,section,turnout,yard,customize}.ts；
// 本文件保留模板注册表（MODULE_TEMPLATES）、解析（buildResolvedTemplateMap）、
// 避让线派生（supportsAvoidanceTracks/withAvoidanceTracks）、分组与查找。
// 公共 API 与拆分前完全一致（makeCustomizedTemplate 亦在此 re-export）。
// ──────────────────────────────────────────────

import { type DiagramModule, type ModuleTemplate, type TemplateCategory, type TemplateTrack } from "./types";
import {
  singlePlatform,
  singleTrackSection,
  doubleTrack,
  sidePlatformStation,
  islandPlatformStation,
  singleTrackPlatformStation,
  crossPlatformStation,
  standardizedDoubleIslandStation,
  spanishPlatformStation,
  twoIslandThreeTrackStation,
  standardizedTripleIslandStation,
  doubleTerminal,
  singleTerminal,
  preStationTurnback,
  postStationTurnback,
} from "./templates/section";
import {
  leftTurnout,
  rightTurnout,
  singleCrossover,
  doubleCrossover,
  scissorsCrossover,
  branchDiverge,
  symmetricDoubleBranch,
  doubleBranchTurnout,
  doubleForkUp,
  doubleForkDn,
  doubleForkY,
  deadEnd,
} from "./templates/turnout";
import {
  singleSiding,
  doubleSiding,
  threeTrackYard,
  fourTrackYard,
  sixTrackYard,
  yardAccess,
  depotAccess,
} from "./templates/yard";
import { makeCustomizedTemplate } from "./templates/customize";

export { makeCustomizedTemplate } from "./templates/customize";

// ── 模板注册表 ────────────────────────────────

export const MODULE_TEMPLATES: ModuleTemplate[] = [
  // A. 区间与车站
  singlePlatform,
  singleTrackSection,
  doubleTrack,
  sidePlatformStation,
  islandPlatformStation,
  singleTrackPlatformStation,
  crossPlatformStation,
  standardizedDoubleIslandStation,
  spanishPlatformStation,
  twoIslandThreeTrackStation,
  standardizedTripleIslandStation,
  doubleTerminal,
  singleTerminal,
  preStationTurnback,
  postStationTurnback,
  // B. 道岔与连接
  leftTurnout,
  rightTurnout,
  singleCrossover,
  doubleCrossover,
  scissorsCrossover,
  branchDiverge,
  symmetricDoubleBranch,
  doubleBranchTurnout,
  doubleForkUp,
  doubleForkDn,
  doubleForkY,
  deadEnd,
  // C. 场段和存车设施
  { ...singleSiding, ports: singleSiding.ports.filter((port) => port.role !== "siding") },
  { ...doubleSiding, ports: doubleSiding.ports.filter((port) => port.role !== "siding") },
  threeTrackYard,
  fourTrackYard,
  sixTrackYard,
  yardAccess,
  depotAccess,
];


/** 按分类分组模板 */
/**
 * Adds module-ID entries for parameterized templates. Connection geometry uses
 * these entries so rendered ports and connection endpoints cannot diverge.
 */
export function buildResolvedTemplateMap(
  baseTemplates: Map<string, ModuleTemplate>,
  modules: DiagramModule[],
): Map<string, ModuleTemplate> {
  const resolved = new Map(baseTemplates);
  for (const module of modules) {
    const base = baseTemplates.get(module.templateId);
    if (!base) continue;
    let template = base;
    if (base.params?.length && module.customParams) template = makeCustomizedTemplate(base, module.customParams);
    if (module.avoidanceTracks && supportsAvoidanceTracks(template.id)) {
      template = withAvoidanceTracks(template, module.lineIds.length);
    }
    if (template !== base) resolved.set(module.id, template);
  }
  return resolved;
}

const AVOIDANCE_TRACK_TEMPLATES = new Set(["island_platform", "side_platform", "cross_platform"]);

export function supportsAvoidanceTracks(templateId: string) {
  return AVOIDANCE_TRACK_TEMPLATES.has(templateId);
}

function avoidanceBranch(width: number, mainY: number, bypassY: number): TemplateTrack[] {
  const join = 22;
  const shoulder = 42;
  return [
    { x1: join, y1: mainY, x2: shoulder, y2: bypassY, type: "siding", curved: true, cx: join + 6, cy: mainY, cx2: shoulder - 6, cy2: bypassY },
    { x1: shoulder, y1: bypassY, x2: width - shoulder, y2: bypassY, type: "siding" },
    { x1: width - shoulder, y1: bypassY, x2: width - join, y2: mainY, type: "siding", curved: true, cx: width - shoulder + 6, cy: bypassY, cx2: width - join - 6, cy2: mainY },
  ];
}

/**
 * 派生带避让线的站点模板。分岔和汇入均位于模块内部，端口数组保持不变：
 * 岛式站台在两条正线外侧增加避让线；侧式站台在两条正线之间增加；
 * 同台换乘同时增加最外侧与中央避让线。
 */
export function withAvoidanceTracks(base: ModuleTemplate, lineCount = 0): ModuleTemplate {
  if (!supportsAvoidanceTracks(base.id)) return base;
  // 主轨 Y 从（可能已自定义线路间距的）模板轨道读取，保证避让线跟随 spacing 而非固定 36/76。
  const mains = base.tracks
    .filter((track) => track.type === "main" && !track.curved && track.y1 === track.y2)
    .map((track) => track.y1);
  const pairSpecs: Record<string, Array<{ main: number; bypass: number; source: number }>> = {
    island_platform: [
      { main: mains[0], bypass: (mains[0] ?? 36) - 10, source: 0 },
      { main: mains[1], bypass: (mains[1] ?? 76) + 10, source: 1 },
    ],
    side_platform: [
      { main: mains[0], bypass: (mains[0] ?? 36) + 12, source: 0 },
      { main: mains[1], bypass: (mains[1] ?? 76) - 12, source: 1 },
    ],
    cross_platform: [
      { main: mains[0], bypass: (mains[0] ?? 20) - 10, source: 0 },
      { main: mains[1], bypass: (mains[1] ?? 60) - 8, source: 1 },
      { main: mains[2], bypass: (mains[2] ?? 68) + 8, source: 2 },
      { main: mains[3], bypass: (mains[3] ?? 108) + 10, source: 3 },
    ],
  };
  const pairs = pairSpecs[base.id];
  const addedTracks = pairs.flatMap((pair) => avoidanceBranch(base.width, pair.main, pair.bypass));
  const sourcePattern = base.trackLinePattern ?? base.tracks.map((_, index) => Math.min(index, 1));
  const normalizedPattern = sourcePattern.map((value) => lineCount <= 1 ? 0 : value);
  const addedPattern = pairs.flatMap((pair) => {
    const value = lineCount <= 1 ? 0 : (sourcePattern[pair.source] ?? 0);
    return [value, value, value];
  });
  return {
    ...base,
    tracks: [...base.tracks, ...addedTracks],
    trackLinePattern: [...normalizedPattern, ...addedPattern],
  };
}

export function templatesByCategory(): Record<TemplateCategory, ModuleTemplate[]> {
  return MODULE_TEMPLATES.reduce(
    (acc, tpl) => {
      if (!acc[tpl.category]) acc[tpl.category] = [];
      acc[tpl.category].push(tpl);
      return acc;
    },
    {} as Record<TemplateCategory, ModuleTemplate[]>,
  );
}

export function findTemplate(id: string): ModuleTemplate | undefined {
  return MODULE_TEMPLATES.find((tpl) => tpl.id === id);
}

