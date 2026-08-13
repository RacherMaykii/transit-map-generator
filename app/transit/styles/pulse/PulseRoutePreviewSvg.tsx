"use client";

import { MouseEvent } from "react";
import { fitEnglishTextLayout } from "../../english-layout.mjs";
import { useLayoutDrag } from "../../RoutePreviewSvg";
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

function estimatedTextWidth(text: string, size: number, letterSpacing = 0) {
  return [...text].reduce((width, character) => width + (/\s/.test(character) ? size * 0.28 : /[\x00-\xff]/.test(character) ? size * 0.56 : size), 0)
    + Math.max(0, [...text].length - 1) * letterSpacing;
}

function singleLineFontSize(text: string, initial: number, min: number, width: number, letterSpacing = 0) {
  let size = initial;
  while (size > min && estimatedTextWidth(text, size, letterSpacing) > width) size -= 0.25;
  return size;
}

function englishLayout(text: string, layout: LayoutConfig, width: number) {
  return fitEnglishTextLayout(text, layout.stationEnFontSize, layout.stationEnMinFontSize, width, (candidate, size) => estimatedTextWidth(candidate, size, layout.stationEnLetterSpacing));
}

function segmentStates(state: StationState, direction: Direction): { left: SegmentState; right: SegmentState } {
  if (state === "passed") return { left: "passed", right: "passed" };
  if (state === "upcoming") return { left: "upcoming", right: "upcoming" };
  return direction === "forward" ? { left: "passed", right: "upcoming" } : { left: "upcoming", right: "passed" };
}

function segmentColor(line: TransitLine, state: SegmentState) {
  return state === "passed" ? line.passedColor : line.lineColor;
}

function transferLabel(line: TransitLine) {
  return `${line.kind === "tram" ? "T" : "L"}${line.number.replace(/^(L|T)/i, "")}`;
}

function PulseTransfers({ data, station, state }: { data: TransitData; station: Station; state: StationState }) {
  const entries = data.transfers
    .filter((transfer) => transfer.stationId === station.id && !transfer.hidden)
    .sort((a, b) => a.order - b.order)
    .flatMap((transfer) => {
      const line = data.lines.find((candidate) => candidate.id === transfer.targetLineId);
      return line ? [{ transfer, line }] : [];
    });
  const layout = data.layout;
  const widths = entries.map(({ line }) => Math.max(26, transferLabel(line).length * layout.transferFontSize * 0.72 + 13));
  const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, entries.length - 1) * layout.pulseTransferBadgeGap;
  let cursor = layout.tileSize / 2 - total / 2;
  const y = layout.lineY - layout.pulseNodeHeight / 2 - layout.pulseTransferBadgeHeight - 7;
  return (
    <g>
      {entries.map(({ transfer, line }, index) => {
        const width = widths[index];
        const x = cursor;
        cursor += width + layout.pulseTransferBadgeGap;
        return (
          <g key={transfer.id}>
            <rect x={x} y={y} width={width} height={layout.pulseTransferBadgeHeight} rx={layout.pulseTransferBadgeHeight / 2} fill={state === "passed" ? line.passedColor : transfer.colorOverride || line.lineColor} />
            <text x={x + width / 2} y={y + layout.pulseTransferBadgeHeight / 2 + 0.5} dominantBaseline="middle" textAnchor="middle" fill="#FFFFFF" fontFamily={layout.fontEn} fontSize={layout.transferFontSize} fontWeight="700" letterSpacing={layout.transferLetterSpacing}>{transferLabel(line)}</text>
          </g>
        );
      })}
    </g>
  );
}

function Track({ x1, x2, y, color, layout }: { x1: number; x2: number; y: number; color: string; layout: LayoutConfig }) {
  return (
    <g fill="none" strokeLinecap="round">
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={layout.pulseTrackColor} strokeWidth={layout.pulseGlowWidth} opacity=".72" />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={layout.lineWidth} />
    </g>
  );
}

