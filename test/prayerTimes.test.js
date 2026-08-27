import test from 'node:test';
import assert from 'node:assert/strict';
import { timesFor } from '../server/prayerTimes.js';

const tashkent = {
  latitude: 41.2995,
  longitude: 69.2401,
  timezone: 'Asia/Tashkent',
  method: 'MuslimWorldLeague',
  madhab: 'Hanafi',
};

test('timesFor returns HH:mm strings and ordered timestamps', () => {
  const { times, timestamps } = timesFor('2026-08-28', tashkent);
  for (const name of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    assert.match(times[name], /^\d{2}:\d{2}$/, name);
    assert.equal(typeof timestamps[name], 'number', name);
  }
  assert.ok(timestamps.fajr < timestamps.sunrise);
  assert.ok(timestamps.sunrise < timestamps.dhuhr);
  assert.ok(timestamps.dhuhr < timestamps.asr);
  assert.ok(timestamps.asr < timestamps.maghrib);
  assert.ok(timestamps.maghrib < timestamps.isha);
});

test('timesFor gives plausible Tashkent times in late August', () => {
  const { times } = timesFor('2026-08-28', tashkent);
  const hour = (t) => Number(t.split(':')[0]);
  assert.ok(hour(times.fajr) >= 3 && hour(times.fajr) <= 5, `fajr ${times.fajr}`);
  assert.ok(hour(times.dhuhr) >= 12 && hour(times.dhuhr) <= 13, `dhuhr ${times.dhuhr}`);
  assert.ok(hour(times.maghrib) >= 18 && hour(times.maghrib) <= 19, `maghrib ${times.maghrib}`);
});

test('Shafi madhab yields an earlier asr than Hanafi', () => {
  const hanafi = timesFor('2026-08-28', tashkent);
  const shafi = timesFor('2026-08-28', { ...tashkent, madhab: 'Shafi' });
  assert.ok(shafi.timestamps.asr < hanafi.timestamps.asr);
});
