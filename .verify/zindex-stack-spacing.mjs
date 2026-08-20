// 浏览器验证（两个新行为）：
// 1) 站台堆叠调层级：修改某个站台的 Z-Index 后，所属模块（线路/轨道）与手动连接线同步同幅升降，
//    不再"只有站台生效、线路没生效"。断言：平台A升到平台B上方，同时模块A（含轨道）也升到模块B上方。
// 2) 侧式/岛式/同台换乘站台可自定义线路间距：拖 线路间距 滑块后，轨道、站台、站名一起跟随移动。
//
// 数据源用 ?storage=http（真实数据服务器，data/ 目录），脚本自建临时工程、结束后删除，不污染真实工程。
import { startBrowser, newPage, evalJs, waitFor, clickAt, screenshot, send, textInput } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 0. 数据服务器：创建临时工程（唯一名），结束删除 ──
const tempName = `验证-层级间距-${Date.now()}`;
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

  // 打开临时工程（按名称找卡片）
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
  // 首次使用提示遮罩：直接设置 localStorage 并（必要时）点掉确认按钮
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
  // 教程遮罩：设置 localStorage 并点「跳过」按钮（如果已渲染）
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
    // 直接调用 card.click()：卡片可能位于折叠的折叠面板里，坐标点击不可靠。
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
  async function placeAt(name, wx, wy) {
    const ok = await clickCard(name);
    if (!ok) throw new Error(`模板卡片不存在: ${name}`);
    const p = worldToScreen(wx, wy);
    await realClick(p.x, p.y);
  }
  async function clickTool(name) {
    const ok = await evalJs(`(() => {
      const b = [...document.querySelectorAll('.wiring-segmented button')].find(x => x.textContent.trim() === '${name}');
      if (!b) return false;
      b.click();
      return true;
    })()`);
    await sleep(200);
    return ok;
  }
  /** 先 mousemove（更新应用鼠标世界坐标与 ghost）再 press+release，否则放置/选中不生效 */
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

  /** 视口组内各模块/站台组的兄弟下标（下标大 = 后渲染 = 盖在上面） */
  async function stackInfo() {
    return await evalJs(`(() => {
      const host = document.querySelector('.wiring-svg > g[transform]');
      if (!host) return null;
      const children = [...host.children];
      const parseX = (el) => {
        const m = el.getAttribute('transform').match(/translate\\(([-\\d.]+),([-\\d.]+)/);
        return m ? parseFloat(m[1]) : NaN;
      };
      const modules = [];
      const platforms = [];
      for (let i = 0; i < children.length; i++) {
        if (children[i].classList.contains('module-group')) modules.push({ index: i, x: parseX(children[i]) });
        if (children[i].querySelector('rect.platform.independent-platform')) platforms.push({ index: i, x: parseX(children[i]) });
      }
      return { modules, platforms };
    })()`);
  }

  // ════════════════════════════════════════════
  // 第二部分先做：侧式站台 线路间距 滑块
  // ════════════════════════════════════════════
  await placeAt("侧式站台站", 120, 100); // 侧式站台 模块 (120,100)
  // 放置后模块自动选中，直接检查属性面板（不需要再点选）
  const placedSel = await evalJs(`(() => {
    const sel = document.querySelector('.module-group.selected');
    return sel ? sel.getAttribute('transform').startsWith('translate(120,') : false;
  })()`);
  check("放置后侧式站台模块已选中", placedSel === true);

  // 选中后应出现 模板参数 / 线路间距 滑块
  const sliderInfo = await evalJs(`(() => {
    const group = [...document.querySelectorAll('.wiring-prop-group')].find(g => g.querySelector('h5')?.textContent.trim() === '模板参数');
    if (!group) return null;
    const row = [...group.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === '线路间距');
    const slider = row && row.querySelector('input[type=range]');
    return slider ? { value: slider.value, min: slider.min, max: slider.max } : null;
  })()`);
  check("侧式站台出现「线路间距」滑块", !!sliderInfo, JSON.stringify(sliderInfo));
  check("滑块默认值=40", sliderInfo?.value === "40", `value=${sliderInfo?.value}`);

  /** 读取侧式站台模块（x≈120）的轨道Y / 站台Y / 站名Y */
  async function readSideState() {
    return await evalJs(`(() => {
      const host = document.querySelector('.wiring-svg > g[transform]');
      const g = [...document.querySelectorAll('.module-group')].find(m => m.getAttribute('transform').startsWith('translate(120,'));
      if (!g) return null;
      const trackYs = [...g.querySelectorAll('line.track.main')].map(l => parseFloat(l.getAttribute('y1'))).sort((a,b)=>a-b);
      const platformYs = [];
      for (const el of host.children) {
        if (!el.querySelector('rect.platform.independent-platform')) continue;
        const m = el.getAttribute('transform').match(/translate\\(([-\\d.]+),([-\\d.]+)/);
        if (m && Math.abs(parseFloat(m[1]) - 130) < 40) platformYs.push(parseFloat(m[2]));
      }
      platformYs.sort((a,b)=>a-b);
      // 站名：优先独立物化标签（站名对象），否则退回模块组内模板标签
      let labelY = null;
      for (const el of host.children) {
        const t = el.querySelector('text.independent-label, text.station-label');
        if (!t) continue;
        const m = el.getAttribute('transform').match(/translate\\(([-\\d.]+),([-\\d.]+)/);
        if (m && Math.abs(parseFloat(m[1]) - 210) < 40) { labelY = parseFloat(m[2]); break; }
      }
      if (labelY === null) {
        const l = g.querySelector('text.station-label');
        labelY = l ? parseFloat(l.getAttribute('y')) : null;
      }
      return { trackYs, platformYs, labelY };
    })()`);
  }

  // 读取改变前的轨道 Y / 站台 Y / 站名 Y
  const before = await readSideState();
  check("初始轨道 Y=[36,76]", Array.isArray(before?.trackYs) && before.trackYs[0] === 36 && before.trackYs[1] === 76, JSON.stringify(before?.trackYs));
  check("初始站台存在 2 个", before?.platformYs?.length === 2, JSON.stringify(before?.platformYs));

  // 拖动滑块到 80
  const sliderSet = await evalJs(`(() => {
    const group = [...document.querySelectorAll('.wiring-prop-group')].find(g => g.querySelector('h5')?.textContent.trim() === '模板参数');
    const row = [...group.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === '线路间距');
    const slider = row.querySelector('input[type=range]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(slider, '80');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  check("设置线路间距=80", sliderSet === true);
  await sleep(600);

  const after = await readSideState();
  check("轨道随间距拉开 → [16,96]", Array.isArray(after?.trackYs) && after.trackYs[0] === 16 && after.trackYs[1] === 96, JSON.stringify(after?.trackYs));
  check("站台随轨道移动（Y 变化）", before?.platformYs?.length === 2 && after?.platformYs?.length === 2 && after.platformYs[0] !== before.platformYs[0] && after.platformYs[1] !== before.platformYs[1], `before=${JSON.stringify(before?.platformYs)} after=${JSON.stringify(after?.platformYs)}`);
  check("站名随轨道移动", before?.labelY !== null && after?.labelY !== null && after.labelY !== before.labelY, `labelY ${before?.labelY} → ${after?.labelY}`);
  await screenshot(".verify/screenshots/zindex-stack-spacing-side80.png");

  // 还原间距，避免影响后续
  await evalJs(`(() => {
    const group = [...document.querySelectorAll('.wiring-prop-group')].find(g => g.querySelector('h5')?.textContent.trim() === '模板参数');
    const row = [...group.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === '线路间距');
    const slider = row.querySelector('input[type=range]');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(slider, '40');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(500);
  await clickTool("自动");
  const emptyPt = await evalJs(`(() => { const r = document.querySelector('.wiring-svg').getBoundingClientRect(); return { x: r.left + 10, y: r.top + 10 }; })()`);
  await realClick(emptyPt.x, emptyPt.y); // 空白处取消选中

  // ════════════════════════════════════════════
  // 第一部分：站台堆叠调层级，线路同步
  // ════════════════════════════════════════════
  await placeAt("岛式站台站", 300, 100); // 岛式站台 A
  await placeAt("岛式站台站", 380, 100); // 岛式站台 B（与 A 平台重叠 → 堆叠）

  const counts = await evalJs(`(() => ({
    modules: document.querySelectorAll('.module-group').length,
    platforms: document.querySelectorAll('rect.platform.independent-platform').length,
  }))()`);
  check("已有 3 个模块 + 4 个站台（侧式2 + 岛式 A/B 各1）", counts.modules === 3 && counts.platforms === 4, JSON.stringify(counts));

  // 取初始层级：模块A(x=300) vs 模块B(x=380)；平台A(x≈310) vs 平台B(x≈390)
  const order0 = await stackInfo();
  const findMod = (info, x) => info.modules.find(m => Math.abs(m.x - x) < 20);
  const findPlat = (info, x) => info.platforms.find(p => Math.abs(p.x - x) < 20);
  const mA0 = findMod(order0, 300), mB0 = findMod(order0, 380);
  const pA0 = findPlat(order0, 310), pB0 = findPlat(order0, 390);
  check("初始：模块A 在 模块B 之下（后放置盖在上面）", mA0 && mB0 && mA0.index < mB0.index, `A=${mA0?.index} B=${mB0?.index}`);
  check("初始：平台A 在 平台B 之下", pA0 && pB0 && pA0.index < pB0.index, `A=${pA0?.index} B=${pB0?.index}`);

  // 点平台A（340,156，A 独有区域）→ 选中模块A
  await clickWorld(340, 156);
  const selMod = await evalJs(`(() => {
    const sel = document.querySelector('.module-group.selected');
    return sel ? sel.getAttribute('transform').startsWith('translate(300,') : false;
  })()`);
  check("点平台 A 选中模块 A", selMod === true);

  // 进入站台编辑模式
  const editBtn = await evalJs(`(() => {
    const b = [...document.querySelectorAll('.wiring-prop-actions button')].find(x => x.textContent.includes('编辑站台'));
    if (b) b.click();
    return !!b;
  })()`);
  check("存在「编辑站台」入口", editBtn === true);
  await sleep(400);

  // 再点平台A → 选中平台A（PlatformInspector）
  await clickWorld(340, 156);
  const platSel = await evalJs(`(() => document.querySelector('.wiring-right-panel h3')?.textContent.trim())()`);
  check("已选中平台 A（右侧面板=站台）", platSel === "站台", `面板=${platSel}`);

  // 切到手动层级，再把 Z-Index 改成 10
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('.wiring-crossing-buttons button')].find(x => x.textContent.includes('手动层级'));
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(400);
  const ziFocus = await evalJs(`(() => {
    const row = [...document.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === 'Z-Index');
    const input = row && row.querySelector('input[type=number]');
    if (!input || input.readOnly) return false;
    input.focus();
    input.select();
    return true;
  })()`);
  check("Z-Index 输入可编辑（手动层级）", ziFocus === true);
  await textInput("10");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await sleep(600);

  const order1 = await stackInfo();
  const mA1 = findMod(order1, 300), mB1 = findMod(order1, 380);
  const pA1 = findPlat(order1, 310), pB1 = findPlat(order1, 390);
  check("改平台A Z-Index=10 后：平台A 升到 平台B 上方", pA1 && pB1 && pA1.index > pB1.index, `A=${pA1?.index} B=${pB1?.index}`);
  check("改平台A Z-Index 后：模块A（线路）同步升到 模块B 上方", mA1 && mB1 && mA1.index > mB1.index, `A=${mA1?.index} B=${mB1?.index}`);
  // 关键：跨图层边界不"错位"——A 在前，A 的轨道必须盖过 B 的站台（而不是 B 站台
  // 因为"站台层永远在轨道层之上"而压住 A 的轨道）。整座车站作为一个单位升降。
  check("跨层一致：模块A（轨道）盖过 平台B，不再错位", mA1 && pB1 && mA1.index > pB1.index, `moduleA=${mA1?.index} platformB=${pB1?.index}`);
  check("跨层一致：整座 A 在 B 之上（模块A>平台B>模块B）", mA1 && pB1 && mB1 && mA1.index > pB1.index && pB1.index > mB1.index, `A=${mA1?.index} pB=${pB1?.index} B=${mB1?.index}`);
  const ziEnd = await evalJs(`(() => {
    const row = [...document.querySelectorAll('.wiring-prop-row')].find(r => r.querySelector('label')?.textContent.trim() === 'Z-Index');
    return row ? row.querySelector('input[type=number]')?.value : null;
  })()`);
  check("Z-Index 输入框=10", ziEnd === "10", `Z-Index=${ziEnd}`);
  await screenshot(".verify/screenshots/zindex-stack-spacing-top.png");

  console.log("\n==== 结果汇总 ====");
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} 项通过`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  ✗ ${f.name}`));
    process.exit(1);
  }
  process.exit(0);
} finally {
  if (tempId) {
    try {
      await fetch(`http://127.0.0.1:4175/api/projects/${tempId}`, { method: "DELETE" });
      console.log("已清理临时工程");
    } catch { /* ignore */ }
  }
}
