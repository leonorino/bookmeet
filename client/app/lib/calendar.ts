export interface BookingCalendarDetails {
  bookingId: string;
  createdAt: string;
  slot: {
    startAt: string;
    endAt: string;
  };
}

const PRODUCT_ID = "-//Meeting Booking//Calendar 1.0//EN";

export function buildBookingCalendar(details: BookingCalendarDetails): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:booking-${details.bookingId}@meeting-booking.invalid`,
    `DTSTAMP:${toCalendarDateTime(details.createdAt)}`,
    "SEQUENCE:0",
    `DTSTART:${toCalendarDateTime(details.slot.startAt)}`,
    `DTEND:${toCalendarDateTime(details.slot.endAt)}`,
    "SUMMARY:Meeting",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(foldCalendarLine).join("\r\n")}\r\n`;
}

export function downloadBookingCalendar(details: BookingCalendarDetails): void {
  const calendar = new Blob([buildBookingCalendar(details)], {
    type: "text/calendar; charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(calendar);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `meeting-${details.bookingId}.ics`;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

function toCalendarDateTime(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldCalendarLine(line: string): string {
  const segments: string[] = [];
  let segment = "";
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
  return segments.join("\r\n");
}
