import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const archives = await server.ssrLoadModule("/app/projects/projectArchive.ts");
after(() => server.close());

function sampleData() {
  return {
    schemaVersion: 1,
    lines: [{ id: "L1", kind: "metro", number: "1", nameZh: "一号线", nameEn: "Line 1", code: "L1", lineColor: "#111111", stationColor: "#111111", currentColor: "#DD0022", passedColor: "#888888", textColor: "#111111", description: "" }],
    stations: [{ id: "S1", lineId: "L1", sequence: 1, nameZh: "测试站", nameEn: "Test Station", code: "L1-01", terminalType: "normal", throughLineIds: [], isOpen: true }],
    transfers: [],
    activeStyleTemplate: "classic",
    layoutTemplates: {},
    layout: {},
  };
}

function repository() {
  const state = { data: new Map([["source", sampleData()]]), assets: new Map([["source:icon.png", new Blob(["icon"], { type: "image/png" })]]) };
  return {
    state,
    mode: "browser",
    capabilities: { canCreateProjects: true, canDeleteProjects: true, canSaveTransitData: true, canSaveLayout: true, canManageAssets: true, canRestoreRevisions: true },
    async createProject(name) { return { id: "imported", name, createdAt: "", updatedAt: "", storageMode: "browser" }; },
    async deleteProject() {},
    async loadTransitData(id) { return state.data.get(id); },
    async saveTransitData(id, data) { state.data.set(id, data); return {}; },
    async listAssets(id) { return [...state.assets.keys()].filter((key) => key.startsWith(`${id}:`)).map((key) => key.slice(id.length + 1)); },
    async listCustomAssets(id) { return [...state.assets.keys()].filter((key) => key.startsWith(`${id}:`)).map((key) => key.slice(id.length + 1)); },
    async getAsset(id, name) { const blob = state.assets.get(`${id}:${name}`); return blob ? { name, blob, updatedAt: "" } : null; },
    async putAsset(id, name, blob) { state.assets.set(`${id}:${name}`, blob); },
  };
}

test("railcity package round-trips shared data, editor documents, and binary assets", async () => {
  const sourceRepository = repository();
  const sourceDocuments = { async load(_id, kind) { return kind === "entrance" ? { schemaVersion: 1, nameZh: "测试站" } : null; } };
  const archive = await archives.createRailCityArchive({ id: "source", name: "测试城市", createdAt: "", updatedAt: "", storageMode: "browser" }, sourceRepository, sourceDocuments);
  assert.ok(archive.size > 0);

  const targetRepository = repository();
  const savedDocuments = [];
  const targetDocuments = {
    async save(id, kind, document) { savedDocuments.push({ id, kind, document }); },
    async deleteProjectDocuments() {},
  };
  const imported = await archives.importRailCityArchive(archive, targetRepository, targetDocuments);
  assert.equal(imported.id, "imported");
  assert.equal(targetRepository.state.data.get("imported").stations[0].nameZh, "测试站");
  assert.equal(await targetRepository.state.assets.get("imported:icon.png").text(), "icon");
  assert.deepEqual(savedDocuments, [{ id: "imported", kind: "entrance", document: { schemaVersion: 1, nameZh: "测试站" } }]);
});

test("split project and asset packages restore user assets by stable binding", async () => {
  const sourceRepository = repository();
  const sourceDocuments = { async load() { return null; } };
  const project = { id: "source", name: "测试城市", createdAt: "", updatedAt: "", storageMode: "browser" };
  const main = await archives.createRailProjectArchive(project, sourceRepository, "project", sourceDocuments);
  const resources = await archives.createRailAssetsArchive(project, sourceRepository);

  const targetRepository = repository();
  const targetDocuments = { async save() {}, async deleteProjectDocuments() {} };
  const imported = await archives.importRailProjectArchive(main, targetRepository, targetDocuments);
  assert.deepEqual(imported.missingAssets, ["icon.png"]);
  assert.equal(targetRepository.state.assets.has("imported:icon.png"), false);

  const restored = await archives.importRailAssetsArchive(resources, imported.project.id, targetRepository);
  assert.equal(restored.imported, 1);
  assert.deepEqual(restored.missing, []);
  assert.equal(await targetRepository.state.assets.get("imported:icon.png").text(), "icon");
});

