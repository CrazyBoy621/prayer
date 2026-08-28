import { Router } from 'express';
import { todayInTimezone } from '../db.js';
import { getSettings } from '../settings.js';
import { timesFor } from '../prayerTimes.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function timesRouter(db, now) {
  const router = Router();

  router.get('/', async (req, res) => {
    const settings = await getSettings(db);
    const date = req.query.date ?? todayInTimezone(settings.timezone, now());
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
      return res.status(400).json({ error: `Invalid date: ${date}` });
    }
    const { times, timestamps } = timesFor(date, settings);
    res.json({
      date,
      timezone: settings.timezone,
      times,
      timestamps,
      method: settings.method,
      madhab: settings.madhab,
    });
  });

  return router;
}
