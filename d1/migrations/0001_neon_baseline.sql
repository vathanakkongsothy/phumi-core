PRAGMA defer_foreign_keys=ON;

CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("id"),
  CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  CHECK ("metadata" IS NULL OR json_valid("metadata"))
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "displayName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'km',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("id"),
  CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  CHECK ("metadata" IS NULL OR json_valid("metadata"))
);

CREATE TABLE "ExternalIdentity" (
  "id" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE "Membership" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CHECK ("role" IN ('OWNER', 'ADMIN', 'MEMBER')),
  CHECK ("status" IN ('ACTIVE', 'INVITED', 'SUSPENDED'))
);

CREATE TABLE "TenantSubscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NONE',
  "currentPeriodStart" DATETIME,
  "currentPeriodEnd" DATETIME,
  "gatewayPaymentId" TEXT,
  "gatewayReferenceId" TEXT,
  "cancelAtPeriodEnd" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')),
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CHECK ("status" IN ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'))
);

CREATE UNIQUE INDEX "ExternalIdentity_appId_externalId_key" ON "ExternalIdentity" ("appId", "externalId");

CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity" ("userId");

CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership" ("tenantId", "userId");

CREATE INDEX "Membership_userId_status_idx" ON "Membership" ("userId", "status");

CREATE INDEX "TenantSubscription_status_currentPeriodEnd_idx" ON "TenantSubscription" ("status", "currentPeriodEnd");

CREATE UNIQUE INDEX "TenantSubscription_tenantId_key" ON "TenantSubscription" ("tenantId");

CREATE UNIQUE INDEX "Tenant_appId_externalId_key" ON "Tenant" ("appId", "externalId");

CREATE INDEX "Tenant_appId_status_idx" ON "Tenant" ("appId", "status");

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant" ("slug");

CREATE INDEX "User_email_idx" ON "User" ("email");

CREATE INDEX "User_phone_idx" ON "User" ("phone");
