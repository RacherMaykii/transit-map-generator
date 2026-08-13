// 浏览器验证：默认工具为"自动"而非"选择"；放置模块后回落"自动"
import { startBrowser, newPage, evalJs, waitFor, clickAt, screenshot, send } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await startBrowser();
await newPage("http://127.0.0.1:3000/");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);
await evalJs(`localStorage.setItem('metro-wiring-tutorial-dismissed', 'true')`);
await send("Page.reload", { ignoreCache: true });
await waitFor(`(() => {
  const btns = [...document.querySelectorAll('.portal-tools button')];
  return btns.some(b => b.textContent.includes('配线图'));
})()`, 20000);
await new Promise((r) => setTimeout(r, 500));

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
await new Promise((r) => setTimeout(r, 500));
if (!(await evalJs(`!!document.querySelector('.project-card')`))) {
  await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-project-actions button')].find(x => x.textContent.includes('新建项目')); if (b) b.click(); return !!b; })()`);
  await waitFor(`document.querySelector('#new-project-name') !== null`, 8000);
  await evalJs(`(() => {
    const input = document.querySelector('#new-project-name');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '验证工程');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  await evalJs(`(() => { const form = document.querySelector('.new-project-form'); if (form) form.querySelector('button[type="submit"]').click(); return !!form; })()`);
  await waitFor(`document.querySelectorAll('.project-card').length >= 1`, 12000);
}
await evalJs(`(() => { const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.wiring-svg') !== null", 20000);
await new Promise((r) => setTimeout(r, 800));

function toolActive(name) {
  return evalJs(`(() => {
    const btn = [...document.querySelectorAll('.wiring-segmented button')].find(b => b.textContent.trim() === '${name}');
    return btn ? btn.className.includes('active') : null;
  })()`);
}

// ── 打开编辑器：默认应为"自动" ──
const autoOnOpen = await toolActive("自动");
const selectOnOpen = await toolActive("选择");
check("打开编辑器默认选中「自动」", autoOnOpen === true, `自动 active=${autoOnOpen}, 选择 active=${selectOnOpen}`);
check("「选择」未默认选中", selectOnOpen === false, `选择 active=${selectOnOpen}`);

// ── 放置一个模块后应回落"自动" ──
const center = await evalJs(`(() => {
  const card = [...document.querySelectorAll('.wiring-template-card')].find(c => c.querySelector('b')?.textContent === '单线区间');
  if (!card) return null;
  card.scrollIntoView({ block: 'center', inline: 'center' });
  const r = card.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
check("定位单线区间卡片", center !== null);
if (center) {
  await clickAt(center.x, center.y);
  await new Promise((r) => setTimeout(r, 300));
  const svgRect = await evalJs(`(() => { const s = document.querySelector('.wiring-svg').getBoundingClientRect(); return { left: s.left, top: s.top }; })()`);
  await clickAt(svgRect.left + 100 + 150 * 0.75, svgRect.top + 60 + 100 * 0.75);
  await new Promise((r) => setTimeout(r, 600));
  const autoAfter = await toolActive("自动");
  const selectAfter = await toolActive("选择");
  check("放置模块后回落「自动」", autoAfter === true, `自动 active=${autoAfter}, 选择 active=${selectAfter}`);
  check("放置后未停在「选择」", selectAfter === false, `选择 active=${selectAfter}`);
}

await screenshot(".verify/default-auto-check.png");
check("已截图 .verify/default-auto-check.png", true);

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
