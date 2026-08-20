import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { CoreConfig } from "../src/config.js";
import { requestSignature, sha256, signedRequestPath } from "../src/security.js";

const secret = "s".repeat(32);
const config: CoreConfig = {
  nodeEnv: "test",
  port: 8790,
  databaseUrl: "postgresql://unused",
  publicBaseUrl: "http://localhost:8790",
  apps: new Map([["garage", { id: "garage", requestSecret: secret }]]),
};

const user = {
  id: "usr_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  displayName: "Sothy",
  email: "sothy@example.com",
  phone: null,
  locale: "km",
  status: "ACTIVE" as const,
  metadata: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function signedHeaders(input: { method: string; path: string; rawBody?: string; timestamp?: string; secret?: string }) {
  const timestamp = input.timestamp ?? String(Math.floor(Date.now() / 1000));
  const rawBody = input.rawBody ?? "";
  return {
    "x-app-id": "garage",
    "x-timestamp": timestamp,
    "x-signature": requestSignature({ method: input.method, path: input.path, timestamp, rawBody, secret: input.secret ?? secret }),
  };
}

describe("request signing", () => {
  it("hashes the exact raw body", () => {
    expect(sha256("{}")).toBe("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  });

  it("appends the exact query string from the request URL", () => {
    expect(signedRequestPath("/v1/users/resolve", "http://localhost:8790/v1/users/resolve?externalId=abc")).toBe("/v1/users/resolve?externalId=abc");
    expect(signedRequestPath("/v1/users", "http://localhost:8790/v1/users")).toBe("/v1/users");
    expect(signedRequestPath("/v1/users/resolve", "http://localhost:8790/v1/users/resolve?externalId=a%2Fb#ignored")).toBe("/v1/users/resolve?externalId=a%2Fb");
  });

  it("is deterministic and binds method, path, query, timestamp, and body", () => {
    const input = { method: "GET", path: "/v1/users/resolve?externalId=123", timestamp: "1786600000", rawBody: "", secret };
    expect(requestSignature(input)).toBe(requestSignature(input));
    expect(requestSignature({ ...input, path: "/v1/users/resolve?externalId=456" })).not.toBe(requestSignature(input));
  });
});

describe("authenticateAppRequest", () => {
  it("rejects a swapped resolve query even when the path signature would match", async () => {
    const app = createApp({} as never, config);
    const response = await app.request("/v1/users/resolve?externalId=user-b", {
      headers: signedHeaders({ method: "GET", path: "/v1/users/resolve?externalId=user-a" }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AUTHENTICATION_ERROR" } });
  });

  it("rejects a resolve request signed without the query string", async () => {
    const app = createApp({} as never, config);
    const response = await app.request("/v1/users/resolve?externalId=user-a", {
      headers: signedHeaders({ method: "GET", path: "/v1/users/resolve" }),
    });
    expect(response.status).toBe(401);
  });

  it("accepts a resolve request signed with the exact query", async () => {
    const app = createApp({
      externalIdentity: { findUnique: async () => ({ user }) },
    } as never, config);
    const path = "/v1/users/resolve?externalId=user-a";
    const response = await app.request(path, { headers: signedHeaders({ method: "GET", path }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ user: { id: user.id } });
  });

  it("rejects a stale timestamp", async () => {
    const app = createApp({} as never, config);
    const path = "/v1/users/resolve?externalId=user-a";
    const response = await app.request(path, {
      headers: signedHeaders({ method: "GET", path, timestamp: String(Math.floor(Date.now() / 1000) - 400) }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "STALE_REQUEST" } });
  });

  it("rejects the wrong request secret", async () => {
    const app = createApp({} as never, config);
    const path = "/v1/users";
    const response = await app.request(path, {
      method: "PUT",
      headers: { ...signedHeaders({ method: "PUT", path, rawBody: "{}", secret: "x".repeat(32) }), "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(401);
  });
});
