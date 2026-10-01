# ADR-0005: TypeSpec for the API contract

- **Status:** Accepted
- **Date:** 2026-09-30

The client and server are separate applications, so their request and response shapes need a language-neutral source of truth. Describe the JSON REST API in TypeSpec and emit an OpenAPI document for the client/server boundary. Keep booking rules on the server; generated OpenAPI and client types are contract artifacts, not shared application source. The exact process for publishing the artifact and aligning Fastify's TypeBox runtime schemas with TypeSpec remains to be selected during API implementation.


The official [TypeSpec OpenAPI emitter](https://typespec.io/docs/emitters/openapi3/openapi/) documents the mapping from TypeSpec declarations to OpenAPI operations and schemas.
