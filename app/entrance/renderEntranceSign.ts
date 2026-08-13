import { Station, TransitData, TransitLine } from "../transit/types";

export const ENTRANCE_SIGN_WIDTH = 640;
export const ENTRANCE_SIGN_HEIGHT = 128;
export const ENTRANCE_TILE_SIZE = 128;
export const ENTRANCE_IMAGE_POLYGON = "192,0 512,0 448,128 128,128";

export interface EntranceSignOptions {
  styleId?: "classic" | "pulse";
  data: TransitData;
  line: TransitLine;
  station: Station;
  nameZh: string;
  nameEn: string;
  exitInfo: string;
  backgroundMode: "image" | "solid";
  backgroundUrl: string;
  backgroundColor: string;
  backgroundScale: number;
  backgroundPositionX: number;
  backgroundPositionY: number;
  backgroundBrightness: number;
  imageOverlayOpacity: number;
  textColor: string;
  zhFontSize: number;
  zhLetterSpacing: number;
  zhOffsetX: number;
  zhOffsetY: number;
  enFontSize: number;
  enLetterSpacing: number;
  enOffsetX: number;
  enOffsetY: number;
  exitFontSize: number;
  exitLetterSpacing: number;
  exitInfoX: number;
  exitInfoY: number;
  badgeX: number;
  badgeWidth: number;
  badgeHeight: number;
  badgeGap: number;
  badgeVerticalOffset: number;
  badgeDividerWidth: number;
  badgeFontSize: number;
  badgeLetterSpacing: number;
  showIcon: boolean;
  iconUrl: string | null;
  iconSizeRatio?: number;
  iconBorder?: "none" | "rounded" | "circle";
  iconBorderWidth?: number;
  iconBorderSizeRatio?: number;
  scale?: number;
}

export interface EntranceBackgroundPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function entranceBackgroundPlacement(
  imageAspect: number,
  zoom: number,
  positionX: number,
  positionY: number,
): EntranceBackgroundPlacement {
  const panelX = 128;
  const panelWidth = 384;
  const panelHeight = 128;
  const panelAspect = panelWidth / panelHeight;
  const safeAspect = Number.isFinite(imageAspect) && imageAspect > 0 ? imageAspect : 16 / 9;
  let width = safeAspect >= panelAspect ? panelHeight * safeAspect : panelWidth;
  let height = safeAspect >= panelAspect ? panelHeight : panelWidth / safeAspect;
  const safeZoom = Math.max(1, zoom);
  width *= safeZoom;
  height *= safeZoom;
  const x = panelX - (width - panelWidth) * Math.min(100, Math.max(0, positionX)) / 100;
  const y = -(height - panelHeight) * Math.min(100, Math.max(0, positionY)) / 100;
  return { x, y, width, height };
}

export function entranceSignLines(data: TransitData, _line: TransitLine, station: Station): TransitLine[] {
  const stationRows = data.stations.filter((candidate) => candidate.nameZh === station.nameZh);
  const ids = new Set<string>();

  const addLine = (lineId: string) => {
    if (lineId === "R1") {
      const componentIds = stationRows
        .filter((candidate) => candidate.lineId === "R1")
        .flatMap((candidate) => candidate.throughLineIds);
      if (componentIds.length) {
        componentIds.forEach((componentId) => ids.add(componentId));
        return;
      }
    }
    ids.add(lineId);
  };

  stationRows.forEach((stationRow) => {
    addLine(stationRow.lineId);
    stationRow.throughLineIds.forEach(addLine);
    data.transfers
      .filter((transfer) => transfer.stationId === stationRow.id && !transfer.hidden)
      .forEach((transfer) => addLine(transfer.targetLineId));
  });

  // 出入口标识对同一站的每个出口都一致，因此只按线路表的固定顺序排列。
  return data.lines.filter((candidate) => ids.has(candidate.id));
}

export interface EntranceBadgeLayout {
  gap: number;
  badgeHeight: number;
  startY: number;
}

