import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

// Load the production TypeScript module through the project's existing Vite
// transform pipeline, so these tests execute the same pure logic as the UI.
const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const logic = await server.ssrLoadModule("/app/wiring/connectionLogic.ts");
const types = await server.ssrLoadModule("/app/wiring/types.ts");
const templateDefinitions = await server.ssrLoadModule("/app/wiring/templates.ts");
after(() => server.close());

const template = {
  id: "standard",
  name: "Standard",
  category: "section",
  categoryName: "Section",
  width: 180,
  height: 112,
  ports: [
    { id: "L_up", name: "left up", side: "left", role: "up_main", x: 0, y: 36, direction: 180 },
    { id: "L_dn", name: "left down", side: "left", role: "down_main", x: 0, y: 76, direction: 180 },
    { id: "R_up", name: "right up", side: "right", role: "up_main", x: 180, y: 36, direction: 0 },
    { id: "R_dn", name: "right down", side: "right", role: "down_main", x: 180, y: 76, direction: 0 },
  ],
  tracks: [],
  platforms: [],
  labels: [],
};

function module(id, x, y, rotation = 0) {
  return { id, templateId: template.id, name: id, x, y, rotation, lineIds: [], sourceStationIds: [], locked: false, layerId: "layer-track-main", zIndex: 0 };
}

const templates = new Map([[template.id, template]]);

function connection(overrides = {}) {
  return {
    id: "c",
    fromModuleId: "a",
    fromPortId: "R_up",
    toModuleId: "b",
    toPortId: "L_up",
    tracks: [],
    crossingType: "plain",
    crossingPoints: [],
    controlPoints: [],
    autoCurve: true,
    layerId: "layer-track-main",
    zIndex: 0,
    ...overrides,
  };
}

function assertParallel(vector, direction, message) {
  const radians = (direction * Math.PI) / 180;
  const expected = { x: Math.cos(radians), y: Math.sin(radians) };
  const length = Math.hypot(vector.x, vector.y);
  assert.ok(length > 0, `${message}: tangent must not be zero`);
  assert.ok(Math.abs(vector.x * expected.y - vector.y * expected.x) < 1e-8, `${message}: tangent is not parallel to port direction`);
  assert.ok(vector.x * expected.x + vector.y * expected.y > 0, `${message}: tangent points the wrong way`);
}

function samplePathD(d, steps = 80) {
  const cmd = d.match(/[MLC][\d.,\s-]+/g) || [];
  const pts = [];
  let cur = null;
  for (const c of cmd) {
    const nums = c.slice(1).trim().split(/[\s,]+/).map(Number);
    if (c[0] === "M") { cur = { x: nums[0], y: nums[1] }; pts.push(cur); }
    else if (c[0] === "L") { cur = { x: nums[0], y: nums[1] }; pts.push(cur); }
    else if (c[0] === "C") {
      const [x1, y1, x2, y2, x3, y3] = nums;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, mt = 1 - t;
        pts.push({
          x: mt * mt * mt * cur.x + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
          y: mt * mt * mt * cur.y + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
        });
      }
      cur = { x: x3, y: y3 };
    }
  }
  return pts;
}

function minCurveDistance(ptsA, ptsB) {
  let m = Infinity;
  for (const a of ptsA) for (const b of ptsB) {
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < m) m = d;
  }
  return m;
}

// Counts proper crossings between two sampled polylines. Endpoint touches are
// not crossings: the two rails legitimately share a module port at each end.
function crossingCount(ptsA, ptsB) {
  const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const onSegment = (p, q, r) => q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  let count = 0;
  for (let i = 0; i < ptsA.length - 1; i++) for (let j = 0; j < ptsB.length - 1; j++) {
    const a = ptsA[i], b = ptsA[i + 1], c = ptsB[j], d = ptsB[j + 1];
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    const touch = (o1 === 0 && onSegment(a, c, b)) || (o2 === 0 && onSegment(a, d, b)) || (o3 === 0 && onSegment(c, a, d)) || (o4 === 0 && onSegment(c, b, d));
    if (touch) continue;
    if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) count++;
  }
  return count;
}

function polylinePoints(d) {
  const values = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  return values.filter((_, index) => index % 2 === 0).map((x, index) => ({ x, y: values[index * 2 + 1] }));
}

