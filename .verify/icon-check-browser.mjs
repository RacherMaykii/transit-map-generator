// 浏览器验证：线路图编辑器的图标选择器应列出全部 80 个内置图标且无一"缺少素材"。
// 用法: node icon-check-browser.mjs [http|browser]
import { startBrowser, newPage, evalJs, waitFor, clickAt, screenshot, send } from "./cdp.mjs";

const storage = process.argv[2] || "http";
const url = `http://127.0.0.1:3000/?storage=${storage}`;
const results = [];
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`); }

await startBrowser();
await newPage(url);
await send("Emulation.setDeviceMetricsOverride", { width: 1700, height: 1000, deviceScaleFactor: 1, mobile: false });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);
// 清空 IndexedDB 保证 browser 模式确定性；http 模式不受影响
await evalJs(`(async () => {
  const dbs = await indexedDB.databases().catch(() => []);
  for (const db of dbs) if (db.name) await new Promise((res) => { const r = indexedDB.deleteDatabase(db.name); r.onsuccess = r.onerror = r.onblocked = res; });
  return true;
})()`);
await send("Page.reload", { ignoreCache: true });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);
await new Promise((r) => setTimeout(r, 500));

// 选择"线路图"工具
await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-tools button')].find(x => x.textContent.includes('线路图')); if (b) b.click(); return !!b; })()`);
await waitFor("!!document.querySelector('.project-card') || !!document.querySelector('.project-empty')", 15000);
await new Promise((r) => setTimeout(r, 500));

// browser 模式若没有项目则新建（首次种子来自 /sample-data）
if (!(await evalJs(`!!document.querySelector('.project-card')`))) {
  await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-project-actions button')].find(x => x.textContent.includes('新建项目')); if (b) b.click(); return !!b; })()`);
  await waitFor("document.querySelector('#new-project-name') !== null", 8000);
  await evalJs(`(() => {
    const input = document.querySelector('#new-project-name');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '图标检查');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  await evalJs(`(() => { const form = document.querySelector('.new-project-form'); if (form) form.querySelector('button[type="submit"]').click(); return !!form; })()`);
  await waitFor("document.querySelectorAll('.project-card').length >= 1", 12000);
}
await evalJs(`(() => { const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('main.app-shell') !== null", 20000);
await new Promise((r) => setTimeout(r, 1000));

// 站点表第一行 → 编辑
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '编辑'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.icon-editor') !== null", 10000);
// 打开图标选择器
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '选择图标'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.icon-picker-modal') !== null", 10000);
await new Promise((r) => setTimeout(r, 500));

const countText = await evalJs(`document.querySelector('.icon-picker-count')?.textContent || ''`);
const gridCount = await evalJs(`document.querySelectorAll('.icon-grid button').length`);
await waitFor("document.querySelectorAll('.icon-picker-modal .asset-loading-placeholder').length === 0", 20000).catch(() => {});
const missing = await evalJs(`document.querySelectorAll('.icon-picker-modal .missing-asset-placeholder').length`);
const loaded = await evalJs(`document.querySelectorAll('.icon-picker-modal .icon-grid img').length`);
const categoryCount = await evalJs(`document.querySelectorAll('.icon-picker-modal .icon-category').length`);
const uploadSection = await evalJs(`!!document.querySelector('.icon-picker-modal .icon-category h4') && [...document.querySelectorAll('.icon-picker-modal .icon-category h4')].map(h => h.textContent).join('|')`);

check("选择器打开", true, `storage=${storage}`);
check("计数显示 80 个图标", /80\s*个图标/.test(countText), countText);
check("图标格 80 个按钮", gridCount === 80, `grid=${gridCount}`);
check("全部图标加载(无 loading 残留)", missing === 0 && loaded === gridCount, `missing=${missing}, loaded=${loaded}`);
check("图标进入明确分类", !uploadSection.includes("用户上传素材"), `分类=${categoryCount} 个`);

await screenshot(`.verify/icon-check-${storage}.png`);

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) { failed.forEach((f) => console.log(`  ✗ ${f.name}`)); process.exit(1); }
process.exit(0);
