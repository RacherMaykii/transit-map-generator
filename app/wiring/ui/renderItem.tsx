"use client";

import type {
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  SetStateAction,
} from "react";
import { evaluateFilter } from "../filtering";
import {
  computeGraphicBbox,
  computeLabelBbox,
  computeLabelLocalBox,
  computePlatformBbox,
} from "../labelAvoidance";
import { effectiveLayerOpacity, readableLabelRotation } from "../canvasLogic";
import {
  buildPairedOffsetPathD,
  endpointsForConnection,
  findPairedConnection,
  getConnectionEndpoint,
  portIsOccupied,
  validateConnection,
} from "../connectionLogic";
import { geometryForConnection } from "../connectionEdit";
import {
  DEFAULT_TRACK_COLOR,
  darkenHex,
  effectiveColor,
  sampleSpecAt,
  templatePlatformLineNames,
  twoToneColors,
  type ColorSpec,
  type GradientDef,
} from "../color";
import {
  LABEL_ANCHOR_MAP,
  buildControlPointPathD,
  type AssetRecord,
  type AttachedGraphic,
  type BackgroundImageObject,
  type DiagramModule,
  type FilterState,
  type LabelObject,
  type LayerNode,
  type ModuleConnection,
  type ModuleTemplate,
  type PlatformObject,
  type SourceChange,
  type SourceLine,
  type TemplateTrack,
  type TransferGroup,
  type WiringTool,
} from "../types";
import type { TransitData } from "../../transit/types";
import {
  moduleLabelTextTransform,
  moduleMirrorTransform,
  rotatedRectBounds,
  templateTrackPathD,
  type CanvasRenderItem,
} from "./primitives";
import { SHAPE_META, ShapeGraphic } from "./svgElements";

/** 组件内 `getConnectionEndpoints` wrapper 的返回类型（与 ../connectionEdit 的纯函数一致） */
type ConnectionEndpoints = { from: { x: number; y: number }; to: { x: number; y: number }; fromDir: number; toDir: number } | null;

/** WiringDiagramApp 的 `colorSpecs` useMemo 返回结构 */
type RenderColorSpecs = {
  moduleSpecs: Map<string, ColorSpec>;
  trackColorSpecs: Map<string, string[]>;
  templatePlatformColorSpecs: Map<string, (ColorSpec | undefined)[]>;
  connectionSpecs: Map<string, ColorSpec>;
  platformSpecs: Map<string, ColorSpec>;
  platformLineNames: Map<string, string[]>;
  labelSpecs: Map<string, ColorSpec>;
  gradientDefs: GradientDef[];
};

/**
 * renderItemBounds / renderItemName / moveLabelRelative / moveLabelToEdge / renderCanvasItem
 * 共用的组件作用域上下文。由 WiringDiagramApp 每次渲染时构造一个普通对象字面量传入。
 */
export interface RenderItemContext {
  // ── 数据与状态 ──
  data: TransitData;
  modules: DiagramModule[];
  connections: ModuleConnection[];
  layers: LayerNode[];
  selectedIds: string[];
  assets: AssetRecord[];
  filterState: FilterState;
  activeFilterLineIds: string[];
  currentData: TransitData;
  unresolvedChanges: SourceChange[];
  orderedRenderItems: CanvasRenderItem[];
  labels: LabelObject[];
  platforms: PlatformObject[];
  colorSpecs: RenderColorSpecs;
  showAuxLabels: boolean;
  advancedMode: boolean;
  activeTool: WiringTool;
  connectFrom: { moduleId: string; portId: string } | null;
  suppressedTransferLabelIds: Set<string>;
  editingPlatformModuleId: string | null;
  sourceLines: SourceLine[];

  // ── 派生映射 ──
  templateMap: Map<string, ModuleTemplate>;
  resolvedTemplateMap: Map<string, ModuleTemplate>;

