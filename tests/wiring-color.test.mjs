import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { createServer } from "vite";

// Load the production TypeScript module through the project's existing Vite
// transform pipeline, so these tests execute the same pure logic as the UI.
const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const color = await server.ssrLoadModule("/app/wiring/color.ts");
after(() => server.close());

function sourceLine(id, lineColor) {
  return { id, kind: "metro", number: id, nameZh: id, lineColor };
}

function module(id, lineIds, trackColorMode, trackColor) {
  return {
    id,
    templateId: "double_track",
    name: id,
    x: 0,
    y: 0,
    rotation: 0,
    lineIds: lineIds ?? [],
    sourceStationIds: [],
    locked: false,
    layerId: "layer-track-main",
    zIndex: 0,
    trackColorMode: trackColorMode ?? "default",
    trackColor: trackColor ?? undefined,
  };
}

function platform(id, fill, colorMode, sourceLineId, moduleId) {
  return {
    id,
    moduleId: moduleId ?? undefined,
    sourceLineId: sourceLineId ?? undefined,
    platformType: "island",
    attachedTrackIds: [],
    x: 0,
    y: 0,
    width: 120,
    height: 20,
    rotation: 0,
    fill,
    layerId: "layer-platform",
    zIndex: 0,
    colorMode: colorMode ?? "default",
  };
}

describe("hex helpers", () => {
  test("normalizeHex pads short forms and validates", () => {
    assert.equal(color.normalizeHex("fff"), "#ffffff");
    assert.equal(color.normalizeHex("#ABC"), "#aabbcc");
    assert.equal(color.normalizeHex("#FF0000"), "#ff0000");
    assert.equal(color.normalizeHex("00ff00"), "#00ff00");
    assert.equal(color.normalizeHex("not-a-color"), null);
    assert.equal(color.normalizeHex(""), null);
  });

  test("hexToRgb parses six and three digit hex", () => {
    assert.deepEqual(color.hexToRgb("#ff0000"), { r: 255, g: 0, b: 0 });
    assert.deepEqual(color.hexToRgb("#00FF00"), { r: 0, g: 255, b: 0 });
    assert.deepEqual(color.hexToRgb("#f00"), { r: 255, g: 0, b: 0 });
    assert.equal(color.hexToRgb("zzz"), null);
  });

  test("blendHex interpolates between endpoints", () => {
    assert.equal(color.blendHex("#000000", "#ffffff", 0), "#000000");
    assert.equal(color.blendHex("#000000", "#ffffff", 1), "#ffffff");
    assert.equal(color.blendHex("#000000", "#ffffff", 0.5), "#808080");
    assert.equal(color.blendHex("#000000", "#ff0000", 0.5), "#800000");
  });
});

describe("sampleSpecAt", () => {
  const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
  const grad = color.resolveModuleTrackColor(module("m1", ["L1", "L2"], "line"), lines, 160);

  test("solid specs return their color directly", () => {
    assert.equal(color.sampleSpecAt({ css: "#00ff00", kind: "solid" }, 0, 0), "#00ff00");
  });

  test("vertical module gradient: up rail (y=36) samples line 0, down rail (y=76) samples line 1", () => {
    assert.equal(color.sampleSpecAt(grad, 80, 36), "#ff0000");
    assert.equal(color.sampleSpecAt(grad, 80, 76), "#0000ff");
  });

  test("mid-height samples the blended midpoint", () => {
    assert.equal(color.sampleSpecAt(grad, 80, 56), "#800080");
  });

  test("missing coordinates fall back to the first stop", () => {
    assert.equal(color.sampleSpecAt(grad), "#ff0000");
    assert.equal(color.sampleSpecAt(grad, 80), "#ff0000");
  });

  test("down-rail connection between two dual-line modules carries the down-line color", () => {
    const fromColor = color.sampleSpecAt(grad, 80, 76);
    const toColor = color.sampleSpecAt(grad, 80, 76);
    const spec = color.resolveConnectionColor("auto", undefined, fromColor, toColor, { x: 0, y: 76 }, { x: 200, y: 76 }, "c1");
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#0000ff");
  });
});

