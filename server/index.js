import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';
import { createApp } from './app.js';
import { telegramFromEnv } from './config.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbUrl = process.env.TURSO_DATABASE_URL ?? `file:${path.join(root, 'data', 'prayer.db')}`;
const port = Number(process.env.PORT ?? 3000);

const db = await createDb({ url: dbUrl, authToken: process.env.TURSO_AUTH_TOKEN });
const app = createApp(db, { telegram: telegramFromEnv() });

app.listen(port, () => {
  console.log(`Prayer tracker running at http://localhost:${port}`);
});
