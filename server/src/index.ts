import { buildApp } from './app.js';
import { createSmtpSender, smtpConfigurationFromEnvironment } from './email-worker.js';

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? '3000');
const databasePath = process.env.DATABASE_PATH ?? './data/meeting-booking.sqlite';

async function start(): Promise<void> {
  const smtpConfiguration = smtpConfigurationFromEnvironment();
  if (process.env.NODE_ENV === 'production' && !smtpConfiguration) {
    throw new Error('SMTP_HOST and SMTP_FROM must be configured in production.');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }

  const app = buildApp({
    databasePath,
    ...(smtpConfiguration ? { mailSender: createSmtpSender(smtpConfiguration) } : {}),
  });

  if (!smtpConfiguration) {
    app.log.warn('SMTP is not configured; transactional notifications will remain queued.');
  }

  const shutdown = async (signal: NodeJS.Signals) => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error({ err: error }, 'Server failed to start');
    await app.close();
    process.exitCode = 1;
  }
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Server failed to start.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
