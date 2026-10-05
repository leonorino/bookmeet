import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError, api } from "../lib/api";
import { saveManagementKey } from "../lib/management-key";

interface CreatedWorkspace {
  organizerId: string;
  managementKey: string;
  keySaved: boolean;
}

function parseOrganizerId(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  if (!/[/:?#]/.test(input) && !/^[a-z][a-z\d+.-]*:/i.test(input)) return input;

  try {
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input);
    const url = new URL(input, window.location.origin);
    if (hasScheme && url.origin !== window.location.origin) return null;

    const match = /^\/book\/([^/]+)\/?$/.exec(url.pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function meta() {
  return [
    { title: "Meeting Booking — make time for the conversation" },
    {
      name: "description",
      content: "Share the times that work for you and let clients book without an account.",
    },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const [organizerEmail, setOrganizerEmail] = useState("");
  const [organizerId, setOrganizerId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [manageError, setManageError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
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

  function handleOpenWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = parseOrganizerId(organizerId);
    if (!id) {
      setManageError("Enter an organizer ID or paste its public booking link from this site.");
      return;
    }
    setManageError("");
    navigate(`/manage/${encodeURIComponent(id)}`);
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied.`);
    } catch {
      setCopyMessage(`Copy unavailable. Select and copy the ${label.toLowerCase()} above.`);
    }
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="Meeting Booking home">
          <span className="wordmark-icon" aria-hidden="true">M</span>
          <span>Meeting Booking</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link to="/cancel">Cancel a booking</Link>
        </nav>
      </header>

      <section className="home-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">A simpler way to find a time</p>
          <h1 id="hero-title">Make time for the conversation.</h1>
          <p className="intro">
            Share a few meeting times. Let clients choose the one that works for them.
            No account and no back-and-forth needed.
          </p>
          <p className="trust-note"><span aria-hidden="true">✓</span> One clear time, confirmed for everyone.</p>
        </div>

        <section className="panel start-panel" aria-labelledby="create-heading">
          <p className="eyebrow">For organizers</p>
          <h2 id="create-heading">Create a booking page</h2>
          <p className="panel-copy">
            Add your notification email to create a workspace. You can add meeting times next.
          </p>
          <form className="form-stack" onSubmit={handleCreateWorkspace}>
            <label className="field">
              <span>Organizer email</span>
              <input
                autoComplete="email"
                type="email"
                name="organizerEmail"
                maxLength={254}
                required
                value={organizerEmail}
                onChange={(event) => setOrganizerEmail(event.target.value)}
              />
              <span className="field-help">Booking confirmations and cancellations will be sent here.</span>
            </label>
            <button className="button button-primary" type="submit" disabled={creating}>
              {creating ? "Creating page…" : "Create booking page"}
            </button>
          </form>

          {error && <p className="notice notice-error" role="alert">{error}</p>}

          {workspace && (
            <section className="creation-result" aria-labelledby="workspace-ready" aria-live="polite">
              <div className="result-rule" />
              <p className="eyebrow">Workspace ready</p>
              <h3 id="workspace-ready">Booking page created</h3>
              <div className="result-share">
                <h4 className="result-section-title">Booking link</h4>
                <p className="field-help">Share this link with clients.</p>
                <div className="copy-row">
                  <code className="copy-value" aria-label="Public booking link">{publicLink}</code>
                  <button className="button button-secondary" type="button" onClick={() => void copy(publicLink, "Booking link")}>
                    Copy link
                  </button>
                </div>
              </div>
              <div className="workspace-details">
                <h4 className="result-section-title">Workspace details</h4>
                <div className="field">
                  <span>Management key</span>
                  <div className="copy-row">
                    <code className="copy-value" aria-label="Management key">{workspace.managementKey}</code>
                    <button className="button button-secondary" type="button" onClick={() => void copy(workspace.managementKey, "Management key")}>
                      Copy key
                    </button>
                  </div>
                  <p className="field-help">
                    {workspace.keySaved
                      ? "Saved on this device. Keep it private; it can’t be recovered."
                      : "Not saved here. Copy it now; keep it private. It can’t be recovered."}
                  </p>
                </div>
                <div className="field">
                  <span>Organizer ID</span>
                  <div className="copy-row">
                    <code className="copy-value" aria-label="Organizer ID">{workspace.organizerId}</code>
                    <button className="button button-secondary" type="button" onClick={() => void copy(workspace.organizerId, "Organizer ID")}>
                      Copy ID
                    </button>
                  </div>
                </div>
              </div>
              <div className="form-actions">
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => navigate(`/manage/${encodeURIComponent(workspace.organizerId)}`)}
                >
                  Add meeting times
                </button>
                <Link className="text-link" to={`/book/${encodeURIComponent(workspace.organizerId)}`}>
                  Preview booking page
                </Link>
              </div>
              {copyMessage && <p className="field-help" role="status">{copyMessage}</p>}
            </section>
          )}
        </section>
      </section>

      <section className="home-secondary" aria-labelledby="manage-heading">
        <div>
          <p className="eyebrow">Already have a page?</p>
          <h2 id="manage-heading">Manage your availability.</h2>
          <p className="panel-copy">Paste your organizer ID or public booking link. Your saved key will be used on this device.</p>
        </div>
        <form className="manage-entry" onSubmit={handleOpenWorkspace}>
          <label className="field">
            <span>Organizer ID or booking link</span>
            <input
              autoComplete="off"
              name="organizerId"
              required
              value={organizerId}
              onChange={(event) => {
                setOrganizerId(event.target.value);
                setManageError("");
              }}
            />
          </label>
          <button className="button button-secondary" type="submit">Open workspace</button>
        </form>
        {manageError && <p className="notice notice-error" role="alert">{manageError}</p>}
      </section>

      <section className="how-section" aria-labelledby="how-heading">
        <div>
          <p className="eyebrow">How it works</p>
          <h2 id="how-heading">A time chosen.<br />A plan confirmed.</h2>
        </div>
        <ol className="steps-list">
          <li><span className="step-number mono">01</span><span>Organizers share one-off meeting times.</span></li>
          <li><span className="step-number mono">02</span><span>Clients choose a time and add their email.</span></li>
          <li><span className="step-number mono">03</span><span>Both sides receive the confirmed meeting details.</span></li>
        </ol>
      </section>

      <footer className="site-footer">
        <span>Meeting Booking</span>
        <Link to="/cancel">Cancel an existing booking</Link>
      </footer>
    </main>
  );
}
