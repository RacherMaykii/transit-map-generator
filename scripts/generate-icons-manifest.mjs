// 从 public/sample-icons 目录重建 manifest.json（静态模式通过它列出可用图标）。
// 用法: node scripts/generate-icons-manifest.mjs
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, "public", "sample-icons");
const MANIFEST = path.join(DIR, "manifest.json");

const icons = (await readdir(DIR))
  .filter((name) => name !== "manifest.json" && /\.(png|jpe?g|ico)$/i.test(name))
  .sort((a, b) => a.localeCompare(b, "zh-CN"));

await writeFile(MANIFEST, `${JSON.stringify(icons, null, 2)}\n`, "utf8");
console.log(`manifest.json 已更新：${icons.length} 个图标`);
