import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../server/db.js';
import { getSettings, updateSettings } from '../server/settings.js';

test('createDb creates schema and seeds default settings', () => {
  const db = createDb(':memory:');
  const settings = getSettings(db);
  assert.equal(settings.latitude, 41.2995);
  assert.equal(settings.longitude, 69.2401);
  assert.equal(settings.timezone, 'Asia/Tashkent');
  assert.equal(settings.method, 'MuslimWorldLeague');
  assert.equal(settings.madhab, 'Hanafi');
  assert.match(settings.trackingStartDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('prayer_records rejects invalid prayer names and dates', () => {
  const db = createDb(':memory:');
  const insert = db.prepare('INSERT INTO prayer_records (date, prayer) VALUES (?, ?)');
  insert.run('2026-08-27', 'fajr');
  assert.throws(() => insert.run('2026-08-27', 'breakfast'));
  assert.throws(() => insert.run('not-a-date', 'fajr'));
});

test('updateSettings applies a valid partial update', () => {
  const db = createDb(':memory:');
  const updated = updateSettings(db, { madhab: 'Shafi', latitude: 40.5 });
  assert.equal(updated.madhab, 'Shafi');
  assert.equal(updated.latitude, 40.5);
  assert.equal(updated.timezone, 'Asia/Tashkent'); // untouched keys survive
});

test('updateSettings rejects invalid values', () => {
  const db = createDb(':memory:');
  assert.throws(() => updateSettings(db, { latitude: 999 }), /latitude/);
  assert.throws(() => updateSettings(db, { longitude: -300 }), /longitude/);
  assert.throws(() => updateSettings(db, { timezone: 'Mars/Olympus' }), /timezone/);
  assert.throws(() => updateSettings(db, { method: 'MadeUpMethod' }), /method/);
  assert.throws(() => updateSettings(db, { madhab: 'Other' }), /madhab/);
  assert.throws(() => updateSettings(db, { trackingStartDate: '27-08-2026' }), /trackingStartDate/);
  assert.throws(() => updateSettings(db, { unknownKey: 1 }), /unknown/i);
  // failed update must not partially apply
  assert.throws(() => updateSettings(db, { madhab: 'Shafi', latitude: 999 }));
  assert.equal(getSettings(db).madhab, 'Hanafi');
});
