// 配线图编辑器的纯几何/序列化/偏好持久化辅助。
// 不含 JSX 组件，可被任意客户端模块引用。

import { useCallback, useState } from "react";
import type {
  AttachedGraphic,
  BackgroundImageObject,
  DiagramModule,
  LabelObject,
  ModuleConnection,
  PlatformObject,
  TemplateTrack,
  TransferGroup,
} from "../types";
import { readableLabelRotation } from "../canvasLogic";

/** 矩形相交检测 */
export function rectsIntersect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function rotatedRectBounds(x: number, y: number, width: number, height: number, rotation = 0) {
  if (!rotation) return { x, y, w: width, h: height };
  const radians = rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = x + width / 2;
  const cy = y + height / 2;
  const corners = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]].map(([px, py]) => ({
    x: cx + (px - cx) * cos - (py - cy) * sin,
    y: cy + (px - cx) * sin + (py - cy) * cos,
  }));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export function createBackgroundPreview(image: HTMLImageElement): string | undefined {
  const maxDimension = 2048;
  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  if (longest <= maxDimension && image.naturalWidth * image.naturalHeight <= 4_000_000) return undefined;
  const scale = Math.min(1, maxDimension / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.82);
}

export interface ExportBounds { x: number; y: number; width: number; height: number }

export type CanvasRenderItem =
  | { kind: "connection"; item: ModuleConnection; creationIndex: number }
  | { kind: "background"; item: BackgroundImageObject; creationIndex: number }
  | { kind: "module"; item: DiagramModule; creationIndex: number }
  | { kind: "platform"; item: PlatformObject; creationIndex: number }
  | { kind: "graphic"; item: AttachedGraphic; creationIndex: number }
  | { kind: "label"; item: LabelObject; creationIndex: number }
  | { kind: "transfer"; item: TransferGroup; creationIndex: number };

export const PLACEMENT_Z_LEVELS = [
  { label: "高架-高", value: 20 },
  { label: "高架", value: 10 },
  { label: "地面", value: 0 },
  { label: "半地下", value: -5 },
  { label: "地下", value: -10 },
  { label: "地下-深", value: -20 },
  { label: "地下-极深", value: -30 },
  { label: "标注", value: 100 },
  { label: "背景", value: -100 },
] as const;

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error("读取图片资源失败"));
      reader.readAsDataURL(blob);
    });
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

/** 把外部路径或 blob URL 转成可随 SVG 一起导出的内嵌图片。 */
export async function exportImageSourceToDataUrl(
  source: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (!source || source.startsWith("data:")) return source;
  const response = await fetcher(source);
  if (!response.ok) throw new Error(`背景图读取失败（HTTP ${response.status}）`);
  return blobToDataUrl(await response.blob());
}

