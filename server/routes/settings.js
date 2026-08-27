import { Router } from 'express';
import { getSettings, updateSettings } from '../settings.js';

export function settingsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(getSettings(db));
  });

  router.put('/', (req, res) => {
    res.json(updateSettings(db, req.body ?? {}));
  });

  return router;
}
