export type TransitKind = "metro" | "tram";
export type Direction = "forward" | "reverse";
export type StationState = "passed" | "current" | "upcoming";
export type TerminalType = "normal" | "terminal" | "through-start" | "through-end";
export type StyleTemplateId = "classic" | "loop" | "scenic" | "pulse";

export interface TransitLine {
  id: string;
  kind: TransitKind;
  number: string;
  nameZh: string;
  nameEn: string;
  code: string;
  lineColor: string;
  stationColor: string;
  currentColor: string;
  passedColor: string;
  textColor: string;
  description: string;
}

export interface Station {
  id: string;
  lineId: string;
  sequence: number;
  nameZh: string;
  nameEn: string;
  code: string;
  markerColor: string;
  terminalType: TerminalType;
  isOpen: boolean;
  throughLineIds: string[];
  notes: string;
  icon?: string;
}

export interface Transfer {
  id: string;
  stationId: string;
  targetLineId: string;
  order: number;
  colorOverride: string;
  hidden: boolean;
}

export interface LayoutConfig {
  schemaVersion: number;
  tileSize: number;
  lineY: number;
  lineWidth: number;
  stationRadius: number;
  stationRingWidth: number;
  loopArcDepth: number;
  loopBottomBarHeight: number;
  loopDirectionMarkerSize: number;
  loopDirectionMarkerOffset: number;
  loopDirectionIconSize: number;
  loopDirectionBadgeX: number;
  loopDirectionBadgeY: number;
  loopDirectionBadgeWidth: number;
  loopDirectionBadgeHeight: number;
  loopDirectionBadgeRadius: number;
  loopDirectionBadgeFontSize: number;
  loopDirectionLineNameX: number;
  loopDirectionLineNameY: number;
  loopDirectionLineNameFontSize: number;
  loopDirectionIconX: number;
  loopDirectionIconY: number;
  loopDirectionLoopTextX: number;
  loopDirectionLoopTextY: number;
  loopDirectionLoopTextFontSize: number;
  loopDirectionRunTextX: number;
  loopDirectionRunTextY: number;
  loopDirectionRunTextFontSize: number;
  loopTransferBadgeHeight: number;
  loopTransferBadgeFontSize: number;
  loopTransferBadgeGap: number;
  loopStationZhOffset: number;
  loopStationEnOffset: number;
  showStationCenterCodes: boolean;
  stationCenterLineFontSize: number;
  stationCenterSequenceFontSize: number;
  stationCenterLetterSpacing: number;
  stationCenterDividerWidth: number;
  transferArrowHeadWidth: number;
  transferArrowLength: number;
  transferArrowStemWidth: number;
  stationZhFontSize: number;
  stationZhLetterSpacing: number;
  stationEnFontSize: number;
  stationEnLetterSpacing: number;
  stationEnMinFontSize: number;
  closedStationsUsePassedColor: boolean;
  transferFontSize: number;
  transferLetterSpacing: number;
  tramTransferFontSize: number;
  tramTransferLetterSpacing: number;
  tramTransferVerticalOffset: number;
  infoAccentWidth: number;
  infoLabelFontSize: number;
  infoLabelLetterSpacing: number;
  infoStationFontSize: number;
  infoStationLetterSpacing: number;
  currentAccentX: number;
  currentAccentY: number;
  currentAccentWidth: number;
  currentAccentHeight: number;
  currentLabelX: number;
  currentLabelY: number;
  currentStationX: number;
  currentStationY: number;
  nextAccentX: number;
  nextAccentY: number;
  nextAccentWidth: number;
  nextAccentHeight: number;
  nextLabelX: number;
  nextLabelY: number;
  nextStationX: number;
  nextStationY: number;
  directionArrowShaftLength: number;
  directionArrowThickness: number;
  directionArrowHeadLength: number;
  directionArrowHeadWidth: number;
  directionArrowOutlineWidth: number;
  directionArrowX: number;
  directionArrowY: number;
  directionLabelFontSize: number;
  directionLabelLetterSpacing: number;
  directionLabelX: number;
  directionLabelY: number;
  directionStationFontSize: number;
  directionStationLetterSpacing: number;
  directionStationX: number;
  directionStationY: number;
  lineBadgeWidth: number;
  lineBadgeHeight: number;
  lineBadgeRadius: number;
  lineBadgeX: number;
  lineBadgeY: number;
  lineBadgeNumberFontSize: number;
  lineBadgeNumberLetterSpacing: number;
  lineBadgeNumberX: number;
  lineBadgeNumberY: number;
  lineBadgeEnglishFontSize: number;
  lineBadgeEnglishLetterSpacing: number;
  lineBadgeEnglishX: number;
  lineBadgeEnglishY: number;
  lineBadgeDescriptionFontSize: number;
  lineBadgeDescriptionLetterSpacing: number;
  lineBadgeDescriptionX: number;
  lineBadgeDescriptionY: number;
  scenicStationRectWidth: number;
  scenicStationRectHeight: number;
  scenicStationRectRadius: number;
  scenicStationRectBorderWidth: number;
  scenicStationIconSize: number;
  scenicStationIconPadding: number;
  scenicStationZhY: number;
  scenicStationEnY: number;
  scenicBarHeight: number;
  scenicBarY: number;
  scenicDirectionBarHeight: number;
  scenicDirectionBarY: number;
  pulsePanelColor: string;
  pulseTrackColor: string;
  pulseGlowWidth: number;
  pulseNodeWidth: number;
  pulseNodeHeight: number;
  pulseNodeRadius: number;
  pulseCurrentHaloSize: number;
  pulseHeaderHeight: number;
  pulseShowSequence: boolean;
  pulseTransferBadgeHeight: number;
  pulseTransferBadgeGap: number;
  pulseStationZhY: number;
  pulseStationEnY: number;
  background: string;
  fontZh: string;
  fontEn: string;
}

