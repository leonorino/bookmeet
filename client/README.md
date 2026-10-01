# Client

The client is a TypeScript React application built with React Router framework mode and SPA output. Its initial home page introduces the meeting booking product; organizer availability and client booking flows will be added against the server API as product work proceeds.

Booking rules, slot reservation, persistence, and notifications belong to the separate server. The browser bundle must not contain credentials or API secrets.

## Development

Requires Node.js 24 LTS and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Use `npm run typecheck` to check route types and TypeScript, and `npm run build` to create the static SPA in `build/client`.

## Configuration

`VITE_API_BASE_URL` may be set to the public base URL of the server API at build time. It is optional in this starter and must never contain a secret; Vite variables are embedded in browser code.

## Docker

```sh
docker build -t meeting-booking-client .
docker run --rm -p 8080:80 meeting-booking-client
```

The Nginx image serves the static build and falls back to `index.html` for client-side routes, including direct visits and refreshes.

## References

- [ADR-0002: React Router for the client application](../docs/adr/0002-client-react-router.md)
- [Product requirements](../docs/pdr/meeting-slot-booking.md)
