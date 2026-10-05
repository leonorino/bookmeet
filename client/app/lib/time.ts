import type { Slot } from "./api";

export interface FormattedSlot {
  date: string;
  timeRange: string;
  timeZone: string;
  durationMinutes: number;
}

export class LocalDateTimeError extends Error {
  readonly kind: "invalid" | "nonexistent" | "ambiguous";

  constructor(kind: LocalDateTimeError["kind"], message: string) {
    super(message);
    this.name = "LocalDateTimeError";
    this.kind = kind;
  }
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function localPartsAt(instant: number, timeZone: string): LocalParts {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }

  const values = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function utcFromParts(parts: LocalParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, 0, 0);
  return date.getTime();
}

function sameParts(left: LocalParts, right: LocalParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute;
}

export function resolveLocalDateTime(date: string, time: string, timeZone: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) {
    throw new LocalDateTimeError("invalid", "Enter a valid date and time.");
  }

  const desired: LocalParts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
  };
  const naiveUtc = utcFromParts(desired);
  const normalized = new Date(naiveUtc);
  if (
    normalized.getUTCFullYear() !== desired.year
    || normalized.getUTCMonth() + 1 !== desired.month
    || normalized.getUTCDate() !== desired.day
    || desired.hour > 23
    || desired.minute > 59
  ) {
    throw new LocalDateTimeError("invalid", "Enter a valid date and time.");
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date(naiveUtc));
  } catch {
    throw new LocalDateTimeError("invalid", "Choose a valid IANA time zone.");
  }

  const offsets = new Set<number>();
  const searchWindow = 36 * 60 * 60 * 1000;
  const sampleInterval = 3 * 60 * 60 * 1000;
  for (let delta = -searchWindow; delta <= searchWindow; delta += sampleInterval) {
    const sample = naiveUtc + delta;
    const parts = localPartsAt(sample, timeZone);
    offsets.add(utcFromParts(parts) - sample);
  }

  const candidates = new Set<number>();
  for (const offset of offsets) {
    const candidate = naiveUtc - offset;
    if (sameParts(localPartsAt(candidate, timeZone), desired)) candidates.add(candidate);
  }

  if (candidates.size === 0) {
    throw new LocalDateTimeError(
      "nonexistent",
      "That local time does not exist because the clocks change. Choose another time.",
    );
  }
  if (candidates.size > 1) {
    throw new LocalDateTimeError(
      "ambiguous",
      "That local time occurs twice because the clocks change. Choose another time.",
    );
  }

  return new Date([...candidates][0]!).toISOString();
}

export function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function getTimeZones(): string[] {
  const intlWithZoneList = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  const values = intlWithZoneList.supportedValuesOf?.("timeZone") ?? [];
  return [...new Set(["UTC", getBrowserTimeZone(), ...values])].sort((a, b) => a.localeCompare(b));
}

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

export function formatSlot(slot: Slot): FormattedSlot {
  const start = new Date(slot.startAt);
  const end = new Date(slot.endAt);
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: slot.timeZone,
  });
  const startDate = dateFormatter.format(start);
  const endDate = dateFormatter.format(end);
  const date = startDate === endDate ? startDate : `${startDate} – ${endDate}`;

  return {
    date,
    timeRange: `${timeFormatter(slot.timeZone).format(start)} – ${timeFormatter(slot.timeZone).format(end)}`,
    timeZone: slot.timeZone,
    durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
  };
}
