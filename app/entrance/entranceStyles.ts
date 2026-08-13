/**
 * 出入口站名标识编辑器的样式模板系统。
 * 每种样式拥有完全独立的参数集，切换样式时不会影响其他样式的参数。
 */

/** 样式模板标识符，后续新增样式在此扩展。 */
export type EntranceStyleTemplateId = "classic" | "pulse";

/** 样式模板元数据，用于 UI 展示。 */
export interface EntranceStyleTemplateMeta {
  id: EntranceStyleTemplateId;
  label: string;
  description: string;
  /** 标识该样式当前是否可用（预留，新样式可设为 false 直到渲染完成）。 */
  available: boolean;
}

/** 所有样式可调参数的集合。每种样式独立持有一份完整参数。 */
export interface EntranceStyleParams {
  // ── 背景与画面 ──
  backgroundMode: "image" | "solid";
  backgroundColor: string;
  backgroundScale: number;
  backgroundPositionX: number;
  backgroundPositionY: number;
  backgroundBrightness: number;
  imageOverlayOpacity: number;

  // ── 站名文字 ──
  textColor: string;
  zhFontSize: number;
  zhLetterSpacing: number;
  zhOffsetX: number;
  zhOffsetY: number;
  enFontSize: number;
  enLetterSpacing: number;
  enOffsetX: number;
  enOffsetY: number;

  // ── 出口信息 ──
  exitFontSize: number;
  exitLetterSpacing: number;
  exitInfoX: number;
  exitInfoY: number;

  // ── 线路色条 ──
  badgeX: number;
  badgeWidth: number;
  badgeHeight: number;
  badgeGap: number;
  badgeVerticalOffset: number;
  badgeDividerWidth: number;
  badgeFontSize: number;
  badgeLetterSpacing: number;

  // ── 站点图标 ──
  iconMode: "none" | "borderless" | "rounded" | "circle";
  iconSizeRatio: number;
  iconBorderWidth: number;
  iconBorderSizeRatio: number;
}

/** 所有已注册样式模板的元数据列表。 */
export const ENTRANCE_STYLE_TEMPLATES: EntranceStyleTemplateMeta[] = [
  { id: "classic", label: "经典样式", description: "当前出入口站名标识样式", available: true },
  { id: "pulse", label: "夜航样式", description: "深色高对比城市信息牌", available: true },
];

/** 经典样式的默认参数（与编辑器原有默认值一致）。 */
export function defaultClassicParams(): EntranceStyleParams {
  return {
    backgroundMode: "image",
    backgroundColor: "#DCE5E9",
    backgroundScale: 1,
    backgroundPositionX: 50,
    backgroundPositionY: 50,
    backgroundBrightness: 70,
    imageOverlayOpacity: 0.5,

    textColor: "#343434",
    zhFontSize: 38,
    zhLetterSpacing: 4,
    zhOffsetX: 0,
    zhOffsetY: 0,
    enFontSize: 18,
    enLetterSpacing: 4,
    enOffsetX: 0,
    enOffsetY: 6,

    exitFontSize: 14,
    exitLetterSpacing: 0,
    exitInfoX: 576,
    exitInfoY: 73,

    badgeX: 0,
    badgeWidth: 108,
    badgeHeight: 30,
    badgeGap: 4,
    badgeVerticalOffset: 0,
    badgeDividerWidth: 4,
    badgeFontSize: 27,
    badgeLetterSpacing: 2,

    iconMode: "rounded",
    iconSizeRatio: 1.7,
    iconBorderWidth: 2,
    iconBorderSizeRatio: 0.8,
  };
}

/** 夜航样式：深色底板、胶囊线路标识和高对比信息层级。 */
export function defaultPulseParams(): EntranceStyleParams {
  return {
    backgroundMode: "image",
    backgroundColor: "#07131F",
    backgroundScale: 1,
    backgroundPositionX: 50,
    backgroundPositionY: 50,
    backgroundBrightness: 48,
    imageOverlayOpacity: 0.42,

    textColor: "#F4FBFF",
    zhFontSize: 34,
    zhLetterSpacing: 3,
    zhOffsetX: 0,
    zhOffsetY: 3,
    enFontSize: 13,
    enLetterSpacing: 3,
    enOffsetX: 0,
    enOffsetY: 8,

    exitFontSize: 11,
    exitLetterSpacing: 1,
    exitInfoX: 576,
    exitInfoY: 82,

    badgeX: 14,
    badgeWidth: 98,
    badgeHeight: 23,
    badgeGap: 6,
    badgeVerticalOffset: 0,
    badgeDividerWidth: 0,
    badgeFontSize: 17,
    badgeLetterSpacing: 1,

    iconMode: "circle",
    iconSizeRatio: 1.25,
    iconBorderWidth: 2,
    iconBorderSizeRatio: 1.12,
  };
}

/** 根据样式模板 ID 返回该样式的默认参数。 */
export function defaultParamsForStyle(id: EntranceStyleTemplateId): EntranceStyleParams {
  if (id === "pulse") return defaultPulseParams();
  if (id === "classic") return defaultClassicParams();
  return defaultClassicParams();
}

/** 初始化所有样式的参数存储，确保每个样式都有完整参数。 */
export function initStyleStore(): Record<EntranceStyleTemplateId, EntranceStyleParams> {
  const store = {} as Record<EntranceStyleTemplateId, EntranceStyleParams>;
  for (const meta of ENTRANCE_STYLE_TEMPLATES) {
    store[meta.id] = defaultParamsForStyle(meta.id);
  }
  return store;
}

/** 规范化样式参数：补齐缺失字段，确保结构完整。 */
export function normalizeStyleParams(
  source: Partial<EntranceStyleParams> | undefined,
  fallback: EntranceStyleParams,
): EntranceStyleParams {
  return { ...fallback, ...source };
}

/** 规范化整个样式存储。 */
export function normalizeStyleStore(
  store: Partial<Record<EntranceStyleTemplateId, EntranceStyleParams>> | undefined,
): Record<EntranceStyleTemplateId, EntranceStyleParams> {
  const normalized = {} as Record<EntranceStyleTemplateId, EntranceStyleParams>;
  for (const meta of ENTRANCE_STYLE_TEMPLATES) {
    normalized[meta.id] = normalizeStyleParams(store?.[meta.id], defaultParamsForStyle(meta.id));
  }
  return normalized;
}