function pairedCurveSpacing(bx, by) {
  const moduleList = [module("a", 0, 0), module("b", bx, by)];
  const base = new Map([[template.id, template]]);
  const up = { ...connection({ id: "cu" }), pairedConnectionId: "cd" };
  const dn = { ...connection({ id: "cd", fromPortId: "R_dn", toPortId: "L_dn" }), pairedConnectionId: "cu" };
  const upGeometry = logic.getConnectionGeometry(up, moduleList, base, logic.endpointsForConnection(dn, moduleList, base));
  const dnGeometry = logic.getConnectionGeometry(dn, moduleList, base, logic.endpointsForConnection(up, moduleList, base));
  const upPath = types.buildControlPointPathD(upGeometry.from, upGeometry.to, upGeometry.controlPoints, upGeometry.fromDir, upGeometry.toDir);
  const dnPath = types.buildControlPointPathD(dnGeometry.from, dnGeometry.to, dnGeometry.controlPoints, dnGeometry.fromDir, dnGeometry.toDir);
  return minCurveDistance(samplePathD(upPath), samplePathD(dnPath));
}

test("world port positions use the module top-left origin and match centre rotation", () => {
  assert.deepEqual(types.worldPortPosition(module("a", 100, 200), template, "R_up"), { x: 280, y: 236, direction: 0 });
  assert.deepEqual(types.worldPortPosition(module("a", 100, 200, 90), template, "R_up"), { x: 210, y: 346, direction: 90 });
  assert.deepEqual(types.worldPortPosition(module("a", 100, 200, 180), template, "R_up"), { x: 100, y: 276, direction: 180 });
  assert.deepEqual(types.worldPortPosition(module("a", 100, 200, 270), template, "R_up"), { x: 170, y: 166, direction: 270 });
});

test("mirrored world port positions flip across the module centre and reflect directions", () => {
  const mirroredX = { ...module("a", 100, 200), mirrorX: true };
  assert.deepEqual(types.worldPortPosition(mirroredX, template, "R_up"), { x: 100, y: 236, direction: 180 });
  assert.deepEqual(types.worldPortPosition(mirroredX, template, "L_up"), { x: 280, y: 236, direction: 0 });
  assert.deepEqual(types.worldPortPosition(mirroredX, template, "R_dn"), { x: 100, y: 276, direction: 180 });
  assert.deepEqual(types.worldPortPosition(mirroredX, template, "L_dn"), { x: 280, y: 276, direction: 0 });

  const mirroredY = { ...module("a", 100, 200), mirrorY: true };
  assert.deepEqual(types.worldPortPosition(mirroredY, template, "R_up"), { x: 280, y: 276, direction: 0 });
  assert.deepEqual(types.worldPortPosition(mirroredY, template, "R_dn"), { x: 280, y: 236, direction: 0 });
  assert.deepEqual(types.worldPortPosition(mirroredY, template, "L_up"), { x: 100, y: 276, direction: 180 });
  assert.deepEqual(types.worldPortPosition(mirroredY, template, "L_dn"), { x: 100, y: 236, direction: 180 });

  // 双轴镜像等价于绕模块中心旋转 180°。
  const mirroredBoth = { ...module("a", 100, 200), mirrorX: true, mirrorY: true };
  assert.deepEqual(types.worldPortPosition(mirroredBoth, template, "R_up"), { x: 100, y: 276, direction: 180 });
  assert.deepEqual(types.worldPortPosition(mirroredBoth, template, "L_up"), { x: 280, y: 276, direction: 0 });

  // 旋转与镜像组合：先镜像再旋转。
  const rotatedMirrored = { ...module("a", 100, 200, 90), mirrorX: true };
  assert.deepEqual(types.worldPortPosition(rotatedMirrored, template, "R_up"), { x: 210, y: 166, direction: 270 });
  assert.deepEqual(types.worldPortPosition(rotatedMirrored, template, "L_up"), { x: 210, y: 346, direction: 90 });
});

