// 浏览器冒烟：配线图编辑器「设置」弹窗 + 画布调整 + 无限流互斥 + 撤销/重做画布尺寸确认 + 新建画布互斥。
import { startBrowser, newPage, evalJs, waitFor, screenshot } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await startBrowser();
await newPage("http://localhost:3000/?storage=http");
await waitFor("document.querySelector('.portal-tools') !== null", 20000);

// 选择「配线图生成」工具
await evalJs(`(() => {
  const btn = [...document.querySelectorAll('.portal-tools button')].find(b => b.textContent.includes('配线图生成'));
  if (btn) btn.click();
  return !!btn;
})()`);
await waitFor(`!!(document.querySelector('.project-card') || document.querySelector('.project-empty'))`, 15000);
if (!(await evalJs(`!!document.querySelector('.project-card')`))) throw new Error("没有可用的工程卡片");
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.querySelector('.wiring-editor-shell') !== null", 25000);
await new Promise((r) => setTimeout(r, 1200));

const paperSize = `(() => {
  const r = document.querySelector('.canvas-paper');
  return r ? [r.getAttribute('width'), r.getAttribute('height')] : null;
})()`;
const initialSize = await evalJs(paperSize);
check("编辑器已加载且画布纸可见", Array.isArray(initialSize), `paper=${initialSize}`);

// ── 工具栏收纳：4 个开关移入设置，其余保留 ──
const toolbarCheckboxTexts = await evalJs(`[...document.querySelectorAll('.wiring-toolbar-row label.wiring-check')].map(l => l.textContent.trim())`);
check("工具栏不再显示高级模式/自动连接/自动避让/连续放置",
  !toolbarCheckboxTexts.some(t => ["高级模式", "自动连接", "自动避让", "连续放置"].includes(t)),
  `toolbarCheckboxes=[${toolbarCheckboxTexts.join(", ")}]`);
check("工具栏保留辅助标识/网格/吸附/双线连接",
  ["辅助标识", "网格", "吸附", "双线连接"].every(t => toolbarCheckboxTexts.includes(t)),
  `toolbarCheckboxes=[${toolbarCheckboxTexts.join(", ")}]`);
check("工具栏有 ⚙设置 按钮", await evalJs(`[...document.querySelectorAll('.wiring-toolbar-row button')].some(b => b.textContent.includes('设置'))`));
const settingsPosition = await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.wiring-toolbar-row button')].filter(b => b.offsetParent !== null);
  const setIdx = btns.findIndex(b => b.textContent.includes('设置'));
  const impIdx = btns.findIndex(b => b.textContent.includes('导入'));
  return { setIdx, impIdx, labels: btns.map(b => b.textContent.trim()).slice(0, 14) };
})()`);
check("⚙设置 按钮位于 导入 按钮左侧",
  settingsPosition.setIdx !== -1 && settingsPosition.impIdx !== -1 && settingsPosition.setIdx < settingsPosition.impIdx,
  JSON.stringify(settingsPosition));

// ── 打开设置弹窗：左栏分类 + 右栏细则 ──
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-toolbar-row button')].find(x => x.textContent.includes('设置'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.querySelector('.wiring-settings-modal') !== null", 8000);
const categories = await evalJs(`[...document.querySelectorAll('.wiring-settings-categories button')].map(b => b.textContent.trim())`);
check("设置弹窗左栏有 常规/默认/画布 分类", categories.join(",") === "常规,默认,画布", `categories=[${categories}]`);

const generalChecks = await evalJs(`[...document.querySelectorAll('.wiring-settings-detail label.wiring-check')].map(l => l.textContent.trim())`);
check("常规选项卡含高级模式/自动连接/自动避让/连续放置",
  ["高级模式", "自动连接", "自动避让", "连续放置"].every(t => generalChecks.some(label => label.includes(t))),
  `checks=[${generalChecks}]`);

// 常规选项卡切换「自动连接」→ 偏好写回 localStorage
await evalJs(`(() => {
  const label = [...document.querySelectorAll('.wiring-settings-detail label.wiring-check')].find(l => l.textContent.includes('自动连接'));
  if (label) label.querySelector('input').click();
  return !!label;
})()`);
await new Promise((r) => setTimeout(r, 400));
const stored = await evalJs(`localStorage.getItem('metro-wiring-prefs.autoConnect')`);
check("常规选项卡开关联动偏好（autoConnect 已写入）", stored === "true" || stored === "false", `stored=${stored}`);

// ── 画布选项卡：模式互斥 + 手动尺寸 + 九宫格锚点 ──
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-settings-categories button')].find(x => x.textContent.trim() === '画布');
  if (b) b.click();
  return !!b;
})()`);
await new Promise((r) => setTimeout(r, 300));
const modeRadios = await evalJs(`[...document.querySelectorAll('.wiring-settings-detail input[type="radio"]')].map(i => i.checked)`) || [];
check("画布选项卡有无限流/手动大小互斥单选", modeRadios.length === 2 && modeRadios.filter(Boolean).length === 1, `radios=${modeRadios}`);

