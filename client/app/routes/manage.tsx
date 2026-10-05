import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ApiError, api, type OrganizerBooking, type OrganizerSlot } from "../lib/api";
import { forgetManagementKey, getManagementKey, saveManagementKey } from "../lib/management-key";
import { formatSlot, getBrowserTimeZone, getTimeZones, resolveLocalDateTime } from "../lib/time";

export default function Manage() {
  const { organizerId = "" } = useParams();
  const [keyOwner, setKeyOwner] = useState(organizerId);
  const [storedKey, setStoredKey] = useState(() => getManagementKey(organizerId) ?? "");
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
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [timeZone, setTimeZone] = useState(() => getBrowserTimeZone());
  const loadSequence = useRef(0);
  const timeZones = getTimeZones();

  useEffect(() => {
    loadSequence.current += 1;
    setKeyOwner(organizerId);
    setStoredKey(getManagementKey(organizerId) ?? "");
    setKeyInput("");
    setSlots([]);
    setBookings([]);
    setError("");
    setMessage("");
    setKeyStorageWarning("");
  }, [organizerId]);

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
      const startAt = resolveLocalDateTime(startDate, startTime, timeZone);
      const endAt = resolveLocalDateTime(endDate, endTime, timeZone);
      if (new Date(startAt).getTime() <= Date.now()) {
        setError("Meeting times must start in the future. Choose a later date and time.");
        return;
      }
      if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
        setError("End time must be after start time.");
        return;
      }
      await api.createOrganizerSlot(organizerId, key, { startAt, endAt, timeZone });
      setMessage("Meeting time added.");
      await load(key);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Could not create the meeting time.");
    } finally {
      setSaving(false);
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
            <section className="panel" aria-labelledby="add-slot-heading">
              <h2 id="add-slot-heading">Add a meeting time</h2>
              <form className="form-stack" onSubmit={createSlot}>
                <label className="field"><span>Start date</span><input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
                <label className="field"><span>Start time</span><input type="time" required value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
                <label className="field"><span>End date</span><input type="date" required value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
                <label className="field"><span>End time</span><input type="time" required value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
                <label className="field"><span>Time zone</span><select required value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>{timeZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label>
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
