// 浏览器验证：基础元素单独锁定（画布解锁徽标）+ 元件库分类单独收起 + 道岔长度/间距范围放宽
// 前提：.verify/profile 已被删除（干净 IndexedDB）
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

const svgRect = await evalJs(`(() => { const s = document.querySelector('.wiring-svg').getBoundingClientRect(); return { left: s.left, top: s.top }; })()`);
function worldPoint(wx, wy) { return { x: svgRect.left + 100 + wx * 0.75, y: svgRect.top + 60 + wy * 0.75 }; }
async function pickCard(selector) {
  const center = await evalJs(`(() => {
    const card = document.querySelector('${selector}');
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

// ═══ 1. 元件库分类可单独收起 ═══
const baseCat = await evalJs(`(() => {
  const cat = [...document.querySelectorAll('.wiring-template-category')].find(c => c.querySelector('h4')?.textContent === '基础元素');
  return cat ? !!cat.querySelector('.wiring-library-cat-header') : false;
})()`);
check("基础元素分类标题可点击", baseCat === true);
const catHeaderCenter = await evalJs(`(() => {
  const cat = [...document.querySelectorAll('.wiring-template-category')].find(c => c.querySelector('h4')?.textContent === '基础元素');
  const h = cat && cat.querySelector('.wiring-library-cat-header');
  if (!h) return null;
  const r = h.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
await clickAt(catHeaderCenter.x, catHeaderCenter.y);
await new Promise((r) => setTimeout(r, 300));
const collapsed = await evalJs(`(() => {
  const cat = [...document.querySelectorAll('.wiring-template-category')].find(c => c.querySelector('h4')?.textContent === '基础元素');
  return cat && cat.classList.contains('collapsed') && cat.querySelector('.wiring-template-grid')?.offsetHeight === 0;
})()`);
check("点击标题后基础元素分类收起", collapsed === true);
await clickAt(catHeaderCenter.x, catHeaderCenter.y);
await new Promise((r) => setTimeout(r, 300));
const reexpanded = await evalJs(`(() => {
  const cat = [...document.querySelectorAll('.wiring-template-category')].find(c => c.querySelector('h4')?.textContent === '基础元素');
  return cat && !cat.classList.contains('collapsed');
})()`);
check("再次点击恢复展开", reexpanded === true);

// ═══ 2. 放置矩形 → 锁定 → 画布出现解锁徽标 → 点徽标解锁 ═══
await pickCard('[data-shape="rect"]');
const p1 = worldPoint(150, 150);
await clickAt(p1.x, p1.y);
await new Promise((r) => setTimeout(r, 500));
// 在属性面板点"锁定"
const locked = await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.wiring-prop-actions button')];
  const b = btns.find(x => x.textContent.trim() === '锁定' || x.textContent.trim() === '锁定图形');
  if (!b) return false;
  b.click();
  return true;
})()`);
check("点击属性面板锁定按钮", locked === true);
await new Promise((r) => setTimeout(r, 400));
const badgeShown = await evalJs(`(() => {
  const g = document.querySelector('[data-shape-type="rect"]');
  if (!g) return false;
  return g.parentElement.querySelector('.bg-image-unlock') !== null;
})()`);
check("锁定后画布出现 🔓 解锁徽标", badgeShown === true);
// 点击解锁徽标（读实际 bbox 中心）
const rectBadgePt = await evalJs(`(() => {
  const g = document.querySelector('[data-shape-type="rect"]');
  const badge = g && g.parentElement.querySelector('.bg-image-unlock');
  if (!badge) return null;
  const r = badge.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
if (rectBadgePt) {
  await clickAt(rectBadgePt.x, rectBadgePt.y);
  await new Promise((r) => setTimeout(r, 400));
}
const badgeGone = await evalJs(`(() => {
  const g = document.querySelector('[data-shape-type="rect"]');
  return !g || g.parentElement.querySelector('.bg-image-unlock') === null;
})()`);
check("点击徽标后解锁，徽标消失", badgeGone === true);

// ═══ 3. 放置股道编号 → 锁定 → 徽标解锁 ═══
await pickCard('[data-number="track"]');
const p2 = worldPoint(150, 300);
await clickAt(p2.x, p2.y);
await new Promise((r) => setTimeout(r, 500));
const labelLocked = await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.wiring-prop-actions button')];
  const b = btns.find(x => x.textContent.includes('锁定标签'));
  if (!b) return false;
  b.click();
  return true;
})()`);
check("编号标签面板有锁定按钮", labelLocked === true);
await new Promise((r) => setTimeout(r, 400));
const labelBadge = await evalJs(`(() => {
  const t = document.querySelector('text[data-numeral-type="track"]');
  return !!t && t.parentElement.querySelector('.bg-image-unlock') !== null;
})()`);
check("编号标签锁定后画布出现解锁徽标", labelBadge === true);
const labelBadgePt = await evalJs(`(() => {
  const t = document.querySelector('text[data-numeral-type="track"]');
  if (!t) return null;
  const badge = t.parentElement.querySelector('.bg-image-unlock');
  if (!badge) return null;
  const r = badge.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
if (labelBadgePt) {
  await clickAt(labelBadgePt.x, labelBadgePt.y);
  await new Promise((r) => setTimeout(r, 400));
}
const labelUnlocked = await evalJs(`(() => {
  const t = document.querySelector('text[data-numeral-type="track"]');
  return !t || t.parentElement.querySelector('.bg-image-unlock') === null;
})()`);
check("点击编号徽标解锁", labelUnlocked === true);

// ═══ 4. 道岔长度/间距范围放宽 ═══
// 放置单渡线模块（道岔与连接分类）
const tplCenter = await evalJs(`(() => {
  const card = [...document.querySelectorAll('.wiring-template-card')].find(c => c.textContent.includes('单渡线'));
  if (!card) return null;
  card.scrollIntoView({ block: 'center', inline: 'center' });
  const r = card.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
check("定位单渡线模板卡片", tplCenter !== null, tplCenter ? `(${Math.round(tplCenter.x)},${Math.round(tplCenter.y)})` : "");
if (tplCenter) {
  await clickAt(tplCenter.x, tplCenter.y);
  await new Promise((r) => setTimeout(r, 300));
  const p3 = worldPoint(400, 150);
  await clickAt(p3.x, p3.y);
  await new Promise((r) => setTimeout(r, 600));
  const sliders = await evalJs(`(() => {
    const inputs = [...document.querySelectorAll('.wiring-param-slider input[type="range"]')];
    const byLabel = {};
    for (const input of inputs) {
      const label = input.closest('.wiring-prop-row')?.querySelector('label')?.textContent;
      if (label) byLabel[label] = { min: Number(input.min), max: Number(input.max) };
    }
    return byLabel;
  })()`);
  check("长度滑块范围 40-300", sliders["长度"]?.min === 40 && sliders["长度"]?.max === 300, `min=${sliders["长度"]?.min} max=${sliders["长度"]?.max}`);
  check("线路间距滑块范围 10-128", sliders["线路间距"]?.min === 10 && sliders["线路间距"]?.max === 128, `min=${sliders["线路间距"]?.min} max=${sliders["线路间距"]?.max}`);
}

await screenshot(".verify/editor-polish-check.png");
check("已截图 .verify/editor-polish-check.png", true);

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
