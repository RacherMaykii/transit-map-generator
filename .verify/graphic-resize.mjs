// 浏览器验证：基础元素矢量形状的控制点自定义（尺寸 / 长宽比 / 圆角 / 边框粗细）。
// 1) 圆角矩形放置后：8 个缩放手柄 + 1 个圆角手柄，<rect rx="12" stroke-width="1.5">。
// 2) 自由拖右下角：宽高变化、左上锚点（视觉角点）保持不动。
// 3) Shift 拖角点：长宽比保持（等比）。
// 4) 拖圆角手柄：rx 增加、属性面板「圆角」滑块跟随。
// 5) 属性面板「描边粗细」滑块 → <rect stroke-width> 更新。
// 6) 矩形：8 手柄、无圆角手柄、rx="0"。
// 7) 信号机：仅 1 个右下等比手柄（object-resize-handle），无多控制点。
// 8) Ctrl+Z 撤销拖拽恢复尺寸（快照/丢弃正确）。
//
// 数据源用 ?storage=http（data/ 目录），脚本自建临时工程、结束后删除（DELETE 在退出前）。
import { startBrowser, newPage, evalJs, waitFor, clickAt, screenshot, send } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 0. 数据服务器：创建临时工程 ──
const tempName = `验证-图形控制点-${Date.now()}`;
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
  /** 从世界坐标 (x1,y1) 拖到 (x2,y2)；modifiers: 8=Shift（按住等比）。 */
  async function dragWorld(x1, y1, x2, y2, modifiers = 0) {
    const a = worldToScreen(x1, y1);
    const b = worldToScreen(x2, y2);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y, modifiers });
    await sleep(60);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", clickCount: 1, modifiers });
    await sleep(80);
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      const y = a.y + ((b.y - a.y) * i) / steps;
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1, modifiers });
      await sleep(40);
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1, modifiers });
    await sleep(500);
  }
  async function pressCtrlZ() {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
    await sleep(600);
  }

  // ── 放置 / 读取工具 ──
  async function clickShapeCard(selector) {
    const ok = await evalJs(`(() => {
      const card = document.querySelector('${selector}');
      if (!card) return false;
      card.scrollIntoView({ block: 'center', inline: 'center' });
      card.click();
      return true;
    })()`);
    await sleep(300);
    return ok;
  }
  async function placeShape(selector, wx, wy) {
    const selected = await clickShapeCard(selector);
    if (!selected) throw new Error(`形状卡片不存在: ${selector}`);
    await clickWorld(wx, wy);
  }
  /** 读取已放置形状的几何（外层 g translate + 旋转中心 / 内层 rect 尺寸）。 */
  async function graphicGeom(shapeType) {
    return await evalJs(`(() => {
      const shape = document.querySelector('.shape-graphic[data-shape-type="${shapeType}"]');
      if (!shape) return null;
      const outer = shape.parentElement;
      const t = outer.getAttribute('transform');
      const m = t.match(/translate\\((-?[\\d.]+),(-?[\\d.]+)\\)/);
      const rt = t.match(/rotate\\((-?[\\d.]+) (-?[\\d.]+) (-?[\\d.]+)\\)/);
      const rect = shape.querySelector('rect');
      const isSignal = "${shapeType}".startsWith("signal-");
      const width = isSignal ? 2 * parseFloat(rt[2]) : parseFloat(rect.getAttribute('width'));
      const height = isSignal ? 2 * parseFloat(rt[3]) : parseFloat(rect.getAttribute('height'));
      return {
        x: parseFloat(m[1]), y: parseFloat(m[2]),
        width, height,
        rotation: rt ? parseFloat(rt[1]) : 0,
        rx: rect && !isSignal ? (rect.getAttribute('rx') !== null ? parseFloat(rect.getAttribute('rx')) : null) : null,
        strokeWidth: rect && !isSignal ? rect.getAttribute('stroke-width') : null,
      };
    })()`);
  }
  async function sliderValue(label) {
    return await evalJs(`(() => {
      const row = [...document.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === '${label}');
      const input = row && row.querySelector('input[type=range]');
      return input ? input.value : null;
    })()`);
  }
  async function setRangeInput(label, value) {
    return await evalJs(`(() => {
      const row = [...document.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === '${label}');
      const input = row && row.querySelector('input[type=range]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '${value}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
  }

  // ══ Phase A：圆角矩形 ──
  await placeShape('[data-shape="roundRect"]', 200, 150);
  const g0 = await graphicGeom("roundRect");
  check("已放置圆角矩形并读取几何", !!g0, JSON.stringify(g0));
  const roundRectHandles = await evalJs(`(() => ({
    resize: document.querySelectorAll('.graphic-resize-handle').length,
    radius: document.querySelectorAll('.graphic-radius-handle').length,
    object: document.querySelectorAll('.object-resize-handle').length,
  }))()`);
  check("圆角矩形：8 个缩放手柄", roundRectHandles.resize === 8, `resize=${roundRectHandles.resize}`);
  check("圆角矩形：1 个圆角手柄", roundRectHandles.radius === 1, `radius=${roundRectHandles.radius}`);
  check("圆角矩形：无旧式单手柄", roundRectHandles.object === 0, `object=${roundRectHandles.object}`);
  check("圆角矩形默认 rx=12", g0 && g0.rx === 12, `rx=${g0?.rx}`);
  check("圆角矩形默认 stroke-width=1.5", g0 && g0.strokeWidth === "1.5", `sw=${g0?.strokeWidth}`);
  const sliderDef = await sliderValue("描边粗细");
  check("属性面板「描边粗细」滑块默认 1.5", sliderDef === "1.5", `value=${sliderDef}`);
  const radiusDef = await sliderValue("圆角");
  check("属性面板「圆角」滑块默认 12", radiusDef === "12", `value=${radiusDef}`);
  await screenshot(".verify/screenshots/graphic-resize-roundrect-placed.png");

  // 自由拖右下角 (+30,+10) → 左上锚点不动
  await dragWorld(g0.x + g0.width, g0.y + g0.height, g0.x + g0.width + 30, g0.y + g0.height + 10);
  const g1 = await graphicGeom("roundRect");
  check("自由拖拽：宽 +30 高 +10", g1 && Math.abs(g1.width - (g0.width + 30)) < 1 && Math.abs(g1.height - (g0.height + 10)) < 1, `${g0.width}×${g0.height} → ${g1?.width}×${g1?.height}`);
  check("自由拖拽：左上锚点保持不动", g1 && Math.abs(g1.x - g0.x) < 0.5 && Math.abs(g1.y - g0.y) < 0.5, `(${g0.x},${g0.y}) → (${g1?.x},${g1?.y})`);
  await pressCtrlZ();
  const g0b = await graphicGeom("roundRect");
  check("撤销恢复尺寸", g0b && Math.abs(g0b.width - g0.width) < 0.5 && Math.abs(g0b.height - g0.height) < 0.5, `${g0b?.width}×${g0b?.height}`);

  // 右中手柄：只改宽（斜拖也忽略纵向位移）
  await clickWorld(g0.x + g0.width / 2, g0.y + g0.height / 2); // 重新选中（撤销可能清了选中）
  await dragWorld(g0.x + g0.width, g0.y + g0.height / 2, g0.x + g0.width + 20, g0.y + g0.height / 2 + 10);
  const gEdgeW = await graphicGeom("roundRect");
  check("右中手柄只改宽度", gEdgeW && Math.abs(gEdgeW.width - (g0.width + 20)) < 1.5 && Math.abs(gEdgeW.height - g0.height) < 1.5, `${gEdgeW?.width}×${gEdgeW?.height}`);
  await pressCtrlZ();

  // 上中手柄：只改高（斜拖也忽略横向位移）
  await clickWorld(g0.x + g0.width / 2, g0.y + g0.height / 2);
  await dragWorld(g0.x + g0.width / 2, g0.y, g0.x + g0.width / 2 + 20, g0.y - 10);
  const gEdgeH = await graphicGeom("roundRect");
  check("上中手柄只改高度", gEdgeH && Math.abs(gEdgeH.height - (g0.height + 10)) < 1.5 && Math.abs(gEdgeH.width - g0.width) < 1.5, `${gEdgeH?.width}×${gEdgeH?.height}`);
  await pressCtrlZ();

  // Shift 拖右下角 (+30,+10) → 等比
  await clickWorld(g0.x + g0.width / 2, g0.y + g0.height / 2); // 重新选中（撤销可能清了选中）
  await dragWorld(g0.x + g0.width, g0.y + g0.height, g0.x + g0.width + 30, g0.y + g0.height + 10, 8);
  const g2 = await graphicGeom("roundRect");
  check("Shift 拖拽：长宽比保持", g2 && Math.abs(g2.width / g2.height - g0.width / g0.height) < 0.01, `ratio ${(g0.width / g0.height).toFixed(3)} → ${g2 ? (g2.width / g2.height).toFixed(3) : "?"} (${g2?.width}×${g2?.height})`);
  await pressCtrlZ();
  const g0c = await graphicGeom("roundRect");
  check("等比撤销恢复", g0c && Math.abs(g0c.width - g0.width) < 0.5, `${g0c?.width}×${g0c?.height}`);

  // 拖圆角手柄 (+10) → rx 增加、滑块跟随
  await clickWorld(g0.x + g0.width / 2, g0.y + g0.height / 2);
  await dragWorld(g0.x + g0.rx, g0.y, g0.x + g0.rx + 10, g0.y);
  const g3 = await graphicGeom("roundRect");
  check("拖圆角手柄：rx +10", g3 && Math.abs(g3.rx - (g0.rx + 10)) < 1.5, `rx ${g0.rx} → ${g3?.rx}`);
  const radiusAfter = await sliderValue("圆角");
  check("属性面板「圆角」滑块跟随", radiusAfter !== null && Math.abs(Number(radiusAfter) - (g0.rx + 10)) < 1.5, `value=${radiusAfter}`);
  await screenshot(".verify/screenshots/graphic-resize-radius-drag.png");

  // 属性面板「描边粗细」滑块 → stroke-width 更新
  await setRangeInput("描边粗细", 4);
  const g4 = await graphicGeom("roundRect");
  check("描边粗细滑块 4 → stroke-width=4", g4 && g4.strokeWidth === "4", `sw=${g4?.strokeWidth}`);
  await screenshot(".verify/screenshots/graphic-resize-stroke-4.png");

  // ══ Phase B：矩形（无圆角） ──
  await placeShape('[data-shape="rect"]', 400, 150);
  const gRect = await graphicGeom("rect");
  check("已放置矩形并读取几何", !!gRect, JSON.stringify(gRect));
  const rectHandles = await evalJs(`(() => ({
    resize: document.querySelectorAll('.graphic-resize-handle').length,
    radius: document.querySelectorAll('.graphic-radius-handle').length,
  }))()`);
  check("矩形：8 个缩放手柄", rectHandles.resize === 8, `resize=${rectHandles.resize}`);
  check("矩形：无圆角手柄", rectHandles.radius === 0, `radius=${rectHandles.radius}`);
  check("矩形 rx=0", gRect && gRect.rx === 0, `rx=${gRect?.rx}`);

  // ══ Phase C：信号机（旧式右下等比单手柄） ──
  await placeShape('[data-signal="signal-in"]', 600, 150);
  const gSig = await graphicGeom("signal-in");
  check("已放置信号机并读取几何", !!gSig, JSON.stringify(gSig));
  const sigHandles = await evalJs(`(() => ({
    resize: document.querySelectorAll('.graphic-resize-handle').length,
    radius: document.querySelectorAll('.graphic-radius-handle').length,
    object: document.querySelectorAll('.object-resize-handle').length,
  }))()`);
  check("信号机：无多控制点", sigHandles.resize === 0 && sigHandles.radius === 0, `resize=${sigHandles.resize}, radius=${sigHandles.radius}`);
  check("信号机：仅 1 个右下等比手柄", sigHandles.object === 1, `object=${sigHandles.object}`);
  // Shift 拖右下角 → 等比
  await dragWorld(gSig.x + gSig.width, gSig.y + gSig.height, gSig.x + gSig.width + 10, gSig.y + gSig.height + 10, 8);
  const gSig2 = await graphicGeom("signal-in");
  check("信号机等比缩放保持长宽比", gSig2 && Math.abs(gSig2.width / gSig2.height - gSig.width / gSig.height) < 0.02, `ratio ${(gSig.width / gSig.height).toFixed(3)} → ${gSig2 ? (gSig2.width / gSig2.height).toFixed(3) : "?"} (${gSig2?.width}×${gSig2?.height})`);
  await screenshot(".verify/screenshots/graphic-resize-signal-aspect.png");

  const failed = results.filter((r) => !r.ok);
  console.log("\n==== 结果汇总 ====");
  console.log(`${results.length - failed.length}/${results.length} 项通过`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  ✗ ${f.name}`));
    exitCode = 1;
  }
} catch (error) {
  exitCode = 1;
  console.error("\n验证失败:", error.message);
  await screenshot(".verify/screenshots/graphic-resize-failure.png").catch(() => {});
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} 项通过`);
}

// ── 清理临时工程（必须在退出前完成） ──
if (tempId) {
  try {
    await fetch(`http://127.0.0.1:4175/api/projects/${tempId}`, { method: "DELETE" });
    console.log("已清理临时工程");
  } catch { /* ignore */ }
}
process.exit(exitCode);