test("a mirrored module's right port faces a plain module's right port on the left", () => {
  // 水平镜像后 R_up 翻到左边缘且朝左，应与左侧模块的右端口（朝右）对接。
  const mirrored = { ...module("a", 400, 0), mirrorX: true };
  const plainLeft = module("b", 0, 0);
  const from = logic.getConnectionEndpoint("a", "R_up", [plainLeft, mirrored], templates);
  const to = logic.getConnectionEndpoint("b", "R_up", [plainLeft, mirrored], templates);
  assert.ok(logic.endpointsFaceEachOther(from, to));
  assert.deepEqual(logic.validateConnection(from, to, []), { valid: true });
});

test("connection validation enforces role, duplicate, and single-port occupancy", () => {
  const modules = [module("a", 0, 0), module("b", 400, 0)];
  const from = logic.getConnectionEndpoint("a", "R_up", modules, templates);
  const to = logic.getConnectionEndpoint("b", "L_up", modules, templates);
  assert.deepEqual(logic.validateConnection(from, to, []), { valid: true });
  // up_main↔down_main 均为正线角色，现已兼容（portsCompatible 将两者归入 mainRoles）
  assert.deepEqual(logic.validateConnection(from, logic.getConnectionEndpoint("b", "L_dn", modules, templates), []), { valid: true });
  assert.deepEqual(logic.validateConnection(from, logic.getConnectionEndpoint("b", "R_up", modules, templates), []), { valid: true });

  const rotatedModules = [module("a", 0, 0, 90), module("b", 400, 0, 90)];
  assert.deepEqual(
    logic.validateConnection(
      logic.getConnectionEndpoint("a", "R_up", rotatedModules, templates),
      logic.getConnectionEndpoint("b", "L_up", rotatedModules, templates),
      [],
    ),
    { valid: true },
  );

  const connection = { id: "c", fromModuleId: "a", fromPortId: "R_up", toModuleId: "b", toPortId: "L_up", tracks: [], crossingType: "plain", crossingPoints: [], controlPoints: [] };
  assert.deepEqual(logic.validateConnection(from, to, [connection]), { valid: false, reason: "duplicate" });
  assert.deepEqual(logic.validateConnection(logic.getConnectionEndpoint("a", "R_dn", modules, templates), logic.getConnectionEndpoint("b", "L_dn", modules, templates), [connection]), { valid: true });
  assert.equal(types.portsCompatible("branch", "up_main"), true);
  assert.equal(types.portsCompatible("siding", "yard"), true);
});

test("standard up/down pairs are discovered on the same side", () => {
  assert.equal(logic.findDoubleTrackPartner(template, template.ports[2])?.id, "R_dn");
  assert.equal(logic.findDoubleTrackPartner(template, template.ports[1])?.id, "L_up");
});

test("straight derived tracks follow moved module ports", () => {
  const initial = [module("a", 0, 0), module("b", 400, 0)];
  const connection = { id: "c", fromModuleId: "a", fromPortId: "R_up", toModuleId: "b", toPortId: "L_up", tracks: [], crossingType: "plain", crossingPoints: [], controlPoints: [], autoCurve: false };
  assert.deepEqual(logic.getConnectionTracks(connection, initial, templates)[0], { x1: 180, y1: 36, x2: 400, y2: 36, type: "main" });
  const moved = [initial[0], module("b", 520, 80)];
  assert.deepEqual(logic.synchronizeConnectionTracks([connection], moved, templates)[0].tracks[0], { x1: 180, y1: 36, x2: 520, y2: 116, type: "main" });
});

test("connection geometry endpoints exactly follow selected port positions and rotations", () => {
  const modules = [module("a", 100, 200, 90), module("b", 480, 260, 90)];
  const geometry = logic.getConnectionGeometry(connection(), modules, templates);

  assert.ok(geometry);
  const expectedFrom = types.worldPortPosition(modules[0], template, "R_up");
  const expectedTo = types.worldPortPosition(modules[1], template, "L_up");
  assert.deepEqual(geometry.from, { x: expectedFrom.x, y: expectedFrom.y });
  assert.deepEqual(geometry.to, { x: expectedTo.x, y: expectedTo.y });
  assert.equal(geometry.fromDir, 90);
  assert.equal(geometry.toDir, 270);
  assert.deepEqual(
    { x1: geometry.tracks[0].x1, y1: geometry.tracks[0].y1, x2: geometry.tracks.at(-1).x2, y2: geometry.tracks.at(-1).y2 },
    { x1: geometry.from.x, y1: geometry.from.y, x2: geometry.to.x, y2: geometry.to.y },
  );
});

