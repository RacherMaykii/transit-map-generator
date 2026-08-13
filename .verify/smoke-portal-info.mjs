// 浏览器冒烟：门户「关于 / 关于本项目」与「注意事项与免责声明」弹窗。
// 验证：页脚版本号与免费声明 → 点「关于」弹出含链接/免费/版本/虚空城引导 → 关闭 →
//      点「注意事项与免责声明」弹出 → 关闭后门户正常。
import { startBrowser, newPage, evalJs, waitFor, screenshot } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await startBrowser();
await newPage("http://localhost:3000/?storage=http");
await waitFor("document.querySelector('.portal-tools') !== null", 20000);

// ── 1. 页脚显示版本号与免费声明 ──
const footerText = await evalJs(`document.querySelector('.portal-legal span')?.textContent ?? ''`);
check("页脚显示版本号与免费声明", /v\d+\.\d+\.\d+/.test(footerText) && /完全免费/.test(footerText), footerText);

// ── 2. 点「关于 / 关于本项目」→ 弹窗出现 ──
await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-legal button')].find(x => x.textContent.includes('关于')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.portal-info-modal') !== null", 8000);
const about = await evalJs(`(() => ({
  free: document.body.innerText.includes('完全免费'),
  version: /v\\d+\\.\\d+\\.\\d+/.test(document.body.innerText),
  externalLinks: [...document.querySelectorAll('.portal-link-list a')].length,
  minecraftNote: document.querySelector('.portal-link-note')?.textContent ?? null,
}))()`);
check("关于弹窗含免费声明", about.free);
check("关于弹窗含版本号", about.version);
check("关于弹窗含外链卡片（B站/抖音/QQ频道）", about.externalLinks >= 3, `links=${about.externalLinks}`);
check("关于弹窗含虚空城搜索引导", !!about.minecraftNote && /虚空小组/.test(about.minecraftNote), about.minecraftNote);

// 关闭关于弹窗
await evalJs(`(() => { const b = document.querySelector('.portal-info-modal header button'); if (b) b.click(); return !!b; })()`);
await new Promise((r) => setTimeout(r, 400));
check("关闭关于弹窗后消失", await evalJs(`!document.querySelector('.portal-info-modal')`));

// ── 3. 点「注意事项与免责声明」→ 弹窗出现 ──
await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-legal button')].find(x => x.textContent.includes('注意事项')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.portal-info-modal') !== null", 8000);
const notes = await evalJs(`(() => ({
  hasNotes: document.body.innerText.includes('注意事项'),
  hasDisclaimer: document.body.innerText.includes('免责声明'),
  listItems: document.querySelectorAll('.portal-notes-list li').length,
}))()`);
check("须知弹窗含注意事项标题", notes.hasNotes);
check("须知弹窗含免责声明标题", notes.hasDisclaimer);
check("须知弹窗含注意事项条目", notes.listItems >= 3, `items=${notes.listItems}`);

// 关闭须知弹窗
await evalJs(`(() => { const b = document.querySelector('.portal-info-modal header button'); if (b) b.click(); return !!b; })()`);
await new Promise((r) => setTimeout(r, 400));
check("关闭后门户正常且无残留弹窗", await evalJs(`!!document.querySelector('.project-portal') && !document.querySelector('.portal-info-modal')`));

await screenshot(".verify/screenshots/portal-info.png");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
