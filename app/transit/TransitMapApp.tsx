"use client";

import {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  renderDirectionTile,
  renderLineBadge,
  renderPulseDirectionTile,
  renderRouteCanvas,
  renderScenicDirectionTile,
  renderStationTile,
  renderTextCard,
} from "./render";
import { renderLoopDirectionTile, renderLoopLineBadgeTile } from "./styles/loop/loop-render";
import { clearScenicIconUrls, preloadScenicIcons, setScenicIconUrl } from "./styles/scenic/scenic-render";
import {
  cleanFilePart,
  Direction,
  LayoutConfig,
  normalizeTransitData,
  RevisionInfo,
  StyleTemplateId,
  Station,
  StationState,
  TransitData,
  TransitLine,
  stationsForLine,
} from "./types";
import { canvasImageBytes, canvasPixelHash, canvasPngBytes, CanvasImageFormat, createStoredZip, ZipEntry } from "./zip";
import { auditTransitData, calculateOpeningStats, StationAuditIssue } from "./audit";
import { deleteLineCascade, deleteStationCascade, type DeleteLineImpact, type DeleteStationImpact } from "./stationDeletion";
import { wiringAssociationsForStationIds } from "../wiring/stationUnlink";
import { BrowserEditorDocumentStore } from "../projects/editorDocumentStore";
import type { EditorNavigationGuard } from "../projects/editorNavigation";
import { nextIndexForDirection, previousIndexForDirection, stepForDirection, terminusForDirection, terminusSideFor, visualDirectionFor } from "./route-orientation.mjs";
import {
  buildImportPreview,
  CsvImportPreview,
  detectCsvType,
  hasBlockingIssues,
  parseCsv,
  parseCsvFile,
  ParsedCsvFile,
} from "./csv-io";
import RoutePreviewSvg from "./RoutePreviewSvg";
import ScenicRoutePreviewSvg from "./styles/scenic/ScenicRoutePreviewSvg";
import SliceGuideOverlay from "./SliceGuideOverlay";
import {
  createProjectRepository,
  DEFAULT_PROJECT_ID,
  type ProjectRepository,
} from "../projects/repositories";
import "./transit.css";
import { ColorField } from "./settingsControls";
import { SettingsPanel } from "./SettingsPanel";
import { downloadBlob } from "../lib/browser";
import { siteUrl } from "../site";

const MAX_HISTORY = 60;

const ICON_CATEGORIES: { name: string; icons: string[] }[] = [
  {
    name: "交通运输与枢纽",
    icons: ["大桥", "港口-货运", "港口-客运", "换乘枢纽", "火车站-城市", "火车站-高铁", "火车站-小站", "机场", "机场2", "客运中心", "缆车", "缆车2", "轮渡站", "停车场", "自行车停车场", "自行车停车场乡村"],
  },
  {
    name: "政务司法与公共安全",
    icons: ["法院", "警察局", "市政中心", "政务大楼", "消防局"],
  },
  {
    name: "教育与科研场所",
    icons: ["大学", "学校", "学校2", "科技馆", "科技馆2"],
  },
  {
    name: "文化传媒与会展",
    icons: ["博物馆", "大剧院", "大剧院2", "广播中心", "会展中心", "图书馆", "文化中心", "影视基地", "影像馆"],
  },
  {
    name: "商业金融与住宿",
    icons: ["酒店", "商店", "商店2", "商业广场", "书店", "银行"],
  },
  {
    name: "社区居住与民生服务",
    icons: ["社区中心", "医院", "邮局", "住宅", "别墅", "墓园"],
  },
  {
    name: "产业园区与物流生产",
    icons: ["工厂", "科技园", "物流中心"],
  },
  {
    name: "体育娱乐与旅游休闲",
    icons: ["动物园", "动物园2", "篮球馆", "体育馆", "水上乐园", "水族馆", "温泉", "游乐园", "游乐园-圆", "营地"],
  },
  {
    name: "自然生态与户外景观",
    icons: ["岛屿", "洞穴", "公园", "河流-城市", "湖泊", "森林", "沙滩", "山", "水塘", "植物园", "植物园2"],
  },
  {
    name: "历史聚落与乡村景观",
    icons: ["古镇", "水乡", "梯田", "庄园"],
  },
  {
    name: "城市地标与观景建筑",
    icons: ["广州塔", "天塔", "东方明珠", "太空电梯", "虚数之构"],
  },
];