test("automatic curves leave and enter ports on the required opposite tangents", () => {
  const geometry = logic.getConnectionGeometry(connection(), [module("a", 0, 0), module("b", 400, 120)], templates);

  assert.ok(geometry);
  assert.equal(geometry.controlPoints.length, 1);
  assert.ok(geometry.controlPoints.every((point) => point.directionOnly));
  const path = types.buildControlPointPathD(geometry.from, geometry.to, geometry.controlPoints, geometry.fromDir, geometry.toDir);
  assert.doesNotMatch(path, / L/);
  const commands = path.match(/[MC][\d.,\s-]+/g) || [];
  const first = commands[1].slice(1).trim().split(/[\s,]+/).map(Number);
  const last = commands.at(-1).slice(1).trim().split(/[\s,]+/).map(Number);
  assertParallel({ x: first[0] - geometry.from.x, y: first[1] - geometry.from.y }, geometry.fromDir, "start port");
  assertParallel({ x: last[4] - last[2], y: last[5] - last[3] }, (geometry.toDir + 180) % 360, "end port");
});

test("parallel station curves use one chord-aligned middle control point", () => {
  const geometry = logic.getConnectionGeometry(connection(), [module("a", 0, 0), module("b", 400, 120)], templates);

  assert.ok(geometry);
  const [middle] = geometry.controlPoints;
  const chordDirection = Math.atan2(geometry.to.y - geometry.from.y, geometry.to.x - geometry.from.x) * 180 / Math.PI;
  assert.equal(middle.curved, true);
  assert.equal(middle.directionOnly, true);
  assertParallel({ x: Math.cos(middle.tangentDirection * Math.PI / 180), y: Math.sin(middle.tangentDirection * Math.PI / 180) }, chordDirection, "middle tangent");
  assert.deepEqual({ x: middle.x, y: middle.y }, { x: 290, y: 96 });
});

test("perpendicular station orientations use one quadratic 90-degree turn", () => {
  const points = logic.createAutoControlPoints({ x: 0, y: 0 }, { x: 200, y: 200 }, 90, 180);
  assert.equal(points.length, 1);
  assert.ok(Math.abs(points[0].x - 50) < 1e-8 && Math.abs(points[0].y - 150) < 1e-8, "selectable quadratic node must lie halfway along the curve");
  assert.equal(points[0].curveKind, "quadratic");
  assertParallel({ x: Math.cos(points[0].tangentDirection * Math.PI / 180), y: Math.sin(points[0].tangentDirection * Math.PI / 180) }, 45, "quarter-turn middle tangent");
  const path = types.buildControlPointPathD({ x: 0, y: 0 }, { x: 200, y: 200 }, points, 90, 180);
  assert.match(path, / Q0.00,200.00 200.00,200.00/);
  assert.doesNotMatch(path, / C/);
  const manualPath = types.buildControlPointPathD({ x: 0, y: 0 }, { x: 200, y: 200 }, [{ ...points[0], curveKind: undefined, tangentDirection: 0 }], 90, 180);
  assert.match(manualPath, / C/, "removing the automatic primitive restores an editable cubic curve");
});

test("automatic curves use the tangent intersection for every 45-degree station rotation", () => {
  const from = { x: 0, y: 0 };
  const corner = { x: 100, y: 0 };
  for (const arrivalDirection of [45, 90, 135, 225, 270, 315]) {
    const radians = arrivalDirection * Math.PI / 180;
    const to = {
      x: corner.x + Math.cos(radians) * 100,
      y: corner.y + Math.sin(radians) * 100,
    };
    const toOutwardDirection = (arrivalDirection + 180) % 360;
    const points = logic.createAutoControlPoints(from, to, 0, toOutwardDirection);
    assert.equal(points.length, 1, `${arrivalDirection} degrees should have one editable node`);
    assert.equal(points[0].curveKind, "quadratic", `${arrivalDirection} degrees should use one tangent-preserving Bezier turn`);
    const path = types.buildControlPointPathD(from, to, points, 0, toOutwardDirection);
    assert.match(path, / Q100\.00,0\.00 /, `${arrivalDirection} degrees should bend through the two tangent guides' intersection`);
    assert.doesNotMatch(path, / C/, `${arrivalDirection} degrees should not introduce an S-shaped two-cubic fallback`);
  }
});

