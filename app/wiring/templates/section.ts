// ──────────────────────────────────────────────
// 配线图编辑器 · 区间与车站模板（TemplateCategory: section）
// 从 templates.ts 拆出，逐字保留原实现。
// ──────────────────────────────────────────────

import { doubleMain, leftPorts, standardizeIslandClearance, standardPorts } from "./helpers";
import { DOWN_MAIN_Y, UP_MAIN_Y, type ModuleTemplate } from "../types";

// ── A. 区间与车站 ────────────────────────────

/** 独立站台：无轨道无端口，仅一个站台矩形 */
export const singlePlatform: ModuleTemplate = {
  id: "single_platform",
  name: "单站台",
  category: "section",
  categoryName: "区间与车站",
  width: 160,
  height: 16,
  ports: [],
  tracks: [],
  platforms: [
    { x: 10, y: 0, width: 140, height: 16, type: "side", label: "站台" },
  ],
  labels: [],
  description: "独立站台，不含线路",
};

/** 单线区间：单条主线、无站台；轨道与端口 y 与单线站台一致（40），可无缝衔接 */
export const singleTrackSection: ModuleTemplate = {
  id: "single_track_section",
  name: "单线区间",
  category: "section",
  categoryName: "区间与车站",
  width: 160,
  height: 68,
  ports: [
    { id: "L_main", name: "左·主线", side: "left", role: "up_main", x: 0, y: 40, direction: 180 },
    { id: "R_main", name: "右·主线", side: "right", role: "up_main", x: 160, y: 40, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 40, x2: 160, y2: 40, type: "main" },
  ],
  platforms: [],
  labels: [],
  description: "单线区间，无站台",
};

export const doubleTrack: ModuleTemplate = {
  id: "double_track",
  name: "双线区间",
  category: "section",
  categoryName: "区间与车站",
  width: 160,
  height: 112,
  ports: standardPorts(160),
  tracks: doubleMain(160),
  platforms: [],
  labels: [],
  description: "上下行双线区间，无站台",
  params: [{ key: "spacing", label: "线路间距", min: 10, max: 128, default: 40, unit: "px" }],
};