export function entranceBadgeLayout(
  count: number,
  requestedHeight = 42,
  requestedGap = 4,
  verticalOffset = 0,
): EntranceBadgeLayout {
  const safeCount = Math.max(0, Math.floor(count));
  if (!safeCount) return { gap: 0, badgeHeight: 0, startY: ENTRANCE_SIGN_HEIGHT / 2 };
  const verticalPadding = 8;
  const availableHeight = ENTRANCE_SIGN_HEIGHT - verticalPadding * 2;
  const maximumGap = safeCount === 1 ? 0 : Math.max(0, (availableHeight - safeCount * 8) / (safeCount - 1));
  const gap = safeCount === 1 ? 0 : Math.min(Math.max(0, requestedGap), maximumGap);
  const maximumHeight = Math.max(1, (availableHeight - gap * (safeCount - 1)) / safeCount);
  const badgeHeight = Math.min(Math.max(8, requestedHeight), maximumHeight);
  const totalHeight = badgeHeight * safeCount + gap * (safeCount - 1);
  return { gap, badgeHeight, startY: (ENTRANCE_SIGN_HEIGHT - totalHeight) / 2 + verticalOffset };
}

export function entranceLineLabel(line: TransitLine) {
  return `${line.kind === "tram" ? "Tram" : "Line"} ${line.number}`;
}

export function contrastTextColor(color: string) {
  const normalized = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return "#FFFFFF";
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return red * .299 + green * .587 + blue * .114 > 168 ? "#20272B" : "#FFFFFF";
}

export function fittedStationFontSize(text: string, desired: number, width: number, english = false, letterSpacing = 0) {
  const characters = [...text];
  const estimated = characters.reduce((sum, character) => sum + (english ? (/\s/.test(character) ? .3 : .58) : 1), 0);
  const availableWidth = width - Math.max(0, characters.length - 1) * letterSpacing;
  return Math.max(8, Math.min(desired, Math.max(1, availableWidth) / Math.max(estimated, 1)));
}

type SpacedCanvasContext = CanvasRenderingContext2D & { letterSpacing: string };

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: number) {
  (ctx as SpacedCanvasContext).letterSpacing = `${value}px`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("背景图片读取失败"));
    image.src = source;
  });
}

function loadIcon(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图标加载失败"));
    image.src = source;
  });
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

function pathImagePanel(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.moveTo(192, 0);
  ctx.lineTo(512, 0);
  ctx.lineTo(448, 128);
  ctx.lineTo(128, 128);
  ctx.closePath();
}

