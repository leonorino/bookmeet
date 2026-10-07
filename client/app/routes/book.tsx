import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ApiError, api, type Booking, type Slot } from "../lib/api";
import { downloadBookingCalendar } from "../lib/calendar";
import { LanguageSwitcher, useI18n } from "../lib/i18n";
import { formatSlot } from "../lib/time";

interface ActiveHold {
  holdId: string;
  holdCredential: string;
  slot: Slot;
  countdownDeadline: number;
}

interface CopyFeedback {
  key: string;
  label: string;
}

export default function Book() {
  const { locale, t } = useI18n();
  const { organizerId = "" } = useParams();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [hold, setHold] = useState<ActiveHold | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [email, setEmail] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copyMessage, setCopyMessage] = useState<CopyFeedback | null>(null);

  const loadAvailability = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getAvailability(organizerId);
      setSlots(result.slots);
      setError("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load available meeting times.");
    } finally {
      setLoading(false);
    }
  }, [organizerId]);

  useEffect(() => { void loadAvailability(); }, [loadAvailability]);

  useEffect(() => {
    if (!hold) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((hold.countdownDeadline - performance.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [hold]);

  async function selectSlot(slot: Slot) {
    const replacingHold = hold !== null;
    setBusy(true);
    setError("");
    setNotice("");
    const countdownDeadline = performance.now() + 60_000;
    try {
      const result = await api.createHold(organizerId, slot.slotId);
      setHold({ ...result.hold, countdownDeadline });
      setSlots((current) => current.filter((availableSlot) => availableSlot.slotId !== slot.slotId));
      setRemaining(Math.max(0, Math.ceil((countdownDeadline - performance.now()) / 1000)));
      setEmail("");
      if (replacingHold) setNotice("Your earlier hold remains active and unavailable to others until it expires. You can choose another time now.");
    } catch (cause) {
      const conflict = cause instanceof ApiError && (cause.status === 409 || cause.status === 410);
      const holdError = cause instanceof ApiError
        ? cause.message
        : "That meeting time could not be held. Choose another.";
      await loadAvailability();
      if (conflict) {
        setError("");
        setNotice("That slot became unavailable. The available times have been refreshed; choose another time.");
      } else {
        setError(holdError);
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hold) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.confirmHold(hold.holdId, hold.holdCredential, email.trim());
      setBooking(result.booking);
      setHold(null);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 410)) {
        setHold(null);
        setNotice("That hold expired or the time was booked by someone else. Choose another available time.");
        await loadAvailability();
      } else {
        setError(cause instanceof ApiError ? cause.message : "Could not confirm this booking. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage({ key: "{label} copied.", label });
    } catch {
      setCopyMessage({ key: "Copy unavailable. Select and copy the {label} above.", label });
    }
  }

  return (
    <main className="page-shell">
      <header className="site-header"><Link className="wordmark" to="/">{t("Meeting Booking")}</Link><nav className="main-nav" aria-label={t("Main navigation")}><Link to="/cancel">{t("Cancel a booking")}</Link><LanguageSwitcher /></nav></header>
      <section className="page-heading"><h1>{t("Book a meeting")}</h1><p>{t("Times are shown in the time zone listed for each meeting.")}</p></section>
      {error && <p className="notice notice-error" role="alert">{t(error)}</p>}
      {notice && <p className="notice" role="status">{t(notice)}</p>}

      {booking ? (
        <section className="panel booking-confirmation" aria-labelledby="confirmed-heading" aria-live="polite">
          <h2 id="confirmed-heading">{t("Booking confirmed")}</h2>
          <p>{formatSlot(booking.slot, locale).date} · <span className="mono">{formatSlot(booking.slot, locale).timeRange}</span> ({booking.slot.timeZone}) · {formatSlot(booking.slot, locale).durationMinutes} {t("minutes")}</p>
          <button className="button button-secondary" type="button" onClick={() => downloadBookingCalendar(booking)}>{t("Add to calendar")}</button>
          <p>{t("A confirmation email with your booking ID and cancellation credential will be sent to {email}.", { email: booking.clientEmail })}</p>
          <label className="field"><span>{t("Booking ID")}</span><div className="copy-row"><code className="copy-value mono">{booking.bookingId}</code><button className="button button-secondary" type="button" onClick={() => void copy(booking.bookingId, "Booking ID")}>{t("Copy ID")}</button></div></label>
          <label className="field"><span>{t("Cancellation credential")}</span><div className="copy-row"><code className="copy-value mono">{booking.cancellationCredential}</code><button className="button button-secondary" type="button" onClick={() => void copy(booking.cancellationCredential, "Cancellation credential")}>{t("Copy credential")}</button></div></label>
          <p className="notice">{t("Use this credential or the emailed copy to cancel the booking.")}</p>{copyMessage && <p role="status">{t(copyMessage.key, { label: t(copyMessage.label) })}</p>}
          <Link className="button button-quiet" to="/cancel">{t("Cancel this booking")}</Link>
        </section>
      ) : (
        <div className="content-grid">
          <section className="panel" aria-labelledby="availability-heading"><h2 id="availability-heading">{t("Available meeting times")}</h2>
            {loading ? <p role="status">{t("Loading times…")}</p> : slots.length === 0 ? <p className="empty-state">{t("No meeting times are available right now.")}</p> : <ul>{slots.map((slot) => {
              const formatted = formatSlot(slot, locale);
              return <li className="slot-row" key={slot.slotId}><div><strong>{formatted.date}</strong><p className="mono">{formatted.timeRange}</p><p>{formatted.timeZone} · {formatted.durationMinutes} {t("minutes")}</p><span className="status status-available">{t("Available")}</span></div><button className="button button-primary" type="button" disabled={busy} onClick={() => void selectSlot(slot)}>{t("Choose time")}</button></li>;
            })}</ul>}
          </section>
          {hold && <section className="panel booking-hold" aria-labelledby="hold-heading"><h2 id="hold-heading">{t("Complete your booking")}</h2><p>{formatSlot(hold.slot, locale).date} · <span className="mono">{formatSlot(hold.slot, locale).timeRange}</span> ({hold.slot.timeZone}) · {formatSlot(hold.slot, locale).durationMinutes} {t("minutes")}</p><p className="status status-held" role="timer">{remaining > 0 ? t("Temporarily held · about {time} remaining", { time: `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` }) : t("Temporarily held · timer elapsed; confirmation will check availability")}</p><form className="form-stack" onSubmit={confirm}><label className="field"><span>{t("Email for confirmation")}</span><input type="email" name="clientEmail" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} /></label><button className="button button-primary" type="submit" disabled={busy}>{busy ? t("Confirming…") : t("Confirm booking")}</button></form></section>}
        </div>
      )}
    </main>
  );
}
