# Client

The client is a TypeScript React application built with React Router framework mode and SPA output. Organizers can create a workspace, publish and manage meeting slots, review bookings, and cancel bookings. Clients can view a public organizer page, reserve a slot, confirm with an email address, and cancel using only the cancellation credential from their confirmation.

Booking rules, slot reservation, persistence, and notifications belong to the separate server. The browser bundle must not contain credentials or API secrets. Organizer management keys are credentials entered by the organizer; when a workspace is created, the client stores its key in local storage on that device and shows it once for copying. The key is never placed in a URL. Use “Forget this device” on the management page to remove a saved key.

## Development

Requires Node.js 24 LTS and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Use `npm run typecheck` to check route types and TypeScript, and `npm run build` to create the static SPA in `build/client`.

## Configuration

`VITE_API_BASE_URL` may be set to the public base URL of the server API at build time. It must never contain a secret; Vite variables are embedded in browser code. If it is empty during local development, Vite proxies `/v1` requests to `http://localhost:3000`. For a separate production API origin, configure the API to allow the deployed client origin through CORS and build with `VITE_API_BASE_URL` set to the public API URL.

## Docker

```sh
docker build --build-arg VITE_API_BASE_URL=https://api.example.com -t meeting-booking-client .
docker run --rm -p 8080:80 meeting-booking-client
```

The Nginx image serves the static build and falls back to `index.html` for client-side routes, including direct visits and refreshes. Replace the example API URL with the public server API URL for the deployment. The value is public configuration, not a credential.

## References

- [ADR-0002: React Router for the client application](../docs/adr/0002-client-react-router.md)
- [Product requirements](../docs/pdr/meeting-slot-booking.md)
