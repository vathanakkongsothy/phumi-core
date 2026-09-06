# phumi-core: Neon to D1 migration

Status: **draft migration preparation; the live application still uses PostgreSQL.**

This adds a separate D1 schema and database tooling. It does not change the live Worker configuration, PostgreSQL client, or production deployment command. The preflight Worker only checks schema access; it does not serve the application.

## Included

- A schema-only baseline from the verified Neon snapshot, preserving foreign keys, unique indexes, enum checks, and translated business constraints. No source rows, credentials, or snapshots are committed.
- A generated SQLite Prisma schema in `d1/schema.prisma`, separate from the current application schema. Additional SQL migrations reconcile new application tables/columns when needed.
- Exact decimal/quantity conversion, JSON array validation, local migration checks, and an isolated read-only preflight Worker.
- Explicit D1 target `phumi-core-d1` in `d1/wrangler.jsonc`. Existing production bindings remain unchanged.

## Local validation (Node 22.13+)

Run from the repository root:

```sh
npm run db:d1:sync-schema
npm run db:d1:generate
npm run db:d1:validate
npm run db:d1:migrate:local
npm run db:d1:build
npm run db:d1:typecheck
npm run db:d1:smoke
npm run db:d1:preview
```

Use the repository's package manager to install dependencies first. These commands do not require Neon credentials and operate locally. A health request to the preview must return `schema: ok`; it will still report `applicationReady: false` because application integration is not part of this preparation.

## Representation contract

PostgreSQL decimals become integer minor units with the original scale, using Prisma `BigInt` so values are not restricted to 32-bit integers. Use the helpers in `d1/values.mjs` at input/output boundaries, and preserve the units in comparisons and aggregates. Reject values outside JavaScript's safe integer range before binding them to D1. Timestamps use UTC ISO strings ending `+00:00`; JSON null remains distinct from SQL NULL. Scalar arrays become JSON and require replacement queries. Model/table mappings are retained.

## Remaining application work before cutover

Replace 3 explicit transaction call sites and review all nested writes for atomic D1 batches:

- `src/core-service.ts:42`
- `src/core-service.ts:74`
- `src/core-service.ts:111`

The transaction list comes from the local source audit at migration preparation time; the PR base can differ. Also replace PostgreSQL-only search options, duplicate skipping, array predicates, and raw SQL. Adapt the database client and all numeric boundaries to the new schema. Do not point the current PostgreSQL client at the D1 database.

## Production cutover

The existing D1 target holds a static snapshot and has no Wrangler migration history. **Do not run the baseline against that populated database.** Use a fresh empty D1 database for a rehearsed cutover, apply these migrations, transform/import a fresh data-only Neon snapshot, and verify row contents plus foreign keys. Keep writes paused during the final export/import and drain payment jobs/webhooks before changing bindings. Test concurrent writes, rollback, tenant isolation, login and product workflows first.

Preserve Neon for rollback; after D1 accepts new writes, rollback also requires data reconciliation. This draft does not authorize an automatic deployment, remote migration, or source deletion.
