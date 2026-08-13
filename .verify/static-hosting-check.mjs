// 纯静态托管（static-dist）回归验证：门户加载、新建项目、打开样例、导出
import { startBrowser, newPage, evalJs, waitFor, screenshot, send } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

// 清空 IndexedDB，模拟全新访问静态站点
const dbReady = await startBrowser();
await newPage("http://127.0.0.1:4174/?clean=1");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);
await waitFor("document.querySelector('.project-card') !== null", 20000);
await new Promise((r) => setTimeout(r, 500));

const state = await evalJs(`(() => {
  const cards = [...document.querySelectorAll('.project-card h3')].map(h => h.textContent);
  const btn = (name) => [...document.querySelectorAll('.portal-project-actions button')].find(b => b.textContent.includes(name));
  return {
    cards,
    storage: document.querySelector('.portal-projects-footer span')?.textContent.trim(),
    newDisabled: btn('新建项目')?.disabled,
    importDisabled: btn('导入项目')?.disabled,
    exportDisabled: btn('导出项目')?.disabled,
    error: document.querySelector('.project-empty[role="alert"]')?.textContent ?? null,
  };
})()`);
console.log("静态门户:", JSON.stringify(state));
check("静态站：样例项目虚空城从 sample-data 种子载入", state.cards.includes("虚空城"), `cards=${JSON.stringify(state.cards)}`);
check("静态站：使用浏览器本地工作区", state.storage === "浏览器本地工作区", `storage=${state.storage}`);
check("静态站：新建项目可用（IndexedDB）", state.newDisabled === false, `disabled=${state.newDisabled}`);
check("静态站：导入项目可用", state.importDisabled === false, `disabled=${state.importDisabled}`);
check("静态站：无报错", state.error === null, `error=${state.error}`);

// 打开样例项目
await evalJs(`(() => {
  const card = [...document.querySelectorAll('.project-card')].find(c => c.querySelector('h3')?.textContent === '虚空城');
  const b = card?.querySelector('button');
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.body.innerText.includes('CSV 已载入') || document.querySelector('svg') !== null", 25000);
const opened = await evalJs(`(() => ({ csv: document.body.innerText.includes('CSV 已载入'), svg: !!document.querySelector('svg') }))()`);
check("静态站：打开样例项目并载入 CSV 数据", opened.csv || opened.svg, JSON.stringify(opened));

// 返回并新建一个项目（IndexedDB 持久化能力）
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('返回项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.project-card') !== null", 15000);
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.portal-project-actions button')].find(x => x.textContent.includes('新建项目'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.querySelector('#new-project-name') !== null", 8000);
await evalJs(`(() => {
  const input = document.querySelector('#new-project-name');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '静态站测试项目');
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await new Promise((r) => setTimeout(r, 200));
await evalJs(`(() => { const form = document.querySelector('.new-project-form'); if (form) form.querySelector('button[type="submit"]').click(); return !!form; })()`);
await waitFor(`[...document.querySelectorAll('.project-card h3')].some(h => h.textContent === '静态站测试项目')`, 12000);
check("静态站：浏览器模式可新建项目（IndexedDB）", true, "静态站测试项目");

// 导出样例项目（.railcity 下载）
await evalJs(`(() => {
  const card = [...document.querySelectorAll('.project-card')].find(c => c.querySelector('h3')?.textContent === '虚空城');
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
const exportState = await evalJs(`(() => {
  const err = document.querySelector('.project-empty[role="alert"]');
  return { error: err ? err.textContent : null, downloading: document.body.innerText.includes('处理中') ? '仍在处理' : '已完成' };
})()`);
check("静态站：导出项目无报错（客户端打包 .railcity）", exportState.error === null, JSON.stringify(exportState));

await screenshot(".verify/static-hosting-final.png");

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
