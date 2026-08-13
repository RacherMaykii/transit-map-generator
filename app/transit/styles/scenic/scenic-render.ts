import { fitEnglishTextLayout } from "../../english-layout.mjs";
import {
  Direction,
  LayoutConfig,
  Station,
  StationState,
  TransitData,
  TransitLine,
  stateForStation,
  stationCodeParts,
  stationsForLine,
} from "../../types";
import { displayStationsForPlatform, visualDirectionFor } from "../../route-orientation.mjs";

const TRAM_ICON_PATH = "/assets/tram.png";
const tramIconImage = typeof Image === "undefined" ? null : new Image();
if (tramIconImage) tramIconImage.src = TRAM_ICON_PATH;

const iconCache = new Map<string, HTMLImageElement>();
const iconLoadPromises = new Map<string, Promise<HTMLImageElement>>();
const iconObjectUrls = new Map<string, string>();

type SpacedCanvasContext = CanvasRenderingContext2D & { letterSpacing: string };

function canvasOf(width: number, height: number, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  if (scale !== 1) canvas.getContext("2d")!.scale(scale, scale);
  return canvas;
}

function fillBackground(ctx: CanvasRenderingContext2D, width: number, height: number, layout: LayoutConfig, transparent = false) {
  if (transparent) return;
  ctx.fillStyle = layout.background || "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: number) {
  (ctx as SpacedCanvasContext).letterSpacing = `${value}px`;
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  initialSize: number,
  minSize: number,
  fontFamily: string,
  weight = 700,
  letterSpacing = 0,
): number {
  let size = initialSize;
  setLetterSpacing(ctx, letterSpacing);
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 0.5;
  }
  ctx.font = `${weight} ${minSize}px ${fontFamily}`;
  return minSize;
}

function fitEnglishLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, layout: LayoutConfig) {
  setLetterSpacing(ctx, layout.stationEnLetterSpacing);
  const result = fitEnglishTextLayout(text, layout.stationEnFontSize, layout.stationEnMinFontSize, maxWidth, (candidate, size) => {
    ctx.font = `500 ${size}px ${layout.fontEn}`;
    return ctx.measureText(candidate).width;
  });
  ctx.font = `500 ${result.size}px ${layout.fontEn}`;
  return result;
}

export function scenicIconUrl(filename: string): string {
  return iconObjectUrls.get(filename) || "";
}

export function setScenicIconUrl(filename: string, url: string): void {
  iconObjectUrls.set(filename, url);
  iconCache.delete(filename);
  iconLoadPromises.delete(filename);
}

export function clearScenicIconUrls(): void {
  iconObjectUrls.clear();
  iconCache.clear();
  iconLoadPromises.clear();
}

export function loadScenicIcon(filename: string): Promise<HTMLImageElement> {
  if (iconCache.has(filename)) return Promise.resolve(iconCache.get(filename)!);
  if (iconLoadPromises.has(filename)) return iconLoadPromises.get(filename)!;
  const sourceUrl = scenicIconUrl(filename);
  if (!sourceUrl) return Promise.reject(new Error(`图标资源不存在: ${filename}`));
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      iconCache.set(filename, img);
      iconLoadPromises.delete(filename);
      resolve(img);
    };
    img.onerror = () => {
      iconLoadPromises.delete(filename);
      reject(new Error(`图标加载失败: ${filename}`));
    };
    img.src = sourceUrl;
  });
  iconLoadPromises.set(filename, promise);
  return promise;
}

export function preloadScenicIcons(data: TransitData): Promise<void> {
  const filenames = new Set<string>();
  data.stations.forEach((station) => {
    if (station.icon) filenames.add(station.icon);
  });
  return Promise.allSettled(Array.from(filenames).map(loadScenicIcon)).then(() => undefined);
}

function getScenicIcon(filename: string): HTMLImageElement | null {
  return iconCache.get(filename) || null;
}

