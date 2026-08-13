import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const canvas = await server.ssrLoadModule("/app/wiring/canvasLogic.ts");
const projectStore = await server.ssrLoadModule("/app/wiring/projectStore.ts");
const templatesMod = await server.ssrLoadModule("/app/wiring/templates.ts");
const avoidance = await server.ssrLoadModule("/app/wiring/labelAvoidance.ts");
after(() => server.close());

const TEMPLATES = new Map(templatesMod.MODULE_TEMPLATES.map((template) => [template.id, template]));

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

test("fork 开合角度参数存在，默认角复现静态分叉点 divX=130", () => {
  const expected = {
    double_fork_up: 26.2,
    double_fork_dn: 23.3,
    double_fork_y: 17.1,
  };
  for (const [id, angle] of Object.entries(expected)) {
    const base = TEMPLATES.get(id);
    const param = base.params.find((p) => p.key === "angle");
    assert.ok(param, `${id} 有开合角度参数`);
    assert.equal(param.label, "开合角度");
    assert.equal(param.default, angle, `${id} 默认开合角度 = ${angle}°（该角使 divX=宽/2，保持可对齐）`);
    const tpl = templatesMod.makeCustomizedTemplate(base, Object.fromEntries(base.params.map((p) => [p.key, p.default])));
    const branchX1 = [...new Set(tpl.tracks.filter((t) => t.type === "branch").map((t) => t.x1))];
    assert.deepEqual(branchX1, [130], `${id} 默认角下分叉点 divX=130（=宽/2，与静态基准一致）`);
  }
});

test("fork 开合角度移动支线端口，直股/输入端口固定（对齐不受影响）", () => {
  for (const id of ["double_fork_up", "double_fork_dn", "double_fork_y"]) {
    const base = TEMPLATES.get(id);
    const defaults = Object.fromEntries(base.params.map((p) => [p.key, p.default]));
    // 上/下分叉：支线 = R_up2/R_dn2；Y 形：上下两支都是支线
    const branchIds = id === "double_fork_y" ? ["R_up1", "R_dn1", "R_up2", "R_dn2"] : ["R_up2", "R_dn2"];
    const fixedIds = id === "double_fork_y" ? ["L_up1", "L_dn1"] : ["L_up1", "L_dn1", "R_up1", "R_dn1"];
    const defTpl = templatesMod.makeCustomizedTemplate(base, defaults);
    // 各分叉角度需高于本类型张开量下限（k≥spacing 或 k≥spacing/2）才会真正移动支线
    const angles = id === "double_fork_up" ? [20, 26.2, 30] : id === "double_fork_dn" ? [18, 23.3, 45] : [10, 17.1, 21];
    let lastBranchY = null;
    for (const angle of angles) {
      const tpl = templatesMod.makeCustomizedTemplate(base, { ...defaults, angle });
      // 直股/输入端口位置不随开合角度移动（吸附对齐不受影响）
      for (const pid of fixedIds) {
        assert.equal(
          tpl.ports.find((p) => p.id === pid).y,
          defTpl.ports.find((p) => p.id === pid).y,
          `${id} 输入/直股端口 ${pid} 不随角度移动`,
        );
      }
      // 支线端口随角度张开
      const branchY = tpl.ports.filter((p) => branchIds.includes(p.id)).map((p) => p.y);
      if (lastBranchY) assert.notDeepEqual(branchY, lastBranchY, `${id} 角度改变时支线端口移动`);
      lastBranchY = branchY;
    }
  }
});

test("fork 开合角度张开支线：方向与斜轨斜率一致、模板随支线扩高", () => {
  for (const id of ["double_fork_up", "double_fork_dn", "double_fork_y"]) {
    const base = TEMPLATES.get(id);
    const defaults = Object.fromEntries(base.params.map((p) => [p.key, p.default]));
    // 18° 起避免下分叉完全闭合（k=spacing 时支线端口与直股端口重合）的退化角
    const angles = id === "double_fork_up" ? [20, 26.2, 30] : id === "double_fork_dn" ? [18, 23.3, 45] : [12, 17.1, 21];
    const heights = [];
    for (const angle of angles) {
      const tpl = templatesMod.makeCustomizedTemplate(base, { ...defaults, angle });
      heights.push(tpl.height);
      // 端口方向与相接斜轨斜率一致（连接切线不脱节）
      for (const track of tpl.tracks.filter((t) => t.type === "branch")) {
        const travel = Math.round(Math.atan2(track.y2 - track.y1, track.x2 - track.x1) * 180 / Math.PI);
        const normTravel = ((travel % 360) + 360) % 360;
        const atEnd = tpl.ports.find((p) => p.x === track.x2 && p.y === track.y2);
        assert.equal(atEnd.direction, normTravel, `${id} angle=${angle}° 端口 ${atEnd.id} 方向与相接斜轨斜率一致`);
      }
      // 支线可贴近上沿（y≥0，分叉不做整体下移），下沿用扩高保证
      const ys = [...tpl.tracks.flatMap((t) => [t.y1, t.y2]), ...tpl.ports.map((p) => p.y)];
      assert.ok(Math.min(...ys) >= 0, `${id} angle=${angle}° 轨道不越顶，minY=${Math.min(...ys)}`);
      assert.ok(Math.max(...ys) <= tpl.height - 12, `${id} angle=${angle}° 轨道不越底，maxY=${Math.max(...ys)} <= ${tpl.height - 12}`);
    }
    // 角度越大模板只升不降（上分叉支线顶到上沿后高度不变，下分叉/Y 形随支线外扩变高）
    assert.ok(heights[1] >= heights[0], `${id} 角度增大模板不降低`);
  }
});

