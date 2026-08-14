import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { displayStationsForPlatform, nextIndexForDirection, terminusSideFor, visualDirectionFor } from "../app/transit/route-orientation.mjs";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("wraps English labels only between complete words", async () => {
  const { fitEnglishTextLayout } = await import(new URL("../app/transit/english-layout.mjs", import.meta.url));
  const measure = (text, size) => [...text].reduce((width, character) => (
    width + (/\s/.test(character) ? size * 0.28 : size * 0.56)
  ), 0);

  const tourist = fitEnglishTextLayout("Tourist Distribution Center", 12, 4.5, 120, measure);
  assert.deepEqual(tourist.lines, ["Tourist", "Distribution Center"]);
  assert.equal(tourist.lines.join(" "), "Tourist Distribution Center");

  const hyphenated = fitEnglishTextLayout("Real-Imaginary Gateway", 12, 4.5, 80, measure);
  assert.equal(hyphenated.lines.join(" "), "Real-Imaginary Gateway");
  assert.ok(hyphenated.lines.includes("Real-Imaginary"));

  const singleLongWord = "ExtraordinarilyLongStationWord";
  const fitted = fitEnglishTextLayout(singleLongWord, 12, 4.5, 35, measure);
  assert.deepEqual(fitted.lines, [singleLongWord]);
  assert.ok(fitted.size < 4.5, "an indivisible word should shrink below the configured minimum when necessary");
  assert.ok(measure(singleLongWord, fitted.size) <= 35);
});

test("renders the project portal", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>轨道交通视觉设计工坊<\/title>/);
  assert.match(html, /线路站序图生成/);
  assert.match(html, /出入口站名标识生成/);
  assert.match(html, /虚空城/);
  assert.match(html, /新建项目/);
  assert.match(html, /\/assets\/rail-transit-icon\.png/);
  assert.doesNotMatch(html, /rail-transit-icon\.jpg/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|SkeletonPreview/);
  // 门户页脚：版本号、免费声明与两个信息弹窗入口按钮（初始渲染可见）
  assert.match(html, /关于 \/ 关于本项目/);
  assert.match(html, /注意事项与免责声明/);
  assert.match(html, /完全免费/);
  // v{APP_VERSION} 是「字面文本 + 表达式」边界，React 会在其间插入 <!-- --> 注释
  assert.match(html, /v(?:<!-- -->)?0\.1\.0/);
  // 顶部 Beta 提示条（初始渲染可见）
  assert.match(html, /本软件为 Beta 版本/);
  assert.match(html, /查看详情/);
  assert.match(html, /兼容性/);
});

test("static entry index.html ships valid single JSON-LD and complete SEO metadata", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");

  // 语言与基础元数据
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>轨道交通视觉设计工坊｜配线图、站序图与 Minecraft 地图画工具<\/title>/);
  assert.match(html, /name="description" content="[^"]*轨道交通配线图[^"]*"/);
  assert.match(html, /rel="canonical" href="https:\/\/rachermaykii\.github\.io\/transit-map-generator\/"/);

  // 页面中只保留一份主 JSON-LD
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, "必须只有一份 application/ld+json");

  // JSON-LD 语法合法，且包含三个实体
  const graph = JSON.parse(blocks[0][1].trim())["@graph"];
  const types = graph.map((entity) => entity["@type"]);
  assert.ok(types.includes("WebSite"), "包含 WebSite");
  assert.ok(types.includes("WebApplication"), "包含 WebApplication");
  assert.ok(types.includes("SoftwareSourceCode"), "包含 SoftwareSourceCode");

  const site = graph.find((entity) => entity["@type"] === "WebSite");
  const webapp = graph.find((entity) => entity["@type"] === "WebApplication");
  const source = graph.find((entity) => entity["@type"] === "SoftwareSourceCode");
  assert.ok(webapp, "WebApplication 实体存在");
  assert.ok(source, "SoftwareSourceCode 实体存在");

  // 核心能力：配线图、站序图、Minecraft 128×128 地图画
  assert.match(webapp.description, /配线图/);
  assert.match(webapp.description, /站序图/);
  assert.match(webapp.description, /128×128/);
  const features = webapp.featureList.join(" ");
  assert.match(features, /配线图/);
  assert.match(features, /站序图/);
  assert.match(features, /地图画/);
  assert.match(features, /128×128/);

  // 不得包含虚假评分/评论
  assert.doesNotMatch(html, /AggregateRating|"Review"/);

  // 所有线上地址使用完整绝对地址，且保留 GitHub Pages 子路径
  const SITE = "https://rachermaykii.github.io/transit-map-generator/";
  assert.equal(site.url, SITE);
  assert.equal(webapp.url, SITE);
  assert.equal(source.codeRepository, "https://github.com/RacherMaykii/transit-map-generator");
  assert.equal(webapp.isPartOf["@id"], `${SITE}#website`);
  assert.match(html, /property="og:url" content="https:\/\/rachermaykii\.github\.io\/transit-map-generator\/"/);

  // Open Graph 与 Twitter Card
  assert.match(html, /property="og:type" content="website"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /property="og:description"/);
  assert.match(html, /property="og:site_name" content="轨道交通视觉设计工坊"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:title"/);
  assert.match(html, /name="twitter:description"/);
});

test("portal about modal has real links, free note, version, and disclaimer", async () => {
  const [content, app, css] = await Promise.all([
    readFile(new URL("app/portalContent.ts", root), "utf8"),
    readFile(new URL("app/ProjectPortal.tsx", root), "utf8"),
    readFile(new URL("app/portal.css", root), "utf8"),
  ]);

  // 真实外链
  assert.match(content, /space\.bilibili\.com\/14029842/);
  assert.match(content, /v\.douyin\.com\/ZAkiWV5IbdM/);
  assert.match(content, /pd\.qq\.com\/s\/c17qqsm1s/);
  // 虚空城为「我的世界」搜索引导条目（无外链）
  assert.match(content, /我的世界 · 虚空城/);
  assert.match(content, /搜索「虚空小组」或「虚空城」/);
  // 免费声明与版本号来源（跟随 package.json）
  assert.match(content, /完全免费/);
  assert.match(content, /APP_VERSION/);
  assert.match(content, /package\.json/);
  // 注意事项与免责声明
  assert.match(content, /注意事项/);
  assert.match(content, /免责声明/);
  // ProjectPortal 使用内容模块并渲染两个入口按钮
  assert.match(app, /portalContent/);
  assert.match(app, /ABOUT_LINKS/);
  assert.match(app, /关于 \/ 关于本项目/);
  assert.match(app, /注意事项与免责声明/);
  assert.match(app, /infoDialog/);
  // 样式
  assert.match(css, /\.portal-info-modal/);
  assert.match(css, /\.portal-legal/);
  // Beta 提示条与详情弹窗内容
  assert.match(content, /BETA_NOTICE/);
  assert.match(content, /BETA_DETAILS/);
  assert.match(content, /如何反馈问题/);
  assert.match(content, /已知问题/);
  assert.match(content, /工程兼容性/);
  assert.match(content, /\.railcity/);
  // ProjectPortal 渲染提示条并复用信息弹窗
  assert.match(app, /BETA_NOTICE/);
  assert.match(app, /portal-beta-banner/);
  assert.match(app, /setInfoDialog\("beta"\)/);
  assert.match(app, /infoDialog === "beta"/);
  // 样式
  assert.match(css, /\.portal-beta-banner/);
  assert.match(css, /\.portal-beta-alert/);
});

test("static analytics beacon injects the default Cloudflare Web Analytics token", async () => {
  const [analytics, entry] = await Promise.all([
    readFile(new URL("app/analytics.tsx", root), "utf8"),
    readFile(new URL("app/static-entry.tsx", root), "utf8"),
  ]);
  // 组件读取构建期环境变量，注入 Cloudflare 官方 beacon 脚本
  assert.match(analytics, /beacon\.min\.js/);
  assert.match(analytics, /VITE_CLOUDFLARE_ANALYTICS_TOKEN/);
  assert.match(analytics, /ae18141ca60a4a27997d54a2f03f937d/);
  assert.match(analytics, /data-cf-beacon/);
  assert.match(analytics, /type="module"/);
  assert.match(analytics, /DEFAULT_CLOUDFLARE_ANALYTICS_TOKEN/);
  // 仅静态入口渲染该组件
  assert.match(entry, /AnalyticsBeacon/);
});

