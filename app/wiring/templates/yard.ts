// ──────────────────────────────────────────────
// 配线图编辑器 · 场段和存车设施模板（TemplateCategory: yard）
// 从 templates.ts 拆出，逐字保留原实现。
// ──────────────────────────────────────────────

import { doubleMain } from "./helpers";
import { DOWN_MAIN_Y, UP_MAIN_Y, type ModuleTemplate } from "../types";

// ── C. 场段和存车设施 ──────────────────────────

export const singleSiding: ModuleTemplate = {
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

export const doubleSiding: ModuleTemplate = {
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

export const threeTrackYard: ModuleTemplate = {
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

export const fourTrackYard: ModuleTemplate = {
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


// ── C-5. 六线停车场线束 ──────────────────────

export const sixTrackYard: ModuleTemplate = {
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

export const yardAccess: ModuleTemplate = {
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

export const depotAccess: ModuleTemplate = {
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

