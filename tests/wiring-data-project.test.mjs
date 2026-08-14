import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { strToU8, unzipSync, zipSync } from "fflate";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const patterns = await server.ssrLoadModule("/app/wiring/servicePatterns.ts");
const csv = await server.ssrLoadModule("/app/transit/csv-io.ts");
const sourceChanges = await server.ssrLoadModule("/app/transit/sourceChanges.ts");
const projectStore = await server.ssrLoadModule("/app/wiring/projectStore.ts");
const history = await server.ssrLoadModule("/app/wiring/history.ts");
const filtering = await server.ssrLoadModule("/app/wiring/filtering.ts");
const assetImport = await server.ssrLoadModule("/app/wiring/assetImport.ts");
const sourceIdentity = await server.ssrLoadModule("/app/wiring/sourceIdentity.ts");
const layerAssignment = await server.ssrLoadModule("/app/wiring/layerAssignment.ts");
const wiringTemplates = await server.ssrLoadModule("/app/wiring/templates.ts");
after(() => server.close());

test("service-pattern filters expand R1 through configuration", () => {
  const result = patterns.expandServicePatternFilter([], ["route-a"], [{
    id: "route-a", visible: true, memberLineIds: ["L7", "L9"],
  }]);
  assert.deepEqual([...result], ["L7", "L9"]);
  assert.deepEqual([...patterns.expandServicePatternFilter(["L1"], ["missing"], [])], ["L1"]);
});

test("CSV diff detects changed fields as well as additions and removals", () => {
  const current = {
    lines: [{ id: "L1", nameZh: "旧名" }],
    stations: [{ id: "S1", sequence: 1 }],
    transfers: [{ id: "T1", hidden: false }],
  };
  const diff = csv.computeDiff({
    lines: [{ id: "L1", nameZh: "新名" }],
    stations: [{ id: "S1", sequence: 2 }],
    transfers: [{ id: "T1", hidden: true }],
  }, current);
  assert.equal(diff.changedLines, 1);
  assert.equal(diff.changedStations, 1);
  assert.equal(diff.changedTransfers, 1);
});

test("CSV save verification treats omitted optional cells like their round-trip defaults", () => {
  const beforeWrite = {
    lines: [],
    stations: [{
      id: "S1", lineId: "L1", sequence: 1, nameZh: "测试站", nameEn: "Test Station",
      code: "L1-01", markerColor: "#00a8ff", terminalType: "normal", isOpen: true,
      throughLineIds: [], notes: "",
    }],
    transfers: [{ id: "T1", stationId: "S1", targetLineId: "L2", order: 1, colorOverride: "", hidden: false }],
  };
  const afterRead = structuredClone(beforeWrite);
  afterRead.stations[0].icon = "";
  assert.equal(csv.csvPersistenceSnapshot(beforeWrite), csv.csvPersistenceSnapshot(afterRead));
  afterRead.stations[0].nameZh = "另一个站名";
  assert.notEqual(csv.csvPersistenceSnapshot(beforeWrite), csv.csvPersistenceSnapshot(afterRead));
});

test("CSV parsing reports file, row and field through PapaParse and Zod", () => {
  const parsed = csv.parseCsvFile("stations.csv", "id,line_id,sequence,name_zh,is_open\nS1,L1,abc,测试站,maybe\n");
  assert.ok(parsed);
  assert.ok(parsed.issues.some((issue) => issue.fileName === "stations.csv" && issue.rowNumber === 2 && issue.field === "sequence"));
  assert.ok(parsed.issues.some((issue) => issue.fileName === "stations.csv" && issue.rowNumber === 2 && issue.field === "is_open"));
  const row = csv.parseCsv("id,name_zh,name_en\nS1,测试站,\n")[0];
  assert.equal(row.name_en, undefined);
});

test("structured source changes classify fields and keep new stations in the pending tray", () => {
  const before = {
    lines: [{ id: "L1", nameZh: "旧线", kind: "metro" }],
    stations: [{ id: "S1", lineId: "L1", sequence: 1, nameZh: "旧站", throughLineIds: [] }],
    transfers: [],
  };
  const after = {
    lines: [{ id: "L1", nameZh: "新线", kind: "metro" }],
    stations: [
      { id: "S1", lineId: "L1", sequence: 2, nameZh: "新站", throughLineIds: [] },
      { id: "S2", lineId: "L1", sequence: 3, nameZh: "新增站", throughLineIds: [] },
    ],
    transfers: [],
  };
  const changes = sourceChanges.generateSourceChanges(before, after, { "station:S1": ["module-1"] });
  assert.ok(changes.some((change) => change.id === "line:L1:field:nameZh" && change.severity === "info"));
  assert.ok(changes.some((change) => change.id === "station:S1:field:sequence" && change.severity === "error" && change.affectedObjectIds[0] === "module-1"));
  assert.ok(changes.some((change) => change.id === "station:S2:added" && change.requiresPlacement));
  assert.equal(sourceChanges.pendingPlacementChanges(changes).length, 1);
  assert.deepEqual(sourceChanges.computeSourceFingerprints(before), sourceChanges.computeSourceFingerprints(structuredClone(before)));
});

