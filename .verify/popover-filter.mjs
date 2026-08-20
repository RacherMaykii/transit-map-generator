// 浏览器验证：配线图「筛选」弹出菜单不再导致空白页。
//
// 背景：PopoverMenu 曾在 .map(renderItem) 回调里直接调 useState（section 折叠状态）。弹层关闭时
// 该 hook 不渲染、打开时渲染，连续渲染间 hook 数量变化触发 React "Rendered more hooks" 崩溃，
// 无错误边界导致整个编辑器变空白页。修复：把 section 抽成独立组件 PopoverSectionItem，useState
// 拥有自己的 hook 上下文。本脚本验证打开弹层、展开「高级筛选」、关闭/重开都不崩。
import { startBrowser, newPage, evalJs, waitFor, clickAt, send } from "./cdp.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

const tempName = `验证-筛选-${Date.now()}`;
let tempId = null;
try {
  const res = await fetch("http://127.0.0.1:4175/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tempName }) });
  tempId = (await res.json()).id;
} catch (e) { console.error(e.message); process.exit(1); }

let exitCode = 0;
try {
  await startBrowser();
  await newPage("http://127.0.0.1:3000/?storage=http");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await waitFor("document.querySelector('.portal-tools') !== null", 20000);
  await evalJs(`(() => {
    localStorage.setItem('metro-wiring-prefs.autoAvoidance', 'false');
    localStorage.setItem('metro-wiring-prefs.advancedMode', 'true');
    localStorage.setItem('metro-wiring-tutorial-dismissed', 'true');
    return true;
  })()`);
  await send("Page.reload", { ignoreCache: true });
  await waitFor(`(() => { const b = [...document.querySelectorAll('.portal-tools button')]; return b.some(x => x.textContent.includes('配线图')); })()`, 20000);
  await sleep(500);
  await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-tools button')].find(x => x.textContent.includes('配线图')); if (b) b.click(); return !!b; })()`);
  await waitFor(`(() => !!(document.querySelector('.project-card') || document.querySelector('.project-empty')))()`, 15000);
  await sleep(500);
  const opened = await evalJs(`(() => { const card = [...document.querySelectorAll('.project-card')].find(c => c.textContent.includes('${tempName}')); if (!card) return false; const btn = [...card.querySelectorAll('button')].find(x => x.textContent.includes('打开项目')); if (btn) btn.click(); return true; })()`);
  if (!opened) throw new Error("卡片未出现");
  await waitFor("document.querySelector('.wiring-svg') !== null", 25000);
  await sleep(800);
  await evalJs(`localStorage.setItem('metro-wiring-first-use-notice-dismissed-v1', 'true'); true`);
  const dismissed = await evalJs(`(() => { const b = document.querySelector('.wiring-first-use-backdrop'); if (!b) return true; const btn = [...b.querySelectorAll('button')].find(x => x.textContent.includes('继续使用')); if (btn) btn.click(); return false; })()`);
  if (!dismissed) await waitFor("document.querySelector('.wiring-first-use-backdrop') === null", 8000);
  await sleep(400);
  await evalJs(`localStorage.setItem('metro-wiring-tutorial-dismissed-v2', 'true'); true`);
  const tut = await evalJs(`(() => { const r = document.querySelector('.tutorial-overlay-root'); if (!r) return true; const s = [...r.querySelectorAll('button')].find(x => x.textContent.includes('跳过')); if (s) s.click(); return false; })()`);
  if (!tut) await waitFor("document.querySelector('.tutorial-backdrop') === null", 8000);
  await sleep(400);

  // 定位「筛选」触发按钮
  const btnRect = await evalJs(`(() => {
    const b = [...document.querySelectorAll('.wiring-btn.popover-trigger')].find(x => (x.textContent || '').includes('筛选'));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!btnRect) throw new Error("筛选按钮未找到");

  const alive = () => evalJs(`(() => ({ hasSvg: !!document.querySelector('.wiring-svg'), bodyText: document.body.innerText.length }))()`);
  const before = await alive();

  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: btnRect.x, y: btnRect.y });
  await sleep(100);
  await clickAt(btnRect.x, btnRect.y);
  await sleep(600);
  const afterOpen = await evalJs(`(() => ({ hasSvg: !!document.querySelector('.wiring-svg'), hasPanel: !!document.querySelector('.popover-panel'), sections: document.querySelectorAll('.popover-section').length }))()`);
  check("打开筛选弹层：面板出现且编辑器未崩溃", afterOpen.hasSvg && afterOpen.hasPanel, `sections=${afterOpen.sections}`);

  // 展开「高级筛选」section
  await evalJs(`(() => { const h = [...document.querySelectorAll('.popover-section-header')].find(x => (x.textContent || '').includes('高级筛选')); if (h) h.click(); return !!h; })()`);
  await sleep(300);
  const afterExpand = await evalJs(`(() => ({ hasSvg: !!document.querySelector('.wiring-svg'), subSelects: document.querySelectorAll('.popover-panel .popover-select-row').length }))()`);
  check("展开「高级筛选」：子项出现且未崩溃", afterExpand.hasSvg && afterExpand.subSelects >= 5, `subSelects=${afterExpand.subSelects}`);

  // 关闭再重新打开（hook 数量变化的极端场景）
  await clickAt(btnRect.x, btnRect.y);
  await sleep(300);
  const closed = await evalJs(`(() => ({ hasSvg: !!document.querySelector('.wiring-svg'), hasPanel: !!document.querySelector('.popover-panel') }))()`);
  await sleep(200);
  await clickAt(btnRect.x, btnRect.y);
  await sleep(300);
  const reopened = await evalJs(`(() => ({ hasSvg: !!document.querySelector('.wiring-svg'), hasPanel: !!document.querySelector('.popover-panel'), sections: document.querySelectorAll('.popover-section').length }))()`);
  check("关闭后重新打开：编辑器持续存活", closed.hasSvg && !closed.hasPanel && reopened.hasSvg && reopened.hasPanel, `closed=${JSON.stringify(closed)} reopened=${JSON.stringify(reopened)}`);
  check("点击筛选前后编辑器均存活", before.hasSvg && afterOpen.hasSvg, `before=${JSON.stringify(before)}`);

  console.log("\n==== 结果汇总 ====");
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} 项通过`);
  if (failed.length) { failed.forEach((f) => console.log(`  ✗ ${f.name}`)); exitCode = 1; }
} catch (error) {
  console.error("\n验证失败:", error.message);
  exitCode = 1;
} finally {
  if (tempId) { try { await fetch(`http://127.0.0.1:4175/api/projects/${tempId}`, { method: "DELETE" }); } catch (e) { console.error(e.message); } }
  await send("Browser.close").catch(() => {});
  process.exit(exitCode);
}
