// ──────────────────────────────────────────────
// 配线图编辑器 · 模块模板系统
// 每个模板使用局部坐标，包含轨道、站台、标签和端口
// ──────────────────────────────────────────────

import {
  DOWN_MAIN_Y,
  DiagramModule,
  ModulePort,
  ModuleTemplate,
  TemplateCategory,
  TemplateLabel,
  TemplateParam,
  TemplatePlatform,
  TemplateTrack,
  UP_MAIN_Y,
} from "./types";

// ── 辅助函数 ──────────────────────────────────

/** 创建水平双线正线轨道 */
function doubleMain(w: number): TemplateTrack[] {
  return [
    { x1: 0, y1: UP_MAIN_Y, x2: w, y2: UP_MAIN_Y, type: "main" },
    { x1: 0, y1: DOWN_MAIN_Y, x2: w, y2: DOWN_MAIN_Y, type: "main" },
  ];
}

/** 创建标准四端口（左右各上下行） */
function standardPorts(w: number): ModulePort[] {
  return [
    { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: UP_MAIN_Y, direction: 180 },
    { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: DOWN_MAIN_Y, direction: 180 },
    { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: w, y: UP_MAIN_Y, direction: 0 },
    { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: w, y: DOWN_MAIN_Y, direction: 0 },
  ];
}

/** 创建仅左侧端口（终点站） */
function leftPorts(): ModulePort[] {
  return [
    { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: UP_MAIN_Y, direction: 180 },
    { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: DOWN_MAIN_Y, direction: 180 },
  ];
}

// ── A. 区间与车站 ────────────────────────────

