import {
  Direction,
  LayoutConfig,
  Station,
  StationState,
  Transfer,
  TransitData,
  TransitLine,
  stateForStation,
  stationCodeParts,
  stationsForLine,
} from "./types";
import { fitEnglishTextLayout } from "./english-layout.mjs";
import { displayStationsForPlatform, visualDirectionFor } from "./route-orientation.mjs";
import { siteUrl } from "../site";
import { renderLoopRouteCanvas, renderLoopStationTile as renderIsolatedLoopStationTile, renderLoopTextCard } from "./styles/loop/loop-render";
import {
  renderScenicDirectionTile,
  renderScenicLineBadgeTile,
  renderScenicRouteCanvas,
  renderScenicStationTile,
  renderScenicTextCard,
} from "./styles/scenic/scenic-render";
import {
  renderPulseDirectionTile,
  renderPulseLineBadgeTile,
  renderPulseRouteCanvas,
  renderPulseStationTile,
  renderPulseTextCard,
} from "./styles/pulse/pulse-render";

export { renderScenicDirectionTile };
export { renderPulseDirectionTile };

export interface RenderRouteOptions {
  lineId: string;
  currentIndex: number;
  direction: Direction;
  platformType?: "island" | "side";
  transparent?: boolean;
  scale?: number;
}

export interface StationEdge {
  first?: boolean;
  last?: boolean;
}

type SegmentState = "passed" | "upcoming";
type SpacedCanvasContext = CanvasRenderingContext2D & { letterSpacing: string };

const TRAM_ICON_PATH = siteUrl("assets/tram.png");
const tramIconImage = typeof Image === "undefined" ? null : new Image();
if (tramIconImage) tramIconImage.src = TRAM_ICON_PATH;

function canvasOf(width: number, height: number, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  if (scale !== 1) canvas.getContext("2d")!.scale(scale, scale);
  return canvas;
}

function fillBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layout: LayoutConfig,
  transparent = false,
) {
  if (transparent) return;
  ctx.fillStyle = layout.background || "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
}

