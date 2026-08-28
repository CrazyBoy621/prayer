import { Router } from 'express';
import { getStats } from '../stats.js';

export function statsRouter(db, now) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { month } = req.query;
    if (month !== undefined && !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: `Invalid month: ${month}` });
    }
    res.json(await getStats(db, { now: now(), month }));
  });

  return router;
}
