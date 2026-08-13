// 从活工程数据 data/ 重新生成 public/sample-data/ 部署镜像（static/browser 模式的种子源）。
// 原则：工程数据（data/）是唯一事实源；public/sample-data 只是构建时派生的网页镜像，不手工维护。
// 与 local-data-server 的 createProject 一致——新工程/新种子始终取自当前活数据。
// 用法: node scripts/sync-sample-data.mjs （挂进 dev / build / build:static 前自动执行）
import { copyFile, mkdir } from "node:fs/promises";
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
  console.warn(`⚠ sync-sample-data: data/ 缺少 ${missing.join(", ")}，未生成对应镜像。先运行 npm run data 并确认默认工程数据存在。`);
}
console.log(`sample-data 已从 data/ 同步（${copied.length}/${FILES.length}）`);
