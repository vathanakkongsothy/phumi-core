import { randomUUID } from "node:crypto";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { PrismaClient } from "@prisma/client";
import type { CoreConfig } from "./config.js";
import { CoreError, errorResponse } from "./errors.js";
import { CoreService, serializeMembership, serializeSubscription, serializeTenant, serializeUser } from "./core-service.js";
import { createTenantRoute, getTenantRoute, getUserRoute, healthRoute, resolveTenantRoute, resolveUserRoute, updateSubscriptionRoute, upsertMembershipRoute, upsertUserRoute } from "./routes.js";
import { membershipResponseSchema, subscriptionResponseSchema, tenantResponseSchema, userResponseSchema } from "./schemas.js";
import { authenticateAppRequest } from "./security.js";

type Variables = { requestId: string; rawBody: string; appId: string };

export function createApp(prisma: PrismaClient, config: CoreConfig) {
  const app = new OpenAPIHono<{ Variables: Variables }>({
    defaultHook: (result) => { if (!result.success) throw new CoreError("VALIDATION_ERROR", "Request validation failed", 400, result.error.flatten()); },
  });
  const core = new CoreService(prisma);

  app.use("*", async (context, next) => {
    context.set("requestId", context.req.header("x-request-id")?.slice(0, 128) || randomUUID());
    context.set("rawBody", ["GET", "HEAD"].includes(context.req.method) ? "" : await context.req.raw.clone().text());
    await next();
    context.header("x-request-id", context.get("requestId"));
  });
  app.use("/v1/*", async (context, next) => {
    context.set("appId", authenticateAppRequest(context, config, context.get("rawBody")).id);
    await next();
  });
  app.onError((error, context) => {
    if (!(error instanceof CoreError) || error.status >= 500) console.error(JSON.stringify({ message: "core request failed", requestId: context.get("requestId"), error: error instanceof Error ? error.message : String(error) }));
    return errorResponse(context, error);
  });

  app.openapi(healthRoute, async (context) => {
    try { await prisma.user.findFirst({ select: { id: true } }); return context.json({ status: "ok" as const, service: "phumi-core" as const }, 200); }
    catch { throw new CoreError("SERVICE_UNAVAILABLE", "Database is unavailable or core migrations are missing", 503); }
  });
  app.openapi(upsertUserRoute, async (context) => context.json(userResponseSchema.parse({ user: serializeUser(await core.upsertUser(context.get("appId"), context.req.valid("json"))) }), 200));
  app.openapi(resolveUserRoute, async (context) => context.json(userResponseSchema.parse({ user: serializeUser(await core.resolveUser(context.get("appId"), context.req.valid("query").externalId)) }), 200));
  app.openapi(getUserRoute, async (context) => context.json(userResponseSchema.parse({ user: serializeUser(await core.findUserForApp(context.get("appId"), context.req.valid("param").userId)) }), 200));
  app.openapi(createTenantRoute, async (context) => {
    const result = await core.createTenant(context.get("appId"), context.req.valid("json"));
    const body = tenantResponseSchema.parse({ tenant: serializeTenant(result.tenant) });
    return result.created ? context.json(body, 201) : context.json(body, 200);
  });
  app.openapi(resolveTenantRoute, async (context) => context.json(tenantResponseSchema.parse({ tenant: serializeTenant(await core.resolveTenant(context.get("appId"), context.req.valid("query").externalId)) }), 200));
  app.openapi(getTenantRoute, async (context) => context.json(tenantResponseSchema.parse({ tenant: serializeTenant(await core.findTenant(context.get("appId"), context.req.valid("param").tenantId)) }), 200));
  app.openapi(upsertMembershipRoute, async (context) => { const params = context.req.valid("param"); return context.json(membershipResponseSchema.parse({ membership: serializeMembership(await core.upsertMembership(context.get("appId"), params.tenantId, params.userId, context.req.valid("json"))) }), 200); });
  app.openapi(updateSubscriptionRoute, async (context) => context.json(subscriptionResponseSchema.parse({ subscription: serializeSubscription(await core.updateSubscription(context.get("appId"), context.req.valid("param").tenantId, context.req.valid("json"))) }), 200));

  app.doc("/openapi.json", { openapi: "3.0.0", info: { title: "Phumi Core API", version: "0.1.0", description: "Shared identity, tenant, membership, and subscription-state API for Phumi products. All /v1 requests use HMAC-SHA256 application authentication." }, servers: [{ url: config.publicBaseUrl }] });
  app.get("/docs", swaggerUI({ url: "/openapi.json" }));
  app.get("/", (context) => context.redirect("/docs"));
  return app;
}