export interface TransitData {
  schemaVersion: number;
  lines: TransitLine[];
  stations: Station[];
  transfers: Transfer[];
  layout: LayoutConfig;
  activeStyleTemplate: StyleTemplateId;
  layoutTemplates: Record<StyleTemplateId, LayoutConfig>;
  lineStyleTemplates?: Record<string, StyleTemplateId>;
}

export interface RevisionInfo {
  id: string;
  createdAt: string;
  kind?: "saved" | "before-save" | "before-restore" | "import" | "legacy";
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  schemaVersion: 10,
  tileSize: 128,
  lineY: 58,
  lineWidth: 11.5,
  stationRadius: 14,
  stationRingWidth: 5.5,
  loopArcDepth: 18,
  loopBottomBarHeight: 14,
  loopDirectionMarkerSize: 8,
  loopDirectionMarkerOffset: 5,
  loopDirectionIconSize: 48,
  loopDirectionBadgeX: 64,
  loopDirectionBadgeY: 7,
  loopDirectionBadgeWidth: 56,
  loopDirectionBadgeHeight: 16,
  loopDirectionBadgeRadius: 7,
  loopDirectionBadgeFontSize: 10,
  loopDirectionLineNameX: 64,
  loopDirectionLineNameY: 40,
  loopDirectionLineNameFontSize: 14,
  loopDirectionIconX: 64,
  loopDirectionIconY: 38,
  loopDirectionLoopTextX: 64,
  loopDirectionLoopTextY: 94,
  loopDirectionLoopTextFontSize: 14,
  loopDirectionRunTextX: 64,
  loopDirectionRunTextY: 110,
  loopDirectionRunTextFontSize: 14,
  loopTransferBadgeHeight: 17,
  loopTransferBadgeFontSize: 8,
  loopTransferBadgeGap: 3,
  loopStationZhOffset: 43,
  loopStationEnOffset: 27,
  showStationCenterCodes: false,
  stationCenterLineFontSize: 7,
  stationCenterSequenceFontSize: 6,
  stationCenterLetterSpacing: 0,
  stationCenterDividerWidth: 12,
  transferArrowHeadWidth: 18,
  transferArrowLength: 24,
  transferArrowStemWidth: 8,
  stationZhFontSize: 18,
  stationZhLetterSpacing: 0,
  stationEnFontSize: 12,
  stationEnLetterSpacing: 0,
  stationEnMinFontSize: 4.5,
  closedStationsUsePassedColor: false,
  transferFontSize: 16,
  transferLetterSpacing: 0,
  tramTransferFontSize: 10,
  tramTransferLetterSpacing: 0,
  tramTransferVerticalOffset: 1.5,
  infoAccentWidth: 7,
  infoLabelFontSize: 18,
  infoLabelLetterSpacing: 0,
  infoStationFontSize: 19,
  infoStationLetterSpacing: 0,
  currentAccentX: 6,
  currentAccentY: 34,
  currentAccentWidth: 7,
  currentAccentHeight: 22,
  currentLabelX: 18,
  currentLabelY: 51,
  currentStationX: 17,
  currentStationY: 78,
  nextAccentX: 6,
  nextAccentY: 34,
  nextAccentWidth: 7,
  nextAccentHeight: 22,
  nextLabelX: 18,
  nextLabelY: 51,
  nextStationX: 17,
  nextStationY: 78,
  directionArrowShaftLength: 43,
  directionArrowThickness: 14,
  directionArrowHeadLength: 32,
  directionArrowHeadWidth: 46,
  directionArrowOutlineWidth: 0,
  directionArrowX: 78,
  directionArrowY: 42,
  directionLabelFontSize: 12,
  directionLabelLetterSpacing: 0,
  directionLabelX: 78,
  directionLabelY: 75,
  directionStationFontSize: 18,
  directionStationLetterSpacing: 0,
  directionStationX: 78,
  directionStationY: 98,
  lineBadgeWidth: 92,
  lineBadgeHeight: 52,
  lineBadgeRadius: 11,
  lineBadgeX: 64,
  lineBadgeY: 34,
  lineBadgeNumberFontSize: 28,
  lineBadgeNumberLetterSpacing: 0,
  lineBadgeNumberX: 64,
  lineBadgeNumberY: 70,
  lineBadgeEnglishFontSize: 10,
  lineBadgeEnglishLetterSpacing: 4,
  lineBadgeEnglishX: 64,
  lineBadgeEnglishY: 83,
  lineBadgeDescriptionFontSize: 13,
  lineBadgeDescriptionLetterSpacing: 0,
  lineBadgeDescriptionX: 64,
  lineBadgeDescriptionY: 105.5,
  scenicStationRectWidth: 44,
  scenicStationRectHeight: 32,
  scenicStationRectRadius: 6,
  scenicStationRectBorderWidth: 2.5,
  scenicStationIconSize: 54,
  scenicStationIconPadding: 4,
  scenicStationZhY: 94,
  scenicStationEnY: 108,
  scenicBarHeight: 15,
  scenicBarY: 58,
  scenicDirectionBarHeight: 15,
  scenicDirectionBarY: 58,
  pulsePanelColor: "#0D2233",
  pulseTrackColor: "#284052",
  pulseGlowWidth: 14,
  pulseNodeWidth: 30,
  pulseNodeHeight: 18,
  pulseNodeRadius: 9,
  pulseCurrentHaloSize: 5,
  pulseHeaderHeight: 22,
  pulseShowSequence: true,
  pulseTransferBadgeHeight: 16,
  pulseTransferBadgeGap: 3,
  pulseStationZhY: 91,
  pulseStationEnY: 108,
  background: "#FFFFFF",
  fontZh: '"Microsoft YaHei", "Noto Sans SC", sans-serif',
  fontEn: 'Arial, "Helvetica Neue", sans-serif',
};

