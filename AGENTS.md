# Phumi Core

Phumi Core is the source of truth for ecosystem users, tenants, memberships, and subscription state.

- Keep product-specific business data in its product service.
- Keep payment execution and provider credentials in `phumi-gateway`.
- All `/v1` calls are server-to-server and must use the signed request contract.
- Preserve tenant isolation in every query and mutation.
- Add migrations for schema changes and run `npm run validate` after major changes.