function drawTintedIcon(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const temporary = document.createElement("canvas");
  temporary.width = Math.max(1, Math.round(size * 2));
  temporary.height = Math.max(1, Math.round(size * 2));
  const iconCtx = temporary.getContext("2d")!;
  iconCtx.drawImage(image, 0, 0, temporary.width, temporary.height);
  iconCtx.globalCompositeOperation = "source-in";
  iconCtx.fillStyle = color;
  iconCtx.fillRect(0, 0, temporary.width, temporary.height);
  ctx.drawImage(temporary, x, y, size, size);
}

function drawWhiteIcon(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
) {
  drawTintedIcon(ctx, image, x, y, size, "#FFFFFF");
}

function lineById(data: TransitData, lineId: string): TransitLine | undefined {
  return data.lines.find((line) => line.id === lineId);
}

function transferColor(line: TransitLine | undefined, transfer: { colorOverride?: string }): string {
  return transfer.colorOverride || line?.lineColor || "#64748B";
}

type SegmentState = "passed" | "upcoming";

function segmentColor(line: TransitLine, state: SegmentState) {
  return state === "passed" ? line.passedColor : line.lineColor;
}

function stationSegmentStates(state: StationState, direction: Direction): { left: SegmentState; right: SegmentState } {
  if (state === "passed") return { left: "passed", right: "passed" };
  if (state === "upcoming") return { left: "upcoming", right: "upcoming" };
  return direction === "forward" ? { left: "passed", right: "upcoming" } : { left: "upcoming", right: "passed" };
}

function metroArrowPath(ctx: CanvasRenderingContext2D, x: number, baseY: number, layout: LayoutConfig) {
  const tipY = baseY - layout.transferArrowLength;
  const neckY = tipY + Math.min(10, layout.transferArrowLength * 0.45);
  const halfHead = layout.transferArrowHeadWidth / 2;
  const halfStem = layout.transferArrowStemWidth / 2;
  ctx.beginPath();
  ctx.moveTo(x, tipY);
  ctx.lineTo(x - halfHead, neckY);
  ctx.lineTo(x - halfStem, neckY);
  ctx.lineTo(x - halfStem, baseY);
  ctx.lineTo(x + halfStem, baseY);
  ctx.lineTo(x + halfStem, neckY);
  ctx.lineTo(x + halfHead, neckY);
  ctx.closePath();
}

function mergedTransferGradientStops(colors: string[]) {
  if (colors.length <= 1) return [{ color: colors[0] || "#64748B", offset: 0 }];
  const transition = 0.42 / (colors.length - 1);
  const solidSpan = (1 - transition * (colors.length - 1)) / colors.length;
  return colors.flatMap((color, index) => {
    const start = index * (solidSpan + transition);
    return [{ color, offset: start }, { color, offset: start + solidSpan }];
  });
}

function drawMetroTransfer(
  ctx: CanvasRenderingContext2D,
  line: TransitLine,
  color: string,
  x: number,
  muted: boolean,
  baseY: number,
  layout: LayoutConfig,
) {
  const ink = muted ? "#929292" : color;
  ctx.fillStyle = ink;
  metroArrowPath(ctx, x, baseY, layout);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.font = `700 ${layout.transferFontSize}px ${layout.fontZh}`;
  setLetterSpacing(ctx, layout.transferLetterSpacing);
  const labelY = baseY - layout.transferArrowLength - 3;
  ctx.fillText(`${line.number}号线`, x, labelY);
}

