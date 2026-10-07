import { Link } from "react-router";
import { LanguageSwitcher, useI18n } from "../lib/i18n";

export default function Privacy() {
  const { t } = useI18n();
  return (
    <main className="page-shell">
      <header className="site-header"><Link className="wordmark" to="/">{t("Meeting Booking")}</Link><nav className="main-nav" aria-label={t("Main navigation")}><Link to="/">{t("Home")}</Link><LanguageSwitcher /></nav></header>
      <section className="page-heading"><h1>{t("Privacy policy")}</h1><p>{t("How this prototype handles information.")}</p></section>
      <div className="privacy-policy">
        <section><h2>{t("Language preference")}</h2><p>{t("When you choose a language, the app stores it in local and session storage when available. If only session storage works, it lasts until the tab is closed. If neither is available, the choice lasts only while the app is open.")}</p></section>
        <section><h2>{t("Organizer keys")}</h2><p>{t("The app may save a workspace management key in this browser’s local storage when you create or open a workspace. The service emails the organizer ID and key to the organizer when the workspace is created. Anyone with the key can manage that workspace, so keep it private.")}</p></section>
        <section><h2>{t("Bookings and email")}</h2><p>{t("The service stores organizer and client email addresses and booking records, including the selected meeting time and booking status. It sends setup emails to organizers and booking or cancellation emails to the relevant addresses. Confirmation emails include a booking ID and cancellation credential; setup emails include the organizer management key. This prototype has no defined retention or deletion schedule for these records.")}</p></section>
        <section><h2>{t("Fonts")}</h2><p>{t("The stylesheet requests DM Sans from Google Fonts, so your browser contacts Google to retrieve the font when needed.")}</p></section>
        <section><h2>{t("Notice dismissal")}</h2><p>{t("Choosing “Got it” stores the dismissal in local storage or, if unavailable, session storage. If both are unavailable, the notice stays dismissed only while the app is open. It does not enable or disable any feature.")}</p></section>
      </div>
    </main>
  );
}
