import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ApiError, invalidRequest } from './errors.js';

export interface SlotDetails {
  slotId: string;
  startAt: string;
  endAt: string;
  timeZone: string;
}

export interface BookingDetails {
  bookingId: string;
  organizerId: string;
  slot: SlotDetails;
  clientEmail: string;
  cancellationCredential: string;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface OrganizerBookingDetails extends Omit<BookingDetails, 'cancellationCredential'> {}

export interface HoldDetails {
  holdId: string;
  holdCredential: string;
  slot: SlotDetails;
  expiresAt: string;
}

export interface OrganizerSlotDetails extends SlotDetails {
  state: 'available' | 'held' | 'booked';
  holdExpiresAt?: string;
}

interface OrganizerRow {
  organizer_id: string;
  organizer_email: string;
  management_key_hash: string;
  created_at: number;
}

interface SlotRow {
  slot_id: string;
  organizer_id: string;
  start_at: number;
  end_at: number;
  time_zone: string;
  removed_at: number | null;
  created_at: number;
}

interface HoldRow {
  hold_id: string;
  slot_id: string;
  hold_credential_hash: string;
  expires_at: number;
  status: 'active' | 'expired' | 'confirmed' | 'released';
  created_at: number;
}

interface BookingRow {
  booking_id: string;
  slot_id: string;
  client_email: string;
  cancellation_credential_hash: string;
  status: 'confirmed' | 'cancelled';
  created_at: number;
  cancelled_at: number | null;
  organizer_id: string;
  organizer_email: string;
  start_at: number;
  end_at: number;
  time_zone: string;
}

type Result<T> = { value: T } | { error: ApiError };

const HOLD_DURATION_MS = 60_000;
const CANCELLATION_CUTOFF_MS = 24 * 60 * 60 * 1_000;

export class BookingService {
  constructor(
    private readonly database: Database.Database,
    private readonly now: () => number = Date.now,
  ) {}

