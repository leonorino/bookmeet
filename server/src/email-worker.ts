import type Database from 'better-sqlite3';
import nodemailer from 'nodemailer';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
}

export interface MailSender {
  send(message: OutgoingEmail): Promise<void>;
}

export interface SmtpConfiguration {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  username?: string;
  password?: string;
}

interface OutboxRow extends OutgoingEmail {
  notification_id: string;
  attempts: number;
  attachments_json: string | null;
}

const POLL_INTERVAL_MS = 30_000;
const FIRST_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1_000;

export function createSmtpSender(configuration: SmtpConfiguration): MailSender {
  if (Boolean(configuration.username) !== Boolean(configuration.password)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must either both be set or both be empty.');
  }

  const transport = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    ...(configuration.username && configuration.password
      ? { auth: { user: configuration.username, pass: configuration.password } }
      : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  return {
    async send(message) {
      await transport.sendMail({ from: configuration.from, ...message });
    },
  };
}

export class OutboxWorker {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(
    private readonly database: Database.Database,
    private readonly sender: MailSender,
    private readonly now: () => number = Date.now,
    private readonly onError: (notificationId: string, error: unknown) => void = () => undefined,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.kick(), POLL_INTERVAL_MS);
    this.timer.unref();
    this.kick();
  }

  kick(): void {
    if (this.running) return;
    this.running = this.drain().catch((error: unknown) => {
      this.onError('outbox-worker', error);
    }).finally(() => {
      this.running = undefined;
    });
  }

  async drain(): Promise<void> {
    for (;;) {
      const message = this.database.prepare(`
        SELECT current.notification_id, current.recipient_email AS to_address, current.subject,
          current.text_body AS text, current.attempts, current.contains_credentials, current.attachments_json
        FROM notification_outbox AS current
        WHERE current.status = 'pending' AND current.available_at <= ?
          AND (
            current.sequence_number = 0 OR NOT EXISTS (
              SELECT 1 FROM notification_outbox AS prior
              WHERE prior.aggregate_id = current.aggregate_id
                AND prior.recipient_email = current.recipient_email
                AND prior.sequence_number < current.sequence_number
                AND prior.status != 'sent'
            )
          )
        ORDER BY current.created_at, current.notification_id
        LIMIT 1
      `).get(this.now()) as (Omit<OutboxRow, 'to'> & { to_address: string }) | undefined;
      if (!message) return;

      const outgoing: OutgoingEmail = {
        to: message.to_address,
        subject: message.subject,
        text: message.text,
        ...(message.attachments_json ? { attachments: JSON.parse(message.attachments_json) as OutgoingEmail['attachments'] } : {}),
      };

      try {
        await this.sender.send(outgoing);
        this.database.prepare(`
          UPDATE notification_outbox
          SET status = 'sent', sent_at = ?, attempts = attempts + 1, last_error = NULL,
            text_body = CASE WHEN contains_credentials = 1 THEN '' ELSE text_body END
          WHERE notification_id = ? AND status = 'pending'
        `).run(this.now(), message.notification_id);
      } catch (error) {
        const attempts = message.attempts + 1;
        const delay = Math.min(FIRST_RETRY_DELAY_MS * 2 ** (attempts - 1), MAX_RETRY_DELAY_MS);
        const lastError = error instanceof Error ? error.name.slice(0, 100) : 'Email delivery failed.';
        this.database.prepare(`
          UPDATE notification_outbox
          SET attempts = ?, available_at = ?, last_error = ?
          WHERE notification_id = ? AND status = 'pending'
        `).run(attempts, this.now() + delay, lastError, message.notification_id);
        this.onError(message.notification_id, error);
      }
    }
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }
}

export function smtpConfigurationFromEnvironment(environment: NodeJS.ProcessEnv = process.env): SmtpConfiguration | undefined {
  const host = environment.SMTP_HOST;
  const from = environment.SMTP_FROM;
  if (!host || !from) return undefined;

  const port = Number(environment.SMTP_PORT ?? '587');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }

  return {
    host,
    from,
    port,
    secure: environment.SMTP_SECURE === 'true',
    ...(environment.SMTP_USER ? { username: environment.SMTP_USER } : {}),
    ...(environment.SMTP_PASSWORD ? { password: environment.SMTP_PASSWORD } : {}),
  };
}