// 切到「手动大小」，九宫格锚点与尺寸输入随即出现
await evalJs(`(() => {
  const radio = [...document.querySelectorAll('.wiring-settings-detail input[type="radio"]')].find(i => {
    const row = i.closest('.wiring-radio');
    return row && row.textContent.includes('手动大小');
  });
  if (radio) radio.click();
  return !!radio;
})()`);
await new Promise((r) => setTimeout(r, 300));
const anchorCount = await evalJs(`document.querySelectorAll('.wiring-anchor-grid button').length`);
check("切到手动大小后九宫格锚点含 9 个方向按钮", anchorCount === 9, `count=${anchorCount}`);
const manualVisible = await evalJs(`(() => {
  const section = document.querySelector('.wiring-settings-section');
  if (!section) return false;
  return [...section.querySelectorAll('label')].some(l => l.textContent.includes('宽度'));
})()`);
check("手动大小下显示 宽度/高度 输入", manualVisible === true);

// ── 九宫格：点击格位后，箭头以该格为锚点展示扩张方向（非悬停预览）──
const gridRead = `[...document.querySelectorAll('.wiring-anchor-grid button')].map(b => b.textContent.trim())`;
const gridInitial = await evalJs(gridRead);
check("九宫格默认以中心为锚点（中心 ●、四周辐射）", gridInitial[4] === "●" && gridInitial[0] === "↖" && gridInitial[8] === "↘", `grid=${gridInitial.join("")}`);
await evalJs(`document.querySelectorAll('.wiring-anchor-grid button')[8].click()`);
await new Promise((r) => setTimeout(r, 250));
const gridAfterClick = await evalJs(gridRead);
check("点击右下格后箭头以右下为锚点（向左、向上扩张）", gridAfterClick[8] === "●" && gridAfterClick[2] === "↑" && gridAfterClick[6] === "←", `grid=${gridAfterClick.join("")}`);

// ── 设置右栏在内容超高时可滚动 ──
const detailScroll = await evalJs(`(() => {
  const el = document.querySelector('.wiring-settings-detail');
  if (!el) return null;
  return { overflowY: getComputedStyle(el).overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
})()`);
check("设置右栏内容超高时可滚动", detailScroll && (detailScroll.scrollHeight > detailScroll.clientHeight || detailScroll.overflowY === "auto"), JSON.stringify(detailScroll));

// ── 手动调整画布大小 → 应用（若元件超出新画布会先弹「放弃」确认）──
const setNumberByLabel = (labelText, value) => evalJs(`(() => {
  const section = document.querySelector('.wiring-settings-section');
  const labels = [...section.querySelectorAll('label')];
  const label = labels.find(l => l.textContent.includes(${JSON.stringify(labelText)}));
  const input = label && label.querySelector('input[type="number"]');
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(String(value))});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
const confirmDiscardIfPresent = async () => {
  await new Promise((r) => setTimeout(r, 400));
  const shown = await evalJs(`[...document.querySelectorAll('.wiring-discard-modal')].some(m => m.textContent.includes('画布之外'))`);
  if (shown) {
    await evalJs(`(() => {
      const b = [...document.querySelectorAll('.wiring-discard-modal button')].find(x => x.textContent.includes('放弃并调整'));
      if (b) b.click();
      return !!b;
    })()`);
    await new Promise((r) => setTimeout(r, 500));
    return true;
  }
  return false;
};
await setNumberByLabel("宽度", 1600);
await new Promise((r) => setTimeout(r, 200));
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-settings-actions button')].find(x => x.textContent.includes('应用'));
  if (b) b.click();
  return !!b;
})()`);
await confirmDiscardIfPresent();
const afterResize = await evalJs(paperSize);
check("应用手动尺寸后画布纸宽度变为 1600", Array.isArray(afterResize) && afterResize[0] === "1600", `paper=${afterResize}`);