export const DEFAULT_LOOP_LAYOUT: LayoutConfig = {
  ...DEFAULT_LAYOUT,
  lineY: 58,
  lineWidth: 6,
  stationRadius: 12,
  stationRingWidth: 4,
  loopArcDepth: 26,
  loopBottomBarHeight: 10,
  loopDirectionMarkerSize: 7,
  loopDirectionMarkerOffset: 8,
  loopDirectionIconSize: 48,
  loopTransferBadgeHeight: 17,
  loopTransferBadgeFontSize: 8,
  loopTransferBadgeGap: 3,
  loopStationZhOffset: 44,
  loopStationEnOffset: 30,
};

export const DEFAULT_SCENIC_LAYOUT: LayoutConfig = {
  ...DEFAULT_LAYOUT,
  lineY: 58,
  lineWidth: 4,
  stationRadius: 16,
  stationRingWidth: 2.5,
  stationZhFontSize: 14,
  stationEnFontSize: 9,
  stationEnMinFontSize: 5,
  transferFontSize: 12,
  tramTransferFontSize: 8,
  scenicStationRectWidth: 44,
  scenicStationRectHeight: 32,
  scenicStationRectRadius: 6,
  scenicStationRectBorderWidth: 2.5,
  scenicStationIconSize: 54,
  scenicStationIconPadding: 4,
  scenicStationZhY: 94,
  scenicStationEnY: 108,
  scenicBarHeight: 15,
  scenicBarY: 58,
  scenicDirectionBarHeight: 15,
  scenicDirectionBarY: 58,
  directionArrowOutlineWidth: 2,
};

