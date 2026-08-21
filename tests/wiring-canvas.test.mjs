import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const canvas = await server.ssrLoadModule("/app/wiring/canvasLogic.ts");
const projectStore = await server.ssrLoadModule("/app/wiring/projectStore.ts");
const templatesMod = await server.ssrLoadModule("/app/wiring/templates.ts");
const avoidance = await server.ssrLoadModule("/app/wiring/labelAvoidance.ts");
const primitives = await server.ssrLoadModule("/app/wiring/ui/primitives.ts");
const batch = await server.ssrLoadModule("/app/wiring/batch.ts");
const clipboard = await server.ssrLoadModule("/app/wiring/clipboard.ts");
const defaultPlacement = await server.ssrLoadModule("/app/wiring/defaultPlacement.ts");
after(() => server.close());

const TEMPLATES = new Map(templatesMod.MODULE_TEMPLATES.map((template) => [template.id, template]));

test("默认放置跟随模板，统一设置只覆盖支持的参数并按各模板范围限制", () => {
  const values = { spacing: 40, platformLength: 160, platformWidth: 16, length: 140, branchOffset: 240, alignBranchEnds: false };
  const crossPlatform = TEMPLATES.get("cross_platform");
  const preTurnback = TEMPLATES.get("pre_turnback");
  const leftTurnout = TEMPLATES.get("left_turnout");
  assert.ok(crossPlatform && preTurnback && leftTurnout);

  const followedCross = defaultPlacement.buildPlacementCustomParams(crossPlatform, defaultPlacement.DEFAULT_OVERRIDE_MODES, values);
  const followedTurnback = defaultPlacement.buildPlacementCustomParams(preTurnback, defaultPlacement.DEFAULT_OVERRIDE_MODES, values);
  assert.equal(followedCross.spacing, 32);
  assert.equal(followedTurnback.platformLength, 80);

  const uniform = { ...defaultPlacement.DEFAULT_OVERRIDE_MODES, spacing: "uniform", platformLength: "uniform", length: "uniform", branchOffset: "uniform" };
  assert.equal(defaultPlacement.buildPlacementCustomParams(crossPlatform, uniform, values).spacing, 40);
  assert.equal(defaultPlacement.buildPlacementCustomParams(preTurnback, uniform, values).platformLength, 160);
  const turnoutParams = defaultPlacement.buildPlacementCustomParams(leftTurnout, uniform, values);
  assert.equal(turnoutParams.length, 140);
  assert.equal(turnoutParams.branchOffset, 48); // 统一值 240 按普通单开模板上限限制
});

test("双线分岔端点补齐默认只写入支持该参数的模板", () => {
  const values = { spacing: 40, platformLength: 160, platformWidth: 16, length: 100, branchOffset: 24, alignBranchEnds: true };
  const fork = TEMPLATES.get("double_fork_up");
  const section = TEMPLATES.get("double_track");
  assert.ok(fork && section);
  assert.equal(defaultPlacement.buildPlacementCustomParams(fork, defaultPlacement.DEFAULT_OVERRIDE_MODES, values).alignBranchEnds, 1);
  assert.equal("alignBranchEnds" in defaultPlacement.buildPlacementCustomParams(section, defaultPlacement.DEFAULT_OVERRIDE_MODES, values), false);
});

test("new canvas pages preserve required dimensions and canvas settings", () => {
  const page = canvas.createCanvasPage({ id: "p2", name: "施工图", width: 2560, height: 1440, gridSize: 32, showGrid: false });
  assert.deepEqual(
    { id: page.id, name: page.name, width: page.width, height: page.height, gridSize: page.gridSize, showGrid: page.showGrid, orientation: page.orientation },
    { id: "p2", name: "施工图", width: 2560, height: 1440, gridSize: 32, showGrid: false, orientation: "landscape" },
  );
  assert.equal(canvas.createCanvasPage({ id: "small", name: "x", width: 1, height: 2 }).width, 320);
});

test("canvas pages can be renamed, edited and deleted without removing the final page", () => {
  const first = canvas.createCanvasPage({ id: "p1", name: "主画布" });
  const second = canvas.createCanvasPage({ id: "p2", name: "副图" });
  const updated = canvas.updateCanvasPage([first, second], "p2", { name: "车场图", width: 1200, showGrid: false });
  assert.equal(updated[1].name, "车场图");
  assert.equal(updated[1].width, 1200);
  const deleted = canvas.deleteCanvasPage(updated, "p2", "p2");
  assert.deepEqual(deleted.pages.map((page) => page.id), ["p1"]);
  assert.equal(deleted.activePageId, "p1");
  assert.equal(canvas.deleteCanvasPage(deleted.pages, "p1", "p1").pages.length, 1);
});

test("background helpers fit, center and restore original scale", () => {
  const page = canvas.createCanvasPage({ id: "p", name: "画布", width: 1000, height: 500 });
  const image = { id: "bg", naturalWidth: 400, naturalHeight: 400, scale: 0.5, x: 10, y: 10 };
  const fitted = canvas.fitBackgroundToCanvas(image, page);
  assert.equal(fitted.scale, 1.25);
  assert.equal(fitted.x, 250);
  assert.equal(fitted.y, 0);
  assert.deepEqual({ x: canvas.centerBackgroundOnCanvas(image, page).x, y: canvas.centerBackgroundOnCanvas(image, page).y }, { x: 400, y: 150 });
  assert.equal(canvas.restoreBackgroundSize(image).scale, 1);
});

test("PNG/SVG export embeds path-backed background images", async () => {
  let requested = "";
  const converted = await primitives.exportImageSourceToDataUrl("/assets/map.png", async (source) => {
    requested = String(source);
    return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
  });
  assert.equal(requested, "/assets/map.png");
  assert.equal(converted, "data:image/png;base64,iVBORw==");
  assert.equal(
    await primitives.exportImageSourceToDataUrl("data:image/png;base64,AAAA", async () => { throw new Error("should not fetch"); }),
    "data:image/png;base64,AAAA",
  );
});

test("background export reports an unreadable source instead of silently omitting it", async () => {
  await assert.rejects(
    () => primitives.exportImageSourceToDataUrl("/missing.png", async () => new Response(null, { status: 404 })),
    /背景图读取失败（HTTP 404）/,
  );
});

test("canvas expands at the right and bottom without moving existing content", () => {
  const page = canvas.createCanvasPage({ id: "p", name: "canvas", width: 1000, height: 800, gridSize: 20 });
  const expanded = canvas.expandCanvasToFitBounds(page, [{ x: 1080, y: 820, width: 40, height: 40 }]);
  assert.deepEqual({ width: expanded.width, height: expanded.height }, { width: 1320, height: 1120 });
  assert.equal(canvas.expandCanvasToFitBounds(expanded, [{ x: 100, y: 100, width: 20, height: 20 }]), expanded);
});

test("module port alignment corrects mismatched template origins without changing interval length", () => {
  const island = TEMPLATES.get("island_platform");
  const doubleIsland = TEMPLATES.get("double_island");
  const existing = { id: "existing", templateId: "island_platform", x: 500, y: 200, rotation: 0, pageId: "p" };
  const moving = { id: "moving", templateId: "double_island", x: 760, y: 220, rotation: 0, pageId: "p" };
  const aligned = canvas.alignModuleToTrackPorts({
    module: moving,
    template: doubleIsland,
    others: [existing],
    templates: TEMPLATES,
    threshold: 20,
  });
  assert.deepEqual(aligned, { x: 760, y: 216, aligned: true });
});

test("up-fork input ports align to the double-track section output ports (40px offset bridged by snap)", () => {
  const upFork = TEMPLATES.get("double_fork_up");
  const existing = { id: "existing", templateId: "double_track", x: 200, y: 300, rotation: 0, pageId: "p" };
  // 上分叉输入端口本地 y=76/116，区间输出端口 36/76：同 y 放置相差 40px。
  // 吸附下应把分叉上移 40px，使输入端口与区间输出端口 y 持平。
  const moving = { id: "moving", templateId: "double_fork_up", x: 500, y: 300, rotation: 0, pageId: "p" };
  const aligned = canvas.alignModuleToTrackPorts({
    module: moving,
    template: upFork,
    others: [existing],
    templates: TEMPLATES,
    threshold: 20,
  });
  assert.deepEqual(aligned, { x: 500, y: 260, aligned: true });
});

test("section placed right of an up-fork aligns to the straight pair, not the closer branch", () => {
  const section = TEMPLATES.get("double_track");
  const existing = { id: "existing", templateId: "double_fork_up", x: 200, y: 300, rotation: 0, pageId: "p" };
  // 区间 L_up 与分叉直股(车道1, y=76)相差 +40、与支线(车道2, y=12)相差 +24。
  // 支线虽是"最近"同角色端口，但车道号不一致，不得抢占；必须对齐直股（y=340）。
  const moving = { id: "moving", templateId: "double_track", x: 500, y: 300, rotation: 0, pageId: "p" };
  const aligned = canvas.alignModuleToTrackPorts({
    module: moving,
    template: section,
    others: [existing],
    templates: TEMPLATES,
    threshold: 20,
  });
  assert.deepEqual(aligned, { x: 500, y: 340, aligned: true });
});

test("Y-fork input ports align to the section output ports (16px offset)", () => {
  const yFork = TEMPLATES.get("double_fork_y");
  const existing = { id: "existing", templateId: "double_track", x: 200, y: 600, rotation: 0, pageId: "p" };
  const moving = { id: "moving", templateId: "double_fork_y", x: 500, y: 600, rotation: 0, pageId: "p" };
  const aligned = canvas.alignModuleToTrackPorts({
    module: moving,
    template: yFork,
    others: [existing],
    templates: TEMPLATES,
    threshold: 20,
  });
  assert.deepEqual(aligned, { x: 500, y: 584, aligned: true });
});

test("parallel offset rails do not snap together even at 40px (ports do not point toward each other)", () => {
  const section = TEMPLATES.get("double_track");
  const existing = { id: "existing", templateId: "double_track", x: 200, y: 300, rotation: 0, pageId: "p" };
  // 第二条区间放在第一条下方 40px（并行线，不是同排接续）：端口各朝左右、彼此不相望，
  // 不得被吸到一起。
  const moving = { id: "moving", templateId: "double_track", x: 200, y: 340, rotation: 0, pageId: "p" };
  const aligned = canvas.alignModuleToTrackPorts({
    module: moving,
    template: section,
    others: [existing],
    templates: TEMPLATES,
    threshold: 20,
  });
  assert.deepEqual(aligned, { x: 200, y: 340, aligned: false });
});

test("layer tree order wins before zIndex, then creation order breaks ties", () => {
  const layers = [
    { id: "background", parentId: null, order: 0 },
    { id: "track", parentId: null, order: 1 },
    { id: "label", parentId: null, order: 2 },
  ];
  const rank = canvas.createLayerRank(layers);
  const items = [
    { id: "late-track", layerId: "track", zIndex: 99 },
    { id: "early-label", layerId: "label", zIndex: -99 },
    { id: "first-track", layerId: "track", zIndex: 0 },
    { id: "second-track", layerId: "track", zIndex: 0 },
  ];
  const ordered = [...items].sort((a, b) => canvas.compareRenderOrder(a, b, rank, (item) => items.indexOf(item)));
  assert.deepEqual(ordered.map((item) => item.id), ["first-track", "second-track", "late-track", "early-label"]);
});

test("层叠栈对象跨图层按有效层级交错：前置模块的轨道盖过后放站台的站台，不再错位", () => {
  const layers = [
    { id: "track", parentId: null, order: 0 },
    { id: "platform", parentId: null, order: 1 },
  ];
  const rank = canvas.createLayerRank(layers);
  const isStack = (item) => item.stack === true;
  const items = [
    { id: "back-platform", layerId: "platform", zIndex: 0.002, stack: true },
    { id: "front-module", layerId: "track", zIndex: 9.999, stack: true },
    { id: "back-module", layerId: "track", zIndex: 0, stack: true },
    { id: "front-platform", layerId: "platform", zIndex: 10, stack: true },
  ];
  const ordered = [...items].sort((a, b) => canvas.compareRenderOrder(a, b, rank, (item) => items.indexOf(item), isStack));
  // 整座 A（轨道+站台）在整座 B（轨道+站台）之上；站台层不再无条件压住轨道层
  assert.deepEqual(ordered.map((item) => item.id), ["back-module", "back-platform", "front-module", "front-platform"]);
});

test("非层叠栈对象（备注文字等）仍按图层优先排序，始终浮在最上层", () => {
  const layers = [
    { id: "track", parentId: null, order: 0 },
    { id: "platform", parentId: null, order: 1 },
    { id: "label", parentId: null, order: 2 },
  ];
  const rank = canvas.createLayerRank(layers);
  const isStack = (item) => item.stack === true;
  const items = [
    { id: "back-platform", layerId: "platform", zIndex: 0.002, stack: true },
    { id: "front-module", layerId: "track", zIndex: 9.999, stack: true },
    { id: "note-label", layerId: "label", zIndex: 0, stack: false },
  ];
  const ordered = [...items].sort((a, b) => canvas.compareRenderOrder(a, b, rank, (item) => items.indexOf(item), isStack));
  // 即使模块 z 更高，备注文字仍在最上层
  assert.equal(ordered[ordered.length - 1].id, "note-label");
});

test("connection zIndex follows the midpoint of its endpoint modules unless manually overridden", () => {
  const modules = [
    { id: "left", zIndex: 2 },
    { id: "right", zIndex: 8 },
  ];
  const automatic = { fromModuleId: "left", toModuleId: "right", zIndex: 99, zIndexMode: "auto" };
  assert.equal(canvas.effectiveConnectionZIndex(automatic, modules), 5);

  modules[1].zIndex = 9;
  assert.equal(canvas.effectiveConnectionZIndex(automatic, modules), 5.5, "端点层级变化后动态重算");
  assert.equal(canvas.effectiveConnectionZIndex({ ...automatic, zIndexMode: undefined }, modules), 5.5, "旧工程默认自动");
  assert.equal(canvas.effectiveConnectionZIndex({ ...automatic, zIndexMode: "manual", zIndex: 12 }, modules), 12);
  assert.equal(canvas.effectiveConnectionZIndex({ ...automatic, toModuleId: "missing", zIndex: 7 }, modules), 7, "端点缺失时回退保存值");
});

test("owned station-name label zIndex follows its module while independent notes keep their value", () => {
  const modules = [{ id: "station", zIndex: 8 }];
  const attached = { attachedToId: "station", positionMode: "attached", zIndex: 3 };
  assert.equal(canvas.effectiveLabelZIndex(attached, modules), 8.01, "物化站名随所属模块层级，略高于本模块站台");
  modules[0].zIndex = 12;
  assert.equal(canvas.effectiveLabelZIndex(attached, modules), 12.01, "模块层级变化后站名动态重算");
  assert.equal(canvas.effectiveLabelZIndex({ ...attached, positionMode: "independent" }, modules), 3, "独立文字保留自己的层级");
  assert.equal(canvas.effectiveLabelZIndex({ ...attached, attachedToId: "missing" }, modules), 3, "所属模块缺失时回退保存值");
});

