import { Router } from 'express';
import { PRAYERS } from '../db.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateParams(req, res, next) {
  const { date, prayer } = req.params;
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
    return res.status(400).json({ error: `Invalid date: ${date}` });
  }
  if (!PRAYERS.includes(prayer)) {
    return res.status(400).json({ error: `Invalid prayer: ${prayer}` });
  }
  next();
}

export function recordsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { from, to } = req.query;
    if (!DATE_RE.test(from ?? '') || !DATE_RE.test(to ?? '')) {
      return res.status(400).json({ error: 'from and to are required as YYYY-MM-DD' });
    }
    const rows = db.prepare(
      'SELECT date, prayer FROM prayer_records WHERE date BETWEEN ? AND ? ORDER BY date',
    ).all(from, to);
    const byDate = {};
    for (const { date, prayer } of rows) (byDate[date] ??= []).push(prayer);
    res.json(byDate);
  });

  router.put('/:date/:prayer', validateParams, (req, res) => {
    const { date, prayer } = req.params;
    db.prepare('INSERT OR IGNORE INTO prayer_records (date, prayer) VALUES (?, ?)').run(date, prayer);
    res.json({ date, prayer, prayed: true });
  });

  router.delete('/:date/:prayer', validateParams, (req, res) => {
    const { date, prayer } = req.params;
    db.prepare('DELETE FROM prayer_records WHERE date = ? AND prayer = ?').run(date, prayer);
    res.json({ date, prayer, prayed: false });
  });

  return router;
}