test("moving a module preserves manual middle nodes while removing legacy endpoint anchors", () => {
  const manualMiddle = { id: "manual", x: 320, y: 180, curved: true, handleX: 36, handleY: 12 };
  const staleAnchors = [
    { id: "old-start", x: 208, y: 40, curved: true, handleX: 28, handleY: 0, implicit: true },
    manualMiddle,
    { id: "old-end", x: 372, y: 40, curved: true, handleX: -28, handleY: 0, implicit: true },
  ];
  const initial = [module("a", 0, 0), module("b", 400, 0)];
  const moved = [initial[0], module("b", 520, 80, 90)];
  const synchronized = logic.synchronizeConnectionTracks([
    connection({ autoCurve: false, controlPoints: staleAnchors }),
  ], moved, templates)[0];
  const geometry = logic.getConnectionGeometry(synchronized, moved, templates);

  assert.ok(geometry);
  assert.equal(synchronized.controlPoints.length, 1);
  assert.equal(synchronized.controlPoints[0].id, manualMiddle.id);
  assert.deepEqual({ x: synchronized.controlPoints[0].x, y: synchronized.controlPoints[0].y }, { x: manualMiddle.x, y: manualMiddle.y });
  assert.equal(synchronized.controlPoints[0].directionOnly, true);
  assertParallel(
    { x: Math.cos(synchronized.controlPoints[0].tangentDirection * Math.PI / 180), y: Math.sin(synchronized.controlPoints[0].tangentDirection * Math.PI / 180) },
    Math.atan2(manualMiddle.handleY, manualMiddle.handleX) * 180 / Math.PI,
    "legacy manual handle direction",
  );
  const movedTargetPort = types.worldPortPosition(moved[1], template, "L_up");
  assert.deepEqual(geometry.to, { x: movedTargetPort.x, y: movedTargetPort.y });
  assert.equal(geometry.toDir, 270);
  const path = types.buildControlPointPathD(geometry.from, geometry.to, geometry.controlPoints, geometry.fromDir, geometry.toDir);
  assert.match(path, / C/);
});

test("direction-only handles shrink to the local segment near a station", () => {
  const point = { id: "near", x: 4, y: 2, curved: true, handleX: 18, handleY: 0, directionOnly: true, tangentDirection: 0 };
  const path = types.buildControlPointPathD({ x: 0, y: 0 }, { x: 300, y: 180 }, [point], 0, 270);
  const values = (path.match(/-?\d+\.\d+/g) || []).map(Number);
  const firstHandleLength = Math.hypot(values[2] - values[0], values[3] - values[1]);
  assert.ok(firstHandleLength <= Math.hypot(point.x, point.y) * 0.29);
  assert.doesNotMatch(path, / L/);
});

test("turnback stations use a full double crossover", () => {
  for (const id of ["pre_turnback", "post_turnback"]) {
    const turnback = templateDefinitions.MODULE_TEMPLATES.find((item) => item.id === id);
    const crossovers = turnback.tracks.filter((track) => track.type === "turnback");
    assert.equal(crossovers.length, 2);
    assert.ok(crossovers.some((track) => track.y1 < track.y2));
    assert.ok(crossovers.some((track) => track.y1 > track.y2));
    assert.equal(crossovers[0].x1, crossovers[1].x1);
    assert.equal(crossovers[0].x2, crossovers[1].x2);
  }
});

test("turnback platforms stay outside the crossover and support length and width parameters", () => {
  const baseTemplates = new Map(templateDefinitions.MODULE_TEMPLATES.map((item) => [item.id, item]));
  for (const templateId of ["pre_turnback", "post_turnback"]) {
    const base = baseTemplates.get(templateId);
    assert.deepEqual(base.params.map((param) => param.key), ["platformLength", "platformWidth"]);
    const resolved = templateDefinitions.buildResolvedTemplateMap(baseTemplates, [{
      ...module(templateId, 0, 0),
      templateId,
      customParams: { platformLength: 160, platformWidth: 24 },
    }]).get(templateId);
    const platform = resolved.platforms[0];
    const crossover = resolved.tracks.filter((track) => track.type === "turnback");
    const crossoverStart = Math.min(...crossover.flatMap((track) => [track.x1, track.x2]));
    const crossoverEnd = Math.max(...crossover.flatMap((track) => [track.x1, track.x2]));
    assert.equal(platform.width, 160);
    assert.equal(platform.height, 24);
    assert.equal(resolved.width, 280);
    if (templateId === "pre_turnback") assert.ok(crossoverEnd < platform.x);
    else assert.ok(platform.x + platform.width < crossoverStart);
  }
});

