// 浏览器验证：自动避让默认关闭 + 斜向(45°)站名标签在编辑元件/重新进入时不重置位置。
//
// 背景：自动避让会沿模块斜向轴把 45° 站名反复推走（同一标签被多次 effect 触发越推越远），
// 且 relayoutModuleOwnedObjects 在编辑元件（改参数/切模板）时会把带 sourceStationId 的
// 站名弹回模板默认锚点，丢弃手动/避让产生的位移。本次修复：默认关闭避让、所有自动避让
// 调用点按开关门控、relayout 保留标签相对旧模板锚点的位移。
//
// 流程：
//   Part A（无站点模块，避让默认关闭）：
//     1) 放置侧式站台站 @(400,300) → 旋转 45° → 站名应停在 45° 锚点（不再被避让推走）。
//     2) 改「站台长度」→ 站名位置不变（编辑元件不重置）。
//   Part B（站点关联模块，带 sourceStationId 标签）：
//     3) 通过 /api/save 注入一条线路一个站点；点站点行 + 模板卡片 + 画布放置关联模块。
//     4) 旋转 45° 后手动拖动站名 (+40,+20) → 记录位移后位置。
//     5) 重选模块 → 改「站台长度」→ 站名保持位移后的位置（Fix 3：位移保留，不弹回锚点）。
//   Part C（重新进入）：
//     6) 保存 → 刷新页面 → 重新打开工程 → 两个模块的站名位置都不变（重新进入不重置）。
import { startBrowser, newPage, evalJs, waitFor, clickAt, screenshot, send } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nearly = (a, b, tol = 1.5) => Math.abs(a - b) < tol;