test("owned platform zIndex follows its module while manual and standalone platforms keep their values", () => {
  const modules = [{ id: "station", zIndex: 8 }];
  const automatic = { moduleId: "station", zIndex: 1, zIndexMode: "auto" };
  assert.equal(canvas.effectivePlatformZIndex(automatic, modules, 0), 8.001);
  assert.equal(canvas.effectivePlatformZIndex(automatic, modules, 1), 8.002);
  modules[0].zIndex = 12;
  assert.equal(canvas.effectivePlatformZIndex(automatic, modules, 0), 12.001, "模块层级变化后动态重算");
  assert.equal(canvas.effectivePlatformZIndex({ ...automatic, zIndexMode: undefined }, modules, 0), 12.001, "旧站台默认跟随模块");
  assert.equal(canvas.effectivePlatformZIndex({ ...automatic, zIndexMode: "manual", zIndex: 20 }, modules, 0), 20);
  assert.equal(canvas.effectivePlatformZIndex({ moduleId: undefined, zIndex: 6, zIndexMode: "auto" }, modules, 0), 6, "独立站台保留自己的层级");
});

test("large-canvas render ordering handles 20 lines and thousands of objects", () => {
  const layers = Array.from({ length: 20 }, (_, index) => ({ id: `line-${index}`, parentId: null, order: index }));
  const rank = canvas.createLayerRank(layers);
  const items = [
    ...Array.from({ length: 300 }, (_, index) => ({ id: `module-${index}`, layerId: `line-${index % 20}`, zIndex: index })),
    ...Array.from({ length: 1000 }, (_, index) => ({ id: `track-${index}`, layerId: `line-${index % 20}`, zIndex: index % 50 })),
    ...Array.from({ length: 1000 }, (_, index) => ({ id: `annotation-${index}`, layerId: `line-${index % 20}`, zIndex: index % 80 })),
  ];
  const started = performance.now();
  const ordered = [...items].sort((a, b) => canvas.compareRenderOrder(a, b, rank, (item) => Number(item.id.split("-").at(-1))));
  const elapsed = performance.now() - started;
  assert.equal(ordered.length, 2300);
  assert.ok(elapsed < 1000, `render ordering took ${elapsed.toFixed(1)} ms`);
});

test("only leaf layers can own objects", () => {
  const layers = [
    { id: "track", parentId: null, order: 0 },
    { id: "main", parentId: "track", order: 0 },
    { id: "label", parentId: null, order: 1 },
  ];
  assert.deepEqual(canvas.leafLayerIds(layers), ["main", "label"]);
});

test("effective layer opacity multiplies every ancestor", () => {
  const layers = [
    { id: "root", parentId: null, order: 0, opacity: 0.8 },
    { id: "tracks", parentId: "root", order: 0, opacity: 0.5 },
    { id: "main", parentId: "tracks", order: 0, opacity: 0.25 },
  ];
  assert.equal(canvas.effectiveLayerOpacity(layers, "main"), 0.1);
  assert.equal(canvas.effectiveLayerOpacity(layers, "missing"), 1);
});

test("module rotation carries owned platform, label, and graphic around the template center without drift", () => {
  const diagramModule = { id: "module", x: 100, y: 200, rotation: 0 };
  const template = { width: 100, height: 80 };
  const input = {
    module: diagramModule, template, nextRotation: 90,
    platforms: [{ id: "platform", moduleId: "module", x: 170, y: 230, width: 20, height: 10, rotation: 0 }],
    labels: [{ id: "label", attachedToId: "module", x: 170, y: 240, rotation: 0, offsetX: 70, offsetY: 40 }],
    graphics: [{ id: "graphic", attachedToId: "module", x: 160, y: 220, width: 20, height: 20, rotation: 0, offsetX: 60, offsetY: 20 }],
  };
  const first = canvas.rotateModuleOwnedObjects(input);
  assert.deepEqual(first.platforms[0], { ...input.platforms[0], x: 145, y: 265, rotation: 90 });
  assert.deepEqual(first.labels[0], { ...input.labels[0], x: 150, y: 260, rotation: 90, offsetX: 50, offsetY: 60 });
  assert.deepEqual(first.graphics[0], { ...input.graphics[0], x: 150, y: 250, rotation: 90, offsetX: 50, offsetY: 50 });
  const second = canvas.rotateModuleOwnedObjects({ ...input, module: { ...diagramModule, rotation: 90 }, nextRotation: 180, ...first });
  assert.deepEqual({ x: second.platforms[0].x, y: second.platforms[0].y, rotation: second.platforms[0].rotation }, { x: 110, y: 240, rotation: 180 });
  assert.deepEqual({ x: second.labels[0].x, y: second.labels[0].y, rotation: second.labels[0].rotation, offsetX: second.labels[0].offsetX, offsetY: second.labels[0].offsetY }, { x: 130, y: 240, rotation: 0, offsetX: 30, offsetY: 40 });
  const moved = { ...second.graphics[0], x: second.graphics[0].x + 25, y: second.graphics[0].y - 10 };
  assert.deepEqual({ offsetX: moved.x - (diagramModule.x + 25), offsetY: moved.y - (diagramModule.y - 10) }, { offsetX: second.graphics[0].offsetX, offsetY: second.graphics[0].offsetY });
});

test("module mirror carries owned platform, label, and graphic across the template centre", () => {
  const diagramModule = { id: "module", x: 100, y: 200, rotation: 0 };
  const template = { width: 100, height: 80 };
  const input = {
    module: diagramModule, template, nextMirrorX: true, nextMirrorY: false,
    platforms: [{ id: "platform", moduleId: "module", x: 170, y: 230, width: 20, height: 10, rotation: 0 }],
    labels: [{ id: "label", attachedToId: "module", x: 170, y: 240, rotation: 0, offsetX: 70, offsetY: 40 }],
    graphics: [{ id: "graphic", attachedToId: "module", x: 160, y: 220, width: 20, height: 20, rotation: 0, offsetX: 60, offsetY: 20 }],
  };
  const result = canvas.mirrorModuleOwnedObjects(input);
  assert.deepEqual(result.platforms[0], { ...input.platforms[0], x: 110, y: 230, rotation: 180 });
  assert.deepEqual(result.labels[0], { ...input.labels[0], x: 130, y: 240, rotation: 0, offsetX: 30, offsetY: 40 });
  assert.deepEqual(result.graphics[0], { ...input.graphics[0], x: 120, y: 220, rotation: 0, mirrorX: true, offsetX: 20, offsetY: 20 });
});

test("module mirror composes with rotation for owned objects", () => {
  const diagramModule = { id: "module", x: 100, y: 200, rotation: 90 };
  const template = { width: 100, height: 80 };
  const input = {
    module: diagramModule, template, nextMirrorX: true, nextMirrorY: false,
    platforms: [{ id: "platform", moduleId: "module", x: 150, y: 220, width: 20, height: 10, rotation: 90 }],
    labels: [{ id: "label", attachedToId: "module", x: 150, y: 240, rotation: 0, offsetX: 50, offsetY: 40 }],
    graphics: [{ id: "graphic", attachedToId: "module", x: 160, y: 240, width: 20, height: 20, rotation: 90, offsetX: 60, offsetY: 40 }],
  };
  const result = canvas.mirrorModuleOwnedObjects(input);
  assert.deepEqual(result.platforms[0], { ...input.platforms[0], x: 150, y: 250, rotation: 270 });
  assert.deepEqual(result.labels[0], { ...input.labels[0], x: 150, y: 240, rotation: 0, offsetX: 50, offsetY: 40 });
  assert.deepEqual(result.graphics[0], { ...input.graphics[0], x: 160, y: 220, rotation: 90, mirrorX: true, offsetX: 60, offsetY: 20 });
});

test("toggling module mirror off restores the original owned-object layout", () => {
  const diagramModule = { id: "module", x: 100, y: 200, rotation: 0 };
  const template = { width: 100, height: 80 };
  const input = {
    module: diagramModule, template, nextMirrorX: true, nextMirrorY: false,
    platforms: [{ id: "platform", moduleId: "module", x: 170, y: 230, width: 20, height: 10, rotation: 0 }],
    labels: [{ id: "label", attachedToId: "module", x: 170, y: 240, rotation: 0, offsetX: 70, offsetY: 40 }],
    graphics: [{ id: "graphic", attachedToId: "module", x: 160, y: 220, width: 20, height: 20, rotation: 0, offsetX: 60, offsetY: 20 }],
  };
  const first = canvas.mirrorModuleOwnedObjects(input);
  const second = canvas.mirrorModuleOwnedObjects({
    ...input,
    module: { ...diagramModule, mirrorX: true },
    nextMirrorX: false,
    platforms: first.platforms,
    labels: first.labels,
    graphics: first.graphics,
  });
  assert.deepEqual(second.platforms[0].x, input.platforms[0].x);
  assert.deepEqual(second.platforms[0].y, input.platforms[0].y);
  assert.deepEqual(second.labels[0].x, input.labels[0].x);
  assert.deepEqual(second.graphics[0].mirrorX, false);
});

test("attached station labels follow cardinal and diagonal module directions without turning upside down", () => {
  assert.deepEqual(
    [0, 45, 90, 135, 180, 225, 270, 315].map(canvas.readableLabelRotation),
    [0, 45, 90, -45, 0, 45, 90, -45],
  );
});

test("every island platform keeps the standard twelve-pixel track clearance", () => {
  for (const template of TEMPLATES.values()) {
    const trackYs = template.tracks.filter((track) => track.y1 === track.y2).map((track) => track.y1).sort((a, b) => a - b);
    for (const platform of template.platforms.filter((item) => item.type === "island")) {
      const above = trackYs.filter((y) => y < platform.y).at(-1);
      const below = trackYs.find((y) => y > platform.y + platform.height);
      assert.notEqual(above, undefined, `${template.id} is missing an upper track`);
      assert.notEqual(below, undefined, `${template.id} is missing a lower track`);
      assert.equal(platform.y - above, 12, `${template.id} upper clearance`);
      assert.equal(below - (platform.y + platform.height), 12, `${template.id} lower clearance`);
    }
  }
});

test("custom double-island spacing preserves the standard track clearance", () => {
  const doubleIsland = TEMPLATES.get("double_island");
  const template = templatesMod.makeCustomizedTemplate(doubleIsland, { islandGap: 48 });
  assert.equal(template.height, 144);
  assert.deepEqual(template.tracks.map((track) => track.y1), [20, 60, 84, 124]);
  assert.deepEqual(template.platforms.map((platform) => platform.y), [32, 96]);
  for (const platform of template.platforms) {
    const tracks = template.tracks.map((track) => track.y1);
    const above = tracks.filter((y) => y < platform.y).at(-1);
    const below = tracks.find((y) => y > platform.y + platform.height);
    assert.equal(platform.y - above, 12);
    assert.equal(below - (platform.y + platform.height), 12);
  }
});

test("station platform length/width params re-center platforms while keeping default geometry", () => {
  for (const id of ["side_platform", "island_platform", "spanish_platform"]) {
    const base = TEMPLATES.get(id);
    const lenParam = base.params.find((p) => p.key === "platformLength");
    const widthParam = base.params.find((p) => p.key === "platformWidth");
    assert.ok(lenParam, `${id} 有站台长度参数`);
    assert.equal(lenParam.default, 160, `${id} 默认站台长度 160`);
    assert.equal(widthParam.default, 16, `${id} 默认站台宽度 16`);

    // 默认参数下几何与静态基准一致（新增参数不改变默认放置结果）
    const defaults = templatesMod.makeCustomizedTemplate(base, Object.fromEntries(base.params.map((p) => [p.key, p.default])));
    assert.deepEqual(
      defaults.platforms.map((p) => [Math.round(p.x), Math.round(p.y), Math.round(p.width), Math.round(p.height)]),
      base.platforms.map((p) => [p.x, p.y, p.width, p.height]),
      `${id} 默认参数平台几何与静态基准一致`,
    );

    // platformLength=200：平台水平居中、宽度拉长，轨道不受影响
    const stretched = templatesMod.makeCustomizedTemplate(base, { spacing: 40, platformLength: 200, platformWidth: 16 });
    for (const platform of stretched.platforms) {
      assert.equal(platform.width, 200, `${id} 平台宽度=200`);
      assert.equal(Math.round(platform.x), Math.round((stretched.width - 200) / 2), `${id} 平台水平居中 x=${platform.x}`);
    }
    assert.equal(stretched.tracks.length, base.tracks.length, `${id} 轨道数量不变`);

    // platformWidth=24：平台厚度拉高
    const thick = templatesMod.makeCustomizedTemplate(base, { spacing: 40, platformLength: 160, platformWidth: 24 });
    for (const platform of thick.platforms) assert.equal(platform.height, 24, `${id} 平台厚度=24`);
  }
});

// transferLineEligibility was removed as part of transfer group simplification

test("widenable switch params keep geometry inside the template bounds", () => {
  // 参数范围放宽：length 40-300、spacing 10-128
  const singleCrossover = TEMPLATES.get("single_crossover");
  const lengthParam = singleCrossover.params.find((param) => param.key === "length");
  const spacingParam = singleCrossover.params.find((param) => param.key === "spacing");
  assert.equal(lengthParam.min, 40);
  assert.equal(lengthParam.max, 300);
  assert.equal(spacingParam.min, 10);
  assert.equal(spacingParam.max, 128);

  // 大 spacing 时几何自适应：轨道/端口不超出模板上下边界
  const wide = templatesMod.makeCustomizedTemplate(singleCrossover, { length: 300, spacing: 128 });
  const ys = [...wide.tracks.flatMap((track) => [track.y1, track.y2]), ...wide.ports.map((port) => port.y)];
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  assert.ok(minY >= 12, `spacing=128 时轨道不越顶，实际 minY=${minY}`);
  assert.ok(maxY <= wide.height - 12, `spacing=128 时轨道不越底，maxY=${maxY} <= ${wide.height - 12}`);

  // 默认参数下几何与旧行为一致：upY=36 downY=76 height=112，不做自适应平移
  const defaultT = templatesMod.makeCustomizedTemplate(singleCrossover, { length: 100, spacing: 40 });
  assert.equal(defaultT.height, 112);
  assert.equal(defaultT.ports.find((port) => port.id === "L_up").y, 36);
  assert.equal(defaultT.ports.find((port) => port.id === "L_dn").y, 76);
});

