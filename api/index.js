import { createDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { telegramFromEnv } from '../server/config.js';

const db = await createDb({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export default createApp(db, { telegram: telegramFromEnv() });
