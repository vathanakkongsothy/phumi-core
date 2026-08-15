import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const valid = {
  NODE_ENV: "test",
  PORT: "8790",
  DATABASE_URL: "postgresql://test:test@localhost:5432/core",
  PUBLIC_BASE_URL: "http://localhost:8790",
  CORE_APPS_JSON: JSON.stringify([{ id: "garage", requestSecret: "g".repeat(32) }]),
};

describe("loadConfig", () => {
  it("loads trusted applications", () => {
    const config = loadConfig(valid);
    expect(config.apps.get("garage")?.requestSecret).toBe("g".repeat(32));
    expect(config.publicBaseUrl).toBe("http://localhost:8790");
  });

  it("rejects duplicate app ids", () => {
    expect(() => loadConfig({ ...valid, CORE_APPS_JSON: JSON.stringify([{ id: "garage", requestSecret: "g".repeat(32) }, { id: "garage", requestSecret: "h".repeat(32) }]) })).toThrow(/duplicate/);
  });

  it("requires HTTPS away from localhost", () => {
    expect(() => loadConfig({ ...valid, PUBLIC_BASE_URL: "http://core.example.com" })).toThrow();
  });
});