test("double-track fork templates split a double line into two double lines", () => {
  // 与既有分叉（单线/支线端口 direction 固定 0°）不同：一条双线（上下行）分成两条双线，
  // 支线对端口方向取斜段实际角度，连接切线与端口方向一致，所以连出去的支线是真实斜向的。
  for (const [id, name] of [
    ["double_fork_up", "双线斜上分叉"],
    ["double_fork_dn", "双线斜下分叉"],
  ]) {
    const tpl = TEMPLATES.get(id);
    assert.ok(tpl, `${id} 已注册`);
    assert.equal(tpl.name, name);
    assert.equal(tpl.ports.length, 6, `${id} 六个端口（左双线 + 直股对 + 支线对）`);
    assert.equal(tpl.tracks.length, 4, `${id} 四条轨道（双线直股 + 双线斜支）`);
    const lUp = tpl.ports.find((port) => port.id === "L_up1");
    const lDn = tpl.ports.find((port) => port.id === "L_dn1");
    assert.equal(lUp.role, "up_main");
    assert.equal(lDn.role, "down_main");
    assert.ok(lUp.y < lDn.y, `${id} 左侧双线上行在下行上方`);
    // 直股对水平，支线对斜向
    assert.equal(tpl.ports.find((port) => port.id === "R_up1").direction, 0);
    assert.equal(tpl.ports.find((port) => port.id === "R_dn1").direction, 0);
    const branchUp = tpl.ports.find((port) => port.id === "R_up2");
    const branchDn = tpl.ports.find((port) => port.id === "R_dn2");
    assert.equal(branchUp.direction, branchDn.direction, `${id} 支线对两端口平行同向`);
    assert.ok(![0, 90, 180, 270].includes(branchUp.direction), `${id} 支线方向是斜向`);
    assert.ok(branchUp.y < branchDn.y, `${id} 支线对仍保持上行在下行上方`);
  }
  const y = TEMPLATES.get("double_fork_y");
  assert.ok(y, "double_fork_y 已注册");
  assert.equal(y.name, "双线Y形分叉");
  assert.equal(y.ports.length, 6, "Y形 六个端口（双线一进二出）");
  assert.equal(y.tracks.length, 6, "Y形 六条轨道");
  const upperUp = y.ports.find((port) => port.id === "R_up1");
  const lowerUp = y.ports.find((port) => port.id === "R_up2");
  // 上支斜向上（270-360）、下支斜向下（0-90），且两支关于水平方向对称（夹角互补到 360）
  assert.ok(upperUp.direction > 270 && upperUp.direction < 360, `上支端口斜向上，实际 ${upperUp.direction}`);
  assert.ok(lowerUp.direction > 0 && lowerUp.direction < 90, `下支端口斜向下，实际 ${lowerUp.direction}`);
  assert.ok(Math.abs(upperUp.direction + lowerUp.direction - 360) <= 2, `上下支对称，上=${upperUp.direction} 下=${lowerUp.direction}`);
});

test("double-track fork branch pairs auto-pair by lane key", async () => {
  const connLogic = await server.ssrLoadModule("/app/wiring/connectionLogic.ts");
  for (const id of ["double_fork_up", "double_fork_dn", "double_fork_y"]) {
    const tpl = TEMPLATES.get(id);
    for (const upId of ["R_up1", "R_up2"]) {
      const upPort = tpl.ports.find((port) => port.id === upId);
      const partner = connLogic.findDoubleTrackPartner(tpl, upPort);
      assert.equal(partner?.id, upId.replace("up", "dn"), `${id} ${upId} 配对到 ${upId.replace("up", "dn")}（不串到另一对）`);
    }
    const lUp1 = tpl.ports.find((port) => port.id === "L_up1");
    assert.equal(connLogic.findDoubleTrackPartner(tpl, lUp1)?.id, "L_dn1", `${id} 左侧双线配对`);
  }
});

test("fork customized templates match static base at default params", () => {
  for (const id of ["double_fork_up", "double_fork_dn", "double_fork_y"]) {
    const base = TEMPLATES.get(id);
    const defaults = Object.fromEntries(base.params.map((p) => [p.key, p.default]));
    const tpl = templatesMod.makeCustomizedTemplate(base, defaults);
    assert.deepEqual(
      tpl.ports.map((port) => [port.id, port.x, port.y, port.direction]),
      base.ports.map((port) => [port.id, port.x, port.y, port.direction]),
      `${id} 端口与静态基准一致`,
    );
    assert.deepEqual(
      tpl.tracks.map((track) => [track.x1, track.y1, track.x2, track.y2]),
      base.tracks.map((track) => [track.x1, track.y1, track.x2, track.y2]),
      `${id} 轨道与静态基准一致`,
    );
  }
});

test("fork 统一使用像素开口幅度，不再暴露角度参数", () => {
  const expected = { double_fork_up: 64, double_fork_dn: 56, double_fork_y: 40 };
  for (const [id, opening] of Object.entries(expected)) {
    const base = TEMPLATES.get(id);
    const param = base.params.find((p) => p.key === "branchOffset");
    assert.ok(param, `${id} 有开口幅度参数`);
    assert.equal(param.label, "开口幅度");
    assert.equal(param.unit, "px");
    assert.equal(param.default, opening, `${id} 默认开口幅度 = ${opening}px`);
    const alignParam = base.params.find((p) => p.key === "alignBranchEnds");
    assert.equal(alignParam?.kind, "boolean", `${id} 提供端点补齐开关`);
    assert.equal(alignParam?.default, 0, `${id} 旧工程默认保留自然端点`);
    assert.equal(base.params.some((p) => p.key === "angle"), false, `${id} 不再出现角度参数`);
  }
  assert.equal(templatesMod.legacyForkAngleToOpening(26.2, 260), 64, "旧上分叉角度换算为等效 64px");
  assert.equal(templatesMod.legacyForkAngleToOpening(23.3, 260), 56, "旧下分叉角度换算为等效 56px");
  assert.equal(templatesMod.legacyForkAngleToOpening(17.1, 260), 40, "旧 Y 形角度换算为等效 40px");
});

test("fork 对齐模式重排整对支线，端点平齐且垂直线距严格等于设置值", () => {
  for (const id of ["double_fork_up", "double_fork_dn", "double_fork_y"]) {
    const base = TEMPLATES.get(id);
    const defaults = Object.fromEntries(base.params.map((p) => [p.key, p.default]));
    const natural = templatesMod.makeCustomizedTemplate(base, defaults);
    const aligned = templatesMod.makeCustomizedTemplate(base, { ...defaults, alignBranchEnds: 1 });
    const branchTracks = aligned.tracks.filter((track) => track.type === "branch");
    const naturalPairs = natural.tracks.filter((track) => track.type === "branch");

    assert.ok(naturalPairs.some((track, index) => index % 2 === 0 && track.x2 !== naturalPairs[index + 1]?.x2), `${id} 自然端点存在错位`);
    for (let index = 0; index < branchTracks.length; index += 2) {
      const first = branchTracks[index];
      const second = branchTracks[index + 1];
      assert.equal(first.x1, second.x1, `${id} 同组分叉点 X 对齐`);
      assert.equal(first.x2, second.x2, `${id} 同组端点 X 平齐`);
      assert.equal(second.y1 - first.y1, defaults.spacing, `${id} 分叉起点垂直线距为 ${defaults.spacing}px`);
      assert.equal(second.y2 - first.y2, defaults.spacing, `${id} 输出端点垂直线距为 ${defaults.spacing}px`);
      const cross = (first.x2 - first.x1) * (second.y2 - second.y1) - (first.y2 - first.y1) * (second.x2 - second.x1);
      assert.ok(Math.abs(cross) < 1e-6, `${id} 补齐后同组斜轨仍平行`);
      for (const track of [first, second]) {
        const port = aligned.ports.find((candidate) => candidate.x === track.x2 && candidate.y === track.y2);
        assert.ok(port, `${id} 补齐后的斜轨终点仍有连接端口`);
      }
    }
  }
});

test("fork 开口幅度移动支线端口，直股与输入端口保持固定", () => {
  for (const id of ["double_fork_up", "double_fork_dn", "double_fork_y"]) {
    const base = TEMPLATES.get(id);
    const defaults = Object.fromEntries(base.params.map((p) => [p.key, p.default]));
    const branchIds = id === "double_fork_y" ? ["R_up1", "R_dn1", "R_up2", "R_dn2"] : ["R_up2", "R_dn2"];
    const fixedIds = id === "double_fork_y" ? ["L_up1", "L_dn1"] : ["L_up1", "L_dn1", "R_up1", "R_dn1"];
    const defTpl = templatesMod.makeCustomizedTemplate(base, defaults);
    const openings = id === "double_fork_up" ? [48, 64, 76] : id === "double_fork_dn" ? [48, 80, 120] : [24, 40, 52];
    let lastBranchY = null;
    for (const branchOffset of openings) {
      const tpl = templatesMod.makeCustomizedTemplate(base, { ...defaults, branchOffset });
      for (const pid of fixedIds) {
        assert.equal(
          tpl.ports.find((p) => p.id === pid).y,
          defTpl.ports.find((p) => p.id === pid).y,
          `${id} 输入/直股端口 ${pid} 不随开口幅度移动`,
        );
      }
      const branchY = tpl.ports.filter((p) => branchIds.includes(p.id)).map((p) => p.y);
      if (lastBranchY) assert.notDeepEqual(branchY, lastBranchY, `${id} 开口幅度改变时支线端口移动`);
      lastBranchY = branchY;
    }
  }
});

test("fork 动态分叉点保持双线真实间距，方向与斜轨一致", () => {
  const lineDistance = (first, second) => {
    const dx = first.x2 - first.x1;
    const dy = first.y2 - first.y1;
    return Math.abs(dx * (second.y1 - first.y1) - dy * (second.x1 - first.x1)) / Math.hypot(dx, dy);
  };
  for (const id of ["double_fork_up", "double_fork_dn", "double_fork_y"]) {
    const base = TEMPLATES.get(id);
    const defaults = Object.fromEntries(base.params.map((p) => [p.key, p.default]));
    const openings = id === "double_fork_up" ? [48, 64, 76] : id === "double_fork_dn" ? [48, 80, 120] : [24, 40, 52];
    const heights = [];
    for (const branchOffset of openings) {
      const tpl = templatesMod.makeCustomizedTemplate(base, { ...defaults, branchOffset });
      heights.push(tpl.height);
      const branchTracks = tpl.tracks.filter((t) => t.type === "branch");
      for (const track of branchTracks) {
        const travel = Math.round(Math.atan2(track.y2 - track.y1, track.x2 - track.x1) * 180 / Math.PI);
        const normTravel = ((travel % 360) + 360) % 360;
        const atEnd = tpl.ports.find((p) => p.x === track.x2 && p.y === track.y2);
        assert.equal(atEnd.direction, normTravel, `${id} opening=${branchOffset}px 端口 ${atEnd.id} 方向与相接斜轨斜率一致`);
      }
      for (let index = 0; index < branchTracks.length; index += 2) {
        const first = branchTracks[index];
        const second = branchTracks[index + 1];
        const cross = (first.x2 - first.x1) * (second.y2 - second.y1) - (first.y2 - first.y1) * (second.x2 - second.x1);
        assert.ok(Math.abs(cross) < 1e-6, `${id} opening=${branchOffset}px 同组双线保持平行`);
        assert.ok(Math.abs(lineDistance(first, second) - defaults.spacing) < 1e-6, `${id} opening=${branchOffset}px 法向间距保持 ${defaults.spacing}px`);
        assert.notEqual(first.x1, second.x1, `${id} opening=${branchOffset}px 使用动态错开的分叉点`);
      }
      const ys = [...tpl.tracks.flatMap((t) => [t.y1, t.y2]), ...tpl.ports.map((p) => p.y)];
      assert.ok(Math.min(...ys) >= 0, `${id} opening=${branchOffset}px 轨道不越顶，minY=${Math.min(...ys)}`);
      assert.ok(Math.max(...ys) <= tpl.height - 12, `${id} opening=${branchOffset}px 轨道不越底`);
    }
    assert.ok(heights[1] >= heights[0], `${id} 开口增大模板不降低`);
  }
});

test("fork customized templates keep diagonal geometry in bounds", () => {
  for (const id of ["double_fork_up", "double_fork_dn", "double_fork_y"]) {
    const base = TEMPLATES.get(id);
    const hasOffset = base.params?.some((p) => p.key === "branchOffset");
    const tpl = templatesMod.makeCustomizedTemplate(base, { length: 200, spacing: 60, ...(hasOffset ? { branchOffset: 36 } : {}) });
    const ys = [...tpl.tracks.flatMap((track) => [track.y1, track.y2]), ...tpl.ports.map((port) => port.y)];
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    assert.ok(minY >= 12, `${id} 轨道不越顶，minY=${minY}`);
    assert.ok(maxY <= tpl.height - 12, `${id} 轨道不越底，maxY=${maxY} <= ${tpl.height - 12}`);
    const diagonal = tpl.ports.filter((port) => port.side === "right" && ![0, 90, 180, 270].includes(port.direction));
    assert.ok(diagonal.length >= 2, `${id} 右侧至少 2 个斜向端口，实际 ${diagonal.length}`);
  }
});

test("double-track forks fully separate the two output pairs", () => {
  const ys = (tpl, ids) => ids.map((id) => tpl.ports.find((p) => p.id === id).y);
  const pairDistance = (tpl, ids) => {
    const [first, second] = ids.map((id) => tpl.ports.find((p) => p.id === id));
    return Math.hypot(second.x - first.x, second.y - first.y);
  };

  const yBase = TEMPLATES.get("double_fork_y");
  const y = templatesMod.makeCustomizedTemplate(yBase, { length: 260, spacing: 40 });
  const yUpper = ys(y, ["R_up1", "R_dn1"]);
  const yLower = ys(y, ["R_up2", "R_dn2"]);
  assert.ok(yUpper[1] < yLower[0], "Y形上下两组输出不交叠");
  assert.ok(Math.abs(pairDistance(y, ["R_up1", "R_dn1"]) - 40) < 1e-6, "Y形上支端口欧氏间距保持 40px");
  assert.ok(Math.abs(pairDistance(y, ["R_up2", "R_dn2"]) - 40) < 1e-6, "Y形下支端口欧氏间距保持 40px");

  const upBase = TEMPLATES.get("double_fork_up");
  const up = templatesMod.makeCustomizedTemplate(upBase, { length: 260, spacing: 40 });
  const upBranch = ys(up, ["R_up2", "R_dn2"]);
  const upStraight = ys(up, ["R_up1", "R_dn1"]);
  assert.deepEqual(upStraight, [76, 116], "上分叉 直股对端口位置");
  assert.ok(upBranch[1] < upStraight[0], "上分叉支线对完全位于直股上方");
  assert.ok(Math.abs(pairDistance(up, ["R_up2", "R_dn2"]) - 40) < 1e-6, "上分叉支线端口保持 40px 间距");
  assert.equal(up.ports.find((port) => port.id === "L_up1").y, 76, "上分叉 输入不随角度移动");
  const upWide = templatesMod.makeCustomizedTemplate(upBase, { length: 260, spacing: 40, branchOffset: 76 });
  const upWideBranch = ys(upWide, ["R_up2", "R_dn2"]);
  assert.ok(upWideBranch[0] < upBranch[0], "上分叉增大开口后支线上移");
  assert.deepEqual(ys(upWide, ["R_up1", "R_dn1"]), [76, 116], "上分叉增大开口后直股不动");

  const dnBase = TEMPLATES.get("double_fork_dn");
  const dn = templatesMod.makeCustomizedTemplate(dnBase, { length: 260, spacing: 40 });
  const dnBranch = ys(dn, ["R_up2", "R_dn2"]);
  const dnStraight = ys(dn, ["R_up1", "R_dn1"]);
  assert.deepEqual(dnStraight, [36, 76], "下分叉 直股对保持标准 36/76");
  assert.ok(dnBranch[0] > dnStraight[1], "下分叉支线对完全位于直股下方");
  assert.ok(Math.abs(pairDistance(dn, ["R_up2", "R_dn2"]) - 40) < 1e-6, "下分叉支线端口保持 40px 间距");
  assert.equal(dn.ports.find((port) => port.id === "L_up1").y, 36, "下分叉 输入保持标准对齐");
  const dnWide = templatesMod.makeCustomizedTemplate(dnBase, { length: 260, spacing: 40, branchOffset: 120 });
  assert.ok(dnWide.height > dn.height, "下分叉增大开口后模板变高");
  assert.deepEqual(ys(dnWide, ["R_up1", "R_dn1"]), [36, 76], "下分叉增大开口后直股不动");

  const yWide = templatesMod.makeCustomizedTemplate(yBase, { length: 260, spacing: 40, branchOffset: 52 });
  assert.ok(yWide.height >= y.height, "Y形增大开口后模板不缩小");
  assert.deepEqual(ys(yWide, ["L_up1", "L_dn1"]), [52, 92], "Y形增大开口后输入不动");

  for (const id of ["double_fork_up", "double_fork_dn", "double_fork_y"]) {
    const base = TEMPLATES.get(id);
    const def = base.params.find((p) => p.key === "length").default;
    assert.ok(def >= 200, `${id} 默认长度 >= 200（比普通组件更长）`);
    assert.equal(base.width, def, `${id} 静态宽度 = 默认长度`);
  }
});

