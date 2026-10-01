# ADR-0004: Testing pipeline for the client and server

- **Status:** Proposed
- **Date:** 2026-09-30

## Context

The client and server are TypeScript applications maintained and deployed independently. Each has its own package and Docker build; there is no root package, test script, or CI workflow. The current packages provide typecheck and build scripts only.

The server owns booking consistency, SQLite persistence, and notifications. Its critical behaviors include expiring holds, preventing duplicate bookings, applying the cancellation cutoff, interpreting times in an explicit time zone, and preserving a confirmed booking if email delivery fails. The client owns the booking experience and must present availability, confirmation, and unavailable states clearly.

## Decision

Use Vitest as the test runner in each application. Add a `test` package script that runs tests once in CI and an optional watch script for local development. Keep tests, dependencies, scripts, and CI workflows inside their respective application repositories.

For the server:

- Separate Fastify app construction from process startup so tests can create and close an app without opening a listener or installing signal handlers.
- Use Vitest in the Node environment and Fastify's `inject` API for route and schema tests.
- Run persistence integration tests against isolated temporary SQLite databases using the real `better-sqlite3` driver. Stub email delivery and provide a controllable clock; do not call external services.
- Cover booking state transitions and database constraints, including hold expiry, the cancellation boundary, time-zone and daylight-saving cases, rollback, and competing confirmations where exactly one booking may succeed. Verify that a delivery failure does not undo a committed booking.

For the client:

- Use Vitest with a DOM environment and React Testing Library for route and component behavior.
- Test user-visible loading, validation, confirmation, unavailable, and error states. Mock the HTTP boundary so these tests stay independent of a running server. Keep booking consistency rules tested on the server.

Each repository's pull-request and branch CI must use Node.js 24 and run, from that repository root:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `docker build` for that application's production image

All five checks are required before merging. CI must not use production credentials, email services, or the persistent production database. Server tests use temporary databases; client tests use mocked responses.

The client repository owns a small Playwright browser suite for the complete booking journey. A release workflow runs it against the exact client and server images deployed to a disposable staging environment, with an isolated database and email sink. The release must pass this suite before production promotion. This check covers the browser-to-API integration and direct loading of organizer booking links; it does not make either application's pull-request workflow depend on the other repository's source checkout.

The CI provider is not selected by this ADR. Each repository implements these checks in its own provider-native workflow.

## Consequences

- Unit and in-process integration checks run with each repository's changes, while a separate release check verifies the deployed client/server combination.
- Vitest provides a consistent test command across both packages and fits the client's Vite-based toolchain. Server tests remain in-process and do not require a listening port.
- Server app construction must become injectable/testable before route and database tests can exercise it safely.
- Temporary SQLite files, fixed clocks, mocked network calls, and isolated test data keep results repeatable and prevent changes to production state.
- Browser tests take longer and require staging orchestration, so they run at release time rather than on every pull request.
- No global coverage percentage is required initially. Tests should focus on product and persistence invariants; a coverage threshold can be considered after the suite has a useful baseline.

## References

- [Vitest guide](https://vitest.dev/guide/)
- [Fastify testing guide](https://fastify.dev/docs/latest/Guides/Testing/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright CI guide](https://playwright.dev/docs/ci)
- [Product requirements](../pdr/meeting-slot-booking.md)
- [ADR-0001: SQLite for initial persistence](0001-sqlite-for-persistence.md)
- [ADR-0002: React Router for the client application](0002-client-react-router.md)
- [ADR-0003: Node.js and Fastify for the server](0003-server-node-fastify.md)
