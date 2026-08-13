import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
let child;
let origin;

async function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitUntilReady(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("local data server did not become ready");
}

before(async () => {
  const port = await availablePort();
  origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["local-data-server.mjs"], {
    cwd: root,
    env: { ...process.env, TRANSIT_DATA_PORT: String(port) },
    stdio: "ignore",
    windowsHide: true,
  });
  await waitUntilReady(origin);
});

after(() => child?.kill());

test("new projects fall back to the shared public icon directory", async () => {
  const name = encodeURIComponent("客运中心.png");
  const [shared, project] = await Promise.all([
    fetch(`${origin}/api/icons/${name}?project=default`),
    fetch(`${origin}/api/icons/${name}?project=project-public-fallback-test`),
  ]);
  assert.equal(shared.status, 200);
  assert.equal(project.status, 200);
  assert.equal(project.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await project.arrayBuffer()), Buffer.from(await shared.arrayBuffer()));
});

test("project data is isolated between projects on the local data server", async () => {
  const create = async (name) => (await fetch(`${origin}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })).json();
  const first = await create("隔离测试甲");
  const second = await create("隔离测试乙");
  assert.ok(first.id && second.id, "projects should be created with ids");
  assert.notEqual(first.id, second.id, "each project gets a unique id");
  assert.ok(first.id.startsWith("project-"), "server ids use the project- prefix");

  const payloadFor = (nameZh) => ({
    schemaVersion: 1,
    lines: [{ id: "L1", kind: "metro", number: "1", nameZh, nameEn: nameZh, code: "1", lineColor: "#111111", stationColor: "#222222", currentColor: "#333333", passedColor: "#444444", textColor: "#ffffff", description: "" }],
    stations: [],
    transfers: [],
    layout: {},
    activeStyleTemplate: "classic",
    layoutTemplates: {},
  });
  const save = (id, data) => fetch(`${origin}/api/save?project=${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const load = async (id) => (await fetch(`${origin}/api/data?project=${id}`)).json();

  await Promise.all([save(first.id, payloadFor("甲线")), save(second.id, payloadFor("乙线"))]);
  assert.equal((await load(first.id)).lines[0].nameZh, "甲线");
  assert.equal((await load(second.id)).lines[0].nameZh, "乙线");

  // the default project is not touched by per-project saves
  const defaultBefore = await load("default");
  assert.ok(defaultBefore.lines.length > 0);
  assert.notEqual(defaultBefore.lines[0].nameZh, "甲线");

  // deleting one project leaves the other and the default intact
  const deleted = await fetch(`${origin}/api/projects/${first.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  assert.equal((await load(second.id)).lines[0].nameZh, "乙线");
  assert.equal((await load("default")).lines[0].nameZh, defaultBefore.lines[0].nameZh);
  const gone = await fetch(`${origin}/api/data?project=${first.id}`);
  assert.notEqual(gone.status, 200, "deleted project directory is gone");

  // cleanup: delete the surviving project too, so each test run does not
  // leave a residue project under the real data/projects/ directory.
  const removed = await fetch(`${origin}/api/projects/${second.id}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
});