export const DEFAULT_PULSE_LAYOUT: LayoutConfig = {
  ...DEFAULT_LAYOUT,
  schemaVersion: 11,
  background: "#07131F",
  lineY: 62,
  lineWidth: 5,
  stationRadius: 12,
  stationRingWidth: 3,
  stationZhFontSize: 15,
  stationEnFontSize: 8.5,
  stationEnMinFontSize: 4.5,
  transferFontSize: 8,
  tramTransferFontSize: 7.5,
  directionArrowShaftLength: 34,
  directionArrowThickness: 7,
  directionArrowHeadLength: 16,
  directionArrowHeadWidth: 20,
  directionArrowOutlineWidth: 0,
  directionArrowX: 78,
  directionArrowY: 53,
  directionLabelFontSize: 8,
  directionLabelX: 78,
  directionLabelY: 82,
  directionStationFontSize: 15,
  directionStationX: 78,
  directionStationY: 102,
  lineBadgeWidth: 102,
  lineBadgeHeight: 62,
  lineBadgeRadius: 14,
  lineBadgeX: 64,
  lineBadgeY: 25,
  lineBadgeNumberFontSize: 30,
  lineBadgeNumberY: 62,
  lineBadgeEnglishFontSize: 8,
  lineBadgeEnglishY: 77,
  lineBadgeDescriptionFontSize: 11,
  lineBadgeDescriptionY: 107,
  currentAccentX: 9,
  currentAccentY: 21,
  currentAccentWidth: 4,
  currentAccentHeight: 78,
  currentLabelX: 22,
  currentLabelY: 40,
  currentStationX: 22,
  currentStationY: 70,
  nextAccentX: 9,
  nextAccentY: 21,
  nextAccentWidth: 4,
  nextAccentHeight: 78,
  nextLabelX: 22,
  nextLabelY: 40,
  nextStationX: 22,
  nextStationY: 70,
  infoLabelFontSize: 10,
  infoStationFontSize: 21,
  pulsePanelColor: "#0D2233",
  pulseTrackColor: "#284052",
  pulseGlowWidth: 14,
  pulseNodeWidth: 30,
  pulseNodeHeight: 18,
  pulseNodeRadius: 9,
  pulseCurrentHaloSize: 5,
  pulseHeaderHeight: 22,
  pulseShowSequence: true,
  pulseTransferBadgeHeight: 16,
  pulseTransferBadgeGap: 3,
  pulseStationZhY: 91,
  pulseStationEnY: 108,
};

export function defaultLayoutForTemplate(template: StyleTemplateId): LayoutConfig {
  if (template === "loop") return DEFAULT_LOOP_LAYOUT;
  if (template === "scenic") return DEFAULT_SCENIC_LAYOUT;
  if (template === "pulse") return DEFAULT_PULSE_LAYOUT;
  return DEFAULT_LAYOUT;
}

