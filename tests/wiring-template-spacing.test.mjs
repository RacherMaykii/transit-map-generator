import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const templates = await server.ssrLoadModule("/app/wiring/templates.ts");
after(() => server.close());

function template(id) {
  const value = templates.MODULE_TEMPLATES.find((candidate) => candidate.id === id);
  assert.ok(value, `missing template ${id}`);
  return value;
}

/** 用指定 customParams 定制模板；不传则用参数默认值 */
function customized(id, customParams) {
  const base = template(id);
  return templates.makeCustomizedTemplate(base, customParams ?? {});
}

const RAIL_IDS = ["double_track", "side_platform", "island_platform", "spanish_platform", "cross_platform"];

test("线路间距模板在默认参数下精确复现静态几何（轨道/端口/站台/站名）", () => {
  for (const id of RAIL_IDS) {
    const base = template(id);
    const resolved = customized(id);
    assert.equal(resolved.width, base.width, `${id} width`);
    assert.equal(resolved.height, base.height, `${id} height`);
    assert.deepEqual(resolved.tracks.map((t) => [t.y1, t.y2]), base.tracks.map((t) => [t.y1, t.y2]), `${id} track Ys`);
    assert.deepEqual(resolved.ports.map((p) => p.y), base.ports.map((p) => p.y), `${id} port Ys`);
    assert.deepEqual(resolved.platforms.map((p) => p.y), base.platforms.map((p) => p.y), `${id} platform Ys`);
    assert.deepEqual(resolved.labels.map((l) => l.y), base.labels.map((l) => l.y), `${id} label Ys`);
  }
});

test("双线区间加大间距：上下行围绕中线对称拉开，端口与轨道一致", () => {
  const base = template("double_track");
  const resolved = customized("double_track", { spacing: 80 });
  assert.equal(resolved.height, 152);
  const upY = resolved.tracks[0].y1;
  const downY = resolved.tracks[1].y1;
  assert.equal(upY, 16);
  assert.equal(downY, 96);
  assert.equal(downY - upY, 80);
  // 端口 y 必须与轨道一致（连接端点才不会和渲染轨道脱节）
  assert.deepEqual(resolved.ports.map((p) => p.y), [16, 96, 16, 96]);
});

test("侧式站台加大间距：两条站台与站名都跟随轨道外扩，避开轨道", () => {
  const resolved = customized("side_platform", { spacing: 80 });
  assert.equal(resolved.height, 152);
  assert.deepEqual(resolved.tracks.map((t) => t.y1), [16, 96]);
  // 站台紧贴轨道外侧（上站台在上行轨上方，下站台在下行轨下方）
  assert.deepEqual(resolved.platforms.map((p) => p.y), [-4, 100]);
  // 站名/Station 在站台之外再外扩
  assert.deepEqual(resolved.labels.map((l) => l.y), [-6, 125]);
});

test("岛式站台加大间距：站台保持居中，站名跟随轨道移动", () => {
  const resolved = customized("island_platform", { spacing: 80 });
  assert.equal(resolved.height, 152);
  assert.deepEqual(resolved.tracks.map((t) => t.y1), [16, 96]);
  assert.deepEqual(resolved.platforms.map((p) => p.y), [48]);
  // 站名贴在上行轨上方、Station 贴在下行轨下方
  assert.deepEqual(resolved.labels.map((l) => l.y), [10, 120]);
});

test("西班牙式站台加大间距：三站台各就各位、站名跟随", () => {
  const resolved = customized("spanish_platform", { spacing: 80 });
  assert.equal(resolved.height, 152);
  assert.deepEqual(resolved.tracks.map((t) => t.y1), [16, 96]);
  assert.deepEqual(resolved.platforms.map((p) => p.y), [-4, 48, 100]);
  assert.deepEqual(resolved.labels.map((l) => l.y), [-6, 125]);
});

test("同台换乘加大间距：下组岛台/下行走线随间距下移，上组固定", () => {
  const resolved = customized("cross_platform", { spacing: 64 });
  assert.equal(resolved.height, 160);
  // 上行1/上行2/下行2/下行1 四线：上组不动，下组整体下移 spacing
  assert.deepEqual(resolved.tracks.map((t) => t.y1), [20, 60, 100, 140]);
  assert.deepEqual(resolved.ports.map((p) => p.y), [20, 60, 100, 140, 20, 60, 100, 140]);
  assert.deepEqual(resolved.platforms.map((p) => p.y), [32, 112]);
  assert.deepEqual(resolved.labels.map((l) => l.y), [14, 152]);
});

test("避让线跟随自定义线路间距（不再写死 36/76）", () => {
  // 默认间距 40：mains=[36,76]，避让线仍为静态默认位
  const side = templates.withAvoidanceTracks(customized("side_platform", {}), 2);
  const sideBypass = [...new Set(side.tracks.filter((t) => t.type === "siding").flatMap((t) => [t.y1, t.y2]).filter((y) => ![36, 76].includes(y)))];
  assert.deepEqual(sideBypass, [48, 64]);

  // 间距 80：mains=[16,96]，避让线应位于 28/84（跟随新间距）
  const wide = templates.withAvoidanceTracks(customized("side_platform", { spacing: 80 }), 2);
  const wideMains = wide.tracks.filter((t) => t.type === "main").map((t) => t.y1);
  assert.deepEqual(wideMains, [16, 96]);
  const bypassY = [...new Set(wide.tracks.filter((t) => t.type === "siding").flatMap((t) => [t.y1, t.y2]).filter((y) => ![16, 96].includes(y)))];
  assert.deepEqual(bypassY, [28, 84]);

  // 同台换乘间距 64：mains=[20,60,100,140]，避让线 10/52/108/150
  const cross = templates.withAvoidanceTracks(customized("cross_platform", { spacing: 64 }), 2);
  const crossBypass = [...new Set(cross.tracks.filter((t) => t.type === "siding").flatMap((t) => [t.y1, t.y2]).filter((y) => ![20, 60, 100, 140].includes(y)))];
  assert.deepEqual(crossBypass, [10, 52, 108, 150]);
});

test("buildResolvedTemplateMap 对带参数的模块应用定制 + 避让线", () => {
  const baseMap = new Map(templates.MODULE_TEMPLATES.map((item) => [item.id, item]));
  const module = {
    id: "station-1", templateId: "side_platform", name: "Station", x: 0, y: 0,
    rotation: 0, lineIds: ["L1"], sourceStationIds: [], locked: false, layerId: "stations", zIndex: 1,
    customParams: { spacing: 80 }, avoidanceTracks: true,
  };
  const resolved = templates.buildResolvedTemplateMap(baseMap, [module]);
  const r = resolved.get(module.id);
  assert.ok(r);
  // 定制后的主轨在 16/96，避让线插入正线之间 28/84
  assert.deepEqual(r.tracks.filter((t) => t.type === "main").map((t) => t.y1), [16, 96]);
  assert.ok(r.tracks.some((t) => t.type === "siding" && (t.y1 === 28 || t.y2 === 28)));
  assert.ok(r.tracks.some((t) => t.type === "siding" && (t.y1 === 84 || t.y2 === 84)));
});
