// 一次性脚本：把硬编码 /assets/ 与 /sample-data 替换为 siteUrl(...)，并补 import。
// 用法：node .verify/_subpath-fix.mjs
import { readFileSync, writeFileSync } from "node:fs";

function addImport(src, imp) {
  if (src.includes(imp)) return src;
  const lines = src.split("\n");
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i]) || /^\s*export\s+.*\bfrom\s+["']/.test(lines[i])) idx = i;
  }
  if (idx < 0) return src;
  lines.splice(idx + 1, 0, imp);
  return lines.join("\n");
}

const jobs = [
  {
    file: "app/ProjectPortal.tsx",
    imp: 'import { siteUrl } from "./site";',
    repls: [['src="/assets/rail-transit-icon.png"', 'src={siteUrl("assets/rail-transit-icon.png")}']],
  },
  {
    file: "app/entrance/EntranceSignApp.tsx",
    imp: 'import { siteUrl } from "../site";',
    repls: [
      ['const DEFAULT_BACKGROUND = "/assets/space-elevator-station.jpg";', 'const DEFAULT_BACKGROUND = siteUrl("assets/space-elevator-station.jpg");'],
      ['src="/assets/rail-transit-icon.png"', 'src={siteUrl("assets/rail-transit-icon.png")}'],
      ['src="/assets/transfer-t5.png"', 'src={siteUrl("assets/transfer-t5.png")}'],
    ],
  },
  {
    file: "app/transit/render.ts",
    imp: 'import { siteUrl } from "../site";',
    repls: [['const TRAM_ICON_PATH = "/assets/tram.png";', 'const TRAM_ICON_PATH = siteUrl("assets/tram.png");']],
  },
  {
    file: "app/transit/RoutePreviewSvg.tsx",
    imp: 'import { siteUrl } from "../site";',
    repls: [['href="/assets/tram.png"', 'href={siteUrl("assets/tram.png")}']],
  },
  {
    file: "app/transit/styles/loop/loop-render.ts",
    imp: 'import { siteUrl } from "../../site";',
    repls: [['const TRANSFER_ICON_PATH = "/assets/transfer-white.png";', 'const TRANSFER_ICON_PATH = siteUrl("assets/transfer-white.png");']],
  },
  {
    file: "app/transit/styles/loop/LoopRoutePreviewSvg.tsx",
    imp: 'import { siteUrl } from "../../site";',
    repls: [['const TRANSFER_ICON_PATH = "/assets/transfer-white.png";', 'const TRANSFER_ICON_PATH = siteUrl("assets/transfer-white.png");']],
  },
  {
    file: "app/transit/styles/scenic/scenic-render.ts",
    imp: 'import { siteUrl } from "../../site";',
    repls: [['const TRAM_ICON_PATH = "/assets/tram.png";', 'const TRAM_ICON_PATH = siteUrl("assets/tram.png");']],
  },
  {
    file: "app/transit/styles/scenic/ScenicRoutePreviewSvg.tsx",
    imp: 'import { siteUrl } from "../../site";',
    repls: [['href="/assets/tram.png"', 'href={siteUrl("assets/tram.png")}']],
  },
  {
    file: "app/transit/TransitMapApp.tsx",
    imp: 'import { siteUrl } from "../site";',
    repls: [['src="/assets/rail-transit-icon.png"', 'src={siteUrl("assets/rail-transit-icon.png")}']],
  },
  {
    file: "app/wiring/WiringDiagramApp.tsx",
    imp: 'import { siteUrl } from "../site";',
    repls: [['src="/assets/rail-transit-icon.png"', 'src={siteUrl("assets/rail-transit-icon.png")}']],
  },
  {
    file: "app/projects/repositories.ts",
    imp: 'import { siteUrl } from "../site";',
    repls: [['publicRoot = "/sample-data"', 'publicRoot = siteUrl("sample-data")']],
  },
];

let ok = true;
for (const job of jobs) {
  let src = readFileSync(job.file, "utf8");
  for (const [from, to] of job.repls) {
    const count = src.split(from).length - 1;
    if (count === 0) {
      console.error(`✗ 未找到 ${job.file}: ${from}`);
      ok = false;
      continue;
    }
    src = src.split(from).join(to);
    console.log(`✓ ${job.file}: ${count}× ${from.slice(0, 40)}…`);
  }
  src = addImport(src, job.imp);
  writeFileSync(job.file, src);
}
console.log(ok ? "\n全部替换完成" : "\n有未命中，需人工检查");
process.exit(ok ? 0 : 1);
