# Codex project instructions

## Project

Meeting Slot Booking lets organizers publish available meeting times and lets clients book a slot without creating an account. See [the product requirements document](docs/pdr/meeting-slot-booking.md) for the current scope and behavior.

## Technology and repositories

- The application uses **TypeScript**, **SQLite**, and **Docker for deployment**.
- Maintain the entire project in **one Git repository rooted here**. Keep the client, server, and API contract packages independently configured and buildable.
- The **server application** owns booking rules, slot availability and reservation, SQLite persistence, and email notifications.
- The **client application** owns the organizer and client user interfaces and communicates with the server through its API. Keep data contracts aligned through `contract/` and the API boundary.
- See `docs/adr/` for accepted technology decisions. Inspect each app's package scripts, dependencies, and configuration before implementation.

## Naming and code style

- Follow the formatter, linter, and established patterns in the repository being changed. Where no convention exists, use `camelCase` for variables and functions, `PascalCase` for types and components, `kebab-case` for file names, and `UPPER_SNAKE_CASE` for environment variables.
- Prefer descriptive names that match the product language, such as organizer, client, slot, and booking.
- Keep TypeScript types explicit at API and persistence boundaries; validate external input and handle errors where they enter the application.
- Keep booking consistency rules on the server. Handle meeting dates and times with an explicit time zone, as required by the product specification.
- Keep functions focused and avoid adding abstractions without a clear use.

## Commit messages

- When creating commits, agents MUST follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), using `<type>[optional scope]: <description>` for the header. Keep the type lowercase; use a concise scope such as `server`, `client`, `contract`, or `docs` when it adds context.
- Use `feat` for new functionality and `fix` for bug fixes. For other changes, use an accurate type such as `docs`, `test`, `refactor`, `chore`, `build`, or `ci`.
- Add a body or footers only when useful, with a blank line between sections. Mark breaking changes with `!` before the colon or a `BREAKING CHANGE: <description>` footer.

## Workspace layout

This repository contains product documentation, the API contract, and client and server applications. Keep the applications independently deployable, with separate package configurations and no shared application source:

```text
.
├── AGENTS.md
├── client/                     # independent client application scaffold
├── contract/                   # API contract package
├── server/                     # independent server application scaffold
├── GLOSSARY.md
└── docs/
    ├── adr/
    │   ├── 0001-sqlite-for-persistence.md
    │   ├── 0002-client-react-router.md
    │   └── 0003-server-node-fastify.md
    └── pdr/
        └── meeting-slot-booking.md
```

The client and server are separate application roots within this repository. Do not add a root package or shared build that couples them, and do not assume they share source files or runtime dependencies.

## Collaboration

For complex coding tasks, use the `astra-orchestrator` skill when its trigger conditions match.

The root agent owns architecture, decomposition, integration, and final verification.
Prefer specialized subagents for bounded exploration, implementation, testing, review, and technical research.

Do not delegate trivial work merely for parallelism.
Do not let multiple implementation agents edit the same files without explicit ownership boundaries.
User instructions always take precedence over this orchestration policy.
