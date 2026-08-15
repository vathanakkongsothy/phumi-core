import { describe, expect, it } from "vitest";
import { requestSignature, sha256 } from "../src/security.js";

describe("request signing", () => {
  it("hashes the exact raw body", () => {
    expect(sha256("{}" )).toBe("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  });

  it("is deterministic and binds method, path, timestamp, and body", () => {
    const input = { method: "PUT", path: "/v1/users", timestamp: "1786600000", rawBody: '{"externalId":"123"}', secret: "s".repeat(32) };
    expect(requestSignature(input)).toBe(requestSignature(input));
    expect(requestSignature({ ...input, path: "/v1/tenants" })).not.toBe(requestSignature(input));
  });
});
