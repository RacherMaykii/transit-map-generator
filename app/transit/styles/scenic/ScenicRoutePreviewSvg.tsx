"use client";

import { useId } from "react";
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
  stationCodeParts,
  stationsForLine,
} from "../../types";
import { scenicIconUrl } from "./scenic-render";
import { displayStationsForPlatform, visualDirectionFor } from "../../route-orientation.mjs";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let normalized = hex.trim().replace(/^#/, "");
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16) || 0;
  const g = Number.parseInt(normalized.slice(2, 4), 16) || 0;
  const b = Number.parseInt(normalized.slice(4, 6), 16) || 0;
  return { r: r / 255, g: g / 255, b: b / 255 };
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

function englishTextLayout(name: string, layout: LayoutConfig, maxWidth: number) {
  return fitEnglishTextLayout(name, layout.stationEnFontSize, layout.stationEnMinFontSize, maxWidth, (text, size) => (
    estimatedTextWidth(text, size, layout.stationEnLetterSpacing)
  ));
}

function segmentColor(line: TransitLine, state: "passed" | "upcoming") {
  return state === "passed" ? line.passedColor : line.lineColor;
}

function stationSegmentStates(state: StationState, direction: Direction): { left: "passed" | "upcoming"; right: "passed" | "upcoming" } {
  if (state === "passed") return { left: "passed", right: "passed" };
  if (state === "upcoming") return { left: "upcoming", right: "upcoming" };
  return direction === "forward" ? { left: "passed", right: "upcoming" } : { left: "upcoming", right: "passed" };
}

function transferArrowPath(layout: LayoutConfig, x: number, baseY: number) {
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

function MergedMetroTransfer({
  lines,
  colors,
  muted,
  layout,
  x,
  availableWidth,
  baseY,
}: {
  lines: TransitLine[];
  colors: string[];
  muted: boolean;
  layout: LayoutConfig;
  x: number;
  availableWidth: number;
  baseY: number;
}) {
  const gradientId = `merged-transfer-${useId().replaceAll(":", "")}`;
  const inks = colors.map((color) => (muted ? "#929292" : color));
  const fullWidth = lines.reduce((sum, line) => sum + estimatedTextWidth(`${line.number}号线`, layout.transferFontSize, layout.transferLetterSpacing), 0) + (lines.length - 1) * estimatedTextWidth("/", layout.transferFontSize, layout.transferLetterSpacing);
  const compact = fullWidth > availableWidth;
  const label = compact
    ? `${lines.map((line) => line.number).join("/")}号线`
    : lines.map((line) => `${line.number}号线`).join("/");
  const arrow = transferArrowPath(layout, x, baseY);
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

function Transfers({ data, station, state, baseY }: { data: TransitData; station: Station; state: StationState; baseY: number }) {
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
          baseY={baseY}
        />
      ) : metroEntries.length === 1 ? (() => {
        const { transfer, target } = metroEntries[0];
        const x = center;
        const color = muted ? "#929292" : transfer.colorOverride || target.lineColor;
        const tipY = baseY - data.layout.transferArrowLength;
        return (
          <g key={transfer.id}>
            <text x={x} y={tipY - 3} textAnchor="middle" fill={color} fontFamily={data.layout.fontZh} fontSize={data.layout.transferFontSize} fontWeight="700" letterSpacing={data.layout.transferLetterSpacing}>{target.number}号线</text>
            <path d={transferArrowPath(data.layout, x, baseY)} fill={color} />
          </g>
        );
      })() : null}
      {tramEntries.map(({ transfer, target }, index) => {
        const x = tramStart + index * tramSpacing;
        const color = muted ? "#929292" : transfer.colorOverride || target.lineColor;
        const badgeY = baseY - data.layout.transferArrowLength + data.layout.tramTransferVerticalOffset;
        return (
          <g key={transfer.id}>
            <rect x={x - 27} y={badgeY} width="54" height="18" rx="4" fill={color} />
            <image href="/assets/tram.png" x={x - 22} y={badgeY + 2} width="14" height="14" preserveAspectRatio="xMidYMid meet" />
            <text x={x + 8} y={badgeY + 12.5} textAnchor="middle" fill="#FFFFFF" fontFamily={data.layout.fontEn} fontSize={data.layout.tramTransferFontSize} fontWeight="700" letterSpacing={data.layout.tramTransferLetterSpacing}>Tram {target.number.replace(/^T/i, "")}</text>
          </g>
        );
      })}
    </>
  );
}

