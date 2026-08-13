// 为 README「界面一览」生成 docs/screenshots/ 下的演示图（门户 + 三个编辑器）。
// 用法：node .verify/screenshot-readme.mjs （需 localhost:3000 与 127.0.0.1:4175 已在运行）
import { startBrowser, newPage, evalJs, waitFor, screenshot, send } from "./cdp.mjs";
import { mkdirSync } from "node:fs";

const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

await startBrowser();
await newPage("http://localhost:3000/?storage=http");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await waitFor("document.querySelector('.portal-tools') !== null", 20000);
await waitFor("document.querySelector('.project-card') !== null", 20000);
await new Promise((r) => setTimeout(r, 700));

// 1. 首页门户（含 Beta 提示条）
await screenshot(`${OUT}/portal.png`);
console.log("✓ portal.png");

// 2. 线路站序图编辑器（默认选中站序图工具）
await evalJs(`(() => { const b = document.querySelector('.project-card button'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.app-shell') !== null", 25000);
await waitFor("document.querySelector('svg') !== null || document.body.innerText.includes('CSV 已载入')", 20000);
await new Promise((r) => setTimeout(r, 900));
await screenshot(`${OUT}/route.png`);
console.log("✓ route.png");
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('返回项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.portal-tools') !== null", 15000);

// 3. 出入口站名标识编辑器
await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-tools button')].find(x => x.textContent.includes('出入口站名标识')); if (b) b.click(); return !!b; })()`);
await new Promise((r) => setTimeout(r, 250));
await evalJs(`(() => { const b = document.querySelector('.project-card button'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.app-header') !== null", 25000);
await new Promise((r) => setTimeout(r, 900));
await screenshot(`${OUT}/entrance.png`);
console.log("✓ entrance.png");
await evalJs(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('返回项目')); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.portal-tools') !== null", 15000);

// 4. 配线图编辑器（先标记教程已关闭，避免教程弹窗遮挡画布）
await evalJs(`localStorage.setItem('metro-wiring-tutorial-dismissed-v2', 'true')`);
await evalJs(`(() => { const b = [...document.querySelectorAll('.portal-tools button')].find(x => x.textContent.includes('配线图生成')); if (b) b.click(); return !!b; })()`);
await new Promise((r) => setTimeout(r, 250));
await evalJs(`(() => { const b = document.querySelector('.project-card button'); if (b) b.click(); return !!b; })()`);
await waitFor("document.querySelector('.wiring-toolbar') !== null", 25000);
await new Promise((r) => setTimeout(r, 900));
await screenshot(`${OUT}/wiring.png`);
console.log("✓ wiring.png");

console.log("\n全部截图完成 → docs/screenshots/");
process.exit(0);