export function normalizeTransitData(data: TransitData): TransitData {
  const normalizeLayout = (source: LayoutConfig | undefined, fallback: LayoutConfig): LayoutConfig => {
    const sourceLayout = source || ({} as LayoutConfig);
    const legacyAccentWidth = sourceLayout.infoAccentWidth ?? fallback.infoAccentWidth;
    return {
      ...fallback,
      ...sourceLayout,
      currentAccentWidth: sourceLayout.currentAccentWidth ?? legacyAccentWidth,
      nextAccentWidth: sourceLayout.nextAccentWidth ?? legacyAccentWidth,
      currentLabelX: sourceLayout.currentLabelX ?? 11 + legacyAccentWidth,
      nextLabelX: sourceLayout.nextLabelX ?? 11 + legacyAccentWidth,
      schemaVersion: fallback.schemaVersion,
    };
  };
  const requestedTemplate = data.activeStyleTemplate;
  const activeStyleTemplate: StyleTemplateId = requestedTemplate === "loop" || requestedTemplate === "scenic" || requestedTemplate === "pulse" ? requestedTemplate : "classic";
  const sourceTemplates = data.layoutTemplates || ({} as Partial<Record<StyleTemplateId, LayoutConfig>>);
  const loopSource = (sourceTemplates.loop?.schemaVersion || 0) < DEFAULT_LOOP_LAYOUT.schemaVersion ? DEFAULT_LOOP_LAYOUT : sourceTemplates.loop;
  const scenicSource = (sourceTemplates.scenic?.schemaVersion || 0) < DEFAULT_SCENIC_LAYOUT.schemaVersion ? DEFAULT_SCENIC_LAYOUT : sourceTemplates.scenic;
  const pulseSource = (sourceTemplates.pulse?.schemaVersion || 0) < DEFAULT_PULSE_LAYOUT.schemaVersion ? DEFAULT_PULSE_LAYOUT : sourceTemplates.pulse;
  const layoutTemplates: Record<StyleTemplateId, LayoutConfig> = {
    classic: normalizeLayout(sourceTemplates.classic || data.layout, DEFAULT_LAYOUT),
    loop: normalizeLayout(loopSource, DEFAULT_LOOP_LAYOUT),
    scenic: normalizeLayout(scenicSource, DEFAULT_SCENIC_LAYOUT),
    pulse: normalizeLayout(pulseSource, DEFAULT_PULSE_LAYOUT),
  };
  const isStyleTemplate = (value: unknown): value is StyleTemplateId => value === "classic" || value === "loop" || value === "scenic" || value === "pulse";
  const sourceLineStyles = data.lineStyleTemplates || {};
  const lineStyleTemplates = Object.fromEntries((data.lines || []).map((line) => [
    line.id,
    isStyleTemplate(sourceLineStyles[line.id]) ? sourceLineStyles[line.id] : activeStyleTemplate,
  ]));
  return {
    ...data,
    stations: (data.stations || []).map((station) => ({ ...station, isOpen: station.isOpen !== false })),
    transfers: (data.transfers || []).map((transfer) => ({ ...transfer, hidden: transfer.hidden === true })),
    activeStyleTemplate,
    layoutTemplates,
    lineStyleTemplates,
    layout: layoutTemplates[activeStyleTemplate],
  };
}

export function stationsForLine(data: TransitData, lineId: string): Station[] {
  return data.stations
    .filter((station) => station.lineId === lineId)
    .sort((a, b) => a.sequence - b.sequence);
}

/** 面向用户显示站点时使用业务名称与代号，避免暴露内部关联 ID。 */
export function lineOptionLabel(line: TransitLine): string {
  const lineName = line.nameZh.trim() || "未命名线路";
  const lineCode = line.code.trim();
  return `${lineName}${lineCode ? `（${lineCode}）` : ""}`;
}

export function stationOptionLabel(station: Station, line?: TransitLine): string {
  const stationName = station.nameZh.trim() || "未命名站点";
  const lineName = line?.nameZh.trim() || "未知线路";
  const stationCode = station.code.trim();
  return `${stationName} · ${lineName}${stationCode ? `（${stationCode}）` : ""}`;
}

export function stationCodeParts(station: Station, line: TransitLine): { lineCode: string; stationCode: string } {
  const code = station.code.trim();
  const match = code.match(/^(.+)[\-_\/]([^\-_\/]+)$/);
  if (match) return { lineCode: match[1], stationCode: match[2] };
  return {
    lineCode: line.code || line.id,
    stationCode: String(station.sequence).padStart(2, "0"),
  };
}

export function stateForStation(
  stationIndex: number,
  currentIndex: number,
  direction: Direction,
): StationState {
  if (stationIndex === currentIndex) return "current";
  if (direction === "forward") {
    return stationIndex < currentIndex ? "passed" : "upcoming";
  }
  return stationIndex > currentIndex ? "passed" : "upcoming";
}

export function cleanFilePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || "未命名";
}