function lineById(data: TransitData, lineId: string): TransitLine | undefined {
  return data.lines.find((line) => line.id === lineId);
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

function fitEnglishLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  initialSize: number,
  minSize: number,
  fontFamily: string,
  letterSpacing = 0,
): { lines: string[]; size: number } {
  setLetterSpacing(ctx, letterSpacing);
  const result = fitEnglishTextLayout(text, initialSize, minSize, maxWidth, (candidate, size) => {
    ctx.font = `500 ${size}px ${fontFamily}`;
    return ctx.measureText(candidate).width;
  });
  ctx.font = `500 ${result.size}px ${fontFamily}`;
  return result;
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  direction: "left" | "right",
  color: string,
  layout: LayoutConfig,
) {
  const baseX = direction === "left" ? layout.tileSize - layout.directionArrowX : layout.directionArrowX;
  const arrowY = layout.directionArrowY;
  const overlap = 5;
  const shaftStart = direction === "left" ? baseX - overlap : baseX + overlap - layout.directionArrowShaftLength;
  const shaftEnd = direction === "left" ? baseX - overlap + layout.directionArrowShaftLength : baseX + overlap;
  const tipX = direction === "left" ? baseX - layout.directionArrowHeadLength : baseX + layout.directionArrowHeadLength;
  const halfHead = layout.directionArrowHeadWidth / 2;
  ctx.save();
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

export function renderDirectionTile(
  line: TransitLine,
  terminus: Station | undefined,
  direction: "left" | "right",
  layout: LayoutConfig,
  transparent = false,
  scale = 1,
): HTMLCanvasElement {
  // Scenic direction tile uses its own renderer; callers that need scenic should use renderScenicDirectionTile directly.
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

function transferColor(line: TransitLine | undefined, transfer: Transfer): string {
  return transfer.colorOverride || line?.lineColor || "#64748B";
}

function metroArrowPath(ctx: CanvasRenderingContext2D, x: number, layout: LayoutConfig) {
  const baseY = layout.lineY - layout.stationRadius + 1;
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
  layout: LayoutConfig,
) {
  const ink = muted ? "#929292" : color;
  ctx.fillStyle = ink;
  metroArrowPath(ctx, x, layout);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.font = `700 ${layout.transferFontSize}px ${layout.fontZh}`;
  setLetterSpacing(ctx, layout.transferLetterSpacing);
  const labelY = layout.lineY - layout.stationRadius - layout.transferArrowLength - 3;
  ctx.fillText(`${line.number}号线`, x, labelY);
}

function drawTramTransfer(
  ctx: CanvasRenderingContext2D,
  line: TransitLine,
  color: string,
  x: number,
  muted: boolean,
  layout: LayoutConfig,
) {
  const ink = muted ? "#929292" : color;
  const label = `Tram ${line.number.replace(/^T/i, "")}`;
  ctx.font = `700 ${layout.tramTransferFontSize}px ${layout.fontEn}`;
  setLetterSpacing(ctx, layout.tramTransferLetterSpacing);
  const width = 54;
  const badgeY = layout.lineY - layout.stationRadius - layout.transferArrowLength + layout.tramTransferVerticalOffset;
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
  layout: LayoutConfig,
  x: number,
  availableWidth: number,
) {
  const inks = colors.map((color) => muted ? "#929292" : color);
  ctx.font = `700 ${layout.transferFontSize}px ${layout.fontZh}`;
  setLetterSpacing(ctx, layout.transferLetterSpacing);
  ctx.textBaseline = "alphabetic";
  const fullLabel = targets.map((target) => `${target.number}号线`).join("/");
  const compactLabel = `${targets.map((target) => target.number).join("/")}号线`;
  const label = ctx.measureText(fullLabel).width <= availableWidth ? fullLabel : compactLabel;
  const labelWidth = ctx.measureText(label).width;
  const baseY = layout.lineY - layout.stationRadius + 1;
  const tipY = baseY - layout.transferArrowLength;
  const gradientWidth = Math.max(layout.transferArrowHeadWidth, labelWidth);
  const gradient = ctx.createLinearGradient(x - gradientWidth / 2, tipY, x + gradientWidth / 2, tipY);
  mergedTransferGradientStops(inks).forEach(({ color, offset }) => gradient.addColorStop(offset, color));
  ctx.fillStyle = gradient;
  ctx.textAlign = "center";
  ctx.fillText(label, x, layout.lineY - layout.stationRadius - layout.transferArrowLength - 3);
  metroArrowPath(ctx, x, layout);
  ctx.fill();
}

function drawTransfers(
  ctx: CanvasRenderingContext2D,
  data: TransitData,
  station: Station,
  state: StationState,
  layout: LayoutConfig,
) {
  const transfers = data.transfers
    .filter((transfer) => transfer.stationId === station.id && !transfer.hidden)
    .sort((a, b) => a.order - b.order);
  if (!transfers.length) return;
  const entries: Array<{ transfer: Transfer; target: TransitLine }> = [];
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
      layout,
      layout.tileSize / 2,
      layout.tileSize - 10,
    );
  } else if (metroEntries.length === 1) {
    const { transfer, target } = metroEntries[0];
    drawMetroTransfer(ctx, target, transferColor(target, transfer), layout.tileSize / 2, muted, layout);
  }

  const tramCenter = metroEntries.length ? layout.tileSize / 2 + 36 : layout.tileSize / 2;
  const tramSpacing = Math.min(46, 56 / Math.max(1, tramEntries.length));
  const tramStart = tramCenter - ((tramEntries.length - 1) * tramSpacing) / 2;
  tramEntries.forEach(({ transfer, target }, index) => {
    drawTramTransfer(ctx, target, transferColor(target, transfer), tramStart + index * tramSpacing, muted, layout);
  });
}

function segmentColor(line: TransitLine, state: SegmentState) {
  return state === "passed" ? line.passedColor : line.lineColor;
}

