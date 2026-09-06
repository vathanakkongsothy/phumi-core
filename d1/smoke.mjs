import { spawn, execFile } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const child = spawn(
  process.execPath,
  [
    join(root, "node_modules/wrangler/bin/wrangler.js"),
    "dev",
    "--config",
    "d1/wrangler.jsonc",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: root,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let log = "";
let exited = false;
let spawnError;
child.stdout.on("data", (chunk) => {
  log = (log + chunk).slice(-1000000);
});
child.stderr.on("data", (chunk) => {
  log = (log + chunk).slice(-1000000);
});
child.on("exit", () => {
  exited = true;
});
child.on("error", (error) => {
  spawnError = error;
});
try {
  const until = Date.now() + 75000;
  let response;
  while (Date.now() < until && !exited && !spawnError) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  if (!response)
    throw new Error(
      "Local preflight Worker did not start; see .d1-build/smoke.log",
    );
  assert.equal(response.status, 200, "D1 schema health failed");
  assert.deepEqual(await response.json(), {
    status: "ok",
    schema: "ok",
    applicationReady: false,
  });
  const write = await fetch(`http://127.0.0.1:${port}/health`, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    headers: { connection: "close" },
  });
  assert.equal(write.status, 404, "Preflight must not expose a write endpoint");
  console.log(
    "Local D1 Worker health passed; application readiness remains false and writes are rejected",
  );
} finally {
  await mkdir(join(root, ".d1-build"), { recursive: true });
  await writeFile(join(root, ".d1-build/smoke.log"), log);
  if (child.pid && !exited) {
    if (process.platform === "win32")
      await promisify(execFile)(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true },
      ).catch(() => {});
    else child.kill("SIGTERM");
  }
}
