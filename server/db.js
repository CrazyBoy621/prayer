import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const SCHEMA = `
PRAGMA journal_mode = WAL;

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

export function createDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.exec(SCHEMA);

  const defaults = {
    latitude: '41.2995',
    longitude: '69.2401',
    timezone: 'Asia/Tashkent',
    method: 'MuslimWorldLeague',
    madhab: 'Hanafi',
    tracking_start_date: todayInTimezone('Asia/Tashkent'),
  };
  const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) seed.run(key, value);

  return db;
}
