"use client";

import { useId } from "react";
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

function estimatedTextWidth(text: string, size: number, letterSpacing = 0) {
  const characters = [...text];
  const baseWidth = characters.reduce((width, character) => {
    if (/\s/.test(character)) return width + size * 0.28;
    if (/[\x00-\xff]/.test(character)) return width + size * 0.56;
    return width + size;
  }, 0);
  return baseWidth + Math.max(0, characters.length - 1) * letterSpacing;
}

function singleLineFontSize(name: string, initialSize: number, maxWidth: number, letterSpacing = 0) {
  let size = initialSize;
  while (size > 5 && estimatedTextWidth(name, size, letterSpacing) > maxWidth) size -= 0.25;
  return size;
}

function englishTextLayout(name: string, layout: LayoutConfig, maxWidth: number) {
  return fitEnglishTextLayout(name, layout.stationEnFontSize, layout.stationEnMinFontSize, maxWidth, (text, size) => (
    estimatedTextWidth(text, size, layout.stationEnLetterSpacing)
  ));
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

function LoopTransferBadges({ data, station, state }: { data: TransitData; station: Station; state: StationState }) {
  const layout = data.layout;
  const entries = data.transfers
    .filter((transfer) => transfer.stationId === station.id && !transfer.hidden)
    .sort((a, b) => a.order - b.order)
    .flatMap((transfer) => {
      const target = data.lines.find((line) => line.id === transfer.targetLineId);
      return target ? [{ transfer, target }] : [];
    });
  let fontSize = layout.loopTransferBadgeFontSize;
  let labels = entries.map(({ target }) => target.kind === "tram" ? `Tram ${target.number.replace(/^T/i, "")}` : `Line ${target.number}`);
  const measure = () => labels.map((label) => Math.max(30, estimatedTextWidth(label, fontSize) + layout.loopTransferBadgeHeight + 7));
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
  return (
    <g>
      {entries.map(({ transfer, target }, index) => {
        const width = widths[index];
        const color = transfer.colorOverride || target.lineColor;
        const x = cursor;
        cursor += width + layout.loopTransferBadgeGap;
        return (
          <g key={transfer.id}>
            <rect x={x} y="7" width={width} height={layout.loopTransferBadgeHeight} rx={layout.loopTransferBadgeHeight * 0.32} fill={color} />
            <image href={TRANSFER_ICON_PATH} x={x + 3} y={8.5} width={layout.loopTransferBadgeHeight - 3} height={layout.loopTransferBadgeHeight - 3} preserveAspectRatio="xMidYMid meet" />
            <text x={x + layout.loopTransferBadgeHeight + 1} y={7 + layout.loopTransferBadgeHeight * 0.7} fill="#FFFFFF" fontFamily={layout.fontEn} fontSize={fontSize} fontWeight="700">{labels[index]}</text>
          </g>
        );
      })}
    </g>
  );
}

function LoopDirectionTile({ x, line, layout, direction }: { x: number; line: TransitLine; layout: LayoutConfig; direction: Direction }) {
  const maskId = `loop-direction-${useId().replaceAll(":", "")}`;
  const iconSize = layout.loopDirectionIconSize;
  const pillText = line.kind === "tram" ? `Tram ${line.number.replace(/^T/i, "")}` : `Line ${line.number}`;
  const ringDirection = direction === "forward" ? "内环" : "外环";
  return (
    <g transform={`translate(${x} 0)`}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={layout.loopDirectionIconX - iconSize / 2} y={layout.loopDirectionIconY} width={iconSize} height={iconSize}>
          <image href={TRANSFER_ICON_PATH} x={layout.loopDirectionIconX - iconSize / 2} y={layout.loopDirectionIconY} width={iconSize} height={iconSize} preserveAspectRatio="xMidYMid meet" />
        </mask>
      </defs>
      <rect x={layout.loopDirectionBadgeX - layout.loopDirectionBadgeWidth / 2} y={layout.loopDirectionBadgeY} width={layout.loopDirectionBadgeWidth} height={layout.loopDirectionBadgeHeight} rx={layout.loopDirectionBadgeRadius} fill={line.lineColor} />
      <text x={layout.loopDirectionBadgeX} y={layout.loopDirectionBadgeY + layout.loopDirectionBadgeHeight * 0.72} textAnchor="middle" fill="#FFFFFF" fontFamily={layout.fontEn} fontSize={layout.loopDirectionBadgeFontSize} fontWeight="700">{pillText}</text>
      <text x={layout.loopDirectionLineNameX} y={layout.loopDirectionLineNameY} textAnchor="middle" fill={line.textColor} fontFamily={layout.fontZh} fontSize={layout.loopDirectionLineNameFontSize} fontWeight="700">{line.nameZh || line.description}</text>
      <rect x={layout.loopDirectionIconX - iconSize / 2} y={layout.loopDirectionIconY} width={iconSize} height={iconSize} fill={line.lineColor} mask={`url(#${maskId})`} />
      <text x={layout.loopDirectionLoopTextX} y={layout.loopDirectionLoopTextY} textAnchor="middle" fill={line.textColor} fontFamily={layout.fontZh} fontSize={layout.loopDirectionLoopTextFontSize} fontWeight="800">{ringDirection}</text>
      <text x={layout.loopDirectionRunTextX} y={layout.loopDirectionRunTextY} textAnchor="middle" fill={line.textColor} fontFamily={layout.fontZh} fontSize={layout.loopDirectionRunTextFontSize} fontWeight="800">运行</text>
      <rect y={loopBarTop(layout)} width={layout.tileSize} height={layout.loopBottomBarHeight} fill={line.lineColor} />
    </g>
  );
}

function LoopLineBadgeTile({ x, line, layout }: { x: number; line: TransitLine; layout: LayoutConfig }) {
  const badgeLeft = layout.lineBadgeX - layout.lineBadgeWidth / 2;
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x={badgeLeft} y={layout.lineBadgeY} width={layout.lineBadgeWidth} height={layout.lineBadgeHeight} rx={layout.lineBadgeRadius} fill={line.lineColor} />
      <text x={layout.lineBadgeNumberX} y={layout.lineBadgeNumberY} textAnchor="middle" fill="#FFFFFF" fontFamily={layout.fontZh} fontSize={layout.lineBadgeNumberFontSize} fontWeight="700" letterSpacing={layout.lineBadgeNumberLetterSpacing}>{line.number}号线</text>
      <text x={layout.lineBadgeEnglishX} y={layout.lineBadgeEnglishY} textAnchor="middle" fill="#FFFFFF" fontFamily={layout.fontEn} fontSize={layout.lineBadgeEnglishFontSize} fontWeight="600" letterSpacing={layout.lineBadgeEnglishLetterSpacing}>{line.nameEn}</text>
      <text x={layout.lineBadgeDescriptionX} y={layout.lineBadgeDescriptionY} textAnchor="middle" fill={line.textColor} fontFamily={layout.fontZh} fontSize={layout.lineBadgeDescriptionFontSize} fontWeight="700" letterSpacing={layout.lineBadgeDescriptionLetterSpacing}>{line.description || line.nameZh}</text>
      <rect y={loopBarTop(layout)} width={layout.tileSize} height={layout.loopBottomBarHeight} fill={line.lineColor} />
    </g>
  );
}

