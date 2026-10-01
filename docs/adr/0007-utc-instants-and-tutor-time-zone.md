# ADR-0007: Store UTC instants with the tutor time zone

- **Status:** Accepted
- **Date:** 2026-09-30

The service must compare bookings as precise instants while displaying lesson times in an explicit time zone. Store each slot's UTC start and end instants together with the tutor's IANA time-zone identifier, and return both the instants and identifier through the API. This preserves an unambiguous booking time while giving the client enough information to display the tutor's local time. Handling ambiguous or nonexistent local times during daylight-saving transitions remains an implementation rule to settle before slot creation is built.
