import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ApiError, api, type OrganizerBooking, type OrganizerSlot } from "../lib/api";
import { forgetManagementKey, getManagementKey, saveManagementKey } from "../lib/management-key";
import { formatSlot, getBrowserTimeZone, getDateInputHint, getTimeInputHint, getTimeZones, parseLocalizedDate, parseLocalizedTime, resolveLocalDateTime } from "../lib/time";

function dateInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function getWeekDays(anchor: string, locale: string): string[] {
  const weekInfo = typeof Intl.Locale === "undefined"
    ? undefined
    : (new Intl.Locale(locale) as Intl.Locale & { weekInfo?: { firstDay: number } }).weekInfo;
  const firstDay = weekInfo?.firstDay ?? 1;
  const weekday = new Date(`${anchor}T12:00:00Z`).getUTCDay();
  const offset = (weekday - firstDay + 7) % 7;
  const start = addDays(anchor, -offset);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function dayInZone(instant: string, timeZone: string): string { return dateInZone(new Date(instant), timeZone); }

function timePartsInZone(instant: string, timeZone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { hour: Number(values.hour), minute: Number(values.minute) };
}

function calendarTimeFromMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function slotSegmentForDay(slot: Pick<OrganizerSlot, "startAt" | "endAt">, day: string, timeZone: string): { top: number; height: number; startsHere: boolean } | null {
  const startDay = dayInZone(slot.startAt, timeZone);
  const endDay = dayInZone(slot.endAt, timeZone);
  if (day < startDay || day > endDay) return null;

  const startsHere = day === startDay;
  const endsHere = day === endDay;
  const startParts = timePartsInZone(slot.startAt, timeZone);
  const endParts = timePartsInZone(slot.endAt, timeZone);
  const top = startsHere ? startParts.hour * 60 + startParts.minute : 0;
  const bottom = endsHere ? endParts.hour * 60 + endParts.minute : 1440;
  if (endsHere && !startsHere && bottom === 0) return null;

  let height = bottom - top;
  if (height <= 0) {
    const elapsedMinutes = (new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime()) / 60_000;
    height = Math.min(1440 - top, Math.max(15, elapsedMinutes));
  }
  return { top, height: Math.min(height, 1440 - top), startsHere };
}

function calendarMinute(element: HTMLElement, clientY: number): number {
  const rect = element.getBoundingClientRect();
  const raw = Math.floor((clientY - rect.top) / 15) * 15;
  return Math.max(0, Math.min(1425, raw));
}

function managementKeyFromNavigationState(state: unknown): string {
  if (typeof state !== "object" || state === null || !("managementKey" in state)) return "";
  return typeof state.managementKey === "string" ? state.managementKey : "";
}

export default function Manage() {
  const { organizerId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationKey = managementKeyFromNavigationState(location.state);
  const [keyOwner, setKeyOwner] = useState(organizerId);
  const [storedKey, setStoredKey] = useState(() => navigationKey || getManagementKey(organizerId) || "");
  const key = keyOwner === organizerId ? storedKey : "";
  const [keyInput, setKeyInput] = useState("");
  const [slots, setSlots] = useState<OrganizerSlot[]>([]);
  const [bookings, setBookings] = useState<OrganizerBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [keyStorageWarning, setKeyStorageWarning] = useState("");
  const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [timeZone, setTimeZone] = useState(() => getBrowserTimeZone());
  const [weekAnchor, setWeekAnchor] = useState(() => dateInZone(new Date(), getBrowserTimeZone()));
  const [dragStart, setDragStart] = useState<{ day: string; minute: number } | null>(null);
  const [selection, setSelection] = useState<{ day: string; minute: number; duration: number } | null>(null);
  const loadSequence = useRef(0);
  const timeZones = getTimeZones();
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const weekDays = getWeekDays(weekAnchor, locale);
  const selectionSlot = useMemo(() => {
    if (!selection) return null;
    try {
      const startAt = resolveLocalDateTime(selection.day, calendarTimeFromMinute(selection.minute), timeZone);
      const endAt = new Date(new Date(startAt).getTime() + selection.duration * 60_000).toISOString();
      return { startAt, endAt };
    } catch {
      return null;
    }
  }, [selection, timeZone]);

  useEffect(() => {
    loadSequence.current += 1;
    setKeyOwner(organizerId);
    setKeyStorageWarning("");
    setStoredKey(getManagementKey(organizerId) ?? "");
    setKeyInput("");
    setSlots([]);
    setBookings([]);
    setError("");
    setMessage("");
  }, [organizerId]);

  useEffect(() => {
    const routeKey = managementKeyFromNavigationState(location.state);
    if (!routeKey) return;

    setStoredKey(routeKey);
    try {
      saveManagementKey(organizerId, routeKey);
    } catch {
      setKeyStorageWarning("This browser could not save the key. It will only work until you leave this page, so keep it somewhere safe.");
    }
    navigate(location.pathname, { replace: true, state: null });
  }, [location.key, location.pathname, location.state, navigate, organizerId]);

  const load = useCallback(async (managementKey: string) => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const [slotResult, bookingResult] = await Promise.all([
        api.getOrganizerSlots(organizerId, managementKey),
        api.getOrganizerBookings(organizerId, managementKey),
      ]);
      if (sequence !== loadSequence.current) return;
      setSlots(slotResult.slots);
      setBookings(bookingResult.bookings);
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setError(cause instanceof ApiError ? cause.message : "Could not load this workspace.");
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [organizerId]);

  useEffect(() => {
    if (key) void load(key);
  }, [key, load]);

  function submitKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entered = keyInput.trim();
    if (!entered) return;
    try {
      saveManagementKey(organizerId, entered);
      setKeyStorageWarning("");
    } catch {
      setKeyStorageWarning("This browser could not save the key. It will only work until you leave this page, so keep it somewhere safe.");
    }
    setKeyOwner(organizerId);
    setStoredKey(entered);
    setKeyInput("");
  }

  function forgetKey() {
    forgetManagementKey(organizerId);
    navigate(location.pathname, { replace: true, state: null });
    setStoredKey("");
    setKeyStorageWarning("");
    setError("");
    setSlots([]);
    setBookings([]);
    setMessage("Management key removed from this device.");
  }

  async function createSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!key) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const normalizedDate = parseLocalizedDate(startDate, locale);
      const normalizedTime = parseLocalizedTime(startTime, locale);
      const duration = Number(durationMinutes);
      if (!Number.isSafeInteger(duration) || duration < 1) {
        setError("Duration must be a positive whole number of minutes.");
        return;
      }
      const startAt = resolveLocalDateTime(normalizedDate, normalizedTime, timeZone);
      if (new Date(startAt).getTime() <= Date.now()) {
        setError("Meeting times must start in the future. Choose a later date and time.");
        return;
      }
      await api.createOrganizerSlot(organizerId, key, { startAt, durationMinutes: duration, timeZone });
      setMessage("Meeting time added.");
      setSelection(null);
      setStartDate("");
      setStartTime("");
      setDurationMinutes("30");
      await load(key);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Could not create the meeting time.");
    } finally {
      setSaving(false);
    }
  }

  function selectCalendarTime(day: string, minute: number, duration: number) {
    const hour = Math.floor(minute / 60);
    const minutePart = minute % 60;
    setStartDate(new Intl.DateTimeFormat(locale, { calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)));
    setStartTime(new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, hour, minutePart))));
    setDurationMinutes(String(duration));
    setSelection({ day, minute, duration });
  }

  function calendarPointerDown(event: PointerEvent<HTMLDivElement>, day: string) {
    const minute = calendarMinute(event.currentTarget, event.clientY);
    setDragStart({ day, minute });
    if (event.pointerType === "touch") return;
    selectCalendarTime(day, minute, 15);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function calendarPointerMove(event: PointerEvent<HTMLDivElement>, day: string) {
    if (event.pointerType === "touch") return;
    if (!dragStart || dragStart.day !== day) return;
    const end = calendarMinute(event.currentTarget, event.clientY);
    const start = Math.min(dragStart.minute, end);
    const duration = Math.max(15, end < dragStart.minute ? dragStart.minute - end + 15 : end - dragStart.minute);
    selectCalendarTime(day, start, duration);
  }

  function calendarPointerUp(event: PointerEvent<HTMLDivElement>, day: string) {
    if (event.pointerType === "touch" && dragStart?.day === day) {
      const end = calendarMinute(event.currentTarget, event.clientY);
      if (Math.abs(end - dragStart.minute) < 15) selectCalendarTime(day, dragStart.minute, 15);
    }
    setDragStart(null);
  }

  function finishCalendarDrag() { setDragStart(null); }

  function updateDuration(value: string) {
    setDurationMinutes(value);
    const duration = Number(value);
    if (selection && Number.isSafeInteger(duration) && duration > 0) {
      setSelection({ ...selection, duration });
    } else if (selection) {
      setSelection(null);
    }
  }

  async function removeSlot(slotId: string) {
    if (!key) return;
    setError("");
    setMessage("");
    try {
      await api.removeOrganizerSlot(organizerId, key, slotId);
      setMessage("Meeting time removed.");
      await load(key);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not remove this meeting time.");
    }
  }

  async function cancelBooking(bookingId: string) {
    if (!key) return;
    setError("");
    setMessage("");
    try {
      await api.cancelOrganizerBooking(organizerId, key, bookingId);
      setMessage("Booking cancelled.");
      await load(key);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not cancel this booking.");
    }
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <Link className="wordmark" to="/">Meeting Booking</Link>
        <nav className="main-nav" aria-label="Main navigation"><Link to={`/book/${encodeURIComponent(organizerId)}`}>Public booking page</Link><Link to="/cancel">Cancel a booking</Link></nav>
      </header>
      <section className="page-heading">
        <p className="eyebrow">Organizer workspace</p>
        <h1>Manage your availability</h1>
        <p>Organizer ID: <code className="mono">{organizerId}</code></p>
      </section>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {keyStorageWarning && <p className="notice" role="status">{keyStorageWarning}</p>}
      {message && <p className="notice notice-success" role="status">{message}</p>}

      {!key ? (
        <section className="panel" aria-labelledby="key-heading">
          <h2 id="key-heading">Enter your management key</h2>
          <p>Use the key created with this booking page. It will be saved on this device.</p>
          <form className="form-stack" onSubmit={submitKey}>
            <label className="field"><span>Management key</span><input type="password" autoComplete="current-password" required value={keyInput} onChange={(event) => setKeyInput(event.target.value)} /></label>
            <button className="button button-primary" type="submit">Open workspace</button>
          </form>
        </section>
      ) : (
        <>
          <div className="form-actions"><button className="button button-quiet" type="button" onClick={forgetKey}>Forget this device</button>{loading && <span role="status">Loading workspace…</span>}</div>
          <div className="content-grid">
            <section className="panel calendar-panel" aria-labelledby="add-slot-heading">
              <h2 id="add-slot-heading">Add a meeting time</h2>
              <div className="calendar-controls">
                <div className="calendar-navigation"><button className="button button-secondary" type="button" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}>Previous</button><button className="button button-secondary" type="button" onClick={() => setWeekAnchor(dateInZone(new Date(), timeZone))}>Today</button><button className="button button-secondary" type="button" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}>Next</button><span className="calendar-week-range" aria-live="polite">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${weekDays[0]}T12:00:00Z`))} – {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${weekDays[6]}T12:00:00Z`))}</span></div>
                <label className="field"><span>Time zone</span><select required value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>{timeZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label>
              </div>
              <p className="field-help">Drag within a day to choose a start time and duration. On touch screens, tap a time to choose a 15-minute start, then adjust the duration below.</p>
              <div className="calendar-scroll"><div className="week-calendar">
                <div className="calendar-corner" />{weekDays.map((day) => <div className="calendar-day-heading" key={day}><strong>{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</strong><span>{new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</span></div>)}
                <div className="calendar-hours">{Array.from({ length: 24 }, (_, index) => <span key={index}>{new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, index)))}</span>)}</div>
                {weekDays.map((day) => <div key={day} className="calendar-day" role="group" onPointerDown={(event) => calendarPointerDown(event, day)} onPointerMove={(event) => calendarPointerMove(event, day)} onPointerUp={(event) => calendarPointerUp(event, day)} onPointerCancel={finishCalendarDrag} aria-label={`Availability for ${new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}`}>
                  {slots.map((slot) => {
                    const segment = slotSegmentForDay(slot, day, timeZone);
                    if (!segment) return null;
                    const slotLabel = segment.startsHere
                      ? new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(slot.startAt))
                      : "Continues";
                    return <div className={`calendar-slot status-${slot.state}`} key={slot.slotId} style={{ top: `${segment.top}px`, height: `${segment.height}px` }} title={`${formatSlot(slot).timeRange} · ${slot.state}`}>{slotLabel} · {slot.state}</div>;
                  })}
                  {selectionSlot && (() => {
                    const segment = slotSegmentForDay(selectionSlot, day, timeZone);
                    return segment ? <div className="calendar-selection" key={`selection-${day}`} style={{ top: `${segment.top}px`, height: `${segment.height}px` }} /> : null;
                  })()}
                  {!selectionSlot && selection?.day === day && <div className="calendar-selection" style={{ top: `${selection.minute}px`, height: `${Math.min(selection.duration, 1440 - selection.minute)}px` }} />}
                </div>)}
              </div></div>
              {selection && <p className="calendar-preview" role="status">Selected: {new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${selection.day}T12:00:00Z`))}, {new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, Math.floor(selection.minute / 60), selection.minute % 60)))} for {selection.duration} minutes ({timeZone}).</p>}
              <form className="form-stack" onSubmit={createSlot}>
                <details className="manual-entry"><summary>Enter date and time manually</summary><div className="form-stack manual-entry-fields">
                  <label className="field compact-field"><span>Start date</span><input type="text" inputMode="text" autoComplete="off" placeholder={getDateInputHint()} aria-describedby="start-date-help" value={startDate} onChange={(event) => { setStartDate(event.target.value); setSelection(null); }} /><small className="field-help" id="start-date-help">Use your local date order (Gregorian year): {getDateInputHint()}.</small></label>
                  <label className="field compact-field"><span>Start time</span><input type="text" inputMode="text" autoComplete="off" placeholder={getTimeInputHint()} aria-describedby="start-time-help" value={startTime} onChange={(event) => { setStartTime(event.target.value); setSelection(null); }} /><small className="field-help" id="start-time-help">Use your local time format: {getTimeInputHint()}.</small></label>
                </div></details>
                <label className="field compact-field calendar-duration"><span>Duration (minutes)</span><input type="number" min="1" step="1" required value={durationMinutes} onChange={(event) => updateDuration(event.target.value)} /></label>
                <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Adding…" : "Add meeting time"}</button>
              </form>
            </section>
            <section className="panel" aria-labelledby="slots-heading">
              <h2 id="slots-heading">Meeting times</h2>
              {slots.length === 0 ? <p className="empty-state">No meeting times yet.</p> : <ul>{slots.map((slot) => {
                const formatted = formatSlot(slot);
                const statusLabel = slot.state === "available" ? "Available" : slot.state === "held" ? "Temporarily held" : "Booked";
                const holdExpires = slot.holdExpiresAt
                  ? ` · hold until ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: slot.timeZone, timeZoneName: "short" }).format(new Date(slot.holdExpiresAt))}`
                  : "";
                return <li className="slot-row" key={slot.slotId}><div><strong>{formatted.date}</strong><p className="mono">{formatted.timeRange}</p><p>{formatted.timeZone} · {formatted.durationMinutes} minutes{holdExpires}</p><span className={`status status-${slot.state}`}>{statusLabel}</span></div>{slot.state === "available" && <button className="button button-secondary" type="button" onClick={() => void removeSlot(slot.slotId)}>Remove</button>}</li>;
              })}</ul>}
            </section>
            <section className="panel" aria-labelledby="bookings-heading">
              <h2 id="bookings-heading">Bookings</h2>
              {bookings.length === 0 ? <p className="empty-state">No bookings yet.</p> : <ul>{bookings.map((booking) => {
                const formatted = formatSlot(booking.slot);
                const statusLabel = booking.status === "confirmed" ? "Confirmed" : "Cancelled";
                return <li className="slot-row" key={booking.bookingId}><div><strong>{formatted.date}</strong><p className="mono">{formatted.timeRange}</p><p>{formatted.timeZone} · {booking.clientEmail}</p><span className={`status status-${booking.status}`}>{statusLabel}</span></div>{booking.status === "confirmed" && <button className="button button-secondary" type="button" onClick={() => void cancelBooking(booking.bookingId)}>Cancel booking</button>}</li>;
              })}</ul>}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
