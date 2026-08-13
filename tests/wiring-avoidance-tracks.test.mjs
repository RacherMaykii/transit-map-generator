import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const templates = await server.ssrLoadModule("/app/wiring/templates.ts");
const color = await server.ssrLoadModule("/app/wiring/color.ts");
after(() => server.close());

function template(id) {
  const value = templates.MODULE_TEMPLATES.find((candidate) => candidate.id === id);
  assert.ok(value, `missing template ${id}`);
  return value;
}

test("avoidance tracks are derived inside station modules without adding ports", () => {
  for (const [id, addedCount] of [["island_platform", 6], ["side_platform", 6], ["cross_platform", 12]]) {
    const base = template(id);
    const resolved = templates.withAvoidanceTracks(base, 2);
    assert.deepEqual(resolved.ports, base.ports);
    assert.equal(resolved.tracks.length, base.tracks.length + addedCount);
    assert.equal(resolved.trackLinePattern.length, resolved.tracks.length);
    for (const track of resolved.tracks.slice(base.tracks.length)) {
      assert.equal(track.type, "siding");
      assert.ok(track.x1 > 0 && track.x1 < base.width);
      assert.ok(track.x2 > 0 && track.x2 < base.width);
    }
  }
});

test("island, side and cross-platform templates use their required avoidance positions", () => {
  const bypassYs = (id) => {
    const base = template(id);
    const tracks = templates.withAvoidanceTracks(base, 2).tracks.slice(base.tracks.length);
    return [...new Set(tracks.flatMap((track) => [track.y1, track.y2]).filter((y) => !base.tracks.some((main) => main.y1 === y)))].sort((a, b) => a - b);
  };
  assert.deepEqual(bypassYs("island_platform"), [26, 86]);
  assert.deepEqual(bypassYs("side_platform"), [48, 64]);
  assert.deepEqual(bypassYs("cross_platform"), [10, 52, 76, 118]);
});

test("resolved templates only enable avoidance tracks for opted-in supported modules", () => {
  const baseMap = new Map(templates.MODULE_TEMPLATES.map((item) => [item.id, item]));
  const module = {
    id: "station-1", templateId: "island_platform", name: "Station", x: 0, y: 0,
    rotation: 0, lineIds: ["L1"], sourceStationIds: [], locked: false, layerId: "stations", zIndex: 1,
    avoidanceTracks: true,
  };
  const resolved = templates.buildResolvedTemplateMap(baseMap, [module]);
  assert.equal(resolved.get(module.id).tracks.length, template("island_platform").tracks.length + 6);
  assert.equal(resolved.get(module.id).ports.length, template("island_platform").ports.length);
});

test("avoidance tracks inherit the color of their nearest main line", () => {
  const base = template("island_platform");
  const resolved = templates.withAvoidanceTracks(base, 2);
  const module = { id: "station-1", lineIds: ["L1", "L2"], trackColorMode: "line" };
  const lines = [{ id: "L1", lineColor: "#ff0000" }, { id: "L2", lineColor: "#0000ff" }];
  const plan = color.resolveModuleColorPlan(module, lines, resolved.width, resolved.tracks, resolved.platforms, undefined, resolved.trackLinePattern);
  assert.deepEqual(plan.trackColors.slice(0, 2), ["#ff0000", "#0000ff"]);
  assert.ok(plan.trackColors.slice(2, 5).every((value) => value === "#ff0000"));
  assert.ok(plan.trackColors.slice(5, 8).every((value) => value === "#0000ff"));
});
