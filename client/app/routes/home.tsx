import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError, api } from "../lib/api";
import { LanguageSwitcher, useI18n } from "../lib/i18n";
import { saveManagementKey } from "../lib/management-key";

interface CreatedWorkspace {
  organizerId: string;
  managementKey: string;
  keySaved: boolean;
}

interface CopyFeedback {
  key: string;
  label: string;
}

export function meta() {
  return [
    { title: "Meeting Booking" },
    {
      name: "description",
      content: "Create a booking page or open your organizer workspace.",
    },
  ];
}

export default function Home() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [organizerEmail, setOrganizerEmail] = useState("");
  const [managementKey, setManagementKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [openingWorkspace, setOpeningWorkspace] = useState(false);
  const [error, setError] = useState("");
  const [manageError, setManageError] = useState("");
  const [copyMessage, setCopyMessage] = useState<CopyFeedback | null>(null);
  const [workspace, setWorkspace] = useState<CreatedWorkspace | null>(null);

  const publicLink = workspace
    ? `${window.location.origin}/book/${encodeURIComponent(workspace.organizerId)}`
    : "";

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError("");
    setWorkspace(null);

    try {
      const created = await api.createOrganizer(organizerEmail.trim());
      let keySaved = true;
      try {
        saveManagementKey(created.organizerId, created.managementKey);
      } catch {
        keySaved = false;
      }
      setWorkspace({ ...created, keySaved });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The booking page could not be created. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManageError("");
    setOpeningWorkspace(true);

    const key = managementKey.trim();
    try {
      const { organizerId: id } = await api.getOrganizerForManagementKey(key);
      try {
        saveManagementKey(id, key);
      } catch {
        // The key is also passed in navigation state so this session can continue without local storage.
      }
      navigate(`/manage/${encodeURIComponent(id)}`, { state: { managementKey: key } });
    } catch (cause) {
      setManageError(cause instanceof ApiError ? cause.message : "Could not open this workspace. Try again.");
    } finally {
      setOpeningWorkspace(false);
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
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label={t("Meeting Booking home")}>
          <span className="wordmark-icon" aria-hidden="true">M</span>
          <span>{t("Meeting Booking")}</span>
        </Link>
        <nav className="main-nav" aria-label={t("Main navigation")}>
          <Link to="/cancel">{t("Cancel a booking")}</Link>
          <LanguageSwitcher />
        </nav>
      </header>

      <section className="home-hero" aria-label={t("Get started")}>
        <section className="panel start-panel" aria-labelledby="create-heading">
          <h1 id="create-heading">{t("Create a booking page")}</h1>
          <p className="panel-copy">{t("Booking confirmations and cancellations go to this address.")}</p>
          <form className="form-stack" onSubmit={handleCreateWorkspace}>
            <label className="field">
              <span>{t("Organizer email")}</span>
              <input
                autoComplete="email"
                type="email"
                name="organizerEmail"
                maxLength={254}
                required
                value={organizerEmail}
                onChange={(event) => setOrganizerEmail(event.target.value)}
              />
            </label>
            <button className="button button-primary" type="submit" disabled={creating}>
              {creating ? t("Creating page…") : t("Create booking page")}
            </button>
          </form>

          {error && <p className="notice notice-error" role="alert">{t(error)}</p>}

          {workspace && (
            <section className="creation-result" aria-labelledby="workspace-ready" aria-live="polite">
              <div className="result-rule" />
              <h3 id="workspace-ready">{t("Booking page created")}</h3>
              <div className="creation-options">
                <div className="result-option">
                  <h4 className="result-section-title">{t("Booking link")}</h4>
                  <p className="field-help">{t("Share this link with clients.")}</p>
                  <div className="copy-row">
                    <code className="copy-value" aria-label={t("Public booking link")}>{publicLink}</code>
                    <button className="button button-secondary" type="button" onClick={() => void copy(publicLink, "Booking link")}>
                      {t("Copy link")}
                    </button>
                  </div>
                </div>
                <div className="result-option">
                  <h4 className="result-section-title">{t("Management key")}</h4>
                  <div className="field">
                    <span>{t("Keep this key private")}</span>
                    <div className="copy-row">
                      <code className="copy-value" aria-label={t("Management key")}>{workspace.managementKey}</code>
                      <button className="button button-secondary" type="button" onClick={() => void copy(workspace.managementKey, "Management key")}>
                        {t("Copy key")}
                      </button>
                    </div>
                    <p className="field-help">
                      {workspace.keySaved
                        ? t("Saved on this device. A copy will be emailed to you. Keep the email as backup; if both copies are lost, the key cannot be recovered.")
                        : t("Not saved here. Copy it now. A copy will be emailed to you. Keep the email as backup; if both copies are lost, the key cannot be recovered.")}
                    </p>
                  </div>
                </div>
              </div>
              <div className="form-actions">
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => navigate(`/manage/${encodeURIComponent(workspace.organizerId)}`, { state: { managementKey: workspace.managementKey } })}
                >
                  {t("Add meeting times")}
                </button>
                <Link className="text-link" to={`/book/${encodeURIComponent(workspace.organizerId)}`}>
                  {t("Preview booking page")}
                </Link>
              </div>
              {copyMessage && <p className="field-help" role="status">{t(copyMessage.key, { label: t(copyMessage.label) })}</p>}
            </section>
          )}
        </section>
        <section className="panel home-secondary" aria-labelledby="manage-heading">
          <h2 id="manage-heading">{t("Return to your workspace")}</h2>
          <p className="panel-copy">{t("Enter your management key to manage your meeting times.")}</p>
          <form className="manage-entry" onSubmit={handleOpenWorkspace}>
            <label className="field">
              <span>{t("Management key")}</span>
              <input
                autoComplete="current-password"
                type="password"
                name="managementKey"
                required
                value={managementKey}
                onChange={(event) => {
                  setManagementKey(event.target.value);
                  setManageError("");
                }}
              />
            </label>
            <button className="button button-secondary" type="submit" disabled={openingWorkspace}>
              {openingWorkspace ? t("Opening workspace…") : t("Open workspace")}
            </button>
          </form>
          {manageError && <p className="notice notice-error" role="alert">{t(manageError)}</p>}
        </section>
      </section>

      <footer className="site-footer">
        <span>{t("Meeting Booking")}</span>
      </footer>
    </main>
  );
}