test("siding modules expose only the through main line", () => {
  for (const templateId of ["single_siding", "double_siding"]) {
    const siding = templateDefinitions.MODULE_TEMPLATES.find((item) => item.id === templateId);
    assert.deepEqual(siding.ports.map((port) => port.id), ["L_main", "R_main"]);
    assert.deepEqual(siding.ports.map((port) => port.direction), [180, 0]);
  }
});

test("siding branches form a straight in-and-out storage loop", () => {
  for (const templateId of ["single_siding", "double_siding"]) {
    const siding = templateDefinitions.MODULE_TEMPLATES.find((item) => item.id === templateId);
    const branches = siding.tracks.filter((track) => track.type === "branch");
    assert.ok(branches.every((track) => !track.curved));
    assert.ok(branches.every((track) => Math.min(track.x1, track.x2) === 20 || Math.max(track.x1, track.x2) === 120));
    assert.ok(siding.tracks.filter((track) => track.type === "siding").every((track) => track.x1 === 40 && track.x2 === 100));
  }
});

test("turnout and connection templates use straight branch tracks", () => {
  for (const turnout of templateDefinitions.MODULE_TEMPLATES.filter((item) => item.category === "turnout")) {
    assert.ok(turnout.tracks.every((track) => !track.curved), turnout.id);
  }
});

test("yard access templates combine crossovers with straight branches", () => {
  const yardAccess = templateDefinitions.MODULE_TEMPLATES.find((item) => item.id === "yard_access");
  const depotAccess = templateDefinitions.MODULE_TEMPLATES.find((item) => item.id === "depot_access");
  assert.ok(yardAccess.tracks.every((track) => !track.curved));
  assert.ok(depotAccess.tracks.every((track) => !track.curved));
  assert.ok(yardAccess.tracks.some((track) => track.x1 === 28 && track.y1 === 36 && track.x2 === 72 && track.y2 === 76));
  assert.equal(depotAccess.tracks.filter((track) => track.type === "branch").length, 2);
  assert.deepEqual(depotAccess.ports.filter((port) => port.role === "yard").map((port) => port.y), [16, 96]);
});

test("turnout labels use the auxiliary annotation size", () => {
  for (const templateId of ["left_turnout", "right_turnout"]) {
    const turnout = templateDefinitions.MODULE_TEMPLATES.find((item) => item.id === templateId);
    assert.equal(turnout.labels[0].fontSize, 9);
  }
});

test("customized module ports update connection geometry and persisted tracks", () => {
  const crossover = templateDefinitions.MODULE_TEMPLATES.find((item) => item.id === "double_crossover");
  const firstModules = [
    { ...module("a", 0, 0), templateId: crossover.id, customParams: { length: 180, spacing: 48 } },
    module("b", 420, 0),
  ];
  const baseTemplates = new Map([[template.id, template], [crossover.id, crossover]]);
  const firstResolved = templateDefinitions.buildResolvedTemplateMap(baseTemplates, firstModules);
  const initial = logic.getConnectionGeometry(connection({ autoCurve: false }), firstModules, firstResolved);
  assert.deepEqual(initial.from, { x: 180, y: 32 });

  const resizedModules = [
    { ...firstModules[0], customParams: { length: 260, spacing: 40 } },
    firstModules[1],
  ];
  const resizedResolved = templateDefinitions.buildResolvedTemplateMap(baseTemplates, resizedModules);
  const resized = logic.synchronizeConnectionTracks([connection({ autoCurve: false })], resizedModules, resizedResolved)[0];
  assert.deepEqual(resized.tracks[0], { x1: 260, y1: 36, x2: 420, y2: 36, type: "main" });
});

