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

function localeDigits(locale: string): Map<string, string> {
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
  return new Map(Array.from({ length: 10 }, (_, digit) => [formatter.format(digit), String(digit)]));
}

function normalizeDigits(value: string, locale: string): string {
  const digits = localeDigits(locale);
  return [...value].map((character) => digits.get(character) ?? character).join("");
}

function dateOrder(locale: string): string[] {
  return new Intl.DateTimeFormat(locale, { calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(2026, 10, 22))
    .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
    .map((part) => part.type);
}

export function getDateInputHint(locale = Intl.DateTimeFormat().resolvedOptions().locale): string {
  const sample = new Intl.DateTimeFormat(locale, { calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(2026, 10, 22));
  const datePart = (part: Intl.DateTimeFormatPart) => part.type === "year" || part.type === "month" || part.type === "day";
  const firstDatePart = sample.findIndex(datePart);
  let lastDatePart = firstDatePart;
  for (let index = firstDatePart; index < sample.length; index += 1) {
    if (datePart(sample[index]!)) lastDatePart = index;
  }
  return sample.slice(firstDatePart, lastDatePart + 1).map((part) => {
    if (part.type === "year") return "YYYY";
    if (part.type === "month") return "MM";
    if (part.type === "day") return "DD";
    return part.value;
  }).join("");
}

export function parseLocalizedDate(value: string, locale = Intl.DateTimeFormat().resolvedOptions().locale): string {
  const fields = value.trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (fields.length !== 3) throw new LocalDateTimeError("invalid", `Enter the date as ${getDateInputHint(locale)}.`);
  const normalized = fields.map((field) => normalizeDigits(field, locale));
  const values: Record<string, number> = {};
  dateOrder(locale).forEach((part, index) => { values[part] = Number(normalized[index]); });
  const year = values.year!;
  const month = values.month!;
  const day = values.day!;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (!Number.isInteger(year) || year < 1000 || !Number.isInteger(month) || !Number.isInteger(day)
    || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new LocalDateTimeError("invalid", `Enter a valid date as ${getDateInputHint(locale)}.`);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getTimeInputHint(locale = Intl.DateTimeFormat().resolvedOptions().locale): string {
  const formatter = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  const hourCycle = formatter.resolvedOptions().hourCycle;
  const twelveHour = hourCycle === "h11" || hourCycle === "h12";
  const sampleParts = formatter.formatToParts(new Date(2026, 0, 1, 9, 5));
  const dayPeriodAt = (hour: number) => formatter.formatToParts(new Date(2026, 0, 1, hour))
    .find((part) => part.type === "dayPeriod")?.value;
  const dayPeriods = twelveHour ? `${dayPeriodAt(9) ?? "AM"}/${dayPeriodAt(21) ?? "PM"}` : "";

  return sampleParts.map((part) => {
    if (part.type === "hour") return twelveHour ? "h" : "HH";
    if (part.type === "minute") return "mm";
    if (part.type === "dayPeriod") return dayPeriods;
    return part.value;
  }).join("");
}

export function parseLocalizedTime(value: string, locale = Intl.DateTimeFormat().resolvedOptions().locale): string {
  const formatter = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  const cycle = formatter.resolvedOptions().hourCycle;
  const is12Hour = cycle === "h11" || cycle === "h12";
  const normalized = normalizeDigits(value.trim(), locale);
  const numberParts = normalized.match(/[0-9]+/g) ?? [];
  const timePartOrder = formatter.formatToParts(new Date(2026, 0, 1, 9, 5))
    .filter((part) => part.type === "hour" || part.type === "minute")
    .map((part) => part.type);
  const invalidTime = () => new LocalDateTimeError("invalid", `Enter the time as ${getTimeInputHint(locale)}.`);
  if (numberParts.length !== 2 || numberParts[0]!.length > 2 || numberParts[1]!.length !== 2 || timePartOrder.length !== 2) {
    throw invalidTime();
  }
  const timeParts = new Map(timePartOrder.map((part, index) => [part, Number(numberParts[index])]));
  let hour = timeParts.get("hour")!;
  const minute = timeParts.get("minute")!;
  if (!Number.isInteger(minute) || minute > 59) throw new LocalDateTimeError("invalid", "Enter a valid time.");
  const textRemainder = normalized.replace(/[0-9]+/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase(locale);
  if (is12Hour) {
    const periods = [0, 12].map((hourValue) => formatter.formatToParts(new Date(2026, 0, 1, hourValue)).find((part) => part.type === "dayPeriod")?.value ?? "");
    const normalizePeriod = (period: string) => period.replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase(locale);
    const periodIndex = periods.map(normalizePeriod).indexOf(textRemainder);
    const validHour = cycle === "h11" ? hour >= 0 && hour <= 11 : hour >= 1 && hour <= 12;
    if (!validHour || periodIndex < 0) throw invalidTime();
    hour = (cycle === "h12" ? hour % 12 : hour) + (periodIndex === 1 ? 12 : 0);
  } else if (hour > 23 || textRemainder) {
    throw invalidTime();
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

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