  createOrganizer(organizerEmail: string): { organizerId: string; managementKey: string } {
    const organizerId = randomUUID();
    const managementKey = randomBytes(32).toString('base64url');
    const now = this.now();
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO organizers (organizer_id, organizer_email, management_key_hash, created_at)
        VALUES (?, ?, ?, ?)
      `).run(organizerId, organizerEmail, digest(managementKey), now);
      this.database.prepare(`
        INSERT INTO notification_outbox (
          notification_id, event_id, aggregate_id, sequence_number, recipient_email, subject, text_body,
          contains_credentials, status, attempts, available_at, created_at
        ) VALUES (?, ?, ?, 0, ?, ?, ?, 1, 'pending', 0, ?, ?)
      `).run(randomUUID(), `organizer:${organizerId}:created`, organizerId, organizerEmail,
        'Your meeting booking organizer access',
        `Your organizer workspace is ready.\n\nOrganizer ID: ${organizerId}\nManagement key: ${managementKey}\n\nKeep this email to access your organizer workspace later.`, now, now);
    }).immediate();

    return { organizerId, managementKey };
  }

  authorizeOrganizer(organizerId: string, credential: string | undefined): void {
    if (this.resolveOrganizerId(credential) !== organizerId) {
      throw new ApiError(403, 'ORGANIZER_ACCESS_DENIED', 'This management key does not grant access to the requested organizer.');
    }
  }

  resolveOrganizerId(credential: string | undefined): string {
    if (!credential) {
      throw new ApiError(401, 'ORGANIZER_KEY_INVALID', 'A valid organizer management key is required.');
    }

    const organizer = this.database.prepare(`
      SELECT organizer_id FROM organizers WHERE management_key_hash = ?
    `).get(digest(credential)) as { organizer_id: string } | undefined;

    if (!organizer) {
      throw new ApiError(401, 'ORGANIZER_KEY_INVALID', 'The organizer management key is invalid.');
    }
    return organizer.organizer_id;
  }

  getPublicAvailability(organizerId: string): SlotDetails[] {
    this.requireOrganizer(organizerId);
    const now = this.now();
    const rows = this.database.prepare(`
      SELECT s.* FROM slots s
      WHERE s.organizer_id = ?
        AND s.removed_at IS NULL
        AND s.start_at > ?
        AND NOT EXISTS (
          SELECT 1 FROM holds h
          WHERE h.slot_id = s.slot_id AND h.status = 'active' AND h.expires_at > ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.slot_id = s.slot_id AND b.status = 'confirmed'
        )
      ORDER BY s.start_at, s.slot_id
    `).all(organizerId, now, now) as SlotRow[];
    return rows.map(toSlotDetails);
  }

  createHold(organizerId: string, slotId: string): HoldDetails {
    const now = this.now();
    const holdId = randomUUID();
    const holdCredential = randomBytes(32).toString('base64url');
    const result = this.database.transaction((): Result<HoldDetails> => {
      if (!this.organizerExists(organizerId)) {
        return { error: new ApiError(404, 'ORGANIZER_NOT_FOUND', 'The organizer was not found.') };
      }

      const slot = this.database.prepare(`
        SELECT * FROM slots WHERE slot_id = ? AND organizer_id = ?
      `).get(slotId, organizerId) as SlotRow | undefined;
      if (!slot || slot.removed_at !== null) {
        return { error: new ApiError(404, 'SLOT_NOT_FOUND', 'The slot was not found.') };
      }
      if (slot.start_at <= now) {
        return { error: new ApiError(409, 'SLOT_UNAVAILABLE', 'The slot is no longer available.') };
      }

      this.database.prepare(`
        UPDATE holds SET status = 'expired'
        WHERE slot_id = ? AND status = 'active' AND expires_at <= ?
      `).run(slotId, now);

      const isBooked = this.database.prepare(`
        SELECT 1 FROM bookings WHERE slot_id = ? AND status = 'confirmed'
      `).get(slotId);
      if (isBooked) {
        return { error: new ApiError(409, 'SLOT_ALREADY_BOOKED', 'The slot has already been booked.') };
      }

      const activeHold = this.database.prepare(`
        SELECT 1 FROM holds WHERE slot_id = ? AND status = 'active'
      `).get(slotId);
      if (activeHold) {
        return { error: new ApiError(409, 'SLOT_UNAVAILABLE', 'The slot is currently held by another client.') };
      }

      const expiresAt = now + HOLD_DURATION_MS;
      this.database.prepare(`
        INSERT INTO holds (hold_id, slot_id, hold_credential_hash, expires_at, status, created_at)
        VALUES (?, ?, ?, ?, 'active', ?)
      `).run(holdId, slotId, digest(holdCredential), expiresAt, now);

      return {
        value: {
          holdId,
          holdCredential,
          slot: toSlotDetails(slot),
          expiresAt: new Date(expiresAt).toISOString(),
        },
      };
    }).immediate();

    if ('error' in result) throw result.error;
    return result.value;
  }

  confirmHold(holdId: string, holdCredential: string, clientEmail: string): BookingDetails {
    const now = this.now();
    const bookingId = randomUUID();
    const cancellationCredential = randomBytes(32).toString('base64url');
    const result = this.database.transaction((): Result<BookingDetails> => {
      const hold = this.database.prepare(`SELECT * FROM holds WHERE hold_id = ?`).get(holdId) as HoldRow | undefined;
      if (!hold) {
        return { error: new ApiError(404, 'HOLD_NOT_FOUND', 'The hold was not found.') };
      }
      if (!credentialMatches(hold.hold_credential_hash, holdCredential)) {
        return { error: new ApiError(401, 'HOLD_CREDENTIAL_INVALID', 'The hold credential is invalid.') };
      }
      if (hold.status === 'expired' || (hold.status === 'active' && hold.expires_at <= now)) {
        this.database.prepare(`UPDATE holds SET status = 'expired' WHERE hold_id = ?`).run(holdId);
        return { error: new ApiError(410, 'HOLD_EXPIRED', 'The hold has expired.') };
      }
      if (hold.status === 'released') {
        return { error: new ApiError(409, 'SLOT_UNAVAILABLE', 'The slot is no longer available.') };
      }
      if (hold.status !== 'active') {
        return { error: new ApiError(409, 'SLOT_ALREADY_BOOKED', 'The hold can no longer be confirmed.') };
      }

      const slot = this.database.prepare(`
        SELECT s.*, o.organizer_email
        FROM slots s JOIN organizers o ON o.organizer_id = s.organizer_id
        WHERE s.slot_id = ?
      `).get(hold.slot_id) as (SlotRow & { organizer_email: string }) | undefined;
      if (!slot || slot.removed_at !== null) {
        this.database.prepare(`UPDATE holds SET status = 'released' WHERE hold_id = ?`).run(holdId);
        return { error: new ApiError(409, 'SLOT_UNAVAILABLE', 'The slot is no longer available.') };
      }
      if (slot.start_at <= now) {
        this.database.prepare(`UPDATE holds SET status = 'released' WHERE hold_id = ?`).run(holdId);
        return { error: new ApiError(409, 'SLOT_UNAVAILABLE', 'The meeting has already started.') };
      }

      const isBooked = this.database.prepare(`
        SELECT 1 FROM bookings WHERE slot_id = ? AND status = 'confirmed'
      `).get(hold.slot_id);
      if (isBooked) {
        return { error: new ApiError(409, 'SLOT_ALREADY_BOOKED', 'The slot has already been booked.') };
      }

      this.database.prepare(`UPDATE holds SET status = 'confirmed' WHERE hold_id = ?`).run(holdId);
      this.database.prepare(`
        INSERT INTO bookings (
          booking_id, slot_id, client_email, cancellation_credential_hash, status, created_at
        ) VALUES (?, ?, ?, ?, 'confirmed', ?)
      `).run(bookingId, hold.slot_id, clientEmail, digest(cancellationCredential), now);

      const details: BookingDetails = {
        bookingId,
        organizerId: slot.organizer_id,
        slot: toSlotDetails(slot),
        clientEmail,
        cancellationCredential,
        status: 'confirmed',
        createdAt: new Date(now).toISOString(),
      };
      enqueueBookingEmail(this.database, bookingId, `booking:${bookingId}:confirmed`, slot.organizer_email, clientEmail, slot, 'confirmed', now, cancellationCredential);
      return { value: details };
    }).immediate();

    if ('error' in result) throw result.error;
    return result.value;
  }

  cancelAsClient(bookingId: string, cancellationCredential: string | undefined): BookingDetails {
    const now = this.now();
    const result = this.database.transaction((): Result<BookingDetails> => {
      const booking = this.getBookingRow(bookingId);
      if (!booking) {
        return { error: new ApiError(404, 'BOOKING_NOT_FOUND', 'The booking was not found.') };
      }
      if (!cancellationCredential || !credentialMatches(booking.cancellation_credential_hash, cancellationCredential)) {
        return { error: new ApiError(401, 'CANCELLATION_CREDENTIAL_INVALID', 'The cancellation credential is invalid.') };
      }
      if (booking.status === 'cancelled') {
        return { error: new ApiError(409, 'BOOKING_ALREADY_CANCELLED', 'The booking has already been cancelled.') };
      }
      const cutoffError = cancellationCutoffError(booking.start_at, now);
      if (cutoffError) return { error: cutoffError };

      this.database.prepare(`
        UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE booking_id = ?
      `).run(now, bookingId);
      enqueueBookingEmail(this.database, bookingId, `booking:${bookingId}:cancelled`, booking.organizer_email, booking.client_email, booking, 'cancelled', now);

      return { value: toClientBookingDetails(booking, cancellationCredential, 'cancelled') };
    }).immediate();

    if ('error' in result) throw result.error;
    return result.value;
  }

  cancelWithCredential(cancellationCredential: string | undefined): BookingDetails {
    const now = this.now();
    const result = this.database.transaction((): Result<BookingDetails> => {
      if (!cancellationCredential) {
        return { error: new ApiError(401, 'CANCELLATION_CREDENTIAL_INVALID', 'The cancellation credential is invalid.') };
      }
      const booking = this.database.prepare(`
        SELECT b.*, s.organizer_id, s.start_at, s.end_at, s.time_zone, o.organizer_email
        FROM bookings b
        JOIN slots s ON s.slot_id = b.slot_id
        JOIN organizers o ON o.organizer_id = s.organizer_id
        WHERE b.cancellation_credential_hash = ?
      `).get(digest(cancellationCredential)) as BookingRow | undefined;
      if (!booking || !credentialMatches(booking.cancellation_credential_hash, cancellationCredential)) {
        return { error: new ApiError(401, 'CANCELLATION_CREDENTIAL_INVALID', 'The cancellation credential is invalid.') };
      }
      if (booking.status === 'cancelled') {
        return { error: new ApiError(409, 'BOOKING_ALREADY_CANCELLED', 'The booking has already been cancelled.') };
      }
      const cutoffError = cancellationCutoffError(booking.start_at, now);
      if (cutoffError) return { error: cutoffError };

      this.database.prepare(`
        UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE booking_id = ?
      `).run(now, booking.booking_id);
      enqueueBookingEmail(this.database, booking.booking_id, `booking:${booking.booking_id}:cancelled`, booking.organizer_email, booking.client_email, booking, 'cancelled', now);
      return { value: toClientBookingDetails(booking, cancellationCredential, 'cancelled') };
    }).immediate();

    if ('error' in result) throw result.error;
    return result.value;
  }

  createSlot(organizerId: string, request: { startAt: string; durationMinutes: number; timeZone: string }): SlotDetails {
    const now = this.now();
    const startAt = parseUtcInstant(request.startAt, 'startAt');
    if (!Number.isSafeInteger(request.durationMinutes) || request.durationMinutes < 1) {
      throw invalidRequest('durationMinutes must be a positive whole number of minutes.', 'durationMinutes');
    }
    const endAt = startAt + request.durationMinutes * 60_000;
    if (!Number.isFinite(endAt) || endAt <= startAt || Math.abs(endAt) > 8.64e15 || !Number.isFinite(new Date(endAt).getTime())) {
      throw invalidRequest('durationMinutes produces an invalid end instant.', 'durationMinutes');
    }
    if (startAt <= now) throw invalidRequest('startAt must be in the future.', 'startAt');
    if (!isIanaTimeZone(request.timeZone)) throw invalidRequest('timeZone must be a valid IANA time-zone identifier.', 'timeZone');

    const slotId = randomUUID();
    const result = this.database.transaction((): Result<SlotDetails> => {
      if (!this.organizerExists(organizerId)) {
        return { error: new ApiError(404, 'ORGANIZER_NOT_FOUND', 'The organizer was not found.') };
      }
      const overlap = this.database.prepare(`
        SELECT 1 FROM slots
        WHERE organizer_id = ? AND removed_at IS NULL AND start_at < ? AND end_at > ?
        LIMIT 1
      `).get(organizerId, endAt, startAt);
      if (overlap) {
        return { error: new ApiError(409, 'SLOT_OVERLAP', 'The slot overlaps another active slot for this organizer.') };
      }

      this.database.prepare(`
        INSERT INTO slots (slot_id, organizer_id, start_at, end_at, time_zone, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(slotId, organizerId, startAt, endAt, request.timeZone, now);
      return { value: { slotId, startAt: new Date(startAt).toISOString(), endAt: new Date(endAt).toISOString(), timeZone: request.timeZone } };
    }).immediate();