function PulseStationTile({ data, line, station, index, count, state, direction, xOverride }: { data: TransitData; line: TransitLine; station: Station; index: number; count: number; state: StationState; direction: Direction; xOverride?: number }) {
  const layout = data.layout;
  const size = layout.tileSize;
  const x = xOverride ?? (index + 1) * size;
  const center = size / 2;
  const colorState: StationState = layout.closedStationsUsePassedColor && !station.isOpen ? "passed" : state;
  const states = segmentStates(colorState, direction);
  const marker = colorState === "passed" ? line.passedColor : colorState === "current" ? line.currentColor : station.markerColor || line.stationColor;
  const nodeX = center - layout.pulseNodeWidth / 2;
  const nodeY = layout.lineY - layout.pulseNodeHeight / 2;
  const textColor = colorState === "passed" ? line.passedColor : colorState === "current" ? line.currentColor : "#EAF4F8";
  const zhSize = singleLineFontSize(station.nameZh, layout.stationZhFontSize, 5, size - 10, layout.stationZhLetterSpacing);
  const english = englishLayout(station.nameEn, layout, size - 10);
  return (
    <g transform={`translate(${x} 0)`}>
      <rect width={size} height={layout.pulseHeaderHeight} fill={layout.pulsePanelColor} opacity=".82" />
      {index > 0 && <Track x1={0} x2={center} y={layout.lineY} color={segmentColor(line, states.left)} layout={layout} />}
      {index < count - 1 && <Track x1={center} x2={size} y={layout.lineY} color={segmentColor(line, states.right)} layout={layout} />}
      {layout.pulseShowSequence && <text x="9" y={layout.pulseHeaderHeight / 2 + 0.5} dominantBaseline="middle" fill={colorState === "current" ? line.currentColor : "#8CA7B8"} fontFamily={layout.fontEn} fontSize="8" fontWeight="700" letterSpacing=".8">{String(station.sequence).padStart(2, "0")}</text>}
      <PulseTransfers data={data} station={station} state={colorState} />
      {colorState === "current" && <rect x={nodeX - layout.pulseCurrentHaloSize} y={nodeY - layout.pulseCurrentHaloSize} width={layout.pulseNodeWidth + layout.pulseCurrentHaloSize * 2} height={layout.pulseNodeHeight + layout.pulseCurrentHaloSize * 2} rx={layout.pulseNodeRadius + layout.pulseCurrentHaloSize} fill={marker} opacity=".25" />}
      <rect x={nodeX} y={nodeY} width={layout.pulseNodeWidth} height={layout.pulseNodeHeight} rx={layout.pulseNodeRadius} fill={colorState === "current" ? marker : layout.background} stroke={marker} strokeWidth={layout.stationRingWidth} />
      <circle cx={center} cy={layout.lineY} r="2.4" fill={colorState === "current" ? layout.background : marker} />
      <text x={center} y={layout.pulseStationZhY} textAnchor="middle" fill={textColor} fontFamily={layout.fontZh} fontSize={zhSize} fontWeight="700" letterSpacing={layout.stationZhLetterSpacing}>{station.nameZh}</text>
      <text x={center} textAnchor="middle" fill={textColor} fontFamily={layout.fontEn} fontSize={english.size} fontWeight="500" letterSpacing={layout.stationEnLetterSpacing}>
        {english.lines.map((text, lineIndex) => <tspan key={`${text}-${lineIndex}`} x={center} y={layout.pulseStationEnY + lineIndex * (english.size + 1.25)}>{text}</tspan>)}
      </text>
      <rect y={size - 4} width={size} height="4" fill={line.lineColor} />
    </g>
  );
}

