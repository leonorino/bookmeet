# ADR-0008: Per-organizer management keys

- **Status:** Accepted
- **Date:** 2026-10-03

Organizers do not need user accounts or login sessions for this learning project; the management key is a capability, not an identity. Creating an organizer returns a public organizer ID and a separate 256-bit key (32 random bytes encoded as base64url) once. Management requests present it as a bearer credential scoped to the matching organizer; this grants access to slots, bookings, and client email addresses. Persist only its SHA-256 digest, send it over HTTPS outside local development, and keep it out of booking links and logs. Provide no recovery, rotation, or transfer flow initially. If a key is lost, the workspace cannot be managed and a new one must be created; if exposed, the workspace is compromised because the initial service has no revocation flow.
