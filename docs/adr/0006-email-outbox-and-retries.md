# ADR-0006: Durable email outbox with retries

- **Status:** Accepted
- **Date:** 2026-09-30

Booking and cancellation state must remain authoritative even when email delivery is unavailable. Write one logical notification record per event and recipient to a durable outbox in the same SQLite transaction as the state change; a worker sends it after commit and retries failed attempts. A successful notification should not be deliberately sent again. Use provider idempotency or delivery-status checks where available to suppress duplicates. The email provider and retry limits/backoff remain open; exactly-once delivery cannot be promised for an ambiguous provider timeout unless the selected provider offers a suitable idempotency mechanism.