    if ('error' in result) throw result.error;
    return result.value;
  }

  listOrganizerSlots(organizerId: string): OrganizerSlotDetails[] {
    const now = this.now();
    const rows = this.database.prepare(`
      SELECT s.*,
        (SELECT h.expires_at FROM holds h WHERE h.slot_id = s.slot_id AND h.status = 'active' AND h.expires_at > ? LIMIT 1) AS hold_expires_at,
        EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id = s.slot_id AND b.status = 'confirmed') AS is_booked
      FROM slots s
      WHERE s.organizer_id = ? AND s.removed_at IS NULL AND s.start_at > ?
      ORDER BY s.start_at, s.slot_id
    `).all(now, organizerId, now) as Array<SlotRow & { hold_expires_at: number | null; is_booked: number }>;

    return rows.map((row) => {
      const holdExpiresAt = row.hold_expires_at === null ? undefined : new Date(row.hold_expires_at).toISOString();
      return {
        ...toSlotDetails(row),
        state: row.is_booked ? 'booked' : holdExpiresAt ? 'held' : 'available',
        ...(holdExpiresAt ? { holdExpiresAt } : {}),
      };
    });
  }

  removeSlot(organizerId: string, slotId: string): void {
    const now = this.now();
    const result = this.database.transaction((): Result<void> => {
      const slot = this.database.prepare(`
        SELECT * FROM slots WHERE slot_id = ? AND organizer_id = ? AND removed_at IS NULL
      `).get(slotId, organizerId) as SlotRow | undefined;
      if (!slot) return { error: new ApiError(404, 'SLOT_NOT_FOUND', 'The slot was not found.') };

      const isBooked = this.database.prepare(`
        SELECT 1 FROM bookings WHERE slot_id = ? AND status = 'confirmed'
      `).get(slotId);
      if (isBooked) return { error: new ApiError(409, 'SLOT_ALREADY_BOOKED', 'A booked slot cannot be removed.') };

      this.database.prepare(`UPDATE slots SET removed_at = ? WHERE slot_id = ?`).run(now, slotId);
      this.database.prepare(`
        UPDATE holds SET status = 'released' WHERE slot_id = ? AND status = 'active'
      `).run(slotId);
      return { value: undefined };
    }).immediate();

    if ('error' in result) throw result.error;
  }