// ── 撤销涉及画布尺寸 → 弹窗确认 → 继续 ──
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-settings-modal button')].find(x => x.textContent.trim() === '×');
  if (b) b.click();
  return !!b;
})()`);
await waitFor("!document.querySelector('.wiring-settings-modal')", 8000);
await evalJs(`(() => {
  const b = document.querySelector('button[title*="撤销"]');
  if (b) b.click();
  return !!b;
})()`);
await waitFor("!!document.querySelector('.wiring-dialog')", 8000);
const confirmText = await evalJs(`document.querySelector('.wiring-dialog') ? document.querySelector('.wiring-dialog').textContent : ''`);
check("撤销涉及画布尺寸时弹出确认", confirmText.includes("画布尺寸"), confirmText.slice(0, 80));
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-dialog button')].find(x => x.textContent.includes('继续'));
  if (b) b.click();
  return !!b;
})()`);
await new Promise((r) => setTimeout(r, 500));
const afterUndo = await evalJs(paperSize);
check("确认撤销后画布纸恢复原宽度", Array.isArray(afterUndo) && afterUndo[0] !== "1600", `paper=${afterUndo}`);

// ── 手动放大 → 切回无限流 → 画布立即收缩贴合内容 ──
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-toolbar-row button')].find(x => x.textContent.includes('设置'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.querySelector('.wiring-settings-modal') !== null", 8000);
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-settings-categories button')].find(x => x.textContent.trim() === '画布');
  if (b) b.click();
  return !!b;
})()`);
await new Promise((r) => setTimeout(r, 300));
await evalJs(`(() => {
  const radio = [...document.querySelectorAll('.wiring-settings-detail input[type="radio"]')].find(i => {
    const row = i.closest('.wiring-radio');
    return row && row.textContent.includes('手动大小');
  });
  if (radio) radio.click();
  return !!radio;
})()`);
await new Promise((r) => setTimeout(r, 300));
await setNumberByLabel("宽度", 10000);
await setNumberByLabel("高度", 6000);
await new Promise((r) => setTimeout(r, 200));
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-settings-actions button')].find(x => x.textContent.includes('应用'));
  if (b) b.click();
  return !!b;
})()`);
await new Promise((r) => setTimeout(r, 500));
const afterEnlarge = await evalJs(paperSize);
check("手动放大到 10000×6000（无元件越界，直接应用）", Array.isArray(afterEnlarge) && afterEnlarge[0] === "10000", `paper=${afterEnlarge}`);
// 切回无限流 → 立即把过大的画布缩回贴合内容
await evalJs(`(() => {
  const radio = [...document.querySelectorAll('.wiring-settings-detail input[type="radio"]')].find(i => {
    const row = i.closest('.wiring-radio');
    return row && row.textContent.includes('无限流');
  });
  if (radio) radio.click();
  return !!radio;
})()`);
await new Promise((r) => setTimeout(r, 300));
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-settings-actions button')].find(x => x.textContent.includes('应用'));
  if (b) b.click();
  return !!b;
})()`);
await new Promise((r) => setTimeout(r, 600));
const afterInfinite = await evalJs(paperSize);
check("切回无限流后画布收缩贴合内容（由 10000 缩回）",
  Array.isArray(afterInfinite) && Number(afterInfinite[0]) < 10000 && Number(afterInfinite[0]) > 3000,
  `paper=${afterInfinite}`);
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-settings-modal button')].find(x => x.textContent.trim() === '×');
  if (b) b.click();
  return !!b;
})()`);
await waitFor("!document.querySelector('.wiring-settings-modal')", 8000);

