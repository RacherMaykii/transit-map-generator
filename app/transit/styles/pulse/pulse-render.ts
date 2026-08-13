import { fitEnglishTextLayout } from "../../english-layout.mjs";
import {
  Direction,
  LayoutConfig,
  Station,
  StationState,
  TransitData,
  TransitLine,
  stateForStation,
  stationsForLine,
} from "../../types";
import { displayStationsForPlatform, visualDirectionFor } from "../../route-orientation.mjs";

type SegmentState = "passed" | "upcoming";

function canvasOf(width: number, height: number, scale = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  if (scale !== 1) canvas.getContext("2d")!.scale(scale, scale);
  return canvas;
}

function fillBackground(ctx: CanvasRenderingContext2D, width: number, height: number, layout: LayoutConfig, transparent: boolean) {
  if (transparent) return;
  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, width, height);
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: number) {
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${value}px`;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, initialSize: number, minSize: number, family: string, weight: number, letterSpacing = 0) {
  let size = initialSize;
  setLetterSpacing(ctx, letterSpacing);
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 0.25;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  return size;
}

function fitEnglish(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, layout: LayoutConfig) {
  const result = fitEnglishTextLayout(text, layout.stationEnFontSize, layout.stationEnMinFontSize, maxWidth, (candidate, size) => {
    ctx.font = `500 ${size}px ${layout.fontEn}`;
    setLetterSpacing(ctx, layout.stationEnLetterSpacing);
    return ctx.measureText(candidate).width;
  });
  ctx.font = `500 ${result.size}px ${layout.fontEn}`;
  return result;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
}

function segmentStates(state: StationState, direction: Direction): { left: SegmentState; right: SegmentState } {
  if (state === "passed") return { left: "passed", right: "passed" };
  if (state === "upcoming") return { left: "upcoming", right: "upcoming" };
  return direction === "forward" ? { left: "passed", right: "upcoming" } : { left: "upcoming", right: "passed" };
}

function segmentColor(line: TransitLine, state: SegmentState) {
  return state === "passed" ? line.passedColor : line.lineColor;
}

function drawTrack(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string, layout: LayoutConfig) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = layout.pulseTrackColor;
  ctx.lineWidth = layout.pulseGlowWidth;
  ctx.globalAlpha = 0.72;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = layout.lineWidth;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function transferLabel(line: TransitLine) {
  const number = line.number.replace(/^(L|T)/i, "");
  return `${line.kind === "tram" ? "T" : "L"}${number}`;
}

function drawTransfers(ctx: CanvasRenderingContext2D, data: TransitData, station: Station, state: StationState) {
  const entries = data.transfers
    .filter((transfer) => transfer.stationId === station.id && !transfer.hidden)
    .sort((a, b) => a.order - b.order)
    .flatMap((transfer) => {
      const line = data.lines.find((candidate) => candidate.id === transfer.targetLineId);
      return line ? [{ transfer, line }] : [];
    });
  if (!entries.length) return;
  const layout = data.layout;
  const height = layout.pulseTransferBadgeHeight;
  const widths = entries.map(({ line }) => Math.max(26, transferLabel(line).length * layout.transferFontSize * 0.72 + 13));
  const total = widths.reduce((sum, width) => sum + width, 0) + (entries.length - 1) * layout.pulseTransferBadgeGap;
  let x = layout.tileSize / 2 - total / 2;
  const y = layout.lineY - layout.pulseNodeHeight / 2 - height - 7;
  entries.forEach(({ transfer, line }, index) => {
    const width = widths[index];
    const color = state === "passed" ? line.passedColor : transfer.colorOverride || line.lineColor;
    ctx.fillStyle = color;
    roundedRect(ctx, x, y, width, height, height / 2);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${layout.transferFontSize}px ${layout.fontEn}`;
    setLetterSpacing(ctx, layout.transferLetterSpacing);
    ctx.fillText(transferLabel(line), x + width / 2, y + height / 2 + 0.5);
    x += width + layout.pulseTransferBadgeGap;
  });
}

export interface PulseStationEdge { first?: boolean; last?: boolean }