  listOrganizerBookings(organizerId: string): OrganizerBookingDetails[] {
    const rows = this.database.prepare(`
      SELECT b.*, s.organizer_id, s.start_at, s.end_at, s.time_zone
      FROM bookings b JOIN slots s ON s.slot_id = b.slot_id
      WHERE s.organizer_id = ?
      ORDER BY b.created_at, b.booking_id
    `).all(organizerId) as Array<BookingRow & { cancellation_credential_hash: string }>;

    return rows.map((row) => toOrganizerBookingDetails(row));
  }

  cancelAsOrganizer(organizerId: string, bookingId: string): OrganizerBookingDetails {
    const now = this.now();
    const result = this.database.transaction((): Result<OrganizerBookingDetails> => {
      const booking = this.getBookingRow(bookingId);
      if (!booking || booking.organizer_id !== organizerId) {
        return { error: new ApiError(404, 'BOOKING_NOT_FOUND', 'The booking was not found.') };
      }
      if (booking.status === 'cancelled') {
        return { error: new ApiError(409, 'BOOKING_ALREADY_CANCELLED', 'The booking has already been cancelled.') };
      }
      const cutoffError = cancellationCutoffError(booking.start_at, now);
      if (cutoffError) return { error: cutoffError };

      this.database.prepare(`
        UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE booking_id = ?
      `).run(now, bookingId);
      enqueueBookingEmail(this.database, bookingId, `booking:${bookingId}:cancelled`, booking.organizer_email, booking.client_email, booking, 'cancelled', now);
      return { value: toOrganizerBookingDetails({ ...booking, status: 'cancelled' }) };
    }).immediate();

    if ('error' in result) throw result.error;
    return result.value;
  }