/** 生成不含编辑辅助元素、且图片资源已内嵌的独立 SVG。 */
export async function svgToString(svg: SVGSVGElement, bounds: ExportBounds, includeBackground: boolean, transparent: boolean): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(bounds.width));
  clone.setAttribute("height", String(bounds.height));
  clone.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  clone.querySelector(".canvas-bg")?.remove();
  clone.querySelectorAll(".grid-group, .selection-box, .port, .track-control-handle, .crossing-point, .crossing-label, .connection-preview, .module-ghost, .bg-image-selection, .bg-image-unlock, .label-anchor").forEach((node) => node.remove());
  if (!includeBackground) clone.querySelectorAll(".bg-image").forEach((node) => node.remove());
  await Promise.all(Array.from(clone.querySelectorAll<SVGImageElement>("image[data-export-src]")).map(async (node) => {
    const source = node.getAttribute("data-export-src") || node.getAttribute("href") || "";
    node.setAttribute("href", await exportImageSourceToDataUrl(source));
    node.removeAttribute("data-export-src");
  }));
  const viewportGroup = clone.querySelector("g[transform]");
  viewportGroup?.removeAttribute("transform");
  const paper = clone.querySelector(".canvas-paper");
  if (transparent) paper?.remove();
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .track,.connection-track{fill:none;stroke:var(--track-stroke,#202124);stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
    .track.siding,.track.yard,.track.branch,.track.turnback{stroke:var(--track-stroke,#202124);stroke-width:2.5}.track.turnback{stroke-dasharray:5 3}
    .connection-track.crossing-gap{stroke:var(--track-stroke,#5a6c75);stroke-dasharray:8 4}.connection-track.crossing-bridge{stroke-width:3.5}.connection-track.line-dashed{stroke-dasharray:8 4}
    .platform{fill:var(--platform-fill,#D7B06A);stroke:var(--platform-stroke,#C49A52);stroke-width:1}.platform-label{font-size:7px;fill:#8a6b2e;text-anchor:middle}
    .station-label{font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif;font-size:13px;fill:var(--label-fill,#202124);text-anchor:middle;font-weight:700}
    .station-label-en,.aux-label{font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif;fill:#6b7b85;text-anchor:middle}.station-label-en{font-size:9px}.aux-label{font-size:8px}
    .independent-label{font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif}.transfer-group{pointer-events:none}
  `;
  clone.insertBefore(style, clone.firstChild);
  const helper = document.createElement("div");
  helper.appendChild(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${helper.innerHTML}`;
}

export function templateTrackPathD(track: TemplateTrack): string {
  return track.cx2 !== undefined && track.cy2 !== undefined
    ? `M${track.x1},${track.y1} C${track.cx},${track.cy} ${track.cx2},${track.cy2} ${track.x2},${track.y2}`
    : `M${track.x1},${track.y1} Q${track.cx},${track.cy} ${track.x2},${track.y2}`;
}

/**
 * 模块内部文字的反镜像 transform：外层模块组已做镜像+旋转，这里把文字旋回可读角度，
 * 并抵消镜像，避免镜像后的文字左右颠倒。未镜像时退化为原来的纯旋转写法。
 */
export function moduleLabelTextTransform(rotation: number, mirrorX: boolean | undefined, mirrorY: boolean | undefined, x: number, y: number): string {
  const sx = mirrorX ? -1 : 1;
  const sy = mirrorY ? -1 : 1;
  if (sx === 1 && sy === 1) return `rotate(${readableLabelRotation(rotation) - rotation} ${x} ${y})`;
  return `scale(${sx} ${sy} ${x} ${y}) rotate(${-rotation} ${x} ${y}) rotate(${readableLabelRotation(rotation)} ${x} ${y})`;
}

/**
 * 局部镜像的 SVG transform 后缀：绕对象中心先做镜像（scale(-1,1) / scale(1,-1)），
 * 再叠加在外层 translate/rotate 之后（SVG 变换从右往左作用）。
 */
export function moduleMirrorTransform(width: number, height: number, mirrorX?: boolean, mirrorY?: boolean): string {
  const sx = mirrorX ? -1 : 1;
  const sy = mirrorY ? -1 : 1;
  if (sx === 1 && sy === 1) return "";
  const cx = width / 2;
  const cy = height / 2;
  return ` translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`;
}

/**
 * 编辑器偏好设置的 localStorage 持久化。
 * 首次渲染用保存值初始化；每次 set（含函数式更新）同步写回。
 * 只存小体积偏好（开关/面板折叠），大体积工程数据仍走 IndexedDB。
 * localStorage 不可用或内容损坏时静默回退默认值。
 */
export function usePersistentState<T>(storageKey: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // 忽略读取失败
    }
    return defaultValue;
  });
  const setWithPersist = useCallback((next: React.SetStateAction<T>) => {
    setValue((prev) => {
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
      try {
        localStorage.setItem(storageKey, JSON.stringify(resolved));
      } catch {
        // 忽略写入失败（隐私模式/配额）
      }
      return resolved;
    });
  }, [storageKey]);
  return [value, setWithPersist];
}

/** 偏好设置的 localStorage 键前缀 */
export const PREF_KEY = (name: string) => `metro-wiring-prefs.${name}`;
