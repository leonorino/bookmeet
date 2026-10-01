import Fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);
const databasePath = resolve(process.env.DATABASE_PATH ?? './data/meeting-booking.sqlite');

mkdirSync(dirname(databasePath), { recursive: true });
const database = new Database(databasePath);
database.pragma('foreign_keys = ON');
database.pragma('busy_timeout = 5000');
database.pragma('journal_mode = WAL');

const app = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>();

app.get(
  '/health',
  {
    schema: {
      response: {
        200: Type.Object({ status: Type.Literal('ok') }),
      },
    },
  },
  async () => ({ status: 'ok' as const }),
);

app.addHook('onClose', async () => {
  database.close();
});

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