describe("resolveModuleTrackColor", () => {
  test("default mode returns the default track color", () => {
    const spec = color.resolveModuleTrackColor(module("m1"), [], 160);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, color.DEFAULT_TRACK_COLOR);
  });

  test("line mode with a single line returns that line's color", () => {
    const lines = [sourceLine("L1", "#FF0000")];
    const spec = color.resolveModuleTrackColor(module("m1", ["L1"], "line"), lines, 160);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#ff0000");
  });

  test("line mode with two lines returns a vertical gradient", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const spec = color.resolveModuleTrackColor(module("m1", ["L1", "L2"], "line"), lines, 160);
    assert.equal(spec.kind, "gradient");
    assert.equal(spec.gradientDef.id, "grad-mod-m1");
    assert.deepEqual(spec.gradientDef.stops.map((s) => s.color), ["#ff0000", "#0000ff"]);
    // 双线上下行渐变：轴竖直（x 不变）
    assert.equal(spec.gradientDef.x1, spec.gradientDef.x2);
    assert.equal(spec.gradientDef.x1, 80);
    assert.equal(spec.gradientDef.y1, 36);
    assert.equal(spec.gradientDef.y2, 76);
  });

  test("line mode uses trackBounds when provided (non-default template geometry)", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const spec = color.resolveModuleTrackColor(module("m1", ["L1", "L2"], "line"), lines, 160, undefined, { minY: 20, maxY: 90 });
    assert.equal(spec.kind, "gradient");
    assert.equal(spec.gradientDef.y1, 20);
    assert.equal(spec.gradientDef.y2, 90);
  });

  test("line mode without bounds falls back to 36→76", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const spec = color.resolveModuleTrackColor(module("m1", ["L1", "L2"], "line"), lines, 160);
    assert.equal(spec.gradientDef.y1, 36);
    assert.equal(spec.gradientDef.y2, 76);
  });

  test("line mode with three lines returns an evenly-spaced vertical gradient", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#00FF00"), sourceLine("L3", "#0000FF")];
    const spec = color.resolveModuleTrackColor(module("m1", ["L1", "L2", "L3"], "line"), lines, 160);
    assert.equal(spec.kind, "gradient");
    assert.deepEqual(spec.gradientDef.stops.map((s) => s.color), ["#ff0000", "#00ff00", "#0000ff"]);
    assert.deepEqual(spec.gradientDef.stops.map((s) => s.offset), ["0%", "50%", "100%"]);
    // 中间轨道（渐变轴中点）采样到中间线路颜色
    assert.equal(color.sampleSpecAt(spec, 80, 56), "#00ff00");
  });

  test("line mode without lines falls back to default", () => {
    const spec = color.resolveModuleTrackColor(module("m1", [], "line"), [], 160);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, color.DEFAULT_TRACK_COLOR);
  });

  test("line mode with unknown line id falls back to default", () => {
    const spec = color.resolveModuleTrackColor(module("m1", ["L9"], "line"), [sourceLine("L1", "#FF0000")], 160);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, color.DEFAULT_TRACK_COLOR);
  });

  test("manual mode returns the manually chosen color", () => {
    const spec = color.resolveModuleTrackColor(module("m1", [], "manual", "#00FF00"), [], 160);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#00ff00");
  });

  test("no explicit color mode defaults to following the line when lineIds present", () => {
    const lines = [sourceLine("L1", "#FF0000")];
    const m = module("m1", ["L1"]);
    delete m.trackColorMode;
    const spec = color.resolveModuleTrackColor(m, lines, 160);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#ff0000");
  });

  test("no explicit color mode with no lines falls back to default gray", () => {
    const m = module("m1");
    delete m.trackColorMode;
    const spec = color.resolveModuleTrackColor(m, [], 160);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, color.DEFAULT_TRACK_COLOR);
  });
});

describe("groupTrackColors", () => {
  test("groups tracks evenly per line, top-heavy remainder", () => {
    assert.deepEqual(color.groupTrackColors(4, ["#ff0000", "#0000ff"], "#202124"), ["#ff0000", "#ff0000", "#0000ff", "#0000ff"]);
    assert.deepEqual(color.groupTrackColors(4, ["#ff0000", "#00ff00", "#0000ff"], "#202124"), ["#ff0000", "#ff0000", "#00ff00", "#0000ff"]);
    assert.deepEqual(color.groupTrackColors(2, ["#ff0000", "#0000ff"], "#202124"), ["#ff0000", "#0000ff"]);
  });

  test("single line colors all tracks; no lines falls back", () => {
    assert.deepEqual(color.groupTrackColors(4, ["#ff0000"], "#202124"), ["#ff0000", "#ff0000", "#ff0000", "#ff0000"]);
    assert.deepEqual(color.groupTrackColors(4, [], "#202124"), ["#202124", "#202124", "#202124", "#202124"]);
  });
});

