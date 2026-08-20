import { createRoute } from "@hono/zod-openapi";
import {
  createTenantSchema, errorSchema, healthSchema, membershipResponseSchema, resolveTenantSchema, resolveUserSchema, signedHeadersSchema,
  subscriptionResponseSchema, tenantIdParamSchema, tenantResponseSchema, tenantUserParamsSchema, updateSubscriptionSchema,
  upsertMembershipSchema, upsertUserSchema, userIdParamSchema, userResponseSchema,
} from "./schemas.js";

const errors = {
  400: { content: { "application/json": { schema: errorSchema } }, description: "Invalid request" },
  401: { content: { "application/json": { schema: errorSchema } }, description: "Authentication failed" },
  404: { content: { "application/json": { schema: errorSchema } }, description: "Resource not found" },
  409: { content: { "application/json": { schema: errorSchema } }, description: "Resource conflict" },
  500: { content: { "application/json": { schema: errorSchema } }, description: "Unexpected server error" },
} as const;

export const healthRoute = createRoute({ method: "get", path: "/health", tags: ["Operations"], summary: "Check API and database health", responses: {
  200: { content: { "application/json": { schema: healthSchema } }, description: "Core is healthy" },
  503: { content: { "application/json": { schema: errorSchema } }, description: "Database unavailable" },
} });
export const upsertUserRoute = createRoute({ method: "put", path: "/v1/users", tags: ["Users"], summary: "Create or update an app user identity", request: { headers: signedHeadersSchema, body: { required: true, content: { "application/json": { schema: upsertUserSchema } } } }, responses: { 200: { content: { "application/json": { schema: userResponseSchema } }, description: "User resolved" }, ...errors } });
export const resolveUserRoute = createRoute({ method: "get", path: "/v1/users/resolve", tags: ["Users"], summary: "Resolve a user by the calling app's external id", request: { headers: signedHeadersSchema, query: resolveUserSchema }, responses: { 200: { content: { "application/json": { schema: userResponseSchema } }, description: "User resolved" }, 401: errors[401], 404: errors[404], 500: errors[500] } });
export const getUserRoute = createRoute({ method: "get", path: "/v1/users/{userId}", tags: ["Users"], summary: "Get a user visible to the calling app", request: { headers: signedHeadersSchema, params: userIdParamSchema }, responses: { 200: { content: { "application/json": { schema: userResponseSchema } }, description: "User returned" }, 401: errors[401], 404: errors[404], 500: errors[500] } });
export const createTenantRoute = createRoute({ method: "post", path: "/v1/tenants", tags: ["Tenants"], summary: "Create an app-scoped tenant and owner membership, or return the existing tenant for the same external id", request: { headers: signedHeadersSchema, body: { required: true, content: { "application/json": { schema: createTenantSchema } } } }, responses: { 200: { content: { "application/json": { schema: tenantResponseSchema } }, description: "Existing tenant returned" }, 201: { content: { "application/json": { schema: tenantResponseSchema } }, description: "Tenant created" }, ...errors } });
export const resolveTenantRoute = createRoute({ method: "get", path: "/v1/tenants/resolve", tags: ["Tenants"], summary: "Resolve a tenant by the calling app's external id", request: { headers: signedHeadersSchema, query: resolveTenantSchema }, responses: { 200: { content: { "application/json": { schema: tenantResponseSchema } }, description: "Tenant resolved" }, 401: errors[401], 404: errors[404], 500: errors[500] } });
export const getTenantRoute = createRoute({ method: "get", path: "/v1/tenants/{tenantId}", tags: ["Tenants"], summary: "Get tenant, memberships, and subscription", request: { headers: signedHeadersSchema, params: tenantIdParamSchema }, responses: { 200: { content: { "application/json": { schema: tenantResponseSchema } }, description: "Tenant returned" }, 401: errors[401], 404: errors[404], 500: errors[500] } });
export const upsertMembershipRoute = createRoute({ method: "put", path: "/v1/tenants/{tenantId}/members/{userId}", tags: ["Memberships"], summary: "Add or update a tenant membership", request: { headers: signedHeadersSchema, params: tenantUserParamsSchema, body: { required: true, content: { "application/json": { schema: upsertMembershipSchema } } } }, responses: { 200: { content: { "application/json": { schema: membershipResponseSchema } }, description: "Membership saved" }, ...errors } });
export const updateSubscriptionRoute = createRoute({ method: "put", path: "/v1/tenants/{tenantId}/subscription", tags: ["Subscriptions"], summary: "Set product-owned subscription state after gateway reconciliation", request: { headers: signedHeadersSchema, params: tenantIdParamSchema, body: { required: true, content: { "application/json": { schema: updateSubscriptionSchema } } } }, responses: { 200: { content: { "application/json": { schema: subscriptionResponseSchema } }, description: "Subscription saved" }, ...errors } });
