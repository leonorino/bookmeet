import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ApiError, api } from "../lib/api";

export default function Cancel() {
  const [bookingId, setBookingId] = useState("");
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCancelled(false);
    try {
      await api.cancelClientBooking(bookingId.trim(), credential.trim());
      setCancelled(true);
    } catch (cause) {
      if (cause instanceof ApiError) {
        const code = cause.code.toLowerCase();
        if (code.includes("already_cancelled") || code.includes("already-cancelled")) {
          setError("This booking has already been cancelled.");
        } else if (code.includes("late") || code.includes("too_late") || code.includes("cancellation_window")) {
          setError("This booking is too close to its start time to cancel online. Contact the organizer for help.");
        } else if (cause.status === 401 || cause.status === 403 || code.includes("credential") || code.includes("not_found")) {
          setError("The booking ID or cancellation credential is invalid. Check both values and try again.");
        } else {
          setError(cause.message);
        }
      } else {
        setError("Could not cancel this booking. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="site-header"><Link className="wordmark" to="/">Meeting Booking</Link><nav className="main-nav" aria-label="Main navigation"><Link to="/">Home</Link></nav></header>
      <section className="page-heading"><p className="eyebrow">Booking help</p><h1>Cancel a booking</h1><p>Enter the booking ID and cancellation credential from your confirmation.</p></section>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {cancelled ? <section className="panel" aria-live="polite"><p className="notice notice-success" role="status">Your booking has been cancelled. A cancellation confirmation email will be sent to the address associated with the booking.</p><Link to="/" className="button button-secondary">Return home</Link></section> : <section className="panel" aria-labelledby="cancel-form-heading"><h2 id="cancel-form-heading">Cancellation details</h2><form className="form-stack" onSubmit={submit}><label className="field"><span>Booking ID</span><input autoComplete="off" required value={bookingId} onChange={(event) => setBookingId(event.target.value)} /></label><label className="field"><span>Cancellation credential</span><input type="password" autoComplete="off" required value={credential} onChange={(event) => setCredential(event.target.value)} /></label><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Cancelling…" : "Cancel booking"}</button></form></section>}
    </main>
  );
}
