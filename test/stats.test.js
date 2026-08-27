import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb, PRAYERS } from '../server/db.js';
import { updateSettings } from '../server/settings.js';
import { getStats } from '../server/stats.js';

// Tashkent is UTC+5. On 2026-08-28 the calculated times are roughly:
// fajr 04:06, sunrise 05:45, dhuhr 12:25, asr 17:06, maghrib 19:03, isha 20:36.
const MORNING = new Date('2026-08-28T05:00:00Z'); // 10:00 local: after sunrise, before asr
const PRE_DAWN = new Date('2026-08-28T00:00:00Z'); // 05:00 local: before sunrise
const LATE_NIGHT = new Date('2026-08-28T18:00:00Z'); // 23:00 local: after isha begins

function freshDb(trackingStartDate = '2026-08-25') {
  const db = createDb(':memory:');
  updateSettings(db, { trackingStartDate });
  return db;
}

function mark(db, date, ...prayers) {
  const stmt = db.prepare('INSERT OR IGNORE INTO prayer_records (date, prayer) VALUES (?, ?)');
  for (const p of prayers.length ? prayers : PRAYERS) stmt.run(date, p);
}

test('qaza: empty db counts past days plus today expired windows', () => {
  const db = freshDb();
  const { qaza, today, trackingStartDate } = getStats(db, { now: MORNING });
  // 3 full past days (25,26,27) x 5, plus today's fajr whose window ended at sunrise
  assert.equal(today, '2026-08-28');
  assert.equal(trackingStartDate, '2026-08-25');
  assert.deepEqual(qaza.byPrayer, { fajr: 4, dhuhr: 3, asr: 3, maghrib: 3, isha: 3 });
  assert.equal(qaza.total, 16);
});

test('qaza: marking a past prayer reduces the debt', () => {
  const db = freshDb();
  mark(db, '2026-08-27', 'fajr');
  const { qaza } = getStats(db, { now: MORNING });
  assert.equal(qaza.byPrayer.fajr, 3);
  assert.equal(qaza.total, 15);
});

test('qaza: before sunrise today contributes nothing', () => {
  const db = freshDb();
  const { qaza } = getStats(db, { now: PRE_DAWN });
  assert.equal(qaza.total, 15);
});

test('qaza: isha never becomes qaza on the same day', () => {
  const db = freshDb();
  const { qaza } = getStats(db, { now: LATE_NIGHT });
  // today contributes fajr, dhuhr, asr, maghrib (isha window open until day end)
  assert.equal(qaza.total, 19);
  assert.equal(qaza.byPrayer.isha, 3);
});

test('qaza: tracking start today counts only today expired windows', () => {
  const db = freshDb('2026-08-28');
  assert.equal(getStats(db, { now: MORNING }).qaza.total, 1);
  assert.equal(getStats(db, { now: PRE_DAWN }).qaza.total, 0);
});

test('qaza: tracking start in the future is zero', () => {
  const db = freshDb('2026-09-01');
  assert.equal(getStats(db, { now: MORNING }).qaza.total, 0);
});

test('qaza: records before the start date do not offset the debt', () => {
  const db = freshDb();
  mark(db, '2026-08-20', 'fajr');
  assert.equal(getStats(db, { now: MORNING }).qaza.byPrayer.fajr, 4);
});

test('qaza: future-dated marks do not reduce the debt', () => {
  const db = freshDb();
  mark(db, '2026-09-15', 'dhuhr');
  assert.equal(getStats(db, { now: MORNING }).qaza.byPrayer.dhuhr, 3);
});

test('streak: consecutive full days counted back from yesterday', () => {
  const db = freshDb();
  mark(db, '2026-08-26');
  mark(db, '2026-08-27');
  const { streak } = getStats(db, { now: MORNING });
  assert.equal(streak.current, 2);
});

test('streak: a complete today extends the streak', () => {
  const db = freshDb();
  mark(db, '2026-08-26');
  mark(db, '2026-08-27');
  mark(db, '2026-08-28');
  assert.equal(getStats(db, { now: MORNING }).streak.current, 3);
});

test('streak: an incomplete today does not break the streak', () => {
  const db = freshDb();
  mark(db, '2026-08-26');
  mark(db, '2026-08-27');
  mark(db, '2026-08-28', 'fajr', 'dhuhr');
  assert.equal(getStats(db, { now: MORNING }).streak.current, 2);
});

test('streak: a gap resets current; longest remembers the best run', () => {
  const db = freshDb();
  mark(db, '2026-08-24');
  mark(db, '2026-08-25');
  mark(db, '2026-08-27');
  const { streak } = getStats(db, { now: MORNING });
  assert.equal(streak.current, 1);
  assert.equal(streak.longest, 2);
});

test('streak: retroactively filling the gap repairs the streak', () => {
  const db = freshDb();
  mark(db, '2026-08-24');
  mark(db, '2026-08-25');
  mark(db, '2026-08-27');
  mark(db, '2026-08-26');
  const { streak } = getStats(db, { now: MORNING });
  assert.equal(streak.current, 4);
  assert.equal(streak.longest, 4);
});

test('completion: denominator excludes future days and open windows', () => {
  const db = freshDb();
  mark(db, '2026-08-25');
  mark(db, '2026-08-26');
  mark(db, '2026-08-27');
  mark(db, '2026-08-28', 'fajr');
  const { month } = getStats(db, { now: MORNING, month: '2026-08' });
  assert.equal(month.month, '2026-08');
  assert.equal(month.due, 16);
  assert.equal(month.prayed, 16);
  assert.equal(month.completionPct, 100);
});

test('completion: partial month', () => {
  const db = freshDb();
  mark(db, '2026-08-25');
  const { month } = getStats(db, { now: MORNING });
  assert.equal(month.due, 16);
  assert.equal(month.prayed, 5);
  assert.equal(month.completionPct, 31.3);
});

test('completion: a month with no due slots reports null', () => {
  const db = freshDb();
  const { month } = getStats(db, { now: MORNING, month: '2026-09' });
  assert.equal(month.due, 0);
  assert.equal(month.completionPct, null);
});
