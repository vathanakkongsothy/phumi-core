import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { D1CoreService } from "../src/d1-core-service.js";

class LocalStatement {
  constructor(readonly database: DatabaseSync, readonly sql: string, readonly values: Array<string | number | null> = []) {}
  bind(...values: Array<string | number | null>) { return new LocalStatement(this.database, this.sql, values); }
  execute() { return { success: true, results: this.database.prepare(this.sql).all(...this.values), meta: {} }; }
  async all() { return this.execute(); }
  async first() { return this.execute().results[0] ?? null; }
}
describe("D1 Core atomic operations", () => {
  let database: DatabaseSync;
  let core: D1CoreService;
  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    database.exec('PRAGMA foreign_keys = ON;');
    database.exec(readFileSync("d1/migrations/0001_neon_baseline.sql", "utf8"));
    const binding = {
      prepare: (sql: string) => new LocalStatement(database, sql),
      async batch(statements: LocalStatement[]) {
        database.exec("BEGIN");
        try { const results = statements.map(statement => statement.execute()); database.exec("COMMIT"); return results; }
        catch (error) { database.exec("ROLLBACK"); throw error; }
      },
    };
    core = new D1CoreService(binding as unknown as D1Database);
  });
  afterEach(() => database.close());
  const user = (externalId: string, appId = "garage") => core.upsertUser(appId, { externalId, locale: "km" });
  async function fixture() {
    const owner = await user("owner");
    const result = await core.createTenant("garage", { externalId: "shop", slug: "shop", name: "Shop", ownerUserId: owner.id });
    return { owner, tenant: result.tenant };
  }

  it("replays concurrent identity upserts without orphan users and preserves omitted fields", async () => {
    const results = await Promise.all([user("same"), user("same")]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(database.prepare('SELECT COUNT(*) n FROM "User"').get()!.n).toBe(1);
    const updated = await core.upsertUser("garage", { externalId: "same", locale: "en", email: "USER@EXAMPLE.COM", metadata: { source: "test" } });
    expect(updated.email).toBe("user@example.com");
    expect(updated.metadata).toEqual({ source: "test" });
    expect((await user("same")).email).toBe("user@example.com");
    await expect(core.findUserForApp("earn", updated.id)).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
  });

  it("rolls back the user insert if identity creation fails", async () => {
    database.exec('CREATE TRIGGER reject_identity BEFORE INSERT ON "ExternalIdentity" BEGIN SELECT RAISE(ABORT, \'injected identity failure\'); END');
    await expect(user("fail")).rejects.toThrow("injected identity failure");
    expect(database.prepare('SELECT COUNT(*) n FROM "User"').get()!.n).toBe(0);
  });

  it("creates a tenant with its owner atomically and returns the same tenant on replay", async () => {
    const { owner, tenant } = await fixture();
    const replay = await core.createTenant("garage", { externalId: "shop", slug: "different", name: "Ignored", ownerUserId: owner.id });
    expect(replay.created).toBe(false);
    expect(replay.tenant.id).toBe(tenant.id);
    expect(tenant.memberships).toHaveLength(1);
    expect(tenant.memberships[0]!.role).toBe("OWNER");
    await expect(core.createTenant("earn", { externalId: "other", slug: "other", name: "Other", ownerUserId: owner.id })).rejects.toMatchObject({ code: "OWNER_NOT_FOUND" });
    expect(database.prepare('SELECT COUNT(*) n FROM "Tenant"').get()!.n).toBe(1);
  });

  it("rolls back tenant creation if its owner membership fails", async () => {
    const owner = await user("owner");
    database.exec('CREATE TRIGGER reject_membership BEFORE INSERT ON "Membership" BEGIN SELECT RAISE(ABORT, \'injected membership failure\'); END');
    await expect(core.createTenant("garage", { externalId: "shop", slug: "shop", name: "Shop", ownerUserId: owner.id })).rejects.toThrow("injected membership failure");
    expect(database.prepare('SELECT COUNT(*) n FROM "Tenant"').get()!.n).toBe(0);
  });

  it("keeps one active owner when two concurrent requests demote the last two owners", async () => {
    const { owner, tenant } = await fixture();
    const second = await user("second");
    await core.upsertMembership("garage", tenant.id, second.id, { role: "OWNER", status: "ACTIVE" });
    const results = await Promise.allSettled([
      core.upsertMembership("garage", tenant.id, owner.id, { role: "MEMBER", status: "ACTIVE" }),
      core.upsertMembership("garage", tenant.id, second.id, { role: "MEMBER", status: "ACTIVE" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    const persisted = await core.findTenant("garage", tenant.id);
    expect(persisted.memberships.filter(member => member.role === "OWNER" && member.status === "ACTIVE")).toHaveLength(1);
  });

  it("enforces tenant and user app scope inside membership writes", async () => {
    const { tenant } = await fixture();
    const outsider = await user("outsider", "earn");
    await expect(core.upsertMembership("garage", tenant.id, outsider.id, { role: "OWNER", status: "ACTIVE" })).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
    await expect(core.findTenant("earn", tenant.id)).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
    expect((await core.findTenant("garage", tenant.id)).memberships).toHaveLength(1);
  });

  it("updates subscriptions within tenant scope and round-trips UTC dates and booleans", async () => {
    const { tenant } = await fixture();
    const input = { planKey: "pro", status: "ACTIVE" as const, cancelAtPeriodEnd: true, currentPeriodStart: "2026-09-06T00:00:00Z" };
    const subscription = await core.updateSubscription("garage", tenant.id, input);
    expect(subscription.cancelAtPeriodEnd).toBe(true);
    expect(subscription.currentPeriodStart!.toISOString()).toBe("2026-09-06T00:00:00.000Z");
    await expect(core.updateSubscription("earn", tenant.id, { ...input, planKey: "bad" })).rejects.toMatchObject({ code: "TENANT_NOT_FOUND" });
    const updated = await core.updateSubscription("garage", tenant.id, { planKey: "pro", status: "ACTIVE", cancelAtPeriodEnd: false });
    expect(updated.currentPeriodStart!.toISOString()).toBe("2026-09-06T00:00:00.000Z");
    expect((await core.findTenant("garage", tenant.id)).subscription!.cancelAtPeriodEnd).toBe(false);
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
