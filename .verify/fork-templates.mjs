// 浏览器验证：双线分叉模板（双线斜上分叉/双线斜下分叉/双线Y形分叉）
// 核心：一条双线（上下行）分成两条双线。直股对与支线对各保留上下行双轨，
// 支线对端口 direction 取斜段实际角度，连出去才是真实斜向的。脚本断言：
//  1) 元件库出现三张卡片
//  2) 放置后 .track.branch 轨道是斜的（dx≠0 且 dy≠0，方向正确）
//  3) 右侧有 4 个端口（直股对 + 支线对），纵向错开
//  4) 从支线对端口连出到双线区间：doubleTrackConnect 自动补对侧，生成 2 条连接；
//     两条轨首尾落在端口上且保持 ~40px 平行（配对渲染为共享中心线偏移，不断言切线角度）
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

// 开高级模式：端口在任何状态下都渲染（line 4325: advancedMode || isSelected || connect），
// 否则未选中模块的端口不渲染，读不到。
await evalJs(`(() => {
  const label = [...document.querySelectorAll('label.wiring-check')].find(l => l.textContent.trim() === '高级模式');
  const cb = label && label.querySelector('input[type=checkbox]');
  if (cb && !cb.checked) cb.click();
  return !!cb;
})()`);
await new Promise((r) => setTimeout(r, 300));