function RepositoryAssetImage({
  repository,
  projectId,
  name,
  alt,
}: {
  repository: ProjectRepository;
  projectId: string;
  name: string;
  alt: string;
}) {
  const [src, setSrc] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "missing">("loading");
  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    setSrc("");
    setLoadState("loading");
    repository.getAsset(projectId, name).then((asset) => {
      if (disposed) return;
      if (!asset) {
        setLoadState("missing");
        return;
      }
      objectUrl = URL.createObjectURL(asset.blob);
      setSrc(objectUrl);
      setLoadState("loaded");
    }).catch(() => {
      if (!disposed) setLoadState("missing");
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [name, projectId, repository]);
  if (loadState === "loading") return <span className="asset-loading-placeholder" aria-hidden="true" />;
  return loadState === "loaded" && src
    ? <img src={src} alt={alt} />
    : <span className="missing-asset-placeholder" role="img" aria-label={`缺少素材 ${name}`} title={`缺少素材：${name}`}>?</span>;
}

function cloneData(data: TransitData): TransitData {
  return structuredClone(data);
}

function csvSnapshot(data: TransitData) {
  return JSON.stringify({ lines: data.lines, stations: data.stations, transfers: data.transfers });
}

function layoutSnapshot(data: Pick<TransitData, "activeStyleTemplate" | "layoutTemplates" | "layout" | "lineStyleTemplates">) {
  return JSON.stringify({
    layoutTemplates: { ...data.layoutTemplates, [data.activeStyleTemplate]: data.layout },
    lineStyleTemplates: data.lineStyleTemplates || {},
  });
}

function IconButton({
  title,
  children,
  onClick,
  disabled,
}: {
  title: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="icon-button" title={title} aria-label={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

interface TransitMapAppProps {
  projectId?: string;
  repository?: ProjectRepository;
  onNavigationStateChange?: (guard: EditorNavigationGuard | null) => void;
}

/** 站点删除确认弹窗的数据（删除前的统计 + 影响）。 */
interface StationDeleteDialogState {
  impact: DeleteStationImpact;
  line: TransitLine | undefined;
  unlinkedWiringCount: number;
  hasWiringAssociation: boolean;
}

/** 线路删除确认弹窗的数据（删除前的统计 + 影响）。 */
interface LineDeleteDialogState {
  impact: DeleteLineImpact;
  unlinkedWiringCount: number;
  hasWiringAssociation: boolean;
}

export default function TransitMapApp({
  projectId = DEFAULT_PROJECT_ID,
  repository,
  onNavigationStateChange,
}: TransitMapAppProps) {
  const projectRepository = useMemo(
    () => repository || createProjectRepository({ storageMode: "http" }),
    [repository],
  );
  const documentStore = useMemo(() => new BrowserEditorDocumentStore(), []);
  const [data, setData] = useState<TransitData | null>(null);
  const [savedCsvSnapshot, setSavedCsvSnapshot] = useState("");
  const [savedLayoutSnapshot, setSavedLayoutSnapshot] = useState("");
  const [undoStack, setUndoStack] = useState<TransitData[]>([]);
  const [redoStack, setRedoStack] = useState<TransitData[]>([]);
  const [lineId, setLineId] = useState("L4");
  const [direction, setDirection] = useState<Direction>("forward");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [exportScale, setExportScale] = useState<1 | 2 | 4>(1);
  const [platformType, setPlatformType] = useState<"island" | "side">("island");
  const [transparent, setTransparent] = useState(false);
  const [showSliceGuides, setShowSliceGuides] = useState(true);
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [pendingStationDelete, setPendingStationDelete] = useState<StationDeleteDialogState | null>(null);
  const [pendingLineDelete, setPendingLineDelete] = useState<LineDeleteDialogState | null>(null);
  const stationDeleteLockRef = useRef(false);
  const lineDeleteLockRef = useRef(false);
  const [activeTable, setActiveTable] = useState<"stations" | "lines">("stations");
  const [status, setStatus] = useState("正在读取本地表格…");
  const [error, setError] = useState("");
  const [revisions, setRevisions] = useState<RevisionInfo[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showExportSettings, setShowExportSettings] = useState(false);
  const [csvImportPreview, setCsvImportPreview] = useState<CsvImportPreview | null>(null);
  const [settingsPreviewMode, setSettingsPreviewMode] = useState<"station" | "current" | "next" | "direction" | "badge">("station");
  const [availableIcons, setAvailableIcons] = useState<string[]>([]);
  const [iconUploading, setIconUploading] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [packageScale, setPackageScale] = useState<1 | 2 | 4>(1);
  const [packageFormat, setPackageFormat] = useState<CanvasImageFormat>("png");
  const [packageQuality, setPackageQuality] = useState(92);
  const [packageDeduplicate, setPackageDeduplicate] = useState(true);
  const [mapArtPackage, setMapArtPackage] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const interactionStartRef = useRef<TransitData | null>(null);
  const dataRef = useRef<TransitData | null>(null);
  const scenicAssetUrlsRef = useRef(new Map<string, string>());
  const [, setScenicAssetRevision] = useState(0);
  const [scenicAssetsReady, setScenicAssetsReady] = useState(false);
  dataRef.current = data;

  const ensureScenicAssets = useCallback(async (source: TransitData) => {
    const filenames = Array.from(new Set(source.stations.flatMap((station) => station.icon ? [station.icon] : [])));
    let registryChanged = false;
    await Promise.all(filenames.map(async (filename) => {
      if (scenicAssetUrlsRef.current.has(filename)) return;
      const asset = await projectRepository.getAsset(projectId, filename).catch(() => null);
      if (!asset) return;
      const url = URL.createObjectURL(asset.blob);
      scenicAssetUrlsRef.current.set(filename, url);
      setScenicIconUrl(filename, url);
      registryChanged = true;
    }));
    // scenicIconUrl() uses an imperative cache. Force the initial preview to
    // read the populated cache instead of waiting for a later line switch.
    if (registryChanged) setScenicAssetRevision((revision) => revision + 1);
  }, [projectId, projectRepository]);

  useEffect(() => () => {
    scenicAssetUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    scenicAssetUrlsRef.current.clear();
    clearScenicIconUrls();
  }, []);

  useEffect(() => {
    projectRepository.loadTransitData(projectId)
      .then((loaded) => {
        const normalized = normalizeTransitData(loaded);
        setData(normalized);
        setSavedCsvSnapshot(csvSnapshot(normalized));
        setSavedLayoutSnapshot(layoutSnapshot(normalized));
        const firstWithStations = normalized.lines.find((line) => stationsForLine(normalized, line.id).length);
        setLineId(normalized.lines.some((line) => line.id === "L4") ? "L4" : firstWithStations?.id || normalized.lines[0]?.id || "");
        setStatus("CSV 已载入");
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "读取项目数据失败");
        setStatus("数据服务离线");
      });
  }, [projectId, projectRepository]);

  const line = useMemo(
    () => data?.lines.find((candidate) => candidate.id === lineId),
    [data, lineId],
  );
  const stations = useMemo(
    () => data ? stationsForLine(data, lineId) : [],
    [data, lineId],
  );
  const currentStation = stations[currentIndex];
  const loopActive = data?.activeStyleTemplate === "loop";
  const visualDirection: Direction = visualDirectionFor(direction, platformType);
  const travelStep = stepForDirection(direction);
  const nextStationIndex = nextIndexForDirection(currentIndex, stations.length, direction, Boolean(loopActive));
  const previousStationIndex = previousIndexForDirection(currentIndex, stations.length, direction, Boolean(loopActive));
  const nextStation = nextStationIndex === undefined ? undefined : stations[nextStationIndex];
  const csvDirty = data ? csvSnapshot(data) !== savedCsvSnapshot : false;
  const layoutDirty = data ? layoutSnapshot(data) !== savedLayoutSnapshot : false;
  const dirty = csvDirty || layoutDirty;
  const auditIssues = useMemo(() => data ? auditTransitData(data) : [], [data]);
  const openingStats = useMemo(() => data ? calculateOpeningStats(data) : null, [data]);

  function moveCurrentIndex(delta: number) {
    setCurrentIndex((value) => loopActive && stations.length
      ? (value + delta + stations.length) % stations.length
      : Math.max(0, Math.min(stations.length - 1, value + delta)));
  }

  useEffect(() => {
    if (!stations.length) setCurrentIndex(0);
    else if (currentIndex > stations.length - 1) setCurrentIndex(stations.length - 1);
  }, [stations.length, currentIndex]);

  useEffect(() => {
    if (!editingStationId) {
      setAvailableIcons([]);
      return;
    }
    let cancelled = false;
    projectRepository.listAssets(projectId)
      .then((icons) => {
        if (!cancelled) setAvailableIcons(icons);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "图标列表读取失败");
      });
    return () => { cancelled = true; };
  }, [editingStationId, projectId, projectRepository]);

  useEffect(() => {
    const confirmUnsavedChanges = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmUnsavedChanges);
    return () => window.removeEventListener("beforeunload", confirmUnsavedChanges);
  }, [dirty]);

  const scenicAssetKey = useMemo(() => data
    ? Array.from(new Set(data.stations.flatMap((station) => station.icon ? [station.icon] : []))).sort().join("\u0000")
    : "", [data?.stations]);

  useEffect(() => {
    if (!data || data.activeStyleTemplate !== "scenic") {
      setScenicAssetsReady(false);
      return;
    }
    let cancelled = false;
    setScenicAssetsReady(false);
    void ensureScenicAssets(data)
      .then(() => preloadScenicIcons(data))
      .finally(() => {
        if (!cancelled) setScenicAssetsReady(true);
      });
    return () => { cancelled = true; };
  }, [data?.activeStyleTemplate, scenicAssetKey, ensureScenicAssets]);

  const beginInteraction = useCallback(() => {
    if (!interactionStartRef.current && dataRef.current) interactionStartRef.current = cloneData(dataRef.current);
  }, []);

  const endInteraction = useCallback(() => {
    const initial = interactionStartRef.current;
    const current = dataRef.current;
    interactionStartRef.current = null;
    if (!initial || !current || JSON.stringify(initial) === JSON.stringify(current)) return;
    setUndoStack((stack) => [...stack.slice(-(MAX_HISTORY - 1)), initial]);
    setRedoStack([]);
  }, []);

  const handleInteractionFocus = useCallback((event: React.FocusEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).matches("input, select, textarea")) beginInteraction();
  }, [beginInteraction]);

  const handleInteractionBlur = useCallback((event: React.FocusEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).matches("input, select, textarea")) endInteraction();
  }, [endInteraction]);

  const handleInteractionPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.matches('input[type="range"]') || target.closest(".settings-preview-stage")) beginInteraction();
  }, [beginInteraction]);

  const handleInteractionPointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.matches('input[type="range"]') || target.closest(".settings-preview-stage")) endInteraction();
  }, [endInteraction]);

  const handleInteractionKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).matches('input[type="range"]')) beginInteraction();
  }, [beginInteraction]);

  const handleInteractionKeyUp = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).matches('input[type="range"]')) endInteraction();
  }, [endInteraction]);

  const commit = useCallback((next: TransitData) => {
    if (!data) return;
    dataRef.current = next;
    if (interactionStartRef.current) {
      setData(next);
      return;
    }
    setUndoStack((stack) => [...stack.slice(-(MAX_HISTORY - 1)), cloneData(data)]);
    setRedoStack([]);
    setData(next);
  }, [data]);

  const updateLine = useCallback((id: string, patch: Partial<TransitLine>) => {
    if (!data) return;
    commit({ ...data, lines: data.lines.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }, [commit, data]);

  const updateStation = useCallback((id: string, patch: Partial<Station>) => {
    if (!data) return;
    commit({ ...data, stations: data.stations.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }, [commit, data]);

  const updateLayout = useCallback((patch: Partial<LayoutConfig>) => {
    if (!data) return;
    const layout = { ...data.layout, ...patch };
    commit({
      ...data,
      layout,
      layoutTemplates: { ...data.layoutTemplates, [data.activeStyleTemplate]: layout },
    });
  }, [commit, data]);

  const assignLineStyle = useCallback((targetLineId: string, template: StyleTemplateId) => {
    if (!data) return;
    const layoutTemplates = { ...data.layoutTemplates, [data.activeStyleTemplate]: data.layout };
    const isPreviewLine = targetLineId === lineId;
    commit({
      ...data,
      activeStyleTemplate: isPreviewLine ? template : data.activeStyleTemplate,
      layoutTemplates,
      layout: isPreviewLine ? layoutTemplates[template] : data.layout,
      lineStyleTemplates: { ...data.lineStyleTemplates, [targetLineId]: template },
    });
  }, [commit, data, lineId]);

  const selectStyleTemplate = useCallback((template: StyleTemplateId) => {
    if (!line || template === data?.activeStyleTemplate && data.lineStyleTemplates?.[line.id] === template) return;
    assignLineStyle(line.id, template);
  }, [assignLineStyle, data, line]);

  const selectPreviewLine = useCallback((nextLineId: string) => {
    if (!data) return;
    const nextTemplate = data.lineStyleTemplates?.[nextLineId] || data.activeStyleTemplate;
    setLineId(nextLineId);
    setCurrentIndex(0);
    setData((current) => {
      if (!current || current.activeStyleTemplate === nextTemplate) return current;
      const next = { ...current, activeStyleTemplate: nextTemplate, layout: current.layoutTemplates[nextTemplate] };
      dataRef.current = next;
      return next;
    });
  }, [data]);

  const undo = useCallback(() => {
    if (!data || !undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((stack) => [cloneData(data), ...stack].slice(0, MAX_HISTORY));
    setUndoStack((stack) => stack.slice(0, -1));
    setData(previous);
    setStatus("已撤销一步");
  }, [data, undoStack]);

  const redo = useCallback(() => {
    if (!data || !redoStack.length) return;
    const next = redoStack[0];
    setUndoStack((stack) => [...stack, cloneData(data)].slice(-MAX_HISTORY));
    setRedoStack((stack) => stack.slice(1));
    setData(next);
    setStatus("已重做一步");
  }, [data, redoStack]);

  const saveCsv = useCallback(async (): Promise<boolean> => {
    if (!data) return true;
    setStatus("正在写入 CSV…");
    setError("");
    try {
      await projectRepository.saveTransitData(projectId, data);
      const verifiedData = normalizeTransitData(await projectRepository.loadTransitData(projectId));
      const verifiedSnapshot = csvSnapshot(verifiedData);
      if (verifiedSnapshot !== csvSnapshot(data)) throw new Error("CSV 保存后校验不一致，请勿关闭页面并检查文件是否被其他程序占用");
      setData((current) => current ? { ...current, lines: verifiedData.lines, stations: verifiedData.stations, transfers: verifiedData.transfers } : verifiedData);
      setSavedCsvSnapshot(verifiedSnapshot);
      setStatus(`CSV 已保存并校验 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV 保存失败");
      setStatus("CSV 保存失败");
      return false;
    }
  }, [data, projectId, projectRepository]);

  const saveLayout = useCallback(async (): Promise<boolean> => {
    if (!data) return true;
    setStatus("正在保存显示设置…");
    setError("");
    try {
      const verifiedData = normalizeTransitData(await projectRepository.saveLayout(projectId, data));
      if (layoutSnapshot(verifiedData) !== layoutSnapshot(data)) throw new Error("显示设置保存后校验不一致");
      setData((current) => current ? {
        ...current,
        layout: verifiedData.layout,
        activeStyleTemplate: verifiedData.activeStyleTemplate,
        layoutTemplates: verifiedData.layoutTemplates,
        lineStyleTemplates: verifiedData.lineStyleTemplates,
      } : current);
      setSavedLayoutSnapshot(layoutSnapshot(verifiedData));
      setStatus(`显示设置已保存 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "显示设置保存失败");
      setStatus("显示设置保存失败");
      return false;
    }
  }, [data, projectId, projectRepository]);

  const saveBeforeLeave = useCallback(async (): Promise<boolean> => {
    if (csvDirty && !(await saveCsv())) return false;
    if (layoutDirty && !(await saveLayout())) return false;
    return true;
  }, [csvDirty, layoutDirty, saveCsv, saveLayout]);

  useEffect(() => {
    if (!onNavigationStateChange) return;
    onNavigationStateChange({ dirty, saveBeforeLeave });
    return () => onNavigationStateChange(null);
  }, [dirty, onNavigationStateChange, saveBeforeLeave]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (showSettings) void saveLayout(); else void saveCsv();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loopActive, redo, saveCsv, saveLayout, showSettings, stations.length, undo]);

  function handlePreviewDoubleClick(event: React.MouseEvent<SVGSVGElement>) {
    if (!data) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (routeWidth / rect.width);
    const tile = Math.floor(x / data.layout.tileSize);
    if (tile === 0 || tile === stations.length + 1) {
      setEditingLineId(lineId);
      return;
    }
    const displayIndex = tile - 1;
    const station = loopActive && stations.length
      ? stations[(currentIndex + (displayIndex - Math.floor(stations.length / 2)) * (visualDirection === "forward" ? 1 : -1) + stations.length * 4) % stations.length]
      : stations[platformType === "side" ? stations.length - 1 - displayIndex : displayIndex];
    if (station) setEditingStationId(station.id);
  }

  function handlePreviewKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveCurrentIndex(travelStep);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveCurrentIndex(-travelStep);
    }
  }

  function toggleTransfer(stationId: string, targetLineId: string) {
    if (!data) return;
    const existing = data.transfers.find(
      (transfer) => transfer.stationId === stationId && transfer.targetLineId === targetLineId,
    );
    const transfers = existing
      ? data.transfers.filter((transfer) => transfer.id !== existing.id)
      : [...data.transfers, {
          id: `TR-${Date.now()}-${targetLineId}`,
          stationId,
          targetLineId,
          order: data.transfers.filter((transfer) => transfer.stationId === stationId).length + 1,
          colorOverride: "",
          hidden: false,
        }];
    commit({ ...data, transfers });
  }

  function toggleTransferVisibility(transferId: string) {
    if (!data) return;
    commit({
      ...data,
      transfers: data.transfers.map((transfer) => transfer.id === transferId ? { ...transfer, hidden: !transfer.hidden } : transfer),
    });
  }

  function addStation() {
    if (!data || !line) return;
    const sequence = stations.length + 1;
    const station: Station = {
      id: `${line.id}-S${Date.now()}`,
      lineId: line.id,
      sequence,
      nameZh: `新站点${sequence}`,
      nameEn: `New Station ${sequence}`,
      code: `${line.code}-${String(sequence).padStart(2, "0")}`,
      markerColor: line.stationColor,
      terminalType: "normal",
      isOpen: true,
      throughLineIds: [],
      notes: "",
    };
    commit({ ...data, stations: [...data.stations, station] });
    setEditingStationId(station.id);
    setCurrentIndex(sequence - 1);
  }

  /** 读取当前工程配线图文档，统计一组站点被删除后会恢复为"未分配"的元件数。 */
  async function loadWiringSummary(
    stationIds: string[],
    deletedLineIds: string[] = [],
  ): Promise<{ unlinkedWiringCount: number; hasWiringAssociation: boolean }> {
    try {
      const doc = await documentStore.load(projectId, "wiring");
      if (!doc) return { unlinkedWiringCount: 0, hasWiringAssociation: false };
      const summary = wiringAssociationsForStationIds(
        doc as Record<string, unknown>,
        stationIds,
        deletedLineIds,
      );
      return {
        unlinkedWiringCount: summary.unlinkedModuleCount
          + summary.unlinkedPlatformCount
          + summary.unlinkedTransferGroupCount,
        hasWiringAssociation: summary.hasAssociation,
      };
    } catch {
      return { unlinkedWiringCount: 0, hasWiringAssociation: false };
    }
  }

  /** 打开站点删除确认弹窗。先按当前数据统计影响，再读取配线图关联。 */
  async function requestDeleteStation(station: Station) {
    if (!data) return;
    stationDeleteLockRef.current = false;
    const { impact } = deleteStationCascade(data, station.id);
    const line = data.lines.find((candidate) => candidate.id === station.lineId);
    const wiring = await loadWiringSummary([station.id]);
    setPendingStationDelete({ impact, line, ...wiring });
  }

  /** 确认删除站点：一次 commit 产生一个撤销步骤，并修正预览状态。 */
  function confirmDeleteStation() {
    if (!data || !pendingStationDelete) return;
    if (stationDeleteLockRef.current) return;
    stationDeleteLockRef.current = true;
    const station = pendingStationDelete.impact.station;
    const { data: nextData } = deleteStationCascade(data, station.id);
    commit(nextData);
    setEditingStationId(null);
    setPendingStationDelete(null);
    // 被删站在当前预览线路时，收紧 currentIndex，避免访问不存在的站点。
    if (station.lineId === lineId) {
      const remaining = stationsForLine(nextData, lineId).length;
      setCurrentIndex((value) => Math.max(0, Math.min(remaining - 1, value)));
    }
    setStatus(`已删除站点“${station.nameZh}”`);
  }

  /** 打开线路删除确认弹窗。统计站点数、换乘数与配线图关联。 */
  async function requestDeleteLine(line: TransitLine) {
    if (!data) return;
    lineDeleteLockRef.current = false;
    const { impact } = deleteLineCascade(data, line.id);
    const lineStationIds = data.stations
      .filter((station) => station.lineId === line.id)
      .map((station) => station.id);
    const wiring = await loadWiringSummary(lineStationIds, [line.id]);
    setPendingLineDelete({ impact, ...wiring });
  }

  /** 确认删除线路：一次 commit 产生一个撤销步骤，并切换/修正预览线路。 */
  function confirmDeleteLine() {
    if (!data || !pendingLineDelete) return;
    if (lineDeleteLockRef.current) return;
    lineDeleteLockRef.current = true;
    const line = pendingLineDelete.impact.line;
    const { data: nextData } = deleteLineCascade(data, line.id);
    commit(nextData);
    setEditingLineId(null);
    setPendingLineDelete(null);
    // 被删线路正是当前预览线路时，切换到剩余线路（优先有站点的线路）。
    if (lineId === line.id) {
      const remainingLines = nextData.lines;
      const firstWithStations = remainingLines.find((candidate) => stationsForLine(nextData, candidate.id).length);
      if (firstWithStations) {
        selectPreviewLine(firstWithStations.id);
      } else if (remainingLines.length) {
        selectPreviewLine(remainingLines[0].id);
      } else {
        setLineId("");
        setCurrentIndex(0);
      }
    }
    setStatus(`已删除线路“${line.nameZh}”`);
  }

  function moveStation(station: Station, delta: number) {
    if (!data) return;
    const ordered = stations.slice();
    const index = ordered.findIndex((item) => item.id === station.id);
    const target = index + delta;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const sequences = new Map(ordered.map((item, position) => [item.id, position + 1]));
    commit({
      ...data,
      stations: data.stations.map((item) => sequences.has(item.id) ? { ...item, sequence: sequences.get(item.id)! } : item),
    });
  }

  function addLine() {
    if (!data) return;
    const id = `LINE-${Date.now()}`;
    const next: TransitLine = {
      id,
      kind: "metro",
      number: String(data.lines.length + 1),
      nameZh: "新线路",
      nameEn: "New Line",
      code: `NEW${data.lines.length + 1}`,
      lineColor: "#12AEFF",
      stationColor: "#12AEFF",
      currentColor: "#DF0024",
      passedColor: "#818181",
      textColor: "#00A8FF",
      description: "轨道交通",
    };
    commit({ ...data, lines: [...data.lines, next], lineStyleTemplates: { ...data.lineStyleTemplates, [id]: data.activeStyleTemplate } });
    setEditingLineId(id);
  }

  async function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
    const bytes = await canvasPngBytes(canvas);
    downloadBlob(new Blob([bytes as BlobPart], { type: "image/png" }), filename);
  }

  async function exportRoute() {
    if (!data || !line || !currentStation) return;
    if (data.activeStyleTemplate === "scenic") {
      await ensureScenicAssets(data);
      await preloadScenicIcons(data);
    }
    const canvas = renderRouteCanvas(data, { lineId, currentIndex, direction, platformType, transparent, scale: exportScale });
    await downloadCanvas(canvas, `${cleanFilePart(line.nameZh)}_线路图_${cleanFilePart(currentStation.nameZh)}_${platformType === "island" ? "岛式" : "侧式"}_${direction === "forward" ? "正向" : "反向"}_${data.layout.tileSize * exportScale}px.png`);
  }

  async function exportSelectedTile(state: StationState) {
    if (!data || !line || !currentStation) return;
    if (data.activeStyleTemplate === "scenic") {
      await ensureScenicAssets(data);
      await preloadScenicIcons(data);
    }
    const labels: Record<StationState, string> = { passed: "已过", current: "当前", upcoming: "未到" };
    const canvas = renderStationTile(
      data,
      line,
      currentStation,
      state,
      visualDirection,
      transparent,
      { first: currentIndex === 0, last: currentIndex === stations.length - 1 },
      exportScale,
    );
    await downloadCanvas(
      canvas,
      `${String(currentStation.sequence).padStart(2, "0")}_${cleanFilePart(currentStation.nameZh)}_${labels[state]}_${data.layout.tileSize * exportScale}px.png`,
    );
  }

  async function exportNextStationCard() {
    if (!data || !line || !nextStation) return;
    const canvas = renderTextCard(data, line, nextStation, "next", transparent, exportScale);
    await downloadCanvas(
      canvas,
      `下一站_${String(nextStation.sequence).padStart(2, "0")}_${cleanFilePart(nextStation.nameZh)}_${data.layout.tileSize * exportScale}px.png`,
    );
  }

  async function exportPackage() {
    if (!data || !line || !stations.length) return;
    setExporting(true);
    setStatus("正在生成图片包…");
    if (data.activeStyleTemplate === "scenic") {
      await ensureScenicAssets(data);
      await preloadScenicIcons(data);
    }
    try {
      const folder = cleanFilePart(line.nameZh);
      const entries: ZipEntry[] = [];
      const logicalImages: Array<{
        path: string;
        canvas: HTMLCanvasElement;
        displayName: string;
        group: string;
      }> = [];
      const effectiveScale: 1 | 2 | 4 = mapArtPackage ? 1 : packageScale;
      const effectiveFormat: CanvasImageFormat = mapArtPackage ? "png" : packageFormat;
      const extension = effectiveFormat === "jpeg" ? "jpg" : effectiveFormat;
      const add = (path: string, canvas: HTMLCanvasElement, displayName: string, group: string) => {
        if (mapArtPackage && (canvas.width !== 128 || canvas.height !== 128)) return;
        logicalImages.push({ path, canvas, displayName, group });
      };
      const platformFolder = platformType === "island" ? "岛式站台" : "侧式站台";
      const variants: Array<{ direction: Direction; name: string }> = data.activeStyleTemplate === "loop"
        ? [{ direction: "forward", name: "内环运行" }, { direction: "reverse", name: "外环运行" }]
        : [{ direction: "forward", name: "正向" }, { direction: "reverse", name: "反向" }];

      for (const variant of variants) {
        const variantFolder = `${folder}/${platformFolder}/${variant.name}`;
        const variantVisualDirection = visualDirectionFor(variant.direction, platformType);
        const destination = terminusForDirection(stations, variant.direction);
        const destinationSide = terminusSideFor(variant.direction, platformType);
        if (!mapArtPackage) {
          add(
            `${variantFolder}/${folder}_线路图_${cleanFilePart(currentStation?.nameZh || "当前站")}_${data.layout.tileSize * effectiveScale}px.${extension}`,
            renderRouteCanvas(data, { lineId, currentIndex, direction: variant.direction, platformType, transparent, scale: effectiveScale }),
            `${line.nameZh}${variant.name}线路图`,
            "完整线路图",
          );
        }
        for (const [index, station] of stations.entries()) {
          const prefix = `${String(station.sequence).padStart(2, "0")}_${cleanFilePart(station.nameZh)}`;
          const edge = { first: index === 0, last: index === stations.length - 1 };
          add(`${variantFolder}/站点/${prefix}_当前.${extension}`, renderStationTile(data, line, station, "current", variantVisualDirection, transparent, edge, effectiveScale), `${station.nameZh}·当前站`, "站点");
          add(`${variantFolder}/站点/${prefix}_已过.${extension}`, renderStationTile(data, line, station, "passed", variantVisualDirection, transparent, edge, effectiveScale), `${station.nameZh}·已过站`, "站点");
          add(`${variantFolder}/站点/${prefix}_未到.${extension}`, renderStationTile(data, line, station, "upcoming", variantVisualDirection, transparent, edge, effectiveScale), `${station.nameZh}·未到站`, "站点");
          add(`${variantFolder}/本站/${prefix}.${extension}`, renderTextCard(data, line, station, "current", transparent, effectiveScale), `本站·${station.nameZh}`, "本站");
          add(`${variantFolder}/下一站/${prefix}.${extension}`, renderTextCard(data, line, station, "next", transparent, effectiveScale), `下一站·${station.nameZh}`, "下一站");
        }
        if (data.activeStyleTemplate === "loop") {
          add(`${variantFolder}/独立组件/${variant.name}.${extension}`, renderLoopDirectionTile(line, data.layout, variant.direction, transparent, effectiveScale), variant.name, "独立组件");
        } else if (data.activeStyleTemplate === "scenic") {
          add(`${variantFolder}/独立组件/方向_${cleanFilePart(destination.nameZh)}.${extension}`, renderScenicDirectionTile(line, destination, destinationSide, data.layout, transparent, effectiveScale), `运行方向·${destination.nameZh}`, "独立组件");
        } else if (data.activeStyleTemplate === "pulse") {
          add(`${variantFolder}/独立组件/方向_${cleanFilePart(destination.nameZh)}.${extension}`, renderPulseDirectionTile(line, destination, destinationSide, data.layout, transparent, effectiveScale), `运行方向·${destination.nameZh}`, "独立组件");
        } else {
          add(`${variantFolder}/独立组件/方向_${cleanFilePart(destination.nameZh)}.${extension}`, renderDirectionTile(line, destination, destinationSide, data.layout, transparent, effectiveScale), `运行方向·${destination.nameZh}`, "独立组件");
        }
        add(`${variantFolder}/独立组件/线路标识.${extension}`, data.activeStyleTemplate === "loop"
          ? renderLoopLineBadgeTile(line, data.layout, transparent, effectiveScale)
          : renderLineBadge(data, line, transparent, effectiveScale), `${line.nameZh}·线路标识`, "独立组件");
      }

      const uniqueByHash = new Map<string, {
        file: string;
        image: (typeof logicalImages)[number];
        aliases: string[];
        order: number;
      }>();
      const aliasMap: Record<string, string> = {};
      for (const image of logicalImages) {
        const pixelHash = await canvasPixelHash(image.canvas);
        const shouldDeduplicate = mapArtPackage || packageDeduplicate;
        const existing = shouldDeduplicate ? uniqueByHash.get(pixelHash) : undefined;
        if (existing) {
          existing.aliases.push(image.path);
          aliasMap[image.path] = existing.file;
          continue;
        }
        const order = uniqueByHash.size + 1;
        const file = mapArtPackage
          ? `images/${String(order).padStart(4, "0")}_${pixelHash.slice(0, 12)}.png`
          : image.path;
        uniqueByHash.set(shouldDeduplicate ? pixelHash : `${pixelHash}:${order}`, {
          file,
          image,
          aliases: [image.path],
          order,
        });
        aliasMap[image.path] = file;
      }

      for (const item of uniqueByHash.values()) {
        entries.push({
          name: mapArtPackage ? item.file : `${folder}/${item.file}`,
          data: await canvasImageBytes(item.image.canvas, effectiveFormat, packageQuality / 100),
        });
      }

      if (mapArtPackage) {
        const assets = Array.from(uniqueByHash.entries()).map(([hash, item]) => ({
          id: hash,
          sha256Pixels: hash,
          file: item.file,
          name: item.image.displayName,
          aliases: item.aliases,
          order: item.order,
          group: item.image.group,
          width: 128,
          height: 128,
        }));
        const manifest = {
          format: "block-workbench-map-art-package",
          version: 1,
          generatedAt: new Date().toISOString(),
          source: { application: "transit-map-generator", lineId: line.id, lineName: line.nameZh },
          image: { width: 128, height: 128, format: "png", colorMode: "RGBA" },
          deduplication: { method: "sha256-decoded-rgba", logicalCount: logicalImages.length, uniqueCount: assets.length },
          assets,
          maps: assets,
        };
        entries.push({ name: "manifest.json", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
        downloadBlob(createStoredZip(entries), `${folder}_方块工坊地图画包.zip`);
        setStatus(`地图画包已生成：${logicalImages.length} 个用途，去重后 ${assets.length} 张地图画`);
      } else {
        entries.push({ name: `${folder}/重复图片对照表.json`, data: new TextEncoder().encode(JSON.stringify({
          deduplicated: packageDeduplicate,
          logicalCount: logicalImages.length,
          uniqueCount: uniqueByHash.size,
          aliases: aliasMap,
        }, null, 2)) });
        entries.push({ name: `${folder}/数据备份.json`, data: new TextEncoder().encode(JSON.stringify(data, null, 2)) });
        downloadBlob(createStoredZip(entries), `${folder}_图片包.zip`);
        setStatus(`图片包已生成：${logicalImages.length} 个用途，实际 ${uniqueByHash.size} 张图片`);
      }
      setShowExportSettings(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导出失败");
      setStatus("导出失败");
    } finally {
      setExporting(false);
    }
  }

  function exportBackup() {
    if (!data) return;
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "轨道图数据备份.json");
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !data) return;
    try {
      const imported = JSON.parse(await file.text()) as TransitData;
      if (!Array.isArray(imported.lines) || !Array.isArray(imported.stations)) throw new Error("不是有效的数据备份");
      commit(normalizeTransitData(imported));
      setStatus("备份已载入，保存后写入 CSV");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导入失败");
    } finally {
      event.target.value = "";
    }
  }

  /** 选择 CSV 文件后解析并弹出预览 */
  async function handleCsvImportSelect(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    if (!fileList || !fileList.length || !data) return;
    try {
      const parsed: ParsedCsvFile[] = [];
      for (const file of Array.from(fileList)) {
        const text = await file.text();
        const result = parseCsvFile(file.name, text);
        if (result) {
          parsed.push(result);
        } else {
          setError(`无法识别文件 ${file.name}，请选择 lines.csv、stations.csv 或 transfers.csv`);
        }
      }
      if (!parsed.length) {
        setError("未识别到有效的 CSV 文件，文件名需包含 line、station 或 transfer");
        return;
      }
      const preview = buildImportPreview(parsed, data);
      setCsvImportPreview(preview);
      setShowCsvImport(true);
      setStatus(`已解析 ${parsed.length} 个 CSV 文件，预览中`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV 解析失败");
    } finally {
      event.target.value = "";
    }
  }

  /** 确认导入：合并数据并提交到历史栈 */
  function confirmCsvImport() {
    if (!csvImportPreview || !data) return;
    if (hasBlockingIssues(csvImportPreview.issues)) return;
    const merged: TransitData = {
      ...data,
      lines: csvImportPreview.lines,
      stations: csvImportPreview.stations,
      transfers: csvImportPreview.transfers,
    };
    commit(normalizeTransitData(merged));
    setShowCsvImport(false);
    setCsvImportPreview(null);
    setStatus("CSV 已导入，保存后写入文件");
  }

  /** 取消导入 */
  function cancelCsvImport() {
    setShowCsvImport(false);
    setCsvImportPreview(null);
    setStatus("已取消 CSV 导入");
  }

  async function uploadStationIcon(event: ChangeEvent<HTMLInputElement>, stationId: string) {
    const file = event.target.files?.[0];
    if (!file || !data) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".ico", ".jpg", ".jpeg", ".png"].includes(ext)) {
      setError("仅支持 ico、jpg、jpeg、png 格式的图标");
      return;
    }
    setIconUploading(true);
    try {
      await projectRepository.putAsset(projectId, file.name, file);
      updateStation(stationId, { icon: file.name });
      setAvailableIcons((prev) => (prev.includes(file.name) ? prev : [...prev, file.name]));
      setStatus(`图标 ${file.name} 已保存并应用`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图标上传失败");
    } finally {
      setIconUploading(false);
      event.target.value = "";
    }
  }

  async function openHistory() {
    setShowHistory(true);
    try {
      setRevisions(await projectRepository.listRevisions(projectId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "历史版本读取失败");
    }
  }

  async function restoreRevision(revision: RevisionInfo) {
    if (!window.confirm(`恢复到 ${new Date(revision.createdAt).toLocaleString("zh-CN")} 吗？只会替换线路、站点和换乘 CSV，不会改变显示设置。`)) return;
    try {
      const normalized = normalizeTransitData(await projectRepository.restoreRevision(projectId, revision.id));
      const merged = data ? {
        ...normalized,
        layout: data.layout,
        activeStyleTemplate: data.activeStyleTemplate,
        layoutTemplates: data.layoutTemplates,
        lineStyleTemplates: data.lineStyleTemplates,
      } : normalized;
      setData(merged);
      setSavedCsvSnapshot(csvSnapshot(normalized));
      setUndoStack([]);
      setRedoStack([]);
      setShowHistory(false);
      setStatus("历史版本已恢复");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "恢复失败");
    }
  }

  function revisionKindLabel(revision: RevisionInfo) {
    return revision.kind === "saved" ? "已保存版本" : "历史版本";
  }

  function openAuditIssue(issue: StationAuditIssue) {
    const station = issue.stationId ? data?.stations.find((candidate) => candidate.id === issue.stationId) : undefined;
    if (!station) return;
    selectPreviewLine(station.lineId);
    const stationIndex = stationsForLine(data!, station.lineId).findIndex((candidate) => candidate.id === station.id);
    setCurrentIndex(Math.max(0, stationIndex));
    setEditingStationId(station.id);
    setShowAudit(false);
  }

  if (!data) {
    return (
      <main className="loading-shell">
        <div className="loading-card">
          <span className="brand-mark"><img src={siteUrl("assets/rail-transit-icon.png")} alt="" /></span>
          <h1>线路站序图编辑器</h1>
          <p>{error || status}</p>
          {error && <button onClick={() => window.location.reload()}>重新连接</button>}
        </div>
      </main>
    );
  }

  const editingStation = data.stations.find((station) => station.id === editingStationId);
  const editingLine = data.lines.find((candidate) => candidate.id === editingLineId);
  const routeWidth = (stations.length + 2) * data.layout.tileSize;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark"><img src={siteUrl("assets/rail-transit-icon.png")} alt="" /></span>
          <div>
              <h1>线路站序图编辑器</h1>
              <p>本地线路站序图生成器 · 128 px 地图画</p>
          </div>
        </div>
        <div className="header-actions">
          <span className={`save-state ${dirty ? "is-dirty" : ""}`}>
            <i />{csvDirty && layoutDirty ? "CSV 与显示设置未保存" : csvDirty ? "CSV 有未保存修改" : layoutDirty ? "显示设置未保存" : status}
          </span>
          <IconButton title="撤销 Ctrl+Z" onClick={undo} disabled={!undoStack.length}>↶</IconButton>
          <IconButton title="重做 Ctrl+Y" onClick={redo} disabled={!redoStack.length}>↷</IconButton>
          <button className="secondary-button" onClick={() => setShowSettings(true)}>显示设置</button>
          <button className="secondary-button" onClick={() => void openHistory()}>历史版本</button>
          <button className="primary-button" onClick={() => void saveCsv()} disabled={!csvDirty}>保存 CSV</button>
        </div>
      </header>

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}>关闭</button></div>}

      <section className="workspace-card preview-card">
        <div className="preview-toolbar">
          <div className="control-group line-picker">
            <label htmlFor="line-select">预览线路</label>
            <select id="line-select" value={lineId} onChange={(event) => selectPreviewLine(event.target.value)}>
              {data.lines.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.nameZh} · {candidate.code}{stationsForLine(data, candidate.id).length ? "" : "（无站点）"}
                </option>
              ))}
            </select>
          </div>
          <div className="segmented" aria-label="运行方向">
            <button className={direction === "forward" ? "active" : ""} onClick={() => setDirection("forward")}>{data.activeStyleTemplate === "loop" ? "内环运行 →" : "正向 →"}</button>
            <button className={direction === "reverse" ? "active" : ""} onClick={() => setDirection("reverse")}>{data.activeStyleTemplate === "loop" ? "← 外环运行" : "← 反向"}</button>
          </div>
          <div className="segmented" aria-label="预览和导出的站台类型" title="预览与图片包共用此站台类型；图片包会同时生成两个运行方向">
            <button className={platformType === "island" ? "active" : ""} onClick={() => setPlatformType("island")}>岛式站台</button>
            <button className={platformType === "side" ? "active" : ""} onClick={() => setPlatformType("side")}>侧式站台</button>
          </div>
          <div className="toolbar-spacer" />
          <label className="check-control">
            <input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} />
            透明背景
          </label>
          <label className="check-control">
            <input type="checkbox" checked={showSliceGuides} onChange={(event) => setShowSliceGuides(event.target.checked)} />
            分割预览
          </label>
          <select aria-label="预览缩放" className="zoom-select" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
          </select>
          <select
            aria-label="导出图片规格"
            className="export-size-select"
            value={exportScale}
            onChange={(event) => setExportScale(Number(event.target.value) as 1 | 2 | 4)}
          >
            <option value={1}>导出 128 px</option>
            <option value={2}>导出 256 px</option>
            <option value={4}>导出 512 px</option>
          </select>
          <button className="secondary-button" onClick={() => void exportRoute()} disabled={!stations.length}>导出线路图</button>
          <button className="primary-button" onClick={() => setShowExportSettings(true)} disabled={exporting || !stations.length}>
            {exporting ? "生成中…" : "导出图片包"}
          </button>
        </div>

        <div className="canvas-stage" tabIndex={0} onKeyDown={handlePreviewKeyDown} aria-label="线路预览，双击站点可编辑">
          {stations.length ? (
            <div
              className={`canvas-paper ${transparent ? "transparent-grid" : ""}`}
              style={{ width: routeWidth * zoom, height: data.layout.tileSize * zoom }}
            >
              {data.activeStyleTemplate === "scenic" ? (
                <ScenicRoutePreviewSvg
                  data={data}
                  line={line!}
                  currentIndex={currentIndex}
                  direction={direction}
                  platformType={platformType}
                  transparent={transparent}
                  assetsReady={scenicAssetsReady}
                  onDoubleClick={handlePreviewDoubleClick}
                />
              ) : (
                <RoutePreviewSvg
                  data={data}
                  line={line!}
                  currentIndex={currentIndex}
                  direction={direction}
                  platformType={platformType}
                  transparent={transparent}
                  onDoubleClick={handlePreviewDoubleClick}
                />
              )}
              {showSliceGuides && <SliceGuideOverlay count={stations.length + 2} tileSize={data.layout.tileSize} zoom={zoom} />}
            </div>
          ) : (
            <div className="empty-preview">该线路还没有站点，请在下方添加。</div>
          )}
        </div>

        <div className="station-controller">
          <button onClick={() => moveCurrentIndex(-travelStep)} disabled={!stations.length || previousStationIndex === undefined}>上一站</button>
          <div className="slider-block">
            <div className="slider-labels">
              <span>当前站</span>
              <strong>{currentStation ? `${currentStation.sequence}. ${currentStation.nameZh}` : "暂无站点"}</strong>
              <span>{stations.length ? `${currentIndex + 1} / ${stations.length}` : "0 / 0"}</span>
            </div>
            <input
              aria-label="选择当前站"
              type="range"
              min={0}
              max={Math.max(0, stations.length - 1)}
              step={1}
              value={currentIndex}
              disabled={!stations.length}
              onChange={(event) => setCurrentIndex(Number(event.target.value))}
              style={{ "--range-progress": `${stations.length > 1 ? currentIndex / (stations.length - 1) * 100 : 0}%` } as React.CSSProperties}
            />
          </div>
          <button onClick={() => moveCurrentIndex(travelStep)} disabled={!stations.length || nextStationIndex === undefined}>下一站</button>
          <div className="quick-export">
            <span>本站切片</span>
            <button onClick={() => void exportSelectedTile("passed")} disabled={!currentStation}>已过</button>
            <button onClick={() => void exportSelectedTile("current")} disabled={!currentStation}>当前</button>
            <button onClick={() => void exportSelectedTile("upcoming")} disabled={!currentStation}>未到</button>
            <button onClick={() => void exportNextStationCard()} disabled={!nextStation}>下一站图</button>
          </div>
        </div>
        <p className="preview-hint">提示：双击线路两端可编辑线路，双击任意站点可编辑站名、颜色和换乘信息。</p>
      </section>

      <section className="workspace-card data-card">
        <div className="data-heading">
          <div>
            <p className="eyebrow">本地表格</p>
            <h2>{activeTable === "stations" ? `${line?.nameZh || "线路"}站点` : "线路资料库"}</h2>
          </div>
          <div className="data-actions">
            <div className="segmented small">
              <button className={activeTable === "stations" ? "active" : ""} onClick={() => setActiveTable("stations")}>站点表</button>
              <button className={activeTable === "lines" ? "active" : ""} onClick={() => setActiveTable("lines")}>线路表</button>
            </div>
            <button className="secondary-button" onClick={() => setShowAudit(true)}>站点检查{auditIssues.length ? ` · ${auditIssues.length}` : ""}</button>
            <button className="secondary-button" onClick={() => setShowStats(true)}>开通统计</button>
            <button className="secondary-button" onClick={exportBackup}>导出数据备份</button>
            <button className="secondary-button" onClick={() => importRef.current?.click()}>导入备份</button>
            <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importBackup(event)} />
            <button className="secondary-button" onClick={() => csvImportRef.current?.click()}>导入 CSV</button>
            <input ref={csvImportRef} hidden type="file" accept=".csv,text/csv" multiple onChange={(event) => void handleCsvImportSelect(event)} />
            {activeTable === "stations" ? (
              <button className="primary-button" onClick={addStation} disabled={!line}>添加站点</button>
            ) : (
              <button className="primary-button" onClick={addLine}>添加线路</button>
            )}
          </div>
        </div>

        {activeTable === "stations" ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>顺序</th><th>中文站名</th><th>英文站名</th><th>站点代号</th><th>换乘</th><th>开通状态</th><th>端点类型</th><th>操作</th></tr></thead>
              <tbody>
                {stations.map((station, index) => {
                  const stationTransfers = data.transfers
                    .filter((transfer) => transfer.stationId === station.id)
                    .map((transfer) => {
                      const code = data.lines.find((candidate) => candidate.id === transfer.targetLineId)?.code;
                      return code ? `${code}${transfer.hidden ? "（隐藏）" : ""}` : "";
                    })
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <tr key={station.id} className={index === currentIndex ? "current-row" : ""} onDoubleClick={() => setEditingStationId(station.id)}>
                      <td><span className="sequence-pill">{String(station.sequence).padStart(2, "0")}</span></td>
                      <td><strong>{station.nameZh}</strong></td>
                      <td>{station.nameEn}</td>
                      <td><code>{station.code}</code></td>
                      <td>{stationTransfers || <span className="muted">无</span>}</td>
                      <td>
                        <button
                          className={`open-state-button ${station.isOpen !== false ? "is-open" : "is-closed"}`}
                          onClick={(event) => { event.stopPropagation(); updateStation(station.id, { isOpen: station.isOpen === false }); }}
                        >{station.isOpen !== false ? "已开通" : "未开通"}</button>
                      </td>
                      <td>{station.terminalType === "normal" ? "普通站" : station.terminalType === "terminal" ? "终点站" : "贯通端点"}</td>
                      <td className="row-actions">
                        <button title="上移" onClick={() => moveStation(station, -1)} disabled={!index}>↑</button>
                        <button title="下移" onClick={() => moveStation(station, 1)} disabled={index === stations.length - 1}>↓</button>
                        <button onClick={() => setEditingStationId(station.id)}>编辑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!stations.length && <div className="empty-table">暂无站点。点击“添加站点”建立第一站。</div>}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>分类</th><th>编号</th><th>中文名称</th><th>英文名称</th><th>代号</th><th>线路颜色</th><th>站点数</th><th>操作</th></tr></thead>
              <tbody>
                {data.lines.map((candidate) => (
                  <tr key={candidate.id} onDoubleClick={() => setEditingLineId(candidate.id)}>
                    <td><span className={`kind-badge ${candidate.kind}`}>{candidate.kind === "tram" ? "有轨电车" : "轨道交通"}</span></td>
                    <td><strong>{candidate.number}</strong></td>
                    <td>{candidate.nameZh}</td>
                    <td>{candidate.nameEn}</td>
                    <td><code>{candidate.code}</code></td>
                    <td><span className="color-chip" style={{ backgroundColor: candidate.lineColor }} />{candidate.lineColor}</td>
                    <td>{stationsForLine(data, candidate.id).length}</td>
                    <td className="row-actions">
                      <button className="table-edit" onClick={() => setEditingLineId(candidate.id)}>编辑</button>
                      <button className="table-edit danger-text" onClick={() => void requestDeleteLine(candidate)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="app-footer">
        <span>数据保存在项目 data 目录的 CSV 文件中</span>
        <span>快捷键：Ctrl+S 保存 · Ctrl+Z 撤销 · Ctrl+Y 重做</span>
      </footer>

      {showExportSettings && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !exporting && setShowExportSettings(false)}>
          <section className="editor-modal export-package-modal" role="dialog" aria-modal="true" aria-labelledby="export-package-title">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">图片包与地图画</span>
                <h2 id="export-package-title">导出图片包设置</h2>
              </div>
              <button className="close-button" onClick={() => setShowExportSettings(false)} disabled={exporting} aria-label="关闭">×</button>
            </div>
            <div className="modal-scroll-body">
              <div className="form-grid export-package-grid">
                <label>
                  <span>图片尺寸</span>
                  <select value={packageScale} disabled={mapArtPackage} onChange={(event) => setPackageScale(Number(event.target.value) as 1 | 2 | 4)}>
                    <option value={1}>128 × 128 px</option>
                    <option value={2}>256 × 256 px</option>
                    <option value={4}>512 × 512 px</option>
                  </select>
                </label>
                <label>
                  <span>图片格式</span>
                  <select value={packageFormat} disabled={mapArtPackage} onChange={(event) => setPackageFormat(event.target.value as CanvasImageFormat)}>
                    <option value="png">PNG（无损）</option>
                    <option value="webp">WebP</option>
                    <option value="jpeg">JPEG</option>
                  </select>
                </label>
                <label className="wide">
                  <span>有损格式质量 · {packageQuality}%</span>
                  <input type="range" min={50} max={100} step={1} value={packageQuality} disabled={mapArtPackage || packageFormat === "png"} onChange={(event) => setPackageQuality(Number(event.target.value))} />
                </label>
                <label className="wide export-package-check">
                  <input type="checkbox" checked={packageDeduplicate} disabled={mapArtPackage} onChange={(event) => setPackageDeduplicate(event.target.checked)} />
                  <span>按最终像素去除重复图片</span>
                  <small>正向、反向或不同用途产生相同像素时只保存一份，并在对照表中保留全部原文件名。</small>
                </label>
                <label className="wide export-package-check map-art-option">
                  <input type="checkbox" checked={mapArtPackage} onChange={(event) => setMapArtPackage(event.target.checked)} />
                  <span>导出为“方块工坊地图画导入包”</span>
                  <small>启用后强制使用 128×128 PNG 和像素级去重；完整长线路图不会进入地图画包，只导出可直接制成单张地图的子图。</small>
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setShowExportSettings(false)} disabled={exporting}>取消</button>
              <button className="primary-button" onClick={() => void exportPackage()} disabled={exporting}>
                {exporting ? "正在生成…" : mapArtPackage ? "生成地图画导入包" : "生成图片包"}
              </button>
            </div>
          </section>
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          data={data}
          line={line}
          stations={stations}
          currentStation={currentStation}
          nextStation={nextStation}
          currentIndex={currentIndex}
          setCurrentIndex={setCurrentIndex}
          settingsPreviewMode={settingsPreviewMode}
          setSettingsPreviewMode={setSettingsPreviewMode}
          direction={direction}
          platformType={platformType}
          visualDirection={visualDirection}
          transparent={transparent}
          scenicAssetsReady={scenicAssetsReady}
          undoStack={undoStack}
          layoutDirty={layoutDirty}
          selectStyleTemplate={selectStyleTemplate}
          updateLayout={updateLayout}
          undo={undo}
          saveLayout={saveLayout}
          onClose={() => setShowSettings(false)}
          handleInteractionFocus={handleInteractionFocus}
          handleInteractionBlur={handleInteractionBlur}
          handleInteractionPointerDown={handleInteractionPointerDown}
          handleInteractionPointerUp={handleInteractionPointerUp}
          handleInteractionKeyDown={handleInteractionKeyDown}
          handleInteractionKeyUp={handleInteractionKeyUp}
        />
      )}

      {editingStation && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditingStationId(null)}>
          <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="station-editor-title" onFocusCapture={handleInteractionFocus} onBlurCapture={handleInteractionBlur}>
            <div className="modal-heading">
              <div><p className="eyebrow">站点编辑</p><h2 id="station-editor-title">{editingStation.nameZh}</h2></div>
              <button className="close-button" onClick={() => setEditingStationId(null)}>×</button>
            </div>
            <div className="modal-scroll-body">
            <div className="form-grid">
              <label><span>中文站名</span><input value={editingStation.nameZh} onChange={(event) => updateStation(editingStation.id, { nameZh: event.target.value })} /></label>
              <label><span>英文站名</span><input value={editingStation.nameEn} onChange={(event) => updateStation(editingStation.id, { nameEn: event.target.value })} /></label>
              <label><span>站点代号</span><input value={editingStation.code} onChange={(event) => updateStation(editingStation.id, { code: event.target.value })} /></label>
              <label><span>端点类型</span>
                <select value={editingStation.terminalType} onChange={(event) => updateStation(editingStation.id, { terminalType: event.target.value as Station["terminalType"] })}>
                  <option value="normal">普通站</option><option value="terminal">普通终点站</option><option value="through-start">贯通起点</option><option value="through-end">贯通终点</option>
                </select>
              </label>
              <label className="station-open-control">
                <span>开通状态</span>
                <span className="check-control"><input type="checkbox" checked={editingStation.isOpen !== false} onChange={(event) => updateStation(editingStation.id, { isOpen: event.target.checked })} />本线路站点已开通</span>
              </label>
              <ColorField label="站点颜色" value={editingStation.markerColor} onChange={(value) => updateStation(editingStation.id, { markerColor: value })} />
              <label className="wide"><span>备注</span><input value={editingStation.notes} onChange={(event) => updateStation(editingStation.id, { notes: event.target.value })} /></label>
            </div>
            <div className="icon-editor">
              <div className="icon-editor-heading">
                <h3>景区图标</h3>
                <p>仅在“景区样式”下显示。图标按站点颜色着色，当前站使用线路当前色边框。</p>
              </div>
              {editingStation.icon ? (
                <div className="icon-current">
                  <RepositoryAssetImage repository={projectRepository} projectId={projectId} name={editingStation.icon} alt="" />
                  <span>{editingStation.icon}</span>
                  <button type="button" className="secondary-button" onClick={() => updateStation(editingStation.id, { icon: "" })}>清除</button>
                </div>
              ) : (
                <div className="icon-current empty"><span>未设置图标</span></div>
              )}
              <div className="icon-editor-actions">
                <button type="button" className="primary-button" onClick={() => { setIconSearch(""); setShowIconPicker(true); }}>选择图标</button>
                <label className="icon-upload">
                  <input type="file" accept=".ico,.jpg,.jpeg,.png" disabled={iconUploading} onChange={(event) => void uploadStationIcon(event, editingStation.id)} />
                  <span className="secondary-button">{iconUploading ? "上传中…" : "上传文件"}</span>
                </label>
              </div>
            </div>
            <div className="transfer-editor">
              <h3>换乘线路</h3>
              <p>根据线路表自动匹配颜色和轨道交通／有轨电车标识。</p>
              <div className="transfer-options">
                {data.lines.filter((candidate) => candidate.id !== editingStation.lineId).map((candidate) => {
                  const transfer = data.transfers.find((item) => item.stationId === editingStation.id && item.targetLineId === candidate.id);
                  const checked = Boolean(transfer);
                  return (
                    <div key={candidate.id} className={`transfer-option ${checked ? "checked" : ""} ${transfer?.hidden ? "is-hidden" : ""}`}>
                      <label>
                        <input type="checkbox" checked={checked} onChange={() => toggleTransfer(editingStation.id, candidate.id)} />
                        <i style={{ backgroundColor: candidate.lineColor }} />
                        <span>{candidate.kind === "tram" ? `Tram ${candidate.number}` : candidate.nameZh}</span>
                      </label>
                      {transfer && (
                        <button type="button" onClick={() => toggleTransferVisibility(transfer.id)} title="保留换乘数据，但控制它是否出现在预览和导出图片中">
                          {transfer.hidden ? "已隐藏" : "显示"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
            <div className="modal-actions">
              <button className="danger-button" onClick={() => void requestDeleteStation(editingStation)}>删除站点</button>
              <div className="toolbar-spacer" />
              <button className="secondary-button" onClick={undo} disabled={!undoStack.length}>撤销修改</button>
              <button className="primary-button" onClick={() => setEditingStationId(null)}>完成</button>
            </div>
          </section>
        </div>
      )}

      {editingStation && showIconPicker && (() => {
        const iconSet = new Set(availableIcons);
        const query = iconSearch.trim().toLowerCase();
        const matchedIcon = (name: string) => {
          const filename = `${name}.png`;
          if (!iconSet.has(filename)) return null;
          if (query && !name.toLowerCase().includes(query) && !filename.toLowerCase().includes(query)) return null;
          return filename;
        };
        const categorizedNames = new Set<string>();
        const visibleCategories = ICON_CATEGORIES.map((category) => {
          const icons = category.icons
            .map((name) => { const f = matchedIcon(name); if (f) categorizedNames.add(f); return f ? { name, filename: f } : null; })
            .filter((x): x is { name: string; filename: string } => x !== null);
          return { name: category.name, icons };
        }).filter((cat) => cat.icons.length > 0);
        const uncategorized = availableIcons
          .filter((f) => !categorizedNames.has(f) && (!query || f.toLowerCase().includes(query)))
          .map((f) => ({ name: f.replace(/\.png$/i, ""), filename: f }));
        const allSections = uncategorized.length ? [...visibleCategories, { name: "用户上传素材", icons: uncategorized }] : visibleCategories;
        return (
          <div className="modal-backdrop" onClick={() => setShowIconPicker(false)}>
            <section className="icon-picker-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-heading">
                <h2>选择景区图标</h2>
                <button className="close-button" onClick={() => setShowIconPicker(false)}>×</button>
              </div>
              <div className="modal-scroll-body">
                <div className="icon-picker-search">
                  <input type="text" placeholder="搜索图标名称…" value={iconSearch} onChange={(event) => setIconSearch(event.target.value)} />
                  <span className="icon-picker-count">{availableIcons.length} 个图标</span>
                </div>
                {editingStation.icon && (
                  <div className="icon-picker-current">
                    <span>当前：</span>
                    <RepositoryAssetImage repository={projectRepository} projectId={projectId} name={editingStation.icon} alt="" />
                    <span className="icon-picker-current-name">{editingStation.icon}</span>
                    <button type="button" className="secondary-button" onClick={() => updateStation(editingStation.id, { icon: "" })}>清除</button>
                  </div>
                )}
                {allSections.length === 0 ? (
                  <div className="icon-picker-empty">没有找到匹配的图标</div>
                ) : allSections.map((section) => (
                  <div key={section.name} className="icon-category">
                    <h4>{section.name}</h4>
                    <div className="icon-grid">
                      {section.icons.map(({ name, filename }) => (
                        <button
                          key={filename}
                          type="button"
                          className={editingStation.icon === filename ? "active" : ""}
                          title={name}
                          onClick={() => { updateStation(editingStation.id, { icon: filename }); setShowIconPicker(false); }}
                        >
                          <RepositoryAssetImage repository={projectRepository} projectId={projectId} name={filename} alt={name} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="icon-picker-upload">
                  <label className="icon-upload">
                    <input type="file" accept=".ico,.jpg,.jpeg,.png" disabled={iconUploading} onChange={(event) => void uploadStationIcon(event, editingStation.id)} />
                    <span className="primary-button">{iconUploading ? "上传中…" : "上传新图标"}</span>
                    <small>支持 ico、jpg、jpeg、png，上传后作为当前工程的自定义图标保存</small>
                  </label>
                </div>
              </div>
            </section>
          </div>
        );
      })()}

      {editingLine && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditingLineId(null)}>
          <section className="editor-modal line-modal" role="dialog" aria-modal="true" aria-labelledby="line-editor-title" onFocusCapture={handleInteractionFocus} onBlurCapture={handleInteractionBlur}>
            <div className="modal-heading">
              <div><p className="eyebrow">线路编辑</p><h2 id="line-editor-title">{editingLine.nameZh}</h2></div>
              <button className="close-button" onClick={() => setEditingLineId(null)}>×</button>
            </div>
            <div className="modal-scroll-body">
            <div className="form-grid">
              <label><span>交通分类</span><select value={editingLine.kind} onChange={(event) => updateLine(editingLine.id, { kind: event.target.value as TransitLine["kind"] })}><option value="metro">轨道交通</option><option value="tram">有轨电车</option></select></label>
              <label><span>线路编号</span><input value={editingLine.number} onChange={(event) => updateLine(editingLine.id, { number: event.target.value })} /></label>
              <label><span>中文名称</span><input value={editingLine.nameZh} onChange={(event) => updateLine(editingLine.id, { nameZh: event.target.value })} /></label>
              <label><span>英文名称</span><input value={editingLine.nameEn} onChange={(event) => updateLine(editingLine.id, { nameEn: event.target.value })} /></label>
              <label><span>线路代号</span><input value={editingLine.code} onChange={(event) => updateLine(editingLine.id, { code: event.target.value })} /></label>
              <label><span>线路说明</span><input value={editingLine.description} onChange={(event) => updateLine(editingLine.id, { description: event.target.value })} /></label>
              <label><span>站序图样式</span><select value={data.lineStyleTemplates?.[editingLine.id] || "classic"} onChange={(event) => assignLineStyle(editingLine.id, event.target.value as StyleTemplateId)}><option value="classic">经典样式</option><option value="loop">环线样式</option><option value="scenic">景区样式</option><option value="pulse">城市脉冲</option></select></label>
            </div>
            <div className="color-grid">
              <ColorField label="线路颜色" value={editingLine.lineColor} onChange={(value) => updateLine(editingLine.id, { lineColor: value })} />
              <ColorField label="未到站颜色" value={editingLine.stationColor} onChange={(value) => updateLine(editingLine.id, { stationColor: value })} />
              <ColorField label="当前站颜色" value={editingLine.currentColor} onChange={(value) => updateLine(editingLine.id, { currentColor: value })} />
              <ColorField label="已过站颜色" value={editingLine.passedColor} onChange={(value) => updateLine(editingLine.id, { passedColor: value })} />
              <ColorField label="站名颜色" value={editingLine.textColor} onChange={(value) => updateLine(editingLine.id, { textColor: value })} />
            </div>
            </div>
            <div className="modal-actions"><div className="toolbar-spacer" /><button className="secondary-button" onClick={undo} disabled={!undoStack.length}>撤销修改</button><button className="primary-button" onClick={() => setEditingLineId(null)}>完成</button></div>
          </section>
        </div>
      )}

      {pendingStationDelete && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPendingStationDelete(null)}>
          <section className="editor-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="station-delete-title">
            <div className="modal-heading">
              <div><p className="eyebrow">危险操作</p><h2 id="station-delete-title">删除站点</h2></div>
              <button className="close-button" onClick={() => setPendingStationDelete(null)}>×</button>
            </div>
            <div className="modal-scroll-body">
              <p className="confirm-question">确定删除“{pendingStationDelete.impact.station.nameZh}”吗？</p>
              {pendingStationDelete.line && (
                <p className="confirm-scope">线路：{pendingStationDelete.line.nameZh}（{pendingStationDelete.line.number || pendingStationDelete.line.code}）</p>
              )}
              {pendingStationDelete.impact.station.code && (
                <p className="confirm-scope">站点代码：{pendingStationDelete.impact.station.code}</p>
              )}
              <ul className="confirm-list">
                <li>删除 1 条站点记录</li>
                {pendingStationDelete.impact.removedTransferCount > 0 && <li>删除 {pendingStationDelete.impact.removedTransferCount} 条本站换乘记录</li>}
                {pendingStationDelete.impact.reciprocalTransferCount > 0 && <li>清理 {pendingStationDelete.impact.reciprocalTransferCount} 条其他线路中的对应换乘标记</li>}
                {pendingStationDelete.unlinkedWiringCount > 0 && <li>将 {pendingStationDelete.unlinkedWiringCount} 个配线图站点元件恢复为“未分配”状态</li>}
              </ul>
              <p className="confirm-note">配线图中的站台、轨道、道岔、连接、标签、图标与手动布局都不会被删除。删除后可通过“撤销修改”或工程历史恢复。</p>
              {pendingStationDelete.hasWiringAssociation && (
                <div className="warning-box">该站已用于配线图。删除后相关元件会保留，但不再与线路站点数据同步。</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setPendingStationDelete(null)}>取消</button>
              <button className="danger-button" onClick={confirmDeleteStation}>删除站点</button>
            </div>
          </section>
        </div>
      )}

      {pendingLineDelete && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPendingLineDelete(null)}>
          <section className="editor-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="line-delete-title">
            <div className="modal-heading">
              <div><p className="eyebrow">危险操作</p><h2 id="line-delete-title">删除线路</h2></div>
              <button className="close-button" onClick={() => setPendingLineDelete(null)}>×</button>
            </div>
            <div className="modal-scroll-body">
              <p className="confirm-question">确定删除“{pendingLineDelete.impact.line.nameZh}”吗？</p>
              <p className="confirm-scope">线路编号：{pendingLineDelete.impact.line.number || pendingLineDelete.impact.line.code}</p>
              <ul className="confirm-list">
                <li>删除 1 条线路记录</li>
                {pendingLineDelete.impact.removedStationCount > 0 && <li>删除 {pendingLineDelete.impact.removedStationCount} 条站点记录</li>}
                {pendingLineDelete.impact.removedTransferCount > 0 && <li>删除 {pendingLineDelete.impact.removedTransferCount} 条换乘记录</li>}
                {pendingLineDelete.unlinkedWiringCount > 0 && <li>将 {pendingLineDelete.unlinkedWiringCount} 个配线图关联元件恢复为“未分配”状态</li>}
              </ul>
              <p className="confirm-note">配线图中的站台、轨道、道岔、连接、标签、图标与手动布局都不会被删除。删除后可通过“撤销修改”或工程历史恢复。</p>
              {pendingLineDelete.hasWiringAssociation && (
                <div className="warning-box">该线路已用于配线图。删除后相关元件会保留，但不再与线路站点数据同步。</div>
              )}
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setPendingLineDelete(null)}>取消</button>
              <button className="danger-button" onClick={confirmDeleteLine}>删除线路</button>
            </div>
          </section>
        </div>
      )}

      {showAudit && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowAudit(false)}>
          <section className="editor-modal audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-title">
            <div className="modal-heading">
              <div><p className="eyebrow">自动核对</p><h2 id="audit-title">站点列表检查</h2></div>
              <button className="close-button" onClick={() => setShowAudit(false)}>×</button>
            </div>
            <div className="modal-scroll-body">
            <div className="audit-summary">
              <span><b>{auditIssues.length}</b> 个待核对项</span>
              <span>错误 {auditIssues.filter((issue) => issue.severity === "错误").length}</span>
              <span>提醒 {auditIssues.filter((issue) => issue.severity === "提醒").length}</span>
            </div>
            <p className="audit-help">检查同名站漏标换乘、单向换乘、英文缺失/不一致、常见 OCR 混淆、重复代号与顺序。R1按7/9号组合环线处理，同一站只需标记一次。自动结果用于提示，仍建议结合原图确认。</p>
            <div className="audit-list">
              {auditIssues.map((issue) => (
                <button key={issue.id} className={`audit-item ${issue.severity === "错误" ? "is-error" : "is-warning"}`} onClick={() => openAuditIssue(issue)} disabled={!issue.stationId}>
                  <span className="audit-tags"><i>{issue.severity}</i><em>{issue.category}</em></span>
                  <span><b>{issue.title}</b><small>{issue.detail}</small></span>
                  {issue.stationId && <strong>打开站点</strong>}
                </button>
              ))}
              {!auditIssues.length && <div className="audit-empty"><b>检查完成，暂未发现问题</b><span>后续编辑站点或换乘后，再次打开会自动重新计算。</span></div>}
            </div>
            </div>
          </section>
        </div>
      )}

      {showStats && openingStats && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowStats(false)}>
          <section className="editor-modal stats-modal" role="dialog" aria-modal="true" aria-labelledby="stats-title">
            <div className="modal-heading">
              <div><p className="eyebrow">按线路站点状态计算</p><h2 id="stats-title">开通统计</h2></div>
              <button className="close-button" onClick={() => setShowStats(false)}>×</button>
            </div>
            <div className="modal-scroll-body">
            <div className="stats-grid">
              <div><b>{openingStats.openLineCount}</b><span>已开通线路</span><small>共 {openingStats.totalLineCount} 条</small></div>
              <div><b>{openingStats.openPhysicalStationCount}</b><span>已开通站点</span><small>同名站合并</small></div>
              <div><b>{openingStats.openTransferStationCount}</b><span>已开通换乘站</span><small>至少两条线路均开通</small></div>
              <div><b>{openingStats.openLineStationCount}</b><span>已开通线站记录</span><small>逐线路分别统计</small></div>
            </div>
            <p className="stats-help">同名站在不同线路上的开通状态相互独立；只有至少一站开通的线路才计为已开通线路。换乘站需同名站中至少两条线路记录均已开通。</p>
            <div className="line-stats-list">
              {openingStats.lines.map(({ line: statsLine, isOpen, openStations, closedStations }) => (
                <article key={statsLine.id} className="line-stats-card">
                  <header>
                    <span className="color-chip" style={{ backgroundColor: statsLine.lineColor }} />
                    <b>{statsLine.nameZh}</b>
                    <code>{statsLine.code}</code>
                    <i className={isOpen ? "is-open" : "is-closed"}>{isOpen ? "已开通" : "未开通"}</i>
                    <small>{openStations.length} 开通 / {closedStations.length} 未开通</small>
                  </header>
                  <div className="station-status-row"><strong>已开通</strong><span>{openStations.length ? openStations.map((station) => <em key={station.id}>{station.nameZh}</em>) : <i>无</i>}</span></div>
                  <div className="station-status-row is-closed"><strong>未开通</strong><span>{closedStations.length ? closedStations.map((station) => <em key={station.id}>{station.nameZh}</em>) : <i>无</i>}</span></div>
                </article>
              ))}
            </div>
            </div>
          </section>
        </div>
      )}

      {showHistory && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowHistory(false)}>
          <section className="editor-modal history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
            <div className="modal-heading"><div><p className="eyebrow">保存记录</p><h2 id="history-title">历史版本</h2></div><button className="close-button" onClick={() => setShowHistory(false)}>×</button></div>
            <div className="modal-scroll-body">
            <p className="history-help">每次点击“保存 CSV”后记录一个数据版本。恢复时只替换线路、站点和换乘 CSV，不改变显示设置；未保存修改在关闭或刷新网页时会触发浏览器确认。</p>
            <div className="revision-list">
              {revisions.map((revision) => (
                <button key={revision.id} className={`revision-${revision.kind || "legacy"}`} onClick={() => void restoreRevision(revision)}>
                  <span><strong className="revision-kind">{revisionKindLabel(revision)}</strong>{new Date(revision.createdAt).toLocaleString("zh-CN")}</span><code>{revision.id}</code><b>恢复</b>
                </button>
              ))}
              {!revisions.length && <div className="empty-table">保存过一次后，这里会出现历史版本。</div>}
            </div>
            </div>
          </section>
        </div>
      )}

      {showCsvImport && csvImportPreview && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && cancelCsvImport()}>
          <section className="editor-modal csv-import-modal" role="dialog" aria-modal="true" aria-labelledby="csv-import-title">
            <div className="modal-heading">
              <div><p className="eyebrow">预览与校验</p><h2 id="csv-import-title">导入 CSV 预览</h2></div>
              <button className="close-button" onClick={cancelCsvImport}>×</button>
            </div>
            <div className="modal-scroll-body">
              <div className="csv-import-files">
                {csvImportPreview.files.map((file) => (
                  <span key={file.type} className="csv-file-tag">
                    <b>{file.name}</b>
                    <small>{file.rowCount} 行</small>
                  </span>
                ))}
                {csvImportPreview.missingTypes.map((type) => (
                  <span key={type} className="csv-file-tag missing">
                    <b>{type === "lines" ? "lines.csv" : type === "stations" ? "stations.csv" : "transfers.csv"}</b>
                    <small>未导入，保留当前</small>
                  </span>
                ))}
              </div>

              <div className="csv-import-diff">
                <div className="diff-stat"><b className="diff-add">+{csvImportPreview.diff.addedLines}</b><span>新增线路</span></div>
                <div className="diff-stat"><b className="diff-remove">-{csvImportPreview.diff.removedLines}</b><span>删除线路</span></div>
                <div className="diff-stat"><b className="diff-add">+{csvImportPreview.diff.addedStations}</b><span>新增站点</span></div>
                <div className="diff-stat"><b className="diff-remove">-{csvImportPreview.diff.removedStations}</b><span>删除站点</span></div>
                <div className="diff-stat"><b className="diff-add">+{csvImportPreview.diff.addedTransfers}</b><span>新增换乘</span></div>
                <div className="diff-stat"><b className="diff-remove">-{csvImportPreview.diff.removedTransfers}</b><span>删除换乘</span></div>
              </div>

              {csvImportPreview.issues.length > 0 && (
                <>
                  <div className="csv-import-issues-heading">
                    校验发现 {csvImportPreview.issues.length} 个问题
                    {csvImportPreview.issues.filter((i) => i.severity === "错误").length > 0 && (
                      <span className="issues-error-count">
                        {csvImportPreview.issues.filter((i) => i.severity === "错误").length} 个错误需修正后才能导入
                      </span>
                    )}
                  </div>
                  <div className="csv-import-issues">
                    {csvImportPreview.issues.map((issue, index) => (
                      <div key={index} className={`csv-import-issue ${issue.severity === "错误" ? "is-error" : "is-warning"}`}>
                        <i>{issue.severity}</i>
                        <em>{issue.category}</em>
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {csvImportPreview.issues.length === 0 && (
                <div className="csv-import-ok">校验通过，未发现问题</div>
              )}

              <details className="csv-import-preview-data">
                <summary>预览数据（{csvImportPreview.lines.length} 线路 / {csvImportPreview.stations.length} 站点 / {csvImportPreview.transfers.length} 换乘）</summary>
                <div className="csv-import-tables">
                  <div>
                    <h4>线路</h4>
                    <div className="table-scroll csv-mini-table">
                      <table>
                        <thead><tr><th>ID</th><th>名称</th><th>代号</th><th>颜色</th></tr></thead>
                        <tbody>
                          {csvImportPreview.lines.slice(0, 20).map((line) => (
                            <tr key={line.id}>
                              <td><code>{line.id}</code></td>
                              <td>{line.nameZh}</td>
                              <td>{line.code}</td>
                              <td><span className="color-chip" style={{ backgroundColor: line.lineColor }} /></td>
                            </tr>
                          ))}
                          {csvImportPreview.lines.length > 20 && (
                            <tr><td colSpan={4} className="muted">…还有 {csvImportPreview.lines.length - 20} 条线路</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <h4>站点（前 20）</h4>
                    <div className="table-scroll csv-mini-table">
                      <table>
                        <thead><tr><th>线路</th><th>顺序</th><th>站名</th><th>代号</th></tr></thead>
                        <tbody>
                          {csvImportPreview.stations.slice(0, 20).map((station) => (
                            <tr key={station.id}>
                              <td><code>{station.lineId}</code></td>
                              <td>{station.sequence}</td>
                              <td>{station.nameZh}</td>
                              <td>{station.code}</td>
                            </tr>
                          ))}
                          {csvImportPreview.stations.length > 20 && (
                            <tr><td colSpan={4} className="muted">…还有 {csvImportPreview.stations.length - 20} 个站点</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </details>
            </div>
            <div className="modal-actions csv-import-actions">
              <button className="secondary-button" onClick={cancelCsvImport}>取消</button>
              <button
                className="primary-button"
                onClick={confirmCsvImport}
                disabled={hasBlockingIssues(csvImportPreview.issues)}
              >
                {hasBlockingIssues(csvImportPreview.issues) ? "存在错误，无法导入" : "确认导入"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