function PulseDirectionTile({ x, line, station, side, layout, onLayoutChange }: { x: number; line: TransitLine; station?: Station; side: "left" | "right"; layout: LayoutConfig; onLayoutChange?: (patch: Partial<LayoutConfig>) => void }) {
  const left = side === "left";
  const direction = left ? -1 : 1;
  const baseX = left ? layout.tileSize - layout.directionArrowX : layout.directionArrowX;
  const textX = left ? layout.tileSize - layout.directionLabelX : layout.directionLabelX;
  const stationX = left ? layout.tileSize - layout.directionStationX : layout.directionStationX;
  const bindDrag = useLayoutDrag(onLayoutChange);
  const stationSize = singleLineFontSize(station?.nameZh || "未设置", layout.directionStationFontSize, 6, 76, layout.directionStationLetterSpacing);
  return (
    <g transform={`translate(${x} 0)`}>
      <rect width={layout.tileSize} height={layout.pulseHeaderHeight} fill={layout.pulsePanelColor} />
      <text x={left ? 9 : layout.tileSize - 9} y={layout.pulseHeaderHeight / 2 + 0.5} dominantBaseline="middle" textAnchor={left ? "start" : "end"} fill="#8CA7B8" fontFamily={layout.fontEn} fontSize="8" fontWeight="700">{line.code || line.number}</text>
      <g {...bindDrag("directionArrowX", "directionArrowY", layout.directionArrowX, layout.directionArrowY, left ? -1 : 1)}>
        <line x1={baseX - direction * layout.directionArrowShaftLength} y1={layout.directionArrowY} x2={baseX} y2={layout.directionArrowY} stroke={line.lineColor} strokeWidth={layout.directionArrowThickness} strokeLinecap="round" />
        <path d={`M${baseX + direction * layout.directionArrowHeadLength} ${layout.directionArrowY} L${baseX} ${layout.directionArrowY - layout.directionArrowHeadWidth / 2} L${baseX} ${layout.directionArrowY + layout.directionArrowHeadWidth / 2} Z`} fill={line.lineColor} />
      </g>
      <text x={textX} y={layout.directionLabelY} textAnchor={left ? "start" : "end"} fill="#8CA7B8" fontFamily={layout.fontZh} fontSize={layout.directionLabelFontSize} fontWeight="700" letterSpacing={layout.directionLabelLetterSpacing} {...bindDrag("directionLabelX", "directionLabelY", layout.directionLabelX, layout.directionLabelY, left ? -1 : 1)}>运行方向 · TO</text>
      <text x={stationX} y={layout.directionStationY} textAnchor={left ? "start" : "end"} fill="#EAF4F8" fontFamily={layout.fontZh} fontSize={stationSize} fontWeight="700" letterSpacing={layout.directionStationLetterSpacing} {...bindDrag("directionStationX", "directionStationY", layout.directionStationX, layout.directionStationY, left ? -1 : 1)}>{station?.nameZh || "未设置"}</text>
      <rect y={layout.tileSize - 4} width={layout.tileSize} height="4" fill={line.lineColor} />
    </g>
  );
}

