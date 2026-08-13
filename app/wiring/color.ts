// ──────────────────────────────────────────────
// 配线图编辑器 · 线路颜色解析
//
// 轨道/站台/连接的颜色解析纯逻辑。输出 ColorSpec：
// - solid：直接使用 css 颜色值（如 "#FF0000"）
// - gradient：css 为 url(#grad-xxx) 引用，gradientDef 供渲染 <linearGradient>
//
// 所有解析均有向后兼容的回退，旧工程（无新字段）保持原有外观。
// ──────────────────────────────────────────────

import type { DiagramModule, PlatformObject, SourceLine, TemplatePlatform, TemplateTrack } from "./types";

/** 渐变停靠点 */
export interface GradientStop {
  offset: string;
  color: string;
}

/** 线性渐变定义（渲染为 <linearGradient>） */
export interface GradientDef {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: GradientStop[];
}

/** 颜色解析结果 */
export interface ColorSpec {
  /** 赋给 CSS 变量的值：hex 颜色或 url(#grad-xxx) */
  css: string;
  kind: "solid" | "gradient";
  /** kind === "gradient" 时的渐变定义 */
  gradientDef?: GradientDef;
}

/** 默认轨道颜色 */
export const DEFAULT_TRACK_COLOR = "#202124";
/** 默认站台填充色 */
export const DEFAULT_PLATFORM_FILL = "#D7B06A";
/** 默认站台边框色 */
export const DEFAULT_PLATFORM_STROKE = "#C49A52";
/** 默认站名标签颜色 */
export const DEFAULT_LABEL_FILL = "#202124";

// ── 颜色工具函数 ──────────────────────────────

/** 规范化 hex：补 # 前缀、展开 3 位简写；非法输入返回 null */
export function normalizeHex(hex: string): string | null {
  let value = (hex || "").trim();
  if (!value) return null;
  if (!value.startsWith("#")) value = `#${value}`;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    value = `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

/** 解析 hex 为 { r, g, b }（0-255）；非法输入返回 null */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const value = normalizeHex(hex);
  if (!value) return null;
  return {
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
  };
}

/** 两个 hex 线性混合：t=0 → colorA，t=1 → colorB */
export function blendHex(colorA: string, colorB: string, t: number): string {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  if (!a || !b) return normalizeHex(colorA) || DEFAULT_TRACK_COLOR;
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  const toHex = (value: number) => clamp(value).toString(16).padStart(2, "0");
  return `#${toHex(a.r + (b.r - a.r) * t)}${toHex(a.g + (b.g - a.g) * t)}${toHex(a.b + (b.b - a.b) * t)}`;
}

function solidColor(color: string): ColorSpec {
  return { css: color, kind: "solid" };
}

/** 将 hex 颜色加深（各通道乘以 factor，默认 0.8）；非法输入原样返回 */
export function darkenHex(hex: string, factor = 0.8): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  const toHex = (value: number) => clamp(value).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r * factor)}${toHex(rgb.g * factor)}${toHex(rgb.b * factor)}`;
}

function gradientColor(id: string, x1: number, y1: number, x2: number, y2: number, stops: GradientStop[]): ColorSpec {
  return {
    css: `url(#${id})`,
    kind: "gradient",
    gradientDef: { id, x1, y1, x2, y2, stops },
  };
}

// ── 线路颜色查找 ──────────────────────────────

function lineColorOf(lineId: string, sourceLines: SourceLine[]): string {
  const line = sourceLines.find((candidate) => candidate.id === lineId);
  return normalizeHex(line?.lineColor ?? "") || DEFAULT_TRACK_COLOR;
}

/** 取模块关联线路的颜色列表（按 lineIds 顺序） */
export function lineColorsForModule(mod: DiagramModule, sourceLines: SourceLine[]): string[] {
  return (mod.lineIds || []).map((lineId) => lineColorOf(lineId, sourceLines));
}

/** 从 ColorSpec 中提取一个代表颜色（solid 直接取；gradient 取第一个停靠点） */
export function effectiveColor(spec: ColorSpec): string {
  if (spec.kind === "solid") return spec.css;
  return spec.gradientDef?.stops[0]?.color || DEFAULT_TRACK_COLOR;
}