export const sidePlatformStation: ModuleTemplate = {
  id: "side_platform",
  name: "侧式站台站",
  category: "section",
  categoryName: "区间与车站",
  width: 180,
  height: 112,
  ports: standardPorts(180),
  tracks: doubleMain(180),
  platforms: [
    { x: 10, y: 16, width: 160, height: 16, type: "side", label: "侧式站台" },
    { x: 10, y: 80, width: 160, height: 16, type: "side", label: "侧式站台" },
  ],
  labels: [
    { x: 90, y: 14, text: "站名", fontSize: 13, anchor: "middle", fill: "#202124" },
    { x: 90, y: 105, text: "Station", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "侧式站台中间站，两条站台分别位于正线两侧",
  params: [
    { key: "spacing", label: "线路间距", min: 10, max: 128, default: 40, unit: "px" },
    { key: "platformLength", label: "站台长度", min: 60, max: 240, default: 160, unit: "px" },
    { key: "platformWidth", label: "站台宽度", min: 8, max: 24, default: 16, unit: "px" },
  ],
};

export const islandPlatformStation: ModuleTemplate = {
  id: "island_platform",
  name: "岛式站台站",
  category: "section",
  categoryName: "区间与车站",
  width: 180,
  height: 112,
  ports: standardPorts(180),
  tracks: doubleMain(180),
  platforms: [
    { x: 10, y: 48, width: 160, height: 16, type: "island", label: "岛式站台" },
  ],
  labels: [
    // 站名底缘放在上行轨（y=36）上方 6px，避免字形压住轨道
    { x: 90, y: 30, text: "站名", fontSize: 13, anchor: "middle", fill: "#202124" },
    { x: 90, y: 100, text: "Station", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "岛式站台中间站，单个站台位于两条正线之间",
  params: [
    { key: "spacing", label: "线路间距", min: 10, max: 128, default: 40, unit: "px" },
    { key: "platformLength", label: "站台长度", min: 60, max: 240, default: 160, unit: "px" },
    { key: "platformWidth", label: "站台宽度", min: 8, max: 24, default: 16, unit: "px" },
  ],
};

export const singleTrackPlatformStation: ModuleTemplate = {
  id: "single_track_platform",
  name: "单线站台",
  category: "section",
  categoryName: "区间与车站",
  width: 160,
  height: 68,
  ports: [
    { id: "L_main", name: "左·主线", side: "left", role: "up_main", x: 0, y: 40, direction: 180 },
    { id: "R_main", name: "右·主线", side: "right", role: "up_main", x: 160, y: 40, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 40, x2: 160, y2: 40, type: "main" },
  ],
  platforms: [
    { x: 10, y: 16, width: 140, height: 16, type: "side", label: "侧式站台" },
  ],
  labels: [
    { x: 80, y: 12, text: "站名", fontSize: 13, anchor: "middle", fill: "#202124" },
    { x: 80, y: 62, text: "Station", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "单线侧式站台，适用于单线铁路或支线车站",
};

export const crossPlatformStation: ModuleTemplate = {
  id: "cross_platform",
  name: "同台换乘站",
  category: "section",
  categoryName: "区间与车站",
  width: 200,
  height: 128,
  ports: [
    { id: "L_up1", name: "左·上行1", side: "left", role: "up_main", x: 0, y: 20, direction: 180 },
    { id: "L_up2", name: "左·上行2", side: "left", role: "up_main", x: 0, y: 60, direction: 180 },
    { id: "L_dn2", name: "左·下行2", side: "left", role: "down_main", x: 0, y: 68, direction: 180 },
    { id: "L_dn1", name: "左·下行1", side: "left", role: "down_main", x: 0, y: 108, direction: 180 },
    { id: "R_up1", name: "右·上行1", side: "right", role: "up_main", x: 200, y: 20, direction: 0 },
    { id: "R_up2", name: "右·上行2", side: "right", role: "up_main", x: 200, y: 60, direction: 0 },
    { id: "R_dn2", name: "右·下行2", side: "right", role: "down_main", x: 200, y: 68, direction: 0 },
    { id: "R_dn1", name: "右·下行1", side: "right", role: "down_main", x: 200, y: 108, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 20, x2: 200, y2: 20, type: "main" },
    { x1: 0, y1: 60, x2: 200, y2: 60, type: "main" },
    { x1: 0, y1: 68, x2: 200, y2: 68, type: "main" },
    { x1: 0, y1: 108, x2: 200, y2: 108, type: "main" },
  ],
  platforms: [
    { x: 10, y: 32, width: 180, height: 16, type: "island", label: "同台换乘" },
    { x: 10, y: 80, width: 180, height: 16, type: "island", label: "同台换乘" },
  ],
  labels: [
    { x: 100, y: 14, text: "站名", fontSize: 13, anchor: "middle", fill: "#202124" },
    { x: 100, y: 120, text: "Station", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  trackLinePattern: [0, 1, 1, 0],
  description: "同台换乘站，两条线路各自上、下行同向共用两个岛式站台，换乘不出站",
  params: [{ key: "spacing", label: "线路间距", min: 10, max: 128, default: 32, unit: "px" }],
};

export const doubleIslandStation: ModuleTemplate = {
  id: "double_island",
  name: "双岛四线站",
  category: "section",
  categoryName: "区间与车站",
  width: 200,
  height: 120,
  ports: [
    { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: 20, direction: 180 },
    { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: 52, direction: 180 },
    { id: "L_up2", name: "左·上行2", side: "left", role: "up_main", x: 0, y: 68, direction: 180 },
    { id: "L_dn2", name: "左·下行2", side: "left", role: "down_main", x: 0, y: 100, direction: 180 },
    { id: "R_up1", name: "右·上行", side: "right", role: "up_main", x: 200, y: 20, direction: 0 },
    { id: "R_dn1", name: "右·下行", side: "right", role: "down_main", x: 200, y: 52, direction: 0 },
    { id: "R_up2", name: "右·上行2", side: "right", role: "up_main", x: 200, y: 68, direction: 0 },
    { id: "R_dn2", name: "右·下行2", side: "right", role: "down_main", x: 200, y: 100, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 20, x2: 200, y2: 20, type: "main" },
    { x1: 0, y1: 52, x2: 200, y2: 52, type: "main" },
    { x1: 0, y1: 68, x2: 200, y2: 68, type: "main" },
    { x1: 0, y1: 100, x2: 200, y2: 100, type: "main" },
  ],
  platforms: [
    { x: 10, y: 28, width: 180, height: 16, type: "island", label: "岛式站台" },
    { x: 10, y: 76, width: 180, height: 16, type: "island", label: "岛式站台" },
  ],
  labels: [
    { x: 100, y: 14, text: "站名", fontSize: 13, anchor: "middle", fill: "#202124" },
    { x: 100, y: 112, text: "Station", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "双岛四线站，两个岛式站台各服务两条正线",
  params: [
    { key: "islandGap", label: "岛间间距", min: 24, max: 80, default: 32, step: 4, unit: "px" },
  ],
};

export const spanishPlatformStation: ModuleTemplate = {
  id: "spanish_platform",
  name: "西班牙式站台",
  category: "section",
  categoryName: "区间与车站",
  width: 180,
  height: 112,
  ports: standardPorts(180),
  tracks: doubleMain(180),
  platforms: [
    { x: 10, y: 16, width: 160, height: 16, type: "side", label: "侧式站台" },
    { x: 10, y: 48, width: 160, height: 16, type: "island", label: "岛式站台" },
    { x: 10, y: 80, width: 160, height: 16, type: "side", label: "侧式站台" },
  ],
  labels: [
    { x: 90, y: 14, text: "站名", fontSize: 13, anchor: "middle", fill: "#202124" },
    { x: 90, y: 105, text: "Station", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "西班牙式站台，岛式站台居中、两侧各设侧式站台，列车双侧开门",
  params: [
    { key: "spacing", label: "线路间距", min: 10, max: 128, default: 40, unit: "px" },
    { key: "platformLength", label: "站台长度", min: 60, max: 240, default: 160, unit: "px" },
    { key: "platformWidth", label: "站台宽度", min: 8, max: 24, default: 16, unit: "px" },
  ],
};

export const twoIslandThreeTrackStation: ModuleTemplate = {
  id: "two_island_three_track",
  name: "两岛三线站台",
  category: "section",
  categoryName: "区间与车站",
  width: 200,
  height: 120,
  ports: [
    { id: "L_t1", name: "左·线路1(上)", side: "left", role: "up_main", x: 0, y: 20, direction: 180 },
    { id: "L_t2", name: "左·线路2", side: "left", role: "down_main", x: 0, y: 60, direction: 180 },
    { id: "L_t3", name: "左·线路1(下)", side: "left", role: "up_main", x: 0, y: 100, direction: 180 },
    { id: "R_t1", name: "右·线路1(上)", side: "right", role: "up_main", x: 200, y: 20, direction: 0 },
    { id: "R_t2", name: "右·线路2", side: "right", role: "down_main", x: 200, y: 60, direction: 0 },
    { id: "R_t3", name: "右·线路1(下)", side: "right", role: "up_main", x: 200, y: 100, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 20, x2: 200, y2: 20, type: "main" },
    { x1: 0, y1: 60, x2: 200, y2: 60, type: "main" },
    { x1: 0, y1: 100, x2: 200, y2: 100, type: "main" },
  ],
  platforms: [
    { x: 10, y: 32, width: 180, height: 16, type: "island", label: "岛式站台" },
    { x: 10, y: 72, width: 180, height: 16, type: "island", label: "岛式站台" },
  ],
  labels: [
    { x: 100, y: 14, text: "站名", fontSize: 13, anchor: "middle", fill: "#202124" },
    { x: 100, y: 114, text: "Station", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  trackLinePattern: [0, 1, 0],
  description: "两岛三线站台，两侧线路1、中间线路2，两个岛式站台分别位于线路1与线路2之间",
};

export const tripleIslandStation: ModuleTemplate = {
  id: "triple_island",
  name: "三岛四线站",
  category: "section",
  categoryName: "区间与车站",
  width: 200,
  height: 136,
  ports: [
    { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: 20, direction: 180 },
    { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: 52, direction: 180 },
    { id: "L_up2", name: "左·上行2", side: "left", role: "up_main", x: 0, y: 84, direction: 180 },
    { id: "L_dn2", name: "左·下行2", side: "left", role: "down_main", x: 0, y: 116, direction: 180 },
    { id: "R_up1", name: "右·上行", side: "right", role: "up_main", x: 200, y: 20, direction: 0 },
    { id: "R_dn1", name: "右·下行", side: "right", role: "down_main", x: 200, y: 52, direction: 0 },
    { id: "R_up2", name: "右·上行2", side: "right", role: "up_main", x: 200, y: 84, direction: 0 },
    { id: "R_dn2", name: "右·下行2", side: "right", role: "down_main", x: 200, y: 116, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 20, x2: 200, y2: 20, type: "main" },
    { x1: 0, y1: 52, x2: 200, y2: 52, type: "main" },
    { x1: 0, y1: 84, x2: 200, y2: 84, type: "main" },
    { x1: 0, y1: 116, x2: 200, y2: 116, type: "main" },
  ],
  platforms: [
    { x: 10, y: 28, width: 180, height: 16, type: "island", label: "岛式站台" },
    { x: 10, y: 60, width: 180, height: 16, type: "island", label: "岛式站台" },
    { x: 10, y: 92, width: 180, height: 16, type: "island", label: "岛式站台" },
  ],
  labels: [
    { x: 100, y: 14, text: "站名", fontSize: 13, anchor: "middle", fill: "#202124" },
    { x: 100, y: 128, text: "Station", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "三岛四线站，三个岛式站台依次夹在四条正线之间",
};


export const standardizedDoubleIslandStation = standardizeIslandClearance(doubleIslandStation, [20, 60, 68, 108], [32, 80], 128, 120);
export const standardizedTripleIslandStation = standardizeIslandClearance(tripleIslandStation, [20, 60, 100, 140], [32, 72, 112], 160, 152);

export const doubleTerminal: ModuleTemplate = {
  id: "double_terminal",
  name: "双线终点站",
  category: "section",
  categoryName: "区间与车站",
  width: 140,
  height: 112,
  ports: leftPorts(),
  tracks: [
    { x1: 0, y1: UP_MAIN_Y, x2: 120, y2: UP_MAIN_Y, type: "main" },
    { x1: 0, y1: DOWN_MAIN_Y, x2: 120, y2: DOWN_MAIN_Y, type: "main" },
    { x1: 116, y1: UP_MAIN_Y - 5, x2: 124, y2: UP_MAIN_Y + 5, type: "main" },
    { x1: 116, y1: DOWN_MAIN_Y - 5, x2: 124, y2: DOWN_MAIN_Y + 5, type: "main" },
  ],
  platforms: [
    { x: 20, y: 48, width: 90, height: 16, type: "island", label: "终点站台" },
  ],
  labels: [
    { x: 60, y: 40, text: "终点站", fontSize: 13, anchor: "middle", fill: "#202124" },
  ],
  description: "双线终点站，上下行正线在此终止",
};

export const singleTerminal: ModuleTemplate = {
  id: "single_terminal",
  name: "单线终点站",
  category: "section",
  categoryName: "区间与车站",
  width: 100,
  height: 80,
  ports: [
    { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: 40, direction: 180 },
  ],
  tracks: [
    { x1: 0, y1: 40, x2: 80, y2: 40, type: "main" },
    { x1: 76, y1: 35, x2: 84, y2: 45, type: "main" },
  ],
  platforms: [
    { x: 20, y: 16, width: 50, height: 16, type: "side", label: "侧式站台" },
  ],
  labels: [
    { x: 40, y: 12, text: "终点", fontSize: 11, anchor: "middle", fill: "#202124" },
  ],
  description: "单线终点站，仅一条正线到达",
};

export const preStationTurnback: ModuleTemplate = {
  id: "pre_turnback",
  name: "站前折返站",
  category: "section",
  categoryName: "区间与车站",
  width: 200,
  height: 112,
  ports: standardPorts(200),
  tracks: [
    ...doubleMain(200),
    // 折返渡线（斜向直线，与交叉渡线风格一致）
    { x1: 15, y1: UP_MAIN_Y, x2: 90, y2: DOWN_MAIN_Y, type: "turnback" },
    { x1: 15, y1: DOWN_MAIN_Y, x2: 90, y2: UP_MAIN_Y, type: "turnback" },
  ],
  platforms: [
    { x: 100, y: 48, width: 80, height: 16, type: "island", label: "折返站台" },
  ],
  labels: [
    { x: 140, y: 40, text: "折返站", fontSize: 13, anchor: "middle", fill: "#202124" },
    { x: 15, y: 100, text: "← 折返", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "站前折返站，列车在进站前折返",
  params: [
    { key: "platformLength", label: "站台长度", min: 60, max: 240, default: 80, unit: "px" },
    { key: "platformWidth", label: "站台宽度", min: 8, max: 24, default: 16, unit: "px" },
  ],
};

export const postStationTurnback: ModuleTemplate = {
  id: "post_turnback",
  name: "站后折返站",
  category: "section",
  categoryName: "区间与车站",
  width: 200,
  height: 112,
  ports: standardPorts(200),
  tracks: [
    ...doubleMain(200),
    // 折返渡线在站后（斜向直线）
    { x1: 110, y1: UP_MAIN_Y, x2: 185, y2: DOWN_MAIN_Y, type: "turnback" },
    { x1: 110, y1: DOWN_MAIN_Y, x2: 185, y2: UP_MAIN_Y, type: "turnback" },
  ],
  platforms: [
    { x: 20, y: 48, width: 80, height: 16, type: "island", label: "折返站台" },
  ],
  labels: [
    { x: 65, y: 40, text: "折返站", fontSize: 13, anchor: "middle", fill: "#202124" },
    { x: 175, y: 100, text: "折返 →", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "站后折返站，列车在出站后折返",
  params: [
    { key: "platformLength", label: "站台长度", min: 60, max: 240, default: 80, unit: "px" },
    { key: "platformWidth", label: "站台宽度", min: 8, max: 24, default: 16, unit: "px" },
  ],
};

