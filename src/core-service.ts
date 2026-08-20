import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { CoreError } from "./errors.js";
import type { CreateTenantInput, UpdateSubscriptionInput, UpsertMembershipInput, UpsertUserInput } from "./schemas.js";

const tenantInclude = { memberships: true, subscription: true } satisfies Prisma.TenantInclude;
type TenantWithRelations = Prisma.TenantGetPayload<{ include: { memberships: true; subscription: true } }>;
const prefixedId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;

export function serializeUser(user: { createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return { ...user, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() };
}

export function serializeMembership(membership: { createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return { ...membership, createdAt: membership.createdAt.toISOString(), updatedAt: membership.updatedAt.toISOString() };
}

export function serializeSubscription(subscription: { currentPeriodStart: Date | null; currentPeriodEnd: Date | null; createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return {
    ...subscription,
    currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
  };
}

export function serializeTenant(tenant: { memberships: Array<Parameters<typeof serializeMembership>[0]>; subscription: Parameters<typeof serializeSubscription>[0] | null; createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return {
    ...tenant,
    memberships: tenant.memberships.map(serializeMembership),
    subscription: tenant.subscription ? serializeSubscription(tenant.subscription) : null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

export class CoreService {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertUser(appId: string, input: UpsertUserInput) {
    return this.prisma.$transaction(async (transaction) => {
      const identity = await transaction.externalIdentity.findUnique({ where: { appId_externalId: { appId, externalId: input.externalId } }, include: { user: true } });
      const data = {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.email !== undefined ? { email: input.email.toLowerCase() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        locale: input.locale,
        ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      };
      if (identity) return transaction.user.update({ where: { id: identity.userId }, data });
      return transaction.user.create({
        data: {
          id: prefixedId("usr"), ...data,
          identities: { create: { id: prefixedId("ide"), appId, externalId: input.externalId } },
        },
      });
    });
  }

  async resolveUser(appId: string, externalId: string) {
    const identity = await this.prisma.externalIdentity.findUnique({ where: { appId_externalId: { appId, externalId } }, include: { user: true } });
    if (!identity) throw new CoreError("USER_NOT_FOUND", "User identity was not found", 404);
    return identity.user;
  }

  async findUserForApp(appId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, identities: { some: { appId } } } });
    if (!user) throw new CoreError("USER_NOT_FOUND", "User was not found for this application", 404);
    return user;
  }

  async createTenant(appId: string, input: CreateTenantInput): Promise<{ tenant: TenantWithRelations; created: boolean }> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.tenant.findUnique({ where: { appId_externalId: { appId, externalId: input.externalId } }, include: tenantInclude });
      if (existing) return { tenant: existing, created: false };
      const owner = await transaction.user.findFirst({ where: { id: input.ownerUserId, identities: { some: { appId } } }, select: { id: true } });
      if (!owner) throw new CoreError("OWNER_NOT_FOUND", "Owner user was not found for this application", 404);
      try {
        const tenant = await transaction.tenant.create({
          data: {
            id: prefixedId("ten"), appId, externalId: input.externalId, slug: input.slug, name: input.name,
            ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
            memberships: { create: { id: prefixedId("mem"), userId: input.ownerUserId, role: "OWNER", status: "ACTIVE" } },
          },
          include: tenantInclude,
        });
        return { tenant, created: true };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const raced = await transaction.tenant.findUnique({ where: { appId_externalId: { appId, externalId: input.externalId } }, include: tenantInclude });
        if (raced) return { tenant: raced, created: false };
        throw new CoreError("RESOURCE_CONFLICT", "A resource with this identifier already exists", 409);
      }
    });
  }

  async resolveTenant(appId: string, externalId: string): Promise<TenantWithRelations> {
    const tenant = await this.prisma.tenant.findUnique({ where: { appId_externalId: { appId, externalId } }, include: tenantInclude });
    if (!tenant) throw new CoreError("TENANT_NOT_FOUND", "Tenant was not found for this application", 404);
    return tenant;
  }

  async findTenant(appId: string, tenantId: string): Promise<TenantWithRelations> {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, appId }, include: tenantInclude });
    if (!tenant) throw new CoreError("TENANT_NOT_FOUND", "Tenant was not found for this application", 404);
    return tenant;
  }

  async upsertMembership(appId: string, tenantId: string, userId: string, input: UpsertMembershipInput) {
    return this.prisma.$transaction(async (transaction) => {
      const [tenant, user] = await Promise.all([
        transaction.tenant.findFirst({ where: { id: tenantId, appId }, select: { id: true } }),
        transaction.user.findFirst({ where: { id: userId, identities: { some: { appId } } }, select: { id: true } }),
      ]);
      if (!tenant) throw new CoreError("TENANT_NOT_FOUND", "Tenant was not found for this application", 404);
      if (!user) throw new CoreError("USER_NOT_FOUND", "User was not found for this application", 404);
      const existing = await transaction.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } } });
      const remainsActiveOwner = input.role === "OWNER" && input.status === "ACTIVE";
      if (existing?.role === "OWNER" && existing.status === "ACTIVE" && !remainsActiveOwner) {
        const owners = await transaction.membership.count({ where: { tenantId, role: "OWNER", status: "ACTIVE" } });
        if (owners <= 1) throw new CoreError("LAST_OWNER", "Tenant must keep at least one active owner", 409);
      }
      return transaction.membership.upsert({
        where: { tenantId_userId: { tenantId, userId } },
        create: { id: prefixedId("mem"), tenantId, userId, role: input.role, status: input.status },
        update: { role: input.role, status: input.status },
      });
    });
  }

  async updateSubscription(appId: string, tenantId: string, input: UpdateSubscriptionInput) {
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, appId }, select: { id: true } });
    if (!tenant) throw new CoreError("TENANT_NOT_FOUND", "Tenant was not found for this application", 404);
    const data = {
      planKey: input.planKey, status: input.status, cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      ...(input.currentPeriodStart !== undefined ? { currentPeriodStart: input.currentPeriodStart ? new Date(input.currentPeriodStart) : null } : {}),
      ...(input.currentPeriodEnd !== undefined ? { currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null } : {}),
      ...(input.gatewayPaymentId !== undefined ? { gatewayPaymentId: input.gatewayPaymentId } : {}),
      ...(input.gatewayReferenceId !== undefined ? { gatewayReferenceId: input.gatewayReferenceId } : {}),
    };
    return this.prisma.tenantSubscription.upsert({
      where: { tenantId },
      create: { id: prefixedId("sub"), tenantId, ...data },
      update: data,
    });
  }
}
