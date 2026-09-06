import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const environment = {
  "NODE_ENV": "test",
  "PUBLIC_BASE_URL": "http://localhost:8790",
  "CORE_APPS_JSON": "[{\"id\":\"test-app\",\"requestSecret\":\"d1-local-smoke-secret-32-characters\"}]"
};
describe("database backend configuration", () => {
  it("allows D1 without a PostgreSQL connection string", () => {
    expect(loadConfig(environment, "d1").databaseUrl).toBe("");
  });
  it("requires a connection string for the default Neon backend", () => {
    expect(() => loadConfig(environment)).toThrow();
  });
  it("rejects an unknown backend even when Neon credentials exist", () => {
    expect(() => loadConfig({ ...environment, DATABASE_URL: "postgresql://test:test@localhost/test" }, "D1" as "d1")).toThrow();
  });
});