async function canvasRect() {
  return await evalJs(`(() => { const s = document.querySelector('.wiring-svg').getBoundingClientRect(); return { left: s.left, top: s.top }; })()`);
}
function worldPoint(svgRect, wx, wy) { return { x: svgRect.left + 100 + wx * 0.75, y: svgRect.top + 60 + wy * 0.75 }; }
async function clickCard(name) {
  const center = await evalJs(`(() => {
    const card = [...document.querySelectorAll('.wiring-template-card')].find(c => c.querySelector('b')?.textContent === '${name}');
    if (!card) return null;
    card.scrollIntoView({ block: 'center', inline: 'center' });
    const r = card.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!center) return false;
  await clickAt(center.x, center.y);
  await new Promise((r) => setTimeout(r, 300));
  return true;
}
async function clickTool(name) {
  const ok = await evalJs(`(() => {
    const b = [...document.querySelectorAll('.wiring-segmented button')].find(x => x.textContent.trim() === '${name}');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 200));
  return ok;
}
async function clickPort(wx, wy) {
  const p = await evalJs(`(() => {
    const svg = document.querySelector('.wiring-svg');
    const rect = svg.getBoundingClientRect();
    const ex = rect.left + 100 + ${wx} * 0.75;
    const ey = rect.top + 60 + ${wy} * 0.75;
    let best = null, bestDist = Infinity;
    for (const c of document.querySelectorAll('.port')) {
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = Math.hypot(cx - ex, cy - ey);
      if (d < bestDist) { bestDist = d; best = { x: cx, y: cy }; }
    }
    return { x: best ? best.x : -1, y: best ? best.y : -1, dist: bestDist };
  })()`);
  if (!p || p.dist > 15) return false;
  await clickAt(p.x, p.y);
  return true;
}
/** 读取第 idx 个模块（DOM 顺序 = 创建顺序）的 translate 与分支轨道本地坐标。 */
async function moduleGeometry(idx) {
  return await evalJs(`(() => {
    const g = document.querySelectorAll('.module-group')[${idx}];
    if (!g) return null;
    const t = g.getAttribute('transform');
    const m = /translate\\((\\d+)\\.?(\\d*),(\\d+)\\.?(\\d*)\\)/.exec(t);
    const mx = parseInt(m[1], 10), my = parseInt(m[3], 10);
    const tracks = [...g.querySelectorAll('.track.branch')].map((el) => ({
      x1: parseFloat(el.getAttribute('x1')), y1: parseFloat(el.getAttribute('y1')),
      x2: parseFloat(el.getAttribute('x2')), y2: parseFloat(el.getAttribute('y2')),
      isPath: el.tagName === 'path',
    }));
    return { mx, my, tracks };
  })()`);
}

// ── 1. 三张卡片存在 ──
for (const name of ["双线斜上分叉", "双线斜下分叉", "双线Y形分叉"]) {
  const found = await evalJs(`(() => {
    const card = [...document.querySelectorAll('.wiring-template-card')].find(c => c.querySelector('b')?.textContent === '${name}');
    return !!card;
  })()`);
  check(`元件库出现「${name}」卡片`, found);
}

// ── 2. 依次放置三个分叉，检查分支轨道斜度（每条双线支线=2条斜轨道） ──
const svgRect = await canvasRect();
const placements = [
  { name: "双线斜上分叉", wx: 200, wy: 100, expectDy: -1 },
  { name: "双线斜下分叉", wx: 200, wy: 340, expectDy: 1 },
  { name: "双线Y形分叉", wx: 200, wy: 580, expectDy: 0 },
];
let forkIdx = 0;
for (const { name, wx, wy, expectDy } of placements) {
  const ok = await clickCard(name);
  check(`点击「${name}」卡片`, ok);
  const pt = worldPoint(svgRect, wx, wy);
  await clickAt(pt.x, pt.y);
  await new Promise((r) => setTimeout(r, 500));
  const geo = await moduleGeometry(forkIdx);
  if (!geo || geo.tracks.length === 0) {
    check(`${name}: 存在斜分支轨道`, false, "未找到 .track.branch");
    forkIdx += 1;
    continue;
  }
  const diag = geo.tracks.every((t) => !t.isPath && Math.abs(t.x2 - t.x1) > 1 && Math.abs(t.y2 - t.y1) > 1);
  const dirOk = expectDy === 0
    ? geo.tracks.some((t) => t.y2 - t.y1 < 0) && geo.tracks.some((t) => t.y2 - t.y1 > 0)
    : geo.tracks.every((t) => Math.sign(t.y2 - t.y1) === expectDy);
  check(`${name}: ${expectDy === 0 ? "上下两支线斜向相反" : "支线双轨斜向正确"}`, diag && dirOk, JSON.stringify(geo.tracks));
  forkIdx += 1;
}

// ── 3. 分叉右侧有 4 个端口（直股对 + 支线对），纵向错开 ──
// 分叉加长后宽 260（本地端口 x=260），模块[0] 是双线斜上分叉。
const portCheck = await evalJs(`(() => {
  const g = document.querySelectorAll('.module-group')[0];
  const cs = [...g.querySelectorAll('.port')].map((c) => ({ cx: parseFloat(c.getAttribute('cx')), cy: parseFloat(c.getAttribute('cy')) }));
  const right = cs.filter((c) => Math.abs(c.cx - 260) < 1);
  const ys = [...new Set(right.map((c) => c.cy))];
  return { ys, rightCount: right.length, distinct: ys.length, leftCount: cs.filter((c) => Math.abs(c.cx) < 1).length };
})()`);
check("双线斜上分叉：共 6 端口（左 2 + 右 4）", portCheck.leftCount === 2 && portCheck.rightCount === 4, JSON.stringify({ left: portCheck.leftCount, right: portCheck.rightCount }));
check("双线斜上分叉：右侧四端口纵向错开（直股对 + 斜支线对）", portCheck.rightCount === 4 && portCheck.distinct === 4 && (Math.max(...portCheck.ys) - Math.min(...portCheck.ys)) > 60, JSON.stringify(portCheck.ys));
// 上分叉默认几何：支线对 (12/52) 完全高出直股对 (76/116)，两组之间留 gap=24。
// 支线下行(52) < 直股上行(76)，即两组双线不再交叠，完全分开。
const sortedYs = [...portCheck.ys].sort((a, b) => a - b);
check("上分叉 支线对完全高出直股对（完整分开）", sortedYs.join() === "12,52,76,116", JSON.stringify(sortedYs));
check("上分叉 支线与直股组间距 = 24（branchOffset 默认）", sortedYs[2] - sortedYs[1] === 24, `gap=${sortedYs[2] - sortedYs[1]}`);

// ── 4. 从双线斜上分叉的支线对端口（R_up2）连到双线区间 ──
// 分叉加长到 260 后右缘到 world x=460，双线区间放到 (700,100)：离所有分叉端口都 >72px，
// 避免 tryAutoConnect 在放置时自动连上目标端口，导致分支端口被占用、手动连接被拒。
// doubleTrackConnect 默认开，连 up 端口会自动补对侧 down，应生成 2 条 connection-group。
await clickCard("双线区间");
const pt2 = worldPoint(svgRect, 700, 100);
await clickAt(pt2.x, pt2.y);
await new Promise((r) => setTimeout(r, 500));
const autoConnBefore = await evalJs(`document.querySelectorAll('.connection-group').length`);
check("放置双线区间未触发自动连接", autoConnBefore === 0, `connection=${autoConnBefore}`);

await clickTool("连接");
// 双线斜上分叉（world 200,100）支线对端口：R_up2 = 本地(260,12) → 世界(460,112)
const startOk = await clickPort(460, 112);
await new Promise((r) => setTimeout(r, 200));
check("连接起点：双线斜上分叉支线上行端口高亮", startOk && (await evalJs(`document.querySelector('.port.connect-start') !== null`)));
// 双线区间（world 700,100）左上行端口：本地(0,36) → 世界(700,136)
const endOk = await clickPort(700, 136);
await new Promise((r) => setTimeout(r, 700));
const connCount = await evalJs(`document.querySelectorAll('.connection-group').length`);
check("doubleTrackConnect：生成 2 条连接（up 支 + down 支）", connCount === 2, `connection=${connCount}`);

// 解析两条连接 path（up 支 + down 支，doubleTrackConnect 自动补对侧）。
// 双线连接由共享中心线按半线距偏移渲染，两条轨应保持 ~40px 平行、
// 首尾精确落在两端端口上。注意：双线配对连接不会沿端口斜向引出
// （配对渲染为平行双轨，端口处可能有一小段角度过渡），故不断言切线角度。
const rails = await evalJs(`(() => {
  const paths = [...document.querySelectorAll('.connection-group .connection-track')].map((p) => p.getAttribute('d'));
  if (paths.length !== 2) return { count: paths.length };
  const parse = (d) => d.match(/-?\\d+\\.?\\d*,-?\\d+\\.?\\d*/g).map((s) => s.split(',').map(Number));
  const up = parse(paths[0]), dn = parse(paths[1]);
  if (!up || !dn || up.length !== dn.length || up.length < 2) return { unequal: true };
  let minGap = Infinity, maxGap = 0;
  for (let i = 0; i < up.length; i++) {
    const g = Math.hypot(up[i][0] - dn[i][0], up[i][1] - dn[i][1]);
    if (g < minGap) minGap = g;
    if (g > maxGap) maxGap = g;
  }
  return { up0: up[0], upLast: up[up.length - 1], minGap, maxGap, count: paths.length };
})()`);
check("支线连接从双线斜上分叉支线上行端口出发", rails.up0 && Math.abs(rails.up0[0] - 460) < 5 && Math.abs(rails.up0[1] - 112) < 5, JSON.stringify(rails.up0));
check("支线连接到达双线区间左上行端口", rails.upLast && Math.abs(rails.upLast[0] - 700) < 5 && Math.abs(rails.upLast[1] - 136) < 5, JSON.stringify(rails.upLast));
check("双线两条轨保持 ~40px 平行（不汇聚不交叉）", rails.minGap >= 30 && rails.maxGap <= 50, `min=${rails.minGap?.toFixed(1)} max=${rails.maxGap?.toFixed(1)}`);
await screenshot(".verify/fork-templates.png");

console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
