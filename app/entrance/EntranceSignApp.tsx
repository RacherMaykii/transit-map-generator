"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cleanFilePart, normalizeTransitData, Station, TransitData, stationsForLine } from "../transit/types";
import { canvasPngBytes, createStoredZip, ZipEntry } from "../transit/zip";
import { downloadBlob } from "../lib/browser";
import SliceGuideOverlay from "../transit/SliceGuideOverlay";
import {
  contrastTextColor,
  ENTRANCE_IMAGE_POLYGON,
  entranceBadgeLayout,
  entranceBackgroundPlacement,
  entranceLineLabel,
  entranceSignLines,
  fittedStationFontSize,
  renderEntranceSignCanvas,
  sliceEntranceSignCanvas,
} from "./renderEntranceSign";
import {
  ENTRANCE_STYLE_TEMPLATES,
  EntranceStyleParams,
  EntranceStyleTemplateId,
  defaultParamsForStyle,
  initStyleStore,
  normalizeStyleStore,
} from "./entranceStyles";
import {
  createProjectRepository,
  DEFAULT_PROJECT_ID,
  type ProjectRepository,
} from "../projects/repositories";
import { BrowserEditorDocumentStore } from "../projects/editorDocumentStore";
import "../transit/transit.css";
import "./entrance.css";
import { siteUrl } from "../site";

const DEFAULT_BACKGROUND = siteUrl("assets/space-elevator-station.jpg");

function displayLineName(line: { kind: string; number: string; nameZh: string }) {
  return `${line.kind === "tram" ? "电车" : "线路"} ${line.number} · ${line.nameZh}`;
}

function stationIconOptions(data: TransitData, station: Station | undefined): string[] {
  if (!station) return [];
  const rows = data.stations.filter((s) => s.nameZh === station.nameZh && s.icon);
  return Array.from(new Set(rows.map((s) => s.icon!)));
}

interface EntranceSignAppProps {
  projectId?: string;
  repository?: ProjectRepository;
}

type EntranceEditorDocument = {
  [key: string]: unknown;
  schemaVersion: 1;
  lineId: string;
  stationId: string;
  nameZh: string;
  nameEn: string;
  exitInfo: string;
  activeStyleId: EntranceStyleTemplateId;
  styleStore: Record<EntranceStyleTemplateId, EntranceStyleParams>;
  backgroundName: string;
  backgroundAspect: number;
  backgroundAssetName: string | null;
  iconOverride: string | null;
};

function normalizeEntranceDocument(source: Record<string, unknown> | null): EntranceEditorDocument | null {
  if (!source) return null;
  const activeStyleId: EntranceStyleTemplateId = source.activeStyleId === "pulse" ? "pulse" : "classic";
  return {
    schemaVersion: 1,
    lineId: typeof source.lineId === "string" ? source.lineId : "",
    stationId: typeof source.stationId === "string" ? source.stationId : "",
    nameZh: typeof source.nameZh === "string" ? source.nameZh : "",
    nameEn: typeof source.nameEn === "string" ? source.nameEn : "",
    exitInfo: typeof source.exitInfo === "string" ? source.exitInfo : "（此处替换出口信息）",
    activeStyleId,
    styleStore: normalizeStyleStore(source.styleStore as Partial<Record<EntranceStyleTemplateId, EntranceStyleParams>> | undefined),
    backgroundName: typeof source.backgroundName === "string" ? source.backgroundName : "太空电梯站.jpg（默认示例）",
    backgroundAspect: typeof source.backgroundAspect === "number" && Number.isFinite(source.backgroundAspect) ? source.backgroundAspect : 16 / 9,
    backgroundAssetName: typeof source.backgroundAssetName === "string" ? source.backgroundAssetName : null,
    iconOverride: typeof source.iconOverride === "string" ? source.iconOverride : null,
  };
}