/**
 * 在线性渐变轴上按投影位置采样颜色。
 *
 * 用于连接端点取色：模块为双线竖直渐变（上行为线路 0、下行为线路 1）时，
 * 按连接端口所在的局部坐标投影到渐变轴，取对应线路颜色。
 * solid 直接返回；无渐变定义或未提供坐标时回退 effectiveColor。
 */
export function sampleSpecAt(spec: ColorSpec, x?: number, y?: number): string {
  if (spec.kind === "solid") return spec.css;
  const def = spec.gradientDef;
  if (!def || x === undefined || y === undefined) return effectiveColor(spec);
  const dx = def.x2 - def.x1;
  const dy = def.y2 - def.y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return def.stops[0]?.color || DEFAULT_TRACK_COLOR;
  const t = Math.max(0, Math.min(1, ((x - def.x1) * dx + (y - def.y1) * dy) / lengthSq));
  const stops = def.stops;
  for (let i = 0; i < stops.length - 1; i++) {
    const o0 = parseFloat(stops[i].offset) / 100;
    const o1 = parseFloat(stops[i + 1].offset) / 100;
    if (t >= o0 && t <= o1) {
      const f = o1 === o0 ? 0 : (t - o0) / (o1 - o0);
      return blendHex(stops[i].color, stops[i + 1].color, f);
    }
  }
  return stops[stops.length - 1]?.color || DEFAULT_TRACK_COLOR;
}

// ── 模块轨道颜色 ──────────────────────────────

/**
 * 解析模块内部轨道（道岔、站内线、区间模板等）的描边颜色。
 *
 * 缺省模式为 "line"（跟随线路）：未显式设置颜色模式的对象自动按线路着色；
 * 关联了线路但没有 lineColor 时回退默认深灰。
 *
 * - "default" → solid DEFAULT_TRACK_COLOR（显式选择"不跟随线路"的深灰外观）
 * - "line"    → 1 条线路 solid 该线路颜色；多条线路 vertical gradient
 *               （自上而下按 lineIds 顺序均分停靠点，每条平行轨道落在自己的
 *               颜色上；轴取 trackBounds.minY → maxY，缺省回退 36 → 76）
 * - "manual"  → solid trackColor
 */
export function resolveModuleTrackColor(
  mod: DiagramModule,
  sourceLines: SourceLine[],
  templateWidth: number,
  defaultColor?: string,
  trackBounds?: { minY: number; maxY: number },
): ColorSpec {
  const fallback = defaultColor || DEFAULT_TRACK_COLOR;
  const mode = mod.trackColorMode ?? "line";
  if (mode === "manual") {
    return solidColor(normalizeHex(mod.trackColor ?? "") || fallback);
  }
  if (mode === "line") {
    const colors = lineColorsForModule(mod, sourceLines);
    if (colors.length >= 2) {
      const centerX = templateWidth / 2;
      const top = trackBounds?.minY ?? 36;
      const bottom = trackBounds?.maxY ?? 76;
      // 多条线路竖直渐变：按 lineIds 顺序自上而下均分停靠点。
      // 2 条时即 0%/100%（与原有行为一致）；3/4 条时中间轨道落在中间停靠点上。
      const stops = colors.map((color, index) => ({
        offset: `${(index / (colors.length - 1)) * 100}%`,
        color,
      }));
      return gradientColor(
        `grad-mod-${mod.id}`,
        centerX, top,
        centerX, bottom,
        stops,
      );
    }
    if (colors.length === 1) return solidColor(colors[0]);
    return solidColor(fallback);
  }
  return solidColor(fallback);
}

/**
 * 从模板轨道几何计算竖直渐变轴范围（minY/maxY，含贝塞尔控制点）。
 * 用于双线模块渐变轴：按模板实际轨道位置而非固定 36→76。
 */
