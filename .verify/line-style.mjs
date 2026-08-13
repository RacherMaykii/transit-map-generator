// 浏览器验证：单条轨道通用线型开关（虚线）
// 前提：.verify/profile 已被删除（干净 IndexedDB），画布初始为空
// 流程：首页 → 配线工具 → 打开项目 → 放置双线区间×2 → 连接工具连上 → 选中连接 → 点虚线 → 检查 line-dashed
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
// 关闭新手引导，避免浮层拦截
await evalJs(`localStorage.setItem('metro-wiring-tutorial-dismissed', 'true')`);
await send("Page.reload", { ignoreCache: true });
await waitFor(`(() => {
  const btns = [...document.querySelectorAll('.portal-tools button')];
  return btns.some(b => b.textContent.includes('配线图'));
})()`, 20000);
await new Promise((r) => setTimeout(r, 500));

// 1. 切到配线图工具
const clickedWiring = await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.portal-tools button')];
  const btn = btns.find(b => b.textContent.includes('配线图'));
  if (!btn) return false;
  btn.click();
  return true;
})()`);
check("切换到配线图工具", clickedWiring === true);
await waitFor(`(() => {
  const b = [...document.querySelectorAll('.portal-tools button')].find(x => x.textContent.includes('配线图'));
  return b && b.getAttribute('aria-pressed') === 'true';
})()`, 8000);
const wiringActive = await evalJs(`(() => {
  const b = [...document.querySelectorAll('.portal-tools button')].find(x => x.textContent.includes('配线图'));
  return b && b.getAttribute('aria-pressed') === 'true';
})()`);
check("配线图工具已激活", wiringActive === true);

// 2. 打开已有项目
await waitFor(`(() => !!(document.querySelector('.project-card') || document.querySelector('.project-empty')))()`, 15000);
await new Promise((r) => setTimeout(r, 500));
const cardCreated = await evalJs(`(() => !!document.querySelector('.project-card'))()`);
check("已有项目", cardCreated === true);

// 3. 打开项目（配线编辑器）
await evalJs(`(() => { const b = [...document.querySelectorAll('.project-card button')].find(x => x.textContent.includes('打开项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.wiring-svg') !== null", 20000);
check("配线编辑器已打开", await evalJs(`!!document.querySelector('.wiring-svg')`));
await new Promise((r) => setTimeout(r, 800));

// 3.1 干净画布断言：module-group 应为 0
const initialModules = await evalJs(`document.querySelectorAll('.module-group').length`);
check("画布初始为空（干净 IndexedDB）", initialModules === 0, `初始模块数=${initialModules}`);

// 4. 选择"双线区间"模板
await waitFor("document.querySelector('.wiring-template-card') !== null", 10000);
const tplCenter = await evalJs(`(() => {
  const card = [...document.querySelectorAll('.wiring-template-card')].find(c => c.textContent.includes('双线区间'));
  if (!card) return null;
  const r = card.getBoundingClientRect();
  return { x: r.left + r.width/2, y: r.top + r.height/2 };
})()`);
check("定位双线区间模板卡片", tplCenter !== null, tplCenter ? `(${Math.round(tplCenter.x)},${Math.round(tplCenter.y)})` : "");

// 画布坐标系转换
const svgRect = await evalJs(`(() => { const s = document.querySelector('.wiring-svg').getBoundingClientRect(); return { left: s.left, top: s.top }; })()`);
function worldPoint(wx, wy) {
  return { x: svgRect.left + 100 + wx * 0.75, y: svgRect.top + 60 + wy * 0.75 };
}
const p1 = worldPoint(300, 300);
const p2 = worldPoint(700, 300);
check("计算放置坐标", p1.x > svgRect.left, `p1=(${Math.round(p1.x)},${Math.round(p1.y)}) p2=(${Math.round(p2.x)},${Math.round(p2.y)})`);

// 5. 放置两个模块（每次放置前确保模板处于选中态；非连续放置下放置后模板自动取消）
async function selectTemplate() {
  await clickAt(tplCenter.x, tplCenter.y);
  await new Promise((r) => setTimeout(r, 300));
  const active = await evalJs(`(() => {
    const card = [...document.querySelectorAll('.wiring-template-card')].find(c => c.textContent.includes('双线区间'));
    return card && card.classList.contains('active');
  })()`);
  if (!active) {
    // 可能是第二次点击把已激活卡片取消了，再点一次恢复
    await clickAt(tplCenter.x, tplCenter.y);
    await new Promise((r) => setTimeout(r, 300));
  }
  return active;
}
await selectTemplate();
const tplActive = await evalJs(`(() => {
  const card = [...document.querySelectorAll('.wiring-template-card')].find(c => c.textContent.includes('双线区间'));
  return card && card.classList.contains('active');
})()`);
check("双线区间模板已选中", tplActive === true);

// 放置模块 1
await clickAt(p1.x, p1.y);
await new Promise((r) => setTimeout(r, 500));
// 放置模块 2（重新选中模板）
await selectTemplate();
await clickAt(p2.x, p2.y);
await new Promise((r) => setTimeout(r, 700));
const moduleCount = await evalJs(`document.querySelectorAll('.module-group').length`);
check("放置了两个双线区间模块", moduleCount === 2, `模块数=${moduleCount}`);

// 6. 若未自动连接，用连接工具手动连接
let connCount = await evalJs(`document.querySelectorAll('.connection-group').length`);
if (connCount === 0) {
  await evalJs(`(() => { const b = [...document.querySelectorAll('.wiring-segmented button')].find(x => x.textContent.includes('连接')); if (b) b.click(); return !!b; })()`);
  await new Promise((r) => setTimeout(r, 400));
  await waitFor(`document.querySelectorAll('.wiring-svg .port').length > 0`, 8000);
  const portInfo = await evalJs(`(() => {
    const rect = document.querySelector('.wiring-svg').getBoundingClientRect();
    const ports = [...document.querySelectorAll('.wiring-svg .port')].map(c => {
      const r = c.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      // client → world
      return { cx, cy, wx: (cx - rect.left - 100) / 0.75, wy: (cy - rect.top - 60) / 0.75 };
    });
    return ports;
  })()`);
  check("端口圆已显示", portInfo.length > 0, `端口数=${portInfo.length}`);
  // 双线区间模板：宽160 高112，UP_MAIN_Y=36 DOWN_MAIN_Y=76
  // 从 DOM 读取两个模块原点（translate(x,y)），据此推算端口目标：
  // 模块1 R_up = (ox+160, oy+36)；模块2 L_up = (ox, oy+36)
  const origins = await evalJs(`(() => {
    const mods = [...document.querySelectorAll('.module-group')];
    return mods.map(m => {
      const t = (m.getAttribute('transform') || '');
      const mt = t.match(/translate\\(([-\\d.]+),([-\\d.]+)\\)/);
      return mt ? { x: parseFloat(mt[1]), y: parseFloat(mt[2]) } : { x: 0, y: 0 };
    }).sort((a, b) => a.x - b.x);
  })()`);
  const target1 = { x: origins[0].x + 160, y: origins[0].y + 36 }; // 左模块 R_up
  const target2 = { x: origins[1].x, y: origins[1].y + 36 };        // 右模块 L_up
  const dist = (a, b) => Math.hypot(a.wx - b.x, a.wy - b.y);
  const src = portInfo.reduce((best, p) => dist(p, target1) < dist(best, target1) ? p : best, portInfo[0]);
  const dst = portInfo.reduce((best, p) => dist(p, target2) < dist(best, target2) ? p : best, portInfo[0]);
  check("定位源/目标端口", src && dst && src !== dst, `src=(${Math.round(src.cx)},${Math.round(src.cy)}) dst=(${Math.round(dst.cx)},${Math.round(dst.cy)})`);
  await clickAt(src.cx, src.cy);
  await new Promise((r) => setTimeout(r, 350));
  await clickAt(dst.cx, dst.cy);
  await new Promise((r) => setTimeout(r, 700));
}
connCount = await evalJs(`document.querySelectorAll('.connection-group').length`);
check("建立了轨道连接（含配对）", connCount >= 2, `连接数=${connCount}`);

// 7. 选中一条连接，属性面板出现线型分组
let connCenter = null;
if (connCount >= 1) {
  connCenter = await evalJs(`(() => {
    const groups = [...document.querySelectorAll('.connection-group')];
    for (const group of groups) {
      const els = [...group.querySelectorAll('path, line')];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const e of els) {
        const r = e.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        minX = Math.min(minX, r.left); minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right); maxY = Math.max(maxY, r.bottom);
      }
      if (minX !== Infinity) return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }
    return null;
  })()`);
  check("定位连接线", connCenter !== null, connCenter ? `(${Math.round(connCenter.x)},${Math.round(connCenter.y)})` : "");
  if (connCenter) {
    await clickAt(connCenter.x, connCenter.y);
    await new Promise((r) => setTimeout(r, 500));
  }
  const panelTitle = await evalJs(`(() => {
    const h3 = [...document.querySelectorAll('h3')].find(h => h.textContent.includes('轨道连接'));
    return h3 ? h3.textContent : null;
  })()`);
  check("属性面板选中轨道连接", panelTitle !== null, panelTitle || "");
  await waitFor(`(() => [...document.querySelectorAll('.wiring-prop-group h5')].some(h => h.textContent.includes('线型')))()`, 8000);
  check("属性面板出现线型分组", true);
}

// 8. 点击"虚线"
const dashedClicked = await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.wiring-prop-group button')];
  const b = btns.find(x => x.textContent.trim() === '虚线');
  if (!b) return false;
  b.click();
  return true;
})()`);
check("点击虚线按钮", dashedClicked === true);
await new Promise((r) => setTimeout(r, 600));

// 9. 检查连接是否出现 line-dashed 类（应同时应用到配对的两股道）
const dashedPresent = await evalJs(`(() => {
  const groups = [...document.querySelectorAll('.connection-group')];
  return groups.filter(g => {
    const t = g.querySelector('.connection-track');
    return t && t.classList.contains('line-dashed');
  }).length;
})()`);
check("轨道出现 line-dashed 类", dashedPresent >= 2, `虚线轨道=${dashedPresent}`);
// 确认虚线按钮处于 active 态
const dashedActive = await evalJs(`(() => {
  const b = [...document.querySelectorAll('.wiring-prop-group button')].find(x => x.textContent.trim() === '虚线');
  return b && b.classList.contains('active');
})()`);
check("虚线按钮显示为选中态", dashedActive === true);

// 截图
await screenshot(".verify/line-style-check.png");
check("已截图 .verify/line-style-check.png", true);

// 汇总
console.log("\n==== 结果汇总 ====");
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  failed.forEach((f) => console.log(`  ✗ ${f.name}`));
  process.exit(1);
}
process.exit(0);
