// 浏览器验证：框选批量设置 + 元件复制（带参数）
// 流程：
//   1) 临时工程（?storage=http），设置默认线路间距 60。
//   2) 放置 侧式站台站(300,300)、双线区间(500,300)、单渡线(680,300)，自动连接建立 ≥2 条。
//   3) 框选三个模块 → 属性面板整体切「批量设置」，含分类 chips「区间与车站(2)」「道岔与连接(1)」。
//   4) 点「区间与车站」→「线路间距」滑块值 60。
//   5) Ctrl+C → 状态「已复制 3 个模块（含 N 条连接）」。
//   6) Ctrl+V → 模块 ×2、连接 ×2、粘贴坐标 = 源 + (24,24)、参数保留（批量面板线路间距仍 60）。
//   7) Ctrl+D → 模块 +3（原位复制，坐标重叠）。
//   8) 单选一个模块 → 单元件复制/粘贴：模块 +1、连接数不变。
// 收尾：临时工程 DELETE → Browser.close → 按 exitCode 退出。
import { startBrowser, newPage, evalJs, waitFor, clickAt, screenshot, send } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 0. 数据服务器：创建临时工程 ──
const tempName = `验证-复制粘贴-${Date.now()}`;
let tempId = null;
try {
  const res = await fetch("http://127.0.0.1:4175/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: tempName }),
  });
  const created = await res.json();
  tempId = created.id;
  console.log(`临时工程: ${tempId}`);
} catch (error) {
  console.error("创建临时工程失败:", error.message);
  process.exit(1);
}