test("complete project archive embeds user assets while public assets stay excluded", async () => {
  const sourceRepository = repository();
  sourceRepository.state.assets.set("source:public.png", new Blob(["public"], { type: "image/png" }));
  sourceRepository.listCustomAssets = async () => ["icon.png"];
  const archive = await archives.createRailProjectArchive(
    { id: "source", name: "测试城市", createdAt: "", updatedAt: "", storageMode: "browser" },
    sourceRepository,
    "full",
    { async load() { return null; } },
  );
  const targetRepository = repository();
  const imported = await archives.importRailProjectArchive(archive, targetRepository, { async save() {}, async deleteProjectDocuments() {} });
  assert.equal(targetRepository.state.assets.has(`${imported.project.id}:icon.png`), true);
  assert.equal(targetRepository.state.assets.has(`${imported.project.id}:public.png`), false);
});

test("complete project archive embeds URL-backed wiring backgrounds and restores the wiring document", async (t) => {
  const backgroundUrl = "sample-projects/default/assets/void-city-map.png";
  t.mock.method(globalThis, "fetch", async (input) => {
    assert.equal(String(input), backgroundUrl);
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  });
  const wiring = {
    schemaVersion: 5,
    projectInfo: { name: "虚空城示例配线图", createdAt: "2026-08-14T00:00:00.000Z", updatedAt: "2026-08-14T00:00:00.000Z" },
    pages: [], layers: [], modules: [], connections: [], labels: [], servicePatterns: [], transferGroups: [], platforms: [], graphics: [], assets: [],
    backgroundImages: [{ id: "bg-map", src: backgroundUrl, name: "虚空城地图.png", x: 0, y: 0, naturalWidth: 100, naturalHeight: 100, scale: 1, opacity: 1, locked: true, visible: true, layerId: "layer-background", zIndex: -100 }],
    sourceLines: [], sourceStationsOnLine: [], physicalStations: [], sourceMappings: [], filters: { lineIds: [] }, unresolvedChanges: [], pendingPlacement: null,
    viewport: { panX: 0, panY: 0, scale: 1 },
  };
  const sourceRepository = repository();
  sourceRepository.listCustomAssets = async () => [];
  const sourceDocuments = { async load(_id, kind) { return kind === "wiring" ? structuredClone(wiring) : null; } };
  const archive = await archives.createRailProjectArchive(
    { id: "source", name: "虚空城", createdAt: "", updatedAt: "", storageMode: "browser" },
    sourceRepository,
    "full",
    sourceDocuments,
  );
  const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  assert.equal(manifest.assets.length, 1);
  assert.deepEqual(manifest.assets[0].bindings, [{ kind: "wiring-background", id: "bg-map" }]);
  assert.ok(entries[manifest.assets[0].path]);
  assert.equal(JSON.parse(strFromU8(entries[manifest.editors.wiring])).backgroundImages[0].src, "");

  const documents = new Map();
  const targetDocuments = {
    async load(id, kind) { return documents.get(`${id}:${kind}`) || null; },
    async save(id, kind, document) { documents.set(`${id}:${kind}`, structuredClone(document)); },
    async deleteProjectDocuments() {},
  };
  // Browser compatibility storage is covered separately; omit it here so this
  // Node test can verify the common editor-document restore path without IDB.
  delete entries[manifest.wiringProjectPath];
  delete manifest.wiringProjectPath;
  entries["manifest.json"] = strToU8(JSON.stringify(manifest));
  const documentOnlyArchive = new Blob([zipSync(entries)]);
  const imported = await archives.importRailProjectArchive(documentOnlyArchive, repository(), targetDocuments);
  assert.deepEqual(imported.missingAssets, []);
  assert.match(documents.get("imported:wiring").backgroundImages[0].src, /^data:image\/png;base64,/);
});

test("railcity import rejects non-archive input before creating a project", async () => {
  const targetRepository = repository();
  await assert.rejects(archives.importRailCityArchive(new Blob(["not a zip"]), targetRepository, {}), /无法解压/);
  assert.equal(targetRepository.state.data.has("imported"), false);
});
