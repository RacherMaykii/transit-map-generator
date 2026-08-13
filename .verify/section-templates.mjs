// 浏览器验证：单线区间 + 单站台（无线路）+ 元件库顺序（单站台→单线区间→双线区间）
import { startBrowser, newPage, evalJs, waitFor, clickAt, screenshot, send } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await startBrowser();
await newPage("http://127.0.0.1:3000/");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);
await evalJs(`localStorage.setItem('metro-wiring-tutorial-dismissed', 'true')`);
await send("Page.reload", { ignoreCache: true });
await waitFor(`(() => {
  const btns = [...document.querySelectorAll('.portal-tools button')];
  return btns.some(b => b.textContent.includes('配线图'));
})()`, 20000);
await new Promise((r) => setTimeout(r, 500));

await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.portal-tools button')];
  const btn = btns.find(b => b.textContent.includes('配线图'));
  if (btn) btn.click();
  return !!btn;
})()`);
await waitFor(`(() => {
  const b = [...document.querySelectorAll('.portal-tools button')].find(x => x.textContent.includes('配线图'));
  return b && b.getAttribute('aria-pressed') === 'true';
})()`, 8000);

// 打开（或新建）项目
await waitFor(`(() => !!(document.querySelector('.project-card') || document.querySelector('.project-empty')))()`, 15000);
await new Promise((r) => setTimeout(r, 500));
if (!(await evalJs(`!!document.querySelector('.project-card')`))) {
  await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-project-actions button')].find(x => x.textContent.includes('新建项目')); if (b) b.click(); return !!b; })()`);
  await waitFor(`document.querySelector('#new-project-name') !== null`, 8000);
  await evalJs(`(() => {
    const input = document.querySelector('#new-project-name');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '验证工程');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  await evalJs(`(() => { const form = document.querySelector('.new-project-form'); if (form) form.querySelector('button[type="submit"]').click(); return !!form; })()`);
  await waitFor(`document.querySelectorAll('.project-card').length >= 1`, 12000);
}
await evalJs(`(() => { const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.wiring-svg') !== null", 20000);
await new Promise((r) => setTimeout(r, 800));

// ── 元件库顺序：区间与车站分类 ──
const sectionOrder = await evalJs(`(() => {
  const cat = [...document.querySelectorAll('.wiring-template-category')].find(c => c.querySelector('h4')?.textContent === '区间与车站');
  if (!cat) return null;
  return [...cat.querySelectorAll('.wiring-template-card b')].map(b => b.textContent);
})()`);
check("区间与车站分类存在", Array.isArray(sectionOrder), sectionOrder ? sectionOrder.join("、") : "null");
if (Array.isArray(sectionOrder)) {
  check("顺序：单站台在最上", sectionOrder[0] === "单站台", sectionOrder[0]);
  check("顺序：单线区间在双线区间上", sectionOrder.indexOf("单线区间") === 1 && sectionOrder[1] === "单线区间", `${sectionOrder[1]}@1`);
  check("顺序：双线区间紧随其后", sectionOrder[2] === "双线区间", sectionOrder[2]);
}

async function canvasRect() {
  return await evalJs(`(() => { const s = document.querySelector('.wiring-svg').getBoundingClientRect(); return { left: s.left, top: s.top }; })()`);
}
function worldPoint(svgRect, wx, wy) { return { x: svgRect.left + 100 + wx * 0.75, y: svgRect.top + 60 + wy * 0.75 }; }
async function clickCard(name) {
  const center = await evalJs(`(() => {
    const card = [...document.querySelectorAll('.wiring-template-card')].find(c => c.querySelector('b')?.textContent === '${name}');
    if (!card) return null;
    card.scrollIntoView({ block: 'center', inline: 'center' });
    const r = card.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!center) return false;
  await clickAt(center.x, center.y);
  await new Promise((r) => setTimeout(r, 300));
  return true;
}

// ── 放置单线区间 ──
await clickCard("单线区间");
const svgRect1 = await canvasRect();
const p1 = worldPoint(svgRect1, 150, 100);
await clickAt(p1.x, p1.y);
await new Promise((r) => setTimeout(r, 600));
const singleTrackStats = await evalJs(`(() => {
  const g = document.querySelector('.module-group');
  if (!g) return null;
  return {
    tracks: g.querySelectorAll('line.track, path.track').length,
    ports: g.querySelectorAll('circle.port').length,
    platforms: g.querySelectorAll('rect.platform').length,
  };
})()`);
check("单线区间：1 条轨道", singleTrackStats?.tracks === 1, JSON.stringify(singleTrackStats));
check("单线区间：2 个端口", singleTrackStats?.ports === 2, JSON.stringify(singleTrackStats));
const platformCount1 = await evalJs(`document.querySelectorAll('.wiring-svg rect.platform').length`);
check("单线区间：无站台", platformCount1 === 0, `全局站台数=${platformCount1}`);

// ── 放置单站台 ──
await clickCard("单站台");
const svgRect2 = await canvasRect();
const p2 = worldPoint(svgRect2, 450, 100);
await clickAt(p2.x, p2.y);
await new Promise((r) => setTimeout(r, 600));
const platformStats = await evalJs(`(() => {
  const groups = [...document.querySelectorAll('.module-group')];
  const g = groups[groups.length - 1];
  if (!g) return null;
  return {
    tracks: g.querySelectorAll('line.track, path.track').length,
    ports: g.querySelectorAll('circle.port').length,
  };
})()`);
const globalPlatformCount = await evalJs(`document.querySelectorAll('.wiring-svg rect.platform').length`);
check("单站台：0 条轨道", platformStats?.tracks === 0, JSON.stringify(platformStats));
check("单站台：1 个站台（独立站台元素）", globalPlatformCount === 1, `全局站台数=${globalPlatformCount}`);
check("单站台：无端口", platformStats?.ports === 0, JSON.stringify(platformStats));

await screenshot(".verify/section-templates-check.png");
check("已截图 .verify/section-templates-check.png", true);

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
