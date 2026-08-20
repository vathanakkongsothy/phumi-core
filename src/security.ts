import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import type { CoreAppConfig, CoreConfig } from "./config.js";
import { CoreError } from "./errors.js";

const MAX_CLOCK_SKEW_SECONDS = 300;

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }

export function signedRequestPath(path: string, url: string): string {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return path;
  const fragmentStart = url.indexOf("#", queryStart);
  const search = fragmentStart === -1 ? url.slice(queryStart) : url.slice(queryStart, fragmentStart);
  return `${path}${search}`;
}

export function requestSignature(input: { method: string; path: string; timestamp: string; rawBody: string; secret: string }) {
  const canonical = [input.method.toUpperCase(), input.path, input.timestamp, sha256(input.rawBody)].join("\n");
  return createHmac("sha256", input.secret).update(canonical).digest("hex");
}

export function authenticateAppRequest(context: Context, config: CoreConfig, rawBody: string): CoreAppConfig {
  const appId = context.req.header("x-app-id")?.trim() ?? "";
  const timestamp = context.req.header("x-timestamp")?.trim() ?? "";
  const signature = context.req.header("x-signature")?.trim().toLowerCase() ?? "";
  const app = config.apps.get(appId);
  if (!app || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) throw new CoreError("AUTHENTICATION_ERROR", "Application authentication failed", 401);
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) throw new CoreError("STALE_REQUEST", "Request timestamp is outside the allowed five-minute window", 401);
  const expected = requestSignature({ method: context.req.method, path: signedRequestPath(context.req.path, context.req.url), timestamp, rawBody, secret: app.requestSecret });
  if (!safeEqual(signature, expected)) throw new CoreError("AUTHENTICATION_ERROR", "Application authentication failed", 401);
  return app;
}