// ── 0. 数据服务器：创建临时工程 + 注入站点数据 ──
const tempName = `验证-标签重置-${Date.now()}`;
let tempId = null;
try {
  const res = await fetch("http://127.0.0.1:4175/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: tempName }),
  });
  tempId = (await res.json()).id;
  console.log(`临时工程: ${tempId}`);
  // 注入一条线路 + 一个站点，用于 Part B 的"站点关联模块"放置
  const dataRes = await fetch(`http://127.0.0.1:4175/api/save?project=${encodeURIComponent(tempId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: [{ id: "L1", kind: "metro", number: "1", nameZh: "一号线", nameEn: "Line 1", code: "", lineColor: "#E02020", stationColor: "#E02020", currentColor: "", passedColor: "", textColor: "#FFFFFF", description: "" }],
      stations: [{ id: "S1", lineId: "L1", sequence: 1, nameZh: "演示站", nameEn: "Demo", code: "", markerColor: "#E02020", terminalType: "normal", isOpen: true, throughLineIds: [], notes: "", icon: "" }],
      transfers: [],
    }),
  });
  const saved = await dataRes.json();
  check("注入站点数据到临时工程", saved.ok === true, `revision=${saved.revision}`);
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
  // 关键偏好：自动避让显式关闭（默认值），高级模式开（显示 45° 按钮）
  await evalJs(`(() => {
    localStorage.setItem('metro-wiring-prefs.autoAvoidance', 'false');
    localStorage.setItem('metro-wiring-prefs.advancedMode', 'true');
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
  async function clickStation(name) {
    const ok = await evalJs(`(() => {
      const row = [...document.querySelectorAll('.wiring-station-row')].find(r => r.querySelector('.name')?.textContent.trim() === '${name}');
      if (!row) return false;
      row.scrollIntoView({ block: 'center', inline: 'center' });
      row.click();
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
  const clickRotate45 = () => evalJs(`(() => {
    const b = document.querySelector('.wiring-rotation-grid button[aria-label="右下 45°"]');
    if (b) b.click();
    return !!b;
  })()`);
  async function changeParamSlider(label, value) {
    const ok = await evalJs(`(() => {
      const row = [...document.querySelectorAll('.wiring-param-slider')].find(r => r.querySelector('label')?.textContent.trim() === '${label}');
      if (!row) return false;
      const input = row.querySelector('input[type=range]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '${value}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(400);
    return ok;
  }
  /** 读取站名标签世界坐标（排除股道/道岔编号等 numeral-type 辅助小字），按文本分组 */
  async function readLabels() {
    return await evalJs(`(() => {
      const out = {};
      for (const el of document.querySelectorAll('.independent-label')) {
        if (el.getAttribute('data-numeral-type')) continue;
        const g = el.closest('g[transform]');
        const m = g && g.getAttribute('transform').match(/translate\\(([-\\d.]+),([-\\d.]+)\\)/);
        if (!m) continue;
        out[el.textContent.trim()] = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
      }
      return out;
    })()`);
  }
  const getLabel = async (text) => (await readLabels())[text];
  const rotateAround = (p, pivot, deg) => {
    const rad = (deg * Math.PI) / 180;
    const dx = p.x - pivot.x;
    const dy = p.y - pivot.y;
    return { x: pivot.x + dx * Math.cos(rad) - dy * Math.sin(rad), y: pivot.y + dx * Math.sin(rad) + dy * Math.cos(rad) };
  };
  /** 读取某模块（按世界坐标定位）的 transform 与下行轨道局部 y。
   *  注意：模板 param 分辨率可能改变模块高度/锚点（如 side_platform 被解析为高 132、轨道 y=26/86、
   *  站名锚点 y=4，而非 base 的 112/36/76/14），故锚点与轨道点击一律从 DOM 观测，不依赖模板常量。 */
  async function moduleGeometry(targetX, targetY) {
    return await evalJs(`(() => {
      const g = [...document.querySelectorAll('.module-group')].find((m) => {
        const tm = (m.getAttribute('transform') || '').match(/translate\\(([-\\d.]+),([-\\d.]+)\\)/);
        return tm && Math.abs(parseFloat(tm[1]) - ${targetX}) < 1 && Math.abs(parseFloat(tm[2]) - ${targetY}) < 1;
      });
      if (!g) return null;
      const t = g.getAttribute('transform') || '';
      const tm = t.match(/translate\\(([-\\d.]+),([-\\d.]+)\\)/);
      const rm = t.match(/rotate\\(([-\\d.]+)\\s+([-\\d.]+)\\s+([-\\d.]+)\\)/);
      const lines = [...g.querySelectorAll('line.track')].map((l) => parseFloat(l.getAttribute('y1')));
      if (!tm || !rm || !lines.length) return null;
      return { x: parseFloat(tm[1]), y: parseFloat(tm[2]), rot: parseFloat(rm[1]), cx: parseFloat(rm[2]), cy: parseFloat(rm[3]), downY: Math.max(...lines) };
    })()`);
  }

  // ── Part A：无站点模块（物化"站名"标签），避让默认关闭 → 45° 不推走、编辑不重置 ──
  const placed1 = await clickCard("侧式站台站");
  if (!placed1) throw new Error("侧式站台站模板卡片不存在");
  await clickWorld(400, 300);
  await sleep(700);
  // 记录 0° 锚点与模块旋转 pivot（从 DOM 观测）
  const posA0 = await getLabel("站名");
  const geoA0 = await moduleGeometry(400, 300);
  check("Part A：模块放置后站名标签出现在 0° 锚点", !!posA0 && !!geoA0,
    posA0 && geoA0 ? `pos=${JSON.stringify(posA0)} pivot=(${geoA0.cx},${geoA0.cy})` : `pos=${JSON.stringify(posA0)} geo=${JSON.stringify(geoA0)}`);
  await clickRotate45();
  await sleep(1000);

  const posA45 = await getLabel("站名");
  // 45° 期望 = 把 0° 锚点绕模块 pivot 转 45°。避让开启时标签会被反复推走（曾实测到 (597,257)，
  // 偏离锚点 >77px）；关闭后应精确等于纯旋转结果。
  const expectedA45 = posA0 && geoA0 ? rotateAround(posA0, { x: geoA0.x + geoA0.cx, y: geoA0.y + geoA0.cy }, 45) : null;
  check("Part A：45° 旋转后站名停在锚点（避让不再推走）", !!posA45 && !!expectedA45 && nearly(posA45.x, expectedA45.x) && nearly(posA45.y, expectedA45.y),
    posA45 && expectedA45 ? `pos=${JSON.stringify(posA45)} expected=${JSON.stringify(expectedA45)}` : `pos=${JSON.stringify(posA45)} expected=${JSON.stringify(expectedA45)}`);

  const sliderA = await changeParamSlider("站台长度", 180);
  check("Part A：打开模块属性并改「站台长度」", sliderA === true);
  const posAEdit = await getLabel("站名");
  check("Part A：编辑元件后站名位置不变", posAEdit && nearly(posAEdit.x, posA45.x) && nearly(posAEdit.y, posA45.y),
    posAEdit ? `from=${JSON.stringify(posA45)} to=${JSON.stringify(posAEdit)}` : "标签未找到");

  // ── Part B：站点关联模块（带 sourceStationId），手动位移在编辑后保留（Fix 3）──
  const stOk = await clickStation("演示站");
  check("Part B：点击站点「演示站」开始放置", stOk === true);
  const placed2 = await clickCard("侧式站台站");
  if (!placed2) throw new Error("侧式站台站模板卡片不存在");
  await clickWorld(1000, 200);
  await sleep(700);
  await clickRotate45();
  await sleep(1000);

  const posB0 = await getLabel("演示站");
  check("Part B：站点模块放置并旋转 45°", !!posB0, posB0 ? `pos=${JSON.stringify(posB0)}` : "演示站标签未找到");

  // 手动拖动 演示站 标签 (+40,+20) 世界坐标
  const dragTarget = await evalJs(`(() => {
    const el = [...document.querySelectorAll('.independent-label')].find(x => !x.getAttribute('data-numeral-type') && x.textContent.trim() === '演示站');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!dragTarget) throw new Error("演示站标签 DOM 未找到");
  const dragDx = 40 * vp.scale;
  const dragDy = 20 * vp.scale;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dragTarget.x, y: dragTarget.y });
  await sleep(80);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: dragTarget.x, y: dragTarget.y, button: "left", clickCount: 1 });
  await sleep(120);
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dragTarget.x + dragDx * i / steps, y: dragTarget.y + dragDy * i / steps, button: "left", buttons: 1 });
    await sleep(25);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: dragTarget.x + dragDx, y: dragTarget.y + dragDy, button: "left", clickCount: 1 });
  await sleep(500);

  const posB1 = await getLabel("演示站");
  check("Part B：手动拖动演示站标签 (+40,+20)", posB1 && (Math.abs(posB1.x - posB0.x) > 10 || Math.abs(posB1.y - posB0.y) > 10),
    posB1 ? `from=${JSON.stringify(posB0)} to=${JSON.stringify(posB1)}` : "标签未找到");
  // 重选模块：点该模块 45° 下行轨道中点（由 DOM 观测的 pivot + 轨道 y 精确计算）。
  // 下行轨道局部中点 (cx, downY)，旋转 offset = R(rot)·(0, downY-cy)。
  const geoB = await moduleGeometry(1000, 200);
  if (!geoB) throw new Error("Part B 模块(1000,200) 未找到");
  const radB = (geoB.rot * Math.PI) / 180;
  const downTrackWorld = {
    x: geoB.x + geoB.cx - (geoB.downY - geoB.cy) * Math.sin(radB),
    y: geoB.y + geoB.cy + (geoB.downY - geoB.cy) * Math.cos(radB),
  };
  await clickWorld(downTrackWorld.x, downTrackWorld.y);
  await sleep(400);
  const panelH3 = await evalJs(`(() => { const h = document.querySelector('.wiring-right-panel h3'); return h ? h.textContent.trim() : null; })()`);
  const sliderB = await changeParamSlider("站台长度", 200);
  check("Part B：重选模块后改「站台长度」", sliderB === true,
    `panel=${panelH3} click=(${downTrackWorld.x.toFixed(2)},${downTrackWorld.y.toFixed(2)})`);
  const posBEdit = await getLabel("演示站");
  check("Part B：编辑元件后位移保留（不弹回锚点）", posBEdit && nearly(posBEdit.x, posB1.x) && nearly(posBEdit.y, posB1.y),
    posBEdit ? `from=${JSON.stringify(posB1)} to=${JSON.stringify(posBEdit)}` : "标签未找到");
  await screenshot(".verify/screenshots/label-reset-before-reload.png");

  // ── Part C：保存 → 重新进入 → 两个标签位置不变 ──
  const saveOk = await evalJs(`(() => {
    const b = [...document.querySelectorAll('.wiring-toolbar button, .wiring-header button, button')].find(x => x.textContent.includes('保存'));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await sleep(1200);
  check("Part C：点击保存", saveOk === true);
  const posA_saved = await getLabel("站名");
  const posB_saved = await getLabel("演示站");

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
  await waitFor(`(() => !!(document.querySelector('.project-card') || document.querySelector('.project-empty')))()`, 15000);
  await sleep(500);
  const reopened = await evalJs(`(() => {
    const cards = [...document.querySelectorAll('.project-card')];
    const card = cards.find(c => c.textContent.includes('${tempName}'));
    if (!card) return false;
    const btn = [...card.querySelectorAll('button')].find(x => x.textContent.includes('打开项目'));
    if (btn) btn.click();
    return true;
  })()`);
  if (!reopened) throw new Error("重新打开工程卡片未出现");
  await waitFor("document.querySelector('.wiring-svg') !== null", 25000);
  await sleep(1200);

  const posA_re = await getLabel("站名");
  const posB_re = await getLabel("演示站");
  check("Part C：重新进入后无站点模块站名不变", posA_re && posA_saved && nearly(posA_re.x, posA_saved.x) && nearly(posA_re.y, posA_saved.y),
    posA_re && posA_saved ? `from=${JSON.stringify(posA_saved)} to=${JSON.stringify(posA_re)}` : `saved=${JSON.stringify(posA_saved)} re=${JSON.stringify(posA_re)}`);
  check("Part C：重新进入后站点关联站名不变（位移保留）", posB_re && posB_saved && nearly(posB_re.x, posB_saved.x) && nearly(posB_re.y, posB_saved.y),
    posB_re && posB_saved ? `from=${JSON.stringify(posB_saved)} to=${JSON.stringify(posB_re)}` : `saved=${JSON.stringify(posB_saved)} re=${JSON.stringify(posB_re)}`);
  await screenshot(".verify/screenshots/label-reset-after-reload.png");

  console.log("\n==== 结果汇总 ====");
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} 项通过`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  ✗ ${f.name}`));
    exitCode = 1;
  }
} catch (error) {
  console.error("\n验证失败:", error.message);
  await screenshot(".verify/screenshots/label-reset-failure.png").catch(() => {});
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
