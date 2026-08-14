"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_LAYOUT,
  DEFAULT_LOOP_LAYOUT,
  DEFAULT_PULSE_LAYOUT,
  DEFAULT_SCENIC_LAYOUT,
  normalizeTransitData,
  Station,
  TransitData,
} from "../transit/types";
import { buildSourceIdentityRecords, confirmPhysicalStationSuggestion, suggestPhysicalStations, type PhysicalStationSuggestion } from "./sourceIdentity";
import { findAssetByFilename, importIconArchive, importIconFiles } from "./assetImport";
import { evaluateFilter } from "./filtering";
import {
  buildResolvedTemplateMap,
  MODULE_TEMPLATES,
  supportsAvoidanceTracks,
  templatesByCategory,
} from "./templates";
import {
  BackgroundImageObject,
  buildControlPointPathD,
  CrossingType,
  DEFAULT_LAYERS,
  DEFAULT_SERVICE_PATTERNS,
  DiagramModule,
  genId,
  getChildLayers,
  getRootLayers,
  GRID_SIZE,
  GraphicShapeType,
  isLayerTreeLocked,
  isLayerTreeVisible,
  LABEL_ANCHOR_MAP,
  LabelAnchor,
  LabelObject,
  AttachedGraphic,
  AssetRecord,
  FilterState,
  LayerNode,
  LeftPanelTab,
  ModuleConnection,
  ModulePort,
  ModuleTemplate,
  PendingPlacement,
  PhysicalStation,
  PlatformObject,
  PORT_SNAP_RADIUS,
  rebuildTracksFromControlPoints,
  snapToGrid,
  TemplateCategory,
  TemplateTrack,
  TrackControlPoint,
  TransferGroup,
  SourceChange,
  SourceLine,
  SourceMapping,
  SourceStationOnLine,
  ViewportState,
  WiringTool,
  worldPortPosition,
} from "./types";
import { generateSourceChanges, pendingPlacementChanges, updateSourceChangeStatus } from "../transit/sourceChanges";
import {
  buildImportPreview,
  CsvImportPreview,
  hasBlockingIssues,
  parseCsvFile,
  type ParsedCsvFile,
} from "../transit/csv-io";
import { alignModuleToTrackPorts, CANVAS_PRESETS, centerBackgroundOnCanvas, compareRenderOrder, createCanvasPage, createLayerRank, effectiveConnectionZIndex, effectiveLayerOpacity, effectivePlatformZIndex, expandCanvasToFitBounds, fitBackgroundToCanvas, leafLayerIds, mirrorModuleOwnedObjects, readableLabelRotation, relayoutModuleOwnedObjects, restoreBackgroundSize, rotateModuleOwnedObjects, shiftOwnedPlatformZIndex, toggleOwnedModuleSelection, translateCanvasSelection, translateModuleGroup } from "./canvasLogic";
import { computeGraphicBbox, computeLabelBbox, computeLabelLocalBox, computePlatformBbox, resolveLabelIconOverlaps } from "./labelAvoidance";
import { reconcileLineIdsForStationAssociations } from "./stationAssociation";
import { duplicateTransferStationLabelIds } from "./transferLabels";
import { defaultConnectionLayerId, defaultGraphicLayerId, defaultLabelLayerId, defaultModuleLayerId, defaultPlatformLayerId } from "./layerAssignment";
import { expandServicePatternFilter } from "./servicePatterns";
import {
  createAutoControlPoints,
  createPairedAutoControlPoints,
  buildPairedOffsetPathD,
  endpointsForConnection,
  findDoubleTrackPartner,
  findPairedConnection,
  getConnectionEndpoint,
  getConnectionTracks,
  pathsCross,
  portIsOccupied,
  synchronizeConnectionTracks,
  validateConnection,
  type PairedCurveEndpoints,
} from "./connectionLogic";
import {
  curveEndpointsFor,
  findPairedRail as pureFindPairedRail,
  geometryForConnection,
  getConnectionEndpoints as pureGetConnectionEndpoints,
  rebuildConnectionTrackCache as pureRebuildConnectionTrackCache,
  updateConnectionAndPairedRail as pureUpdateConnectionAndPairedRail,
} from "./connectionEdit";
import {
  DEFAULT_TRACK_COLOR,
  DEFAULT_PLATFORM_FILL,
  darkenHex,
  effectiveColor,
  resolveConnectionColor,
  resolveLabelFillColor,
  resolveModuleColorPlan,
  resolvePlatformFillColor,
  platformLineNames,
  templatePlatformLineNames,
  twoToneColors,
  sampleSpecAt,
  templateTrackYBounds,
  type ColorSpec,
  type GradientDef,
} from "./color";
import { useHistory } from "./history";
import {
  deleteFromIndexedDB,
  downloadBlob,
  loadFromIndexedDB,
  migrateProjectSchema,
  projectToJson,
  saveToIndexedDB,
  serializeProject,
  type DiagramPage,
  type ProjectFile,
} from "./projectStore";
import { newestWiringProject, synchronizeWiringProjectSource } from "./sourceSync";
import { DEFAULT_WIRING_SAMPLE_MARKER, isWiringProjectEmpty, loadDefaultWiringSample, shouldInstallDefaultWiringSample } from "./sampleProject";
import TutorialOverlay, { useTutorialState } from "./TutorialOverlay";
import FirstUseNotice, { useFirstUseNoticeState } from "./FirstUseNotice";
import PopoverMenu, { type PopoverMenuItem } from "./PopoverMenu";
import {
  createProjectRepository,
  DEFAULT_PROJECT_ID,
  type ProjectRepository,
} from "../projects/repositories";
import { BrowserEditorDocumentStore, type JsonEditorDocument } from "../projects/editorDocumentStore";
import {
  CanvasRenderItem,
  createBackgroundPreview,
  ExportBounds,
  moduleLabelTextTransform,
  moduleMirrorTransform,
  PLACEMENT_Z_LEVELS,
  PREF_KEY,
  rectsIntersect,
  rotatedRectBounds,
  svgToString,
  templateTrackPathD,
  usePersistentState,
} from "./ui/primitives";
import {
  MirrorToggle,
  NUMBER_CARDS,
  ProjectStationIcon,
  ShapeGraphic,
  ShapePreview,
  SHAPE_CARDS,
  SHAPE_META,
  SIGNAL_CARDS,
  SIGNAL_LAMPS,
  SIGNAL_LAMP,
  TemplatePreviewSvg,
} from "./ui/svgElements";
import "../transit/transit.css";
import "./wiring.css";
import {
  BackgroundInspector,
  ConnectionInspector,
  GraphicInspector,
  LabelInspector,
  ModuleInspector,
  PlacementInspector,
  PlatformInspector,
  TransferGroupInspector,
} from "./inspectors";
import type { InspectorContext } from "./inspectors/inspectorProps";
import { renderItemBounds as pureRenderItemBounds, renderItemName as pureRenderItemName, moveLabelRelative as pureMoveLabelRelative, moveLabelToEdge as pureMoveLabelToEdge, renderCanvasItem as pureRenderCanvasItem, type RenderItemContext } from "./ui/renderItem";
import { siteUrl } from "../site";

// ── 主组件 ────────────────────────────────────

interface WiringDiagramAppProps {
  projectId?: string;
  repository?: ProjectRepository;
}

