import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true } });
const samples = await server.ssrLoadModule("/app/wiring/sampleProject.ts");
after(() => server.close());

function emptyProject(overrides = {}) {
  return {
    schemaVersion: 5,
    projectInfo: { name: "空工程", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    pages: [], layers: [], modules: [], connections: [], backgroundImages: [], labels: [], servicePatterns: [],
    transferGroups: [], platforms: [], graphics: [], assets: [], sourceLines: [], sourceStationsOnLine: [],
    physicalStations: [], sourceMappings: [], filters: { lineIds: [] }, unresolvedChanges: [], pendingPlacement: null,
    viewport: { panX: 0, panY: 0, scale: 1 },
    ...overrides,
  };
}

test("only the built-in default project can load the Void City wiring sample", async () => {
  let calls = 0;
  const nonDefault = await samples.loadDefaultWiringSample("project-user-created", async () => {
    calls += 1;
    throw new Error("must not fetch");
  });
  assert.equal(nonDefault, null);
  assert.equal(calls, 0);
  assert.equal(samples.DEFAULT_WIRING_SAMPLE_MARKER, "wiring:default:sample:void-city-v2");
});

test("empty detection replaces only empty shells and preserves real diagrams", () => {
  assert.equal(samples.isWiringProjectEmpty(null), true);
  assert.equal(samples.isWiringProjectEmpty(emptyProject()), true);
  assert.equal(samples.isWiringProjectEmpty(emptyProject({ modules: [{ id: "station" }] })), false);
  assert.equal(samples.isWiringProjectEmpty(emptyProject({ backgroundImages: [{ id: "map" }] })), false);
  assert.equal(samples.shouldInstallDefaultWiringSample(emptyProject()), true);
  assert.equal(samples.shouldInstallDefaultWiringSample(emptyProject({
    projectInfo: { name: "虚空城示例配线图", createdAt: "2026-08-13T07:53:36.646Z", updatedAt: "2026-08-13T07:53:36.646Z" },
    modules: Array.from({ length: 142 }, (_, index) => ({ id: `m-${index}` })),
    connections: Array.from({ length: 266 }, (_, index) => ({ id: `c-${index}` })),
  })), true);
  assert.equal(samples.shouldInstallDefaultWiringSample(emptyProject({
    projectInfo: { name: "虚空城示例配线图", createdAt: "2026-08-13T07:53:36.646Z", updatedAt: "2026-08-14T00:00:00.000Z" },
    modules: [{ id: "user-edited" }],
  })), false);
});

test("bundled Void City sample contains the supplied diagram and public background", async () => {
  const sample = JSON.parse(await readFile(new URL("../public/sample-projects/default/wiring.json", import.meta.url), "utf8"));
  assert.equal(sample.projectInfo.name, "虚空城示例配线图");
  assert.equal(sample.modules.length, 143);
  assert.equal(sample.connections.length, 268);
  assert.equal(sample.labels.length, 189);
  assert.equal(sample.platforms.length, 121);
  assert.equal(sample.backgroundImages[0].src, "sample-projects/default/assets/void-city-map.png");
});
