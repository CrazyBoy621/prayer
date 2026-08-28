import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../server/db.js';
import { createApp } from '../server/app.js';

// 2026-08-28 10:00 in Tashkent (UTC+5)
const FIXED_NOW = new Date('2026-08-28T05:00:00Z');

async function startServer(t) {
  const db = await createDb({ url: ':memory:' });
  const app = createApp(db, { now: () => FIXED_NOW });
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;
  const api = async (path, options) => {
    const res = await fetch(base + path, options);
    return { status: res.status, body: await res.json() };
  };
  return { db, api };
}

const json = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('records: mark, list, unmark — idempotent', async (t) => {
  const { api } = await startServer(t);

  const put = await api('/api/records/2026-08-27/fajr', { method: 'PUT' });
  assert.equal(put.status, 200);
  assert.deepEqual(put.body, { date: '2026-08-27', prayer: 'fajr', prayed: true });

  const again = await api('/api/records/2026-08-27/fajr', { method: 'PUT' });
  assert.equal(again.status, 200);

  await api('/api/records/2026-08-27/isha', { method: 'PUT' });
  // future dates are allowed
  const future = await api('/api/records/2026-09-15/dhuhr', { method: 'PUT' });
  assert.equal(future.status, 200);

  const list = await api('/api/records?from=2026-08-01&to=2026-08-31');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body, { '2026-08-27': ['fajr', 'isha'] });

  const del = await api('/api/records/2026-08-27/fajr', { method: 'DELETE' });
  assert.deepEqual(del.body, { date: '2026-08-27', prayer: 'fajr', prayed: false });
  const delAgain = await api('/api/records/2026-08-27/fajr', { method: 'DELETE' });
  assert.equal(delAgain.status, 200);

  const after = await api('/api/records?from=2026-08-01&to=2026-08-31');
  assert.deepEqual(after.body, { '2026-08-27': ['isha'] });
});

test('records: validation errors', async (t) => {
  const { api } = await startServer(t);
  assert.equal((await api('/api/records/2026-08-27/breakfast', { method: 'PUT' })).status, 400);
  assert.equal((await api('/api/records/27-08-2026/fajr', { method: 'PUT' })).status, 400);
  assert.equal((await api('/api/records?from=2026-08-01')).status, 400);
  assert.equal((await api('/api/records?from=bad&to=worse')).status, 400);
});

test('times: explicit date and default to today in configured tz', async (t) => {
  const { api } = await startServer(t);

  const explicit = await api('/api/times?date=2026-08-28');
  assert.equal(explicit.status, 200);
  assert.equal(explicit.body.date, '2026-08-28');
  assert.equal(explicit.body.timezone, 'Asia/Tashkent');
  assert.equal(explicit.body.method, 'MuslimWorldLeague');
  assert.equal(explicit.body.madhab, 'Hanafi');
  assert.match(explicit.body.times.fajr, /^\d{2}:\d{2}$/);
  const ts = explicit.body.timestamps;
  assert.ok(ts.fajr < ts.sunrise && ts.sunrise < ts.dhuhr && ts.dhuhr < ts.asr
    && ts.asr < ts.maghrib && ts.maghrib < ts.isha);

  const today = await api('/api/times');
  assert.equal(today.body.date, '2026-08-28');

  assert.equal((await api('/api/times?date=nope')).status, 400);
});

test('settings: get, partial update, validation', async (t) => {
  const { api } = await startServer(t);

  const initial = await api('/api/settings');
  assert.equal(initial.body.madhab, 'Hanafi');

  const updated = await api('/api/settings', json('PUT', { madhab: 'Shafi' }));
  assert.equal(updated.status, 200);
  assert.equal(updated.body.madhab, 'Shafi');
  assert.equal(updated.body.timezone, 'Asia/Tashkent');

  assert.equal((await api('/api/settings', json('PUT', { latitude: 999 }))).status, 400);
  assert.equal((await api('/api/settings', json('PUT', { nonsense: 1 }))).status, 400);
});

test('stats: shape, default month, and month validation', async (t) => {
  const { api } = await startServer(t);
  await api('/api/records/2026-08-27/fajr', { method: 'PUT' });

  const res = await api('/api/stats');
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.qaza.total, 'number');
  assert.deepEqual(Object.keys(res.body.qaza.byPrayer), ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
  assert.equal(typeof res.body.streak.current, 'number');
  assert.equal(typeof res.body.streak.longest, 'number');
  assert.equal(res.body.month.month, '2026-08');
  assert.equal(res.body.today, '2026-08-28');

  const explicit = await api('/api/stats?month=2026-07');
  assert.equal(explicit.body.month.month, '2026-07');

  assert.equal((await api('/api/stats?month=August')).status, 400);
});

test('unknown api route returns 404 json', async (t) => {
  const { api } = await startServer(t);
  const res = await api('/api/nope');
  assert.equal(res.status, 404);
  assert.ok(res.body.error);
});