test("filter modes hide, retain transfer hints, or dim unrelated lines without touching layers", () => {
  const object = { objectType: "module", lineIds: ["L2"], layerId: "stations" };
  assert.equal(filtering.evaluateFilter(object, { lineIds: ["L1"], mode: "target_only" }), "hide");
  assert.equal(filtering.evaluateFilter(object, { lineIds: ["L1"], mode: "dim_others" }), "dim");
  assert.equal(filtering.evaluateFilter({ ...object, isTransferHint: true, transferLineIds: ["L1"] }, { lineIds: ["L1"], mode: "retain_transfers" }), "show");
  assert.equal(filtering.evaluateFilter({ ...object, placed: false }, { lineIds: [], placement: "unplaced" }), "show");
});

test("icon ZIP import accepts image entries and ignores unrelated files", () => {
  const archive = zipSync({ "icons/test.png": new Uint8Array([0, 1, 2]), "README.txt": strToU8("skip") });
  const assets = assetImport.importIconArchive(archive);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].name, "test.png");
  assert.match(assets[0].dataUrl, /^data:image\/png;base64,/);
  assert.equal(assetImport.findAssetByFilename(assets, "folder/TEST.PNG")?.id, assets[0].id);
});

test("source identity uses stable IDs and requires confirmation before physical-station mapping", () => {
  const data = {
    lines: [{ id: "L1", kind: "metro", number: "1", nameZh: "一号线", nameEn: "", code: "", lineColor: "#111", stationColor: "", currentColor: "", passedColor: "", textColor: "", description: "" }],
    stations: [
      { id: "S1", lineId: "L1", sequence: 1, nameZh: "中心站", nameEn: "", code: "", markerColor: "", terminalType: "normal", throughLineIds: [], notes: "", isOpen: true },
      { id: "S2", lineId: "L2", sequence: 4, nameZh: "中心站", nameEn: "", code: "", markerColor: "", terminalType: "normal", throughLineIds: [], notes: "", isOpen: true },
    ],
    transfers: [{ id: "T1", stationId: "S1", targetLineId: "L2", order: 1, colorOverride: "", hidden: false }],
  };
  const records = sourceIdentity.buildSourceIdentityRecords(data);
  assert.equal(records.sourceStationsOnLine[0].id, "S1");
  assert.equal(records.sourceLines[0].nameZh, "一号线");
  const suggestions = sourceIdentity.suggestPhysicalStations(data);
  assert.equal(suggestions.length, 1);
  const confirmed = sourceIdentity.confirmPhysicalStationSuggestion(suggestions[0]);
  assert.deepEqual(confirmed.physicalStation.sourceStationIds, ["S1", "S2"]);
  assert.equal(confirmed.mappings.length, 2);
});

