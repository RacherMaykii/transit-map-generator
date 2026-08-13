import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const associations = await server.ssrLoadModule("/app/wiring/stationAssociation.ts");
const transferLabels = await server.ssrLoadModule("/app/wiring/transferLabels.ts");
const avoidance = await server.ssrLoadModule("/app/wiring/labelAvoidance.ts");
const color = await server.ssrLoadModule("/app/wiring/color.ts");
const templates = await server.ssrLoadModule("/app/wiring/templates.ts");
after(() => server.close());

const stations = [
  { id: "L7-01", lineId: "L7", throughLineIds: [], nameZh: "曦和洲", nameEn: "Xihe Isle" },
  { id: "T5-01", lineId: "T5", throughLineIds: ["L8"], nameZh: "曦和洲", nameEn: "Xihe Isle" },
];

test("a platform can associate multiple station records and expose every line", () => {
  const ids = associations.addStationAssociation(["L7-01"], "T5-01");
  assert.deepEqual(ids, ["L7-01", "T5-01"]);
  assert.deepEqual(associations.lineIdsForStationAssociations(ids, stations), ["L7", "T5", "L8"]);
  assert.deepEqual(associations.removeStationAssociation(ids, "L7-01"), ["T5-01"]);
  assert.equal(associations.addStationAssociation(ids, "T5-01"), ids);
});

test("non-materialized template platforms display transfer line names", () => {
  const template = templates.MODULE_TEMPLATES.find((candidate) => candidate.id === "side_platform");
  const owner = { id: "m", lineIds: ["L7", "T5"] };
  const sourceLines = [
    { id: "L7", nameZh: "7号线" },
    { id: "T5", nameZh: "有轨电车5号线" },
  ];
  const first = color.templatePlatformLineNames(template.platforms[0], owner, sourceLines, template.tracks, template.platforms, template.trackLinePattern);
  const second = color.templatePlatformLineNames(template.platforms[1], owner, sourceLines, template.tracks, template.platforms, template.trackLinePattern);
  assert.deepEqual(first, ["7号线"]);
  assert.deepEqual(second, ["有轨电车5号线"]);
});

test("a transfer group keeps only its first available bilingual station name", () => {
  const labels = [
    { id: "a-zh", attachedToId: "a", language: "zh", sourceStationId: "L7-01" },
    { id: "a-en", attachedToId: "a", language: "en", sourceStationId: "L7-01" },
    { id: "b-zh", attachedToId: "b", language: "zh", sourceStationId: "T5-01" },
    { id: "b-en", attachedToId: "b", language: "en", sourceStationId: "T5-01" },
    { id: "note", attachedToId: "b", text: "2站台" },
  ];
  const hidden = transferLabels.duplicateTransferStationLabelIds(labels, [{ visible: true, moduleIds: ["a", "b"] }]);
  assert.deepEqual([...hidden].sort(), ["b-en", "b-zh"]);
  assert.equal(hidden.has("note"), false);
});

test("45-degree station labels avoid platforms along module-local axes", () => {
  const stationModule = { id: "m", x: 100, y: 100, rotation: 45 };
  const label = {
    id: "label", text: "曦和洲", x: 150, y: 150, rotation: 45, anchor: "top", fontSize: 16,
    language: "zh", sourceStationId: "L7-01", attachedToId: "m", positionMode: "attached",
    offsetX: 50, offsetY: 50, pageId: "page-1", visible: true, locked: false,
  };
  const platform = {
    id: "platform", x: 122, y: 135, width: 70, height: 16, rotation: 45,
    pageId: "page-1", visible: true,
  };
  const result = avoidance.resolveLabelIconOverlaps({ modules: [stationModule], labels: [label], graphics: [], platforms: [platform], activePageId: "page-1" });
  assert.equal(result.changed, true);
  const patch = result.patches[0];
  assert.ok(Math.abs(Math.abs(patch.x - label.x) - Math.abs(patch.y - label.y)) < 0.05);
  assert.equal(avoidance.bboxesOverlap(avoidance.computeLabelBbox(result.labels[0]), avoidance.computePlatformBbox(platform), 0), false);
});

test("ignored duplicate labels neither move nor obstruct the retained station name", () => {
  const stationModule = { id: "m", x: 0, y: 0, rotation: 0 };
  const base = { text: "曦和洲", x: 50, y: 50, rotation: 0, anchor: "top", fontSize: 16, language: "zh", sourceStationId: "s", attachedToId: "m", positionMode: "attached", offsetX: 50, offsetY: 50, pageId: "page-1", visible: true, locked: false };
  const labels = [{ ...base, id: "keep" }, { ...base, id: "hide" }];
  const result = avoidance.resolveLabelIconOverlaps({ modules: [stationModule], labels, graphics: [], ignoredLabelIds: ["hide"], activePageId: "page-1" });
  assert.equal(result.changed, false);
  assert.equal(result.labels, labels);
});

test("independent line-linked text stays outside automatic avoidance", () => {
  const label = {
    id: "note", text: "7号线施工说明", x: 50, y: 50, rotation: 0, anchor: "bottom", fontSize: 18,
    sourceLineId: "L7", positionMode: "independent", pageId: "page-1", visible: true, locked: false,
  };
  const platform = { id: "p", x: 0, y: 30, width: 100, height: 40, rotation: 0, pageId: "page-1", visible: true };
  const labels = [label];
  const result = avoidance.resolveLabelIconOverlaps({ modules: [], labels, graphics: [], platforms: [platform], activePageId: "page-1" });
  assert.equal(result.changed, false);
  assert.equal(result.labels, labels);
  const local = avoidance.computeLabelLocalBox(label);
  assert.ok(local.w > 20 && local.h > 0);
});
