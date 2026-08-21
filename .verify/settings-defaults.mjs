// 浏览器验证：设置 → 默认 新增可设置默认参数。
// 1) 设置「形状外观默认」：填充/描边取色 + 跟随默认开关、描边粗细、圆角矩形默认圆角。
// 2) 设置不透明度默认：形状不透明度 60%、全部对象不透明度 80%。
// 3) 设置道岔参数默认：默认道岔长度 140、默认开口幅度 32。
// 4) localStorage 持久化（usePersistentState 每次 set 即写）。
// 5) 放圆角矩形 → fill/stroke/stroke-width/rx/opacity 全部生效；放矩形 → rx=0。
// 6) 放信号机 → opacity=0.8（走全部对象不透明度），外观默认不生效。
// 7) 放左开道岔 → 模块 opacity=0.8、模板参数「长度=140」「开口幅度=32」。
// 8) 放文字 → opacity=0.8。
// 9) 恢复「跟随形状自带」→ 新圆角矩形回退内置默认填充色 #d7f0d7。
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
const tempName = `验证-设置默认-${Date.now()}`;
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
  async function viewportTransform() {
    return await evalJs(`(() => {
      const g = document.querySelector('.wiring-svg > g[transform]');
      if (!g) return null;
      const m = g.getAttribute('transform').match(/translate\\(([-\\d.]+),([-\\d.]+)\\) scale\\(([-\\d.]+)\\)/);
      if (!m) return null;
      return { panX: parseFloat(m[1]), panY: parseFloat(m[2]), scale: parseFloat(m[3]) };
    })()`);
  }
  async function canvasRect() {
    return await evalJs(`(() => { const s = document.querySelector('.wiring-svg').getBoundingClientRect(); return { left: s.left, top: s.top }; })()`);
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

  // ── 设置弹窗：打开 / 切到默认 tab / 设字段 ──
  async function openSettings() {
    const ok = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('.wiring-btn')].find(b => b.textContent.includes('设置'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    await waitFor("document.querySelector('.wiring-settings-modal') !== null", 8000);
    await sleep(300);
    return ok;
  }
  async function switchToDefaultsTab() {
    const ok = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('.wiring-settings-categories button')].find(b => b.textContent.trim() === '默认');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    await sleep(400);
    return ok;
  }
  async function closeSettings() {
    const ok = await evalJs(`(() => {
      const btn = document.querySelector('.wiring-settings-header .wiring-btn.icon-only');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    await waitFor("document.querySelector('.wiring-settings-modal') === null", 8000);
    await sleep(300);
    return ok;
  }
  /** 按 label 文本找默认 tab 里的字段并设置。kind: number | range | color | checkbox */
  async function setField(label, kind, value) {
    return await evalJs(`(() => {
      const labels = [...document.querySelectorAll('.wiring-settings-section label')];
      const field = labels.find((l) => {
        const s = l.querySelector(':scope > span');
        return s && s.textContent.includes('${label}');
      });
      if (!field) return false;
      if ('${kind}' === 'checkbox') {
        const cb = field.querySelector('input[type=checkbox]');
        if (!cb) return false;
        if (cb.checked !== (${value === true})) cb.click();
        return true;
      }
      const input = field.querySelector('input[type=${kind}]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '${value}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
  }
  async function setOverrideField(label, value) {
    return await evalJs(`(() => {
      const fields = [...document.querySelectorAll('.wiring-settings-override-field')];
      const field = fields.find((candidate) => candidate.querySelector('.wiring-settings-override-heading b')?.textContent.trim() === '${label}');
      if (!field) return false;
      const uniform = [...field.querySelectorAll('.wiring-settings-mode-switch button')].find((button) => button.textContent.trim() === '统一设置');
      if (uniform && !uniform.classList.contains('active')) uniform.click();
      const input = field.querySelector('input[type=number]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '${value}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
  }

  // ══ Phase A：设置默认值 ──
  await openSettings();
  await switchToDefaultsTab();
  const s1 = await setField("默认填充色", "checkbox", false);       // 取消「跟随形状自带」
  const s2 = await setField("默认填充色", "color", "#ff8800");
  const s3 = await setField("默认描边色", "checkbox", false);
  const s4 = await setField("默认描边色", "color", "#0033cc");
  const s5 = await setField("默认描边粗细", "number", "4");
  const s6 = await setOverrideField("圆角矩形圆角", "20");
  const s7 = await setField("形状不透明度", "range", "60");
  const s8 = await setField("全部对象不透明度", "range", "80");
  const s9 = await setOverrideField("道岔长度", "140");
  const s10 = await setOverrideField("开口幅度", "32");
  check("设置字段全部可交互", s1 && s2 && s3 && s4 && s5 && s6 && s7 && s8 && s9 && s10, "10 字段");

  // localStorage 持久化断言
  const ls = await evalJs(`({
    fill: localStorage.getItem('metro-wiring-prefs.defaultShapeFill'),
    stroke: localStorage.getItem('metro-wiring-prefs.defaultShapeStroke'),
    strokeWidth: localStorage.getItem('metro-wiring-prefs.defaultShapeStrokeWidth'),
    radius: localStorage.getItem('metro-wiring-prefs.defaultShapeRadius'),
    shapeOpacity: localStorage.getItem('metro-wiring-prefs.defaultShapeOpacity'),
    objectOpacity: localStorage.getItem('metro-wiring-prefs.defaultObjectOpacity'),
    length: localStorage.getItem('metro-wiring-prefs.defaultTurnoutLength'),
    branchOffset: localStorage.getItem('metro-wiring-prefs.defaultBranchOffset'),
    modes: localStorage.getItem('metro-wiring-prefs.defaultOverrideModes'),
  })`);
  const savedModes = ls.modes ? JSON.parse(ls.modes) : {};
  check("默认值已持久化到 localStorage", ls.fill === JSON.stringify("#ff8800") && ls.stroke === JSON.stringify("#0033cc") && ls.strokeWidth === "4" && ls.radius === "20" && ls.shapeOpacity === "0.6" && ls.objectOpacity === "0.8" && ls.length === "140" && ls.branchOffset === "32" && savedModes.shapeRadius === "uniform" && savedModes.length === "uniform" && savedModes.branchOffset === "uniform", JSON.stringify(ls));
  await closeSettings();

  // ── 放置 / 读取工具 ──
  async function clickLibraryCard(matchText) {
    const ok = await evalJs(`(() => {
      const cards = [...document.querySelectorAll('.wiring-template-card')];
      const card = cards.find((c) => c.querySelector('.wiring-template-info b')?.textContent.includes('${matchText}'));
      if (!card) return false;
      card.scrollIntoView({ block: 'center', inline: 'center' });
      card.click();
      return true;
    })()`);
    await sleep(300);
    return ok;
  }
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
  async function placeLibrary(matchText, wx, wy) {
    const selected = await clickLibraryCard(matchText);
    if (!selected) throw new Error(`元件卡片不存在: ${matchText}`);
    await clickWorld(wx, wy);
  }
  /** 读取已放置形状：外层 g translate / rect fill/stroke/rx/stroke-width / 组 opacity。 */
  async function graphicGeom(shapeType) {
    return await evalJs(`(() => {
      const shape = [...document.querySelectorAll('.shape-graphic[data-shape-type="${shapeType}"]')].pop();
      if (!shape) return null;
      const outer = shape.parentElement;
      const t = outer.getAttribute('transform');
      const m = t.match(/translate\\((-?[\\d.]+),(-?[\\d.]+)\\)/);
      const rect = shape.querySelector('rect');
      const isSignal = "${shapeType}".startsWith("signal-");
      return {
        x: m ? parseFloat(m[1]) : 0, y: m ? parseFloat(m[2]) : 0,
        fill: rect ? rect.getAttribute('fill') : null,
        stroke: rect ? rect.getAttribute('stroke') : null,
        rx: rect && !isSignal ? (rect.getAttribute('rx') !== null ? parseFloat(rect.getAttribute('rx')) : null) : null,
        strokeWidth: rect ? rect.getAttribute('stroke-width') : null,
        opacity: parseFloat(outer.getAttribute('opacity')),
      };
    })()`);
  }
  async function moduleOpacity() {
    return await evalJs(`(() => {
      const g = document.querySelector('.module-group');
      if (!g) return null;
      return parseFloat(g.getAttribute('opacity'));
    })()`);
  }
  async function labelOpacity() {
    return await evalJs(`(() => {
      const text = document.querySelector('.independent-label');
      if (!text) return null;
      const g = text.parentElement;
      return parseFloat(g.getAttribute('opacity'));
    })()`);
  }
  async function paramSlider(label) {
    return await evalJs(`(() => {
      const row = [...document.querySelectorAll('.wiring-param-slider')].find((r) => r.querySelector('label')?.textContent.trim() === '${label}');
      if (!row) return null;
      return { value: row.querySelector('input')?.value, display: row.querySelector('.wiring-param-value')?.textContent };
    })()`);
  }

  // ══ Phase B：圆角矩形 —— 外观全部生效 ──
  await placeShape('[data-shape="roundRect"]', 200, 150);
  const g0 = await graphicGeom("roundRect");
  check("圆角矩形读取几何", !!g0, JSON.stringify(g0));
  check("圆角矩形填充 = 默认填充色", g0 && g0.fill === "#ff8800", `fill=${g0?.fill}`);
  check("圆角矩形描边 = 默认描边色", g0 && g0.stroke === "#0033cc", `stroke=${g0?.stroke}`);
  check("圆角矩形描边粗细 = 4", g0 && g0.strokeWidth === "4", `sw=${g0?.strokeWidth}`);
  check("圆角矩形默认圆角 rx=20", g0 && g0.rx === 20, `rx=${g0?.rx}`);
  check("圆角矩形形状不透明度 0.6", g0 && Math.abs(g0.opacity - 0.6) < 0.02, `opacity=${g0?.opacity}`);
  await screenshot(".verify/screenshots/settings-defaults-roundrect.png");

  // ══ Phase C：矩形 —— 无圆角 ──
  await placeShape('[data-shape="rect"]', 400, 150);
  const gRect = await graphicGeom("rect");
  check("矩形读取几何", !!gRect, JSON.stringify(gRect));
  check("矩形填充 = 默认填充色", gRect && gRect.fill === "#ff8800", `fill=${gRect?.fill}`);
  check("矩形描边粗细 = 4", gRect && gRect.strokeWidth === "4", `sw=${gRect?.strokeWidth}`);
  check("矩形 rx=0", gRect && gRect.rx === 0, `rx=${gRect?.rx}`);
  check("矩形形状不透明度 0.6", gRect && Math.abs(gRect.opacity - 0.6) < 0.02, `opacity=${gRect?.opacity}`);

  // ══ Phase D：信号机 —— 不应用外观默认，opacity 走全部对象 0.8 ──
  await placeShape('[data-signal="signal-in"]', 600, 150);
  const gSig = await graphicGeom("signal-in");
  check("信号机读取几何", !!gSig, JSON.stringify(gSig));
  check("信号机全部对象不透明度 0.8", gSig && Math.abs(gSig.opacity - 0.8) < 0.02, `opacity=${gSig?.opacity}`);
  check("信号机不应用填充默认", gSig && gSig.fill !== "#ff8800", `fill=${gSig?.fill}`);
  await screenshot(".verify/screenshots/settings-defaults-shapes.png");

  // ══ Phase E：左开道岔 —— 模块 opacity + 道岔参数覆盖 ──
  await placeLibrary("左开道岔", 200, 300);
  await sleep(600);
  const modOp = await moduleOpacity();
  check("模块全部对象不透明度 0.8", modOp !== null && Math.abs(modOp - 0.8) < 0.02, `opacity=${modOp}`);
  const lenP = await paramSlider("长度");
  const brP = await paramSlider("开口幅度");
  check("道岔长度参数 = 140", lenP && lenP.value === "140", `len=${lenP?.display}`);
  check("开口幅度参数 = 32", brP && brP.value === "32", `br=${brP?.display}`);
  await screenshot(".verify/screenshots/settings-defaults-turnout.png");

  // ══ Phase F：文字 —— 全部对象不透明度 0.8 ──
  await placeLibrary("文字工具", 600, 300);
  const labOp = await labelOpacity();
  check("文字全部对象不透明度 0.8", labOp !== null && Math.abs(labOp - 0.8) < 0.02, `opacity=${labOp}`);

  // ══ Phase G：恢复「跟随形状自带」→ 新圆角矩形回退内置填充 ──
  await openSettings();
  await switchToDefaultsTab();
  const follow = await setField("默认填充色", "checkbox", true); // 重新勾选「跟随」
  check("重新勾选跟随形状自带", follow, "");
  await closeSettings();
  await placeShape('[data-shape="roundRect"]', 400, 450);
  const gF = await graphicGeom("roundRect");
  check("跟随默认后圆角矩形回退内置填充 #d7f0d7", gF && gF.fill === "#d7f0d7", `fill=${gF?.fill}`);
  check("跟随默认后描边仍用默认描边色", gF && gF.stroke === "#0033cc", `stroke=${gF?.stroke}`);
  check("跟随默认后描边粗细仍 4", gF && gF.strokeWidth === "4", `sw=${gF?.strokeWidth}`);
  check("跟随默认后形状不透明度仍 0.6", gF && Math.abs(gF.opacity - 0.6) < 0.02, `opacity=${gF?.opacity}`);

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
  await screenshot(".verify/screenshots/settings-defaults-failure.png").catch(() => {});
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
