import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../server/db.js';
import { getSettings, updateSettings } from '../server/settings.js';

const insert = (db, date, prayer) =>
  db.execute({ sql: 'INSERT INTO prayer_records (date, prayer) VALUES (?, ?)', args: [date, prayer] });

test('createDb creates schema and seeds default settings', async () => {
  const db = await createDb({ url: ':memory:' });
  const settings = await getSettings(db);
  assert.equal(settings.latitude, 41.2995);
  assert.equal(settings.longitude, 69.2401);
  assert.equal(settings.timezone, 'Asia/Tashkent');
  assert.equal(settings.method, 'MuslimWorldLeague');
  assert.equal(settings.madhab, 'Hanafi');
  assert.match(settings.trackingStartDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('prayer_records rejects invalid prayer names and dates', async () => {
  const db = await createDb({ url: ':memory:' });
  await insert(db, '2026-08-27', 'fajr');
  await assert.rejects(() => insert(db, '2026-08-27', 'breakfast'));
  await assert.rejects(() => insert(db, 'not-a-date', 'fajr'));
});

test('updateSettings applies a valid partial update', async () => {
  const db = await createDb({ url: ':memory:' });
  const updated = await updateSettings(db, { madhab: 'Shafi', latitude: 40.5 });
  assert.equal(updated.madhab, 'Shafi');
  assert.equal(updated.latitude, 40.5);
  assert.equal(updated.timezone, 'Asia/Tashkent'); // untouched keys survive
});

test('updateSettings rejects invalid values', async () => {
  const db = await createDb({ url: ':memory:' });
  await assert.rejects(() => updateSettings(db, { latitude: 999 }), /latitude/);
  await assert.rejects(() => updateSettings(db, { longitude: -300 }), /longitude/);
  await assert.rejects(() => updateSettings(db, { timezone: 'Mars/Olympus' }), /timezone/);
  await assert.rejects(() => updateSettings(db, { method: 'MadeUpMethod' }), /method/);
  await assert.rejects(() => updateSettings(db, { madhab: 'Other' }), /madhab/);
  await assert.rejects(() => updateSettings(db, { trackingStartDate: '27-08-2026' }), /trackingStartDate/);
  await assert.rejects(() => updateSettings(db, { unknownKey: 1 }), /unknown/i);
  // failed update must not partially apply
  await assert.rejects(() => updateSettings(db, { madhab: 'Shafi', latitude: 999 }));
  assert.equal((await getSettings(db)).madhab, 'Hanafi');
});
