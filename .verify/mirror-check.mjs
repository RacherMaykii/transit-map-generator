// 浏览器验证：元件库元件镜像（放置镜像 + 选中面板镜像）+ 放置面板镜像设置
// 覆盖：① 未选中组件时"放置方向"下方有水平/垂直镜像；② 放置带镜像的模块/图形；
//       ③ 选中模块/图形后面板出现"镜像"行，开关驱动渲染更新（含站台翻转）。
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

await waitFor(`(() => !!(document.querySelector('.project-card') || document.querySelector('.project-empty')))()`, 15000);
await new Promise((r) => setTimeout(r, 500));
if (!(await evalJs(`!!document.querySelector('.project-card')`))) {
  await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-project-actions button')].find(x => x.textContent.includes('新建项目')); if (b) b.click(); return !!b; })()`);
  await waitFor(`document.querySelector('#new-project-name') !== null`, 8000);
  await evalJs(`(() => {
    const input = document.querySelector('#new-project-name');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '镜像验证');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  await evalJs(`(() => { const form = document.querySelector('.new-project-form'); if (form) form.querySelector('button[type="submit"]').click(); return !!form; })()`);
  await waitFor(`document.querySelectorAll('.project-card').length >= 1`, 12000);
}
await evalJs(`(() => { const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.wiring-svg') !== null", 20000);
await new Promise((r) => setTimeout(r, 800));

// 开启高级模式 → 未选中组件时显示"放置方向"面板
await evalJs(`(() => {
  const label = [...document.querySelectorAll('label.wiring-check')].find(l => l.textContent.includes('高级模式'));
  if (!label) return false;
  const input = label.querySelector('input');
  if (!input.checked) input.click();
  return true;
})()`);
await waitFor(`document.querySelector('.wiring-placement-rotation-panel') !== null`, 8000);

// ── ① 未选中组件：放置方向下方应有水平/垂直镜像 ──
const placementMirror = await evalJs(`(() => {
  const panel = document.querySelector('.wiring-placement-rotation-panel');
  if (!panel) return null;
  const toggle = panel.querySelector('.wiring-mirror-placement');
  if (!toggle) return null;
  const grid = panel.querySelector('.wiring-rotation-grid');
  const afterGrid = !!grid && (grid.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  const btns = [...toggle.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), title: b.title }));
  return { afterGrid, btns };
})()`);
check("放置方向面板下方有镜像开关", !!placementMirror?.afterGrid, placementMirror ? "位于旋转格之下" : "缺失");
check("放置镜像含「水平」", placementMirror?.btns?.[0]?.text.includes("水平"), placementMirror?.btns?.[0]?.title);
check("放置镜像含「垂直」", placementMirror?.btns?.[1]?.text.includes("垂直"), placementMirror?.btns?.[1]?.title);

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
function lastModuleInfo() {
  return evalJs(`(() => {
    const groups = [...document.querySelectorAll('.module-group')];
    const g = groups[groups.length - 1];
    if (!g) return null;
    return { transform: g.getAttribute('transform'), count: groups.length };
  })()`);
}

// ── ② 放置镜像：开启水平镜像后放置"侧式站台站" ──
await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.wiring-mirror-placement button')];
  const h = btns.find(b => b.textContent.includes('水平'));
  if (h && h.getAttribute('aria-pressed') !== 'true') h.click();
  return h ? h.getAttribute('aria-pressed') : null;
})()`);
await clickCard("侧式站台站");
const svgRect1 = await canvasRect();
const p1 = worldPoint(svgRect1, 150, 100);
await clickAt(p1.x, p1.y);
await new Promise((r) => setTimeout(r, 600));
const placedInfo = await lastModuleInfo();
check("水平镜像放置的模块 transform 含 scale(-1 1)", !!placedInfo?.transform?.includes("scale(-1 1"), placedInfo?.transform);

// 放置后模块自动选中：直接读取选中模块面板（镜像行应在"方向"下方）
const selInfo = await evalJs(`(() => {
  const g = [...document.querySelectorAll('.module-group')].pop();
  return { selectedCount: document.querySelectorAll('.module-group.selected').length, lastSelected: !!g?.classList.contains('selected') };
})()`);
check("放置后模块自动选中", selInfo?.selectedCount === 1, JSON.stringify(selInfo));

const modulePanel = await evalJs(`(() => {
  const rows = [...document.querySelectorAll('.wiring-prop-row')];
  const mirrorRow = rows.find(row => row.querySelector('label')?.textContent.trim() === '镜像');
  if (!mirrorRow) return null;
  const dirRow = rows.find(row => row.querySelector('label')?.textContent.trim() === '方向');
  const afterDir = !!dirRow && (dirRow.compareDocumentPosition(mirrorRow) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  const btns = [...mirrorRow.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), active: b.classList.contains('active'), pressed: b.getAttribute('aria-pressed') }));
  return { afterDir, btns };
})()`);
check("选中模块面板含「镜像」行且在「方向」下方", !!modulePanel?.afterDir, modulePanel ? JSON.stringify(modulePanel.btns) : "缺失");
check("水平镜像按钮为激活态", modulePanel?.btns?.[0]?.active === true, `pressed=${modulePanel?.btns?.[0]?.pressed}`);

// 面板开启垂直镜像：模块自有站台随镜像换位（模板站台左右对称，换位后位置集合不变，但顺序变化），transform 变为 scale(-1 -1)
const platformCenters = () => evalJs(`(() => {
  const g = [...document.querySelectorAll('.module-group')].pop();
  return {
    transform: g?.getAttribute('transform') ?? null,
    centers: [...document.querySelectorAll('rect.platform')].map(el => { const r = el.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }),
  };
})()`);
const beforeVertical = await platformCenters();
await evalJs(`(() => {
  const rows = [...document.querySelectorAll('.wiring-prop-row')];
  const mirrorRow = rows.find(row => row.querySelector('label')?.textContent.trim() === '镜像');
  const v = [...mirrorRow.querySelectorAll('button')].find(b => b.textContent.includes('垂直'));
  if (v) v.click();
  return !!v;
})()`);
await new Promise((r) => setTimeout(r, 500));
const afterVertical = await platformCenters();
check("面板开启垂直后 transform 含 scale(-1 -1)", !!afterVertical?.transform?.includes("scale(-1 -1"), afterVertical?.transform);
const beforeSorted = [...(beforeVertical?.centers || [])].sort((a, b) => a - b).join(",");
const afterSorted = [...(afterVertical?.centers || [])].sort((a, b) => a - b).join(",");
const beforeOrdered = (beforeVertical?.centers || []).join(",");
const afterOrdered = (afterVertical?.centers || []).join(",");
check("站台随垂直镜像换位（顺序变化、集合守恒）", beforeOrdered !== afterOrdered && beforeSorted === afterSorted, `before=[${beforeOrdered}] after=[${afterOrdered}]`);

// 关闭镜像：先关水平（保留垂直），再关垂直，逐步验证 transform
const toggleMirrorBtn = (label) => evalJs(`(() => {
  const rows = [...document.querySelectorAll('.wiring-prop-row')];
  const mirrorRow = rows.find(row => row.querySelector('label')?.textContent.trim() === '镜像');
  if (!mirrorRow) return false;
  const b = [...mirrorRow.querySelectorAll('button')].find(x => x.textContent.includes('${label}'));
  if (!b) return false;
  b.click();
  return true;
})()`);
await toggleMirrorBtn("水平");
await new Promise((r) => setTimeout(r, 400));
const oneOff = await lastModuleInfo();
check("关水平后仅剩垂直镜像 scale(1 -1", !!oneOff?.transform?.includes("scale(1 -1"), oneOff?.transform);
await toggleMirrorBtn("垂直");
await new Promise((r) => setTimeout(r, 400));
const clearedInfo = await lastModuleInfo();
check("取消镜像后 transform 不含 scale", !clearedInfo?.transform?.includes("scale"), clearedInfo?.transform);

// 取消选择（点空白处），回到放置面板
await clickAt(svgRect1.left + 30, svgRect1.top + 30);
await new Promise((r) => setTimeout(r, 400));

// ── 图形/信号机镜像：放置垂直镜像 + 面板开关 ──
await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.wiring-mirror-placement button')];
  const h = btns.find(b => b.textContent.includes('水平'));
  const v = btns.find(b => b.textContent.includes('垂直'));
  if (h && h.getAttribute('aria-pressed') === 'true') h.click();
  if (v && v.getAttribute('aria-pressed') !== 'true') v.click();
  return true;
})()`);
await clickCard("进站信号机");
const svgRect2 = await canvasRect();
const p2 = worldPoint(svgRect2, 450, 100);
await clickAt(p2.x, p2.y);
await new Promise((r) => setTimeout(r, 600));
const graphicInfo = await evalJs(`(() => {
  const shape = document.querySelector('.shape-graphic');
  if (!shape) return null;
  const g = shape.parentElement;
  return { transform: g?.getAttribute('transform'), shapeType: shape.getAttribute('data-shape-type') };
})()`);
check("垂直镜像放置的进站信号机 transform 含 scale(1 -1", !!graphicInfo?.transform?.includes("scale(1 -1"), graphicInfo?.transform);

