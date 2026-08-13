import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const repositories = await server.ssrLoadModule("/app/projects/repositories.ts");
after(() => server.close());

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("static repository normalizes the three deployable sample CSV files", async () => {
  const texts = {
    "/sample-data/lines.csv": "id,kind,number,name_zh,name_en,code,line_color,station_color,current_color,passed_color,text_color,description\nL1,metro,1,Line One,Line One,1,#111,#222,#333,#444,#fff,\n",
    "/sample-data/stations.csv": "id,line_id,sequence,name_zh,name_en,code,marker_color,terminal_type,through_line_ids,notes,is_open,icon\nS1,L1,1,Alpha,Alpha,A,,normal,,,1,\n",
    "/sample-data/transfers.csv": "id,station_id,target_line_id,order,color_override,hidden\n",
  };
  const repository = new repositories.StaticProjectRepository(async (url) => new Response(texts[new URL(url, "http://test").pathname] || "", { status: texts[new URL(url, "http://test").pathname] ? 200 : 404 }));
  const data = await repository.loadTransitData("anything");
  assert.equal(data.lines[0].id, "L1");
  assert.equal(data.stations[0].isOpen, true);
  assert.equal(data.activeStyleTemplate, "classic");
  await assert.rejects(repository.saveTransitData("anything", data), /not available/);
});

test("HTTP repository retains legacy local-data-server endpoint and payload semantics", async () => {
  const calls = [];
  const repository = new repositories.HttpProjectRepository("http://127.0.0.1:4175/api", async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const path = new URL(url).pathname;
    if (path.endsWith("/data")) return json({ schemaVersion: 1, lines: [], stations: [], transfers: [], layout: {}, activeStyleTemplate: "classic", layoutTemplates: {} });
    if (path.endsWith("/save")) return json({ ok: true, revision: "saved-1" });
    if (path.endsWith("/save-layout")) return json({ activeStyleTemplate: "classic", layoutTemplates: { classic: {} }, layout: {} });
    if (path.endsWith("/revisions")) return json([]);
    return json({ error: "missing" }, 404);
  });
  const data = await repository.loadTransitData("ignored-project-id");
  const saved = await repository.saveTransitData("ignored-project-id", data);
  assert.equal(saved.revision.id, "saved-1");
  await repository.saveLayout("ignored-project-id", data);
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), ["/api/data", "/api/save", "/api/save-layout"]);
  assert.equal(JSON.parse(calls[1].init.body).schemaVersion, 1);
});

test("factory selects static, HTTP, and browser modes without exposing host details to callers", () => {
  assert.equal(repositories.createProjectRepository({ storageMode: "static" }).mode, "static");
  assert.equal(repositories.createProjectRepository({ storageMode: "http", host: "http://example.test/api" }).mode, "http");
  assert.equal(repositories.createProjectRepository({ storageMode: "browser" }).mode, "browser");
});