test("schema migration rebuilds missing source identity records from the normalized snapshot", () => {
  const legacy = {
    schemaVersion: 1,
    projectInfo: { name: "legacy", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    pages: [], layers: [], modules: [], connections: [], backgroundImages: [], labels: [], servicePatterns: [], transferGroups: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
    sourceDataSnapshot: {
      schemaVersion: 1,
      lines: [{ id: "L1", nameZh: "一号线", nameEn: "Line 1", lineColor: "#123456", textColor: "#ffffff", sortOrder: 1 }],
      stations: [{ id: "S1", lineId: "L1", nameZh: "甲站", nameEn: "Alpha", sequence: 1, isOpen: true, terminalType: "normal", throughLineIds: [] }],
      transfers: [],
    },
  };

  const migrated = projectStore.migrateProjectSchema(legacy);
  assert.equal(migrated.sourceLines[0].id, "L1");
  assert.equal(migrated.sourceStationsOnLine[0].id, "S1");
  assert.equal(legacy.sourceLines, undefined);
});

test("metroproj archive contains project JSON and normalized source CSV files", () => {
  const sourceDataSnapshot = {
    lines: [{ id: "L1", kind: "metro", number: "1", nameZh: "一号线", nameEn: "Line 1", code: "1", lineColor: "#111", stationColor: "#222", currentColor: "#333", passedColor: "#444", textColor: "#fff", description: "" }],
    stations: [], transfers: [], schemaVersion: 1, layout: {}, activeStyleTemplate: "classic", layoutTemplates: {},
  };
  const project = projectStore.serializeProject({
    projectName: "测试", modules: [], connections: [], layers: [], viewport: { panX: 0, panY: 0, scale: 1 }, sourceDataSnapshot,
  });
  const bytes = projectStore.projectToArchive(project);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.ok(bytes.length > 100);
});

test("v1 projects migrate to the current schema without mutating the input", () => {
  const v1 = {
    schemaVersion: 1, projectInfo: { name: "legacy", createdAt: "a", updatedAt: "b" },
    layers: [], modules: [], connections: [], backgroundImages: [], labels: [], transferGroups: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
  };
  const before = structuredClone(v1);
  const migrated = projectStore.migrateProjectSchema(v1);
  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(v1, before);
  assert.deepEqual(migrated.sourceMappings, []);
  assert.deepEqual(migrated.filters, { lineIds: [] });
  assert.ok(migrated.pages.length);
});

test("color migration converts stored default color modes to line for existing objects", () => {
  const v2 = {
    schemaVersion: 2, projectInfo: { name: "colors", createdAt: "a", updatedAt: "b" },
    pages: [], layers: [], connections: [],
    modules: [
      { id: "m1", templateId: "double_track", name: "m1", x: 0, y: 0, rotation: 0, lineIds: ["L1"], sourceStationIds: [], locked: false, layerId: "layer-track-main", zIndex: 0, trackColorMode: "default", labelColorMode: "default" },
      { id: "m2", templateId: "double_track", name: "m2", x: 0, y: 0, rotation: 0, lineIds: ["L1"], sourceStationIds: [], locked: false, layerId: "layer-track-main", zIndex: 1, trackColorMode: "manual", trackColor: "#123456", labelColorMode: "line" },
    ],
    platforms: [
      { id: "p1", moduleId: "m1", platformType: "island", x: 0, y: 0, width: 100, height: 16, rotation: 0, fill: "#D7B06A", colorMode: "default", layerId: "layer-platform", zIndex: 0, visible: true, locked: false },
      { id: "p2", moduleId: "m2", platformType: "island", x: 0, y: 0, width: 100, height: 16, rotation: 0, fill: "#D7B06A", colorMode: "line", layerId: "layer-platform", zIndex: 1, visible: true, locked: false },
    ],
    labels: [], backgroundImages: [], transferGroups: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
  };
  const migrated = projectStore.migrateProjectSchema(v2);
  assert.equal(migrated.schemaVersion, 5);
  const m1 = migrated.modules.find((m) => m.id === "m1");
  assert.equal(m1.trackColorMode, "line", "旧工程的显式 default 轨道色转换为跟随线路");
  assert.equal(m1.labelColorMode, "line", "旧工程的显式 default 站名色转换为跟随线路");
  const m2 = migrated.modules.find((m) => m.id === "m2");
  assert.equal(m2.trackColorMode, "manual", "manual 颜色模式保留");
  assert.equal(m2.labelColorMode, "line", "line 颜色模式保留");
  const p1 = migrated.platforms.find((p) => p.id === "p1");
  assert.equal(p1.colorMode, "line", "旧工程的显式 default 站台色转换为跟随线路");
  const p2 = migrated.platforms.find((p) => p.id === "p2");
  assert.equal(p2.colorMode, "line", "line 颜色模式保留");
});

test("future project schemas are rejected instead of being silently downgraded", () => {
  assert.throws(() => projectStore.migrateProjectSchema({ schemaVersion: 99 }), /高于当前支持/);
});

test("semantic layer assignment classifies library objects by their role", () => {
  const templates = Object.fromEntries(wiringTemplates.MODULE_TEMPLATES.map((item) => [item.id, item]));
  assert.equal(layerAssignment.defaultModuleLayerId(templates.island_platform), "layer-track-station");
  assert.equal(layerAssignment.defaultModuleLayerId(templates.left_turnout), "layer-track-turnout");
  assert.equal(layerAssignment.defaultModuleLayerId(templates.single_siding), "layer-track-siding");
  assert.equal(layerAssignment.defaultModuleLayerId(templates.three_track_yard), "layer-track-yard");
  assert.equal(layerAssignment.defaultModuleLayerId(templates.depot_access), "layer-track-depot-access");
  const lineKinds = [{ id: "T1", kind: "tram" }, { id: "L1", kind: "metro" }];
  assert.equal(layerAssignment.defaultModuleLayerId(templates.island_platform, { lineIds: ["T1"] }, lineKinds), "layer-track-tram");
  assert.equal(layerAssignment.defaultConnectionLayerId({ lineIds: ["T1"] }, { lineIds: ["T1"] }, lineKinds), "layer-track-tram");
  assert.equal(layerAssignment.defaultConnectionLayerId({ lineIds: ["T1"] }, { lineIds: ["L1"] }, lineKinds), "layer-track-main");
  assert.equal(layerAssignment.defaultPlatformLayerId("island_platform"), "layer-platform-normal");
  assert.equal(layerAssignment.defaultPlatformLayerId("cross_platform"), "layer-platform-special");
  assert.equal(layerAssignment.defaultLabelLayerId({}), "layer-text-note");
  assert.equal(layerAssignment.defaultLabelLayerId({ numeralType: "track" }), "layer-text-track-number");
  assert.equal(layerAssignment.defaultLabelLayerId({ numeralType: "switch" }), "layer-text-switch-number");
  assert.equal(layerAssignment.defaultLabelLayerId({ attachedToId: "m1" }), "layer-label");
  assert.equal(layerAssignment.defaultGraphicLayerId({}), "layer-icon-facility");
  assert.equal(layerAssignment.defaultGraphicLayerId({ attachedToId: "m1" }), "layer-icon");
});

test("v4 migration reclassifies legacy generic layers once and preserves manual layers", () => {
  const legacy = {
    schemaVersion: 3,
    projectInfo: { name: "layers", createdAt: "a", updatedAt: "b" },
    pages: [], layers: [], connections: [], backgroundImages: [], transferGroups: [], assets: [],
    modules: [
      { id: "station", templateId: "island_platform", name: "station", x: 0, y: 0, rotation: 0, lineIds: [], sourceStationIds: [], locked: false, layerId: "layer-track-main", zIndex: 0 },
      { id: "turnout", templateId: "left_turnout", name: "turnout", x: 0, y: 0, rotation: 0, lineIds: [], sourceStationIds: [], locked: false, layerId: "layer-track-main", zIndex: 1 },
      { id: "siding", templateId: "single_siding", name: "siding", x: 0, y: 0, rotation: 0, lineIds: [], sourceStationIds: [], locked: false, layerId: "layer-track-main", zIndex: 2 },
    ],
    platforms: [{ id: "p1", moduleId: "station", platformType: "island", attachedTrackIds: [], x: 0, y: 0, width: 10, height: 4, rotation: 0, fill: "#fff", layerId: "layer-track-main", zIndex: 0 }],
    labels: [
      { id: "station-name", text: "站名", x: 0, y: 0, fontSize: 12, anchor: "bottom", rotation: 0, fill: "#000", fontWeight: 400, backgroundMask: false, maskStrokeWidth: 0, locked: false, visible: true, layerId: "layer-label", zIndex: 0, attachedToId: "station" },
      { id: "note", text: "备注", x: 0, y: 0, fontSize: 12, anchor: "bottom", rotation: 0, fill: "#000", fontWeight: 400, backgroundMask: false, maskStrokeWidth: 0, locked: false, visible: true, layerId: "layer-label", zIndex: 1 },
      { id: "track-number", text: "1", x: 0, y: 0, fontSize: 12, anchor: "bottom", rotation: 0, fill: "#000", fontWeight: 400, backgroundMask: false, maskStrokeWidth: 0, locked: false, visible: true, layerId: "layer-label", zIndex: 2, numeralType: "track" },
    ],
    graphics: [
      { id: "station-icon", assetId: "a1", attachedToId: "station", x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, layerId: "layer-icon", zIndex: 0 },
      { id: "facility", shapeType: "rect", x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, layerId: "layer-icon", zIndex: 1 },
    ],
    viewport: { panX: 0, panY: 0, scale: 1 },
  };
  const migrated = projectStore.migrateProjectSchema(legacy);
  assert.deepEqual(Object.fromEntries(migrated.modules.map((item) => [item.id, item.layerId])), {
    station: "layer-track-station", turnout: "layer-track-turnout", siding: "layer-track-siding",
  });
  assert.equal(migrated.platforms[0].layerId, "layer-platform-normal");
  assert.deepEqual(Object.fromEntries(migrated.labels.map((item) => [item.id, item.layerId])), {
    "station-name": "layer-label", note: "layer-text-note", "track-number": "layer-text-track-number",
  });
  assert.deepEqual(Object.fromEntries(migrated.graphics.map((item) => [item.id, item.layerId])), {
    "station-icon": "layer-icon", facility: "layer-icon-facility",
  });

  const customLayer = { id: "custom-leaf", name: "自定义", visible: true, locked: false, opacity: 1, expanded: true, parentId: null, order: 99 };
  const current = { ...migrated, schemaVersion: 5, layers: [...migrated.layers, customLayer], modules: migrated.modules.map((item) => item.id === "turnout" ? { ...item, layerId: customLayer.id } : item) };
  assert.equal(projectStore.migrateProjectSchema(current).modules.find((item) => item.id === "turnout").layerId, customLayer.id);
});

test("v5 migration adds the tram layer and moves tram modules plus tram-only connections", () => {
  const project = {
    schemaVersion: 4,
    projectInfo: { name: "tram-layers", createdAt: "a", updatedAt: "b" },
    pages: [], layers: [], backgroundImages: [], labels: [], transferGroups: [], platforms: [], graphics: [], assets: [],
    sourceLines: [
      { id: "T1", kind: "tram", number: "1", nameZh: "电车1号线", lineColor: "#00aa00" },
      { id: "L1", kind: "metro", number: "1", nameZh: "1号线", lineColor: "#ffaa00" },
    ],
    sourceStationsOnLine: [], physicalStations: [], sourceMappings: [], filters: { lineIds: [] }, unresolvedChanges: [], pendingPlacement: null,
    modules: [
      { id: "t1", templateId: "island_platform", name: "tram station", x: 0, y: 0, rotation: 0, lineIds: ["T1"], sourceStationIds: [], locked: false, layerId: "layer-track-station", zIndex: 0 },
      { id: "t2", templateId: "double_track", name: "tram section", x: 0, y: 0, rotation: 0, lineIds: ["T1"], sourceStationIds: [], locked: false, layerId: "layer-track-main", zIndex: 1 },
      { id: "m1", templateId: "island_platform", name: "metro station", x: 0, y: 0, rotation: 0, lineIds: ["L1"], sourceStationIds: [], locked: false, layerId: "layer-track-station", zIndex: 2 },
    ],
    connections: [
      { id: "tram", fromModuleId: "t1", fromPortId: "R_up", toModuleId: "t2", toPortId: "L_up", tracks: [], layerId: "layer-track-main" },
      { id: "mixed", fromModuleId: "t1", fromPortId: "R_dn", toModuleId: "m1", toPortId: "L_dn", tracks: [], layerId: "layer-track-main" },
    ],
    viewport: { panX: 0, panY: 0, scale: 1 },
  };
  const migrated = projectStore.migrateProjectSchema(project);
  assert.ok(migrated.layers.some((layer) => layer.id === "layer-track-tram" && layer.name === "有轨电车"));
  assert.equal(migrated.modules.find((item) => item.id === "t1").layerId, "layer-track-tram");
  assert.equal(migrated.modules.find((item) => item.id === "t2").layerId, "layer-track-tram");
  assert.equal(migrated.modules.find((item) => item.id === "m1").layerId, "layer-track-station");
  assert.equal(migrated.connections.find((item) => item.id === "tram").layerId, "layer-track-tram");
  assert.equal(migrated.connections.find((item) => item.id === "mixed").layerId, "layer-track-main");
});

test("connections migrate line style and dynamic/manual zIndex modes", () => {
  const project = {
    schemaVersion: 2, projectInfo: { name: "linestyle", createdAt: "a", updatedAt: "b" },
    pages: [], layers: [],
    modules: [
      { id: "m1", templateId: "double_track", name: "m1", x: 0, y: 0, rotation: 0, lineIds: ["L1"], sourceStationIds: [], locked: false, layerId: "layer-track-main", zIndex: 0, trackColorMode: "line", labelColorMode: "line" },
      { id: "m2", templateId: "double_track", name: "m2", x: 0, y: 0, rotation: 0, lineIds: ["L1"], sourceStationIds: [], locked: false, layerId: "layer-track-main", zIndex: 1, trackColorMode: "line", labelColorMode: "line" },
    ],
    connections: [
      // 旧连接：没有 lineStyle 字段 → 默认 solid
      { id: "c1", fromModuleId: "m1", fromPortId: "R_up", toModuleId: "m2", toPortId: "L_up", tracks: [], crossingType: "plain", crossingPoints: [], controlPoints: [] },
      // 新连接：显式 dashed → 保留
      { id: "c2", fromModuleId: "m1", fromPortId: "R_dn", toModuleId: "m2", toPortId: "L_dn", tracks: [], crossingType: "plain", crossingPoints: [], controlPoints: [], lineStyle: "dashed", zIndexMode: "manual", zIndex: 7.5 },
    ],
    backgroundImages: [], labels: [], transferGroups: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
  };
  const migrated = projectStore.migrateProjectSchema(project);
  assert.equal(migrated.schemaVersion, 5);
  const byId = Object.fromEntries(migrated.connections.map((c) => [c.id, c]));
  assert.equal(byId.c1.lineStyle, "solid", "旧连接缺省线型应为实线");
  assert.equal(byId.c2.lineStyle, "dashed", "显式虚线线型应保留");
  assert.equal(byId.c1.zIndexMode, "auto", "旧连接默认使用端点中间层级");
  assert.equal(byId.c2.zIndexMode, "manual", "手动层级模式应保留");
  assert.equal(byId.c2.zIndex, 7.5, "手动层级数值应保留");
});

test("legacy owned platforms default to module-following zIndex while manual mode is preserved", () => {
  const project = {
    schemaVersion: 3, projectInfo: { name: "platform-z", createdAt: "a", updatedAt: "b" },
    pages: [], layers: [], modules: [], connections: [], backgroundImages: [], labels: [], transferGroups: [], graphics: [],
    platforms: [
      { id: "p1", moduleId: "m1", platformType: "island", attachedTrackIds: [], x: 0, y: 0, width: 10, height: 4, rotation: 0, fill: "#fff", layerId: "layer-track-main", zIndex: 1 },
      { id: "p2", moduleId: "m2", platformType: "island", attachedTrackIds: [], x: 0, y: 0, width: 10, height: 4, rotation: 0, fill: "#fff", layerId: "layer-track-main", zIndexMode: "manual", zIndex: 9 },
    ],
    viewport: { panX: 0, panY: 0, scale: 1 },
  };
  const migrated = projectStore.migrateProjectSchema(project);
  assert.equal(migrated.platforms[0].zIndexMode, "auto");
  assert.equal(migrated.platforms[1].zIndexMode, "manual");
  assert.equal(migrated.platforms[1].zIndex, 9);
});

test("legacy image graphics gain shape defaults; shapeType preserved when present", () => {
  const project = {
    schemaVersion: 2, projectInfo: { name: "graphics", createdAt: "a", updatedAt: "b" },
    pages: [], layers: [], modules: [], connections: [], backgroundImages: [], labels: [], transferGroups: [],
    graphics: [
      // 旧图片图形：无 shapeType → shapeType 保持 undefined，assetId 保留，fill/stroke 补默认
      { id: "g1", assetId: "asset-1", x: 0, y: 0, width: 32, height: 32, rotation: 0, opacity: 1, layerId: "layer-icon", zIndex: 0 },
      // 形状图形：未指定 fill → 补默认
      { id: "g2", shapeType: "rect", x: 10, y: 10, width: 80, height: 60, rotation: 0, opacity: 1, layerId: "layer-icon", zIndex: 1 },
    ],
    viewport: { panX: 0, panY: 0, scale: 1 },
  };
  const migrated = projectStore.migrateProjectSchema(project);
  const byId = Object.fromEntries(migrated.graphics.map((g) => [g.id, g]));
  assert.equal(byId.g1.shapeType, undefined, "旧图片图形 shapeType 应为 undefined");
  assert.equal(byId.g1.assetId, "asset-1", "旧图片图形 assetId 保留");
  assert.equal(byId.g1.fill, "#cce6f5", "旧图片图形补默认填充色");
  assert.equal(byId.g1.stroke, "#202124", "旧图片图形补默认描边色");
  assert.equal(byId.g2.shapeType, "rect", "形状图形 shapeType 保留");
  assert.equal(byId.g2.fill, "#cce6f5", "未指定 fill 的形状补默认填充色");
});

test("shape graphics round-trip through serialize→migrate with fill/stroke", () => {
  const serialized = projectStore.serializeProject({
    projectName: "shape round-trip",
    modules: [], connections: [], layers: [], viewport: { panX: 0, panY: 0, scale: 1 },
    graphics: [{ id: "g1", shapeType: "signal-in", x: 0, y: 0, width: 28, height: 64, rotation: 0, opacity: 1, layerId: "layer-icon", zIndex: 0 }],
  });
  const migrated = projectStore.migrateProjectSchema(serialized);
  const byId = Object.fromEntries(migrated.graphics.map((g) => [g.id, g]));
  assert.equal(byId.g1.shapeType, "signal-in", "信号机 shapeType 经序列化往返保留");
  assert.equal(byId.g1.fill, "#cce6f5", "信号机 fill 往返保留（补默认）");
});

test("numeral labels round-trip through serialize→migrate with numeralType/text", () => {
  const serialized = projectStore.serializeProject({
    projectName: "numeral round-trip",
    modules: [], connections: [], layers: [], viewport: { panX: 0, panY: 0, scale: 1 },
    labels: [{ id: "n1", text: "3", numeralType: "track", x: 0, y: 0, fontSize: 16, language: "neutral", layerId: "layer-label", zIndex: 0 }],
  });
  const migrated = projectStore.migrateProjectSchema(serialized);
  const byId = Object.fromEntries(migrated.labels.map((l) => [l.id, l]));
  assert.equal(byId.n1.numeralType, "track", "股道编号 numeralType 往返保留");
  assert.equal(byId.n1.text, "3", "编号纯数字 text 往返保留");
});

test("loading a project keeps materialized station-name labels inheriting the module's label color mode", () => {
  const project = {
    schemaVersion: 1, projectInfo: { name: "labels", createdAt: "a", updatedAt: "b" },
    pages: [], layers: [], modules: [], connections: [], backgroundImages: [],
    labels: [
      // 物化站名标签：旧版载入时被 ?? "default" 污染，应复位为 undefined 以便跟随模块"站名颜色"
      { id: "m1:template-label:zh", text: "甲站", attachedToId: "m1", language: "zh", colorMode: "default" },
      // 用户显式设置的跟随线路：保留
      { id: "m1:template-label:en", text: "Alpha", attachedToId: "m1", language: "en", colorMode: "line" },
      // 独立标签：保留用户选择
      { id: "user-label-1", text: "注释", colorMode: "default" },
      // 从未设置过 colorMode 的标签：保持 undefined，不要强制成 default
      { id: "user-label-2", text: "备注", attachedToId: "m2" },
    ],
    transferGroups: [], viewport: { panX: 0, panY: 0, scale: 1 },
  };
  const migrated = projectStore.migrateProjectSchema(project);
  const byId = Object.fromEntries(migrated.labels.map((label) => [label.id, label]));
  assert.equal(byId["m1:template-label:zh"].colorMode, undefined, "被污染的物化站名标签应复位为 undefined，跟随模块站名颜色");
  assert.equal(byId["m1:template-label:en"].colorMode, "line", "显式设置的跟随线路应保留");
  assert.equal(byId["user-label-1"].colorMode, "default", "独立标签的用户选择应保留");
  assert.equal(byId["user-label-2"].colorMode, undefined, "从未设置的 colorMode 不应被强制为 default");
});

test("legacy projects gain missing default layers without losing user layer settings", () => {
  const migrated = projectStore.migrateProjectSchema({
    schemaVersion: 2,
    projectInfo: { name: "legacy layers", createdAt: "a", updatedAt: "b" },
    pages: [],
    layers: [
      { id: "layer-bg", name: "我的底图", visible: false, locked: true, opacity: 0.4, expanded: false, parentId: null, order: 7 },
      { id: "custom-layer", name: "自定义", visible: true, locked: false, opacity: 1, expanded: true, parentId: null, order: 8 },
    ],
    modules: [], connections: [], backgroundImages: [], labels: [], transferGroups: [],
    viewport: { panX: 0, panY: 0, scale: 1 },
  });
  const legacyBackground = migrated.layers.find((layer) => layer.id === "layer-bg");
  assert.equal(legacyBackground.name, "我的底图");
  assert.equal(legacyBackground.visible, false);
  assert.equal(legacyBackground.locked, true);
  assert.equal(legacyBackground.parentId, "layer-background");
  assert.ok(migrated.layers.some((layer) => layer.id === "layer-annotation-service"));
  assert.ok(migrated.layers.some((layer) => layer.id === "custom-layer"));

  const renamedDefaults = projectStore.mergeDefaultLayers([
    { id: "layer-bg", name: "背景图", visible: true, locked: false, opacity: 1, expanded: true, parentId: null, order: 0 },
    { id: "layer-label", name: "文字", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-annotation", order: 0 },
    { id: "layer-icon", name: "图标", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-annotation", order: 1 },
    { id: "layer-transfer", name: "换乘组合", visible: true, locked: false, opacity: 1, expanded: true, parentId: "layer-aux", order: 0 },
  ]);
  assert.equal(renamedDefaults.find((layer) => layer.id === "layer-bg").name, "底图");
  assert.equal(renamedDefaults.find((layer) => layer.id === "layer-label").name, "站名");
  assert.equal(renamedDefaults.find((layer) => layer.id === "layer-icon").name, "站点图标");
  assert.equal(renamedDefaults.find((layer) => layer.id === "layer-transfer").name, "换乘通道");
});

test("v2 fields round-trip and archives include source, background and icon assets", () => {
  const png = "data:image/png;base64,AAE=";
  const project = projectStore.serializeProject({
    projectName: "v2", modules: [], connections: [], layers: [], viewport: { panX: 0, panY: 0, scale: 1 },
    backgroundImages: [{ id: "bg", src: png, name: "bg.png", x: 0, y: 0, naturalWidth: 1, naturalHeight: 1, scale: 1, opacity: 1, locked: false, visible: true, layerId: "layer-bg", zIndex: 0, archivePath: "assets/backgrounds/bg.png" }],
    assets: [{ id: "icon", name: "icon.png", mimeType: "image/png", dataUrl: png }],
    sourceMappings: [{ id: "m1", sourceStationId: "S1", physicalStationId: "P1", status: "mapped" }],
    filters: { lineIds: ["L1"], changeStatuses: ["unresolved"] },
    unresolvedChanges: [{ id: "c1", entityType: "station", entityId: "S1", changeType: "added", severity: "error", status: "unresolved", affectedObjectIds: [], requiresPlacement: true }],
    pendingPlacement: { sourceStationId: "S1", x: 20, y: 30 },
  });
  const entries = unzipSync(projectStore.projectToArchive(project));
  assert.ok(entries["project.json"]);
  assert.ok(entries["assets/backgrounds/bg.png"]);
  assert.ok(entries["assets/icons/icon.png"]);
  assert.ok(entries["thumbnails/preview.png"]);
  const restored = projectStore.restoreArchiveAssets(project, entries);
  assert.deepEqual(restored.sourceMappings, project.sourceMappings);
  assert.equal(restored.assets[0].dataUrl, png);
  assert.equal(restored.backgroundImages[0].src, png);
});

test("metroproj import restores packaged source CSV when project JSON has no embedded snapshot", async () => {
  const sourceDataSnapshot = {
    lines: [{ id: "L1", kind: "metro", number: "1", nameZh: "一号线", nameEn: "Line 1", code: "1", lineColor: "#111", stationColor: "#222", currentColor: "#333", passedColor: "#444", textColor: "#fff", description: "" }],
    stations: [], transfers: [], schemaVersion: 1, layout: {}, activeStyleTemplate: "classic", layoutTemplates: {},
  };
  const project = projectStore.serializeProject({ projectName: "offline", modules: [], connections: [], layers: [], viewport: { panX: 0, panY: 0, scale: 1 }, sourceDataSnapshot });
  const entries = unzipSync(projectStore.projectToArchive(project));
  const manifest = JSON.parse(new TextDecoder().decode(entries["project.json"]));
  delete manifest.sourceDataSnapshot;
  entries["project.json"] = strToU8(JSON.stringify(manifest));
  const archive = zipSync(entries);
  const file = { size: archive.length, arrayBuffer: async () => archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) };
  const restored = await projectStore.importProjectFile(file);
  assert.equal(restored.sourceDataSnapshot.lines[0].id, "L1");
});

test("history snapshot cloning protects nested CSV and mapping state", () => {
  const snapshot = {
    modules: [], connections: [], layers: [], backgroundImages: [], labels: [], transferGroups: [], transitData: null,
    pages: [], servicePatterns: [], platforms: [], graphics: [], assets: [], sourceLines: [], sourceStationsOnLine: [],
    physicalStations: [], sourceMappings: [{ id: "m", notes: "original" }], filters: { lineIds: ["L1"] },
    unresolvedChanges: [{ id: "c", entityType: "station", entityId: "S1", changeType: "field:code", severity: "info", status: "unresolved", oldValue: { code: "Z" }, newValue: { code: "A" }, affectedObjectIds: [], requiresPlacement: false }],
    pendingPlacement: { sourceStationId: "S1" }, operationName: "CSV import",
  };
  const cloned = history.cloneHistorySnapshot(snapshot);
  cloned.filters.lineIds.push("L2");
  cloned.unresolvedChanges[0].newValue.code = "B";
  assert.deepEqual(snapshot.filters.lineIds, ["L1"]);
  assert.equal(snapshot.unresolvedChanges[0].newValue.code, "A");
});
