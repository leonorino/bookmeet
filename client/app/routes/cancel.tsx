import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ApiError, api } from "../lib/api";
import { LanguageSwitcher, useI18n } from "../lib/i18n";

export default function Cancel() {
  const { t } = useI18n();
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
      await api.cancelClientBooking(credential.trim());
      setCancelled(true);
    } catch (cause) {
      if (cause instanceof ApiError) {
        const code = cause.code.toLowerCase();
        if (code.includes("already_cancelled") || code.includes("already-cancelled")) {
          setError("This booking has already been cancelled.");
        } else if (code.includes("late") || code.includes("too_late") || code.includes("cancellation_window")) {
          setError("This booking is too close to its start time to cancel online. Contact the organizer for help.");
        } else if (cause.status === 401 || cause.status === 403 || code.includes("credential") || code.includes("not_found")) {
          setError("The cancellation credential is invalid. Check it and try again.");
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
      <header className="site-header"><Link className="wordmark" to="/">{t("Meeting Booking")}</Link><nav className="main-nav" aria-label={t("Main navigation")}><Link to="/">{t("Home")}</Link><LanguageSwitcher /></nav></header>
      <section className="page-heading"><p className="eyebrow">{t("Booking help")}</p><h1>{t("Cancel a booking")}</h1><p>{t("Enter the cancellation credential from your confirmation.")}</p></section>
      {error && <p className="notice notice-error" role="alert">{t(error)}</p>}
      {cancelled ? <section className="panel" aria-live="polite"><p className="notice notice-success" role="status">{t("Your booking has been cancelled. A cancellation confirmation email will be sent to the address associated with the booking.")}</p><Link to="/" className="button button-secondary">{t("Return home")}</Link></section> : <section className="panel" aria-labelledby="cancel-form-heading"><h2 id="cancel-form-heading">{t("Cancellation details")}</h2><form className="form-stack" onSubmit={submit}><label className="field"><span>{t("Cancellation credential")}</span><input type="password" autoComplete="off" required value={credential} onChange={(event) => setCredential(event.target.value)} /></label><button className="button button-primary" type="submit" disabled={busy}>{busy ? t("Cancelling…") : t("Cancel booking")}</button></form></section>}
    </main>
  );
}
