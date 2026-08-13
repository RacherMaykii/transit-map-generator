"use client";

import { MouseEvent, PointerEvent as ReactPointerEvent, useId, useRef } from "react";
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
} from "./types";
import { fitEnglishTextLayout } from "./english-layout.mjs";
import { displayStationsForPlatform, visualDirectionFor } from "./route-orientation.mjs";
import LoopRoutePreviewSvg, { LoopDirectionPreviewSvg, LoopLineBadgePreviewSvg, LoopStationPreviewSvg, LoopTextCardPreviewSvg } from "./styles/loop/LoopRoutePreviewSvg";
import ScenicRoutePreviewSvg, { ScenicDirectionPreviewSvg, ScenicLineBadgePreviewSvg, ScenicStationPreviewSvg, ScenicTextCardPreviewSvg } from "./styles/scenic/ScenicRoutePreviewSvg";
import PulseRoutePreviewSvg, { PulseDirectionPreviewSvg, PulseLineBadgePreviewSvg, PulseStationPreviewSvg, PulseTextCardPreviewSvg } from "./styles/pulse/PulseRoutePreviewSvg";
import { siteUrl } from "../site";

interface Props {
  data: TransitData;
  line: TransitLine;
  currentIndex: number;
  direction: Direction;
  platformType?: "island" | "side";
  transparent: boolean;
  onDoubleClick: (event: MouseEvent<SVGSVGElement>) => void;
}

export type NumericLayoutKey = {
  [Key in keyof LayoutConfig]: LayoutConfig[Key] extends number ? Key : never
}[keyof LayoutConfig];

export function useLayoutDrag(onChange?: (patch: Partial<LayoutConfig>) => void) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    valueX: number;
    valueY: number;
    xKey: NumericLayoutKey;
    yKey: NumericLayoutKey;
    xScale: number;
  } | null>(null);

  const svgPoint = (event: ReactPointerEvent<SVGElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: event.clientX, y: event.clientY };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  };

  const bind = (
    xKey: NumericLayoutKey,
    yKey: NumericLayoutKey,
    valueX: number,
    valueY: number,
    xScale = 1,
  ) => ({
    onPointerDown: (event: ReactPointerEvent<SVGElement>) => {
      if (!onChange) return;
      const point = svgPoint(event);
      drag.current = { pointerId: event.pointerId, startX: point.x, startY: point.y, valueX, valueY, xKey, yKey, xScale };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    onPointerMove: (event: ReactPointerEvent<SVGElement>) => {
      const active = drag.current;
      if (!active || active.pointerId !== event.pointerId || !onChange) return;
      const point = svgPoint(event);
      const x = Math.max(-64, Math.min(192, active.valueX + (point.x - active.startX) * active.xScale));
      const y = Math.max(-64, Math.min(192, active.valueY + point.y - active.startY));
      onChange({
        [active.xKey]: Math.round(x * 2) / 2,
        [active.yKey]: Math.round(y * 2) / 2,
      } as Partial<LayoutConfig>);
    },
    onPointerUp: (event: ReactPointerEvent<SVGElement>) => {
      if (drag.current?.pointerId === event.pointerId) drag.current = null;
    },
    onPointerCancel: () => { drag.current = null; },
    style: onChange ? { cursor: "move", touchAction: "none" } : undefined,
  });

  return bind;
}

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

function englishTextLayout(name: string, initialSize: number, minSize: number, maxWidth: number, letterSpacing = 0) {
  return fitEnglishTextLayout(name, initialSize, minSize, maxWidth, (text, size) => estimatedTextWidth(text, size, letterSpacing));
}