// 选中信号机（放置后可能自动选中；未选中则点击其中心）→ 图形面板镜像行
const graphicSelected = await evalJs(`(() => {
  const shape = document.querySelector('.shape-graphic');
  if (!shape) return null;
  return !!shape.closest('g').parentElement.querySelector('.selection-box');
})()`);
if (!graphicSelected) {
  const gcenter = await evalJs(`(() => {
    const shape = document.querySelector('.shape-graphic');
    if (!shape) return null;
    const r = shape.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  await clickAt(gcenter.x, gcenter.y);
  await new Promise((r) => setTimeout(r, 500));
}
const graphicPanel = await evalJs(`(() => {
  const rows = [...document.querySelectorAll('.wiring-prop-row')];
  const mirrorRow = rows.find(row => row.querySelector('label')?.textContent.trim() === '镜像');
  if (!mirrorRow) return null;
  const btns = [...mirrorRow.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), active: b.classList.contains('active') }));
  return { btns };
})()`);
check("图形面板含「镜像」行且垂直为激活态", !!graphicPanel && graphicPanel.btns[1].active === true, graphicPanel ? JSON.stringify(graphicPanel.btns) : "缺失");

await evalJs(`(() => {
  const rows = [...document.querySelectorAll('.wiring-prop-row')];
  const mirrorRow = rows.find(row => row.querySelector('label')?.textContent.trim() === '镜像');
  const h = [...mirrorRow.querySelectorAll('button')].find(b => b.textContent.includes('水平'));
  if (h) h.click();
  return !!h;
})()`);
await new Promise((r) => setTimeout(r, 500));
const graphicBoth = await evalJs(`(() => {
  const shape = document.querySelector('.shape-graphic');
  if (!shape) return null;
  const g = shape.parentElement;
  return g?.getAttribute('transform');
})()`);
check("图形面板开水平后 transform 含 scale(-1 -1", !!graphicBoth?.includes("scale(-1 -1"), graphicBoth);

await screenshot(".verify/mirror-check.png");
check("已截图 .verify/mirror-check.png", true);

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
