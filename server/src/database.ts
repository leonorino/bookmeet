import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CURRENT_SCHEMA_VERSION = 2;

export function openDatabase(databasePath: string): Database.Database {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }

  const database = new Database(databasePath);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.pragma('journal_mode = WAL');
  migrate(database);
  return database;
}

function migrate(database: Database.Database): void {
  const currentVersion = database.pragma('user_version', { simple: true }) as number;
  if (currentVersion >= CURRENT_SCHEMA_VERSION) return;

  database.transaction(() => {
    if (currentVersion < 1) {
      database.exec(`
        CREATE TABLE organizers (
          organizer_id TEXT PRIMARY KEY,
          organizer_email TEXT NOT NULL,
          management_key_hash TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE slots (
          slot_id TEXT PRIMARY KEY,
          organizer_id TEXT NOT NULL REFERENCES organizers(organizer_id),
          start_at INTEGER NOT NULL,
          end_at INTEGER NOT NULL,
          time_zone TEXT NOT NULL,
          removed_at INTEGER,
          created_at INTEGER NOT NULL,
          CHECK (start_at < end_at)
        );
        CREATE INDEX slots_by_organizer_time ON slots(organizer_id, start_at, end_at);

        CREATE TABLE holds (
          hold_id TEXT PRIMARY KEY,
          slot_id TEXT NOT NULL REFERENCES slots(slot_id),
          hold_credential_hash TEXT NOT NULL UNIQUE,
          expires_at INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'confirmed', 'released')),
          created_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX one_active_hold_per_slot ON holds(slot_id) WHERE status = 'active';
        CREATE INDEX holds_by_expiry ON holds(status, expires_at);

        CREATE TABLE bookings (
          booking_id TEXT PRIMARY KEY,
          slot_id TEXT NOT NULL REFERENCES slots(slot_id),
          client_email TEXT NOT NULL,
          cancellation_credential_hash TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
          created_at INTEGER NOT NULL,
          cancelled_at INTEGER
        );
        CREATE UNIQUE INDEX one_confirmed_booking_per_slot ON bookings(slot_id) WHERE status = 'confirmed';
        CREATE INDEX bookings_by_slot ON bookings(slot_id, created_at);

        CREATE TABLE notification_outbox (
          notification_id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL,
          recipient_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          text_body TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'sent')) DEFAULT 'pending',
          attempts INTEGER NOT NULL DEFAULT 0,
          available_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          sent_at INTEGER,
          last_error TEXT,
          UNIQUE (event_id, recipient_email)
        );
        CREATE INDEX outbox_due ON notification_outbox(status, available_at, notification_id);
      `);
      database.pragma('user_version = 1');
    }

    if (currentVersion < 2) {
      database.exec(`
        ALTER TABLE notification_outbox ADD COLUMN aggregate_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE notification_outbox ADD COLUMN sequence_number INTEGER NOT NULL DEFAULT 0;
        UPDATE notification_outbox
        SET aggregate_id = substr(event_id, 9, length(event_id) - 18),
            sequence_number = CASE
              WHEN event_id LIKE '%:confirmed' THEN 1
              WHEN event_id LIKE '%:cancelled' THEN 2
              ELSE 0
            END
        WHERE event_id LIKE 'booking:%:confirmed' OR event_id LIKE 'booking:%:cancelled';
        CREATE INDEX outbox_by_aggregate_sequence
          ON notification_outbox(aggregate_id, recipient_email, sequence_number, status);
      `);
      database.pragma('user_version = 2');
    }
  }).immediate();
}
