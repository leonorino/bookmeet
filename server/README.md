# Meeting Booking Server

The server is a Node.js 24 application using Fastify 5, TypeBox for request and response typing, and SQLite through `better-sqlite3`. The API currently exposes only `GET /health`; booking behavior and persistence schema will be added from the product requirements in later work.

## Run locally

Install Node.js 24 and npm, then run:

```sh
npm ci
npm run dev
```

The API listens on `http://localhost:3000`. Set `HOST`, `PORT`, or `DATABASE_PATH` in your shell to configure it; `.env.example` documents the available settings. The default database path is `./data/meeting-booking.sqlite`; the directory is created automatically. The app enables SQLite foreign key enforcement, a five second busy timeout, and WAL journaling. No application tables are created yet.

Use `npm run build` to compile and `npm start` to run the compiled server.

## Run with Docker Compose

```sh
docker compose up --build
```

Compose publishes port 3000 and mounts a named Docker volume at `/data`, where SQLite stores its database and WAL files. The named volume survives container replacement and image rebuilds. To make a backup, stop the service first (`docker compose stop server`) so the database and WAL are consistent, then archive the volume contents; restart with `docker compose start server`. Restore by stopping the service, replacing the files in the named volume with the backup, and starting it again. Keep the database file and its `-wal`/`-shm` companions together if present.

## Technology decisions

- SQLite is the accepted persistence choice (ADR-0001).
- Node.js and Fastify are the accepted server platform (ADR-0003).
- Docker is the deployment target. The image uses Debian Bookworm because `better-sqlite3` includes a native addon.
- No email provider or booking rules have been selected or implemented.
