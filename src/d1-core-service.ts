import { randomUUID } from "node:crypto";
import type { CoreService } from "./core-service.js";
import { CoreError } from "./errors.js";
import type { CreateTenantInput, UpdateSubscriptionInput, UpsertMembershipInput, UpsertUserInput } from "./schemas.js";

type Result<K extends keyof CoreService> = CoreService[K] extends (...args: never[]) => infer R ? Awaited<R> : never;
type Row = Record<string, unknown>;
const id = (prefix: string) => prefix + "_" + randomUUID().replaceAll("-", "");
const timestamp = () => new Date().toISOString().replace("Z", "+00:00");
function decode<T>(row: Row): T {
  const value = { ...row };
  for (const key of ["createdAt", "updatedAt", "currentPeriodStart", "currentPeriodEnd"])
    if (value[key] != null) value[key] = new Date(String(value[key]));
  if (typeof value.metadata === "string") value.metadata = JSON.parse(value.metadata);
  if ("cancelAtPeriodEnd" in value) value.cancelAtPeriodEnd = Boolean(value.cancelAtPeriodEnd);
  return value as T;
}
const tenantQuery = 'SELECT * FROM "Tenant" WHERE "appId" = ? AND "id" = ?';
const identityQuery = 'SELECT u.* FROM "User" u JOIN "ExternalIdentity" i ON i."userId" = u.id WHERE i."appId" = ? AND i."externalId" = ?';

/** Every dependent mutation runs inside one D1 batch. Guards execute in SQL,
 * in the same transaction as the write, so concurrent requests cannot invalidate them. */
export class D1CoreService {
  constructor(private readonly db: D1Database) {}
  private statement(sql: string, ...values: unknown[]) { return this.db.prepare(sql).bind(...values); }
  async health() { await this.statement('SELECT id FROM "User" LIMIT 1').all(); }

  async upsertUser(appId: string, input: UpsertUserInput): Promise<Result<"upsertUser">> {
    const userId = id("usr"), now = timestamp();
    const fields: Record<string, unknown> = { locale: input.locale, updatedAt: now };
    if (input.displayName !== undefined) fields.displayName = input.displayName;
    if (input.email !== undefined) fields.email = input.email.toLowerCase();
    if (input.phone !== undefined) fields.phone = input.phone;
    if (input.metadata !== undefined) fields.metadata = JSON.stringify(input.metadata);
    const keys = Object.keys(fields);
    const results = await this.db.batch<Row>([
      this.statement('INSERT INTO "User" (id, locale, "createdAt", "updatedAt") SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM "ExternalIdentity" WHERE "appId" = ? AND "externalId" = ?)', userId, input.locale, now, now, appId, input.externalId),
      this.statement('INSERT INTO "ExternalIdentity" (id, "appId", "externalId", "userId", "createdAt", "updatedAt") SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM "User" WHERE id = ?)', id("ide"), appId, input.externalId, userId, now, now, userId),
      this.statement('UPDATE "User" SET ' + keys.map(key => '"' + key + '" = ?').join(", ") + ' WHERE id = (SELECT "userId" FROM "ExternalIdentity" WHERE "appId" = ? AND "externalId" = ?)', ...Object.values(fields), appId, input.externalId),
      this.statement(identityQuery, appId, input.externalId),
    ]);
    const row = results[3]?.results[0];
    if (!row) throw new Error("User upsert did not return an identity");
    return decode(row);
  }

  async resolveUser(appId: string, externalId: string): Promise<Result<"resolveUser">> {
    const row = await this.statement(identityQuery, appId, externalId).first<Row>();
    if (!row) throw new CoreError("USER_NOT_FOUND", "User identity was not found", 404);
    return decode(row);
  }

  async findUserForApp(appId: string, userId: string): Promise<Result<"findUserForApp">> {
    const row = await this.statement('SELECT u.* FROM "User" u WHERE u.id = ? AND EXISTS (SELECT 1 FROM "ExternalIdentity" i WHERE i."userId" = u.id AND i."appId" = ?)', userId, appId).first<Row>();
    if (!row) throw new CoreError("USER_NOT_FOUND", "User was not found for this application", 404);
    return decode(row);
  }

  private async tenant(appId: string, tenantId: string): Promise<Result<"findTenant">> {
    const results = await this.db.batch<Row>([
      this.statement(tenantQuery, appId, tenantId),
      this.statement('SELECT m.* FROM "Membership" m JOIN "Tenant" t ON t.id = m."tenantId" WHERE t."appId" = ? AND t.id = ?', appId, tenantId),
      this.statement('SELECT s.* FROM "TenantSubscription" s JOIN "Tenant" t ON t.id = s."tenantId" WHERE t."appId" = ? AND t.id = ?', appId, tenantId),
    ]);
    const row = results[0]?.results[0];
    if (!row) throw new CoreError("TENANT_NOT_FOUND", "Tenant was not found for this application", 404);
    return { ...decode<Result<"findTenant">>(row), memberships: (results[1]?.results ?? []).map(row => decode<Result<"upsertMembership">>(row)), subscription: results[2]?.results[0] ? decode<Result<"updateSubscription">>(results[2].results[0]) : null };
  }