function drawTramTransfer(
  ctx: CanvasRenderingContext2D,
  line: TransitLine,
  color: string,
  x: number,
  muted: boolean,
  baseY: number,
  layout: LayoutConfig,
) {
  const ink = muted ? "#929292" : color;
  const label = `Tram ${line.number.replace(/^T/i, "")}`;
  ctx.font = `700 ${layout.tramTransferFontSize}px ${layout.fontEn}`;
  setLetterSpacing(ctx, layout.tramTransferLetterSpacing);
  const width = 54;
  const badgeY = baseY - layout.transferArrowLength + layout.tramTransferVerticalOffset;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.roundRect(x - width / 2, badgeY, width, 18, 4);
  ctx.fill();
  if (tramIconImage?.complete && tramIconImage.naturalWidth > 0) {
    ctx.drawImage(tramIconImage, x - 22, badgeY + 2, 14, 14);
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText(label, x + 8, badgeY + 12.5);
}

function drawMergedMetroTransfers(
  ctx: CanvasRenderingContext2D,
  targets: TransitLine[],
  colors: string[],
  muted: boolean,
  baseY: number,
  layout: LayoutConfig,
  x: number,
  availableWidth: number,
) {
  const inks = colors.map((color) => (muted ? "#929292" : color));
  ctx.font = `700 ${layout.transferFontSize}px ${layout.fontZh}`;
  setLetterSpacing(ctx, layout.transferLetterSpacing);
  const fullLabel = targets.map((target) => `${target.number}号线`).join("/");
  const compactLabel = `${targets.map((target) => target.number).join("/")}号线`;
  const label = ctx.measureText(fullLabel).width <= availableWidth ? fullLabel : compactLabel;
  const labelWidth = ctx.measureText(label).width;
  const tipY = baseY - layout.transferArrowLength;
  const gradientWidth = Math.max(layout.transferArrowHeadWidth, labelWidth);
  const gradient = ctx.createLinearGradient(x - gradientWidth / 2, tipY, x + gradientWidth / 2, tipY);
  mergedTransferGradientStops(inks).forEach(({ color, offset }) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.textAlign = "center";
  ctx.fillText(label, x, baseY - layout.transferArrowLength - 3);
  metroArrowPath(ctx, x, baseY, layout);
  ctx.fill();
}

function drawTransfers(
  ctx: CanvasRenderingContext2D,
  data: TransitData,
  station: Station,
  state: StationState,
  baseY: number,
  layout: LayoutConfig,
) {
  const transfers = data.transfers
    .filter((transfer) => transfer.stationId === station.id && !transfer.hidden)
    .sort((a, b) => a.order - b.order);
  if (!transfers.length) return;
  const entries: Array<{ transfer: { colorOverride?: string; targetLineId: string }; target: TransitLine }> = [];
  transfers.forEach((transfer) => {
    const target = lineById(data, transfer.targetLineId);
    if (target) entries.push({ transfer, target });
  });
  const metroEntries = entries.filter(({ target }) => target.kind === "metro");
  const tramEntries = entries.filter(({ target }) => target.kind === "tram");
  const muted = state === "passed";

  if (metroEntries.length >= 2) {
    drawMergedMetroTransfers(
      ctx,
      metroEntries.map(({ target }) => target),
      metroEntries.map(({ transfer, target }) => transferColor(target, transfer)),
      muted,
      baseY,
      layout,
      layout.tileSize / 2,
      layout.tileSize - 10,
    );
  } else if (metroEntries.length === 1) {
    const { transfer, target } = metroEntries[0];
    drawMetroTransfer(ctx, target, transferColor(target, transfer), layout.tileSize / 2, muted, baseY, layout);
  }

  const tramCenter = metroEntries.length ? layout.tileSize / 2 + 36 : layout.tileSize / 2;
  const tramSpacing = Math.min(46, 56 / Math.max(1, tramEntries.length));
  const tramStart = tramCenter - ((tramEntries.length - 1) * tramSpacing) / 2;
  tramEntries.forEach(({ transfer, target }, index) => {
    drawTramTransfer(ctx, target, transferColor(target, transfer), tramStart + index * tramSpacing, muted, baseY, layout);
  });
}

export interface StationEdge {
  first?: boolean;
  last?: boolean;
}

export function renderScenicStationTile(
  data: TransitData,
  line: TransitLine,
  station: Station,
  state: StationState,
  direction: Direction,
  transparent = false,
  edge: StationEdge = {},
  scale = 1,
): HTMLCanvasElement {
  const layout = data.layout;
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);

  const colorState: StationState = layout.closedStationsUsePassedColor && station.isOpen === false ? "passed" : state;
  const segments = stationSegmentStates(colorState, direction);
  const barY = layout.scenicBarY;
  const halfBar = layout.scenicBarHeight / 2;
  const barTop = barY - halfBar;
  const barBottom = barY + halfBar;

  const terminalBarGradient = edge.first || edge.last;
  ctx.lineWidth = 0;
  if (terminalBarGradient) {
    const barGradient = ctx.createLinearGradient(edge.first ? 0 : size * 0.7, barY, edge.first ? size * 0.3 : size, barY);
    const leftColor = edge.first ? line.lineColor : segmentColor(line, segments.left);
    const rightColor = edge.last ? line.lineColor : segmentColor(line, segments.right);
    barGradient.addColorStop(0, leftColor);
    barGradient.addColorStop(1, rightColor);
    ctx.fillStyle = barGradient;
    ctx.fillRect(0, barTop, size, layout.scenicBarHeight);
  } else {
    ctx.fillStyle = segmentColor(line, edge.first ? segments.right : segments.left);
    ctx.fillRect(0, barTop, size / 2, layout.scenicBarHeight);
    ctx.fillStyle = segmentColor(line, edge.last ? segments.left : segments.right);
    ctx.fillRect(size / 2, barTop, size / 2, layout.scenicBarHeight);
  }

  const rectW = layout.scenicStationRectWidth;
  const rectH = layout.scenicStationRectHeight;
  const rectR = layout.scenicStationRectRadius;
  const rectLeft = (size - rectW) / 2;
  const rectTop = barY - rectH / 2;
  const center = size / 2;

  drawTransfers(ctx, data, station, colorState, rectTop, layout);

  const marker = colorState === "passed"
    ? line.passedColor
    : colorState === "current"
      ? line.currentColor
      : station.markerColor || line.stationColor;

  ctx.fillStyle = layout.background || "#FFFFFF";
  ctx.strokeStyle = marker;
  ctx.lineWidth = layout.scenicStationRectBorderWidth;
  ctx.beginPath();
  ctx.roundRect(rectLeft, rectTop, rectW, rectH, rectR);
  ctx.fill();
  ctx.stroke();

  const icon = station.icon ? getScenicIcon(station.icon) : null;
  if (icon && icon.complete && icon.naturalWidth > 0) {
    const iconSize = layout.scenicStationIconSize;
    const iconX = center - iconSize / 2;
    const iconY = rectTop + (rectH - iconSize) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rectLeft, rectTop, rectW, rectH, rectR);
    ctx.clip();
    drawTintedIcon(ctx, icon, iconX, iconY, iconSize, marker);
    ctx.restore();
  } else if (station.icon) {
    const iconSize = layout.scenicStationIconSize;
    ctx.save();
    ctx.strokeStyle = "#B42318";
    ctx.fillStyle = "#FFF4F2";
    ctx.setLineDash([3, 2]);
    ctx.fillRect(center - iconSize / 2, rectTop + (rectH - iconSize) / 2, iconSize, iconSize);
    ctx.strokeRect(center - iconSize / 2, rectTop + (rectH - iconSize) / 2, iconSize, iconSize);
    ctx.setLineDash([]);
    ctx.fillStyle = "#B42318";
    ctx.font = `800 ${Math.max(8, iconSize * .58)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", center, rectTop + rectH / 2);
    ctx.restore();
  }

  if (layout.showStationCenterCodes) {
    const centerCodes = stationCodeParts(station, line);
    const codeColor = colorState === "passed" ? line.passedColor : line.lineColor;
    ctx.save();
    ctx.fillStyle = codeColor;
    ctx.strokeStyle = codeColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setLetterSpacing(ctx, layout.stationCenterLetterSpacing);
    ctx.font = `700 ${layout.stationCenterLineFontSize}px ${layout.fontEn}`;
    ctx.fillText(centerCodes.lineCode, center, barY - 4);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(center - layout.stationCenterDividerWidth / 2, barY);
    ctx.lineTo(center + layout.stationCenterDividerWidth / 2, barY);
    ctx.stroke();
    ctx.font = `700 ${layout.stationCenterSequenceFontSize}px ${layout.fontEn}`;
    ctx.fillText(centerCodes.stationCode, center, barY + 5.5);
    ctx.restore();
  }

  const textColor = colorState === "passed"
    ? line.passedColor
    : colorState === "current"
      ? line.currentColor
      : line.textColor;
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  fitText(ctx, station.nameZh, size - 8, layout.stationZhFontSize, 5, layout.fontZh, 700, layout.stationZhLetterSpacing);
  ctx.fillText(station.nameZh, center, layout.scenicStationZhY);
  const english = fitEnglishLines(ctx, station.nameEn, size - 8, layout);
  english.lines.forEach((lineText, index) => {
    ctx.fillText(lineText, center, layout.scenicStationEnY + index * (english.size + 1.5));
  });

  return canvas;
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  direction: "left" | "right",
  color: string,
  layout: LayoutConfig,
) {
  const baseX = direction === "left" ? layout.tileSize - layout.directionArrowX : layout.directionArrowX;
  const arrowY = layout.scenicDirectionBarY;
  const overlap = 5;
  const shaftStart = direction === "left" ? baseX - overlap : baseX + overlap - layout.directionArrowShaftLength;
  const shaftEnd = direction === "left" ? baseX - overlap + layout.directionArrowShaftLength : baseX + overlap;
  const tipX = direction === "left" ? baseX - layout.directionArrowHeadLength : baseX + layout.directionArrowHeadLength;
  const halfHead = layout.directionArrowHeadWidth / 2;
  const barTop = arrowY - layout.scenicDirectionBarHeight / 2;

  ctx.fillStyle = color;
  ctx.fillRect(0, barTop, layout.tileSize, layout.scenicDirectionBarHeight);

  ctx.save();
  const outlineWidth = layout.directionArrowOutlineWidth;
  const outlineColor = layout.background || "#FFFFFF";
  if (outlineWidth > 0) {
    ctx.strokeStyle = outlineColor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = layout.directionArrowThickness + 2 * outlineWidth;
    ctx.beginPath();
    ctx.moveTo(shaftStart, arrowY);
    ctx.lineTo(shaftEnd, arrowY);
    ctx.stroke();
    ctx.lineWidth = 2 * outlineWidth;
    ctx.fillStyle = outlineColor;
    ctx.beginPath();
    ctx.moveTo(tipX, arrowY);
    ctx.lineTo(baseX, arrowY - halfHead);
    ctx.lineTo(baseX, arrowY + halfHead);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = layout.directionArrowThickness;
  ctx.beginPath();
  ctx.moveTo(shaftStart, arrowY);
  ctx.lineTo(shaftEnd, arrowY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tipX, arrowY);
  ctx.lineTo(baseX, arrowY - halfHead);
  ctx.lineTo(baseX, arrowY + halfHead);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function renderScenicDirectionTile(
  line: TransitLine,
  terminus: Station | undefined,
  direction: "left" | "right",
  layout: LayoutConfig,
  transparent = false,
  scale = 1,
): HTMLCanvasElement {
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  drawArrow(ctx, direction, line.lineColor, layout);
  ctx.fillStyle = line.textColor;
  ctx.textAlign = direction === "left" ? "left" : "right";
  ctx.textBaseline = "alphabetic";
  const labelX = direction === "left" ? size - layout.directionLabelX : layout.directionLabelX;
  const stationX = direction === "left" ? size - layout.directionStationX : layout.directionStationX;
  ctx.font = `700 ${layout.directionLabelFontSize}px ${layout.fontZh}`;
  setLetterSpacing(ctx, layout.directionLabelLetterSpacing);
  ctx.fillText("运行方向:", labelX, layout.directionLabelY);
  const name = terminus?.nameZh || "未设置";
  fitText(ctx, name, 75, layout.directionStationFontSize, 7, layout.fontZh, 700, layout.directionStationLetterSpacing);
  ctx.fillText(name, stationX, layout.directionStationY);
  return canvas;
}

export function renderScenicTextCard(
  data: TransitData,
  line: TransitLine,
  station: Station,
  kind: "current" | "next",
  transparent = false,
  scale = 1,
): HTMLCanvasElement {
  const layout = data.layout;
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  const current = kind === "current";
  const labelY = current ? layout.currentLabelY : layout.nextLabelY;
  const stationY = current ? layout.currentStationY : layout.nextStationY;
  const barY = layout.scenicBarY;
  const barTop = barY - layout.scenicBarHeight / 2;
  const rectColor = line.lineColor;
  const center = size / 2;

  // Draw horizontal bar through middle
  ctx.fillStyle = rectColor;
  ctx.fillRect(0, barTop, size, layout.scenicBarHeight);

  // Draw station rectangle (hollow with line color border)
  const rectW = layout.scenicStationRectWidth;
  const rectH = layout.scenicStationRectHeight;
  const rectR = layout.scenicStationRectRadius;
  const rectLeft = (size - rectW) / 2;
  const rectTop = barY - rectH / 2;

  ctx.fillStyle = layout.background || "#FFFFFF";
  ctx.strokeStyle = rectColor;
  ctx.lineWidth = layout.scenicStationRectBorderWidth;
  ctx.beginPath();
  ctx.roundRect(rectLeft, rectTop, rectW, rectH, rectR);
  ctx.fill();
  ctx.stroke();

  // Draw tinted icon for 本站 and 下一站
  if (station.icon) {
    const icon = getScenicIcon(station.icon);
    if (icon && icon.complete && icon.naturalWidth > 0) {
      const iconSize = layout.scenicStationIconSize;
      const iconX = center - iconSize / 2;
      const iconY = rectTop + (rectH - iconSize) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(rectLeft, rectTop, rectW, rectH, rectR);
      ctx.clip();
      drawTintedIcon(ctx, icon, iconX, iconY, iconSize, rectColor);
      ctx.restore();
    } else {
      const iconSize = layout.scenicStationIconSize;
      ctx.save();
      ctx.strokeStyle = "#B42318";
      ctx.fillStyle = "#FFF4F2";
      ctx.setLineDash([3, 2]);
      ctx.fillRect(center - iconSize / 2, rectTop + (rectH - iconSize) / 2, iconSize, iconSize);
      ctx.strokeRect(center - iconSize / 2, rectTop + (rectH - iconSize) / 2, iconSize, iconSize);
      ctx.setLineDash([]);
      ctx.fillStyle = "#B42318";
      ctx.font = `800 ${Math.max(8, iconSize * .58)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", center, rectTop + rectH / 2);
      ctx.restore();
    }
  }

  // Draw label (centered)
  ctx.fillStyle = line.textColor;
  ctx.textAlign = "center";
  ctx.font = `700 ${layout.infoLabelFontSize}px ${layout.fontZh}`;
  setLetterSpacing(ctx, layout.infoLabelLetterSpacing);
  ctx.fillText(current ? "本站:" : "下一站:", center, labelY);

  // Draw station name (centered)
  fitText(ctx, station.nameZh, size - 8, layout.infoStationFontSize, 7, layout.fontZh, 700, layout.infoStationLetterSpacing);
  ctx.fillText(station.nameZh, center, stationY);

  // Draw English name (centered)
  const english = fitEnglishLines(ctx, station.nameEn, size - 8, layout);
  english.lines.forEach((lineText, index) => {
    ctx.fillText(lineText, center, stationY + 14 + index * (english.size + 1.5));
  });

  return canvas;
}