describe("resolveModuleColorPlan", () => {
  // 双岛四线模板：4 条主轨 + 2 个岛式站台
  const doubleIslandTracks = [
    { x1: 0, y1: 20, x2: 200, y2: 20, type: "main" },
    { x1: 0, y1: 52, x2: 200, y2: 52, type: "main" },
    { x1: 0, y1: 68, x2: 200, y2: 68, type: "main" },
    { x1: 0, y1: 100, x2: 200, y2: 100, type: "main" },
  ];
  const doubleIslandPlatforms = [
    { x: 10, y: 28, width: 180, height: 16, type: "island" },
    { x: 10, y: 76, width: 180, height: 16, type: "island" },
  ];
  // 同台双线（岛式站台站）：2 条主轨 + 1 个岛式站台
  const islandPlatformTracks = [
    { x1: 0, y1: 36, x2: 180, y2: 36, type: "main" },
    { x1: 0, y1: 76, x2: 180, y2: 76, type: "main" },
  ];
  const islandPlatformTemplates = [
    { x: 10, y: 48, width: 160, height: 16, type: "island" },
  ];

  test("default mode: all tracks gray, no template platform specs", () => {
    const plan = color.resolveModuleColorPlan(module("m1"), [], 200, doubleIslandTracks, doubleIslandPlatforms, { minY: 20, maxY: 100 });
    assert.deepEqual(plan.trackColors, ["#202124", "#202124", "#202124", "#202124"]);
    assert.equal(plan.sampleSpec.kind, "solid");
    assert.equal(plan.sampleSpec.css, color.DEFAULT_TRACK_COLOR);
    assert.deepEqual(plan.templatePlatformSpecs, [undefined, undefined]);
  });

  test("manual mode: all tracks the manual color", () => {
    const plan = color.resolveModuleColorPlan(module("m1", [], "manual", "#00FF00"), [], 200, doubleIslandTracks, doubleIslandPlatforms, { minY: 20, maxY: 100 });
    assert.deepEqual(plan.trackColors, ["#00ff00", "#00ff00", "#00ff00", "#00ff00"]);
    assert.equal(plan.sampleSpec.css, "#00ff00");
  });

  test("double-island with two lines: tracks pair per line, platforms solid per island", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const plan = color.resolveModuleColorPlan(module("m1", ["L1", "L2"], "line"), lines, 200, doubleIslandTracks, doubleIslandPlatforms, { minY: 20, maxY: 100 });
    // 逐轨：上 2 条 = L1，下 2 条 = L2
    assert.deepEqual(plan.trackColors, ["#ff0000", "#ff0000", "#0000ff", "#0000ff"]);
    // 取样渐变在每条轨道位置采到正确颜色
    assert.equal(plan.sampleSpec.kind, "gradient");
    assert.equal(color.sampleSpecAt(plan.sampleSpec, 100, 20), "#ff0000");
    assert.equal(color.sampleSpecAt(plan.sampleSpec, 100, 52), "#ff0000");
    assert.equal(color.sampleSpecAt(plan.sampleSpec, 100, 68), "#0000ff");
    assert.equal(color.sampleSpecAt(plan.sampleSpec, 100, 100), "#0000ff");
    // 模板站台：岛 0 = L1，岛 1 = L2（solid，非渐变）
    assert.equal(plan.templatePlatformSpecs[0].kind, "solid");
    assert.equal(plan.templatePlatformSpecs[0].css, "#ff0000");
    assert.equal(plan.templatePlatformSpecs[1].kind, "solid");
    assert.equal(plan.templatePlatformSpecs[1].css, "#0000ff");
  });

  test("same-platform double-line: tracks split per line, platform is a gradient", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const plan = color.resolveModuleColorPlan(module("m1", ["L1", "L2"], "line"), lines, 180, islandPlatformTracks, islandPlatformTemplates, { minY: 36, maxY: 76 });
    assert.deepEqual(plan.trackColors, ["#ff0000", "#0000ff"]);
    assert.equal(plan.sampleSpec.kind, "gradient");
    assert.equal(color.sampleSpecAt(plan.sampleSpec, 90, 36), "#ff0000");
    assert.equal(color.sampleSpecAt(plan.sampleSpec, 90, 76), "#0000ff");
    assert.equal(plan.templatePlatformSpecs[0].kind, "gradient");
    assert.deepEqual(plan.templatePlatformSpecs[0].gradientDef.stops.map((s) => s.color), ["#ff0000", "#ff0000", "#0000ff", "#0000ff"]);
    // 拼色覆盖站台实际位置（islandPlatformTemplates 站台 y=48, h=16）
    assert.equal(plan.templatePlatformSpecs[0].gradientDef.y1, 48);
    assert.equal(plan.templatePlatformSpecs[0].gradientDef.y2, 64);
  });

  test("single line: all tracks and template platforms that color", () => {
    const lines = [sourceLine("L1", "#00AA00")];
    const plan = color.resolveModuleColorPlan(module("m1", ["L1"], "line"), lines, 180, islandPlatformTracks, islandPlatformTemplates, { minY: 36, maxY: 76 });
    assert.deepEqual(plan.trackColors, ["#00aa00", "#00aa00"]);
    assert.equal(plan.templatePlatformSpecs[0].css, "#00aa00");
  });

  test("no explicit color mode defaults to line-following when lineIds present", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const m = module("m1", ["L1", "L2"]);
    delete m.trackColorMode;
    const plan = color.resolveModuleColorPlan(m, lines, 180, islandPlatformTracks, islandPlatformTemplates, { minY: 36, maxY: 76 });
    assert.deepEqual(plan.trackColors, ["#ff0000", "#0000ff"]);
    assert.equal(plan.sampleSpec.kind, "gradient");
    assert.equal(plan.templatePlatformSpecs[0].kind, "gradient");
  });

  // 同台换乘（cross_platform）：4 条主轨 A上/B上/B下/A下 + 2 个岛式站台，trackLinePattern=[0,1,1,0]，
  // 轨道间距与注册版双岛四线一致（standardizedDoubleIslandStation：20/60/68/108、站台 32/80）
  const crossPlatformTracks = [
    { x1: 0, y1: 20, x2: 200, y2: 20, type: "main" },
    { x1: 0, y1: 60, x2: 200, y2: 60, type: "main" },
    { x1: 0, y1: 68, x2: 200, y2: 68, type: "main" },
    { x1: 0, y1: 108, x2: 200, y2: 108, type: "main" },
  ];
  const crossPlatformTemplates = [
    { x: 10, y: 32, width: 180, height: 16, type: "island" },
    { x: 10, y: 80, width: 180, height: 16, type: "island" },
  ];
  const crossPlatformPattern = [0, 1, 1, 0];

  test("cross-platform pattern: per-track colors follow the map, platforms are adjacent-line gradients", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const plan = color.resolveModuleColorPlan(module("m1", ["L1", "L2"], "line"), lines, 200, crossPlatformTracks, crossPlatformTemplates, { minY: 20, maxY: 108 }, crossPlatformPattern);
    // A上/B上/B下/A下 = L1/L2/L2/L1
    assert.deepEqual(plan.trackColors, ["#ff0000", "#0000ff", "#0000ff", "#ff0000"]);
    assert.equal(plan.sampleSpec.kind, "gradient");
    assert.equal(color.sampleSpecAt(plan.sampleSpec, 100, 20), "#ff0000");
    assert.equal(color.sampleSpecAt(plan.sampleSpec, 100, 60), "#0000ff");
    assert.equal(color.sampleSpecAt(plan.sampleSpec, 100, 68), "#0000ff");
    assert.equal(color.sampleSpecAt(plan.sampleSpec, 100, 108), "#ff0000");
    // 台 1（A上/B上之间）：L1|L2 拼色；台 2（B下/A下之间）：L2|L1 拼色（50% 硬切换）
    assert.equal(plan.templatePlatformSpecs[0].kind, "gradient");
    assert.deepEqual(plan.templatePlatformSpecs[0].gradientDef.stops.map((s) => s.color), ["#ff0000", "#ff0000", "#0000ff", "#0000ff"]);
    assert.equal(plan.templatePlatformSpecs[1].kind, "gradient");
    assert.deepEqual(plan.templatePlatformSpecs[1].gradientDef.stops.map((s) => s.color), ["#0000ff", "#0000ff", "#ff0000", "#ff0000"]);
    // 渐变必须覆盖站台实际位置（否则 userSpaceOnUse 下站台区域钳到纯色），且 id 按索引唯一
    assert.equal(plan.templatePlatformSpecs[0].gradientDef.id, "grad-modplat-m1-0");
    assert.equal(plan.templatePlatformSpecs[0].gradientDef.y1, 32);
    assert.equal(plan.templatePlatformSpecs[0].gradientDef.y2, 48);
    assert.equal(plan.templatePlatformSpecs[1].gradientDef.id, "grad-modplat-m1-1");
    assert.equal(plan.templatePlatformSpecs[1].gradientDef.y1, 80);
    assert.equal(plan.templatePlatformSpecs[1].gradientDef.y2, 96);
  });

  test("cross-platform pattern with one line: unmatched pattern slots fall back to gray, platforms collapse to the line color", () => {
    const lines = [sourceLine("L1", "#00AA00")];
    const plan = color.resolveModuleColorPlan(module("m1", ["L1"], "line"), lines, 200, crossPlatformTracks, crossPlatformTemplates, { minY: 20, maxY: 108 }, crossPlatformPattern);
    assert.deepEqual(plan.trackColors, ["#00aa00", "#202124", "#202124", "#00aa00"]);
    // 台 1 上下均为 L1 → 退化为纯色
    assert.equal(plan.templatePlatformSpecs[0].kind, "solid");
    assert.equal(plan.templatePlatformSpecs[0].css, "#00aa00");
    assert.equal(plan.templatePlatformSpecs[1].kind, "solid");
    assert.equal(plan.templatePlatformSpecs[1].css, "#00aa00");
  });
});

