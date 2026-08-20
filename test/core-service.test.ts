import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { CoreService } from "../src/core-service.js";
import { CoreError } from "../src/errors.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const tenant = {
  id: "ten_1",
  appId: "garage",
  externalId: "shop-1",
  slug: "shop-one",
  name: "Shop",
  status: "ACTIVE" as const,
  metadata: null,
  memberships: [],
  subscription: null,
  createdAt: now,
  updatedAt: now,
};
const createInput = { externalId: "shop-1", slug: "shop-one", name: "Shop", ownerUserId: "usr_owner" };

function service(db: object) {
  return new CoreService(db as PrismaClient);
}

describe("createTenant", () => {
  it("returns the existing tenant for the same app external id", async () => {
    const create = vi.fn();
    const core = service({
      $transaction: async (callback: (tx: unknown) => unknown) => callback({
        tenant: { findUnique: async () => tenant, create },
        user: { findFirst: vi.fn() },
      }),
    });
    await expect(core.createTenant("garage", createInput)).resolves.toEqual({ tenant, created: false });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a tenant when the external id is new", async () => {
    const created = { ...tenant, id: "ten_new" };
    const core = service({
      $transaction: async (callback: (tx: unknown) => unknown) => callback({
        tenant: { findUnique: async () => null, create: async () => created },
        user: { findFirst: async () => ({ id: "usr_owner" }) },
      }),
    });
    await expect(core.createTenant("garage", createInput)).resolves.toEqual({ tenant: created, created: true });
  });

  it("recovers a raced create for the same external id", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
    const core = service({
      $transaction: async (callback: (tx: unknown) => unknown) => callback({
        tenant: {
          findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(tenant),
          create: async () => { throw conflict; },
        },
        user: { findFirst: async () => ({ id: "usr_owner" }) },
      }),
    });
    await expect(core.createTenant("garage", createInput)).resolves.toEqual({ tenant, created: false });
  });

  it("rejects a slug conflict for a different external id", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
    const core = service({
      $transaction: async (callback: (tx: unknown) => unknown) => callback({
        tenant: { findUnique: async () => null, create: async () => { throw conflict; } },
        user: { findFirst: async () => ({ id: "usr_owner" }) },
      }),
    });
    await expect(core.createTenant("garage", createInput)).rejects.toMatchObject({ code: "RESOURCE_CONFLICT", status: 409 });
  });
});

describe("resolveTenant", () => {
  it("returns the tenant for the calling app", async () => {
    const core = service({ tenant: { findUnique: async () => tenant } });
    await expect(core.resolveTenant("garage", "shop-1")).resolves.toEqual(tenant);
  });

  it("throws when the tenant does not exist", async () => {
    const core = service({ tenant: { findUnique: async () => null } });
    await expect(core.resolveTenant("garage", "missing")).rejects.toBeInstanceOf(CoreError);
  });
});

describe("upsertMembership", () => {
  const owner = { id: "mem_1", tenantId: "ten_1", userId: "usr_owner", role: "OWNER" as const, status: "ACTIVE" as const };

  function membershipDb(input: {
    existing?: typeof owner | null;
    owners?: number;
    upsert?: (args: unknown) => unknown;
  }) {
    return {
      $transaction: async (callback: (tx: unknown) => unknown) => callback({
        tenant: { findFirst: async () => ({ id: "ten_1" }) },
        user: { findFirst: async () => ({ id: input.existing?.userId ?? "usr_owner" }) },
        membership: {
          findUnique: async () => input.existing ?? null,
          count: async () => input.owners ?? 1,
          upsert: input.upsert ?? (async (args: unknown) => args),
        },
      }),
    };
  }

  it("rejects demoting the last active owner", async () => {
    const core = service(membershipDb({ existing: owner, owners: 1 }));
    await expect(core.upsertMembership("garage", "ten_1", "usr_owner", { role: "ADMIN", status: "ACTIVE" }))
      .rejects.toMatchObject({ code: "LAST_OWNER", status: 409 });
  });

  it("rejects suspending the last active owner", async () => {
    const core = service(membershipDb({ existing: owner, owners: 1 }));
    await expect(core.upsertMembership("garage", "ten_1", "usr_owner", { role: "OWNER", status: "SUSPENDED" }))
      .rejects.toMatchObject({ code: "LAST_OWNER", status: 409 });
  });

  it("allows demoting an owner when another active owner remains", async () => {
    const upsert = vi.fn(async () => ({ ...owner, role: "ADMIN" }));
    const core = service(membershipDb({ existing: owner, owners: 2, upsert }));
    await expect(core.upsertMembership("garage", "ten_1", "usr_owner", { role: "ADMIN", status: "ACTIVE" }))
      .resolves.toMatchObject({ role: "ADMIN" });
    expect(upsert).toHaveBeenCalled();
  });

  it("allows leaving the last owner as an active owner", async () => {
    const upsert = vi.fn(async () => owner);
    const core = service(membershipDb({ existing: owner, owners: 1, upsert }));
    await expect(core.upsertMembership("garage", "ten_1", "usr_owner", { role: "OWNER", status: "ACTIVE" })).resolves.toEqual(owner);
  });
});