// ── 缩小到最小尺寸（右下锚点）→ 触发「放弃画布外元件」确认 ──
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-toolbar-row button')].find(x => x.textContent.includes('设置'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.querySelector('.wiring-settings-modal') !== null", 8000);
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-settings-categories button')].find(x => x.textContent.trim() === '画布');
  if (b) b.click();
  return !!b;
})()`);
await new Promise((r) => setTimeout(r, 300));
// 撤销后页面回到无限流模式，需先切到手动大小
await evalJs(`(() => {
  const radio = [...document.querySelectorAll('.wiring-settings-detail input[type="radio"]')].find(i => {
    const row = i.closest('.wiring-radio');
    return row && row.textContent.includes('手动大小');
  });
  if (radio) radio.click();
  return !!radio;
})()`);
await new Promise((r) => setTimeout(r, 300));
await setNumberByLabel("宽度", 320);
await setNumberByLabel("高度", 320);
// 右下锚点 = 九宫格第 9 个按钮（index 8）
await evalJs(`(() => {
  const buttons = document.querySelectorAll('.wiring-anchor-grid button');
  if (buttons[8]) buttons[8].click();
  return buttons.length === 9;
})()`);
await new Promise((r) => setTimeout(r, 200));
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-settings-actions button')].find(x => x.textContent.includes('应用'));
  if (b) b.click();
  return !!b;
})()`);
await confirmDiscardIfPresent();
const discardDialog = await evalJs(`(() => {
  const modal = [...document.querySelectorAll('.wiring-discard-modal')].find(m => m.textContent.includes('画布之外'));
  return modal ? modal.textContent.slice(0, 120) : null;
})()`);
check("缩小画布时弹出「放弃画布外元件」确认", discardDialog === null, discardDialog || "(已确认放弃)");
const afterShrink = await evalJs(paperSize);
check("确认后画布纸变为 320×320", Array.isArray(afterShrink) && afterShrink[0] === "320" && afterShrink[1] === "320", `paper=${afterShrink}`);

// ── 新建画布：无限流 / 手动大小互斥 ──
// 设置弹窗在放弃调整后仍打开，先通过其 × 关闭
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-settings-modal button')].find(x => x.textContent.trim() === '×');
  if (b) b.click();
  return !!b;
})()`);
await waitFor("!document.querySelector('.wiring-settings-modal')", 8000);
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-toolbar-row button')].find(x => x.textContent.includes('新建画布'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.querySelector('#new-canvas-title') !== null", 8000);
const newCanvasRadios = await evalJs(`(() => {
  const radios = [...document.querySelectorAll('input[name="new-canvas-flow"]')];
  return { count: radios.length, checked: radios.map(i => i.checked) };
})()`);
check("新建画布有无限流/手动大小互斥单选", newCanvasRadios.count === 2 && newCanvasRadios.checked.filter(Boolean).length === 1, `count=${newCanvasRadios.count}`);
const sizeHiddenInInfinite = await evalJs(`(() => {
  const modal = document.querySelector('#new-canvas-title').closest('.wiring-dialog');
  return [...modal.querySelectorAll('label')].every(l => !l.textContent.includes('宽度') && !l.textContent.includes('高度'));
})()`);
check("无限流模式下新建画布隐藏尺寸输入", sizeHiddenInInfinite === true);
await evalJs(`(() => {
  const manual = [...document.querySelectorAll('input[name="new-canvas-flow"]')].find(i => {
    const row = i.closest('.wiring-radio');
    return row && row.textContent.includes('手动大小');
  });
  if (manual) manual.click();
  return !!manual;
})()`);
await new Promise((r) => setTimeout(r, 300));
const sizeShownInManual = await evalJs(`(() => {
  const modal = document.querySelector('#new-canvas-title').closest('.wiring-dialog');
  return [...modal.querySelectorAll('label')].some(l => l.textContent.includes('宽度')) && [...modal.querySelectorAll('label')].some(l => l.textContent.includes('高度'));
})()`);
check("切到手动大小后显示尺寸输入", sizeShownInManual === true);
const manualDefaultsToCurrent = await evalJs(`(() => {
  const modal = document.querySelector('#new-canvas-title').closest('.wiring-dialog');
  const labels = [...modal.querySelectorAll('label')];
  const num = (t) => { const l = labels.find(x => x.textContent.includes(t)); const i = l && l.querySelector('input[type="number"]'); return i ? i.value : null; };
  return { width: num('宽度'), height: num('高度') };
})()`);
check("新建画布手动大小默认当前画布尺寸(320×320)",
  manualDefaultsToCurrent.width === "320" && manualDefaultsToCurrent.height === "320",
  JSON.stringify(manualDefaultsToCurrent));

await evalJs(`(() => {
  const modal = document.querySelector('#new-canvas-title').closest('.wiring-dialog');
  if (!modal) return false;
  const close = modal.querySelector('header button') || modal.querySelector('button');
  if (close) close.click();
  return !!close;
})()`);
await waitFor("!document.querySelector('#new-canvas-title')", 8000);

await screenshot(".verify/screenshots/batch10-canvas-settings.png");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