function transferArrowPath(layout: LayoutConfig, x: number) {
  const baseY = layout.lineY - layout.stationRadius + 1;
  const tipY = baseY - layout.transferArrowLength;
  const neckY = tipY + Math.min(10, layout.transferArrowLength * 0.45);
  const halfHead = layout.transferArrowHeadWidth / 2;
  const halfStem = layout.transferArrowStemWidth / 2;
  return `M${x} ${tipY} L${x - halfHead} ${neckY} H${x - halfStem} V${baseY} H${x + halfStem} V${neckY} H${x + halfHead} Z`;
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

function DirectionTile({
  x,
  line,
  station,
  side,
  direction,
  layout,
  onLayoutChange,
}: {
  x: number;
  line: TransitLine;
  station?: Station;
  side: "left" | "right";
  direction?: Direction;
  layout: LayoutConfig;
  onLayoutChange?: (patch: Partial<LayoutConfig>) => void;
}) {
  const left = side === "left";
  const baseX = left ? layout.tileSize - layout.directionArrowX : layout.directionArrowX;
  const arrowY = layout.directionArrowY;
  const labelX = left ? layout.tileSize - layout.directionLabelX : layout.directionLabelX;
  const stationX = left ? layout.tileSize - layout.directionStationX : layout.directionStationX;
  const bindDrag = useLayoutDrag(onLayoutChange);
  const overlap = 5;
  const shaftStart = left ? baseX - overlap : baseX + overlap - layout.directionArrowShaftLength;
  const shaftEnd = left ? baseX - overlap + layout.directionArrowShaftLength : baseX + overlap;
  const tipX = left ? baseX - layout.directionArrowHeadLength : baseX + layout.directionArrowHeadLength;
  const halfHead = layout.directionArrowHeadWidth / 2;
  return (
    <g transform={`translate(${x} 0)`}>
      <g {...bindDrag("directionArrowX", "directionArrowY", layout.directionArrowX, layout.directionArrowY, left ? -1 : 1)}>
        <line
          x1={shaftStart}
          y1={arrowY}
          x2={shaftEnd}
          y2={arrowY}
          stroke={line.lineColor}
          strokeWidth={layout.directionArrowThickness}
          strokeLinecap="round"
        />
        <path
          d={`M${tipX} ${arrowY} L${baseX} ${arrowY - halfHead} L${baseX} ${arrowY + halfHead} Z`}
          fill={line.lineColor}
        />
      </g>
      <text
        x={labelX}
        y={layout.directionLabelY}
        fill={line.textColor}
        textAnchor={left ? "start" : "end"}
        fontFamily={layout.fontZh}
        fontSize={layout.directionLabelFontSize}
        letterSpacing={layout.directionLabelLetterSpacing}
        fontWeight="700"
        {...bindDrag("directionLabelX", "directionLabelY", layout.directionLabelX, layout.directionLabelY, left ? -1 : 1)}
      >运行方向:</text>
      <text
        x={stationX}
        y={layout.directionStationY}
        fill={line.textColor}
        textAnchor={left ? "start" : "end"}
        fontFamily={layout.fontZh}
        fontSize={singleLineFontSize(station?.nameZh || "未设置", layout.directionStationFontSize, 75, layout.directionStationLetterSpacing)}
        letterSpacing={layout.directionStationLetterSpacing}
        fontWeight="700"
        {...bindDrag("directionStationX", "directionStationY", layout.directionStationX, layout.directionStationY, left ? -1 : 1)}
      >{station?.nameZh || "未设置"}</text>
    </g>
  );
}

function MergedMetroTransfer({
  lines,
  colors,
  muted,
  layout,
  x,
  availableWidth,
}: {
  lines: TransitLine[];
  colors: string[];
  muted: boolean;
  layout: LayoutConfig;
  x: number;
  availableWidth: number;
}) {
  const gradientId = `merged-transfer-${useId().replaceAll(":", "")}`;
  const inks = colors.map((color) => muted ? "#929292" : color);
  const fullWidth = lines.reduce((sum, line) => sum + estimatedTextWidth(`${line.number}号线`, layout.transferFontSize, layout.transferLetterSpacing), 0) + (lines.length - 1) * estimatedTextWidth("/", layout.transferFontSize, layout.transferLetterSpacing);
  const compact = fullWidth > availableWidth;
  const label = compact
    ? `${lines.map((line) => line.number).join("/")}号线`
    : lines.map((line) => `${line.number}号线`).join("/");
  const arrow = transferArrowPath(layout, x);
  const baseY = layout.lineY - layout.stationRadius + 1;
  const tipY = baseY - layout.transferArrowLength;
  const labelWidth = estimatedTextWidth(label, layout.transferFontSize, layout.transferLetterSpacing);
  return (
    <g>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={x - Math.max(layout.transferArrowHeadWidth, labelWidth) / 2} x2={x + Math.max(layout.transferArrowHeadWidth, labelWidth) / 2} y1={tipY} y2={tipY}>
          {mergedTransferGradientStops(inks).map(({ color, offset }, index) => (
            <stop key={`${color}-${index}`} offset={`${offset * 100}%`} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      <text x={x} y={tipY - 3} textAnchor="middle" fill={`url(#${gradientId})`} fontFamily={layout.fontZh} fontSize={layout.transferFontSize} fontWeight="700" letterSpacing={layout.transferLetterSpacing}>{label}</text>
      <path d={arrow} fill={`url(#${gradientId})`} />
    </g>
  );
}

function Transfers({
  data,
  station,
  state,
}: {
  data: TransitData;
  station: Station;
  state: StationState;
}) {
  const transfers = data.transfers
    .filter((transfer) => transfer.stationId === station.id && !transfer.hidden)
    .sort((a, b) => a.order - b.order);
  const muted = state === "passed";
  const entries = transfers.flatMap((transfer) => {
    const target = data.lines.find((line) => line.id === transfer.targetLineId);
    return target ? [{ transfer, target }] : [];
  });
  const metroEntries = entries.filter(({ target }) => target.kind === "metro");
  const tramEntries = entries.filter(({ target }) => target.kind === "tram");
  const center = data.layout.tileSize / 2;
  const tramCenter = metroEntries.length ? center + 36 : center;
  const tramSpacing = Math.min(46, 56 / Math.max(1, tramEntries.length));
  const tramStart = tramCenter - ((tramEntries.length - 1) * tramSpacing) / 2;
  return (
    <>
      {metroEntries.length >= 2 ? (
        <MergedMetroTransfer
          lines={metroEntries.map(({ target }) => target)}
          colors={metroEntries.map(({ transfer, target }) => transfer.colorOverride || target.lineColor)}
          muted={muted}
          layout={data.layout}
          x={center}
          availableWidth={data.layout.tileSize - 10}
        />
      ) : metroEntries.length === 1 ? (() => {
        const { transfer, target } = metroEntries[0];
        const x = center;
        const color = muted ? "#929292" : transfer.colorOverride || target.lineColor;
        const baseY = data.layout.lineY - data.layout.stationRadius + 1;
        const tipY = baseY - data.layout.transferArrowLength;
        return (
          <g key={transfer.id}>
            <text x={x} y={tipY - 3} textAnchor="middle" fill={color} fontFamily={data.layout.fontZh} fontSize={data.layout.transferFontSize} fontWeight="700" letterSpacing={data.layout.transferLetterSpacing}>{target.number}号线</text>
            <path d={transferArrowPath(data.layout, x)} fill={color} />
          </g>
        );
      })() : null}
      {tramEntries.map(({ transfer, target }, index) => {
        const x = tramStart + index * tramSpacing;
        const color = muted ? "#929292" : transfer.colorOverride || target.lineColor;
        const badgeY = data.layout.lineY - data.layout.stationRadius - data.layout.transferArrowLength + data.layout.tramTransferVerticalOffset;
        return (
          <g key={transfer.id}>
            <rect x={x - 27} y={badgeY} width="54" height="18" rx="4" fill={color} />
            <image href={siteUrl("assets/tram.png")} x={x - 22} y={badgeY + 2} width="14" height="14" preserveAspectRatio="xMidYMid meet" />
            <text x={x + 8} y={badgeY + 12.5} textAnchor="middle" fill="#FFFFFF" fontFamily={data.layout.fontEn} fontSize={data.layout.tramTransferFontSize} fontWeight="700" letterSpacing={data.layout.tramTransferLetterSpacing}>Tram {target.number.replace(/^T/i, "")}</text>
          </g>
        );
      })}
    </>
  );
}

function StationTile({
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
  const size = data.layout.tileSize;
  const x = xOverride ?? (index + 1) * size;
  const colorState: StationState = data.layout.closedStationsUsePassedColor && station.isOpen === false ? "passed" : state;
  const segments = colorState === "passed"
    ? { left: "passed", right: "passed" }
    : colorState === "upcoming"
      ? { left: "upcoming", right: "upcoming" }
      : direction === "forward"
        ? { left: "passed", right: "upcoming" }
        : { left: "upcoming", right: "passed" };
  const colorFor = (segment: string) => segment === "passed" ? line.passedColor : line.lineColor;
  const marker = colorState === "passed"
    ? line.passedColor
    : colorState === "current"
      ? line.currentColor
      : station.markerColor || line.stationColor;
  const textColor = colorState === "passed"
    ? line.passedColor
    : colorState === "current"
      ? line.currentColor
      : line.textColor;
  const centerCodeColor = colorState === "passed" ? line.passedColor : line.lineColor;
  const centerCodes = stationCodeParts(station, line);
  const center = size / 2;
  const zhSize = singleLineFontSize(station.nameZh, data.layout.stationZhFontSize, size - 8, data.layout.stationZhLetterSpacing);
  const english = englishTextLayout(station.nameEn, data.layout.stationEnFontSize, data.layout.stationEnMinFontSize, size - 8, data.layout.stationEnLetterSpacing);
  const firstEnglishY = 108;
  return (
    <g transform={`translate(${x} 0)`}>
      {index > 0 && <line x1="0" y1={data.layout.lineY} x2={center} y2={data.layout.lineY} stroke={colorFor(segments.left)} strokeWidth={data.layout.lineWidth} />}
      {index < count - 1 && <line x1={center} y1={data.layout.lineY} x2={size} y2={data.layout.lineY} stroke={colorFor(segments.right)} strokeWidth={data.layout.lineWidth} />}
      <Transfers data={data} station={station} state={colorState} />
      <circle cx={center} cy={data.layout.lineY} r={data.layout.stationRadius} fill={data.layout.background} stroke={marker} strokeWidth={data.layout.stationRingWidth} />
      {data.layout.showStationCenterCodes && (
        <g fill={centerCodeColor} stroke={centerCodeColor}>
          <text x={center} y={data.layout.lineY - 5} textAnchor="middle" dominantBaseline="middle" fontFamily={data.layout.fontEn} fontSize={data.layout.stationCenterLineFontSize} fontWeight="700" letterSpacing={data.layout.stationCenterLetterSpacing} stroke="none">{centerCodes.lineCode}</text>
          <line x1={center - data.layout.stationCenterDividerWidth / 2} y1={data.layout.lineY} x2={center + data.layout.stationCenterDividerWidth / 2} y2={data.layout.lineY} strokeWidth="0.8" />
          <text x={center} y={data.layout.lineY + 5.5} textAnchor="middle" dominantBaseline="middle" fontFamily={data.layout.fontEn} fontSize={data.layout.stationCenterSequenceFontSize} fontWeight="700" letterSpacing={data.layout.stationCenterLetterSpacing} stroke="none">{centerCodes.stationCode}</text>
        </g>
      )}
      <text x={center} y="91" textAnchor="middle" fill={textColor} fontFamily={data.layout.fontZh} fontSize={zhSize} fontWeight="700" letterSpacing={data.layout.stationZhLetterSpacing}>{station.nameZh}</text>
      <text x={center} textAnchor="middle" fill={textColor} fontFamily={data.layout.fontEn} fontSize={english.size} fontWeight="500" letterSpacing={data.layout.stationEnLetterSpacing}>
        {english.lines.map((lineText, index) => <tspan key={`${lineText}-${index}`} x={center} y={firstEnglishY + index * (english.size + 1.5)}>{lineText}</tspan>)}
      </text>
    </g>
  );
}

export function StationPreviewSvg({
  data,
  line,
  station,
  direction,
  transparent,
}: {
  data: TransitData;
  line: TransitLine;
  station: Station;
  direction: Direction;
  transparent: boolean;
}) {
  if (data.activeStyleTemplate === "loop") {
    return <LoopStationPreviewSvg data={data} line={line} station={station} direction={direction} transparent={transparent} />;
  }
  if (data.activeStyleTemplate === "scenic") {
    return <ScenicStationPreviewSvg data={data} line={line} station={station} direction={direction} transparent={transparent} />;
  }
  if (data.activeStyleTemplate === "pulse") {
    return <PulseStationPreviewSvg data={data} line={line} station={station} direction={direction} transparent={transparent} />;
  }
  const size = data.layout.tileSize;
  return (
    <svg
      className="settings-station-preview"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${station.nameZh}实时设置预览`}
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
    >
      {!transparent && <rect width={size} height={size} fill={data.layout.background} />}
      <StationTile data={data} line={line} station={station} index={1} count={3} state="current" direction={direction} xOverride={0} />
    </svg>
  );
}

export function TextCardPreviewSvg({
  data,
  line,
  station,
  kind,
  transparent,
  onLayoutChange,
}: {
  data: TransitData;
  line: TransitLine;
  station: Station;
  kind: "current" | "next";
  transparent: boolean;
  onLayoutChange?: (patch: Partial<LayoutConfig>) => void;
}) {
  if (data.activeStyleTemplate === "loop") {
    return <LoopTextCardPreviewSvg data={data} line={line} station={station} kind={kind} transparent={transparent} />;
  }
  if (data.activeStyleTemplate === "scenic") {
    return <ScenicTextCardPreviewSvg data={data} line={line} station={station} kind={kind} transparent={transparent} />;
  }
  if (data.activeStyleTemplate === "pulse") {
    return <PulseTextCardPreviewSvg data={data} line={line} station={station} kind={kind} transparent={transparent} onLayoutChange={onLayoutChange} />;
  }
  const size = data.layout.tileSize;
  const stationSize = singleLineFontSize(station.nameZh, data.layout.infoStationFontSize, 110, data.layout.infoStationLetterSpacing);
  const current = kind === "current";
  const accentX = current ? data.layout.currentAccentX : data.layout.nextAccentX;
  const accentY = current ? data.layout.currentAccentY : data.layout.nextAccentY;
  const accentWidth = current ? data.layout.currentAccentWidth : data.layout.nextAccentWidth;
  const accentHeight = current ? data.layout.currentAccentHeight : data.layout.nextAccentHeight;
  const labelX = current ? data.layout.currentLabelX : data.layout.nextLabelX;
  const labelY = current ? data.layout.currentLabelY : data.layout.nextLabelY;
  const stationX = current ? data.layout.currentStationX : data.layout.nextStationX;
  const stationY = current ? data.layout.currentStationY : data.layout.nextStationY;
  const bindDrag = useLayoutDrag(onLayoutChange);
  return (
    <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${kind === "current" ? "本站" : "下一站"}矢量预览`} shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      {!transparent && <rect width={size} height={size} fill={data.layout.background} />}
      <rect
        x={accentX}
        y={accentY}
        width={accentWidth}
        height={accentHeight}
        fill={line.currentColor}
        {...bindDrag(current ? "currentAccentX" : "nextAccentX", current ? "currentAccentY" : "nextAccentY", accentX, accentY)}
      />
      <text
        x={labelX}
        y={labelY}
        fill={line.textColor}
        fontFamily={data.layout.fontZh}
        fontSize={data.layout.infoLabelFontSize}
        letterSpacing={data.layout.infoLabelLetterSpacing}
        fontWeight="700"
        {...bindDrag(current ? "currentLabelX" : "nextLabelX", current ? "currentLabelY" : "nextLabelY", labelX, labelY)}
      >
        {kind === "current" ? "本站:" : "下一站:"}
      </text>
      <text
        x={stationX}
        y={stationY}
        fill={line.textColor}
        fontFamily={data.layout.fontZh}
        fontSize={stationSize}
        letterSpacing={data.layout.infoStationLetterSpacing}
        fontWeight="700"
        {...bindDrag(current ? "currentStationX" : "nextStationX", current ? "currentStationY" : "nextStationY", stationX, stationY)}
      >{station.nameZh}</text>
    </svg>
  );
}

export function DirectionPreviewSvg({
  data,
  line,
  station,
  side,
  direction,
  transparent,
  onLayoutChange,
}: {
  data: TransitData;
  line: TransitLine;
  station?: Station;
  side: "left" | "right";
  direction?: Direction;
  transparent: boolean;
  onLayoutChange?: (patch: Partial<LayoutConfig>) => void;
}) {
  if (data.activeStyleTemplate === "loop") {
    return <LoopDirectionPreviewSvg data={data} line={line} direction={direction || (side === "right" ? "forward" : "reverse")} transparent={transparent} />;
  }
  if (data.activeStyleTemplate === "scenic") {
    return <ScenicDirectionPreviewSvg data={data} line={line} station={station} side={side} transparent={transparent} onLayoutChange={onLayoutChange} />;
  }
  if (data.activeStyleTemplate === "pulse") {
    return <PulseDirectionPreviewSvg data={data} line={line} station={station} side={side} transparent={transparent} onLayoutChange={onLayoutChange} />;
  }
  const size = data.layout.tileSize;
  return (
    <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="运行方向矢量预览" shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      {!transparent && <rect width={size} height={size} fill={data.layout.background} />}
      <DirectionTile x={0} line={line} station={station} side={side} layout={data.layout} onLayoutChange={onLayoutChange} />
    </svg>
  );
}

export function LineBadgePreviewSvg({
  data,
  line,
  transparent,
  onLayoutChange,
}: {
  data: TransitData;
  line: TransitLine;
  transparent: boolean;
  onLayoutChange?: (patch: Partial<LayoutConfig>) => void;
}) {
  if (data.activeStyleTemplate === "loop") {
    return <LoopLineBadgePreviewSvg data={data} line={line} transparent={transparent} />;
  }
  if (data.activeStyleTemplate === "scenic") {
    return <ScenicLineBadgePreviewSvg data={data} line={line} transparent={transparent} />;
  }
  if (data.activeStyleTemplate === "pulse") {
    return <PulseLineBadgePreviewSvg data={data} line={line} transparent={transparent} onLayoutChange={onLayoutChange} />;
  }
  const size = data.layout.tileSize;
  const badgeTop = data.layout.lineBadgeY;
  const badgeLeft = data.layout.lineBadgeX - data.layout.lineBadgeWidth / 2;
  const description = line.description || line.nameZh;
  const descriptionSize = singleLineFontSize(description, data.layout.lineBadgeDescriptionFontSize, 110, data.layout.lineBadgeDescriptionLetterSpacing);
  const bindDrag = useLayoutDrag(onLayoutChange);
  return (
    <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="线路标识矢量预览" shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      {!transparent && <rect width={size} height={size} fill={data.layout.background} />}
      <rect x={badgeLeft} y={badgeTop} width={data.layout.lineBadgeWidth} height={data.layout.lineBadgeHeight} rx={data.layout.lineBadgeRadius} fill={line.lineColor} {...bindDrag("lineBadgeX", "lineBadgeY", data.layout.lineBadgeX, data.layout.lineBadgeY)} />
      <text x={data.layout.lineBadgeNumberX} y={data.layout.lineBadgeNumberY} textAnchor="middle" fill="#FFFFFF" fontFamily={data.layout.fontZh} fontSize={data.layout.lineBadgeNumberFontSize} fontWeight="700" letterSpacing={data.layout.lineBadgeNumberLetterSpacing} {...bindDrag("lineBadgeNumberX", "lineBadgeNumberY", data.layout.lineBadgeNumberX, data.layout.lineBadgeNumberY)}>{line.number}号线</text>
      <text x={data.layout.lineBadgeEnglishX} y={data.layout.lineBadgeEnglishY} textAnchor="middle" fill="#FFFFFF" fontFamily={data.layout.fontEn} fontSize={data.layout.lineBadgeEnglishFontSize} fontWeight="600" letterSpacing={data.layout.lineBadgeEnglishLetterSpacing} {...bindDrag("lineBadgeEnglishX", "lineBadgeEnglishY", data.layout.lineBadgeEnglishX, data.layout.lineBadgeEnglishY)}>{line.nameEn}</text>
      <text x={data.layout.lineBadgeDescriptionX} y={data.layout.lineBadgeDescriptionY} textAnchor="middle" fill={line.textColor} fontFamily={data.layout.fontZh} fontSize={descriptionSize} fontWeight="700" letterSpacing={data.layout.lineBadgeDescriptionLetterSpacing} {...bindDrag("lineBadgeDescriptionX", "lineBadgeDescriptionY", data.layout.lineBadgeDescriptionX, data.layout.lineBadgeDescriptionY)}>{description}</text>
    </svg>
  );
}

export default function RoutePreviewSvg({
  data,
  line,
  currentIndex,
  direction,
  platformType = "island",
  transparent,
  onDoubleClick,
}: Props) {
  if (data.activeStyleTemplate === "loop") {
    return <LoopRoutePreviewSvg data={data} line={line} currentIndex={currentIndex} direction={direction} platformType={platformType} transparent={transparent} onDoubleClick={onDoubleClick} />;
  }
  if (data.activeStyleTemplate === "scenic") {
    return <ScenicRoutePreviewSvg data={data} line={line} currentIndex={currentIndex} direction={direction} platformType={platformType} transparent={transparent} onDoubleClick={onDoubleClick} />;
  }
  if (data.activeStyleTemplate === "pulse") {
    return <PulseRoutePreviewSvg data={data} line={line} currentIndex={currentIndex} direction={direction} platformType={platformType} transparent={transparent} onDoubleClick={onDoubleClick} />;
  }
  const stations = stationsForLine(data, line.id);
  const displayStations = displayStationsForPlatform(stations, platformType) as Array<{ station: Station; logicalIndex: number; displayIndex: number }>;
  const visualDirection = visualDirectionFor(direction, platformType);
  const size = data.layout.tileSize;
  const width = (stations.length + 2) * size;
  return (
    <svg
      className="vector-preview"
      viewBox={`0 0 ${width} ${size}`}
      width={width}
      height={size}
      role="img"
      aria-label={`${line.nameZh}线路预览`}
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
      onDoubleClick={onDoubleClick}
    >
      {!transparent && <rect width={width} height={size} fill={data.layout.background} />}
      <DirectionTile x={0} line={line} station={displayStations[0]?.station} side="left" layout={data.layout} />
      {displayStations.map(({ station, logicalIndex, displayIndex }) => (
        <StationTile key={station.id} data={data} line={line} station={station} index={displayIndex} count={stations.length} state={stateForStation(logicalIndex, currentIndex, direction)} direction={visualDirection} />
      ))}
      <DirectionTile x={(stations.length + 1) * size} line={line} station={displayStations[displayStations.length - 1]?.station} side="right" layout={data.layout} />
    </svg>
  );
}
