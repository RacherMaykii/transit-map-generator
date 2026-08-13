import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const documents = await server.ssrLoadModule("/app/projects/editorDocumentStore.ts");
after(() => server.close());

test("editor document keys preserve the project/editor compound identity", () => {
  const transit = documents.editorDocumentKey("project:1", "transit");
  const wiring = documents.editorDocumentKey("project:1", "wiring");
  const secondProject = documents.editorDocumentKey("project:1:wiring", "transit");
  assert.equal(transit, '["project:1","transit"]');
  assert.notEqual(transit, wiring);
  assert.notEqual(transit, secondProject);
  assert.throws(() => documents.editorDocumentKey("", "transit"), /projectId/);
});

test("editor documents are JSON-cloned and reject non-JSON values", () => {
  const source = { nested: { ids: ["S1"] }, enabled: true };
  const clone = documents.cloneEditorDocument(source);
  clone.nested.ids.push("S2");
  assert.deepEqual(source, { nested: { ids: ["S1"] }, enabled: true });
  assert.throws(() => documents.cloneEditorDocument({ callback: () => "no" }), /JSON-serializable/);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => documents.cloneEditorDocument(cyclic), /JSON-serializable/);
});