describe("templateTrackYBounds", () => {
  test("computes min/max across track endpoints and control points", () => {
    const tracks = [
      { y1: 36, y2: 76 },
      { y1: 30, y2: 80, cy: 10, cy2: 100 },
    ];
    assert.deepEqual(color.templateTrackYBounds(tracks), { minY: 10, maxY: 100 });
  });

  test("returns undefined for no tracks", () => {
    assert.equal(color.templateTrackYBounds([]), undefined);
  });
});

describe("resolveLabelFillColor", () => {
  const coloredModule = { css: "#ff0000", kind: "solid" };
  const gradientModule = { css: "url(#grad-mod-m1)", kind: "gradient", gradientDef: { id: "grad-mod-m1", x1: 0, y1: 0, x2: 0, y2: 40, stops: [{ offset: "0%", color: "#ff0000" }, { offset: "100%", color: "#0000ff" }] } };
  const defaultModule = { css: color.DEFAULT_TRACK_COLOR, kind: "solid" };

  test("default mode returns the label's own fill unchanged", () => {
    const spec = color.resolveLabelFillColor({ colorMode: "default", fill: "#00aa00" }, coloredModule);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#00aa00");
  });

  test("default mode with no fill falls back to the default label fill", () => {
    const spec = color.resolveLabelFillColor({ colorMode: "default" }, coloredModule);
    assert.equal(spec.css, color.DEFAULT_LABEL_FILL);
  });

  test("line mode with a colored solid module takes that module's color", () => {
    const spec = color.resolveLabelFillColor({ colorMode: "line" }, coloredModule);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#ff0000");
  });

  test("line mode with a gradient module takes the effective (first stop) color", () => {
    const spec = color.resolveLabelFillColor({ colorMode: "line" }, gradientModule);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#ff0000");
  });

  test("line mode with a default-colored module falls back to the label fill", () => {
    const spec = color.resolveLabelFillColor({ colorMode: "line", fill: "#00aa00" }, defaultModule);
    assert.equal(spec.css, "#00aa00");
  });

  test("line mode without an attached module falls back to the label fill", () => {
    const spec = color.resolveLabelFillColor({ colorMode: "line", fill: "#00aa00" }, undefined);
    assert.equal(spec.css, "#00aa00");
  });

  test("module labelColorMode line drives attached labels without an explicit mode", () => {
    const spec = color.resolveLabelFillColor({ fill: "#00aa00" }, coloredModule, undefined, "line");
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#ff0000");
  });

  test("explicit label colorMode overrides the module labelColorMode", () => {
    const spec = color.resolveLabelFillColor({ colorMode: "default", fill: "#00aa00" }, coloredModule, undefined, "line");
    assert.equal(spec.css, "#00aa00");
  });

  test("module labelColorMode default keeps the label fill", () => {
    const spec = color.resolveLabelFillColor({ fill: "#00aa00" }, coloredModule, undefined, "default");
    assert.equal(spec.css, "#00aa00");
  });

  test("no explicit mode defaults to line-following for an attached colored module", () => {
    const spec = color.resolveLabelFillColor({ fill: "#00aa00" }, coloredModule);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#ff0000");
  });

  test("no explicit mode without an attached module keeps the label fill", () => {
    const spec = color.resolveLabelFillColor({ fill: "#00aa00" }, undefined);
    assert.equal(spec.css, "#00aa00");
  });
});

