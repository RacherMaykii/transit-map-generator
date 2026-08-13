const encoder = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function join(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function createStoredZip(entries: ZipEntry[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const name = encoder.encode(entry.name.replace(/\\/g, "/"));
    const crc = crc32(entry.data);
    const local = join([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(name.length),
      u16(0),
      name,
      entry.data,
    ]);
    localParts.push(local);
    centralParts.push(join([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(entry.data.length),
      u32(entry.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]));
    offset += local.length;
  });

  const central = join(centralParts);
  const end = join([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  const blobPart = (bytes: Uint8Array): ArrayBuffer => {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return copy.buffer;
  };
  return new Blob(
    [...localParts.map(blobPart), blobPart(central), blobPart(end)],
    { type: "application/zip" },
  );
}

export async function canvasPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return canvasImageBytes(canvas, "png");
}

export type CanvasImageFormat = "png" | "webp" | "jpeg";

export async function canvasImageBytes(
  canvas: HTMLCanvasElement,
  format: CanvasImageFormat,
  quality = 0.92,
): Promise<Uint8Array> {
  const mimeType = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error(`${format.toUpperCase()} 生成失败`)), mimeType, quality);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function canvasPixelHash(canvas: HTMLCanvasElement): Promise<string> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取图片像素");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const digest = await crypto.subtle.digest("SHA-256", pixels);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