function PulseTextCard({ data, line, station, kind, onLayoutChange }: { data: TransitData; line: TransitLine; station: Station; kind: "current" | "next"; onLayoutChange?: (patch: Partial<LayoutConfig>) => void }) {
  const layout = data.layout;
  const current = kind === "current";
  const accentX = current ? layout.currentAccentX : layout.nextAccentX;
  const accentY = current ? layout.currentAccentY : layout.nextAccentY;
  const accentWidth = current ? layout.currentAccentWidth : layout.nextAccentWidth;
  const accentHeight = current ? layout.currentAccentHeight : layout.nextAccentHeight;
  const labelX = current ? layout.currentLabelX : layout.nextLabelX;
  const labelY = current ? layout.currentLabelY : layout.nextLabelY;
  const stationX = current ? layout.currentStationX : layout.nextStationX;
  const stationY = current ? layout.currentStationY : layout.nextStationY;
  const stationSize = singleLineFontSize(station.nameZh, layout.infoStationFontSize, 7, 100, layout.infoStationLetterSpacing);
  const english = englishLayout(station.nameEn, layout, 100);
  const bindDrag = useLayoutDrag(onLayoutChange);
  const accent = current ? line.currentColor : line.lineColor;
  return (
    <g>
      <rect width={layout.tileSize} height={layout.pulseHeaderHeight} fill={layout.pulsePanelColor} />
      <rect x={accentX} y={accentY} width={accentWidth} height={accentHeight} fill={accent} {...bindDrag(current ? "currentAccentX" : "nextAccentX", current ? "currentAccentY" : "nextAccentY", accentX, accentY)} />
      <text x={labelX} y={labelY} fill={accent} fontFamily={layout.fontEn} fontSize={layout.infoLabelFontSize} fontWeight="700" letterSpacing={layout.infoLabelLetterSpacing} {...bindDrag(current ? "currentLabelX" : "nextLabelX", current ? "currentLabelY" : "nextLabelY", labelX, labelY)}>{current ? "NOW · 本站" : "NEXT · 下一站"}</text>
      <text x={stationX} y={stationY} fill="#EAF4F8" fontFamily={layout.fontZh} fontSize={stationSize} fontWeight="700" letterSpacing={layout.infoStationLetterSpacing} {...bindDrag(current ? "currentStationX" : "nextStationX", current ? "currentStationY" : "nextStationY", stationX, stationY)}>{station.nameZh}</text>
      <text x={stationX} fill="#8CA7B8" fontFamily={layout.fontEn} fontSize={english.size} fontWeight="500" letterSpacing={layout.stationEnLetterSpacing}>
        {english.lines.map((text, index) => <tspan key={`${text}-${index}`} x={stationX} y={stationY + 16 + index * (english.size + 1.25)}>{text}</tspan>)}
      </text>
      <rect y={layout.tileSize - 4} width={layout.tileSize} height="4" fill={line.lineColor} />
    </g>
  );
}

function PulseLineBadgeTile({ line, layout, onLayoutChange }: { line: TransitLine; layout: LayoutConfig; onLayoutChange?: (patch: Partial<LayoutConfig>) => void }) {
  const left = layout.lineBadgeX - layout.lineBadgeWidth / 2;
  const bindDrag = useLayoutDrag(onLayoutChange);
  return (
    <g>
      <rect x={left} y={layout.lineBadgeY} width={layout.lineBadgeWidth} height={layout.lineBadgeHeight} rx={layout.lineBadgeRadius} fill={layout.pulsePanelColor} {...bindDrag("lineBadgeX", "lineBadgeY", layout.lineBadgeX, layout.lineBadgeY)} />
      <rect x={left} y={layout.lineBadgeY} width="6" height={layout.lineBadgeHeight} fill={line.lineColor} />
      <text x={layout.lineBadgeEnglishX} y={layout.lineBadgeEnglishY - 22} textAnchor="middle" fill="#8CA7B8" fontFamily={layout.fontEn} fontSize={layout.lineBadgeEnglishFontSize} fontWeight="700" letterSpacing={layout.lineBadgeEnglishLetterSpacing}>{line.code || `L${line.number}`}</text>
      <text x={layout.lineBadgeNumberX} y={layout.lineBadgeNumberY} textAnchor="middle" fill="#FFFFFF" fontFamily={layout.fontZh} fontSize={layout.lineBadgeNumberFontSize} fontWeight="700" letterSpacing={layout.lineBadgeNumberLetterSpacing}>{line.number}号线</text>
      <text x={layout.lineBadgeDescriptionX} y={layout.lineBadgeDescriptionY} textAnchor="middle" fill="#AFC4CF" fontFamily={layout.fontZh} fontSize={singleLineFontSize(line.description || line.nameZh, layout.lineBadgeDescriptionFontSize, 6, 106, layout.lineBadgeDescriptionLetterSpacing)} fontWeight="700" letterSpacing={layout.lineBadgeDescriptionLetterSpacing}>{line.description || line.nameZh}</text>
      <rect y={layout.tileSize - 4} width={layout.tileSize} height="4" fill={line.lineColor} />
    </g>
  );
}

