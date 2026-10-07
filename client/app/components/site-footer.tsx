import { Link } from "react-router";
import { useI18n } from "../lib/i18n";

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="site-footer">
      <span>{t("Meeting Booking")}</span>
      <Link to="/privacy">{t("Privacy")}</Link>
    </footer>
  );
}