test("single-track section has one main track and no platform", () => {
  const tpl = TEMPLATES.get("single_track_section");
  assert.equal(tpl.name, "单线区间");
  assert.equal(tpl.tracks.length, 1);
  assert.equal(tpl.tracks[0].type, "main");
  assert.equal(tpl.tracks[0].y1, 40);
  assert.equal(tpl.tracks[0].y2, 40);
  assert.equal(tpl.ports.length, 2);
  assert.ok(tpl.ports.every((port) => port.y === 40), "左右端口与单线站台对齐（y=40）");
  assert.equal(tpl.platforms.length, 0);
});

test("standalone platform has no tracks or ports", () => {
  const tpl = TEMPLATES.get("single_platform");
  assert.equal(tpl.name, "单站台");
  assert.equal(tpl.tracks.length, 0);
  assert.equal(tpl.ports.length, 0);
  assert.equal(tpl.platforms.length, 1);
  assert.equal(tpl.platforms[0].type, "side");
});

test("section category orders standalone platform above single-track above double-track", () => {
  const grouped = templatesMod.templatesByCategory();
  const ids = grouped.section.map((tpl) => tpl.id);
  const platformIdx = ids.indexOf("single_platform");
  const singleIdx = ids.indexOf("single_track_section");
  const doubleIdx = ids.indexOf("double_track");
  assert.ok(platformIdx >= 0 && singleIdx >= 0 && doubleIdx >= 0, "三个模板都在区间与车站分类里");
  assert.ok(platformIdx < singleIdx, "单站台在单线区间上面");
  assert.ok(singleIdx < doubleIdx, "单线区间在双线区间上面");
});

test("raising a module shifts its owned platforms' zIndex so platforms can rise above lines", () => {
  const platforms = [
    { id: "p1", moduleId: "m1", zIndex: 0 },
    { id: "p2", moduleId: "m1", zIndex: 1 },
    { id: "p3", moduleId: "m2", zIndex: 0 },
    { id: "p4", moduleId: undefined, zIndex: 5 },
  ];
  const shifted = canvas.shiftOwnedPlatformZIndex(platforms, "m1", 6);
  assert.equal(shifted.find((p) => p.id === "p1").zIndex, 6);
  assert.equal(shifted.find((p) => p.id === "p2").zIndex, 7);
  assert.equal(shifted.find((p) => p.id === "p3").zIndex, 0, "其他模块的站台不动");
  assert.equal(shifted.find((p) => p.id === "p4").zIndex, 5, "独立站台不动");
  // delta 为 0 时保持原数组引用
  assert.equal(canvas.shiftOwnedPlatformZIndex(platforms, "m1", 0), platforms);
});

test("moving a module to another layer moves its owned platforms too", () => {
  const platforms = [
    { id: "p1", moduleId: "m1", layerId: "layer-track-main" },
    { id: "p2", moduleId: "m2", layerId: "layer-track-main" },
  ];
  const moved = canvas.moveOwnedPlatformLayer(platforms, "m1", "layer-bg");
  assert.equal(moved.find((p) => p.id === "p1").layerId, "layer-bg");
  assert.equal(moved.find((p) => p.id === "p2").layerId, "layer-track-main", "其他模块的站台不动");
});

test("moving a transfer group translates every member and its owned canvas objects", () => {
  const input = {
    modules: [
      { id: "m1", x: 100, y: 200 },
      { id: "m2", x: 300, y: 220 },
      { id: "outside", x: 600, y: 220 },
    ],
    platforms: [
      { id: "p1", moduleId: "m1", x: 120, y: 230 },
      { id: "p-out", moduleId: "outside", x: 620, y: 230 },
    ],
    labels: [
      { id: "l1", attachedToId: "m2", positionMode: "attached", x: 320, y: 180 },
      { id: "free", positionMode: "independent", x: 20, y: 20 },
    ],
    graphics: [
      { id: "g1", attachedToId: "m1", positionMode: "attached", x: 140, y: 170 },
    ],
    connections: [
      {
        id: "internal",
        fromModuleId: "m1",
        toModuleId: "m2",
        tracks: [{ x1: 180, y1: 236, x2: 300, y2: 236, cx: 240, cy: 220 }],
        controlPoints: [{ id: "cp", x: 240, y: 220 }],
        crossingPoints: [{ x: 250, y: 236 }],
      },
      {
        id: "external",
        fromModuleId: "m2",
        toModuleId: "outside",
        tracks: [],
        controlPoints: [{ id: "cp-out", x: 450, y: 240 }],
        crossingPoints: [],
      },
    ],
  };

  const moved = canvas.translateModuleGroup(input, ["m1", "m2"], 40, -20);
  assert.deepEqual(moved.modules.map(({ id, x, y }) => ({ id, x, y })), [
    { id: "m1", x: 140, y: 180 },
    { id: "m2", x: 340, y: 200 },
    { id: "outside", x: 600, y: 220 },
  ]);
  assert.deepEqual({ x: moved.platforms[0].x, y: moved.platforms[0].y }, { x: 160, y: 210 });
  assert.deepEqual({ x: moved.platforms[1].x, y: moved.platforms[1].y }, { x: 620, y: 230 });
  assert.deepEqual({ x: moved.labels[0].x, y: moved.labels[0].y }, { x: 360, y: 160 });
  assert.deepEqual({ x: moved.labels[1].x, y: moved.labels[1].y }, { x: 20, y: 20 });
  assert.deepEqual({ x: moved.graphics[0].x, y: moved.graphics[0].y }, { x: 180, y: 150 });
  assert.deepEqual(moved.connections[0].controlPoints[0], { id: "cp", x: 280, y: 200 });
  assert.deepEqual(moved.connections[0].crossingPoints[0], { x: 290, y: 216 });
  assert.deepEqual(moved.connections[0].tracks[0], { x1: 220, y1: 216, x2: 340, y2: 216, cx: 280, cy: 200 });
  assert.equal(moved.connections[1], input.connections[1], "a connection leaving the group keeps its manual guide points fixed");
});

test("moving a marquee selection translates every selected object exactly once", () => {
  const input = {
    modules: [
      { id: "m1", x: 100, y: 200 },
      { id: "m2", x: 300, y: 200 },
      { id: "outside", x: 600, y: 200 },
    ],
    platforms: [
      { id: "p1", moduleId: "m1", x: 110, y: 220 },
      { id: "free-platform", x: 40, y: 50 },
    ],
    labels: [
      { id: "l1", attachedToId: "m1", positionMode: "attached", x: 120, y: 180, offsetX: 20, offsetY: -20 },
      { id: "free-label", positionMode: "independent", x: 20, y: 30 },
    ],
    graphics: [
      { id: "g1", attachedToId: "m2", positionMode: "attached", x: 330, y: 170, offsetX: 30, offsetY: -30 },
    ],
    backgroundImages: [{ id: "bg", x: 10, y: 15 }],
    transferGroups: [],
    connections: [
      {
        id: "internal",
        fromModuleId: "m1",
        toModuleId: "m2",
        tracks: [{ x1: 180, y1: 236, x2: 300, y2: 236 }],
        controlPoints: [{ id: "cp", x: 240, y: 220 }],
        crossingPoints: [{ x: 250, y: 236 }],
      },
      {
        id: "external",
        fromModuleId: "m2",
        toModuleId: "outside",
        tracks: [],
        controlPoints: [{ id: "cp-out", x: 450, y: 220 }],
        crossingPoints: [],
      },
    ],
  };
  const selected = ["m1", "m2", "p1", "l1", "g1", "free-platform", "free-label", "bg", "internal"];
  const moved = canvas.translateCanvasSelection(input, selected, 25, -10);

  assert.deepEqual(moved.modules.map(({ id, x, y }) => ({ id, x, y })), [
    { id: "m1", x: 125, y: 190 },
    { id: "m2", x: 325, y: 190 },
    { id: "outside", x: 600, y: 200 },
  ]);
  assert.deepEqual({ x: moved.platforms[0].x, y: moved.platforms[0].y }, { x: 135, y: 210 }, "owned platform is not moved twice");
  assert.deepEqual({ x: moved.platforms[1].x, y: moved.platforms[1].y }, { x: 65, y: 40 });
  assert.deepEqual({ x: moved.labels[0].x, y: moved.labels[0].y, offsetX: moved.labels[0].offsetX, offsetY: moved.labels[0].offsetY }, { x: 145, y: 170, offsetX: 20, offsetY: -20 });
  assert.deepEqual({ x: moved.labels[1].x, y: moved.labels[1].y }, { x: 45, y: 20 });
  assert.deepEqual({ x: moved.graphics[0].x, y: moved.graphics[0].y }, { x: 355, y: 160 });
  assert.deepEqual({ x: moved.backgroundImages[0].x, y: moved.backgroundImages[0].y }, { x: 35, y: 5 });
  assert.deepEqual(moved.connections[0].controlPoints[0], { id: "cp", x: 265, y: 210 });
  assert.equal(moved.connections[1], input.connections[1], "connection leading outside the selection stays anchored");

  const childOnly = canvas.translateCanvasSelection(input, ["l1"], 10, 5);
  assert.deepEqual(
    { x: childOnly.labels[0].x, y: childOnly.labels[0].y, offsetX: childOnly.labels[0].offsetX, offsetY: childOnly.labels[0].offsetY },
    { x: 130, y: 185, offsetX: 30, offsetY: -15 },
    "moving an attached child alone updates its attachment offset",
  );
});

test("modifier selection normalizes selected child objects to their owner modules", () => {
  const owners = [
    { id: "platform-1", ownerModuleId: "module-1" },
    { id: "label-1", ownerModuleId: "module-1" },
    { id: "graphic-2", ownerModuleId: "module-2" },
    { id: "free-platform" },
  ];
  assert.deepEqual(canvas.toggleOwnedModuleSelection(["platform-1"], "module-2", owners), ["module-1", "module-2"]);
  assert.deepEqual(canvas.toggleOwnedModuleSelection(["label-1", "graphic-2"], "module-2", owners), ["module-1"]);
  assert.deepEqual(canvas.toggleOwnedModuleSelection(["free-platform"], "module-2", owners), ["free-platform", "module-2"]);
});

test("legacy projects migrate objects and connections to the first page", () => {
  const migrated = projectStore.migrateProjectSchema({
    schemaVersion: 1,
    projectInfo: { name: "旧工程", createdAt: "", updatedAt: "" },
    pages: [],
    layers: [],
    modules: [{ id: "m1", templateId: "t", name: "m", x: 0, y: 0, rotation: 0, lineIds: [], sourceStationIds: [], locked: false, layerId: "layer-track-main", zIndex: 0 }],
    connections: [{ id: "c1", fromModuleId: "m1", fromPortId: "a", toModuleId: "m2", toPortId: "b", tracks: [] }],
    backgroundImages: [], labels: [], servicePatterns: [], transferGroups: [], viewport: { panX: 1, panY: 2, scale: 1 },
  });
  assert.equal(migrated.pages[0].id, "page-1");
  assert.equal(migrated.modules[0].pageId, "page-1");
  assert.deepEqual(
    { pageId: migrated.connections[0].pageId, layerId: migrated.connections[0].layerId, zIndex: migrated.connections[0].zIndex },
    { pageId: "page-1", layerId: "layer-track-main", zIndex: 0 },
  );
});

// 模拟 placeModule 生成的岛式站：1 个站台、中文站名标签、站点图标。
function buildIslandStationObjects() {
  const island = TEMPLATES.get("island_platform");
  const module = { id: "m1", templateId: "island_platform", name: "站", x: 300, y: 200, rotation: 0, lineIds: [], sourceStationIds: ["s1"], locked: false, layerId: "layer-track-main", zIndex: 0, pageId: "page-1" };
  const layout = island.platforms[0];
  const center = { x: module.x + layout.x + layout.width / 2, y: module.y + layout.y + layout.height / 2 };
  const platform = {
    id: "p1", moduleId: "m1", sourceStationId: "s1", sourceLineId: "L1", platformType: layout.type, attachedTrackIds: [],
    x: center.x - layout.width / 2, y: center.y - layout.height / 2, width: layout.width, height: layout.height,
    rotation: 0, fill: "#D7B06A", label: layout.label, layerId: "layer-track-main", zIndex: 0, pageId: "page-1", visible: true, locked: false,
  };
  const zhLabel = {
    id: "l1", text: "站名", x: module.x + 90, y: module.y + 40, fontSize: 13, anchor: "top", rotation: 0, fill: "#202124", fontWeight: 700,
    backgroundMask: true, maskStrokeWidth: 3, locked: false, visible: true, layerId: "layer-label", zIndex: 0, pageId: "page-1",
    attachedToId: "m1", positionMode: "attached", offsetX: 90, offsetY: 40, sourceStationId: "s1", language: "zh",
  };
  // 英文站名按新逻辑放在模板 "Station" 标签位置（站台下方 y=100），而不是旧的中文名下方 16px
  const enLabel = { ...zhLabel, id: "l2", text: "Station", x: module.x + 90, y: module.y + 100, fontSize: 9, fontWeight: 400, offsetY: 100, language: "en" };
  const icon = {
    id: "g1", assetId: "a1", attachedToId: "m1", positionMode: "attached", offsetX: 74, offsetY: -42,
    x: module.x + 74, y: module.y - 42, width: 32, height: 32, rotation: 0, opacity: 1, layerId: "layer-icon", zIndex: 0, pageId: "page-1", visible: true, locked: false,
  };
  return { island, module, platform, zhLabel, enLabel, icon };
}

