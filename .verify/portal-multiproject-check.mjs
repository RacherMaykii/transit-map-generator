// 本地文件模式(?storage=http)多项目端到端验证：新建 → 打开 → 导出 → 删除
import { startBrowser, newPage, evalJs, waitFor, clickAt, screenshot, send } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await startBrowser();
await newPage("http://127.0.0.1:3000/?storage=http");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);
await waitFor("document.querySelector('.project-card') !== null", 20000);
await new Promise((r) => setTimeout(r, 600));

// 1. 初始项目列表 + 按钮状态
const initial = await evalJs(`(() => {
  const cards = [...document.querySelectorAll('.project-card h3')].map(h => h.textContent);
  const btn = (name) => [...document.querySelectorAll('.portal-project-actions button')].find(b => b.textContent.includes(name));
  return {
    cards,
    newDisabled: btn('新建项目')?.disabled,
    importDisabled: btn('导入项目')?.disabled,
    footer: document.querySelector('.portal-projects-footer p')?.textContent.trim(),
  };
})()`);
console.log("初始:", JSON.stringify(initial));
check("HTTP 模式: 默认显示虚空城项目", initial.cards.length >= 1 && initial.cards[0] === "虚空城", `cards=${JSON.stringify(initial.cards)}`);
check("HTTP 模式: 新建项目已启用", initial.newDisabled === false, `disabled=${initial.newDisabled}`);
check("HTTP 模式: 导入项目已启用", initial.importDisabled === false, `disabled=${initial.importDisabled}`);

// 2. 新建项目
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.portal-project-actions button')].find(x => x.textContent.includes('新建项目'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.querySelector('#new-project-name') !== null", 8000);
await evalJs(`(() => {
  const input = document.querySelector('#new-project-name');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '浏览器测试项目');
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await new Promise((r) => setTimeout(r, 200));
await evalJs(`(() => { const form = document.querySelector('.new-project-form'); if (form) form.querySelector('button[type="submit"]').click(); return !!form; })()`);
await waitFor(`[...document.querySelectorAll('.project-card h3')].some(h => h.textContent === '浏览器测试项目')`, 12000);
check("新建项目出现在列表", true, "浏览器测试项目");

// 3. 打开新项目
await evalJs(`(() => {
  const card = [...document.querySelectorAll('.project-card')].find(c => c.querySelector('h3')?.textContent === '浏览器测试项目');
  const b = card?.querySelector('button');
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.body.innerText.includes('CSV 已载入') || document.querySelector('.wiring-svg') !== null || document.querySelector('svg') !== null", 25000);
await new Promise((r) => setTimeout(r, 1000));
const editorState = await evalJs(`(() => {
  const body = document.body.innerText;
  return { hasDiagram: !!document.querySelector('svg'), csvLoaded: body.includes('CSV 已载入'), text: body.slice(0, 120) };
})()`);
check("新项目编辑器打开并载入数据", editorState.hasDiagram && editorState.csvLoaded, JSON.stringify(editorState));
await screenshot(".verify/portal-multiproject-editor.png");

// 4. 返回门户，导出
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('返回项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.project-card') !== null", 15000);
await new Promise((r) => setTimeout(r, 500));
// 选中新项目
await evalJs(`(() => {
  const card = [...document.querySelectorAll('.project-card')].find(c => c.querySelector('h3')?.textContent === '浏览器测试项目');
  if (card) card.click();
  return !!card;
})()`);
await new Promise((r) => setTimeout(r, 400));
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.portal-project-actions button')].find(x => x.textContent.includes('导出项目'));
  if (b) b.click();
  return !!b;
})()`);
await new Promise((r) => setTimeout(r, 4000));
const afterExport = await evalJs(`(() => {
  const err = document.querySelector('.project-empty[role="alert"]');
  return { error: err ? err.textContent : null };
})()`);
check("导出新项目无报错", afterExport.error === null, `error=${afterExport.error}`);

// 5. 删除新项目（自动确认）
await evalJs(`(() => { window.confirm = () => true; return true; })()`);
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.portal-project-actions button')].find(x => x.textContent.includes('删除'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor(`![...document.querySelectorAll('.project-card h3')].some(h => h.textContent === '浏览器测试项目')`, 12000);
check("删除新项目成功", true, "浏览器测试项目已移除");
const finalCards = await evalJs(`[...document.querySelectorAll('.project-card h3')].map(h => h.textContent)`);
console.log("删除后列表:", JSON.stringify(finalCards));
await screenshot(".verify/portal-multiproject-final.png");

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
