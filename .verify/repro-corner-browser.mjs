// 浏览器验证：转角（0°站台 + 90°/270°交叉渡线）与道岔贴邻的自动连接无交叉。
// 用法：node repro-corner-browser.mjs <场景名>
import { startBrowser, newPage, evalJs, waitFor, clickAt, screenshot, send } from "./cdp.mjs";

const scenario = process.argv[2] || "corner-270";
const SCENARIOS = {
  "corner-270": { first: "岛式站台站", name: "交叉渡线", rot: 270, x: 320, y: 400, label: "岛式站台0° + 交叉渡线270° @(320,400) 转角(干净双连接)" },
  "corner-90": { first: "岛式站台站", name: "交叉渡线", rot: 90, x: 320, y: 400, label: "岛式站台0° + 交叉渡线90° @(320,400) 转角(干净双连接)" },
  "corner-0": { first: "岛式站台站", name: "交叉渡线", rot: 0, x: 400, y: 300, label: "岛式站台0° + 交叉渡线0° @(400,300) 直线" },
  "corner-180": { first: "岛式站台站", name: "交叉渡线", rot: 180, x: 400, y: 300, label: "岛式站台0° + 交叉渡线180° @(400,300) 直线" },
  "turnout-400": { first: "侧式站台站", name: "左开道岔", rot: 0, x: 400, y: 300, label: "侧式站台0° + 左开道岔0° @(400,300) 贴邻" },
  "turnout-adj": { first: "侧式站台站", name: "左开道岔", rot: 180, x: 400, y: 300, label: "侧式站台0° + 左开道岔180° @(400,300) 贴邻" },
  "fix-crossisland": { first: "同台换乘站", name: "双岛四线站", rot: 0, x: 420, y: 240, label: "同台换乘站0° + 双岛四线站0° @(420,240) 渲染级修复(应无交叉)" },
  "regress-branch180": { first: "支线分岔", name: "对称支线分岔", rot: 180, x: 340, y: 360, label: "支线分岔0° + 对称支线分岔180° @(340,360) 渲染级检查(应无交叉)" },
};
const S = SCENARIOS[scenario] || SCENARIOS["corner-270"];
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`); }
function crossInfo(d1, d2) {
  const sample = (pathD) => {
    const commands = pathD.match(/[MLCQ][^MLCQ]*/g) || [];
    const pts = []; let current = null;
    for (const command of commands) {
      const values = (command.slice(1).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      if (command[0] === "M") { current = { x: values[0], y: values[1] }; pts.push(current); continue; }
      if (!current) continue;
      if (command[0] === "L") { const e = { x: values[0], y: values[1] }; pts.push(e); current = e; continue; }
      if (command[0] === "Q") { const [x1, y1, x2, y2] = values; const s = current; for (let i = 1; i <= 32; i++) { const t = i / 32, mt = 1 - t; pts.push({ x: mt * mt * s.x + 2 * mt * t * x1 + t * t * x2, y: mt * mt * s.y + 2 * mt * t * y1 + t * t * y2 }); } current = { x: x2, y: y2 }; }
      else if (command[0] === "C") { const [x1, y1, x2, y2, x3, y3] = values; const s = current; for (let i = 1; i <= 32; i++) { const t = i / 32, mt = 1 - t; pts.push({ x: mt * mt * mt * s.x + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3, y: mt * mt * mt * s.y + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3 }); } current = { x: x3, y: y3 }; }
    }
    return pts;
  };
  const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSeg = (p, q, r) => q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  const p1 = sample(d1), p2 = sample(d2);
  let n = 0;
  for (let i = 0; i < p1.length - 1; i++) for (let j = 0; j < p2.length - 1; j++) {
    const a = p1[i], b = p1[i + 1], c = p2[j], d = p2[j + 1];
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    const touch = (o1 === 0 && onSeg(a, c, b)) || (o2 === 0 && onSeg(a, d, b)) || (o3 === 0 && onSeg(c, a, d)) || (o4 === 0 && onSeg(c, b, d));
    if (touch) continue;
    if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) n++;
  }
  return n;
}
function connectionPaths() {
  return evalJs(`(() => {
    const groups = [...document.querySelectorAll('.connection-group')];
    return groups.map(g => {
      const p = g.querySelector('path.connection-track');
      if (p) return p.getAttribute('d');
      const l = g.querySelector('line.connection-track');
      if (l) return 'M' + l.getAttribute('x1') + ',' + l.getAttribute('y1') + ' L' + l.getAttribute('x2') + ',' + l.getAttribute('y2');
      return null;
    }).filter(Boolean);
  })()`);
}

await startBrowser();
await newPage("http://127.0.0.1:3000/");
await send("Emulation.setDeviceMetricsOverride", { width: 1700, height: 1000, deviceScaleFactor: 1, mobile: false });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);
await evalJs(`localStorage.setItem('metro-wiring-tutorial-dismissed', 'true')`);
await evalJs(`(async () => {
  const dbs = await indexedDB.databases().catch(() => []);
  for (const db of dbs) {
    if (db.name) await new Promise((res) => { const r = indexedDB.deleteDatabase(db.name); r.onsuccess = r.onerror = r.onblocked = res; });
  }
  return true;
})()`);
await send("Page.reload", { ignoreCache: true });
await waitFor(`(() => { const b = [...document.querySelectorAll('.portal-tools button')].find(x => x.textContent.includes('配线图')); return !!b; })()`, 20000);
await new Promise((r) => setTimeout(r, 500));
await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-tools button')].find(x => x.textContent.includes('配线图')); if (b) b.click(); return !!b; })()`);
await waitFor(`(() => !!document.querySelector('.project-card') || !!document.querySelector('.project-empty'))()`, 15000);
await new Promise((r) => setTimeout(r, 500));
if (!(await evalJs(`!!document.querySelector('.project-card')`))) {
  await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-project-actions button')].find(x => x.textContent.includes('新建项目')); if (b) b.click(); return !!b; })()`);
  await waitFor(`document.querySelector('#new-project-name') !== null`, 8000);
  await evalJs(`(() => {
    const input = document.querySelector('#new-project-name');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '转角道岔复现');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  await evalJs(`(() => { const form = document.querySelector('.new-project-form'); if (form) form.querySelector('button[type="submit"]').click(); return !!form; })()`);
  await waitFor(`document.querySelectorAll('.project-card').length >= 1`, 12000);
}
await evalJs(`(() => { const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.wiring-svg') !== null", 20000);
await new Promise((r) => setTimeout(r, 800));

async function canvasRect() { return await evalJs(`(() => { const s = document.querySelector('.wiring-svg').getBoundingClientRect(); return { left: s.left, top: s.top }; })()`); }
async function viewportTransform() {
  return await evalJs(`(() => {
    const g = document.querySelector('.wiring-svg g[transform*="scale("]');
    if (!g) return null;
    const t = g.getAttribute('transform');
    const mt = t.match(/translate\\(([-\\d.]+),([-\\d.]+)\\)\\s*scale\\(([-\\d.]+)\\)/);
    return mt ? { panX: parseFloat(mt[1]), panY: parseFloat(mt[2]), scale: parseFloat(mt[3]) } : null;
  })()`);
}
async function worldPoint(svgRect, wx, wy) {
  const vp = await viewportTransform();
  if (!vp) return { x: svgRect.left + 100 + wx * 0.75, y: svgRect.top + 60 + wy * 0.75 };
  return { x: svgRect.left + vp.panX + wx * vp.scale, y: svgRect.top + vp.panY + wy * vp.scale };
}
async function selectTemplate(name) {
  const center = await evalJs(`(() => {
    const card = [...document.querySelectorAll('.wiring-template-card')].find(c => c.textContent.includes('${name}'));
    if (!card) return null;
    card.scrollIntoView({ block: 'center', inline: 'center' });
    const r = card.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!center) return false;
  await clickAt(center.x, center.y);
  await new Promise((r) => setTimeout(r, 250));
  const active = await evalJs(`(() => {
    const card = [...document.querySelectorAll('.wiring-template-card')].find(c => c.textContent.includes('${name}'));
    return card && card.classList.contains('active');
  })()`);
  if (!active) { await clickAt(center.x, center.y); await new Promise((r) => setTimeout(r, 250)); }
  return true;
}
async function setPlacementRotation(deg) {
  const label = { 180: "向左 180°", 90: "向下 90°", 270: "向上 270°" }[deg];
  if (!label) return false;
  const clicked = await evalJs(`(() => {
    const panel = document.querySelector('.wiring-placement-rotation');
    if (!panel) return false;
    const btn = [...panel.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '') === '${label}');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 300));
  return clicked;
}

const rect = await canvasRect();
await selectTemplate(S.first);
const pa = await worldPoint(rect, 200, 300);
await clickAt(pa.x, pa.y);
await new Promise((r) => setTimeout(r, 500));

await selectTemplate(S.name);
if (S.rot !== 0) {
  const ok = await setPlacementRotation(S.rot);
  console.log(`  [放置旋转 ${S.rot}° ${ok ? "已设置" : "设置失败"}]`);
}
const pb = await worldPoint(rect, S.x, S.y);
await clickAt(pb.x, pb.y);
await new Promise((r) => setTimeout(r, 900));

const moduleTransforms = await evalJs(`[...document.querySelectorAll('.module-group')].map(g => g.getAttribute('transform'))`);
const connCount = await evalJs(`document.querySelectorAll('.connection-group').length`);
const paths = await connectionPaths();
let totalCross = 0;
for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) totalCross += crossInfo(paths[i], paths[j]);

check("放置了2个模块", moduleTransforms.length >= 2, moduleTransforms.join(" | "));
check("形成连接（≥1条轨道）", connCount >= 1, `连接数=${connCount}`);
check("轨道无交叉", totalCross === 0, `cross=${totalCross}, 轨道数=${paths.length}`);
await screenshot(`.verify/repro-corner-${scenario}.png`);

console.log("\n==== 结果汇总 ====");
console.log(`场景: ${S.label}`);
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) { failed.forEach((f) => console.log(`  ✗ ${f.name}`)); process.exit(1); }
process.exit(0);
