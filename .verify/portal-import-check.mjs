// 本地文件模式(?storage=http)导入 .railcity 项目验证
import { startBrowser, newPage, evalJs, waitFor, screenshot, send } from "./cdp.mjs";

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
await new Promise((r) => setTimeout(r, 500));

// 找到隐藏的 file input 并注入文件
const fileInfo = await evalJs(`(() => {
  const input = document.querySelector('input[type="file"][accept*="railcity"]');
  if (!input) return null;
  const r = input.getBoundingClientRect();
  return { exists: true };
})()`);
check("隐藏文件输入存在", !!fileInfo);

// 用 CDP 设置文件输入
await send("DOM.getDocument", {});
const node = await send("DOM.querySelector", { nodeId: (await send("DOM.getDocument", {})).root.nodeId, selector: 'input[type="file"][accept*="railcity"]' });
check("找到 file input 节点", node.nodeId !== 0, `nodeId=${node.nodeId}`);
await send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: ["D:/Study/project/Minecraft/transit-map-generator/.verify/import-test.railcity"] });

// 触发 change 事件（setFileInputFiles 会自动触发 input 事件）
await new Promise((r) => setTimeout(r, 6000));
const state = await evalJs(`(() => {
  const err = document.querySelector('.project-empty[role="alert"]');
  const cards = [...document.querySelectorAll('.project-card h3')].map(h => h.textContent);
  return { error: err ? err.textContent : null, cards };
})()`);
console.log("导入后:", JSON.stringify(state));
check("导入项目成功出现在列表", state.cards.includes("导入测试项目"), `cards=${JSON.stringify(state.cards)}`);
check("导入无报错", state.error === null, `error=${state.error}`);

// 打开导入的项目，确认数据是导入的
await evalJs(`(() => {
  const card = [...document.querySelectorAll('.project-card')].find(c => c.querySelector('h3')?.textContent === '导入测试项目');
  const b = card?.querySelector('button');
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.body.innerText.includes('导入线') || document.body.innerText.includes('导入站')", 25000);
const hasImportedLine = await evalJs(`document.body.innerText.includes('导入线')`);
check("导入项目数据正确", hasImportedLine === true, "包含“导入线”");

// 返回并删除导入的项目
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('返回项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.project-card') !== null", 15000);
await new Promise((r) => setTimeout(r, 500));
await evalJs(`(() => {
  const card = [...document.querySelectorAll('.project-card')].find(c => c.querySelector('h3')?.textContent === '导入测试项目');
  if (card) card.click();
  window.confirm = () => true;
  return !!card;
})()`);
await new Promise((r) => setTimeout(r, 300));
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.portal-project-actions button')].find(x => x.textContent.includes('删除'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor(`![...document.querySelectorAll('.project-card h3')].some(h => h.textContent === '导入测试项目')`, 12000);
check("删除导入项目成功", true);
await screenshot(".verify/portal-import-final.png");

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
