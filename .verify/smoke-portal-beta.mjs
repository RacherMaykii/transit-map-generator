// 浏览器冒烟：门户顶部 Beta 提示条与「查看详情」弹窗。
// 验证：提示条在首页顶部可见 → 点「查看详情」弹出详情（反馈方式 / 已知 bug / 老工程兼容性）→
//      关闭后门户正常。
import { startBrowser, newPage, evalJs, waitFor, screenshot } from "./cdp.mjs";

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

await startBrowser();
await newPage("http://localhost:3000/?storage=http");
await waitFor("document.querySelector('.portal-tools') !== null", 20000);

// ── 1. 顶部 Beta 提示条存在且内容正确 ──
const banner = await evalJs(`(() => {
  const b = document.querySelector('.portal-beta-banner');
  if (!b) return null;
  return { text: b.innerText, btn: [...b.querySelectorAll('button')].map(x => x.textContent).join('|') };
})()`);
check("首页顶部存在 Beta 提示条", !!banner, banner ? `"${banner.text}"` : "not found");
check("提示条标注 Beta 与兼容性", !!banner && /Beta 版本/.test(banner.text) && /兼容性/.test(banner.text));
check("提示条含「查看详情」按钮", !!banner && /查看详情/.test(banner.btn));

// ── 2. 点「查看详情」→ 详情弹窗出现 ──
await evalJs(`(() => { const b = document.querySelector('.portal-beta-banner button'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.portal-info-modal') !== null", 8000);
const modal = await evalJs(`(() => ({
  title: document.querySelector('.portal-info-modal h2')?.textContent ?? '',
  body: document.body.innerText,
}))()`);
check("详情弹窗标题为「Beta 版本与兼容性」", /Beta 版本与兼容性/.test(modal.title), modal.title);
check("详情含「如何反馈问题」", /如何反馈问题/.test(modal.body));
check("详情含「已知问题」（软件仍存在 bug）", /已知问题/.test(modal.body) && /bug/.test(modal.body));
check("详情含「工程兼容性」（老工程文件可能无法使用）", /工程兼容性/.test(modal.body) && /\.railcity/.test(modal.body));

// 关闭详情弹窗
await evalJs(`(() => { const b = document.querySelector('.portal-info-modal footer button'); if (b) b.click(); return !!b; })()`);
await new Promise((r) => setTimeout(r, 400));
check("关闭后门户正常且无残留弹窗", await evalJs(`!!document.querySelector('.project-portal') && !!document.querySelector('.portal-beta-banner') && !document.querySelector('.portal-info-modal')`));

await screenshot(".verify/screenshots/portal-beta.png");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
