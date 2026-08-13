// 浏览器冒烟：验证 Batch 8 拆分后，设置弹窗（SettingsPanel）在真实浏览器中可用。
// 打开虚空城工程 → 打开显示设置 → 切换样式模板 → 拖动参数 → 保存按钮状态 → 关闭/重开。
import { startBrowser, newPage, evalJs, waitFor, screenshot, send } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await startBrowser();
await newPage("http://localhost:3000/?storage=http");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);
await new Promise((r) => setTimeout(r, 500));

// 选择「线路站序图生成」工具
await evalJs(`(() => {
  const btn = [...document.querySelectorAll('.portal-tools button')].find(b => b.textContent.includes('线路站序图生成'));
  if (btn) btn.click();
  return !!btn;
})()`);
await waitFor(`!!(document.querySelector('.project-card') || document.querySelector('.project-empty'))`, 15000);
if (!(await evalJs(`!!document.querySelector('.project-card')`))) throw new Error("没有可用的工程卡片");

// 打开默认工程（虚空城）
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目'));
  if (b) b.click();
  return !!b;
})()`);

// 等待线路站序图编辑器加载
await waitFor("document.querySelector('.preview-card') !== null", 25000);
await new Promise((r) => setTimeout(r, 800));

// ── 打开显示设置弹窗（按钮在应用 header，不在 preview-toolbar）──
const opened = await evalJs(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '显示设置');
  if (b) b.click();
  return !!b;
})()`);
check("点击「显示设置」打开弹窗", opened);
await waitFor("document.querySelector('.settings-modal') !== null", 10000);

check("设置弹窗已渲染", await evalJs(`!!document.querySelector('.settings-modal')`));
const tabCount = await evalJs(`document.querySelectorAll('.style-template-tabs button').length`);
check("样式模板标签栏（≥4 个模板）", tabCount >= 4, `tabs=${tabCount}`);
check("实时预览面板", await evalJs(`!!document.querySelector('.settings-preview-stage')`));
check("预览面板渲染 SVG", await evalJs(`document.querySelectorAll('.settings-preview-stage svg').length > 0`));

// ── 拖动参数（updateLayout 经 props 注入）：先于切换模板，验证"未改→已改"状态翻转 ──
// 默认工程模板为 scenic，故取当前模板下第一个可见的 NumberSetting，改成与当前不同的值。
const saveBefore = await evalJs(`(() => { const b = document.querySelector('.modal-actions .primary-button'); return b ? b.disabled : null; })()`);
const changed = await evalJs(`(() => {
  const range = document.querySelector('.settings-body .number-setting input[type="range"]');
  if (!range) return { ok: false, target: null };
  const min = Number(range.min) || 0;
  const max = Number(range.max) || 100;
  const cur = Number(range.value);
  const target = cur === min ? max : min; // 两端之一，保证合法且不同
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(range, String(target));
  range.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true, target: String(target) };
})()`);
await new Promise((r) => setTimeout(r, 500));
const rangeValue = await evalJs(`(() => {
  const range = document.querySelector('.settings-body .number-setting input[type="range"]');
  return range ? range.value : null;
})()`);
check("修改参数生效（受控输入回读新值）", changed.ok && rangeValue === changed.target, `value=${rangeValue} target=${changed.target}`);
const saveAfter = await evalJs(`(() => { const b = document.querySelector('.modal-actions .primary-button'); return b ? b.disabled : null; })()`);
check("保存按钮由不可用变为可用", saveBefore === true && saveAfter === false, `disabled ${saveBefore}→${saveAfter}`);

// ── 切换样式模板（selectStyleTemplate 经 props 注入）──
const loopSw = await evalJs(`(() => {
  const t = [...document.querySelectorAll('.style-template-tabs button')].find(b => b.textContent.includes('环线样式'));
  if (t) t.click();
  return !!t;
})()`);
check("切换「环线样式」标签", loopSw);
await new Promise((r) => setTimeout(r, 600));
check("环线弧形布局区块出现", await evalJs(`[...document.querySelectorAll('.settings-modal h3')].some(h => h.textContent.includes('环线弧形布局'))`));
check("环线标签 aria-selected=true", await evalJs(`(() => { const t = [...document.querySelectorAll('.style-template-tabs button')].find(b => b.textContent.includes('环线样式')); return t && t.getAttribute('aria-selected') === 'true'; })()`));

await evalJs(`(() => { const t = [...document.querySelectorAll('.style-template-tabs button')].find(b => b.textContent.includes('景区样式')); if (t) t.click(); return !!t; })()`);
await new Promise((r) => setTimeout(r, 600));
check("景区站点与横条区块出现", await evalJs(`[...document.querySelectorAll('.settings-modal h3')].some(h => h.textContent.includes('景区站点与横条'))`));

await evalJs(`(() => { const t = [...document.querySelectorAll('.style-template-tabs button')].find(b => b.textContent.includes('经典样式')); if (t) t.click(); return !!t; })()`);
await new Promise((r) => setTimeout(r, 600));

// ── 关闭弹窗（onClose 经 props 注入）──
await evalJs(`(() => { const b = [...document.querySelectorAll('.modal-actions button')].find(x => x.textContent.includes('完成')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.settings-modal') === null", 8000);
check("点击「完成」关闭弹窗", true);
check("主预览仍渲染", await evalJs(`!!document.querySelector('.preview-card')`));

// ── 重新打开 ──
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '显示设置'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.settings-modal') !== null", 10000);
check("重新打开弹窗正常", true);

await screenshot(".verify/screenshots/batch8-settings-modal.png");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