function LoopStationTile({
  data,
  line,
  station,
  index,
  count,
  state,
  direction,
  xOverride,
}: {
  data: TransitData;
  line: TransitLine;
  station: Station;
  index: number;
  count: number;
  state: StationState;
  direction: Direction;
  xOverride?: number;
}) {
  const layout = data.layout;
  const size = layout.tileSize;
  const x = xOverride ?? (index + 1) * size;
  const center = size / 2;
  const stationY = loopCurveY(index, count, layout);
  const barTop = loopBarTop(layout);
  const barMiddle = barTop + layout.loopBottomBarHeight / 2;
  const leftY = index === 0 ? barMiddle : loopCurveY(index - 0.5, count, layout);
  const rightY = index === count - 1 ? barMiddle : loopCurveY(index + 0.5, count, layout);
  const colorState: StationState = state === "current" ? "current" : "upcoming";
  const marker = colorState === "current" ? line.currentColor : station.markerColor || line.stationColor;
  const textColor = colorState === "current" ? line.currentColor : line.textColor;
  const codeColor = line.lineColor;
  const centerCodes = stationCodeParts(station, line);
  const zhSize = singleLineFontSize(station.nameZh, layout.stationZhFontSize, size - 8, layout.stationZhLetterSpacing);
  const english = englishTextLayout(station.nameEn, layout, size - 8);
  const zhY = stationY - layout.loopStationZhOffset;
  const enY = stationY - layout.loopStationEnOffset;
  const markerBelow = stationY + layout.stationRadius + layout.loopDirectionMarkerOffset;
  const markerY = markerBelow <= loopBarTop(layout) - 3
    ? markerBelow
    : stationY - layout.stationRadius - layout.loopDirectionMarkerOffset;
  const forward = direction === "forward";
  return (
    <g transform={`translate(${x} 0)`}>
      <line x1="0" y1={leftY} x2={center} y2={stationY} stroke={line.lineColor} strokeWidth={layout.lineWidth} strokeLinecap="round" />
      <line x1={center} y1={stationY} x2={size} y2={rightY} stroke={line.lineColor} strokeWidth={layout.lineWidth} strokeLinecap="round" />
      <rect y={barTop} width={size} height={layout.loopBottomBarHeight} fill={line.lineColor} />
      <LoopTransferBadges data={data} station={station} state={colorState} />
      <circle cx={center} cy={stationY} r={layout.stationRadius} fill={layout.background} stroke={marker} strokeWidth={layout.stationRingWidth} />
      {layout.showStationCenterCodes && (
        <g fill={codeColor} stroke={codeColor}>
          <text x={center} y={stationY - 4} textAnchor="middle" dominantBaseline="middle" fontFamily={layout.fontEn} fontSize={layout.stationCenterLineFontSize} fontWeight="700" letterSpacing={layout.stationCenterLetterSpacing} stroke="none">{centerCodes.lineCode}</text>
          <line x1={center - layout.stationCenterDividerWidth / 2} y1={stationY} x2={center + layout.stationCenterDividerWidth / 2} y2={stationY} strokeWidth="0.8" />
          <text x={center} y={stationY + 4.5} textAnchor="middle" dominantBaseline="middle" fontFamily={layout.fontEn} fontSize={layout.stationCenterSequenceFontSize} fontWeight="700" letterSpacing={layout.stationCenterLetterSpacing} stroke="none">{centerCodes.stationCode}</text>
        </g>
      )}
      <text x={center} y={zhY} textAnchor="middle" fill={textColor} fontFamily={layout.fontZh} fontSize={zhSize} fontWeight="700" letterSpacing={layout.stationZhLetterSpacing}>{station.nameZh}</text>
      <text x={center} textAnchor="middle" fill={textColor} fontFamily={layout.fontEn} fontSize={english.size} fontWeight="500" letterSpacing={layout.stationEnLetterSpacing}>
        {english.lines.map((lineText, lineIndex) => <tspan key={`${lineText}-${lineIndex}`} x={center} y={enY + lineIndex * (english.size + 1.5)}>{lineText}</tspan>)}
      </text>
      {colorState === "current" && (
        <g fill={line.currentColor}>
          <text x={forward ? center - 7 : center + 7} y={markerY + 2.5} textAnchor={forward ? "end" : "start"} fontFamily={layout.fontZh} fontSize="7" fontWeight="700">运行方向</text>
          <path d={forward
            ? `M${center - 2} ${markerY - layout.loopDirectionMarkerSize / 2} L${center + layout.loopDirectionMarkerSize} ${markerY} L${center - 2} ${markerY + layout.loopDirectionMarkerSize / 2} Z`
            : `M${center + 2} ${markerY - layout.loopDirectionMarkerSize / 2} L${center - layout.loopDirectionMarkerSize} ${markerY} L${center + 2} ${markerY + layout.loopDirectionMarkerSize / 2} Z`} />
        </g>
      )}
    </g>
  );
}