describe("darkenHex", () => {
  test("darkens each channel by the factor", () => {
    assert.equal(color.darkenHex("#ffffff"), "#cccccc");
    assert.equal(color.darkenHex("#ff0000"), "#cc0000");
    assert.equal(color.darkenHex("#0000ff"), "#0000cc");
  });

  test("passes through invalid input unchanged", () => {
    assert.equal(color.darkenHex("rgb(255,0,0)"), "rgb(255,0,0)");
  });
});

describe("resolveConnectionColor", () => {
  const fromPos = { x: 0, y: 0 };
  const toPos = { x: 200, y: 0 };

  test("auto mode with same-colored endpoints returns a solid color", () => {
    const spec = color.resolveConnectionColor("auto", undefined, "#FF0000", "#FF0000", fromPos, toPos, "c1");
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#ff0000");
  });

  test("auto mode with different-colored endpoints returns a gradient along the track", () => {
    const spec = color.resolveConnectionColor("auto", undefined, "#FF0000", "#0000FF", fromPos, toPos, "c1");
    assert.equal(spec.kind, "gradient");
    assert.equal(spec.gradientDef.id, "grad-conn-c1");
    assert.deepEqual(spec.gradientDef.stops.map((s) => s.color), ["#ff0000", "#0000ff"]);
    // 渐变轴沿连接方向：from → to
    assert.equal(spec.gradientDef.x1, 0);
    assert.equal(spec.gradientDef.y1, 0);
    assert.equal(spec.gradientDef.x2, 200);
    assert.equal(spec.gradientDef.y2, 0);
  });

  test("auto mode with both default endpoints stays default", () => {
    const spec = color.resolveConnectionColor("auto", undefined, color.DEFAULT_TRACK_COLOR, color.DEFAULT_TRACK_COLOR, fromPos, toPos, "c1");
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, color.DEFAULT_TRACK_COLOR);
  });

  test("manual mode returns the manually chosen color", () => {
    const spec = color.resolveConnectionColor("manual", "#00FF00", "#FF0000", "#0000FF", fromPos, toPos, "c1");
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#00ff00");
  });

  test("default mode (undefined) behaves as auto", () => {
    const spec = color.resolveConnectionColor(undefined, undefined, "#FF0000", "#0000FF", fromPos, toPos, "c1");
    assert.equal(spec.kind, "gradient");
  });
});

