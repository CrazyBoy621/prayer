import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './db.js';
import { createApp } from './app.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.DB_PATH ?? path.join(root, 'data', 'prayer.db');
const port = Number(process.env.PORT ?? 3000);

const db = createDb(dbPath);
const app = createApp(db);

app.listen(port, () => {
  console.log(`Prayer tracker running at http://localhost:${port}`);
});