function ScenicStationTile({
  data,
  line,
  station,
  index,
  count,
  state,
  direction,
  assetsReady = true,
  xOverride,
}: {
  data: TransitData;
  line: TransitLine;
  station: Station;
  index: number;
  count: number;
  state: StationState;
  direction: Direction;
  assetsReady?: boolean;
  xOverride?: number;
}) {
  const layout = data.layout;
  const size = layout.tileSize;
  const x = xOverride ?? (index + 1) * size;
  const center = size / 2;
  const colorState: StationState = layout.closedStationsUsePassedColor && station.isOpen === false ? "passed" : state;
  const segments = stationSegmentStates(colorState, direction);
  const barY = layout.scenicBarY;
  const barTop = barY - layout.scenicBarHeight / 2;
  const rectW = layout.scenicStationRectWidth;
  const rectH = layout.scenicStationRectHeight;
  const rectR = layout.scenicStationRectRadius;
  const rectLeft = (size - rectW) / 2;
  const rectTop = barY - rectH / 2;
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
  const zhSize = singleLineFontSize(station.nameZh, layout.stationZhFontSize, size - 8, layout.stationZhLetterSpacing);
  const english = englishTextLayout(station.nameEn, layout, size - 8);
  const iconUrl = station.icon ? scenicIconUrl(station.icon) : null;
  const iconSize = layout.scenicStationIconSize;
  const iconTintColor = marker;
  const tintRgb = hexToRgb(iconTintColor);
  const iconFilterId = useId().replaceAll(":", "");
  const iconClipId = useId().replaceAll(":", "");
  const barGradientId = useId().replaceAll(":", "");
  const leftBarColor = segmentColor(line, index === 0 ? segments.right : segments.left);
  const rightBarColor = segmentColor(line, index === count - 1 ? segments.left : segments.right);
  const terminalBarGradient = index === 0 || index === count - 1;
  const terminalBarStart = index === 0 ? line.lineColor : leftBarColor;
  const terminalBarEnd = index === count - 1 ? line.lineColor : rightBarColor;
  const terminalGradientStartX = index === 0 ? 0 : size * 0.7;
  const terminalGradientEndX = index === 0 ? size * 0.3 : size;
  return (
    <g transform={`translate(${x} 0)`}>
      <defs>
        <filter id={iconFilterId}>
          <feColorMatrix type="matrix" values={`0 0 0 0 ${tintRgb.r} 0 0 0 0 ${tintRgb.g} 0 0 0 0 ${tintRgb.b} 0 0 0 1 0`} />
        </filter>
        <clipPath id={iconClipId}>
          <rect x={rectLeft} y={rectTop} width={rectW} height={rectH} rx={rectR} />
        </clipPath>
        {terminalBarGradient && (
          <linearGradient id={barGradientId} x1={terminalGradientStartX} x2={terminalGradientEndX} y1={barY} y2={barY} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={terminalBarStart} />
            <stop offset="100%" stopColor={terminalBarEnd} />
          </linearGradient>
        )}
      </defs>
      {terminalBarGradient ? (
        <rect x="0" y={barTop} width={size} height={layout.scenicBarHeight} fill={`url(#${barGradientId})`} />
      ) : (
        <>
          <rect x="0" y={barTop} width={center} height={layout.scenicBarHeight} fill={leftBarColor} />
          <rect x={center} y={barTop} width={center} height={layout.scenicBarHeight} fill={rightBarColor} />
        </>
      )}
      <Transfers data={data} station={station} state={colorState} baseY={rectTop} />
      <rect x={rectLeft} y={rectTop} width={rectW} height={rectH} rx={rectR} fill={layout.background} stroke={marker} strokeWidth={layout.scenicStationRectBorderWidth} />
      {iconUrl && (
        <image
          href={iconUrl}
          crossOrigin="anonymous"
          x={center - iconSize / 2}
          y={rectTop + (rectH - iconSize) / 2}
          width={iconSize}
          height={iconSize}
          preserveAspectRatio="xMidYMid meet"
          filter={`url(#${iconFilterId})`}
          clipPath={`url(#${iconClipId})`}
        />
      )}
      {assetsReady && station.icon && !iconUrl && (
        <g aria-label={`缺少图标 ${station.icon}`}>
          <rect x={center - iconSize / 2} y={rectTop + (rectH - iconSize) / 2} width={iconSize} height={iconSize} rx="3" fill="#FFF4F2" stroke="#B42318" strokeWidth="1.5" strokeDasharray="3 2" />
          <text x={center} y={rectTop + rectH / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill="#B42318" fontSize={Math.max(8, iconSize * .58)} fontWeight="800">?</text>
        </g>
      )}
      {layout.showStationCenterCodes && (
        <g fill={centerCodeColor} stroke={centerCodeColor}>
          <text x={center} y={barY - 4} textAnchor="middle" dominantBaseline="middle" fontFamily={layout.fontEn} fontSize={layout.stationCenterLineFontSize} fontWeight="700" letterSpacing={layout.stationCenterLetterSpacing} stroke="none">{centerCodes.lineCode}</text>
          <line x1={center - layout.stationCenterDividerWidth / 2} y1={barY} x2={center + layout.stationCenterDividerWidth / 2} y2={barY} strokeWidth="0.8" />
          <text x={center} y={barY + 4.5} textAnchor="middle" dominantBaseline="middle" fontFamily={layout.fontEn} fontSize={layout.stationCenterSequenceFontSize} fontWeight="700" letterSpacing={layout.stationCenterLetterSpacing} stroke="none">{centerCodes.stationCode}</text>
        </g>
      )}
      <text x={center} y={layout.scenicStationZhY} textAnchor="middle" fill={textColor} fontFamily={layout.fontZh} fontSize={zhSize} fontWeight="700" letterSpacing={layout.stationZhLetterSpacing}>{station.nameZh}</text>
      <text x={center} textAnchor="middle" fill={textColor} fontFamily={layout.fontEn} fontSize={english.size} fontWeight="500" letterSpacing={layout.stationEnLetterSpacing}>
        {english.lines.map((lineText, lineIndex) => <tspan key={`${lineText}-${lineIndex}`} x={center} y={layout.scenicStationEnY + lineIndex * (english.size + 1.5)}>{lineText}</tspan>)}
      </text>
    </g>
  );
}

function ScenicDirectionTile({
  x,
  line,
  station,
  side,
  layout,
  onLayoutChange,
}: {
  x: number;
  line: TransitLine;
  station?: Station;
  side: "left" | "right";
  layout: LayoutConfig;
  onLayoutChange?: (patch: Partial<LayoutConfig>) => void;
}) {
  const left = side === "left";
  const baseX = left ? layout.tileSize - layout.directionArrowX : layout.directionArrowX;
  const arrowY = layout.scenicDirectionBarY;
  const labelX = left ? layout.tileSize - layout.directionLabelX : layout.directionLabelX;
  const stationX = left ? layout.tileSize - layout.directionStationX : layout.directionStationX;
  const bindDrag = useLayoutDrag(onLayoutChange);
  const overlap = 5;
  const shaftStart = left ? baseX - overlap : baseX + overlap - layout.directionArrowShaftLength;
  const shaftEnd = left ? baseX - overlap + layout.directionArrowShaftLength : baseX + overlap;
  const tipX = left ? baseX - layout.directionArrowHeadLength : baseX + layout.directionArrowHeadLength;
  const halfHead = layout.directionArrowHeadWidth / 2;
  const barTop = arrowY - layout.scenicDirectionBarHeight / 2;
  return (
    <g transform={`translate(${x} 0)`}>
      <rect y={barTop} width={layout.tileSize} height={layout.scenicDirectionBarHeight} fill={line.lineColor} />
      <g {...bindDrag("directionArrowX", "directionArrowY", layout.directionArrowX, layout.directionArrowY, left ? -1 : 1)}>
        {layout.directionArrowOutlineWidth > 0 && (
          <>
            <line x1={shaftStart} y1={arrowY} x2={shaftEnd} y2={arrowY} stroke={layout.background} strokeWidth={layout.directionArrowThickness + 2 * layout.directionArrowOutlineWidth} strokeLinecap="round" />
            <path d={`M${tipX} ${arrowY} L${baseX} ${arrowY - halfHead} L${baseX} ${arrowY + halfHead} Z`} fill={layout.background} stroke={layout.background} strokeWidth={2 * layout.directionArrowOutlineWidth} strokeLinejoin="round" />
          </>
        )}
        <line x1={shaftStart} y1={arrowY} x2={shaftEnd} y2={arrowY} stroke={line.lineColor} strokeWidth={layout.directionArrowThickness} strokeLinecap="round" />
        <path d={`M${tipX} ${arrowY} L${baseX} ${arrowY - halfHead} L${baseX} ${arrowY + halfHead} Z`} fill={line.lineColor} />
      </g>
      <text x={labelX} y={layout.directionLabelY} fill={line.textColor} textAnchor={left ? "start" : "end"} fontFamily={layout.fontZh} fontSize={layout.directionLabelFontSize} letterSpacing={layout.directionLabelLetterSpacing} fontWeight="700" {...bindDrag("directionLabelX", "directionLabelY", layout.directionLabelX, layout.directionLabelY, left ? -1 : 1)}>运行方向:</text>
      <text x={stationX} y={layout.directionStationY} fill={line.textColor} textAnchor={left ? "start" : "end"} fontFamily={layout.fontZh} fontSize={singleLineFontSize(station?.nameZh || "未设置", layout.directionStationFontSize, 75, layout.directionStationLetterSpacing)} letterSpacing={layout.directionStationLetterSpacing} fontWeight="700" {...bindDrag("directionStationX", "directionStationY", layout.directionStationX, layout.directionStationY, left ? -1 : 1)}>{station?.nameZh || "未设置"}</text>
    </g>
  );
}

function ScenicLineBadgeTile({ x, line, layout }: { x: number; line: TransitLine; layout: LayoutConfig }) {
  const badgeLeft = layout.lineBadgeX - layout.lineBadgeWidth / 2;
  const barY = layout.scenicBarY;
  const barTop = barY - layout.scenicBarHeight / 2;
  return (
    <g transform={`translate(${x} 0)`}>
      <rect y={barTop} width={layout.tileSize} height={layout.scenicBarHeight} fill={line.lineColor} />
      <rect x={badgeLeft} y={layout.lineBadgeY} width={layout.lineBadgeWidth} height={layout.lineBadgeHeight} rx={layout.lineBadgeRadius} fill={line.lineColor} />
      <text x={layout.lineBadgeNumberX} y={layout.lineBadgeNumberY} textAnchor="middle" fill="#FFFFFF" fontFamily={layout.fontZh} fontSize={layout.lineBadgeNumberFontSize} fontWeight="700" letterSpacing={layout.lineBadgeNumberLetterSpacing}>{line.number}号线</text>
      <text x={layout.lineBadgeEnglishX} y={layout.lineBadgeEnglishY} textAnchor="middle" fill="#FFFFFF" fontFamily={layout.fontEn} fontSize={layout.lineBadgeEnglishFontSize} fontWeight="600" letterSpacing={layout.lineBadgeEnglishLetterSpacing}>{line.nameEn}</text>
      <text x={layout.lineBadgeDescriptionX} y={layout.lineBadgeDescriptionY} textAnchor="middle" fill={line.textColor} fontFamily={layout.fontZh} fontSize={layout.lineBadgeDescriptionFontSize} fontWeight="700" letterSpacing={layout.lineBadgeDescriptionLetterSpacing}>{line.description || line.nameZh}</text>
    </g>
  );
}

export function ScenicStationPreviewSvg({ data, line, station, direction, transparent, assetsReady = true }: { data: TransitData; line: TransitLine; station: Station; direction: Direction; transparent: boolean; assetsReady?: boolean }) {
  const size = data.layout.tileSize;
  const previewData = { ...data, layout: { ...data.layout, closedStationsUsePassedColor: false } };
  return (
    <svg className="settings-station-preview" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${station.nameZh}景区样式预览`} shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      {!transparent && <rect width={size} height={size} fill={data.layout.background} />}
      <ScenicStationTile data={previewData} line={line} station={station} index={1} count={3} state="current" direction={direction} assetsReady={assetsReady} xOverride={0} />
    </svg>
  );
}

export function ScenicDirectionPreviewSvg({ data, line, station, side, transparent, onLayoutChange }: { data: TransitData; line: TransitLine; station?: Station; side: "left" | "right"; transparent: boolean; onLayoutChange?: (patch: Partial<LayoutConfig>) => void }) {
  const size = data.layout.tileSize;
  return (
    <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="景区运行方向矢量预览" shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      {!transparent && <rect width={size} height={size} fill={data.layout.background} />}
      <ScenicDirectionTile x={0} line={line} station={station} side={side} layout={data.layout} onLayoutChange={onLayoutChange} />
    </svg>
  );
}

export function ScenicTextCardPreviewSvg({ data, line, station, kind, transparent, assetsReady = true }: { data: TransitData; line: TransitLine; station: Station; kind: "current" | "next"; transparent: boolean; assetsReady?: boolean }) {
  const layout = data.layout;
  const size = layout.tileSize;
  const current = kind === "current";
  const labelY = current ? layout.currentLabelY : layout.nextLabelY;
  const stationY = current ? layout.currentStationY : layout.nextStationY;
  const stationSize = singleLineFontSize(station.nameZh, layout.infoStationFontSize, size - 8, layout.infoStationLetterSpacing);
  const barY = layout.scenicBarY;
  const barTop = barY - layout.scenicBarHeight / 2;
  const rectColor = line.lineColor;
  const rectW = layout.scenicStationRectWidth;
  const rectH = layout.scenicStationRectHeight;
  const rectR = layout.scenicStationRectRadius;
  const rectLeft = (size - rectW) / 2;
  const rectTop = barY - rectH / 2;
  const center = size / 2;
  const iconUrl = station.icon ? scenicIconUrl(station.icon) : null;
  const iconSize = layout.scenicStationIconSize;
  const tintRgb = hexToRgb(rectColor);
  const iconFilterId = useId().replaceAll(":", "");
  const iconClipId = useId().replaceAll(":", "");
  const english = englishTextLayout(station.nameEn, layout, size - 8);
  return (
    <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${current ? "本站" : "下一站"}景区样式预览`} shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      {!transparent && <rect width={size} height={size} fill={layout.background} />}
      <defs>
        <filter id={iconFilterId}>
          <feColorMatrix type="matrix" values={`0 0 0 0 ${tintRgb.r} 0 0 0 0 ${tintRgb.g} 0 0 0 0 ${tintRgb.b} 0 0 0 1 0`} />
        </filter>
        <clipPath id={iconClipId}>
          <rect x={rectLeft} y={rectTop} width={rectW} height={rectH} rx={rectR} />
        </clipPath>
      </defs>
      <rect y={barTop} width={size} height={layout.scenicBarHeight} fill={rectColor} />
      <rect x={rectLeft} y={rectTop} width={rectW} height={rectH} rx={rectR} fill={layout.background} stroke={rectColor} strokeWidth={layout.scenicStationRectBorderWidth} />
      {iconUrl && (
        <image
          href={iconUrl}
          crossOrigin="anonymous"
          x={center - iconSize / 2}
          y={rectTop + (rectH - iconSize) / 2}
          width={iconSize}
          height={iconSize}
          preserveAspectRatio="xMidYMid meet"
          filter={`url(#${iconFilterId})`}
          clipPath={`url(#${iconClipId})`}
        />
      )}
      {assetsReady && station.icon && !iconUrl && (
        <g aria-label={`缺少图标 ${station.icon}`}>
          <rect x={center - iconSize / 2} y={rectTop + (rectH - iconSize) / 2} width={iconSize} height={iconSize} rx="3" fill="#FFF4F2" stroke="#B42318" strokeWidth="1.5" strokeDasharray="3 2" />
          <text x={center} y={rectTop + rectH / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill="#B42318" fontSize={Math.max(8, iconSize * .58)} fontWeight="800">?</text>
        </g>
      )}
      <text x={center} y={labelY} textAnchor="middle" fill={line.textColor} fontFamily={layout.fontZh} fontSize={layout.infoLabelFontSize} letterSpacing={layout.infoLabelLetterSpacing} fontWeight="700">{current ? "本站:" : "下一站:"}</text>
      <text x={center} y={stationY} textAnchor="middle" fill={line.textColor} fontFamily={layout.fontZh} fontSize={stationSize} letterSpacing={layout.infoStationLetterSpacing} fontWeight="700">{station.nameZh}</text>
      <text x={center} textAnchor="middle" fill={line.textColor} fontFamily={layout.fontEn} fontSize={english.size} fontWeight="500" letterSpacing={layout.stationEnLetterSpacing}>
        {english.lines.map((lineText, lineIndex) => <tspan key={`${lineText}-${lineIndex}`} x={center} y={stationY + 14 + lineIndex * (english.size + 1.5)}>{lineText}</tspan>)}
      </text>
    </svg>
  );
}

export function ScenicLineBadgePreviewSvg({ data, line, transparent }: { data: TransitData; line: TransitLine; transparent: boolean }) {
  const size = data.layout.tileSize;
  return (
    <svg className="settings-component-svg" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="景区线路标识矢量预览" shapeRendering="geometricPrecision" textRendering="geometricPrecision">
      {!transparent && <rect width={size} height={size} fill={data.layout.background} />}
      <ScenicLineBadgeTile x={0} line={line} layout={data.layout} />
    </svg>
  );
}

export default function ScenicRoutePreviewSvg({
  data,
  line,
  currentIndex,
  direction,
  platformType = "island",
  transparent,
  assetsReady = true,
  onDoubleClick,
}: {
  data: TransitData;
  line: TransitLine;
  currentIndex: number;
  direction: Direction;
  platformType?: "island" | "side";
  transparent: boolean;
  assetsReady?: boolean;
  onDoubleClick: React.MouseEventHandler<SVGSVGElement>;
}) {
  const stations = stationsForLine(data, line.id);
  const displayStations = displayStationsForPlatform(stations, platformType) as Array<{ station: Station; logicalIndex: number; displayIndex: number }>;
  const visualDirection = visualDirectionFor(direction, platformType);
  const size = data.layout.tileSize;
  const width = (stations.length + 2) * size;
  return (
    <svg className="vector-preview" viewBox={`0 0 ${width} ${size}`} width={width} height={size} role="img" aria-label={`${line.nameZh}景区样式预览`} shapeRendering="geometricPrecision" textRendering="geometricPrecision" onDoubleClick={onDoubleClick}>
      {!transparent && <rect width={width} height={size} fill={data.layout.background} />}
      <ScenicDirectionTile x={0} line={line} station={displayStations[0]?.station} side="left" layout={data.layout} />
      {displayStations.map(({ station, logicalIndex, displayIndex }) => (
        <ScenicStationTile key={station.id} data={data} line={line} station={station} index={displayIndex} count={stations.length} state={stateForStation(logicalIndex, currentIndex, direction)} direction={visualDirection} assetsReady={assetsReady} />
      ))}
      <ScenicDirectionTile x={(stations.length + 1) * size} line={line} station={displayStations[displayStations.length - 1]?.station} side="right" layout={data.layout} />
    </svg>
  );
}