  // ── 组件内辅助回调 ──
  isLayerVisible: (layerId: string) => boolean;
  isLayerLocked: (layerId: string) => boolean;
  isModuleVisible: (mod: DiagramModule) => boolean;
  getTransferGroupBounds: (group: TransferGroup) => { x: number; y: number; w: number; h: number } | null;
  getConnectionEndpoints: (conn: ModuleConnection) => ConnectionEndpoints;
  rebuildConnectionTrackCache: (conn: ModuleConnection) => TemplateTrack[];
  handleConnectionMouseDown: (e: ReactMouseEvent, conn: ModuleConnection) => void;
  handleConnectionDoubleClick: (e: ReactMouseEvent, conn: ModuleConnection) => void;
  handleTrackClick: (e: ReactMouseEvent, conn: ModuleConnection) => void;
  handleControlPointMouseDown: (e: ReactMouseEvent, connId: string, cpId: string) => void;
  handleControlPointHandleMouseDown: (e: ReactMouseEvent, connId: string, cpId: string) => void;
  handleControlPointDoubleClick: (e: ReactMouseEvent, connId: string, cpId: string) => void;
  removeCrossingPoint: (connId: string, index: number) => void;
  handleBgImageMouseDown: (e: ReactMouseEvent, bgImg: BackgroundImageObject) => void;
  updateBgImage: (id: string, patch: Partial<BackgroundImageObject>, operationName?: string) => void;
  handleModuleMouseDown: (e: ReactMouseEvent, mod: DiagramModule) => void;
  handlePortClick: (e: ReactMouseEvent, mod: DiagramModule, portId: string) => void;
  handleLabelMouseDown: (e: ReactMouseEvent, label: LabelObject) => void;
  handleLabelDoubleClick: (e: ReactMouseEvent, label: LabelObject) => void;
  updateLabel: (id: string, patch: Partial<LabelObject>, operationName?: string) => void;
  handlePlatformMouseDown: (e: ReactMouseEvent, platform: PlatformObject) => void;
  handlePlatformResizeMouseDown: (e: ReactMouseEvent, platform: PlatformObject) => void;
  handleGraphicMouseDown: (e: ReactMouseEvent, graphic: AttachedGraphic) => void;
  handleGraphicResizeMouseDown: (e: ReactMouseEvent, graphic: AttachedGraphic) => void;
  updateGraphic: (id: string, patch: Partial<AttachedGraphic>, operationName?: string) => void;
  handleTransferGroupMouseDown: (e: ReactMouseEvent, group: TransferGroup) => void;
  handleTransferGroupDoubleClick: (e: ReactMouseEvent, group: TransferGroup) => void;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setStatus: Dispatch<SetStateAction<string>>;

