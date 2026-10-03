import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/database.js';
import { OutboxWorker, type MailSender, type OutgoingEmail } from '../src/email-worker.js';

const HOUR = 60 * 60 * 1_000;
const INITIAL_TIME = Date.UTC(2030, 0, 1, 12, 0, 0);

interface OrganizerResult {
  organizerId: string;
  managementKey: string;
}

interface SlotResult {
  slot: { slotId: string; startAt: string; endAt: string; timeZone: string };
}

interface HoldResult {
  hold: {
    holdId: string;
    holdCredential: string;
    slot: SlotResult['slot'];
    expiresAt: string;
  };
}

interface BookingResult {
  booking: {
    bookingId: string;
    organizerId: string;
    clientEmail: string;
    cancellationCredential: string;
    status: 'confirmed' | 'cancelled';
    createdAt: string;
  };
}

function makeHarness(options: { mailSender?: MailSender; startOutboxWorker?: boolean } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'meeting-booking-test-'));
  const databasePath = join(directory, 'test.sqlite');
  let currentTime = INITIAL_TIME;
  const app = buildApp({
    databasePath,
    now: () => currentTime,
    logger: false,
    ...options,
  });
  return {
    app,
    databasePath,
    directory,
    now: () => currentTime,
    setNow: (value: number) => { currentTime = value; },
    advance: (delta: number) => { currentTime += delta; },
  };
}

const harnesses: Array<ReturnType<typeof makeHarness>> = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    await harness.app.close();
    rmSync(harness.directory, { recursive: true, force: true });
  }
});

function trackHarness(options: { mailSender?: MailSender; startOutboxWorker?: boolean } = {}) {
  const harness = makeHarness(options);
  harnesses.push(harness);
  return harness;
}

async function createOrganizer(app: ReturnType<typeof buildApp>, organizerEmail = 'organizer@example.com'): Promise<OrganizerResult> {
  const response = await app.inject({ method: 'POST', url: '/v1/organizers', payload: { organizerEmail } });
  expect(response.statusCode).toBe(201);
  return response.json<OrganizerResult>();
}

async function createSlot(
  app: ReturnType<typeof buildApp>,
  organizer: OrganizerResult,
  startAt = INITIAL_TIME + 48 * HOUR,
  endAt = startAt + HOUR,
): Promise<SlotResult['slot']> {
  const response = await app.inject({
    method: 'POST',
    url: `/v1/organizers/${organizer.organizerId}/slots`,
    headers: { authorization: `Bearer ${organizer.managementKey}` },
    payload: { startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), timeZone: 'Europe/Paris' },
  });
  expect(response.statusCode).toBe(201);
  return response.json<SlotResult>().slot;
}

async function createHold(app: ReturnType<typeof buildApp>, organizerId: string, slotId: string) {
  return app.inject({
    method: 'POST',
    url: `/v1/public/organizers/${organizerId}/holds`,
    payload: { slotId },
  });
}

async function readOutbox(databasePath: string) {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.prepare(`
      SELECT event_id, recipient_email, status, attempts, available_at FROM notification_outbox ORDER BY event_id, recipient_email
    `).all() as Array<{ event_id: string; recipient_email: string; status: string; attempts: number; available_at: number }>;
  } finally {
    database.close();
  }
}

