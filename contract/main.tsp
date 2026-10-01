import "@typespec/http";

using TypeSpec.Http;

@service(#{ title: "Meeting Slot Booking API" })
@server("https://api.example.com", "Draft API server")
@doc("Draft API contract. Organizer operations require authentication, but the mechanism is TBD; no authentication scheme is defined yet.")
namespace MeetingBooking;

scalar UtcInstant extends utcDateTime;
@format("email")
@minLength(3)
@maxLength(254)
scalar ClientEmail extends string;

model ApiError<Code extends string> {
  /** Stable machine-readable error identifier; the allowed value depends on the response status. */
  code: Code;
  /** Human-readable explanation safe to show to the caller. */
  message: string;
  /** Optional field-level validation details. */
  details?: ErrorDetail[];
  /** Request correlation identifier when available. */
  requestId?: string;
}

model ErrorDetail { field: string; message: string; }

model InvalidRequest { @statusCode statusCode: 400; error: ApiError<"INVALID_REQUEST">; }
model Unauthenticated { @statusCode statusCode: 401; error: ApiError<"UNAUTHENTICATED" | "HOLD_CREDENTIAL_INVALID" | "CANCELLATION_CREDENTIAL_INVALID">; }
model OrganizerAccessDenied { @statusCode statusCode: 403; error: ApiError<"ORGANIZER_ACCESS_DENIED">; }
model ResourceNotFound { @statusCode statusCode: 404; error: ApiError<"ORGANIZER_NOT_FOUND" | "SLOT_NOT_FOUND" | "HOLD_NOT_FOUND" | "BOOKING_NOT_FOUND">; }
model StateConflict { @statusCode statusCode: 409; error: ApiError<"SLOT_UNAVAILABLE" | "SLOT_ALREADY_BOOKED" | "BOOKING_ALREADY_CANCELLED">; }
model HoldExpired { @statusCode statusCode: 410; error: ApiError<"HOLD_EXPIRED">; }
model CancellationTooLate { @statusCode statusCode: 422; error: ApiError<"CANCELLATION_WINDOW_CLOSED">; }
model InternalError { @statusCode statusCode: 500; error: ApiError<"INTERNAL_ERROR">; }

model HealthResponse { status: "ok"; }

model Slot {
  slotId: string;
  /** Start instant, encoded as an RFC 3339 date-time in UTC. */
  startAt: UtcInstant;
  /** End instant, encoded as an RFC 3339 date-time in UTC. */
  endAt: UtcInstant;
  /** Organizer's IANA time-zone identifier, for example Europe/Paris. */
  timeZone: string;
}

model AvailabilityResponse { organizerId: string; slots: Slot[]; }
model CreateHoldRequest { slotId: string; }

model Hold {
  holdId: string;
  /** Secret credential required to confirm this hold; disclose only to the holding client. */
  holdCredential: string;
  slot: Slot;
  /** Hold expiry instant; the hold lasts 60 seconds after creation. */
  expiresAt: UtcInstant;
}

model HoldResponse {
  @statusCode statusCode: 201;
  hold: Hold;
}

model ConfirmBookingRequest {
  /** Secret returned when the hold was created, proving possession of the hold. */
  holdCredential: string;
  clientEmail: ClientEmail;
}

model BookingDetails {
  bookingId: string;
  organizerId: string;
  slot: Slot;
  clientEmail: ClientEmail;
  /** Secret needed by the unauthenticated client cancellation operation. */
  cancellationCredential: string;
  status: "confirmed" | "cancelled";
  createdAt: UtcInstant;
}

model BookingResponse { @statusCode statusCode: 201; booking: BookingDetails; }
model CancellationResponse { @statusCode statusCode: 200; booking: BookingDetails; }

/** Organizer view of a booking; never exposes the client's cancellation credential. */
model OrganizerBookingDetails {
  bookingId: string;
  organizerId: string;
  slot: Slot;
  clientEmail: ClientEmail;
  status: "confirmed" | "cancelled";
  createdAt: UtcInstant;
}

model CreateSlotRequest {
  /** Start instant in UTC. */
  startAt: UtcInstant;
  /** End instant in UTC; must be after startAt. */
  endAt: UtcInstant;
  /** IANA time-zone identifier used to display the slot. */
  timeZone: string;
}

model SlotResponse { @statusCode statusCode: 201; slot: Slot; }
/** Organizer listing includes non-available slot states to distinguish reservations and holds. */
model OrganizerSlot extends Slot {
  state: "available" | "held" | "booked";
  holdExpiresAt?: UtcInstant;
}
model SlotsResponse { slots: OrganizerSlot[]; }
model OrganizerBookingsResponse { bookings: OrganizerBookingDetails[]; }
model OrganizerCancellationResponse { @statusCode statusCode: 200; booking: OrganizerBookingDetails; }

model ClientCancellationRequest {
  /** A booking can be cancelled only when at least 24 hours remain before its start. */
  @header("X-Cancellation-Credential") cancellationCredential: string;
}

@route("/health") @get
op health(): HealthResponse | InternalError;

@route("/v1/public/organizers/{organizerId}/availability") @get
@doc("Returns only currently available slots. Held, booked, and withdrawn slots are excluded. When a hold expires, its slot becomes eligible for availability again.")
op getPublicAvailability(@path organizerId: string): AvailabilityResponse | ResourceNotFound | InternalError;

@route("/v1/public/organizers/{organizerId}/holds") @post
op createHold(@path organizerId: string, @body request: CreateHoldRequest): HoldResponse | InvalidRequest | ResourceNotFound | StateConflict | InternalError;

@route("/v1/public/holds/{holdId}/confirmation") @post
op confirmHold(@path holdId: string, @body request: ConfirmBookingRequest): BookingResponse | InvalidRequest | Unauthenticated | ResourceNotFound | StateConflict | HoldExpired | InternalError;

@route("/v1/public/bookings/{bookingId}/cancellation") @post
op cancelBookingAsClient(@path bookingId: string, ...ClientCancellationRequest): CancellationResponse | Unauthenticated | ResourceNotFound | StateConflict | CancellationTooLate | InternalError;

@doc("Organizer-only operation. Requires organizer authentication and authorization; the mechanism is TBD and intentionally absent from this draft contract.")
@route("/v1/organizers/{organizerId}/slots") @post
op createOrganizerSlot(@path organizerId: string, @body request: CreateSlotRequest): SlotResponse | InvalidRequest | Unauthenticated | OrganizerAccessDenied | ResourceNotFound | StateConflict | InternalError;

@doc("Organizer-only operation. Requires organizer authentication and authorization; the mechanism is TBD and intentionally absent from this draft contract.")
@route("/v1/organizers/{organizerId}/slots") @get
op listOrganizerSlots(@path organizerId: string): SlotsResponse | Unauthenticated | OrganizerAccessDenied | ResourceNotFound | InternalError;

@doc("Organizer-only operation. Removes an unbooked slot. Requires organizer authentication and authorization; the mechanism is TBD and intentionally absent from this draft contract.")
@route("/v1/organizers/{organizerId}/slots/{slotId}") @delete
op removeOrganizerSlot(@path organizerId: string, @path slotId: string): void | Unauthenticated | OrganizerAccessDenied | ResourceNotFound | StateConflict | InternalError;

@doc("Organizer-only operation. Requires organizer authentication and authorization; the mechanism is TBD and intentionally absent from this draft contract.")
@route("/v1/organizers/{organizerId}/bookings") @get
op listOrganizerBookings(@path organizerId: string): OrganizerBookingsResponse | Unauthenticated | OrganizerAccessDenied | ResourceNotFound | InternalError;

@doc("Organizer-only operation. Cancels a confirmed booking, subject to the 24-hour cutoff. Requires organizer authentication and authorization; the mechanism is TBD and intentionally absent from this draft contract.")
@route("/v1/organizers/{organizerId}/bookings/{bookingId}/cancellation") @post
op cancelBookingAsOrganizer(@path organizerId: string, @path bookingId: string): OrganizerCancellationResponse | Unauthenticated | OrganizerAccessDenied | ResourceNotFound | StateConflict | CancellationTooLate | InternalError;
