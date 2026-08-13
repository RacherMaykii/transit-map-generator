import { fitEnglishTextLayout } from "../../english-layout.mjs";
import {
  Direction,
  LayoutConfig,
  Station,
  StationState,
  TransitData,
  TransitLine,
  stationCodeParts,
  stationsForLine,
} from "../../types";
import { visualDirectionFor } from "../../route-orientation.mjs";
import { siteUrl } from "../../../site";

const TRANSFER_ICON_PATH = siteUrl("assets/transfer-white.png");
const transferIconImage = typeof Image === "undefined" ? null : new Image();
if (transferIconImage) transferIconImage.src = TRANSFER_ICON_PATH;

type SpacedCanvasContext = CanvasRenderingContext2D & { letterSpacing: string };

function canvasOf(width: number, height: number, scale = 1) {
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

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, initialSize: number, minSize: number, fontFamily: string, weight = 700, letterSpacing = 0) {
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

function loopBarTop(layout: LayoutConfig) {
  return layout.tileSize - layout.loopBottomBarHeight;
}

function loopCurveY(position: number, count: number, layout: LayoutConfig) {
  const middle = (count - 1) / 2;
  const halfSpan = Math.max(0.5, count / 2);
  const normalized = Math.max(-1, Math.min(1, (position - middle) / halfSpan));
  return loopBarTop(layout) - layout.loopArcDepth * (1 - normalized * normalized);
}

function loopDisplayStations(stations: Station[], currentIndex: number, direction: Direction, platformType: "island" | "side" = "island") {
  if (!stations.length) return [];
  const centerIndex = Math.floor(stations.length / 2);
  const step = visualDirectionFor(direction, platformType) === "forward" ? 1 : -1;
  return stations.map((_, displayIndex) => {
    const sourceIndex = (currentIndex + (displayIndex - centerIndex) * step + stations.length * 4) % stations.length;
    return stations[sourceIndex];
  });
}

function drawTintedTransferIcon(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, size: number) {
  if (!transferIconImage?.complete || !transferIconImage.naturalWidth) return;
  const temporary = document.createElement("canvas");
  temporary.width = Math.max(1, Math.round(size * 2));
  temporary.height = Math.max(1, Math.round(size * 2));
  const iconContext = temporary.getContext("2d")!;
  iconContext.drawImage(transferIconImage, 0, 0, temporary.width, temporary.height);
  iconContext.globalCompositeOperation = "source-in";
  iconContext.fillStyle = color;
  iconContext.fillRect(0, 0, temporary.width, temporary.height);
  ctx.drawImage(temporary, x, y, size, size);
}

function loopTransferEntries(data: TransitData, station: Station) {
  return data.transfers
    .filter((transfer) => transfer.stationId === station.id && !transfer.hidden)
    .sort((a, b) => a.order - b.order)
    .flatMap((transfer) => {
      const target = data.lines.find((line) => line.id === transfer.targetLineId);
      return target ? [{ transfer, target }] : [];
    });
}

function drawLoopTransferBadges(ctx: CanvasRenderingContext2D, data: TransitData, station: Station, state: StationState) {
  const layout = data.layout;
  const entries = loopTransferEntries(data, station);
  let fontSize = layout.loopTransferBadgeFontSize;
  let labels = entries.map(({ target }) => target.kind === "tram" ? `Tram ${target.number.replace(/^T/i, "")}` : `Line ${target.number}`);
  const measure = () => {
    ctx.font = `700 ${fontSize}px ${layout.fontEn}`;
    return labels.map((label) => Math.max(30, ctx.measureText(label).width + layout.loopTransferBadgeHeight + 7));
  };
  let widths = measure();
  let totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * layout.loopTransferBadgeGap;
  if (totalWidth > layout.tileSize - 6) {
    labels = entries.map(({ target }) => target.kind === "tram" ? `T${target.number.replace(/^T/i, "")}` : `L${target.number}`);
    widths = measure();
    totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * layout.loopTransferBadgeGap;
  }
  while (fontSize > 5.5 && totalWidth > layout.tileSize - 4) {
    fontSize -= 0.5;
    widths = measure();
    totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * layout.loopTransferBadgeGap;
  }
  let cursor = (layout.tileSize - totalWidth) / 2;
  entries.forEach(({ transfer, target }, index) => {
    const width = widths[index];
    const color = transfer.colorOverride || target.lineColor;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(cursor, 7, width, layout.loopTransferBadgeHeight, layout.loopTransferBadgeHeight * 0.32);
    ctx.fill();
    if (transferIconImage?.complete && transferIconImage.naturalWidth) {
      ctx.drawImage(transferIconImage, cursor + 3, 8.5, layout.loopTransferBadgeHeight - 3, layout.loopTransferBadgeHeight - 3);
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${fontSize}px ${layout.fontEn}`;
    ctx.fillText(labels[index], cursor + layout.loopTransferBadgeHeight + 1, 7 + layout.loopTransferBadgeHeight * 0.7);
    cursor += width + layout.loopTransferBadgeGap;
  });
}

export function renderLoopDirectionTile(line: TransitLine, layout: LayoutConfig, direction: Direction = "forward", transparent = false, scale = 1) {
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  const iconSize = layout.loopDirectionIconSize;
  const pillText = line.kind === "tram" ? `Tram ${line.number.replace(/^T/i, "")}` : `Line ${line.number}`;
  const ringDirection = direction === "forward" ? "内环" : "外环";
  ctx.fillStyle = line.lineColor;
  ctx.beginPath();
  ctx.roundRect(
    layout.loopDirectionBadgeX - layout.loopDirectionBadgeWidth / 2,
    layout.loopDirectionBadgeY,
    layout.loopDirectionBadgeWidth,
    layout.loopDirectionBadgeHeight,
    layout.loopDirectionBadgeRadius,
  );
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${layout.loopDirectionBadgeFontSize}px ${layout.fontEn}`;
  ctx.fillText(pillText, layout.loopDirectionBadgeX, layout.loopDirectionBadgeY + layout.loopDirectionBadgeHeight * 0.72);
  ctx.fillStyle = line.textColor;
  ctx.font = `700 ${layout.loopDirectionLineNameFontSize}px ${layout.fontZh}`;
  ctx.fillText(line.nameZh || line.description, layout.loopDirectionLineNameX, layout.loopDirectionLineNameY);
  drawTintedTransferIcon(ctx, line.lineColor, layout.loopDirectionIconX - iconSize / 2, layout.loopDirectionIconY, iconSize);
  ctx.fillStyle = line.textColor;
  ctx.font = `800 ${layout.loopDirectionLoopTextFontSize}px ${layout.fontZh}`;
  ctx.fillText(ringDirection, layout.loopDirectionLoopTextX, layout.loopDirectionLoopTextY);
  ctx.font = `800 ${layout.loopDirectionRunTextFontSize}px ${layout.fontZh}`;
  ctx.fillText("运行", layout.loopDirectionRunTextX, layout.loopDirectionRunTextY);
  ctx.fillStyle = line.lineColor;
  ctx.fillRect(0, loopBarTop(layout), size, layout.loopBottomBarHeight);
  return canvas;
}

export function renderLoopLineBadgeTile(line: TransitLine, layout: LayoutConfig, transparent = false, scale = 1) {
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  const badgeLeft = layout.lineBadgeX - layout.lineBadgeWidth / 2;
  ctx.fillStyle = line.lineColor;
  ctx.beginPath();
  ctx.roundRect(badgeLeft, layout.lineBadgeY, layout.lineBadgeWidth, layout.lineBadgeHeight, layout.lineBadgeRadius);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  setLetterSpacing(ctx, layout.lineBadgeNumberLetterSpacing);
  ctx.font = `700 ${layout.lineBadgeNumberFontSize}px ${layout.fontZh}`;
  ctx.fillText(`${line.number}号线`, layout.lineBadgeNumberX, layout.lineBadgeNumberY);
  setLetterSpacing(ctx, layout.lineBadgeEnglishLetterSpacing);
  ctx.font = `600 ${layout.lineBadgeEnglishFontSize}px ${layout.fontEn}`;
  ctx.fillText(line.nameEn, layout.lineBadgeEnglishX, layout.lineBadgeEnglishY);
  ctx.fillStyle = line.textColor;
  setLetterSpacing(ctx, layout.lineBadgeDescriptionLetterSpacing);
  ctx.font = `700 ${layout.lineBadgeDescriptionFontSize}px ${layout.fontZh}`;
  ctx.fillText(line.description || line.nameZh, layout.lineBadgeDescriptionX, layout.lineBadgeDescriptionY);
  ctx.fillStyle = line.lineColor;
  ctx.fillRect(0, loopBarTop(layout), size, layout.loopBottomBarHeight);
  return canvas;
}

export function renderLoopTextCard(data: TransitData, line: TransitLine, station: Station, kind: "current" | "next", transparent = false, scale = 1) {
  const layout = data.layout;
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  const current = kind === "current";
  const accentX = current ? layout.currentAccentX : layout.nextAccentX;
  const accentY = current ? layout.currentAccentY : layout.nextAccentY;
  const accentWidth = current ? layout.currentAccentWidth : layout.nextAccentWidth;
  const accentHeight = current ? layout.currentAccentHeight : layout.nextAccentHeight;
  const labelX = current ? layout.currentLabelX : layout.nextLabelX;
  const labelY = current ? layout.currentLabelY : layout.nextLabelY;
  const stationX = current ? layout.currentStationX : layout.nextStationX;
  const stationY = current ? layout.currentStationY : layout.nextStationY;
  ctx.fillStyle = line.currentColor;
  ctx.fillRect(accentX, accentY, accentWidth, accentHeight);
  ctx.fillStyle = line.textColor;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  setLetterSpacing(ctx, layout.infoLabelLetterSpacing);
  ctx.font = `700 ${layout.infoLabelFontSize}px ${layout.fontZh}`;
  ctx.fillText(current ? "本站:" : "下一站:", labelX, labelY);
  fitText(ctx, station.nameZh, 110, layout.infoStationFontSize, 7, layout.fontZh, 700, layout.infoStationLetterSpacing);
  ctx.fillText(station.nameZh, stationX, stationY);
  ctx.fillStyle = line.lineColor;
  ctx.fillRect(0, loopBarTop(layout), size, layout.loopBottomBarHeight);
  return canvas;
}

export function renderLoopStationTile(data: TransitData, line: TransitLine, station: Station, state: StationState, direction: Direction, transparent = false, scale = 1, displayIndex?: number, displayCount?: number) {
  const layout = data.layout;
  const size = layout.tileSize;
  const canvas = canvasOf(size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, size, size, layout, transparent);
  const stations = stationsForLine(data, line.id);
  const count = Math.max(1, displayCount ?? stations.length);
  const originalIndex = Math.max(0, stations.findIndex((candidate) => candidate.id === station.id));
  const index = displayIndex ?? (state === "current" ? Math.floor(count / 2) : originalIndex);
  const stationY = loopCurveY(index, count, layout);
  const barTop = loopBarTop(layout);
  const barMiddle = barTop + layout.loopBottomBarHeight / 2;
  const leftY = index === 0 ? barMiddle : loopCurveY(index - 0.5, count, layout);
  const rightY = index === count - 1 ? barMiddle : loopCurveY(index + 0.5, count, layout);
  const center = size / 2;
  const colorState: StationState = state === "current" ? "current" : "upcoming";
  ctx.lineWidth = layout.lineWidth;
  ctx.lineCap = "round";
  ctx.strokeStyle = line.lineColor;
  ctx.beginPath();
  ctx.moveTo(0, leftY);
  ctx.lineTo(center, stationY);
  ctx.stroke();
  ctx.strokeStyle = line.lineColor;
  ctx.beginPath();
  ctx.moveTo(center, stationY);
  ctx.lineTo(size, rightY);
  ctx.stroke();
  ctx.fillStyle = line.lineColor;
  ctx.fillRect(0, barTop, size, layout.loopBottomBarHeight);

  drawLoopTransferBadges(ctx, data, station, colorState);
  const marker = colorState === "current" ? line.currentColor : station.markerColor || line.stationColor;
  ctx.fillStyle = layout.background || "#FFFFFF";
  ctx.strokeStyle = marker;
  ctx.lineWidth = layout.stationRingWidth;
  ctx.beginPath();
  ctx.arc(center, stationY, layout.stationRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (layout.showStationCenterCodes) {
    const centerCodes = stationCodeParts(station, line);
    const codeColor = line.lineColor;
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

  const textColor = colorState === "current" ? line.currentColor : line.textColor;
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  fitText(ctx, station.nameZh, size - 8, layout.stationZhFontSize, 5, layout.fontZh, 700, layout.stationZhLetterSpacing);
  ctx.fillText(station.nameZh, center, stationY - layout.loopStationZhOffset);
  const english = fitEnglishLines(ctx, station.nameEn, size - 8, layout);
  english.lines.forEach((lineText, lineIndex) => ctx.fillText(lineText, center, stationY - layout.loopStationEnOffset + lineIndex * (english.size + 1.5)));

  if (colorState === "current") {
    const markerBelow = stationY + layout.stationRadius + layout.loopDirectionMarkerOffset;
    const markerY = markerBelow <= loopBarTop(layout) - 3
      ? markerBelow
      : stationY - layout.stationRadius - layout.loopDirectionMarkerOffset;
    const forward = direction === "forward";
    ctx.fillStyle = line.currentColor;
    ctx.font = `700 7px ${layout.fontZh}`;
    ctx.textAlign = forward ? "right" : "left";
    ctx.fillText("运行方向", forward ? center - 7 : center + 7, markerY + 2.5);
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

export function renderLoopRouteCanvas(data: TransitData, line: TransitLine, currentIndex: number, direction: Direction, platformType: "island" | "side" = "island", transparent = false, scale = 1) {
  const stations = stationsForLine(data, line.id);
  const displayStations = loopDisplayStations(stations, currentIndex, direction, platformType);
  const visualDirection = visualDirectionFor(direction, platformType);
  const centerIndex = Math.floor(displayStations.length / 2);
  const size = data.layout.tileSize;
  const canvas = canvasOf((stations.length + 2) * size, size, scale);
  const ctx = canvas.getContext("2d")!;
  fillBackground(ctx, (stations.length + 2) * size, size, data.layout, transparent);
  ctx.drawImage(renderLoopDirectionTile(line, data.layout, direction, transparent, scale), 0, 0, size, size);
  displayStations.forEach((station, index) => {
    const tile = renderLoopStationTile(data, line, station, index === centerIndex ? "current" : "upcoming", visualDirection, transparent, scale, index, displayStations.length);
    ctx.drawImage(tile, (index + 1) * size, 0, size, size);
  });
  ctx.drawImage(renderLoopLineBadgeTile(line, data.layout, transparent, scale), (stations.length + 1) * size, 0, size, size);
  return canvas;
}