test("fork customized templates keep diagonal angles and stay in bounds", () => {
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
  // 用户要求：一条双线分成两条完整的双线，两组输出之间留出明确间隙。
  // 分开后的组间距（相邻输出对之间）必须等于进入轨道的线间距 spacing。
  const ys = (tpl, ids) => ids.map((id) => tpl.ports.find((p) => p.id === id).y);

  // Y 形：四条输出线均匀排布，间距 = spacing；上支对上支、下支对下支相邻组间距 = spacing
  const yBase = TEMPLATES.get("double_fork_y");
  const y = templatesMod.makeCustomizedTemplate(yBase, { length: 260, spacing: 40 });
  const yUpper = ys(y, ["R_up1", "R_dn1"]);
  const yLower = ys(y, ["R_up2", "R_dn2"]);
  assert.deepEqual(yUpper, [12, 52], "Y形 上支双线端口位置");
  assert.deepEqual(yLower, [92, 132], "Y形 下支双线端口位置");
  // 组间距（下支上行 92 - 上支下行 52）= spacing = 40
  assert.equal(yLower[0] - yUpper[1], 40, "Y形 两组输出间距 = 进入轨道线间距");

  // 上分叉：默认角 26.2° 下支线对（12/52）完全高出直股对（76/116），输入固定
  const upBase = TEMPLATES.get("double_fork_up");
  const up = templatesMod.makeCustomizedTemplate(upBase, { length: 260, spacing: 40 });
  const upBranch = ys(up, ["R_up2", "R_dn2"]);
  const upStraight = ys(up, ["R_up1", "R_dn1"]);
  assert.deepEqual(upBranch, [12, 52], "上分叉 支线对端口位置");
  assert.deepEqual(upStraight, [76, 116], "上分叉 直股对端口位置");
  assert.equal(upStraight[0] - upBranch[1], 24, "上分叉 支线与直股组间距 = 24（默认角 26.2°）");
  assert.equal(up.ports.find((port) => port.id === "L_up1").y, 76, "上分叉 输入不随角度移动");
  // 开大角度 → 支线向上张开，直股/输入位置不变，模板高度不变（支线仍在模板上沿内）
  const upWide = templatesMod.makeCustomizedTemplate(upBase, { length: 260, spacing: 40, angle: 30 });
  const upWideBranch = ys(upWide, ["R_up2", "R_dn2"]);
  assert.ok(upWideBranch[0] < upBranch[0], "上分叉 开大角度支线上移张开");
  assert.deepEqual(ys(upWide, ["R_up1", "R_dn1"]), [76, 116], "上分叉 开大角度直股不动");
  assert.equal(upWide.height, up.height, "上分叉 开大角度模板高度不变");

  // 下分叉：支线对完全低于直股对，输入保持标准 36/76
  const dnBase = TEMPLATES.get("double_fork_dn");
  const dn = templatesMod.makeCustomizedTemplate(dnBase, { length: 260, spacing: 40 });
  const dnBranch = ys(dn, ["R_up2", "R_dn2"]);
  const dnStraight = ys(dn, ["R_up1", "R_dn1"]);
  assert.deepEqual(dnStraight, [36, 76], "下分叉 直股对保持标准 36/76");
  assert.deepEqual(dnBranch, [92, 132], "下分叉 支线对默认位置");
  assert.equal(dnBranch[0] - dnStraight[1], 16, "下分叉 支线与直股组间距 = 16（默认角 23.3°）");
  assert.equal(dn.ports.find((port) => port.id === "L_up1").y, 36, "下分叉 输入保持标准对齐");
  // 开大角度 → 支线向下张开、模板变高，输入不动
  const dnWide = templatesMod.makeCustomizedTemplate(dnBase, { length: 260, spacing: 40, angle: 45 });
  assert.ok(dnWide.height > dn.height, "下分叉 开大角度模板变高");
  assert.deepEqual(ys(dnWide, ["R_up1", "R_dn1"]), [36, 76], "下分叉 开大角度直股不动");

  // Y 形：开大角度上下两支同时张开、模板变高，输入不动
  const yWide = templatesMod.makeCustomizedTemplate(yBase, { length: 260, spacing: 40, angle: 21 });
  assert.ok(yWide.height > y.height, "Y形 开大角度模板变高");
  assert.deepEqual(ys(yWide, ["L_up1", "L_dn1"]), [52, 92], "Y形 开大角度输入不动");

  // 分叉比普通组件更长（默认 260）
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
  const { island, module, platform, zhLabel, enLabel, icon } = buildIslandStationObjects();
  const updated = { ...module, templateId: "side_platform" };
  let seq = 0;
  const relaid = canvas.relayoutModuleOwnedObjects({
    module: updated, nextTemplate: side, previousTemplate: island,
    platforms: [platform], labels: [zhLabel, enLabel], graphics: [icon],
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