// 自动避让：断言一组元素（标签/图标）两两之间不再重叠（padding 0）。
function assertNoPairOverlap(items, getBox) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      assert.equal(
        avoidance.bboxesOverlap(getBox(items[i]), getBox(items[j]), 0),
        false,
        `仍存在重叠：${items[i].id} 与 ${items[j].id}`,
      );
    }
  }
}
const itemBox = (item) => (item.text === undefined ? avoidance.computeGraphicBbox(item) : avoidance.computeLabelBbox(item));
function nearlyEqual(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `期望 ${actual} ≈ ${expected}`);
}

test("template switch rebuilds owned platforms, labels and icon from the new template", () => {
  const side = TEMPLATES.get("side_platform"); // 2 个站台
  const island = TEMPLATES.get("island_platform");
  const { module, platform, zhLabel, enLabel, icon } = buildIslandStationObjects();
  const updated = { ...module, templateId: "side_platform" };
  // 标签放在 island 模板真实锚点上（fixture 的 offsetY 40 与模板 站名(y=30) 有 10px 偏差，
  // 用真实锚点才能验证"切换模板后站名跟随新模板锚点"；位移保留由下面的 45° 用例单独覆盖）
  const zhAtAnchor = { ...zhLabel, x: module.x + island.labels[0].x, y: module.y + island.labels[0].y, offsetX: island.labels[0].x, offsetY: island.labels[0].y };
  const enAtAnchor = { ...enLabel, x: module.x + island.labels[1].x, y: module.y + island.labels[1].y, offsetX: island.labels[1].x, offsetY: island.labels[1].y };
  let seq = 0;
  const relaid = canvas.relayoutModuleOwnedObjects({
    module: updated, nextTemplate: side, previousTemplate: island,
    platforms: [platform], labels: [zhAtAnchor, enAtAnchor], graphics: [icon],
    nextId: () => `new-${seq++}`,
  });

  // 站台数量 1 → 2，位置/大小与 side_platform 布局完全一致（相对模块原点）
  assert.equal(relaid.platforms.length, 2);
  for (let i = 0; i < 2; i++) {
    const layout = side.platforms[i];
    assert.deepEqual(
      { x: relaid.platforms[i].x - updated.x, y: relaid.platforms[i].y - updated.y, width: relaid.platforms[i].width, height: relaid.platforms[i].height },
      { x: layout.x, y: layout.y, width: layout.width, height: layout.height },
    );
    assert.equal(relaid.platforms[i].layerId, "layer-platform-normal");
  }
  // 来源绑定保留（新站台继承旧站台的 sourceStationId/sourceLineId）
  assert.equal(relaid.platforms[0].sourceStationId, "s1");
  assert.equal(relaid.platforms[1].sourceStationId, "s1");
  assert.equal(relaid.platforms[1].sourceLineId, "L1");
  // 站名标签移到 side_platform 的"站名"锚点，英文用模板 "Station" 锚点（站台下方，不再压站台）
  assert.deepEqual({ x: relaid.labels[0].x - updated.x, y: relaid.labels[0].y - updated.y }, { x: side.labels[0].x, y: side.labels[0].y });
  assert.deepEqual({ x: relaid.labels[1].x - updated.x, y: relaid.labels[1].y - updated.y }, { x: side.labels[1].x, y: side.labels[1].y });
  // 站点图标移到新模板图标锚点 (宽/2, -26)
  assert.deepEqual({ x: relaid.graphics[0].x + 16 - updated.x, y: relaid.graphics[0].y + 16 - updated.y }, { x: side.width / 2, y: -26 });
});

test("template switch to fewer platforms drops the extra owned platforms", () => {
  const side = TEMPLATES.get("side_platform");
  const island = TEMPLATES.get("island_platform");
  const { module } = buildIslandStationObjects();
  const sideLayouts = side.platforms.map((layout) => ({ x: 300 + layout.x, y: 200 + layout.y, width: layout.width, height: layout.height }));
  const platforms = sideLayouts.map((layout, i) => ({
    id: `p${i}`, moduleId: "m1", sourceStationId: "s1", platformType: "side", attachedTrackIds: [], x: layout.x, y: layout.y,
    width: layout.width, height: layout.height, rotation: 0, fill: "#D7B06A", layerId: "layer-track-main", zIndex: i, pageId: "page-1", visible: true, locked: false,
  }));
  const relaid = canvas.relayoutModuleOwnedObjects({
    module: { ...module, templateId: "island_platform" }, nextTemplate: island, previousTemplate: side,
    platforms, labels: [], graphics: [], nextId: () => "new",
  });
  assert.equal(relaid.platforms.length, 1);
  assert.equal(relaid.platforms[0].width, island.platforms[0].width);
  assert.equal(relaid.platforms[0].height, island.platforms[0].height);
  assert.equal(relaid.platforms[0].sourceStationId, "s1");
});

test("template switch preserves existing manual platform layers and classifies new platforms", () => {
  const side = TEMPLATES.get("side_platform");
  const { island, module, platform } = buildIslandStationObjects();
  const custom = { ...platform, layerId: "custom-platform-layer" };
  const relaid = canvas.relayoutModuleOwnedObjects({
    module: { ...module, templateId: "side_platform" }, nextTemplate: side, previousTemplate: island,
    platforms: [custom], labels: [], graphics: [], nextId: () => "new",
  });
  assert.equal(relaid.platforms[0].layerId, "custom-platform-layer");
  assert.equal(relaid.platforms[1].layerId, "layer-platform-normal");
});

test("relayout keeps a displaced 45° station label in place on a param edit (same template)", () => {
  const island = TEMPLATES.get("island_platform");
  const { module, platform, zhLabel, enLabel } = buildIslandStationObjects();
  const rotated = { ...module, rotation: 45 };
  // 45° 旋转下 island 模板"站名"(90,30) / "Station"(90,100) 锚点的世界坐标
  const anchorWorld = (localX, localY) => {
    const radians = (45 * Math.PI) / 180;
    const pivot = { x: rotated.x + island.width / 2, y: rotated.y + island.height / 2 };
    const dx = rotated.x + localX - pivot.x;
    const dy = rotated.y + localY - pivot.y;
    return { x: pivot.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: pivot.y + dx * Math.sin(radians) + dy * Math.cos(radians) };
  };
  const zhAnchor = anchorWorld(island.labels[0].x, island.labels[0].y);
  const enAnchor = anchorWorld(island.labels[1].x, island.labels[1].y);
  // 自动避让/手动拖动把斜向站名从锚点推开 (12, -8)
  const movedZh = { ...zhLabel, rotation: 45, x: zhAnchor.x + 12, y: zhAnchor.y - 8, offsetX: zhAnchor.x + 12 - rotated.x, offsetY: zhAnchor.y - 8 - rotated.y };
  const movedEn = { ...enLabel, rotation: 45, x: enAnchor.x + 12, y: enAnchor.y - 8, offsetX: enAnchor.x + 12 - rotated.x, offsetY: enAnchor.y - 8 - rotated.y };
  const relaid = canvas.relayoutModuleOwnedObjects({
    module: rotated, nextTemplate: island, previousTemplate: island,
    platforms: [platform], labels: [movedZh, movedEn], graphics: [],
    nextId: () => "new",
  });
  // 编辑元件（参数变化）不应把斜向站名弹回模板锚点，应保持位移
  nearlyEqual(relaid.labels[0].x, movedZh.x);
  nearlyEqual(relaid.labels[0].y, movedZh.y);
  nearlyEqual(relaid.labels[1].x, movedEn.x);
  nearlyEqual(relaid.labels[1].y, movedEn.y);
  assert.equal(relaid.labels[0].rotation, 45);
  // offset 与所属模块同步（平移模块时标签跟随）
  nearlyEqual(relaid.labels[0].offsetX, movedZh.x - rotated.x);
  nearlyEqual(relaid.labels[0].offsetY, movedZh.y - rotated.y);
});

test("relayout preserves a displaced 45° label offset when switching templates", () => {
  const island = TEMPLATES.get("island_platform");
  const side = TEMPLATES.get("side_platform");
  const { module, platform, zhLabel, enLabel } = buildIslandStationObjects();
  const rotated = { ...module, rotation: 45, templateId: "side_platform" };
  // 位移 (12, -8) 相对 island 锚点；side_platform 新锚点：站名(90,14)、Station(90,105)
  const zhAtAnchor = { ...zhLabel, rotation: 45, x: 390 + 18.384776, y: 256 - 18.384776, offsetX: 108.384776, offsetY: 37.615224 };
  const enAtAnchor = { ...enLabel, rotation: 45, x: 390 - 31.112698, y: 256 + 31.112698, offsetX: 58.887302, offsetY: 87.112698 };
  const movedZh = { ...zhAtAnchor, x: zhAtAnchor.x + 12, y: zhAtAnchor.y - 8, offsetX: zhAtAnchor.x + 12 - rotated.x, offsetY: zhAtAnchor.y - 8 - rotated.y };
  const movedEn = { ...enAtAnchor, x: enAtAnchor.x + 12, y: enAtAnchor.y - 8, offsetX: enAtAnchor.x + 12 - rotated.x, offsetY: enAtAnchor.y - 8 - rotated.y };
  const relaid = canvas.relayoutModuleOwnedObjects({
    module: rotated, nextTemplate: side, previousTemplate: island,
    platforms: [platform], labels: [movedZh, movedEn], graphics: [],
    nextId: () => "new",
  });
  // 新位置 = side 新锚点 + 相对 island 锚点的位移（12, -8）
  nearlyEqual(relaid.labels[0].x, 390 + 29.698485 + 12);
  nearlyEqual(relaid.labels[0].y, 256 - 29.698485 - 8);
  nearlyEqual(relaid.labels[1].x, 390 - 34.648232 + 12);
  nearlyEqual(relaid.labels[1].y, 256 + 34.648232 - 8);
  assert.equal(relaid.labels[0].rotation, 45);
});

// ─── 自动避让 ───────────────────────────────────────────────

test("auto-avoidance leaves a clean single station untouched", () => {
  const { module, zhLabel, enLabel, icon } = buildIslandStationObjects();
  const labels = [zhLabel, enLabel];
  const graphics = [icon];
  const result = avoidance.resolveLabelIconOverlaps({ modules: [module], labels, graphics, activePageId: "page-1" });
  assert.equal(result.changed, false);
  assert.deepEqual(result.patches, []);
  assert.equal(result.labels, labels);   // 原数组引用，未新建
  assert.equal(result.graphics, graphics);
});

test("auto-avoidance pushes an icon out of a station-name label", () => {
  const { module, zhLabel, enLabel, icon } = buildIslandStationObjects();
  const movedIcon = { ...icon, x: icon.x, y: 194 }; // 图标下移，压住中文站名
  const result = avoidance.resolveLabelIconOverlaps({
    modules: [module], labels: [zhLabel, enLabel], graphics: [movedIcon], activePageId: "page-1",
  });
  assert.equal(result.changed, true);
  assert.equal(result.patches.length, 1);
  assert.equal(result.patches[0].id, "g1");
  assert.equal(result.patches[0].kind, "icon");
  const patched = result.graphics[0];
  assert.equal(patched.x, 374);
  nearlyEqual(patched.y, 185.8); // 图标被推回站名上方，保留 4px 间隙
  assert.equal(patched.offsetX, 74);
  nearlyEqual(patched.offsetY, -14.2);
  // 新位置与中文/英文站名都不重叠
  assert.equal(avoidance.bboxesOverlap(itemBox(patched), itemBox(result.labels[0]), 0), false);
  assert.equal(avoidance.bboxesOverlap(itemBox(patched), itemBox(result.labels[1]), 0), false);
  // 未移动的标签原样保留
  assert.equal(result.labels[0], zhLabel);
  assert.equal(result.labels[1], enLabel);
});

test("auto-avoidance includes attached template labels without a source station", () => {
  const { module, zhLabel, icon } = buildIslandStationObjects();
  const { sourceStationId: _sourceStationId, ...templateLabel } = zhLabel;
  const result = avoidance.resolveLabelIconOverlaps({
    modules: [module],
    labels: [{ ...templateLabel, text: "站名" }],
    graphics: [{ ...icon, x: 378, y: 222 }],
    activePageId: "page-1",
  });
  assert.equal(result.changed, true);
  assert.ok(result.patches.some((patch) => patch.id === icon.id));
});

test("auto-avoidance separates overlapping elements at a transfer station", () => {
  // 第二个模块共享 sourceStationId，与第一个模块并排：图标对与英文站名对相互压住
  const first = buildIslandStationObjects();
  const secondModule = { ...first.module, id: "m2", x: 330, sourceStationIds: ["s1"], zIndex: 1 };
  const zh2 = { ...first.zhLabel, id: "l3", x: 420, y: 240, offsetX: 120, offsetY: 40 };
  const en2 = { ...first.enLabel, id: "l4", x: 420, y: 300, offsetX: 120, offsetY: 100 };
  const icon2 = { ...first.icon, id: "g2", x: 404, y: 158, offsetX: 104, offsetY: -42 };
  const result = avoidance.resolveLabelIconOverlaps({
    modules: [first.module, secondModule],
    labels: [first.zhLabel, first.enLabel, zh2, en2],
    graphics: [first.icon, icon2],
    activePageId: "page-1",
  });
  assert.equal(result.changed, true);
  assert.equal(result.patches.length, 4); // 英文站名 ×2 + 图标 ×2
  // 全场景两两不再重叠
  assertNoPairOverlap([...result.labels, ...result.graphics], itemBox);
  // 中文站名保持原位
  assert.equal(result.labels[0], first.zhLabel);
  assert.equal(result.labels[2], zh2);
  // 两个图标各自推开 3px（同优先级各移一半），互留 4px 间隙
  const g1 = result.graphics.find((g) => g.id === "g1");
  const g2 = result.graphics.find((g) => g.id === "g2");
  nearlyEqual(g1.x, 371);
  nearlyEqual(g2.x, 407);
  assert.equal(g1.y, 158);
  assert.equal(g2.y, 158);
});

test("auto-avoidance never moves locked elements", () => {
  const { module, zhLabel, icon } = buildIslandStationObjects();
  const lockedIcon = { ...icon, id: "g-lock", locked: true, x: 378, y: 222 }; // 锁定的图标压在中文站名上
  const result = avoidance.resolveLabelIconOverlaps({
    modules: [module], labels: [zhLabel], graphics: [lockedIcon], activePageId: "page-1",
  });
  assert.equal(result.changed, true);
  assert.equal(result.graphics[0], lockedIcon); // 锁定图标原样保留
  const zh = result.labels[0];
  assert.equal(zh.x, 390);
  nearlyEqual(zh.y, 218); // 中文站名上移，避开锁定图标
  assert.equal(avoidance.bboxesOverlap(itemBox(zh), { x: 378, y: 222, w: 32, h: 32 }, 0), false);
});

