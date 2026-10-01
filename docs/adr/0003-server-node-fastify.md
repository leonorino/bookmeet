# ADR-0003: Node.js and Fastify for the server

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

The server is a TypeScript application in its own repository. It owns booking rules, slot holds and confirmations, SQLite access, and notification triggers. Its API must validate untrusted client input and preserve booking consistency under concurrent requests. The agreed deployment target is Docker.

## Decision

Use TypeScript on the Node.js 24 LTS runtime and Fastify 5 to expose a JSON REST API. Use TypeSpec as the canonical cross-repository API contract, as described in [ADR-0005](0005-typespec-for-api-contract.md). Fastify route input and response schemas use TypeBox and `@fastify/type-provider-typebox` for runtime validation and handler types; these schemas must remain aligned with the TypeSpec contract. The mechanism for generating or checking runtime schemas is to be decided during API implementation. Use `better-sqlite3` as described in [ADR-0001](0001-sqlite-for-persistence.md).

Build and run the API as a Docker image. Keep slot reservation and confirmation logic on the server. Commit booking state and its notification outbox record together before email delivery begins, as described in [ADR-0006](0006-email-outbox-and-retries.md).

## Consequences

- Node.js 24 is an LTS release; Fastify 5 supports Node.js 20 and later.
- Fastify's route schemas provide request validation and response serialization. TypeBox adds inferred handler types while staying aligned with JSON Schema. TypeSpec remains the canonical contract across the separate client and server repositories.
- The REST API gives the separately maintained client and server a clear integration boundary.
- `better-sqlite3` uses synchronous database calls, so queries and write transactions must remain short and must not include network I/O.
- Fastify and TypeBox add framework-specific conventions; API schemas must remain aligned with the TypeSpec client/server contract.

## References

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [Fastify v5 migration guide and Node.js requirement](https://fastify.dev/docs/v5.6.x/Guides/Migration-Guide-V5/)
- [Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/)
