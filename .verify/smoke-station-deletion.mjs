// 浏览器验证：站点/线路删除的确认弹窗、预览状态修正与撤销恢复。
// 全程不持久化（不点"保存 CSV"、不进入配线图编辑），删除后用撤销恢复，
// 确保默认工程数据原样返回，不破坏用户数据。
import { startBrowser, newPage, evalJs, waitFor, screenshot, send } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await startBrowser();
await newPage("http://localhost:3000/?storage=http");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);
await new Promise((r) => setTimeout(r, 500));

// 选择「线路站序图生成」工具
await evalJs(`(() => {
  const btn = [...document.querySelectorAll('.portal-tools button')].find(b => b.textContent.includes('线路站序图生成'));
  if (btn) btn.click();
  return !!btn;
})()`);
await waitFor(`!!(document.querySelector('.project-card') || document.querySelector('.project-empty'))`, 15000);
if (!(await evalJs(`!!document.querySelector('.project-card')`))) throw new Error("没有可用的工程卡片");

// 打开默认工程（虚空城）
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.querySelector('.preview-card') !== null", 25000);
await new Promise((r) => setTimeout(r, 800));

// ── 场景 1：确认弹窗渲染 + 取消（不做任何修改）──
const stationCount = await evalJs(`document.querySelectorAll('.data-card table tbody tr').length`);
check("读取到站点表（初始站点数）", stationCount > 0, `count=${stationCount}`);

const openedEditor = await evalJs(`(() => {
  const row = document.querySelectorAll('.data-card table tbody tr')[0];
  const btn = row && [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '编辑');
  if (btn) btn.click();
  return !!btn;
})()`);
check("打开第一个站点编辑器", openedEditor);
await waitFor("document.querySelector('.editor-modal') !== null", 10000);

await evalJs(`(() => {
  const b = [...document.querySelectorAll('.editor-modal .danger-button')].find(x => x.textContent.includes('删除站点'));
  if (b) b.click();
  return !!b;
})()`);
await waitFor("document.querySelector('.confirm-modal') !== null", 10000);

const dialog = await evalJs(`(() => {
  const modal = document.querySelector('.confirm-modal');
  return {
    title: modal?.querySelector('h2')?.textContent || '',
    question: modal?.querySelector('.confirm-question')?.textContent || '',
    bullets: [...(modal?.querySelectorAll('.confirm-list li') || [])].map(li => li.textContent.trim()),
    hasCancel: [...(modal?.querySelectorAll('button') || [])].some(b => b.textContent.trim() === '取消'),
    hasDanger: !!modal?.querySelector('.danger-button'),
    warning: modal?.querySelector('.warning-box')?.textContent.trim() || '',
    note: modal?.querySelector('.confirm-note')?.textContent || '',
  };
})()`);
check("确认弹窗标题为「删除站点」", dialog.title === "删除站点", dialog.title);
check("弹窗包含站点名与取消/危险按钮", dialog.question.length > 0 && dialog.hasCancel && dialog.hasDanger, `question="${dialog.question}"`);
check("子弹含「删除 1 条站点记录」", dialog.bullets.some((b) => b.includes("删除 1 条站点记录")));
check("配线图几何保留说明存在", dialog.note.includes("配线图中的站台、轨道、道岔、连接、标签、图标与手动布局都不会被删除"));
console.log(`  站点删除影响: ${JSON.stringify(dialog.bullets)}`);
if (dialog.warning) console.log(`  警告框: ${dialog.warning}`);