export function templateTrackYBounds(tracks: { y1: number; y2: number; cy?: number; cy2?: number }[]): { minY: number; maxY: number } | undefined {
  const ys: number[] = [];
  for (const track of tracks) {
    ys.push(track.y1, track.y2);
    if (typeof track.cy === "number") ys.push(track.cy);
    if (typeof track.cy2 === "number") ys.push(track.cy2);
  }
  if (ys.length === 0) return undefined;
  return { minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// ── 模块颜色方案（逐轨 + 逐站台 + 取样） ─────────

/** 一条轨道一格的配色方案 */
export interface ModuleColorPlan {
  /** 每条轨道的颜色（与模板 tracks 顺序对齐，均为 solid hex） */
  trackColors: string[];
  /** 模块级取样 spec（连接端点、站名标签用；停靠点放在每条主轨位置） */
  sampleSpec: ColorSpec;
  /** 每个模板站台的填充 spec（与模板 platforms 顺序对齐；undefined = 保持默认填充） */
  templatePlatformSpecs: (ColorSpec | undefined)[];
}

/**
 * 将轨道自上而下分组到各线路。
 *
 * 每条线路获得连续的一段轨道；轨道数无法整除时，多出的轨道给上方线路
 * （4 轨 3 线 → [2,1,1]，对应三岛站台上下相邻归属）。单线时全部同色。
 */
export function groupTrackColors(trackCount: number, colors: string[], fallback: string): string[] {
  const result: string[] = [];
  if (trackCount <= 0) return result;
  if (!colors.length) return new Array(trackCount).fill(fallback);
  if (colors.length === 1) return new Array(trackCount).fill(colors[0]);
  const base = Math.floor(trackCount / colors.length);
  const remainder = trackCount % colors.length;
  let group = 0;
  let remainingInGroup = base + (group < remainder ? 1 : 0);
  for (let i = 0; i < trackCount; i++) {
    result.push(colors[group]);
    remainingInGroup--;
    if (remainingInGroup <= 0 && group < colors.length - 1) {
      group++;
      remainingInGroup = base + (group < remainder ? 1 : 0);
    }
  }
  return result;
}

/**
 * 由逐轨颜色构建取样渐变：停靠点放在每条主轨的 Y 位置。
 * 这样连接端点（端口在轨道上）按位置采样就得到该轨道的线路色；
 * 轨道之间没有采样点，渐变只作为取样机制，不会直接作用于轨道渲染。
 */
function buildSampleSpecForTracks(
  trackYs: number[],
  trackColors: string[],
  templateWidth: number,
  gradientId: string,
  trackBounds?: { minY: number; maxY: number },
): ColorSpec {
  if (!trackYs.length) return solidColor(trackColors[0] || DEFAULT_TRACK_COLOR);
  const unique = new Set(trackColors.map((color) => color.toLowerCase()));
  if (unique.size <= 1) return solidColor(trackColors[0] || DEFAULT_TRACK_COLOR);
  const ys = trackBounds ? [trackBounds.minY, trackBounds.maxY] : trackYs;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY;
  if (span <= 0) return solidColor(trackColors[0] || DEFAULT_TRACK_COLOR);
  const stops: GradientStop[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < trackYs.length; i++) {
    const offset = ((trackYs[i] - minY) / span) * 100;
    const key = offset.toFixed(4);
    if (seen.has(key)) continue;
    seen.add(key);
    stops.push({ offset: `${offset}%`, color: trackColors[i] });
  }
  if (stops.length <= 1) return solidColor(stops[0]?.color || DEFAULT_TRACK_COLOR);
  const centerX = templateWidth / 2;
  return gradientColor(gradientId, centerX, minY, centerX, maxY, stops);
}

/**
 * 计算模块的完整颜色方案（轨道逐条着色 + 站台归线 + 连接/站名取样）。
 *
 * 缺省模式为 "line"（跟随线路）；未关联线路时全轨回退深灰。
 *
 * - "default" → 全轨默认深灰、取样纯色、模板站台保持默认填充（显式选择）
 * - "manual"  → 全轨手动色、取样纯色、模板站台保持默认填充
 * - "line"    → 逐轨按线路着色；取样用分轨渐变；模板站台按"同台双线渐变 /
 *               多岛每岛一条线路"归线
 */
export function resolveModuleColorPlan(
  mod: DiagramModule,
  sourceLines: SourceLine[],
  templateWidth: number,
  tracks: TemplateTrack[],
  templatePlatforms: TemplatePlatform[],
  trackBounds?: { minY: number; maxY: number },
  linePattern?: number[],
): ModuleColorPlan {
  const fallback = DEFAULT_TRACK_COLOR;
  const mode = mod.trackColorMode ?? "line";
  const noPlatformSpecs = templatePlatforms.map(() => undefined);
  if (mode === "manual") {
    const color = normalizeHex(mod.trackColor ?? "") || fallback;
    return { trackColors: tracks.map(() => color), sampleSpec: solidColor(color), templatePlatformSpecs: noPlatformSpecs };
  }
  if (mode === "default") {
    return { trackColors: tracks.map(() => fallback), sampleSpec: solidColor(fallback), templatePlatformSpecs: noPlatformSpecs };
  }
  // line 模式
  const colors = lineColorsForModule(mod, sourceLines);
  if (!colors.length) {
    return { trackColors: tracks.map(() => fallback), sampleSpec: solidColor(fallback), templatePlatformSpecs: noPlatformSpecs };
  }
  // 模板自带逐轨线路映射（如同台换乘 A上/B上/B下/A下 → [0,1,1,0]）时按它着色，
  // 否则按轨道自上而下分组（groupTrackColors）。
  const hasLinePattern = !!linePattern && linePattern.length === tracks.length;
  const trackColors = hasLinePattern
    ? tracks.map((_, index) => colors[linePattern![index]] ?? fallback)
    : groupTrackColors(tracks.length, colors, fallback);
  const mainTracks = tracks.filter((track) => track.type === "main");
  const sampleSpec = buildSampleSpecForTracks(
    mainTracks.map((track) => track.y1),
    mainTracks.map((track) => trackColors[tracks.indexOf(track)]),
    templateWidth,
    `grad-mod-${mod.id}`,
    trackBounds,
  );
  const templatePlatformSpecs = hasLinePattern
    ? templatePlatforms.map((platform, index) => platformFillForPattern(platform, tracks, colors, linePattern!, mod.id, index))
    : templatePlatforms.map((platform) => platformFillFor(platform, templatePlatforms, colors, mod.id));
  return { trackColors, sampleSpec, templatePlatformSpecs };
}

/**
 * 带 trackLinePattern 的模板（如同台换乘站）：每个站台按上下相邻轨道的
 * 线路取渐变（上侧轨道线路 / 下侧轨道线路）。两侧同线时退化为纯色。
 */
/**
 * 站台上下相邻轨道对应的线路颜色（模板坐标）。
 * - 线路数 < 2 → [唯一线路色]（纯色）
 * - 上下轨同线 → [该色]（退化为纯色）
 * - 上下轨异线 → [上轨线路色, 下轨线路色]（渐变）
 */
function adjacentTrackColors(platform: TemplatePlatform, tracks: TemplateTrack[], colors: string[], linePattern: number[]): string[] {
  if (colors.length < 2) return [colors[0] || DEFAULT_TRACK_COLOR];
  const centerY = platform.y + platform.height / 2;
  let aboveIdx = -1;
  let belowIdx = -1;
  tracks.forEach((track, index) => {
    const ty = (track.y1 + track.y2) / 2;
    if (ty < centerY && (aboveIdx < 0 || ty > (tracks[aboveIdx].y1 + tracks[aboveIdx].y2) / 2)) aboveIdx = index;
    if (ty > centerY && (belowIdx < 0 || ty < (tracks[belowIdx].y1 + tracks[belowIdx].y2) / 2)) belowIdx = index;
  });
  const top = aboveIdx >= 0 ? colors[linePattern[aboveIdx]] ?? colors[0] : colors[0];
  const bottom = belowIdx >= 0 ? colors[linePattern[belowIdx]] ?? colors[colors.length - 1] : colors[colors.length - 1];
  return top === bottom ? [top] : [top, bottom];
}

/** 双色拼色渐变：上半 top、下半 bottom，50% 处硬切换，不混合过渡 */
function twoToneGradient(id: string, x1: number, y1: number, x2: number, y2: number, top: string, bottom: string): ColorSpec {
  return gradientColor(id, x1, y1, x2, y2, [
    { offset: "0%", color: top },
    { offset: "50%", color: top },
    { offset: "50%", color: bottom },
    { offset: "100%", color: bottom },
  ]);
}

/** 双色拼色的两半颜色 [上半, 下半]；非双色或两半同色时返回 undefined */
export function twoToneColors(spec: ColorSpec | undefined): [string, string] | undefined {
  const stops = spec?.kind === "gradient" ? spec.gradientDef?.stops : undefined;
  if (!stops || stops.length !== 4 || stops[1].offset !== "50%" || stops[2].offset !== "50%") return undefined;
  const top = stops[0].color;
  const bottom = stops[3].color;
  if (top === bottom) return undefined;
  return [top, bottom];
}

/** 判断是否为双色拼色（twoToneGradient 生成的 50% 硬切换 4 段色标，且上下两半颜色不同） */
export function isTwoToneSpec(spec: ColorSpec | undefined): boolean {
  return twoToneColors(spec) !== undefined;
}

/**
 * 带 trackLinePattern 的模板（如同台换乘站）：每个站台按上下相邻轨道的
 * 线路取渐变（上侧轨道线路 / 下侧轨道线路）。两侧同线时退化为纯色。
 */
function platformFillForPattern(
  platform: TemplatePlatform,
  tracks: TemplateTrack[],
  colors: string[],
  linePattern: number[],
  modId: string,
  index: number,
): ColorSpec | undefined {
  const stops = adjacentTrackColors(platform, tracks, colors, linePattern);
  if (stops.length === 1) return solidColor(stops[0]);
  // 模板站台直接以 template 坐标绘制（x=platform.x, y=platform.y），
  // 渐变必须覆盖站台实际位置，否则站台区域落在渐变范围外会被钳到纯色。
  return twoToneGradient(
    `grad-modplat-${modId}-${index}`,
    platform.x + platform.width / 2, platform.y,
    platform.x + platform.width / 2, platform.y + platform.height,
    stops[0], stops[1],
  );
}

/**
 * 把物化站台映射回模板站台（按岛式站台竖向顺序一一对应）。
 * 物化站台在放置时按模板 platforms 顺序创建，竖向顺序通常与模板一致。
 */
function matchingTemplatePlatform(
  platform: PlatformObject,
  templatePlatforms: TemplatePlatform[],
  modulePlatforms?: PlatformObject[],
): TemplatePlatform | undefined {
  const moduleIslands = (modulePlatforms ?? [])
    .filter((candidate) => candidate.platformType === "island")
    .slice()
    .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const templateIslands = templatePlatforms
    .filter((candidate) => candidate.type === "island")
    .slice()
    .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const index = moduleIslands.indexOf(platform);
  return index < 0 ? undefined : templateIslands[index];
}

/**
 * 为单个站台（模板坐标）计算填充 spec。
 *
 * - 单线 → 纯色该线路色
 * - 同台双线（仅一个岛式站台且恰好两条线）→ 站台渐变
 * - 多岛 / 侧式 → 站台按竖向顺序对应一条线路（无平台模块时兜底取第 0 条）
 */
function platformFillFor(platform: TemplatePlatform, allPlatforms: TemplatePlatform[], colors: string[], modId: string): ColorSpec | undefined {
  if (colors.length === 1) return solidColor(colors[0]);
  const islands = allPlatforms.filter((candidate) => candidate.type === "island");
  const islandCount = islands.length;
  if (platform.type === "island" && islandCount === 1 && colors.length === 2) {
    // 同台双线：单个岛式站台同时服务两条线 → 双色拼
    // 拼色必须覆盖站台实际 template 坐标，否则站台区域落在渐变范围外被钳到纯色
    return twoToneGradient(
      `grad-modplat-${modId}`,
      platform.x + platform.width / 2, platform.y,
      platform.x + platform.width / 2, platform.y + platform.height,
      colors[0], colors[1],
    );
  }
  // 多岛 / 侧式：站台按竖向顺序对应一条线路
  const ordered = (islandCount > 0 ? islands : allPlatforms)
    .slice()
    .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const index = Math.max(0, ordered.indexOf(platform));
  return solidColor(colors[Math.min(index, colors.length - 1)]);
}

// ── 连接轨道颜色 ──────────────────────────────

/**
 * 解析连接（区间）轨道的描边颜色。
 *
 * - "manual" → solid conn.color（或回退）
 * - "auto"   → 两端模块颜色已由调用方预解析传入：
 *     两端同色 → solid；两端异色 → gradient（轴 = from → to 世界坐标）
 */
export function resolveConnectionColor(
  connColorMode: "auto" | "manual" | undefined,
  connManualColor: string | undefined,
  fromColor: string,
  toColor: string,
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  connId: string,
  defaultColor?: string,
): ColorSpec {
  const fallback = defaultColor || DEFAULT_TRACK_COLOR;
  const mode = connColorMode ?? "auto";
  if (mode === "manual") {
    return solidColor(normalizeHex(connManualColor ?? "") || fallback);
  }
  const from = normalizeHex(fromColor) || fallback;
  const to = normalizeHex(toColor) || fallback;
  if (from.toLowerCase() === to.toLowerCase()) return solidColor(from);
  return gradientColor(
    `grad-conn-${connId}`,
    fromPos.x, fromPos.y,
    toPos.x, toPos.y,
    [
      { offset: "0%", color: from },
      { offset: "100%", color: to },
    ],
  );
}

// ── 站台填充颜色 ──────────────────────────────

/**
 * 解析站台填充色。
 *
 * 缺省模式为 "line"（跟随线路）：未显式设置颜色模式的站台自动按所属线路着色。
 *
 * - "default" → solid platform.fill（显式选择"不跟随线路"的手动填充色）
 * - "line"    → 所属模块的线路颜色：
 *     1 条线路 solid 该线路颜色；
 *     同台双线（仅一个岛式站台且恰好两条线）→ 站台渐变（上为线路 0、下为线路 1）
 *     多岛 / 侧式 → 每个站台按竖向顺序对应一条线路 solid（岛 0 → 线路 0，岛 1 → 线路 1）
 *     （独立站台用 sourceLineId 回退；无任何线路信息则回退默认填充）
 *
 * @param modulePlatforms 所属模块的全部站台对象（用于多岛按竖向顺序归线）；
 *        不传时按单个岛式站台推断（向后兼容）
 */
export function resolvePlatformFillColor(
  platform: PlatformObject,
  modules: DiagramModule[],
  sourceLines: SourceLine[],
  defaultFill?: string,
  modulePlatforms?: PlatformObject[],
  templateTracks?: TemplateTrack[],
  templatePlatforms?: TemplatePlatform[],
  linePattern?: number[],
): ColorSpec {
  const fallback = defaultFill || DEFAULT_PLATFORM_FILL;
  const mode = platform.colorMode ?? "line";
  if (mode === "default") {
    // 原样透传 fill：旧工程可能使用非 hex 颜色（如 rgb()、命名色），保持完全向后兼容
    return solidColor(platform.fill || fallback);
  }
  const owner = platform.moduleId
    ? modules.find((module) => module.id === platform.moduleId)
    : undefined;
  const lineIds = owner?.lineIds?.length
    ? owner.lineIds
    : platform.sourceLineId
      ? [platform.sourceLineId]
      : [];
  const colors = lineIds.map((lineId) => lineColorOf(lineId, sourceLines));
  if (colors.length === 1) return solidColor(colors[0]);
  if (colors.length >= 2) {
    const modulePlatforms_ = modulePlatforms ?? [];
    const islands = modulePlatforms_.filter((candidate) => candidate.platformType === "island");
    // 未提供模块站台列表时按自身类型推断岛数（保持旧调用向后兼容）
    const islandCount = islands.length || (platform.platformType === "island" ? 1 : 0);
    // 带 trackLinePattern 的模板（如同台换乘，含多岛）：每个站台按上下相邻轨道取渐变，
    // 而不是多岛逐岛纯色
    if (platform.platformType === "island" && linePattern && templateTracks?.length && linePattern.length === templateTracks.length) {
      const templatePlatform = matchingTemplatePlatform(platform, templatePlatforms ?? [], modulePlatforms);
      if (templatePlatform) {
        const stops = adjacentTrackColors(templatePlatform, templateTracks, colors, linePattern);
        if (stops.length === 1) return solidColor(stops[0]);
        // 物化站台在本地原点绘制（外层 translate 定位），拼色用 0..height 覆盖站台自身
        return twoToneGradient(
          `grad-plat-${platform.id}`,
          platform.width / 2, 0,
          platform.width / 2, platform.height,
          stops[0], stops[1],
        );
      }
    }
    if (platform.platformType === "island" && islandCount === 1 && colors.length === 2) {
      // 同台双线：单个岛式站台同时服务两条线 → 双色拼
      return twoToneGradient(
        `grad-plat-${platform.id}`,
        platform.width / 2, 0,
        platform.width / 2, platform.height,
        colors[0], colors[1],
      );
    }
    // 多岛 / 侧式：站台按竖向顺序对应一条线路
    const ordered = (islandCount > 0 ? islands : modulePlatforms_)
      .slice()
      .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
    const index = Math.max(0, ordered.indexOf(platform));
    return solidColor(colors[Math.min(index, colors.length - 1)]);
  }
  return solidColor(fallback);
}

// ── 站台线路名（提示文字） ──────────────────────

/** 线路的显示名：中文名 > 英文名 > 编号 > 代码 */
function lineNameOf(line: SourceLine | undefined): string {
  return (line?.nameZh || line?.nameEn || line?.number || line?.code || "").trim();
}

/**
 * 站台上下相邻轨道对应的线路名（模板坐标）。
 * 与 adjacentTrackColors 的轨道归属一致：上轨线路 / 下轨线路，同线时去重为单个。
 */
function adjacentTrackLineNames(
  platform: TemplatePlatform,
  tracks: TemplateTrack[],
  lines: SourceLine[],
  linePattern: number[],
): string[] | undefined {
  const centerY = platform.y + platform.height / 2;
  let aboveIdx = -1;
  let belowIdx = -1;
  tracks.forEach((track, index) => {
    const ty = (track.y1 + track.y2) / 2;
    if (ty < centerY && (aboveIdx < 0 || ty > (tracks[aboveIdx].y1 + tracks[aboveIdx].y2) / 2)) aboveIdx = index;
    if (ty > centerY && (belowIdx < 0 || ty < (tracks[belowIdx].y1 + tracks[belowIdx].y2) / 2)) belowIdx = index;
  });
  const topIdx = aboveIdx >= 0 ? linePattern[aboveIdx] : 0;
  const bottomIdx = belowIdx >= 0 ? linePattern[belowIdx] : lines.length - 1;
  const names = [lineNameOf(lines[topIdx]), lineNameOf(lines[bottomIdx])].filter(Boolean);
  return names.length ? [...new Set(names)] : undefined;
}

/**
 * 解析站台关联的线路显示名，用于把"岛式站台 / 同台换乘"等提示文字替换成线路名。
 *
 * 归线与 resolvePlatformFillColor 完全一致：
 * - 带 trackLinePattern 的模板（如同台换乘）→ 上下相邻轨道的两条线路名（同线去重）
 * - 同台双线（单岛恰好两线）→ 两条线路名
 * - 多岛 / 侧式 → 按竖向顺序对应一条线路名
 * 未配置线路或无可用名称时返回 undefined（渲染层保持原提示文字）。
 */
export function platformLineNames(
  platform: PlatformObject,
  modules: DiagramModule[],
  sourceLines: SourceLine[],
  modulePlatforms?: PlatformObject[],
  templateTracks?: TemplateTrack[],
  templatePlatforms?: TemplatePlatform[],
  linePattern?: number[],
): string[] | undefined {
  const owner = platform.moduleId ? modules.find((module) => module.id === platform.moduleId) : undefined;
  const lineIds = owner?.lineIds?.length ? owner.lineIds : platform.sourceLineId ? [platform.sourceLineId] : [];
  const lines = lineIds.map((id) => sourceLines.find((candidate) => candidate.id === id));
  const valid = lines.filter((line): line is SourceLine => !!line && !!lineNameOf(line));
  if (!valid.length) return undefined;
  const nameOf = (line: SourceLine) => lineNameOf(line);
  if (valid.length === 1) return [nameOf(valid[0])];

  const modulePlatforms_ = modulePlatforms ?? [];
  const islands = modulePlatforms_.filter((candidate) => candidate.platformType === "island");
  const islandCount = islands.length || (platform.platformType === "island" ? 1 : 0);
  // 同台换乘（trackLinePattern 多岛）：按上下相邻轨道归线
  if (platform.platformType === "island" && linePattern && templateTracks?.length && linePattern.length === templateTracks.length) {
    const templatePlatform = matchingTemplatePlatform(platform, templatePlatforms ?? [], modulePlatforms);
    if (templatePlatform) {
      const names = adjacentTrackLineNames(templatePlatform, templateTracks, valid, linePattern);
      if (names) return names;
    }
  }
  if (platform.platformType === "island" && islandCount === 1 && valid.length === 2) {
    // 同台双线：单个岛式站台同时服务两条线
    return [nameOf(valid[0]), nameOf(valid[1])];
  }
  // 多岛 / 侧式：站台按竖向顺序对应一条线路
  const ordered = (islandCount > 0 ? islands : modulePlatforms_)
    .slice()
    .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const index = Math.max(0, ordered.indexOf(platform));
  return [nameOf(valid[Math.min(index, valid.length - 1)])];
}

/** Resolve line names for a template platform that has not been materialized. */
export function templatePlatformLineNames(
  platform: TemplatePlatform,
  owner: DiagramModule,
  sourceLines: SourceLine[],
  templateTracks: TemplateTrack[],
  templatePlatforms: TemplatePlatform[],
  linePattern?: number[],
): string[] | undefined {
  const valid = owner.lineIds
    .map((id) => sourceLines.find((candidate) => candidate.id === id))
    .filter((line): line is SourceLine => !!line && !!lineNameOf(line));
  if (!valid.length) return undefined;
  if (valid.length === 1) return [lineNameOf(valid[0])];
  const islands = templatePlatforms.filter((candidate) => candidate.type === "island");
  if (platform.type === "island" && linePattern && linePattern.length === templateTracks.length) {
    const names = adjacentTrackLineNames(platform, templateTracks, valid, linePattern);
    if (names) return names;
  }
  if (platform.type === "island" && islands.length === 1 && valid.length === 2) {
    return [lineNameOf(valid[0]), lineNameOf(valid[1])];
  }
  const ordered = (islands.length ? islands : templatePlatforms)
    .slice()
    .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const index = Math.max(0, ordered.indexOf(platform));
  return [lineNameOf(valid[Math.min(index, valid.length - 1)])];
}

// ── 文字标签填充颜色 ──────────────────────────

/**
 * 解析独立文字标签（LabelObject）的填充色。
 *
 * 生效模式 = label.colorMode ?? 附着模块的 labelColorMode ?? "line"
 * —— 即模块的"站名颜色"开关驱动附着标签；标签面板显式设置可单独覆盖；
 * 未显式设置时默认跟随线路。
 *
 * - "default" → solid label.fill（保留手动颜色）
 * - "line"    → 附着模块的轨道色有"真实颜色"（非默认深灰）时取该颜色；
 *               否则（无附着模块或模块未着色）回退 label.fill
 *
 * @param attachedModuleSpec 附着模块已解析的轨道色（ColorSpec），由调用方传入
 * @param moduleLabelColorMode 附着模块的 labelColorMode（模块级站名颜色开关）
 */
export function resolveLabelFillColor(
  label: { colorMode?: "default" | "line"; fill?: string },
  attachedModuleSpec: ColorSpec | undefined,
  defaultFill?: string,
  moduleLabelColorMode?: "default" | "line",
): ColorSpec {
  const fallback = defaultFill || DEFAULT_LABEL_FILL;
  const mode = label.colorMode ?? moduleLabelColorMode ?? "line";
  if (mode === "line" && attachedModuleSpec) {
    const isGradient = attachedModuleSpec.kind === "gradient";
    const isColored = isGradient || (attachedModuleSpec.kind === "solid" && attachedModuleSpec.css.toLowerCase() !== DEFAULT_TRACK_COLOR.toLowerCase());
    if (isColored) return solidColor(effectiveColor(attachedModuleSpec));
  }
  return solidColor(label.fill || fallback);
}