let exitCode = 0;
try {
  await startBrowser();
  await newPage("http://127.0.0.1:3000/?storage=http");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await waitFor("document.querySelector('.portal-tools') !== null", 20000);
  // 清掉本功能相关偏好，保证从默认态开始（吸附跟网格、自动连接开、默认间距清空）
  await evalJs(`(() => {
    for (const k of ['snapStep', 'defaultSpacing', 'defaultPlatformLength', 'defaultPlatformWidth', 'autoConnect']) {
      localStorage.removeItem('metro-wiring-prefs.' + k);
    }
    localStorage.setItem('metro-wiring-tutorial-dismissed', 'true');
    return true;
  })()`);
  await send("Page.reload", { ignoreCache: true });
  await waitFor(`(() => {
    const btns = [...document.querySelectorAll('.portal-tools button')];
    return btns.some(b => b.textContent.includes('配线图'));
  })()`, 20000);
  await sleep(500);

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
  await sleep(500);

  const opened = await evalJs(`(() => {
    const cards = [...document.querySelectorAll('.project-card')];
    const card = cards.find(c => c.textContent.includes('${tempName}'));
    if (!card) return false;
    const btn = [...card.querySelectorAll('button')].find(x => x.textContent.includes('打开项目'));
    if (btn) btn.click();
    return true;
  })()`);
  if (!opened) throw new Error("临时工程卡片未出现");
  await waitFor("document.querySelector('.wiring-svg') !== null", 25000);
  await sleep(800);
  await evalJs(`localStorage.setItem('metro-wiring-first-use-notice-dismissed-v1', 'true'); true`);
  const dismissed = await evalJs(`(() => {
    const backdrop = document.querySelector('.wiring-first-use-backdrop');
    if (!backdrop) return true;
    const btn = [...backdrop.querySelectorAll('button')].find(b => b.textContent.includes('继续使用'));
    if (btn) btn.click();
    return false;
  })()`);
  if (!dismissed) await waitFor("document.querySelector('.wiring-first-use-backdrop') === null", 8000);
  await sleep(400);
  await evalJs(`localStorage.setItem('metro-wiring-tutorial-dismissed-v2', 'true'); true`);
  const tutDismissed = await evalJs(`(() => {
    const root = document.querySelector('.tutorial-overlay-root');
    if (!root) return true;
    const skip = [...root.querySelectorAll('button')].find(b => b.textContent.includes('跳过'));
    if (skip) skip.click();
    return false;
  })()`);
  if (!tutDismissed) await waitFor("document.querySelector('.tutorial-backdrop') === null", 8000);
  await sleep(400);

  // ── 视口变换 → 世界→屏幕 ──
  async function viewportTransform() {
    return await evalJs(`(() => {
      const g = document.querySelector('.wiring-svg > g[transform]');
      if (!g) return null;
      const m = g.getAttribute('transform').match(/translate\\(([-\\d.]+),([-\\d.]+)\\) scale\\(([-\\d.]+)\\)/);
      if (!m) return null;
      return { panX: parseFloat(m[1]), panY: parseFloat(m[2]), scale: parseFloat(m[3]) };
    })()`);
  }
  const vp = await viewportTransform();
  check("读取画布视口变换", !!vp, JSON.stringify(vp));
  const svgRect = await evalJs(`(() => { const s = document.querySelector('.wiring-svg').getBoundingClientRect(); return { left: s.left, top: s.top }; })()`);
  const worldToScreen = (wx, wy) => ({ x: svgRect.left + vp.panX + wx * vp.scale, y: svgRect.top + vp.panY + wy * vp.scale });

  async function clickCard(name) {
    const ok = await evalJs(`(() => {
      const card = [...document.querySelectorAll('.wiring-template-card')].find(c => c.querySelector('b')?.textContent === '${name}');
      if (!card) return false;
      card.scrollIntoView({ block: 'center', inline: 'center' });
      card.click();
      return true;
    })()`);
    await sleep(300);
    return ok;
  }
  async function realClick(clientX, clientY) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: clientX, y: clientY });
    await sleep(80);
    await clickAt(clientX, clientY);
    await sleep(400);
  }
  async function clickWorld(wx, wy) {
    const p = worldToScreen(wx, wy);
    await realClick(p.x, p.y);
  }
  /** 框选：从空白处拖拽一个矩形（覆盖给定世界坐标两角） */
  async function boxSelectWorld(x1, y1, x2, y2) {
    const a = worldToScreen(x1, y1);
    const b = worldToScreen(x2, y2);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y });
    await sleep(80);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", clickCount: 1 });
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps;
      const y = a.y + (b.y - a.y) * i / steps;
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
      await sleep(25);
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
    await sleep(500);
  }
  const CTRL = 2;
  async function keyCombo(key, code, vk, modifiers) {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers });
  }
  const ctrlKey = (letter) => {
    const up = letter.toUpperCase();
    return keyCombo(letter.toLowerCase(), "Key" + up, up.charCodeAt(0), CTRL);
  };

  async function readModulePositions() {
    return await evalJs(`(() => {
      const mods = [...document.querySelectorAll('.module-group')];
      return mods.map(m => {
        const t = m.getAttribute('transform') || '';
        const mt = t.match(/translate\\(([-\\d.]+),([-\\d.]+)\\)/);
        return mt ? { x: Math.round(parseFloat(mt[1])), y: Math.round(parseFloat(mt[2])) } : { x: 0, y: 0 };
      });
    })()`);
  }
  const hasPos = (list, x, y) => list.some(p => p.x === x && p.y === y);
  async function readPanel() {
    return await evalJs(`(() => {
      const panel = document.querySelector('.wiring-right-panel');
      if (!panel) return null;
      return {
        h3: panel.querySelector('h3')?.textContent.trim(),
        selectedMods: document.querySelectorAll('.module-group.selected').length,
        chips: [...panel.querySelectorAll('.wiring-batch-category-chips button')].map(b => b.textContent.replace(/\\s+/g, '').trim()),
        activeChip: panel.querySelector('.wiring-batch-category-chips button.active')?.textContent.replace(/\\s+/g, '').trim() || null,
        spacingValue: (() => {
          const row = [...panel.querySelectorAll('.wiring-param-slider')].find(r => r.querySelector('label')?.textContent.trim() === '线路间距');
          return row ? row.querySelector('input[type=range]').value : null;
        })(),
      };
    })()`);
  }
  const readStatus = () => evalJs(`(() => { const s = document.querySelector('.wiring-status-bar span:last-child'); return s ? s.textContent.trim() : null; })()`);

  // ── 1. 设置默认线路间距 60 ──
  const openSettings = await evalJs(`(() => {
    const b = [...document.querySelectorAll('.wiring-toolbar button')].find(x => x.textContent.includes('设置'));
    if (b) b.click();
    return !!b;
  })()`);
  await waitFor("document.querySelector('.wiring-settings-modal') !== null", 8000);
  check("打开设置弹窗", openSettings === true);
  const tabDefault = await evalJs(`(() => {
    const b = [...document.querySelectorAll('.wiring-settings-categories button')].find(x => x.textContent.trim() === '默认');
    if (b) b.click();
    return !!b;
  })()`);
  check("切到「默认」分类", tabDefault === true);
  await sleep(300);
  const setSpacing = await evalJs(`(() => {
    const labels = [...document.querySelectorAll('.wiring-settings-section label')];
    const label = labels.find(l => l.firstChild?.textContent.trim() === '默认线路间距');
    const input = label && label.querySelector('input[type=number]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '60');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  check("默认线路间距设为 60", setSpacing === true);
  await sleep(300);
  const closeSettings = await evalJs(`(() => {
    const b = document.querySelector('.wiring-settings-modal header button[title="关闭"]');
    if (b) b.click();
    return !!b;
  })()`);
  await waitFor("document.querySelector('.wiring-settings-modal') === null", 8000);
  check("关闭设置弹窗", closeSettings === true);
  await sleep(300);

  // ── 2. 放置三个模块（横向，端口相向，自动连接） ──
  const placed1 = await clickCard("侧式站台站");
  if (!placed1) throw new Error("侧式站台站模板卡片不存在");
  await clickWorld(300, 300);
  await sleep(600);
  const placed2 = await clickCard("双线区间");
  if (!placed2) throw new Error("双线区间模板卡片不存在");
  await clickWorld(500, 300);
  await sleep(700);
  const placed3 = await clickCard("单渡线");
  if (!placed3) throw new Error("单渡线模板卡片不存在");
  await clickWorld(680, 300);
  await sleep(700);

  const modCount = await evalJs(`document.querySelectorAll('.module-group').length`);
  check("放置了 3 个模块", modCount === 3, `模块数=${modCount}`);
  let connCount = await evalJs(`document.querySelectorAll('.connection-group').length`);
  check("自动连接建立（≥2 条）", connCount >= 2, `连接数=${connCount}`);
  await screenshot(".verify/screenshots/copy-paste-placed.png");

  // ── 3. 框选三个模块 → 批量面板 ──
  await boxSelectWorld(230, 230, 820, 470);
  const selPanel = await readPanel();
  check("框选后选中 3 个模块", selPanel && selPanel.selectedMods === 3, selPanel ? `selectedMods=${selPanel.selectedMods}` : "面板未出现");
  check("属性面板整体切「批量设置」", selPanel && selPanel.h3 === "批量设置", selPanel ? `h3=${selPanel.h3}` : "");
  const chipOk = selPanel && selPanel.chips.some(c => c.startsWith('区间与车站') && c.includes('2')) && selPanel.chips.some(c => c.startsWith('道岔与连接') && c.includes('1'));
  check("分类 chips 含「区间与车站(2)」「道岔与连接(1)」", chipOk === true, selPanel ? `chips=${JSON.stringify(selPanel.chips)}` : "");
  await screenshot(".verify/screenshots/copy-paste-batch-panel.png");

  // ── 4. 点「区间与车站」→ 线路间距 60 ──
  const chipClick = await evalJs(`(() => {
    const b = [...document.querySelectorAll('.wiring-batch-category-chips button')].find(x => x.textContent.includes('区间与车站'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  check("点击「区间与车站」chip", chipClick === true);
  await sleep(400);
  const sectionPanel = await readPanel();
  check("「线路间距」批量滑块 = 60", sectionPanel && sectionPanel.spacingValue === "60", sectionPanel ? `value=${sectionPanel.spacingValue}` : "面板未出现");
  check("「区间与车站」chip 处于选中态", sectionPanel && sectionPanel.activeChip && sectionPanel.activeChip.includes('区间与车站'), sectionPanel ? `active=${sectionPanel.activeChip}` : "");

  // ── 5. Ctrl+C 复制 ──
  await ctrlKey("c");
  await sleep(500);
  const statusAfterCopy = await readStatus();
  const expectedCopyMsg = `已复制 3 个模块（含 ${connCount} 条连接）`;
  check("Ctrl+C 复制 3 个模块（含连接）", statusAfterCopy === expectedCopyMsg, `status=${statusAfterCopy}`);

  // ── 6. Ctrl+V 粘贴（+24,24，参数保留） ──
  await ctrlKey("v");
  await sleep(800);
  const modCountAfterPaste = await evalJs(`document.querySelectorAll('.module-group').length`);
  const connCountAfterPaste = await evalJs(`document.querySelectorAll('.connection-group').length`);
  check("Ctrl+V 模块数 ×2（3→6）", modCountAfterPaste === modCount * 2, `模块数=${modCountAfterPaste}`);
  check("Ctrl+V 连接数 ×2", connCountAfterPaste === connCount * 2, `连接数=${connCountAfterPaste}`);
  const posAfterPaste = await readModulePositions();
  const offsetOk = posAfterPaste.length === 6
    && hasPos(posAfterPaste, 300, 300) && hasPos(posAfterPaste, 500, 300) && hasPos(posAfterPaste, 680, 300)
    && hasPos(posAfterPaste, 324, 324) && hasPos(posAfterPaste, 524, 324) && hasPos(posAfterPaste, 704, 324);
  check("粘贴模块坐标 = 源 + (24,24)", offsetOk === true, JSON.stringify(posAfterPaste));
  const pastedPanel = await readPanel();
  check("粘贴后批量面板（3 个粘贴模块）线路间距仍 60", pastedPanel && pastedPanel.selectedMods === 3 && pastedPanel.spacingValue === "60",
    pastedPanel ? `selectedMods=${pastedPanel.selectedMods}, spacing=${pastedPanel.spacingValue}` : "面板未出现");
  const statusAfterPaste = await readStatus();
  check("Ctrl+V 状态提示「已粘贴 3 个模块」", statusAfterPaste === `已粘贴 3 个模块（含 ${connCount} 条连接）`, `status=${statusAfterPaste}`);
  await screenshot(".verify/screenshots/copy-paste-pasted.png");

  // ── 7. Ctrl+D 原位复制（当前选中 3 个粘贴模块） ──
  await ctrlKey("d");
  await sleep(800);
  const modCountAfterDup = await evalJs(`document.querySelectorAll('.module-group').length`);
  const connCountAfterDup = await evalJs(`document.querySelectorAll('.connection-group').length`);
  check("Ctrl+D 原位复制模块 +3（6→9）", modCountAfterDup === modCount * 3, `模块数=${modCountAfterDup}`);
  const statusAfterDup = await readStatus();
  check("Ctrl+D 状态提示「已原位复制 3 个模块」", statusAfterDup === `已原位复制 3 个模块（含 ${connCount} 条连接）`, `status=${statusAfterDup}`);

  // ── 8. 单选一个模块 → 单元件复制粘贴（连接不复制） ──
  // 点击原始 单渡线(680,300) 的上行轨（世界 y=326），它不在当前选中集合里 → 单选。
  // 注意避开连接线（x 660-680 的 y=326/386）与上层的复制/原位复制模块轨道（y=350/410），
  // (720,326) 落在原始单渡线自有上行轨上、且无覆盖元素。
  await clickWorld(720, 326);
  await sleep(500);
  const singlePanel = await readPanel();
  check("单选后选中 1 个模块、面板切回单元素", singlePanel && singlePanel.selectedMods === 1, singlePanel ? `selectedMods=${singlePanel.selectedMods}, h3=${singlePanel.h3}` : "");
  check("单选模块为「单渡线」", singlePanel && singlePanel.h3 && singlePanel.h3.includes('单渡线'), singlePanel ? `h3=${singlePanel.h3}` : "");

  await ctrlKey("c");
  await sleep(500);
  const statusSingleCopy = await readStatus();
  check("单元件 Ctrl+C 复制 1 个模块（无连接）", statusSingleCopy === "已复制 1 个模块", `status=${statusSingleCopy}`);
  await ctrlKey("v");
  await sleep(800);
  const modCountSinglePaste = await evalJs(`document.querySelectorAll('.module-group').length`);
  const connCountSinglePaste = await evalJs(`document.querySelectorAll('.connection-group').length`);
  check("单元件 Ctrl+V 模块 +1（9→10）", modCountSinglePaste === 10, `模块数=${modCountSinglePaste}`);
  check("单元件粘贴连接数不变", connCountSinglePaste === connCountAfterDup, `连接数=${connCountSinglePaste}（Ctrl+D 后=${connCountAfterDup}）`);
  const statusSinglePaste = await readStatus();
  check("单元件 Ctrl+V 状态提示「已粘贴 1 个模块」", statusSinglePaste === "已粘贴 1 个模块", `status=${statusSinglePaste}`);
  await screenshot(".verify/screenshots/copy-paste-final.png");

  console.log("\n==== 结果汇总 ====");
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} 项通过`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  ✗ ${f.name}`));
    exitCode = 1;
  }
} catch (error) {
  console.error("\n验证失败:", error.message);
  await screenshot(".verify/screenshots/copy-paste-failure.png").catch(() => {});
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} 项通过`);
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  exitCode = 1;
} finally {
  // 先清理临时工程再退出：process.exit() 会中断 finally 中尚未完成的异步 DELETE
  if (tempId) {
    try {
      const res = await fetch(`http://127.0.0.1:4175/api/projects/${tempId}`, { method: "DELETE" });
      console.log(`已清理临时工程 (${res.status})`);
    } catch (error) {
      console.error("清理临时工程失败:", error.message);
    }
  }
  await send("Browser.close").catch(() => {});
  process.exit(exitCode);
}
