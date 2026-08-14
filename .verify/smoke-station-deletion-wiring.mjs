// 浏览器验证：站点删除确认弹窗的"配线图关联"路径。
// 先打开配线图编辑器（首次打开会向 IndexedDB 写入虚空城示例配线图），
// 再回到线路站序图编辑器删除一个已被配线图引用的站点，验证：
//  - 黄色警告框"该站已用于配线图。删除后相关元件会保留，但不再与线路站点数据同步。"
//  - 子弹"将 N 个配线图站点元件恢复为'未分配'状态"
// 全程不保存 CSV，仅取消弹窗，不破坏数据。
import { startBrowser, newPage, evalJs, waitFor, screenshot, send } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

async function openTransitEditor() {
  await evalJs(`location.href = "http://localhost:3000/?storage=http"; true`);
  await waitFor("document.querySelector('.portal-tools') !== null", 20000);
  await new Promise((r) => setTimeout(r, 400));
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('.portal-tools button')].find(b => b.textContent.includes('线路站序图生成'));
    if (btn) btn.click();
    return !!btn;
  })()`);
  await waitFor(`!!(document.querySelector('.project-card') || document.querySelector('.project-empty'))`, 15000);
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目'));
    if (b) b.click();
    return !!b;
  })()`);
  await waitFor("document.querySelector('.preview-card') !== null", 25000);
  await new Promise((r) => setTimeout(r, 800));
}

async function openWiringEditor() {
  await evalJs(`location.href = "http://localhost:3000/?storage=http"; true`);
  await waitFor("document.querySelector('.portal-tools') !== null", 20000);
  await new Promise((r) => setTimeout(r, 400));
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('.portal-tools button')].find(b => b.textContent.includes('配线图生成'));
    if (btn) btn.click();
    return !!btn;
  })()`);
  await waitFor(`!!(document.querySelector('.project-card') || document.querySelector('.project-empty'))`, 15000);
  await evalJs(`(() => {
    const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目'));
    if (b) b.click();
    return !!b;
  })()`);
  await waitFor("document.querySelector('.wiring-editor-shell') !== null", 25000);
  // 等示例配线图落库（初始化写入 + 2s 自动保存防抖）
  await new Promise((r) => setTimeout(r, 6000));
}

await startBrowser();
await newPage("http://localhost:3000/?storage=http");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);
await new Promise((r) => setTimeout(r, 500));

// 1) 先打开配线图编辑器，让示例配线图写入 IndexedDB（每个浏览器档案只写一次）。
await openWiringEditor();
console.log("  配线图编辑器已加载，等待示例落库…");

// 2) 回到线路站序图编辑器。
await openTransitEditor();

// 3) 找到已被配线图引用的站点：L4-S02（当前预览线路 4 号线的第 2 行）是
//    配线图中"单一关联"模块的站点，删除它会有一个模块恢复未分配。
//    （L4-S01 客运中心位于多站跨平台模块，删除只触发警告框、不触发未分配子弹。）
const stationCount = await evalJs(`document.querySelectorAll('.data-card table tbody tr').length`);
const targetName = await evalJs(`document.querySelectorAll('.data-card table tbody tr')[1]?.querySelector('strong')?.textContent || ''`);
check("读取到站点表", stationCount > 1, `count=${stationCount}, target="${targetName}"`);

await evalJs(`(() => {
  const row = document.querySelectorAll('.data-card table tbody tr')[1];
  const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '编辑');
  btn.click();
  return !!btn;
})()`);
await waitFor("document.querySelector('.editor-modal') !== null", 10000);
await evalJs(`(() => { const b = [...document.querySelectorAll('.editor-modal .danger-button')].find(x => x.textContent.includes('删除站点')); b.click(); return !!b; })()`);
await waitFor("document.querySelector('.confirm-modal') !== null", 10000);

const dialog = await evalJs(`(() => {
  const modal = document.querySelector('.confirm-modal');
  return {
    title: modal?.querySelector('h2')?.textContent || '',
    warning: modal?.querySelector('.warning-box')?.textContent.trim() || '',
    bullets: [...(modal?.querySelectorAll('.confirm-list li') || [])].map(li => li.textContent.trim()),
  };
})()`);
check("确认弹窗打开（标题「删除站点」）", dialog.title === "删除站点", dialog.title);
check("黄色警告框提示该站已用于配线图", dialog.warning.includes("该站已用于配线图"), dialog.warning);
check("子弹显示配线图元件恢复未分配", dialog.bullets.some((b) => b.includes("配线图站点元件恢复为")), JSON.stringify(dialog.bullets));

// 取消，不删除。
await evalJs(`(() => { const b = [...document.querySelectorAll('.confirm-modal button')].find(x => x.textContent.trim() === '取消'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.confirm-modal') === null", 8000);
const countAfter = await evalJs(`document.querySelectorAll('.data-card table tbody tr').length`);
check("取消后站点数不变", countAfter === stationCount, `${countAfter} === ${stationCount}`);

await screenshot(".verify/screenshots/station-deletion-wiring-warning.png");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
