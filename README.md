# Phumi Core

Phumi Core is the central, product-neutral API for shared Phumi identity and tenancy. It owns:

- stable ecosystem user IDs with product-specific external identities
- app-scoped tenants and globally unique slugs
- owner, admin, and member relationships
- subscription lifecycle state and references to Phumi Gateway payments
- signed server-to-server access and an OpenAPI contract

Product-specific business records stay in their product services. ABA PayWay credentials, checkout creation, payment reconciliation, and payment webhooks stay in `phumi-gateway`.

## Stack

- TypeScript and Hono
- OpenAPI and Swagger UI
- PostgreSQL and Prisma via the Neon serverless adapter
- Node.js 22 and Cloudflare Workers entry points
- Vitest contract and security tests

## Local setup

Requirements: Node.js 22+, npm, and a PostgreSQL or Neon database.

```powershell
npm install
Copy-Item .env.example .env
npm run prisma:generate
npm run prisma:deploy
npm run dev:node
```

Open `http://localhost:8790/docs`. Wrangler development is available with `npm run dev`.

## Service authentication

Every `/v1` request must include:

- `x-app-id`
- `x-timestamp` as the current Unix timestamp in seconds
- `x-signature` as lowercase hex HMAC-SHA256

Canonical signing input:

```text
HTTP_METHOD
/exact/path
unix_timestamp
lowercase_hex_sha256_of_exact_raw_body
```

Use the app's `requestSecret` from `CORE_APPS_JSON`. Query parameters are not included in the signed path. Requests outside the five-minute clock-skew window are rejected.

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API and database health |
| `PUT` | `/v1/users` | Idempotently create or update an app identity |
| `GET` | `/v1/users/resolve?externalId=...` | Resolve an app external ID |
| `GET` | `/v1/users/{userId}` | Read a user linked to the calling app |
| `POST` | `/v1/tenants` | Create a tenant and owner membership |
| `GET` | `/v1/tenants/{tenantId}` | Read tenant, members, and subscription |
| `PUT` | `/v1/tenants/{tenantId}/members/{userId}` | Add or update membership |
| `PUT` | `/v1/tenants/{tenantId}/subscription` | Update reconciled subscription state |

The OpenAPI document at `/openapi.json` is the full request and response contract.

## Validation

```powershell
npm run typecheck
npm test
npm run build
# or all three
npm run validate
```

## Deployment

Set `DATABASE_URL` and `CORE_APPS_JSON` as Cloudflare Worker secrets, update `PUBLIC_BASE_URL` in `wrangler.jsonc`, deploy migrations, then deploy the Worker:

```powershell
npm run prisma:deploy
npm run deploy
```

Rotate each application secret independently. Never put `CORE_APPS_JSON` or any request secret in a browser or mobile application; only trusted product servers should call Core.