describe('Meeting Slot Booking API', () => {
  it('serves health and creates organizers with a one-time management key', async () => {
    const harness = trackHarness();
    const health = await harness.app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });

    const malformedJson = await harness.app.inject({
      method: 'POST',
      url: '/v1/organizers',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    });
    expect(malformedJson.statusCode).toBe(400);
    expect(malformedJson.json().error.code).toBe('INVALID_REQUEST');

    const emptyJson = await harness.app.inject({
      method: 'POST',
      url: '/v1/organizers',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });
    expect(emptyJson.statusCode).toBe(400);
    expect(emptyJson.json().error.code).toBe('INVALID_REQUEST');

    const invalid = await harness.app.inject({
      method: 'POST',
      url: '/v1/organizers',
      payload: { organizerEmail: 'not-an-email' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('INVALID_REQUEST');
    expect(invalid.json().error.requestId).toBeTruthy();

    const organizer = await createOrganizer(harness.app);
    expect(organizer.organizerId).toBeTruthy();
    expect(organizer.managementKey).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const database = new Database(harness.databasePath, { readonly: true });
    const storedHash = database.prepare(`SELECT management_key_hash FROM organizers WHERE organizer_id = ?`)
      .get(organizer.organizerId) as { management_key_hash: string };
    expect(storedHash.management_key_hash).not.toBe(organizer.managementKey);
    expect(storedHash.management_key_hash).toMatch(/^[a-f0-9]{64}$/);
    database.close();
  });

  it('scopes organizer access and manages future non-overlapping slots', async () => {
    const harness = trackHarness();
    const organizer = await createOrganizer(harness.app);
    const otherOrganizer = await createOrganizer(harness.app, 'other@example.com');

    const missingKey = await harness.app.inject({ method: 'GET', url: `/v1/organizers/${organizer.organizerId}/slots` });
    expect(missingKey.statusCode).toBe(401);
    expect(missingKey.json().error.code).toBe('ORGANIZER_KEY_INVALID');

    const wrongScope = await harness.app.inject({
      method: 'GET',
      url: `/v1/organizers/${otherOrganizer.organizerId}/slots`,
      headers: { authorization: `Bearer ${organizer.managementKey}` },
    });
    expect(wrongScope.statusCode).toBe(403);
    expect(wrongScope.json().error.code).toBe('ORGANIZER_ACCESS_DENIED');

    const slot = await createSlot(harness.app, organizer);
    const pastSlot = await harness.app.inject({
      method: 'POST',
      url: `/v1/organizers/${organizer.organizerId}/slots`,
      headers: { authorization: `Bearer ${organizer.managementKey}` },
      payload: {
        startAt: new Date(INITIAL_TIME - HOUR).toISOString(),
        endAt: new Date(INITIAL_TIME + HOUR).toISOString(),
        timeZone: 'Europe/Paris',
      },
    });
    expect(pastSlot.statusCode).toBe(400);
    expect(pastSlot.json().error.code).toBe('INVALID_REQUEST');

    const overlap = await harness.app.inject({
      method: 'POST',
      url: `/v1/organizers/${organizer.organizerId}/slots`,
      headers: { authorization: `Bearer ${organizer.managementKey}` },
      payload: {
        startAt: new Date(INITIAL_TIME + 48 * HOUR + 30 * 60_000).toISOString(),
        endAt: new Date(INITIAL_TIME + 49 * HOUR + 30 * 60_000).toISOString(),
        timeZone: 'Europe/Paris',
      },
    });
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json().error.code).toBe('SLOT_OVERLAP');

    const fixedOffsetTimeZone = await harness.app.inject({
      method: 'POST',
      url: `/v1/organizers/${organizer.organizerId}/slots`,
      headers: { authorization: `Bearer ${organizer.managementKey}` },
      payload: {
        startAt: new Date(INITIAL_TIME + 60 * HOUR).toISOString(),
        endAt: new Date(INITIAL_TIME + 61 * HOUR).toISOString(),
        timeZone: '+01:00',
      },
    });
    expect(fixedOffsetTimeZone.statusCode).toBe(400);
    expect(fixedOffsetTimeZone.json().error.code).toBe('INVALID_REQUEST');

    const slots = await harness.app.inject({
      method: 'GET',
      url: `/v1/organizers/${organizer.organizerId}/slots`,
      headers: { authorization: `Bearer ${organizer.managementKey}` },
    });
    expect(slots.statusCode).toBe(200);
    expect(slots.json().slots).toEqual([{ ...slot, state: 'available' }]);

    const removed = await harness.app.inject({
      method: 'DELETE',
      url: `/v1/organizers/${organizer.organizerId}/slots/${slot.slotId}`,
      headers: { authorization: `Bearer ${organizer.managementKey}` },
    });
    expect(removed.statusCode).toBe(204);
    expect(removed.body).toBe('');

    const availability = await harness.app.inject({ method: 'GET', url: `/v1/public/organizers/${organizer.organizerId}/availability` });
    expect(availability.statusCode).toBe(200);
    expect(availability.json().slots).toEqual([]);
  });

  it('holds, confirms, lists, and cancels a booking while queuing update emails', async () => {
    const harness = trackHarness();
    const organizer = await createOrganizer(harness.app);
    const slot = await createSlot(harness.app, organizer);

    const availability = await harness.app.inject({ method: 'GET', url: `/v1/public/organizers/${organizer.organizerId}/availability` });
    expect(availability.statusCode).toBe(200);
    expect(availability.json().slots).toEqual([slot]);

    const holdResponse = await createHold(harness.app, organizer.organizerId, slot.slotId);
    expect(holdResponse.statusCode).toBe(201);
    const { hold } = holdResponse.json<HoldResult>();
    expect(hold.holdCredential).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const wrongHoldCredential = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/holds/${hold.holdId}/confirmation`,
      payload: { holdCredential: 'invalid-credential', clientEmail: 'client@example.com' },
    });
    expect(wrongHoldCredential.statusCode).toBe(401);
    expect(wrongHoldCredential.json().error.code).toBe('HOLD_CREDENTIAL_INVALID');

    const hiddenAvailability = await harness.app.inject({ method: 'GET', url: `/v1/public/organizers/${organizer.organizerId}/availability` });
    expect(hiddenAvailability.json().slots).toEqual([]);
    const organizerSlots = await harness.app.inject({
      method: 'GET',
      url: `/v1/organizers/${organizer.organizerId}/slots`,
      headers: { authorization: `Bearer ${organizer.managementKey}` },
    });
    expect(organizerSlots.json().slots[0].state).toBe('held');
    expect(organizerSlots.json().slots[0].holdExpiresAt).toBe(hold.expiresAt);

    const confirmed = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/holds/${hold.holdId}/confirmation`,
      payload: { holdCredential: hold.holdCredential, clientEmail: 'client@example.com' },
    });
    expect(confirmed.statusCode).toBe(201);
    const { booking } = confirmed.json<BookingResult>();
    expect(booking.status).toBe('confirmed');
    expect(booking.cancellationCredential).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const organizerBookings = await harness.app.inject({
      method: 'GET',
      url: `/v1/organizers/${organizer.organizerId}/bookings`,
      headers: { authorization: `Bearer ${organizer.managementKey}` },
    });
    expect(organizerBookings.statusCode).toBe(200);
    expect(organizerBookings.json().bookings[0]).not.toHaveProperty('cancellationCredential');
    expect(organizerBookings.json().bookings[0].clientEmail).toBe('client@example.com');

    const removeBookedSlot = await harness.app.inject({
      method: 'DELETE',
      url: `/v1/organizers/${organizer.organizerId}/slots/${slot.slotId}`,
      headers: { authorization: `Bearer ${organizer.managementKey}` },
    });
    expect(removeBookedSlot.statusCode).toBe(409);
    expect(removeBookedSlot.json().error.code).toBe('SLOT_ALREADY_BOOKED');

    const missingCredential = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/bookings/${booking.bookingId}/cancellation`,
    });
    expect(missingCredential.statusCode).toBe(401);
    expect(missingCredential.json().error.code).toBe('CANCELLATION_CREDENTIAL_INVALID');

    const cancelled = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/bookings/${booking.bookingId}/cancellation`,
      headers: { 'x-cancellation-credential': booking.cancellationCredential },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().booking.status).toBe('cancelled');
    expect(cancelled.json().booking.cancellationCredential).toBe(booking.cancellationCredential);

    const repeatedCancel = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/bookings/${booking.bookingId}/cancellation`,
      headers: { 'x-cancellation-credential': booking.cancellationCredential },
    });
    expect(repeatedCancel.statusCode).toBe(409);
    expect(repeatedCancel.json().error.code).toBe('BOOKING_ALREADY_CANCELLED');

    const reopenedHold = await createHold(harness.app, organizer.organizerId, slot.slotId);
    expect(reopenedHold.statusCode).toBe(201);

    const outbox = await readOutbox(harness.databasePath);
    expect(outbox).toHaveLength(4);
    expect(outbox.map((row) => row.recipient_email).sort()).toEqual([
      'client@example.com', 'client@example.com',
      'organizer@example.com', 'organizer@example.com',
    ]);
    expect(new Set(outbox.map((row) => row.event_id))).toEqual(new Set([
      `booking:${booking.bookingId}:confirmed`,
      `booking:${booking.bookingId}:cancelled`,
    ]));
  });

  it('allows only one active hold and expires it at the 60-second boundary', async () => {
    const harness = trackHarness();
    const organizer = await createOrganizer(harness.app);
    const slot = await createSlot(harness.app, organizer);

    const claims = await Promise.all([
      createHold(harness.app, organizer.organizerId, slot.slotId),
      createHold(harness.app, organizer.organizerId, slot.slotId),
    ]);
    expect(claims.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    const held = claims.find((response) => response.statusCode === 201)!.json<HoldResult>().hold;

    harness.advance(60_000);
    const replacement = await createHold(harness.app, organizer.organizerId, slot.slotId);
    expect(replacement.statusCode).toBe(201);

    const lateConfirmation = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/holds/${held.holdId}/confirmation`,
      payload: { holdCredential: held.holdCredential, clientEmail: 'client@example.com' },
    });
    expect(lateConfirmation.statusCode).toBe(410);
    expect(lateConfirmation.json().error.code).toBe('HOLD_EXPIRED');

    const nearStartSlot = await createSlot(harness.app, organizer, harness.now() + 30_000);
    const nearStartHold = (await createHold(harness.app, organizer.organizerId, nearStartSlot.slotId)).json<HoldResult>().hold;
    harness.advance(30_000);
    const afterMeetingStart = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/holds/${nearStartHold.holdId}/confirmation`,
      payload: { holdCredential: nearStartHold.holdCredential, clientEmail: 'client@example.com' },
    });
    expect(afterMeetingStart.statusCode).toBe(409);
    expect(afterMeetingStart.json().error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('enforces the cancellation cutoff at the exact 24-hour boundary', async () => {
    const harness = trackHarness();
    const organizer = await createOrganizer(harness.app);
    const slotStart = INITIAL_TIME + 48 * HOUR;
    const slot = await createSlot(harness.app, organizer, slotStart);
    const hold = (await createHold(harness.app, organizer.organizerId, slot.slotId)).json<HoldResult>().hold;
    const confirmation = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/holds/${hold.holdId}/confirmation`,
      payload: { holdCredential: hold.holdCredential, clientEmail: 'client@example.com' },
    });
    const booking = confirmation.json<BookingResult>().booking;

    harness.setNow(slotStart - 24 * HOUR + 1);
    const justInsideWindow = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/bookings/${booking.bookingId}/cancellation`,
      headers: { 'x-cancellation-credential': booking.cancellationCredential },
    });
    expect(justInsideWindow.statusCode).toBe(422);
    expect(justInsideWindow.json().error.code).toBe('CANCELLATION_WINDOW_CLOSED');

    harness.setNow(slotStart - 24 * HOUR);
    const atBoundary = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/bookings/${booking.bookingId}/cancellation`,
      headers: { 'x-cancellation-credential': booking.cancellationCredential },
    });
    expect(atBoundary.statusCode).toBe(200);
  });

  it('applies the same cancellation cutoff to organizer cancellation', async () => {
    const harness = trackHarness();
    const organizer = await createOrganizer(harness.app);
    const slotStart = INITIAL_TIME + 48 * HOUR;
    const slot = await createSlot(harness.app, organizer, slotStart);
    const hold = (await createHold(harness.app, organizer.organizerId, slot.slotId)).json<HoldResult>().hold;
    const confirmation = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/holds/${hold.holdId}/confirmation`,
      payload: { holdCredential: hold.holdCredential, clientEmail: 'client@example.com' },
    });
    const booking = confirmation.json<BookingResult>().booking;

    const url = `/v1/organizers/${organizer.organizerId}/bookings/${booking.bookingId}/cancellation`;
    const headers = { authorization: `Bearer ${organizer.managementKey}` };
    harness.setNow(slotStart - 24 * HOUR + 1);
    const tooLate = await harness.app.inject({ method: 'POST', url, headers });
    expect(tooLate.statusCode).toBe(422);
    expect(tooLate.json().error.code).toBe('CANCELLATION_WINDOW_CLOSED');

    harness.setNow(slotStart - 24 * HOUR);
    const atBoundary = await harness.app.inject({ method: 'POST', url, headers });
    expect(atBoundary.statusCode).toBe(200);
    expect(atBoundary.json().booking.status).toBe('cancelled');
    expect(atBoundary.json().booking).not.toHaveProperty('cancellationCredential');
  });

  it('keeps a committed booking when SMTP fails and retries with backoff', async () => {
    const attempted: OutgoingEmail[] = [];
    const failingSender: MailSender = {
      async send(message) {
        attempted.push(message);
        throw new Error('SMTP unavailable');
      },
    };
    const harness = trackHarness();
    const organizer = await createOrganizer(harness.app);
    const slot = await createSlot(harness.app, organizer);
    const hold = (await createHold(harness.app, organizer.organizerId, slot.slotId)).json<HoldResult>().hold;

    const confirmation = await harness.app.inject({
      method: 'POST',
      url: `/v1/public/holds/${hold.holdId}/confirmation`,
      payload: { holdCredential: hold.holdCredential, clientEmail: 'client@example.com' },
    });
    expect(confirmation.statusCode).toBe(201);
    const booking = confirmation.json<BookingResult>().booking;

    const database = new Database(harness.databasePath);
    try {
      const failingWorker = new OutboxWorker(database, failingSender, harness.now);
      await failingWorker.drain();
      expect(attempted).toHaveLength(2);

      const outbox = await readOutbox(harness.databasePath);
      expect(outbox).toHaveLength(2);
      expect(outbox.every((row) => row.status === 'pending' && row.attempts === 1)).toBe(true);
      expect(outbox.every((row) => row.available_at === harness.now() + 60_000)).toBe(true);

      const organizerBookings = await harness.app.inject({
        method: 'GET',
        url: `/v1/organizers/${organizer.organizerId}/bookings`,
        headers: { authorization: `Bearer ${organizer.managementKey}` },
      });
      expect(organizerBookings.statusCode).toBe(200);
      expect(organizerBookings.json().bookings[0].status).toBe('confirmed');

      const cancellation = await harness.app.inject({
        method: 'POST',
        url: `/v1/public/bookings/${booking.bookingId}/cancellation`,
        headers: { 'x-cancellation-credential': booking.cancellationCredential },
      });
      expect(cancellation.statusCode).toBe(200);

      harness.advance(60_000);
      const delivered: OutgoingEmail[] = [];
      const successfulWorker = new OutboxWorker(database, {
        async send(message) { delivered.push(message); },
      }, harness.now);
      await successfulWorker.drain();
      expect(delivered).toHaveLength(4);
      for (const recipient of new Set(delivered.map((message) => message.to))) {
        expect(delivered.filter((message) => message.to === recipient).map((message) => message.subject)).toEqual([
          'Meeting booking confirmed',
          'Meeting booking cancelled',
        ]);
      }
      expect(delivered.every((message) => message.text.includes('Europe/Paris'))).toBe(true);
      const sentOutbox = await readOutbox(harness.databasePath);
      expect(sentOutbox).toHaveLength(4);
      expect(sentOutbox.filter((row) => row.event_id.endsWith(':confirmed')).every((row) => row.status === 'sent' && row.attempts === 2)).toBe(true);
      expect(sentOutbox.filter((row) => row.event_id.endsWith(':cancelled')).every((row) => row.status === 'sent' && row.attempts === 1)).toBe(true);
    } finally {
      database.close();
    }
  });

  it('keeps post-upgrade cancellation notifications behind pending legacy confirmations', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'meeting-booking-migration-test-'));
    const databasePath = join(directory, 'legacy.sqlite');
    const bookingId = 'legacy-booking';
    const recipient = 'client@example.com';
    const legacyDatabase = new Database(databasePath);
    legacyDatabase.exec(`
      CREATE TABLE notification_outbox (
        notification_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        text_body TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'sent')) DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        available_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        sent_at INTEGER,
        last_error TEXT,
        UNIQUE (event_id, recipient_email)
      );
      PRAGMA user_version = 1;
    `);
    legacyDatabase.prepare(`
      INSERT INTO notification_outbox (
        notification_id, event_id, recipient_email, subject, text_body, status, attempts, available_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)
    `).run(
      'z-confirmation',
      `booking:${bookingId}:confirmed`,
      recipient,
      'Meeting booking confirmed',
      'The meeting has been confirmed.',
      INITIAL_TIME,
      INITIAL_TIME,
    );
    legacyDatabase.close();

    const database = openDatabase(databasePath);
    try {
      database.prepare(`
        INSERT INTO notification_outbox (
          notification_id, event_id, aggregate_id, sequence_number, recipient_email, subject, text_body,
          status, attempts, available_at, created_at
        ) VALUES (?, ?, ?, 2, ?, ?, ?, 'pending', 0, ?, ?)
      `).run(
        'a-cancellation',
        `booking:${bookingId}:cancelled`,
        bookingId,
        recipient,
        'Meeting booking cancelled',
        'The meeting has been cancelled.',
        INITIAL_TIME,
        INITIAL_TIME,
      );

      const delivered: OutgoingEmail[] = [];
      const worker = new OutboxWorker(database, {
        async send(message) { delivered.push(message); },
      }, () => INITIAL_TIME);
      await worker.drain();

      expect(delivered.map((message) => message.subject)).toEqual([
        'Meeting booking confirmed',
        'Meeting booking cancelled',
      ]);
      expect(database.pragma('user_version', { simple: true })).toBe(2);
    } finally {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('returns the contract resource-specific not-found errors', async () => {
    const harness = trackHarness();
    const missingOrganizer = 'missing-organizer';
    const availability = await harness.app.inject({ method: 'GET', url: `/v1/public/organizers/${missingOrganizer}/availability` });
    expect(availability.statusCode).toBe(404);
    expect(availability.json().error.code).toBe('ORGANIZER_NOT_FOUND');

    const missingOrganizerHold = await createHold(harness.app, missingOrganizer, 'missing-slot');
    expect(missingOrganizerHold.statusCode).toBe(404);
    expect(missingOrganizerHold.json().error.code).toBe('ORGANIZER_NOT_FOUND');

    const organizer = await createOrganizer(harness.app);
    const missingSlotHold = await createHold(harness.app, organizer.organizerId, 'missing-slot');
    expect(missingSlotHold.statusCode).toBe(404);
    expect(missingSlotHold.json().error.code).toBe('SLOT_NOT_FOUND');

    const missingHold = await harness.app.inject({
      method: 'POST',
      url: '/v1/public/holds/missing-hold/confirmation',
      payload: { holdCredential: 'credential', clientEmail: 'client@example.com' },
    });
    expect(missingHold.statusCode).toBe(404);
    expect(missingHold.json().error.code).toBe('HOLD_NOT_FOUND');

    const missingBooking = await harness.app.inject({
      method: 'POST',
      url: '/v1/public/bookings/missing-booking/cancellation',
      headers: { 'x-cancellation-credential': 'credential' },
    });
    expect(missingBooking.statusCode).toBe(404);
    expect(missingBooking.json().error.code).toBe('BOOKING_NOT_FOUND');

    const missingSlot = await harness.app.inject({
      method: 'DELETE',
      url: `/v1/organizers/${organizer.organizerId}/slots/missing-slot`,
      headers: { authorization: `Bearer ${organizer.managementKey}` },
    });
    expect(missingSlot.statusCode).toBe(404);
    expect(missingSlot.json().error.code).toBe('SLOT_NOT_FOUND');

    const missingOrganizerBooking = await harness.app.inject({
      method: 'POST',
      url: `/v1/organizers/${organizer.organizerId}/bookings/missing-booking/cancellation`,
      headers: { authorization: `Bearer ${organizer.managementKey}` },
    });
    expect(missingOrganizerBooking.statusCode).toBe(404);
    expect(missingOrganizerBooking.json().error.code).toBe('BOOKING_NOT_FOUND');
  });
});
