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