test("supports deploying under a sub-path (site.ts + relative asset refs)", async () => {
  const [site, viteStatic, portal, entranceApp, renderer, vectorPreview, loopRenderer, loopPreview, scenicRenderer, scenicPreview, transitApp, wiringApp, repositories] = await Promise.all([
    readFile(new URL("app/site.ts", root), "utf8"),
    readFile(new URL("vite.static.config.ts", root), "utf8"),
    readFile(new URL("app/ProjectPortal.tsx", root), "utf8"),
    readFile(new URL("app/entrance/EntranceSignApp.tsx", root), "utf8"),
    readFile(new URL("app/transit/render.ts", root), "utf8"),
    readFile(new URL("app/transit/RoutePreviewSvg.tsx", root), "utf8"),
    readFile(new URL("app/transit/styles/loop/loop-render.ts", root), "utf8"),
    readFile(new URL("app/transit/styles/loop/LoopRoutePreviewSvg.tsx", root), "utf8"),
    readFile(new URL("app/transit/styles/scenic/scenic-render.ts", root), "utf8"),
    readFile(new URL("app/transit/styles/scenic/ScenicRoutePreviewSvg.tsx", root), "utf8"),
    readFile(new URL("app/transit/TransitMapApp.tsx", root), "utf8"),
    readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8"),
    readFile(new URL("app/projects/repositories.ts", root), "utf8"),
  ]);
  // site.ts：浏览器用 document.baseURI 计算部署子路径，SSR 无 document 时退回根路径
  assert.match(site, /siteBase/);
  assert.match(site, /siteUrl/);
  assert.match(site, /document\.baseURI/);
  assert.match(site, /typeof document !== "undefined"/);
  assert.match(site, /return "\/";/);
  // vite 静态构建用相对 base，让 HTML/CSS 引用适配任意子路径
  assert.match(viteStatic, /base: "\.\/"/);
  // 代码里的资源与样例数据路径全部改为 siteUrl(...)，不再硬编码绝对 /assets 前缀
  for (const source of [portal, entranceApp, renderer, vectorPreview, loopRenderer, loopPreview, scenicRenderer, scenicPreview, transitApp, wiringApp]) {
    assert.doesNotMatch(source, /["'`]\/assets\//, "资源路径必须经过 siteUrl() 以适配子路径部署");
  }
  assert.match(portal, /siteUrl\("assets\/rail-transit-icon\.png"\)/);
  assert.match(entranceApp, /siteUrl\("assets\/rail-transit-icon\.png"\)/);
  assert.match(entranceApp, /DEFAULT_BACKGROUND = siteUrl\("assets\/space-elevator-station\.jpg"\)/);
  assert.match(renderer, /TRAM_ICON_PATH = siteUrl\("assets\/tram\.png"\)/);
  assert.match(vectorPreview, /siteUrl\("assets\/tram\.png"\)/);
  assert.match(loopRenderer, /TRANSFER_ICON_PATH = siteUrl\("assets\/transfer-white\.png"\)/);
  assert.match(loopPreview, /siteUrl\("assets\/transfer-white\.png"\)/);
  assert.match(scenicRenderer, /TRAM_ICON_PATH = siteUrl\("assets\/tram\.png"\)/);
  assert.match(scenicPreview, /siteUrl\("assets\/tram\.png"\)/);
  assert.match(transitApp, /siteUrl\("assets\/rail-transit-icon\.png"\)/);
  assert.match(wiringApp, /siteUrl\("assets\/rail-transit-icon\.png"\)/);
  // 样例数据（data/ 的静态镜像）同样适配子路径
  assert.doesNotMatch(repositories, /publicRoot = "\/sample-data"/);
  assert.match(repositories, /siteUrl\("sample-data"\)/);
});

test("keeps local data and rendering modules in the project", async () => {
  const [loopVectorPreview, loopRenderer, scenicVectorPreview, pulseVectorPreview, pulseRenderer] = await Promise.all([
    readFile(new URL("app/transit/styles/loop/LoopRoutePreviewSvg.tsx", root), "utf8"),
    readFile(new URL("app/transit/styles/loop/loop-render.ts", root), "utf8"),
    readFile(new URL("app/transit/styles/scenic/ScenicRoutePreviewSvg.tsx", root), "utf8"),
    readFile(new URL("app/transit/styles/pulse/PulseRoutePreviewSvg.tsx", root), "utf8"),
    readFile(new URL("app/transit/styles/pulse/pulse-render.ts", root), "utf8"),
  ]);
  const entranceStyleRegistry = await readFile(new URL("app/entrance/entranceStyles.ts", root), "utf8");
  await access(new URL("public/assets/transfer-white.png", root));
  const [packageJson, lines, stations, transfers, layout, types, renderer, vectorPreview, audit, app, settingsPanel, styles, portal, portalStyles, entranceApp, entranceRenderer, entranceStyles, server, launcher] = await Promise.all([
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("data/lines.csv", root), "utf8"),
    readFile(new URL("data/stations.csv", root), "utf8"),
    readFile(new URL("data/transfers.csv", root), "utf8"),
    readFile(new URL("data/layout.json", root), "utf8"),
    readFile(new URL("app/transit/types.ts", root), "utf8"),
    readFile(new URL("app/transit/render.ts", root), "utf8"),
    readFile(new URL("app/transit/RoutePreviewSvg.tsx", root), "utf8"),
    readFile(new URL("app/transit/audit.ts", root), "utf8"),
    readFile(new URL("app/transit/TransitMapApp.tsx", root), "utf8"),
    readFile(new URL("app/transit/SettingsPanel.tsx", root), "utf8"),
    readFile(new URL("app/transit/transit.css", root), "utf8"),
    readFile(new URL("app/ProjectPortal.tsx", root), "utf8"),
    readFile(new URL("app/portal.css", root), "utf8"),
    readFile(new URL("app/entrance/EntranceSignApp.tsx", root), "utf8"),
    readFile(new URL("app/entrance/renderEntranceSign.ts", root), "utf8"),
    readFile(new URL("app/entrance/entrance.css", root), "utf8"),
    readFile(new URL("local-data-server.mjs", root), "utf8"),
    readFile(new URL("start-local.ps1", root), "utf8"),
  ]);
  assert.match(packageJson, /"name": "transit-map-generator"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(lines, /L4,metro,4,4号线/);
  assert.match(stations, /客运中心/);
  assert.match(stations, /Jiangxin Islet/);
  assert.match(stations, /L6-S09,L6,9,产业园,industrial park,/);
  assert.match(stations, /L7-S05,L7,5,商务中心,Business Centre,/);
  assert.match(stations, /L7-S10,L7,10,椿江机场,Chun jiang Airport,/);
  assert.match(stations, /L9-S08,L9,8,冬椿山北,DongChun Mountain North,/);
  assert.match(stations, /L4-S01,L4,1,客运中心,Coach Station,/);
  assert.match(stations, /L1-S02,L1,3,虚数之构,Real-Imaginary Gateway,/);
  assert.match(stations, /L10-S01,L10,1,枫叶站,Maple Leaf Town Railway Station,/);
  assert.doesNotMatch(stations, /Passenger Transport Center/);
  assert.doesNotMatch(stations, /(?:产业园|商务中心|椿江机场|冬椿山北),,/);
  assert.match(stations, /notes,is_open/);
  assert.match(stations, /L1-S01[^\r\n]+,1/);
  assert.equal(stations.charCodeAt(0), 0xFEFF);
  assert.notEqual(stations.charCodeAt(1), 0xFEFF, "stations.csv must not contain a duplicated BOM");
  assert.match(stations, /T2-S07,T2,3,机库,Vehicle Depot/);
  assert.match(transfers, /color_override,hidden/);
  assert.match(transfers, /L2-S08,L6/);
  assert.match(transfers, /L3-S03,L5/);
  const layoutConfig = JSON.parse(layout);
  for (const key of ["stationRingWidth", "transferArrowLength", "infoLabelFontSize", "directionArrowThickness", "lineBadgeNumberFontSize"]) {
    assert.equal(typeof layoutConfig[key], "number", `${key} must remain configurable`);
    assert.ok(layoutConfig[key] > 0, `${key} must be positive`);
  }
  assert.equal(typeof layoutConfig.tramTransferVerticalOffset, "number");
  assert.equal(layoutConfig.lineWidth, 11.5);
  assert.equal(layoutConfig.stationRingWidth, 5.5);
  assert.equal(layoutConfig.stationZhFontSize, 18);
  assert.equal(layoutConfig.stationZhLetterSpacing, 0);
  assert.equal(layoutConfig.showStationCenterCodes, false);
  assert.equal(layoutConfig.stationEnFontSize, 12);
  assert.equal(layoutConfig.currentAccentY, 34);
  assert.equal(layoutConfig.currentStationX, 17);
  assert.equal(layoutConfig.lineBadgeDescriptionY, 105.5);
  assert.match(types, /lineWidth: 11\.5/);
  assert.match(types, /stationRingWidth: 5\.5/);
  assert.match(types, /stationZhFontSize: 18/);
  assert.match(types, /stationZhLetterSpacing: 0/);
  assert.match(settingsPanel, /中文站名字符间距/);
  assert.match(settingsPanel, /线路英文字符间距/);
  assert.match(settingsPanel, /圆环内显示线路代号和站点代号/);
  assert.match(settingsPanel, /stationCenterLineFontSize/);
  assert.match(app, /showSliceGuides/);
  assert.match(app, /stations\.length \+ 2/);
  assert.match(settingsPanel, /style-template-tabs/);
  assert.match(settingsPanel, /经典样式/);
  assert.match(settingsPanel, /环线样式/);
  assert.match(settingsPanel, /景区样式/);
  assert.match(app, /selectStyleTemplate/);
  assert.match(app, /assignLineStyle/);
  assert.match(app, /selectPreviewLine/);
  assert.match(app, /lineStyleTemplates/);
  assert.match(types, /lineStyleTemplates/);
  assert.match(server, /lineStyleTemplates/);
  assert.match(app, /layoutTemplates: \{ \.\.\.data\.layoutTemplates/);
  assert.match(settingsPanel, /style-template-panel-\$\{data\.activeStyleTemplate\}/);
  assert.match(app, /setScenicAssetRevision\(\(revision\) => revision \+ 1\)/);
  assert.match(settingsPanel, /assetsReady=\{scenicAssetsReady\}/);
  assert.match(scenicVectorPreview, /assetsReady && station\.icon && !iconUrl/);
  assert.match(settingsPanel, /aria-controls=\{`style-template-panel-/);
  assert.match(settingsPanel, /环线弧形布局/);
  assert.match(settingsPanel, /环线运行组件不使用经典样式的左右箭头和终点站名称/);
  assert.match(settingsPanel, /loopDirectionBadgeX/);
  assert.match(settingsPanel, /loopDirectionRunTextFontSize/);
  assert.match(app, /内环运行 →/);
  assert.match(app, /← 外环运行/);
  assert.match(app, /platformType/);
  assert.match(app, /岛式站台/);
  assert.match(app, /侧式站台/);
  assert.match(app, /variantFolder/);
  assert.match(types, /DEFAULT_LOOP_LAYOUT/);
  assert.match(types, /DEFAULT_PULSE_LAYOUT/);
  assert.match(types, /pulseTrackColor: "#284052"/);
  assert.match(types, /loopArcDepth: 26/);
  assert.match(types, /lineBadgeEnglishLetterSpacing: 4/);
  assert.match(types, /loopDirectionBadgeX: 64/);
  assert.match(vectorPreview, /LoopRoutePreviewSvg/);
  assert.match(loopVectorPreview, /LoopStationTile/);
  assert.match(loopVectorPreview, /transfer-white\.png/);
  assert.match(loopVectorPreview, /loopBottomBarHeight/);
  assert.match(loopVectorPreview, /loopDisplayStations/);
  assert.match(loopVectorPreview, /loopStationZhOffset/);
  assert.match(loopVectorPreview, /layout\.loopDirectionBadgeX/);
  assert.match(loopVectorPreview, /layout\.loopDirectionRunTextY/);
  assert.match(loopVectorPreview, /direction === "forward" \? "内环" : "外环"/);
  assert.match(loopVectorPreview, /`L\$\{target\.number\}`/);
  assert.doesNotMatch(loopVectorPreview, /line\.passedColor/);
  assert.match(loopRenderer, /renderLoopDirectionTile/);
  assert.match(loopRenderer, /renderLoopStationTile/);
  assert.match(loopRenderer, /renderLoopRouteCanvas/);
  assert.match(loopRenderer, /loopDisplayStations/);
  assert.match(loopRenderer, /layout\.loopDirectionBadgeX/);
  assert.match(loopRenderer, /layout\.loopDirectionRunTextY/);
  assert.match(loopRenderer, /direction === "forward" \? "内环" : "外环"/);
  assert.doesNotMatch(loopRenderer, /line\.passedColor/);
  assert.match(styles, /height: min\(800px, calc\(100dvh - 144px\)\)/);
  assert.match(styles, /border-bottom: 0/);
  assert.match(styles, /style-template-icon\.classic i[^}]*translate\(-50%, -50%\)/);
  assert.match(vectorPreview, /letterSpacing=\{data\.layout\.stationZhLetterSpacing\}/);
  assert.match(renderer, /setLetterSpacing/);
  assert.match(renderer, /layout\.showStationCenterCodes/);
  assert.match(vectorPreview, /showStationCenterCodes/);
  assert.match(types, /stationCodeParts/);
  assert.match(vectorPreview, /centerCodes\.lineCode/);
  assert.match(vectorPreview, /centerCodes\.stationCode/);
  assert.match(types, /stationEnFontSize: 12/);
  assert.match(types, /currentAccentY: 34/);
  assert.match(types, /currentStationX: 17/);
  assert.match(types, /lineBadgeDescriptionY: 105\.5/);
  assert.match(types, /normalizeTransitData/);
  assert.match(renderer, /renderRouteCanvas/);
  assert.match(renderer, /renderPulseRouteCanvas/);
  assert.match(vectorPreview, /PulseRoutePreviewSvg/);
  assert.match(pulseVectorPreview, /PulseStationTile/);
  assert.match(pulseVectorPreview, /NOW · 本站/);
  assert.match(pulseVectorPreview, /pulseCurrentHaloSize/);
  assert.match(pulseRenderer, /renderPulseDirectionTile/);
  assert.match(pulseRenderer, /renderPulseLineBadgeTile/);
  assert.match(renderer, /fitEnglishTextLayout/);
  assert.match(renderer, /if \(!edge\.first\)/);
  assert.doesNotMatch(renderer, /stationRadius - 6/);
  assert.match(vectorPreview, /MergedMetroTransfer/);
  assert.match(vectorPreview, /StationPreviewSvg/);
  assert.match(vectorPreview, /TextCardPreviewSvg/);
  assert.match(vectorPreview, /DirectionPreviewSvg/);
  assert.match(vectorPreview, /LineBadgePreviewSvg/);
  assert.match(vectorPreview, /availableWidth/);
  assert.match(vectorPreview, /englishTextLayout/);
  assert.match(vectorPreview, /fitEnglishTextLayout/);
  assert.match(vectorPreview, /!transfer\.hidden/);
  assert.match(vectorPreview, /colorState === "current"/);
  assert.match(vectorPreview, /const firstEnglishY = 108/);
  assert.match(vectorPreview, /closedStationsUsePassedColor/);
  assert.match(vectorPreview, /tramTransferVerticalOffset/);
  assert.match(vectorPreview, /siteUrl\("assets\/tram\.png"\)/);
  assert.doesNotMatch(vectorPreview, /▣ Tram/);
  assert.match(renderer, /drawMergedMetroTransfers/);
  assert.match(renderer, /TRAM_ICON_PATH/);
  assert.match(renderer, /directionArrowShaftLength/);
  assert.match(renderer, /infoStationFontSize/);
  assert.match(renderer, /lineBadgeRadius/);
  assert.match(renderer, /const firstEnglishY = 108/);
  assert.match(renderer, /closedStationsUsePassedColor/);
  assert.match(app, /导出 512 px/);
  assert.match(app, /显示设置/);
  assert.match(settingsPanel, /settings-preview-panel/);
  assert.match(settingsPanel, /选择设置预览站点/);
  assert.doesNotMatch(app, /CanvasComponentPreview/);
  assert.match(app, /站点列表检查/);
  assert.match(app, /开通统计/);
  assert.match(app, /本线路站点已开通/);
  assert.match(audit, /auditTransitData/);
  assert.match(audit, /calculateOpeningStats/);
  assert.match(audit, /R1-79/);
  assert.match(audit, /\["R1", "L7", "L9"\]/);
  assert.match(audit, /组合环线重复标记/);
  assert.match(app, /R1按7\/9号组合环线处理/);
  assert.match(settingsPanel, /运行方向图片/);
  assert.match(settingsPanel, /线路标识图片/);
  assert.match(settingsPanel, /英文自动缩放下限/);
  assert.match(app, /历史聚落与乡村景观/);
  assert.match(app, /用户上传素材/);
  assert.doesNotMatch(app, /name: "其他"/);
  const iconCategoryBlock = app.slice(app.indexOf("const ICON_CATEGORIES"), app.indexOf("function downloadBlob"));
  const categorizedIcons = new Set([...iconCategoryBlock.matchAll(/icons:\s*\[([^\]]*)\]/g)]
    .flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((name) => `${name[1]}.png`)));
  const publicIcons = (await readdir(new URL("public/sample-icons/", root))).filter((name) => name !== "manifest.json" && /\.(?:png|jpe?g|ico)$/i.test(name));
  assert.deepEqual(publicIcons.filter((name) => !categorizedIcons.has(name)), [], "所有内置图标都应进入明确分类");
  assert.match(settingsPanel, /未开通站点按已过站配色/);
  assert.match(settingsPanel, /独立组件精确位置/);
  assert.match(settingsPanel, /currentAccentX/);
  assert.match(settingsPanel, /nextStationY/);
  assert.match(settingsPanel, /directionArrowX/);
  assert.match(settingsPanel, /lineBadgeDescriptionY/);
  assert.match(settingsPanel, /onLayoutChange/);
  assert.match(app, /modal-scroll-body/);
  assert.match(styles, /scrollbar-gutter: stable/);
  assert.match(styles, /overflow: hidden; display: flex; flex-direction: column/);
  assert.match(portal, /createProjectRepository/);
  assert.match(portal, /BrowserEditorDocumentStore/);
  assert.match(portal, /projectId=\{opened\.project\.id\}/);
  assert.match(portal, /repository=\{repository\}/);
  assert.match(portal, /setOpened\(\{ tool, project \}\)/);
  assert.match(portal, /<TransitMapApp/);
  assert.match(portal, /<EntranceSignApp/);
  assert.match(portal, /<WiringDiagramApp/);
  assert.match(portal, /完整工程包/);
  assert.match(portal, /\.railcity/);
  assert.match(portal, /\.railproj/);
  assert.match(portal, /\.railassets/);
  assert.match(portal, /openTransferDialog\("assets"\)/);
  assert.match(portal, />导入资源包</);
  assert.match(portal, /补充到项目“\{selectedProject\?\.name\}”/);
  assert.match(portal, /补充到当前项目/);
  assert.match(portalStyles, /space-elevator-station\.jpg/);
  assert.match(portalStyles, /linear-gradient\(0deg/);
  assert.match(entranceApp, /出入口站名标识编辑器/);
  assert.match(entranceApp, /640 × 128 px/);
  assert.match(entranceApp, /导出图片包/);
  assert.match(entranceApp, /选择背景图片/);
  assert.match(entranceApp, /sliceEntranceSignCanvas/);
  assert.match(entranceApp, /图片背景/);
  assert.match(entranceApp, /纯色背景/);
  assert.match(entranceApp, /背景缩放/);
  assert.match(entranceApp, /背景水平位置/);
  assert.match(entranceApp, /背景垂直位置/);
  assert.match(entranceApp, /backgroundPlacement/);
  assert.match(entranceApp, /entrance-preview-layout/);
  assert.match(entranceApp, /entrance-floating-settings-scroll/);
  assert.match(entranceApp, /entrance-style-switch-button/);
  assert.match(entranceStyleRegistry, /id: "pulse", label: "夜航样式"/);
  assert.match(entranceStyleRegistry, /defaultPulseParams/);
  assert.match(entranceApp, /activeStyleId === "pulse"/);
  assert.match(entranceRenderer, /options\.styleId === "pulse"/);
  assert.match(entranceStyles, /entrance-style-template-icon\.pulse/);
  assert.match(entranceApp, /entrance-style-picker-modal/);
  assert.match(entranceApp, /siteUrl\("assets\/transfer-t5\.png"\)/);
  assert.match(entranceApp, /entrance-settings-tabs/);
  assert.match(entranceApp, /站名与出口/);
  assert.doesNotMatch(entranceApp, /entrance-editor-card/);
  assert.match(entranceApp, /线路标识色条/);
  assert.match(entranceApp, /updateStyleParam\("badgeVerticalOffset"/);
  assert.match(entranceApp, /updateStyleParam\("badgeDividerWidth"/);
  assert.match(entranceApp, /中文字符间距/);
  assert.match(entranceApp, /出口信息字符间距/);
  assert.match(entranceApp, /badgeLetterSpacing/);
  assert.match(entranceApp, /exitInfoX: s\.exitInfoX/);
  assert.match(entranceApp, /SliceGuideOverlay count=\{5\}/);
  assert.match(entranceRenderer, /options\.exitInfoX/);
  assert.match(entranceRenderer, /ENTRANCE_SIGN_WIDTH = 640/);
  assert.match(entranceRenderer, /ENTRANCE_TILE_SIZE = 128/);
  assert.match(entranceRenderer, /entranceSignLines/);
  assert.match(entranceRenderer, /candidate\.nameZh === station\.nameZh/);
  assert.match(entranceRenderer, /return data\.lines\.filter/);
  assert.match(entranceRenderer, /entranceBadgeLayout/);
  assert.match(entranceRenderer, /badgeVerticalOffset/);
  assert.match(entranceRenderer, /badgeDividerWidth/);
  assert.doesNotMatch(entranceRenderer, /\.slice\(0, 3\)/);
  assert.match(entranceRenderer, /renderEntranceSignCanvas/);
  assert.match(entranceRenderer, /entranceBackgroundPlacement/);
  assert.match(entranceRenderer, /backgroundMode === "solid"/);
  assert.match(entranceStyles, /entrance-preview-stage/);
  assert.match(entranceStyles, /position: sticky/);
  assert.match(entranceStyles, /height: 550px/);
  assert.match(entranceStyles, /entrance-style-picker-backdrop/);
  assert.match(styles, /slice-guide-overlay/);
  assert.match(app, /已隐藏/);
  assert.match(app, /exportNextStationCard/);
  assert.match(app, /下一站图/);
  assert.match(server, /snapshotCurrent/);
  assert.match(server, /snapshotCurrent\("saved"/);
  assert.doesNotMatch(server, /snapshotCurrent\("before-save"\)/);
  assert.doesNotMatch(server, /snapshotCurrent\("before-restore"\)/);
  assert.match(app, /beforeunload/);
  assert.match(app, /已保存版本/);
  assert.match(app, /保存后校验不一致/);
  assert.match(app, /saveCsv/);
  assert.match(app, /saveLayout/);
  assert.match(settingsPanel, /保存显示设置/);
  assert.match(app, /interactionStartRef/);
  assert.match(app, /handleInteractionPointerDown/);
  assert.match(app, /handleInteractionFocus/);
  assert.match(server, /\/api\/save-layout/);
  assert.match(server, /LAYOUT_TEMPLATES_FILE/);
  assert.match(server, /activeStyleTemplate/);
  assert.match(server, /layoutTemplates/);
  assert.match(server, /const CSV_FILES/);
  assert.doesNotMatch(server, /const DATA_FILES/);
  assert.match(server, /\/api\/projects/);
  assert.match(server, /PROJECTS_ROOT/);
  assert.match(server, /DEFAULT_PROJECT_ID/);
  assert.match(server, /is_open/);
  assert.match(packageJson, /vinext dev --hostname 127\.0\.0\.1/);
  assert.match(launcher, /@\(\$vinextCli, "dev", "--hostname", "127\.0\.0\.1"\)/);
  assert.match(server, /replace\(\/\^\\uFEFF\+\//);
  const stationRows = stations.replace(/^\uFEFF+/, "").split(/\r?\n/).slice(1).filter(Boolean);
  assert.equal(stationRows.filter((row) => row.split(",")[4] === "").length, 0, "every station must have an English name");
  const stationIds = new Set(stationRows.map((row) => row.split(",")[0]));
  const transferStationIds = transfers.replace(/^\uFEFF+/, "").split(/\r?\n/).slice(1).filter(Boolean).map((row) => row.split(",")[1]);
  assert.ok(stationIds.size >= 133, "station IDs must remain populated after user edits");
  assert.ok(transferStationIds.every((stationId) => stationIds.has(stationId)), "every transfer must reference an existing station ID");
  assert.ok(transferStationIds.filter((stationId) => stationId.startsWith("L4-")).length >= 13);
  assert.match(server, /color_override", "hidden/);
  await access(new URL("public/assets/tram.png", root));
  await access(new URL("public/assets/rail-transit-icon.png", root));
  await access(new URL("public/assets/space-elevator-station.jpg", root));
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", root)));
});

test("wiring editor supports independent label objects with undo, layers, and serialization", async () => {
  const [types, history, projectStore, app, labelInspector] = await Promise.all([
    readFile(new URL("app/wiring/types.ts", root), "utf8"),
    readFile(new URL("app/wiring/history.ts", root), "utf8"),
    readFile(new URL("app/wiring/projectStore.ts", root), "utf8"),
    readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8"),
    readFile(new URL("app/wiring/inspectors/LabelInspector.tsx", root), "utf8"),
  ]);

  // LabelObject has all required fields
  assert.match(types, /interface LabelObject/);
  assert.match(types, /backgroundMask/);
  assert.match(types, /maskStrokeWidth/);
  assert.match(types, /fontWeight/);
  assert.match(types, /locked/);
  assert.match(types, /visible/);
  assert.match(types, /layerId/);
  assert.match(types, /zIndex/);
  assert.match(types, /sourceLineId/);
  assert.match(types, /backgroundEnabled/);
  assert.match(types, /outlineColor/);

  // Eight-direction anchor map exists
  assert.match(types, /LABEL_ANCHOR_MAP/);
  assert.match(types, /top_left/);
  assert.match(types, /bottom_right/);

  // WiringTool includes label mode
  assert.match(types, /"select" \| "pan" \| "place" \| "label"/);

  // History snapshot includes labels
  assert.match(history, /labels/);
  assert.match(history, /labels: refs\.labels\.current/);
  assert.match(history, /cloneHistorySnapshot/);

  // Project file serialization includes labels
  assert.match(projectStore, /labels:/);
  assert.match(projectStore, /labels\?: LabelObject\[\]/);
  // Backwards compatibility migration
  assert.match(projectStore, /if \(!migrated\.labels\)/);

  // App integrates label state and operations
  assert.match(app, /const \[labels, setLabels\]/);
  assert.match(app, /labelsRef/);
  assert.match(app, /function placeLabel/);
  assert.match(app, /function updateLabel/);
  assert.match(app, /function deleteLabel/);
  assert.match(app, /handleLabelMouseDown/);
  assert.match(app, /handleLabelDoubleClick/);
  assert.match(app, /LABEL_ANCHOR_MAP/);
  assert.match(await readFile(new URL("app/wiring/ui/renderItem.tsx", root), "utf8"), /paintOrder/);
  assert.match(app, /backgroundMask/);
  assert.match(app, /wiring-text-tool-card/);
  assert.match(labelInspector, /文字范围内层级/);
  assert.match(app, /sourceLineId/);
  assert.match(await readFile(new URL("app/wiring/ui/renderItem.tsx", root), "utf8"), /label-background/);
  assert.match(labelInspector, /元件库文字保持独立定位，不参与自动避障/);
  // Label tool button in toolbar
  assert.match(app, /activeTool === "label"/);
  // Label serialized in save and auto-save
  assert.match(app, /labels,/);
  assert.match(app, /documentStore\.save\(projectId, "wiring"/);
  assert.match(app, /synchronizeWiringProjectSource/);
  assert.match(app, /重新读取项目 CSV/);
});

test("wiring editor wires v2 source state through history, persistence, and placement UI", async () => {
  const app = await readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8");
  const placementInspector = await readFile(new URL("app/wiring/inspectors/PlacementInspector.tsx", root), "utf8");
  assert.match(app, /useHistory\(\{ modules: modulesRef/);
  assert.match(app, /platforms, graphics, assets, sourceLines/);
  assert.match(app, /generateSourceChanges/);
  assert.match(app, /pendingPlacement/);
  assert.match(app, /application\/x-transit-station/);
  assert.match(app, /只看未放置/);
  assert.match(app, /retain_transfers/);
  assert.match(app, /renameActivePage/);
  assert.match(app, /fitCanvas/);
  assert.match(app, /PLACEMENT_Z_LEVELS/);
  const placementLevels = await readFile(new URL("app/wiring/ui/primitives.ts", root), "utf8");
  assert.match(placementLevels, /高架-极深|地下-极深/);
  assert.match(placementInspector, /按元件类型/);
  assert.match(app, /resolvePlacementLayer/);
  assert.match(app, /zIndex: placementZIndex/);
  assert.match(app, /layerId: resolvePlacementLayer/);
});

test("wiring editor exposes RAF-backed resize handles and the complete default layer tree", async () => {
  const [app, types, css] = await Promise.all([
    readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8"),
    readFile(new URL("app/wiring/types.ts", root), "utf8"),
    readFile(new URL("app/wiring/wiring.css", root), "utf8"),
  ]);
  assert.match(app, /platformResize/);
  assert.match(app, /graphicResize/);
  assert.match(app, /handlePlatformResizeMouseDown/);
  assert.match(app, /handleGraphicResizeMouseDown/);
  assert.match(app, /requestAnimationFrame/);
  assert.match(app, /Math\.max\(10,/);
  assert.match(app, /Math\.max\(4,/);
  assert.match(css, /object-resize-handle/);
  for (const id of ["layer-background", "layer-bg-reference", "layer-track-depot-access", "layer-platform-normal", "layer-platform-special", "layer-text-yard", "layer-text-line", "layer-text-note", "layer-icon-transfer", "layer-icon-facility", "layer-annotation-service", "layer-annotation-custom", "layer-aux-grid", "layer-aux-snap", "layer-aux-control"]) assert.match(types, new RegExp(id));
  for (const name of ["底图", "参考图", "出入段线", "普通站台", "特殊站台", "场段名称", "线路说明", "站点图标", "换乘图标", "特殊设施图标", "换乘通道", "运行关系", "自定义标注", "吸附线", "控制点"]) assert.match(types, new RegExp(name));
});

test("wiring editor supports track crossing management (plain/gap/bridge)", async () => {
  const [types, history, projectStore, app] = await Promise.all([
    readFile(new URL("app/wiring/types.ts", root), "utf8"),
    readFile(new URL("app/wiring/history.ts", root), "utf8"),
    readFile(new URL("app/wiring/projectStore.ts", root), "utf8"),
    readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8"),
  ]);

  // CrossingType and CrossingPoint defined
  assert.match(types, /export type CrossingType = "plain" \| "gap" \| "bridge"/);
  assert.match(types, /interface CrossingPoint/);

  // ModuleConnection has crossing fields
  assert.match(types, /crossingType: CrossingType/);
  assert.match(types, /crossingPoints: CrossingPoint\[\]/);

  // History deep-copies crossingPoints
  assert.match(history, /JSON\.parse\(JSON\.stringify\(snapshot\)\)/);

  // Project store migrates old connections without crossing fields
  assert.match(projectStore, /crossingType: c\.crossingType \|\| "plain"/);
  assert.match(projectStore, /crossingPoints: c\.crossingPoints \|\| \[\]/);

  // App has connection operations
  assert.match(app, /function updateConnection/);
  assert.match(app, /function addCrossingPoint/);
  assert.match(app, /function cycleCrossingType/);
  assert.match(app, /function handleConnectionMouseDown/);
  assert.match(app, /function handleConnectionDoubleClick/);
  assert.match(app, /function removeCrossingPoint/);

  // App renders crossing types
  assert.match(await readFile(new URL("app/wiring/ui/renderItem.tsx", root), "utf8"), /crossing-gap/);
  assert.match(await readFile(new URL("app/wiring/ui/renderItem.tsx", root), "utf8"), /crossing-bridge/);
  assert.match(await readFile(new URL("app/wiring/ui/renderItem.tsx", root), "utf8"), /crossing-point/);
  assert.match(await readFile(new URL("app/wiring/ui/renderItem.tsx", root), "utf8"), /crossing-label/);

  // App has crossing type selector in property panel
  assert.match(app, /平面交叉/);
  assert.match(app, /断开/);
  assert.match(app, /桥梁/);

  // New connections default to plain crossing
  assert.match(app, /crossingType: "plain"/);
  assert.match(app, /crossingPoints: \[\]/);
  // New connections initialize empty controlPoints
  assert.match(app, /controlPoints: \[\]/);
});

test("wiring editor supports semantic track model with editable control points", async () => {
  const [types, geometry, history, projectStore, app, connectionLogic, css, connectionInspector] = await Promise.all([
    readFile(new URL("app/wiring/types.ts", root), "utf8"),
    readFile(new URL("app/wiring/geometry.ts", root), "utf8"),
    readFile(new URL("app/wiring/history.ts", root), "utf8"),
    readFile(new URL("app/wiring/projectStore.ts", root), "utf8"),
    readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8"),
    readFile(new URL("app/wiring/connectionLogic.ts", root), "utf8"),
    readFile(new URL("app/wiring/wiring.css", root), "utf8"),
    readFile(new URL("app/wiring/inspectors/ConnectionInspector.tsx", root), "utf8"),
  ]);

  // TrackControlPoint type defined with node + curve handle fields
  assert.match(types, /export interface TrackControlPoint/);
  assert.match(types, /curved: boolean/);
  assert.match(types, /handleX: number/);
  assert.match(types, /handleY: number/);
  assert.match(types, /directionOnly\?: boolean/);
  assert.match(types, /tangentDirection\?: number/);

  // ModuleConnection carries controlPoints
  assert.match(types, /controlPoints: TrackControlPoint\[\]/);
  assert.match(types, /pairedConnectionId\?: string/);

  // Track rebuild + path helpers live in geometry.ts (barrel re-exported from types.ts)
  assert.match(geometry, /export function rebuildTracksFromControlPoints/);
  assert.match(geometry, /export function buildControlPointPathD/);
  // Path builder emits SVG cubic bezier command for curved segments
  assert.match(geometry, /C\$\{/);

  // One complete data clone protects nested control points in every snapshot path.
  assert.match(history, /cloneHistorySnapshot/);
  assert.match(history, /readSnapshot/);

  // Project store migrates old connections to include controlPoints
  assert.match(projectStore, /controlPoints: c\.controlPoints \|\| \[\]/);

  // App exposes control point operations
  assert.match(app, /function getConnectionEndpoints/);
  assert.match(app, /function addControlPointAt/);
  assert.match(app, /function addControlPointMidpoint/);
  assert.match(app, /function removeControlPoint/);
  assert.match(app, /function straightenConnection/);
  assert.match(app, /function toggleControlPointCurve/);
  assert.match(app, /function handleControlPointMouseDown/);
  assert.match(app, /function handleControlPointHandleMouseDown/);
  assert.match(app, /function updateConnectionAndPairedRail/);
  assert.match(app, /pairedConnectionId: pairedConnection\.id/);
  assert.match(app, /function handleControlPointDoubleClick/);
  // Alt+click on track adds a node at the click position
  assert.match(app, /handleTrackClick/);
  assert.match(app, /e\.altKey/);

  // Port positions are authoritative: geometry derives endpoint anchors from
  // the current modules rather than retaining detached world-space endpoints.
  assert.match(connectionLogic, /export function createAutoControlPoints/);
  assert.match(connectionLogic, /export function getConnectionGeometry/);
  assert.match(connectionLogic, /worldPortPosition\(from\.module, from\.template, from\.portId\)/);
  assert.match(connectionLogic, /worldPortPosition\(to\.module, to\.template, to\.portId\)/);
  assert.match(connectionLogic, /controlPoints: geometry\.controlPoints, tracks: geometry\.tracks/);
  assert.match(geometry, /export function buildDirectionOnlyControlPointPathD/);
  // Paired double-track rails are rendered through the pair-coordinated helper.
  assert.match(app, /geometryForConnection\(conn, connections, modules, resolvedTemplateMap\)/);

  // App renders path through control points and draggable handles
  assert.match(app, /buildControlPointPathD/);
  assert.match(await readFile(new URL("app/wiring/ui/renderItem.tsx", root), "utf8"), /track-node/);
  assert.match(await readFile(new URL("app/wiring/ui/renderItem.tsx", root), "utf8"), /track-handle-dot/);
  assert.match(await readFile(new URL("app/wiring/ui/renderItem.tsx", root), "utf8"), /track-handle-line/);

  // Property panel exposes node management UI
  assert.match(app, /轨道节点/);
  assert.match(connectionInspector, /添加节点/);
  assert.match(app, /拉直轨道/);

  // CSS styles the new control point handles
  assert.match(css, /\.track-node/);
  assert.match(css, /\.track-handle-dot/);
  assert.match(css, /\.track-handle-line/);
});

test("wiring editor supports configurable turnout parameters and double-branch template", async () => {
  const [types, app, templates, customize, turnout, moduleInspector] = await Promise.all([
    readFile(new URL("app/wiring/types.ts", root), "utf8"),
    readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8"),
    readFile(new URL("app/wiring/templates.ts", root), "utf8"),
    readFile(new URL("app/wiring/templates/customize.ts", root), "utf8"),
    readFile(new URL("app/wiring/templates/turnout.ts", root), "utf8"),
    readFile(new URL("app/wiring/inspectors/ModuleInspector.tsx", root), "utf8"),
  ]);

  // TemplateParam interface defined
  assert.match(types, /export interface TemplateParam/);
  assert.match(types, /key: string/);
  assert.match(types, /min: number/);
  assert.match(types, /max: number/);
  assert.match(types, /default: number/);

  // ModuleTemplate has params field
  assert.match(types, /params\?: TemplateParam\[\]/);

  // DiagramModule has customParams field
  assert.match(types, /customParams\?: Record<string, number>/);

  // makeCustomizedTemplate factory lives in templates/customize.ts
  // (re-exported by the templates.ts barrel).
  assert.match(customize, /export function makeCustomizedTemplate/);
  assert.match(templates, /export \{ makeCustomizedTemplate \} from "\.\/templates\/customize"/);

  // double_branch template defined (turnout.ts)
  assert.match(turnout, /id: "double_branch"/);
  assert.match(turnout, /name: "双支线分叉"/);
  assert.match(turnout, /category: "turnout"/);

  // symmetric_double_branch template defined (turnout.ts)
  assert.match(turnout, /id: "symmetric_double_branch"/);
  assert.match(turnout, /name: "对称支线分岔"/);
  assert.match(turnout, /category: "turnout"/);

  // both registered in MODULE_TEMPLATES (barrel imports them)
  assert.match(turnout, /doubleBranchTurnout/);
  assert.match(turnout, /symmetricDoubleBranch/);
  assert.match(templates, /doubleBranchTurnout/);
  assert.match(templates, /symmetricDoubleBranch/);

  // Turnout templates have params arrays
  assert.match(turnout, /left_turnout[\s\S]*?params:/);
  assert.match(turnout, /right_turnout[\s\S]*?params:/);
  assert.match(turnout, /single_crossover[\s\S]*?params:/);
  assert.match(turnout, /double_crossover[\s\S]*?params:/);
  assert.match(turnout, /scissors_crossover[\s\S]*?params:/);
  assert.match(turnout, /branch_diverge[\s\S]*?params:/);

  // The app resolves module-specific templates before it renders ports or
  // derives connection geometry.
  assert.match(templates, /export function buildResolvedTemplateMap/);
  assert.match(app, /buildResolvedTemplateMap/);

  // App initializes customParams on module placement
  assert.match(app, /Object\.fromEntries/);

  // App renders property panel param sliders
  assert.match(app, /道岔参数/);
  assert.match(moduleInspector, /wiring-param-slider/);
  assert.match(moduleInspector, /customParams: \{ \.\.\.\(selectedMod\.customParams/);

  // CSS styles param sliders
  const css = await readFile(new URL("app/wiring/wiring.css", root), "utf8");
  assert.match(css, /\.wiring-param-slider/);
  assert.match(css, /\.wiring-param-value/);
});

test("wiring editor supports transfer groups with undo, layers, and serialization", async () => {
  const [types, history, projectStore, app, css, transferGroupInspector] = await Promise.all([
    readFile(new URL("app/wiring/types.ts", root), "utf8"),
    readFile(new URL("app/wiring/history.ts", root), "utf8"),
    readFile(new URL("app/wiring/projectStore.ts", root), "utf8"),
    readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8"),
    readFile(new URL("app/wiring/wiring.css", root), "utf8"),
    readFile(new URL("app/wiring/inspectors/TransferGroupInspector.tsx", root), "utf8"),
  ]);

  // TransferGroup type defined with all required fields (simplified)
  assert.match(types, /export interface TransferGroup/);
  assert.match(types, /moduleIds: string\[\]/);
  assert.match(types, /lineIds: string\[\]/);
  assert.match(types, /sourceStationIds: string\[\]/);
  assert.match(types, /layerId: string/);
  assert.match(types, /zIndex: number/);
  assert.match(types, /visible: boolean/);
  assert.match(types, /locked: boolean/);
  assert.match(types, /accentColor/);

  // History snapshot includes transferGroups with deep copy of arrays
  assert.match(history, /transferGroups/);
  assert.match(history, /transferGroups: refs\.transferGroups\.current/);
  assert.match(history, /cloneHistorySnapshot/);

  // Project store serializes and migrates transferGroups
  assert.match(projectStore, /transferGroups/);
  assert.match(projectStore, /transferGroups\?: TransferGroup\[\]/);
  assert.match(projectStore, /transferGroups: params\.transferGroups \|\| \[\]/);
  assert.match(projectStore, /if \(!migrated\.transferGroups\)/);

  // App has transfer group state and operations
  assert.match(app, /const \[transferGroups, setTransferGroups\]/);
  assert.match(app, /transferGroupsRef/);
  assert.match(app, /function createTransferGroupFromSelection/);
  assert.match(app, /function updateTransferGroup/);
  assert.match(app, /function addSelectedModulesToGroup/);
  assert.match(app, /function removeModuleFromGroup/);
  assert.match(app, /function deleteTransferGroup/);
  assert.match(app, /function handleTransferGroupMouseDown/);
  assert.match(app, /function getTransferGroupBounds/);
  assert.match(app, /type: "transferGroup"/);
  assert.match(app, /translateModuleGroup/);
  assert.match(app, /已整体移动换乘组/);

  // App renders transfer groups as dashed bounding boxes
  assert.match(await readFile(new URL("app/wiring/ui/renderItem.tsx", root), "utf8"), /transfer-group/);
  assert.match(app, /strokeDasharray/);
  assert.match(app, /getTransferGroupBounds/);

  // Property panel has transfer group editing
  assert.match(app, /selectedTransferGroup/);
  assert.match(app, /换乘组属性/);
  assert.match(app, /成员模块/);
  assert.match(transferGroupInspector, /关联线路/);

  // Transfer group creation via context menu
  assert.match(app, /createTransferGroupFromSelection\(\)/);

  // Transfer group serialized in save and auto-save
  assert.match(app, /transferGroups,/);

  // CSS styles transfer groups
  assert.match(css, /\.transfer-group/);
  assert.match(css, /\.wiring-line-badge/);
});

test("unified transfer button, discardSnapshot, and tutorial cleanup", async () => {
  const [app, history, tutorial] = await Promise.all([
    readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8"),
    readFile(new URL("app/wiring/history.ts", root), "utf8"),
    readFile(new URL("app/wiring/TutorialOverlay.tsx", root), "utf8"),
  ]);

  // ── 1. Toolbar has visible transfer button with disabled logic ──
  // The button renders "换乘" text inside a <button> tag with disabled prop
  assert.match(app, /button[\s\S]*?>\s*换乘\s*</);
  assert.match(app, /disabled=\{modules\.filter/);
  assert.match(app, /请至少选择两个站台/);
  assert.match(app, /将选中的站台创建为换乘组/);

  // ── 2. Toolbar button and context menu call the same function ──
  // Button onClick calls createTransferGroupFromSelection()
  assert.match(app, /onClick=\{\(\) => createTransferGroupFromSelection\(\)\}/);

  // ── 3. Auto-selects new transfer group after creation ──
  assert.match(app, /setSelectedIds\(\[group\.id\]\)/);

  // ── 4. Success feedback message ──
  assert.match(app, /已创建换乘组/);

  // ── 5. history.discardSnapshot exists ──
  assert.match(history, /discardSnapshot/);
  assert.match(history, /stack\.past\.slice\(0, -1\)/);

  // ── 6. Mouseup handler discards snapshots on !moved for all drag types ──
  assert.match(app, /history\.discardSnapshot\(\)/);

  // ── 7. Tutorial has no old transfer type terms ──
  assert.ok(!/进出站关系/.test(tutorial), "tutorial must not mention 进出站关系");
  assert.ok(!/布局类型/.test(tutorial), "tutorial must not mention 布局类型");

  // ── 8. Tutorial mentions the new transfer button workflow ──
  assert.match(tutorial, /换乘/);
  assert.match(tutorial, /选中多个站台后点击工具栏/);

  // ── 9. Tutorial backdrop prevents click-through (no pointer-events:none on backdrop) ──
  // Match only within the .tutorial-backdrop CSS block using [^}]*
  assert.ok(!/\.tutorial-backdrop\s*\{[^}]*pointer-events:\s*none/.test(tutorial),
    "tutorial backdrop must not have pointer-events: none");

  // ── 10. Tutorial says 8 steps (covers the new 自动避让 step) ──
  assert.match(tutorial, /8 个步骤/);
  assert.ok(!/7 个步骤/.test(tutorial), "tutorial must say 8 steps, not 7");

  // ── 11. Tutorial covers the new 自动避让 feature ──
  assert.match(tutorial, /自动避让/);
  assert.match(tutorial, /避让一次/);
  assert.match(tutorial, /站名、图标与站台重叠时会被自动推开/);

  // ── 12. Dismissal marker is versioned (v2) so the updated tutorial re-shows once ──
  assert.match(tutorial, /metro-wiring-tutorial-dismissed-v2/);
  assert.ok(!/"metro-wiring-tutorial-dismissed"/.test(tutorial), "old unversioned key literal must be gone");

  // ── 13. Bubble is clamped into viewport (overflow fix: ref + measured clamp) ──
  assert.match(tutorial, /bubbleRef/);
  assert.match(tutorial, /getBoundingClientRect/);
  assert.match(tutorial, /useLayoutEffect/);
});

test("project deletion uses a highest-level three-editor confirmation", async () => {
  const portal = await readFile(new URL("app/ProjectPortal.tsx", root), "utf8");
  assert.ok(!portal.includes("window.confirm"));
  assert.match(portal, /最高级别警告/);
  assert.match(portal, /三个编辑器内容将一起永久删除/);
  assert.match(portal, /线路站序图/);
  assert.match(portal, /出入口站名标识/);
  assert.match(portal, /配线图/);
  assert.match(portal, /deleteConfirmation !== selectedProject\.name/);
});

test("wiring first-use safety notice appears before the tutorial", async () => {
  const [app, notice] = await Promise.all([
    readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8"),
    readFile(new URL("app/wiring/FirstUseNotice.tsx", root), "utf8"),
  ]);
  assert.match(notice, /非专业轨道工程软件/);
  assert.match(notice, /wiring-first-use-warning/);
  assert.match(notice, /metro-wiring-first-use-notice-dismissed-v1/);
  assert.match(app, /showFirstUseNotice\s*\?/);
  assert.match(app, /:\s*showTutorial\s*\?/);
});

test("auto-avoidance is a persistent toggle with a manual one-shot when off", async () => {
  const app = await readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8");

  // The automatic avoidance is a persistent checkbox (default on), sibling to 自动连接
  assert.match(app, /usePersistentState\(PREF_KEY\("autoAvoidance"\), true\)/);
  assert.match(app, /checked=\{autoAvoidance\}/);
  assert.match(app, />自动避让</);

  // The auto-run effect is gated on the toggle, so off = dragging keeps overlaps
  assert.match(app, /if \(!autoAvoidance\) return;/);

  // When off, a manual one-shot button replaces the always-on behavior
  assert.match(app, /\{!autoAvoidance &&/);
  assert.match(app, /避让一次/);
});

test("wiring editor supports hierarchical tree layers with drag-to-reorder", async () => {
  const [types, layerTree, history, projectStore, app, css] = await Promise.all([
    readFile(new URL("app/wiring/types.ts", root), "utf8"),
    readFile(new URL("app/wiring/layerTree.ts", root), "utf8"),
    readFile(new URL("app/wiring/history.ts", root), "utf8"),
    readFile(new URL("app/wiring/projectStore.ts", root), "utf8"),
    readFile(new URL("app/wiring/WiringDiagramApp.tsx", root), "utf8"),
    readFile(new URL("app/wiring/wiring.css", root), "utf8"),
  ]);

  // LayerNode carries tree fields
  assert.match(types, /interface LayerNode/);
  assert.match(types, /parentId: string \| null/);
  assert.match(types, /order: number/);
  assert.match(types, /expanded: boolean/);

  // DEFAULT_LAYERS is organized as a tree (parent-child relationships)
  assert.match(types, /DEFAULT_LAYERS/);
  assert.match(types, /parentId: "layer-track"/);
  assert.match(types, /parentId: "layer-annotation"/);
  assert.match(types, /parentId: "layer-aux"/);
  // Root layers have null parentId
  assert.match(types, /id: "layer-track"[^\n]*parentId: null/);
  assert.match(types, /id: "layer-background"[^\n]*parentId: null/);
  assert.match(types, /id: "layer-bg"[^\n]*parentId: "layer-background"/);

  // Tree helper functions live in layerTree.ts (barrel re-exported from types.ts)
  assert.match(types, /export \{[^}]*flattenLayerTree[^}]*\} from "\.\/layerTree"/);
  assert.match(layerTree, /export function getAncestorIds/);
  assert.match(layerTree, /export function isLayerTreeVisible/);
  assert.match(layerTree, /export function isLayerTreeLocked/);
  assert.match(layerTree, /export function getChildLayers/);
  assert.match(layerTree, /export function getRootLayers/);
  assert.match(layerTree, /export function hasChildren/);
  assert.match(layerTree, /export function flattenLayerTree/);

  // History snapshots layers (flat copy per node)
  assert.match(history, /layers: refs\.layers\.current/);
  assert.match(history, /cloneHistorySnapshot/);

  // Project store serializes layers and migrates old flat layers to tree fields
  assert.match(projectStore, /layers: LayerNode\[\]/);
  assert.match(projectStore, /layers: params\.layers/);
  assert.match(projectStore, /parentId: layer\.parentId \?\? null/);
  assert.match(projectStore, /order: typeof layer\.order === "number"/);
  assert.match(projectStore, /expanded: typeof layer\.expanded === "boolean"/);

  // App uses tree-aware visibility/lock and traverses children recursively.
  assert.match(app, /isLayerTreeVisible/);
  assert.match(app, /isLayerTreeLocked/);
  assert.match(app, /getChildLayers/);
  assert.match(app, /getRootLayers/);
  assert.match(app, /children\.length > 0/);

  // App renders layers recursively (depth-first, parent before children)
  assert.match(app, /function renderLayerNode\(layer: LayerNode, depth: number\)/);
  assert.match(app, /renderLayerNode\(child, depth \+ 1\)/);
  assert.match(app, /getRootLayers\(layers\)\.map\(\(layer\) => renderLayerNode\(layer, 0\)\)/);

  // App supports layer operations integrated with history
  assert.match(app, /function createSubLayer/);
  assert.match(app, /function deleteLayer/);
  assert.match(app, /function renameLayer/);
  assert.match(app, /function moveLayer/);
  assert.match(app, /function toggleLayerExpanded/);
  // createSubLayer auto-expands parent
  assert.match(app, /expanded: true/);

  // App supports drag-to-reorder with three drop positions
  assert.match(app, /"before" \| "after" \| "inside"/);
  assert.match(app, /layerDragRef/);
  assert.match(app, /moveLayer\(layerDragRef\.current\.draggedId/);
  // Cycle detection prevents dragging a parent into its own descendant
  assert.match(app, /position === "inside"/);

  // App exposes expand/collapse, create sub-layer, delete controls in the row
  assert.match(app, /layer-expand/);
  assert.match(app, /新建子图层/);
  assert.match(app, /删除图层/);
  assert.match(app, /新建图层/);

  // CSS styles the tree layer rows and drop indicators
  assert.match(css, /\.wiring-layer-tree/);
  assert.match(css, /\.wiring-layer-row/);
  assert.match(css, /\.drop-before/);
  assert.match(css, /\.drop-after/);
  assert.match(css, /\.drop-inside/);
  assert.match(css, /\.layer-expand/);
});

test("transit app supports CSV import preview with validation and diff", async () => {
  const [csvIo, app, css] = await Promise.all([
    readFile(new URL("app/transit/csv-io.ts", root), "utf8"),
    readFile(new URL("app/transit/TransitMapApp.tsx", root), "utf8"),
    readFile(new URL("app/transit/transit.css", root), "utf8"),
  ]);

  // csv-io module: CSV column schemas defined
  assert.match(csvIo, /LINES_COLUMNS/);
  assert.match(csvIo, /STATIONS_COLUMNS/);
  assert.match(csvIo, /TRANSFERS_COLUMNS/);

  // CSV parser handles BOM, quoted fields, CRLF
  assert.match(csvIo, /export function parseCsv/);
  assert.match(csvIo, /\\uFEFF/);
  assert.match(csvIo, /detectCsvType/);

  // Row converters produce typed domain objects
  assert.match(csvIo, /export function linesFromCsv/);
  assert.match(csvIo, /export function stationsFromCsv/);
  assert.match(csvIo, /export function transfersFromCsv/);
  // terminalType validated against union
  assert.match(csvIo, /TerminalType/);

  // Validation detects structural errors
  assert.match(csvIo, /export function validateCsvImport/);
  assert.match(csvIo, /站点 ID 重复/);
  assert.match(csvIo, /指向不存在的站点/);
  assert.match(csvIo, /换乘关系重复/);

  // Diff summary computes added/removed counts
  assert.match(csvIo, /export function computeDiff/);
  assert.match(csvIo, /addedLines/);
  assert.match(csvIo, /removedLines/);
  assert.match(csvIo, /addedStations/);
  assert.match(csvIo, /removedStations/);

  // buildImportPreview assembles full preview
  assert.match(csvIo, /export function buildImportPreview/);
  assert.match(csvIo, /missingTypes/);

  // hasBlockingIssues gates the confirm button
  assert.match(csvIo, /export function hasBlockingIssues/);

  // App imports csv-io functions
  assert.match(app, /from "\.\/csv-io"/);
  assert.match(app, /buildImportPreview/);
  assert.match(app, /parseCsvFile/);
  assert.match(app, /hasBlockingIssues/);

  // App has CSV import button and hidden file input (multiple)
  assert.match(app, /导入 CSV/);
  assert.match(app, /csvImportRef/);
  assert.match(app, /type="file" accept="\.csv,text\/csv" multiple/);

  // App has import handler that parses selected files
  assert.match(app, /handleCsvImportSelect/);
  // App has confirm/cancel functions
  assert.match(app, /confirmCsvImport/);
  assert.match(app, /cancelCsvImport/);

  // App renders preview modal with diff stats, issues, and data tables
  assert.match(app, /csv-import-modal/);
  assert.match(app, /csv-import-diff/);
  assert.match(app, /diff-add/);
  assert.match(app, /diff-remove/);
  assert.match(app, /csv-import-issues/);
  assert.match(app, /csv-import-ok/);
  assert.match(app, /csv-import-preview-data/);
  // Confirm button disabled when blocking issues exist
  assert.match(app, /存在错误，无法导入/);

  // CSS styles the import modal
  assert.match(css, /\.csv-import-modal/);
  assert.match(css, /\.csv-import-diff/);
  assert.match(css, /\.diff-stat/);
  assert.match(css, /\.csv-import-issue/);
  assert.match(css, /\.csv-import-ok/);
  assert.match(css, /\.csv-mini-table/);
  assert.match(css, /\.csv-import-actions/);
});

test("岛式与侧式站台保持相同运行语义，仅改变画面朝向", () => {
  const stations = [{ id: "S1" }, { id: "S2" }, { id: "S3" }];
  const cases = [
    ["island", "forward", ["S1", "S2", "S3"], 2, "right", "forward"],
    ["island", "reverse", ["S1", "S2", "S3"], 0, "left", "reverse"],
    ["side", "forward", ["S3", "S2", "S1"], 2, "left", "reverse"],
    ["side", "reverse", ["S3", "S2", "S1"], 0, "right", "forward"],
  ];
  for (const [platform, direction, expectedOrder, expectedNext, expectedSide, expectedVisual] of cases) {
    assert.deepEqual(displayStationsForPlatform(stations, platform).map(({ station }) => station.id), expectedOrder);
    assert.equal(nextIndexForDirection(1, stations.length, direction), expectedNext);
    assert.equal(terminusSideFor(direction, platform), expectedSide);
    assert.equal(visualDirectionFor(direction, platform), expectedVisual);
  }
});