describe("resolvePlatformFillColor", () => {
  test("default mode returns the platform's own fill unchanged", () => {
    const spec = color.resolvePlatformFillColor(platform("p1", "#D7B06A"), [], []);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#D7B06A");
  });

  test("line mode with a single-line owning module returns that line color", () => {
    const lines = [sourceLine("L1", "#FF0000")];
    const mods = [module("m1", ["L1"])];
    const spec = color.resolvePlatformFillColor(platform("p1", "#D7B06A", "line", undefined, "m1"), mods, lines);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#ff0000");
  });

  test("line mode with a dual-line owning module returns a vertical gradient", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const mods = [module("m1", ["L1", "L2"])];
    const spec = color.resolvePlatformFillColor(platform("p1", "#D7B06A", "line", undefined, "m1"), mods, lines);
    assert.equal(spec.kind, "gradient");
    assert.equal(spec.gradientDef.id, "grad-plat-p1");
    assert.deepEqual(spec.gradientDef.stops.map((s) => s.color), ["#ff0000", "#ff0000", "#0000ff", "#0000ff"]);
    // 双线站台拼色竖直：上边为线路 0、下边为线路 1（50% 硬切换，无过渡）
    assert.equal(spec.gradientDef.x1, 60);
    assert.equal(spec.gradientDef.x2, 60);
    assert.equal(spec.gradientDef.y1, 0);
    assert.equal(spec.gradientDef.y2, 20);
  });

  test("line mode with a three-line owning module keeps a single island solid (first line)", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#00FF00"), sourceLine("L3", "#0000FF")];
    const mods = [module("m1", ["L1", "L2", "L3"])];
    const spec = color.resolvePlatformFillColor(platform("p1", "#D7B06A", "line", undefined, "m1"), mods, lines);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#ff0000");
  });

  test("line mode double-island module: each island platform gets its own line color (solid)", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const mods = [module("m1", ["L1", "L2"])];
    const p1 = platform("p1", "#D7B06A", "line", undefined, "m1");
    const p2 = platform("p2", "#D7B06A", "line", undefined, "m1");
    p1.y = 20;
    p2.y = 80;
    const top = color.resolvePlatformFillColor(p1, mods, lines, undefined, [p1, p2]);
    const bottom = color.resolvePlatformFillColor(p2, mods, lines, undefined, [p1, p2]);
    assert.equal(top.kind, "solid");
    assert.equal(top.css, "#ff0000");
    assert.equal(bottom.kind, "solid");
    assert.equal(bottom.css, "#0000ff");
  });

  test("line mode without an owning module uses sourceLineId", () => {
    const lines = [sourceLine("L1", "#00FF00")];
    const spec = color.resolvePlatformFillColor(platform("p1", "#D7B06A", "line", "L1"), [], lines);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#00ff00");
  });

  test("line mode without any line reference falls back to default fill", () => {
    const spec = color.resolvePlatformFillColor(platform("p1", "#D7B06A", "line"), [], []);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, color.DEFAULT_PLATFORM_FILL);
  });

  test("no explicit color mode defaults to line-following via the owning module", () => {
    const lines = [sourceLine("L1", "#FF0000")];
    const mods = [module("m1", ["L1"])];
    const p = platform("p1", "#D7B06A", "line", undefined, "m1");
    delete p.colorMode;
    const spec = color.resolvePlatformFillColor(p, mods, lines);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, "#ff0000");
  });

  test("no explicit color mode without any line reference falls back to default fill", () => {
    const p = platform("p1", "#D7B06A");
    delete p.colorMode;
    const spec = color.resolvePlatformFillColor(p, [], []);
    assert.equal(spec.kind, "solid");
    assert.equal(spec.css, color.DEFAULT_PLATFORM_FILL);
  });

  // 同台换乘（cross_platform）：2 个物化岛式站台 + trackLinePattern=[0,1,1,0]，
  // 每个站台按上下相邻轨道取渐变（而非多岛逐岛纯色）
  const crossPlatformTracks = [
    { x1: 0, y1: 20, x2: 200, y2: 20, type: "main" },
    { x1: 0, y1: 60, x2: 200, y2: 60, type: "main" },
    { x1: 0, y1: 68, x2: 200, y2: 68, type: "main" },
    { x1: 0, y1: 108, x2: 200, y2: 108, type: "main" },
  ];
  const crossPlatformTemplates = [
    { x: 10, y: 32, width: 180, height: 16, type: "island" },
    { x: 10, y: 80, width: 180, height: 16, type: "island" },
  ];
  const crossPlatformPattern = [0, 1, 1, 0];
  function crossPlatformIsland(id, y) {
    const p = platform(id, "#D7B06A", "line", undefined, "m1");
    p.y = y;
    p.width = 180;
    p.height = 16;
    return p;
  }

  test("line mode cross-platform module: each island gets the adjacent-track gradient", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const mods = [module("m1", ["L1", "L2"])];
    const p1 = crossPlatformIsland("p1", 32);
    const p2 = crossPlatformIsland("p2", 80);
    const top = color.resolvePlatformFillColor(p1, mods, lines, undefined, [p1, p2], crossPlatformTracks, crossPlatformTemplates, crossPlatformPattern);
    const bottom = color.resolvePlatformFillColor(p2, mods, lines, undefined, [p1, p2], crossPlatformTracks, crossPlatformTemplates, crossPlatformPattern);
    // 台 1（A上/B上之间）：L1|L2 拼色（50% 硬切换）
    assert.equal(top.kind, "gradient");
    assert.equal(top.gradientDef.id, "grad-plat-p1");
    assert.deepEqual(top.gradientDef.stops.map((s) => s.color), ["#ff0000", "#ff0000", "#0000ff", "#0000ff"]);
    // 物化站台在本地原点绘制，拼色 0..height 覆盖站台自身
    assert.equal(top.gradientDef.y1, 0);
    assert.equal(top.gradientDef.y2, 16);
    // 台 2（B下/A下之间）：L2|L1 拼色
    assert.equal(bottom.kind, "gradient");
    assert.equal(bottom.gradientDef.id, "grad-plat-p2");
    assert.deepEqual(bottom.gradientDef.stops.map((s) => s.color), ["#0000ff", "#0000ff", "#ff0000", "#ff0000"]);
    // 双色拼色 → 渲染时拆成两个半宽站台，各占一色
    assert.equal(color.isTwoToneSpec(top), true);
    assert.deepEqual(color.twoToneColors(top), ["#ff0000", "#0000ff"]);
    assert.equal(color.isTwoToneSpec(bottom), true);
    assert.deepEqual(color.twoToneColors(bottom), ["#0000ff", "#ff0000"]);
  });

  test("rotated and mirrored cross-platform stations keep platform halves aligned with reordered tracks", () => {
    const lines = [sourceLine("L1", "#FFC600"), sourceLine("L2", "#FF00FF")];
    const owner = module("m1", ["L2", "L1"]);
    owner.trackColorMode = "line";
    owner.x = 100;
    owner.y = 200;
    owner.rotation = 180;
    const physicalTopTemplate = crossPlatformIsland("template-top", 280);
    physicalTopTemplate.rotation = 180;
    const physicalBottomTemplate = crossPlatformIsland("template-bottom", 232);
    physicalBottomTemplate.rotation = 180;
    const size = { width: 200, height: 128 };

    const plan = color.resolveModuleColorPlan(owner, lines, 200, crossPlatformTracks, crossPlatformTemplates, { minY: 20, maxY: 108 }, crossPlatformPattern);
    assert.deepEqual(plan.trackColors, ["#ff00ff", "#ffc600", "#ffc600", "#ff00ff"]);

    // 旋转 180° 后，画布上方的物化站台实际来自模板下方站台，不能再按世界 Y 排序误配。
    const rotated = color.resolvePlatformFillColor(
      physicalBottomTemplate,
      [owner],
      lines,
      undefined,
      [physicalTopTemplate, physicalBottomTemplate],
      crossPlatformTracks,
      crossPlatformTemplates,
      crossPlatformPattern,
      size,
    );
    assert.deepEqual(color.twoToneColors(rotated), ["#ffc600", "#ff00ff"]);
    assert.deepEqual(color.platformLineNames(
      physicalBottomTemplate,
      [owner],
      lines,
      [physicalTopTemplate, physicalBottomTemplate],
      crossPlatformTracks,
      crossPlatformTemplates,
      crossPlatformPattern,
      size,
    ), ["L2", "L1"]);

    // 纵向镜像会交换模板上下方向，但物化矩形本身保持 0°，双色半区也要反转补偿。
    const mirroredOwner = { ...owner, rotation: 0, mirrorY: true };
    const mirroredTop = { ...physicalBottomTemplate, id: "mirrored-top", rotation: 0 };
    const mirroredBottom = { ...physicalTopTemplate, id: "mirrored-bottom", rotation: 0 };
    const mirrored = color.resolvePlatformFillColor(
      mirroredTop,
      [mirroredOwner],
      lines,
      undefined,
      [mirroredTop, mirroredBottom],
      crossPlatformTracks,
      crossPlatformTemplates,
      crossPlatformPattern,
      size,
    );
    assert.deepEqual(color.twoToneColors(mirrored), ["#ff00ff", "#ffc600"]);
  });

  test("isTwoToneSpec is false when both halves share the same color", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#FF0000")];
    const mods = [module("m1", ["L1", "L2"])];
    const p1 = crossPlatformIsland("p1", 32);
    const top = color.resolvePlatformFillColor(p1, mods, lines, undefined, [p1], crossPlatformTracks, crossPlatformTemplates, crossPlatformPattern);
    // 上下两半同色时直接塌缩为纯色，不拆两个站台
    assert.equal(top.kind, "solid");
    assert.equal(color.isTwoToneSpec(top), false);
    assert.equal(color.twoToneColors(top), undefined);
  });

  test("line mode cross-platform with a single line collapses both islands to that color", () => {
    const lines = [sourceLine("L1", "#00AA00")];
    const mods = [module("m1", ["L1"])];
    const p1 = crossPlatformIsland("p1", 32);
    const p2 = crossPlatformIsland("p2", 80);
    const top = color.resolvePlatformFillColor(p1, mods, lines, undefined, [p1, p2], crossPlatformTracks, crossPlatformTemplates, crossPlatformPattern);
    const bottom = color.resolvePlatformFillColor(p2, mods, lines, undefined, [p1, p2], crossPlatformTracks, crossPlatformTemplates, crossPlatformPattern);
    assert.equal(top.kind, "solid");
    assert.equal(top.css, "#00aa00");
    assert.equal(bottom.kind, "solid");
    assert.equal(bottom.css, "#00aa00");
    assert.equal(color.isTwoToneSpec(top), false);
  });

  test("platformLineNames: cross-platform islands get their adjacent line names", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const mods = [module("m1", ["L1", "L2"])];
    const p1 = crossPlatformIsland("p1", 32);
    const p2 = crossPlatformIsland("p2", 80);
    assert.deepEqual(color.platformLineNames(p1, mods, lines, [p1, p2], crossPlatformTracks, crossPlatformTemplates, crossPlatformPattern), ["L1", "L2"]);
    assert.deepEqual(color.platformLineNames(p2, mods, lines, [p1, p2], crossPlatformTracks, crossPlatformTemplates, crossPlatformPattern), ["L2", "L1"]);
  });

  test("platformLineNames: single-island two-line shows both line names; single line one name", () => {
    const lines = [sourceLine("L1", "#FF0000"), sourceLine("L2", "#0000FF")];
    const mods = [module("m1", ["L1", "L2"])];
    const p = platform("p1", "#D7B06A", "line", undefined, "m1");
    // 单岛两线 → 两条线路名
    assert.deepEqual(color.platformLineNames(p, mods, lines, [p]), ["L1", "L2"]);
    // 仅一条线 → 单个线路名
    const single = [module("m2", ["L1"])];
    const p2 = platform("p2", "#D7B06A", "line", undefined, "m2");
    assert.deepEqual(color.platformLineNames(p2, single, lines, [p2]), ["L1"]);
  });

  test("platformLineNames: no lines configured keeps original hint text (undefined)", () => {
    const lines = [sourceLine("L1", "#FF0000")];
    const mods = [module("m1", [])];
    const p = crossPlatformIsland("p1", 32);
    assert.equal(color.platformLineNames(p, mods, lines, [p], crossPlatformTracks, crossPlatformTemplates, crossPlatformPattern), undefined);
  });
});