test("paired double-track rails stay apart on steep diagonals", () => {
  // Worst case before the fix: bx=300, by=-200 collapsed to ~10.9px.
  const spacing = pairedCurveSpacing(300, -200);
  assert.ok(spacing >= 20, `paired tracks converged to ${spacing.toFixed(1)}px (expected >= 20px)`);
  assert.ok(pairedCurveSpacing(300, 200) >= 20, "symmetric downward diagonal stays apart");
  assert.ok(pairedCurveSpacing(400, -200) >= 20, "moderately steep diagonal stays apart");
});

test("paired double-track rails keep near-standard spacing on horizontal runs", () => {
  const spacing = pairedCurveSpacing(400, 0);
  assert.ok(spacing >= 38 && spacing <= 42, `horizontal pair measured ${spacing.toFixed(1)}px (expected ~40px)`);
});

test("rotated automatic double-track pairs stay apart and uncrossed through a quarter turn", () => {
  // The port offset rotates the opposite way to the curve through this 90° corner
  // (offset turns -90° while the tangent turns +90°), so the rails cannot be a
  // constant-width parallel offset without folding across each other. The old
  // shared-centreline render forced a constant 32px gap by folding (2 crossings);
  // the correct render keeps each rail its own clean curve: never crossing, and
  // staying near the nominal 32px spacing.
  const primary = { from: { x: 32, y: 0 }, to: { x: 316, y: 0 }, fromDir: 90, toDir: 180 };
  const secondary = { from: { x: 0, y: 0 }, to: { x: 316, y: 32 }, fromDir: 90, toDir: 180 };
  const primaryPath = logic.buildPairedOffsetPathD(primary, secondary);
  const secondaryPath = logic.buildPairedOffsetPathD(secondary, primary);
  assert.ok(primaryPath && secondaryPath, "parallel offset paths should be generated for a rotated pair");
  const visibleNode = logic.createPairedAutoControlPoints(primary, secondary)[0];
  const primaryPoints = polylinePoints(primaryPath);
  const secondaryPoints = polylinePoints(secondaryPath);
  assert.equal(primaryPoints.length, secondaryPoints.length);
  assert.ok(primaryPoints.some((point) => Math.abs(point.x - visibleNode.x) < 0.01 && Math.abs(point.y - visibleNode.y) < 0.01), "automatic node must be placed on its rendered offset rail");
  const primarySamples = samplePathD(primaryPath);
  const secondarySamples = samplePathD(secondaryPath);
  assert.equal(crossingCount(primarySamples, secondarySamples), 0, "quarter-turn rails must not cross");
  for (let index = 0; index < primarySamples.length; index++) {
    const gap = Math.hypot(primarySamples[index].x - secondarySamples[index].x, primarySamples[index].y - secondarySamples[index].y);
    assert.ok(gap >= 20 && gap <= 40, `sample ${index} gap was ${gap.toFixed(2)}px, rails must stay apart near the nominal 32px spacing`);
  }
});

test("a horizontal station connects to a rotated station as one monotonic quarter turn", () => {
  const moduleList = [module("a", 0, 0), module("b", 520, 360, 90)];
  const base = new Map([[template.id, template]]);
  const upper = { ...connection({ id: "upper", toPortId: "L_up" }), pairedConnectionId: "lower" };
  const lower = { ...connection({ id: "lower", fromPortId: "R_dn", toPortId: "L_dn" }), pairedConnectionId: "upper" };
  const upperEndpoints = logic.endpointsForConnection(upper, moduleList, base);
  const lowerEndpoints = logic.endpointsForConnection(lower, moduleList, base);
  const upperPath = logic.buildPairedOffsetPathD(upperEndpoints, lowerEndpoints);
  const lowerPath = logic.buildPairedOffsetPathD(lowerEndpoints, upperEndpoints);

  assert.ok(upperPath && lowerPath, "a valid rotated double-track pair must share a centre curve");
  const upperPoints = polylinePoints(upperPath);
  const lowerPoints = polylinePoints(lowerPath);
  assert.equal(upperPoints.length, lowerPoints.length);
  for (let index = 1; index < upperPoints.length; index++) {
    assert.ok(upperPoints[index].x >= upperPoints[index - 1].x, "quarter turn must not reverse horizontally into an S curve");
    assert.ok(upperPoints[index].y >= upperPoints[index - 1].y, "quarter turn must not reverse vertically into an S curve");
    const spacing = Math.hypot(upperPoints[index].x - lowerPoints[index].x, upperPoints[index].y - lowerPoints[index].y);
    assert.ok(Math.abs(spacing - 40) < 0.05, `sample ${index} gap was ${spacing.toFixed(2)}px instead of 40px`);
  }
});

