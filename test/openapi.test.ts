import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { CoreConfig } from "../src/config.js";

const config: CoreConfig = {
  nodeEnv: "test",
  port: 8790,
  databaseUrl: "postgresql://unused",
  publicBaseUrl: "http://localhost:8790",
  apps: new Map([["garage", { id: "garage", requestSecret: "s".repeat(32) }]]),
};

describe("OpenAPI contract", () => {
  it("documents all core routes without needing a database", async () => {
    const app = createApp({} as never, config);
    const response = await app.request("/openapi.json");
    const document = await response.json() as { paths: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining([
      "/health", "/v1/users", "/v1/users/resolve", "/v1/users/{userId}", "/v1/tenants", "/v1/tenants/{tenantId}",
      "/v1/tenants/{tenantId}/members/{userId}", "/v1/tenants/{tenantId}/subscription",
    ]));
  });
});
