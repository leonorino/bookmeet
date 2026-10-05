# Meeting Booking Server

The server implements the TypeSpec API contract with Node.js 24, Fastify 5, TypeBox, and SQLite through `better-sqlite3`. SQLite schema migrations run at startup. Booking and cancellation state changes are committed with their notification outbox rows before SMTP delivery begins.

## Run locally

Install Node.js 24 and npm, then run:

```sh
npm ci
cp .env.example .env
docker compose up -d mailpit
SMTP_HOST=127.0.0.1 npm run dev
```

The API listens on `http://localhost:3000`; inspect captured mail at `http://localhost:8025`. The sample `.env` configures Mailpit at port 1025, with no credentials. The explicit `SMTP_HOST` value directs a host-run API to Mailpit; shell environment values take precedence over values loaded from `.env`. To stop Mailpit, run `docker compose stop mailpit`.

To run the API and Mailpit together in Compose instead, run:

```sh
docker compose up --build
```

Compose connects the server to Mailpit by service name, publishes the API on port 3000, and binds Mailpit SMTP and web UI to `127.0.0.1:1025` and `127.0.0.1:8025`. Mailpit uses temporary storage by default, so its inbox clears when the container exits.

Set `HOST`, `PORT`, or `DATABASE_PATH` to configure the listener and database. The default database is `./data/meeting-booking.sqlite`; its directory is created automatically. SQLite uses foreign key enforcement, a five second busy timeout, and WAL journaling.

Local development and Compose use Mailpit defaults. Production startup requires `SMTP_HOST` and `SMTP_FROM`; provide your real provider's SMTP host, port, security mode, sender, and credentials through the environment. `SMTP_USER` and `SMTP_PASSWORD` are optional but must be set together. The notification outbox keeps messages queued until sent and retries delivery failures with exponential backoff, starting at one minute and capped at one hour.

Use `npm run typecheck`, `npm test`, and `npm run build` for server checks. Run `npm start` to execute the compiled server; it loads an optional `.env` file as well. When starting the API on the host, use the same `SMTP_HOST=127.0.0.1` override with `npm start` to connect to Mailpit.

## API behavior

- `POST /v1/organizers` takes `organizerEmail` and returns an organizer ID and one-time management key. The key is stored only as a SHA-256 digest and must be sent as a bearer credential for organizer operations.
- Public clients see available slots, hold one for 60 seconds, and confirm with the hold credential and their email. That email receives confirmation and cancellation messages for the booking. Client cancellation uses the `X-Cancellation-Credential` returned at confirmation.
- Organizer slots use UTC instants and an IANA time zone. Future slots cannot overlap another active slot for that organizer. Both the organizer and client can cancel a booking at least 24 hours before it starts.
- Booking confirmation and cancellation create one outbox row per distinct recipient in the same transaction as the state change. A background worker sends due messages and retries failures with exponential backoff, starting at one minute and capped at one hour. Messages remain queued until sent. SMTP provides at-least-once delivery, so a timeout after provider acceptance can result in a duplicate.
- Management keys, hold credentials, cancellation credentials, and SMTP credentials are redacted from request logs. Organizer booking responses omit the client cancellation credential.

Compose mounts a named Docker volume at `/data`, where SQLite stores its database and WAL files. The named volume survives container replacement and image rebuilds. To back up, stop the service first (`docker compose stop server`) so the database and WAL are consistent, then archive the volume contents. Restart with `docker compose start server`. Restore by stopping the service, replacing the files in the named volume with the backup, and starting it again. Keep the database file and its `-wal`/`-shm` companions together if present. Compose SMTP settings can be overridden with environment variables for deployed environments.

## Technology decisions

- SQLite is the accepted persistence choice (ADR-0001).
- Node.js and Fastify are the accepted server platform (ADR-0003).
- The TypeSpec project in `../contract` is the source of truth for the client/server API boundary.
- The durable notification outbox follows ADR-0006. SMTP is the initial delivery transport.