export function LoopStationPreviewSvg({ data, line, station, direction, transparent }: { data: TransitData; line: TransitLine; station: Station; direction: Direction; transparent: boolean }) {
  const size = data.layout.tileSize;
  return (
    <svg className="settings-station-preview" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${station.nameZh}环线样式预览`} shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      {!transparent && <rect width={size} height={size} fill={data.layout.background} />}
      <LoopStationTile data={data} line={line} station={station} index={1} count={3} state="current" direction={direction} xOverride={0} />
    </svg>
  );
}

export function LoopDirectionPreviewSvg({ data, line, direction, transparent }: { data: TransitData; line: TransitLine; direction: Direction; transparent: boolean }) {
  const size = data.layout.tileSize;
  return (
    <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${direction === "forward" ? "内环" : "外环"}运行矢量预览`} shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      {!transparent && <rect width={size} height={size} fill={data.layout.background} />}
      <LoopDirectionTile x={0} line={line} layout={data.layout} direction={direction} />
    </svg>
  );
}

export function LoopTextCardPreviewSvg({ data, line, station, kind, transparent }: { data: TransitData; line: TransitLine; station: Station; kind: "current" | "next"; transparent: boolean }) {
  const layout = data.layout;
  const size = layout.tileSize;
  const current = kind === "current";
  const accentX = current ? layout.currentAccentX : layout.nextAccentX;
  const accentY = current ? layout.currentAccentY : layout.nextAccentY;
  const accentWidth = current ? layout.currentAccentWidth : layout.nextAccentWidth;
  const accentHeight = current ? layout.currentAccentHeight : layout.nextAccentHeight;
  const labelX = current ? layout.currentLabelX : layout.nextLabelX;
  const labelY = current ? layout.currentLabelY : layout.nextLabelY;
  const stationX = current ? layout.currentStationX : layout.nextStationX;
  const stationY = current ? layout.currentStationY : layout.nextStationY;
  const stationSize = singleLineFontSize(station.nameZh, layout.infoStationFontSize, 110, layout.infoStationLetterSpacing);
  return (
    <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${current ? "本站" : "下一站"}环线样式预览`} shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      {!transparent && <rect width={size} height={size} fill={layout.background} />}
      <rect x={accentX} y={accentY} width={accentWidth} height={accentHeight} fill={line.currentColor} />
      <text x={labelX} y={labelY} fill={line.textColor} fontFamily={layout.fontZh} fontSize={layout.infoLabelFontSize} letterSpacing={layout.infoLabelLetterSpacing} fontWeight="700">{current ? "本站:" : "下一站:"}</text>
      <text x={stationX} y={stationY} fill={line.textColor} fontFamily={layout.fontZh} fontSize={stationSize} letterSpacing={layout.infoStationLetterSpacing} fontWeight="700">{station.nameZh}</text>
      <rect y={loopBarTop(layout)} width={size} height={layout.loopBottomBarHeight} fill={line.lineColor} />
    </svg>
  );
}

export function LoopLineBadgePreviewSvg({ data, line, transparent }: { data: TransitData; line: TransitLine; transparent: boolean }) {
  const size = data.layout.tileSize;
  return (
    <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="环线线路标识矢量预览" shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      {!transparent && <rect width={size} height={size} fill={data.layout.background} />}
      <LoopLineBadgeTile x={0} line={line} layout={data.layout} />
    </svg>
  );
}

export default function LoopRoutePreviewSvg({ data, line, currentIndex, direction, platformType = "island", transparent, onDoubleClick }: { data: TransitData; line: TransitLine; currentIndex: number; direction: Direction; platformType?: "island" | "side"; transparent: boolean; onDoubleClick: React.MouseEventHandler<SVGSVGElement> }) {
  const stations = stationsForLine(data, line.id);
  const displayStations = loopDisplayStations(stations, currentIndex, direction, platformType);
  const visualDirection = visualDirectionFor(direction, platformType);
  const centerIndex = Math.floor(displayStations.length / 2);
  const size = data.layout.tileSize;
  const width = (stations.length + 2) * size;
  return (
    <svg className="vector-preview" viewBox={`0 0 ${width} ${size}`} width={width} height={size} role="img" aria-label={`${line.nameZh}环线样式预览`} shapeRendering="geometricPrecision" textRendering="geometricPrecision" onDoubleClick={onDoubleClick}>
      {!transparent && <rect width={width} height={size} fill={data.layout.background} />}
      <LoopDirectionTile x={0} line={line} layout={data.layout} direction={direction} />
      {displayStations.map((station, index) => <LoopStationTile key={`${station.id}-${index}`} data={data} line={line} station={station} index={index} count={displayStations.length} state={index === centerIndex ? "current" : "upcoming"} direction={visualDirection} />)}
      <LoopLineBadgeTile x={(stations.length + 1) * size} line={line} layout={data.layout} />
    </svg>
  );
}
