import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

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

test("railcity import rejects non-archive input before creating a project", async () => {
  const targetRepository = repository();
  await assert.rejects(archives.importRailCityArchive(new Blob(["not a zip"]), targetRepository, {}), /无法解压/);
  assert.equal(targetRepository.state.data.has("imported"), false);
});
