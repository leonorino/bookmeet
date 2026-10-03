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

## CI and Docker images

GitHub Actions runs the available checks for the client (`typecheck` and `build`), server (`typecheck` and `build`), and contract (`compile`, including a check that generated OpenAPI has no uncommitted changes). Each package is installed and checked independently with Node.js 24. The packages do not define test scripts yet.

Checks and Docker builds run for pull requests and manual workflow runs. Pushes to `main` and tags matching `v*` also publish these images to GitHub Container Registry (GHCR):

- `ghcr.io/<owner>/meeting-booking-client`
- `ghcr.io/<owner>/meeting-booking-server`

Published images receive a full commit SHA tag (`sha-<commit>`); use the same SHA tag for a client/server pair from one commit. Pushes to `main` publish the `main` branch tag and `latest`. After all checks pass on `main`, Conventional Commits determine whether to create a GitHub Release and matching `v<version>` tag: `fix` and `perf` commits trigger a patch release, `feat` commits trigger a minor release, and breaking `!` markers or `BREAKING CHANGE:` footers trigger a major release. Commit types such as `docs` and `chore` do not trigger a release unless marked as breaking. With no earlier version tag, the first release is `v1.0.0`. A release publishes its plain version (`1.2.3`) and major/minor (`1.2`) tags on both images as part of the same workflow run. Pushing an existing version tag such as `v1.2.3` also publishes its `1.2.3` and `1.2` image tags. Pull requests and manual runs build images without publishing them.

## Product notes

The intended booking flow includes a one-minute hold, protection against double-booking, explicit time zones, and confirmation and cancellation emails. Time zones are included because apparently the same meeting can happen at several different local times, depending on where you stand.

See the [product requirements](docs/pdr/meeting-slot-booking.md), [architecture decisions](docs/adr/), and [API contract](contract/README.md) for the full, less self-conscious version.
