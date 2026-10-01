# Meeting Slot Booking API contract

**Status: Draft.** This TypeSpec project is the source of truth for the cross-repository API contract. The checked-in OpenAPI 3.1 document is generated output; do not edit it by hand. The contract describes intended API behavior, not an implementation guarantee.

## Organizer authorization is unresolved

The PDR lists how organizers authenticate and prove management rights as an open decision. Accordingly, all `/v1/organizers/{organizerId}/...` operations are marked organizer-only and require authentication and authorization, but this draft defines no scheme, credential, header, token, or security requirement. Do not infer one from this contract. Resolve the decision before implementing or publishing organizer access. Public client booking routes do not require client accounts.

## Behavior captured

- `GET /health` reports service health.
- Public availability is scoped to an organizer. Creating a hold atomically claims an available slot for 60 seconds; the returned hold credential must accompany confirmation to demonstrate possession.
- Confirmation requires a client email and returns booking details, including a secret cancellation credential. The client cancellation route requires that credential and is allowed only at least 24 hours before the meeting.
- Organizers can create and remove unbooked slots, inspect their slots and bookings, and cancel bookings (subject to the same 24-hour cutoff).
- Organizer slot inspection returns `available`, `held`, or `booked` state and includes a hold expiry instant while held. Organizer booking views omit the client's cancellation credential.
- Client email uses the `ClientEmail` scalar with email format and a 3–254 character length bound.
- Slot data carries UTC RFC 3339 start/end instants and the organizer's IANA time-zone identifier.
- Errors use a structured `{ error: { code, message, details?, requestId? } }` response. Stable code/status pairs include `INVALID_REQUEST` (400), `UNAUTHENTICATED`, `HOLD_CREDENTIAL_INVALID`, or `CANCELLATION_CREDENTIAL_INVALID` (401), `ORGANIZER_ACCESS_DENIED` (403), resource-specific `*_NOT_FOUND` codes (404), `SLOT_UNAVAILABLE`, `SLOT_ALREADY_BOOKED`, or `BOOKING_ALREADY_CANCELLED` (409), `HOLD_EXPIRED` (410), `CANCELLATION_WINDOW_CLOSED` (422), and `INTERNAL_ERROR` (500). Each operation declares only the response statuses relevant to its flow.

The PDR's hold-switching behavior, daylight-saving local-time interpretation, and email delivery policy remain outside the details of this API contract.

## Compile and regenerate

Requires Node.js 22 or later and npm. From this directory:

```sh
npm ci
npm run compile
```

The project pins compatible TypeSpec compiler, HTTP library, and OpenAPI emitter ranges in `package.json`; `package-lock.json` records the exact dependency graph. Compilation emits OpenAPI 3.1 YAML to `openapi/`.