test("auto-avoidance treats independent labels as immovable obstacles", () => {
  const { module, zhLabel } = buildIslandStationObjects();
  // 用户解耦成"独立"的站名：保留 sourceStationId，成为不可移动的障碍
  const independentZh = { ...zhLabel, id: "l-ind", positionMode: "independent", attachedToId: undefined, offsetX: 0, offsetY: 0, x: 385, y: 230 };
  const result = avoidance.resolveLabelIconOverlaps({
    modules: [module], labels: [independentZh, zhLabel], graphics: [], activePageId: "page-1",
  });
  assert.equal(result.changed, true);
  assert.equal(result.labels[0], independentZh); // 独立标签原样保留
  const zh = result.labels.find((label) => label.id === "l1");
  assert.equal(zh.x, 390);
  nearlyEqual(zh.y, 252.2); // 附属中文站名被推开，互留 4px 间隙
  assert.equal(avoidance.bboxesOverlap(itemBox(independentZh), itemBox(zh), 0), false);
});

test("auto-avoidance resolves overlap after a label rotation", () => {
  const { module, zhLabel, enLabel, icon } = buildIslandStationObjects();
  // 旋转 90° 的站名：bbox 从「锚点上方横排」变为「锚点右侧竖排」
  const rotatedZh = { ...zhLabel, rotation: 90 };
  const rotatedIcon = { ...icon, rotation: 90, x: 374, y: 200 }; // 与旋转后的站名重叠
  const result = avoidance.resolveLabelIconOverlaps({
    modules: [module], labels: [rotatedZh, enLabel], graphics: [rotatedIcon], activePageId: "page-1",
  });
  const zhBox = avoidance.computeLabelBbox(rotatedZh);
  nearlyEqual(zhBox.x, 390);
  nearlyEqual(zhBox.y, 227);
  nearlyEqual(zhBox.w, 18.2); // 旋转 90° 后：原高度(18.2)变宽
  nearlyEqual(zhBox.h, 26);   // 原 CJK 宽度（2 汉字 × 13px）变高
  assert.equal(result.changed, true);
  const patched = result.graphics[0];
  assert.equal(patched.x, 374);
  nearlyEqual(patched.y, 191); // 图标沿旋转后的 bbox 边缘被推开
  assert.equal(avoidance.bboxesOverlap(itemBox(patched), zhBox, 0), false);
});

