// 浏览器冒烟：配线图编辑器「自动避让」开关。
// 验证：默认开启(无“避让一次”按钮) → 关闭后出现“避让一次”按钮 → 重新开启后隐藏，且偏好写入 localStorage。
import { startBrowser, newPage, evalJs, waitFor, screenshot } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await startBrowser();
await newPage("http://localhost:3000/?storage=http");
await waitFor("document.querySelector('.portal-tools') !== null", 20000);

// 清掉历史偏好，保证从默认值(开)开始
await evalJs(`localStorage.removeItem('metro-wiring-prefs.autoAvoidance'); true`);

// 选择「配线图生成」工具
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
await new Promise((r) => setTimeout(r, 800));

// 定位「自动避让」复选框（label.wiring-check 内含该文本）
const findCheckbox = `(() => {
  const label = [...document.querySelectorAll('label.wiring-check')].find(l => l.textContent.includes('自动避让'));
  return label ? !!label.querySelector('input[type="checkbox"]') : false;
})()`;
check("存在「自动避让」复选框", await evalJs(findCheckbox));

const checked = await evalJs(`(() => {
  const label = [...document.querySelectorAll('label.wiring-check')].find(l => l.textContent.includes('自动避让'));
  return label ? label.querySelector('input').checked : null;
})()`);
check("默认开启（checked=true）", checked === true, `checked=${checked}`);

const oneShotBefore = await evalJs(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('避让一次'))`);
check("开启时无「避让一次」按钮", oneShotBefore === false);

// ── 关闭自动避让 → 「避让一次」按钮出现 ──
const toggledOff = await evalJs(`(() => {
  const label = [...document.querySelectorAll('label.wiring-check')].find(l => l.textContent.includes('自动避让'));
  const input = label ? label.querySelector('input') : null;
  if (!input) return false;
  input.click();
  return true;
})()`);
await new Promise((r) => setTimeout(r, 500));
const oneShotAfter = await evalJs(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('避让一次'))`);
check("关闭后出现「避让一次」按钮", toggledOff && oneShotAfter === true);
const storedOff = await evalJs(`localStorage.getItem('metro-wiring-prefs.autoAvoidance')`);
check("偏好已写入 localStorage(false)", storedOff === "false", `stored=${storedOff}`);

// 手动点一次「避让一次」不应报错
const oneShotClickable = await evalJs(`(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('避让一次'));
  if (b) b.click();
  return !!b;
})()`);
check("「避让一次」按钮可点击", oneShotClickable === true);
await new Promise((r) => setTimeout(r, 500));

// ── 重新开启 → 按钮隐藏 ──
const toggledOn = await evalJs(`(() => {
  const label = [...document.querySelectorAll('label.wiring-check')].find(l => l.textContent.includes('自动避让'));
  const input = label ? label.querySelector('input') : null;
  if (!input) return false;
  input.click();
  return true;
})()`);
await new Promise((r) => setTimeout(r, 500));
const oneShotFinal = await evalJs(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('避让一次'))`);
check("重新开启后「避让一次」隐藏", toggledOn && oneShotFinal === false);
const storedOn = await evalJs(`localStorage.getItem('metro-wiring-prefs.autoAvoidance')`);
check("偏好已存回(true)", storedOn === "true", `stored=${storedOn}`);
check("编辑器主界面仍正常", await evalJs(`!!document.querySelector('.wiring-editor-shell')`));

await screenshot(".verify/screenshots/batch9-avoidance-toggle.png");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
