"use client";

// 配线图编辑器的可复用 SVG 展示元件：工程站图标、模板预览、元件库矢量图形（形状/信号机/编号卡片）。

import { useEffect, useState } from "react";
import type { GraphicShapeType, ModuleTemplate } from "../types";
import { templateTrackPathD } from "./primitives";
import type { ProjectRepository } from "../../projects/repositories";

function ProjectStationIcon({
  repository,
  projectId,
  name,
  embeddedSrc,
}: {
  repository: ProjectRepository;
  projectId: string;
  name: string;
  embeddedSrc?: string;
}) {
  const [src, setSrc] = useState(embeddedSrc || "");
  useEffect(() => {
    if (embeddedSrc) {
      setSrc(embeddedSrc);
      return;
    }
    let disposed = false;
    let objectUrl = "";
    repository.getAsset(projectId, name).then((asset) => {
      if (!asset || disposed) return;
      objectUrl = URL.createObjectURL(asset.blob);
      setSrc(objectUrl);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [embeddedSrc, name, projectId, repository]);
  return src
    ? <img className="station-resource-icon" src={src} alt="" onError={(event) => { event.currentTarget.classList.add("missing"); }} />
    : <span className="station-icon-missing" title="未配置图标">!</span>;
}

// ── 模板预览 SVG ──────────────────────────────

function TemplatePreviewSvg({ template }: { template: ModuleTemplate }) {
  const scale = Math.min(54 / template.width, 38 / template.height) * 0.85;
  const ox = (54 - template.width * scale) / 2;
  const oy = (38 - template.height * scale) / 2;
  return (
    <svg width={54} height={38}>
      <g transform={`translate(${ox},${oy}) scale(${scale})`}>
        {template.tracks.map((t, i) =>
          t.curved ? (
            <path key={i} d={templateTrackPathD(t)} fill="none" stroke="#202124" strokeWidth={3} strokeLinecap="round" />
          ) : (
            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#202124" strokeWidth={3} strokeLinecap="round" />
          ),
        )}
        {template.platforms.map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width={p.width} height={p.height} fill="#D7B06A" stroke="#C49A52" strokeWidth={0.5} rx={1.5} />
        ))}
      </g>
    </svg>
  );
}

// ── 元件库矢量图形：基础元素 + 工程图标（信号机） ──────────────

/** 每种形状的元数据：显示名、默认尺寸、默认颜色 */
const SHAPE_META: Record<GraphicShapeType, { label: string; width: number; height: number; defaultFill?: string; defaultStroke?: string }> = {
  rect:          { label: "矩形",     width: 80, height: 60, defaultFill: "#cce6f5", defaultStroke: "#202124" },
  roundRect:     { label: "圆角矩形", width: 80, height: 60, defaultFill: "#d7f0d7", defaultStroke: "#202124" },
  triangle:      { label: "三角形",   width: 80, height: 70, defaultFill: "#f5e6cc", defaultStroke: "#202124" },
  circle:        { label: "圆形",     width: 70, height: 70, defaultFill: "#f2ccf5", defaultStroke: "#202124" },
  diamond:       { label: "菱形",     width: 70, height: 70, defaultFill: "#f5d7cc", defaultStroke: "#202124" },
  "signal-in":   { label: "进站信号机", width: 28, height: 64 },
  "signal-out":  { label: "出站信号机", width: 28, height: 64 },
  "signal-shunt": { label: "调车信号机", width: 24, height: 40 },
};

/** 水平/垂直镜像开关（模块、图形属性面板与放置面板复用）。 */
function MirrorToggle({ mirrorX, mirrorY, onChange, disabled }: {
  mirrorX?: boolean;
  mirrorY?: boolean;
  onChange: (next: { mirrorX: boolean; mirrorY: boolean }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="wiring-mirror-toggle">
      <button
        type="button"
        className={`wiring-mirror-btn ${mirrorX ? "active" : ""}`}
        onClick={() => onChange({ mirrorX: !mirrorX, mirrorY: !!mirrorY })}
        title="水平镜像（左右翻转）"
        aria-pressed={!!mirrorX}
        disabled={disabled}
      >⇔ 水平</button>
      <button
        type="button"
        className={`wiring-mirror-btn ${mirrorY ? "active" : ""}`}
        onClick={() => onChange({ mirrorX: !!mirrorX, mirrorY: !mirrorY })}
        title="垂直镜像（上下翻转）"
        aria-pressed={!!mirrorY}
        disabled={disabled}
      >↕ 垂直</button>
    </div>
  );
}

/** 信号机灯位颜色（固定，与线路配色无关） */
const SIGNAL_LAMP: Record<string, { fill: string; stroke?: string }> = {
  red:    { fill: "#E53935" },
  yellow: { fill: "#FDD835", stroke: "#B9A21A" },
  green:  { fill: "#43A047" },
  blue:   { fill: "#1565C0" },
  white:  { fill: "#FFFFFF", stroke: "#555555" },
};

/** 信号机灯序（从上到下） */
const SIGNAL_LAMPS: Partial<Record<GraphicShapeType, string[]>> = {
  "signal-in": ["red", "yellow", "green"],
  "signal-out": ["green", "red"],
  "signal-shunt": ["blue", "white"],
};

/** 在画布上渲染一个矢量形状 / 信号机（SVG 主体，不含外层变换）。 */
function ShapeGraphic({ shapeType, width, height, fill, stroke }: { shapeType: GraphicShapeType; width: number; height: number; fill?: string; stroke?: string }) {
  if (shapeType.startsWith("signal-")) {
    // 高柱信号机：竖柱 + 深色灯头 + 固定灯位
    const lamps = SIGNAL_LAMPS[shapeType] || [];
    const headW = Math.min(width * 0.8, 20);
    const headH = lamps.length * 8 + 6;
    const headX = (width - headW) / 2;
    const headTop = Math.max(0, height - headH - 10);
    const lampR = Math.max(2, Math.min(3.2, headW * 0.18));
    return (
      <g>
        <line x1={width / 2} y1={height} x2={width / 2} y2={headTop + headH} stroke="#3c4043" strokeWidth={2} />
        <rect x={headX} y={headTop} width={headW} height={headH} rx={3} fill="#202124" />
        {lamps.map((color, i) => {
          const lamp = SIGNAL_LAMP[color];
          const cy = headTop + headH - (i * 8 + 5);
          return <circle key={i} cx={width / 2} cy={cy} r={lampR} fill={lamp.fill} stroke={lamp.stroke || "none"} strokeWidth={0.6} />;
        })}
      </g>
    );
  }
  const f = fill || "#cce6f5";
  const s = stroke || "#202124";
  const rx = shapeType === "roundRect" ? Math.min(14, Math.min(width, height) * 0.2) : 0;
  switch (shapeType) {
    case "rect":
      return <rect width={width} height={height} fill={f} stroke={s} strokeWidth={1.5} rx={rx} />;
    case "roundRect":
      return <rect width={width} height={height} fill={f} stroke={s} strokeWidth={1.5} rx={rx} />;
    case "triangle":
      return <polygon points={`${width / 2},0 ${width},${height} 0,${height}`} fill={f} stroke={s} strokeWidth={1.5} strokeLinejoin="round" />;
    case "circle":
      return <circle cx={width / 2} cy={height / 2} r={Math.min(width, height) / 2} fill={f} stroke={s} strokeWidth={1.5} />;
    case "diamond":
      return <polygon points={`${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`} fill={f} stroke={s} strokeWidth={1.5} strokeLinejoin="round" />;
    default:
      return null;
  }
}

/** 元件卡片迷你预览（固定画布，自动缩放形状）。 */
function ShapePreview({ shapeType }: { shapeType: GraphicShapeType }) {
  const meta = SHAPE_META[shapeType];
  const scale = Math.min(50 / meta.width, 34 / meta.height) * 0.9;
  const ox = (54 - meta.width * scale) / 2;
  const oy = (38 - meta.height * scale) / 2;
  return (
    <svg width={54} height={38}>
      <g transform={`translate(${ox},${oy}) scale(${scale})`}>
        <ShapeGraphic shapeType={shapeType} width={meta.width} height={meta.height} fill={meta.defaultFill} stroke={meta.defaultStroke} />
      </g>
    </svg>
  );
}

/** 基础元素分类卡片（形状） */
const SHAPE_CARDS: { shapeType: GraphicShapeType; description: string }[] = [
  { shapeType: "rect", description: "矩形框，用于图框、图例、分区" },
  { shapeType: "roundRect", description: "圆角矩形，用于模块标识、色块" },
  { shapeType: "triangle", description: "三角形，用于警示、箭头、标志" },
  { shapeType: "circle", description: "圆形，用于信号灯、车挡、圆标" },
  { shapeType: "diamond", description: "菱形，用于编号底标、道岔标识" },
];

/** 工程图标分类卡片（信号机） */
const SIGNAL_CARDS: { shapeType: GraphicShapeType; description: string }[] = [
  { shapeType: "signal-in", description: "进站信号机：红·黄·绿三灯" },
  { shapeType: "signal-out", description: "出站信号机：绿·红两灯" },
  { shapeType: "signal-shunt", description: "调车信号机：蓝·白两灯" },
];

/** 工程图标分类卡片（编号标注） */
const NUMBER_CARDS: { numeralType: "track" | "switch"; description: string }[] = [
  { numeralType: "track", description: "站内股道编号，如 1道、2道" },
  { numeralType: "switch", description: "道岔编号，如 1#、3#、5#" },
];

export { ProjectStationIcon, TemplatePreviewSvg, SHAPE_META, MirrorToggle, SIGNAL_LAMP, SIGNAL_LAMPS, ShapeGraphic, ShapePreview, SHAPE_CARDS, SIGNAL_CARDS, NUMBER_CARDS };
