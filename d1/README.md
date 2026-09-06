# Phumi Core D1 runtime

The Worker supports the complete Core API on native D1 prepared statements. Set DATABASE_BACKEND=d1 and bind the verified cutover database as DB to select it. With no setting, the existing Neon backend remains active. The Node entry point remains a Neon rollback/development option.

Identity creation, tenant plus owner creation, and membership updates use atomic D1 batches. Tenant/user scope and the last-active-owner rule are checked in SQL inside the write transaction. Subscription upserts are a single guarded statement. Rows preserve JSON values, UTC timestamps, booleans, and the existing HTTP schema.

Run npm run validate for typechecks, regression tests and builds. npm run db:d1:runtime:smoke starts the real application Worker locally and exercises signed identity, tenant, membership and subscription routes against D1. d1/runtime.wrangler.jsonc is a local test configuration with public test-only credentials and no public routes. The original preflight Worker remains available as a schema diagnostic; its applicationReady field describes only that preflight, not the application runtime.

## Cutover

The copied D1 target is a static snapshot without Wrangler migration history. Never apply the baseline to that populated copy. Create a fresh database, apply the schema migrations, pause source writes and import a fresh transformed data-only snapshot. Verify exact rows, foreign keys and application workflows, then bind that database to the production Worker and set DATABASE_BACKEND=d1. Keep the existing application request secrets unchanged.

Production configuration and live bindings are intentionally unchanged by this PR. Switching after D1 accepts new writes requires reconciling data before reverting to Neon. No remote migration, deployment, or source deletion is performed by CI.
