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
  defaultLayoutForTemplate,
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
import RoutePreviewSvg, {
  DirectionPreviewSvg,
  LineBadgePreviewSvg,
  StationPreviewSvg,
  TextCardPreviewSvg,
} from "./RoutePreviewSvg";
import ScenicRoutePreviewSvg, {
  ScenicDirectionPreviewSvg,
  ScenicLineBadgePreviewSvg,
  ScenicStationPreviewSvg,
  ScenicTextCardPreviewSvg,
} from "./styles/scenic/ScenicRoutePreviewSvg";
import SliceGuideOverlay from "./SliceGuideOverlay";
import {
  createProjectRepository,
  DEFAULT_PROJECT_ID,
  type ProjectRepository,
} from "../projects/repositories";
import "./transit.css";

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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <label className="color-field">
      <span>{label}</span>
      <span className="color-controls">
        <input
          aria-label={`${label}取色器`}
          type="color"
          value={safe}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <input
          aria-label={`${label}十六进制颜色`}
          className="hex-input"
          value={value}
          maxLength={9}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          placeholder="#12AEFF"
        />
      </span>
    </label>
  );
}

function NumberSetting({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-setting">
      <span><b>{label}</b><output>{value}px</output></span>
      <span className="number-setting-controls">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      </span>
    </label>
  );
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
}

