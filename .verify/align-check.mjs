// 浏览器验证：吸附打开时，能对齐的端点是否默认对齐
// 现状检查（改进前）：alignModuleToTrackPorts 阈值 = gridSize(20)。
//   标准双线区间端口 y=36/76；上分叉输入 y=76/116(偏移+40)；Y形输入 y=52/92(偏移+16)。
//   预期：区间↔Y形 可对齐(16≤20)；区间↔上分叉 不可对齐(40>20)。
// 脚本：放双线区间，再在其右侧同 y 放分叉，读分叉实际 translate：
//   对齐成功 → 分叉上移 spacing 差，输入端口与区间输出端口 y 持平。
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
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '对齐验证');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  await evalJs(`(() => { const form = document.querySelector('.new-project-form'); if (form) form.querySelector('button[type="submit"]').click(); return !!form; })()`);
  await waitFor(`document.querySelectorAll('.project-card').length >= 1`, 12000);
}
await evalJs(`(() => { const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.wiring-svg') !== null", 20000);
await new Promise((r) => setTimeout(r, 800));

// 开高级模式，端口任何状态都渲染
await evalJs(`(() => {
  const label = [...document.querySelectorAll('label.wiring-check')].find(l => l.textContent.trim() === '高级模式');
  const cb = label && label.querySelector('input[type=checkbox]');
  if (cb && !cb.checked) cb.click();
  return !!cb;
})()`);
await new Promise((r) => setTimeout(r, 300));

// 确认吸附默认开启
const snapOn = await evalJs(`(() => {
  const label = [...document.querySelectorAll('label.wiring-check')].find(l => l.textContent.trim() === '吸附');
  return !!label && label.querySelector('input[type=checkbox]').checked;
})()`);
check("吸附默认开启", snapOn === true, `snap=${snapOn}`);

const svgRect = await evalJs(`(() => { const s = document.querySelector('.wiring-svg').getBoundingClientRect(); return { left: s.left, top: s.top }; })()`);
function worldPoint(wx, wy) { return { x: svgRect.left + 100 + wx * 0.75, y: svgRect.top + 60 + wy * 0.75 }; }
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
async function placeCard(name, wx, wy) {
  const ok = await clickCard(name);
  if (!ok) return false;
  const pt = worldPoint(wx, wy);
  await clickAt(pt.x, pt.y);
  await new Promise((r) => setTimeout(r, 500));
  return true;
}
/** 读第 idx 个模块（DOM 顺序=创建顺序）的 translate 与各端口本地坐标。 */
async function moduleGeo(idx) {
  return await evalJs(`(() => {
    const g = document.querySelectorAll('.module-group')[${idx}];
    if (!g) return null;
    const t = g.getAttribute('transform');
    const m = /translate\\((\\d+)\\.?(\\d*),(\\d+)\\.?(\\d*)\\)/.exec(t);
    const mx = parseInt(m[1], 10), my = parseInt(m[3], 10);
    const ports = [...g.querySelectorAll('.port')].map((c) => ({
      id: c.getAttribute('data-port-id') || c.getAttribute('class'),
      cx: parseFloat(c.getAttribute('cx')), cy: parseFloat(c.getAttribute('cy')),
    }));
    return { mx, my, ports };
  })()`);
}

// ── 场景 1：双线区间 + 右侧上分叉（同 y） ──
// 区间(200,300) R_up 世界 y = 300+36=336；上分叉输入 L_up1 本地 y=76。
// 对齐成功 → 分叉 my=260（300-40），输入世界 y=336；失败 → my=300，输入 y=376。
await placeCard("双线区间", 200, 300);
await placeCard("双线斜上分叉", 500, 300);
const upFork = await moduleGeo(1);
const section = await moduleGeo(0);
if (section && upFork) {
  const secRUpY = section.my + 36;
  const forkLUpY = upFork.my + 76;
  check("上分叉 my 被对齐算法修正（300→260）", Math.abs(upFork.my - 260) <= 1, `my=${upFork.my}`);
  check("上分叉输入端口与区间输出端口 y 持平", Math.abs(forkLUpY - secRUpY) <= 1, `fork输入=${forkLUpY} vs 区间输出=${secRUpY}`);
} else {
  check("上分叉场景读到模块几何", false, JSON.stringify({ section, upFork }));
}

// ── 场景 2：双线区间 + 右侧 Y 形分叉（同 y） ──
// 区间(200,600) R_up 世界 y=636；Y形输入 L_up1 本地 y=52。
// 对齐成功 → 分叉 my=584（600-16），输入世界 y=636；失败 → my=600，输入 y=652。
await placeCard("双线区间", 200, 600);
await placeCard("双线Y形分叉", 500, 600);
const yFork = await moduleGeo(3);
if (section && yFork) {
  const secRUpY2 = 600 + 36;
  const forkLUpY2 = yFork.my + 52;
  check("Y形分叉 my 被对齐算法修正（600→584）", Math.abs(yFork.my - 584) <= 1, `my=${yFork.my}`);
  check("Y形输入端口与区间输出端口 y 持平", Math.abs(forkLUpY2 - secRUpY2) <= 1, `fork输入=${forkLUpY2} vs 区间输出=${secRUpY2}`);
} else {
  check("Y形分叉场景读到模块几何", false, JSON.stringify(yFork));
}

// ── 场景 3：并行错开 40px 的区间不得被吸到一起 ──
// 区间(200,900) 下方再放一条区间(200,940)：端口各朝左右、彼此不相望，
// 必须保持 my=940（不吸到 900）。
await placeCard("双线区间", 200, 900);
await placeCard("双线区间", 200, 940);
const allPos = await evalJs(`(() => [...document.querySelectorAll('.module-group')].map((g) => {
  const t = g.getAttribute('transform');
  const m = /translate\\(([\\d-]+)\\.?\\d*,\\s*([\\d-]+)\\.?\\d*\\)/.exec(t);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}))()`);
// 并行区间的模块（x=200）应保持四组：300/600/900/940，第二条 940 不得被吸到 900。
const x200 = (allPos || []).filter((p) => p && p[0] === 200).map((p) => p[1]).sort((a, b) => a - b);
check("并行区间 40px 错开不被吸附", JSON.stringify(x200) === "[300,600,900,940]", `x200 y=${JSON.stringify(x200)}`);

await screenshot(".verify/align-check.png");

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
