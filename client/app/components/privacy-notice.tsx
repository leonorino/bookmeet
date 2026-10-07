import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useI18n } from "../lib/i18n";

const STORAGE_KEY = "meeting-booking-privacy-notice-dismissed";
let dismissedInMemory = false;

function isDismissed(): boolean {
  if (dismissedInMemory) return true;
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === "yes") return true;
  } catch { /* Try session storage. */ }
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "yes";
  } catch { return false; }
}

export function PrivacyNotice() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(!isDismissed()), []);

  function dismiss() {
    dismissedInMemory = true;
    try {
      window.localStorage.setItem(STORAGE_KEY, "yes");
    } catch {
      try { window.sessionStorage.setItem(STORAGE_KEY, "yes"); } catch { /* Memory fallback lasts for this app session. */ }
    }
    setVisible(false);
  }

  if (!visible) return null;
  return (
    <aside className="privacy-notice" aria-label={t("Privacy")}>
      <p>{t("This prototype uses browser storage for your language choice and notice dismissal; organizer keys may also be stored there.")} <Link to="/privacy">{t("Privacy")}</Link></p>
      <button className="button button-secondary" type="button" onClick={dismiss}>{t("Got it")}</button>
    </aside>
  );
}