export default function WiringDiagramApp({ projectId = DEFAULT_PROJECT_ID, repository }: WiringDiagramAppProps) {
  const projectRepository = useMemo(
    () => repository || createProjectRepository({ storageMode: "http" }),
    [repository],
  );
  const autosaveKey = useMemo(() => `wiring:${projectId}:autosave`, [projectId]);
  const documentStore = useMemo(() => new BrowserEditorDocumentStore(), []);
  // ── 数据 ──
  const [data, setData] = useState<TransitData | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("正在读取本地数据…");

  // ── 编辑器状态 ──
  const [modules, setModules] = useState<DiagramModule[]>([]);
  const [connections, setConnections] = useState<ModuleConnection[]>([]);
  const [layers, setLayers] = useState<LayerNode[]>(DEFAULT_LAYERS);
  const [viewport, setViewport] = useState<ViewportState>({ panX: 100, panY: 60, scale: 0.75 });
  const [pages, setPages] = useState<DiagramPage[]>([createCanvasPage({ id: "page-1", name: "主画布", width: 1920, height: 1080, layerRootIds: DEFAULT_LAYERS.filter((layer) => layer.parentId === null).map((layer) => layer.id) })]);
  const [activePageId, setActivePageId] = useState("page-1");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manualCurveEditingId, setManualCurveEditingId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<WiringTool>("auto");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  /** 元件库"形状/编号"待放置元素；activeTool==="shape" 时点击画布按此放置 */
  const [pendingElement, setPendingElement] = useState<{ kind: "shape"; shapeType: GraphicShapeType } | { kind: "number"; numeralType: "track" | "switch" } | null>(null);
  const [placementRotation, setPlacementRotation] = useState(0);
  const [placementMirrorX, setPlacementMirrorX] = useState(false);
  const [placementMirrorY, setPlacementMirrorY] = useState(false);
  const [placementZIndex, setPlacementZIndex] = useState(0);
  const [placementLayerId, setPlacementLayerId] = useState("auto");
  const [showGrid, setShowGrid] = useState(true);
  const [showAuxLabels, setShowAuxLabels] = usePersistentState(PREF_KEY("showAuxLabels"), true);
  const [snapEnabled, setSnapEnabled] = usePersistentState(PREF_KEY("snapEnabled"), true);
  const [autoConnect, setAutoConnect] = usePersistentState(PREF_KEY("autoConnect"), true);
  const [autoAvoidance, setAutoAvoidance] = usePersistentState(PREF_KEY("autoAvoidance"), true);
  const [filterLineIds, setFilterLineIds] = useState<string[]>([]);
  const [servicePatterns, setServicePatterns] = useState(DEFAULT_SERVICE_PATTERNS);
  const [activeServicePatternId, setActiveServicePatternId] = useState("");
  const [csvImportPreview, setCsvImportPreview] = useState<CsvImportPreview | null>(null);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [expandedSections, setExpandedSections] = usePersistentState<Record<string, boolean>>(PREF_KEY("expandedSections"), { library: true, stations: true, assets: false, layers: false });
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }, []);
  // 元件库各分类（基础元素/工程图标/轨道模板）可单独收起
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const toggleCat = useCallback((key: string) => {
    setCollapsedCats((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const [mouseWorld, setMouseWorld] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [showPlacedOnly, setShowPlacedOnly] = useState(false);
  const [advancedMode, setAdvancedMode] = usePersistentState(PREF_KEY("advancedMode"), false);
  const [continuousPlace, setContinuousPlace] = usePersistentState(PREF_KEY("continuousPlace"), false);
  const [editingPlatformModuleId, setEditingPlatformModuleId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [projectName, setProjectName] = useState("未命名配线图");
  const [backgroundImages, setBackgroundImages] = useState<BackgroundImageObject[]>([]);
  const [labels, setLabels] = useState<LabelObject[]>([]);
  const [transferGroups, setTransferGroups] = useState<TransferGroup[]>([]);
  const [platforms, setPlatforms] = useState<PlatformObject[]>([]);
  const [graphics, setGraphics] = useState<AttachedGraphic[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [sourceLines, setSourceLines] = useState<SourceLine[]>([]);
  const [sourceStationsOnLine, setSourceStationsOnLine] = useState<SourceStationOnLine[]>([]);
  const [physicalStations, setPhysicalStations] = useState<PhysicalStation[]>([]);
  const [sourceMappings, setSourceMappings] = useState<SourceMapping[]>([]);
  const [filterState, setFilterState] = useState<FilterState>({ lineIds: [], mode: "target_only" });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [unresolvedChanges, setUnresolvedChanges] = useState<SourceChange[]>([]);
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null);
  const [changeSeverity, setChangeSeverity] = useState<"all" | SourceChange["severity"]>("all");
  const [tracingMode, setTracingMode] = useState(false);
  const [pendingStationId, setPendingStationId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<{ moduleId: string; portId: string } | null>(null);
  const [doubleTrackConnect, setDoubleTrackConnect] = useState(true);
  const [newCanvasOpen, setNewCanvasOpen] = useState(false);
  const [newCanvasDraft, setNewCanvasDraft] = useState<{ name: string; width: number; height: number; backgroundColor: string; gridSize: number; showGrid: boolean; orientation: "landscape" | "portrait" }>({ name: "新画布", width: 1920, height: 1080, backgroundColor: "#FFFFFF", gridSize: 20, showGrid: true, orientation: "landscape" });
  const [exportIncludeBackground, setExportIncludeBackground] = useState(true);
  const [exportTransparent, setExportTransparent] = useState(false);
  const [pngScale, setPngScale] = useState(2);
  const [exportScope, setExportScope] = useState<"canvas" | "selection">("canvas");

  // ── 引用 ──
  const svgRef = useRef<SVGSVGElement>(null);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const bgImageInputRef = useRef<HTMLInputElement>(null);
  const replaceBackgroundInputRef = useRef<HTMLInputElement>(null);
  const iconArchiveInputRef = useRef<HTMLInputElement>(null);
  const iconDirectoryInputRef = useRef<HTMLInputElement>(null);
  const saveProjectActionRef = useRef<() => void>(() => undefined);
  const deleteSelectedActionRef = useRef<() => void>(() => undefined);
  const dragRef = useRef<{
    type: "none" | "module" | "selection" | "transferGroup" | "pan" | "bgImage" | "label" | "platform" | "graphic" | "platformResize" | "graphicResize" | "controlPoint" | "controlPointHandle" | "selectionBox";
    selectionIds?: string[];
    moduleId?: string;
    transferGroupId?: string;
    bgImageId?: string;
    labelId?: string;
    platformId?: string;
    graphicId?: string;
    /** 控制点拖拽：所属连接 ID */
    connId?: string;
    /** 控制点拖拽：节点 ID */
    cpId?: string;
    /** 曲率手柄拖拽起始偏移 */
    startHX?: number;
    startHY?: number;
    startSX: number;
    startSY: number;
    startMX: number;
    startMY: number;
    startPX: number;
    startPY: number;
    startWidth?: number;
    startHeight?: number;
    moved: boolean;
    /** mousedown 时对象是否已处于选中状态：mouseup 未移动时据此决定取消选中还是选中，避免闭包陈旧 */
    wasSelected?: boolean;
    /** 模块拖拽：上一帧的模块位置（避免 modulesRef 异步延迟导致平台漂移） */
    lastMX?: number;
    lastMY?: number;
  }>({ type: "none", startSX: 0, startSY: 0, startMX: 0, startMY: 0, startPX: 0, startPY: 0, moved: false });
  const selectionBoxRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  /** 图层拖拽排序状态 */
  const layerDragRef = useRef<{ draggedId: string | null; dropTargetId: string | null; dropPosition: "before" | "after" | "inside" | null }>({ draggedId: null, dropTargetId: null, dropPosition: null });
  const [layerDragState, setLayerDragState] = useState<{ draggedId: string | null; dropTargetId: string | null; dropPosition: "before" | "after" | "inside" | null }>({ draggedId: null, dropTargetId: null, dropPosition: null });
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const { showTutorial, dismissTutorial, resetTutorial } = useTutorialState();
  const { showFirstUseNotice, dismissFirstUseNotice } = useFirstUseNoticeState();

  // ── 状态镜像 ref（供历史系统读取当前值，避免闭包过期） ──
  const modulesRef = useRef<DiagramModule[]>(modules);
  const connectionsRef = useRef<ModuleConnection[]>(connections);
  const layersRef = useRef<LayerNode[]>(layers);
  const backgroundImagesRef = useRef<BackgroundImageObject[]>(backgroundImages);
  const labelsRef = useRef<LabelObject[]>(labels);
  const transferGroupsRef = useRef<TransferGroup[]>(transferGroups);
  const dataRef = useRef<TransitData | null>(data); const pagesRef = useRef<DiagramPage[]>(pages);
  const servicePatternsRef = useRef(servicePatterns); const platformsRef = useRef<PlatformObject[]>(platforms);
  const graphicsRef = useRef<AttachedGraphic[]>(graphics); const assetsRef = useRef<AssetRecord[]>(assets);
  const sourceLinesRef = useRef<SourceLine[]>(sourceLines); const sourceStationsOnLineRef = useRef<SourceStationOnLine[]>(sourceStationsOnLine);
  const physicalStationsRef = useRef<PhysicalStation[]>(physicalStations); const sourceMappingsRef = useRef<SourceMapping[]>(sourceMappings);
  const filterStateRef = useRef<FilterState>(filterState); const unresolvedChangesRef = useRef<SourceChange[]>(unresolvedChanges);
  const pendingPlacementRef = useRef<PendingPlacement | null>(pendingPlacement);
  useEffect(() => { selectionBoxRef.current = selectionBox; }, [selectionBox]);
  useEffect(() => { modulesRef.current = modules; }, [modules]);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { backgroundImagesRef.current = backgroundImages; }, [backgroundImages]);
  useEffect(() => { labelsRef.current = labels; }, [labels]);
  useEffect(() => { transferGroupsRef.current = transferGroups; }, [transferGroups]);
  useEffect(() => { dataRef.current = data; pagesRef.current = pages; servicePatternsRef.current = servicePatterns; platformsRef.current = platforms; graphicsRef.current = graphics; assetsRef.current = assets; sourceLinesRef.current = sourceLines; sourceStationsOnLineRef.current = sourceStationsOnLine; physicalStationsRef.current = physicalStations; sourceMappingsRef.current = sourceMappings; filterStateRef.current = filterState; unresolvedChangesRef.current = unresolvedChanges; pendingPlacementRef.current = pendingPlacement; }, [data, pages, servicePatterns, platforms, graphics, assets, sourceLines, sourceStationsOnLine, physicalStations, sourceMappings, filterState, unresolvedChanges, pendingPlacement]);

  // ── 撤销/重做 ──
  const history = useHistory({ modules: modulesRef, connections: connectionsRef, layers: layersRef, backgroundImages: backgroundImagesRef, labels: labelsRef, transferGroups: transferGroupsRef, transitData: dataRef, pages: pagesRef, servicePatterns: servicePatternsRef, platforms: platformsRef, graphics: graphicsRef, assets: assetsRef, sourceLines: sourceLinesRef, sourceStationsOnLine: sourceStationsOnLineRef, physicalStations: physicalStationsRef, sourceMappings: sourceMappingsRef, filters: filterStateRef, unresolvedChanges: unresolvedChangesRef, pendingPlacement: pendingPlacementRef });

  /** 执行撤销 */
  const handleUndo = useCallback(() => {
    const snapshot = history.undo();
    if (snapshot) {
      setModules(snapshot.modules);
      setConnections(snapshot.connections);
      setLayers(snapshot.layers);
      setBackgroundImages(snapshot.backgroundImages);
      setLabels(snapshot.labels);
      setTransferGroups(snapshot.transferGroups);
      setData(snapshot.transitData); setPages(snapshot.pages); setServicePatterns(snapshot.servicePatterns); setPlatforms(snapshot.platforms); setGraphics(snapshot.graphics); setAssets(snapshot.assets); setSourceLines(snapshot.sourceLines); setSourceStationsOnLine(snapshot.sourceStationsOnLine); setPhysicalStations(snapshot.physicalStations); setSourceMappings(snapshot.sourceMappings); setFilterState(snapshot.filters); setUnresolvedChanges(snapshot.unresolvedChanges); setPendingPlacement(snapshot.pendingPlacement);
      setSelectedIds([]);
      setHasUnsavedChanges(true);
      setStatus(`已撤销：${snapshot.operationName}`);
    }
  }, [history]);

  /** 执行重做 */
  const handleRedo = useCallback(() => {
    const snapshot = history.redo();
    if (snapshot) {
      setModules(snapshot.modules);
      setConnections(snapshot.connections);
      setLayers(snapshot.layers);
      setBackgroundImages(snapshot.backgroundImages);
      setLabels(snapshot.labels);
      setTransferGroups(snapshot.transferGroups);
      setData(snapshot.transitData); setPages(snapshot.pages); setServicePatterns(snapshot.servicePatterns); setPlatforms(snapshot.platforms); setGraphics(snapshot.graphics); setAssets(snapshot.assets); setSourceLines(snapshot.sourceLines); setSourceStationsOnLine(snapshot.sourceStationsOnLine); setPhysicalStations(snapshot.physicalStations); setSourceMappings(snapshot.sourceMappings); setFilterState(snapshot.filters); setUnresolvedChanges(snapshot.unresolvedChanges); setPendingPlacement(snapshot.pendingPlacement);
      setSelectedIds([]);
      setHasUnsavedChanges(true);
      setStatus(`已重做：${snapshot.operationName}`);
    }
  }, [history]);

  // ── 站台编辑模式   // ── 加载数据 ── 加载数据 ──

  // 选中不同模块时退出站台编辑模式
  useEffect(() => {
    if (editingPlatformModuleId) {
      const stillEditing = modules.find(m => m.id === editingPlatformModuleId && selectedIds.includes(m.id));
      if (!stillEditing) setEditingPlatformModuleId(null);
    }
  }, [selectedIds, editingPlatformModuleId, modules]);
  function cancelCsvImport() {
    setShowCsvImport(false);
    setCsvImportPreview(null);
    if (csvImportRef.current) csvImportRef.current.value = "";
  }

  function resolveSourceChange(change: SourceChange, status: "accepted" | "ignored") {
    history.captureSnapshot(status === "accepted" ? "接受数据变更" : "忽略数据变更");
    setUnresolvedChanges((prev) => updateSourceChangeStatus(prev, [change.id], status));
    if (pendingPlacement?.sourceStationId === change.entityId) setPendingPlacement(null);
    setHasUnsavedChanges(true);
  }

  function locateSourceChange(change: SourceChange) {
    const objectId = change.affectedObjectIds[0];
    if (objectId) { setSelectedIds([objectId]); setStatus(`已定位变更对象 ${objectId}`); }
    else setStatus("该变更尚未关联画布对象");
  }

  function acceptInformationalChanges() {
    const ids = unresolvedChanges.filter((change) => change.status === "unresolved" && change.severity === "info").map((change) => change.id);
    if (!ids.length) return;
    history.captureSnapshot("批量接受信息级变更");
    setUnresolvedChanges((prev) => updateSourceChangeStatus(prev, ids, "accepted"));
    setHasUnsavedChanges(true);
  }

  function beginStationPlacement(stationId: string) {
    setPendingStationId(stationId); setPendingPlacement({ sourceStationId: stationId, pageId: activePageId });
    selectTemplate("island_platform");
  }

  function adjacentStationContext(stationId: string) {
    const station = data?.stations.find((candidate) => candidate.id === stationId);
    if (!station || !data) return null;
    const siblings = data.stations.filter((candidate) => candidate.lineId === station.lineId).sort((a, b) => a.sequence - b.sequence);
    const index = siblings.findIndex((candidate) => candidate.id === stationId);
    const previous = index > 0 ? siblings[index - 1] : undefined;
    const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;
    const previousModule = previous ? modules.find((module) => isOnActivePage(module.pageId) && module.sourceStationIds.includes(previous.id)) : undefined;
    const nextModule = next ? modules.find((module) => isOnActivePage(module.pageId) && module.sourceStationIds.includes(next.id)) : undefined;
    return { station, line: data.lines.find((line) => line.id === station.lineId), previous, next, previousModule, nextModule };
  }

  function insertStationBetweenNeighbors(stationId: string) {
    const context = adjacentStationContext(stationId);
    if (!context?.previousModule || !context.nextModule) {
      setStatus("需要先放置前后相邻站点，才能自动插入中间位置");
      return;
    }
    placeModule(
      (context.previousModule.x + context.nextModule.x) / 2,
      (context.previousModule.y + context.nextModule.y) / 2,
      "island_platform",
      stationId,
    );
  }

  function confirmPhysicalMapping(suggestion: PhysicalStationSuggestion) {
    const confirmed = confirmPhysicalStationSuggestion(suggestion);
    history.captureSnapshot("确认物理站映射");
    setPhysicalStations((prev) => [...prev.filter((station) => station.id !== confirmed.physicalStation.id), confirmed.physicalStation]);
    setSourceMappings((prev) => {
      const sourceIds = new Set(confirmed.mappings.map((mapping) => mapping.sourceStationId));
      return [...prev.filter((mapping) => !sourceIds.has(mapping.sourceStationId)), ...confirmed.mappings];
    });
    setHasUnsavedChanges(true);
  }

  async function handleCsvImportSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length || !data) return;
    const parsed: ParsedCsvFile[] = [];
    for (const file of files) {
      const item = parseCsvFile(file.name, await file.text());
      if (item) parsed.push(item);
    }
    if (!parsed.length) {
      setStatus("未识别 CSV 类型，请选择 lines、stations 或 transfers 文件");
      return;
    }
    setCsvImportPreview(buildImportPreview(parsed, data));
    setShowCsvImport(true);
    setStatus("CSV 已解析，等待确认导入");
  }

  function confirmCsvImport() {
    if (!data || !csvImportPreview || hasBlockingIssues(csvImportPreview.issues)) return;
    history.captureSnapshot("导入 CSV 数据");
    const nextData = normalizeTransitData({ ...data, lines: csvImportPreview.lines, stations: csvImportPreview.stations, transfers: csvImportPreview.transfers });
    const bindings = Object.fromEntries(modules.flatMap((module) => module.sourceStationIds.map((id) => [`station:${id}`, [module.id]])));
    const changes = generateSourceChanges(data, nextData, bindings);
    const identity = buildSourceIdentityRecords(nextData);
    const nextStations = new Map(nextData.stations.map((station) => [station.id, station]));
    setModules((prev) => prev.map((module) => {
      const station = module.sourceStationIds.map((id) => nextStations.get(id)).find(Boolean);
      return station ? {
        ...module,
        customLabel: station.nameZh,
        lineIds: reconcileLineIdsForStationAssociations(module.lineIds, module.sourceStationIds, nextData.stations),
      } : module;
    }));
    setLabels((prev) => prev.map((label) => {
      const ownerStationId = label.sourceStationId || modules.find((module) => module.id === label.attachedToId)?.sourceStationIds[0];
      const station = ownerStationId ? nextStations.get(ownerStationId) : undefined;
      if (!station || !label.language || label.language === "neutral") return label;
      return { ...label, sourceStationId: station.id, text: label.language === "en" ? station.nameEn : station.nameZh };
    }));
    setGraphics((prev) => prev.map((graphic) => {
      const stationId = modules.find((module) => module.id === graphic.attachedToId)?.sourceStationIds[0];
      const station = stationId ? nextStations.get(stationId) : undefined;
      const asset = findAssetByFilename(assets, station?.icon);
      return asset ? { ...graphic, assetId: asset.id } : graphic;
    }));
    setData(nextData);
    setSourceLines(identity.sourceLines);
    setSourceStationsOnLine(identity.sourceStationsOnLine);
    setUnresolvedChanges(changes);
    const pending = pendingPlacementChanges(changes)[0];
    setPendingPlacement(pending ? { sourceStationId: pending.entityId } : null);
    setShowCsvImport(false);
    setCsvImportPreview(null);
    setHasUnsavedChanges(true);
    setStatus("CSV 数据已导入");
    if (csvImportRef.current) csvImportRef.current.value = "";
  }

  async function reloadProjectCsv() {
    setStatus("正在同步当前项目 CSV…");
    try {
      const normalized = normalizeTransitData(await projectRepository.loadTransitData(projectId));
      const currentProject = serializeProject({
        projectName, modules, connections, layers, viewport, backgroundImages, labels, transferGroups,
        platforms, graphics, assets, sourceLines, sourceStationsOnLine, physicalStations, sourceMappings,
        filters: filterState, unresolvedChanges, pendingPlacement, servicePatterns,
        sourceDataSnapshot: data || undefined,
        pages: pages.map((page) => page.id === activePageId ? { ...page, viewport, showGrid } : page),
      });
      const synchronized = synchronizeWiringProjectSource(currentProject, normalized);
      setData(normalized);
      setModules(synchronized.modules);
      setLabels(synchronized.labels);
      setGraphics(synchronized.graphics);
      setSourceLines(synchronized.sourceLines);
      setSourceStationsOnLine(synchronized.sourceStationsOnLine);
      setUnresolvedChanges(synchronized.unresolvedChanges);
      setPendingPlacement(synchronized.pendingPlacement);
      setHasUnsavedChanges(true);
      setStatus(synchronized.unresolvedChanges.length
        ? `已同步当前 CSV，检测到 ${synchronized.unresolvedChanges.length} 项变化`
        : "当前 CSV 已是最新状态");
    } catch (reason) {
      setStatus(`同步 CSV 失败：${reason instanceof Error ? reason.message : "未知错误"}`);
    }
  }

  // ── 辅助计算 ──

  const templateMap = useMemo(() => {
    const map = new Map<string, ModuleTemplate>();
    MODULE_TEMPLATES.forEach((t) => map.set(t.id, t));
    return map;
  }, []);

  /** Augmented template map that includes per-module customized entries for modules with customParams. */
  const resolvedTemplateMap = useMemo(
    () => buildResolvedTemplateMap(templateMap, modules),
    [templateMap, modules],
  );

  function resolveTemplatesFor(moduleList: DiagramModule[]) {
    return buildResolvedTemplateMap(templateMap, moduleList);
  }

  function alignModuleToExistingTracks(candidate: DiagramModule) {
    const allModules = modulesRef.current.some((module) => module.id === candidate.id)
      ? modulesRef.current.map((module) => module.id === candidate.id ? candidate : module)
      : [...modulesRef.current, candidate];
    const templates = buildResolvedTemplateMap(templateMap, allModules);
    const template = templates.get(candidate.id) || templateMap.get(candidate.templateId);
    if (!template) return { x: candidate.x, y: candidate.y, aligned: false };
    return alignModuleToTrackPorts({
      module: candidate,
      template,
      others: allModules,
      templates,
      threshold: pageGridSize,
    });
  }

  const activePage = useMemo(
    () => pages.find((page) => page.id === activePageId) || pages[0],
    [pages, activePageId],
  );
  const pageWidth = activePage?.width || 1920;
  const pageHeight = activePage?.height || 1080;
  const pageGridSize = activePage?.gridSize || GRID_SIZE;
  const activeLayerRank = useMemo(() => createLayerRank(layers), [layers]);
  const selectableLayers = useMemo(() => leafLayerIds(layers), [layers]);
  function resolvePlacementLayer(defaultLayerId: string): string {
    return placementLayerId !== "auto" && selectableLayers.includes(placementLayerId)
      ? placementLayerId
      : defaultLayerId;
  }
  const isOnActivePage = useCallback((pageId?: string) => (pageId || "page-1") === activePageId, [activePageId]);

  /** 对当前画布上的站名/图标执行自动避让；有位移时才落历史快照。
   *  captureHistory=false 用于跟随其他事务（如拖动）自动触发，避免产生独立撤销步骤。 */
  const applyLabelAvoidance = useCallback((captureHistory = true) => {
    const result = resolveLabelIconOverlaps({
      modules: modulesRef.current,
      labels: labelsRef.current,
      graphics: graphicsRef.current,
      platforms: platformsRef.current,
      activePageId,
      ignoredLabelIds: duplicateTransferStationLabelIds(labelsRef.current, transferGroupsRef.current),
    });
    if (!result.changed) return;
    if (captureHistory) history.captureSnapshot("自动避让");
    setLabels(result.labels);
    setGraphics(result.graphics);
    setHasUnsavedChanges(true);
    if (captureHistory) setStatus(`已自动避让 ${result.patches.length} 处站名/图标重叠`);
  }, [activePageId]);

  // Run after project data loads and when drawable objects change. The solver
  // is idempotent, so a settled layout returns unchanged arrays and does not
  // create a render loop or an extra history entry.
  useEffect(() => {
    if (!autoAvoidance) return;
    applyLabelAvoidance(false);
  }, [applyLabelAvoidance, modules, labels, graphics, platforms, autoAvoidance]);

  // Older projects and manually placed station modules may still rely on the
  // template's fallback "站名"/"Station" text. Materialize those two labels
  // once so the same collision solver can move them like normal labels.
  useEffect(() => {
    const existing = labelsRef.current;
    const additions: LabelObject[] = [];
    for (const mod of modules) {
      const template = resolvedTemplateMap.get(mod.id) || templateMap.get(mod.templateId);
      if (!template) continue;
      // 物化标签文字优先取当前关联站点名，保证"先放模块、后关联站点"的模块站名正确
      const station = data?.stations.find((candidate) => mod.sourceStationIds.includes(candidate.id));
      const ownerLabels = existing.filter((label) => label.attachedToId === mod.id && label.visible !== false);
      for (const templateLabel of template.labels.filter((label) => label.text === "站名" || label.text === "Station")) {
        const language = templateLabel.text === "Station" ? "en" : "zh";
        const hasLabel = ownerLabels.some((label) => {
          if (label.language === language) return true;
          if (label.language) return false;
          const hasCjk = /[\u3400-\u9fff]/.test(label.text);
          return language === "zh" ? hasCjk : !hasCjk && label.text !== "站名";
        });
        if (hasLabel) continue;
        const centerX = template.width / 2;
        const centerY = template.height / 2;
        const radians = (mod.rotation * Math.PI) / 180;
        const dx = templateLabel.x - centerX;
        const dy = templateLabel.y - centerY;
        const worldX = mod.x + centerX + dx * Math.cos(radians) - dy * Math.sin(radians);
        const worldY = mod.y + centerY + dx * Math.sin(radians) + dy * Math.cos(radians);
        // 模板标签的 anchor 是文字对齐（start/middle/end），需映射到
        // LabelObject 的位置型锚点；映射后 start→top_right、end→top_left 与
        // 模板原渲染（textAnchor）语义一致，middle 回落到默认 top。
        const templateTextAnchor = templateLabel.anchor || "middle";
        const labelAnchor: LabelAnchor = templateTextAnchor === "start" ? "top_right" : templateTextAnchor === "end" ? "top_left" : "top";
        additions.push({
          id: `${mod.id}:template-label:${language}`,
          text: language === "zh" ? (mod.customLabel || station?.nameZh || templateLabel.text) : (station?.nameEn || templateLabel.text),
          x: worldX,
          y: worldY,
          fontSize: templateLabel.fontSize || 13,
          anchor: labelAnchor,
          rotation: readableLabelRotation(mod.rotation),
          fill: templateLabel.fill || "#202124",
          fontWeight: language === "zh" ? 700 : 400,
          backgroundMask: true,
          maskStrokeWidth: 3,
          locked: false,
          visible: true,
          layerId: "layer-label",
          zIndex: labels.length + additions.length,
          pageId: mod.pageId || activePageId,
          createdOrder: Date.now() + additions.length,
          attachedToId: mod.id,
          positionMode: "attached",
          offsetX: worldX - mod.x,
          offsetY: worldY - mod.y,
          language,
        });
      }
    }
    if (additions.length) setLabels((previous) => [...previous, ...additions]);
  }, [modules, labels.length, resolvedTemplateMap, templateMap, activePageId, data]);

  // Projects saved before label rotation support retain attached station names at
  // 0 degrees. Align them once with their owning module after loading.
  useEffect(() => {
    const rotationByModuleId = new Map(modules.map((module) => [module.id, readableLabelRotation(module.rotation)]));
    let changed = false;
    const synchronized = labels.map((label) => {
      if (!label.attachedToId) return label;
      const rotation = rotationByModuleId.get(label.attachedToId);
      if (rotation === undefined || label.rotation === rotation) return label;
      changed = true;
      return { ...label, rotation };
    });
    if (changed) setLabels(synchronized);
  }, [modules, labels]);

  // The canvas is finite for export, but grows on demand as users arrange
  // modules beyond its right or bottom edge. Object coordinates stay stable.
  useEffect(() => {
    if (!activePage) return;
    const bounds = [
      ...modules.filter((module) => isOnActivePage(module.pageId)).map((module) => {
        const template = resolvedTemplateMap.get(module.id) || templateMap.get(module.templateId);
        if (!template) return { x: module.x, y: module.y, width: 0, height: 0 };
        const radians = (module.rotation * Math.PI) / 180;
        const width = Math.abs(Math.cos(radians)) * template.width + Math.abs(Math.sin(radians)) * template.height;
        const height = Math.abs(Math.sin(radians)) * template.width + Math.abs(Math.cos(radians)) * template.height;
        return { x: module.x + (template.width - width) / 2, y: module.y + (template.height - height) / 2, width, height };
      }),
      ...platforms.filter((platform) => isOnActivePage(platform.pageId)).map((platform) => ({ x: platform.x, y: platform.y, width: platform.width, height: platform.height })),
      ...graphics.filter((graphic) => isOnActivePage(graphic.pageId)).map((graphic) => ({ x: graphic.x, y: graphic.y, width: graphic.width, height: graphic.height })),
      ...labels.filter((label) => isOnActivePage(label.pageId)).map((label) => ({ x: label.x - 100, y: label.y - 48, width: 200, height: 96 })),
      ...connections.filter((connection) => isOnActivePage(connection.pageId)).flatMap((connection) => connection.controlPoints.map((point) => ({ x: point.x - 32, y: point.y - 32, width: 64, height: 64 }))),
    ];
    const expanded = expandCanvasToFitBounds(activePage, bounds, Math.max(120, pageGridSize * 4));
    if (expanded === activePage) return;
    setPages((previous) => previous.map((page) => page.id === activePageId ? expanded : page));
    setHasUnsavedChanges(true);
  }, [activePage, activePageId, connections, graphics, isOnActivePage, labels, modules, pageGridSize, platforms, resolvedTemplateMap, templateMap]);

  const selectedModules = useMemo(
    () => modules.filter((m) => isOnActivePage(m.pageId) && selectedIds.includes(m.id)),
    [modules, selectedIds, isOnActivePage],
  );

  const placedStationIds = useMemo(() => {
    const set = new Set<string>();
    modules
      .filter((module) => isOnActivePage(module.pageId))
      .forEach((module) => module.sourceStationIds.forEach((id) => set.add(id)));
    return set;
  }, [modules, isOnActivePage]);

  const orderedRenderItems = useMemo(() => {
    const items: CanvasRenderItem[] = [
      ...connections.filter((item) => isOnActivePage(item.pageId)).map((item, creationIndex) => ({ kind: "connection" as const, item, creationIndex: item.createdOrder ?? creationIndex })),
      ...backgroundImages.filter((item) => isOnActivePage(item.pageId)).map((item, creationIndex) => ({ kind: "background" as const, item, creationIndex: item.createdOrder ?? creationIndex })),
      ...modules.filter((item) => isOnActivePage(item.pageId)).map((item, creationIndex) => ({ kind: "module" as const, item, creationIndex: item.createdOrder ?? creationIndex })),
      ...platforms.filter((item) => isOnActivePage(item.pageId)).map((item, creationIndex) => ({ kind: "platform" as const, item, creationIndex: item.createdOrder ?? creationIndex })),
      ...graphics.filter((item) => isOnActivePage(item.pageId)).map((item, creationIndex) => ({ kind: "graphic" as const, item, creationIndex: item.createdOrder ?? creationIndex })),
      ...labels.filter((item) => isOnActivePage(item.pageId)).map((item, creationIndex) => ({ kind: "label" as const, item, creationIndex: item.createdOrder ?? creationIndex })),
      ...transferGroups.filter((item) => isOnActivePage(item.pageId)).map((item, creationIndex) => ({ kind: "transfer" as const, item, creationIndex: item.createdOrder ?? creationIndex })),
    ];
    const ownedPlatformIndex = new Map<string, number>();
    const platformCountByModule = new Map<string, number>();
    for (const platform of platforms) {
      if (!platform.moduleId) continue;
      const index = platformCountByModule.get(platform.moduleId) ?? 0;
      ownedPlatformIndex.set(platform.id, index);
      platformCountByModule.set(platform.moduleId, index + 1);
    }
    const sortableItem = (entry: CanvasRenderItem) => ({
      layerId: entry.item.layerId,
      zIndex: entry.kind === "connection"
        ? effectiveConnectionZIndex(entry.item as ModuleConnection, modules)
        : entry.kind === "platform"
          ? effectivePlatformZIndex(entry.item as PlatformObject, modules, ownedPlatformIndex.get(entry.item.id) ?? 0)
        : entry.item.zIndex,
      creationIndex: entry.creationIndex,
    });
    return items.sort((a, b) => compareRenderOrder(sortableItem(a), sortableItem(b), activeLayerRank, (item) => item.creationIndex));
  }, [connections, backgroundImages, modules, platforms, graphics, labels, transferGroups, activeLayerRank, isOnActivePage]);

  const suppressedTransferLabelIds = useMemo(
    () => duplicateTransferStationLabelIds(labels, transferGroups),
    [labels, transferGroups],
  );

  /** 线路颜色解析：为每个模块/连接/站台/标签预计算颜色规格，并收集渐变定义 */
  const colorSpecs = useMemo(() => {
    const moduleSpecs = new Map<string, ColorSpec>();
    /** 每条轨道的 solid 颜色（与模板 tracks 顺序对齐） */
    const trackColorSpecs = new Map<string, string[]>();
    /** 每个模板站台的填充 spec（与模板 platforms 顺序对齐） */
    const templatePlatformColorSpecs = new Map<string, (ColorSpec | undefined)[]>();
    const connectionSpecs = new Map<string, ColorSpec>();
    const platformSpecs = new Map<string, ColorSpec>();
    /** 站台关联的线路名（用于把"岛式站台"等提示文字替换成线路名） */
    const platformLineNamesMap = new Map<string, string[]>();
    const labelSpecs = new Map<string, ColorSpec>();
    const gradientDefs: GradientDef[] = [];
    const moduleWidth = (modId: string) => {
      const mod = modules.find((candidate) => candidate.id === modId);
      return resolvedTemplateMap.get(modId)?.width ?? (mod ? templateMap.get(mod.templateId)?.width : undefined) ?? 160;
    };
    const moduleTrackBounds = (modId: string) => {
      const template = resolvedTemplateMap.get(modId) || templateMap.get(modules.find((candidate) => candidate.id === modId)?.templateId || "");
      return template ? templateTrackYBounds(template.tracks) : undefined;
    };
    for (const mod of modules) {
      const template = resolvedTemplateMap.get(mod.id) || templateMap.get(mod.templateId);
      const plan = resolveModuleColorPlan(mod, sourceLines, moduleWidth(mod.id), template?.tracks ?? [], template?.platforms ?? [], moduleTrackBounds(mod.id), template?.trackLinePattern);
      moduleSpecs.set(mod.id, plan.sampleSpec);
      trackColorSpecs.set(mod.id, plan.trackColors);
      templatePlatformColorSpecs.set(mod.id, plan.templatePlatformSpecs);
      if (plan.sampleSpec.kind === "gradient" && plan.sampleSpec.gradientDef) gradientDefs.push(plan.sampleSpec.gradientDef);
      for (const platSpec of plan.templatePlatformSpecs) {
        if (platSpec && platSpec.kind === "gradient" && platSpec.gradientDef) gradientDefs.push(platSpec.gradientDef);
      }
    }
    // ── 道岔模块着色：从已连接的模块推导颜色（规则与普通连接相同） ──
    // 两次遍历处理道岔链：第一次给连接着车站的道岔着色，第二次给连接着已着色道岔的道岔着色
    for (let pass = 0; pass < 2; pass++) {
    for (const mod of modules) {
      const template = resolvedTemplateMap.get(mod.id) || templateMap.get(mod.templateId);
      if (!template || template.category !== "turnout") continue;
      // 已有线路绑定的模块跳过（优先使用 lineIds 指定的颜色）
      if (mod.lineIds.length > 0) continue;
      // 用户显式选择了 default/manual 颜色模式时跳过
      const colorMode = mod.trackColorMode ?? "line";
      if (colorMode !== "line") continue;
      // 第二遍只处理尚未着色的道岔
      if (pass > 0 && moduleSpecs.get(mod.id)?.css !== DEFAULT_TRACK_COLOR) continue;

      // 收集每个端口从连接模块获取的颜色
      const portColors = new Map<string, string>();
      for (const conn of connections) {
        const isFrom = conn.fromModuleId === mod.id;
        const isTo = conn.toModuleId === mod.id;
        if (!isFrom && !isTo) continue;

        const myPortId = isFrom ? conn.fromPortId : conn.toPortId;
        const otherModId = isFrom ? conn.toModuleId : conn.fromModuleId;
        const otherSpec = moduleSpecs.get(otherModId);
        if (!otherSpec) continue;

        const otherMod = modules.find((m) => m.id === otherModId);
        if (!otherMod) continue;
        const otherTemplate = resolvedTemplateMap.get(otherMod.id) || templateMap.get(otherMod.templateId);
        if (!otherTemplate) continue;

        const otherPortId = isFrom ? conn.toPortId : conn.fromPortId;
        const otherPort = otherTemplate.ports.find((p) => p.id === otherPortId);
        if (!otherPort) continue;

        const color = sampleSpecAt(otherSpec, otherPort.x, otherPort.y);
        portColors.set(myPortId, color);
      }

      // 所有端口都是默认灰色 → 跳过
      if ([...portColors.values()].every((c) => c.toLowerCase() === DEFAULT_TRACK_COLOR.toLowerCase())) continue;

      // 逐轨着色：端点在端口附近的取端口颜色，两端异色则生成渐变
      const newTrackColors: string[] = [];
      for (let i = 0; i < template.tracks.length; i++) {
        const track = template.tracks[i];
        let startPort: typeof template.ports[0] | undefined;
        let startDist = Infinity;
        let endPort: typeof template.ports[0] | undefined;
        let endDist = Infinity;
        for (const port of template.ports) {
          const d1 = Math.hypot(port.x - track.x1, port.y - track.y1);
          if (d1 < startDist) { startPort = port; startDist = d1; }
          const d2 = Math.hypot(port.x - track.x2, port.y - track.y2);
          if (d2 < endDist) { endPort = port; endDist = d2; }
        }
        const startColor = startPort ? portColors.get(startPort.id) : undefined;
        const endColor = endPort ? portColors.get(endPort.id) : undefined;

        if (startColor && endColor && startColor.toLowerCase() !== endColor.toLowerCase()) {
          const gradId = `grad-turnout-trk-${mod.id}-${i}`;
          gradientDefs.push({
            id: gradId,
            x1: track.x1, y1: track.y1,
            x2: track.x2, y2: track.y2,
            stops: [
              { offset: "0%", color: startColor },
              { offset: "100%", color: endColor },
            ],
          });
          newTrackColors.push(`url(#${gradId})`);
        } else {
          newTrackColors.push(startColor || endColor || DEFAULT_TRACK_COLOR);
        }
      }
      trackColorSpecs.set(mod.id, newTrackColors);

      // 更新模块级颜色规格（供连接采样和标签着色）
      const uniqueColors = [...new Set(portColors.values())];
      if (uniqueColors.length === 1) {
        moduleSpecs.set(mod.id, { css: uniqueColors[0], kind: "solid" });
      } else {
        const coloredPorts = template.ports.filter((p) => portColors.has(p.id));
        const xs = coloredPorts.map((p) => p.x);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        if (maxX > minX) {
          const sorted = coloredPorts.slice().sort((a, b) => a.x - b.x);
          const stops = sorted.map((p, idx) => ({
            offset: `${Math.round((idx / (sorted.length - 1)) * 100)}%`,
            color: portColors.get(p.id)!,
          }));
          const gradDef = {
            id: `grad-turnout-${mod.id}`,
            x1: minX, y1: template.height / 2,
            x2: maxX, y2: template.height / 2,
            stops,
          };
          gradientDefs.push(gradDef);
          moduleSpecs.set(mod.id, { css: `url(#${gradDef.id})`, kind: "gradient" as const, gradientDef: gradDef });
        }
      }
    }
    }
    for (const conn of connections) {
      const endpoints = endpointsForConnection(conn, modules, resolvedTemplateMap);
      if (!endpoints) {
        connectionSpecs.set(conn.id, { css: DEFAULT_TRACK_COLOR, kind: "solid" });
        continue;
      }
      const fromModule = modules.find((candidate) => candidate.id === conn.fromModuleId);
      const toModule = modules.find((candidate) => candidate.id === conn.toModuleId);
      const fromPort = fromModule
        ? (resolvedTemplateMap.get(fromModule.id) || templateMap.get(fromModule.templateId))?.ports.find((candidate) => candidate.id === conn.fromPortId)
        : undefined;
      const toPort = toModule
        ? (resolvedTemplateMap.get(toModule.id) || templateMap.get(toModule.templateId))?.ports.find((candidate) => candidate.id === conn.toPortId)
        : undefined;
      const fromSpec = fromModule ? moduleSpecs.get(fromModule.id) : undefined;
      const toSpec = toModule ? moduleSpecs.get(toModule.id) : undefined;
      const spec = resolveConnectionColor(
        conn.colorMode,
        conn.color,
        fromSpec ? sampleSpecAt(fromSpec, fromPort?.x, fromPort?.y) : DEFAULT_TRACK_COLOR,
        toSpec ? sampleSpecAt(toSpec, toPort?.x, toPort?.y) : DEFAULT_TRACK_COLOR,
        endpoints.from,
        endpoints.to,
        conn.id,
      );
      connectionSpecs.set(conn.id, spec);
      if (spec.kind === "gradient" && spec.gradientDef) gradientDefs.push(spec.gradientDef);
    }
    const modulePlatformsById = new Map<string, PlatformObject[]>();
    for (const platform of platforms) {
      if (platform.moduleId) {
        const list = modulePlatformsById.get(platform.moduleId) || [];
        list.push(platform);
        modulePlatformsById.set(platform.moduleId, list);
      }
    }
    for (const platform of platforms) {
      const ownerMod = platform.moduleId ? modules.find((candidate) => candidate.id === platform.moduleId) : undefined;
      const ownerTemplate = ownerMod ? (resolvedTemplateMap.get(ownerMod.id) || templateMap.get(ownerMod.templateId)) : undefined;
      const spec = resolvePlatformFillColor(platform, modules, sourceLines, undefined, platform.moduleId ? modulePlatformsById.get(platform.moduleId) : undefined,
        ownerTemplate?.tracks, ownerTemplate?.platforms, ownerTemplate?.trackLinePattern);
      platformSpecs.set(platform.id, spec);
      if (spec.kind === "gradient" && spec.gradientDef) gradientDefs.push(spec.gradientDef);
      const lineNames = platformLineNames(platform, modules, sourceLines, platform.moduleId ? modulePlatformsById.get(platform.moduleId) : undefined,
        ownerTemplate?.tracks, ownerTemplate?.platforms, ownerTemplate?.trackLinePattern);
      if (lineNames) platformLineNamesMap.set(platform.id, lineNames);
    }
    for (const label of labels) {
      const ownerMod = label.attachedToId ? modules.find((candidate) => candidate.id === label.attachedToId) : undefined;
      const attachedSpec = label.attachedToId ? moduleSpecs.get(label.attachedToId) : undefined;
      const linkedLine = label.sourceLineId ? sourceLines.find((line) => line.id === label.sourceLineId) : undefined;
      const linkedLineSpec: ColorSpec | undefined = linkedLine?.lineColor
        ? { css: linkedLine.lineColor, kind: "solid" }
        : undefined;
      labelSpecs.set(label.id, resolveLabelFillColor(label, linkedLineSpec || attachedSpec, undefined, ownerMod?.labelColorMode));
    }
    return { moduleSpecs, trackColorSpecs, templatePlatformColorSpecs, connectionSpecs, platformSpecs, platformLineNames: platformLineNamesMap, labelSpecs, gradientDefs };
  }, [modules, connections, platforms, labels, sourceLines, resolvedTemplateMap, templateMap]);
  /** 屏幕坐标 → 世界坐标 */
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.panX) / viewport.scale,
      y: (clientY - rect.top - viewport.panY) / viewport.scale,
    };
  }, [viewport]);

  /** 计算可见区域的世界坐标范围 */
  const visibleBounds = useMemo(() => {
    const svg = svgRef.current;
    const w = svg?.clientWidth || 800;
    const h = svg?.clientHeight || 600;
    return {
      left: -viewport.panX / viewport.scale,
      top: -viewport.panY / viewport.scale,
      right: (w - viewport.panX) / viewport.scale,
      bottom: (h - viewport.panY) / viewport.scale,
    };
  }, [viewport]);

  /** 网格线 */
  const gridLines = useMemo(() => {
    if (!showGrid) return { v: [] as number[], h: [] as number[] };
    const start = Math.max(0, Math.floor(visibleBounds.left / pageGridSize) * pageGridSize);
    const end = Math.min(pageWidth, Math.ceil(visibleBounds.right / pageGridSize) * pageGridSize);
    const top = Math.max(0, Math.floor(visibleBounds.top / pageGridSize) * pageGridSize);
    const bot = Math.min(pageHeight, Math.ceil(visibleBounds.bottom / pageGridSize) * pageGridSize);
    const v: number[] = [];
    const h: number[] = [];
    for (let x = start; x <= end; x += pageGridSize) v.push(x);
    for (let y = top; y <= bot; y += pageGridSize) h.push(y);
    return { v, h };
  }, [showGrid, visibleBounds, pageGridSize, pageWidth, pageHeight]);

  const activeFilterLineIds = useMemo(() => {
    return [...expandServicePatternFilter(filterLineIds, activeServicePatternId ? [activeServicePatternId] : [], servicePatterns)];
  }, [servicePatterns, activeServicePatternId, filterLineIds]);

  /** 线路筛选：判断模块是否可见 */
  const isModuleVisible = useCallback((mod: DiagramModule) => {
    if (activeFilterLineIds.length === 0) return true;
    if (mod.lineIds.length === 0) return true;
    return mod.lineIds.some((id) => activeFilterLineIds.includes(id));
  }, [activeFilterLineIds]);

  /** 图层是否可见（树形：自身 + 所有祖先可见） */
  const isLayerVisible = useCallback((layerId: string) => {
    return isLayerTreeVisible(layers, layerId);
  }, [layers]);

  /** 图层是否锁定（树形：自身或任一祖先锁定） */
  const isLayerLocked = useCallback((layerId: string) => {
    return isLayerTreeLocked(layers, layerId);
  }, [layers]);

  function updateFilters(patch: Partial<FilterState>) {
    history.captureSnapshot("修改筛选条件");
    setFilterState((prev) => ({ ...prev, ...patch }));
    setHasUnsavedChanges(true);
  }

  // ── 模块操作 ──

  /** 放置模块 */
  function placeModule(worldX: number, worldY: number, templateId = activeTemplateId, sourceStationId = pendingStationId) {
    if (!templateId) return;
    const template = templateMap.get(templateId);
    if (!template) return;
    const x = snapEnabled ? snapToGrid(worldX, pageGridSize) : Math.round(worldX);
    const y = snapEnabled ? snapToGrid(worldY, pageGridSize) : Math.round(worldY);
    // If binding to a station, auto-assign its lineId
    const station = sourceStationId ? data?.stations.find((candidate) => candidate.id === sourceStationId) : undefined;
    const stationLineId = station?.lineId;
    const mod: DiagramModule = {
      id: genId("mod"),
      templateId,
      name: template.name,
      x,
      y,
      rotation: placementRotation,
      mirrorX: placementMirrorX,
      mirrorY: placementMirrorY,
      lineIds: station ? Array.from(new Set([station.lineId, ...(station.throughLineIds || [])])) : [],
      sourceStationIds: sourceStationId ? [sourceStationId] : [],
      locked: false,
      layerId: resolvePlacementLayer(defaultModuleLayerId(template, { lineIds: station ? [station.lineId] : [] }, data?.lines || sourceLines)),
      zIndex: placementZIndex,
      pageId: activePageId,
      createdOrder: Date.now(),
    };
    // Also set customLabel to the station name if available
    if (sourceStationId) {
      if (station) mod.customLabel = station.nameZh;
    }
    // 初始化道岔参数默认值
    if (template.params && template.params.length > 0) {
      mod.customParams = Object.fromEntries(template.params.map(p => [p.key, p.default]));
    }
    if (snapEnabled) {
      const aligned = alignModuleToExistingTracks(mod);
      mod.x = aligned.x;
      mod.y = aligned.y;
    }
    const moduleLocalPoint = (localX: number, localY: number) => {
      // 镜像在模块局部坐标中先作用，再旋转到世界坐标（与渲染/端口一致）。
      const mirroredX = mod.mirrorX ? template.width - localX : localX;
      const mirroredY = mod.mirrorY ? template.height - localY : localY;
      const radians = (mod.rotation * Math.PI) / 180;
      const pivotX = mod.x + template.width / 2;
      const pivotY = mod.y + template.height / 2;
      const dx = mod.x + mirroredX - pivotX;
      const dy = mod.y + mirroredY - pivotY;
      return { x: pivotX + dx * Math.cos(radians) - dy * Math.sin(radians), y: pivotY + dx * Math.sin(radians) + dy * Math.cos(radians) };
    };
    // 捕获历史快照（放置模块 + 可能的自动连接作为一个事务）
    history.captureSnapshot(`放置「${template.name}」`);
    setModules((prev) => [...prev, mod]);
    const newPlatforms: PlatformObject[] = template.platforms.map((platform, index) => {
      const center = moduleLocalPoint(platform.x + platform.width / 2, platform.y + platform.height / 2);
      return { id: genId("platform"), moduleId: mod.id, sourceStationId: sourceStationId || undefined, sourceLineId: stationLineId, platformType: "island", attachedTrackIds: [], x: center.x - platform.width / 2, y: center.y - platform.height / 2, width: platform.width, height: platform.height, rotation: mod.rotation, fill: "#D7B06A", label: platform.label, layerId: defaultPlatformLayerId(template.id), zIndexMode: "auto", zIndex: mod.zIndex + index, pageId: activePageId, createdOrder: Date.now(), visible: true, locked: false };
    });
    setPlatforms((prev) => [...prev, ...newPlatforms]);
    if (station) {
      const stationLabel = template.labels.find((label) => label.text === "站名");
      const labelPoint = moduleLocalPoint(stationLabel?.x ?? template.width / 2, stationLabel?.y ?? -10);
      const labelX = labelPoint.x;
      const labelY = labelPoint.y;
      const stationLabels: LabelObject[] = [{
        id: genId("label"), text: station.nameZh, x: labelX, y: labelY,
        fontSize: stationLabel?.fontSize || 13, anchor: "top", rotation: readableLabelRotation(mod.rotation), fill: stationLabel?.fill || "#202124", fontWeight: 700,
        backgroundMask: true, maskStrokeWidth: 3, locked: false, visible: true, layerId: "layer-label", zIndex: labels.length,
        pageId: activePageId, createdOrder: Date.now(), attachedToId: mod.id, positionMode: "attached", offsetX: labelX - mod.x, offsetY: labelY - mod.y,
        sourceStationId: station.id, language: "zh",
      }];
      if (station.nameEn) {
        // 英文站名放在模板设计的 "Station" 标签位置（站台下方），而不是 stationLabel.y + 16。
        // 旧逻辑把英文名放在中文名下方 16px，恰好压在站台矩形上，导致"站点遮挡文字"。
        const englishLabel = template.labels.find((label) => label.text === "Station");
        const englishPoint = moduleLocalPoint(
          englishLabel?.x ?? stationLabel?.x ?? template.width / 2,
          englishLabel?.y ?? (stationLabel?.y ?? -10) + 16,
        );
        stationLabels.push({
          ...stationLabels[0], id: genId("label"), text: station.nameEn, x: englishPoint.x, y: englishPoint.y, fontSize: Math.max(9, (stationLabel?.fontSize || 13) - 3), fontWeight: 400,
          zIndex: labels.length + 1, createdOrder: Date.now() + 1, offsetX: englishPoint.x - mod.x, offsetY: englishPoint.y - mod.y, language: "en",
        });
      }
      const stationGraphics: AttachedGraphic[] = [];
      const iconAsset = findAssetByFilename(assets, station.icon);
      if (iconAsset?.dataUrl) {
        const graphicCenter = moduleLocalPoint(template.width / 2, -26);
        const graphicX = graphicCenter.x - 16;
        const graphicY = graphicCenter.y - 16;
        stationGraphics.push({ id: genId("graphic"), assetId: iconAsset.id, attachedToId: mod.id, positionMode: "attached", offsetX: graphicX - mod.x, offsetY: graphicY - mod.y, x: graphicX, y: graphicY, width: 32, height: 32, rotation: mod.rotation, mirrorX: mod.mirrorX, mirrorY: mod.mirrorY, opacity: 1, layerId: "layer-icon", zIndex: graphics.length, pageId: activePageId, visible: true, locked: false, createdOrder: Date.now() });
      }
      // 新站名/图标与既有元素一起参与自动避让，避免图标遮挡站名（尤其换乘站），
      // 平台作为固定障碍物参与，避免站名/图标压到站台上（"站点遮挡文字"）。
      const avoidance = resolveLabelIconOverlaps({
        modules: [...modules, mod],
        labels: [...labels, ...stationLabels],
        graphics: [...graphics, ...stationGraphics],
        platforms: [...platforms, ...newPlatforms],
        activePageId,
        ignoredLabelIds: duplicateTransferStationLabelIds([...labels, ...stationLabels], transferGroupsRef.current),
      });
      setLabels(avoidance.labels);
      setGraphics(avoidance.graphics);
    }
    setSelectedIds([mod.id]);
    setHasUnsavedChanges(true);
    setStatus(sourceStationId ? `已放置「${template.name}」并关联站点` : `已放置「${template.name}」`);
    if (sourceStationId) {
      const placementChangeIds = unresolvedChanges.filter((change) => change.entityType === "station" && change.entityId === sourceStationId && change.requiresPlacement).map((change) => change.id);
      if (placementChangeIds.length) setUnresolvedChanges((prev) => updateSourceChangeStatus(prev, placementChangeIds, "accepted"));
      setPendingPlacement(null);
    }
    setPendingStationId(null);

    // 自动连接
    if (autoConnect) {
      tryAutoConnect(mod, template);
    }

    // 非连续放置模式时，放置后切回默认工具（自动）
    if (!continuousPlace) {
      setActiveTool("auto");
      setActiveTemplateId(null);
    }
  }

  /** 端口是否相向：离开方向不能背离目标，到达方向不能背离起点。
   *  允许 90° 转弯等斜向端口，但拒绝背对背端口（会逼出 U 形回折导致交叉）。 */
  function portsFaceEachOther(
    from: { x: number; y: number; direction: number },
    to: { x: number; y: number; direction: number },
  ): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const chordLength = Math.hypot(dx, dy);
    if (chordLength < 1e-6) return true;
    const chordX = dx / chordLength;
    const chordY = dy / chordLength;
    const unit = (angle: number) => {
      const radians = (angle * Math.PI) / 180;
      return { x: Math.cos(radians), y: Math.sin(radians) };
    };
    const fromUnit = unit(from.direction);
    const toUnit = unit(to.direction);
    // 离开方向沿弦正向的投影：>0 朝目标前进；明显掉头（< -0.6）拒绝。
    const forward = fromUnit.x * chordX + fromUnit.y * chordY;
    // 到达方向沿反向弦的投影：>0 朝起点方向；明显掉头（< -0.6）拒绝。
    const backward = toUnit.x * -chordX + toUnit.y * -chordY;
    return forward > -0.6 && backward > -0.6;
  }

  /** 端口对连线在跨轴方向的偏移（横向端口取 y 差、纵向端口取 x 差）；两端轴向不同则无法判定。 */
  function crossAxisOffset(
    a: { x: number; y: number; direction: number },
    b: { x: number; y: number; direction: number },
  ): number | null {
    const axisOf = (direction: number) => {
      const normalized = ((direction % 360) + 360) % 360;
      return normalized === 90 || normalized === 270 ? "vertical" : "horizontal";
    };
    const axis = axisOf(a.direction);
    if (axisOf(b.direction) !== axis) return null;
    return axis === "vertical" ? b.x - a.x : b.y - a.y;
  }

  /** 两条连接弦（直线段）是否相交，含端点恰好落在对方线段上的触碰。 */
  function segmentsCross(
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
    d: { x: number; y: number },
  ): boolean {
    const orient = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
      (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const onSeg = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
      q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;
    if ((o1 === 0 && onSeg(a, c, b)) || (o2 === 0 && onSeg(a, d, b)) || (o3 === 0 && onSeg(c, a, d)) || (o4 === 0 && onSeg(c, b, d))) return true;
    return false;
  }

  /** 连接在给定连接集合上下文中的渲染路径（与画布显示逻辑一致），供自动连线的渲染级交叉检测复用。 */
  function renderedPathFor(
    conn: ModuleConnection,
    conns: ModuleConnection[],
    mods: DiagramModule[],
    tpls: Map<string, ModuleTemplate>,
  ): string | null {
    const geometry = geometryForConnection(conn, conns, mods, tpls);
    const from = getConnectionEndpoint(conn.fromModuleId, conn.fromPortId, mods, tpls);
    const to = getConnectionEndpoint(conn.toModuleId, conn.toPortId, mods, tpls);
    if (!from || !to) return null;
    const fromPos = worldPortPosition(from.module, from.template, from.portId);
    const toPos = worldPortPosition(to.module, to.template, to.portId);
    const endpoints = geometry || {
      from: { x: fromPos.x, y: fromPos.y },
      to: { x: toPos.x, y: toPos.y },
      fromDir: fromPos.direction,
      toDir: toPos.direction,
    };
    const controlPoints = geometry?.controlPoints || conn.controlPoints;
    const pairedConnection = findPairedConnection(conn, conns, mods, tpls);
    const pairedEndpoints = pairedConnection ? endpointsForConnection(pairedConnection, mods, tpls) : undefined;
    const pairedOffsetPath = conn.autoCurve !== false && pairedConnection?.autoCurve !== false && pairedEndpoints
      ? buildPairedOffsetPathD(endpoints, pairedEndpoints)
      : null;
    if (pairedOffsetPath) return pairedOffsetPath;
    if (controlPoints.length > 0) {
      return buildControlPointPathD(endpoints.from, endpoints.to, controlPoints, endpoints.fromDir, endpoints.toDir);
    }
    return `M${endpoints.from.x},${endpoints.from.y} L${endpoints.to.x},${endpoints.to.y}`;
  }

  /** 尝试自动连接到附近模块（相向端口优先成双连接，双线整对一起连） */
  function tryAutoConnect(newMod: DiagramModule, template: ModuleTemplate) {
    const connectionModules = [...modules, newMod];
    const connectionTemplates = resolveTemplatesFor(connectionModules);
    const newTemplate = connectionTemplates.get(newMod.id) || template;
    const createdConnections: ModuleConnection[] = [];
    let connectedToName = "";

    /** 查找“补齐轨道”的端口：在 from 模块的端口里，找能连到 to 模块指定端口、相向且最近的非占位端口（排除 fromPortId）。 */
    function findCompletingPort(
      fromMod: DiagramModule,
      fromTemplate: ModuleTemplate,
      toMod: DiagramModule,
      toTemplate: ModuleTemplate,
      toPort: ModulePort,
      fromPortId: string,
    ): ModulePort | null {
      const toWorld = worldPortPosition(toMod, toTemplate, toPort.id);
      let best: ModulePort | null = null;
      let bestDistance = Infinity;
      for (const port of fromTemplate.ports) {
        if (port.id === fromPortId) continue;
        const portWorld = worldPortPosition(fromMod, fromTemplate, port.id);
        const distance = Math.hypot(portWorld.x - toWorld.x, portWorld.y - toWorld.y);
        if (distance >= PORT_SNAP_RADIUS * 3) continue;
        if (!portsFaceEachOther(portWorld, toWorld)) continue;
        const fromEndpoint = getConnectionEndpoint(fromMod.id, port.id, connectionModules, connectionTemplates);
        const toEndpoint = getConnectionEndpoint(toMod.id, toPort.id, connectionModules, connectionTemplates);
        if (!fromEndpoint || !toEndpoint) continue;
        if (!validateConnection(fromEndpoint, toEndpoint, [...connections, ...createdConnections]).valid) continue;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = port;
        }
      }
      return best;
    }

    for (const other of modules) {
      if (other.id === newMod.id) continue;
      if (!isOnActivePage(other.pageId)) continue;
      const otherTemplate = connectionTemplates.get(other.id) || templateMap.get(other.templateId);
      if (!otherTemplate) continue;

      // 收集所有相向且在吸附范围内的候选端口对。
      const candidates: {
        from: NonNullable<ReturnType<typeof getConnectionEndpoint>>;
        to: NonNullable<ReturnType<typeof getConnectionEndpoint>>;
        distance: number;
        /** 双线整对是否“并行不汇聚”（候选 + 配对端口的跨轴偏移同号/近乎零），即直线连接成立。 */
        goodDouble: boolean;
        /** 双线整对的两根轨道是否在中间相交叉（弦相交或相切）。转角/翻转时交叉角色的弦呈 X 形或一端搭在对侧弦上，
         *  视觉上两根轨道交叉，应避免优先选择；并行双线（含 180° 换轨的直线连接）弦不相交。 */
        braided: boolean;
        npWorld: { x: number; y: number };
        opWorld: { x: number; y: number };
      }[] = [];
      for (const np of newTemplate.ports) {
        const npWorld = worldPortPosition(newMod, newTemplate, np.id);
        for (const op of otherTemplate.ports) {
          const opWorld = worldPortPosition(other, otherTemplate, op.id);
          const distance = Math.hypot(npWorld.x - opWorld.x, npWorld.y - opWorld.y);
          if (distance >= PORT_SNAP_RADIUS * 3) continue;
          if (!portsFaceEachOther(npWorld, opWorld)) continue;
          const from = getConnectionEndpoint(newMod.id, np.id, connectionModules, connectionTemplates);
          const to = getConnectionEndpoint(other.id, op.id, connectionModules, connectionTemplates);
          if (!from || !to) continue;
          if (!validateConnection(from, to, [...connections, ...createdConnections]).valid) continue;
          // 双线整对是否直线连接：两端配对端口相向可连，且两根轨道的跨轴偏移一致
          // （同号=两根平行不交汇；180° 翻转模块因上下行换位，直线连接恰好是交叉角色）。
          const npPartner = findDoubleTrackPartner(newTemplate, np);
          const opPartner = findDoubleTrackPartner(otherTemplate, op);
          let goodDouble = false;
          let braided = false;
          const npPartnerWorld = npPartner ? worldPortPosition(newMod, newTemplate, npPartner.id) : null;
          const opPartnerWorld = opPartner ? worldPortPosition(other, otherTemplate, opPartner.id) : null;
          if (npPartner && opPartner) {
            const npPartnerEndpoint = getConnectionEndpoint(newMod.id, npPartner.id, connectionModules, connectionTemplates);
            const opPartnerEndpoint = getConnectionEndpoint(other.id, opPartner.id, connectionModules, connectionTemplates);
            if (npPartnerEndpoint && opPartnerEndpoint
              && Math.hypot(npPartnerWorld!.x - opPartnerWorld!.x, npPartnerWorld!.y - opPartnerWorld!.y) < PORT_SNAP_RADIUS * 3
              && portsFaceEachOther(npPartnerWorld!, opPartnerWorld!)
              && validateConnection(npPartnerEndpoint, opPartnerEndpoint, [...connections, ...createdConnections]).valid) {
              const offset1 = crossAxisOffset(npWorld, opWorld);
              const offset2 = crossAxisOffset(npPartnerWorld!, opPartnerWorld!);
              goodDouble = offset1 === null || offset2 === null
                || Math.sign(offset1) === Math.sign(offset2) || Math.abs(offset1) < 4 || Math.abs(offset2) < 4;
              braided = segmentsCross(npWorld, opWorld, npPartnerWorld!, opPartnerWorld!);
            }
          } else if (npPartner || opPartner) {
            // 只有一侧有双线配对端口（如站台的 R_up/R_dn），另一侧是道岔主线/支线这样的非配对端口。
            // 补齐轨道由未配对侧最近、相向可连的端口决定；若补齐弦与当前弦相交，先选当前候选会把
            // 配对钉死成视觉交叉，故标 braided，让不交叉的组合（主线接下行、支线接上行）优先。
            const completing = npPartner
              ? findCompletingPort(other, otherTemplate, newMod, newTemplate, npPartner, op.id)
              : findCompletingPort(newMod, newTemplate, other, otherTemplate, opPartner!, np.id);
            if (completing) {
              const completingWorld = npPartner
                ? worldPortPosition(other, otherTemplate, completing.id)
                : worldPortPosition(newMod, newTemplate, completing.id);
              braided = segmentsCross(npWorld, opWorld, completingWorld, (npPartner ? npPartnerWorld : opPartnerWorld)!);
            }
          }
          candidates.push({ from, to, distance, goodDouble, braided, npWorld, opWorld });
        }
      }
      if (candidates.length === 0) continue;
      // 优先连“并行不相交的双线整对”（覆盖 180° 翻转后的换轨直线连接与转角平行转向），
      // 其次直线整对，其余按距离兜底。交叉的整对（弦相交叉）最后，避免视觉上两根轨道交织。
      candidates.sort((a, b) => {
        if (a.braided !== b.braided) return a.braided ? 1 : -1;
        if (a.goodDouble !== b.goodDouble) return a.goodDouble ? -1 : 1;
        return a.distance - b.distance;
      });

      // 渲染级交叉避让：新候选先按画布显示逻辑渲染成路径，若与任何已保留的轨道相交则跳过。
      // 这保证一次自动连线产出的连接集两两不相交（"绝不出交叉"）——干净连接照常保留，会交叉
      // 的那根单独丢弃。比弦相交检查更准确：曲线能从双轨间隙穿过时不误杀，弦不相交但曲线
      // 相交的却能抓住。
      const createdPaths: (string | null)[] = [];

      for (const candidate of candidates) {
        if (!validateConnection(candidate.from, candidate.to, [...connections, ...createdConnections]).valid) continue;
        const conn = makeConnection(candidate.from, candidate.to, connectionModules);
        // 双线整对连接：若两端都有配对的 up/dn 端口且相向，则立刻把另一根也连上。
        const fromPartner = findDoubleTrackPartner(newTemplate, candidate.from.port);
        const toPartner = findDoubleTrackPartner(otherTemplate, candidate.to.port);
        let partnerConn: ModuleConnection | null = null;
        if (fromPartner && toPartner) {
          const fromPartnerEndpoint = getConnectionEndpoint(newMod.id, fromPartner.id, connectionModules, connectionTemplates);
          const toPartnerEndpoint = getConnectionEndpoint(other.id, toPartner.id, connectionModules, connectionTemplates);
          const fromPartnerWorld = worldPortPosition(newMod, newTemplate, fromPartner.id);
          const toPartnerWorld = worldPortPosition(other, otherTemplate, toPartner.id);
          if (fromPartnerEndpoint && toPartnerEndpoint
            && Math.hypot(fromPartnerWorld.x - toPartnerWorld.x, fromPartnerWorld.y - toPartnerWorld.y) < PORT_SNAP_RADIUS * 3
            && portsFaceEachOther(fromPartnerWorld, toPartnerWorld)
            && validateConnection(fromPartnerEndpoint, toPartnerEndpoint, [...connections, ...createdConnections]).valid) {
            partnerConn = makeConnection(fromPartnerEndpoint, toPartnerEndpoint, connectionModules);
          }
        }
        // 在"已保留 + 本候选(+配对)"的最终上下文里渲染本候选，交叉检测结果与画布显示一致。
        const tentative = [...connections, ...createdConnections, conn];
        if (partnerConn) tentative.push(partnerConn);
        const path = renderedPathFor(conn, tentative, connectionModules, connectionTemplates);
        const partnerPath = partnerConn ? renderedPathFor(partnerConn, tentative, connectionModules, connectionTemplates) : null;
        if ((path && createdPaths.some((existing) => existing && pathsCross(existing, path)))
          || (partnerPath && createdPaths.some((existing) => existing && pathsCross(existing, partnerPath)))
          // 配对两根自身也相交时（弦不相交但曲线相交），整对丢弃——否则第一对会因
          // createdPaths 为空而漏检。
          || (path && partnerPath && pathsCross(path, partnerPath))) {
          continue; // 会交叉 → 跳过，保留干净子集
        }
        createdConnections.push(conn);
        createdPaths.push(path);
        connectedToName = other.name;
        if (partnerConn) {
          createdConnections.push(partnerConn);
          createdPaths.push(partnerPath);
        }
      }
    }

    if (createdConnections.length > 0) {
      setConnections((prev) => [...prev, ...createdConnections]);
      setStatus(`已自动连接「${newMod.name}」→「${connectedToName}」（${createdConnections.length} 条轨道）`);
    }
  }

  /** 删除选中模块或标签 */
  function toggleOwnerModuleSelection(ownerModuleId: string) {
    const childOwners = [
      ...platforms.map((platform) => ({ id: platform.id, ownerModuleId: platform.moduleId })),
      ...labels.map((label) => ({ id: label.id, ownerModuleId: label.positionMode === "attached" ? label.attachedToId : undefined })),
      ...graphics.map((graphic) => ({ id: graphic.id, ownerModuleId: graphic.positionMode === "attached" ? graphic.attachedToId : undefined })),
    ];
    setSelectedIds((prev) => toggleOwnedModuleSelection(prev, ownerModuleId, childOwners));
  }

  function deleteSelected() {
    if (!selectedIds.length) return;
    const toDelete = new Set(selectedIds);
    // 检查是否有选中的模块
    const hasModules = modules.some((m) => toDelete.has(m.id));
    const hasLabels = labels.some((l) => toDelete.has(l.id));
    history.captureSnapshot(`删除${selectedIds.length > 1 ? `${selectedIds.length}个对象` : "对象"}`);
    if (hasModules) {
      setModules((prev) => prev.filter((m) => !toDelete.has(m.id)));
      setConnections((prev) => prev.filter((c) => !toDelete.has(c.fromModuleId) && !toDelete.has(c.toModuleId)));
    }
    if (hasLabels || hasModules) setLabels((prev) => prev.filter((label) => !toDelete.has(label.id) && !toDelete.has(label.attachedToId || "")));
    // 删除背景图
    setBackgroundImages((prev) => prev.filter((b) => !toDelete.has(b.id)));
    setPlatforms((prev) => prev.filter((platform) => !toDelete.has(platform.id) && !toDelete.has(platform.moduleId || "")));
    setGraphics((prev) => prev.filter((graphic) => !toDelete.has(graphic.id) && !toDelete.has(graphic.attachedToId || "")));
    // 删除换乘组，并清理成员模块已删除的引用
    setTransferGroups((prev) => prev
      .filter((g) => !toDelete.has(g.id))
      .map((g) => g.moduleIds.some((mid) => toDelete.has(mid))
        ? { ...g, moduleIds: g.moduleIds.filter((mid) => !toDelete.has(mid)) }
        : g));
    setSelectedIds([]);
    setHasUnsavedChanges(true);
    setStatus("已删除选中对象");
  }

  /** 更新模块属性（捕获历史快照，用于非高频操作如旋转、锁定、图层切换） */
  function updateModule(id: string, patch: Partial<DiagramModule>, operationName?: string) {
    const current = modules.find((item) => item.id === id);
    if (!current || isLayerLocked(current.layerId)) {
      setStatus("所属图层已锁定，无法修改模块");
      return;
    }
    if (patch.layerId === undefined && (patch.templateId !== undefined || patch.lineIds !== undefined)) {
      const currentTemplate = templateMap.get(current.templateId);
      const nextTemplate = templateMap.get(patch.templateId ?? current.templateId);
      const currentDefaultLayer = defaultModuleLayerId(currentTemplate, current, sourceLines);
      if (current.layerId === currentDefaultLayer) {
        patch = { ...patch, layerId: defaultModuleLayerId(nextTemplate, { lineIds: patch.lineIds ?? current.lineIds }, sourceLines) };
      }
    }
    const opName = operationName || "修改属性";
    history.captureSnapshot(opName);
    const updatedModules = modules.map((module) => (module.id === id ? { ...module, ...patch } : module));
    const updatedModule = updatedModules.find((module) => module.id === id)!;
    setModules(updatedModules);
    let nextLabels = labels;
    let nextGraphics = graphics;
    let nextPlatforms = platforms;
    let labelsOrGraphicsChanged = false;
    if (typeof patch.rotation === "number") {
      const template = resolvedTemplateMap.get(current.id) || templateMap.get(current.templateId);
      if (template) {
        const rotated = rotateModuleOwnedObjects({ module: current, template, nextRotation: patch.rotation, platforms, labels, graphics });
        setPlatforms(rotated.platforms);
        nextPlatforms = rotated.platforms;
        nextLabels = rotated.labels;
        nextGraphics = rotated.graphics;
        labelsOrGraphicsChanged = true;
      }
    }
    if (typeof patch.mirrorX === "boolean" || typeof patch.mirrorY === "boolean") {
      const template = resolvedTemplateMap.get(current.id) || templateMap.get(current.templateId);
      if (template) {
        const mirrored = mirrorModuleOwnedObjects({
          module: current,
          template,
          nextMirrorX: patch.mirrorX ?? !!current.mirrorX,
          nextMirrorY: patch.mirrorY ?? !!current.mirrorY,
          platforms: nextPlatforms,
          labels: nextLabels,
          graphics: nextGraphics,
        });
        setPlatforms(mirrored.platforms);
        nextPlatforms = mirrored.platforms;
        nextLabels = mirrored.labels;
        nextGraphics = mirrored.graphics;
        labelsOrGraphicsChanged = true;
      }
    }
    if (patch.customParams) {
      const previousTemplate = resolvedTemplateMap.get(current.id) || templateMap.get(current.templateId);
      const nextTemplate = resolveTemplatesFor(updatedModules).get(id) || templateMap.get(updatedModule.templateId);
      if (previousTemplate?.platforms.length && nextTemplate?.platforms.length) {
        const radians = (updatedModule.rotation * Math.PI) / 180;
        const pivot = { x: updatedModule.x + nextTemplate.width / 2, y: updatedModule.y + nextTemplate.height / 2 };
        const rotateLocalCenter = (layout: { x: number; y: number; width: number; height: number }) => {
          const x = updatedModule.x + layout.x + layout.width / 2;
          const y = updatedModule.y + layout.y + layout.height / 2;
          const dx = x - pivot.x;
          const dy = y - pivot.y;
          return { x: pivot.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: pivot.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
        };
        let platformIndex = 0;
        nextPlatforms = nextPlatforms.map((platform) => {
          if (platform.moduleId !== id) return platform;
          const layout = nextTemplate.platforms[platformIndex++];
          if (!layout) return platform;
          const center = rotateLocalCenter(layout);
          return {
            ...platform,
            x: center.x - layout.width / 2,
            y: center.y - layout.height / 2,
            width: layout.width,
            height: layout.height,
            rotation: updatedModule.rotation,
          };
        });
        setPlatforms(nextPlatforms);
      }
    }
    if (patch.templateId && patch.templateId !== current.templateId) {
      // 模板切换：站台/站名/图标按新模板重建，否则切换只变轨道、站台不更新（看起来"没有效果"）。
      const nextTemplate = resolveTemplatesFor(updatedModules).get(id) || templateMap.get(updatedModule.templateId);
      if (nextTemplate) {
        const previousTemplate = resolvedTemplateMap.get(current.id) || templateMap.get(current.templateId);
        const relaid = relayoutModuleOwnedObjects({
          module: updatedModule,
          nextTemplate,
          previousTemplate,
          platforms,
          labels,
          graphics,
          nextId: genId,
        });
        setPlatforms(relaid.platforms);
        nextPlatforms = relaid.platforms;
        nextLabels = relaid.labels;
        nextGraphics = relaid.graphics;
        labelsOrGraphicsChanged = true;
      }
    }
    if (typeof patch.x === "number" || typeof patch.y === "number") {
      const dx = (patch.x ?? current.x) - current.x; const dy = (patch.y ?? current.y) - current.y;
      nextLabels = nextLabels.map((label) => label.positionMode === "attached" && label.attachedToId === id ? { ...label, x: label.x + dx, y: label.y + dy } : label);
      nextGraphics = nextGraphics.map((graphic) => graphic.positionMode === "attached" && graphic.attachedToId === id ? { ...graphic, x: graphic.x + dx, y: graphic.y + dy } : graphic);
      nextPlatforms = nextPlatforms.map((platform) => platform.moduleId === id ? { ...platform, x: platform.x + dx, y: platform.y + dy } : platform);
      setPlatforms(nextPlatforms);
      labelsOrGraphicsChanged = true;
    }
    if (labelsOrGraphicsChanged) {
      // 模块几何变化后站名/图标可能相互遮挡（尤其换乘站），重新求解避让。
      // 平台作为固定障碍物参与，避免站名/图标压到站台上。
      const avoidance = resolveLabelIconOverlaps({ modules: updatedModules, labels: nextLabels, graphics: nextGraphics, platforms: nextPlatforms, activePageId, ignoredLabelIds: duplicateTransferStationLabelIds(nextLabels, transferGroupsRef.current) });
      setLabels(avoidance.labels);
      setGraphics(avoidance.graphics);
    }
    // 模块 zIndex 变化时同步站台的相对层级；图层本身不再同步，因为轨道与站台
    // 分属不同的语义图层，强制同步会把站台重新塞回轨道图层。
    if (typeof patch.zIndex === "number" && patch.zIndex !== current.zIndex) {
      nextPlatforms = shiftOwnedPlatformZIndex(nextPlatforms, id, patch.zIndex - current.zIndex);
      setPlatforms(nextPlatforms);
    }
    setConnections((prev) => {
      const automaticallyLayered = patch.lineIds === undefined ? prev : prev.map((connection) => {
        if (connection.layerId !== "layer-track-main" && connection.layerId !== "layer-track-tram") return connection;
        if (connection.fromModuleId !== id && connection.toModuleId !== id) return connection;
        return {
          ...connection,
          layerId: defaultConnectionLayerId(
            updatedModules.find((module) => module.id === connection.fromModuleId),
            updatedModules.find((module) => module.id === connection.toModuleId),
            sourceLines,
          ),
        };
      });
      return synchronizeConnectionTracks(automaticallyLayered, updatedModules, resolveTemplatesFor(updatedModules));
    });
    setHasUnsavedChanges(true);
  }

  function updatePlatform(id: string, patch: Partial<PlatformObject>, operationName = "调整站台") {
    const current = platforms.find((platform) => platform.id === id);
    if (!current || isLayerLocked(current.layerId)) return;
    history.captureSnapshot(operationName);
    setPlatforms((prev) => prev.map((platform) => platform.id === id ? { ...platform, ...patch } : platform));
    setHasUnsavedChanges(true);
  }

  function deletePlatform(id: string) {
    history.captureSnapshot("删除站台");
    setPlatforms((prev) => prev.filter((platform) => platform.id !== id));
    setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
    setHasUnsavedChanges(true);
  }

  function updateGraphic(id: string, patch: Partial<AttachedGraphic>, operationName = "修改图标") {
    const current = graphics.find((graphic) => graphic.id === id);
    if (!current || isLayerLocked(current.layerId)) return;
    const next: AttachedGraphic = { ...current, ...patch };
    if (next.positionMode === "independent") {
      next.attachedToId = undefined;
      next.offsetX = 0;
      next.offsetY = 0;
    } else {
      const owner = modules.find((module) => module.id === next.attachedToId);
      if (owner) {
        next.offsetX = next.x - owner.x;
        next.offsetY = next.y - owner.y;
      }
    }
    history.captureSnapshot(operationName);
    setGraphics((prev) => prev.map((graphic) => graphic.id === id ? next : graphic));
    setHasUnsavedChanges(true);
  }

  // ── 背景图操作 ──

  /** 导入背景图文件 */
  function handleBgImageImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const bgObj: BackgroundImageObject = {
          id: genId("bgimg"),
          src,
          name: file.name,
          x: snapToGrid(-viewport.panX / viewport.scale + 100, pageGridSize),
          y: snapToGrid(-viewport.panY / viewport.scale + 60, pageGridSize),
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          previewSrc: createBackgroundPreview(img),
          scale: Math.min(1, 800 / img.naturalWidth),
          rotation: 0,
          opacity: tracingMode ? 0.4 : 0.6,
          locked: false,
          visible: true,
          layerId: resolvePlacementLayer("layer-bg"),
          zIndex: placementZIndex,
          pageId: activePageId,
          createdOrder: Date.now(),
        };
        history.captureSnapshot(`导入背景图「${file.name}」`);
        setBackgroundImages((prev) => [...prev, bgObj]);
        setSelectedIds([bgObj.id]);
        setHasUnsavedChanges(true);
        setStatus(`已导入背景图「${file.name}」`);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }

  /** 背景图文件输入变化 */
  function handleBgImageInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleBgImageImport(file);
    if (bgImageInputRef.current) bgImageInputRef.current.value = "";
  }

  function handleReplaceBackgroundInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const target = selectedBgImage;
    if (!file || !target) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      const image = new Image();
      image.onload = () => updateBgImage(target.id, { src, previewSrc: createBackgroundPreview(image), name: file.name, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }, "替换背景图");
      image.src = src;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function mergeImportedAssets(imported: AssetRecord[]) {
    if (!imported.length) { setStatus("没有找到可导入的图标文件"); return; }
    history.captureSnapshot("导入图标资源");
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    imported.forEach((asset) => byId.set(asset.id, asset));
    const mergedAssets = [...byId.values()];
    setAssets(mergedAssets);
    if (data) {
      setGraphics((prev) => {
        const next = [...prev];
        for (const diagramModule of modules) {
          const station = data.stations.find((candidate) => diagramModule.sourceStationIds.includes(candidate.id));
          const asset = findAssetByFilename(mergedAssets, station?.icon);
          if (!asset?.dataUrl || next.some((graphic) => graphic.attachedToId === diagramModule.id && graphic.assetId === asset.id)) continue;
          const template = templateMap.get(diagramModule.templateId);
          const x = diagramModule.x + (template?.width || 64) / 2 - 16;
          const y = diagramModule.y - 42;
          next.push({ id: genId("graphic"), assetId: asset.id, attachedToId: diagramModule.id, positionMode: "attached", offsetX: x - diagramModule.x, offsetY: y - diagramModule.y, x, y, width: 32, height: 32, rotation: 0, opacity: 1, layerId: "layer-icon", zIndex: next.length, pageId: diagramModule.pageId, visible: true, locked: false, createdOrder: Date.now() });
        }
        return next;
      });
    }
    setHasUnsavedChanges(true);
    setStatus(`已导入 ${imported.length} 个图标资源`);
  }

  async function handleIconArchiveInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) mergeImportedAssets(importIconArchive(new Uint8Array(await file.arrayBuffer())));
    e.target.value = "";
  }

  async function handleIconDirectoryInput(e: React.ChangeEvent<HTMLInputElement>) {
    mergeImportedAssets(await importIconFiles(Array.from(e.target.files || [])));
    e.target.value = "";
  }

  function placeGraphic(asset: AssetRecord) {
    if (!asset.dataUrl) { setStatus(`图标资源「${asset.name}」缺失`); return; }
    const owner = selectedModules[0];
    const x = owner ? owner.x + 20 : Math.max(0, -viewport.panX / viewport.scale + 120);
    const y = owner ? owner.y + 20 : Math.max(0, -viewport.panY / viewport.scale + 120);
    const graphic: AttachedGraphic = { id: genId("graphic"), assetId: asset.id, attachedToId: owner?.id, positionMode: owner ? "attached" : "independent", offsetX: owner ? x - owner.x : 0, offsetY: owner ? y - owner.y : 0, x, y, width: 32, height: 32, rotation: 0, opacity: 1, layerId: resolvePlacementLayer(defaultGraphicLayerId({ attachedToId: owner?.id })), zIndex: placementZIndex, pageId: activePageId, visible: true, locked: false, createdOrder: Date.now() };
    history.captureSnapshot("放置图标");
    setGraphics((prev) => [...prev, graphic]);
    setSelectedIds([graphic.id]);
    setHasUnsavedChanges(true);
  }

  function deleteAsset(asset: AssetRecord) {
    if (graphics.some((graphic) => graphic.assetId === asset.id)) {
      setStatus(`图标资源「${asset.name}」仍在使用，请先删除对应图标`);
      return;
    }
    history.captureSnapshot("删除图标资源");
    setAssets((prev) => prev.filter((candidate) => candidate.id !== asset.id));
    setHasUnsavedChanges(true);
    setStatus(`已删除图标资源「${asset.name}」`);
  }

  /** 更新背景图属性 */
  function updateBgImage(id: string, patch: Partial<BackgroundImageObject>, operationName?: string) {
    const current = backgroundImages.find((item) => item.id === id);
    if (!current || isLayerLocked(current.layerId)) {
      setStatus("所属图层已锁定，无法修改背景图");
      return;
    }
    // 锁定背景图 = 锁定全部参数（大小、位置等）。解锁按钮本身不受限制。
    const isUnlockOnly = Object.keys(patch).length === 1 && "locked" in patch;
    if (current.locked && !isUnlockOnly) {
      setStatus("背景图已锁定，全部参数（大小/位置等）不可修改，请先解锁");
      return;
    }
    history.captureSnapshot(operationName || "修改背景图");
    setBackgroundImages((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setHasUnsavedChanges(true);
  }

  /** 删除背景图 */
  function deleteBgImage(id: string) {
    history.captureSnapshot("删除背景图");
    setBackgroundImages((prev) => prev.filter((b) => b.id !== id));
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
    setHasUnsavedChanges(true);
    setStatus("已删除背景图");
  }

  /** 切换描图模式 */
  function toggleTracingMode() {
    setTracingMode((prev) => {
      const next = !prev;
      if (next) {
        // 描图模式：降低所有背景图不透明度
        setBackgroundImages((prevImgs) => prevImgs.map((b) => ({ ...b, opacity: 0.35 })));
      } else {
        // 退出描图模式：恢复正常不透明度
        setBackgroundImages((prevImgs) => prevImgs.map((b) => ({ ...b, opacity: 0.6 })));
      }
      setStatus(next ? "已进入描图模式" : "已退出描图模式");
      return next;
    });
  }

  /** 背景图鼠标按下 */
  function handleBgImageMouseDown(e: React.MouseEvent, bgImg: BackgroundImageObject) {
    e.stopPropagation();
    // 锁定（或所在图层锁定）的背景图由 CSS pointer-events:none 透传到画布，
    // 框选、平移等操作在它上面照常进行；解锁通过图片中心的 🔓 角标。
    if (bgImg.locked || isLayerLocked(bgImg.layerId)) return;
    if (activeTool === "pan") return;
    if (!selectedIds.includes(bgImg.id)) {
      setSelectedIds([bgImg.id]);
    }
    // 已选中：不定向取消选中，若拖拽则保持选中，若未拖拽则在 mouseup 时取消
    if (beginSelectionDrag(e, bgImg.id)) return;
    history.captureSnapshot("移动背景图");
    dragRef.current = {
      type: "bgImage",
      bgImageId: bgImg.id,
      wasSelected: selectedIds.includes(bgImg.id),
      startSX: e.clientX,
      startSY: e.clientY,
      startMX: bgImg.x,
      startMY: bgImg.y,
      startPX: 0,
      startPY: 0,
      moved: false,
    };
  }

  // ── 标签操作 ──

  /** 放置标签（画布点击时调用） */
  function placeLabel(worldX: number, worldY: number) {
    const x = snapEnabled ? snapToGrid(worldX, pageGridSize) : Math.round(worldX);
    const y = snapEnabled ? snapToGrid(worldY, pageGridSize) : Math.round(worldY);
    const label: LabelObject = {
      id: genId("label"),
      text: "新标签",
      x,
      y,
      fontSize: 14,
      anchor: "bottom",
      rotation: 0,
      fill: "#202124",
      fontWeight: 700,
      backgroundMask: false,
      maskStrokeWidth: 2,
      outlineColor: "#ffffff",
      backgroundEnabled: false,
      backgroundColor: "#ffffff",
      backgroundPadding: 4,
      colorMode: "default",
      positionMode: "independent",
      locked: false,
      visible: true,
      layerId: resolvePlacementLayer(defaultLabelLayerId({})),
      zIndex: placementZIndex,
      pageId: activePageId,
      createdOrder: Date.now(),
    };
    history.captureSnapshot("放置标签");
    setLabels((prev) => [...prev, label]);
    setSelectedIds([label.id]);
    setHasUnsavedChanges(true);
    setStatus("已放置标签，双击编辑文字");
    setActiveTool("auto");
  }

  // ── 元件库矢量图形 / 编号操作 ──

  /** 选中元件库"基础元素/工程图标"形状卡片 */
  function selectShape(shapeType: GraphicShapeType) {
    setSelectedIds([]);
    setActiveTemplateId(null);
    setPendingElement({ kind: "shape", shapeType });
    setActiveTool("shape");
    setStatus(`已选择${SHAPE_META[shapeType].label}，点击画布放置`);
  }

  /** 选中元件库"编号"卡片 */
  function selectNumber(numeralType: "track" | "switch") {
    setSelectedIds([]);
    setActiveTemplateId(null);
    setPendingElement({ kind: "number", numeralType });
    setActiveTool("shape");
    setStatus(numeralType === "track" ? "已选择股道编号，点击画布放置" : "已选择道岔编号，点击画布放置");
  }

  /** 放置矢量形状 / 信号机 */
  function placeShape(worldX: number, worldY: number) {
    const pending = pendingElement;
    if (!pending || pending.kind !== "shape") return;
    const meta = SHAPE_META[pending.shapeType];
    const x = snapEnabled ? snapToGrid(worldX, pageGridSize) : Math.round(worldX);
    const y = snapEnabled ? snapToGrid(worldY, pageGridSize) : Math.round(worldY);
    const graphic: AttachedGraphic = {
      id: genId("graphic"),
      assetId: undefined,
      shapeType: pending.shapeType,
      fill: meta.defaultFill,
      stroke: meta.defaultStroke,
      positionMode: "independent",
      x,
      y,
      width: meta.width,
      height: meta.height,
      rotation: 0,
      mirrorX: placementMirrorX,
      mirrorY: placementMirrorY,
      opacity: 1,
      layerId: resolvePlacementLayer(defaultGraphicLayerId({ shapeType: pending.shapeType })),
      zIndex: placementZIndex,
      pageId: activePageId,
      offsetX: 0,
      offsetY: 0,
      visible: true,
      locked: false,
      createdOrder: Date.now(),
    };
    history.captureSnapshot(`放置${meta.label}`);
    setGraphics((prev) => [...prev, graphic]);
    setSelectedIds([graphic.id]);
    setHasUnsavedChanges(true);
    setStatus(`已放置${meta.label}`);
    if (!continuousPlace) {
      setActiveTool("auto");
      setPendingElement(null);
    }
  }

  /** 放置编号标注（股道/道岔）；数字自动递增 */
  function placeNumber(worldX: number, worldY: number) {
    const pending = pendingElement;
    if (!pending || pending.kind !== "number") return;
    const existing = labels.filter((label) => label.numeralType === pending.numeralType);
    const nextNum = existing.length ? Math.max(...existing.map((label) => parseInt(label.text, 10) || 0)) + 1 : 1;
    const x = snapEnabled ? snapToGrid(worldX, pageGridSize) : Math.round(worldX);
    const y = snapEnabled ? snapToGrid(worldY, pageGridSize) : Math.round(worldY);
    const label: LabelObject = {
      id: genId("label"),
      text: String(nextNum),
      x,
      y,
      fontSize: 16,
      anchor: "bottom",
      rotation: 0,
      fill: "#202124",
      fontWeight: 700,
      backgroundMask: false,
      maskStrokeWidth: 2,
      outlineColor: "#ffffff",
      backgroundEnabled: false,
      backgroundColor: "#ffffff",
      backgroundPadding: 4,
      colorMode: "default",
      positionMode: "independent",
      numeralType: pending.numeralType,
      language: "neutral",
      locked: false,
      visible: true,
      layerId: resolvePlacementLayer(defaultLabelLayerId({ numeralType: pending.numeralType })),
      zIndex: placementZIndex,
      pageId: activePageId,
      createdOrder: Date.now(),
    };
    history.captureSnapshot(`放置${pending.numeralType === "track" ? "股道编号" : "道岔编号"}`);
    setLabels((prev) => [...prev, label]);
    setSelectedIds([label.id]);
    setHasUnsavedChanges(true);
    setStatus(pending.numeralType === "track" ? `已放置股道编号 ${nextNum}道` : `已放置道岔编号 ${nextNum}#`);
    if (!continuousPlace) {
      setActiveTool("auto");
      setPendingElement(null);
    }
  }

  /** 更新标签属性 */
  function updateLabel(id: string, patch: Partial<LabelObject>, operationName?: string) {
    const current = labels.find((item) => item.id === id);
    if (!current || isLayerLocked(current.layerId)) {
      setStatus("所属图层已锁定，无法修改标签");
      return;
    }
    const next: LabelObject = { ...current, ...patch };
    if ((next.positionMode || (next.attachedToId ? "attached" : "independent")) === "independent") {
      next.positionMode = "independent";
      next.attachedToId = undefined;
      next.offsetX = 0;
      next.offsetY = 0;
    } else {
      next.positionMode = "attached";
      const owner = modules.find((module) => module.id === next.attachedToId);
      if (owner) {
        next.offsetX = next.x - owner.x;
        next.offsetY = next.y - owner.y;
      }
    }
    history.captureSnapshot(operationName || "修改标签");
    setLabels((prev) => prev.map((label) => (label.id === id ? next : label)));
    setHasUnsavedChanges(true);
  }

  /** 删除标签 */
  function deleteLabel(id: string) {
    history.captureSnapshot("删除标签");
    setLabels((prev) => prev.filter((l) => l.id !== id));
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
    setHasUnsavedChanges(true);
    setStatus("已删除标签");
  }

  /** 标签鼠标按下 */
  function handleLabelMouseDown(e: React.MouseEvent, label: LabelObject) {
    e.stopPropagation();
    if (label.locked || isLayerLocked(label.layerId)) return;
    if (activeTool === "pan") return;
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && label.positionMode === "attached" && label.attachedToId && modules.some((module) => module.id === label.attachedToId)) {
      toggleOwnerModuleSelection(label.attachedToId);
      return;
    }
    if (!selectedIds.includes(label.id)) {
      setSelectedIds([label.id]);
    }
    // 已选中：不定向取消选中，若拖拽则保持选中，若未拖拽则在 mouseup 时取消
    if (beginSelectionDrag(e, label.id)) return;
    history.captureSnapshot("移动标签");
    dragRef.current = {
      type: "label",
      labelId: label.id,
      wasSelected: selectedIds.includes(label.id),
      startSX: e.clientX,
      startSY: e.clientY,
      startMX: label.x,
      startMY: label.y,
      startPX: 0,
      startPY: 0,
      moved: false,
    };
  }

  /** 标签双击编辑 */
  function handleLabelDoubleClick(e: React.MouseEvent, label: LabelObject) {
    e.stopPropagation();
    const newText = window.prompt("编辑标签文字", label.text);
    if (newText !== null && newText !== label.text) {
      updateLabel(label.id, { text: newText }, "编辑标签文字");
    }
  }

  // ── 图层操作 ──

  // ── 连接操作 ──

  /** 更新连接属性（交叉类型等） */
  function updateConnection(id: string, patch: Partial<ModuleConnection>, operationName?: string) {
    const current = connections.find((item) => item.id === id);
    if (!current || isLayerLocked(current.layerId)) {
      setStatus("所属图层已锁定，无法修改连接");
      return;
    }
    history.captureSnapshot(operationName || "修改连接");
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setHasUnsavedChanges(true);
  }

  /** 设置连接线型；双线配对的两股道一起切换（渲染按配对交叉绘制，单股修改会导致虚实不一致）。 */
  function setConnectionLineStyle(id: string, lineStyle: "solid" | "dashed") {
    const current = connections.find((item) => item.id === id);
    if (!current || isLayerLocked(current.layerId)) {
      setStatus("所属图层已锁定，无法修改连接");
      return;
    }
    const paired = findPairedRail(current, connections);
    history.captureSnapshot(`设置线型为${lineStyle === "dashed" ? "虚线" : "实线"}`);
    setConnections((prev) => prev.map((c) => {
      if (c.id === id || (paired && c.id === paired.id)) return { ...c, lineStyle };
      return c;
    }));
    setHasUnsavedChanges(true);
  }

  /** 在连接轨道上添加交叉点（取点击位置最近的轨道段）。 */
  function addCrossingPoint(connId: string, worldX: number, worldY: number) {
    const conn = connections.find((item) => item.id === connId);
    if (!conn || isLayerLocked(conn.layerId)) return;
    const tracks = rebuildConnectionTrackCache(conn);
    if (tracks.length === 0) return;

    let bestTrack = tracks[0];
    let bestT = 0;
    let bestDist = Infinity;
    for (const track of tracks) {
      const dx = track.x2 - track.x1;
      const dy = track.y2 - track.y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1) continue;
      const t = Math.max(0, Math.min(1, ((worldX - track.x1) * dx + (worldY - track.y1) * dy) / lenSq));
      const px = track.x1 + t * dx;
      const py = track.y1 + t * dy;
      const dist = Math.hypot(worldX - px, worldY - py);
      if (dist < bestDist) {
        bestDist = dist;
        bestTrack = track;
        bestT = t;
      }
    }

    const x = bestTrack.x1 + bestT * (bestTrack.x2 - bestTrack.x1);
    const y = bestTrack.y1 + bestT * (bestTrack.y2 - bestTrack.y1);
    history.captureSnapshot("添加交叉点");
    setConnections((prev) => prev.map((item) => item.id === connId
      ? { ...item, crossingPoints: [...item.crossingPoints, { x, y, t: bestT }] }
      : item));
    setHasUnsavedChanges(true);
    setStatus("已添加交叉点");
  }

  /** 切换连接的交叉类型 plain → gap → bridge → plain */
  function cycleCrossingType(connId: string) {
    const conn = connections.find((c) => c.id === connId);
    if (!conn) return;
    const order: CrossingType[] = ["plain", "gap", "bridge"];
    const currentIdx = order.indexOf(conn.crossingType);
    const nextType = order[(currentIdx + 1) % order.length];
    updateConnection(connId, { crossingType: nextType }, `切换交叉类型为${nextType === "plain" ? "平面" : nextType === "gap" ? "断开" : "桥梁"}`);
    setStatus(`交叉类型：${nextType === "plain" ? "平面交叉" : nextType === "gap" ? "断开" : "桥梁跨越"}`);
  }

  /** 连接鼠标按下（选中连接） */
  function handleConnectionMouseDown(e: React.MouseEvent, conn: ModuleConnection) {
    e.stopPropagation();
    if (activeTool === "pan" || isLayerLocked(conn.layerId)) return;
    if (selectedIds.includes(conn.id)) {
      setSelectedIds([]);
      setStatus("已取消选中");
      return;
    }
    setSelectedIds([conn.id]);
    setStatus(`已选中连接 ${conn.id.slice(-6)}，双击切换交叉类型`);
  }

  /** 连接双击：切换交叉类型 */
  function handleConnectionDoubleClick(e: React.MouseEvent, conn: ModuleConnection) {
    e.stopPropagation();
    cycleCrossingType(conn.id);
  }

  /** 删除连接的交叉点 */
  function removeCrossingPoint(connId: string, index: number) {
    const conn = connections.find((item) => item.id === connId);
    if (!conn || isLayerLocked(conn.layerId)) return;
    history.captureSnapshot("删除交叉点");
    setConnections((prev) => prev.map((c) =>
      c.id === connId
        ? { ...c, crossingPoints: c.crossingPoints.filter((_, i) => i !== index) }
        : c,
    ));
    setHasUnsavedChanges(true);
  }

  // ── 语义化轨道模型：控制点编辑 ──

  // 绑定 wrapper：把纯函数所需数据从当前状态/ref 传入，保持调用点拼写不变。
  function getConnectionEndpoints(conn: ModuleConnection) {
    return pureGetConnectionEndpoints(conn, modules, resolvedTemplateMap);
  }

  function rebuildConnectionTrackCache(conn: ModuleConnection) {
    return pureRebuildConnectionTrackCache(conn, connections, modules, resolvedTemplateMap);
  }

  function findPairedRail(connection: ModuleConnection, candidates: ModuleConnection[]) {
    return pureFindPairedRail(connection, candidates, modulesRef.current, templateMap);
  }

  function updateConnectionAndPairedRail(previous: ModuleConnection[], connectionId: string, update: (connection: ModuleConnection) => ModuleConnection) {
    return pureUpdateConnectionAndPairedRail(previous, connectionId, update, modulesRef.current, templateMap);
  }

  /** 在连接轨道上指定位置插入控制点（按路径顺序排序） */
  function addControlPointAt(connId: string, worldX: number, worldY: number) {
    const conn = connections.find((c) => c.id === connId);
    if (!conn || isLayerLocked(conn.layerId)) return;
    const ends = getConnectionEndpoints(conn);
    if (!ends) return;
    const currentPoints = geometryForConnection(conn, connections, modules, resolvedTemplateMap)?.controlPoints || conn.controlPoints;
    const pts = [ends.from, ...currentPoints, ends.to];
    let bestIdx = 0;
    let bestDist = Infinity;
    let bestProj = { x: pts[0].x, y: pts[0].y };
    let bestTangent = { x: 1, y: 0 };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq > 1 ? Math.max(0, Math.min(1, ((worldX - a.x) * dx + (worldY - a.y) * dy) / lenSq)) : 0;
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const dist = Math.hypot(worldX - px, worldY - py);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
        bestProj = { x: px, y: py };
        const length = Math.hypot(dx, dy) || 1;
        bestTangent = { x: dx / length, y: dy / length };
      }
    }
    const newCp: TrackControlPoint = {
      id: genId("cp"),
      x: snapEnabled ? snapToGrid(bestProj.x, pageGridSize) : Math.round(bestProj.x),
      y: snapEnabled ? snapToGrid(bestProj.y, pageGridSize) : Math.round(bestProj.y),
      curved: true,
      handleX: bestTangent.x * 18,
      handleY: bestTangent.y * 18,
      directionOnly: true,
      tangentDirection: Math.atan2(bestTangent.y, bestTangent.x) * 180 / Math.PI,
    };
    // 约束插入位置：不可插入到隐式锚点之前或之后
    const firstCP = currentPoints[0];
    const lastCP = currentPoints[currentPoints.length - 1];
    const minIdx = firstCP?.implicit ? 1 : 0;
    const maxIdx = lastCP?.implicit ? currentPoints.length - 1 : currentPoints.length;
    const insertIdx = Math.max(minIdx, Math.min(bestIdx, maxIdx));

    history.captureSnapshot("添加轨道节点");
    setConnections((prev) => updateConnectionAndPairedRail(prev, connId, (c) => {
      const cps = [...currentPoints];
      cps.splice(insertIdx, 0, newCp);
      return { ...c, autoCurve: false, controlPoints: cps };
    }));
    setHasUnsavedChanges(true);
    setStatus("已添加轨道节点");
  }

  /** 在最长段中点插入控制点（属性面板按钮） */
  function addControlPointMidpoint(connId: string) {
    const conn = connections.find((c) => c.id === connId);
    if (!conn || isLayerLocked(conn.layerId)) return;
    const ends = getConnectionEndpoints(conn);
    if (!ends) return;
    const currentPoints = geometryForConnection(conn, connections, modules, resolvedTemplateMap)?.controlPoints || conn.controlPoints;
    const pts = [ends.from, ...currentPoints, ends.to];
    let bestLen = -1;
    let mid = { x: pts[0].x, y: pts[0].y };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > bestLen) {
        bestLen = len;
        mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    }
    addControlPointAt(connId, mid.x, mid.y);
  }

  /** 删除控制点（隐式锚点不可删除） */
  function removeControlPoint(connId: string, cpId: string) {
    const conn = connections.find((c) => c.id === connId);
    if (!conn || isLayerLocked(conn.layerId)) return;
    const target = conn.controlPoints.find((p) => p.id === cpId);
    if (!target || target.implicit) return; // 不可删除隐式锚点
    const ends = getConnectionEndpoints(conn);
    if (!ends) return;
    history.captureSnapshot("删除轨道节点");
    setConnections((prev) => updateConnectionAndPairedRail(prev, connId, (c) => ({
      ...c,
      autoCurve: false,
      controlPoints: c.controlPoints.filter((p) => p.id !== cpId),
    })));
    setHasUnsavedChanges(true);
    setStatus("已删除轨道节点");
  }

  /** 清除所有控制点（拉直） */
  function straightenConnection(connId: string) {
    const conn = connections.find((c) => c.id === connId);
    if (!conn || conn.controlPoints.length === 0 || isLayerLocked(conn.layerId)) return;
    const ends = getConnectionEndpoints(conn);
    if (!ends) return;
    history.captureSnapshot("拉直轨道");
    setConnections((prev) => updateConnectionAndPairedRail(prev, connId, (c) => ({
      ...c,
      autoCurve: false,
      controlPoints: [],
    })));
    setHasUnsavedChanges(true);
    setStatus("已拉直轨道");
  }

  /** 重新为该连接生成自动贝塞尔控制点（基于端口位置） */
  function regenerateAutoControlPoints(connId: string) {
    const conn = connections.find((c) => c.id === connId);
    if (!conn || isLayerLocked(conn.layerId)) return;
    const ends = getConnectionEndpoints(conn);
    if (!ends) return;
    const fromDir = ends.fromDir;
    const toDir = ends.toDir;
    const newCps = createAutoControlPoints(ends.from, ends.to, fromDir, toDir, {
      from: `${conn.fromModuleId}:${conn.fromPortId}:endpoint-from`,
      middle: `${conn.fromModuleId}:${conn.fromPortId}:${conn.toModuleId}:${conn.toPortId}:middle`,
      to: `${conn.toModuleId}:${conn.toPortId}:endpoint-to`,
    });
    history.captureSnapshot(newCps.length > 0 ? "重新生成自动曲线" : "切换为直线连接");
    setConnections((prev) => updateConnectionAndPairedRail(prev, connId, (c) => ({
      ...c,
      autoCurve: true,
      controlPoints: newCps,
    })));
    setHasUnsavedChanges(true);
    setStatus(newCps.length > 0 ? "已重新生成自动曲线" : "已清除控制点（直线连接）");
  }

  /** 切换控制点曲率（双击节点） */
  function toggleControlPointCurve(connId: string, cpId: string) {
    const conn = connections.find((c) => c.id === connId);
    if (!conn || isLayerLocked(conn.layerId)) return;
    const ends = getConnectionEndpoints(conn);
    if (!ends) return;
    const cp = conn.controlPoints.find((p) => p.id === cpId);
    if (!cp) return;
    history.captureSnapshot(cp.curved ? "取消节点曲率" : "启用节点曲率");
    setConnections((prev) => updateConnectionAndPairedRail(prev, connId, (c) => {
      const cps = c.controlPoints.map((p) => {
        if (p.id !== cpId) return p;
        if (p.curved) {
          return { ...p, curved: false, handleX: 0, handleY: 0, directionOnly: false, tangentDirection: undefined };
        }
        // 启用曲率：手柄指向下一节点，让曲线平滑进入当前 CP
        const idx = c.controlPoints.findIndex((q) => q.id === cpId);
        const next = idx + 1 < c.controlPoints.length ? c.controlPoints[idx + 1] : ends.to;
        const dx = next.x - p.x;
        const dy = next.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const hMag = Math.min(len * 0.3, 80);
          return { ...p, curved: true, handleX: (dx / len) * hMag, handleY: (dy / len) * hMag, directionOnly: true, tangentDirection: Math.atan2(dy, dx) * 180 / Math.PI };
      });
      return { ...c, autoCurve: false, controlPoints: cps };
    }));
    setHasUnsavedChanges(true);
    setStatus(conn.controlPoints.find((p) => p.id === cpId)?.curved ? "已取消节点曲率" : "已启用节点曲率");
  }

  /** 控制点节点鼠标按下：开始拖拽 */
  function handleControlPointMouseDown(e: React.MouseEvent, connId: string, cpId: string) {
    e.stopPropagation();
    if (activeTool === "pan") return;
    if (isLayerLocked(connections.find((item) => item.id === connId)?.layerId || "")) return;
    history.captureSnapshot("移动轨道节点");
    const conn = connections.find((c) => c.id === connId);
    const geometry = conn ? geometryForConnection(conn, connections, modules, resolvedTemplateMap) : null;
    const cp = geometry?.controlPoints.find((p) => p.id === cpId) || conn?.controlPoints.find((p) => p.id === cpId);
    dragRef.current = {
      type: "controlPoint",
      connId,
      cpId,
      startSX: e.clientX,
      startSY: e.clientY,
      startMX: cp?.x || 0,
      startMY: cp?.y || 0,
      startPX: 0,
      startPY: 0,
      moved: false,
    };
  }

  /** 曲率手柄鼠标按下：开始拖拽手柄 */
  function handleControlPointHandleMouseDown(e: React.MouseEvent, connId: string, cpId: string) {
    e.stopPropagation();
    if (activeTool === "pan") return;
    if (isLayerLocked(connections.find((item) => item.id === connId)?.layerId || "")) return;
    history.captureSnapshot("调整轨道曲率");
    const conn = connections.find((c) => c.id === connId);
    const geometry = conn ? geometryForConnection(conn, connections, modules, resolvedTemplateMap) : null;
    const cp = geometry?.controlPoints.find((p) => p.id === cpId) || conn?.controlPoints.find((p) => p.id === cpId);
    dragRef.current = {
      type: "controlPointHandle",
      connId,
      cpId,
      startSX: e.clientX,
      startSY: e.clientY,
      startMX: cp?.x || 0,
      startMY: cp?.y || 0,
      startHX: cp?.handleX || 0,
      startHY: cp?.handleY || 0,
      startPX: 0,
      startPY: 0,
      moved: false,
    };
  }

  /** 控制点双击：切换曲率 */
  function handleControlPointDoubleClick(e: React.MouseEvent, connId: string, cpId: string) {
    e.stopPropagation();
    toggleControlPointCurve(connId, cpId);
  }

  /** 轨道段点击：Alt 添加控制点，Shift+Alt 添加交叉点。 */
  function handleTrackClick(e: React.MouseEvent, conn: ModuleConnection) {
    if (!e.altKey) return;
    e.stopPropagation();
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    if (e.shiftKey) addCrossingPoint(conn.id, w.x, w.y);
    else addControlPointAt(conn.id, w.x, w.y);
  }

  // ── 换乘组合 ──

  /** 从选中模块创建换乘组 */
  function createTransferGroupFromSelection() {
    const selMods = modules.filter((m) => selectedIds.includes(m.id));
    if (selMods.length < 2) {
      setStatus("需要至少选择 2 个模块来创建换乘组");
      return;
    }
    const lineIds = [...new Set(selMods.flatMap((m) => m.lineIds).filter(Boolean))];
    const group: TransferGroup = {
      id: genId("tgrp"),
      name: "换乘站",
      moduleIds: selMods.map((m) => m.id),
      lineIds,
      sourceStationIds: [...new Set(selMods.flatMap((module) => module.sourceStationIds))],
      layerId: "layer-transfer",
      zIndex: transferGroups.length,
      visible: true,
      locked: false,
      pageId: activePageId,
      createdOrder: Date.now(),
    };
    history.captureSnapshot("创建换乘组");
    setTransferGroups((prev) => [...prev, group]);
    setSelectedIds([group.id]);
    setHasUnsavedChanges(true);
    setStatus(`已创建换乘组「${group.name}」`);
  }

  /** 更新换乘组属性 */
  function updateTransferGroup(id: string, patch: Partial<TransferGroup>, operationName?: string) {
    const current = transferGroups.find((item) => item.id === id);
    if (!current || isLayerLocked(current.layerId)) {
      setStatus("所属图层已锁定，无法修改换乘组");
      return;
    }
    history.captureSnapshot(operationName || "修改换乘组");
    setTransferGroups((prev) => prev.map((group) => {
      if (group.id !== id) return group;
      return { ...group, ...patch };
    }));
    setHasUnsavedChanges(true);
  }

  /** 从换乘组移除模块 */
  function removeModuleFromGroup(groupId: string, moduleId: string) {
    history.captureSnapshot("从换乘组移除成员");
    setTransferGroups((prev) => prev.map((g) =>
      g.id === groupId
        ? { ...g, moduleIds: g.moduleIds.filter((mid) => mid !== moduleId) }
        : g,
    ));
    setHasUnsavedChanges(true);
    setStatus("已从换乘组移除成员");
  }

  /** 将选中模块加入选中的换乘组 */
  function addSelectedModulesToGroup(groupId: string) {
    const group = transferGroups.find((g) => g.id === groupId);
    if (!group) return;
    const modsToAdd = modules.filter((m) => selectedIds.includes(m.id) && !group.moduleIds.includes(m.id));
    if (modsToAdd.length === 0) {
      setStatus("选中的模块已在换乘组中");
      return;
    }
    history.captureSnapshot("添加成员到换乘组");
    setTransferGroups((prev) => prev.map((g) =>
      g.id === groupId
        ? {
            ...g,
            moduleIds: [...g.moduleIds, ...modsToAdd.map((m) => m.id)],
            lineIds: [...new Set([...g.lineIds, ...modsToAdd.flatMap((m) => m.lineIds)])],
          }
        : g,
    ));
    setHasUnsavedChanges(true);
    setStatus(`已添加 ${modsToAdd.length} 个模块到换乘组`);
  }

  /** 换乘组鼠标按下：选中 */
  function handleTransferGroupMouseDown(e: React.MouseEvent, group: TransferGroup) {
    e.stopPropagation();
    if (activeTool === "pan") return;
    if (activeTool === "connect") return;
    if (!group.visible || group.locked || isLayerLocked(group.layerId)) return;
    const memberModules = modules.filter((module) => group.moduleIds.includes(module.id));
    if (memberModules.some((module) => module.locked || isLayerLocked(module.layerId))) {
      setStatus(`换乘组「${group.name}」包含锁定模块，无法整体移动`);
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      setSelectedIds((previous) => previous.includes(group.id)
        ? previous.filter((id) => id !== group.id)
        : [...previous, group.id]);
      return;
    }
    const bounds = getTransferGroupBounds(group);
    if (!bounds) return;
    const wasSelected = selectedIds.includes(group.id);
    if (!wasSelected) setSelectedIds([group.id]);
    if (beginSelectionDrag(e, group.id)) return;
    history.captureSnapshot("移动换乘组");
    dragRef.current = {
      type: "transferGroup",
      transferGroupId: group.id,
      wasSelected,
      startSX: e.clientX,
      startSY: e.clientY,
      startMX: bounds.x,
      startMY: bounds.y,
      startPX: 0,
      startPY: 0,
      moved: false,
    };
    setStatus(`已选中换乘组「${group.name}」，可拖动整体移动`);
  }

  function handleTransferGroupDoubleClick(e: React.MouseEvent, group: TransferGroup) {
    e.stopPropagation();
    setSelectedIds(group.moduleIds);
    setStatus(`正在编辑换乘组「${group.name}」的成员；点击空白处退出`);
  }

  /** 计算换乘组成员模块的包围盒 */
  function getTransferGroupBounds(group: TransferGroup): { x: number; y: number; w: number; h: number } | null {
    const memberMods = modules.filter((m) => group.moduleIds.includes(m.id));
    if (memberMods.length === 0) return null;
    const template = (mod: DiagramModule) => resolvedTemplateMap.get(mod.id) || templateMap.get(mod.templateId);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const mod of memberMods) {
      const tpl = template(mod);
      const w = tpl?.width || 160;
      const h = tpl?.height || 112;
      minX = Math.min(minX, mod.x);
      minY = Math.min(minY, mod.y);
      maxX = Math.max(maxX, mod.x + w);
      maxY = Math.max(maxY, mod.y + h);
    }
    const pad = 12;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }

  /** 删除换乘组（仅移除组合关系，不删除成员模块） */
  function deleteTransferGroup(id: string) {
    history.captureSnapshot("删除换乘组");
    setTransferGroups((prev) => prev.filter((g) => g.id !== id));
    setSelectedIds([]);
    setHasUnsavedChanges(true);
    setStatus("已删除换乘组");
  }

  function toggleLayer(id: string) {
    history.captureSnapshot("切换图层可见性");
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
    setHasUnsavedChanges(true);
  }
  function toggleLayerLock(id: string) {
    history.captureSnapshot("切换图层锁定");
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)));
    setHasUnsavedChanges(true);
  }
  function setLayerOpacity(id: string, opacity: number) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, opacity } : l)));
    setHasUnsavedChanges(true);
  }
  function toggleLayerExpanded(id: string) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, expanded: !l.expanded } : l)));
  }
  function renameLayer(id: string, name: string) {
    history.captureSnapshot("重命名图层");
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
    setHasUnsavedChanges(true);
  }
  function createSubLayer(parentId: string | null) {
    history.captureSnapshot("新建子图层");
    const siblings = layers.filter((l) => l.parentId === parentId);
    const newOrder = siblings.length;
    const newLayer: LayerNode = {
      id: genId("layer"),
      name: "新图层",
      visible: true,
      locked: false,
      opacity: 1,
      expanded: true,
      parentId,
      order: newOrder,
    };
    setLayers((prev) => [...prev, newLayer]);
    // 展开父节点
    if (parentId) {
      setLayers((prev) => prev.map((l) => (l.id === parentId ? { ...l, expanded: true } : l)));
    }
    setHasUnsavedChanges(true);
    setStatus("已新建图层");
  }
  function deleteLayer(id: string) {
    // 收集该图层及其所有后代
    const toDelete = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const layer of layers) {
        if (layer.parentId && toDelete.has(layer.parentId) && !toDelete.has(layer.id)) {
          toDelete.add(layer.id);
          changed = true;
        }
      }
    }
    const hasObjects = [
      ...modules.map((item) => item.layerId), ...connections.map((item) => item.layerId),
      ...backgroundImages.map((item) => item.layerId), ...labels.map((item) => item.layerId), ...transferGroups.map((item) => item.layerId),
      ...platforms.map((item) => item.layerId), ...graphics.map((item) => item.layerId),
    ].some((layerId) => toDelete.has(layerId));
    if (hasObjects) {
      setStatus("只能删除空图层；请先移动或删除其中的对象");
      return;
    }
    history.captureSnapshot("删除图层");
    setLayers((prev) => prev.filter((l) => !toDelete.has(l.id)));
    setHasUnsavedChanges(true);
    setStatus(`已删除图层（含 ${toDelete.size} 个子图层）`);
  }
  /** 拖动排序：将 draggedId 移动到 targetId 之前/之后（同层级内） */
  function moveLayer(draggedId: string, targetId: string, position: "before" | "after" | "inside") {
    const dragged = layers.find((l) => l.id === draggedId);
    const target = layers.find((l) => l.id === targetId);
    if (!dragged || !target) return;
    // 不允许将父拖入自己的子（循环检测）
    if (position === "inside") {
      let parent: string | null = target.parentId;
      while (parent) {
        if (parent === draggedId) return;
        parent = layers.find((l) => l.id === parent)?.parentId ?? null;
      }
    }
    const newParentId = position === "inside" ? targetId : target.parentId;
    // 不允许移动到不同层级（仅同父下重排或变为子）
    if (position !== "inside" && dragged.parentId !== target.parentId) return;

    history.captureSnapshot("拖动排序图层");
    setLayers((prev) => {
      let updated = prev.map((l) =>
        l.id === draggedId ? { ...l, parentId: newParentId } : l,
      );
      // 重新计算同层级 order
      const siblings = updated
        .filter((l) => l.parentId === newParentId)
        .sort((a, b) => a.order - b.order);
      const draggedIdx = siblings.findIndex((s) => s.id === draggedId);
      // 移除 dragged 后重新插入
      const [moved] = siblings.splice(draggedIdx, 1);
      if (position === "before") {
        siblings.splice(siblings.findIndex((s) => s.id === targetId), 0, moved);
      } else {
        const insertAfter = siblings.findIndex((s) => s.id === targetId);
        siblings.splice(insertAfter + 1, 0, moved);
      }
      // 重新分配 order
      const orderMap = new Map<string, number>();
      siblings.forEach((s, i) => orderMap.set(s.id, i));
      updated = updated.map((l) =>
        orderMap.has(l.id) ? { ...l, order: orderMap.get(l.id)! } : l,
      );
      return updated;
    });
    setHasUnsavedChanges(true);
  }

  function moveLayerBy(id: string, direction: "up" | "down" | "top" | "bottom") {
    const layer = layers.find((item) => item.id === id);
    if (!layer) return;
    const siblings = layers.filter((item) => item.parentId === layer.parentId).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex((item) => item.id === id);
    const targetIndex = direction === "up" ? index - 1 : direction === "down" ? index + 1 : direction === "top" ? 0 : siblings.length - 1;
    if (targetIndex < 0 || targetIndex >= siblings.length || targetIndex === index) return;
    moveLayer(id, siblings[targetIndex].id, targetIndex < index ? "before" : "after");
  }

  // ── 交互处理 ──

  /** 画布鼠标按下 */
  function handleSvgMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button === 2 && (activeTool === "connect" || activeTool === "auto") && connectFrom) {
      e.preventDefault();
      setConnectFrom(null);
      setStatus("已取消连接");
      return;
    }
    if (e.button === 1 || e.button === 2 || activeTool === "pan") {
      // 平移
      dragRef.current = { type: "pan", startSX: e.clientX, startSY: e.clientY, startPX: viewport.panX, startPY: viewport.panY, startMX: 0, startMY: 0, moved: false };
      e.preventDefault();
      return;
    }
    if (activeTool === "place" && activeTemplateId) {
      const w = toWorld(e.clientX, e.clientY);
      placeModule(w.x, w.y);
      return;
    }
    if (activeTool === "label") {
      const w = toWorld(e.clientX, e.clientY);
      placeLabel(w.x, w.y);
      return;
    }
    if (activeTool === "shape" && pendingElement) {
      const w = toWorld(e.clientX, e.clientY);
      if (pendingElement.kind === "shape") placeShape(w.x, w.y);
      else placeNumber(w.x, w.y);
      return;
    }
    // 选择工具下在空白区域拖拽 → 框选
    if ((activeTool === "select" || activeTool === "auto") && (e.target === e.currentTarget || (e.target as Element).classList.contains("canvas-bg") || (e.target as Element).classList.contains("canvas-paper"))) {
      dragRef.current = { type: "selectionBox", startSX: e.clientX, startSY: e.clientY, startMX: 0, startMY: 0, startPX: 0, startPY: 0, moved: false };
      e.preventDefault();
      return;
    }
    // 点击空白处取消选择
    if (e.target === e.currentTarget || (e.target as Element).classList.contains("canvas-bg") || (e.target as Element).classList.contains("canvas-paper")) {
      setSelectedIds([]);
      if ((activeTool === "connect" || activeTool === "auto") && connectFrom) {
        setConnectFrom(null);
        setStatus("已取消连接");
      }
    }
  }

  /** Starts one drag transaction for every object captured by the marquee. */
  function beginSelectionDrag(e: React.MouseEvent, objectId: string): boolean {
    if (!selectedIds.includes(objectId) || selectedIds.length < 2) return false;
    history.captureSnapshot("移动框选内容");
    dragRef.current = {
      type: "selection",
      selectionIds: [...selectedIds],
      startSX: e.clientX,
      startSY: e.clientY,
      startMX: 0,
      startMY: 0,
      startPX: 0,
      startPY: 0,
      lastMX: 0,
      lastMY: 0,
      moved: false,
    };
    return true;
  }

  /** 模块鼠标按下 */
  function handleModuleMouseDown(e: React.MouseEvent, mod: DiagramModule) {
    e.stopPropagation();
    if (mod.locked || isLayerLocked(mod.layerId)) return;
    if (activeTool === "pan") return;
    if (activeTool === "connect") return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // Shift/Ctrl+click: 切换多选，不启动拖拽
      setSelectedIds((prev) =>
        prev.includes(mod.id)
          ? prev.filter((id) => id !== mod.id)
          : [...prev, mod.id],
      );
      return;
    } else if (!selectedIds.includes(mod.id)) {
      setSelectedIds([mod.id]);
    }
    // 已选中模块：不定向取消选中，若拖拽则保持选中并移动，若未拖拽则在 mouseup 时取消选中
    // 捕获拖拽前快照（只在 mousedown 时保存，mouseup 时若未移动则丢弃）
    // wasSelected 用 mousedown 时(未 setSelectedIds 前)的选择状态，避免 handleUp 闭包陈旧导致新点击立即取消选中
    if (beginSelectionDrag(e, mod.id)) return;
    history.captureSnapshot("移动模块");
    dragRef.current = {
      type: "module",
      moduleId: mod.id,
      wasSelected: selectedIds.includes(mod.id),
      startSX: e.clientX,
      startSY: e.clientY,
      startMX: mod.x,
      startMY: mod.y,
      startPX: 0,
      startPY: 0,
      moved: false,
    };
  }

  function handlePlatformMouseDown(e: React.MouseEvent, platform: PlatformObject) {
    e.stopPropagation();
    if (platform.locked || isLayerLocked(platform.layerId) || activeTool === "pan") return;
    // 站台属于模块且不在编辑模式 → 当作点击模块整体
    if (platform.moduleId && editingPlatformModuleId !== platform.moduleId) {
      const owner = modules.find(m => m.id === platform.moduleId);
      if (owner && !owner.locked && !isLayerLocked(owner.layerId)) {
        handleModuleMouseDown(e, owner);
        return;
      }
      return;
    }
    // 编辑模式或独立站台
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && platform.moduleId && modules.some((m) => m.id === platform.moduleId)) {
      toggleOwnerModuleSelection(platform.moduleId);
      return;
    }
    if (!selectedIds.includes(platform.id)) {
      setSelectedIds([platform.id]);
    }
    if (beginSelectionDrag(e, platform.id)) return;
    history.captureSnapshot("移动站台");
    dragRef.current = { type: "platform", platformId: platform.id, wasSelected: selectedIds.includes(platform.id), startSX: e.clientX, startSY: e.clientY, startMX: platform.x, startMY: platform.y, startPX: 0, startPY: 0, moved: false };
  }

  function handleGraphicMouseDown(e: React.MouseEvent, graphic: AttachedGraphic) {
    e.stopPropagation();
    if (graphic.locked || isLayerLocked(graphic.layerId) || activeTool === "pan") return;
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && graphic.positionMode === "attached" && graphic.attachedToId && modules.some((m) => m.id === graphic.attachedToId)) {
      toggleOwnerModuleSelection(graphic.attachedToId);
      return;
    }
    if (!selectedIds.includes(graphic.id)) {
      setSelectedIds([graphic.id]);
    }
    if (beginSelectionDrag(e, graphic.id)) return;
    history.captureSnapshot("移动图标");
    dragRef.current = { type: "graphic", graphicId: graphic.id, wasSelected: selectedIds.includes(graphic.id), startSX: e.clientX, startSY: e.clientY, startMX: graphic.x, startMY: graphic.y, startPX: 0, startPY: 0, moved: false };
  }

  function handlePlatformResizeMouseDown(e: React.MouseEvent, platform: PlatformObject) {
    e.stopPropagation();
    if (platform.locked || isLayerLocked(platform.layerId)) return;
    setSelectedIds([platform.id]);
    history.captureSnapshot("调整站台尺寸");
    dragRef.current = { type: "platformResize", platformId: platform.id, startSX: e.clientX, startSY: e.clientY, startMX: platform.x, startMY: platform.y, startPX: 0, startPY: 0, startWidth: platform.width, startHeight: platform.height, moved: false };
  }

  function handleGraphicResizeMouseDown(e: React.MouseEvent, graphic: AttachedGraphic) {
    e.stopPropagation();
    if (graphic.locked || isLayerLocked(graphic.layerId)) return;
    setSelectedIds([graphic.id]);
    history.captureSnapshot("调整图标尺寸");
    dragRef.current = { type: "graphicResize", graphicId: graphic.id, startSX: e.clientX, startSY: e.clientY, startMX: graphic.x, startMY: graphic.y, startPX: 0, startPY: 0, startWidth: graphic.width, startHeight: graphic.height, moved: false };
  }

  /** 全局鼠标移动 */
  useEffect(() => {
    let animationFrame = 0;
    let latestMove: MouseEvent | null = null;
    function processMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (drag.type === "none") {
        // 更新鼠标世界坐标
        if (svgRef.current) {
          const w = toWorld(e.clientX, e.clientY);
          setMouseWorld({ x: Math.round(w.x), y: Math.round(w.y) });
        }
        return;
      }
      if (drag.type === "pan") {
        const dx = e.clientX - drag.startSX;
        const dy = e.clientY - drag.startSY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
        setViewport((prev) => ({ ...prev, panX: drag.startPX + dx, panY: drag.startPY + dy }));
        return;
      }
      if (drag.type === "selectionBox") {
        const dx = e.clientX - drag.startSX;
        const dy = e.clientY - drag.startSY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          drag.moved = true;
          setSelectionBox({
            x1: Math.min(drag.startSX, e.clientX),
            y1: Math.min(drag.startSY, e.clientY),
            x2: Math.max(drag.startSX, e.clientX),
            y2: Math.max(drag.startSY, e.clientY),
          });
        }
        return;
      }
      if (drag.type === "selection" && drag.selectionIds) {
        const world = toWorld(e.clientX, e.clientY);
        const startWorld = toWorld(drag.startSX, drag.startSY);
        let totalDx = world.x - startWorld.x;
        let totalDy = world.y - startWorld.y;
        if (snapEnabled) {
          totalDx = snapToGrid(totalDx, pageGridSize);
          totalDy = snapToGrid(totalDy, pageGridSize);
        }
        const lastDx = drag.lastMX ?? 0;
        const lastDy = drag.lastMY ?? 0;
        const frameDx = totalDx - lastDx;
        const frameDy = totalDy - lastDy;
        if (!frameDx && !frameDy) return;
        drag.moved = true;
        drag.lastMX = totalDx;
        drag.lastMY = totalDy;
        const translated = translateCanvasSelection({
          modules: modulesRef.current,
          connections: connectionsRef.current,
          platforms: platformsRef.current,
          labels: labelsRef.current,
          graphics: graphicsRef.current,
          backgroundImages: backgroundImagesRef.current,
          transferGroups: transferGroupsRef.current,
        }, drag.selectionIds, frameDx, frameDy);
        modulesRef.current = translated.modules;
        connectionsRef.current = translated.connections;
        platformsRef.current = translated.platforms;
        labelsRef.current = translated.labels;
        graphicsRef.current = translated.graphics;
        backgroundImagesRef.current = translated.backgroundImages;
        setModules(translated.modules);
        setConnections(translated.connections);
        setPlatforms(translated.platforms);
        setLabels(translated.labels);
        setGraphics(translated.graphics);
        setBackgroundImages(translated.backgroundImages);
        return;
      }
      if (drag.type === "module" && drag.moduleId) {
        const w = toWorld(e.clientX, e.clientY);
        const startW = toWorld(drag.startSX, drag.startSY);
        const dx = w.x - startW.x;
        const dy = w.y - startW.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
        if (!drag.moved) return;
        setManualCurveEditingId(drag.connId ?? null);
        let newX = drag.startMX + dx;
        let newY = drag.startMY + dy;
        if (snapEnabled) {
          newX = snapToGrid(newX, pageGridSize);
          newY = snapToGrid(newY, pageGridSize);
          const current = modulesRef.current.find((module) => module.id === drag.moduleId);
          if (current) {
            const aligned = alignModuleToExistingTracks({ ...current, x: newX, y: newY });
            newX = aligned.x;
            newY = aligned.y;
          }
        }
        // 使用 dragRef 记录的上一帧位置计算增量，避免 modulesRef 异步延迟导致平台漂移
        const lastMX = drag.lastMX ?? drag.startMX;
        const lastMY = drag.lastMY ?? drag.startMY;
        const frameDx = newX - lastMX;
        const frameDy = newY - lastMY;
        drag.lastMX = newX;
        drag.lastMY = newY;
        setModules((prev) => {
          const next = prev.map((m) => (m.id === drag.moduleId ? { ...m, x: newX, y: newY } : m));
          modulesRef.current = next;
          return next;
        });
        if (frameDx || frameDy) {
          setLabels((prev) => prev.map((label) => label.positionMode === "attached" && label.attachedToId === drag.moduleId ? { ...label, x: label.x + frameDx, y: label.y + frameDy } : label));
          setGraphics((prev) => prev.map((graphic) => graphic.positionMode === "attached" && graphic.attachedToId === drag.moduleId ? { ...graphic, x: graphic.x + frameDx, y: graphic.y + frameDy } : graphic));
          setPlatforms((prev) => prev.map((platform) => platform.moduleId === drag.moduleId ? { ...platform, x: platform.x + frameDx, y: platform.y + frameDy } : platform));
        }
      }
      if (drag.type === "transferGroup" && drag.transferGroupId) {
        const group = transferGroupsRef.current.find((candidate) => candidate.id === drag.transferGroupId);
        if (!group) return;
        const world = toWorld(e.clientX, e.clientY);
        const startWorld = toWorld(drag.startSX, drag.startSY);
        const dx = world.x - startWorld.x;
        const dy = world.y - startWorld.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
        if (!drag.moved) return;
        let nextX = drag.startMX + dx;
        let nextY = drag.startMY + dy;
        if (snapEnabled) {
          nextX = snapToGrid(nextX, pageGridSize);
          nextY = snapToGrid(nextY, pageGridSize);
        }
        const lastX = drag.lastMX ?? drag.startMX;
        const lastY = drag.lastMY ?? drag.startMY;
        const frameDx = nextX - lastX;
        const frameDy = nextY - lastY;
        drag.lastMX = nextX;
        drag.lastMY = nextY;
        if (!frameDx && !frameDy) return;
        const translated = translateModuleGroup({
          modules: modulesRef.current,
          connections: connectionsRef.current,
          platforms: platformsRef.current,
          labels: labelsRef.current,
          graphics: graphicsRef.current,
        }, group.moduleIds, frameDx, frameDy);
        modulesRef.current = translated.modules;
        connectionsRef.current = translated.connections;
        platformsRef.current = translated.platforms;
        labelsRef.current = translated.labels;
        graphicsRef.current = translated.graphics;
        setModules(translated.modules);
        setConnections(translated.connections);
        setPlatforms(translated.platforms);
        setLabels(translated.labels);
        setGraphics(translated.graphics);
      }
      if (drag.type === "bgImage" && drag.bgImageId) {
        const w = toWorld(e.clientX, e.clientY);
        const startW = toWorld(drag.startSX, drag.startSY);
        const dx = w.x - startW.x;
        const dy = w.y - startW.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
        let newX = drag.startMX + dx;
        let newY = drag.startMY + dy;
        if (snapEnabled) {
          newX = snapToGrid(newX, pageGridSize);
          newY = snapToGrid(newY, pageGridSize);
        }
        setBackgroundImages((prev) => prev.map((b) => (b.id === drag.bgImageId ? { ...b, x: newX, y: newY } : b)));
      }
      if (drag.type === "label" && drag.labelId) {
        const w = toWorld(e.clientX, e.clientY);
        const startW = toWorld(drag.startSX, drag.startSY);
        const dx = w.x - startW.x;
        const dy = w.y - startW.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
        let newX = drag.startMX + dx;
        let newY = drag.startMY + dy;
        if (snapEnabled) {
          newX = snapToGrid(newX, pageGridSize);
          newY = snapToGrid(newY, pageGridSize);
        }
        setLabels((prev) => prev.map((label) => {
          if (label.id !== drag.labelId) return label;
          const owner = label.positionMode === "attached" ? modulesRef.current.find((module) => module.id === label.attachedToId) : undefined;
          return { ...label, x: newX, y: newY, offsetX: owner ? newX - owner.x : label.offsetX, offsetY: owner ? newY - owner.y : label.offsetY };
        }));
      }
      if (drag.type === "platform" && drag.platformId) {
        const w = toWorld(e.clientX, e.clientY);
        const startW = toWorld(drag.startSX, drag.startSY);
        let newX = drag.startMX + w.x - startW.x;
        let newY = drag.startMY + w.y - startW.y;
        if (Math.abs(newX - drag.startMX) > 1 || Math.abs(newY - drag.startMY) > 1) drag.moved = true;
        if (snapEnabled) { newX = snapToGrid(newX, pageGridSize); newY = snapToGrid(newY, pageGridSize); }
        setPlatforms((prev) => prev.map((platform) => platform.id === drag.platformId ? { ...platform, x: newX, y: newY } : platform));
      }
      if (drag.type === "graphic" && drag.graphicId) {
        const w = toWorld(e.clientX, e.clientY);
        const startW = toWorld(drag.startSX, drag.startSY);
        let newX = drag.startMX + w.x - startW.x;
        let newY = drag.startMY + w.y - startW.y;
        if (Math.abs(newX - drag.startMX) > 1 || Math.abs(newY - drag.startMY) > 1) drag.moved = true;
        if (snapEnabled) { newX = snapToGrid(newX, pageGridSize); newY = snapToGrid(newY, pageGridSize); }
        setGraphics((prev) => prev.map((graphic) => {
          if (graphic.id !== drag.graphicId) return graphic;
          const owner = graphic.positionMode === "attached" ? modulesRef.current.find((module) => module.id === graphic.attachedToId) : undefined;
          return { ...graphic, x: newX, y: newY, offsetX: owner ? newX - owner.x : graphic.offsetX, offsetY: owner ? newY - owner.y : graphic.offsetY };
        }));
      }
      if (drag.type === "platformResize" && drag.platformId) {
        const w = toWorld(e.clientX, e.clientY);
        const startW = toWorld(drag.startSX, drag.startSY);
        const width = Math.max(10, (drag.startWidth || 10) + w.x - startW.x);
        const height = Math.max(4, (drag.startHeight || 4) + w.y - startW.y);
        if (width !== drag.startWidth || height !== drag.startHeight) drag.moved = true;
        setPlatforms((prev) => prev.map((platform) => platform.id === drag.platformId ? { ...platform, width, height } : platform));
      }
      if (drag.type === "graphicResize" && drag.graphicId) {
        const w = toWorld(e.clientX, e.clientY);
        const startW = toWorld(drag.startSX, drag.startSY);
        const startWidth = drag.startWidth || 4;
        const startHeight = drag.startHeight || 4;
        const width = Math.max(4, startWidth + w.x - startW.x);
        const height = Math.max(4, width * (startHeight / startWidth));
        if (width !== startWidth || height !== startHeight) drag.moved = true;
        setGraphics((prev) => prev.map((graphic) => graphic.id === drag.graphicId ? { ...graphic, width, height } : graphic));
      }
      // 控制点只保存中间位置与切线。端点和端点锚点每次都从模块端口派生。
      if (drag.type === "controlPoint" && drag.connId && drag.cpId) {
        const w = toWorld(e.clientX, e.clientY);
        const startW = toWorld(drag.startSX, drag.startSY);
        const dx = w.x - startW.x;
        const dy = w.y - startW.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
        if (!drag.moved) return;
        setManualCurveEditingId(drag.connId ?? null);
        let newX = drag.startMX + dx;
        let newY = drag.startMY + dy;
        if (snapEnabled) { newX = snapToGrid(newX, pageGridSize); newY = snapToGrid(newY, pageGridSize); }
        setConnections((prev) => updateConnectionAndPairedRail(prev, drag.connId!, (c) => {
          const geometry = geometryForConnection(c, prev, modulesRef.current, resolveTemplatesFor(modulesRef.current));
          if (!geometry) return c;
          const cps = geometry.controlPoints.map((p) => (p.id === drag.cpId
            ? { ...p, x: newX, y: newY, curveKind: undefined }
            : p));
          return { ...c, autoCurve: false, controlPoints: cps };
        }));
      }
      // 曲率手柄拖拽：调整 handleX/handleY 偏移
      if (drag.type === "controlPointHandle" && drag.connId && drag.cpId) {
        const w = toWorld(e.clientX, e.clientY);
        const startW = toWorld(drag.startSX, drag.startSY);
        const dx = w.x - startW.x;
        const dy = w.y - startW.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
        if (!drag.moved) return;
        setManualCurveEditingId(drag.connId);
        const newHX = (drag.startHX || 0) + dx;
        const newHY = (drag.startHY || 0) + dy;
        setConnections((prev) => updateConnectionAndPairedRail(prev, drag.connId!, (c) => {
          const geometry = geometryForConnection(c, prev, modulesRef.current, resolveTemplatesFor(modulesRef.current));
          if (!geometry) return c;
          const cps = geometry.controlPoints.map((p) => (p.id === drag.cpId
            ? { ...p, curved: true, handleX: newHX, handleY: newHY, directionOnly: true, tangentDirection: Math.atan2(newHY, newHX) * 180 / Math.PI, curveKind: undefined }
            : p));
          return { ...c, autoCurve: false, controlPoints: cps };
        }));
      }
    }
    function handleMove(e: MouseEvent) {
      latestMove = e;
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const event = latestMove;
        latestMove = null;
        if (event) processMove(event);
      });
    }
    function handleUp() {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        const event = latestMove;
        latestMove = null;
        if (event) processMove(event);
      }
      const drag = dragRef.current;
      // 框选结束：计算选中对象（使用 ref 读取最新数据，避免闭包陈旧导致无法选中）
      if (drag.type === "selectionBox") {
        const box = selectionBoxRef.current;
        if (drag.moved && box) {
          const w1 = toWorld(box.x1, box.y1);
          const w2 = toWorld(box.x2, box.y2);
          const selRect = { x: Math.min(w1.x, w2.x), y: Math.min(w1.y, w2.y), w: Math.abs(w2.x - w1.x), h: Math.abs(w2.y - w1.y) };
          const ids: string[] = [];
          // 模块
          for (const m of modulesRef.current) {
            if (!isOnActivePage(m.pageId)) continue;
            if (m.locked || isLayerLocked(m.layerId)) continue;
            const t = resolveTemplatesFor(modulesRef.current).get(m.id) || templateMap.get(m.templateId);
            if (!t) continue;
            if (rectsIntersect(selRect, { x: m.x, y: m.y, w: t.width, h: t.height })) ids.push(m.id);
          }
          // 标签
          for (const l of labelsRef.current) {
            if (!isOnActivePage(l.pageId)) continue;
            if (l.locked || isLayerLocked(l.layerId)) continue;
            const lw = Math.max(20, l.text.length * l.fontSize * 0.6);
            const lh = l.fontSize * 1.4;
            if (rectsIntersect(selRect, { x: l.x, y: l.y, w: lw, h: lh })) ids.push(l.id);
          }
          // 独立站台
          for (const p of platformsRef.current) {
            if (!isOnActivePage(p.pageId)) continue;
            if (p.locked || isLayerLocked(p.layerId)) continue;
            if (rectsIntersect(selRect, { x: p.x, y: p.y, w: p.width, h: p.height })) ids.push(p.id);
          }
          // 图标
          for (const g of graphicsRef.current) {
            if (!isOnActivePage(g.pageId)) continue;
            if (g.locked || isLayerLocked(g.layerId)) continue;
            if (rectsIntersect(selRect, { x: g.x, y: g.y, w: g.width, h: g.height })) ids.push(g.id);
          }
          // 背景图
          for (const b of backgroundImagesRef.current) {
            if (!isOnActivePage(b.pageId)) continue;
            if (b.locked || isLayerLocked(b.layerId)) continue;
            const bw = b.naturalWidth * b.scale;
            const bh = b.naturalHeight * b.scale;
            if (rectsIntersect(selRect, { x: b.x, y: b.y, w: bw, h: bh })) ids.push(b.id);
          }
          // 连接
          for (const conn of connectionsRef.current) {
            if (!isOnActivePage(conn.pageId)) continue;
            if (isLayerLocked(conn.layerId)) continue;
            const tracks = conn.tracks;
            if (!tracks.length) continue;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const t of tracks) {
              minX = Math.min(minX, t.x1, t.x2);
              minY = Math.min(minY, t.y1, t.y2);
              maxX = Math.max(maxX, t.x1, t.x2);
              maxY = Math.max(maxY, t.y1, t.y2);
            }
            if (maxX >= minX && rectsIntersect(selRect, { x: minX, y: minY, w: maxX - minX, h: maxY - minY })) ids.push(conn.id);
          }
          // 换乘组
          for (const tg of transferGroupsRef.current) {
            if (!isOnActivePage(tg.pageId)) continue;
            if (!tg.visible || tg.locked || isLayerLocked(tg.layerId)) continue;
            const bounds = getTransferGroupBounds(tg);
            if (bounds && rectsIntersect(selRect, { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h })) ids.push(tg.id);
          }
          setSelectedIds(ids);
          if (ids.length > 0) setStatus(`已选中 ${ids.length} 个对象`);
        } else if (!drag.moved) {
          // 轻点空白（未移动）→ 取消选中
          setSelectedIds([]);
        }
        setSelectionBox(null);
        dragRef.current = { ...drag, type: "none", moved: false };
        return;
      }
      if (drag.type === "selection") {
        if (!drag.moved) {
          history.discardSnapshot();
        } else {
          setConnections((previous) => {
            const synchronized = synchronizeConnectionTracks(previous, modulesRef.current, resolveTemplatesFor(modulesRef.current));
            connectionsRef.current = synchronized;
            return synchronized;
          });
          setHasUnsavedChanges(true);
          setStatus(`已移动 ${drag.selectionIds?.length ?? 0} 个框选对象`);
          setTimeout(() => applyLabelAvoidance(false), 0);
        }
        dragRef.current = { ...drag, type: "none", moved: false };
        return;
      }
      if (drag.type === "module" && !drag.moved && drag.moduleId) {
        // 点击未移动 → 若 mousedown 前已选中则取消选中，否则选中
        history.discardSnapshot();
        if (drag.wasSelected) {
          setSelectedIds((prev) => prev.filter((id) => id !== drag.moduleId));
        } else {
          setSelectedIds([drag.moduleId]);
        }
      }
      if (drag.type === "module" && drag.moved) {
        // Connection endpoints derive from ports while rendering. Refresh the
        // stored cache once the drag finishes so saved projects stay portable.
        setConnections((prev) => synchronizeConnectionTracks(prev, modulesRef.current, resolveTemplatesFor(modulesRef.current)));
        setHasUnsavedChanges(true);
        // 模块停稳后重新求解站名/图标避让；延迟一帧等 refs 刷新，且不单独落历史快照（并入本次拖动事务）。
        setTimeout(() => applyLabelAvoidance(false), 0);
      }
      if (drag.type === "transferGroup" && !drag.moved && drag.transferGroupId) {
        history.discardSnapshot();
        if (drag.wasSelected) {
          setSelectedIds((previous) => previous.filter((id) => id !== drag.transferGroupId));
        } else {
          setSelectedIds([drag.transferGroupId]);
        }
      }
      if (drag.type === "transferGroup" && drag.moved && drag.transferGroupId) {
        setConnections((previous) => {
          const synchronized = synchronizeConnectionTracks(previous, modulesRef.current, resolveTemplatesFor(modulesRef.current));
          connectionsRef.current = synchronized;
          return synchronized;
        });
        setHasUnsavedChanges(true);
        const group = transferGroupsRef.current.find((candidate) => candidate.id === drag.transferGroupId);
        setStatus(group ? `已整体移动换乘组「${group.name}」` : "已整体移动换乘组");
        setTimeout(() => applyLabelAvoidance(false), 0);
      }
      if (drag.type === "bgImage" && !drag.moved && drag.bgImageId) {
        history.discardSnapshot();
        if (drag.wasSelected) {
          setSelectedIds((prev) => prev.filter((id) => id !== drag.bgImageId));
        } else {
          setSelectedIds([drag.bgImageId]);
        }
      }
      if (drag.type === "bgImage" && drag.moved) {
        setHasUnsavedChanges(true);
      }
      if (drag.type === "label" && !drag.moved && drag.labelId) {
        history.discardSnapshot();
        if (drag.wasSelected) {
          setSelectedIds((prev) => prev.filter((id) => id !== drag.labelId));
        } else {
          setSelectedIds([drag.labelId]);
        }
      }

      if (drag.type === "platform" && !drag.moved && drag.platformId) {
        history.discardSnapshot();
        if (drag.wasSelected) {
          setSelectedIds((prev) => prev.filter((id) => id !== drag.platformId));
        } else {
          setSelectedIds([drag.platformId]);
        }
      }
      if (drag.type === "platform" && drag.moved) {
        setHasUnsavedChanges(true);
        // 拖拽完成后才剥离 moduleId，使站台独立于原模块
        setPlatforms((prev) => prev.map((p) => p.id === drag.platformId ? { ...p, moduleId: undefined } : p));
      }
      if (drag.type === "graphic" && !drag.moved && drag.graphicId) {
        history.discardSnapshot();
        if (drag.wasSelected) {
          setSelectedIds((prev) => prev.filter((id) => id !== drag.graphicId));
        } else {
          setSelectedIds([drag.graphicId]);
        }
      }
      if (drag.type === "graphic" && drag.moved) setHasUnsavedChanges(true);
      if ((drag.type === "platformResize" || drag.type === "graphicResize") && !drag.moved) {
        history.discardSnapshot();
      }
      if ((drag.type === "platformResize" || drag.type === "graphicResize") && drag.moved) setHasUnsavedChanges(true);
      if ((drag.type === "controlPoint" || drag.type === "controlPointHandle") && !drag.moved) {
        history.discardSnapshot();
      }
      if ((drag.type === "controlPoint" || drag.type === "controlPointHandle") && drag.moved) {
        setHasUnsavedChanges(true);
        if (drag.connId) {
          const conn = connections.find((c) => c.id === drag.connId);
          if (conn?.autoCurve !== false) {
            setConnections((prev) => updateConnectionAndPairedRail(prev, drag.connId!, (c) => ({ ...c, autoCurve: false })));
            setStatus("控制点已手动调整，已切换为手动模式");
          }
        }
      }
      dragRef.current = { ...drag, type: "none", moved: false };
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [toWorld, snapEnabled, templateMap, pageGridSize]);

  /** 滚轮缩放 */
  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.15, Math.min(4, viewport.scale * delta));
    // 以鼠标为中心缩放
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldX = (mx - viewport.panX) / viewport.scale;
    const worldY = (my - viewport.panY) / viewport.scale;
    setViewport({
      panX: mx - worldX * newScale,
      panY: my - worldY * newScale,
      scale: newScale,
    });
  }

  useEffect(() => {
    saveProjectActionRef.current = handleSaveProject;
    deleteSelectedActionRef.current = deleteSelected;
  });

  /** 键盘快捷键 */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      // Ctrl+Z 撤销 / Ctrl+Shift+Z 或 Ctrl+Y 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        handleRedo();
        return;
      }
      // Ctrl+S 保存工程
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveProjectActionRef.current();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length) {
          e.preventDefault();
          deleteSelectedActionRef.current();
        }
      } else if (e.key === "Escape") {
        const wasConnecting = activeTool === "connect" || activeTool === "auto" || connectFrom;
        const wasPlacing = activeTool === "shape" && pendingElement !== null;
        setActiveTool("auto");
        setActiveTemplateId(null);
        setPendingElement(null);
        setConnectFrom(null);
        setSelectedIds([]);
        if (wasConnecting) setStatus("已取消连接");
        else if (wasPlacing) setStatus("已取消放置");
      } else if (e.key === "v" || e.key === "V") {
        setActiveTool("select");
      } else if (e.key === "h" || e.key === "H") {
        setActiveTool("pan");
      } else if (e.key === "c" || e.key === "C") {
        setActiveTool("connect");
        setConnectFrom(null);
        setStatus("连接工具：请选择起点端口");
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedIds, handleUndo, handleRedo, backgroundImages, modules, labels, activeTool, connectFrom, pendingElement]);

  /** 右键菜单 */
  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const selModCount = modules.filter((m) => selectedIds.includes(m.id)).length;
    if (selModCount >= 2) {
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  }

  // 关闭右键菜单（Esc 或点击外部）
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onClick = (e: MouseEvent) => {
      if (contextMenu) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [contextMenu]);

  // ── 导出 ──

  function getExportBounds(): ExportBounds {
    if (exportScope !== "selection") return { x: 0, y: 0, width: pageWidth, height: pageHeight };
    const bounds: Array<{ x: number; y: number; width: number; height: number }> = [];
    modules.filter((item) => isOnActivePage(item.pageId) && selectedIds.includes(item.id)).forEach((item) => {
      const template = resolvedTemplateMap.get(item.id) || templateMap.get(item.templateId);
      if (template) bounds.push({ x: item.x, y: item.y, width: template.width, height: template.height });
    });
    backgroundImages.filter((item) => isOnActivePage(item.pageId) && selectedIds.includes(item.id)).forEach((item) => {
      bounds.push({ x: item.x, y: item.y, width: item.naturalWidth * item.scale, height: item.naturalHeight * item.scale });
    });
    labels.filter((item) => isOnActivePage(item.pageId) && selectedIds.includes(item.id)).forEach((item) => {
      bounds.push({ x: item.x - item.text.length * item.fontSize * 0.35, y: item.y - item.fontSize, width: Math.max(item.fontSize, item.text.length * item.fontSize * 0.7), height: item.fontSize * 1.5 });
    });
    connections.filter((item) => isOnActivePage(item.pageId) && selectedIds.includes(item.id)).forEach((item) => {
      const tracks = rebuildConnectionTrackCache(item);
      if (!tracks.length) return;
      const xs = tracks.flatMap((track) => [track.x1, track.x2]);
      const ys = tracks.flatMap((track) => [track.y1, track.y2]);
      bounds.push({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
    });
    transferGroups.filter((item) => isOnActivePage(item.pageId) && selectedIds.includes(item.id)).forEach((item) => {
      const groupBounds = getTransferGroupBounds(item);
      if (groupBounds) bounds.push({ x: groupBounds.x, y: groupBounds.y, width: groupBounds.w, height: groupBounds.h });
    });
    if (!bounds.length) return { x: 0, y: 0, width: pageWidth, height: pageHeight };
    const padding = 24;
    const left = Math.max(0, Math.min(...bounds.map((item) => item.x)) - padding);
    const top = Math.max(0, Math.min(...bounds.map((item) => item.y)) - padding);
    const right = Math.min(pageWidth, Math.max(...bounds.map((item) => item.x + item.width)) + padding);
    const bottom = Math.min(pageHeight, Math.max(...bounds.map((item) => item.y + item.height)) + padding);
    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  }

  async function exportSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      setStatus("正在整理导出资源…");
      const bounds = getExportBounds();
      const str = await svgToString(svg, bounds, exportIncludeBackground, exportTransparent);
      downloadBlob(new Blob([str], { type: "image/svg+xml;charset=utf-8" }), `${activePage?.name || "配线图"}.svg`);
      setStatus(`已导出「${activePage?.name || "配线图"}」SVG`);
    } catch (error) {
      setStatus(`导出失败：${error instanceof Error ? error.message : "无法读取背景图"}`);
    }
  }

  async function exportPng(scale: number) {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      setStatus("正在整理背景图并生成 PNG…");
      const bounds = getExportBounds();
      const str = await svgToString(svg, bounds, exportIncludeBackground, exportTransparent);
      const w = Math.round(bounds.width * scale);
      const h = Math.round(bounds.height * scale);
      const svgUrl = URL.createObjectURL(new Blob([str], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(svgUrl);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setStatus("导出失败：浏览器无法创建图片画布");
          return;
        }
        if (!exportTransparent) {
          ctx.fillStyle = activePage?.backgroundColor || "white";
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) {
            setStatus("导出失败：浏览器无法编码 PNG");
            return;
          }
          downloadBlob(blob, `${activePage?.name || "配线图"}_${scale}x.png`);
          setStatus(`已导出「${activePage?.name || "配线图"}」${scale}× PNG`);
        }, "image/png");
      };
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        setStatus("导出失败：导出画面无法栅格化");
      };
      img.src = svgUrl;
    } catch (error) {
      setStatus(`导出失败：${error instanceof Error ? error.message : "无法读取背景图"}`);
    }
  }

  function createNewCanvas() {
    const page = createCanvasPage({
      id: genId("page"), name: newCanvasDraft.name, width: newCanvasDraft.width, height: newCanvasDraft.height,
      backgroundColor: newCanvasDraft.backgroundColor, gridSize: newCanvasDraft.gridSize, showGrid: newCanvasDraft.showGrid,
      orientation: newCanvasDraft.orientation, layerRootIds: layers.filter((layer) => layer.parentId === null).map((layer) => layer.id),
    });
    setPages((prev) => [...prev, page]);
    setActivePageId(page.id);
    setViewport(page.viewport);
    setShowGrid(page.showGrid);
    setSelectedIds([]);
    setNewCanvasOpen(false);
    setHasUnsavedChanges(true);
    setStatus(`已新建画布「${page.name}」`);
  }

  function switchCanvasPage(pageId: string) {
    const nextPage = pages.find((page) => page.id === pageId);
    if (!nextPage || pageId === activePageId) return;
    setPages((prev) => prev.map((page) => page.id === activePageId ? { ...page, viewport, showGrid } : page));
    setActivePageId(pageId);
    setViewport(nextPage.viewport);
    setShowGrid(nextPage.showGrid);
    setSelectedIds([]);
    setStatus(`已切换至画布「${nextPage.name}」`);
  }

  function renameActivePage() {
    const name = window.prompt("画布名称", activePage?.name || "");
    if (!name?.trim() || !activePage) return;
    history.captureSnapshot("重命名画布"); setPages((prev) => prev.map((page) => page.id === activePage.id ? { ...page, name: name.trim() } : page)); setHasUnsavedChanges(true);
  }
  function deleteActivePage() {
    if (!activePage || pages.length < 2) return;
    history.captureSnapshot("删除画布"); const next = pages.filter((page) => page.id !== activePage.id); setPages(next); setActivePageId(next[0].id); setViewport(next[0].viewport); setHasUnsavedChanges(true);
  }
  function fitCanvas() { const svg = svgRef.current; if (!svg) return; const scale = Math.min(svg.clientWidth / pageWidth, svg.clientHeight / pageHeight) * 0.9; setViewport({ scale, panX: (svg.clientWidth - pageWidth * scale) / 2, panY: (svg.clientHeight - pageHeight * scale) / 2 }); }
  function centerCanvas() { const svg = svgRef.current; if (!svg) return; setViewport((prev) => ({ ...prev, panX: (svg.clientWidth - pageWidth * prev.scale) / 2, panY: (svg.clientHeight - pageHeight * prev.scale) / 2 })); }

  function applyCanvasPreset(presetId: string) {
    const preset = CANVAS_PRESETS.find((item) => item.id === presetId);
    if (preset) {
      setNewCanvasDraft((prev) => ({
        ...prev,
        width: preset.width,
        height: preset.height,
        orientation: preset.width >= preset.height ? "landscape" : "portrait",
      }));
    }
  }

  // ── 工程保存/加载 ──

  function editorDocumentFor(project: ProjectFile): JsonEditorDocument {
    return JSON.parse(projectToJson(project)) as JsonEditorDocument;
  }

  async function persistWiringProject(project: ProjectFile) {
    await Promise.all([
      saveToIndexedDB(project, autosaveKey),
      documentStore.save(projectId, "wiring", editorDocumentFor(project)),
    ]);
  }

  /** 立即保存到当前城市项目；公共工程文件统一从项目首页导入、导出。 */
  async function handleSaveProject() {
    const project = serializeProject({
      projectName,
      modules,
      connections,
      layers,
      viewport,
      backgroundImages,
      labels,
      transferGroups,
      platforms, graphics, assets, sourceLines, sourceStationsOnLine, physicalStations, sourceMappings, filters: filterState, unresolvedChanges, pendingPlacement,
      servicePatterns,
      sourceDataSnapshot: data || undefined,
      pages: pages.map((page) => page.id === activePageId ? { ...page, viewport, showGrid } : page),
    });
    setSaveStatus("saving");
    try {
      await persistWiringProject(project);
      setSaveStatus("saved");
      setHasUnsavedChanges(false);
      setStatus("已保存到当前城市项目");
    } catch (err) {
      setSaveStatus("error");
      setStatus(`保存失败：${err instanceof Error ? err.message : "未知错误"}`);
    }
  }

  // ── 自动保存到 IndexedDB（防抖） ──
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const timer = window.setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const project = serializeProject({
          projectName,
          modules,
          connections,
          layers,
          viewport,
          backgroundImages,
          labels,
          transferGroups,
          platforms, graphics, assets, sourceLines, sourceStationsOnLine, physicalStations, sourceMappings, filters: filterState, unresolvedChanges, pendingPlacement,
          servicePatterns,
          sourceDataSnapshot: data || undefined,
          pages: pages.map((page) => page.id === activePageId ? { ...page, viewport, showGrid } : page),
        });
        await persistWiringProject(project);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [modules, connections, layers, viewport, projectName, hasUnsavedChanges, backgroundImages, labels, transferGroups, servicePatterns, pages, activePageId, showGrid, data, platforms, graphics, assets, sourceLines, sourceStationsOnLine, physicalStations, sourceMappings, filterState, unresolvedChanges, pendingPlacement, autosaveKey, documentStore, projectId]);

  // ── 启动时按顺序加载当前 CSV，再恢复画布工程 ──
  useEffect(() => {
    let cancelled = false;
    setStatus("正在读取项目 CSV 与配线图…");
    (async () => {
      const normalized = normalizeTransitData(await projectRepository.loadTransitData(projectId));
      const [storedDocument, compatibleProject] = await Promise.all([
        documentStore.load<Record<string, unknown>>(projectId, "wiring").catch(() => null),
        loadFromIndexedDB(autosaveKey).catch(() => null),
      ]);
      let project = newestWiringProject(
        storedDocument ? migrateProjectSchema(storedDocument as unknown as ProjectFile) : null,
        compatibleProject,
      );
      // 旧版编辑器使用全局裸 key "autosave"；仅当默认工程没有项目数据时迁移一次到项目作用域键，随后删除裸 key。
      if (projectId === DEFAULT_PROJECT_ID && isWiringProjectEmpty(project)) {
        const legacy = await loadFromIndexedDB("autosave");
        if (legacy) {
          await persistWiringProject(legacy);
          await deleteFromIndexedDB("autosave").catch(() => undefined);
          project = legacy;
        }
      }
      // 每个浏览器只初始化一次固定的“虚空城”示例。这样旧版空壳能升级，用户之后主动清空也不会被再次覆盖。
      if (projectId === DEFAULT_PROJECT_ID && localStorage.getItem(DEFAULT_WIRING_SAMPLE_MARKER) !== "1") {
        if (shouldInstallDefaultWiringSample(project)) {
          const sample = await loadDefaultWiringSample(projectId).catch(() => null);
          if (sample) {
            project = sample;
            await persistWiringProject(sample);
            localStorage.setItem(DEFAULT_WIRING_SAMPLE_MARKER, "1");
          }
        } else {
          localStorage.setItem(DEFAULT_WIRING_SAMPLE_MARKER, "1");
        }
      }
      if (cancelled) return;
      if (project) {
          const associationKey = (candidate: ProjectFile) => JSON.stringify({
            modules: candidate.modules.map((module) => [module.sourceStationIds, module.lineIds]),
            platforms: candidate.platforms.map((platform) => [platform.sourceStationId, platform.sourceLineId]),
            labels: candidate.labels.map((label) => [label.sourceStationId, label.sourceLineId, label.language]),
            transferGroups: candidate.transferGroups.map((group) => [group.sourceStationIds, group.lineIds]),
            servicePatterns: candidate.servicePatterns.map((pattern) => [pattern.memberLineIds, pattern.stationPathIds]),
            physicalStations: candidate.physicalStations.map((physical) => physical.sourceStationIds),
            sourceMappings: candidate.sourceMappings.map((mapping) => [mapping.sourceLineId, mapping.sourceStationId, mapping.sourceStationOnLineId, mapping.physicalStationId, mapping.status]),
            filterLineIds: candidate.filters.lineIds,
            pendingPlacement: candidate.pendingPlacement,
          });
          const associationsBefore = associationKey(project);
          const synchronized = synchronizeWiringProjectSource(project, normalized);
          project = synchronized;
          if (associationKey(project) !== associationsBefore) {
            // 同步自动解除了指向已删除站点的关联：把清理结果写回当前工程的配线图文档。
            await persistWiringProject(project);
          }
          setProjectName(project.projectInfo?.name || "未命名配线图");
          setModules(project.modules);
          setConnections(project.connections || []);
          if (project.layers?.length) setLayers(project.layers);
          if (project.backgroundImages?.length) setBackgroundImages(project.backgroundImages);
          if (project.labels?.length) setLabels(project.labels);
          if (project.transferGroups?.length) setTransferGroups(project.transferGroups);
          setPlatforms(project.platforms || []); setGraphics(project.graphics || []); setAssets(project.assets || []); setSourceLines(project.sourceLines || []); setSourceStationsOnLine(project.sourceStationsOnLine || []); setPhysicalStations(project.physicalStations || []); setSourceMappings(project.sourceMappings || []); setFilterState(project.filters || { lineIds: [] }); setUnresolvedChanges(project.unresolvedChanges || []); setPendingPlacement(project.pendingPlacement || null);
          if (project.servicePatterns?.length) setServicePatterns(project.servicePatterns);
          setData(normalized);
          const restoredPages = project.pages?.length ? project.pages : [createCanvasPage({ id: "page-1", name: "主画布" })];
          setPages(restoredPages);
          setActivePageId(restoredPages[0].id);
          setShowGrid(restoredPages[0].showGrid);
          setViewport(restoredPages[0].viewport);
          setStatus(project.unresolvedChanges.length
            ? `已恢复配线图，并同步当前 CSV（检测到 ${project.unresolvedChanges.length} 项变化）`
            : "已恢复配线图，站点数据已与当前 CSV 同步");
      } else {
        const identity = buildSourceIdentityRecords(normalized);
        setData(normalized);
        setSourceLines(identity.sourceLines);
        setSourceStationsOnLine(identity.sourceStationsOnLine);
        setStatus("数据已载入");
      }
    })().catch((reason) => {
      if (cancelled) return;
      setError(reason instanceof Error ? reason.message : "读取失败");
      setData(normalizeTransitData({ schemaVersion: 1, lines: [], stations: [], transfers: [], layout: DEFAULT_LAYOUT, activeStyleTemplate: "classic", layoutTemplates: { classic: DEFAULT_LAYOUT, loop: DEFAULT_LOOP_LAYOUT, scenic: DEFAULT_SCENIC_LAYOUT, pulse: DEFAULT_PULSE_LAYOUT } }));
      setStatus("项目数据读取失败");
    });
    return () => { cancelled = true; };
  }, [autosaveKey, projectId, projectRepository, documentStore]);

  // ── 工具栏操作 ──

  function selectTemplate(templateId: string) {
    setSelectedIds([]);
    setActiveTemplateId(templateId);
    setPendingElement(null);
    setActiveTool("place");
    setStatus(`已选择模板，点击画布放置`);
  }

  function connectionFailureMessage(reason: string): string {
    const messages: Record<string, string> = {
      "same-port": "请选择另一个端口",
      "same-module": "不能连接同一模块内的端口",
      "missing-port": "端口不存在，无法建立连接",
      role: "端口角色不匹配：上、下行及侧线必须分别对应",
      duplicate: "该连接已存在",
      occupied: "端口已被占用，请先删除原有连接",
    };
    return messages[reason] || "无法建立连接";
  }

  function makeConnection(
    from: NonNullable<ReturnType<typeof getConnectionEndpoint>>,
    to: NonNullable<ReturnType<typeof getConnectionEndpoint>>,
    connectionModules: DiagramModule[] = modules,
    pairedEndpoints?: PairedCurveEndpoints,
  ): ModuleConnection {
    const endpoints = curveEndpointsFor(from, to);
    const ids = {
      from: `${from.moduleId}:${from.portId}:endpoint-from`,
      middle: `${from.moduleId}:${from.portId}:${to.moduleId}:${to.portId}:middle`,
      to: `${to.moduleId}:${to.portId}:endpoint-to`,
    };
    const autoControlPoints = pairedEndpoints
      ? createPairedAutoControlPoints(endpoints, pairedEndpoints, ids)
      : createAutoControlPoints(endpoints.from, endpoints.to, endpoints.fromDir, endpoints.toDir, ids);

    const connection: ModuleConnection = {
      id: genId("conn"),
      fromModuleId: from.moduleId,
      fromPortId: from.portId,
      toModuleId: to.moduleId,
      toPortId: to.portId,
      tracks: [],
      crossingType: "plain",
      lineStyle: "solid",
      crossingPoints: [],
      controlPoints: autoControlPoints,
      autoCurve: true,
      layerId: defaultConnectionLayerId(
        connectionModules.find((module) => module.id === from.moduleId),
        connectionModules.find((module) => module.id === to.moduleId),
        sourceLines,
      ),
      zIndexMode: "auto",
      zIndex: connections.length,
      pageId: activePageId,
      createdOrder: Date.now(),
    };
    return { ...connection, tracks: getConnectionTracks(connection, connectionModules, resolveTemplatesFor(connectionModules)) };
  }

  /** Finds the closest destination that would be accepted by the connection click handler. */
  function previewDestinationFor(source: NonNullable<ReturnType<typeof getConnectionEndpoint>>) {
    let closest: { endpoint: NonNullable<ReturnType<typeof getConnectionEndpoint>>; distance: number } | null = null;
    for (const module of modules) {
      if (!isOnActivePage(module.pageId) || !isModuleVisible(module)) continue;
      const template = resolvedTemplateMap.get(module.id) || templateMap.get(module.templateId);
      if (!template) continue;
      for (const port of template.ports) {
        const destination = getConnectionEndpoint(module.id, port.id, modules, resolvedTemplateMap);
        if (!destination || !validateConnection(source, destination, connections).valid) continue;
        const position = worldPortPosition(module, template, port.id);
        const distance = Math.hypot(mouseWorld.x - position.x, mouseWorld.y - position.y);
        if (distance <= PORT_SNAP_RADIUS && (!closest || distance < closest.distance)) {
          closest = { endpoint: destination, distance };
        }
      }
    }
    return closest?.endpoint || null;
  }

  /** Uses the same endpoint and automatic-curve rules as a saved connection. */
  function connectionPreviewPaths(source: NonNullable<ReturnType<typeof getConnectionEndpoint>>, destination: NonNullable<ReturnType<typeof getConnectionEndpoint>>) {
    const primaryEndpoints = curveEndpointsFor(source, destination);
    const ids = { from: "preview:endpoint-from", middle: "preview:middle", to: "preview:endpoint-to" };
    let pairedEndpoints: PairedCurveEndpoints | undefined;
    let pairedPath: string | undefined;

    if (doubleTrackConnect) {
      const sourcePartner = findDoubleTrackPartner(source.template, source.port);
      const destinationPartner = findDoubleTrackPartner(destination.template, destination.port);
      if (sourcePartner && destinationPartner) {
        const pairedSource = getConnectionEndpoint(source.moduleId, sourcePartner.id, modules, resolvedTemplateMap);
        const pairedDestination = getConnectionEndpoint(destination.moduleId, destinationPartner.id, modules, resolvedTemplateMap);
        if (validateConnection(pairedSource, pairedDestination, connections).valid) {
          pairedEndpoints = curveEndpointsFor(pairedSource!, pairedDestination!);
          pairedPath = buildPairedOffsetPathD(pairedEndpoints, primaryEndpoints) || undefined;
        }
      }
    }

    const primaryControlPoints = pairedEndpoints
      ? createPairedAutoControlPoints(primaryEndpoints, pairedEndpoints, ids)
      : createAutoControlPoints(primaryEndpoints.from, primaryEndpoints.to, primaryEndpoints.fromDir, primaryEndpoints.toDir, ids);
    const primaryPath = pairedEndpoints
      ? buildPairedOffsetPathD(primaryEndpoints, pairedEndpoints) || buildControlPointPathD(primaryEndpoints.from, primaryEndpoints.to, primaryControlPoints, primaryEndpoints.fromDir, primaryEndpoints.toDir)
      : buildControlPointPathD(primaryEndpoints.from, primaryEndpoints.to, primaryControlPoints, primaryEndpoints.fromDir, primaryEndpoints.toDir);
    return pairedPath ? [primaryPath, pairedPath] : [primaryPath];
  }

  /** Connection tool: choose two compatible ports. Standard main pairs can be created together. */
  function handlePortClick(e: React.MouseEvent, mod: DiagramModule, portId: string) {
    e.stopPropagation();
    if (activeTool !== "connect" && activeTool !== "auto") return;
    const destination = getConnectionEndpoint(mod.id, portId, modules, resolvedTemplateMap);
    if (!destination) return;

    if (!connectFrom) {
      if (portIsOccupied(connections, mod.id, portId)) {
        setStatus("端口已被占用，请先删除原有连接");
        return;
      }
      setConnectFrom({ moduleId: mod.id, portId });
      setStatus("已选择起点端口，点击兼容端口完成连接 · Esc 或右键取消");
      return;
    }

    if (connectFrom.moduleId === mod.id && connectFrom.portId === portId) {
      setConnectFrom(null);
      setStatus("已取消连接");
      return;
    }

    const source = getConnectionEndpoint(connectFrom.moduleId, connectFrom.portId, modules, resolvedTemplateMap);
    const validation = validateConnection(source, destination, connections);
    if (!validation.valid) {
      setStatus(connectionFailureMessage(validation.reason));
      return;
    }

    const created = [makeConnection(source!, destination)];
    if (doubleTrackConnect) {
      const sourcePartner = findDoubleTrackPartner(source!.template, source!.port);
      const destinationPartner = findDoubleTrackPartner(destination.template, destination.port);
      if (sourcePartner && destinationPartner) {
        const pairedSource = getConnectionEndpoint(source!.moduleId, sourcePartner.id, modules, resolvedTemplateMap);
        const pairedDestination = getConnectionEndpoint(destination.moduleId, destinationPartner.id, modules, resolvedTemplateMap);
        const pairedValidation = validateConnection(pairedSource, pairedDestination, connections);
        if (pairedValidation.valid) {
          const primaryEndpoints = curveEndpointsFor(source!, destination);
          const secondaryEndpoints = curveEndpointsFor(pairedSource!, pairedDestination!);
          const primary = makeConnection(source!, destination, modules, secondaryEndpoints);
          const pairedConnection = makeConnection(pairedSource!, pairedDestination!, modules, primaryEndpoints);
          created[0] = { ...primary, pairedConnectionId: pairedConnection.id };
          created.push({ ...pairedConnection, pairedConnectionId: primary.id });
        }
      }
    }
    history.captureSnapshot("手动连接");
    setConnections((prev) => [...prev, ...created]);
    setConnectFrom(null);
    setStatus(created.length === 2 ? "已创建双线区间连接" : "已创建单线连接");
    setHasUnsavedChanges(true);
  }

  function zoomBy(factor: number) {
    const newScale = Math.max(0.15, Math.min(4, viewport.scale * factor));
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const worldX = (cx - viewport.panX) / viewport.scale;
    const worldY = (cy - viewport.panY) / viewport.scale;
    setViewport({ panX: cx - worldX * newScale, panY: cy - worldY * newScale, scale: newScale });
  }

  function resetViewport() {
    setViewport({ panX: 100, panY: 60, scale: 0.75 });
  }

  // ── 数据面板辅助 ──

  const filteredStations = useMemo(() => {
    const byLine = new Map<string, Station[]>();
    if (!data) return byLine;
    const all = data.stations.filter((s) => {
      if (showPlacedOnly && !placedStationIds.has(s.id)) return false;
      if (filterState.placement === "unplaced" && placedStationIds.has(s.id)) return false;
      if (activeFilterLineIds.length && !activeFilterLineIds.includes(s.lineId)) return false;
      const stationStatus = !s.isOpen ? "closed" : s.terminalType === "normal" ? "open" : "terminal";
      if (filterState.stationStatuses?.length && !filterState.stationStatuses.includes(stationStatus)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return s.nameZh.includes(searchQuery) || s.nameEn.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
      }
      return true;
    });
    all.forEach((s) => {
      if (!byLine.has(s.lineId)) byLine.set(s.lineId, []);
      byLine.get(s.lineId)!.push(s);
    });
    byLine.forEach((list) => list.sort((a, b) => a.sequence - b.sequence));
    return byLine;
  }, [data, searchQuery, showPlacedOnly, placedStationIds, filterState.placement, filterState.stationStatuses, activeFilterLineIds]);
  const physicalStationSuggestions = useMemo(() => data ? suggestPhysicalStations(data, sourceMappings) : [], [data, sourceMappings]);
  const pendingSourcePlacements = useMemo(() => pendingPlacementChanges(unresolvedChanges), [unresolvedChanges]);

  // ── 模板分组 ──

  const templateGroups = useMemo(() => templatesByCategory(), []);

  // ── 下拉菜单项（useMemo 避免每次渲染重建；必须在所有早返回之前）──

  const importMenuItems: PopoverMenuItem[] = [
    { kind: "action", id: "reload-project-csv", label: "重新读取项目 CSV", icon: "↻", onClick: () => void reloadProjectCsv() },
    { kind: "action", id: "csv", label: "导入 CSV", icon: "📄", onClick: () => csvImportRef.current?.click() },
    { kind: "action", id: "bg", label: "导入背景图", icon: "🖼", onClick: () => bgImageInputRef.current?.click() },
    { kind: "separator", id: "sep1" },
    { kind: "action", id: "icon-zip", label: "图标 ZIP", icon: "📦", onClick: () => iconArchiveInputRef.current?.click() },
    { kind: "action", id: "icon-dir", label: "图标目录", icon: "📁", onClick: () => iconDirectoryInputRef.current?.click() },
    { kind: "separator", id: "sep2" },
    { kind: "checkbox", id: "tracing", label: "描图模式", checked: tracingMode, onChange: toggleTracingMode, title: "降低背景图不透明度，便于对照绘制" },
  ];

  const exportMenuItems: PopoverMenuItem[] = useMemo(() => [
    { kind: "action", id: "svg", label: "导出 SVG", onClick: exportSvg },
    { kind: "action", id: "png", label: "导出 PNG", onClick: () => exportPng(pngScale) },
    { kind: "select", id: "png-scale", label: "PNG 倍率", value: pngScale, options: [{ value: 1, label: "1× (低清)" }, { value: 2, label: "2× (高清)" }, { value: 4, label: "4× (超清)" }], onChange: (v) => setPngScale(Number(v) as 1 | 2 | 4) },
    { kind: "select", id: "scope", label: "导出范围", value: exportScope, options: [{ value: "canvas", label: "整个画布" }, { value: "selection", label: "选中区域" }], onChange: (v) => setExportScope(v as "canvas" | "selection") },
    { kind: "separator", id: "sep1" },
    { kind: "checkbox", id: "include-bg", label: "包含背景图", checked: exportIncludeBackground, onChange: setExportIncludeBackground },
    { kind: "checkbox", id: "transparent", label: "透明背景", checked: exportTransparent, onChange: setExportTransparent },
  ], [pngScale, exportScope, exportIncludeBackground, exportTransparent, exportSvg, exportPng]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterState.stationStatuses?.length) count++;
    if (filterState.objectTypes?.length) count++;
    if (filterState.changeStatuses?.length) count++;
    if (filterState.layerIds?.length) count++;
    if (filterState.labelLanguageMode && filterState.labelLanguageMode !== "zh") count++;
    return count;
  }, [filterState]);

  const filterMenuItems: PopoverMenuItem[] = useMemo(() => [
    { kind: "select", id: "service", label: "交路", value: activeServicePatternId, options: [{ value: "", label: "全部交路" }, ...servicePatterns.filter((p) => p.visible).map((p) => ({ value: p.id, label: `${p.id} · ${p.name}` }))], onChange: (v) => { setActiveServicePatternId(v); setFilterLineIds([]); updateFilters({ lineIds: [], servicePatternIds: v ? [v] : [] }); } },
    { kind: "select", id: "line", label: "线路", value: filterLineIds[0] || "", options: [{ value: "", label: "全部线路" }, ...(data?.lines || []).map((l) => ({ value: l.id, label: `${l.id} · ${l.nameZh}` }))], onChange: (v) => { const ids = v ? [v] : []; setFilterLineIds(ids); setActiveServicePatternId(""); updateFilters({ lineIds: ids, servicePatternIds: [] }); } },
    { kind: "select", id: "mode", label: "显示模式", value: filterState.mode || "target_only", options: [{ value: "target_only", label: "仅目标" }, { value: "retain_transfers", label: "保留换乘" }, { value: "dim_others", label: "弱化其它" }], onChange: (v) => updateFilters({ mode: v as FilterState["mode"] }) },
    { kind: "section", id: "advanced-filters", label: "高级筛选", defaultExpanded: false, items: [
      { kind: "select", id: "station-status", label: "站点状态", value: filterState.stationStatuses?.[0] || "", options: [{ value: "", label: "全部状态" }, { value: "open", label: "已开通" }, { value: "closed", label: "未开通" }, { value: "terminal", label: "终点" }], onChange: (v) => updateFilters({ stationStatuses: v ? [v as "open" | "closed" | "terminal"] : [] }) },
      { kind: "select", id: "object-type", label: "对象类型", value: filterState.objectTypes?.[0] || "", options: [{ value: "", label: "全部对象" }, { value: "module", label: "模块" }, { value: "connection", label: "轨道" }, { value: "platform", label: "站台" }, { value: "label", label: "文字" }, { value: "graphic", label: "图标" }, { value: "transfer", label: "换乘" }, { value: "background", label: "背景" }], onChange: (v) => updateFilters({ objectTypes: v ? [v as "module" | "connection" | "platform" | "label" | "graphic" | "transfer" | "background"] : [] }) },
      { kind: "select", id: "change-status", label: "数据变更", value: filterState.changeStatuses?.[0] || "", options: [{ value: "", label: "全部变更" }, { value: "unresolved", label: "未处理" }, { value: "accepted", label: "已接受" }, { value: "ignored", label: "已忽略" }], onChange: (v) => updateFilters({ changeStatuses: v ? [v as SourceChange["status"]] : [] }) },
      { kind: "select", id: "layer", label: "图层", value: filterState.layerIds?.[0] || "", options: [{ value: "", label: "全部图层" }, ...layers.map((l) => ({ value: l.id, label: l.name }))], onChange: (v) => updateFilters({ layerIds: v ? [v] : [] }) },
      { kind: "select", id: "lang", label: "站名语言", value: filterState.labelLanguageMode || "zh", options: [{ value: "zh", label: "仅中文站名" }, { value: "en", label: "仅英文站名" }, { value: "bilingual", label: "中英双语" }], onChange: (v) => updateFilters({ labelLanguageMode: v as FilterState["labelLanguageMode"] }) },
    ] },
  ], [activeServicePatternId, filterLineIds, filterState, servicePatterns, data, layers, updateFilters, setActiveServicePatternId, setFilterLineIds]);

  // ── 渲染 ──

  if (!data) {
    return (
      <main className="loading-shell">
        <div className="loading-card">
          <span className="brand-mark"><img src={siteUrl("assets/rail-transit-icon.png")} alt="" /></span>
          <h1>配线图编辑器</h1>
          <p>{error || status}</p>
          {error && <button onClick={() => window.location.reload()}>重新连接</button>}
        </div>
      </main>
    );
  }
  const currentData = data;

  /** 递归渲染图层树节点 */
  function renderLayerNode(layer: LayerNode, depth: number): React.ReactNode {
    const children = getChildLayers(layers, layer.id);
    const hasChild = children.length > 0;
    const treeVisible = isLayerTreeVisible(layers, layer.id);
    const treeLocked = isLayerTreeLocked(layers, layer.id);
    const isRenaming = renamingLayerId === layer.id;
    const isDragging = layerDragState.draggedId === layer.id;
    const isDropTarget = layerDragState.dropTargetId === layer.id;
    const dropPos = layerDragState.dropPosition;

    return (
      <React.Fragment key={layer.id}>
        <div
          className={`wiring-layer-row ${isDragging ? "dragging" : ""} ${isDropTarget && dropPos === "before" ? "drop-before" : ""} ${isDropTarget && dropPos === "after" ? "drop-after" : ""} ${isDropTarget && dropPos === "inside" ? "drop-inside" : ""}`}
          style={{ paddingLeft: depth * 16 + 4 }}
          draggable
          onDragStart={(e) => {
            layerDragRef.current = { draggedId: layer.id, dropTargetId: null, dropPosition: null };
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            if (layerDragRef.current.draggedId && layerDragRef.current.dropTargetId && layerDragRef.current.dropPosition) {
              moveLayer(layerDragRef.current.draggedId, layerDragRef.current.dropTargetId, layerDragRef.current.dropPosition);
            }
            layerDragRef.current = { draggedId: null, dropTargetId: null, dropPosition: null };
            setLayerDragState({ draggedId: null, dropTargetId: null, dropPosition: null });
          }}
          onDragOver={(e) => {
            if (!layerDragRef.current.draggedId || layerDragRef.current.draggedId === layer.id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const y = e.clientY - rect.top;
            const h = rect.height;
            let pos: "before" | "after" | "inside";
            if (y < h * 0.25) pos = "before";
            else if (y > h * 0.75) pos = "after";
            else pos = "inside";
            if (layerDragRef.current.dropTargetId !== layer.id || layerDragRef.current.dropPosition !== pos) {
              layerDragRef.current.dropTargetId = layer.id;
              layerDragRef.current.dropPosition = pos;
              setLayerDragState({ draggedId: layerDragRef.current.draggedId, dropTargetId: layer.id, dropPosition: pos });
            }
          }}
          onDragLeave={() => {
            if (layerDragRef.current.dropTargetId === layer.id) {
              layerDragRef.current.dropTargetId = null;
              layerDragRef.current.dropPosition = null;
              setLayerDragState({ ...layerDragRef.current });
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            // drop 在 moveLayer 中由 onDragEnd 触发
          }}
        >
          {/* 展开/折叠按钮 */}
          {hasChild ? (
            <button className="layer-toggle layer-expand" onClick={() => toggleLayerExpanded(layer.id)} title={layer.expanded ? "折叠" : "展开"}>
              {layer.expanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="layer-toggle-spacer" />
          )}
          {/* 可见性 */}
          <button className={`layer-toggle ${!treeVisible ? "muted" : ""}`} onClick={() => toggleLayer(layer.id)} title={layer.visible ? "隐藏" : "显示"}>
            {layer.visible ? "👁" : "🚫"}
          </button>
          {/* 锁定 */}
          <button className={`layer-toggle ${treeLocked ? "muted" : ""}`} onClick={() => toggleLayerLock(layer.id)} title={layer.locked ? "解锁" : "锁定"}>
            {layer.locked ? "🔒" : "🔓"}
          </button>
          {/* 名称（双击重命名） */}
          {isRenaming ? (
            <input
              className="layer-name-input"
              type="text"
              value={layer.name}
              autoFocus
              onChange={(e) => renameLayer(layer.id, e.target.value)}
              onBlur={() => setRenamingLayerId(null)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setRenamingLayerId(null); }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="layer-name" onDoubleClick={() => setRenamingLayerId(layer.id)} title="双击重命名">{layer.name}</span>
          )}
          {/* 透明度 */}
          <input type="range" min={0} max={1} step={0.1} value={layer.opacity} onChange={(e) => setLayerOpacity(layer.id, parseFloat(e.target.value))} style={{ width: 36 }} title={`不透明度 ${Math.round(layer.opacity * 100)}%`} />
          <button className="layer-toggle layer-menu" onClick={() => moveLayerBy(layer.id, "top")} title="置顶">⇈</button>
          <button className="layer-toggle layer-menu" onClick={() => moveLayerBy(layer.id, "up")} title="上移">↑</button>
          <button className="layer-toggle layer-menu" onClick={() => moveLayerBy(layer.id, "down")} title="下移">↓</button>
          <button className="layer-toggle layer-menu" onClick={() => moveLayerBy(layer.id, "bottom")} title="置底">⇊</button>
          {/* 操作菜单 */}
          <button className="layer-toggle layer-menu" onClick={() => createSubLayer(layer.id)} title="新建子图层">＋</button>
          <button className="layer-toggle layer-menu danger" onClick={() => deleteLayer(layer.id)} title="删除图层">✕</button>
        </div>
        {/* 递归渲染子图层 */}
        {hasChild && layer.expanded && children.map((child) => renderLayerNode(child, depth + 1))}
      </React.Fragment>
    );
  }

  const transform = `translate(${viewport.panX},${viewport.panY}) scale(${viewport.scale})`;
  const selectedMod = selectedModules[0] || null;
  const selectedTemplate = selectedMod ? templateMap.get(selectedMod.templateId) : null;

  const selectedBgImage = backgroundImages.find((b) => selectedIds.includes(b.id)) || null;
  const bgLocked = selectedBgImage ? selectedBgImage.locked || isLayerLocked(selectedBgImage.layerId) : false;
  const selectedLabel = labels.find((l) => selectedIds.includes(l.id)) || null;
  const selectedPlatform = platforms.find((platform) => selectedIds.includes(platform.id)) || null;
  const selectedGraphic = graphics.find((graphic) => selectedIds.includes(graphic.id)) || null;
  const selectedConnection = connections.find((c) => selectedIds.includes(c.id)) || null;
  const selectedTransferGroup = transferGroups.find((g) => selectedIds.includes(g.id)) || null;
  const placementTemplate = activeTemplateId ? templateMap.get(activeTemplateId) : undefined;
  const placementStation = pendingStationId ? data?.stations.find((station) => station.id === pendingStationId) : undefined;
  const placementTargetName = activeTool === "place" && placementTemplate
    ? placementTemplate.name
    : activeTool === "label"
      ? "文字工具"
      : activeTool === "shape" && pendingElement?.kind === "shape"
        ? SHAPE_META[pendingElement.shapeType].label
        : activeTool === "shape" && pendingElement?.kind === "number"
          ? (pendingElement.numeralType === "track" ? "股道编号" : "道岔编号")
          : "";
  const automaticPlacementLayerId = placementTemplate
    ? defaultModuleLayerId(placementTemplate, { lineIds: placementStation ? [placementStation.lineId] : [] }, data?.lines || sourceLines)
    : activeTool === "label"
      ? defaultLabelLayerId({})
      : pendingElement?.kind === "shape"
        ? defaultGraphicLayerId({ shapeType: pendingElement.shapeType })
        : pendingElement?.kind === "number"
          ? defaultLabelLayerId({ numeralType: pendingElement.numeralType })
          : "";
  const automaticPlacementLayerName = layers.find((layer) => layer.id === automaticPlacementLayerId)?.name;

  // 画布条目渲染共用上下文（每次渲染构造一次）
  const renderCtx: RenderItemContext = {
    data,
    modules,
    connections,
    layers,
    selectedIds,
    assets,
    filterState,
    activeFilterLineIds,
    currentData,
    unresolvedChanges,
    orderedRenderItems,
    labels,
    platforms,
    colorSpecs,
    showAuxLabels,
    advancedMode,
    activeTool,
    connectFrom,
    suppressedTransferLabelIds,
    editingPlatformModuleId,
    sourceLines,
    templateMap,
    resolvedTemplateMap,
    isLayerVisible,
    isLayerLocked,
    isModuleVisible,
    getTransferGroupBounds,
    getConnectionEndpoints,
    rebuildConnectionTrackCache,
    handleConnectionMouseDown,
    handleConnectionDoubleClick,
    handleTrackClick,
    handleControlPointMouseDown,
    handleControlPointHandleMouseDown,
    handleControlPointDoubleClick,
    removeCrossingPoint,
    handleBgImageMouseDown,
    updateBgImage,
    handleModuleMouseDown,
    handlePortClick,
    handleLabelMouseDown,
    handleLabelDoubleClick,
    updateLabel,
    handlePlatformMouseDown,
    handlePlatformResizeMouseDown,
    handleGraphicMouseDown,
    handleGraphicResizeMouseDown,
    updateGraphic,
    handleTransferGroupMouseDown,
    handleTransferGroupDoubleClick,
    setSelectedIds,
    setStatus,
    renderItemName,
    moveLabelRelative,
  };


  function renderItemName(entry: CanvasRenderItem): string {
    return pureRenderItemName(entry, renderCtx);
  }


  const overlappingLabelItems = selectedLabel
    ? orderedRenderItems.filter((entry) => {
        if (entry.item.id === selectedLabel.id || !isLayerVisible(entry.item.layerId) || (entry.item as { visible?: boolean }).visible === false) return false;
        const bounds = pureRenderItemBounds(entry, renderCtx);
        return !!bounds && rectsIntersect(computeLabelBbox(selectedLabel), bounds);
      }).slice().reverse()
    : [];

  function moveLabelRelative(label: LabelObject, entry: CanvasRenderItem, above: boolean) {
    return pureMoveLabelRelative(label, entry, above, renderCtx);
  }


  function moveLabelToEdge(label: LabelObject, top: boolean) {
    return pureMoveLabelToEdge(label, top, renderCtx);
  }


  // 右侧属性面板 inspector 共用的组件作用域上下文（每次渲染构造一次）
  const inspectorCtx: InspectorContext = {
    data,
    modules,
    connections,
    layers,
    platforms,
    selectedIds,
    history,
    selectedConnection,
    selectedBgImage,
    selectedMod,
    selectedTemplate,
    selectedPlatform,
    selectedGraphic,
    selectedLabel,
    selectedTransferGroup,
    bgLocked,
    selectableLayers,
    activePage,
    templateMap,
    advancedMode,
    manualCurveEditingId,
    editingPlatformModuleId,
    overlappingLabelItems,
    automaticPlacementLayerName,
    placementRotation,
    placementMirrorX,
    placementMirrorY,
    placementZIndex,
    placementLayerId,
    replaceBackgroundInputRef,
    setConnections,
    setHasUnsavedChanges,
    setStatus,
    setSelectedIds,
    setManualCurveEditingId,
    setModules,
    setPlatforms,
    setLabels,
    setEditingPlatformModuleId,
    setPlacementRotation,
    setPlacementMirrorX,
    setPlacementMirrorY,
    setPlacementZIndex,
    setPlacementLayerId,
    isLayerLocked,
    getConnectionEndpoints,
    updateConnectionAndPairedRail,
    updateConnection,
    setConnectionLineStyle,
    cycleCrossingType,
    removeCrossingPoint,
    addControlPointMidpoint,
    removeControlPoint,
    straightenConnection,
    regenerateAutoControlPoints,
    updateBgImage,
    handleReplaceBackgroundInput,
    deleteBgImage,
    updateModule,
    deleteSelected,
    updatePlatform,
    deletePlatform,
    updateGraphic,
    updateLabel,
    deleteLabel,
    renderItemName,
    moveLabelRelative,
    moveLabelToEdge,
    updateTransferGroup,
    removeModuleFromGroup,
    addSelectedModulesToGroup,
    deleteTransferGroup,
  };

  return (
    <div className="wiring-editor-shell" onContextMenu={handleContextMenu}>
      {/* ══════════ 顶部工具栏 ══════════ */}
      <header className="wiring-toolbar">
        {/* ── Row 1: 核心操作 ── */}
        <div className="wiring-toolbar-row">
          <div className="wiring-toolbar-group">
            <span className="brand-mark"><img src={siteUrl("assets/rail-transit-icon.png")} alt="" /></span>
            <div className="wiring-toolbar-title">
              <h1>配线图编辑器</h1>
              <p>Simplified Metro Track Layout</p>
            </div>
          </div>

          <div className="wiring-toolbar-group">
            <button className="wiring-btn" onClick={() => setNewCanvasOpen(true)}>新建画布</button>
            <select className="wiring-page-select" value={activePageId} onChange={(e) => switchCanvasPage(e.target.value)} title="切换画布">
              {pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
            </select>
            <button className="wiring-btn icon-only" onClick={renameActivePage} title="重命名画布">✎</button>
            <button className="wiring-btn icon-only danger" onClick={deleteActivePage} disabled={pages.length < 2} title="删除画布">×</button>
          </div>

          <div className="wiring-toolbar-group">
            <button className="wiring-btn" onClick={() => void handleSaveProject()} title="保存到当前城市项目 (Ctrl+S)">💾 保存</button>
          </div>

          <div className="wiring-toolbar-group">
            <button className="wiring-btn icon-only" onClick={handleUndo} disabled={!history.canUndo} title={`撤销 (Ctrl+Z)${history.lastOperation ? `：${history.lastOperation}` : ""}`}>↶</button>
            <button className="wiring-btn icon-only" onClick={handleRedo} disabled={!history.canRedo} title={`重做 (Ctrl+Shift+Z)${history.nextOperation ? `：${history.nextOperation}` : ""}`}>↷</button>
            <button className="wiring-btn icon-only wiring-tutorial-btn" onClick={resetTutorial} title="查看使用教程">?</button>
          </div>

          <div className="wiring-toolbar-spacer" />

          <div className="wiring-toolbar-group">
            <PopoverMenu label="导入" icon="📥" items={importMenuItems} />
            <PopoverMenu label="导出" icon="📤" items={exportMenuItems} />
            <PopoverMenu label="筛选" icon="🔽" badge={activeFilterCount > 0 ? activeFilterCount : undefined} items={filterMenuItems} minWidth={220} />
          </div>

          <div className="wiring-toolbar-group">
            <button className="wiring-btn danger" onClick={deleteSelected} disabled={!selectedIds.length}>🗑 删除</button>
          </div>
        </div>

        {/* ── Row 2: 工具 + 选项 + 视图 ── */}
        <div className="wiring-toolbar-row">
          <div className="wiring-toolbar-group">
            <div className="wiring-segmented">
              <button className={activeTool === "auto" ? "active" : ""} onClick={() => { setActiveTool("auto"); setActiveTemplateId(null); setPendingElement(null); setConnectFrom(null); }} title="自动工具：选择、移动模块；选中模块后可直接点击端口连接">自动</button>
              <button className={activeTool === "select" ? "active" : ""} onClick={() => { setActiveTool("select"); setActiveTemplateId(null); setPendingElement(null); }} title="选择工具 (V)">选择</button>
              <button className={activeTool === "pan" ? "active" : ""} onClick={() => { setActiveTool("pan"); setPendingElement(null); }} title="平移工具 (H)">平移</button>
              <button className={activeTool === "label" ? "active" : ""} onClick={() => { setSelectedIds([]); setActiveTool("label"); setActiveTemplateId(null); setPendingElement(null); }} title="文字标签工具：点击画布放置文字标签">文字</button>
              <button className={activeTool === "connect" ? "active" : ""} onClick={() => { setActiveTool("connect"); setActiveTemplateId(null); setPendingElement(null); setConnectFrom(null); }} title="连接工具：点击两个端口创建轨道连接 (C)">连接</button>
            </div>
            <button
              className="wiring-btn"
              onClick={() => createTransferGroupFromSelection()}
              disabled={modules.filter((m) => selectedIds.includes(m.id)).length < 2}
              title={modules.filter((m) => selectedIds.includes(m.id)).length < 2 ? "请至少选择两个站台" : "将选中的站台创建为换乘组"}
            >
              换乘
            </button>
            {!autoAvoidance && (
              <button className="wiring-btn" onClick={() => applyLabelAvoidance(true)} title="自动避让已关闭：手动整理站名和图标位置，避免相互遮挡">🔀 避让一次</button>
            )}
          </div>

          <div className="wiring-toolbar-group">
            <label className="wiring-check"><input type="checkbox" checked={advancedMode} onChange={(e) => { const enabled = e.target.checked; setAdvancedMode(enabled); if (!enabled) { setPlacementRotation(0); setPlacementMirrorX(false); setPlacementMirrorY(false); } }} />高级模式</label>
            <label className="wiring-check" title="控制辅助小字与站台类型文字（岛式/侧式/终点/折返等）的全局显示；不会修改各组件自己的设置"><input type="checkbox" checked={showAuxLabels} onChange={(e) => setShowAuxLabels(e.target.checked)} />辅助标识</label>
          </div>

          <div className="wiring-toolbar-group">
            <label className="wiring-check"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />网格</label>
            <label className="wiring-check"><input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />吸附</label>
            <label className="wiring-check"><input type="checkbox" checked={autoConnect} onChange={(e) => setAutoConnect(e.target.checked)} />自动连接</label>
            <label className="wiring-check" title="站名/图标与站台重叠时自动推开；关闭后可手动点击“避让一次”"><input type="checkbox" checked={autoAvoidance} onChange={(e) => setAutoAvoidance(e.target.checked)} />自动避让</label>
            <label className="wiring-check" title="连接标准上、下行端口时，同时创建另一条正线连接"><input type="checkbox" checked={doubleTrackConnect} onChange={(e) => setDoubleTrackConnect(e.target.checked)} />双线连接</label>
            <label className="wiring-check"><input type="checkbox" checked={continuousPlace} onChange={(e) => setContinuousPlace(e.target.checked)} title="连续放置模式：选择模板后可多次点击放置" />连续放置</label>
          </div>

          <div className="wiring-toolbar-group">
            <button className="wiring-btn" onClick={fitCanvas}>适应画布</button>
            <button className="wiring-btn" onClick={() => setViewport({ panX: 0, panY: 0, scale: 1 })}>原始尺寸</button>
            <button className="wiring-btn" onClick={centerCanvas}>居中</button>
          </div>
        </div>

        {/* ── Row 3: 高级选项 + 隐藏输入 ── */}
        <div className="wiring-toolbar-hidden-inputs" aria-hidden="true">
          <input ref={csvImportRef} type="file" accept=".csv,text/csv" multiple onChange={(event) => { void handleCsvImportSelect(event); }} style={{ display: "none" }} />
          <input ref={bgImageInputRef} type="file" accept="image/*" onChange={handleBgImageInputChange} style={{ display: "none" }} />
          <input ref={iconArchiveInputRef} type="file" accept=".zip,application/zip" onChange={(event) => { void handleIconArchiveInput(event); }} style={{ display: "none" }} />
          <input ref={iconDirectoryInputRef} type="file" accept="image/*" multiple {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => { void handleIconDirectoryInput(event); }} style={{ display: "none" }} />
        </div>
      </header>

      {showCsvImport && csvImportPreview && (
        <div className="wiring-dialog-backdrop" role="presentation" onMouseDown={cancelCsvImport}>
          <section className="wiring-dialog wiring-csv-import-modal" role="dialog" aria-modal="true" aria-labelledby="wiring-csv-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><h2 id="wiring-csv-title">导入 CSV 预览</h2><button className="wiring-btn icon-only" onClick={cancelCsvImport} title="关闭">×</button></header>
            <div className="wiring-csv-body">
              <div className="wiring-csv-files">
                {csvImportPreview.files.map((file) => <span key={file.type}><b>{file.name}</b><small>{file.rowCount} 行</small></span>)}
                {csvImportPreview.missingTypes.map((type) => <span key={type} className="missing"><b>{type}.csv</b><small>保留当前数据</small></span>)}
              </div>
              <div className="wiring-csv-diff">
                <span>线路 <b>+{csvImportPreview.diff.addedLines}</b> / <i>-{csvImportPreview.diff.removedLines}</i> / ~{csvImportPreview.diff.changedLines}</span>
                <span>站点 <b>+{csvImportPreview.diff.addedStations}</b> / <i>-{csvImportPreview.diff.removedStations}</i> / ~{csvImportPreview.diff.changedStations}</span>
                <span>换乘 <b>+{csvImportPreview.diff.addedTransfers}</b> / <i>-{csvImportPreview.diff.removedTransfers}</i> / ~{csvImportPreview.diff.changedTransfers}</span>
              </div>
              {csvImportPreview.issues.length ? <div className="wiring-csv-issues">{csvImportPreview.issues.map((issue, index) => <p key={index} className={issue.severity === "错误" ? "error" : "warning"}><b>{issue.severity}</b>{issue.fileName && <code>{issue.fileName}{issue.rowNumber ? `:${issue.rowNumber}` : ""}{issue.field ? ` · ${issue.field}` : ""}</code>}{issue.category}：{issue.message}</p>)}</div> : <p className="wiring-csv-ok">校验通过，未发现问题</p>}
              <details className="wiring-csv-preview-data"><summary>导入预览（{csvImportPreview.lines.length} 线路 / {csvImportPreview.stations.length} 站点 / {csvImportPreview.transfers.length} 换乘）</summary><div>{csvImportPreview.stations.slice(0, 12).map((station) => <span key={station.id}>{station.lineId} · {station.sequence} · {station.nameZh}</span>)}</div></details>
            </div>
            <footer><button className="wiring-btn" onClick={cancelCsvImport}>取消</button><button className="wiring-btn primary" onClick={confirmCsvImport} disabled={hasBlockingIssues(csvImportPreview.issues)}>{hasBlockingIssues(csvImportPreview.issues) ? "存在错误，无法导入" : "确认导入"}</button></footer>
          </section>
        </div>
      )}

      {newCanvasOpen && (
        <div className="wiring-dialog-backdrop" role="presentation" onMouseDown={() => setNewCanvasOpen(false)}>
          <section className="wiring-dialog" role="dialog" aria-modal="true" aria-labelledby="new-canvas-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><h2 id="new-canvas-title">新建画布</h2><button className="wiring-btn icon-only" onClick={() => setNewCanvasOpen(false)} title="关闭">×</button></header>
            <div className="wiring-dialog-grid">
              <label>预设<select defaultValue="hd" onChange={(event) => applyCanvasPreset(event.target.value)}><option value="custom">自定义</option>{CANVAS_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
              <label>画布名称<input value={newCanvasDraft.name} onChange={(event) => setNewCanvasDraft((prev) => ({ ...prev, name: event.target.value }))} /></label>
              <label>宽度<input type="number" min={320} value={newCanvasDraft.width} onChange={(event) => setNewCanvasDraft((prev) => ({ ...prev, width: Number(event.target.value) }))} /></label>
              <label>高度<input type="number" min={320} value={newCanvasDraft.height} onChange={(event) => setNewCanvasDraft((prev) => ({ ...prev, height: Number(event.target.value) }))} /></label>
              <label>背景色<input type="color" value={newCanvasDraft.backgroundColor} onChange={(event) => setNewCanvasDraft((prev) => ({ ...prev, backgroundColor: event.target.value }))} /></label>
              <label>方向<select value={newCanvasDraft.orientation} onChange={(event) => setNewCanvasDraft((prev) => {
                const orientation = event.target.value as "landscape" | "portrait";
                const shouldSwap = (orientation === "landscape" && prev.width < prev.height) || (orientation === "portrait" && prev.width > prev.height);
                return { ...prev, orientation, ...(shouldSwap ? { width: prev.height, height: prev.width } : {}) };
              })}><option value="landscape">横向</option><option value="portrait">纵向</option></select></label>
              <label>网格间距<input type="number" min={5} value={newCanvasDraft.gridSize} onChange={(event) => setNewCanvasDraft((prev) => ({ ...prev, gridSize: Number(event.target.value) }))} /></label>
              <label className="wiring-check"><input type="checkbox" checked={newCanvasDraft.showGrid} onChange={(event) => setNewCanvasDraft((prev) => ({ ...prev, showGrid: event.target.checked }))} />显示网格</label>
            </div>
            <footer><button className="wiring-btn" onClick={() => setNewCanvasOpen(false)}>取消</button><button className="wiring-btn primary" onClick={createNewCanvas}>创建画布</button></footer>
          </section>
        </div>
      )}

      {/* ══════════ 三栏主体 ══════════ */}
      <div className="wiring-body">
        {/* ── 左侧面板 ── */}
        <aside className="wiring-left-panel">
          <div className="wiring-left-content">
            {/* ── 区段 1: 元件库（默认展开）── */}
            <div className={`wiring-accordion-section ${expandedSections.library ? "open" : ""}`}>
              <button className="wiring-accordion-header" onClick={() => toggleSection("library")}>
                <span className="wiring-accordion-arrow">▸</span>
                <span className="wiring-accordion-title">元件库</span>
                <small className="wiring-accordion-meta">{Object.keys(templateGroups).length + 2} 类 · {MODULE_TEMPLATES.length + 11} 元件</small>
              </button>
              {expandedSections.library && (
                <div className="wiring-accordion-body">
                  <div className={`wiring-template-category wiring-text-tool-category ${collapsedCats.base ? "collapsed" : ""}`}>
                    <button className="wiring-library-cat-header" onClick={() => toggleCat("base")} title={collapsedCats.base ? "展开基础元素" : "收起基础元素"}>
                      <span className="wiring-accordion-arrow">▸</span>
                      <h4>基础元素</h4>
                    </button>
                    <div className="wiring-template-grid">
                      <div
                        className={`wiring-template-card wiring-text-tool-card ${activeTool === "label" ? "active" : ""}`}
                        onClick={() => {
                          setSelectedIds([]);
                          setActiveTemplateId(null);
                          setPendingElement(null);
                          setActiveTool("label");
                          setStatus("文字工具：点击画布放置独立文字");
                        }}
                      >
                        <div className="wiring-template-preview wiring-text-tool-preview"><span>Aa</span></div>
                        <div className="wiring-template-info">
                          <b>文字工具</b>
                          <small>独立文字、线路标注和说明，不参与自动避障</small>
                        </div>
                      </div>
                      {SHAPE_CARDS.map((card) => (
                        <div
                          key={card.shapeType}
                          data-shape={card.shapeType}
                          className={`wiring-template-card ${activeTool === "shape" && pendingElement?.kind === "shape" && pendingElement.shapeType === card.shapeType ? "active" : ""}`}
                          onClick={() => selectShape(card.shapeType)}
                        >
                          <div className="wiring-template-preview"><ShapePreview shapeType={card.shapeType} /></div>
                          <div className="wiring-template-info">
                            <b>{SHAPE_META[card.shapeType].label}</b>
                            <small>{card.description}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={`wiring-template-category ${collapsedCats.signals ? "collapsed" : ""}`}>
                    <button className="wiring-library-cat-header" onClick={() => toggleCat("signals")} title={collapsedCats.signals ? "展开工程图标" : "收起工程图标"}>
                      <span className="wiring-accordion-arrow">▸</span>
                      <h4>工程图标</h4>
                    </button>
                    <div className="wiring-template-grid">
                      {SIGNAL_CARDS.map((card) => (
                        <div
                          key={card.shapeType}
                          data-signal={card.shapeType}
                          className={`wiring-template-card ${activeTool === "shape" && pendingElement?.kind === "shape" && pendingElement.shapeType === card.shapeType ? "active" : ""}`}
                          onClick={() => selectShape(card.shapeType)}
                        >
                          <div className="wiring-template-preview"><ShapePreview shapeType={card.shapeType} /></div>
                          <div className="wiring-template-info">
                            <b>{SHAPE_META[card.shapeType].label}</b>
                            <small>{card.description}</small>
                          </div>
                        </div>
                      ))}
                      {NUMBER_CARDS.map((card) => (
                        <div
                          key={card.numeralType}
                          data-number={card.numeralType}
                          className={`wiring-template-card ${activeTool === "shape" && pendingElement?.kind === "number" && pendingElement.numeralType === card.numeralType ? "active" : ""}`}
                          onClick={() => selectNumber(card.numeralType)}
                        >
                          <div className="wiring-template-preview"><svg width={54} height={38}><text x={27} y={26} textAnchor="middle" fontSize={18} fontWeight={700} fill="#202124">{card.numeralType === "track" ? "1道" : "1#"}</text></svg></div>
                          <div className="wiring-template-info">
                            <b>{card.numeralType === "track" ? "股道编号" : "道岔编号"}</b>
                            <small>{card.description}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {(Object.entries(templateGroups) as [TemplateCategory, ModuleTemplate[]][]).map(([cat, tpls]) => (
                    <div key={cat} className={`wiring-template-category ${collapsedCats[cat] ? "collapsed" : ""}`}>
                      <button className="wiring-library-cat-header" onClick={() => toggleCat(cat)} title={collapsedCats[cat] ? `展开${tpls[0]?.categoryName}` : `收起${tpls[0]?.categoryName}`}>
                        <span className="wiring-accordion-arrow">▸</span>
                        <h4>{tpls[0]?.categoryName}</h4>
                      </button>
                      <div className="wiring-template-grid">
                        {tpls.map((tpl) => (
                          <div
                            key={tpl.id}
                            className={`wiring-template-card ${activeTemplateId === tpl.id ? "active" : ""}`}
                            onClick={() => selectTemplate(tpl.id)}
                          >
                            <div className="wiring-template-preview"><TemplatePreviewSvg template={tpl} /></div>
                            <div className="wiring-template-info">
                              <b>{tpl.name}</b>
                              <small>{tpl.description}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── 区段 2: 线路站点（默认展开）── */}
            <div className={`wiring-accordion-section ${expandedSections.stations ? "open" : ""}`}>
              <button className="wiring-accordion-header" onClick={() => toggleSection("stations")}>
                <span className="wiring-accordion-arrow">▸</span>
                <span className="wiring-accordion-title">线路站点</span>
                {data && <small className="wiring-accordion-meta">{data.lines.length} 线 · {data.stations.length} 站</small>}
              </button>
              {expandedSections.stations && (
                <div className="wiring-accordion-body">
                  <input className="wiring-data-search" placeholder="搜索站点…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  <label className="wiring-check" style={{ marginBottom: 10 }}><input type="checkbox" checked={showPlacedOnly} onChange={(e) => setShowPlacedOnly(e.target.checked)} />只看已放置</label>
                  <label className="wiring-check" style={{ marginBottom: 10 }}><input type="checkbox" checked={filterState.placement === "unplaced"} onChange={(e) => updateFilters({ placement: e.target.checked ? "unplaced" : "all" })} />只看未放置</label>
                  {pendingSourcePlacements.length > 0 && <div className="wiring-pending-tray"><b>待放置站点（{pendingSourcePlacements.length}）</b>{pendingSourcePlacements.map((change) => { const context = adjacentStationContext(change.entityId); return <span key={change.id}><span>{context?.station.nameZh || change.entityId} · {context?.line?.nameZh || context?.station.lineId || "未知线路"}<small>{context?.previous?.nameZh || "起点"} → {context?.next?.nameZh || "终点"}</small></span><button className="wiring-btn" onClick={() => beginStationPlacement(change.entityId)}>手动放置</button><button className="wiring-btn" disabled={!context?.previousModule || !context.nextModule} onClick={() => insertStationBetweenNeighbors(change.entityId)}>插入相邻模块之间</button></span>; })}</div>}
                  {advancedMode && physicalStationSuggestions.length > 0 && <div className="wiring-change-panel"><header><b>物理站映射建议</b></header>{physicalStationSuggestions.map((suggestion) => <div className={`wiring-change-row ${suggestion.ambiguous ? "warning" : "info"}`} key={suggestion.id}><span>{suggestion.displayName} · {suggestion.sourceStationIds.join(" / ")}{suggestion.ambiguous ? "（存在歧义）" : ""}</span><button onClick={() => confirmPhysicalMapping(suggestion)}>确认合并</button></div>)}</div>}
                  {unresolvedChanges.length > 0 && <div className="wiring-change-panel"><header><b>数据变更</b><select value={changeSeverity} onChange={(e) => setChangeSeverity(e.target.value as typeof changeSeverity)}><option value="all">全部</option><option value="error">错误</option><option value="warning">警告</option><option value="info">信息</option></select><button onClick={acceptInformationalChanges}>接受全部信息项</button></header>{unresolvedChanges.filter((change) => change.status === "unresolved" && (changeSeverity === "all" || change.severity === changeSeverity)).map((change) => <div className={`wiring-change-row ${change.severity}`} key={change.id}><span>{change.entityType} {change.entityId}: {change.changeType}</span>{change.notes && <p className="wiring-change-notes">{change.notes}</p>}<details><summary>新旧值</summary><code>{JSON.stringify(change.oldValue)} → {JSON.stringify(change.newValue)}</code></details><button onClick={() => locateSourceChange(change)}>定位/手动</button><button onClick={() => resolveSourceChange(change, "accepted")}>接受</button><button onClick={() => resolveSourceChange(change, "ignored")}>忽略</button></div>)}</div>}
                  {Array.from(filteredStations.entries()).map(([lineId, stations]) => {
                    const line = data.lines.find((l) => l.id === lineId);
                    if (!line) return null;
                    return (
                      <div key={lineId} className="wiring-line-group">
                        <header>
                          <i style={{ background: line.lineColor }} />
                          <b>{line.nameZh}</b>
                          <small>{stations.length} 站</small>
                        </header>
                        {stations.map((st) => {
                          const placed = placedStationIds.has(st.id);
                          return (
                            <div
                              key={st.id}
                              className={`wiring-station-row ${placed ? "placed" : ""}`}
                              draggable={!placed}
                              onDragStart={(event) => { event.dataTransfer.setData("application/x-transit-station", st.id); event.dataTransfer.effectAllowed = "copy"; }}
                              onDoubleClick={() => !placed && beginStationPlacement(st.id)}
                              onClick={() => {
                                if (placed) {
                                  const mod = modules.find((module) => isOnActivePage(module.pageId) && module.sourceStationIds.includes(st.id));
                                  if (mod) { setSelectedIds([mod.id]); setStatus(`已定位「${st.nameZh}」`); }
                                } else {
                                  beginStationPlacement(st.id);
                                  setStatus(`选择模板放置「${st.nameZh}」`);
                                }
                              }}
                            >
                              <span className="seq">{st.sequence}</span>
                              {st.icon ? <ProjectStationIcon repository={projectRepository} projectId={projectId} name={st.icon} embeddedSrc={findAssetByFilename(assets, st.icon)?.dataUrl} /> : <span className="station-icon-missing" title="未配置图标">!</span>}
                              <span className="name">{st.nameZh}</span>
                              {!st.isOpen && <span className="badge closed">未开通</span>}
                              {(st.terminalType === "terminal" || st.terminalType === "through-start" || st.terminalType === "through-end") && <span className="badge terminal">终点</span>}
                              {placed && <span className="badge" style={{ color: "var(--accent-strong)", background: "var(--accent-soft)" }}>已放置</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── 区段 4: 图标资源（无资源时隐藏）── */}
            {assets.length > 0 && (
              <div className={`wiring-accordion-section ${expandedSections.assets ? "open" : ""}`}>
                <button className="wiring-accordion-header" onClick={() => toggleSection("assets")}>
                  <span className="wiring-accordion-arrow">▸</span>
                  <span className="wiring-accordion-title">图标资源</span>
                  <small className="wiring-accordion-meta">{assets.length} 项</small>
                </button>
                {expandedSections.assets && (
                  <div className="wiring-accordion-body">
                    <div className="wiring-asset-grid">{assets.map((asset) => <div key={asset.id} className="wiring-asset-item"><button className="wiring-asset-place" onClick={() => placeGraphic(asset)} title={`放置 ${asset.name}`}>{asset.dataUrl ? <img src={asset.dataUrl} alt="" /> : <span>!</span>}<small>{asset.name}</small></button><button className="wiring-asset-remove" onClick={() => deleteAsset(asset)} title={`删除 ${asset.name}`}>×</button></div>)}</div>
                  </div>
                )}
              </div>
            )}

            {/* ── 区段 5: 图层（默认折叠）── */}
            <div className={`wiring-accordion-section ${expandedSections.layers ? "open" : ""}`}>
              <button className="wiring-accordion-header" onClick={() => toggleSection("layers")}>
                <span className="wiring-accordion-arrow">▸</span>
                <span className="wiring-accordion-title">图层</span>
                <small className="wiring-accordion-meta">{layers.length} 层</small>
              </button>
              {expandedSections.layers && (
                <div className="wiring-accordion-body">
                  <div className="wiring-layer-tree">
                    <button className="wiring-btn wiring-layer-add-btn" onClick={() => createSubLayer(null)}>＋ 新建图层</button>
                    {getRootLayers(layers).map((layer) => renderLayerNode(layer, 0))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ── 中央画布 ── */}
        <div className="wiring-canvas-area">
          <svg
            ref={svgRef}
            className={`wiring-svg wiring-canvas-svg tool-${activeTool}`}
            onMouseDown={handleSvgMouseDown}
            onWheel={handleWheel}
            onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-transit-station")) event.preventDefault(); }}
            onDrop={(event) => { const stationId = event.dataTransfer.getData("application/x-transit-station"); if (!stationId) return; event.preventDefault(); const point = toWorld(event.clientX, event.clientY); placeModule(point.x, point.y, "island_platform", stationId); }}
          >
            {/* 渐变定义：线路颜色渐变（双线站台/异色区间） */}
            {colorSpecs.gradientDefs.length > 0 && (
              <defs>
                {colorSpecs.gradientDefs.map((def) => (
                  <linearGradient
                    key={def.id}
                    id={def.id}
                    x1={def.x1}
                    y1={def.y1}
                    x2={def.x2}
                    y2={def.y2}
                    gradientUnits="userSpaceOnUse"
                  >
                    {def.stops.map((stop, stopIndex) => (
                      <stop key={stopIndex} offset={stop.offset} stopColor={stop.color} />
                    ))}
                  </linearGradient>
                ))}
              </defs>
            )}
            {/* 背景 */}
            <rect className="canvas-bg" x={0} y={0} width="100%" height="100%" fill="#e9eef1" />

            {/* 视口变换组 */}
            <g transform={transform}>
              {/* 画布纸张 */}
              <rect className="canvas-paper" x={0} y={0} width={pageWidth} height={pageHeight} fill={activePage?.backgroundColor || "#FFFFFF"} stroke="#dce4e8" strokeWidth={1} />

              {/* 网格 */}
              {showGrid && (
                <g className="grid-group">
                  {gridLines.v.map((x, i) => (
                    <line key={`v${i}`} x1={x} y1={0} x2={x} y2={pageHeight} className={`grid-line ${x % (pageGridSize * 5) === 0 ? "major" : ""}`} />
                  ))}
                  {gridLines.h.map((y, i) => (
                    <line key={`h${i}`} x1={0} y1={y} x2={pageWidth} y2={y} className={`grid-line ${y % (pageGridSize * 5) === 0 ? "major" : ""}`} />
                  ))}
                </g>
              )}

              {/* 统一对象序列：图层树 -> zIndex -> 创建顺序，跨类别也保持同一规则。 */}
              {orderedRenderItems.map((entry) => pureRenderCanvasItem(entry, renderCtx))}

              {(activeTool === "connect" || activeTool === "auto") && connectFrom && (() => {
                const source = getConnectionEndpoint(connectFrom.moduleId, connectFrom.portId, modules, resolvedTemplateMap);
                if (!source) return null;
                const start = worldPortPosition(source.module, source.template, source.portId);
                const edx = mouseWorld.x - start.x;
                const edy = mouseWorld.y - start.y;
                const edist = Math.hypot(edx, edy);
                const destination = previewDestinationFor(source);
                if (destination) {
                  return connectionPreviewPaths(source, destination).map((path, index) => (
                    <path key={`connection-preview-${index}`} className="connection-preview" d={path} fill="none" pointerEvents="none" />
                  ));
                }
                // 预览曲线：与 makeConnection 的双控制点逻辑一致
                if (Math.abs(edx) > 12 && Math.abs(edy) > 12 && edist > 20) {
                  const fromDir = start.direction;
                  const fromRad = (fromDir * Math.PI) / 180;
                  const extDist = Math.min(edist * 0.35, 150);
                  const cp1x = start.x + Math.cos(fromRad) * extDist;
                  const cp1y = start.y + Math.sin(fromRad) * extDist;
                  // 假定终点端口朝向与起点相反（180°差），计算进入方向
                  const toRad = ((fromDir + 180) % 360) * Math.PI / 180;
                  const cp2x = mouseWorld.x - Math.cos(toRad) * extDist;
                  const cp2y = mouseWorld.y - Math.sin(toRad) * extDist;
                  // CP1 曲率手柄指向 CP2
                  const d1x = cp2x - cp1x, d1y = cp2y - cp1y;
                  const d1Len = Math.hypot(d1x, d1y) || 1;
                  const h1 = Math.min(d1Len * 0.4, 80);
                  // CP2 曲率手柄指向终点
                  const d2x = mouseWorld.x - cp2x, d2y = mouseWorld.y - cp2y;
                  const d2Len = Math.hypot(d2x, d2y) || 1;
                  const h2 = Math.min(d2Len * 0.4, 60);
                  return (
                    <path
                      className="connection-preview"
                      d={`M${start.x.toFixed(1)},${start.y.toFixed(1)} Q${(cp1x + d1x / d1Len * h1).toFixed(1)},${(cp1y + d1y / d1Len * h1).toFixed(1)} ${cp1x.toFixed(1)},${cp1y.toFixed(1)} Q${(cp2x + d2x / d2Len * h2).toFixed(1)},${(cp2y + d2y / d2Len * h2).toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} L${mouseWorld.x.toFixed(1)},${mouseWorld.y.toFixed(1)}`}
                      fill="none" pointerEvents="none"
                    />
                  );
                }
                return <line className="connection-preview" x1={start.x} y1={start.y} x2={mouseWorld.x} y2={mouseWorld.y} pointerEvents="none" />;
              })()}

              {/* 放置预览（ghost） */}
              {activeTool === "place" && activeTemplateId && (() => {
                const tpl = templateMap.get(activeTemplateId);
                if (!tpl) return null;
                return (
                  <g transform={`translate(${mouseWorld.x},${mouseWorld.y}) rotate(${placementRotation} ${tpl.width / 2} ${tpl.height / 2})${moduleMirrorTransform(tpl.width, tpl.height, placementMirrorX, placementMirrorY)}`} className="module-ghost" pointerEvents="none">
                    {tpl.tracks.map((track, index) => track.curved
                      ? <path key={index} className={`track ${track.type}`} d={templateTrackPathD(track)} />
                      : <line key={index} className={`track ${track.type}`} x1={track.x1} y1={track.y1} x2={track.x2} y2={track.y2} />
                    )}
                    {tpl.platforms.map((p, i) => (
                      <rect key={i} className="platform" x={p.x} y={p.y} width={p.width} height={p.height} rx={2} />
                    ))}
                  </g>
                );
              })()}

              {/* 形状/编号放置预览（ghost） */}
              {activeTool === "shape" && pendingElement && (() => {
                if (pendingElement.kind === "shape") {
                  const meta = SHAPE_META[pendingElement.shapeType];
                  return (
                    <g transform={`translate(${mouseWorld.x},${mouseWorld.y})${moduleMirrorTransform(meta.width, meta.height, placementMirrorX, placementMirrorY)}`} className="module-ghost" pointerEvents="none">
                      <g opacity={0.65}>
                        <ShapeGraphic shapeType={pendingElement.shapeType} width={meta.width} height={meta.height} fill={meta.defaultFill} stroke={meta.defaultStroke} />
                      </g>
                    </g>
                  );
                }
                return (
                  <g transform={`translate(${mouseWorld.x},${mouseWorld.y})`} className="module-ghost" pointerEvents="none">
                    <text fontSize={16} fontWeight={700} fill="#202124" opacity={0.65}>{pendingElement.numeralType === "track" ? "1道" : "1#"}</text>
                  </g>
                );
              })()}

              {/* 框选矩形 */}
              {selectionBox && (() => {
                const w1 = toWorld(selectionBox.x1, selectionBox.y1);
                const w2 = toWorld(selectionBox.x2, selectionBox.y2);
                return (
                  <rect
                    x={Math.min(w1.x, w2.x)}
                    y={Math.min(w1.y, w2.y)}
                    width={Math.abs(w2.x - w1.x)}
                    height={Math.abs(w2.y - w1.y)}
                    fill="rgba(8,127,164,0.1)"
                    stroke="var(--accent)"
                    strokeWidth={1.5 / viewport.scale}
                    strokeDasharray={`${4 / viewport.scale} ${3 / viewport.scale}`}
                    pointerEvents="none"
                  />
                );
              })()}
            </g>
          </svg>

          {/* 画布工具栏 */}
          <div className="wiring-canvas-toolbar">
            <button onClick={() => zoomBy(1.2)} title="放大">+</button>
            <span className="zoom-display">{Math.round(viewport.scale * 100)}%</span>
            <button onClick={() => zoomBy(0.83)} title="缩小">−</button>
            <button onClick={resetViewport} title="重置视图">⊙</button>
          </div>

          {/* 提示 */}
          {activeTool === "place" && activeTemplateId && (
            <div className="wiring-canvas-hint">
              点击画布放置「{templateMap.get(activeTemplateId)?.name}」· Esc 取消
            </div>
          )}
          {activeTool === "label" && (
            <div className="wiring-canvas-hint">
              点击画布放置文字标签 · 双击编辑文字 · Esc 取消
            </div>
          )}
          {activeTool === "shape" && pendingElement && (
            <div className="wiring-canvas-hint">
              {pendingElement.kind === "number"
                ? `点击画布放置${pendingElement.numeralType === "track" ? "股道编号" : "道岔编号"} · Esc 取消`
                : `点击画布放置「${SHAPE_META[pendingElement.shapeType].label}」 · Esc 取消`}
            </div>
          )}
          {(activeTool === "connect" || activeTool === "auto") && (
            <div className="wiring-canvas-hint">
              {connectFrom ? "选择兼容端口完成连接 · 单击空白处、右键或 Esc 取消" : "选择起点端口；标准上、下行端口可一次建立双线区间"}
            </div>
          )}
        </div>

        {/* ── 右侧属性面板 ── */}
        <aside className="wiring-right-panel">
          <div className="wiring-right-header">
            <h3>{selectedMod ? selectedMod.name : selectedPlatform ? "站台" : selectedGraphic ? (selectedGraphic.shapeType ? (SHAPE_META[selectedGraphic.shapeType]?.label || "图形") : "图标") : selectedLabel ? (selectedLabel.numeralType === "track" ? `股道编号` : selectedLabel.numeralType === "switch" ? `道岔编号` : `文字标签`) : selectedConnection ? `轨道连接` : selectedBgImage ? `背景图：${selectedBgImage.name}` : selectedTransferGroup ? `换乘组合` : placementTargetName ? "放置属性" : "属性面板"}</h3>
            <p>{selectedMod ? `${selectedTemplate?.name || ""} · ${selectedMod.id.slice(-6)}` : selectedPlatform ? `${selectedPlatform.platformType} · ${selectedPlatform.id.slice(-6)}` : selectedGraphic ? (selectedGraphic.shapeType ? `${SHAPE_META[selectedGraphic.shapeType]?.label || "图形"} · ${selectedGraphic.id.slice(-6)}` : `${assets.find((asset) => asset.id === selectedGraphic.assetId)?.name || "资源缺失"} · ${selectedGraphic.id.slice(-6)}`) : selectedLabel ? `${selectedLabel.text.slice(0, 12)}${selectedLabel.text.length > 12 ? "…" : ""} · ${selectedLabel.id.slice(-6)}` : selectedConnection ? `${selectedConnection.crossingType === "plain" ? "平面交叉" : selectedConnection.crossingType === "gap" ? "断开" : "桥梁跨越"} · ${selectedConnection.id.slice(-6)}` : selectedBgImage ? `${selectedBgImage.naturalWidth}×${selectedBgImage.naturalHeight}` : selectedTransferGroup ? `${selectedTransferGroup.moduleIds.length} 个模块` : placementTargetName ? `下一次放置：${placementTargetName}` : "设置下一次放置的默认属性"}</p>
          </div>
          <div className="wiring-right-content">
            {selectedConnection && !selectedMod && !selectedLabel ? <ConnectionInspector ctx={inspectorCtx} />
              : selectedBgImage && !selectedMod ? <BackgroundInspector ctx={inspectorCtx} />
              : selectedMod && selectedTemplate ? <ModuleInspector ctx={inspectorCtx} />
              : selectedPlatform ? <PlatformInspector ctx={inspectorCtx} />
              : selectedGraphic ? <GraphicInspector ctx={inspectorCtx} />
              : selectedLabel ? <LabelInspector ctx={inspectorCtx} />
              : selectedTransferGroup ? <TransferGroupInspector ctx={inspectorCtx} />
              : (
                <>
                  <PlacementInspector ctx={inspectorCtx} />
                  <div className="wiring-prop-empty">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <rect x="6" y="6" width="36" height="36" rx="8" stroke="currentColor" strokeWidth="2" />
                      <path d="M16 24h16M24 16v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <b>{placementTargetName ? `正在放置：${placementTargetName}` : "选择画布中的元件"}</b>
                    <span>{placementTargetName ? "点击画布完成放置" : "查看和编辑属性"}</span>
                  </div>
                </>
              )}
          </div>
        </aside>
      </div>

      {/* ── 右键菜单 ── */}
      {contextMenu && (
        <div
          className="context-menu-overlay"
          style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 10001 }}
        >
          <div className="context-menu-panel">
            <button
              className="context-menu-item"
              onClick={() => {
                createTransferGroupFromSelection();
                setContextMenu(null);
              }}
            >
              创建换乘组
            </button>
          </div>
        </div>
      )}

      {/* ══════════ 底部状态栏 ══════════ */}
      <footer className="wiring-status-bar">
        <span>工具: <b>{activeTool === "auto" ? "自动" : activeTool === "select" ? "选择" : activeTool === "pan" ? "平移" : activeTool === "label" ? "文字" : activeTool === "connect" ? "连接" : activeTool === "shape" ? (pendingElement?.kind === "number" ? "编号" : "图形") : "放置"}</b></span>
        <span>模块: <b>{modules.filter((module) => isOnActivePage(module.pageId)).length}</b></span>
        <span>连接: <b>{connections.filter((connection) => isOnActivePage(connection.pageId)).length}</b></span>
        {connections.some((c) => c.crossingType !== "plain") && <span>交叉: <b>{connections.filter((c) => c.crossingType !== "plain").length}</b></span>}
        {labels.length > 0 && <span>标签: <b>{labels.length}</b></span>}
        {backgroundImages.length > 0 && <span>背景图: <b>{backgroundImages.length}</b></span>}
        {transferGroups.length > 0 && <span>换乘组: <b>{transferGroups.length}</b></span>}
        <span>选中: <b>{selectedIds.length}</b></span>
        <span>缩放: <b>{Math.round(viewport.scale * 100)}%</b></span>
        <span>坐标: <b>{mouseWorld.x}, {mouseWorld.y}</b></span>
        <span>自动保存: <b>{saveStatus === "saving" ? "保存中" : saveStatus === "saved" ? "已保存" : saveStatus === "error" ? "失败" : "待命"}</b></span>
        <span className="spacer" />
        <span><i /> {status}</span>
      </footer>

      {/* 首次警告优先于教程；确认后才显示原有首次帮助。 */}
      {showFirstUseNotice ? (
        <FirstUseNotice onConfirm={dismissFirstUseNotice} />
      ) : showTutorial ? (
        <TutorialOverlay onDismiss={dismissTutorial} />
      ) : null}
    </div>
  );
}