export function renderScenicLineBadgeTile(
  line: TransitLine,
  layout: LayoutConfig,
  transparent = false,
  scale = 1,
): HTMLCanvasElement {
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  const badgeTop = layout.lineBadgeY;
  const badgeLeft = layout.lineBadgeX - layout.lineBadgeWidth / 2;
  const barY = layout.scenicBarY;
  const barTop = barY - layout.scenicBarHeight / 2;

  // Draw bar through middle
  ctx.fillStyle = line.lineColor;
  ctx.fillRect(0, barTop, size, layout.scenicBarHeight);

  // Draw badge
  ctx.fillStyle = line.lineColor;
  ctx.beginPath();
  ctx.roundRect(badgeLeft, badgeTop, layout.lineBadgeWidth, layout.lineBadgeHeight, layout.lineBadgeRadius);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.font = `700 ${layout.lineBadgeNumberFontSize}px ${layout.fontZh}`;
  setLetterSpacing(ctx, layout.lineBadgeNumberLetterSpacing);
  ctx.fillText(`${line.number}号线`, layout.lineBadgeNumberX, layout.lineBadgeNumberY);
  ctx.font = `600 ${layout.lineBadgeEnglishFontSize}px ${layout.fontEn}`;
  setLetterSpacing(ctx, layout.lineBadgeEnglishLetterSpacing);
  ctx.fillText(line.nameEn, layout.lineBadgeEnglishX, layout.lineBadgeEnglishY);
  ctx.fillStyle = line.textColor;
  fitText(ctx, line.description || line.nameZh, 110, layout.lineBadgeDescriptionFontSize, 6, layout.fontZh, 700, layout.lineBadgeDescriptionLetterSpacing);
  ctx.fillText(line.description || line.nameZh, layout.lineBadgeDescriptionX, layout.lineBadgeDescriptionY);

  return canvas;
}