test("paired auto synchronisation keeps both rails coordinated after module movement", () => {
  const base = new Map([[template.id, template]]);
  const modules = [module("a", 0, 0), module("b", 320, -180)];
  const up = { ...connection({ id: "cu" }), pairedConnectionId: "cd" };
  const dn = { ...connection({ id: "cd", fromPortId: "R_dn", toPortId: "L_dn" }), pairedConnectionId: "cu" };
  const synced = logic.synchronizeConnectionTracks([up, dn], modules, base);
  const upGeometry = logic.getConnectionGeometry(synced[0], modules, base, logic.endpointsForConnection(synced[1], modules, base));
  const dnGeometry = logic.getConnectionGeometry(synced[1], modules, base, logic.endpointsForConnection(synced[0], modules, base));
  const upPath = types.buildControlPointPathD(upGeometry.from, upGeometry.to, upGeometry.controlPoints, upGeometry.fromDir, upGeometry.toDir);
  const dnPath = types.buildControlPointPathD(dnGeometry.from, dnGeometry.to, dnGeometry.controlPoints, dnGeometry.fromDir, dnGeometry.toDir);
  const spacing = minCurveDistance(samplePathD(upPath), samplePathD(dnPath));
  assert.ok(spacing >= 20, `moved pair converged to ${spacing.toFixed(1)}px`);
  // Both rails must actually be paired so the rendered geometry matches the stored sync.
  assert.equal(synced[0].pairedConnectionId, "cd");
  assert.equal(synced[1].pairedConnectionId, "cu");
});

test("pathsCross flags proper crossings but not parallel or disjoint rails", () => {
  const crossA = "M0,0 L100,100";
  const crossB = "M0,100 L100,0";
  assert.equal(logic.pathsCross(crossA, crossB), true, "X-shape straight rails must be flagged");
  assert.equal(logic.pathsCross("M0,0 L100,0", "M0,40 L100,40"), false, "parallel offset rails must not be flagged");
  assert.equal(logic.pathsCross("M0,0 L10,10", "M50,50 L60,60"), false, "non-overlapping rails must not be flagged");
});

test("pathsCross does not count shared endpoints as crossings", () => {
  // Two rails joining at a module port legitimately touch; that is not a crossing.
  const a = "M0,0 L100,100";
  const sharedEnd = "M100,100 L200,0";
  assert.equal(logic.pathsCross(a, sharedEnd), false, "rails sharing an endpoint must not be flagged");
  // A mid-run perpendicular crossing with no shared endpoint is still caught.
  assert.equal(logic.pathsCross(a, "M0,100 L200,20"), true, "a mid-run crossing must be flagged");
});

test("pathsCross catches curves that cross though their chords do not", () => {
  // Two opposing-bulge curves share a middle point; neither straight chord
  // between the ports crosses, so a chord-level check would miss this.
  const a = "M0,0 C 50,0 50,120 100,120";
  const b = "M0,120 C 50,120 50,0 100,0";
  assert.equal(logic.pathsCross(a, b), true, "opposing-bulge curves must be flagged");
});

test("pathsCross does not flag a clean paired double-track curve", () => {
  // Guard against the chord-check's false positive: two rails of one paired
  // curve thread past each other without ever crossing. The rendered rails
  // must not be treated as a crossing.
  const primary = { from: { x: 32, y: 0 }, to: { x: 316, y: 0 }, fromDir: 90, toDir: 180 };
  const secondary = { from: { x: 0, y: 0 }, to: { x: 316, y: 32 }, fromDir: 90, toDir: 180 };
  const primaryPath = logic.buildPairedOffsetPathD(primary, secondary);
  const secondaryPath = logic.buildPairedOffsetPathD(secondary, primary);
  assert.ok(primaryPath && secondaryPath, "clean rotated pair must produce both rails");
  assert.equal(logic.pathsCross(primaryPath, secondaryPath), false, "paired offset rails must never be flagged as crossing");
});
