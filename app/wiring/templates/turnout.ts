// ──────────────────────────────────────────────
// 配线图编辑器 · 道岔与连接模板（TemplateCategory: turnout）
// 从 templates.ts 拆出，逐字保留原实现。
// ──────────────────────────────────────────────

import { doubleMain, standardPorts } from "./helpers";
import { buildDoubleForkGeometry } from "./customize";
import { DOWN_MAIN_Y, UP_MAIN_Y, type ModuleTemplate } from "../types";

// ── B. 道岔与连接 ────────────────────────────

export const leftTurnout: ModuleTemplate = {
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

export const rightTurnout: ModuleTemplate = {
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

export const singleCrossover: ModuleTemplate = {
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

export const doubleCrossover: ModuleTemplate = {
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

export const deadEnd: ModuleTemplate = {
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

export const doubleBranchTurnout: ModuleTemplate = {
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

const doubleForkUpGeometry = buildDoubleForkGeometry("up", 260, 40, 64);
const doubleForkDnGeometry = buildDoubleForkGeometry("dn", 260, 40, 56);
const doubleForkYGeometry = buildDoubleForkGeometry("y", 260, 40, 40);

export const doubleForkUp: ModuleTemplate = {
  id: "double_fork_up",
  name: "双线斜上分叉",
  category: "turnout",
  categoryName: "道岔与连接",
  ...doubleForkUpGeometry,
  platforms: [],
  description: "双线主干直行，另分出一条双线斜向上的支线",
  params: [
    { key: "length", label: "长度", min: 40, max: 400, default: 260, unit: "px" },
    { key: "spacing", label: "线间距", min: 10, max: 128, default: 40, unit: "px" },
    { key: "branchOffset", label: "开口幅度", min: 40, max: 76, default: 64, unit: "px" },
    { key: "alignBranchEnds", label: "端点补齐对齐", kind: "boolean", min: 0, max: 1, default: 0, step: 1 },
  ],
};

export const doubleForkDn: ModuleTemplate = {
  id: "double_fork_dn",
  name: "双线斜下分叉",
  category: "turnout",
  categoryName: "道岔与连接",
  ...doubleForkDnGeometry,
  platforms: [],
  description: "双线主干直行，另分出一条双线斜向下的支线",
  params: [
    { key: "length", label: "长度", min: 40, max: 400, default: 260, unit: "px" },
    { key: "spacing", label: "线间距", min: 10, max: 128, default: 40, unit: "px" },
    { key: "branchOffset", label: "开口幅度", min: 40, max: 240, default: 56, unit: "px" },
    { key: "alignBranchEnds", label: "端点补齐对齐", kind: "boolean", min: 0, max: 1, default: 0, step: 1 },
  ],
};

export const doubleForkY: ModuleTemplate = {
  id: "double_fork_y",
  name: "双线Y形分叉",
  category: "turnout",
  categoryName: "道岔与连接",
  ...doubleForkYGeometry,
  platforms: [],
  description: "双线一进二出，分成两条对称的双线斜向支线",
  params: [
    { key: "length", label: "长度", min: 40, max: 400, default: 260, unit: "px" },
    { key: "spacing", label: "线间距", min: 10, max: 128, default: 40, unit: "px" },
    { key: "branchOffset", label: "开口幅度", min: 20, max: 52, default: 40, unit: "px" },
    { key: "alignBranchEnds", label: "端点补齐对齐", kind: "boolean", min: 0, max: 1, default: 0, step: 1 },
  ],
};

// ── B-5. 剪式渡线 ────────────────────────────

export const scissorsCrossover: ModuleTemplate = {
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

export const branchDiverge: ModuleTemplate = {
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

export const symmetricDoubleBranch: ModuleTemplate = {
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