function stationSegmentStates(
  state: StationState,
  direction: Direction,
): { left: SegmentState; right: SegmentState } {
  if (state === "passed") return { left: "passed", right: "passed" };
  if (state === "upcoming") return { left: "upcoming", right: "upcoming" };
  return direction === "forward"
    ? { left: "passed", right: "upcoming" }
    : { left: "upcoming", right: "passed" };
}

function loopCurveY(position: number, count: number, layout: LayoutConfig) {
  if (count <= 0) return layout.lineY;
  const middle = (count - 1) / 2;
  const halfSpan = Math.max(0.5, count / 2);
  const normalized = (position - middle) / halfSpan;
  return layout.lineY + layout.loopArcDepth * normalized * normalized;
}

function legacyLoopDirectionTile(
  line: TransitLine,
  layout: LayoutConfig,
  transparent = false,
  scale = 1,
): HTMLCanvasElement {
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  const center = size / 2;
  const radius = 27;
  const pillText = line.kind === "tram" ? `Tram ${line.number.replace(/^T/i, "")}` : `Line ${line.number}`;

  ctx.fillStyle = line.lineColor;
  ctx.beginPath();
  ctx.roundRect(center - 28, 8, 56, 18, 7);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 10px ${layout.fontEn}`;
  ctx.fillText(pillText, center, 21);
  ctx.fillStyle = line.textColor;
  ctx.font = `700 11px ${layout.fontZh}`;
  ctx.fillText(line.nameZh || line.description, center, 39);

  ctx.strokeStyle = line.lineColor;
  ctx.fillStyle = line.lineColor;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(center - radius, 75);
  ctx.bezierCurveTo(center - radius + 2, 55, center - 12, 49, center + 18, 58);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(center + radius, 75);
  ctx.bezierCurveTo(center + radius - 2, 55, center + 12, 49, center - 18, 58);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(center + 18, 50);
  ctx.lineTo(center + 31, 58);
  ctx.lineTo(center + 19, 66);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(center - 18, 50);
  ctx.lineTo(center - 31, 58);
  ctx.lineTo(center - 19, 66);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = line.textColor;
  ctx.font = `700 15px ${layout.fontZh}`;
  ctx.fillText("环线运行", center, 99);
  return canvas;
}

function legacyLoopStationTile(
  data: TransitData,
  line: TransitLine,
  station: Station,
  state: StationState,
  direction: Direction,
  transparent = false,
  scale = 1,
): HTMLCanvasElement {
  const layout = data.layout;
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  const stations = stationsForLine(data, line.id);
  const index = Math.max(0, stations.findIndex((candidate) => candidate.id === station.id));
  const count = Math.max(1, stations.length);
  const stationY = loopCurveY(index, count, layout);
  const leftY = loopCurveY(index - 0.5, count, layout);
  const rightY = loopCurveY(index + 0.5, count, layout);
  const center = size / 2;
  const colorState: StationState = layout.closedStationsUsePassedColor && station.isOpen === false ? "passed" : state;
  const segments = stationSegmentStates(colorState, direction);

  ctx.lineWidth = layout.lineWidth;
  ctx.lineCap = "round";
  ctx.strokeStyle = segmentColor(line, segments.left);
  ctx.beginPath();
  ctx.moveTo(0, leftY);
  ctx.lineTo(center, stationY);
  ctx.stroke();
  ctx.strokeStyle = segmentColor(line, segments.right);
  ctx.beginPath();
  ctx.moveTo(center, stationY);
  ctx.lineTo(size, rightY);
  ctx.stroke();

  drawTransfers(ctx, data, station, colorState, { ...layout, lineY: stationY });
  const marker = colorState === "passed" ? line.passedColor : colorState === "current" ? line.currentColor : station.markerColor || line.stationColor;
  ctx.fillStyle = layout.background || "#FFFFFF";
  ctx.strokeStyle = marker;
  ctx.lineWidth = layout.stationRingWidth;
  ctx.beginPath();
  ctx.arc(center, stationY, layout.stationRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

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
    ctx.fillText(centerCodes.lineCode, center, stationY - 4);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(center - layout.stationCenterDividerWidth / 2, stationY);
    ctx.lineTo(center + layout.stationCenterDividerWidth / 2, stationY);
    ctx.stroke();
    ctx.font = `700 ${layout.stationCenterSequenceFontSize}px ${layout.fontEn}`;
    ctx.fillText(centerCodes.stationCode, center, stationY + 4.5);
    ctx.restore();
  }

  const textColor = colorState === "passed" ? line.passedColor : colorState === "current" ? line.currentColor : line.textColor;
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  fitText(ctx, station.nameZh, size - 8, layout.stationZhFontSize, 5, layout.fontZh, 700, layout.stationZhLetterSpacing);
  ctx.fillText(station.nameZh, center, 48);
  const english = fitEnglishLines(ctx, station.nameEn, size - 8, layout.stationEnFontSize, layout.stationEnMinFontSize, layout.fontEn, layout.stationEnLetterSpacing);
  english.lines.forEach((lineText, lineIndex) => ctx.fillText(lineText, center, 62 + lineIndex * (english.size + 1.5)));

  if (colorState === "current") {
    const markerY = Math.min(size - 5, stationY + layout.stationRadius + layout.loopDirectionMarkerOffset);
    const forward = direction === "forward";
    ctx.fillStyle = line.currentColor;
    ctx.font = `700 7px ${layout.fontZh}`;
    ctx.textAlign = forward ? "right" : "left";
    ctx.fillText("运行方向", forward ? center - 7 : center + 7, markerY + 3);
    ctx.beginPath();
    if (forward) {
      ctx.moveTo(center - 2, markerY - layout.loopDirectionMarkerSize / 2);
      ctx.lineTo(center + layout.loopDirectionMarkerSize, markerY);
      ctx.lineTo(center - 2, markerY + layout.loopDirectionMarkerSize / 2);
    } else {
      ctx.moveTo(center + 2, markerY - layout.loopDirectionMarkerSize / 2);
      ctx.lineTo(center - layout.loopDirectionMarkerSize, markerY);
      ctx.lineTo(center + 2, markerY + layout.loopDirectionMarkerSize / 2);
    }
    ctx.closePath();
    ctx.fill();
  }
  return canvas;
}

export function renderStationTile(
  data: TransitData,
  line: TransitLine,
  station: Station,
  state: StationState,
  direction: Direction,
  transparent = false,
  edge: StationEdge = {},
  scale = 1,
): HTMLCanvasElement {
  if (data.activeStyleTemplate === "loop") {
    return renderIsolatedLoopStationTile(data, line, station, state, direction, transparent, scale);
  }
  if (data.activeStyleTemplate === "scenic") {
    return renderScenicStationTile(data, line, station, state, direction, transparent, edge, scale);
  }
  if (data.activeStyleTemplate === "pulse") {
    return renderPulseStationTile(data, line, station, state, direction, transparent, edge, scale);
  }
  const layout = data.layout;
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);

  const colorState: StationState = layout.closedStationsUsePassedColor && station.isOpen === false ? "passed" : state;
  const segments = stationSegmentStates(colorState, direction);
  ctx.lineWidth = layout.lineWidth;
  if (!edge.first) {
    ctx.strokeStyle = segmentColor(line, segments.left);
    ctx.beginPath();
    ctx.moveTo(0, layout.lineY);
    ctx.lineTo(size / 2, layout.lineY);
    ctx.stroke();
  }
  if (!edge.last) {
    ctx.strokeStyle = segmentColor(line, segments.right);
    ctx.beginPath();
    ctx.moveTo(size / 2, layout.lineY);
    ctx.lineTo(size, layout.lineY);
    ctx.stroke();
  }

  drawTransfers(ctx, data, station, colorState, layout);

  const marker = colorState === "passed"
    ? line.passedColor
    : colorState === "current"
      ? line.currentColor
      : station.markerColor || line.stationColor;
  ctx.fillStyle = layout.background || "#FFFFFF";
  ctx.strokeStyle = marker;
  ctx.lineWidth = layout.stationRingWidth;
  ctx.beginPath();
  ctx.arc(size / 2, layout.lineY, layout.stationRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (layout.showStationCenterCodes) {
    const centerCodeColor = colorState === "passed" ? line.passedColor : line.lineColor;
    const centerCodes = stationCodeParts(station, line);
    ctx.save();
    ctx.fillStyle = centerCodeColor;
    ctx.strokeStyle = centerCodeColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setLetterSpacing(ctx, layout.stationCenterLetterSpacing);
    ctx.font = `700 ${layout.stationCenterLineFontSize}px ${layout.fontEn}`;
    ctx.fillText(centerCodes.lineCode, size / 2, layout.lineY - 5);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(size / 2 - layout.stationCenterDividerWidth / 2, layout.lineY);
    ctx.lineTo(size / 2 + layout.stationCenterDividerWidth / 2, layout.lineY);
    ctx.stroke();
    ctx.font = `700 ${layout.stationCenterSequenceFontSize}px ${layout.fontEn}`;
    ctx.fillText(centerCodes.stationCode, size / 2, layout.lineY + 5.5);
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
  ctx.fillText(station.nameZh, size / 2, 91);
  const english = fitEnglishLines(ctx, station.nameEn, size - 8, layout.stationEnFontSize, layout.stationEnMinFontSize, layout.fontEn, layout.stationEnLetterSpacing);
  const firstEnglishY = 108;
  english.lines.forEach((lineText, index) => {
    ctx.fillText(lineText, size / 2, firstEnglishY + index * (english.size + 1.5));
  });
  return canvas;
}

export function renderRouteCanvas(
  data: TransitData,
  options: RenderRouteOptions,
): HTMLCanvasElement {
  const line = lineById(data, options.lineId);
  const scale = options.scale || 1;
  if (!line) return canvasOf(data.layout.tileSize, data.layout.tileSize, scale);
  if (data.activeStyleTemplate === "loop") {
    return renderLoopRouteCanvas(data, line, options.currentIndex, options.direction, options.platformType, options.transparent, scale);
  }
  if (data.activeStyleTemplate === "scenic") {
    return renderScenicRouteCanvas(data, options.lineId, options.currentIndex, options.direction, options.platformType, options.transparent, scale);
  }
  if (data.activeStyleTemplate === "pulse") {
    return renderPulseRouteCanvas(data, options.lineId, options.currentIndex, options.direction, options.platformType, options.transparent, scale);
  }
  const stations = stationsForLine(data, line.id);
  const displayStations = displayStationsForPlatform(stations, options.platformType) as Array<{ station: Station; logicalIndex: number; displayIndex: number }>;
  const visualDirection = visualDirectionFor(options.direction, options.platformType);
  const size = data.layout.tileSize;
  const logicalWidth = (stations.length + 2) * size;
  const canvas = canvasOf(logicalWidth, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, logicalWidth, size, data.layout, options.transparent);

  const left = renderDirectionTile(
    line,
    displayStations[0]?.station,
    "left",
    data.layout,
    options.transparent,
    scale,
  );
  const right = renderDirectionTile(
    line,
    displayStations[displayStations.length - 1]?.station,
    "right",
    data.layout,
    options.transparent,
    scale,
  );
  ctx.drawImage(left, 0, 0, size, size);
  displayStations.forEach(({ station, logicalIndex, displayIndex }) => {
    const tile = renderStationTile(
      data,
      line,
      station,
      stateForStation(logicalIndex, options.currentIndex, options.direction),
      visualDirection,
      options.transparent,
      { first: displayIndex === 0, last: displayIndex === stations.length - 1 },
      scale,
    );
    ctx.drawImage(tile, (displayIndex + 1) * size, 0, size, size);
  });
  ctx.drawImage(right, (stations.length + 1) * size, 0, size, size);
  return canvas;
}

export function renderTextCard(
  data: TransitData,
  line: TransitLine,
  station: Station,
  kind: "current" | "next",
  transparent = false,
  scale = 1,
): HTMLCanvasElement {
  if (data.activeStyleTemplate === "loop") {
    return renderLoopTextCard(data, line, station, kind, transparent, scale);
  }
  if (data.activeStyleTemplate === "scenic") {
    return renderScenicTextCard(data, line, station, kind, transparent, scale);
  }
  if (data.activeStyleTemplate === "pulse") {
    return renderPulseTextCard(data, line, station, kind, transparent, scale);
  }
  const size = data.layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, data.layout, transparent);
  const current = kind === "current";
  const accentX = current ? data.layout.currentAccentX : data.layout.nextAccentX;
  const accentY = current ? data.layout.currentAccentY : data.layout.nextAccentY;
  const accentWidth = current ? data.layout.currentAccentWidth : data.layout.nextAccentWidth;
  const accentHeight = current ? data.layout.currentAccentHeight : data.layout.nextAccentHeight;
  const labelX = current ? data.layout.currentLabelX : data.layout.nextLabelX;
  const labelY = current ? data.layout.currentLabelY : data.layout.nextLabelY;
  const stationX = current ? data.layout.currentStationX : data.layout.nextStationX;
  const stationY = current ? data.layout.currentStationY : data.layout.nextStationY;
  ctx.fillStyle = line.currentColor;
  ctx.fillRect(accentX, accentY, accentWidth, accentHeight);
  ctx.fillStyle = line.textColor;
  ctx.textAlign = "left";
  ctx.font = `700 ${data.layout.infoLabelFontSize}px ${data.layout.fontZh}`;
  setLetterSpacing(ctx, data.layout.infoLabelLetterSpacing);
  ctx.fillText(current ? "本站:" : "下一站:", labelX, labelY);
  fitText(ctx, station.nameZh, 110, data.layout.infoStationFontSize, 7, data.layout.fontZh, 700, data.layout.infoStationLetterSpacing);
  ctx.fillText(station.nameZh, stationX, stationY);
  return canvas;
}

export function renderLineBadge(
  data: TransitData,
  line: TransitLine,
  transparent = false,
  scale = 1,
): HTMLCanvasElement {
  if (data.activeStyleTemplate === "scenic") {
    return renderScenicLineBadgeTile(line, data.layout, transparent, scale);
  }
  if (data.activeStyleTemplate === "pulse") {
    return renderPulseLineBadgeTile(line, data.layout, transparent, scale);
  }
  const size = data.layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, data.layout, transparent);
  const badgeTop = data.layout.lineBadgeY;
  const badgeLeft = data.layout.lineBadgeX - data.layout.lineBadgeWidth / 2;
  ctx.fillStyle = line.lineColor;
  ctx.beginPath();
  ctx.roundRect(badgeLeft, badgeTop, data.layout.lineBadgeWidth, data.layout.lineBadgeHeight, data.layout.lineBadgeRadius);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.font = `700 ${data.layout.lineBadgeNumberFontSize}px ${data.layout.fontZh}`;
  setLetterSpacing(ctx, data.layout.lineBadgeNumberLetterSpacing);
  ctx.fillText(`${line.number}号线`, data.layout.lineBadgeNumberX, data.layout.lineBadgeNumberY);
  ctx.font = `600 ${data.layout.lineBadgeEnglishFontSize}px ${data.layout.fontEn}`;
  setLetterSpacing(ctx, data.layout.lineBadgeEnglishLetterSpacing);
  ctx.fillText(line.nameEn, data.layout.lineBadgeEnglishX, data.layout.lineBadgeEnglishY);
  ctx.fillStyle = line.textColor;
  fitText(ctx, line.description || line.nameZh, 110, data.layout.lineBadgeDescriptionFontSize, 6, data.layout.fontZh, 700, data.layout.lineBadgeDescriptionLetterSpacing);
  ctx.fillText(line.description || line.nameZh, data.layout.lineBadgeDescriptionX, data.layout.lineBadgeDescriptionY);
  return canvas;
}

export function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = canvasOf(source.width, source.height);
  canvas.getContext("2d")!.drawImage(source, 0, 0);
  return canvas;
}
