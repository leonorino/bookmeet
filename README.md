# Meeting Slot Booking

*A personal project for making the scheduling email tennis match slightly less exhausting.*

The idea is simple: organizers offer one-off meeting slots, then clients book one from a reusable link without creating an account. The server should hold the slot briefly, confirm the booking, and email both people. Fewer rounds of “does Thursday work?”; more meetings that are, in theory, actually scheduled.

This is a personal project, and it is still early scaffolding. The client currently has an introductory page, the server exposes `GET /health`, and the API contract describes intended behavior. **The booking flow is not implemented yet**, so this repo cannot schedule your meeting. It can, however, confirm that the server is alive. We all start somewhere.

## What’s here

- `client/` — TypeScript and React Router client app.
- `server/` — TypeScript and Fastify API, with SQLite setup.
- `contract/` — TypeSpec source and generated OpenAPI contract for the client/server API boundary.
- `docs/` — product requirements and architecture decisions.

Everything lives in one Git repository, while the client, server, and contract remain separate packages. There is no root package or all-powerful install command. The packages prefer to handle their own affairs.

## Run locally

Use Node.js 24 and npm. Install and run each application in its own terminal:

```sh
cd server
npm ci
npm run dev
```

```sh
cd client
npm ci
npm run dev
```

The server listens on `http://localhost:3000`; the client prints its local URL when Vite starts. At this stage, they have not yet been introduced to each other.

To compile the API contract:

```sh
cd contract
npm ci
npm run compile
```

Each package README has its own development and Docker details. The contract README explains how its OpenAPI output is generated.

## Product notes

The intended booking flow includes a one-minute hold, protection against double-booking, explicit time zones, and confirmation and cancellation emails. Time zones are included because apparently the same meeting can happen at several different local times, depending on where you stand.

See the [product requirements](docs/pdr/meeting-slot-booking.md), [architecture decisions](docs/adr/), and [API contract](contract/README.md) for the full, less self-conscious version.
