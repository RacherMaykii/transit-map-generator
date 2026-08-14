import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const sync = await server.ssrLoadModule("/app/wiring/sourceSync.ts");
const stationUnlink = await server.ssrLoadModule("/app/wiring/stationUnlink.ts");
const projectStore = await server.ssrLoadModule("/app/wiring/projectStore.ts");
after(() => server.close());

function station(overrides = {}) {
  return { id: "L1-S01", lineId: "L1", sequence: 1, nameZh: "新站名", nameEn: "New Name", code: "L1-01", terminalType: "normal", throughLineIds: [], isOpen: true, icon: "博物馆.png", ...overrides };
}

function transit(stations = [station()]) {
  return { schemaVersion: 1, lines: [{ id: "L1", kind: "metro", number: "1", nameZh: "一号线", nameEn: "Line 1", code: "L1", lineColor: "#FF0000", stationColor: "#FF0000", currentColor: "#EE0011", passedColor: "#999999", textColor: "#FF0000", description: "" }], stations, transfers: [], layout: {}, activeStyleTemplate: "classic", layoutTemplates: {}, lineStyleTemplates: {} };
}

function project() {
  return {
    schemaVersion: 4, projectInfo: { name: "测试", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    pages: [], layers: [], connections: [], backgroundImages: [], transferGroups: [], platforms: [], servicePatterns: [], physicalStations: [], sourceMappings: [], filters: { lineIds: [] },
    modules: [{ id: "module-1", templateId: "island_platform", name: "站点", x: 0, y: 0, rotation: 0, lineIds: ["OLD"], sourceStationIds: ["L1-S01"], locked: false, layerId: "stations", zIndex: 0, customLabel: "旧站名" }],
    labels: [
      { id: "zh", text: "旧站名", x: 0, y: 0, fontSize: 12, anchor: "middle", rotation: 0, fill: "#000", fontWeight: 400, backgroundMask: false, maskStrokeWidth: 0, locked: false, visible: true, layerId: "labels", zIndex: 0, attachedToId: "module-1", language: "zh" },
      { id: "en", text: "Old Name", x: 0, y: 0, fontSize: 12, anchor: "middle", rotation: 0, fill: "#000", fontWeight: 400, backgroundMask: false, maskStrokeWidth: 0, locked: false, visible: true, layerId: "labels", zIndex: 0, attachedToId: "module-1", language: "en" },
    ],
    graphics: [{ id: "graphic-1", attachedToId: "module-1", assetId: "old", positionMode: "attached", x: 0, y: 0, width: 20, height: 20, rotation: 0, opacity: 1, layerId: "icons", zIndex: 0, offsetX: 0, offsetY: 0 }],
    assets: [{ id: "museum", name: "博物馆.png", mimeType: "image/png" }], sourceLines: [], sourceStationsOnLine: [], unresolvedChanges: [], pendingPlacement: null,
    viewport: { panX: 0, panY: 0, scale: 1 }, sourceDataSnapshot: transit([station({ nameZh: "旧站名", nameEn: "Old Name", icon: "旧图标.png" })]),
  };
}

test("saved wiring canvas follows the current CSV without restoring stale station data", () => {
  const result = sync.synchronizeWiringProjectSource(project(), transit());
  assert.equal(result.modules[0].customLabel, "新站名");
  assert.deepEqual(result.modules[0].lineIds, ["L1"]);
  assert.equal(result.labels.find((item) => item.id === "zh").text, "新站名");
  assert.equal(result.labels.find((item) => item.id === "en").text, "New Name");
  assert.equal(result.graphics[0].assetId, "museum");
  assert.equal(result.sourceStationsOnLine[0].nameZh, "新站名");
  assert.ok(result.unresolvedChanges.some((change) => change.changeType === "field:nameZh"));
  assert.equal(result.sourceDataSnapshot.stations[0].nameZh, "新站名");
});

test("newest saved copy wins when compatibility and common-document stores differ", () => {
  const oldProject = project();
  const newProject = { ...project(), projectInfo: { ...project().projectInfo, updatedAt: "2026-02-01T00:00:00.000Z" } };
  assert.equal(sync.newestWiringProject(oldProject, newProject), newProject);
  assert.equal(sync.newestWiringProject(null, oldProject), oldProject);
});

test("reopening preserves reverse cross-platform line and colour order", () => {
  const current = transit([
    station({ id: "L1-S01", lineId: "L1", throughLineIds: ["L2"] }),
    station({ id: "L2-S01", lineId: "L2", throughLineIds: ["L1"] }),
  ]);
  current.lines.push({ ...current.lines[0], id: "L2", number: "2", nameZh: "二号线", code: "L2", lineColor: "#0000FF" });
  const saved = project();
  saved.modules[0] = {
    ...saved.modules[0],
    templateId: "cross_platform",
    sourceStationIds: ["L2-S01", "L1-S01"],
    lineIds: ["L2", "L1"],
  };

  const restoredFromDisk = projectStore.jsonToProject(projectStore.projectToJson(saved));
  const reopened = sync.synchronizeWiringProjectSource(restoredFromDisk, current);
  assert.deepEqual(reopened.modules[0].sourceStationIds, ["L2-S01", "L1-S01"]);
  assert.deepEqual(reopened.modules[0].lineIds, ["L2", "L1"]);
});

// ── 站点删除后的解除关联（Section 三/四） ──────────────────────────

function wiringAssociationSummaryFixture() {
  return {
    modules: [
      { sourceStationIds: ["S1"] },
      { sourceStationIds: ["S1", "S2"] },
      { sourceStationIds: ["S2"] },
    ],
    transferGroups: [{ sourceStationIds: ["S1"] }],
    labels: [{ sourceStationId: "S1" }, { sourceStationId: "S3" }, { sourceStationId: undefined }],
  };
}

test("删除确认弹窗的关联汇总：只统计会被删除站完全未分配的元件", () => {
  const summary = stationUnlink.wiringAssociationsForStationIds(wiringAssociationSummaryFixture(), ["S1", "S3"]);
  assert.equal(summary.affectedModuleCount, 2);
  assert.equal(summary.unlinkedModuleCount, 1);
  assert.equal(summary.affectedTransferGroupCount, 1);
  assert.equal(summary.unlinkedTransferGroupCount, 1);
  assert.equal(summary.hasAssociation, true);

  const unrelated = stationUnlink.wiringAssociationsForStationIds(wiringAssociationSummaryFixture(), ["S9"]);
  assert.equal(unrelated.affectedModuleCount, 0);
  assert.equal(unrelated.hasAssociation, false);
});

test("删除确认弹窗统计物化站台、物理站、映射与待放置关联", () => {
  const document = {
    modules: [],
    transferGroups: [],
    labels: [],
    platforms: [{ id: "p1", sourceStationId: "S1", sourceLineId: "L1" }],
    physicalStations: [{ id: "physical-1", sourceStationIds: ["S1"] }],
    sourceMappings: [{ id: "mapping-1", sourceStationId: "S1", sourceLineId: "L1" }],
    pendingPlacement: { sourceStationId: "S1" },
  };
  const summary = stationUnlink.wiringAssociationsForStationIds(document, ["S1"], ["L1"]);
  assert.equal(summary.affectedPlatformCount, 1);
  assert.equal(summary.unlinkedPlatformCount, 1);
  assert.equal(summary.hasAssociation, true);
});

test("删除唯一关联站点：模块变为未分配，几何与模板保留", () => {
  const current = transit([]);
  const saved = project(); // module-1 关联 L1-S01，该站已不存在
  // 给标签显式绑定 sourceStationId，验证删除后清除绑定。
  saved.labels = saved.labels.map((label) => ({ ...label, sourceStationId: "L1-S01" }));
  const reopened = sync.synchronizeWiringProjectSource(saved, current);

  const module = reopened.modules[0];
  assert.equal(module.id, "module-1");
  assert.equal(module.templateId, "island_platform");
  assert.deepEqual(module.sourceStationIds, []);
  assert.deepEqual(module.lineIds, []);
  assert.equal(module.x, 0);
  assert.equal(module.y, 0);

  // 标签：保留文字与位置，清除绑定，视为自定义文字。
  const zh = reopened.labels.find((item) => item.id === "zh");
  assert.equal(zh.text, "旧站名");
  assert.equal(zh.sourceStationId, undefined);
  assert.equal(zh.language, undefined);
  const en = reopened.labels.find((item) => item.id === "en");
  assert.equal(en.text, "Old Name");
  assert.equal(en.sourceStationId, undefined);

  // 图标：保留，不再跟随站点图标刷新。
  assert.equal(reopened.graphics[0].assetId, "old");

  // 生成一条 info 信息记录。
  const info = reopened.unresolvedChanges.find((change) => change.changeType === "unlinked");
  assert.ok(info);
  assert.equal(info.severity, "info");
  assert.equal(info.status, "unresolved");
  assert.match(info.notes, /1 个配线图元件已恢复为未分配状态/);
  assert.deepEqual(info.affectedObjectIds, ["module-1"]);
});

test("跨平台模块删除一个站点：保留剩余关联与顺序", () => {
  const current = transit([station({ id: "L1-S01", lineId: "L1" })]);
  const saved = project();
  saved.modules[0] = {
    ...saved.modules[0],
    templateId: "cross_platform",
    sourceStationIds: ["L2-S01", "L1-S01"],
    lineIds: ["L2", "L1"],
  };
  const reopened = sync.synchronizeWiringProjectSource(saved, current);
  assert.deepEqual(reopened.modules[0].sourceStationIds, ["L1-S01"]);
  assert.deepEqual(reopened.modules[0].lineIds, ["L1"]);
  // 未受影响站点保持原顺序（L1-S01 仍在，L2-S01 被删）。
  assert.equal(reopened.modules[0].sourceStationIds.length, 1);
});

test("换乘组合：只清理失效关联，保留几何", () => {
  const current = transit([station({ id: "L1-S01", lineId: "L1" })]);
  const saved = project();
  saved.transferGroups = [
    { id: "group-1", name: "换乘组", moduleIds: [], lineIds: ["L2", "L1"], sourceStationIds: ["L2-S01", "L1-S01"], layerId: "transfers", zIndex: 1, visible: true, locked: false, x: 10, y: 20 },
  ];
  const reopened = sync.synchronizeWiringProjectSource(saved, current);
  assert.equal(reopened.transferGroups[0].id, "group-1");
  assert.equal(reopened.transferGroups[0].x, 10);
  assert.deepEqual(reopened.transferGroups[0].sourceStationIds, ["L1-S01"]);
  assert.deepEqual(reopened.transferGroups[0].lineIds, ["L1"]);
});

test("换乘组合：全部关联站点被删则整体未分配", () => {
  const current = transit([]);
  const saved = project();
  saved.transferGroups = [
    { id: "group-1", name: "换乘组", moduleIds: [], lineIds: ["L1"], sourceStationIds: ["L1-S01"], layerId: "transfers", zIndex: 1, visible: true, locked: false },
  ];
  const reopened = sync.synchronizeWiringProjectSource(saved, current);
  assert.deepEqual(reopened.transferGroups[0].sourceStationIds, []);
  assert.deepEqual(reopened.transferGroups[0].lineIds, []);
  assert.equal(reopened.transferGroups[0].id, "group-1");
});

test("物理站与源映射：不留下悬空 ID", () => {
  const current = transit([]);
  const saved = project();
  saved.physicalStations = [{ id: "ps-1", sourceStationIds: ["L1-S01"], x: 0, y: 0 }];
  saved.sourceMappings = [
    { id: "m-1", sourceStationId: "L1-S01", sourceStationOnLineId: "L1-S01", physicalStationId: "ps-1", diagramObjectId: "module-1", status: "mapped" },
    { id: "m-2", sourceStationId: "L1-S01", sourceStationOnLineId: "L1-S01", physicalStationId: "ps-1", diagramObjectId: undefined, status: "mapped" },
  ];
  const reopened = sync.synchronizeWiringProjectSource(saved, current);

  // 物理站清空后删除。
  assert.deepEqual(reopened.physicalStations, []);

  // 有 diagramObjectId 的映射保留并转为 unmapped，清除悬空引用。
  assert.equal(reopened.sourceMappings.length, 1);
  assert.equal(reopened.sourceMappings[0].id, "m-1");
  assert.equal(reopened.sourceMappings[0].status, "unmapped");
  assert.equal(reopened.sourceMappings[0].sourceStationId, undefined);
  assert.equal(reopened.sourceMappings[0].physicalStationId, undefined);
});

test("站点删除清除物化站台绑定但保留完整几何", () => {
  const current = transit([]);
  const saved = project();
  saved.platforms = [{
    id: "platform-1", moduleId: "module-1", sourceStationId: "L1-S01", sourceLineId: "L1",
    platformType: "island", attachedTrackIds: [], x: 12, y: 34, width: 88, height: 16,
    rotation: 45, fill: "#D7B06A", layerId: "platforms", zIndex: 3, visible: true, locked: false,
  }];
  const reopened = sync.synchronizeWiringProjectSource(saved, current);
  assert.equal(reopened.platforms.length, 1);
  assert.equal(reopened.platforms[0].sourceStationId, undefined);
  assert.equal(reopened.platforms[0].sourceLineId, undefined);
  assert.deepEqual(
    (({ x, y, width, height, rotation, fill, layerId, zIndex }) => ({ x, y, width, height, rotation, fill, layerId, zIndex }))(reopened.platforms[0]),
    { x: 12, y: 34, width: 88, height: 16, rotation: 45, fill: "#D7B06A", layerId: "platforms", zIndex: 3 },
  );
});

test("线路删除清理无站点模块、独立文字、交路、映射与筛选器的悬空线路 ID", () => {
  const current = transit([]);
  current.lines = [];
  const saved = project();
  saved.modules = [{
    ...saved.modules[0], id: "turnout-1", templateId: "turnout", sourceStationIds: [], lineIds: ["L1"],
  }];
  saved.labels = [{ ...saved.labels[0], attachedToId: undefined, sourceStationId: undefined, sourceLineId: "L1", language: undefined }];
  saved.platforms = [{
    id: "standalone-platform", sourceLineId: "L1", platformType: "side", attachedTrackIds: [],
    x: 5, y: 6, width: 40, height: 8, rotation: 0, fill: "#ccc", layerId: "platforms", zIndex: 0,
    visible: true, locked: false,
  }];
  saved.servicePatterns = [{
    id: "service-1", name: "交路", mode: "route", memberLineIds: ["L1"], stationPathIds: ["L1-S01"],
    segmentPathIds: [], visible: true, renderAsIndependentTrack: false,
  }];
  saved.sourceMappings = [{ id: "map-1", sourceLineId: "L1", diagramObjectId: "turnout-1", status: "mapped" }];
  saved.filters = { lineIds: ["L1"] };

  const reopened = sync.synchronizeWiringProjectSource(saved, current);
  assert.deepEqual(reopened.modules[0].lineIds, []);
  assert.equal(reopened.labels[0].sourceLineId, undefined);
  assert.equal(reopened.platforms[0].sourceLineId, undefined);
  assert.deepEqual(reopened.servicePatterns[0].memberLineIds, []);
  assert.deepEqual(reopened.servicePatterns[0].stationPathIds, []);
  assert.equal(reopened.sourceMappings[0].sourceLineId, undefined);
  assert.equal(reopened.sourceMappings[0].status, "unmapped");
  assert.deepEqual(reopened.filters.lineIds, []);
  assert.ok(!reopened.unresolvedChanges.some((change) => change.entityType === "line" && change.changeType === "removed"));
  assert.match(reopened.unresolvedChanges.find((change) => change.changeType === "unlinked").notes, /已恢复为未分配状态/);
});

test("原本没有来源关联的物理站记录不会被误删", () => {
  const current = transit([]);
  const saved = project();
  saved.physicalStations = [{ id: "manual-physical", displayName: "手动物理站", sourceStationIds: [] }];
  const reopened = sync.synchronizeWiringProjectSource(saved, current);
  assert.deepEqual(reopened.physicalStations, saved.physicalStations);
});

test("待放置状态指向已删除站点时被清空", () => {
  const current = transit([]);
  const saved = project();
  saved.pendingPlacement = { sourceStationId: "L1-S01", x: 0, y: 0 };
  const reopened = sync.synchronizeWiringProjectSource(saved, current);
  assert.equal(reopened.pendingPlacement, null);
});

test("保存后重开：未分配状态保持，不再生成新变更警告", () => {
  const current = transit([]);
  const saved = project();
  const once = sync.synchronizeWiringProjectSource(saved, current);
  const restored = projectStore.jsonToProject(projectStore.projectToJson(once));
  const twice = sync.synchronizeWiringProjectSource(restored, current);
  assert.deepEqual(twice.modules[0].sourceStationIds, []);
  assert.deepEqual(twice.modules[0].lineIds, []);
  // 已删除站点的"removed"变更被过滤，不会出现指向已删数据的悬空警告。
  assert.ok(!twice.unresolvedChanges.some((change) => change.changeType === "removed"));
});

test("旧工程遗留的悬空 sourceStationIds 在同步时自动迁移为未分配", () => {
  const current = transit([]);
  const saved = project(); // 快照仍引用 L1-S01，但当前数据已无该站
  const reopened = sync.synchronizeWiringProjectSource(saved, current);
  assert.deepEqual(reopened.modules[0].sourceStationIds, []);
  assert.deepEqual(reopened.modules[0].lineIds, []);
});
