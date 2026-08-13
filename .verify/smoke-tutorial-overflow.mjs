// 浏览器冒烟：配线图编辑器教程（帮助程序）。
// 验证：首次打开自动弹出 → 各步骤气泡被约束在视口内(不飘出页面) → 点「跳过教程」后不再自动弹出 → 点「?」可重新打开。
import { startBrowser, newPage, evalJs, waitFor, screenshot, send } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await startBrowser();
await newPage("http://localhost:3000/?storage=http");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);

// 清掉教程关闭标记（新旧版本都清），保证从「首次打开」状态开始
await evalJs(`localStorage.removeItem('metro-wiring-tutorial-dismissed-v2'); localStorage.removeItem('metro-wiring-tutorial-dismissed'); true`);

// 选择「配线图生成」工具并打开工程
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

// ── 1. 首次打开编辑器 → 教程自动弹出 ──
await waitFor("document.querySelector('.tutorial-overlay-root') !== null", 15000);
check("首次打开编辑器自动弹出教程", true, "tutorial-overlay-root");

// ── 2. 逐步骤检查气泡是否被约束在视口内（飘出页面修复） ──
const TOTAL_STEPS = 8;
let bubbleOk = true;
for (let i = 0; i < TOTAL_STEPS; i++) {
  await new Promise((r) => setTimeout(r, 400));
  const rect = await evalJs(`(() => {
    const b = document.querySelector('.tutorial-bubble');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: innerWidth, h: innerHeight };
  })()`);
  const ok = !!rect && rect.left >= 0 && rect.right <= rect.w && rect.top >= 0 && rect.bottom <= rect.h;
  if (!ok) bubbleOk = false;
  check(`步骤 ${i + 1} 气泡在视口内`, ok, JSON.stringify(rect));
  if (i < TOTAL_STEPS - 1) {
    await evalJs(`(() => { const b = document.querySelector('.tutorial-btn.primary'); if (b) b.click(); return !!b; })()`);
  }
}
check("所有步骤气泡都不飘出视口", bubbleOk);

// ── 3. 点「跳过教程」→ 覆盖层消失 + 写入 v2 关闭标记 ──
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('跳过教程')); if (b) b.click(); return !!b; })()`);
await new Promise((r) => setTimeout(r, 600));
check("点跳过教程后覆盖层消失", await evalJs(`!document.querySelector('.tutorial-overlay-root')`));
const storedV2 = await evalJs(`localStorage.getItem('metro-wiring-tutorial-dismissed-v2')`);
check("关闭标记已写入 localStorage(v2=true)", storedV2 === "true", `stored=${storedV2}`);

// ── 4. 返回门户并重新打开 → 不再自动弹出（后续不再自动打开） ──
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('返回项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.project-card') !== null", 15000);
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.querySelector('.wiring-editor-shell') !== null", 25000);
await new Promise((r) => setTimeout(r, 1500));
check("再次打开不再自动弹出教程", await evalJs(`!document.querySelector('.tutorial-overlay-root')`));

// ── 5. 点「?」按钮 → 教程可重新打开 ──
await evalJs(`(() => { const b = document.querySelector('.wiring-tutorial-btn'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.tutorial-overlay-root') !== null", 8000);
check("点「?」按钮可重新打开教程", true);

await screenshot(".verify/screenshots/tutorial-overflow.png");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
