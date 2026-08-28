import { Router } from 'express';
import { getSettings, updateSettings } from '../settings.js';

export function settingsRouter(db) {
  const router = Router();

  router.get('/', async (req, res) => {
    res.json(await getSettings(db));
  });

  router.put('/', async (req, res) => {
    res.json(await updateSettings(db, req.body ?? {}));
  });

  return router;
}
