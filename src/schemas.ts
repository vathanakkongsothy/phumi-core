import { z } from "@hono/zod-openapi";

const metadataSchema = z.record(z.string(), z.unknown());
const idSchema = z.string().trim().min(1).max(128);

export const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().nullable() }) }).openapi("Error");
export const signedHeadersSchema = z.object({
  "x-app-id": z.string().openapi({ param: { name: "x-app-id", in: "header" }, example: "garage" }),
  "x-timestamp": z.string().regex(/^\d{10}$/).openapi({ param: { name: "x-timestamp", in: "header" }, example: "1786600000" }),
  "x-signature": z.string().regex(/^[a-f0-9]{64}$/).openapi({ param: { name: "x-signature", in: "header" } }),
});

export const userSchema = z.object({
  id: z.string().startsWith("usr_"), displayName: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), locale: z.string(),
  status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]), metadata: metadataSchema.nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).openapi("User");
export const upsertUserSchema = z.object({
  externalId: idSchema.openapi({ example: "garage-user-123" }), displayName: z.string().trim().min(1).max(120).optional(), email: z.string().email().max(254).optional(),
  phone: z.string().trim().min(5).max(30).optional(), locale: z.string().trim().min(2).max(12).default("km"), metadata: metadataSchema.optional(),
}).strict().openapi("UpsertUser");
export const resolveUserSchema = z.object({ externalId: idSchema });
export const resolveTenantSchema = z.object({ externalId: idSchema });
export const userResponseSchema = z.object({ user: userSchema });
export const userIdParamSchema = z.object({ userId: z.string().startsWith("usr_").openapi({ param: { name: "userId", in: "path" } }) });

export const membershipSchema = z.object({
  id: z.string().startsWith("mem_"), userId: z.string().startsWith("usr_"), role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
  status: z.enum(["ACTIVE", "INVITED", "SUSPENDED"]), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).openapi("Membership");
export const subscriptionSchema = z.object({
  id: z.string().startsWith("sub_"), planKey: z.string(), status: z.enum(["NONE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"]),
  currentPeriodStart: z.string().datetime().nullable(), currentPeriodEnd: z.string().datetime().nullable(), gatewayPaymentId: z.string().nullable(),
  gatewayReferenceId: z.string().nullable(), cancelAtPeriodEnd: z.boolean(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).openapi("TenantSubscription");
export const tenantSchema = z.object({
  id: z.string().startsWith("ten_"), appId: z.string(), externalId: z.string(), slug: z.string(), name: z.string(), status: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED"]),
  metadata: metadataSchema.nullable(), memberships: z.array(membershipSchema), subscription: subscriptionSchema.nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).openapi("Tenant");
export const createTenantSchema = z.object({
  externalId: idSchema.openapi({ example: "garage-shop-123" }), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(63),
  name: z.string().trim().min(1).max(120), ownerUserId: z.string().startsWith("usr_"), metadata: metadataSchema.optional(),
}).strict().openapi("CreateTenant");
export const tenantResponseSchema = z.object({ tenant: tenantSchema });
export const tenantIdParamSchema = z.object({ tenantId: z.string().startsWith("ten_").openapi({ param: { name: "tenantId", in: "path" } }) });
export const tenantUserParamsSchema = tenantIdParamSchema.extend({ userId: z.string().startsWith("usr_").openapi({ param: { name: "userId", in: "path" } }) });
export const upsertMembershipSchema = z.object({ role: z.enum(["OWNER", "ADMIN", "MEMBER"]), status: z.enum(["ACTIVE", "INVITED", "SUSPENDED"]).default("ACTIVE") }).strict().openapi("UpsertMembership");
export const membershipResponseSchema = z.object({ membership: membershipSchema });
export const updateSubscriptionSchema = z.object({
  planKey: z.string().trim().min(1).max(64), status: z.enum(["NONE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"]),
  currentPeriodStart: z.string().datetime().nullable().optional(), currentPeriodEnd: z.string().datetime().nullable().optional(),
  gatewayPaymentId: z.string().trim().max(128).nullable().optional(), gatewayReferenceId: z.string().trim().max(128).nullable().optional(), cancelAtPeriodEnd: z.boolean().default(false),
}).strict().openapi("UpdateSubscription");
export const subscriptionResponseSchema = z.object({ subscription: subscriptionSchema });
export const healthSchema = z.object({ status: z.literal("ok"), service: z.literal("phumi-core") }).openapi("Health");

export type UpsertUserInput = z.infer<typeof upsertUserSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpsertMembershipInput = z.infer<typeof upsertMembershipSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