export function renderScenicRouteCanvas(
  data: TransitData,
  lineId: string,
  currentIndex: number,
  direction: Direction,
  platformType: "island" | "side" = "island",
  transparent = false,
  scale = 1,
): HTMLCanvasElement {
  const line = lineById(data, lineId);
  if (!line) return canvasOf(data.layout.tileSize, data.layout.tileSize, scale);
  const stations = stationsForLine(data, line.id);
  const displayStations = displayStationsForPlatform(stations, platformType) as Array<{ station: Station; logicalIndex: number; displayIndex: number }>;
  const visualDirection = visualDirectionFor(direction, platformType);
  const size = data.layout.tileSize;
  const logicalWidth = (stations.length + 2) * size;
  const canvas = canvasOf(logicalWidth, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, logicalWidth, size, data.layout, transparent);

  const left = renderScenicDirectionTile(line, displayStations[0]?.station, "left", data.layout, transparent, scale);
  const right = renderScenicDirectionTile(line, displayStations[displayStations.length - 1]?.station, "right", data.layout, transparent, scale);
  ctx.drawImage(left, 0, 0, size, size);
  displayStations.forEach(({ station, logicalIndex, displayIndex }) => {
    const tile = renderScenicStationTile(
      data,
      line,
      station,
      stateForStation(logicalIndex, currentIndex, direction),
      visualDirection,
      transparent,
      { first: displayIndex === 0, last: displayIndex === stations.length - 1 },
      scale,
    );
    ctx.drawImage(tile, (displayIndex + 1) * size, 0, size, size);
  });
  ctx.drawImage(right, (stations.length + 1) * size, 0, size, size);
  return canvas;
}
