# Meeting Slot Booking

## 1. Task

Build a web service that lets an organizer offer individual meeting times and lets a client book one without coordinating directly by email, phone, or chat. The organizer creates availability inside the service; external calendar synchronization is not part of the current plan.

The organizer marks one-off meeting slots as available and shares a reusable, organizer-specific booking link with a client. The client opens the link, chooses a slot, enters an email address, and confirms. The service reserves the selected slot and emails the date, time, and duration to the client and organizer.

**Desired outcome:** both sides know that a specific meeting time is booked, without a back-and-forth exchange.

## 2. Interested sides

- **Organizer:** Offers individual meeting slots, shares a booking link, and needs to know which times have been taken and which client booked them.
- **Client:** Chooses and books a meeting slot without creating an account. They need clear confirmation and meeting details.
- **Service operator:** Runs the service and is responsible for reliable booking, protecting contact information, and delivering notifications.

The client is identified for a booking by the email address they provide; a client account is outside the core flow. Each organizer has a reusable booking link that shows that organizer's availability.

## 3. Problem that service solves

Scheduling a meeting through direct communication often requires multiple messages to compare calendars, propose times, and settle on one. This takes time and can lead to delays or misunderstandings about whether a time is final.

The service gives the organizer a single place to offer meeting times and gives clients a self-service way to choose one. It should prevent two clients from booking the same offered slot and make the confirmed time visible to both sides.

## 4. Scenarios

### Organizer creates a booking page

1. The organizer creates a workspace without registering an account.
2. The service returns an organizer-specific management key once and emails the organizer ID and key to the organizer's notification address. The organizer keeps the key private; it is not part of the public booking link. There is no key recovery endpoint.
3. The organizer uses the key to manage slots and bookings for that workspace, including viewing client email addresses. If the local key copy is lost, the organizer can use the creation email; if both the local key and that email copy are lost, there is no recovery endpoint and the organizer must create a new workspace. If the key is exposed, the old workspace is compromised because the initial service has no key revocation flow.
4. The organizer shares the public booking link, which identifies the workspace but does not grant management access.

### Main flow: client books an offered meeting slot

1. The organizer marks one or more individual meeting slots as available.
2. The organizer shares the booking link with a client.
3. The client opens the link and sees the available slots with their dates, times, and time zone.
4. The client selects a slot. If it is still available, the service immediately places a temporary hold on it, hides it from other clients, and returns a private credential for confirming that hold.
5. The client enters an email address and confirms the booking within one minute by presenting the hold credential.
6. The service converts the hold into a confirmed booking.
7. The service records email notifications for the client and organizer. The client email includes the booking ID and cancellation credential for later access. Delivery happens after the booking is committed and can be retried if it fails. If the organizer and client use the same address, the client email includes the cancellation details.

### Slot was taken meanwhile

Two clients may open the same link at once. The first request to successfully claim a slot receives a one-minute hold. Other clients are told that the slot is unavailable and can choose another offered slot. If the client confirms before the hold expires, it becomes a booking; otherwise the hold expires and the slot becomes available again. The service must not confirm two bookings for one slot.

### Client changes their mind before confirming

The client can select a different available slot before final confirmation. No booking is made until they confirm. The service's behavior for releasing or retaining the previous hold when the client changes selection is an open implementation question.

### Organizer withdraws availability

The organizer may remove an unbooked slot. It no longer appears as available to clients. Both organizer and client can cancel a confirmed booking, provided the cancellation happens at least 24 hours before the meeting. Cancellation triggers email notifications to both. Rescheduling is not defined yet.

### Confirmation email cannot be delivered

The booking result should make clear whether the slot was successfully reserved. Email notifications contain the date, time, and duration; the client confirmation also includes the booking ID and cancellation credential. Booking state is committed independently of email delivery, and a failed email attempt is retried without creating a second logical notification. Email delivery failure must not silently create uncertainty about whether the reservation succeeded.

## 5. Borders

### In scope

- Organizer marks individual meeting slots available within the service and shares a reusable, organizer-specific booking link.
- Organizer creates an organizer workspace without creating an account. The service returns a public organizer ID and a separate private management key that controls that organizer's slots and bookings. See [ADR-0008](../adr/0008-organizer-management-keys.md) for the key's lifecycle and API handling.
- The management key is shown when the organizer is created and emailed with the organizer ID. There is no password, login session, key recovery endpoint, key rotation, or key transfer in the initial service; an organizer who loses both the local key and creation email copy must create a new workspace, and an exposed key compromises its workspace.
- Client views offered slots, chooses one, provides an email address, and confirms without registering.
- Selecting a slot immediately places a temporary hold for up to one minute. Confirmation converts the hold to a booking; expiry releases it.
- Each confirmed slot can have only one booking.
- A client can cancel using only the cancellation credential from the confirmation; booking ID is not required. Cancellation is allowed only at least 24 hours before the meeting.
- Client and organizer receive booking confirmation and cancellation email notifications. The client confirmation includes the booking ID and cancellation credential; if both roles use one address, that email includes the cancellation details. The organizer creation email contains the organizer ID and management key. Temporary hold credentials and SMTP configuration credentials are never emailed. The only meeting details included for now are date, time, and duration.
- Availability and displayed times include an explicit time zone. Slot start and end are stored as UTC instants alongside the organizer's IANA time-zone identifier.
- The client interface supports English and Russian across the home, organizer, booking, and cancellation screens. On first visit it selects the first supported browser language preference, falling back to English; a manual choice is saved on the device and takes precedence on later visits. If persistent device storage is unavailable, keep the choice for the current browser session. The selected language updates visible copy, accessibility labels, document language and metadata, and date/time formatting (`en-US` or `ru-RU`). Dates and times continue to use each meeting's IANA time zone; language selection does not change slot instants or time zones. Emails remain in English.
- Bookings are for single meetings; recurring meetings are out of scope.

### Out of scope for the initial service

- Client accounts or client profiles.
- Open-ended negotiation, messaging, or proposing times not offered by the organizer.
- Payments, deposits, or paid appointments.
- Group meetings with multiple client seats per slot.
- External calendar integration or automatic matching of participants' calendars.
- Video calls or conferencing infrastructure.
- Rescheduling workflows for confirmed bookings.
- Arranging the meeting itself, including deciding its format or providing a meeting link. Booking notifications include only the date, time, and duration.

## 6. Open decisions

- What happens to an active hold when a client selects a different slot or leaves the booking page.
- How to resolve ambiguous and nonexistent local times around daylight-saving transitions when organizers create slots.
- Which email provider and retry limits/backoff policy to use, including how to avoid duplicate delivery after an ambiguous provider response.
