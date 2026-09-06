import { unstable_dev } from "wrangler";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const worker = await unstable_dev("d1/worker.ts", {
  config: "d1/wrangler.jsonc", local: true, ip: "127.0.0.1", port: 0,
  persistTo: resolve("d1/.wrangler/state"), logLevel: "error",
  experimental: { disableExperimentalWarning: true, disableDevRegistry: true, forceLocal: true, watch: false },
});
try {
  const response = await worker.fetch("/health");
  assert.equal(response.status, 200, "D1 schema health failed");
  assert.deepEqual(await response.json(), { status: "ok", schema: "ok", applicationReady: false });
  const write = await worker.fetch("/health", { method: "POST" });
  assert.equal(write.status, 404, "Preflight must not expose a write endpoint");
  console.log("Local D1 preflight schema health passed and writes are rejected");
} finally {
  await worker.stop();
}
