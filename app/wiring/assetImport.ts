import { unzipSync } from "fflate";
import type { AssetRecord } from "./types";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

function mimeFromName(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() || "";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return `image/${extension || "png"}`;
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function assetId(name: string, size: number): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return `asset-${normalized}-${size}`;
}

export function findAssetByFilename(assets: AssetRecord[], filename?: string): AssetRecord | undefined {
  if (!filename) return undefined;
  const expected = filename.replaceAll("\\", "/").split("/").pop()?.toLocaleLowerCase();
  return assets.find((asset) => asset.name.toLocaleLowerCase() === expected);
}

export function importIconArchive(bytes: Uint8Array): AssetRecord[] {
  const entries = unzipSync(bytes);
  const assets: AssetRecord[] = [];
  for (const [path, data] of Object.entries(entries)) {
    const name = path.split("/").pop() || path;
    const extension = name.split(".").pop()?.toLowerCase() || "";
    if (!IMAGE_EXTENSIONS.has(extension) || path.endsWith("/")) continue;
    const mimeType = mimeFromName(name);
    assets.push({
      id: assetId(path, data.length),
      name,
      mimeType,
      dataUrl: bytesToDataUrl(data, mimeType),
      archivePath: `assets/icons/${name}`,
      size: data.length,
    });
  }
  return assets;
}

export async function importIconFiles(files: File[]): Promise<AssetRecord[]> {
  const assets: AssetRecord[] = [];
  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!file.type.startsWith("image/") && !IMAGE_EXTENSIONS.has(extension)) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || mimeFromName(file.name);
    assets.push({
      id: assetId(file.webkitRelativePath || file.name, bytes.length),
      name: file.name,
      mimeType,
      dataUrl: bytesToDataUrl(bytes, mimeType),
      archivePath: `assets/icons/${file.name}`,
      size: bytes.length,
    });
  }
  return assets;
}