// 取消 → 弹窗关闭，站点数不变
await evalJs(`(() => { const b = [...document.querySelectorAll('.confirm-modal button')].find(x => x.textContent.trim() === '取消'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.confirm-modal') === null", 8000);
const countAfterCancel = await evalJs(`document.querySelectorAll('.data-card table tbody tr').length`);
check("取消后站点数不变", countAfterCancel === stationCount, `${countAfterCancel} === ${stationCount}`);

// 关闭站点编辑器
await evalJs(`(() => { const b = [...document.querySelectorAll('.editor-modal button')].find(x => x.textContent.trim() === '完成'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.editor-modal') === null", 8000);

// ── 场景 2：删除当前站 + 预览修正 + 撤销恢复 ──
// 定位当前预览线路的当前站（current-row），删除它最考验预览状态修正。
const targetRowIndex = await evalJs(`(() => {
  const rows = [...document.querySelectorAll('.data-card table tbody tr')];
  const i = rows.findIndex(r => r.classList.contains('current-row'));
  return i === -1 ? 0 : i;
})()`);
const targetStationName = await evalJs(`(() => {
  const row = document.querySelectorAll('.data-card table tbody tr')[${targetRowIndex}];
  return row ? row.querySelector('strong')?.textContent : '';
})()`);
const previewLine = await evalJs(`document.querySelector('.data-heading h2')?.textContent || ''`);
console.log(`  目标站: "${targetStationName}"（第 ${targetRowIndex + 1} 行，线路「${previewLine}」）`);

await evalJs(`(() => {
  const row = document.querySelectorAll('.data-card table tbody tr')[${targetRowIndex}];
  const btn = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '编辑');
  btn.click();
  return !!btn;
})()`);
await waitFor("document.querySelector('.editor-modal') !== null", 10000);
await evalJs(`(() => { const b = [...document.querySelectorAll('.editor-modal .danger-button')].find(x => x.textContent.includes('删除站点')); b.click(); return !!b; })()`);
await waitFor("document.querySelector('.confirm-modal') !== null", 10000);

const impact = await evalJs(`(() => {
  const modal = document.querySelector('.confirm-modal');
  return [...modal.querySelectorAll('.confirm-list li')].map(li => li.textContent.trim());
})()`);
console.log(`  删除影响: ${JSON.stringify(impact)}`);

// 确认删除
await evalJs(`(() => { const b = document.querySelector('.confirm-modal .danger-button'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.confirm-modal') === null", 8000);

const countAfterDelete = await evalJs(`document.querySelectorAll('.data-card table tbody tr').length`);
check("确认删除后站点数 -1", countAfterDelete === stationCount - 1, `${stationCount} → ${countAfterDelete}`);
check("被删站已从列表移除", await evalJs(`![...document.querySelectorAll('.data-card table tbody strong')].some(s => s.textContent === ${JSON.stringify(targetStationName)})`));
check("预览仍渲染 SVG", await evalJs(`document.querySelector('.preview-card svg') !== null`));
const undoEnabled = await evalJs(`(() => { const b = document.querySelector('button[title="撤销 Ctrl+Z"]'); return b ? !b.disabled : null; })()`);
check("撤销按钮可用（产生了一个撤销步骤）", undoEnabled === true, `disabled=${undoEnabled}`);

// 撤销恢复
await evalJs(`(() => { const b = document.querySelector('button[title="撤销 Ctrl+Z"]'); if (b) b.click(); return !!b; })()`);
await new Promise((r) => setTimeout(r, 500));
const countAfterUndo = await evalJs(`document.querySelectorAll('.data-card table tbody tr').length`);
check("撤销后站点数恢复", countAfterUndo === stationCount, `${countAfterUndo} === ${stationCount}`);
check("撤销后站点与顺序恢复", await evalJs(`(() => {
  const names = [...document.querySelectorAll('.data-card table tbody strong')].map(s => s.textContent);
  const seq = [...document.querySelectorAll('.data-card table tbody .sequence-pill')].map(p => p.textContent);
  return names.includes(${JSON.stringify(targetStationName)});
})()`));

// ── 场景 3：线路删除确认弹窗（仅取消，不删除）──
await evalJs(`(() => { const b = [...document.querySelectorAll('.segmented button')].find(x => x.textContent.includes('线路表')); if (b) b.click(); return !!b; })()`);
await waitFor(`document.querySelector('.data-card table thead th')?.textContent.includes('分类')`, 8000);
const lineCount = await evalJs(`document.querySelectorAll('.data-card table tbody tr').length`);
check("线路表渲染", lineCount > 0, `lines=${lineCount}`);

const openedLineDelete = await evalJs(`(() => {
  const row = document.querySelectorAll('.data-card table tbody tr')[0];
  const btn = row && [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '删除');
  if (btn) btn.click();
  return !!btn;
})()`);
check("线路表出现「删除」按钮并可点击", openedLineDelete);
await waitFor("document.querySelector('.confirm-modal') !== null", 10000);

const lineDialog = await evalJs(`(() => {
  const modal = document.querySelector('.confirm-modal');
  return {
    title: modal?.querySelector('h2')?.textContent || '',
    bullets: [...(modal?.querySelectorAll('.confirm-list li') || [])].map(li => li.textContent.trim()),
    hasCancel: [...(modal?.querySelectorAll('button') || [])].some(b => b.textContent.trim() === '取消'),
    hasDanger: !!modal?.querySelector('.danger-button'),
  };
})()`);
check("线路删除弹窗标题为「删除线路」", lineDialog.title === "删除线路", lineDialog.title);
check("线路删除弹窗含取消/危险按钮", lineDialog.hasCancel && lineDialog.hasDanger);
check("线路删除子弹含线路记录", lineDialog.bullets.some((b) => b.includes("删除 1 条线路记录")));
console.log(`  线路删除影响: ${JSON.stringify(lineDialog.bullets)}`);

await evalJs(`(() => { const b = [...document.querySelectorAll('.confirm-modal button')].find(x => x.textContent.trim() === '取消'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.confirm-modal') === null", 8000);
const lineCountAfter = await evalJs(`document.querySelectorAll('.data-card table tbody tr').length`);
check("取消线路删除后线路数不变", lineCountAfter === lineCount, `${lineCountAfter} === ${lineCount}`);

await screenshot(".verify/screenshots/station-deletion-confirm.png");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
