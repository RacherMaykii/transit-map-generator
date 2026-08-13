// 浏览器验证：切换模块 zIndex 后，所属站台跟随，连接线不再盖在站台上方
// 场景：岛式站台站 + 双线区间，手动连 R_up→L_up（双线连接自动补 R_dn→L_dn）。
// 断言 SVG DOM 顺序（= 绘制顺序）：初始连接在站台上方；置顶后站台升到连接上方；
// 属性面板 Z-Index 改 0 → 站台回落连接下方；改 5 → 站台再升到上方。
// 注意：handleModuleMouseDown 在"连接"工具下直接 return，点平台选中模块前必须先切回"自动"工具。
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
async function clickTool(name) {
  const ok = await evalJs(`(() => {
    const b = [...document.querySelectorAll('.wiring-segmented button')].find(x => x.textContent.trim() === '${name}');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  return ok;
}
async function clickPort(wx, wy) {
  const p = await evalJs(`(() => {
    const svg = document.querySelector('.wiring-svg');
    const rect = svg.getBoundingClientRect();
    const ex = rect.left + 100 + ${wx} * 0.75;
    const ey = rect.top + 60 + ${wy} * 0.75;
    let best = null, bestDist = Infinity;
    for (const c of document.querySelectorAll('.port')) {
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = Math.hypot(cx - ex, cy - ey);
      if (d < bestDist) { bestDist = d; best = { x: cx, y: cy }; }
    }
    return { x: best ? best.x : -1, y: best ? best.y : -1, dist: bestDist };
  })()`);
  if (!p || p.dist > 15) return false;
  await clickAt(p.x, p.y);
  return true;
}
/** SVG 绘制顺序：视口组内平台 <g> 与各连接 <g> 的兄弟下标。下标大 = 后渲染 = 盖在上面。 */
async function zOrder() {
  return await evalJs(`(() => {
    const connGroups = [...document.querySelectorAll('.connection-group')];
    const platformG = document.querySelector('rect.platform.independent-platform')?.parentElement;
    if (!platformG || connGroups.length === 0) return null;
    const host = connGroups[0].parentElement;
    const children = [...host.children];
    const platform = children.indexOf(platformG);
    const connections = connGroups.map(g => children.indexOf(g));
    return { platform, connections, count: children.length };
  })()`);
}
/** 读属性面板 Z-Index 输入框当前值（需先开启高级模式并选中模块）。 */
async function readZIndex() {
  return await evalJs(`(() => {
    const row = [...document.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === 'Z-Index');
    return row ? row.querySelector('input[type=number]')?.value : null;
  })()`);
}
async function setZIndex(value) {
  const ok = await evalJs(`(() => {
    const row = [...document.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === 'Z-Index');
    const input = row && row.querySelector('input[type=number]');
    if (!input) return false;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '${value}');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 400));
  return ok;
}

// ── 1. 放置岛式站台站 + 双线区间（网格 20 对齐坐标） ──
await clickCard("岛式站台站");
let svgRect = await canvasRect();
let pt = worldPoint(svgRect, 160, 100);
await clickAt(pt.x, pt.y);
await new Promise((r) => setTimeout(r, 600));

await clickCard("双线区间");
svgRect = await canvasRect();
pt = worldPoint(svgRect, 200, 260);
await clickAt(pt.x, pt.y);
await new Promise((r) => setTimeout(r, 600));

const counts = await evalJs(`(() => ({
  modules: document.querySelectorAll('.module-group').length,
  platforms: document.querySelectorAll('rect.platform.independent-platform').length,
}))()`);
check("已有 2 个模块 + 1 个物化站台", counts.modules === 2 && counts.platforms === 1, JSON.stringify(counts));

// ── 2. 连接工具：站台 R_up → 区间 L_up（双线连接自动补下行走线） ──
await clickTool("连接");
await clickPort(340, 136); // 站台 R_up（站台在 (160,100)）
await new Promise((r) => setTimeout(r, 200));
const startOk = await evalJs(`document.querySelector('.port.connect-start') !== null`);
check("起点端口已高亮 connect-start", startOk);
await clickPort(200, 296); // 区间 L_up（区间在 (200,260)）
await new Promise((r) => setTimeout(r, 700));
const connCount = await evalJs(`document.querySelectorAll('.connection-group').length`);
check("已创建 2 条连接（双线连接）", connCount === 2, `connection=${connCount}`);

// ── 3. 初始层级：连接在站台上方（用户报的 bug 态） ──
const order0 = await zOrder();
check("初始：连接在站台上方", order0 !== null && order0.connections.every((i) => i > order0.platform), JSON.stringify(order0));

// ── 4. 切回「自动」工具（连接工具下点模块/站台不会选中） ──
await clickTool("自动");

// ── 5. 开启高级模式，让 Z-Index 输入可用 ──
await evalJs(`(() => {
  const label = [...document.querySelectorAll('label.wiring-check')].find(l => l.textContent.trim() === '高级模式');
  const cb = label && label.querySelector('input[type=checkbox]');
  if (cb && !cb.checked) cb.click();
  return !!cb;
})()`);
await new Promise((r) => setTimeout(r, 300));

// ── 6. 点站台左半选中所属模块（岛式站台站，避开关联线） ──
const platPt = await evalJs(`(() => {
  const r = document.querySelector('rect.platform.independent-platform');
  if (!r) return null;
  const b = r.getBoundingClientRect();
  return { x: b.left + b.width * 0.25, y: b.top + b.height / 2 };
})()`);
await clickAt(platPt.x, platPt.y);
await new Promise((r) => setTimeout(r, 300));
const selInfo = await evalJs(`(() => {
  const sel = document.querySelector('.module-group.selected');
  return {
    isStation: !!sel && sel.getAttribute('transform').startsWith('translate(160,'),
    hasPanel: [...document.querySelectorAll('.wiring-prop-actions button')].some(b => b.textContent.includes('置于顶层')),
  };
})()`);
const ziBefore = await readZIndex();
check("选中岛式站台站模块", selInfo.isStation && selInfo.hasPanel, JSON.stringify(selInfo));
check("站台模块初始 Z-Index=0", ziBefore === "0", `Z-Index=${ziBefore}`);

// ── 7.「⬆ 置于顶层」：站台应升到连接上方 ──
await evalJs(`(() => { const b = [...document.querySelectorAll('.wiring-prop-actions button')].find(x => x.textContent.includes('置于顶层')); if (b) b.click(); return !!b; })()`);
await new Promise((r) => setTimeout(r, 400));
const order1 = await zOrder();
const ziTop = await readZIndex();
check("置顶后：站台升到连接上方", order1 !== null && order1.platform > Math.max(...order1.connections), JSON.stringify(order1));
check("置顶后 Z-Index=2", ziTop === "2", `Z-Index=${ziTop}`);
await screenshot(".verify/zindex-platform-top.png");

// ── 8. 属性面板 Z-Index 改 0 → 站台回落连接下方 ──
await setZIndex("0");
const order2 = await zOrder();
check("Z-Index=0：站台回落到连接下方", order2 !== null && order2.platform < Math.min(...order2.connections), JSON.stringify(order2));

// ── 9. Z-Index 改 5 → 站台再升到连接上方 ──
await setZIndex("5");
const order3 = await zOrder();
const ziEnd = await readZIndex();
check("Z-Index=5：站台再次升到连接上方", order3 !== null && order3.platform > Math.max(...order3.connections), JSON.stringify(order3));
check("Z-Index 输入框已更新为 5", ziEnd === "5", `Z-Index=${ziEnd}`);
await screenshot(".verify/zindex-platform-final.png");

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