export function PulseStationPreviewSvg({ data, line, station, direction, transparent }: { data: TransitData; line: TransitLine; station: Station; direction: Direction; transparent: boolean }) {
  const size = data.layout.tileSize;
  return <svg className="settings-station-preview" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${station.nameZh}城市脉冲样式预览`} shapeRendering="geometricPrecision" textRendering="geometricPrecision">{!transparent && <rect width={size} height={size} fill={data.layout.background} />}<PulseStationTile data={data} line={line} station={station} index={1} count={3} state="current" direction={direction} xOverride={0} /></svg>;
}

export function PulseTextCardPreviewSvg({ data, line, station, kind, transparent, onLayoutChange }: { data: TransitData; line: TransitLine; station: Station; kind: "current" | "next"; transparent: boolean; onLayoutChange?: (patch: Partial<LayoutConfig>) => void }) {
  const size = data.layout.tileSize;
  return <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${kind === "current" ? "本站" : "下一站"}城市脉冲矢量预览`}>{!transparent && <rect width={size} height={size} fill={data.layout.background} />}<PulseTextCard data={data} line={line} station={station} kind={kind} onLayoutChange={onLayoutChange} /></svg>;
}

export function PulseDirectionPreviewSvg({ data, line, station, side, transparent, onLayoutChange }: { data: TransitData; line: TransitLine; station?: Station; side: "left" | "right"; transparent: boolean; onLayoutChange?: (patch: Partial<LayoutConfig>) => void }) {
  const size = data.layout.tileSize;
  return <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="城市脉冲运行方向矢量预览">{!transparent && <rect width={size} height={size} fill={data.layout.background} />}<PulseDirectionTile x={0} line={line} station={station} side={side} layout={data.layout} onLayoutChange={onLayoutChange} /></svg>;
}

export function PulseLineBadgePreviewSvg({ data, line, transparent, onLayoutChange }: { data: TransitData; line: TransitLine; transparent: boolean; onLayoutChange?: (patch: Partial<LayoutConfig>) => void }) {
  const size = data.layout.tileSize;
  return <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="城市脉冲线路标识矢量预览">{!transparent && <rect width={size} height={size} fill={data.layout.background} />}<PulseLineBadgeTile line={line} layout={data.layout} onLayoutChange={onLayoutChange} /></svg>;
}

export default function PulseRoutePreviewSvg({ data, line, currentIndex, direction, platformType = "island", transparent, onDoubleClick }: { data: TransitData; line: TransitLine; currentIndex: number; direction: Direction; platformType?: "island" | "side"; transparent: boolean; onDoubleClick: (event: MouseEvent<SVGSVGElement>) => void }) {
  const stations = stationsForLine(data, line.id);
  const displayStations = displayStationsForPlatform(stations, platformType) as Array<{ station: Station; logicalIndex: number; displayIndex: number }>;
  const visualDirection = visualDirectionFor(direction, platformType);
  const size = data.layout.tileSize;
  const width = (stations.length + 2) * size;
  return (
    <svg className="vector-preview" viewBox={`0 0 ${width} ${size}`} width={width} height={size} role="img" aria-label={`${line.nameZh}城市脉冲站序图预览`} shapeRendering="geometricPrecision" textRendering="geometricPrecision" onDoubleClick={onDoubleClick}>
      {!transparent && <rect width={width} height={size} fill={data.layout.background} />}
      <PulseDirectionTile x={0} line={line} station={displayStations[0]?.station} side="left" layout={data.layout} />
      {displayStations.map(({ station, logicalIndex, displayIndex }) => <PulseStationTile key={station.id} data={data} line={line} station={station} index={displayIndex} count={stations.length} state={stateForStation(logicalIndex, currentIndex, direction)} direction={visualDirection} />)}
      <PulseDirectionTile x={(stations.length + 1) * size} line={line} station={displayStations[displayStations.length - 1]?.station} side="right" layout={data.layout} />
    </svg>
  );
}
