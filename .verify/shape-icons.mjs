// 浏览器验证：元件库基础元素 + 工程图标（信号机）+ 编号标注
// 前提：.verify/profile 已被删除（干净 IndexedDB）
// 流程：首页 → 配线工具 → （无项目则新建）打开项目 → 放矩形 → 放进站信号机 → 放股道编号 → 断言渲染与属性面板
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
// 关闭新手引导，避免浮层拦截
await evalJs(`localStorage.setItem('metro-wiring-tutorial-dismissed', 'true')`);
await send("Page.reload", { ignoreCache: true });
await waitFor(`(() => {
  const btns = [...document.querySelectorAll('.portal-tools button')];
  return btns.some(b => b.textContent.includes('配线图'));
})()`, 20000);
await new Promise((r) => setTimeout(r, 500));

// 1. 切到配线图工具
const clickedWiring = await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.portal-tools button')];
  const btn = btns.find(b => b.textContent.includes('配线图'));
  if (!btn) return false;
  btn.click();
  return true;
})()`);
check("切换到配线图工具", clickedWiring === true);
await waitFor(`(() => {
  const b = [...document.querySelectorAll('.portal-tools button')].find(x => x.textContent.includes('配线图'));
  return b && b.getAttribute('aria-pressed') === 'true';
})()`, 8000);

// 2. 打开（或新建）一个项目
await waitFor(`(() => !!(document.querySelector('.project-card') || document.querySelector('.project-empty')))()`, 15000);
await new Promise((r) => setTimeout(r, 500));
let hasCard = await evalJs(`!!document.querySelector('.project-card')`);
if (!hasCard) {
  // 干净 profile：无项目 → 新建
  const created = await evalJs(`(() => {
    const btn = [...document.querySelectorAll('.portal-project-actions button')].find(x => x.textContent.includes('新建项目'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  check("点击新建项目", created === true);
  await waitFor(`document.querySelector('#new-project-name') !== null`, 8000);
  await evalJs(`(() => {
    const input = document.querySelector('#new-project-name');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '验证工程');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  const submitted = await evalJs(`(() => {
    const form = document.querySelector('.new-project-form');
    if (!form) return false;
    form.querySelector('button[type="submit"]').click();
    return true;
  })()`);
  check("提交新建项目", submitted === true);
  await waitFor(`document.querySelectorAll('.project-card').length >= 1`, 12000);
}
check("已有项目", await evalJs(`document.querySelectorAll('.project-card').length >= 1`));

// 3. 打开项目（配线编辑器）
await evalJs(`(() => { const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.wiring-svg') !== null", 20000);
check("配线编辑器已打开", await evalJs(`!!document.querySelector('.wiring-svg')`));
await new Promise((r) => setTimeout(r, 800));

// 3.1 干净画布断言：module-group 应为 0
const initialModules = await evalJs(`document.querySelectorAll('.module-group').length`);
check("画布初始为空（干净 IndexedDB）", initialModules === 0, `初始模块数=${initialModules}`);

// 4. 确认元件库卡片存在（基础元素 / 工程图标分类）
const hasShapeCard = await evalJs(`!!document.querySelector('[data-shape="rect"]')`);
const hasSignalCard = await evalJs(`!!document.querySelector('[data-signal="signal-in"]')`);
const hasNumberCard = await evalJs(`!!document.querySelector('[data-number="track"]')`);
check("元件库出现基础元素卡片", hasShapeCard === true);
check("元件库出现工程图标卡片", hasSignalCard === true);
check("元件库出现编号卡片", hasNumberCard === true);

// 画布坐标系转换（与 line-style.mjs 一致：默认视图 scale 0.75、平移 100,60）
const svgRect = await evalJs(`(() => { const s = document.querySelector('.wiring-svg').getBoundingClientRect(); return { left: s.left, top: s.top }; })()`);
function worldPoint(wx, wy) {
  return { x: svgRect.left + 100 + wx * 0.75, y: svgRect.top + 60 + wy * 0.75 };
}

// 选中元件卡片并点击画布放置
async function pickCard(selector) {
  const center = await evalJs(`(() => {
    const card = document.querySelector('${selector}');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!center) return false;
  await clickAt(center.x, center.y);
  await new Promise((r) => setTimeout(r, 300));
  return true;
}

// 5. 放置矩形
await pickCard('[data-shape="rect"]');
const rectActive = await evalJs(`(() => {
  const card = document.querySelector('[data-shape="rect"]');
  return card && card.classList.contains('active');
})()`);
check("矩形卡片选中态", rectActive === true);
const pRect = worldPoint(150, 150);
await clickAt(pRect.x, pRect.y);
await new Promise((r) => setTimeout(r, 500));
const rectCount = await evalJs(`document.querySelectorAll('[data-shape-type="rect"]').length`);
check("画布出现矩形图形", rectCount === 1, `矩形数=${rectCount}`);

// 5.1 属性面板：标题"矩形" + 填充/描边颜色编辑器
const panelTitle = await evalJs(`(() => {
  const h3 = [...document.querySelectorAll('.wiring-right-header h3')];
  return h3.length ? h3[0].textContent : null;
})()`);
check("属性面板标题显示矩形", panelTitle === "矩形", panelTitle || "");
const fillColorInputs = await evalJs(`document.querySelectorAll('.wiring-right-panel input[type="color"]').length`);
check("属性面板出现填充/描边颜色编辑器", fillColorInputs >= 2, `颜色输入数=${fillColorInputs}`);

// 6. 放置进站信号机
await pickCard('[data-signal="signal-in"]');
const signalActive = await evalJs(`(() => {
  const card = document.querySelector('[data-signal="signal-in"]');
  return card && card.classList.contains('active');
})()`);
check("进站信号机卡片选中态", signalActive === true);
const pSignal = worldPoint(350, 150);
await clickAt(pSignal.x, pSignal.y);
await new Promise((r) => setTimeout(r, 500));
const signalCount = await evalJs(`document.querySelectorAll('[data-shape-type="signal-in"]').length`);
check("画布出现进站信号机", signalCount === 1, `信号机数=${signalCount}`);
// 信号机内部应有红色灯位
const hasRedLamp = await evalJs(`(() => {
  const g = document.querySelector('[data-shape-type="signal-in"]');
  if (!g) return false;
  return [...g.querySelectorAll('circle')].some(c => c.getAttribute('fill') === '#E53935');
})()`);
check("进站信号机包含红色灯位", hasRedLamp === true);

// 7. 放置股道编号（放置后自动选中 → 属性面板应显示股道编号 + 编号输入）
await pickCard('[data-number="track"]');
const numberActive = await evalJs(`(() => {
  const card = document.querySelector('[data-number="track"]');
  return card && card.classList.contains('active');
})()`);
check("股道编号卡片选中态", numberActive === true);
const pNum = worldPoint(150, 350);
await clickAt(pNum.x, pNum.y);
await new Promise((r) => setTimeout(r, 500));
const numText = await evalJs(`(() => {
  const t = document.querySelector('text[data-numeral-type="track"]');
  return t ? t.textContent : null;
})()`);
check("股道编号渲染为 1道", numText === "1道", numText || "");

// 7.1 放置后自动选中 → 属性面板出现"股道编号"标题 + 编号输入
const numPanel = await evalJs(`(() => {
  const h3 = [...document.querySelectorAll('.wiring-right-header h3')];
  const label = [...document.querySelectorAll('.wiring-right-panel label')].find(x => x.textContent.trim() === '编号');
  return { title: h3.length ? h3[0].textContent : null, hasNumberInput: !!label };
})()`);
check("属性面板显示股道编号 + 编号输入", numPanel.title === "股道编号" && numPanel.hasNumberInput === true, `${numPanel.title} / 编号输入=${numPanel.hasNumberInput}`);

// 7.2 点空白取消选择后，点击编号文字应能重新选中（点击字形而非文本框中心）
const blankRect = await evalJs(`(() => {
  const s = document.querySelector('.wiring-svg').getBoundingClientRect();
  return { x: s.left + s.width / 2, y: s.top + 200 };
})()`);
await clickAt(blankRect.x, blankRect.y);
await new Promise((r) => setTimeout(r, 300));
const deselected = await evalJs(`document.querySelector('.wiring-right-header h3').textContent === '属性面板'`);
check("点击空白取消选择", deselected === true);
const glyphPoint = await evalJs(`(() => {
  const t = document.querySelector('text[data-numeral-type="track"]');
  if (!t) return null;
  const r = t.getBoundingClientRect();
  // 点击字形前 1/4 处（"1" 数字上），避开字间空隙
  return { x: r.left + r.width * 0.2, y: r.top + r.height * 0.5 };
})()`);
if (glyphPoint) {
  await clickAt(glyphPoint.x, glyphPoint.y);
  await new Promise((r) => setTimeout(r, 400));
}
const reselected = await evalJs(`(() => {
  const h3 = [...document.querySelectorAll('.wiring-right-header h3')];
  const label = [...document.querySelectorAll('.wiring-right-panel label')].find(x => x.textContent.trim() === '编号');
  return { title: h3.length ? h3[0].textContent : null, hasNumberInput: !!label };
})()`);
check("点击编号文字重新选中", reselected.title === "股道编号" && reselected.hasNumberInput === true, `${reselected.title} / 编号输入=${reselected.hasNumberInput}`);

// 8. 放置第二个股道编号 → 自动递增为 2道
await pickCard('[data-number="track"]');
const pNum2 = worldPoint(220, 350);
await clickAt(pNum2.x, pNum2.y);
await new Promise((r) => setTimeout(r, 500));
const numTexts = await evalJs(`[...document.querySelectorAll('text[data-numeral-type="track"]')].map(t => t.textContent).sort()`);
check("第二个股道编号自动递增为 2道", numTexts.length === 2 && numTexts[1] === "2道", numTexts.join(","));

// 截图
await screenshot(".verify/shape-icons-check.png");
check("已截图 .verify/shape-icons-check.png", true);

// 汇总
console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
