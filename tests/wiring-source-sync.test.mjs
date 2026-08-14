import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const sync = await server.ssrLoadModule("/app/wiring/sourceSync.ts");
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
