import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordsRouter } from './routes/records.js';
import { timesRouter } from './routes/times.js';
import { settingsRouter } from './routes/settings.js';
import { statsRouter } from './routes/stats.js';
import { telegramAuth, telegramRouter } from './telegram.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp(db, { now = () => new Date(), telegram } = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.static(PUBLIC_DIR));

  if (telegram?.botToken) {
    // The webhook authenticates itself via Telegram's secret token header,
    // so it mounts before the owner-only initData gate.
    app.use('/api/telegram', telegramRouter(telegram));
    if (telegram.ownerId) app.use('/api', telegramAuth(telegram, now));
  }

  app.use('/api/records', recordsRouter(db));
  app.use('/api/times', timesRouter(db, now));
  app.use('/api/settings', settingsRouter(db));
  app.use('/api/stats', statsRouter(db, now));

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, next) => {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' });
  });

  return app;
}
