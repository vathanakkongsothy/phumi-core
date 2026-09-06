import { unstable_dev } from "wrangler";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const worker = await unstable_dev("src/worker.ts", {
  config: "d1/runtime.wrangler.jsonc",
  local: true,
  ip: "127.0.0.1",
  port: 0,
  persistTo: resolve("d1/.wrangler/state"),
  logLevel: "warn",
  experimental: { disableExperimentalWarning: true, disableDevRegistry: true, forceLocal: true, watch: false },
});
const base = "http://127.0.0.1:" + worker.port;
async function signed(method, path, body) {
  const rawBody = body === undefined ? "" : JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHash("sha256").update(rawBody).digest("hex");
  const signature = createHmac("sha256", "d1-local-smoke-secret-32-characters").update([method, path, timestamp, digest].join("\n")).digest("hex");
  return fetch(base + path, { method, headers: { "content-type": "application/json", "x-app-id": "test-app", "x-timestamp": timestamp, "x-signature": signature, connection: "close" }, ...(body === undefined ? {} : { body: rawBody }), signal: AbortSignal.timeout(5000) });
}
try {
  let health;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      health = await fetch(base + "/health", { signal: AbortSignal.timeout(5000), headers: { connection: "close" } });
      break;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  assert.ok(health, "Local Worker did not become ready");
  assert.equal(health.status, 200, await health.text());
  const suffix = randomUUID();
  const create = await signed("PUT", "/v1/users", { externalId: "smoke-" + suffix, displayName: "D1 Smoke", locale: "en" });
  assert.equal(create.status, 200);
  const { user } = await create.json();
  const tenantResponse = await signed("POST", "/v1/tenants", { externalId: "smoke-" + suffix, slug: "smoke-" + suffix, name: "D1 Smoke", ownerUserId: user.id });
  assert.equal(tenantResponse.status, 201);
  const { tenant } = await tenantResponse.json();
  assert.equal(tenant.memberships[0].role, "OWNER");
  const demote = await signed("PUT", "/v1/tenants/" + tenant.id + "/members/" + user.id, { role: "MEMBER", status: "ACTIVE" });
  assert.equal(demote.status, 409);
  const subscription = await signed("PUT", "/v1/tenants/" + tenant.id + "/subscription", { planKey: "pro", status: "ACTIVE", cancelAtPeriodEnd: false });
  assert.equal(subscription.status, 200);
  const resolved = await signed("GET", "/v1/tenants/" + tenant.id);
  assert.equal(resolved.status, 200);
  assert.equal((await resolved.json()).tenant.subscription.planKey, "pro");
  const unsigned = await fetch(base + "/v1/tenants/" + tenant.id, { signal: AbortSignal.timeout(5000), headers: { connection: "close" } });
  assert.equal(unsigned.status, 401);
  console.log("Real D1 Worker API passed identity, tenant, owner guard, subscription, and authentication checks");
} finally {
  await worker.stop();
}
