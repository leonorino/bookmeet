# ADR-0001: SQLite for initial persistence

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

The service stores tutor availability, temporary slot holds, confirmed bookings, and cancellation state. Booking must be atomic so concurrent students cannot confirm the same slot. The agreed initial stack includes SQLite and Docker.

## Decision

Use SQLite as the service's relational database. Store the database file on persistent Docker-managed storage, outside the container's ephemeral writable layer. Access it from the server through `better-sqlite3`.

When a student selects a slot, create a temporary hold immediately if the slot is available. The hold expires 60 seconds after creation unless confirmation converts it into a booking sooner. Use transactions and database constraints for hold and booking state changes so that concurrent requests cannot claim the same slot. Keep write transactions short: do not wait for email delivery or other network calls while a transaction is open. Start with one server instance using the database file.

Persist a notification outbox record in the same transaction as a booking or cancellation change. A separate worker delivers email after commit; see [ADR-0006](0006-email-outbox-and-retries.md).

## Consequences

- SQLite keeps deployment and local development simple, with no separate database service to operate.
- SQLite allows concurrent readers but serializes writes to one writer at a time. The server must handle brief write contention, and this deployment assumes one API instance and modest write volume.
- Use a persistent volume and a documented backup/restore process. Do not rely on the container layer for booking data.
- Revisit this decision before adding multiple API instances or if sustained write contention becomes a problem; PostgreSQL is the likely next option.

## Alternatives considered

- **PostgreSQL:** stronger fit for multiple application instances and heavier concurrent writes, with added deployment and operational work.
- **MySQL:** a capable server database, but offers no clear advantage for the current scope over PostgreSQL.

## References

- [SQLite transactions](https://www.sqlite.org/transactional.html)
- [SQLite isolation and write concurrency](https://www.sqlite.org/isolation.html)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
