// ──────────────────────────────────────────────
// 配线图编辑器 · 模块模板共享辅助
// 从 templates.ts 拆出；供 section/turnout/yard 模板文件复用。
// ──────────────────────────────────────────────

import { DOWN_MAIN_Y, UP_MAIN_Y, type ModulePort, type ModuleTemplate, type TemplateTrack } from "../types";

/** 创建水平双线正线轨道 */
export function doubleMain(w: number): TemplateTrack[] {
  return [
    { x1: 0, y1: UP_MAIN_Y, x2: w, y2: UP_MAIN_Y, type: "main" },
    { x1: 0, y1: DOWN_MAIN_Y, x2: w, y2: DOWN_MAIN_Y, type: "main" },
  ];
}

/** 创建标准四端口（左右各上下行） */
export function standardPorts(w: number): ModulePort[] {
  return [
    { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: UP_MAIN_Y, direction: 180 },
    { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: DOWN_MAIN_Y, direction: 180 },
    { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: w, y: UP_MAIN_Y, direction: 0 },
    { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: w, y: DOWN_MAIN_Y, direction: 0 },
  ];
}

/** 创建仅左侧端口（终点站） */
export function leftPorts(): ModulePort[] {
  return [
    { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: UP_MAIN_Y, direction: 180 },
    { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: DOWN_MAIN_Y, direction: 180 },
  ];
}

// Keep island platforms twelve pixels from each adjacent track, matching the
// ordinary island station geometry. The old multi-island templates used eight.
export function standardizeIslandClearance(template: ModuleTemplate, trackYs: number[], platformYs: number[], height: number, stationLabelY: number): ModuleTemplate {
  return {
    ...template,
    height,
    ports: template.ports.map((port, index) => ({ ...port, y: trackYs[index % 4] })),
    tracks: trackYs.map((y) => ({ x1: 0, y1: y, x2: template.width, y2: y, type: "main" as const })),
    platforms: template.platforms.map((platform, index) => ({ ...platform, y: platformYs[index] })),
    labels: template.labels.map((label, index) => index === 1 ? { ...label, y: stationLabelY } : label),
  };
}

