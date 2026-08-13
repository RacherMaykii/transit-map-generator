// 从活工程数据 data/ 更新 public/sample-data/ 部署镜像（static/browser 模式的种子源）。
// 本机有 data/ 时以活工程数据为准；GitHub 的干净检出没有 data/ 时使用仓库内已提交的只读种子。
// 与 local-data-server 的 createProject 一致——新工程/新种子始终取自当前活数据。
// 用法: node scripts/sync-sample-data.mjs （挂进 dev / build / build:static 前自动执行）
import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE_DIR = path.join(ROOT, "data");
const TARGET_DIR = path.join(ROOT, "public", "sample-data");
const FILES = ["lines.csv", "stations.csv", "transfers.csv"];

await mkdir(TARGET_DIR, { recursive: true });
const copied = [];
const missing = [];
for (const name of FILES) {
  try {
    // copyFile 保证字节级一致（保留换行与 BOM），utf8 重写可能改动编码
    await copyFile(path.join(SOURCE_DIR, name), path.join(TARGET_DIR, name));
    copied.push(name);
  } catch (error) {
    if (error?.code === "ENOENT") missing.push(name);
    else throw error;
  }
}
if (missing.length) {
  // GitHub Pages 的干净检出不会包含本机 data/；此时使用仓库中已提交的只读种子。
  const unavailable = [];
  for (const name of missing) {
    try {
      await access(path.join(TARGET_DIR, name));
    } catch (error) {
      if (error?.code === "ENOENT") unavailable.push(name);
      else throw error;
    }
  }
  if (unavailable.length) {
    throw new Error(`sync-sample-data: data/ 与 public/sample-data/ 均缺少 ${unavailable.join(", ")}`);
  }
  console.warn(`⚠ sync-sample-data: data/ 缺少 ${missing.join(", ")}，沿用仓库内静态种子。`);
}
console.log(`sample-data 已从 data/ 同步（${copied.length}/${FILES.length}）`);
