# Meeting Slot Booking API contract

**Status: Draft.** This TypeSpec project is the source of truth for the API contract between the client and server packages in this repository. The checked-in OpenAPI 3.1 document is generated output; do not edit it by hand. The contract describes intended API behavior, not an implementation guarantee.

## Organizer management keys

There are no organizer accounts, passwords, or login sessions. `POST /v1/organizers` creates an empty organizer workspace and returns its public `organizerId` and a cryptographically random 256-bit `managementKey` (32 random bytes encoded as base64url). The key is returned only once. The server stores its SHA-256 digest, and the organizer client sends the key as an HTTP bearer credential (`Authorization: Bearer <managementKey>`) for organizer management operations. Send the key only over HTTPS outside local development. A key grants access only to its own organizer, including viewing client email addresses in that organizer's bookings; a valid key used with a different organizer ID receives `403 ORGANIZER_ACCESS_DENIED`. A missing or invalid key receives `401 ORGANIZER_KEY_INVALID`. See [ADR-0008](../docs/adr/0008-organizer-management-keys.md) for the key lifecycle and rationale.

The public booking link contains only the organizer ID and never the management key. Public client booking operations do not require a management key or a client account. The key has no recovery, rotation, or transfer flow in the initial service; if it is lost, the organizer must create a new workspace, and the old workspace remains inaccessible for management. If the key is exposed, the workspace is compromised because the initial service has no revocation flow. Do not put management keys in URLs or logs.

## Behavior captured

- `GET /health` reports service health.
- `POST /v1/organizers` creates an empty organizer workspace and returns its public ID and one-time management key.
- Public availability is scoped to an organizer. Creating a hold atomically claims an available slot for 60 seconds; the returned hold credential must accompany confirmation to demonstrate possession.
- Confirmation requires a client email and returns booking details, including a secret cancellation credential. The client cancellation route requires that credential and is allowed only at least 24 hours before the meeting.
- Organizers can create and remove unbooked slots, inspect their slots and bookings, and cancel bookings (subject to the same 24-hour cutoff).
- Organizer operations use a bearer management key scoped to the organizer ID. Public booking operations remain unauthenticated.
- Organizer slot inspection returns `available`, `held`, or `booked` state and includes a hold expiry instant while held. Organizer booking views omit the client's cancellation credential.
- Client email uses the `ClientEmail` scalar with email format and a 3–254 character length bound.
- Slot data carries UTC RFC 3339 start/end instants and the organizer's IANA time-zone identifier.
- Errors use a structured `{ error: { code, message, details?, requestId? } }` response. Stable code/status pairs include `INVALID_REQUEST` (400), `UNAUTHENTICATED`, `ORGANIZER_KEY_INVALID`, `HOLD_CREDENTIAL_INVALID`, or `CANCELLATION_CREDENTIAL_INVALID` (401), `ORGANIZER_ACCESS_DENIED` (403), resource-specific `*_NOT_FOUND` codes (404), `SLOT_UNAVAILABLE`, `SLOT_ALREADY_BOOKED`, or `BOOKING_ALREADY_CANCELLED` (409), `HOLD_EXPIRED` (410), `CANCELLATION_WINDOW_CLOSED` (422), and `INTERNAL_ERROR` (500). Each operation declares only the response statuses relevant to its flow.

The PDR's hold-switching behavior, daylight-saving local-time interpretation, and email delivery policy remain outside the details of this API contract.

## Compile and regenerate

Requires Node.js 22 or later and npm. From this directory:

```sh
npm ci
npm run compile
```

The project pins compatible TypeSpec compiler, HTTP library, and OpenAPI emitter ranges in `package.json`; `package-lock.json` records the exact dependency graph. Compilation emits OpenAPI 3.1 YAML to `openapi/`.