export default function EntranceSignApp({ projectId = DEFAULT_PROJECT_ID, repository }: EntranceSignAppProps) {
  const projectRepository = useMemo(
    () => repository || createProjectRepository({ storageMode: "http" }),
    [repository],
  );
  const documentStore = useMemo(() => new BrowserEditorDocumentStore(), []);
  const [data, setData] = useState<TransitData | null>(null);
  const [lineId, setLineId] = useState("L7");
  const [stationIndex, setStationIndex] = useState(0);
  const [nameZh, setNameZh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [exitInfo, setExitInfo] = useState("（此处替换出口信息）");
  const [backgroundUrl, setBackgroundUrl] = useState(DEFAULT_BACKGROUND);
  const [backgroundName, setBackgroundName] = useState("太空电梯站.jpg（默认示例）");
  const [backgroundAspect, setBackgroundAspect] = useState(16 / 9);
  const [backgroundAssetName, setBackgroundAssetName] = useState<string | null>(null);
  const [backgroundMissing, setBackgroundMissing] = useState(false);
  const [iconOverride, setIconOverride] = useState<string | null>(null);
  const [tintedIconDataUrl, setTintedIconDataUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showSliceGuides, setShowSliceGuides] = useState(true);
  const [settingsTab, setSettingsTab] = useState<"background" | "content" | "badge">("background");
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [exportScale, setExportScale] = useState<1 | 2 | 4>(1);
  const [status, setStatus] = useState("正在读取本地表格…");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [documentReady, setDocumentReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadedObjectUrl = useRef<string | null>(null);
  const pendingBackgroundBlob = useRef<{ name: string; blob: Blob } | null>(null);
  const savedDocumentSnapshot = useRef("");
  const captureInitialSnapshot = useRef(true);
  const restoredSelection = useRef<{ stationId: string; nameZh: string; nameEn: string } | null>(null);
  const restoredIconStationId = useRef<string | null>(null);

  // ── 样式模板系统 ──
  const [activeStyleId, setActiveStyleId] = useState<EntranceStyleTemplateId>("classic");
  const [styleStore, setStyleStore] = useState<Record<EntranceStyleTemplateId, EntranceStyleParams>>(initStyleStore);
  const activeStyle = styleStore[activeStyleId];

  /** 更新当前样式的单个参数。 */
  const updateStyleParam = useCallback(<K extends keyof EntranceStyleParams>(key: K, value: EntranceStyleParams[K]) => {
    setStyleStore((prev) => ({
      ...prev,
      [activeStyleId]: { ...prev[activeStyleId], [key]: value },
    }));
  }, [activeStyleId]);

  /** 切换样式模板，参数完全隔离。 */
  const selectStyle = useCallback((id: EntranceStyleTemplateId) => {
    if (id === activeStyleId) return;
    setActiveStyleId(id);
  }, [activeStyleId]);

  useEffect(() => {
    let disposed = false;
    captureInitialSnapshot.current = true;
    setDocumentReady(false);
    Promise.all([
      projectRepository.loadTransitData(projectId),
      documentStore.load<Record<string, unknown>>(projectId, "entrance").catch(() => null),
    ])
      .then(async ([loaded, storedDocument]) => {
        if (disposed) return;
        const normalized = normalizeTransitData(loaded);
        const restored = normalizeEntranceDocument(storedDocument);
        const fallbackLineId = normalized.lines.some((line) => line.id === "L7") ? "L7" : normalized.lines[0]?.id || "";
        const restoredLineId = restored && normalized.lines.some((line) => line.id === restored.lineId)
          ? restored.lineId
          : fallbackLineId;
        const restoredStations = stationsForLine(normalized, restoredLineId);
        const restoredStationIndex = restored ? restoredStations.findIndex((candidate) => candidate.id === restored.stationId) : -1;
        const selectedStation = restoredStations[Math.max(0, restoredStationIndex)] || restoredStations[0];

        setData(normalized);
        setLineId(restoredLineId);
        setStationIndex(Math.max(0, restoredStationIndex));
        if (restored) {
          restoredSelection.current = selectedStation ? { stationId: selectedStation.id, nameZh: restored.nameZh, nameEn: restored.nameEn } : null;
          setNameZh(restored.nameZh || selectedStation?.nameZh || "");
          setNameEn(restored.nameEn || selectedStation?.nameEn || "");
          setExitInfo(restored.exitInfo);
          setActiveStyleId(restored.activeStyleId);
          setStyleStore(restored.styleStore);
          setBackgroundName(restored.backgroundName);
          setBackgroundAspect(restored.backgroundAspect);
          setBackgroundAssetName(restored.backgroundAssetName);
          setIconOverride(restored.iconOverride);
          restoredIconStationId.current = selectedStation?.id || null;
          if (restored.backgroundAssetName) {
            const asset = await projectRepository.getAsset(projectId, restored.backgroundAssetName).catch(() => null);
            if (asset && !disposed) {
              const url = URL.createObjectURL(asset.blob);
              uploadedObjectUrl.current = url;
              setBackgroundUrl(url);
              setBackgroundMissing(false);
            } else if (!disposed) {
              setBackgroundUrl("");
              setBackgroundMissing(true);
            }
          }
        } else if (selectedStation) {
          restoredSelection.current = { stationId: selectedStation.id, nameZh: selectedStation.nameZh, nameEn: selectedStation.nameEn };
          restoredIconStationId.current = selectedStation.id;
          setNameZh(selectedStation.nameZh);
          setNameEn(selectedStation.nameEn);
        }
        setStatus(restored ? "项目设计已恢复" : "CSV 已载入");
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "读取失败");
        setStatus("数据服务离线");
      });
    return () => {
      disposed = true;
      if (uploadedObjectUrl.current) URL.revokeObjectURL(uploadedObjectUrl.current);
    };
  }, [documentStore, projectId, projectRepository]);

  const line = data?.lines.find((candidate) => candidate.id === lineId);
  const stations = useMemo(() => data && line ? stationsForLine(data, line.id) : [], [data, line]);
  const station = stations[Math.min(stationIndex, Math.max(stations.length - 1, 0))];
  const displayLines = data && line && station ? entranceSignLines(data, line, station) : [];

  useEffect(() => {
    if (!station) return;
    if (restoredSelection.current?.stationId === station.id) {
      restoredSelection.current = null;
      return;
    }
    setNameZh(station.nameZh);
    setNameEn(station.nameEn);
  }, [station?.id]);

  useEffect(() => {
    if (restoredIconStationId.current === station?.id) {
      restoredIconStationId.current = null;
      return;
    }
    setIconOverride(null);
  }, [station?.id]);

  const iconOptions = data && station ? stationIconOptions(data, station) : [];
  const currentIcon = iconOverride && iconOptions.includes(iconOverride)
    ? iconOverride
    : iconOptions[0] || null;
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    setIconUrl(null);
    if (currentIcon) {
      projectRepository.getAsset(projectId, currentIcon).then((asset) => {
        if (!asset || disposed) return;
        objectUrl = URL.createObjectURL(asset.blob);
        setIconUrl(objectUrl);
      }).catch(() => undefined);
    }
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentIcon, projectId, projectRepository]);

  useEffect(() => {
    if (activeStyle.iconMode === "none" || !iconUrl) {
      setTintedIconDataUrl(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      const renderSize = Math.max(32, Math.round(activeStyle.zhFontSize * activeStyle.iconSizeRatio * 4));
      const canvas = document.createElement("canvas");
      canvas.width = renderSize;
      canvas.height = renderSize;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setTintedIconDataUrl(null); return; }
      ctx.drawImage(image, 0, 0, renderSize, renderSize);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = activeStyle.textColor;
      ctx.fillRect(0, 0, renderSize, renderSize);
      setTintedIconDataUrl(canvas.toDataURL("image/png"));
    };
    image.onerror = () => setTintedIconDataUrl(null);
    image.src = iconUrl;
    return () => { cancelled = true; };
  }, [iconUrl, activeStyle.textColor, activeStyle.iconMode, activeStyle.zhFontSize, activeStyle.iconSizeRatio]);

  function selectLine(nextLineId: string) {
    setLineId(nextLineId);
    setStationIndex(0);
  }

  function chooseBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (uploadedObjectUrl.current) URL.revokeObjectURL(uploadedObjectUrl.current);
    const url = URL.createObjectURL(file);
    uploadedObjectUrl.current = url;
    const image = new Image();
    image.onload = () => setBackgroundAspect(image.naturalWidth / image.naturalHeight);
    image.src = url;
    setBackgroundUrl(url);
    setBackgroundMissing(false);
    setBackgroundName(file.name);
    const assetName = `entrance-bg-${Date.now()}-${cleanFilePart(file.name) || "background"}`;
    setBackgroundAssetName(assetName);
    pendingBackgroundBlob.current = { name: assetName, blob: file };
    updateStyleParam("backgroundMode", "image");
    event.target.value = "";
  }

  function resetBackground() {
    if (uploadedObjectUrl.current) URL.revokeObjectURL(uploadedObjectUrl.current);
    uploadedObjectUrl.current = null;
    setBackgroundUrl(DEFAULT_BACKGROUND);
    setBackgroundMissing(false);
    setBackgroundName("太空电梯站.jpg（默认示例）");
    setBackgroundAspect(16 / 9);
    setBackgroundAssetName(null);
    pendingBackgroundBlob.current = null;
    const defaults = defaultParamsForStyle(activeStyleId);
    updateStyleParam("backgroundScale", defaults.backgroundScale);
    updateStyleParam("backgroundPositionX", defaults.backgroundPositionX);
    updateStyleParam("backgroundPositionY", defaults.backgroundPositionY);
    updateStyleParam("backgroundMode", defaults.backgroundMode);
  }

  function resetBadgeStyle() {
    const defaults = defaultParamsForStyle(activeStyleId);
    updateStyleParam("badgeX", defaults.badgeX);
    updateStyleParam("badgeWidth", defaults.badgeWidth);
    updateStyleParam("badgeHeight", defaults.badgeHeight);
    updateStyleParam("badgeGap", defaults.badgeGap);
    updateStyleParam("badgeVerticalOffset", defaults.badgeVerticalOffset);
    updateStyleParam("badgeDividerWidth", defaults.badgeDividerWidth);
    updateStyleParam("badgeFontSize", defaults.badgeFontSize);
    updateStyleParam("badgeLetterSpacing", defaults.badgeLetterSpacing);
  }

  const editorDocument = useMemo<EntranceEditorDocument>(() => ({
    schemaVersion: 1,
    lineId,
    stationId: station?.id || "",
    nameZh,
    nameEn,
    exitInfo,
    activeStyleId,
    styleStore,
    backgroundName,
    backgroundAspect,
    backgroundAssetName,
    iconOverride,
  }), [activeStyleId, backgroundAspect, backgroundAssetName, backgroundName, exitInfo, iconOverride, lineId, nameEn, nameZh, station?.id, styleStore]);

  useEffect(() => {
    if (!data || !station) return;
    const snapshot = JSON.stringify(editorDocument);
    if (captureInitialSnapshot.current) {
      captureInitialSnapshot.current = false;
      savedDocumentSnapshot.current = snapshot;
      setDirty(false);
      setDocumentReady(true);
      return;
    }
    if (documentReady) setDirty(snapshot !== savedDocumentSnapshot.current);
  }, [data, documentReady, editorDocument, station]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function saveDesign() {
    if (!documentReady) return;
    setSaving(true);
    setError("");
    try {
      const pending = pendingBackgroundBlob.current;
      if (pending) {
        if (!projectRepository.capabilities.canManageAssets) throw new Error("当前存储模式不能保存自定义背景资源");
        await projectRepository.putAsset(projectId, pending.name, pending.blob);
      }
      await documentStore.save(projectId, "entrance", editorDocument);
      pendingBackgroundBlob.current = null;
      savedDocumentSnapshot.current = JSON.stringify(editorDocument);
      setDirty(false);
      setStatus(`设计已保存 · ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存设计失败");
    } finally {
      setSaving(false);
    }
  }

  async function buildCanvas() {
    if (!data || !line || !station) throw new Error("请选择有效站点");
    const s = activeStyle;
    return renderEntranceSignCanvas({
      styleId: activeStyleId,
      data,
      line,
      station,
      nameZh,
      nameEn,
      exitInfo,
      backgroundMode: s.backgroundMode,
      backgroundUrl,
      backgroundColor: s.backgroundColor,
      backgroundScale: s.backgroundScale,
      backgroundPositionX: s.backgroundPositionX,
      backgroundPositionY: s.backgroundPositionY,
      backgroundBrightness: s.backgroundBrightness,
      imageOverlayOpacity: s.imageOverlayOpacity,
      textColor: s.textColor,
      zhFontSize: s.zhFontSize,
      zhLetterSpacing: s.zhLetterSpacing,
      zhOffsetX: s.zhOffsetX,
      zhOffsetY: s.zhOffsetY,
      enFontSize: s.enFontSize,
      enLetterSpacing: s.enLetterSpacing,
      enOffsetX: s.enOffsetX,
      enOffsetY: s.enOffsetY,
      exitFontSize: s.exitFontSize,
      exitLetterSpacing: s.exitLetterSpacing,
      exitInfoX: s.exitInfoX,
      exitInfoY: s.exitInfoY,
      badgeX: s.badgeX,
      badgeWidth: s.badgeWidth,
      badgeHeight: s.badgeHeight,
      badgeGap: s.badgeGap,
      badgeVerticalOffset: s.badgeVerticalOffset,
      badgeDividerWidth: s.badgeDividerWidth,
      badgeFontSize: s.badgeFontSize,
      badgeLetterSpacing: s.badgeLetterSpacing,
      showIcon: s.iconMode !== "none" && !!currentIcon,
      iconUrl,
      iconSizeRatio: s.iconSizeRatio,
      iconBorder: s.iconMode === "rounded" ? "rounded" : s.iconMode === "circle" ? "circle" : "none",
      iconBorderWidth: s.iconBorderWidth,
      iconBorderSizeRatio: s.iconBorderSizeRatio,
      scale: exportScale,
    });
  }

  async function exportFull() {
    try {
      const canvas = await buildCanvas();
      const bytes = await canvasPngBytes(canvas);
      downloadBlob(new Blob([bytes as BlobPart], { type: "image/png" }), `${cleanFilePart(nameZh)}_出入口站名标识_${128 * exportScale}px.png`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导出失败");
    }
  }

  async function exportTile(tileIndex: number) {
    try {
      const canvas = await buildCanvas();
      const tile = sliceEntranceSignCanvas(canvas, tileIndex, exportScale);
      const bytes = await canvasPngBytes(tile);
      downloadBlob(new Blob([bytes as BlobPart], { type: "image/png" }), `${cleanFilePart(nameZh)}_${String(tileIndex + 1).padStart(2, "0")}.png`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导出失败");
    }
  }

  async function exportPackage() {
    if (!station) return;
    setExporting(true);
    try {
      const canvas = await buildCanvas();
      const folder = `${cleanFilePart(nameZh)}_出入口站名标识`;
      const entries: ZipEntry[] = [{ name: `${folder}/${cleanFilePart(nameZh)}.png`, data: await canvasPngBytes(canvas) }];
      for (let index = 0; index < 5; index += 1) {
        entries.push({
          name: `${folder}/${cleanFilePart(nameZh)}_${String(index + 1).padStart(2, "0")}.png`,
          data: await canvasPngBytes(sliceEntranceSignCanvas(canvas, index, exportScale)),
        });
      }
      downloadBlob(createStoredZip(entries), `${folder}_${128 * exportScale}px.zip`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片包生成失败");
    } finally {
      setExporting(false);
    }
  }

  if (!data) {
    return (
      <main className="loading-shell">
        <div className="loading-card">
          <span className="brand-mark"><img src={siteUrl("assets/rail-transit-icon.png")} alt="" /></span>
          <h1>出入口站名标识编辑器</h1>
          <p>{error || status}</p>
          {error && <button onClick={() => window.location.reload()}>重新连接</button>}
        </div>
      </main>
    );
  }

  const s = activeStyle;
  const showIcon = s.iconMode !== "none" && !!currentIcon;
  const iconMissing = showIcon && !iconUrl;
  const iconPxSize = showIcon ? s.zhFontSize * s.iconSizeRatio : 0;
  const iconGap = showIcon ? s.zhFontSize * 0.15 : 0;
  const hasBorder = showIcon && (s.iconMode === "rounded" || s.iconMode === "circle");
  const borderWidth = hasBorder ? s.iconBorderWidth : 0;
  const iconBoxSize = hasBorder ? iconPxSize * s.iconBorderSizeRatio : iconPxSize;
  const adjustedZhSize = showIcon
    ? fittedStationFontSize(nameZh, s.zhFontSize, Math.max(80, 292 - iconBoxSize - iconGap), false, s.zhLetterSpacing)
    : fittedStationFontSize(nameZh, s.zhFontSize, 292, false, s.zhLetterSpacing);
  const enSize = fittedStationFontSize(nameEn, s.enFontSize, 292, true, s.enLetterSpacing);
  const backgroundPlacement = entranceBackgroundPlacement(backgroundAspect, s.backgroundScale, s.backgroundPositionX, s.backgroundPositionY);
  const zhChars = [...nameZh].length;
  const zhTextWidth = adjustedZhSize * zhChars + Math.max(0, zhChars - 1) * s.zhLetterSpacing;
  const combinedWidth = showIcon ? iconBoxSize + iconGap + zhTextWidth : zhTextWidth;
  const groupStartX = 320 - combinedWidth / 2;
  const iconBoxX = groupStartX;
  const iconBoxY = 76 - adjustedZhSize * 0.35 - iconBoxSize / 2;
  const iconContentX = iconBoxX + (iconBoxSize - iconPxSize) / 2;
  const iconContentY = iconBoxY + (iconBoxSize - iconPxSize) / 2;
  const zhTextX = showIcon ? groupStartX + iconBoxSize + iconGap : 320;
  const zhTextAnchor = showIcon ? "start" : "middle";
  const entranceAccentColor = displayLines[0]?.lineColor || line?.lineColor || "#18C9F4";

  return (
    <main className="app-shell entrance-app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark"><img src={siteUrl("assets/rail-transit-icon.png")} alt="" /></span>
          <div>
            <h1>出入口站名标识编辑器</h1>
            <p>640 × 128 px 完整图 · 5 张地图画切片</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="save-state"><i />{dirty ? "有未保存修改" : status}</span>
          <button className="secondary-button" onClick={() => void saveDesign()} disabled={!documentReady || saving || !dirty}>{saving ? "保存中…" : "保存设计"}</button>
        </div>
      </header>

      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}>关闭</button></div>}

      <section className="workspace-card entrance-workspace-card">
        <div className="preview-toolbar entrance-toolbar">
          <div className="control-group line-picker">
            <label htmlFor="entrance-line">线路</label>
            <select id="entrance-line" value={lineId} onChange={(event) => selectLine(event.target.value)}>
              {data.lines.map((candidate) => <option key={candidate.id} value={candidate.id}>{displayLineName(candidate)}</option>)}
            </select>
          </div>
          <div className="control-group entrance-station-picker">
            <label htmlFor="entrance-station">站点</label>
            <select id="entrance-station" value={station?.id || ""} onChange={(event) => setStationIndex(stations.findIndex((candidate) => candidate.id === event.target.value))}>
              {stations.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.nameZh} · {candidate.nameEn}</option>)}
            </select>
          </div>
          <div className="toolbar-spacer" />
          <label className="check-control">
            <input type="checkbox" checked={showSliceGuides} onChange={(event) => setShowSliceGuides(event.target.checked)} />
            分割预览
          </label>
          <select className="zoom-select" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="预览缩放">
            <option value={.75}>75%</option><option value={1}>100%</option><option value={1.25}>125%</option>
          </select>
          <select className="export-size-select" value={exportScale} onChange={(event) => setExportScale(Number(event.target.value) as 1 | 2 | 4)} aria-label="导出分辨率">
            <option value={1}>导出 128 px</option><option value={2}>导出 256 px</option><option value={4}>导出 512 px</option>
          </select>
          <button className="secondary-button" onClick={() => void exportFull()} disabled={!station}>导出完整图</button>
          <button className="primary-button" onClick={() => void exportPackage()} disabled={!station || exporting}>{exporting ? "生成中…" : "导出图片包"}</button>
        </div>

        <div className="entrance-preview-layout">
          <div className="entrance-preview-column">
        <div className="canvas-stage entrance-preview-stage">
          {line && station ? (
            <div className="canvas-paper entrance-canvas-paper" style={{ width: 640 * zoom, height: 128 * zoom }}>
              <svg className="vector-preview" viewBox="0 0 640 128" role="img" aria-label={`${nameZh}出入口站名标识预览`}>
                <defs>
                  <clipPath id="entrance-image-clip"><polygon points={ENTRANCE_IMAGE_POLYGON} /></clipPath>
                  {showIcon && hasBorder && (
                    <clipPath id="entrance-icon-clip">
                      {s.iconMode === "circle" ? (
                        <circle cx={iconBoxX + iconBoxSize / 2} cy={iconBoxY + iconBoxSize / 2} r={Math.max(0, iconBoxSize / 2 - borderWidth)} />
                      ) : (
                        <rect x={iconBoxX + borderWidth} y={iconBoxY + borderWidth} width={Math.max(0, iconBoxSize - borderWidth * 2)} height={Math.max(0, iconBoxSize - borderWidth * 2)} rx={Math.max(0, (iconBoxSize - borderWidth * 2) * 0.2)} />
                      )}
                    </clipPath>
                  )}
                </defs>
                <rect width="640" height="128" fill={activeStyleId === "pulse" ? "#07131F" : "#2D2D2D"} />
                {s.backgroundMode === "solid" ? (
                  <polygon points={ENTRANCE_IMAGE_POLYGON} fill={s.backgroundColor} />
                ) : backgroundMissing ? (
                  <g clipPath="url(#entrance-image-clip)">
                    <polygon points={ENTRANCE_IMAGE_POLYGON} fill="#F3F5F6" />
                    <text x="320" y="58" textAnchor="middle" fill="#B42318" fontSize="12" fontWeight="800">背景素材缺失</text>
                    <text x="320" y="76" textAnchor="middle" fill="#667580" fontSize="8">{backgroundName}</text>
                  </g>
                ) : (
                  <>
                    <image href={backgroundUrl} x={backgroundPlacement.x} y={backgroundPlacement.y} width={backgroundPlacement.width} height={backgroundPlacement.height} preserveAspectRatio="none" clipPath="url(#entrance-image-clip)" style={{ filter: `brightness(${s.backgroundBrightness}%)` }} />
                    <polygon points={ENTRANCE_IMAGE_POLYGON} fill={activeStyleId === "pulse" ? "#07131F" : "#FFFFFF"} opacity={s.imageOverlayOpacity} />
                  </>
                )}
                {activeStyleId === "pulse" && (
                  <>
                    <rect width="128" height="128" fill="#0D2233" opacity=".78" />
                    <rect x="512" width="128" height="128" fill="#0D2233" opacity=".78" />
                    <rect x="128" width="384" height="3" fill={entranceAccentColor} />
                    <rect y="124" width="640" height="4" fill={entranceAccentColor} />
                    <rect x="512" y="18" width="3" height="92" fill={entranceAccentColor} />
                    <rect x="524" y="34" width="104" height="60" rx="12" fill="none" stroke={entranceAccentColor} strokeWidth="1.5" />
                    <text x="320" y="19" textAnchor="middle" fill="#8CA7B8" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="700" letterSpacing="2">STATION</text>
                    <text x="576" y="51" textAnchor="middle" fill="#8CA7B8" fontFamily='"Microsoft YaHei", Arial, sans-serif' fontSize="8" fontWeight="700" letterSpacing="2">EXIT / 出口</text>
                  </>
                )}
                {displayLines.map((badgeLine, index) => {
                  const badgeLayout = entranceBadgeLayout(displayLines.length, s.badgeHeight, s.badgeGap, s.badgeVerticalOffset);
                  const y = badgeLayout.startY + index * (badgeLayout.badgeHeight + badgeLayout.gap);
                  return (
                    <g key={badgeLine.id}>
                      <rect x={s.badgeX} y={y} width={s.badgeWidth} height={badgeLayout.badgeHeight} rx={activeStyleId === "pulse" ? badgeLayout.badgeHeight / 2 : 0} fill={badgeLine.lineColor} />
                      {activeStyleId === "pulse" ? (
                        <circle cx={s.badgeX + 10} cy={y + badgeLayout.badgeHeight / 2} r="2.5" fill="rgba(255,255,255,.9)" />
                      ) : (
                        <rect x={s.badgeX + s.badgeWidth} y={y} width={s.badgeDividerWidth} height={badgeLayout.badgeHeight} fill="rgba(255,255,255,.92)" />
                      )}
                      <text x={s.badgeX + s.badgeWidth - (activeStyleId === "pulse" ? 9 : 4)} y={y + badgeLayout.badgeHeight / 2 + 1} textAnchor="end" dominantBaseline="middle" fill={contrastTextColor(badgeLine.lineColor)} fontFamily="Arial, sans-serif" fontWeight="800" fontSize={fittedStationFontSize(entranceLineLabel(badgeLine), Math.min(s.badgeFontSize, badgeLayout.badgeHeight * .62), Math.max(24, s.badgeWidth - 12), true, s.badgeLetterSpacing)} letterSpacing={s.badgeLetterSpacing}>{entranceLineLabel(badgeLine)}</text>
                    </g>
                  );
                })}
                {showIcon && tintedIconDataUrl && (
                  hasBorder ? (
                    <>
                      {s.iconMode === "circle" ? (
                        <circle cx={iconBoxX + iconBoxSize / 2} cy={iconBoxY + iconBoxSize / 2} r={iconBoxSize / 2 - borderWidth / 2} fill="none" stroke={s.textColor} strokeWidth={borderWidth} />
                      ) : (
                        <rect x={iconBoxX + borderWidth / 2} y={iconBoxY + borderWidth / 2} width={iconBoxSize - borderWidth} height={iconBoxSize - borderWidth} rx={(iconBoxSize - borderWidth) * 0.2} fill="none" stroke={s.textColor} strokeWidth={borderWidth} />
                      )}
                      <image
                        href={tintedIconDataUrl}
                        x={iconContentX}
                        y={iconContentY}
                        width={iconPxSize}
                        height={iconPxSize}
                        preserveAspectRatio="xMidYMid meet"
                        clipPath="url(#entrance-icon-clip)"
                      />
                    </>
                  ) : (
                    <image
                      href={tintedIconDataUrl}
                      x={iconContentX}
                      y={iconContentY}
                      width={iconPxSize}
                      height={iconPxSize}
                      preserveAspectRatio="xMidYMid meet"
                    />
                  )
                )}
                {iconMissing && (
                  <g aria-label={`缺少图标 ${currentIcon}`}>
                    <rect x={iconBoxX} y={iconBoxY} width={iconBoxSize} height={iconBoxSize} rx="3" fill="#F3F5F6" stroke="#B42318" strokeWidth="1.5" strokeDasharray="3 2" />
                    <text x={iconBoxX + iconBoxSize / 2} y={iconBoxY + iconBoxSize / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill="#B42318" fontSize={Math.max(8, iconBoxSize * .6)} fontWeight="800">?</text>
                  </g>
                )}
                <text x={zhTextX + s.zhOffsetX} y={76 + s.zhOffsetY} textAnchor={zhTextAnchor} fill={s.textColor} fontFamily='"Microsoft YaHei", "Noto Sans SC", sans-serif' fontWeight="800" fontSize={adjustedZhSize} letterSpacing={s.zhLetterSpacing}>{nameZh}</text>
                <text x={320 + s.enOffsetX} y={99 + s.enOffsetY} textAnchor="middle" fill={s.textColor} fontFamily='Arial, "Helvetica Neue", sans-serif' fontWeight="600" fontSize={enSize} letterSpacing={s.enLetterSpacing}>{nameEn}</text>
                <text x={s.exitInfoX} y={s.exitInfoY} textAnchor="middle" fill="#FFFFFF" fontFamily='"Microsoft YaHei", Arial, sans-serif' fontWeight="700" fontSize={fittedStationFontSize(exitInfo, s.exitFontSize, 116, true, s.exitLetterSpacing)} letterSpacing={s.exitLetterSpacing}>{exitInfo}</text>
              </svg>
              {showSliceGuides && <SliceGuideOverlay count={5} tileSize={128} zoom={zoom} />}
            </div>
          ) : <div className="empty-preview">当前线路没有可用站点</div>}
        </div>

        <div className="station-controller entrance-controller">
          <button onClick={() => setStationIndex((index) => Math.max(0, index - 1))} disabled={!stationIndex}>上一站</button>
          <div className="slider-block">
            <div className="slider-labels"><span>当前站点</span><strong>{station ? `${stationIndex + 1}. ${station.nameZh}` : "无站点"}</strong><span>{stations.length ? `${stationIndex + 1} / ${stations.length}` : "0 / 0"}</span></div>
            <input type="range" min="0" max={Math.max(0, stations.length - 1)} value={Math.min(stationIndex, Math.max(0, stations.length - 1))} onChange={(event) => setStationIndex(Number(event.target.value))} style={{ "--range-progress": stations.length > 1 ? `${stationIndex / (stations.length - 1) * 100}%` : "0%" } as React.CSSProperties} />
          </div>
          <button onClick={() => setStationIndex((index) => Math.min(stations.length - 1, index + 1))} disabled={!stations.length || stationIndex >= stations.length - 1}>下一站</button>
          <div className="quick-export entrance-quick-export"><span>切片</span>{[0, 1, 2, 3, 4].map((index) => <button key={index} onClick={() => void exportTile(index)}>{String(index + 1).padStart(2, "0")}</button>)}</div>
        </div>
        <p className="preview-hint">中间背景可替换为对应站点截图；完整图和 5 张切片使用相同的矢量文字与斜切布局。</p>
          </div>

          <aside className="entrance-floating-settings" aria-label="出入口标识设置">
            <div className="entrance-floating-settings-header">
              <div><p className="eyebrow">实时调整</p><h2>{settingsTab === "background" ? "背景与画面" : settingsTab === "content" ? "出入口站名标识" : "站点线路"}</h2></div>
              <button type="button" className="entrance-style-switch-button" onClick={() => setShowStylePicker(true)} aria-haspopup="dialog" aria-expanded={showStylePicker}>
                <span className={`entrance-style-template-icon entrance-style-switch-current-icon ${activeStyleId}`} aria-hidden="true"><i /></span>
                <span className="entrance-style-switch-copy"><b>{ENTRANCE_STYLE_TEMPLATES.find((template) => template.id === activeStyleId)?.label || "经典样式"}</b><small>切换样式</small></span>
                <span className="entrance-style-switch-glyph" aria-hidden="true"><img src={siteUrl("assets/transfer-t5.png")} alt="" /></span>
              </button>
            </div>
            <div className="entrance-settings-tabs" role="tablist" aria-label="出入口标识设置分类">
              <button type="button" role="tab" aria-selected={settingsTab === "background"} className={settingsTab === "background" ? "active" : ""} onClick={() => setSettingsTab("background")}>背景与画面</button>
              <button type="button" role="tab" aria-selected={settingsTab === "content"} className={settingsTab === "content" ? "active" : ""} onClick={() => setSettingsTab("content")}>站名与出口</button>
              <button type="button" role="tab" aria-selected={settingsTab === "badge"} className={settingsTab === "badge" ? "active" : ""} onClick={() => setSettingsTab("badge")}>站点线路</button>
            </div>
            <div className="entrance-floating-settings-scroll">
              {settingsTab === "background" ? (
                <>
                  <div className="entrance-background-mode">
                    <span>中间背景类型</span>
                    <div className="segmented small">
                      <button type="button" className={s.backgroundMode === "image" ? "active" : ""} onClick={() => updateStyleParam("backgroundMode", "image")}>图片背景</button>
                      <button type="button" className={s.backgroundMode === "solid" ? "active" : ""} onClick={() => updateStyleParam("backgroundMode", "solid")}>纯色背景</button>
                    </div>
                  </div>
                  <div className="entrance-background-actions">
                    <button className="secondary-button" onClick={() => uploadRef.current?.click()}>选择背景图片</button>
                    <button className="secondary-button" onClick={resetBackground}>恢复默认</button>
                    <input ref={uploadRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseBackground} />
                  </div>
                  <label><span>当前背景图片</span><input value={backgroundName} readOnly /></label>
                  {s.backgroundMode === "solid" ? (
                    <label><span>纯色背景颜色</span><div><input type="color" value={s.backgroundColor} onChange={(event) => updateStyleParam("backgroundColor", event.target.value)} /><input className="hex-input" value={s.backgroundColor} onChange={(event) => updateStyleParam("backgroundColor", event.target.value)} /></div></label>
                  ) : (
                    <>
                      <label><span>背景缩放 · {Math.round(s.backgroundScale * 100)}%</span><input type="range" min="1" max="3" step=".01" value={s.backgroundScale} onChange={(event) => updateStyleParam("backgroundScale", Number(event.target.value))} /></label>
                      <label><span>背景水平位置 · {s.backgroundPositionX}%</span><input type="range" min="0" max="100" step="1" value={s.backgroundPositionX} onChange={(event) => updateStyleParam("backgroundPositionX", Number(event.target.value))} /></label>
                      <label><span>背景垂直位置 · {s.backgroundPositionY}%</span><input type="range" min="0" max="100" step="1" value={s.backgroundPositionY} onChange={(event) => updateStyleParam("backgroundPositionY", Number(event.target.value))} /></label>
                      <label><span>背景亮度 · {s.backgroundBrightness}%</span><input type="range" min="35" max="120" step="1" value={s.backgroundBrightness} onChange={(event) => updateStyleParam("backgroundBrightness", Number(event.target.value))} /></label>
                      <label><span>{activeStyleId === "pulse" ? "深色遮罩" : "白色遮罩"} · {Math.round(s.imageOverlayOpacity * 100)}%</span><input type="range" min="0" max=".8" step=".01" value={s.imageOverlayOpacity} onChange={(event) => updateStyleParam("imageOverlayOpacity", Number(event.target.value))} /></label>
                    </>
                  )}
                </>
              ) : settingsTab === "content" ? (
                <>
                  <div className="entrance-settings-section-heading"><div><strong>文字内容</strong><span>只影响当前预览与导出</span></div></div>
                  <label><span>中文站名</span><input value={nameZh} onChange={(event) => setNameZh(event.target.value)} /></label>
                  <label><span>英文站名</span><input value={nameEn} onChange={(event) => setNameEn(event.target.value)} /></label>
                  <label><span>右侧出口信息</span><input value={exitInfo} onChange={(event) => setExitInfo(event.target.value)} /></label>
                  <label><span>站名颜色</span><div><input type="color" value={s.textColor} onChange={(event) => updateStyleParam("textColor", event.target.value)} /><input className="hex-input" value={s.textColor} onChange={(event) => updateStyleParam("textColor", event.target.value)} /></div></label>
                  <div className="entrance-settings-section-heading"><div><strong>站点图标</strong><span>自动读取线路配置</span></div></div>
                  <div className="entrance-icon-mode">
                    <span>图标模式</span>
                    <div className="segmented small">
                      <button type="button" className={s.iconMode === "none" ? "active" : ""} onClick={() => updateStyleParam("iconMode", "none")}>无图标</button>
                      <button type="button" className={s.iconMode === "borderless" ? "active" : ""} onClick={() => updateStyleParam("iconMode", "borderless")}>无边框</button>
                      <button type="button" className={s.iconMode === "rounded" ? "active" : ""} onClick={() => updateStyleParam("iconMode", "rounded")}>圆角矩形</button>
                      <button type="button" className={s.iconMode === "circle" ? "active" : ""} onClick={() => updateStyleParam("iconMode", "circle")}>圆形</button>
                    </div>
                  </div>
                  {s.iconMode !== "none" && (
                    <>
                      <label><span>图标大小 · {Math.round(s.iconSizeRatio * 100)}%</span><input type="range" min="0.5" max="3" step="0.05" value={s.iconSizeRatio} onChange={(event) => updateStyleParam("iconSizeRatio", Number(event.target.value))} /></label>
                      {s.iconMode !== "borderless" && (
                        <>
                          <label><span>边框宽度 · {s.iconBorderWidth}px</span><input type="range" min="0.5" max="8" step="0.5" value={s.iconBorderWidth} onChange={(event) => updateStyleParam("iconBorderWidth", Number(event.target.value))} /></label>
                          <label><span>边框大小 · {Math.round(s.iconBorderSizeRatio * 100)}%</span><input type="range" min="0.5" max="3" step="0.05" value={s.iconBorderSizeRatio} onChange={(event) => updateStyleParam("iconBorderSizeRatio", Number(event.target.value))} /></label>
                        </>
                      )}
                    </>
                  )}
                  {iconOptions.length > 1 && (
                    <label><span>选择图标（{iconOptions.length} 个可选）</span>
                      <select value={currentIcon || ""} onChange={(event) => setIconOverride(event.target.value || null)}>
                        {iconOptions.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
                      </select>
                    </label>
                  )}
                  {s.iconMode !== "none" && iconOptions.length === 0 && (
                    <p style={{ color: "var(--muted)", fontSize: "11px", margin: 0 }}>当前站点未配置图标</p>
                  )}
                  <label><span>中文字号 · {s.zhFontSize}px</span><input type="range" min="22" max="48" step="1" value={s.zhFontSize} onChange={(event) => updateStyleParam("zhFontSize", Number(event.target.value))} /></label>
                  <label><span>中文字符间距 · {s.zhLetterSpacing}px</span><input type="range" min="-2" max="8" step=".25" value={s.zhLetterSpacing} onChange={(event) => updateStyleParam("zhLetterSpacing", Number(event.target.value))} /></label>
                  <label><span>中文水平偏移 · {s.zhOffsetX}px</span><input type="range" min="-80" max="80" step="1" value={s.zhOffsetX} onChange={(event) => updateStyleParam("zhOffsetX", Number(event.target.value))} /></label>
                  <label><span>中文垂直偏移 · {s.zhOffsetY}px</span><input type="range" min="-40" max="40" step="1" value={s.zhOffsetY} onChange={(event) => updateStyleParam("zhOffsetY", Number(event.target.value))} /></label>
                  <label><span>英文字号 · {s.enFontSize}px</span><input type="range" min="10" max="26" step="1" value={s.enFontSize} onChange={(event) => updateStyleParam("enFontSize", Number(event.target.value))} /></label>
                  <label><span>英文字符间距 · {s.enLetterSpacing}px</span><input type="range" min="-2" max="8" step=".25" value={s.enLetterSpacing} onChange={(event) => updateStyleParam("enLetterSpacing", Number(event.target.value))} /></label>
                  <label><span>英文水平偏移 · {s.enOffsetX}px</span><input type="range" min="-80" max="80" step="1" value={s.enOffsetX} onChange={(event) => updateStyleParam("enOffsetX", Number(event.target.value))} /></label>
                  <label><span>英文垂直偏移 · {s.enOffsetY}px</span><input type="range" min="-40" max="40" step="1" value={s.enOffsetY} onChange={(event) => updateStyleParam("enOffsetY", Number(event.target.value))} /></label>
                  <label><span>出口信息字号 · {s.exitFontSize}px</span><input type="range" min="8" max="24" step=".5" value={s.exitFontSize} onChange={(event) => updateStyleParam("exitFontSize", Number(event.target.value))} /></label>
                  <label><span>出口信息字符间距 · {s.exitLetterSpacing}px</span><input type="range" min="-2" max="8" step=".25" value={s.exitLetterSpacing} onChange={(event) => updateStyleParam("exitLetterSpacing", Number(event.target.value))} /></label>
                  <label><span>出口信息水平位置 · {s.exitInfoX}px</span><input type="range" min="512" max="640" step="1" value={s.exitInfoX} onChange={(event) => updateStyleParam("exitInfoX", Number(event.target.value))} /></label>
                  <label><span>出口信息垂直位置 · {s.exitInfoY}px</span><input type="range" min="12" max="124" step="1" value={s.exitInfoY} onChange={(event) => updateStyleParam("exitInfoY", Number(event.target.value))} /></label>
                </>
              ) : (
                <>
                  <div className="entrance-settings-section-heading">
                    <div><strong>线路标识色条</strong><span>应用于该站全部线路</span></div>
                    <button type="button" onClick={resetBadgeStyle}>恢复默认</button>
                  </div>
                  <label><span>整组水平位置 · {s.badgeX}px</span><input type="range" min="-24" max="96" step="1" value={s.badgeX} onChange={(event) => updateStyleParam("badgeX", Number(event.target.value))} /></label>
                  <label><span>整组垂直偏移 · {s.badgeVerticalOffset}px</span><input type="range" min="-36" max="36" step="1" value={s.badgeVerticalOffset} onChange={(event) => updateStyleParam("badgeVerticalOffset", Number(event.target.value))} /></label>
                  <label><span>色条宽度 · {s.badgeWidth}px</span><input type="range" min="64" max="128" step="1" value={s.badgeWidth} onChange={(event) => updateStyleParam("badgeWidth", Number(event.target.value))} /></label>
                  <label><span>单条最大高度 · {s.badgeHeight}px</span><input type="range" min="16" max="56" step="1" value={s.badgeHeight} onChange={(event) => updateStyleParam("badgeHeight", Number(event.target.value))} /></label>
                  <label><span>色条间距 · {s.badgeGap}px</span><input type="range" min="0" max="16" step="1" value={s.badgeGap} onChange={(event) => updateStyleParam("badgeGap", Number(event.target.value))} /></label>
                  <label><span>白色分隔条宽度 · {s.badgeDividerWidth}px</span><input type="range" min="0" max="12" step="1" value={s.badgeDividerWidth} onChange={(event) => updateStyleParam("badgeDividerWidth", Number(event.target.value))} /></label>
                  <label><span>线路标识字号 · {s.badgeFontSize}px</span><input type="range" min="12" max="34" step="1" value={s.badgeFontSize} onChange={(event) => updateStyleParam("badgeFontSize", Number(event.target.value))} /></label>
                  <label><span>线路标识字符间距 · {s.badgeLetterSpacing}px</span><input type="range" min="-2" max="8" step=".25" value={s.badgeLetterSpacing} onChange={(event) => updateStyleParam("badgeLetterSpacing", Number(event.target.value))} /></label>
                </>
              )}
            </div>
          </aside>
        </div>
      </section>

      {showStylePicker && (
        <div className="entrance-style-picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowStylePicker(false)}>
          <section className="entrance-style-picker-modal" role="dialog" aria-modal="true" aria-labelledby="entrance-style-picker-title">
            <div className="entrance-style-picker-heading">
              <div><p className="eyebrow">标识模板</p><h2 id="entrance-style-picker-title">切换样式</h2></div>
              <button type="button" className="close-button" onClick={() => setShowStylePicker(false)} aria-label="关闭样式选择">×</button>
            </div>
            <div className="entrance-style-picker-options" role="tablist" aria-label="标识样式列表">
              {ENTRANCE_STYLE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  role="tab"
                  aria-selected={activeStyleId === template.id}
                  className={activeStyleId === template.id ? "active" : ""}
                  onClick={() => { selectStyle(template.id); setShowStylePicker(false); }}
                >
                  <span className={`entrance-style-template-icon ${template.id}`} aria-hidden="true"><i /></span>
                  <span><b>{template.label}</b><small>{template.description}</small></span>
                  <em>{activeStyleId === template.id ? "当前" : template.available ? "可用" : "待配置"}</em>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      <section className="workspace-card data-card entrance-station-list">
        <div className="data-heading"><div><p className="eyebrow">当前线路</p><h2>{line?.nameZh || "线路"}站点</h2></div><div className="data-actions"><span className="muted">点击站点即可载入预览</span></div></div>
        <div className="table-scroll"><table><thead><tr><th>顺序</th><th>中文站名</th><th>英文站名</th><th>线路标识</th><th>换乘数量</th></tr></thead><tbody>
          {stations.map((candidate: Station, index) => (
            <tr key={candidate.id} className={index === stationIndex ? "current-row" : ""} onClick={() => setStationIndex(index)}>
              <td><span className="sequence-pill">{String(candidate.sequence).padStart(2, "0")}</span></td><td><strong>{candidate.nameZh}</strong></td><td>{candidate.nameEn}</td><td><code>{line?.code}</code></td><td>{data.transfers.filter((transfer) => transfer.stationId === candidate.id && !transfer.hidden).length}</td>
            </tr>
          ))}
        </tbody></table></div>
      </section>
    </main>
  );
}