test("auto-avoidance leaves a clean island station (with platform) untouched", () => {
  // 修复后：英文站名放在模板 "Station" 位置（站台下方），加上平台障碍物后依然无重叠
  const { module, zhLabel, enLabel, icon, platform } = buildIslandStationObjects();
  const result = avoidance.resolveLabelIconOverlaps({
    modules: [module], labels: [zhLabel, enLabel], graphics: [icon], platforms: [platform], activePageId: "page-1",
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.patches, []);
  assert.equal(result.labels[0], zhLabel);
  assert.equal(result.labels[1], enLabel);
});

test("auto-avoidance pushes a station label off its platform", () => {
  // 旧版/手动拖到站台上的英文站名（压在平台 [310,408]×[248,264] 上）应被推开，平台保持原位
  const { module, platform } = buildIslandStationObjects();
  const onPlatform = {
    id: "l-en", text: "Station", x: module.x + 90, y: module.y + 56, fontSize: 9, anchor: "top", rotation: 0, fill: "#202124", fontWeight: 400,
    backgroundMask: true, maskStrokeWidth: 3, locked: false, visible: true, layerId: "layer-label", zIndex: 0, pageId: "page-1",
    attachedToId: "m1", positionMode: "attached", offsetX: 90, offsetY: 56, sourceStationId: "s1", language: "en",
  };
  const result = avoidance.resolveLabelIconOverlaps({
    modules: [module], labels: [onPlatform], graphics: [], platforms: [platform], activePageId: "page-1",
  });
  assert.equal(result.changed, true);
  assert.equal(result.patches.length, 1);
  const en = result.labels[0];
  // 标签 bbox 与平台不再重叠（上下任一方向推开都可）
  assert.equal(avoidance.bboxesOverlap(itemBox(en), avoidance.computePlatformBbox(platform), 0), false);
});

test("auto-avoidance frees a legacy english name squeezed between zh label and platform", () => {
  // 旧图纸：英文名按旧逻辑硬编码在中文名下方 16px（y+56），对岛式站恰好压在站台上，
  // 上方是中文站名、下方是站台，上下两个方向都被堵死——单轴推挤会在两堵墙之间反复弹跳。
  // 四向转角逃生应把英文名推到站台下方（模板设计区），彻底解围。
  const { module, zhLabel, icon, platform } = buildIslandStationObjects();
  const legacyEn = { ...zhLabel, id: "l2", text: "Station", x: module.x + 90, y: module.y + 56, fontSize: 9, fontWeight: 400, offsetY: 56, language: "en" };
  const result = avoidance.resolveLabelIconOverlaps({
    modules: [module], labels: [zhLabel, legacyEn], graphics: [icon], platforms: [platform], activePageId: "page-1",
  });
  assert.equal(result.changed, true);
  const en = result.labels.find((label) => label.id === "l2");
  // 英文名必须彻底落到站台下方（平台矩形 [310,470]×[248,264] 底部之下），而不是留在缝隙里
  assert.ok(en.y > 264, `英文名应被推到站台下方（y>264），实际 y=${en.y}`);
  assertNoPairOverlap([...result.labels, ...result.graphics], itemBox);
  for (const o of [...result.labels, ...result.graphics]) {
    assert.equal(avoidance.bboxesOverlap(itemBox(o), avoidance.computePlatformBbox(platform), 0), false);
  }
  // 中文站名保持原位，平台保持原位
  assert.equal(result.labels[0], zhLabel);
});

test("auto-avoidance pushes an icon off a platform", () => {
  const { module, platform } = buildIslandStationObjects();
  const icon = {
    id: "g-on", assetId: "a1", attachedToId: "m1", positionMode: "attached", offsetX: 60, offsetY: 50,
    x: module.x + 60, y: module.y + 50, width: 32, height: 32, rotation: 0, opacity: 1, layerId: "layer-icon", zIndex: 0, pageId: "page-1", visible: true, locked: false,
  };
  const result = avoidance.resolveLabelIconOverlaps({
    modules: [module], labels: [], graphics: [icon], platforms: [platform], activePageId: "page-1",
  });
  assert.equal(result.changed, true);
  const g = result.graphics[0];
  assert.equal(avoidance.bboxesOverlap(itemBox(g), avoidance.computePlatformBbox(platform), 0), false);
});

test("auto-avoidance never moves platforms even when they overlap", () => {
  const { module, platform } = buildIslandStationObjects();
  const p2 = { ...platform, id: "p2", x: platform.x + 60, y: platform.y }; // 与 p1 重叠
  const result = avoidance.resolveLabelIconOverlaps({
    modules: [module], labels: [], graphics: [], platforms: [platform, p2], activePageId: "page-1",
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.patches, []);
});

test("label bbox uses CJK-aware width", () => {
  const { module } = buildIslandStationObjects();
  const zh = { text: "人民广场", x: 390, y: 240, fontSize: 13, anchor: "top", rotation: 0 };
  const box = avoidance.computeLabelBbox(zh);
  nearlyEqual(box.w, 52);   // 4 个汉字 × 13px（不再按 0.6em 低估）
  nearlyEqual(box.h, 18.2);
  const en = { text: "Renmin Square", x: 390, y: 240, fontSize: 9, anchor: "top", rotation: 0 };
  const enBox = avoidance.computeLabelBbox(en);
  nearlyEqual(enBox.w, 63); // 12 个 ASCII × 0.56em + 1 空格 × 0.28em
});

test("label bbox follows the declared text anchor", () => {
  const base = { text: "AB", x: 100, y: 100, fontSize: 10, rotation: 0 };
  const top = avoidance.computeLabelBbox({ ...base, anchor: "top" });
  const bottom = avoidance.computeLabelBbox({ ...base, anchor: "bottom" });
  const left = avoidance.computeLabelBbox({ ...base, anchor: "left" });
  const right = avoidance.computeLabelBbox({ ...base, anchor: "right" });
  nearlyEqual(top.x, 90);
  nearlyEqual(top.y, 86);
  nearlyEqual(bottom.x, 90);
  nearlyEqual(bottom.y, 100);
  nearlyEqual(left.x, 80);
  nearlyEqual(left.y, 93);
  nearlyEqual(right.x, 100);
  nearlyEqual(right.y, 93);
});

test("label bbox falls back safely for legacy missing anchors", () => {
  const box = avoidance.computeLabelBbox({ text: "站名", x: 100, y: 100, fontSize: 13, anchor: undefined });
  nearlyEqual(box.x, 87);
  nearlyEqual(box.y, 81.8);
});

// ─── 画布模式 / 基准尺寸 / PS 式锚点缩放 ─────────────────────

test("new canvas defaults to infinite flow and records its base size", () => {
  const page = canvas.createCanvasPage({ id: "p", name: "画布", width: 1920, height: 1080 });
  assert.equal(page.flowMode, "infinite");
  assert.equal(page.baseWidth, 1920);
  assert.equal(page.baseHeight, 1080);
  const manual = canvas.createCanvasPage({ id: "pm", name: "手动", width: 2560, height: 1440, flowMode: "manual" });
  assert.equal(manual.flowMode, "manual");
  assert.equal(manual.baseWidth, 2560);
  const tiny = canvas.createCanvasPage({ id: "pt", name: "小", width: 10, height: 10 });
  assert.equal(tiny.baseWidth, 320, "base 同样受最小尺寸约束");
  assert.equal(tiny.baseHeight, 320);
});

test("updateCanvasPage syncs base size when width or height is patched (single-side edit)", () => {
  const page = canvas.createCanvasPage({ id: "p", name: "画布", width: 1000, height: 800 });
  const widened = canvas.updateCanvasPage([page], "p", { width: 1200 });
  assert.equal(widened[0].width, 1200);
  assert.equal(widened[0].baseWidth, 1200, "只改宽度时 baseWidth 跟随");
  assert.equal(widened[0].baseHeight, 800, "高度未改则 baseHeight 保持当前高度（不是 0）");
  const shortened = canvas.updateCanvasPage(widened, "p", { height: 500 });
  assert.equal(shortened[0].baseHeight, 500, "只改高度时 baseHeight 跟随");
  assert.equal(shortened[0].baseWidth, 1200);
});

test("canvas resize transform keeps the chosen anchor fixed and renormalizes the origin", () => {
  const page = canvas.createCanvasPage({ id: "p", name: "画布", width: 1000, height: 800 });
  // 左上锚点：原点不动
  const topLeft = canvas.computeCanvasResizeTransform(page, 800, 600, 0);
  assert.deepEqual(topLeft, { width: 800, height: 600, offsetX: 0, offsetY: 0, rect: { x: 0, y: 0, width: 800, height: 600 } });
  // 中心锚点：新画布矩形相对旧画布居中，内容沿左上回移（offset 负）
  const center = canvas.computeCanvasResizeTransform(page, 800, 600, 4);
  assert.deepEqual(center.rect, { x: 100, y: 100, width: 800, height: 600 });
  assert.deepEqual({ offsetX: center.offsetX, offsetY: center.offsetY }, { offsetX: -100, offsetY: -100 });
  // 右下锚点：固定右下角，缩小后原点向右上收缩
  const bottomRight = canvas.computeCanvasResizeTransform(page, 800, 600, 8);
  assert.deepEqual(bottomRight.rect, { x: 200, y: 200, width: 800, height: 600 });
  assert.deepEqual({ offsetX: bottomRight.offsetX, offsetY: bottomRight.offsetY }, { offsetX: -200, offsetY: -200 });
  // 右下锚点放大：新画布向左上扩展，内容向右下平移
  const grow = canvas.computeCanvasResizeTransform(page, 1200, 1000, 8);
  assert.deepEqual(grow.rect, { x: -200, y: -200, width: 1200, height: 1000 });
  assert.deepEqual({ offsetX: grow.offsetX, offsetY: grow.offsetY }, { offsetX: 200, offsetY: 200 });
  // 上锚点：水平居中，垂直固定
  const top = canvas.computeCanvasResizeTransform(page, 800, 600, 1);
  assert.deepEqual(top.rect, { x: 100, y: 0, width: 800, height: 600 });
  // 最小尺寸约束
  assert.equal(canvas.computeCanvasResizeTransform(page, 1, 1, 0).width, 320);
  assert.equal(canvas.computeCanvasResizeTransform(page, 1, 1, 0).height, 320);
});

test("createResizedCanvasPage returns a manual-mode page at the new size", () => {
  const page = canvas.createCanvasPage({ id: "p", name: "画布", width: 1000, height: 800, flowMode: "infinite" });
  const resized = canvas.createResizedCanvasPage(page, 1400, 900);
  assert.equal(resized.width, 1400);
  assert.equal(resized.height, 900);
  assert.equal(resized.flowMode, "manual");
  assert.equal(resized.baseWidth, 1400);
  assert.equal(resized.baseHeight, 900);
  assert.equal(resized.id, "p", "保留页面 id");
});

test("fit transform wraps content bounds with padding and rounds to the grid", () => {
  const page = canvas.createCanvasPage({ id: "p", name: "画布", width: 1000, height: 800, gridSize: 20 });
  const fitted = canvas.computeCanvasFitTransform(page, { x: 50, y: 60, width: 200, height: 100 }, 120);
  assert.equal(fitted.width, 440, "宽 = ceil((200+240)/20)*20");
  assert.equal(fitted.height, 340, "高 = ceil((100+240)/20)*20");
  assert.deepEqual({ offsetX: fitted.offsetX, offsetY: fitted.offsetY }, { offsetX: 70, offsetY: 60 }, "内容平移使 bounds 左上角落在 padding 处");
  assert.deepEqual(fitted.rect, { x: -70, y: -60, width: 440, height: 340 });
  const empty = canvas.computeCanvasFitTransform(page, { x: 0, y: 0, width: 10, height: 10 }, 120);
  assert.equal(empty.width, 320, "fit 结果同样受最小尺寸约束");
});

test("rectFullyOutside only reports rectangles with no overlap at all", () => {
  const container = { x: 0, y: 0, width: 100, height: 100 };
  assert.equal(canvas.rectFullyOutside({ x: 0, y: 0, width: 10, height: 10 }, container), false, "内部不视为画布外");
  assert.equal(canvas.rectFullyOutside({ x: 90, y: 0, width: 20, height: 10 }, container), false, "部分越界不视为画布外");
  assert.equal(canvas.rectFullyOutside({ x: 100, y: 0, width: 10, height: 10 }, container), true, "完全在右侧之外");
  assert.equal(canvas.rectFullyOutside({ x: 0, y: 100, width: 10, height: 10 }, container), true, "完全在下方之外");
  assert.equal(canvas.rectFullyOutside({ x: -10, y: 0, width: 10, height: 10 }, container), true, "完全在左侧之外（贴边即越界）");
  assert.equal(canvas.rectFullyOutside({ x: 0, y: 0, width: 100, height: 10 }, container), false, "与容器右缘对齐不算画布外");
});

test("canvasAnchorArrowGrid radiates arrows from the anchor (real-time preview)", () => {
  const all = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((a) => canvas.canvasAnchorArrowGrid(a));
  assert.ok(all.every((g) => g.length === 9), "每个锚点都生成 9 格");
  assert.deepEqual(canvas.canvasAnchorArrowGrid(0), ["●", "→", "→", "↓", "↘", "↘", "↓", "↘", "↘"], "左上：固定点 + 右/下扩张");
  assert.deepEqual(canvas.canvasAnchorArrowGrid(8), ["↖", "↖", "↑", "↖", "↖", "↑", "←", "←", "●"], "右下：固定点 + 左/上扩张");
  assert.deepEqual(canvas.canvasAnchorArrowGrid(4), ["↖", "↑", "↗", "←", "●", "→", "↙", "↓", "↘"], "中心：四向辐射");
  assert.deepEqual(canvas.canvasAnchorArrowGrid(1), ["←", "●", "→", "↙", "↓", "↘", "↙", "↓", "↘"], "上边中点：左/右/下扩张");
});

test("canvasAnchorDescription describes the expansion direction per anchor", () => {
  assert.equal(canvas.canvasAnchorDescription(0), "画布将向右、向下扩展");
  assert.equal(canvas.canvasAnchorDescription(8), "画布将向左、向上扩展");
  assert.equal(canvas.canvasAnchorDescription(4), "画布将向四周平均扩展");
  assert.equal(canvas.canvasAnchorDescription(1), "画布将向左右、向下扩展");
  assert.equal(canvas.canvasAnchorDescription(6), "画布将向右、向上扩展");
});

// ── 站台调整锚点（九宫格）缩放几何 ──
function near(actual, expected, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `${actual} ≈ ${expected}`);
}
function assertResize(actual, expected) {
  near(actual.x, expected.x); near(actual.y, expected.y);
  near(actual.width, expected.width); near(actual.height, expected.height);
}
const PLAT = { x: 100, y: 200, width: 100, height: 20, rotation: 0 };

test("computePlatformResize 左上锚点：左边缘固定，向右下增长", () => {
  assertResize(canvas.computePlatformResize(PLAT, 0, 30, 10), { x: 100, y: 200, width: 130, height: 30 });
});

test("computePlatformResize 中心锚点：中心不动，宽度两倍增速对称外扩", () => {
  assertResize(canvas.computePlatformResize(PLAT, 4, 20, 0), { x: 80, y: 200, width: 140, height: 20 });
  // 中心点保持 (150, 210)
  const r = canvas.computePlatformResize(PLAT, 4, 20, 0);
  near(r.x + r.width / 2, 150); near(r.y + r.height / 2, 210);
});

test("computePlatformResize 右锚点：右边缘固定，往左拖增长", () => {
  assertResize(canvas.computePlatformResize(PLAT, 5, -20, 0), { x: 80, y: 200, width: 120, height: 20 });
  const r = canvas.computePlatformResize(PLAT, 5, -20, 0);
  near(r.x + r.width, 200); near(r.y, 200); // 右边缘与 y 都保持
});

test("computePlatformResize 右下锚点：右下角固定，向左上拖增长", () => {
  assertResize(canvas.computePlatformResize(PLAT, 8, -15, -5), { x: 85, y: 195, width: 115, height: 25 });
  const r = canvas.computePlatformResize(PLAT, 8, -15, -5);
  near(r.x + r.width, 200); near(r.y + r.height, 220); // 右下角保持
});

test("computePlatformResize 旋转 90°：世界位移映射到本地长度轴", () => {
  const rotated = { x: 100, y: 200, width: 100, height: 20, rotation: 90 };
  assertResize(canvas.computePlatformResize(rotated, 0, 0, 40), { x: 80, y: 220, width: 140, height: 20 });
});

test("computePlatformResize 钳制最小尺寸后锚点仍保持不动", () => {
  assertResize(canvas.computePlatformResize(PLAT, 0, -500, 0), { x: 100, y: 200, width: canvas.MIN_PLATFORM_WIDTH, height: 20 });
  const shrunk = canvas.computePlatformResize(PLAT, 8, 999, 999);
  assertResize(shrunk, { x: 196, y: 216, width: canvas.MIN_PLATFORM_WIDTH, height: canvas.MIN_PLATFORM_HEIGHT });
  near(shrunk.x + shrunk.width, 200); near(shrunk.y + shrunk.height, 220); // 右下角仍保持
});

test("computePlatformResize 非法锚点回退到左上", () => {
  assertResize(canvas.computePlatformResize(PLAT, 99, 30, 10), { x: 100, y: 200, width: 130, height: 30 });
});

test("computePlatformResizeFromSize 属性面板输入长度：右锚点时右边缘不动", () => {
  assertResize(canvas.computePlatformResizeFromSize(PLAT, 5, 120, 20), { x: 80, y: 200, width: 120, height: 20 });
  const r = canvas.computePlatformResizeFromSize(PLAT, 5, 120, 20);
  near(r.x + r.width, 200);
});

test("platformAnchorDescription 描述站台锚点调整方向", () => {
  assert.equal(canvas.platformAnchorDescription(0), "以「左上」为锚点：长度向右、厚度向下调整");
  assert.equal(canvas.platformAnchorDescription(5), "以「右」为锚点：长度向左、厚度向上下调整");
  assert.equal(canvas.platformAnchorDescription(4), "以「中心」为锚点：长度向左右、厚度向上下调整");
});

// ── 矢量图形控制点（基础元素：尺寸 / 长宽比 / 圆角 / 镜像锚点） ──
const GRAPHIC = { x: 100, y: 200, width: 100, height: 60, rotation: 0 };

test("graphicResizeAnchor 无镜像时取手柄对侧锚点", () => {
  assert.equal(canvas.graphicResizeAnchor(8), 0, "右下手柄 → 左上锚点");
  assert.equal(canvas.graphicResizeAnchor(0), 8, "左上手柄 → 右下锚点");
  assert.equal(canvas.graphicResizeAnchor(3), 5, "左中手柄 → 右中锚点");
  assert.equal(canvas.graphicResizeAnchor(4), 4, "中心手柄不动");
});

test("graphicResizeAnchor 镜像时取手柄视觉对侧的镜像锚点", () => {
  assert.equal(canvas.graphicResizeAnchor(8, true), 2, "mirrorX：右下手柄视觉在左下 → 右上锚点");
  assert.equal(canvas.graphicResizeAnchor(0, true), 6, "mirrorX：左上手柄视觉在右上 → 左下锚点");
  assert.equal(canvas.graphicResizeAnchor(3, true), 3, "mirrorX：左中手柄仍为左中锚点");
  assert.equal(canvas.graphicResizeAnchor(8, undefined, true), 6, "mirrorY：右下手柄视觉在右上 → 左下锚点");
  assert.equal(canvas.graphicResizeAnchor(8, true, true), 8, "双镜像：右下手柄仍为右下锚点");
});

test("computeGraphicResize 自由模式：锚点不动、自由长宽比", () => {
  const r = canvas.computeGraphicResize(GRAPHIC, 0, 30, 10, "free");
  assertResize(r, { x: 100, y: 200, width: 130, height: 70 });
  near(r.x, 100); near(r.y, 200); // 左上锚点保持
});

test("computeGraphicResize 等比模式：Shift 拖角点保持长宽比", () => {
  const r = canvas.computeGraphicResize(GRAPHIC, 0, 30, 10, "aspect");
  assertResize(r, { x: 100, y: 200, width: 130, height: 78 });
  near(r.width / r.height, GRAPHIC.width / GRAPHIC.height);
});

test("computeGraphicResize 边手柄只沿所在轴：左右只改宽度", () => {
  // 右中手柄 → 左中锚点（fx=0, fy=0.5）：忽略纵向位移，宽 +20、高不变
  assertResize(canvas.computeGraphicResize(GRAPHIC, 3, 20, 10, "free"), { x: 100, y: 200, width: 120, height: 60 });
  // 等比模式下同样只沿轴（边手柄不应用等比）
  assertResize(canvas.computeGraphicResize(GRAPHIC, 3, 20, 10, "aspect"), { x: 100, y: 200, width: 120, height: 60 });
});

test("computeGraphicResize 边手柄只沿所在轴：上下只改高度", () => {
  // 上中手柄 → 下中锚点（fx=0.5, fy=1）：忽略横向位移，向上拖 10 → 高 +10、宽不变
  assertResize(canvas.computeGraphicResize(GRAPHIC, 7, 20, -10, "free"), { x: 100, y: 190, width: 100, height: 70 });
});

test("computeGraphicResize 边手柄旋转感知：世界位移按本地轴投影", () => {
  const rotated = { x: 100, y: 200, width: 100, height: 60, rotation: 90 };
  // 旋转 90° 时沿世界 x 拖 = 本地 y 方向，上下边手柄仍只改高度
  assertResize(canvas.computeGraphicResize(rotated, 7, 10, 0, "free"), { x: 105, y: 195, width: 100, height: 70 });
});

test("computeGraphicResize 最小钳制且锚点不动", () => {
  assertResize(canvas.computeGraphicResize(GRAPHIC, 0, -300, 0, "free"), { x: 100, y: 200, width: 4, height: 60 });
});

test("computeGraphicResize 旋转感知：世界位移先转本地再解算", () => {
  const rotated = { x: 100, y: 200, width: 100, height: 60, rotation: 90 };
  assertResize(canvas.computeGraphicResize(rotated, 0, 30, 10, "free"), { x: 110, y: 220, width: 110, height: 30 });
});

test("computeGraphicResize 镜像锚点：视觉对角点保持不动", () => {
  const mirrored = { x: 100, y: 100, width: 80, height: 60, rotation: 0 };
  const r = canvas.computeGraphicResize(mirrored, canvas.graphicResizeAnchor(8, true), 30, 10, "free");
  assertResize(r, { x: 130, y: 100, width: 50, height: 70 });
  near(r.x + r.width, 180); near(r.y, 100); // 视觉右上角（基础本地左上角）固定在世界 (180,100)
});

const RAD = { rotation: 0, mirrorX: false, mirrorY: false, width: 100, height: 60 };

test("computeGraphicRadiusDrag 沿局部 x 增加圆角并钳制", () => {
  near(canvas.computeGraphicRadiusDrag(RAD, 10, 5, 0), 15);
  near(canvas.computeGraphicRadiusDrag(RAD, 10, -20, 0), 0);
  near(canvas.computeGraphicRadiusDrag(RAD, 10, 100, 0), 30); // min(100,60)/2 钳制
});

test("computeGraphicRadiusDrag mirrorX 时局部 x 取反", () => {
  near(canvas.computeGraphicRadiusDrag({ ...RAD, mirrorX: true }, 10, 5, 0), 5);
});

test("computeGraphicRadiusDrag 旋转感知：世界位移先转本地", () => {
  // 旋转 90° 时世界向下拖等于本地 +x
  near(canvas.computeGraphicRadiusDrag({ ...RAD, rotation: 90 }, 10, 0, 5), 15);
});

test("computeGraphicRadiusDrag mirrorY 不影响圆角（圆角只看局部 x）", () => {
  near(canvas.computeGraphicRadiusDrag({ ...RAD, mirrorY: true }, 10, 5, 0), 15);
  near(canvas.computeGraphicRadiusDrag({ ...RAD, rotation: 90, mirrorY: true }, 10, 0, 5), 15);
});

test("defaultGraphicRadius 圆角矩形用旧公式，其余形状为 0", () => {
  near(canvas.defaultGraphicRadius("roundRect", 80, 60), 12); // min(14, min(w,h)*0.2)
  near(canvas.defaultGraphicRadius("roundRect", 300, 300), 14); // 14 封顶
  near(canvas.defaultGraphicRadius("triangle", 80, 60), 0);
});

test("effectiveGraphicRadius 默认 / 显式 / 钳制 / 非圆角恒 0", () => {
  near(canvas.effectiveGraphicRadius("roundRect", 80, 60), 12);
  near(canvas.effectiveGraphicRadius("roundRect", 80, 60, 5), 5);
  near(canvas.effectiveGraphicRadius("roundRect", 20, 60, 50), 10); // 钳到 min/2
  near(canvas.effectiveGraphicRadius("roundRect", 80, 60, -3), 0); // 负值归 0
  near(canvas.effectiveGraphicRadius("rect", 80, 60), 0); // 矩形恒 0
  near(canvas.effectiveGraphicRadius("rect", 80, 60, 20), 0); // 显式也不生效
});

test("resolveShapeAppearance 形状外观默认：填充/描边空串回退形状自带，strokeWidth 恒应用", () => {
  const meta = { defaultFill: "#cce6f5", defaultStroke: "#202124" };
  // 空串 → 跟随形状自带
  assert.deepStrictEqual(canvas.resolveShapeAppearance("rect", { fill: "", stroke: "", strokeWidth: 1.5, radius: null, shapeOpacity: 1, objectOpacity: 1 }, meta), { fill: "#cce6f5", stroke: "#202124", strokeWidth: 1.5, radius: undefined, opacity: 1 });
  // 显式色 → 覆盖自带
  assert.deepStrictEqual(canvas.resolveShapeAppearance("rect", { fill: "#ff0000", stroke: "#00ff00", strokeWidth: 4, radius: 0, shapeOpacity: 1, objectOpacity: 1 }, meta), { fill: "#ff0000", stroke: "#00ff00", strokeWidth: 4, radius: undefined, opacity: 1 });
});

test("resolveShapeAppearance 圆角仅 roundRect 应用；null=跟随公式且 0=显式直角", () => {
  const meta = { defaultFill: "#d7f0d7", defaultStroke: "#202124" };
  const base = { fill: "", stroke: "", strokeWidth: 1.5, shapeOpacity: 1, objectOpacity: 1 };
  assert.deepStrictEqual(canvas.resolveShapeAppearance("roundRect", { ...base, radius: 20 }, meta), { fill: "#d7f0d7", stroke: "#202124", strokeWidth: 1.5, radius: 20, opacity: 1 });
  assert.deepStrictEqual(canvas.resolveShapeAppearance("roundRect", { ...base, radius: null }, meta), { fill: "#d7f0d7", stroke: "#202124", strokeWidth: 1.5, radius: undefined, opacity: 1 });
  assert.deepStrictEqual(canvas.resolveShapeAppearance("roundRect", { ...base, radius: 0 }, meta), { fill: "#d7f0d7", stroke: "#202124", strokeWidth: 1.5, radius: 0, opacity: 1 });
  assert.deepStrictEqual(canvas.resolveShapeAppearance("rect", { ...base, radius: 20 }, meta), { fill: "#d7f0d7", stroke: "#202124", strokeWidth: 1.5, radius: undefined, opacity: 1 }); // 矩形忽略
});

test("resolveShapeAppearance 信号机不应用外观默认，opacity 用 objectOpacity", () => {
  const base = { fill: "#ff0000", stroke: "#00ff00", strokeWidth: 4, radius: 20, shapeOpacity: 0.5, objectOpacity: 0.8 };
  assert.deepStrictEqual(canvas.resolveShapeAppearance("signal-in", base, { defaultFill: "#cce6f5", defaultStroke: "#202124" }), { opacity: 0.8 });
  assert.deepStrictEqual(canvas.resolveShapeAppearance("signal-out", { ...base, objectOpacity: 1 }, { defaultFill: "#cce6f5", defaultStroke: "#202124" }), { opacity: 1 });
});

test("resolveShapeAppearance 形状不透明度与全部对象不透明度分离", () => {
  const meta = { defaultFill: "#cce6f5", defaultStroke: "#202124" };
  const base = { fill: "", stroke: "", strokeWidth: 1.5, radius: 0 };
  assert.deepStrictEqual(canvas.resolveShapeAppearance("diamond", { ...base, shapeOpacity: 0.6, objectOpacity: 0.9 }, meta), { fill: "#cce6f5", stroke: "#202124", strokeWidth: 1.5, radius: undefined, opacity: 0.6 });
  assert.deepStrictEqual(canvas.resolveShapeAppearance("signal-shunt", { ...base, shapeOpacity: 0.6, objectOpacity: 0.9 }, meta), { opacity: 0.9 });
});

// ── 框选批量设置（batch.ts）──

const mkTestModule = (id, templateId = "double_track", extra = {}) => ({
  id,
  templateId,
  name: id,
  x: 100,
  y: 100,
  rotation: 0,
  mirrorX: false,
  mirrorY: false,
  lineIds: ["L1"],
  sourceStationIds: [],
  locked: false,
  layerId: "layer-track-main",
  zIndex: 1,
  pageId: "page-1",
  createdOrder: 1,
  customParams: { spacing: 45 },
  ...extra,
});

const mkTestConn = (id, from, to, extra = {}) => ({
  id,
  fromModuleId: from,
  fromPortId: "L_main",
  toModuleId: to,
  toPortId: "R_main",
  tracks: [{ x1: 0, y1: 0, x2: 100, y2: 0, type: "main" }],
  crossingType: "plain",
  crossingPoints: [{ x: 50, y: 0, t: 0.5 }],
  controlPoints: [{ id: "cp", x: 50, y: 0, curved: false, handleX: 0, handleY: 0 }],
  lineStyle: "solid",
  layerId: "layer-track-main",
  zIndex: 1,
  pageId: "page-1",
  createdOrder: 1,
  ...extra,
});

test("computeBatchCategoryGroups 按模板分类聚合模块与参数并集", () => {
  const modules = [
    mkTestModule("m-side", "side_platform", { customParams: { spacing: 50 } }),
    mkTestModule("m-double", "double_track"),
    mkTestModule("m-cross", "single_crossover", { customParams: { length: 120 } }),
  ];
  const groups = batch.computeBatchCategoryGroups(modules, TEMPLATES, ["m-side", "m-double", "m-cross"]);
  assert.deepEqual(groups.groups.map((g) => g.category), ["section", "turnout"]);
  const section = groups.byCategory.section;
  assert.equal(section.categoryName, "区间与车站");
  assert.deepEqual(section.moduleIds, ["m-side", "m-double"]);
  assert.deepEqual(section.params.map((p) => p.key), ["spacing", "platformLength", "platformWidth"]);
  const turnout = groups.byCategory.turnout;
  assert.equal(turnout.categoryName, "道岔与连接");
  assert.deepEqual(turnout.moduleIds, ["m-cross"]);
  assert.deepEqual(turnout.params.map((p) => p.key), ["length", "spacing"]);
  // 缺失模板的 id 被跳过
  const partial = batch.computeBatchCategoryGroups(modules, TEMPLATES, ["m-side", "ghost"]);
  assert.deepEqual(partial.byCategory.section.moduleIds, ["m-side"]);
  assert.equal(partial.byCategory.turnout, undefined);
});

test("applyBatchParam 只改声明了该 key 且值不同的模块，不修改入参", () => {
  const modules = [
    mkTestModule("m-side", "side_platform", { customParams: { spacing: 50 } }),
    mkTestModule("m-double", "double_track"),
    mkTestModule("m-cross", "single_crossover", { customParams: { length: 120 } }),
  ];
  const frozen = JSON.parse(JSON.stringify(modules));
  // 只有 side_platform 声明了 platformLength（新引用）；其余两个不变（同引用）
  const length = batch.applyBatchParam(modules, TEMPLATES, ["m-side", "m-double", "m-cross"], "platformLength", 200);
  assert.notEqual(length[0], modules[0]);
  assert.equal(length[0].customParams.platformLength, 200);
  assert.equal(length[1], modules[1]);
  assert.equal(length[2], modules[2]);
  // 三个模块都声明了 spacing
  const spacing = batch.applyBatchParam(modules, TEMPLATES, ["m-side", "m-double", "m-cross"], "spacing", 60);
  assert.deepEqual(spacing.map((m) => m.customParams?.spacing), [60, 60, 60]);
  // 值相同 → 返回原数组引用（目标模块当前值已等于目标时短路）
  const same = batch.applyBatchParam(modules, TEMPLATES, ["m-double"], "spacing", 45);
  assert.equal(same, modules);
  // 入参不被修改
  assert.deepEqual(modules, frozen);
});

// ── 复制/粘贴（clipboard.ts）──

test("buildCopyPayload 单模块只保留属性与所属对象，不带连接", () => {
  const modules = [mkTestModule("m1", "side_platform"), mkTestModule("m2", "double_track")];
  const conn = mkTestConn("c12", "m1", "m2");
  const platform = { id: "pf1", moduleId: "m1", x: 110, y: 90, width: 160, height: 16, rotation: 0, fill: "#D7B06A", layerId: "layer-platform-normal", zIndex: 0, pageId: "page-1", platformType: "side", attachedTrackIds: [] };
  const label = { id: "lb1", text: "站名", x: 120, y: 60, fontSize: 13, anchor: "top", rotation: 0, fill: "#202124", fontWeight: 700, backgroundMask: true, maskStrokeWidth: 2, locked: false, visible: true, layerId: "layer-label", zIndex: 0, pageId: "page-1", attachedToId: "m1", positionMode: "attached", offsetX: 20, offsetY: -40, sourceStationId: "st1" };
  const graphic = { id: "g1", attachedToId: "m1", positionMode: "attached", x: 100, y: 70, width: 32, height: 32, rotation: 0, opacity: 1, layerId: "layer-icon", zIndex: 0, pageId: "page-1", offsetX: 0, offsetY: -30, visible: true, locked: false };
  const payload = clipboard.buildCopyPayload({
    selectedIds: ["m1"], modules, platforms: [platform], labels: [label], graphics: [graphic], connections: [conn],
    isOnActivePage: (p) => (p || "page-1") === "page-1", isLayerLocked: () => false,
  });
  assert.equal(payload.modules.length, 1);
  assert.deepEqual(payload.platforms.map((p) => p.id), ["pf1"]);
  assert.deepEqual(payload.labels.map((l) => l.id), ["lb1"]);
  assert.deepEqual(payload.graphics.map((g) => g.id), ["g1"]);
  assert.deepEqual(payload.connections, []);
});

test("buildCopyPayload 两模块及以上保留内部连接，排除外部连接、跨页与锁定模块", () => {
  const modules = [mkTestModule("m1", "side_platform"), mkTestModule("m2", "double_track"), mkTestModule("m3", "single_crossover"), mkTestModule("m4", "double_track", { pageId: "page-2" })];
  const c12 = mkTestConn("c12", "m1", "m2");
  const c23 = mkTestConn("c23", "m2", "m3");
  const c14 = mkTestConn("c14", "m1", "m4"); // m4 未选中 → 排除
  const payload = clipboard.buildCopyPayload({
    selectedIds: ["m1", "m2", "m3"], modules, platforms: [], labels: [], graphics: [], connections: [c12, c23, c14],
    isOnActivePage: (p) => (p || "page-1") === "page-1", isLayerLocked: () => false,
  });
  assert.equal(payload.modules.length, 3);
  assert.deepEqual(payload.connections.map((c) => c.id), ["c12", "c23"]);
  // 跨页模块不计入复制集
  const crossPage = clipboard.buildCopyPayload({
    selectedIds: ["m1", "m4"], modules, platforms: [], labels: [], graphics: [], connections: [c14],
    isOnActivePage: (p) => (p || "page-1") === "page-1", isLayerLocked: () => false,
  });
  assert.deepEqual(crossPage.modules.map((m) => m.id), ["m1"]);
  assert.deepEqual(crossPage.connections, []);
  // 锁定模块被排除
  const locked = modules.map((m) => m.id === "m2" ? { ...m, locked: true } : m);
  const payload2 = clipboard.buildCopyPayload({
    selectedIds: ["m1", "m2", "m3"], modules: locked, platforms: [], labels: [], graphics: [], connections: [c12, c23],
    isOnActivePage: (p) => (p || "page-1") === "page-1", isLayerLocked: () => false,
  });
  assert.deepEqual(payload2.modules.map((m) => m.id), ["m1", "m3"]);
  assert.deepEqual(payload2.connections, []);
});

test("buildCopyPayload 无可复制模块返回 null", () => {
  const payload = clipboard.buildCopyPayload({ selectedIds: ["none"], modules: [], platforms: [], labels: [], graphics: [], connections: [], isOnActivePage: () => true, isLayerLocked: () => false });
  assert.equal(payload, null);
});

test("buildPasteData 偏移复制：id 重映射、坐标平移、参数保留、连接重连", () => {
  const srcModules = [mkTestModule("m1", "side_platform"), mkTestModule("m2", "double_track")];
  const srcPlatform = { id: "pf1", moduleId: "m1", x: 110, y: 90, width: 160, height: 16, rotation: 0, fill: "#D7B06A", layerId: "layer-platform-normal", zIndex: 0, pageId: "page-1", platformType: "side", attachedTrackIds: [] };
  const srcLabel = { id: "lb1", text: "站名", x: 120, y: 60, fontSize: 13, anchor: "top", rotation: 0, fill: "#202124", fontWeight: 700, backgroundMask: true, maskStrokeWidth: 2, locked: false, visible: true, layerId: "layer-label", zIndex: 0, pageId: "page-1", attachedToId: "m1", positionMode: "attached", offsetX: 20, offsetY: -40, sourceStationId: "st1" };
  const srcConn = mkTestConn("c12", "m1", "m2", { pairedConnectionId: "c21" });
  const pair = mkTestConn("c21", "m2", "m1", { pairedConnectionId: "c12" });
  const payload = { kind: "modules", modules: srcModules, platforms: [srcPlatform], labels: [srcLabel], graphics: [], connections: [srcConn, pair] };
  const result = clipboard.buildPasteData(payload, 24, 24, {
    pageId: "page-2", createdOrderBase: 1000,
    zIndexBases: { modules: 5, platforms: 2, labels: 3, graphics: 0, connections: 4 },
    genId: (prefix) => `${prefix}-new-${Math.random().toString(36).slice(2, 8)}`,
  });
  // 全部 id 新且唯一
  const allIds = [...result.modules.map((m) => m.id), ...result.connections.map((c) => c.id), ...result.platforms.map((p) => p.id), ...result.labels.map((l) => l.id)];
  assert.equal(new Set(allIds).size, allIds.length);
  assert.equal(result.idMap.get("m1"), result.modules[0].id);
  assert.equal(result.idMap.get("m2"), result.modules[1].id);
  // 模块坐标偏移、pageId、locked=false、customParams 保留、zIndex 底 + 序号
  assert.equal(result.modules[0].x, 124);
  assert.equal(result.modules[0].y, 124);
  assert.equal(result.modules[0].pageId, "page-2");
  assert.equal(result.modules[0].locked, false);
  assert.deepEqual(result.modules[0].customParams, { spacing: 45 });
  assert.equal(result.modules[0].zIndex, 5);
  assert.equal(result.modules[1].zIndex, 6);
  // 所属站台/标签：moduleId/attachedToId 重映射、坐标偏移、offset 相对量不变
  assert.equal(result.platforms[0].moduleId, result.modules[0].id);
  assert.equal(result.platforms[0].x, 134);
  assert.equal(result.platforms[0].y, 114);
  assert.equal(result.labels[0].attachedToId, result.modules[0].id);
  assert.equal(result.labels[0].x, 144);
  assert.equal(result.labels[0].offsetX, 20);
  assert.equal(result.labels[0].offsetY, -40);
  // 连接：端点重映射、pairedConnectionId 双向保留、tracks/交叉点/控制点偏移
  const c12new = result.connections.find((c) => c.id === result.idMap.get("c12"));
  assert.equal(c12new.fromModuleId, result.modules[0].id);
  assert.equal(c12new.toModuleId, result.modules[1].id);
  assert.equal(c12new.pairedConnectionId, result.idMap.get("c21"));
  assert.deepEqual(c12new.tracks[0], { x1: 24, y1: 24, x2: 124, y2: 24, type: "main" });
  assert.deepEqual(c12new.crossingPoints[0], { x: 74, y: 24, t: 0.5 });
  assert.deepEqual(c12new.controlPoints[0], { id: "cp", x: 74, y: 24, curved: false, handleX: 0, handleY: 0 });
  assert.equal(c12new.pageId, "page-2");
  // 对端不在复制集的 pairedConnectionId 清空
  const solo = mkTestConn("solo", "m1", "m2", { pairedConnectionId: "ghost" });
  const soloResult = clipboard.buildPasteData({ kind: "modules", modules: srcModules, platforms: [], labels: [], graphics: [], connections: [solo] }, 0, 0, {
    pageId: "page-1", createdOrderBase: 0, zIndexBases: { modules: 0, platforms: 0, labels: 0, graphics: 0, connections: 0 }, genId: (prefix) => `${prefix}-x`,
  });
  assert.equal(soloResult.connections[0].pairedConnectionId, undefined);
});

test("buildPasteData 原位复制（dx=dy=0）坐标不变", () => {
  const srcModules = [mkTestModule("m1", "side_platform")];
  const result = clipboard.buildPasteData({ kind: "modules", modules: srcModules, platforms: [], labels: [], graphics: [], connections: [] }, 0, 0, {
    pageId: "page-1", createdOrderBase: 0, zIndexBases: { modules: 0, platforms: 0, labels: 0, graphics: 0, connections: 0 }, genId: (prefix) => `${prefix}-x`,
  });
  assert.equal(result.modules[0].x, 100);
  assert.equal(result.modules[0].y, 100);
  assert.equal(result.modules[0].id, "module-x");
});