  // ── 已提取函数之间的互相调用 ──
  renderItemName: (entry: CanvasRenderItem) => string;
  moveLabelRelative: (label: LabelObject, entry: CanvasRenderItem, above: boolean) => void;
}

  export function renderItemBounds(entry: CanvasRenderItem, ctx: RenderItemContext): { x: number; y: number; w: number; h: number } | null {
    if (entry.kind === "label") return computeLabelBbox(entry.item as LabelObject);
    if (entry.kind === "platform") return computePlatformBbox(entry.item as PlatformObject);
    if (entry.kind === "graphic") return computeGraphicBbox(entry.item as AttachedGraphic);
    if (entry.kind === "background") {
      const item = entry.item as BackgroundImageObject;
      return rotatedRectBounds(item.x, item.y, item.naturalWidth * item.scale, item.naturalHeight * item.scale, item.rotation || 0);
    }
    if (entry.kind === "module") {
      const item = entry.item as DiagramModule;
      const template = ctx.resolvedTemplateMap.get(item.id) || ctx.templateMap.get(item.templateId);
      return rotatedRectBounds(item.x, item.y, template?.width || 160, template?.height || 112, item.rotation);
    }
    if (entry.kind === "transfer") return ctx.getTransferGroupBounds(entry.item as TransferGroup);
    const connection = entry.item as ModuleConnection;
    const points = connection.tracks.flatMap((track) => [
      { x: track.x1, y: track.y1 }, { x: track.x2, y: track.y2 },
      ...(typeof track.cx === "number" && typeof track.cy === "number" ? [{ x: track.cx, y: track.cy }] : []),
      ...(typeof track.cx2 === "number" && typeof track.cy2 === "number" ? [{ x: track.cx2, y: track.cy2 }] : []),
    ]);
    if (!points.length) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const pad = 4;
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  }

  export function renderItemName(entry: CanvasRenderItem, ctx: RenderItemContext): string {
    if (entry.kind === "module") return (entry.item as DiagramModule).name;
    if (entry.kind === "label") {
      const label = entry.item as LabelObject;
      return label.numeralType === "track" ? `股道编号 ${label.text}` : label.numeralType === "switch" ? `道岔编号 ${label.text}` : `文字：${label.text}`;
    }
    if (entry.kind === "background") return `背景：${(entry.item as BackgroundImageObject).name}`;
    if (entry.kind === "platform") return "站台";
    if (entry.kind === "connection") return "轨道连接";
    if (entry.kind === "transfer") return `换乘组：${(entry.item as TransferGroup).name}`;
    const graphic = entry.item as AttachedGraphic;
    if (graphic.shapeType) return SHAPE_META[graphic.shapeType]?.label || "图形";
    return `图标：${ctx.assets.find((asset) => asset.id === graphic.assetId)?.name || graphic.id}`;
  }

  export function moveLabelRelative(label: LabelObject, entry: CanvasRenderItem, above: boolean, ctx: RenderItemContext) {
    if (ctx.isLayerLocked(entry.item.layerId)) {
      ctx.setStatus(`「${ctx.renderItemName(entry)}」所在图层已锁定，无法移动文字到该层级`);
      return;
    }
    ctx.updateLabel(label.id, {
      layerId: entry.item.layerId,
      zIndex: entry.item.zIndex + (above ? 0.5 : -0.5),
    }, above ? `将文字置于${ctx.renderItemName(entry)}上方` : `将文字置于${ctx.renderItemName(entry)}下方`);
  }

  export function moveLabelToEdge(label: LabelObject, top: boolean, ctx: RenderItemContext) {
    const candidates = ctx.orderedRenderItems.filter((entry) => entry.item.id !== label.id && ctx.isLayerVisible(entry.item.layerId) && !ctx.isLayerLocked(entry.item.layerId));
    const target = top ? candidates[candidates.length - 1] : candidates[0];
    if (!target) return;
    ctx.moveLabelRelative(label, target, top);
  }

  export function renderCanvasItem(entry: CanvasRenderItem, ctx: RenderItemContext): ReactNode {
    const { item } = entry;
    if (!ctx.isLayerVisible(item.layerId)) return null;
    const layerOpacity = effectiveLayerOpacity(ctx.layers, item.layerId);
    const linkedModule = entry.kind === "module" ? entry.item as DiagramModule
      : entry.kind === "connection" ? ctx.modules.find((module) => module.id === (entry.item as ModuleConnection).fromModuleId)
      : entry.kind === "platform" ? ctx.modules.find((module) => module.id === (entry.item as PlatformObject).moduleId)
      : entry.kind === "graphic" ? ctx.modules.find((module) => module.id === (entry.item as AttachedGraphic).attachedToId)
      : entry.kind === "label" ? ctx.modules.find((module) => module.id === (entry.item as LabelObject).attachedToId)
      : undefined;
    const transfer = entry.kind === "transfer" ? entry.item as TransferGroup : undefined;
    const station = linkedModule?.sourceStationIds.length ? ctx.currentData.stations.find((candidate) => candidate.id === linkedModule.sourceStationIds[0]) : undefined;
    const connectionLineIds = entry.kind === "connection"
      ? Array.from(new Set([
        ...(ctx.modules.find((module) => module.id === (entry.item as ModuleConnection).fromModuleId)?.lineIds || []),
        ...(ctx.modules.find((module) => module.id === (entry.item as ModuleConnection).toModuleId)?.lineIds || []),
      ]))
      : [];
    const entryLineIds = transfer?.lineIds
      || (entry.kind === "connection" ? connectionLineIds : undefined)
      || linkedModule?.lineIds
      || (entry.kind === "platform" && (entry.item as PlatformObject).sourceLineId ? [(entry.item as PlatformObject).sourceLineId!] : []);
    const changeStatus = ctx.unresolvedChanges.find((change) => change.affectedObjectIds.includes(item.id))?.status;
    const filterResult = evaluateFilter({
      objectType: entry.kind,
      lineIds: entryLineIds,
      stationStatus: station ? (!station.isOpen ? "closed" : station.terminalType === "normal" ? "open" : "terminal") : undefined,
      placed: true,
      changeStatus,
      hasDataChanges: Boolean(changeStatus),
      layerId: item.layerId,
      isTransferHint: Boolean(transfer),
      transferLineIds: transfer?.lineIds,
    }, { ...ctx.filterState, lineIds: ctx.activeFilterLineIds });
    if (filterResult === "hide") return null;
    const filterOpacity = filterResult === "dim" ? 0.25 : 1;

    if (entry.kind === "connection") {
      const conn = entry.item as ModuleConnection;
      const fromModule = ctx.modules.find((module) => module.id === conn.fromModuleId);
      if (!fromModule || !ctx.isModuleVisible(fromModule)) return null;
      const isSelected = ctx.selectedIds.includes(conn.id);
      const geometry = geometryForConnection(conn, ctx.connections, ctx.modules, ctx.resolvedTemplateMap);
      const endpoints = geometry || ctx.getConnectionEndpoints(conn);
      const controlPoints = geometry?.controlPoints || conn.controlPoints;
      const hasControls = controlPoints.length > 0 && endpoints !== null;
      const tracks = geometry?.tracks || ctx.rebuildConnectionTrackCache(conn);
      const pairedConnection = findPairedConnection(conn, ctx.connections, ctx.modules, ctx.resolvedTemplateMap);
      const pairedEndpoints = pairedConnection ? endpointsForConnection(pairedConnection, ctx.modules, ctx.resolvedTemplateMap) : undefined;
      const pairedOffsetPath = endpoints && conn.autoCurve !== false && pairedConnection?.autoCurve !== false && pairedEndpoints
        ? buildPairedOffsetPathD(endpoints, pairedEndpoints)
        : null;
      const className = `connection-track ${conn.crossingType === "gap" ? "crossing-gap" : conn.crossingType === "bridge" ? "crossing-bridge" : ""} ${conn.lineStyle === "dashed" ? "line-dashed" : ""} ${isSelected ? "selected" : ""}`;
      const connColorSpec = ctx.colorSpecs.connectionSpecs.get(conn.id);
      const connTrackStyle = connColorSpec ? { "--track-stroke": connColorSpec.css } as CSSProperties : undefined;
      return (
        <g
          key={`connection-${conn.id}`}
          className={`connection-group ${isSelected ? "selected" : ""}`}
          opacity={layerOpacity * filterOpacity}
          onMouseDown={(event) => ctx.handleConnectionMouseDown(event, conn)}
          onDoubleClick={(event) => ctx.handleConnectionDoubleClick(event, conn)}
          style={{ cursor: ctx.isLayerLocked(conn.layerId) ? "default" : "pointer" }}
        >
          {hasControls ? (() => {
            const path = pairedOffsetPath || buildControlPointPathD(endpoints!.from, endpoints!.to, controlPoints, endpoints!.fromDir, endpoints!.toDir);
            return (
              <>
                <path d={path} className={className} fill="none" style={connTrackStyle} onClick={(event) => ctx.handleTrackClick(event, conn)} />
                <path d={path} stroke="transparent" strokeWidth={14} fill="none" onClick={(event) => ctx.handleTrackClick(event, conn)} style={{ cursor: "copy" }} />
              </>
            );
          })() : tracks.map((track, index) => {
            if (conn.crossingType === "bridge") {
              const middleX = (track.x1 + track.x2) / 2;
              const middleY = (track.y1 + track.y2) / 2;
              const deltaX = track.x2 - track.x1;
              const deltaY = track.y2 - track.y1;
              const length = Math.hypot(deltaX, deltaY);
              if (length >= 1) {
                const offset = Math.min(length * 0.15, 12);
                const controlX = middleX - (deltaY / length) * offset;
                const controlY = middleY + (deltaX / length) * offset;
                return (
                  <path
                    key={index}
                    d={`M${track.x1},${track.y1} Q${controlX},${controlY} ${track.x2},${track.y2}`}
                    className={className}
                    fill="none"
                    style={connTrackStyle}
                    onClick={(event) => ctx.handleTrackClick(event, conn)}
                  />
                );
              }
            }
            return (
              <line
                key={index}
                x1={track.x1}
                y1={track.y1}
                x2={track.x2}
                y2={track.y2}
                className={className}
                style={connTrackStyle}
                onClick={(event) => ctx.handleTrackClick(event, conn)}
              />
            );
          })}
          {isSelected && hasControls && controlPoints.map((point) => {
            const isImplicit = !!point.implicit;
            return (
            <g key={point.id} className={`track-control-handle ${isImplicit ? "implicit" : ""}`}>
              {point.curved && (
                <>
                  <line x1={point.x} y1={point.y} x2={point.x + point.handleX} y2={point.y + point.handleY} className={`track-handle-line ${isImplicit ? "implicit" : ""}`} />
                  {!isImplicit && (
                  <circle
                    cx={point.x + point.handleX}
                    cy={point.y + point.handleY}
                    r={4}
                    className="track-handle-dot"
                    onMouseDown={(event) => ctx.handleControlPointHandleMouseDown(event, conn.id, point.id)}
                  />
                  )}
                </>
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={isImplicit ? 4 : 5}
                className={`track-node ${point.curved ? "curved" : ""} ${isImplicit ? "implicit" : ""}`}
                onMouseDown={(event) => !isImplicit ? ctx.handleControlPointMouseDown(event, conn.id, point.id) : undefined}
                onDoubleClick={(event) => !isImplicit ? ctx.handleControlPointDoubleClick(event, conn.id, point.id) : undefined}
                style={isImplicit ? { cursor: "default", opacity: 0.6 } : undefined}
              />
            </g>
          )})}
          {isSelected && conn.crossingPoints.map((point, index) => (
            <circle
              key={`crossing-${index}`}
              cx={point.x}
              cy={point.y}
              r={4}
              className="crossing-point"
              onMouseDown={(event) => { event.stopPropagation(); ctx.removeCrossingPoint(conn.id, index); }}
            />
          ))}
          {isSelected && conn.crossingType !== "plain" && tracks.length > 0 && (
            <text
              className="crossing-label"
              x={(tracks[0].x1 + tracks[0].x2) / 2}
              y={(tracks[0].y1 + tracks[0].y2) / 2 - 8}
              textAnchor="middle"
            >
              {conn.crossingType === "gap" ? "断" : "桥"}
            </text>
          )}
        </g>
      );
    }

    if (entry.kind === "background") {
      const image = entry.item as BackgroundImageObject;
      if (!image.visible) return null;
      const width = image.naturalWidth * image.scale;
      const height = image.naturalHeight * image.scale;
      const isSelected = ctx.selectedIds.includes(image.id);
      return <g key={`background-${image.id}`} opacity={layerOpacity * filterOpacity} transform={`rotate(${image.rotation || 0} ${image.x + width / 2} ${image.y + height / 2})`}>
        {image.previewSrc || image.src ? (
          <image href={image.previewSrc || image.src} data-export-src={image.src} x={image.x} y={image.y} width={width} height={height} opacity={image.opacity} className={`bg-image ${isSelected ? "selected" : ""} ${image.locked || ctx.isLayerLocked(image.layerId) ? "locked" : ""}`} onMouseDown={(event) => ctx.handleBgImageMouseDown(event, image)} preserveAspectRatio="xMidYMid meet" />
        ) : (
          <g onMouseDown={(event) => ctx.handleBgImageMouseDown(event, image)}>
            <rect x={image.x} y={image.y} width={width} height={height} fill="#f3f5f6" stroke="#b42318" strokeWidth={2} strokeDasharray="8 5" opacity={image.opacity} />
            <text x={image.x + width / 2} y={image.y + height / 2 - 4} textAnchor="middle" fill="#b42318" fontSize={16} fontWeight={800}>背景素材缺失</text>
            <text x={image.x + width / 2} y={image.y + height / 2 + 17} textAnchor="middle" fill="#667580" fontSize={11}>{image.name}</text>
          </g>
        )}
        {isSelected && <rect className="bg-image-selection" x={image.x - 2} y={image.y - 2} width={width + 4} height={height + 4} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />}
        {image.locked && (
          <g
            className="bg-image-unlock"
            transform={`translate(${image.x + width / 2}, ${image.y - 14})`}
            onMouseDown={(event) => {
              event.stopPropagation();
              ctx.setSelectedIds([image.id]);
              ctx.updateBgImage(image.id, { locked: false }, "解锁背景图");
            }}
          >
            <circle className="bg-image-unlock-ring" r={16} />
            <text className="bg-image-unlock-icon" y={6} textAnchor="middle" fontSize={16}>🔓</text>
          </g>
        )}
      </g>;
    }

    if (entry.kind === "module") {
      const mod = entry.item as DiagramModule;
      const baseTemplate = ctx.templateMap.get(mod.templateId);
      if (!baseTemplate || !ctx.isModuleVisible(mod)) return null;
      const template = ctx.resolvedTemplateMap.get(mod.id) || baseTemplate;
      const isSelected = ctx.selectedIds.includes(mod.id);
      const attachedLabels = ctx.labels.filter((candidate) => candidate.attachedToId === mod.id && candidate.visible !== false);
      const hasZhStationLabel = attachedLabels.some((candidate) => candidate.language === "zh" || (!candidate.language && /[\u3400-\u9fff]/.test(candidate.text)));
      const hasEnStationLabel = attachedLabels.some((candidate) => candidate.language === "en" || (!candidate.language && !/[\u3400-\u9fff]/.test(candidate.text) && candidate.text !== "站名"));
      const showModuleAuxLabels = ctx.showAuxLabels && mod.showAuxLabels !== false;
      const sourceDeleted = ctx.unresolvedChanges.some((change) => change.entityType === "station" && change.changeType === "removed" && change.affectedObjectIds.includes(mod.id) && change.status === "unresolved");
      const modColorSpec = ctx.colorSpecs.moduleSpecs.get(mod.id);
      const modTrackStyle = modColorSpec ? { "--track-stroke": modColorSpec.css } as CSSProperties : undefined;
      const moduleTrackColors = ctx.colorSpecs.trackColorSpecs.get(mod.id);
      const moduleTemplatePlatformSpecs = ctx.colorSpecs.templatePlatformColorSpecs.get(mod.id);
      return <g key={`module-${mod.id}`} transform={`translate(${mod.x},${mod.y}) rotate(${mod.rotation} ${template.width / 2} ${template.height / 2})${moduleMirrorTransform(template.width, template.height, mod.mirrorX, mod.mirrorY)}`} className={`module-group ${isSelected ? "selected" : ""} ${sourceDeleted ? "source-deleted" : ""} ${mod.locked || ctx.isLayerLocked(mod.layerId) ? "locked" : ""}`} onMouseDown={(event) => ctx.handleModuleMouseDown(event, mod)} opacity={layerOpacity * filterOpacity}>
        {template.tracks.map((track, index) => {
          const perTrackColor = moduleTrackColors?.[index];
          const trackStyle = perTrackColor ? { "--track-stroke": perTrackColor } as CSSProperties : modTrackStyle;
          return track.curved ? <path key={index} className={`track ${track.type}`} d={templateTrackPathD(track)} style={trackStyle} /> : <line key={index} className={`track ${track.type}`} x1={track.x1} y1={track.y1} x2={track.x2} y2={track.y2} style={trackStyle} />;
        })}
        {!ctx.platforms.some((platform) => platform.moduleId === mod.id) && template.platforms.map((platform, index) => {
          const platSpec = moduleTemplatePlatformSpecs?.[index];
          const platStyle = platSpec ? { "--platform-fill": platSpec.css, "--platform-stroke": darkenHex(effectiveColor(platSpec)) } as CSSProperties : undefined;
          const platTwoTone = twoToneColors(platSpec);
          const lineNames = templatePlatformLineNames(platform, mod, ctx.sourceLines, template.tracks, template.platforms, template.trackLinePattern);
          const platformText = lineNames?.length ? lineNames.join(" · ") : platform.label;
          return <g key={index}>{platTwoTone ? <><rect className="platform" x={platform.x} y={platform.y} width={platform.width} height={platform.height / 2} rx={2} style={{ "--platform-fill": platTwoTone[0], "--platform-stroke": darkenHex(platTwoTone[0]) } as CSSProperties} /><rect className="platform" x={platform.x} y={platform.y + platform.height / 2} width={platform.width} height={platform.height / 2} rx={2} style={{ "--platform-fill": platTwoTone[1], "--platform-stroke": darkenHex(platTwoTone[1]) } as CSSProperties} /></> : <rect className="platform" x={platform.x} y={platform.y} width={platform.width} height={platform.height} rx={2} style={platStyle} />}{platformText && showModuleAuxLabels && <text className="platform-label" x={platform.x + platform.width / 2} y={platform.y + platform.height / 2 + 2.5} transform={moduleLabelTextTransform(mod.rotation, mod.mirrorX, mod.mirrorY, platform.x + platform.width / 2, platform.y + platform.height / 2)}>{platformText}</text>}</g>;
        })}
        {template.labels.filter((label) => (label.text !== "站名" || !hasZhStationLabel) && (label.text !== "Station" || !hasEnStationLabel) && ((label.fontSize || 13) > 9 || showModuleAuxLabels)).map((label, index) => {
          const isAux = !!(label.fontSize && label.fontSize <= 9);
          const modHasRealColor = modColorSpec && (modColorSpec.kind === "gradient" || modColorSpec.css.toLowerCase() !== DEFAULT_TRACK_COLOR.toLowerCase());
          const labelFillStyle = (!isAux && (mod.labelColorMode ?? "line") === "line" && modHasRealColor)
            ? { "--label-fill": sampleSpecAt(modColorSpec!, label.x, label.y) } as CSSProperties
            : undefined;
          return <text key={index} className={isAux ? "aux-label" : "station-label"} x={label.x} y={label.y} textAnchor={label.anchor || "middle"} fill={label.fill || "#202124"} fontSize={label.fontSize || 13} transform={moduleLabelTextTransform(mod.rotation, mod.mirrorX, mod.mirrorY, label.x, label.y)} style={labelFillStyle}>{mod.customLabel && label.text === "站名" ? mod.customLabel : label.text}</text>;
        })}
        {(ctx.advancedMode || isSelected || ctx.activeTool === "connect" || (ctx.activeTool === "auto" && ctx.connectFrom?.moduleId === mod.id)) && template.ports.map((port) => {
          const isConnectStart = ctx.connectFrom?.moduleId === mod.id && ctx.connectFrom?.portId === port.id;
          const candidate = getConnectionEndpoint(mod.id, port.id, ctx.modules, ctx.resolvedTemplateMap);
          const source = ctx.connectFrom
            ? getConnectionEndpoint(ctx.connectFrom.moduleId, ctx.connectFrom.portId, ctx.modules, ctx.resolvedTemplateMap)
            : null;
          const validation = source && !isConnectStart
            ? validateConnection(source, candidate, ctx.connections)
            : null;
          const isOccupied = portIsOccupied(ctx.connections, mod.id, port.id);
          const portState = ctx.activeTool !== "connect" && ctx.activeTool !== "auto"
            ? ""
            : isConnectStart
              ? "connect-start"
              : validation
                ? validation.valid ? "connectable" : "incompatible"
                : isOccupied ? "incompatible" : "connectable";
          return (
            <circle
              key={port.id}
              className={`port ${portState}`}
              cx={port.x}
              cy={port.y}
              r={ctx.activeTool === "connect" || ctx.activeTool === "auto" ? 5 : 3}
              onMouseDown={ctx.activeTool === "connect" || ctx.activeTool === "auto" ? (event) => ctx.handlePortClick(event, mod, port.id) : undefined}
              style={{ cursor: (ctx.activeTool === "connect" || ctx.activeTool === "auto") && (isConnectStart || !validation || validation.valid) && !isOccupied ? "pointer" : "default" }}
            />
          );
        })}
        {isSelected && <rect className="selection-box" x={-4} y={-4} width={template.width + 8} height={template.height + 8} rx={4} />}
      </g>;
    }

    if (entry.kind === "label") {
      const label = entry.item as LabelObject;
      if (!label.visible) return null;
      if (ctx.suppressedTransferLabelIds.has(label.id)) return null;
      const languageMode = ctx.filterState.labelLanguageMode || "zh";
      if ((label.language === "zh" && languageMode === "en") || (label.language === "en" && languageMode === "zh")) return null;
      // Legacy projects may contain a missing or obsolete anchor value.
      // Rendering must remain usable; the avoidance layer also treats `top`
      // as its default geometry.
      const anchor = LABEL_ANCHOR_MAP[label.anchor] || LABEL_ANCHOR_MAP.top;
      const isSelected = ctx.selectedIds.includes(label.id);
      const labelSpec = ctx.colorSpecs.labelSpecs.get(label.id);
      const labelFill = labelSpec?.css ?? label.fill;
      const localLabelBox = computeLabelLocalBox(label);
      const backgroundPadding = label.backgroundPadding ?? 4;
      // 物化的中文站名标签跟随模块的"自定义标签"（覆盖站名）
      const ownerMod = label.attachedToId ? ctx.modules.find((candidate) => candidate.id === label.attachedToId) : undefined;
      const effectiveText = label.language === "zh" && ownerMod?.customLabel ? ownerMod.customLabel : label.text;
      // 编号标注：text 存纯数字，渲染时加前缀（股道编号加"道"，道岔编号加"#"）
      const displayText = label.numeralType === "track" ? `${effectiveText}道` : label.numeralType === "switch" ? `#${effectiveText}` : effectiveText;
      return <g key={`label-${label.id}`} transform={`translate(${label.x},${label.y}) rotate(${label.rotation})`} opacity={layerOpacity * filterOpacity}>
        {label.backgroundEnabled && <rect className="label-background" x={localLabelBox.x - backgroundPadding} y={localLabelBox.y - backgroundPadding} width={localLabelBox.w + backgroundPadding * 2} height={localLabelBox.h + backgroundPadding * 2} rx={Math.min(4, backgroundPadding)} fill={label.backgroundColor || "#ffffff"} pointerEvents="none" />}
        <text data-numeral-type={label.numeralType ?? undefined} className={`independent-label ${isSelected ? "selected" : ""} ${label.locked || ctx.isLayerLocked(label.layerId) ? "locked" : ""}`} textAnchor={anchor.textAnchor} dominantBaseline={anchor.dominantBaseline} fontSize={label.fontSize} fontWeight={label.fontWeight} fill={labelFill} paintOrder={label.backgroundMask ? "stroke fill" : "normal"} stroke={label.backgroundMask ? (label.outlineColor || "#ffffff") : "none"} strokeWidth={label.backgroundMask ? label.maskStrokeWidth : 0} strokeLinejoin="round" onMouseDown={(event) => ctx.handleLabelMouseDown(event, label)} onDoubleClick={(event) => ctx.handleLabelDoubleClick(event, label)} style={{ cursor: label.locked || ctx.isLayerLocked(label.layerId) ? "default" : "move", userSelect: "none" }}>{displayText}</text>
        {isSelected && <circle className="label-anchor" cx={0} cy={0} r={2} fill="var(--accent)" stroke="white" strokeWidth={1} pointerEvents="none" />}
        {/* 单独锁定的标签：画布上直接显示解锁徽标 */}
        {isSelected && label.locked && (
          <g
            className="bg-image-unlock"
            transform={`translate(${localLabelBox.x + localLabelBox.w / 2}, ${localLabelBox.y - 14})`}
            onMouseDown={(event) => {
              event.stopPropagation();
              ctx.updateLabel(label.id, { locked: false }, "解锁标签");
            }}
          >
            <circle className="bg-image-unlock-ring" r={16} />
            <text className="bg-image-unlock-icon" y={6} textAnchor="middle" fontSize={16}>🔓</text>
          </g>
        )}
      </g>;
    }

	    if (entry.kind === "platform") {
	      const platform = entry.item as PlatformObject;
	      if (platform.visible === false) return null;
	      const isSelected = ctx.selectedIds.includes(platform.id);
	      // 独立站台（无 moduleId）或处于编辑模式下的站台才可单独交互
	      const isInEditMode = platform.moduleId != null && ctx.editingPlatformModuleId === platform.moduleId;
	      const interactive = platform.moduleId == null || isInEditMode;
	      const ownerSelected = platform.moduleId != null && ctx.selectedIds.includes(platform.moduleId);
	      const platColorSpec = ctx.colorSpecs.platformSpecs.get(platform.id);
	      const platFillStyle = platColorSpec ? { "--platform-fill": platColorSpec.css, "--platform-stroke": darkenHex(effectiveColor(platColorSpec)) } as CSSProperties : undefined;
		      const platTwoTone = twoToneColors(platColorSpec);
		      const platClass = `platform independent-platform ${isSelected && interactive ? "selected" : ""} ${ownerSelected && !interactive ? "owner-selected" : ""}`;
	      // 站台类型文字（岛式/侧式/终点/折返站台）随"辅助标识"开关隐藏；物化站台按所属模块的开关判定
	      const platformOwner = platform.moduleId ? ctx.modules.find((m) => m.id === platform.moduleId) : undefined;
	      const showPlatformTypeLabel = ctx.showAuxLabels && platformOwner?.showAuxLabels !== false;
		      const platLineNames = ctx.colorSpecs.platformLineNames.get(platform.id);
		      const platLabelText = platLineNames?.length ? platLineNames.join(" · ") : platform.label;
	      return <g key={`platform-${platform.id}`} transform={`translate(${platform.x},${platform.y}) rotate(${platform.rotation} ${platform.width / 2} ${platform.height / 2})`} opacity={layerOpacity * filterOpacity} onMouseDown={(event) => ctx.handlePlatformMouseDown(event, platform)} style={{ cursor: platform.locked ? "default" : interactive ? "move" : "pointer" }}>
	        {platTwoTone ? <><rect className={platClass} width={platform.width} height={platform.height / 2} rx={2} style={{ "--platform-fill": platTwoTone[0], "--platform-stroke": darkenHex(platTwoTone[0]) } as CSSProperties} /><rect className={platClass} y={platform.height / 2} width={platform.width} height={platform.height / 2} rx={2} style={{ "--platform-fill": platTwoTone[1], "--platform-stroke": darkenHex(platTwoTone[1]) } as CSSProperties} /></> : <rect className={platClass} width={platform.width} height={platform.height} rx={2} style={platFillStyle} />}
        {showPlatformTypeLabel && platLabelText && <text className="platform-label" x={platform.width / 2} y={platform.height / 2 + 3} transform={`rotate(${readableLabelRotation(platform.rotation) - platform.rotation} ${platform.width / 2} ${platform.height / 2})`}>{platLabelText}</text>}
	        {interactive && isSelected && <rect className="selection-box" x={-4} y={-4} width={platform.width + 8} height={platform.height + 8} rx={4} />}
	        {interactive && isSelected && !platform.locked && !ctx.isLayerLocked(platform.layerId) && <rect className="object-resize-handle" x={platform.width - 3} y={platform.height - 3} width={6} height={6} onMouseDown={(event) => ctx.handlePlatformResizeMouseDown(event, platform)} />}
	      </g>;
	    }

    if (entry.kind === "graphic") {
      const graphic = entry.item as AttachedGraphic;
      if (graphic.visible === false) return null;
      const asset = ctx.assets.find((candidate) => candidate.id === graphic.assetId);
      const isSelected = ctx.selectedIds.includes(graphic.id);
      return <g key={`graphic-${graphic.id}`} transform={`translate(${graphic.x},${graphic.y}) rotate(${graphic.rotation} ${graphic.width / 2} ${graphic.height / 2})${moduleMirrorTransform(graphic.width, graphic.height, graphic.mirrorX, graphic.mirrorY)}`} opacity={layerOpacity * filterOpacity * graphic.opacity} onMouseDown={(event) => ctx.handleGraphicMouseDown(event, graphic)} style={{ cursor: graphic.locked ? "default" : "move" }}>
        {graphic.shapeType ? (
          <g className="shape-graphic" data-shape-type={graphic.shapeType}>
            <ShapeGraphic shapeType={graphic.shapeType} width={graphic.width} height={graphic.height} fill={graphic.fill} stroke={graphic.stroke} />
          </g>
        ) : asset?.dataUrl ? <image href={asset.dataUrl} width={graphic.width} height={graphic.height} preserveAspectRatio="xMidYMid meet" /> : <rect width={graphic.width} height={graphic.height} fill="#f8d7da" stroke="#b42318" strokeDasharray="4 2" />}
        {isSelected && <rect className="selection-box" x={-4} y={-4} width={graphic.width + 8} height={graphic.height + 8} rx={4} />}
        {isSelected && !graphic.locked && !ctx.isLayerLocked(graphic.layerId) && <rect className="object-resize-handle" x={graphic.width - 3} y={graphic.height - 3} width={6} height={6} onMouseDown={(event) => ctx.handleGraphicResizeMouseDown(event, graphic)} />}
        {/* 单独锁定的图形：在画布上直接显示解锁徽标（复用背景图解锁模式） */}
        {isSelected && graphic.locked && (
          <g
            className="bg-image-unlock"
            transform={`translate(${graphic.width / 2}, -14)`}
            onMouseDown={(event) => {
              event.stopPropagation();
              ctx.updateGraphic(graphic.id, { locked: false }, "解锁图形");
            }}
          >
            <circle className="bg-image-unlock-ring" r={16} />
            <text className="bg-image-unlock-icon" y={6} textAnchor="middle" fontSize={16}>🔓</text>
          </g>
        )}
      </g>;
    }

    const group = entry.item as TransferGroup;
    if (!group.visible) return null;
    const bounds = ctx.getTransferGroupBounds(group);
    if (!bounds) return null;
    const isSelected = ctx.selectedIds.includes(group.id);
    const accent = group.accentColor || "var(--accent)";
    return (
      <g
        key={`transfer-${group.id}`}
        className={`transfer-group ${isSelected ? "selected" : ""}`}
        opacity={layerOpacity * filterOpacity}
        onMouseDown={(event) => ctx.handleTransferGroupMouseDown(event, group)}
        onDoubleClick={(event) => ctx.handleTransferGroupDoubleClick(event, group)}
        style={{ cursor: group.locked || ctx.isLayerLocked(group.layerId) ? "default" : "move" }}
      >
        <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="none" stroke={accent} strokeWidth={1.5} strokeDasharray="8 4" rx={6} opacity={isSelected ? 0.9 : 0.6} />
        <g transform={`translate(${bounds.x + 8}, ${bounds.y - 8})`}>
          <rect x={-4} y={-14} width={group.name.length * 12 + 16} height={20} rx={4} fill={isSelected ? accent : "white"} stroke={accent} strokeWidth={1} opacity={0.95} />
          <text x={4} y={0} className="transfer-group-label" fill={isSelected ? "white" : accent} style={{ fontSize: 11, fontWeight: 600, pointerEvents: "none" }}>{group.name}</text>
        </g>
        {group.lineIds.length > 0 && (
          <g transform={`translate(${bounds.x + bounds.w - group.lineIds.length * 14 - 8}, ${bounds.y - 8})`}>
            {group.lineIds.map((lineId, index) => {
              const line = ctx.data?.lines.find((candidate) => candidate.id === lineId);
              return <circle key={lineId} cx={index * 14 + 6} cy={-4} r={5} fill={line?.lineColor || "#999"} stroke="white" strokeWidth={1.5} />;
            })}
          </g>
        )}
      </g>
    );
  }