export default function TransitMapApp({ projectId = DEFAULT_PROJECT_ID, repository }: TransitMapAppProps) {
  const projectRepository = useMemo(
    () => repository || createProjectRepository({ storageMode: "http" }),
    [repository],
  );
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

  const saveCsv = useCallback(async () => {
    if (!data) return;
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CSV 保存失败");
      setStatus("CSV 保存失败");
    }
  }, [data, projectId, projectRepository]);

  const saveLayout = useCallback(async () => {
    if (!data) return;
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "显示设置保存失败");
      setStatus("显示设置保存失败");
    }
  }, [data, projectId, projectRepository]);

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

  function removeStation(station: Station) {
    if (!data || !window.confirm(`确认删除“${station.nameZh}”吗？`)) return;
    commit({
      ...data,
      stations: data.stations.filter((item) => item.id !== station.id),
      transfers: data.transfers.filter((transfer) => transfer.stationId !== station.id),
    });
    setEditingStationId(null);
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
          <span className="brand-mark"><img src="/assets/rail-transit-icon.png" alt="" /></span>
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
          <span className="brand-mark"><img src="/assets/rail-transit-icon.png" alt="" /></span>
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
                    <td><button className="table-edit" onClick={() => setEditingLineId(candidate.id)}>编辑</button></td>
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
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowSettings(false)}>
          <section
            className="editor-modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onFocusCapture={handleInteractionFocus}
            onBlurCapture={handleInteractionBlur}
            onPointerDownCapture={handleInteractionPointerDown}
            onPointerUpCapture={handleInteractionPointerUp}
            onPointerCancelCapture={handleInteractionPointerUp}
            onKeyDownCapture={handleInteractionKeyDown}
            onKeyUpCapture={handleInteractionKeyUp}
          >
            <div className="modal-heading">
              <div><p className="eyebrow">预览与导出共用</p><h2 id="settings-title">显示设置</h2></div>
              <button className="close-button" onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div className="style-template-tabs" role="tablist" aria-label="选择站序图样式模板">
              {([
                ["classic", "经典样式", "当前站序图样式"],
                ["loop", "环线样式", "半圆弧线站序图"],
                ["scenic", "景区样式", "景区导览专用布局"],
                ["pulse", "城市脉冲", "深色高对比信息带"],
              ] as const).map(([template, label, description]) => (
                <button
                  key={template}
                  type="button"
                  role="tab"
                  id={`style-template-tab-${template}`}
                  aria-controls={`style-template-panel-${template}`}
                  aria-selected={data.activeStyleTemplate === template}
                  tabIndex={data.activeStyleTemplate === template ? 0 : -1}
                  className={data.activeStyleTemplate === template ? "active" : ""}
                  onClick={() => selectStyleTemplate(template)}
                >
                  <span className={`style-template-icon ${template}`}><i /></span>
                  <span><b>{label}</b><small>{description}</small></span>
                  <em>{data.activeStyleTemplate === template ? "当前" : "可用"}</em>
                </button>
              ))}
            </div>
            {line && <p className="settings-help style-binding-note">当前样式绑定至线路：<b>{line.nameZh}</b>。切换预览线路后会自动使用该线路已保存的样式。</p>}
            <div
              id={`style-template-panel-${data.activeStyleTemplate}`}
              className="settings-workspace"
              role="tabpanel"
              aria-labelledby={`style-template-tab-${data.activeStyleTemplate}`}
            >
              <div className="settings-body">
              {data.activeStyleTemplate === "loop" && (
                <section className="settings-section">
                  <h3>环线弧形布局</h3>
                  <p className="settings-help position-settings-help">站点沿浅半圆弧排列；最左侧输出环线运行组件，最右侧输出当前线路标识。当前站会显示运行方向小箭头。</p>
                  <div className="settings-grid">
                    <NumberSetting label="圆弧起伏" value={data.layout.loopArcDepth} min={0} max={30} step={0.5} onChange={(value) => updateLayout({ loopArcDepth: value })} />
                    <NumberSetting label="底部色条高度" value={data.layout.loopBottomBarHeight} min={4} max={28} step={0.5} onChange={(value) => updateLayout({ loopBottomBarHeight: value })} />
                    <NumberSetting label="方向箭头大小" value={data.layout.loopDirectionMarkerSize} min={4} max={16} step={0.5} onChange={(value) => updateLayout({ loopDirectionMarkerSize: value })} />
                    <NumberSetting label="方向箭头上下间距" value={data.layout.loopDirectionMarkerOffset} min={0} max={20} step={0.5} onChange={(value) => updateLayout({ loopDirectionMarkerOffset: value })} />
                    <NumberSetting label="中文距圆心" value={data.layout.loopStationZhOffset} min={24} max={60} step={0.5} onChange={(value) => updateLayout({ loopStationZhOffset: value })} />
                    <NumberSetting label="英文距圆心" value={data.layout.loopStationEnOffset} min={12} max={44} step={0.5} onChange={(value) => updateLayout({ loopStationEnOffset: value })} />
                  </div>
                </section>
              )}
              {data.activeStyleTemplate === "pulse" && (
                <section className="settings-section pulse-style-settings">
                  <h3>城市脉冲视觉</h3>
                  <p className="settings-help position-settings-help">深色底板搭配双层发光轨道、胶囊站点和顶部序号带；本站、换乘、方向及线路标识均使用同一套高对比信息层级。</p>
                  <div className="settings-grid">
                    <NumberSetting label="轨道底层宽度" value={data.layout.pulseGlowWidth} min={6} max={24} step={0.5} onChange={(value) => updateLayout({ pulseGlowWidth: value })} />
                    <NumberSetting label="胶囊站点宽度" value={data.layout.pulseNodeWidth} min={18} max={52} step={0.5} onChange={(value) => updateLayout({ pulseNodeWidth: value })} />
                    <NumberSetting label="胶囊站点高度" value={data.layout.pulseNodeHeight} min={10} max={34} step={0.5} onChange={(value) => updateLayout({ pulseNodeHeight: value })} />
                    <NumberSetting label="胶囊圆角" value={data.layout.pulseNodeRadius} min={0} max={18} step={0.5} onChange={(value) => updateLayout({ pulseNodeRadius: value })} />
                    <NumberSetting label="本站光环大小" value={data.layout.pulseCurrentHaloSize} min={0} max={14} step={0.5} onChange={(value) => updateLayout({ pulseCurrentHaloSize: value })} />
                    <NumberSetting label="顶部信息带高度" value={data.layout.pulseHeaderHeight} min={12} max={34} step={0.5} onChange={(value) => updateLayout({ pulseHeaderHeight: value })} />
                    <NumberSetting label="换乘胶囊高度" value={data.layout.pulseTransferBadgeHeight} min={10} max={24} step={0.5} onChange={(value) => updateLayout({ pulseTransferBadgeHeight: value })} />
                    <NumberSetting label="换乘胶囊间距" value={data.layout.pulseTransferBadgeGap} min={0} max={10} step={0.5} onChange={(value) => updateLayout({ pulseTransferBadgeGap: value })} />
                    <NumberSetting label="中文站名 Y" value={data.layout.pulseStationZhY} min={70} max={112} step={0.5} onChange={(value) => updateLayout({ pulseStationZhY: value })} />
                    <NumberSetting label="英文站名 Y" value={data.layout.pulseStationEnY} min={82} max={122} step={0.5} onChange={(value) => updateLayout({ pulseStationEnY: value })} />
                  </div>
                  <div className="color-grid pulse-color-grid">
                    <ColorField label="信息面板颜色" value={data.layout.pulsePanelColor} onChange={(value) => updateLayout({ pulsePanelColor: value })} />
                    <ColorField label="轨道底层颜色" value={data.layout.pulseTrackColor} onChange={(value) => updateLayout({ pulseTrackColor: value })} />
                  </div>
                  <label className="settings-checkbox-row">
                    <input type="checkbox" checked={data.layout.pulseShowSequence} onChange={(event) => updateLayout({ pulseShowSequence: event.target.checked })} />
                    <span><b>显示顶部站点序号</b><small>关闭后保留顶部信息带，但不绘制站点编号。</small></span>
                  </label>
                </section>
              )}
              <section className="settings-section position-settings-section">
                <h3>独立组件精确位置</h3>
                <p className="settings-help position-settings-help">先在右侧选择本站、下一站、运行方向或线路标识。X/Y 使用 128×128 矢量坐标；也可以直接拖动预览中的色条、文字、箭头和标识。</p>
                {settingsPreviewMode === "current" && (
                  <>
                    <h4>本站红色条</h4>
                    <div className="settings-grid">
                      <NumberSetting label="红条 X" value={data.layout.currentAccentX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentAccentX: value })} />
                      <NumberSetting label="红条 Y" value={data.layout.currentAccentY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentAccentY: value })} />
                      <NumberSetting label="红条宽度" value={data.layout.currentAccentWidth} min={1} max={128} step={0.5} onChange={(value) => updateLayout({ currentAccentWidth: value })} />
                      <NumberSetting label="红条高度" value={data.layout.currentAccentHeight} min={1} max={128} step={0.5} onChange={(value) => updateLayout({ currentAccentHeight: value })} />
                    </div>
                    <h4>本站文字</h4>
                    <div className="settings-grid">
                      <NumberSetting label="“本站:”文字 X" value={data.layout.currentLabelX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentLabelX: value })} />
                      <NumberSetting label="“本站:”文字 Y" value={data.layout.currentLabelY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentLabelY: value })} />
                      <NumberSetting label="当前站名称 X" value={data.layout.currentStationX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentStationX: value })} />
                      <NumberSetting label="当前站名称 Y" value={data.layout.currentStationY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ currentStationY: value })} />
                    </div>
                    <button className="position-reset-button" onClick={() => {
                      const defaults = defaultLayoutForTemplate(data.activeStyleTemplate);
                      updateLayout({ currentAccentX: defaults.currentAccentX, currentAccentY: defaults.currentAccentY, currentAccentWidth: defaults.currentAccentWidth, currentAccentHeight: defaults.currentAccentHeight, currentLabelX: defaults.currentLabelX, currentLabelY: defaults.currentLabelY, currentStationX: defaults.currentStationX, currentStationY: defaults.currentStationY });
                    }}>恢复本站默认位置</button>
                  </>
                )}
                {settingsPreviewMode === "next" && (
                  <>
                    <h4>下一站色条</h4>
                    <div className="settings-grid">
                      <NumberSetting label="色条 X" value={data.layout.nextAccentX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextAccentX: value })} />
                      <NumberSetting label="色条 Y" value={data.layout.nextAccentY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextAccentY: value })} />
                      <NumberSetting label="色条宽度" value={data.layout.nextAccentWidth} min={1} max={128} step={0.5} onChange={(value) => updateLayout({ nextAccentWidth: value })} />
                      <NumberSetting label="色条高度" value={data.layout.nextAccentHeight} min={1} max={128} step={0.5} onChange={(value) => updateLayout({ nextAccentHeight: value })} />
                    </div>
                    <h4>下一站文字</h4>
                    <div className="settings-grid">
                      <NumberSetting label="“下一站:”文字 X" value={data.layout.nextLabelX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextLabelX: value })} />
                      <NumberSetting label="“下一站:”文字 Y" value={data.layout.nextLabelY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextLabelY: value })} />
                      <NumberSetting label="下一站名称 X" value={data.layout.nextStationX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextStationX: value })} />
                      <NumberSetting label="下一站名称 Y" value={data.layout.nextStationY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ nextStationY: value })} />
                    </div>
                    <button className="position-reset-button" onClick={() => {
                      const defaults = defaultLayoutForTemplate(data.activeStyleTemplate);
                      updateLayout({ nextAccentX: defaults.nextAccentX, nextAccentY: defaults.nextAccentY, nextAccentWidth: defaults.nextAccentWidth, nextAccentHeight: defaults.nextAccentHeight, nextLabelX: defaults.nextLabelX, nextLabelY: defaults.nextLabelY, nextStationX: defaults.nextStationX, nextStationY: defaults.nextStationY });
                    }}>恢复下一站默认位置</button>
                  </>
                )}
                {settingsPreviewMode === "direction" && (
                  data.activeStyleTemplate === "loop" ? (
                    <>
                      <h4>环线运行组件</h4>
                      <p className="settings-help position-settings-help">环线运行组件不使用经典样式的左右箭头和终点站名称；胶囊、线路名、环线图标及“内环/外环运行”文字均独立设置。</p>
                      <div className="settings-grid">
                        <NumberSetting label="线路胶囊中心 X" value={data.layout.loopDirectionBadgeX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeX: value })} />
                        <NumberSetting label="线路胶囊顶部 Y" value={data.layout.loopDirectionBadgeY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeY: value })} />
                        <NumberSetting label="线路胶囊宽度" value={data.layout.loopDirectionBadgeWidth} min={24} max={120} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeWidth: value })} />
                        <NumberSetting label="线路胶囊高度" value={data.layout.loopDirectionBadgeHeight} min={10} max={36} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeHeight: value })} />
                        <NumberSetting label="线路胶囊圆角" value={data.layout.loopDirectionBadgeRadius} min={0} max={18} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeRadius: value })} />
                        <NumberSetting label="胶囊文字字号" value={data.layout.loopDirectionBadgeFontSize} min={5} max={18} step={0.5} onChange={(value) => updateLayout({ loopDirectionBadgeFontSize: value })} />
                        <NumberSetting label="线路名称 X" value={data.layout.loopDirectionLineNameX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionLineNameX: value })} />
                        <NumberSetting label="线路名称 Y" value={data.layout.loopDirectionLineNameY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionLineNameY: value })} />
                        <NumberSetting label="线路名称字号" value={data.layout.loopDirectionLineNameFontSize} min={6} max={24} step={0.5} onChange={(value) => updateLayout({ loopDirectionLineNameFontSize: value })} />
                        <NumberSetting label="环线图标中心 X" value={data.layout.loopDirectionIconX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionIconX: value })} />
                        <NumberSetting label="环线图标顶部 Y" value={data.layout.loopDirectionIconY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionIconY: value })} />
                        <NumberSetting label="环线图标大小" value={data.layout.loopDirectionIconSize} min={18} max={88} step={0.5} onChange={(value) => updateLayout({ loopDirectionIconSize: value })} />
                        <NumberSetting label="“内环/外环”文字 X" value={data.layout.loopDirectionLoopTextX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionLoopTextX: value })} />
                        <NumberSetting label="“内环/外环”文字 Y" value={data.layout.loopDirectionLoopTextY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionLoopTextY: value })} />
                        <NumberSetting label="“内环/外环”文字字号" value={data.layout.loopDirectionLoopTextFontSize} min={6} max={24} step={0.5} onChange={(value) => updateLayout({ loopDirectionLoopTextFontSize: value })} />
                        <NumberSetting label="“运行”文字 X" value={data.layout.loopDirectionRunTextX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionRunTextX: value })} />
                        <NumberSetting label="“运行”文字 Y" value={data.layout.loopDirectionRunTextY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ loopDirectionRunTextY: value })} />
                        <NumberSetting label="“运行”文字字号" value={data.layout.loopDirectionRunTextFontSize} min={6} max={24} step={0.5} onChange={(value) => updateLayout({ loopDirectionRunTextFontSize: value })} />
                      </div>
                      <button className="position-reset-button" onClick={() => {
                        const defaults = defaultLayoutForTemplate("loop");
                        updateLayout({
                          loopDirectionBadgeX: defaults.loopDirectionBadgeX,
                          loopDirectionBadgeY: defaults.loopDirectionBadgeY,
                          loopDirectionBadgeWidth: defaults.loopDirectionBadgeWidth,
                          loopDirectionBadgeHeight: defaults.loopDirectionBadgeHeight,
                          loopDirectionBadgeRadius: defaults.loopDirectionBadgeRadius,
                          loopDirectionBadgeFontSize: defaults.loopDirectionBadgeFontSize,
                          loopDirectionLineNameX: defaults.loopDirectionLineNameX,
                          loopDirectionLineNameY: defaults.loopDirectionLineNameY,
                          loopDirectionLineNameFontSize: defaults.loopDirectionLineNameFontSize,
                          loopDirectionIconX: defaults.loopDirectionIconX,
                          loopDirectionIconY: defaults.loopDirectionIconY,
                          loopDirectionIconSize: defaults.loopDirectionIconSize,
                          loopDirectionLoopTextX: defaults.loopDirectionLoopTextX,
                          loopDirectionLoopTextY: defaults.loopDirectionLoopTextY,
                          loopDirectionLoopTextFontSize: defaults.loopDirectionLoopTextFontSize,
                          loopDirectionRunTextX: defaults.loopDirectionRunTextX,
                          loopDirectionRunTextY: defaults.loopDirectionRunTextY,
                          loopDirectionRunTextFontSize: defaults.loopDirectionRunTextFontSize,
                        });
                      }}>恢复环线运行组件默认参数</button>
                    </>
                  ) : (
                    <>
                      <h4>箭头与文字位置</h4>
                      <div className="settings-grid">
                        <NumberSetting label="箭头 X（反向自动镜像）" value={data.layout.directionArrowX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionArrowX: value })} />
                        <NumberSetting label="箭头 Y" value={data.layout.directionArrowY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionArrowY: value })} />
                        <NumberSetting label="“运行方向:”文字 X" value={data.layout.directionLabelX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionLabelX: value })} />
                        <NumberSetting label="“运行方向:”文字 Y" value={data.layout.directionLabelY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionLabelY: value })} />
                        <NumberSetting label="终点站名称 X" value={data.layout.directionStationX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionStationX: value })} />
                        <NumberSetting label="终点站名称 Y" value={data.layout.directionStationY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ directionStationY: value })} />
                      </div>
                      {data.activeStyleTemplate === "scenic" && (
                        <>
                          <h4>景区方向横条</h4>
                          <div className="settings-grid">
                            <NumberSetting label="方向横条高度" value={data.layout.scenicDirectionBarHeight} min={2} max={18} step={0.5} onChange={(value) => updateLayout({ scenicDirectionBarHeight: value })} />
                            <NumberSetting label="方向横条 Y" value={data.layout.scenicDirectionBarY} min={20} max={90} step={0.5} onChange={(value) => updateLayout({ scenicDirectionBarY: value })} />
                          </div>
                        </>
                      )}
                      <button className="position-reset-button" onClick={() => {
                        const defaults = defaultLayoutForTemplate(data.activeStyleTemplate);
                        updateLayout({
                          directionArrowX: defaults.directionArrowX,
                          directionArrowY: defaults.directionArrowY,
                          directionLabelX: defaults.directionLabelX,
                          directionLabelY: defaults.directionLabelY,
                          directionStationX: defaults.directionStationX,
                          directionStationY: defaults.directionStationY,
                          ...(data.activeStyleTemplate === "scenic" ? {
                            scenicDirectionBarHeight: defaults.scenicDirectionBarHeight,
                            scenicDirectionBarY: defaults.scenicDirectionBarY,
                          } : {}),
                        });
                      }}>恢复运行方向默认位置</button>
                    </>
                  )
                )}
                {settingsPreviewMode === "badge" && (
                  <>
                    <h4>标识框与文字位置</h4>
                    <div className="settings-grid">
                      <NumberSetting label="标识框中心 X" value={data.layout.lineBadgeX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeX: value })} />
                      <NumberSetting label="标识框顶部 Y" value={data.layout.lineBadgeY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeY: value })} />
                      <NumberSetting label="线路编号 X" value={data.layout.lineBadgeNumberX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeNumberX: value })} />
                      <NumberSetting label="线路编号 Y" value={data.layout.lineBadgeNumberY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeNumberY: value })} />
                      <NumberSetting label="线路英文 X" value={data.layout.lineBadgeEnglishX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeEnglishX: value })} />
                      <NumberSetting label="线路英文 Y" value={data.layout.lineBadgeEnglishY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeEnglishY: value })} />
                      <NumberSetting label="线路说明 X" value={data.layout.lineBadgeDescriptionX} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeDescriptionX: value })} />
                      <NumberSetting label="线路说明 Y" value={data.layout.lineBadgeDescriptionY} min={-32} max={160} step={0.5} onChange={(value) => updateLayout({ lineBadgeDescriptionY: value })} />
                    </div>
                    <button className="position-reset-button" onClick={() => {
                      const defaults = defaultLayoutForTemplate(data.activeStyleTemplate);
                      updateLayout({ lineBadgeX: defaults.lineBadgeX, lineBadgeY: defaults.lineBadgeY, lineBadgeNumberX: defaults.lineBadgeNumberX, lineBadgeNumberY: defaults.lineBadgeNumberY, lineBadgeEnglishX: defaults.lineBadgeEnglishX, lineBadgeEnglishY: defaults.lineBadgeEnglishY, lineBadgeDescriptionX: defaults.lineBadgeDescriptionX, lineBadgeDescriptionY: defaults.lineBadgeDescriptionY });
                    }}>恢复线路标识默认位置</button>
                  </>
                )}
                {settingsPreviewMode === "station" && <div className="position-settings-empty">{data.activeStyleTemplate === "scenic" ? "景区站点沿用下方“景区站点与横条”“换乘箭头”和“文字”设置；切换到其他预览可调整独立组件坐标。" : "线路站点沿用下方“站点与横条”“换乘箭头”和“文字”设置；切换到其他预览可调整独立组件坐标。"}</div>}
              </section>
              <section className="settings-section">
                <h3>{data.activeStyleTemplate === "scenic" ? "景区站点与横条" : "站点与横条"}</h3>
                {data.activeStyleTemplate === "scenic" ? (
                  <>
                    <p className="settings-help">景区样式使用圆角矩形站点，中间填充图标；横条为主题色贯穿的细横线。</p>
                    <div className="settings-grid">
                      <NumberSetting label="矩形宽度" value={data.layout.scenicStationRectWidth} min={16} max={100} step={0.5} onChange={(value) => updateLayout({ scenicStationRectWidth: value })} />
                      <NumberSetting label="矩形高度" value={data.layout.scenicStationRectHeight} min={16} max={80} step={0.5} onChange={(value) => updateLayout({ scenicStationRectHeight: value })} />
                      <NumberSetting label="矩形圆角" value={data.layout.scenicStationRectRadius} min={0} max={16} step={0.5} onChange={(value) => updateLayout({ scenicStationRectRadius: value })} />
                      <NumberSetting label="矩形边框粗细" value={data.layout.scenicStationRectBorderWidth} min={1} max={6} step={0.5} onChange={(value) => updateLayout({ scenicStationRectBorderWidth: value })} />
                      <NumberSetting label="图标大小" value={data.layout.scenicStationIconSize} min={8} max={64} step={0.5} onChange={(value) => updateLayout({ scenicStationIconSize: value })} />
                      <NumberSetting label="图标内边距" value={data.layout.scenicStationIconPadding} min={0} max={10} step={0.5} onChange={(value) => updateLayout({ scenicStationIconPadding: value })} />
                      <NumberSetting label="中文站名 Y" value={data.layout.scenicStationZhY} min={0} max={120} step={0.5} onChange={(value) => updateLayout({ scenicStationZhY: value })} />
                      <NumberSetting label="英文站名 Y" value={data.layout.scenicStationEnY} min={0} max={120} step={0.5} onChange={(value) => updateLayout({ scenicStationEnY: value })} />
                      <NumberSetting label="横条高度" value={data.layout.scenicBarHeight} min={2} max={18} step={0.5} onChange={(value) => updateLayout({ scenicBarHeight: value })} />
                      <NumberSetting label="横条 Y" value={data.layout.scenicBarY} min={20} max={90} step={0.5} onChange={(value) => updateLayout({ scenicBarY: value })} />
                    </div>
                    <button className="position-reset-button" onClick={() => {
                      const defaults = defaultLayoutForTemplate("scenic");
                      updateLayout({
                        scenicStationRectWidth: defaults.scenicStationRectWidth,
                        scenicStationRectHeight: defaults.scenicStationRectHeight,
                        scenicStationRectRadius: defaults.scenicStationRectRadius,
                        scenicStationRectBorderWidth: defaults.scenicStationRectBorderWidth,
                        scenicStationIconSize: defaults.scenicStationIconSize,
                        scenicStationIconPadding: defaults.scenicStationIconPadding,
                        scenicStationZhY: defaults.scenicStationZhY,
                        scenicStationEnY: defaults.scenicStationEnY,
                        scenicBarHeight: defaults.scenicBarHeight,
                        scenicBarY: defaults.scenicBarY,
                      });
                    }}>恢复景区站点默认参数</button>
                  </>
                ) : (
                  <>
                    <div className="settings-grid">
                      <NumberSetting label="圆环大小" value={data.layout.stationRadius} min={8} max={22} onChange={(value) => updateLayout({ stationRadius: value })} />
                      <NumberSetting label="圆环厚度" value={data.layout.stationRingWidth} min={2} max={9} step={0.5} onChange={(value) => updateLayout({ stationRingWidth: value })} />
                      <NumberSetting label="横条粗细" value={data.layout.lineWidth} min={2} max={14} step={0.5} onChange={(value) => updateLayout({ lineWidth: value })} />
                    </div>
                    <label className="display-toggle">
                      <input type="checkbox" checked={data.layout.showStationCenterCodes} onChange={(event) => updateLayout({ showStationCenterCodes: event.target.checked })} />
                      <span><b>圆环内显示线路代号和站点代号</b><small>按站点代号的分隔符拆分，例如 L4-01 显示为上方 L4、下方 01；已过站自动改为已过站颜色。</small></span>
                    </label>
                    {data.layout.showStationCenterCodes && (
                      <div className="settings-grid station-center-code-settings">
                        <NumberSetting label="线路编号字号" value={data.layout.stationCenterLineFontSize} min={4} max={12} step={0.5} onChange={(value) => updateLayout({ stationCenterLineFontSize: value })} />
                        <NumberSetting label="站序号字号" value={data.layout.stationCenterSequenceFontSize} min={4} max={12} step={0.5} onChange={(value) => updateLayout({ stationCenterSequenceFontSize: value })} />
                        <NumberSetting label="圆环内字符间距" value={data.layout.stationCenterLetterSpacing} min={-1} max={4} step={0.25} onChange={(value) => updateLayout({ stationCenterLetterSpacing: value })} />
                        <NumberSetting label="中间分隔线宽度" value={data.layout.stationCenterDividerWidth} min={5} max={24} step={0.5} onChange={(value) => updateLayout({ stationCenterDividerWidth: value })} />
                      </div>
                    )}
                  </>
                )}
                <label className="display-toggle">
                  <input type="checkbox" checked={data.layout.closedStationsUsePassedColor} onChange={(event) => updateLayout({ closedStationsUsePassedColor: event.target.checked })} />
                  <span><b>未开通站点按已过站配色</b><small>只替换站点、相邻横条及换乘标识的显示颜色；站点状态、位置、文字和导出结构不变。</small></span>
                </label>
              </section>
              {data.activeStyleTemplate === "loop" ? <section className="settings-section">
                <h3>环线换乘标识</h3>
                <p className="settings-help position-settings-help">环线样式使用带白色换乘图标的线路色胶囊，不显示经典样式的向上箭头。</p>
                <div className="settings-grid">
                  <NumberSetting label="换乘胶囊高度" value={data.layout.loopTransferBadgeHeight} min={12} max={24} step={0.5} onChange={(value) => updateLayout({ loopTransferBadgeHeight: value })} />
                  <NumberSetting label="换乘线路字号" value={data.layout.loopTransferBadgeFontSize} min={6} max={13} step={0.5} onChange={(value) => updateLayout({ loopTransferBadgeFontSize: value })} />
                  <NumberSetting label="多个换乘标识间距" value={data.layout.loopTransferBadgeGap} min={0} max={10} step={0.5} onChange={(value) => updateLayout({ loopTransferBadgeGap: value })} />
                </div>
              </section> : <section className="settings-section">
                <h3>换乘箭头</h3>
                <p className="settings-help position-settings-help">{data.activeStyleTemplate === "scenic" ? "景区样式的换乘箭头从矩形站点上缘向上延伸，参数与经典样式独立存储。" : "经典样式使用向上的三角箭头标识换乘线路。"}</p>
                <div className="settings-grid">
                  <NumberSetting label="箭头大小（头部宽度）" value={data.layout.transferArrowHeadWidth} min={10} max={28} step={0.5} onChange={(value) => updateLayout({ transferArrowHeadWidth: value })} />
                  <NumberSetting label="箭头长度" value={data.layout.transferArrowLength} min={14} max={34} step={0.5} onChange={(value) => updateLayout({ transferArrowLength: value })} />
                  <NumberSetting label="箭头粗细（杆宽）" value={data.layout.transferArrowStemWidth} min={3} max={12} step={0.5} onChange={(value) => updateLayout({ transferArrowStemWidth: value })} />
                  <NumberSetting label="电车标识上下偏移" value={data.layout.tramTransferVerticalOffset} min={-16} max={16} step={0.5} onChange={(value) => updateLayout({ tramTransferVerticalOffset: value })} />
                </div>
              </section>}
              <section className="settings-section">
                <h3>文字</h3>
                <div className="settings-grid">
                  <NumberSetting label="中文站名字号" value={data.layout.stationZhFontSize} min={8} max={24} step={0.5} onChange={(value) => updateLayout({ stationZhFontSize: value })} />
                  <NumberSetting label="中文站名字符间距" value={data.layout.stationZhLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ stationZhLetterSpacing: value })} />
                  <NumberSetting label="英文站名字号" value={data.layout.stationEnFontSize} min={5} max={14} step={0.5} onChange={(value) => updateLayout({ stationEnFontSize: value })} />
                  <NumberSetting label="英文站名字符间距" value={data.layout.stationEnLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ stationEnLetterSpacing: value })} />
                  <NumberSetting label="英文自动缩放下限" value={data.layout.stationEnMinFontSize} min={3} max={10} step={0.5} onChange={(value) => updateLayout({ stationEnMinFontSize: value })} />
                  <NumberSetting label="地铁换乘线路字号" value={data.layout.transferFontSize} min={8} max={22} step={0.5} onChange={(value) => updateLayout({ transferFontSize: value })} />
                  <NumberSetting label="地铁换乘字符间距" value={data.layout.transferLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ transferLetterSpacing: value })} />
                  <NumberSetting label="电车换乘字号" value={data.layout.tramTransferFontSize} min={6} max={14} step={0.5} onChange={(value) => updateLayout({ tramTransferFontSize: value })} />
                  <NumberSetting label="电车换乘字符间距" value={data.layout.tramTransferLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ tramTransferLetterSpacing: value })} />
                </div>
                <div className="font-settings">
                  <label><span>中文字体</span><input value={data.layout.fontZh} onChange={(event) => updateLayout({ fontZh: event.target.value })} /></label>
                  <label><span>英文字体</span><input value={data.layout.fontEn} onChange={(event) => updateLayout({ fontEn: event.target.value })} /></label>
                </div>
                <p className="settings-help">中文站名始终保持一行并在过长时缩小；英文站名优先一行，过长时自动排为两行，再按需要缩小字号。</p>
              </section>
              <section className="settings-section">
                <h3>本站与下一站图片</h3>
                <div className="settings-grid">
                  <NumberSetting label="本站/下一站标题字号" value={data.layout.infoLabelFontSize} min={10} max={28} step={0.5} onChange={(value) => updateLayout({ infoLabelFontSize: value })} />
                  <NumberSetting label="标题字符间距" value={data.layout.infoLabelLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ infoLabelLetterSpacing: value })} />
                  <NumberSetting label="站点名称字号" value={data.layout.infoStationFontSize} min={10} max={30} step={0.5} onChange={(value) => updateLayout({ infoStationFontSize: value })} />
                  <NumberSetting label="站点名称字符间距" value={data.layout.infoStationLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ infoStationLetterSpacing: value })} />
                </div>
              </section>
              {data.activeStyleTemplate !== "loop" && <section className="settings-section">
                <h3>运行方向图片</h3>
                <p className="settings-help position-settings-help">{data.activeStyleTemplate === "scenic" ? "景区样式的运行方向使用贯穿画幅的主题色横条，白色箭头位于横条上方。" : "经典样式的运行方向使用线路色箭头指向终点站。"}</p>
                <div className="settings-grid">
                  <NumberSetting label="方向箭头横杆长度" value={data.layout.directionArrowShaftLength} min={28} max={60} step={0.5} onChange={(value) => updateLayout({ directionArrowShaftLength: value })} />
                  <NumberSetting label="方向箭头粗细" value={data.layout.directionArrowThickness} min={6} max={24} step={0.5} onChange={(value) => updateLayout({ directionArrowThickness: value })} />
                  <NumberSetting label="方向箭头头部长度" value={data.layout.directionArrowHeadLength} min={18} max={45} step={0.5} onChange={(value) => updateLayout({ directionArrowHeadLength: value })} />
                  <NumberSetting label="方向箭头头部宽度" value={data.layout.directionArrowHeadWidth} min={25} max={70} step={0.5} onChange={(value) => updateLayout({ directionArrowHeadWidth: value })} />
                  <NumberSetting label="方向箭头轮廓粗细" value={data.layout.directionArrowOutlineWidth} min={0} max={8} step={0.5} onChange={(value) => updateLayout({ directionArrowOutlineWidth: value })} />
                  <NumberSetting label="运行方向标题字号" value={data.layout.directionLabelFontSize} min={8} max={20} step={0.5} onChange={(value) => updateLayout({ directionLabelFontSize: value })} />
                  <NumberSetting label="运行方向标题字符间距" value={data.layout.directionLabelLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ directionLabelLetterSpacing: value })} />
                  <NumberSetting label="终点站名字号" value={data.layout.directionStationFontSize} min={10} max={28} step={0.5} onChange={(value) => updateLayout({ directionStationFontSize: value })} />
                  <NumberSetting label="终点站名字符间距" value={data.layout.directionStationLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ directionStationLetterSpacing: value })} />
                </div>
              </section>}
              <section className="settings-section">
                <h3>线路标识图片</h3>
                <div className="settings-grid">
                  <NumberSetting label="标识宽度" value={data.layout.lineBadgeWidth} min={70} max={118} step={1} onChange={(value) => updateLayout({ lineBadgeWidth: value })} />
                  <NumberSetting label="标识高度" value={data.layout.lineBadgeHeight} min={38} max={72} step={1} onChange={(value) => updateLayout({ lineBadgeHeight: value })} />
                  <NumberSetting label="标识圆角" value={data.layout.lineBadgeRadius} min={2} max={20} step={0.5} onChange={(value) => updateLayout({ lineBadgeRadius: value })} />
                  <NumberSetting label="线路编号字号" value={data.layout.lineBadgeNumberFontSize} min={18} max={36} step={0.5} onChange={(value) => updateLayout({ lineBadgeNumberFontSize: value })} />
                  <NumberSetting label="线路编号字符间距" value={data.layout.lineBadgeNumberLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ lineBadgeNumberLetterSpacing: value })} />
                  <NumberSetting label="线路英文字号" value={data.layout.lineBadgeEnglishFontSize} min={7} max={16} step={0.5} onChange={(value) => updateLayout({ lineBadgeEnglishFontSize: value })} />
                  <NumberSetting label="线路英文字符间距" value={data.layout.lineBadgeEnglishLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ lineBadgeEnglishLetterSpacing: value })} />
                  <NumberSetting label="线路说明字号" value={data.layout.lineBadgeDescriptionFontSize} min={8} max={20} step={0.5} onChange={(value) => updateLayout({ lineBadgeDescriptionFontSize: value })} />
                  <NumberSetting label="线路说明字符间距" value={data.layout.lineBadgeDescriptionLetterSpacing} min={-2} max={8} step={0.25} onChange={(value) => updateLayout({ lineBadgeDescriptionLetterSpacing: value })} />
                </div>
              </section>
              <section className="settings-section compact-settings">
                <h3>其他可调项目</h3>
                <div className="other-settings">
                  <ColorField label="画布背景色" value={data.layout.background} onChange={(value) => updateLayout({ background: value })} />
                  <p>线路颜色、已过/当前/未到站颜色可在线路编辑中设置；单站颜色与单条换乘显示状态可在站点编辑中设置；透明背景、预览缩放和导出分辨率位于预览顶部。</p>
                </div>
              </section>
              </div>
              <aside className="settings-preview-panel" aria-label="显示设置实时预览">
                <div className="settings-preview-heading">
                  <div>
                    <span>实时预览</span>
                    <select aria-label="选择设置预览站点" value={currentIndex} onChange={(event) => setCurrentIndex(Number(event.target.value))} disabled={!stations.length}>
                      {stations.map((station, index) => (
                        <option key={station.id} value={index}>{station.sequence}. {station.nameZh}{data.transfers.some((transfer) => transfer.stationId === station.id && !transfer.hidden) ? " · 换乘站" : ""}</option>
                      ))}
                    </select>
                  </div>
                  <i>{{ station: "线路站点", current: "本站", next: "下一站", direction: "运行方向", badge: "线路标识" }[settingsPreviewMode]}</i>
                </div>
                <div className="settings-preview-tabs" aria-label="选择组件预览">
                  {([
                    ["station", "线路站点"],
                    ["current", "本站"],
                    ["next", "下一站"],
                    ["direction", "运行方向"],
                    ["badge", "线路标识"],
                  ] as const).map(([mode, label]) => (
                    <button key={mode} className={settingsPreviewMode === mode ? "active" : ""} onClick={() => setSettingsPreviewMode(mode)}>{label}</button>
                  ))}
                </div>
                <div className={`settings-preview-stage ${transparent ? "transparent-grid" : ""}`}>
                  {line && currentStation ? (
                    data.activeStyleTemplate === "scenic" ? (
                      settingsPreviewMode === "station" ? (
                        <ScenicStationPreviewSvg data={data} line={line} station={currentStation} direction={visualDirection} transparent={transparent} assetsReady={scenicAssetsReady} />
                      ) : settingsPreviewMode === "current" ? (
                        <ScenicTextCardPreviewSvg data={data} line={line} station={currentStation} kind="current" transparent={transparent} assetsReady={scenicAssetsReady} />
                      ) : settingsPreviewMode === "next" ? (
                        nextStation
                          ? <ScenicTextCardPreviewSvg data={data} line={line} station={nextStation} kind="next" transparent={transparent} assetsReady={scenicAssetsReady} />
                          : <span>当前运行方向已到终点，没有下一站</span>
                      ) : settingsPreviewMode === "direction" ? (
                        <ScenicDirectionPreviewSvg
                          data={data}
                          line={line}
                          station={terminusForDirection(stations, direction)}
                          side={terminusSideFor(direction, platformType)}
                          transparent={transparent}
                          onLayoutChange={updateLayout}
                        />
                      ) : (
                        <ScenicLineBadgePreviewSvg data={data} line={line} transparent={transparent} />
                      )
                    ) : (
                      settingsPreviewMode === "station" ? (
                        <StationPreviewSvg data={data} line={line} station={currentStation} direction={visualDirection} transparent={transparent} />
                      ) : settingsPreviewMode === "current" ? (
                        <TextCardPreviewSvg data={data} line={line} station={currentStation} kind="current" transparent={transparent} onLayoutChange={updateLayout} />
                      ) : settingsPreviewMode === "next" ? (
                        nextStation
                          ? <TextCardPreviewSvg data={data} line={line} station={nextStation} kind="next" transparent={transparent} onLayoutChange={updateLayout} />
                          : <span>当前运行方向已到终点，没有下一站</span>
                      ) : settingsPreviewMode === "direction" ? (
                        <DirectionPreviewSvg
                          data={data}
                          line={line}
                          station={terminusForDirection(stations, direction)}
                          side={terminusSideFor(direction, platformType)}
                          direction={direction}
                          transparent={transparent}
                          onLayoutChange={updateLayout}
                        />
                      ) : (
                        <LineBadgePreviewSvg data={data} line={line} transparent={transparent} onLayoutChange={updateLayout} />
                      )
                    )
                  ) : (
                    <span>当前线路暂无站点</span>
                  )}
                </div>
                <p>可切换查看线路站点、本站、下一站和独立组件；独立组件中的元素可直接拖动，参数修改会即时反映到预览与导出图片。</p>
              </aside>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => updateLayout({ ...defaultLayoutForTemplate(data.activeStyleTemplate) })}>恢复当前模板默认参数</button>
              <div className="toolbar-spacer" />
              <button className="secondary-button" onClick={undo} disabled={!undoStack.length}>撤销修改</button>
              <button className="primary-button" onClick={() => void saveLayout()} disabled={!layoutDirty}>{layoutDirty ? "保存显示设置" : "显示设置已保存"}</button>
              <button className="secondary-button" onClick={() => setShowSettings(false)}>完成</button>
            </div>
          </section>
        </div>
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
              <button className="danger-button" onClick={() => removeStation(editingStation)}>删除站点</button>
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