/** 独立站台：无轨道无端口，仅一个站台矩形 */
const singlePlatform: ModuleTemplate = {
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
const singleTrackSection: ModuleTemplate = {
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

const doubleTrack: ModuleTemplate = {
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
};

const sidePlatformStation: ModuleTemplate = {
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
};

const islandPlatformStation: ModuleTemplate = {
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
};

const singleTrackPlatformStation: ModuleTemplate = {
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

const crossPlatformStation: ModuleTemplate = {
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
};

const doubleIslandStation: ModuleTemplate = {
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

const spanishPlatformStation: ModuleTemplate = {
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
};

const twoIslandThreeTrackStation: ModuleTemplate = {
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

const tripleIslandStation: ModuleTemplate = {
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

// Keep island platforms twelve pixels from each adjacent track, matching the
// ordinary island station geometry. The old multi-island templates used eight.
function standardizeIslandClearance(template: ModuleTemplate, trackYs: number[], platformYs: number[], height: number, stationLabelY: number): ModuleTemplate {
  return {
    ...template,
    height,
    ports: template.ports.map((port, index) => ({ ...port, y: trackYs[index % 4] })),
    tracks: trackYs.map((y) => ({ x1: 0, y1: y, x2: template.width, y2: y, type: "main" as const })),
    platforms: template.platforms.map((platform, index) => ({ ...platform, y: platformYs[index] })),
    labels: template.labels.map((label, index) => index === 1 ? { ...label, y: stationLabelY } : label),
  };
}

const standardizedDoubleIslandStation = standardizeIslandClearance(doubleIslandStation, [20, 60, 68, 108], [32, 80], 128, 120);
const standardizedTripleIslandStation = standardizeIslandClearance(tripleIslandStation, [20, 60, 100, 140], [32, 72, 112], 160, 152);

const doubleTerminal: ModuleTemplate = {
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

const singleTerminal: ModuleTemplate = {
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

const preStationTurnback: ModuleTemplate = {
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

const postStationTurnback: ModuleTemplate = {
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

// ── B. 道岔与连接 ────────────────────────────

const leftTurnout: ModuleTemplate = {
  id: "left_turnout",
  name: "左开道岔",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 80,
  height: 80,
  ports: [
    { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: 48, direction: 180 },
    { id: "R_main", name: "右·直股", side: "right", role: "up_main", x: 80, y: 48, direction: 0 },
    { id: "R_branch", name: "右·侧股", side: "right", role: "branch", x: 80, y: 24, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 48, x2: 80, y2: 48, type: "main" },
    { x1: 40, y1: 48, x2: 80, y2: 24, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 40, y: 68, text: "左开", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "左开道岔，侧股向左分岔",
  params: [
    { key: "length", label: "长度", min: 40, max: 300, default: 80, unit: "px" },
    { key: "branchOffset", label: "开口幅度", min: 12, max: 48, default: 24, unit: "px" },
  ],
};

const rightTurnout: ModuleTemplate = {
  id: "right_turnout",
  name: "右开道岔",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 80,
  height: 80,
  ports: [
    { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: 48, direction: 180 },
    { id: "R_main", name: "右·直股", side: "right", role: "up_main", x: 80, y: 48, direction: 0 },
    { id: "R_branch", name: "右·侧股", side: "right", role: "branch", x: 80, y: 72, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 48, x2: 80, y2: 48, type: "main" },
    { x1: 40, y1: 48, x2: 80, y2: 72, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 40, y: 28, text: "右开", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "右开道岔，侧股向右分岔",
  params: [
    { key: "length", label: "长度", min: 40, max: 300, default: 80, unit: "px" },
    { key: "branchOffset", label: "开口幅度", min: 12, max: 48, default: 24, unit: "px" },
  ],
};

const singleCrossover: ModuleTemplate = {
  id: "single_crossover",
  name: "单渡线",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 100,
  height: 112,
  ports: standardPorts(100),
  tracks: [
    ...doubleMain(100),
    { x1: 30, y1: UP_MAIN_Y, x2: 70, y2: DOWN_MAIN_Y, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 50, y: 100, text: "单渡线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "单渡线，连接上下行正线的一条渡线",
  params: [
    { key: "length", label: "长度", min: 40, max: 300, default: 100, unit: "px" },
    { key: "spacing", label: "线路间距", min: 10, max: 128, default: 40, unit: "px" },
  ],
};

const doubleCrossover: ModuleTemplate = {
  id: "double_crossover",
  name: "交叉渡线",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 120,
  height: 112,
  ports: standardPorts(120),
  tracks: [
    ...doubleMain(120),
    { x1: 20, y1: UP_MAIN_Y, x2: 100, y2: DOWN_MAIN_Y, type: "branch" },
    { x1: 20, y1: DOWN_MAIN_Y, x2: 100, y2: UP_MAIN_Y, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 60, y: 100, text: "交叉渡线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "交叉渡线，两条渡线交叉形成菱形",
  params: [
    { key: "length", label: "长度", min: 40, max: 300, default: 120, unit: "px" },
    { key: "spacing", label: "线路间距", min: 10, max: 128, default: 40, unit: "px" },
  ],
};

const deadEnd: ModuleTemplate = {
  id: "dead_end",
  name: "尽头线",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 60,
  height: 40,
  ports: [
    { id: "L_main", name: "左·入口", side: "left", role: "siding", x: 0, y: 20, direction: 180 },
  ],
  tracks: [
    { x1: 0, y1: 20, x2: 48, y2: 20, type: "siding" },
    { x1: 44, y1: 15, x2: 52, y2: 25, type: "siding" },
  ],
  platforms: [],
  labels: [
    { x: 30, y: 10, text: "尽头", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "尽头线，轨道终止的尽端",
};

// ── B-7. 双支线分叉 ────────────────────────────

const doubleBranchTurnout: ModuleTemplate = {
  id: "double_branch",
  name: "双支线分叉",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 100,
  height: 112,
  ports: [
    { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: 56, direction: 180 },
    { id: "R_up", name: "右·上支", side: "right", role: "branch", x: 100, y: 28, direction: 0 },
    { id: "R_dn", name: "右·下支", side: "right", role: "branch", x: 100, y: 84, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 56, x2: 50, y2: 56, type: "main" },
    { x1: 50, y1: 56, x2: 100, y2: 28, type: "branch" },
    { x1: 50, y1: 56, x2: 100, y2: 84, type: "branch" },
  ],
  platforms: [],
  labels: [{ x: 50, y: 108, text: "双支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" }],
  description: "双支线分叉，主线分岔为上下两条支线",
  params: [
    { key: "length", label: "长度", min: 40, max: 300, default: 100, unit: "px" },
    { key: "branchOffset", label: "开口幅度", min: 12, max: 48, default: 28, unit: "px" },
  ],
};

// ── B-6d. 双线斜向分叉（双线直行 + 双线斜支线 / 双线 Y 形） ──
// 与既有分叉不同：一条双线（上下行）分成两条双线，分支端口 direction 取斜段实际角度，
// 连接出去才真正带斜度。直股对与支线对都各保留上下行双轨，用车道号（1/2）区分配对：
// R_up1↔R_dn1（直股）、R_up2↔R_dn2（支线），findDoubleTrackPartner 按尾号自动配对。

const doubleForkUp: ModuleTemplate = {
  id: "double_fork_up",
  name: "双线斜上分叉",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 260,
  height: 128,
  ports: [
    { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: 76, direction: 180 },
    { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: 116, direction: 180 },
    { id: "R_up1", name: "右·直股上行", side: "right", role: "up_main", x: 260, y: 76, direction: 0 },
    { id: "R_dn1", name: "右·直股下行", side: "right", role: "down_main", x: 260, y: 116, direction: 0 },
    { id: "R_up2", name: "右·支线上行", side: "right", role: "up_main", x: 260, y: 12, direction: 334 },
    { id: "R_dn2", name: "右·支线下行", side: "right", role: "down_main", x: 260, y: 52, direction: 334 },
  ],
  tracks: [
    { x1: 0, y1: 76, x2: 260, y2: 76, type: "main" },
    { x1: 0, y1: 116, x2: 260, y2: 116, type: "main" },
    { x1: 130, y1: 76, x2: 260, y2: 12, type: "branch" },
    { x1: 130, y1: 116, x2: 260, y2: 52, type: "branch" },
  ],
  platforms: [],
  labels: [{ x: 40, y: 30, text: "上分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" }],
  description: "双线主干直行，另分出一条双线斜向上的支线",
  params: [
    { key: "length", label: "长度", min: 40, max: 400, default: 260, unit: "px" },
    { key: "spacing", label: "线间距", min: 10, max: 128, default: 40, unit: "px" },
    { key: "angle", label: "开合角度", min: 17, max: 30, default: 26.2, unit: "°" },
  ],
};

const doubleForkDn: ModuleTemplate = {
  id: "double_fork_dn",
  name: "双线斜下分叉",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 260,
  height: 144,
  ports: [
    { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: 36, direction: 180 },
    { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: 76, direction: 180 },
    { id: "R_up1", name: "右·直股上行", side: "right", role: "up_main", x: 260, y: 36, direction: 0 },
    { id: "R_dn1", name: "右·直股下行", side: "right", role: "down_main", x: 260, y: 76, direction: 0 },
    { id: "R_up2", name: "右·支线上行", side: "right", role: "up_main", x: 260, y: 92, direction: 23 },
    { id: "R_dn2", name: "右·支线下行", side: "right", role: "down_main", x: 260, y: 132, direction: 23 },
  ],
  tracks: [
    { x1: 0, y1: 36, x2: 260, y2: 36, type: "main" },
    { x1: 0, y1: 76, x2: 260, y2: 76, type: "main" },
    { x1: 130, y1: 36, x2: 260, y2: 92, type: "branch" },
    { x1: 130, y1: 76, x2: 260, y2: 132, type: "branch" },
  ],
  platforms: [],
  labels: [{ x: 40, y: 26, text: "下分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" }],
  description: "双线主干直行，另分出一条双线斜向下的支线",
  params: [
    { key: "length", label: "长度", min: 40, max: 400, default: 260, unit: "px" },
    { key: "spacing", label: "线间距", min: 10, max: 128, default: 40, unit: "px" },
    { key: "angle", label: "开合角度", min: 8, max: 60, default: 23.3, unit: "°" },
  ],
};

const doubleForkY: ModuleTemplate = {
  id: "double_fork_y",
  name: "双线Y形分叉",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 260,
  height: 144,
  ports: [
    { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: 52, direction: 180 },
    { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: 92, direction: 180 },
    { id: "R_up1", name: "右·上支上行", side: "right", role: "up_main", x: 260, y: 12, direction: 343 },
    { id: "R_dn1", name: "右·上支下行", side: "right", role: "down_main", x: 260, y: 52, direction: 343 },
    { id: "R_up2", name: "右·下支上行", side: "right", role: "up_main", x: 260, y: 92, direction: 17 },
    { id: "R_dn2", name: "右·下支下行", side: "right", role: "down_main", x: 260, y: 132, direction: 17 },
  ],
  tracks: [
    { x1: 0, y1: 52, x2: 130, y2: 52, type: "main" },
    { x1: 0, y1: 92, x2: 130, y2: 92, type: "main" },
    { x1: 130, y1: 52, x2: 260, y2: 12, type: "branch" },
    { x1: 130, y1: 92, x2: 260, y2: 52, type: "branch" },
    { x1: 130, y1: 52, x2: 260, y2: 92, type: "branch" },
    { x1: 130, y1: 92, x2: 260, y2: 132, type: "branch" },
  ],
  platforms: [],
  labels: [{ x: 40, y: 36, text: "Y形分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" }],
  description: "双线一进二出，分成两条对称的双线斜向支线",
  params: [
    { key: "length", label: "长度", min: 40, max: 400, default: 260, unit: "px" },
    { key: "spacing", label: "线间距", min: 10, max: 128, default: 40, unit: "px" },
    { key: "angle", label: "开合角度", min: 9, max: 21, default: 17.1, unit: "°" },
  ],
};

// ── C. 场段和存车设施 ──────────────────────────

const singleSiding: ModuleTemplate = {
  id: "single_siding",
  name: "单条存车线",
  category: "yard",
  categoryName: "场段和存车设施",
  width: 140,
  height: 80,
  ports: [
    { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: 48, direction: 180 },
    { id: "L_siding", name: "左·存车", side: "left", role: "siding", x: 20, y: 24, direction: 180 },
    { id: "R_main", name: "右·正线", side: "right", role: "up_main", x: 140, y: 48, direction: 0 },
    { id: "R_siding", name: "右·存车", side: "right", role: "siding", x: 120, y: 24, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 48, x2: 140, y2: 48, type: "main" },
    { x1: 40, y1: 24, x2: 100, y2: 24, type: "siding" },
    { x1: 20, y1: 48, x2: 40, y2: 24, type: "branch" },
    { x1: 100, y1: 24, x2: 120, y2: 48, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 70, y: 68, text: "存车线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "单条存车线，正线旁设一条存车侧线",
};

const doubleSiding: ModuleTemplate = {
  id: "double_siding",
  name: "双条存车线",
  category: "yard",
  categoryName: "场段和存车设施",
  width: 140,
  height: 100,
  ports: [
    { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: 50, direction: 180 },
    { id: "L_sd1", name: "左·存车1", side: "left", role: "siding", x: 20, y: 24, direction: 180 },
    { id: "L_sd2", name: "左·存车2", side: "left", role: "siding", x: 20, y: 76, direction: 180 },
    { id: "R_main", name: "右·正线", side: "right", role: "up_main", x: 140, y: 50, direction: 0 },
    { id: "R_sd1", name: "右·存车1", side: "right", role: "siding", x: 120, y: 24, direction: 0 },
    { id: "R_sd2", name: "右·存车2", side: "right", role: "siding", x: 120, y: 76, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 50, x2: 140, y2: 50, type: "main" },
    { x1: 40, y1: 24, x2: 100, y2: 24, type: "siding" },
    { x1: 40, y1: 76, x2: 100, y2: 76, type: "siding" },
    { x1: 20, y1: 50, x2: 40, y2: 24, type: "branch" },
    { x1: 20, y1: 50, x2: 40, y2: 76, type: "branch" },
    { x1: 100, y1: 24, x2: 120, y2: 50, type: "branch" },
    { x1: 100, y1: 76, x2: 120, y2: 50, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 70, y: 12, text: "存车线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
    { x: 70, y: 92, text: "存车线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "双条存车线，正线两侧各设一条存车侧线",
};

const threeTrackYard: ModuleTemplate = {
  id: "three_track_yard",
  name: "三线停车场",
  category: "yard",
  categoryName: "场段和存车设施",
  width: 160,
  height: 120,
  ports: [
    { id: "L_main", name: "左·入段", side: "left", role: "yard", x: 0, y: 60, direction: 180 },
    { id: "R_y1", name: "右·股道1", side: "right", role: "yard", x: 160, y: 20, direction: 0 },
    { id: "R_y2", name: "右·股道2", side: "right", role: "yard", x: 160, y: 60, direction: 0 },
    { id: "R_y3", name: "右·股道3", side: "right", role: "yard", x: 160, y: 100, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 60, x2: 20, y2: 60, type: "yard" },
    { x1: 60, y1: 20, x2: 160, y2: 20, type: "yard" },
    { x1: 20, y1: 60, x2: 160, y2: 60, type: "yard" },
    { x1: 60, y1: 100, x2: 160, y2: 100, type: "yard" },
    // 线束道岔（斜向扇形展开）
    { x1: 20, y1: 60, x2: 60, y2: 20, type: "branch" },
    { x1: 20, y1: 60, x2: 60, y2: 100, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 100, y: 14, text: "股道1", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 100, y: 54, text: "股道2", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 100, y: 94, text: "股道3", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 20, y: 72, text: "入段", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "三线停车场线束，三条股道呈扇形展开",
};

const fourTrackYard: ModuleTemplate = {
  id: "four_track_yard",
  name: "四线停车场",
  category: "yard",
  categoryName: "场段和存车设施",
  width: 180,
  height: 140,
  ports: [
    { id: "L_main", name: "左·入段", side: "left", role: "yard", x: 0, y: 70, direction: 180 },
    { id: "R_y1", name: "右·股道1", side: "right", role: "yard", x: 180, y: 16, direction: 0 },
    { id: "R_y2", name: "右·股道2", side: "right", role: "yard", x: 180, y: 48, direction: 0 },
    { id: "R_y3", name: "右·股道3", side: "right", role: "yard", x: 180, y: 92, direction: 0 },
    { id: "R_y4", name: "右·股道4", side: "right", role: "yard", x: 180, y: 124, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 70, x2: 20, y2: 70, type: "yard" },
    { x1: 70, y1: 16, x2: 180, y2: 16, type: "yard" },
    { x1: 50, y1: 48, x2: 180, y2: 48, type: "yard" },
    { x1: 50, y1: 92, x2: 180, y2: 92, type: "yard" },
    { x1: 70, y1: 124, x2: 180, y2: 124, type: "yard" },
    // 线束道岔（斜向扇形展开）
    { x1: 20, y1: 70, x2: 50, y2: 48, type: "branch" },
    { x1: 50, y1: 48, x2: 70, y2: 16, type: "branch" },
    { x1: 20, y1: 70, x2: 50, y2: 92, type: "branch" },
    { x1: 50, y1: 92, x2: 70, y2: 124, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 125, y: 10, text: "G1", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 115, y: 42, text: "G2", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 115, y: 86, text: "G3", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 125, y: 118, text: "G4", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "四线停车场线束，四条股道呈扇形展开",
};

// ── B-5. 剪式渡线 ────────────────────────────

const scissorsCrossover: ModuleTemplate = {
  id: "scissors_crossover",
  name: "剪式渡线",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 140,
  height: 112,
  ports: standardPorts(140),
  tracks: [
    ...doubleMain(140),
    // 两条渡线在中间交叉，形成剪刀形
    { x1: 20, y1: UP_MAIN_Y, x2: 70, y2: DOWN_MAIN_Y, type: "branch" },
    { x1: 70, y1: UP_MAIN_Y, x2: 120, y2: DOWN_MAIN_Y, type: "branch" },
    { x1: 20, y1: DOWN_MAIN_Y, x2: 70, y2: UP_MAIN_Y, type: "branch" },
    { x1: 70, y1: DOWN_MAIN_Y, x2: 120, y2: UP_MAIN_Y, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 70, y: 100, text: "剪式渡线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "剪式渡线，两条单渡线交叉形成剪刀形结构",
  params: [
    { key: "length", label: "长度", min: 40, max: 300, default: 140, unit: "px" },
    { key: "spacing", label: "线路间距", min: 10, max: 128, default: 40, unit: "px" },
  ],
};

// ── B-6. 支线分岔 ────────────────────────────

const branchDiverge: ModuleTemplate = {
  id: "branch_diverge",
  name: "支线分岔",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 120,
  height: 112,
  ports: [
    { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: UP_MAIN_Y, direction: 180 },
    { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: DOWN_MAIN_Y, direction: 180 },
    { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: 120, y: UP_MAIN_Y, direction: 0 },
    { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: 120, y: DOWN_MAIN_Y, direction: 0 },
    { id: "R_branch", name: "右·支线", side: "right", role: "branch", x: 120, y: 96, direction: 0 },
  ],
  tracks: [
    ...doubleMain(120),
    // 支线从下行正线分出，向右下方延伸
    { x1: 60, y1: DOWN_MAIN_Y, x2: 120, y2: 96, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 100, y: 108, text: "支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "支线分岔，正线旁分出一条支线",
  params: [
    { key: "length", label: "长度", min: 40, max: 300, default: 120, unit: "px" },
    { key: "branchOffset", label: "开口幅度", min: 12, max: 48, default: 24, unit: "px" },
  ],
};

// ── B-6b. 对称支线分岔 ─────────────────────────

const symmetricDoubleBranch: ModuleTemplate = {
  id: "symmetric_double_branch",
  name: "对称支线分岔",
  category: "turnout",
  categoryName: "道岔与连接",
  width: 120,
  height: 112,
  ports: [
    { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: UP_MAIN_Y, direction: 180 },
    { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: DOWN_MAIN_Y, direction: 180 },
    { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: 120, y: UP_MAIN_Y, direction: 0 },
    { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: 120, y: DOWN_MAIN_Y, direction: 0 },
    { id: "R_branch_up", name: "右·上支", side: "right", role: "branch", x: 120, y: 16, direction: 0 },
    { id: "R_branch_dn", name: "右·下支", side: "right", role: "branch", x: 120, y: 96, direction: 0 },
  ],
  tracks: [
    ...doubleMain(120),
    // 上行正线向上分出支线
    { x1: 60, y1: UP_MAIN_Y, x2: 120, y2: 16, type: "branch" },
    // 下行正线向下分出支线
    { x1: 60, y1: DOWN_MAIN_Y, x2: 120, y2: 96, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 90, y: 8, text: "支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
    { x: 90, y: 108, text: "支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "对称支线分岔，上下行正线各分出一条支线，上下对称",
  params: [
    { key: "length", label: "长度", min: 40, max: 300, default: 120, unit: "px" },
    { key: "branchOffset", label: "开口幅度", min: 12, max: 48, default: 24, unit: "px" },
    { key: "spacing", label: "线路间距", min: 10, max: 128, default: 40, unit: "px" },
  ],
};

// ── C-5. 六线停车场线束 ──────────────────────

const sixTrackYard: ModuleTemplate = {
  id: "six_track_yard",
  name: "六线停车场",
  category: "yard",
  categoryName: "场段和存车设施",
  width: 180,
  height: 160,
  ports: [
    { id: "L_main", name: "左·入段", side: "left", role: "yard", x: 0, y: 80, direction: 180 },
    { id: "R_y1", name: "右·股道1", side: "right", role: "yard", x: 180, y: 16, direction: 0 },
    { id: "R_y2", name: "右·股道2", side: "right", role: "yard", x: 180, y: 44, direction: 0 },
    { id: "R_y3", name: "右·股道3", side: "right", role: "yard", x: 180, y: 68, direction: 0 },
    { id: "R_y4", name: "右·股道4", side: "right", role: "yard", x: 180, y: 92, direction: 0 },
    { id: "R_y5", name: "右·股道5", side: "right", role: "yard", x: 180, y: 116, direction: 0 },
    { id: "R_y6", name: "右·股道6", side: "right", role: "yard", x: 180, y: 144, direction: 0 },
  ],
  tracks: [
    { x1: 0, y1: 80, x2: 20, y2: 80, type: "yard" },
    { x1: 90, y1: 16, x2: 180, y2: 16, type: "yard" },
    { x1: 70, y1: 44, x2: 180, y2: 44, type: "yard" },
    { x1: 50, y1: 68, x2: 180, y2: 68, type: "yard" },
    { x1: 50, y1: 92, x2: 180, y2: 92, type: "yard" },
    { x1: 70, y1: 116, x2: 180, y2: 116, type: "yard" },
    { x1: 90, y1: 144, x2: 180, y2: 144, type: "yard" },
    // 线束道岔（斜向扇形展开，左右对称）
    { x1: 20, y1: 80, x2: 50, y2: 68, type: "branch" },
    { x1: 50, y1: 68, x2: 70, y2: 44, type: "branch" },
    { x1: 70, y1: 44, x2: 90, y2: 16, type: "branch" },
    { x1: 20, y1: 80, x2: 50, y2: 92, type: "branch" },
    { x1: 50, y1: 92, x2: 70, y2: 116, type: "branch" },
    { x1: 70, y1: 116, x2: 90, y2: 144, type: "branch" },
  ],
  platforms: [],
  labels: [
    { x: 135, y: 10, text: "G1", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 125, y: 38, text: "G2", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 115, y: 62, text: "G3", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 115, y: 86, text: "G4", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 125, y: 110, text: "G5", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 135, y: 138, text: "G6", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "六线停车场线束，六条股道呈扇形展开",
};

// ── C-6. 停车场接入模块 ──────────────────────

const yardAccess: ModuleTemplate = {
  id: "yard_access",
  name: "停车场接入",
  category: "yard",
  categoryName: "场段和存车设施",
  width: 160,
  height: 112,
  ports: [
    { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: UP_MAIN_Y, direction: 180 },
    { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: DOWN_MAIN_Y, direction: 180 },
    { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: 160, y: UP_MAIN_Y, direction: 0 },
    { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: 160, y: DOWN_MAIN_Y, direction: 0 },
    { id: "R_yard", name: "右·入段", side: "right", role: "yard", x: 160, y: 96, direction: 0 },
  ],
  tracks: [
    ...doubleMain(160),
    // 入段线从下行正线分出
    { x1: 28, y1: UP_MAIN_Y, x2: 72, y2: DOWN_MAIN_Y, type: "branch" },
    { x1: 112, y1: DOWN_MAIN_Y, x2: 160, y2: 96, type: "yard" },
  ],
  platforms: [],
  labels: [
    { x: 120, y: 108, text: "入段线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
    { x: 30, y: 100, text: "正线", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "停车场接入模块，正线旁引出入段线连接停车场",
};

// ── C-7. 车辆段接入模块 ──────────────────────

const depotAccess: ModuleTemplate = {
  id: "depot_access",
  name: "车辆段接入",
  category: "yard",
  categoryName: "场段和存车设施",
  width: 180,
  height: 112,
  ports: [
    { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: UP_MAIN_Y, direction: 180 },
    { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: DOWN_MAIN_Y, direction: 180 },
    { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: 180, y: UP_MAIN_Y, direction: 0 },
    { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: 180, y: DOWN_MAIN_Y, direction: 0 },
    { id: "R_depot", name: "右·入段", side: "right", role: "yard", x: 180, y: 16, direction: 0 },
    { id: "R_depot2", name: "右·出段", side: "right", role: "yard", x: 180, y: 96, direction: 0 },
  ],
  tracks: [
    ...doubleMain(180),
    // 出入段线分别从上下行正线引出
    { x1: 24, y1: UP_MAIN_Y, x2: 92, y2: DOWN_MAIN_Y, type: "branch" },
    { x1: 24, y1: DOWN_MAIN_Y, x2: 92, y2: UP_MAIN_Y, type: "branch" },
    { x1: 120, y1: UP_MAIN_Y, x2: 180, y2: 16, type: "yard" },
    { x1: 120, y1: DOWN_MAIN_Y, x2: 180, y2: 96, type: "yard" },
  ],
  platforms: [],
  labels: [
    { x: 150, y: 10, text: "入段", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
    { x: 150, y: 108, text: "出段", fontSize: 8, anchor: "middle", fill: "#6b7b85" },
  ],
  description: "车辆段接入模块，上下行分别引出入段线和出段线",
};

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

// ── 动态模板工厂 ──────────────────────────────

/**
 * 根据自定义参数生成模板变体。
 * 用于道岔等可调参数的模板 —— 根据 length、branchOffset、spacing 等
 * 重新计算 tracks、ports、labels 坐标。
 */
export function makeCustomizedTemplate(
  base: ModuleTemplate,
  customParams: Record<string, number>,
): ModuleTemplate {
  const p = (key: string) => customParams[key] ?? base.params?.find(pp => pp.key === key)?.default ?? 0;
  const hasLength = base.params?.some(pp => pp.key === "length");
  const hasSpacing = base.params?.some(pp => pp.key === "spacing");
  const hasBranchOffset = base.params?.some(pp => pp.key === "branchOffset");
  const hasAngle = base.params?.some(pp => pp.key === "angle");
  const hasPlatformLength = base.params?.some(pp => pp.key === "platformLength");
  const hasPlatformWidth = base.params?.some(pp => pp.key === "platformWidth");

  const length = hasLength ? p("length") : base.width;
  const spacing = hasSpacing ? p("spacing") : (DOWN_MAIN_Y - UP_MAIN_Y);
  const branchOffset = hasBranchOffset ? p("branchOffset") : 24;
  const platformLength = hasPlatformLength ? p("platformLength") : (base.platforms[0]?.width ?? 0);
  const platformWidth = hasPlatformWidth ? p("platformWidth") : (base.platforms[0]?.height ?? 0);
  const upY = 56 - spacing / 2;
  const downY = 56 + spacing / 2;
  const centerY = 56;

  let ports: ModulePort[];
  let tracks: TemplateTrack[];
  let labels: TemplateLabel[];
  let platforms: TemplatePlatform[] = base.platforms;
  let width: number;
  let height: number;
  // 分叉：开合角度只移动支线端口，直股/输入固定。为保持输入位置不变，分叉的几何
  // 自适应不做整体下移（除非内容顶出模板上沿），只按支线实际纵向范围扩高。
  let isFork = false;

  if (base.id === "double_island") {
    const islandGap = p("islandGap");
    const trackYs = [20, 60, 36 + islandGap, 76 + islandGap];
    const platformYs = [32, 48 + islandGap];
    return {
      ...base,
      width: 200,
      height: 96 + islandGap,
      ports: base.ports.map((port, index) => ({ ...port, y: trackYs[index % 4] })),
      tracks: trackYs.map((y) => ({ x1: 0, y1: y, x2: 200, y2: y, type: "main" as const })),
      platforms: base.platforms.map((platform, index) => ({ ...platform, y: platformYs[index] })),
      labels: base.labels.map((label, index) => index === 1 ? { ...label, y: 88 + islandGap } : label),
    };
  }

  switch (base.id) {
    case "pre_turnback":
    case "post_turnback": {
      const beforePlatform = base.id === "pre_turnback";
      width = platformLength + 120;
      height = 112;
      const platformX = beforePlatform ? 100 : 20;
      const crossoverStart = beforePlatform ? 15 : width - 90;
      const crossoverEnd = beforePlatform ? 90 : width - 15;
      const platformY = centerY - platformWidth / 2;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
      ];
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: crossoverStart, y1: upY, x2: crossoverEnd, y2: downY, type: "turnback" },
        { x1: crossoverStart, y1: downY, x2: crossoverEnd, y2: upY, type: "turnback" },
      ];
      platforms = [{ x: platformX, y: platformY, width: platformLength, height: platformWidth, type: "island", label: "折返站台" }];
      labels = [
        { x: platformX + platformLength / 2, y: platformY - 8, text: "折返站", fontSize: 13, anchor: "middle", fill: "#202124" },
        beforePlatform
          ? { x: 15, y: 100, text: "← 折返", fontSize: 9, anchor: "middle", fill: "#6b7b85" }
          : { x: width - 25, y: 100, text: "折返 →", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
      ];
      break;
    }
    // ── 双岛四线站 ────────────────────────────
    case "double_island": {
      const islandGap = p("islandGap");
      width = 200;
      height = 88 + islandGap;
      // 两个岛式站台，各自正线距站台 8px；两岛之间间距 = islandGap
      const inner2Y = 36 + islandGap;
      const outerDownY = 68 + islandGap;
      const island2Y = 44 + islandGap;
      ports = [
        { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: 20, direction: 180 },
        { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: 52, direction: 180 },
        { id: "L_up2", name: "左·上行2", side: "left", role: "up_main", x: 0, y: inner2Y, direction: 180 },
        { id: "L_dn2", name: "左·下行2", side: "left", role: "down_main", x: 0, y: outerDownY, direction: 180 },
        { id: "R_up1", name: "右·上行", side: "right", role: "up_main", x: width, y: 20, direction: 0 },
        { id: "R_dn1", name: "右·下行", side: "right", role: "down_main", x: width, y: 52, direction: 0 },
        { id: "R_up2", name: "右·上行2", side: "right", role: "up_main", x: width, y: inner2Y, direction: 0 },
        { id: "R_dn2", name: "右·下行2", side: "right", role: "down_main", x: width, y: outerDownY, direction: 0 },
      ];
      tracks = [
        { x1: 0, y1: 20, x2: width, y2: 20, type: "main" },
        { x1: 0, y1: 52, x2: width, y2: 52, type: "main" },
        { x1: 0, y1: inner2Y, x2: width, y2: inner2Y, type: "main" },
        { x1: 0, y1: outerDownY, x2: width, y2: outerDownY, type: "main" },
      ];
      platforms = [
        { x: 10, y: 28, width: width - 20, height: 16, type: "island", label: "岛式站台" },
        { x: 10, y: island2Y, width: width - 20, height: 16, type: "island", label: "岛式站台" },
      ];
      labels = [
        { x: width / 2, y: 14, text: "站名", fontSize: 13, anchor: "middle", fill: "#202124" },
        { x: width / 2, y: 80 + islandGap, text: "Station", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
      ];
      break;
    }
    // ── 左开 / 右开道岔 ──────────────────────
    case "left_turnout": {
      width = length;
      height = 80;
      const branchY = centerY - branchOffset;
      ports = [
        { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: centerY, direction: 180 },
        { id: "R_main", name: "右·直股", side: "right", role: "up_main", x: width, y: centerY, direction: 0 },
        { id: "R_branch", name: "右·侧股", side: "right", role: "branch", x: width, y: branchY, direction: 0 },
      ];
      const divX1 = width * 0.5;
      tracks = [
        { x1: 0, y1: centerY, x2: width, y2: centerY, type: "main" },
        { x1: divX1, y1: centerY, x2: width, y2: branchY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: centerY + 20, text: "左开", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    case "right_turnout": {
      width = length;
      height = 80;
      const branchY = centerY + branchOffset;
      ports = [
        { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: centerY, direction: 180 },
        { id: "R_main", name: "右·直股", side: "right", role: "up_main", x: width, y: centerY, direction: 0 },
        { id: "R_branch", name: "右·侧股", side: "right", role: "branch", x: width, y: branchY, direction: 0 },
      ];
      const divX2 = width * 0.5;
      tracks = [
        { x1: 0, y1: centerY, x2: width, y2: centerY, type: "main" },
        { x1: divX2, y1: centerY, x2: width, y2: branchY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: centerY - 20, text: "右开", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 单渡线 ───────────────────────────────
    case "single_crossover": {
      width = length;
      height = 112;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
      ];
      const x1 = width * 0.3;
      const x2 = width * 0.7;
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: x1, y1: upY, x2: x2, y2: downY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: downY + 28, text: "单渡线", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 交叉渡线 ─────────────────────────────
    case "double_crossover": {
      width = length;
      height = 112;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
      ];
      const a1 = width * 0.17;
      const a2 = width * 0.83;
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: a1, y1: upY, x2: a2, y2: downY, type: "branch" },
        { x1: a1, y1: downY, x2: a2, y2: upY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: downY + 28, text: "交叉渡线", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 剪式渡线 ─────────────────────────────
    case "scissors_crossover": {
      width = length;
      height = 112;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
      ];
      const s1 = width * 0.14;
      const s2 = width * 0.5;
      const s3 = width * 0.86;
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: s1, y1: upY, x2: s2, y2: downY, type: "branch" },
        { x1: s2, y1: upY, x2: s3, y2: downY, type: "branch" },
        { x1: s1, y1: downY, x2: s2, y2: upY, type: "branch" },
        { x1: s2, y1: downY, x2: s3, y2: upY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: downY + 28, text: "剪式渡线", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 支线分岔 ─────────────────────────────
    case "branch_diverge": {
      width = length;
      height = 112;
      const branchY = downY + branchOffset;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
        { id: "R_branch", name: "右·支线", side: "right", role: "branch", x: width, y: branchY, direction: 0 },
      ];
      const divB = width * 0.5;
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: divB, y1: downY, x2: width, y2: branchY, type: "branch" },
      ];
      labels = [{ x: width * 0.83, y: branchY + 12, text: "支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 对称支线分岔 ─────────────────────────
    case "symmetric_double_branch": {
      width = length;
      height = 112;
      const branchUpY = upY - branchOffset;
      const branchDnY = downY + branchOffset;
      ports = [
        { id: "L_up", name: "左·上行", side: "left", role: "up_main", x: 0, y: upY, direction: 180 },
        { id: "L_dn", name: "左·下行", side: "left", role: "down_main", x: 0, y: downY, direction: 180 },
        { id: "R_up", name: "右·上行", side: "right", role: "up_main", x: width, y: upY, direction: 0 },
        { id: "R_dn", name: "右·下行", side: "right", role: "down_main", x: width, y: downY, direction: 0 },
        { id: "R_branch_up", name: "右·上支", side: "right", role: "branch", x: width, y: branchUpY, direction: 0 },
        { id: "R_branch_dn", name: "右·下支", side: "right", role: "branch", x: width, y: branchDnY, direction: 0 },
      ];
      const divX = width * 0.5;
      tracks = [
        { x1: 0, y1: upY, x2: width, y2: upY, type: "main" },
        { x1: 0, y1: downY, x2: width, y2: downY, type: "main" },
        { x1: divX, y1: upY, x2: width, y2: branchUpY, type: "branch" },
        { x1: divX, y1: downY, x2: width, y2: branchDnY, type: "branch" },
      ];
      labels = [
        { x: width * 0.83, y: branchUpY - 4, text: "支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
        { x: width * 0.83, y: branchDnY + 12, text: "支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
      ];
      break;
    }
    // ── 双支线分叉 ───────────────────────────
    case "double_branch": {
      width = length;
      height = 112;
      const branchUpY = centerY - branchOffset;
      const branchDnY = centerY + branchOffset;
      ports = [
        { id: "L_main", name: "左·正线", side: "left", role: "up_main", x: 0, y: centerY, direction: 180 },
        { id: "R_up", name: "右·上支", side: "right", role: "branch", x: width, y: branchUpY, direction: 0 },
        { id: "R_dn", name: "右·下支", side: "right", role: "branch", x: width, y: branchDnY, direction: 0 },
      ];
      const halfX = width * 0.5;
      tracks = [
        { x1: 0, y1: centerY, x2: halfX, y2: centerY, type: "main" },
        { x1: halfX, y1: centerY, x2: width, y2: branchUpY, type: "branch" },
        { x1: halfX, y1: centerY, x2: width, y2: branchDnY, type: "branch" },
      ];
      labels = [{ x: width / 2, y: height - 4, text: "双支线", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      break;
    }
    // ── 双线斜向分叉（双线直行 + 双线斜支线 / 双线 Y 形） ───────────
    // 一条双线（upY/downY）分成两条双线。分支端口 direction 取斜段实际角度（atan2），
    // 端口方向就是连接切线方向（connectionLogic 用 unitVector(fromDir)），因此连出去的
    // 支线是真实斜向的。直股对/支线对都用 up_main+down_main 并带车道号（1/2），
    // findDoubleTrackPartner 按尾号配对，连双线区间会自动补对侧走线。
    case "double_fork_up":
    case "double_fork_dn":
    case "double_fork_y": {
      width = length;
      isFork = true;
      const forkKind = base.id === "double_fork_up" ? "up" : base.id === "double_fork_dn" ? "dn" : "y";
      // 开合角度 angle（度）→ 斜段纵向落差 k（支线对在输出端相对直股对的张开量）。
      // 与道岔的「开口幅度」一致：分叉点固定在中点、直股/输入端口位置不动，只移动
      // 支线输出端口；开大时支线超出原边界、模板随之变高。默认角（上 26.2 / 下 23.3 /
      // Y 17.1）复现静态几何，故默认保持可对齐（输入端口 y 与角度无关）。
      const angle = hasAngle ? p("angle") : forkKind === "up" ? 26.2 : forkKind === "dn" ? 23.3 : 17.1;
      // 输入/直股锚点：不随开合角度移动（保证吸附对齐）。上分叉默认组间隙 24、
      // 下分叉取标准位、Y 形居中，使默认几何与静态基准一致。
      const inUp = forkKind === "y" ? 12 + spacing : forkKind === "up" ? 12 + spacing + 24 : 56 - spacing / 2;
      const inDn = inUp + spacing;
      // 斜段纵向落差 k = 开合角度对应的张开量；不得小于线间距（上/下分叉的支线对整组
      // 在直股对上方/下方，两组之间不交叉、不重叠）。Y 形两分支之间留 ≥ spacing/2，
      // 使上下两支刚好相触为最紧状态，避免两支互相穿越。
      const k = Math.max(
        Math.round((width / 2) * Math.tan((angle * Math.PI) / 180)),
        forkKind === "y" ? spacing / 2 : spacing,
      );
      // 分叉点固定在中点。
      const divX = Math.round(width / 2);
      // 端口方向取斜段真实角度（k 可能被线间距下限夹住，方向必须与渲染斜轨一致）
      const angleRise = (Math.round(Math.atan2(-k, width - divX) * 180 / Math.PI) % 360 + 360) % 360;
      const angleFall = (Math.round(Math.atan2(k, width - divX) * 180 / Math.PI) % 360 + 360) % 360;
      if (forkKind === "y") {
        // Y 形：双线一进二出。上支整体上移 k、下支整体下移 k，各成一对双线斜出。
        // 高度同时容纳上支顶部与下支底部（开大时两端一起变高）。
        height = Math.max(inDn + k + 12, inUp - k + 12);
        ports = [
          { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: inUp, direction: 180 },
          { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: inDn, direction: 180 },
          { id: "R_up1", name: "右·上支上行", side: "right", role: "up_main", x: width, y: inUp - k, direction: angleRise },
          { id: "R_dn1", name: "右·上支下行", side: "right", role: "down_main", x: width, y: inDn - k, direction: angleRise },
          { id: "R_up2", name: "右·下支上行", side: "right", role: "up_main", x: width, y: inUp + k, direction: angleFall },
          { id: "R_dn2", name: "右·下支下行", side: "right", role: "down_main", x: width, y: inDn + k, direction: angleFall },
        ];
        tracks = [
          { x1: 0, y1: inUp, x2: divX, y2: inUp, type: "main" },
          { x1: 0, y1: inDn, x2: divX, y2: inDn, type: "main" },
          { x1: divX, y1: inUp, x2: width, y2: inUp - k, type: "branch" },
          { x1: divX, y1: inDn, x2: width, y2: inDn - k, type: "branch" },
          { x1: divX, y1: inUp, x2: width, y2: inUp + k, type: "branch" },
          { x1: divX, y1: inDn, x2: width, y2: inDn + k, type: "branch" },
        ];
        labels = [{ x: 40, y: 36, text: "Y形分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" }];
      } else {
        // 直股双线照常水平直行（输入锚点固定）；支线双线整体平移 k 与直股分开。
        height = forkKind === "up" ? inDn + 12 : inDn + k + 12;
        const branchUpY = forkKind === "up" ? inUp - k : inUp + k;
        const branchDnY = forkKind === "up" ? inDn - k : inDn + k;
        const angle = forkKind === "up" ? angleRise : angleFall;
        ports = [
          { id: "L_up1", name: "左·上行", side: "left", role: "up_main", x: 0, y: inUp, direction: 180 },
          { id: "L_dn1", name: "左·下行", side: "left", role: "down_main", x: 0, y: inDn, direction: 180 },
          { id: "R_up1", name: "右·直股上行", side: "right", role: "up_main", x: width, y: inUp, direction: 0 },
          { id: "R_dn1", name: "右·直股下行", side: "right", role: "down_main", x: width, y: inDn, direction: 0 },
          { id: "R_up2", name: "右·支线上行", side: "right", role: "up_main", x: width, y: branchUpY, direction: angle },
          { id: "R_dn2", name: "右·支线下行", side: "right", role: "down_main", x: width, y: branchDnY, direction: angle },
        ];
        tracks = [
          { x1: 0, y1: inUp, x2: width, y2: inUp, type: "main" },
          { x1: 0, y1: inDn, x2: width, y2: inDn, type: "main" },
          { x1: divX, y1: inUp, x2: width, y2: branchUpY, type: "branch" },
          { x1: divX, y1: inDn, x2: width, y2: branchDnY, type: "branch" },
        ];
        labels = [
          forkKind === "up"
            ? { x: 40, y: 30, text: "上分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" }
            : { x: 40, y: 26, text: "下分叉", fontSize: 9, anchor: "middle", fill: "#6b7b85" },
        ];
      }
      break;
    }
    // ── 兜底：返回原模板 ──────────────────────
    default:
      return base;
  }

  // 放宽 length/spacing 范围后，轨道/端口的纵向范围可能超出模板原高度
  // （大 spacing 时 upY 变负、downY 超过 112）。这里统一做几何自适应：
  // 纵向整体下移到 y>=边距，并按轨道/端口实际纵向范围扩高，保证轨道不出框。
  // 约束只看轨道/端口（标签可自然贴近边缘），但平移时标签/站台一并跟随保持相对位置。
  const railExtent: number[] = [];
  for (const track of tracks) { railExtent.push(track.y1, track.y2); }
  for (const port of ports) { railExtent.push(port.y); }
  const minY = Math.min(...railExtent);
  const maxY = Math.max(...railExtent);
  const TOP_MARGIN = 12;
  const BOTTOM_MARGIN = 12;
  if (isFork) {
    // 分叉：输入/直股位置由开合角度以外的参数决定，角度开大时只让支线外移、模板变高。
    // 不做整体下移（否则输入会随角度移动，破坏吸附对齐），仅当支线真的顶出模板
    // 上沿（y<0，极端角度×大线距）才整体下移兜底；下沿用扩高保证可见。
    height = Math.max(height, maxY + BOTTOM_MARGIN);
    if (minY < 0) {
      const shift = -minY;
      height += shift;
      tracks = tracks.map((track) => ({ ...track, y1: track.y1 + shift, y2: track.y2 + shift }));
      ports = ports.map((port) => ({ ...port, y: port.y + shift }));
      labels = labels.map((textLabel) => ({ ...textLabel, y: textLabel.y + shift }));
      platforms = platforms.map((platform) => ({ ...platform, y: platform.y + shift }));
    }
  } else if (minY < TOP_MARGIN || maxY > height - BOTTOM_MARGIN) {
    const shift = TOP_MARGIN - minY;
    height = Math.max(height, maxY - minY + TOP_MARGIN + BOTTOM_MARGIN);
    tracks = tracks.map((track) => ({ ...track, y1: track.y1 + shift, y2: track.y2 + shift }));
    ports = ports.map((port) => ({ ...port, y: port.y + shift }));
    labels = labels.map((textLabel) => ({ ...textLabel, y: textLabel.y + shift }));
    platforms = platforms.map((platform) => ({ ...platform, y: platform.y + shift }));
  }

  return {
    ...base,
    width,
    height,
    ports,
    tracks,
    platforms,
    labels,
  };
}

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
  const pairs = base.id === "island_platform"
    ? [{ main: 36, bypass: 26, source: 0 }, { main: 76, bypass: 86, source: 1 }]
    : base.id === "side_platform"
      ? [{ main: 36, bypass: 48, source: 0 }, { main: 76, bypass: 64, source: 1 }]
      : [
          { main: 20, bypass: 10, source: 0 },
          { main: 60, bypass: 52, source: 1 },
          { main: 68, bypass: 76, source: 2 },
          { main: 108, bypass: 118, source: 3 },
        ];
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

/** 根据 ID 查找模板 */
export function findTemplate(id: string): ModuleTemplate | undefined {
  return MODULE_TEMPLATES.find((tpl) => tpl.id === id);
}
