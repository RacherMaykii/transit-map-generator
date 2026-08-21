// 浏览器验证：吸附间距可调（设置菜单「常规」）+ 默认放置设置（设置菜单「默认」）。
// 1) 常规：「吸附间距」始终显示，跟随网格时禁用并同步网格大小；取消「吸附跟随网格」→ 可编辑，设为 50；放置模块位置吸附到 50 的倍数。
//    另验证设置框大小固定，切换「常规/画布」不变。
// 2) 默认：设「默认站台长度=200」→ 放置侧式站台站，平台宽度=200。
// 3) 默认：设「默认线路间距=60」→ 放置双线区间，两条正线间距=60。
// 数据源用 ?storage=http（data/ 目录），脚本自建临时工程、结束后删除。
import { startBrowser, newPage, evalJs, waitFor, clickAt, screenshot, send, textInput } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 0. 数据服务器：创建临时工程 ──
const tempName = `验证-吸附默认值-${Date.now()}`;
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
let exitCode = 0;
try {
  await startBrowser();
  await newPage("http://127.0.0.1:3000/?storage=http");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await waitFor("document.querySelector('.portal-tools') !== null", 20000);
  // cdp.mjs 使用持久化 profile（.verify/profile），localStorage 跨运行残留；先清掉本功能相关偏好，保证从默认态开始
  await evalJs(`(() => {
    for (const k of ['snapStep', 'defaultSpacing', 'defaultPlatformLength', 'defaultPlatformWidth']) {
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

  // ── 设置弹窗交互 ──
  async function openSettings() {
    const ok = await evalJs(`(() => {
      const b = [...document.querySelectorAll('.wiring-toolbar button')].find(x => x.textContent.includes('设置'));
      if (b) b.click();
      return !!b;
    })()`);
    await waitFor("document.querySelector('.wiring-settings-modal') !== null", 8000);
    return ok;
  }
  async function closeSettings() {
    const ok = await evalJs(`(() => {
      const b = document.querySelector('.wiring-settings-modal header button[title="关闭"]');
      if (b) b.click();
      return !!b;
    })()`);
    await waitFor("document.querySelector('.wiring-settings-modal') === null", 8000);
    return ok;
  }
  async function clickSettingsTab(name) {
    return await evalJs(`(() => {
      const b = [...document.querySelectorAll('.wiring-settings-categories button')].find(x => x.textContent.trim() === '${name}');
      if (b) b.click();
      return !!b;
    })()`);
  }
  /** 通过原生 setter + input 事件设置受控 number 输入框 */
  async function setNumberInput(labelText, value) {
    return await evalJs(`(() => {
      const labels = [...document.querySelectorAll('.wiring-settings-section label')];
      const label = labels.find(l => l.firstChild?.textContent.trim() === '${labelText}');
      const input = label && label.querySelector('input[type=number]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, String(${value}));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
  }
  async function readNumberInput(labelText) {
    return await evalJs(`(() => {
      const labels = [...document.querySelectorAll('.wiring-settings-section label')];
      const label = labels.find(l => l.firstChild?.textContent.trim() === '${labelText}');
      return label && label.querySelector('input[type=number]') ? label.querySelector('input[type=number]').value : null;
    })()`);
  }
  async function setDefaultOverride(labelText, value) {
    return await evalJs(`(() => {
      const fields = [...document.querySelectorAll('.wiring-settings-override-field')];
      const field = fields.find((candidate) => candidate.querySelector('.wiring-settings-override-heading b')?.textContent.trim() === '${labelText}');
      if (!field) return false;
      const uniform = [...field.querySelectorAll('.wiring-settings-mode-switch button')].find((button) => button.textContent.trim() === '统一设置');
      if (uniform && !uniform.classList.contains('active')) uniform.click();
      const input = field.querySelector('input[type=number]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, String(${value}));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
  }
  async function readDefaultOverride(labelText) {
    return await evalJs(`(() => {
      const fields = [...document.querySelectorAll('.wiring-settings-override-field')];
      const field = fields.find((candidate) => candidate.querySelector('.wiring-settings-override-heading b')?.textContent.trim() === '${labelText}');
      return field?.querySelector('input[type=number]')?.value ?? null;
    })()`);
  }

  // ── 1. 吸附间距可调 ──
  await openSettings();
  check("设置弹窗打开，含「常规/默认/画布」三个分类", await evalJs(`document.querySelectorAll('.wiring-settings-categories button').length === 3`));
  check("常规含「吸附跟随网格」开关", await evalJs(`[...document.querySelectorAll('.wiring-settings-section label')].some(l => l.textContent.includes('吸附跟随网格'))`));
  const readModalRect = () => evalJs(`(() => {
    const m = document.querySelector('.wiring-settings-modal');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  })()`);
  const rectGeneral = await readModalRect();
  check("设置框大小固定（「常规」分类）", rectGeneral !== null, JSON.stringify(rectGeneral));

  // 吸附间距数值框始终显示；跟随网格时禁用，数值与画布「网格间距」同步
  const snapDisabled = await evalJs(`(() => {
    const labels = [...document.querySelectorAll('.wiring-settings-section label')];
    const label = labels.find(l => l.firstChild?.textContent.trim() === '吸附间距');
    const input = label && label.querySelector('input[type=number]');
    return { exists: !!input, disabled: input ? input.disabled : null, value: input ? input.value : null };
  })()`);
  check("吸附间距数值框始终显示，跟随网格时禁用", snapDisabled.exists && snapDisabled.disabled === true, JSON.stringify(snapDisabled));
  await clickSettingsTab("画布");
  await sleep(250);
  const gridVal = await readNumberInput("网格间距");
  const rectCanvas = await readModalRect();
  check(`设置框大小固定（切换「画布」不变，${rectGeneral.w}×${rectGeneral.h}）`, rectCanvas !== null && rectGeneral !== null && rectCanvas.w === rectGeneral.w && rectCanvas.h === rectGeneral.h, JSON.stringify(rectCanvas));
  await clickSettingsTab("常规");
  await sleep(250);
  check(`吸附间距同步网格大小=${gridVal}`, snapDisabled.value === gridVal, `snap=${snapDisabled.value}, grid=${gridVal}`);

  // 锁定时输入框置灰，点击输入框弹出解锁提示
  const lockedLook = await evalJs(`(() => {
    const labels = [...document.querySelectorAll('.wiring-settings-section label')];
    const label = labels.find(l => l.firstChild?.textContent.trim() === '吸附间距');
    const input = label && label.querySelector('input[type=number]');
    if (!input) return null;
    const r = input.getBoundingClientRect();
    return { bg: getComputedStyle(input).backgroundColor, rect: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } };
  })()`);
  check("跟随网格时输入框置灰（禁用外观）", lockedLook !== null && lockedLook.bg !== "rgb(255, 255, 255)", JSON.stringify(lockedLook && { bg: lockedLook.bg }));
  if (lockedLook && lockedLook.rect) {
    await realClick(lockedLook.rect.x, lockedLook.rect.y);
    const hintText = await evalJs(`(() => {
      const h = document.querySelector('.wiring-snap-field-hint');
      return h ? h.textContent.trim() : null;
    })()`);
    check("点击锁定输入框提示解锁「吸附跟随网格」", !!hintText && hintText.includes('解锁'), hintText || "无提示");
  } else {
    check("点击锁定输入框提示解锁「吸附跟随网格」", false, "无法定位输入框");
  }
  await sleep(300);

  const uncheckSnap = await evalJs(`(() => {
    const label = [...document.querySelectorAll('.wiring-settings-section label.wiring-check')].find(l => l.textContent.includes('吸附跟随网格'));
    const input = label && label.querySelector('input[type=checkbox]');
    if (!input) return { ok: false, why: 'no input' };
    // 先确保为勾选态（跟随网格=snapStep 0），再取消勾选
    if (!input.checked) input.click();
    input.click();
    return { ok: true, after: !input.checked };
  })()`);
  check("取消「吸附跟随网格」（默认跟随网格）", uncheckSnap && uncheckSnap.ok === true, uncheckSnap && uncheckSnap.after !== undefined ? `afterChecked=${uncheckSnap.after}` : JSON.stringify(uncheckSnap));
  await sleep(300);
  const snapEditable = await evalJs(`(() => {
    const labels = [...document.querySelectorAll('.wiring-settings-section label')];
    const label = labels.find(l => l.firstChild?.textContent.trim() === '吸附间距');
    const input = label && label.querySelector('input[type=number]');
    return input ? { disabled: input.disabled, value: input.value } : null;
  })()`);
  check("取消后「吸附间距」可编辑", snapEditable && snapEditable.disabled === false, JSON.stringify(snapEditable));
  await setNumberInput("吸附间距", 50);
  await sleep(300);
  const snapValue = await evalJs(`(() => {
    const labels = [...document.querySelectorAll('.wiring-settings-section label')];
    const label = labels.find(l => l.firstChild?.textContent.trim() === '吸附间距');
    return label ? label.querySelector('input[type=number]').value : null;
  })()`);
  check("吸附间距设为 50", snapValue === "50", `value=${snapValue}`);
  await closeSettings();

  // 放置单线区间：点击世界 (123,145)，应吸附到 (100,150)（50 的倍数）
  const placed1 = await clickCard("单线区间");
  if (!placed1) throw new Error("单线区间模板卡片不存在");
  await clickWorld(123, 145);
  await sleep(500);
  const snapPos = await evalJs(`(() => {
    const g = [...document.querySelectorAll('.module-group')].find(x => x.querySelector('.track.main'));
    if (!g) return null;
    const m = g.getAttribute('transform').match(/translate\\(([-\\d.]+),([-\\d.]+)\\)/);
    return m ? { x: Math.round(parseFloat(m[1])), y: Math.round(parseFloat(m[2])) } : null;
  })()`);
  check("吸附间距 50：模块吸附到 (100,150)", snapPos && snapPos.x === 100 && snapPos.y === 150, `pos=${JSON.stringify(snapPos)}`);
  await screenshot(".verify/screenshots/snap-defaults-snap-step.png");

  // ── 2. 默认站台长度 ──
  await openSettings();
  await clickSettingsTab("默认");
  await waitFor("document.querySelector('.wiring-settings-section') !== null", 5000);
  const defaultsTabOk = await evalJs(`(() => {
    const section = [...document.querySelectorAll('.wiring-settings-section')].find(s => s.querySelector('h3')?.textContent.trim() === '新元件默认值');
    const names = section ? [...section.querySelectorAll('.wiring-settings-override-heading b')].map((node) => node.textContent.trim()) : [];
    const hasLen = names.includes('站台长度');
    const hasSpacing = names.includes('线路间距');
    return { hasLen, hasSpacing };
  })()`);
  check("「默认」分类显示默认站台长度/宽度/线路间距", defaultsTabOk.hasLen && defaultsTabOk.hasSpacing, JSON.stringify(defaultsTabOk));
  await setDefaultOverride("站台长度", 200);
  await sleep(300);
  check("默认站台长度已设为 200", (await readDefaultOverride("站台长度")) === "200", `value=${await readDefaultOverride("站台长度")}`);
  await closeSettings();

  const placed2 = await clickCard("侧式站台站");
  if (!placed2) throw new Error("侧式站台站模板卡片不存在");
  await clickWorld(400, 300);
  await sleep(500);
  const platW = await evalJs(`(() => {
    const rects = [...document.querySelectorAll('rect.platform.independent-platform')];
    const widths = rects.map(r => parseFloat(r.getAttribute('width')));
    return widths.length ? widths : null;
  })()`);
  check("默认站台长度 200：侧式站台平台宽度=200", platW && platW.every((w) => Math.abs(w - 200) < 1), `widths=${JSON.stringify(platW)}`);
  await screenshot(".verify/screenshots/snap-defaults-platform-length.png");

  // ── 3. 默认线路间距 ──
  await openSettings();
  await clickSettingsTab("默认");
  await setDefaultOverride("线路间距", 60);
  await sleep(300);
  check("默认线路间距已设为 60", (await readDefaultOverride("线路间距")) === "60", `value=${await readDefaultOverride("线路间距")}`);
  await closeSettings();

  const placed3 = await clickCard("双线区间");
  if (!placed3) throw new Error("双线区间模板卡片不存在");
  await clickWorld(800, 300);
  await sleep(500);
  const dt = await evalJs(`(() => {
    const groups = [...document.querySelectorAll('.module-group')];
    const g = groups.find(x => x.querySelectorAll('line.track.main').length >= 2);
    if (!g) return null;
    const ys = [...g.querySelectorAll('line.track.main')].map(l => parseFloat(l.getAttribute('y1'))).sort((a, b) => a - b);
    const m = g.getAttribute('transform').match(/translate\\(([-\\d.]+),([-\\d.]+)\\)/);
    return { ys, x: m ? parseFloat(m[1]) : null, y: m ? parseFloat(m[2]) : null };
  })()`);
  const spacing = dt && dt.ys.length >= 2 ? dt.ys[1] - dt.ys[0] : null;
  check("默认线路间距 60：双线正线间距=60", spacing !== null && Math.abs(spacing - 60) < 0.5, `ys=${dt && JSON.stringify(dt.ys)}, spacing=${spacing}`);
  await screenshot(".verify/screenshots/snap-defaults-spacing.png");

  // ── 4. 模板参数已记录（点选双线区间模块看属性面板）──
  async function readInspector() {
    return await evalJs(`(() => {
      const panel = document.querySelector('.wiring-right-panel');
      if (!panel) return null;
      const rows = [...panel.querySelectorAll('.wiring-param-slider')];
      const spacingRow = rows.find(r => r.querySelector('label')?.textContent.trim() === '线路间距');
      return {
        title: panel.querySelector('h3')?.textContent.trim(),
        spacingValue: spacingRow ? spacingRow.querySelector('input[type=range]').value : null,
        selectedMods: document.querySelectorAll('.module-group.selected').length,
      };
    })()`);
  }
  if (dt && dt.x !== null && dt.y !== null) {
    // 双线区间 spacing=60 → 上行轨 y=26、下行轨 y=86（模块局部坐标）；点击正线选中模块
    let inspector = null;
    for (const [label, ly] of [["上行轨", 26], ["下行轨", 86]]) {
      await clickWorld(dt.x + 90, dt.y + ly);
      inspector = await readInspector();
      if (inspector && inspector.spacingValue === "60") break;
    }
    if (inspector && inspector.spacingValue === "60") {
      check("属性面板显示双线区间线路间距=60", true, `title=${inspector.title}`);
    } else {
      const diag = await evalJs(`(() => {
        const g = [...document.querySelectorAll('.module-group')].find(x => x.querySelectorAll('line.track.main').length >= 2);
        if (!g) return null;
        const m = g.getAttribute('transform').match(/translate\\(([-\\d.]+),([-\\d.]+)\\)/);
        return { transform: g.getAttribute('transform'), x: m ? m[1] : null, y: m ? m[2] : null };
      })()`);
      check("属性面板显示双线区间线路间距=60", false, `${JSON.stringify(inspector)} dt=${JSON.stringify({ x: dt.x, y: dt.y, ys: dt.ys })} diag=${JSON.stringify(diag)}`);
    }
  } else {
    check("属性面板显示双线区间线路间距=60", false, "未找到双线区间模块");
  }

  console.log("\n==== 结果汇总 ====");
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} 项通过`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  ✗ ${f.name}`));
    exitCode = 1;
  }
} catch (error) {
  browserError = error;
  console.error("\n验证失败:", error.message);
  await screenshot(".verify/screenshots/snap-defaults-failure.png").catch(() => {});
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} 项通过`);
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
