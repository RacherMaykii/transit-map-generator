// 子路径部署回归：把 static-dist 挂到 /transit-map-generator/ 下，
// 验证 GitHub Pages 场景下页面、资源、样例数据与背景图都能正常加载（无 404）。
// 依赖：npm run build:static 已生成 static-dist/
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { startBrowser, newPage, evalJs, waitFor } from "./cdp.mjs";

const ROOT = "static-dist";
const SUB_PATH = "/transit-map-generator";
const PORT = 4176;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const notFound = [];
const server = createServer(async (req, res) => {
  let pathname = decodeURIComponent((req.url || "/").split("?")[0]);
  if (!pathname.startsWith(SUB_PATH)) {
    notFound.push(`${req.url} (outside sub-path)`);
    res.writeHead(404).end("outside sub-path");
    return;
  }
  const rel = pathname.slice(SUB_PATH.length) || "/";
  const file = normalize(join(ROOT, rel === "/" ? "index.html" : rel));
  if (!file.startsWith(normalize(join(ROOT)))) {
    notFound.push(`${req.url} (path traversal)`);
    res.writeHead(404).end("bad path");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(body);
  } catch {
    notFound.push(req.url);
    res.writeHead(404).end("not found");
  }
});

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${PORT}${SUB_PATH}/`;

try {
  await startBrowser();
  await newPage(`${base}?clean=1`);
  await sendEmulate();
  await waitFor("document.querySelector('.portal-tools') !== null", 20000);
  await waitFor("document.querySelector('.project-card') !== null", 25000);
  await new Promise((r) => setTimeout(r, 800));

  const state = await evalJs(`(() => {
    const brand = document.querySelector('.portal-brand img, .brand-mark img, .portal-image img');
    const imgs = [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src);
    const style = getComputedStyle(document.querySelector('.portal-image') || document.body);
    const bg = style.backgroundImage;
    const cards = [...document.querySelectorAll('.project-card h3')].map(h => h.textContent);
    return {
      baseURI: document.baseURI,
      siteBase: location.pathname,
      imgs,
      bg,
      cards,
      error: document.querySelector('.project-empty[role="alert"]')?.textContent ?? null,
    };
  })()`);
  console.log("子路径门户:", JSON.stringify(state, null, 1));

  check("子路径：门户挂载在 /transit-map-generator/ 下", state.siteBase === `${SUB_PATH}/`, `pathname=${state.siteBase}`);
  check("子路径：baseURI 用于计算站点根", new URL(state.baseURI).pathname === `${SUB_PATH}/`, `baseURI=${state.baseURI}`);
  check("子路径：页内图片无加载失败", state.imgs.length === 0, `broken=${JSON.stringify(state.imgs)}`);
  check("子路径：portal 背景图经 vite 相对改写后加载", state.bg.includes("space-elevator-station.jpg"), `bg=${state.bg.slice(0, 120)}`);
  check("子路径：样例项目虚空城从 sample-data 种子载入", state.cards.includes("虚空城"), `cards=${JSON.stringify(state.cards)}`);
  check("子路径：无报错", state.error === null, `error=${state.error}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

// 服务器侧统计：子路径部署下不允许任何 404
check("子路径：服务器全程零 404", notFound.length === 0, notFound.length ? `404=${JSON.stringify(notFound)}` : undefined);

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);

async function sendEmulate() {
  const { send } = await import("./cdp.mjs");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
}
