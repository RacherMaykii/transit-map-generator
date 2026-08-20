// 浏览器验证：站台调整锚点（九宫格）+ 自定义长度可调范围加大。
// 1) 属性面板出现「调整锚点」九宫格；默认锚点=左上，手柄在右下角。
// 2) 选「右」锚点：手柄移到左边缘，拖拽后右边缘（x+width）保持不动。
// 3) 长度输入框遵守锚点：右锚点时改长度，右边缘不动。
// 4) 长度下限 10 → 4：输入 3 被钳制为 4。
//
// 数据源用 ?storage=http（data/ 目录），脚本自建临时工程、结束后删除。
import { startBrowser, newPage, evalJs, waitFor, clickAt, screenshot, send, textInput } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 0. 数据服务器：创建临时工程 ──
const tempName = `验证-站台锚点-${Date.now()}`;
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

let browserError = null;
try {
  await startBrowser();
  await newPage("http://127.0.0.1:3000/?storage=http");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await waitFor("document.querySelector('.portal-tools') !== null", 20000);
  await evalJs(`localStorage.setItem('metro-wiring-tutorial-dismissed', 'true')`);
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
  async function canvasRect() {
    return await evalJs(`(() => { const s = document.querySelector('.wiring-svg').getBoundingClientRect(); return { left: s.left, top: s.top }; })()`);
  }
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
  const svgRect = await canvasRect();
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
  /** 从 (x1,y1) 拖到 (x2,y2)：press + 分步 move + release */
  async function dragFrom(x1, y1, x2, y2) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1, y: y1 });
    await sleep(60);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
    await sleep(80);
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const x = x1 + ((x2 - x1) * i) / steps;
      const y = y1 + ((y2 - y1) * i) / steps;
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
      await sleep(40);
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
    await sleep(500);
  }

  // ── 放置侧式站台，进入编辑模式，选中站台 ──
  const placed = await clickCard("侧式站台站");
  if (!placed) throw new Error("侧式站台模板卡片不存在");
  const p = worldToScreen(120, 100);
  await realClick(p.x, p.y);
  await sleep(500);

  // 进入站台编辑模式（模块被放置后自动选中）
  const editBtn = await evalJs(`(() => {
    const b = [...document.querySelectorAll('.wiring-prop-actions button')].find(x => x.textContent.includes('编辑站台'));
    if (b) b.click();
    return !!b;
  })()`);
  check("存在「编辑站台」入口", editBtn === true);
  await sleep(400);

  // 读取站台几何并点击站台中心（编辑模式下可单独选中）
  async function platGeom() {
    return await evalJs(`(() => {
      const rect = document.querySelector('rect.platform.independent-platform');
      if (!rect) return null;
      const g = rect.closest('g[transform]');
      const m = g.getAttribute('transform').match(/translate\\(([-\\d.]+),([-\\d.]+)/);
      const rot = g.getAttribute('transform').match(/rotate\\(([-\\d.]+)/);
      return {
        x: parseFloat(m[1]), y: parseFloat(m[2]),
        width: parseFloat(rect.getAttribute('width')), height: parseFloat(rect.getAttribute('height')),
        rotation: rot ? parseFloat(rot[1]) : 0,
      };
    })()`);
  }
  const g0 = await platGeom();
  check("读取到站台几何", !!g0, JSON.stringify(g0));
  await clickWorld(g0.x + g0.width / 2, g0.y + g0.height / 2);
  const panelTitle = await evalJs(`(() => document.querySelector('.wiring-right-panel h3')?.textContent.trim())()`);
  check("已选中站台（右侧面板=站台）", panelTitle === "站台", `面板=${panelTitle}`);

  // ── 九宫格存在 + 默认锚点=左上，手柄在右下 ──
  const anchorGrid = await evalJs(`(() => {
    const field = [...document.querySelectorAll('.wiring-anchor-field')].find(x => x.querySelector('span')?.textContent.trim() === '调整锚点');
    if (!field) return null;
    const buttons = [...field.querySelectorAll('.wiring-anchor-grid button')];
    const hint = field.querySelector('.wiring-anchor-hint')?.textContent.trim();
    return { count: buttons.length, selected: buttons.findIndex(b => b.classList.contains('selected')), hint };
  })()`);
  check("属性面板出现「调整锚点」九宫格（9 格）", anchorGrid && anchorGrid.count === 9, `count=${anchorGrid?.count}`);
  check("默认锚点=左上", anchorGrid && anchorGrid.selected === 0, `selected=${anchorGrid?.selected}`);
  check("默认锚点提示文案", anchorGrid && anchorGrid.hint === "以「左上」为锚点：长度向右、厚度向下调整", anchorGrid?.hint);
  const handleX0 = await evalJs(`(() => {
    const r = document.querySelector('rect.object-resize-handle');
    return r ? parseFloat(r.getAttribute('x')) : null;
  })()`);
  check("默认手柄在右下角", handleX0 !== null && Math.abs(handleX0 - (g0.width - 3)) < 1, `handleX=${handleX0}, width-3=${g0.width - 3}`);

  // ── 选「右」锚点（第 6 格，索引 5）→ 手柄移到左边缘 ──
  const clickedRight = await evalJs(`(() => {
    const buttons = [...document.querySelectorAll('.wiring-anchor-grid button')];
    const b = buttons[5];
    if (!b) return false;
    b.click();
    return true;
  })()`);
  check("点击「右」锚点", clickedRight === true);
  await sleep(400);
  const anchorAfter = await evalJs(`(() => {
    const field = [...document.querySelectorAll('.wiring-anchor-field')].find(x => x.querySelector('span')?.textContent.trim() === '调整锚点');
    const buttons = field ? [...field.querySelectorAll('.wiring-anchor-grid button')] : [];
    const hint = field?.querySelector('.wiring-anchor-hint')?.textContent.trim();
    return { selected: buttons.findIndex(b => b.classList.contains('selected')), hint };
  })()`);
  check("锚点已切到「右」", anchorAfter && anchorAfter.selected === 5, `selected=${anchorAfter?.selected}`);
  check("右锚点提示文案", anchorAfter && anchorAfter.hint === "以「右」为锚点：长度向左、厚度向上下调整", anchorAfter?.hint);
  const handleX1 = await evalJs(`(() => {
    const r = document.querySelector('rect.object-resize-handle');
    return r ? parseFloat(r.getAttribute('x')) : null;
  })()`);
  check("选右锚点后手柄移到左边缘", handleX1 !== null && Math.abs(handleX1 - (-3)) < 1, `handleX=${handleX1}`);

  // ── 拖拽手柄向左：右边缘保持不动 ──
  const before = await platGeom();
  const handleCenter = await evalJs(`(() => {
    const r = document.querySelector('rect.object-resize-handle');
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  })()`);
  check("读取到右锚点手柄屏幕位置", !!handleCenter, JSON.stringify(handleCenter));
  await dragFrom(handleCenter.x, handleCenter.y, handleCenter.x - 40 * vp.scale, handleCenter.y);
  const afterDrag = await platGeom();
  const rightEdge0 = before.x + before.width;
  const rightEdge1 = afterDrag.x + afterDrag.width;
  check("拖拽后宽度增长 ~40", Math.abs(afterDrag.width - (before.width + 40)) < 2, `width ${before.width}→${afterDrag.width}`);
  check("右锚点拖拽：右边缘保持不动", Math.abs(rightEdge1 - rightEdge0) < 0.5, `right ${rightEdge0}→${rightEdge1}`);
  await screenshot(".verify/screenshots/platform-anchor-right-drag.png");

  // ── 长度输入框遵守锚点：右锚点时改长度，右边缘不动 ──
  async function setLengthInput(value) {
    const ok = await evalJs(`(() => {
      const row = [...document.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === '长度');
      const input = row && row.querySelector('input[type=number]');
      if (!input) return false;
      input.focus();
      input.select();
      return true;
    })()`);
    await textInput(String(value));
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(600);
    return ok;
  }
  await setLengthInput(160);
  const afterInput = await platGeom();
  const inputShown = await evalJs(`(() => {
    const row = [...document.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === '长度');
    return row ? row.querySelector('input[type=number]')?.value : null;
  })()`);
  check("长度输入 160 后宽度=160", afterInput.width === 160, `width=${afterInput.width}`);
  check("长度输入框显示 160", inputShown === "160", `value=${inputShown}`);
  check("右锚点输入：右边缘仍保持", Math.abs((afterInput.x + afterInput.width) - rightEdge0) < 0.5, `right=${afterInput.x + afterInput.width}`);

  // ── 长度下限 4：输入 3 被钳制为 4 ──
  await setLengthInput(3);
  const clamped = await platGeom();
  const clampedShown = await evalJs(`(() => {
    const row = [...document.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === '长度');
    return row ? row.querySelector('input[type=number]')?.value : null;
  })()`);
  check("长度输入 3 钳制为 4", clamped.width === 4 && clampedShown === "4", `width=${clamped.width}, value=${clampedShown}`);
  check("钳制后右边缘仍保持", Math.abs((clamped.x + clamped.width) - rightEdge0) < 0.5, `right=${clamped.x + clamped.width}`);
  await screenshot(".verify/screenshots/platform-anchor-min-4.png");

  console.log("\n==== 结果汇总 ====");
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} 项通过`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  ✗ ${f.name}`));
    process.exit(1);
  }
  process.exit(0);
} catch (error) {
  browserError = error;
  console.error("\n验证失败:", error.message);
  await screenshot(".verify/screenshots/platform-anchor-failure.png").catch(() => {});
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} 项通过`);
  process.exit(1);
} finally {
  if (tempId) {
    try {
      await fetch(`http://127.0.0.1:4175/api/projects/${tempId}`, { method: "DELETE" });
      console.log("已清理临时工程");
    } catch { /* ignore */ }
  }
}