  private requireOrganizer(organizerId: string): OrganizerRow {
    const organizer = this.database.prepare(`SELECT * FROM organizers WHERE organizer_id = ?`).get(organizerId) as OrganizerRow | undefined;
    if (!organizer) throw new ApiError(404, 'ORGANIZER_NOT_FOUND', 'The organizer was not found.');
    return organizer;
  }

  private organizerExists(organizerId: string): boolean {
    return Boolean(this.database.prepare(`SELECT 1 FROM organizers WHERE organizer_id = ?`).get(organizerId));
  }

  private getBookingRow(bookingId: string): BookingRow | undefined {
    return this.database.prepare(`
      SELECT b.*, s.organizer_id, s.start_at, s.end_at, s.time_zone, o.organizer_email
      FROM bookings b
      JOIN slots s ON s.slot_id = b.slot_id
      JOIN organizers o ON o.organizer_id = s.organizer_id
      WHERE b.booking_id = ?
    `).get(bookingId) as BookingRow | undefined;
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function credentialMatches(expectedDigest: string, credential: string): boolean {
  const expected = Buffer.from(expectedDigest, 'hex');
  const actual = Buffer.from(digest(credential), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function toSlotDetails(row: Pick<SlotRow, 'slot_id' | 'start_at' | 'end_at' | 'time_zone'>): SlotDetails {
  return {
    slotId: row.slot_id,
    startAt: new Date(row.start_at).toISOString(),
    endAt: new Date(row.end_at).toISOString(),
    timeZone: row.time_zone,
  };
}

function toClientBookingDetails(row: BookingRow, cancellationCredential: string, status = row.status): BookingDetails {
  return {
    bookingId: row.booking_id,
    organizerId: row.organizer_id,
    slot: toSlotDetails(row),
    clientEmail: row.client_email,
    cancellationCredential,
    status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function toOrganizerBookingDetails(row: BookingRow & { status: 'confirmed' | 'cancelled' }): OrganizerBookingDetails {
  return {
    bookingId: row.booking_id,
    organizerId: row.organizer_id,
    slot: toSlotDetails(row),
    clientEmail: row.client_email,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function parseUtcInstant(value: string, field: string): number {
  if (!/(?:Z|\+00:00)$/.test(value)) {
    throw invalidRequest(`${field} must be an RFC 3339 UTC instant.`, field);
  }
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) throw invalidRequest(`${field} must be a valid date-time.`, field);
  return instant;
}

function isIanaTimeZone(timeZone: string): boolean {
  if (/^[+-]\d{2}(?::?\d{2})?$/.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function cancellationCutoffError(startAt: number, now: number): ApiError | undefined {
  if (startAt - now < CANCELLATION_CUTOFF_MS) {
    return new ApiError(422, 'CANCELLATION_WINDOW_CLOSED', 'A booking can only be cancelled at least 24 hours before it starts.');
  }
  return undefined;
}

function enqueueBookingEmail(
  database: Database.Database,
  bookingId: string,
  eventId: string,
  organizerEmail: string,
  clientEmail: string,
  slot: Pick<SlotRow, 'start_at' | 'end_at' | 'time_zone'>,
  status: 'confirmed' | 'cancelled',
  now: number,
  cancellationCredential?: string,
): void {
  const eventText = status === 'confirmed' ? 'confirmed' : 'cancelled';
  const subject = status === 'confirmed' ? 'Meeting booking confirmed' : 'Meeting booking cancelled';
  const start = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: slot.time_zone,
  }).format(new Date(slot.start_at));
  const end = new Intl.DateTimeFormat('en-US', {
    timeStyle: 'short',
    timeZone: slot.time_zone,
  }).format(new Date(slot.end_at));
  const durationMinutes = Math.round((slot.end_at - slot.start_at) / 60_000);
  const commonText = `The meeting has been ${eventText}.\n\nDate and time: ${start}–${end} (${slot.time_zone})\nDuration: ${durationMinutes} minutes.`;
  const sequenceNumber = status === 'confirmed' ? 1 : 2;
  const sharedAddress = organizerEmail.toLowerCase() === clientEmail.toLowerCase();
  const calendarAttachment = createCalendarAttachment(bookingId, slot, status, now, organizerEmail);
  const recipients = sharedAddress
    ? [{ email: clientEmail, text: `${commonText}${cancellationCredential ? `\n\nBooking ID: ${bookingId}\nCancellation credential: ${cancellationCredential}` : ''}`, containsCredentials: Boolean(cancellationCredential) }]
    : [
      { email: organizerEmail, text: commonText, containsCredentials: false },
      { email: clientEmail, text: `${commonText}${cancellationCredential ? `\n\nBooking ID: ${bookingId}\nCancellation credential: ${cancellationCredential}` : ''}`, containsCredentials: Boolean(cancellationCredential) },
    ];

  const insert = database.prepare(`
    INSERT OR IGNORE INTO notification_outbox (
      notification_id, event_id, aggregate_id, sequence_number, recipient_email, subject, text_body,
      contains_credentials, attachments_json, status, attempts, available_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
  `);
  for (const recipient of recipients) {
    insert.run(randomUUID(), eventId, bookingId, sequenceNumber, recipient.email, subject, recipient.text, Number(recipient.containsCredentials), JSON.stringify([calendarAttachment]), now, now);
  }
}

function createCalendarAttachment(
  bookingId: string,
  slot: Pick<SlotRow, 'start_at' | 'end_at'>,
  status: 'confirmed' | 'cancelled',
  timestamp: number,
  organizerEmail: string,
): { filename: string; content: string; contentType: string } {
  const stamp = toCalendarUtc(timestamp);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meeting Booking//Calendar 1.0//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${status === 'confirmed' ? 'PUBLISH' : 'CANCEL'}`,
    'BEGIN:VEVENT',
    `UID:booking-${bookingId}@meeting-booking.invalid`,
    `DTSTAMP:${stamp}`,
    `SEQUENCE:${status === 'confirmed' ? 0 : 1}`,
    `DTSTART:${toCalendarUtc(slot.start_at)}`,
    `DTEND:${toCalendarUtc(slot.end_at)}`,
    `ORGANIZER:${toMailtoUri(organizerEmail)}`,
    'SUMMARY:Meeting',
    ...(status === 'cancelled' ? [
      'STATUS:CANCELLED',
    ] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return {
    filename: `meeting-${bookingId}.ics`,
    content: `${lines.map(foldCalendarLine).join('\r\n')}\r\n`,
    contentType: `text/calendar; method=${status === 'confirmed' ? 'PUBLISH' : 'CANCEL'}; charset=utf-8`,
  };
}

function toCalendarUtc(timestamp: number): string {
  return new Date(timestamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function toMailtoUri(email: string): string {
  const separator = email.lastIndexOf('@');
  const localPart = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  return `mailto:${encodeUriComponent(localPart)}@${encodeUriComponent(domain)}`;
}

function encodeUriComponent(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function foldCalendarLine(line: string): string {
  const segments: string[] = [];
  let segment = '';
  let segmentBytes = 0;

  for (const character of line) {
    const characterBytes = new TextEncoder().encode(character).length;
    if (segmentBytes + characterBytes > 75) {
      segments.push(segment);
      segment = ` ${character}`;
      segmentBytes = 1 + characterBytes;
    } else {
      segment += character;
      segmentBytes += characterBytes;
    }
  }

  segments.push(segment);
  return segments.join('\r\n');
}
