import { PRAYERS, todayInTimezone } from './db.js';
import { getSettings } from './settings.js';
import { timesFor } from './prayerTimes.js';

// A prayer becomes qaza only once its window ends; isha's window runs to the
// end of the day, so it can only become qaza on a later day.
const WINDOW_END = { fajr: 'sunrise', dhuhr: 'asr', asr: 'maghrib', maghrib: 'isha', isha: null };

function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}

// Inclusive day count; 0 when the range is empty.
function daysBetween(from, to) {
  if (from > to) return 0;
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
}

function duePrayersToday(todayStr, settings, now) {
  const { timestamps } = timesFor(todayStr, settings);
  const due = new Set();
  for (const prayer of PRAYERS) {
    const endKey = WINDOW_END[prayer];
    if (endKey && now.getTime() > timestamps[endKey]) due.add(prayer);
  }
  return due;
}

const countByPrayer = (rows) => Object.fromEntries(rows.map((r) => [r.prayer, Number(r.n)]));

export async function getStats(db, { now, month }) {
  const settings = await getSettings(db);
  const today = todayInTimezone(settings.timezone, now);
  const yesterday = addDays(today, -1);
  const start = settings.trackingStartDate;
  const dueToday = start <= today ? duePrayersToday(today, settings, now) : new Set();

  const monthStr = month ?? today.slice(0, 7);
  const monthStart = `${monthStr}-01`;
  const [my, mm] = monthStr.split('-').map(Number);
  const monthEnd = `${monthStr}-${new Date(Date.UTC(my, mm, 0)).getUTCDate()}`;
  const monthFrom = start > monthStart ? start : monthStart;
  const monthPastTo = monthEnd < yesterday ? monthEnd : yesterday;
  const todayInMonth = today >= monthFrom && today <= monthEnd;

  // One round trip for all reads (BETWEEN with from > to is simply empty).
  const grouped = 'SELECT prayer, COUNT(*) AS n FROM prayer_records WHERE date BETWEEN ? AND ? GROUP BY prayer';
  const [pastRs, todayRs, monthRs, fullRs] = await db.batch([
    { sql: grouped, args: [start, yesterday] },
    { sql: 'SELECT prayer FROM prayer_records WHERE date = ?', args: [today] },
    { sql: grouped, args: [monthFrom, monthPastTo] },
    { sql: 'SELECT date FROM prayer_records GROUP BY date HAVING COUNT(*) = 5 ORDER BY date' },
  ], 'read');
  const pastMarked = countByPrayer(pastRs.rows);
  const todayMarked = new Set(todayRs.rows.map((r) => r.prayer));
  const monthMarked = countByPrayer(monthRs.rows);
  const fullDates = fullRs.rows.map((r) => r.date);

  // Qaza: derived per prayer as expected due slots minus marked slots.
  const byPrayer = {};
  let total = 0;
  for (const prayer of PRAYERS) {
    const expected = daysBetween(start, yesterday) + (dueToday.has(prayer) ? 1 : 0);
    const marked = (pastMarked[prayer] ?? 0)
      + (dueToday.has(prayer) && todayMarked.has(prayer) ? 1 : 0);
    const owed = Math.max(0, expected - marked);
    byPrayer[prayer] = owed;
    total += owed;
  }

  // Streak: full days (all 5 marked), consecutive runs.
  const fullSet = new Set(fullDates);
  let current = 0;
  for (let d = yesterday; fullSet.has(d); d = addDays(d, -1)) current++;
  if (fullSet.has(today)) current++;

  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of fullDates) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  // Monthly completion: same window rule as qaza, restricted to the month.
  let due = 0;
  let prayed = 0;
  for (const prayer of PRAYERS) {
    const dueTodayHere = todayInMonth && dueToday.has(prayer) ? 1 : 0;
    const duePrayer = daysBetween(monthFrom, monthPastTo) + dueTodayHere;
    const marked = (monthMarked[prayer] ?? 0)
      + (dueTodayHere && todayMarked.has(prayer) ? 1 : 0);
    due += duePrayer;
    prayed += Math.min(marked, duePrayer);
  }

  return {
    qaza: { total, byPrayer },
    streak: { current, longest },
    month: {
      month: monthStr,
      due,
      prayed,
      completionPct: due === 0 ? null : Math.round((prayed / due) * 1000) / 10,
    },
    trackingStartDate: start,
    today,
  };
}