  async createTenant(appId: string, input: CreateTenantInput): Promise<Result<"createTenant">> {
    const tenantId = id("ten"), now = timestamp();
    try {
      const results = await this.db.batch<Row>([
        this.statement('INSERT INTO "Tenant" (id, "appId", "externalId", slug, name, metadata, "createdAt", "updatedAt") SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM "ExternalIdentity" WHERE "appId" = ? AND "userId" = ?) AND NOT EXISTS (SELECT 1 FROM "Tenant" WHERE "appId" = ? AND "externalId" = ?)', tenantId, appId, input.externalId, input.slug, input.name, input.metadata === undefined ? null : JSON.stringify(input.metadata), now, now, appId, input.ownerUserId, appId, input.externalId),
        this.statement('INSERT INTO "Membership" (id, "tenantId", "userId", role, status, "createdAt", "updatedAt") SELECT ?, ?, ?, \'OWNER\', \'ACTIVE\', ?, ? WHERE EXISTS (SELECT 1 FROM "Tenant" WHERE id = ?)', id("mem"), tenantId, input.ownerUserId, now, now, tenantId),
        this.statement('SELECT id FROM "Tenant" WHERE "appId" = ? AND "externalId" = ?', appId, input.externalId),
      ]);
      const actualId = results[2]?.results[0]?.id;
      if (!actualId) throw new CoreError("OWNER_NOT_FOUND", "Owner user was not found for this application", 404);
      return { tenant: await this.tenant(appId, String(actualId)), created: actualId === tenantId };
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message))
        throw new CoreError("RESOURCE_CONFLICT", "A resource with this identifier already exists", 409);
      throw error;
    }
  }

  async resolveTenant(appId: string, externalId: string): Promise<Result<"resolveTenant">> {
    const row = await this.statement('SELECT id FROM "Tenant" WHERE "appId" = ? AND "externalId" = ?', appId, externalId).first<{ id: string }>();
    if (!row) throw new CoreError("TENANT_NOT_FOUND", "Tenant was not found for this application", 404);
    return this.tenant(appId, row.id);
  }
  async findTenant(appId: string, tenantId: string) { return this.tenant(appId, tenantId); }

  async upsertMembership(appId: string, tenantId: string, userId: string, input: UpsertMembershipInput): Promise<Result<"upsertMembership">> {
    const now = timestamp();
    const results = await this.db.batch<Row>([
      this.statement(tenantQuery, appId, tenantId),
      this.statement('SELECT id FROM "ExternalIdentity" WHERE "appId" = ? AND "userId" = ?', appId, userId),
      this.statement('INSERT INTO "Membership" (id, "tenantId", "userId", role, status, "createdAt", "updatedAt") SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM "Tenant" WHERE id = ? AND "appId" = ?) AND EXISTS (SELECT 1 FROM "ExternalIdentity" WHERE "userId" = ? AND "appId" = ?) ON CONFLICT ("tenantId", "userId") DO UPDATE SET role = excluded.role, status = excluded.status, "updatedAt" = excluded."updatedAt" WHERE NOT ("Membership".role = \'OWNER\' AND "Membership".status = \'ACTIVE\' AND NOT (excluded.role = \'OWNER\' AND excluded.status = \'ACTIVE\') AND NOT EXISTS (SELECT 1 FROM "Membership" other WHERE other."tenantId" = excluded."tenantId" AND other."userId" <> excluded."userId" AND other.role = \'OWNER\' AND other.status = \'ACTIVE\')) RETURNING *', id("mem"), tenantId, userId, input.role, input.status, now, now, tenantId, appId, userId, appId),
    ]);
    if (!results[0]?.results.length) throw new CoreError("TENANT_NOT_FOUND", "Tenant was not found for this application", 404);
    if (!results[1]?.results.length) throw new CoreError("USER_NOT_FOUND", "User was not found for this application", 404);
    const row = results[2]?.results[0];
    if (!row) throw new CoreError("LAST_OWNER", "Tenant must keep at least one active owner", 409);
    return decode(row);
  }

  async updateSubscription(appId: string, tenantId: string, input: UpdateSubscriptionInput): Promise<Result<"updateSubscription">> {
    const now = timestamp();
    const fields: Record<string, unknown> = { planKey: input.planKey, status: input.status, cancelAtPeriodEnd: Number(input.cancelAtPeriodEnd), updatedAt: now };
    for (const key of ["currentPeriodStart", "currentPeriodEnd"] as const)
      if (input[key] !== undefined) fields[key] = input[key] ? new Date(input[key]).toISOString().replace("Z", "+00:00") : null;
    for (const key of ["gatewayPaymentId", "gatewayReferenceId"] as const)
      if (input[key] !== undefined) fields[key] = input[key];
    const keys = Object.keys(fields);
    const row = await this.statement('INSERT INTO "TenantSubscription" (id, "tenantId", "createdAt", ' + keys.map(key => '"' + key + '"').join(", ") + ') SELECT ?, ?, ?, ' + keys.map(() => "?").join(", ") + ' WHERE EXISTS (SELECT 1 FROM "Tenant" WHERE id = ? AND "appId" = ?) ON CONFLICT ("tenantId") DO UPDATE SET ' + keys.map(key => '"' + key + '" = excluded."' + key + '"').join(", ") + ' RETURNING *', id("sub"), tenantId, now, ...Object.values(fields), tenantId, appId).first<Row>();
    if (!row) throw new CoreError("TENANT_NOT_FOUND", "Tenant was not found for this application", 404);
    return decode(row);
  }
}