export function renderPulseStationTile(
  data: TransitData,
  line: TransitLine,
  station: Station,
  state: StationState,
  direction: Direction,
  transparent = false,
  edge: PulseStationEdge = {},
  scale = 1,
) {
  const layout = data.layout;
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  ctx.fillStyle = layout.pulsePanelColor;
  ctx.globalAlpha = 0.82;
  ctx.fillRect(0, 0, size, layout.pulseHeaderHeight);
  ctx.globalAlpha = 1;

  const colorState: StationState = layout.closedStationsUsePassedColor && !station.isOpen ? "passed" : state;
  const states = segmentStates(colorState, direction);
  if (!edge.first) drawTrack(ctx, 0, size / 2, layout.lineY, segmentColor(line, states.left), layout);
  if (!edge.last) drawTrack(ctx, size / 2, size, layout.lineY, segmentColor(line, states.right), layout);

  if (layout.pulseShowSequence) {
    ctx.fillStyle = colorState === "current" ? line.currentColor : "#8CA7B8";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `700 8px ${layout.fontEn}`;
    setLetterSpacing(ctx, 0.8);
    ctx.fillText(String(station.sequence).padStart(2, "0"), 9, layout.pulseHeaderHeight / 2 + 0.5);
  }

  drawTransfers(ctx, data, station, colorState);
  const marker = colorState === "passed"
    ? line.passedColor
    : colorState === "current"
      ? line.currentColor
      : station.markerColor || line.stationColor;
  const nodeX = size / 2 - layout.pulseNodeWidth / 2;
  const nodeY = layout.lineY - layout.pulseNodeHeight / 2;
  if (colorState === "current") {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = marker;
    roundedRect(ctx, nodeX - layout.pulseCurrentHaloSize, nodeY - layout.pulseCurrentHaloSize, layout.pulseNodeWidth + layout.pulseCurrentHaloSize * 2, layout.pulseNodeHeight + layout.pulseCurrentHaloSize * 2, layout.pulseNodeRadius + layout.pulseCurrentHaloSize);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = colorState === "current" ? marker : layout.background;
  ctx.strokeStyle = marker;
  ctx.lineWidth = layout.stationRingWidth;
  roundedRect(ctx, nodeX, nodeY, layout.pulseNodeWidth, layout.pulseNodeHeight, layout.pulseNodeRadius);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = colorState === "current" ? layout.background : marker;
  ctx.beginPath();
  ctx.arc(size / 2, layout.lineY, 2.4, 0, Math.PI * 2);
  ctx.fill();

  const textColor = colorState === "passed" ? line.passedColor : colorState === "current" ? line.currentColor : "#EAF4F8";
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  fitText(ctx, station.nameZh, size - 10, layout.stationZhFontSize, 5, layout.fontZh, 700, layout.stationZhLetterSpacing);
  ctx.fillText(station.nameZh, size / 2, layout.pulseStationZhY);
  const english = fitEnglish(ctx, station.nameEn, size - 10, layout);
  english.lines.forEach((text, index) => ctx.fillText(text, size / 2, layout.pulseStationEnY + index * (english.size + 1.25)));
  ctx.fillStyle = line.lineColor;
  ctx.fillRect(0, size - 4, size, 4);
  return canvas;
}

export function renderPulseDirectionTile(
  line: TransitLine,
  station: Station | undefined,
  side: "left" | "right",
  layout: LayoutConfig,
  transparent = false,
  scale = 1,
) {
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  ctx.fillStyle = layout.pulsePanelColor;
  ctx.fillRect(0, 0, size, layout.pulseHeaderHeight);
  ctx.fillStyle = line.lineColor;
  ctx.fillRect(0, size - 4, size, 4);
  ctx.fillStyle = "#8CA7B8";
  ctx.font = `700 8px ${layout.fontEn}`;
  ctx.textAlign = side === "left" ? "left" : "right";
  ctx.textBaseline = "middle";
  ctx.fillText(line.code || line.number, side === "left" ? 9 : size - 9, layout.pulseHeaderHeight / 2 + 0.5);

  const direction = side === "left" ? -1 : 1;
  const baseX = side === "left" ? size - layout.directionArrowX : layout.directionArrowX;
  const y = layout.directionArrowY;
  ctx.strokeStyle = line.lineColor;
  ctx.fillStyle = line.lineColor;
  ctx.lineWidth = layout.directionArrowThickness;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(baseX - direction * layout.directionArrowShaftLength, y);
  ctx.lineTo(baseX, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(baseX + direction * layout.directionArrowHeadLength, y);
  ctx.lineTo(baseX, y - layout.directionArrowHeadWidth / 2);
  ctx.lineTo(baseX, y + layout.directionArrowHeadWidth / 2);
  ctx.closePath();
  ctx.fill();
  const textX = side === "left" ? size - layout.directionLabelX : layout.directionLabelX;
  ctx.textAlign = side === "left" ? "left" : "right";
  ctx.fillStyle = "#8CA7B8";
  ctx.font = `700 ${layout.directionLabelFontSize}px ${layout.fontZh}`;
  setLetterSpacing(ctx, layout.directionLabelLetterSpacing);
  ctx.fillText("运行方向 · TO", textX, layout.directionLabelY);
  ctx.fillStyle = "#EAF4F8";
  fitText(ctx, station?.nameZh || "未设置", 76, layout.directionStationFontSize, 6, layout.fontZh, 700, layout.directionStationLetterSpacing);
  ctx.fillText(station?.nameZh || "未设置", side === "left" ? size - layout.directionStationX : layout.directionStationX, layout.directionStationY);
  return canvas;
}

export function renderPulseTextCard(data: TransitData, line: TransitLine, station: Station, kind: "current" | "next", transparent = false, scale = 1) {
  const layout = data.layout;
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  ctx.fillStyle = layout.pulsePanelColor;
  ctx.fillRect(0, 0, size, layout.pulseHeaderHeight);
  ctx.fillStyle = line.lineColor;
  ctx.fillRect(0, size - 4, size, 4);
  const current = kind === "current";
  const accentX = current ? layout.currentAccentX : layout.nextAccentX;
  const accentY = current ? layout.currentAccentY : layout.nextAccentY;
  const accentW = current ? layout.currentAccentWidth : layout.nextAccentWidth;
  const accentH = current ? layout.currentAccentHeight : layout.nextAccentHeight;
  ctx.fillStyle = current ? line.currentColor : line.lineColor;
  ctx.fillRect(accentX, accentY, accentW, accentH);
  const labelX = current ? layout.currentLabelX : layout.nextLabelX;
  const labelY = current ? layout.currentLabelY : layout.nextLabelY;
  ctx.fillStyle = current ? line.currentColor : line.lineColor;
  ctx.textAlign = "left";
  ctx.font = `700 ${layout.infoLabelFontSize}px ${layout.fontEn}`;
  setLetterSpacing(ctx, layout.infoLabelLetterSpacing);
  ctx.fillText(current ? "NOW · 本站" : "NEXT · 下一站", labelX, labelY);
  const stationX = current ? layout.currentStationX : layout.nextStationX;
  const stationY = current ? layout.currentStationY : layout.nextStationY;
  ctx.fillStyle = "#EAF4F8";
  fitText(ctx, station.nameZh, 100, layout.infoStationFontSize, 7, layout.fontZh, 700, layout.infoStationLetterSpacing);
  ctx.fillText(station.nameZh, stationX, stationY);
  const english = fitEnglish(ctx, station.nameEn, 100, layout);
  ctx.fillStyle = "#8CA7B8";
  english.lines.forEach((text, index) => ctx.fillText(text, stationX, stationY + 16 + index * (english.size + 1.25)));
  return canvas;
}

export function renderPulseLineBadgeTile(line: TransitLine, layout: LayoutConfig, transparent = false, scale = 1) {
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  ctx.fillStyle = layout.pulsePanelColor;
  roundedRect(ctx, layout.lineBadgeX - layout.lineBadgeWidth / 2, layout.lineBadgeY, layout.lineBadgeWidth, layout.lineBadgeHeight, layout.lineBadgeRadius);
  ctx.fill();
  ctx.fillStyle = line.lineColor;
  ctx.fillRect(layout.lineBadgeX - layout.lineBadgeWidth / 2, layout.lineBadgeY, 6, layout.lineBadgeHeight);
  ctx.fillRect(0, size - 4, size, 4);
  ctx.textAlign = "center";
  ctx.fillStyle = "#8CA7B8";
  ctx.font = `700 ${layout.lineBadgeEnglishFontSize}px ${layout.fontEn}`;
  setLetterSpacing(ctx, layout.lineBadgeEnglishLetterSpacing);
  ctx.fillText(line.code || `L${line.number}`, layout.lineBadgeEnglishX, layout.lineBadgeEnglishY - 22);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 ${layout.lineBadgeNumberFontSize}px ${layout.fontZh}`;
  setLetterSpacing(ctx, layout.lineBadgeNumberLetterSpacing);
  ctx.fillText(`${line.number}号线`, layout.lineBadgeNumberX, layout.lineBadgeNumberY);
  ctx.fillStyle = "#AFC4CF";
  fitText(ctx, line.description || line.nameZh, 106, layout.lineBadgeDescriptionFontSize, 6, layout.fontZh, 700, layout.lineBadgeDescriptionLetterSpacing);
  ctx.fillText(line.description || line.nameZh, layout.lineBadgeDescriptionX, layout.lineBadgeDescriptionY);
  return canvas;
}

export function renderPulseRouteCanvas(data: TransitData, lineId: string, currentIndex: number, direction: Direction, platformType: "island" | "side" = "island", transparent = false, scale = 1) {
  const line = data.lines.find((candidate) => candidate.id === lineId);
  const size = data.layout.tileSize;
  if (!line) return canvasOf(size, size, scale);
  const stations = stationsForLine(data, line.id);
  const displayStations = displayStationsForPlatform(stations, platformType) as Array<{ station: Station; logicalIndex: number; displayIndex: number }>;
  const visualDirection = visualDirectionFor(direction, platformType);
  const canvas = canvasOf((stations.length + 2) * size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, canvas.width / scale, size, data.layout, transparent);
  ctx.drawImage(renderPulseDirectionTile(line, displayStations[0]?.station, "left", data.layout, transparent, scale), 0, 0, size, size);
  displayStations.forEach(({ station, logicalIndex, displayIndex }) => {
    const tile = renderPulseStationTile(data, line, station, stateForStation(logicalIndex, currentIndex, direction), visualDirection, transparent, { first: displayIndex === 0, last: displayIndex === stations.length - 1 }, scale);
    ctx.drawImage(tile, (displayIndex + 1) * size, 0, size, size);
  });
  ctx.drawImage(renderPulseDirectionTile(line, displayStations[displayStations.length - 1]?.station, "right", data.layout, transparent, scale), (stations.length + 1) * size, 0, size, size);
  return canvas;
}
