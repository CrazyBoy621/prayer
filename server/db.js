import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS prayer_records (
  date       TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  prayer     TEXT NOT NULL CHECK (prayer IN ('fajr','dhuhr','asr','maghrib','isha')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (date, prayer)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function todayInTimezone(timeZone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export async function createDb({ url, authToken } = {}) {
  if (url.startsWith('file:')) {
    fs.mkdirSync(path.dirname(url.slice('file:'.length)), { recursive: true });
  }
  const db = createClient({ url, authToken });
  await db.executeMultiple(SCHEMA);

  const defaults = {
    latitude: '41.2995',
    longitude: '69.2401',
    timezone: 'Asia/Tashkent',
    method: 'MuslimWorldLeague',
    madhab: 'Hanafi',
    tracking_start_date: todayInTimezone('Asia/Tashkent'),
  };
  await db.batch(
    Object.entries(defaults).map(([key, value]) => ({
      sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      args: [key, value],
    })),
    'write',
  );
  return db;
}