function drawLineBadges(ctx: CanvasRenderingContext2D, lines: TransitLine[], options: EntranceSignOptions) {
  const { gap, badgeHeight, startY } = entranceBadgeLayout(
    lines.length,
    options.badgeHeight,
    options.badgeGap,
    options.badgeVerticalOffset,
  );
  lines.forEach((line, index) => {
    const y = startY + index * (badgeHeight + gap);
    ctx.fillStyle = line.lineColor;
    if (options.styleId === "pulse") {
      ctx.beginPath();
      ctx.roundRect(options.badgeX, y, options.badgeWidth, badgeHeight, badgeHeight / 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.beginPath();
      ctx.arc(options.badgeX + 10, y + badgeHeight / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(options.badgeX, y, options.badgeWidth, badgeHeight);
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.fillRect(options.badgeX + options.badgeWidth, y, options.badgeDividerWidth, badgeHeight);
    }
    ctx.fillStyle = contrastTextColor(line.lineColor);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const label = entranceLineLabel(line);
    const labelSize = fittedStationFontSize(label, Math.min(options.badgeFontSize, badgeHeight * .62), Math.max(24, options.badgeWidth - 12), true, options.badgeLetterSpacing);
    ctx.font = `800 ${labelSize}px Arial, sans-serif`;
    setLetterSpacing(ctx, options.badgeLetterSpacing);
    ctx.fillText(label, options.badgeX + options.badgeWidth - (options.styleId === "pulse" ? 9 : 4), y + badgeHeight / 2 + 1);
  });
}

export async function renderEntranceSignCanvas(options: EntranceSignOptions): Promise<HTMLCanvasElement> {
  const scale = options.scale || 1;
  const canvas = document.createElement("canvas");
  canvas.width = ENTRANCE_SIGN_WIDTH * scale;
  canvas.height = ENTRANCE_SIGN_HEIGHT * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建图像画布");
  ctx.scale(scale, scale);

  const pulse = options.styleId === "pulse";
  const displayLines = entranceSignLines(options.data, options.line, options.station);
  const accentColor = displayLines[0]?.lineColor || options.line.lineColor;
  ctx.fillStyle = pulse ? "#07131F" : "#2D2D2D";
  ctx.fillRect(0, 0, ENTRANCE_SIGN_WIDTH, ENTRANCE_SIGN_HEIGHT);

  ctx.save();
  pathImagePanel(ctx);
  ctx.clip();
  if (options.backgroundMode === "solid") {
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(128, 0, 384, 128);
  } else {
    try {
      const background = await loadImage(options.backgroundUrl);
      const placement = entranceBackgroundPlacement(
        background.naturalWidth / background.naturalHeight,
        options.backgroundScale,
        options.backgroundPositionX,
        options.backgroundPositionY,
      );
      ctx.filter = `brightness(${options.backgroundBrightness}%)`;
      ctx.drawImage(background, placement.x, placement.y, placement.width, placement.height);
      ctx.filter = "none";
      ctx.fillStyle = pulse
        ? `rgba(7,19,31,${options.imageOverlayOpacity})`
        : `rgba(255,255,255,${options.imageOverlayOpacity})`;
      ctx.fillRect(128, 0, 384, 128);
    } catch {
      ctx.fillStyle = "#F3F5F6";
      ctx.fillRect(128, 0, 384, 128);
      ctx.fillStyle = "#B42318";
      ctx.font = "800 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("背景素材缺失", 320, 62);
    }
  }
  ctx.restore();

  if (pulse) {
    ctx.fillStyle = "rgba(13,34,51,.78)";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillRect(512, 0, 128, 128);
    ctx.fillStyle = accentColor;
    ctx.fillRect(128, 0, 384, 3);
    ctx.fillRect(0, 124, 640, 4);
    ctx.fillRect(512, 18, 3, 92);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(524, 34, 104, 60, 12);
    ctx.stroke();
    ctx.fillStyle = "#8CA7B8";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 8px Arial, sans-serif`;
    setLetterSpacing(ctx, 2);
    ctx.fillText("STATION", 320, 19);
    ctx.fillText("EXIT / 出口", 576, 51);
  }

  drawLineBadges(ctx, displayLines, options);

  // Load icon if needed
  let iconImage: HTMLImageElement | null = null;
  if (options.showIcon && options.iconUrl) {
    try {
      iconImage = await loadIcon(options.iconUrl);
    } catch {
      iconImage = null;
    }
  }

  const showIcon = options.showIcon;
  const sizeRatio = options.iconSizeRatio ?? 0.85;
  const borderStyle = options.iconBorder ?? "none";
  const borderSizeRatio = options.iconBorderSizeRatio ?? 1.2;
  const iconPxSize = showIcon ? options.zhFontSize * sizeRatio : 0;
  const iconGap = showIcon ? options.zhFontSize * 0.15 : 0;
  const hasBorder = showIcon && borderStyle !== "none";
  const borderWidth = hasBorder ? (options.iconBorderWidth ?? 2) : 0;
  const iconBoxSize = hasBorder ? iconPxSize * borderSizeRatio : iconPxSize;
  const textMaxWidth = 292 - iconBoxSize - iconGap;
  const zhSize = fittedStationFontSize(options.nameZh, options.zhFontSize, Math.max(80, textMaxWidth), false, options.zhLetterSpacing);
  const enSize = fittedStationFontSize(options.nameEn, options.enFontSize, 292, true, options.enLetterSpacing);

  if (showIcon) {
    const zhChars = [...options.nameZh].length;
    const zhTextWidth = zhSize * zhChars + Math.max(0, zhChars - 1) * options.zhLetterSpacing;
    const combinedWidth = iconBoxSize + iconGap + zhTextWidth;
    const groupStartX = 320 - combinedWidth / 2;
    const iconBoxX = groupStartX;
    const iconBoxY = 76 - zhSize * 0.35 - iconBoxSize / 2;
    const iconContentX = iconBoxX + (iconBoxSize - iconPxSize) / 2;
    const iconContentY = iconBoxY + (iconBoxSize - iconPxSize) / 2;
    const textX = groupStartX + iconBoxSize + iconGap;

    if (hasBorder) {
      // Draw border stroke only (no fill — transparent center)
      ctx.save();
      ctx.beginPath();
      if (borderStyle === "circle") {
        ctx.arc(iconBoxX + iconBoxSize / 2, iconBoxY + iconBoxSize / 2, iconBoxSize / 2 - borderWidth / 2, 0, Math.PI * 2);
      } else {
        const r = (iconBoxSize - borderWidth) * 0.2;
        ctx.roundRect(iconBoxX + borderWidth / 2, iconBoxY + borderWidth / 2, iconBoxSize - borderWidth, iconBoxSize - borderWidth, r);
      }
      ctx.lineWidth = borderWidth;
      ctx.strokeStyle = options.textColor;
      ctx.stroke();
      ctx.restore();

      // Clip icon to border inner shape and draw
      ctx.save();
      ctx.beginPath();
      if (borderStyle === "circle") {
        ctx.arc(iconBoxX + iconBoxSize / 2, iconBoxY + iconBoxSize / 2, Math.max(0, iconBoxSize / 2 - borderWidth), 0, Math.PI * 2);
      } else {
        const r = Math.max(0, (iconBoxSize - borderWidth * 2) * 0.2);
        ctx.roundRect(iconBoxX + borderWidth, iconBoxY + borderWidth, Math.max(0, iconBoxSize - borderWidth * 2), Math.max(0, iconBoxSize - borderWidth * 2), r);
      }
      ctx.clip();
      if (iconImage) drawTintedIcon(ctx, iconImage, iconContentX, iconContentY, iconPxSize, options.textColor);
      ctx.restore();
    } else {
      if (iconImage) {
        drawTintedIcon(ctx, iconImage, iconContentX, iconContentY, iconPxSize, options.textColor);
      } else {
        ctx.save();
        ctx.strokeStyle = "#B42318";
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(iconBoxX, iconBoxY, iconBoxSize, iconBoxSize);
        ctx.setLineDash([]);
        ctx.fillStyle = "#B42318";
        ctx.font = `800 ${Math.max(8, iconBoxSize * .6)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", iconBoxX + iconBoxSize / 2, iconBoxY + iconBoxSize / 2);
        ctx.restore();
      }
    }

    if (!iconImage && hasBorder) {
      ctx.save();
      ctx.fillStyle = "#B42318";
      ctx.font = `800 ${Math.max(8, iconBoxSize * .6)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", iconBoxX + iconBoxSize / 2, iconBoxY + iconBoxSize / 2);
      ctx.restore();
    }

    ctx.fillStyle = options.textColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `800 ${zhSize}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
    setLetterSpacing(ctx, options.zhLetterSpacing);
    ctx.fillText(options.nameZh, textX + options.zhOffsetX, 76 + options.zhOffsetY);
  } else {
    ctx.fillStyle = options.textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `800 ${zhSize}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
    setLetterSpacing(ctx, options.zhLetterSpacing);
    ctx.fillText(options.nameZh, 320 + options.zhOffsetX, 76 + options.zhOffsetY);
  }

  // Draw English station name
  ctx.fillStyle = options.textColor;
  ctx.textAlign = "center";
  ctx.font = `600 ${enSize}px Arial, "Helvetica Neue", sans-serif`;
  setLetterSpacing(ctx, options.enLetterSpacing);
  ctx.fillText(options.nameEn, 320 + options.enOffsetX, 99 + options.enOffsetY);

  const exitSize = fittedStationFontSize(options.exitInfo, options.exitFontSize, 116, true, options.exitLetterSpacing);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 ${exitSize}px "Microsoft YaHei", Arial, sans-serif`;
  setLetterSpacing(ctx, options.exitLetterSpacing);
  ctx.fillText(options.exitInfo, options.exitInfoX, options.exitInfoY);
  return canvas;
}

export function sliceEntranceSignCanvas(source: HTMLCanvasElement, tileIndex: number, scale = 1) {
  const tile = document.createElement("canvas");
  tile.width = ENTRANCE_TILE_SIZE * scale;
  tile.height = ENTRANCE_TILE_SIZE * scale;
  const ctx = tile.getContext("2d");
  if (!ctx) throw new Error("无法创建切片画布");
  ctx.drawImage(
    source,
    tileIndex * ENTRANCE_TILE_SIZE * scale,
    0,
    ENTRANCE_TILE_SIZE * scale,
    ENTRANCE_TILE_SIZE * scale,
    0,
    0,
    ENTRANCE_TILE_SIZE * scale,
    ENTRANCE_TILE_SIZE * scale,
  );
  return tile;
}
