import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const FIXED_NOW = new Date('2026-08-28T05:00:00Z');
const BOT_TOKEN = '12345:TEST_TOKEN';
const OWNER_ID = 777;
const WEBHOOK_SECRET = 'hook-secret';

function signedInitData(user, { authDate = Math.floor(FIXED_NOW.getTime() / 1000), botToken = BOT_TOKEN } = {}) {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'AAE-test');
  params.set('user', JSON.stringify(user));
  const dataCheckString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

async function startServer(t, { send } = {}) {
  const db = await createDb({ url: ':memory:' });
  const app = createApp(db, {
    now: () => FIXED_NOW,
    telegram: {
      botToken: BOT_TOKEN,
      ownerId: OWNER_ID,
      webhookSecret: WEBHOOK_SECRET,
      appUrl: 'https://example.test',
      send,
    },
  });
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;
  const api = async (path, options) => {
    const res = await fetch(base + path, options);
    return { status: res.status, body: await res.json() };
  };
  return { api };
}

test('api requires valid owner initData when telegram auth is configured', async (t) => {
  const { api } = await startServer(t);

  // no header
  assert.equal((await api('/api/settings')).status, 401);

  // valid signature, wrong user
  const stranger = await api('/api/settings', {
    headers: { 'x-telegram-init-data': signedInitData({ id: 999, first_name: 'X' }) },
  });
  assert.equal(stranger.status, 403);

  // tampered payload
  const tampered = signedInitData({ id: OWNER_ID, first_name: 'Me' }).replace('777', '999');
  assert.equal((await api('/api/settings', {
    headers: { 'x-telegram-init-data': tampered },
  })).status, 401);

  // stale auth_date (48h old)
  const stale = signedInitData({ id: OWNER_ID, first_name: 'Me' }, {
    authDate: Math.floor(FIXED_NOW.getTime() / 1000) - 48 * 3600,
  });
  assert.equal((await api('/api/settings', {
    headers: { 'x-telegram-init-data': stale },
  })).status, 401);

  // the owner with a fresh valid signature
  const ok = await api('/api/settings', {
    headers: { 'x-telegram-init-data': signedInitData({ id: OWNER_ID, first_name: 'Me' }) },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.timezone, 'Asia/Tashkent');
});

test('webhook rejects requests without the Telegram secret token', async (t) => {
  const { api } = await startServer(t);
  const res = await api('/api/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: { from: { id: OWNER_ID }, chat: { id: OWNER_ID }, text: '/start' } }),
  });
  assert.equal(res.status, 401);
});

test('webhook answers the owner with an open-app button', async (t) => {
  const sent = [];
  const { api } = await startServer(t, { send: async (payload) => { sent.push(payload); } });
  const res = await api('/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
    },
    body: JSON.stringify({ message: { from: { id: OWNER_ID }, chat: { id: OWNER_ID }, text: '/start' } }),
  });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat_id, OWNER_ID);
  const button = sent[0].reply_markup.inline_keyboard[0][0];
  assert.equal(button.web_app.url, 'https://example.test');
});

test('webhook ignores messages from strangers', async (t) => {
  const sent = [];
  const { api } = await startServer(t, { send: async (payload) => { sent.push(payload); } });
  const res = await api('/api/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
    },
    body: JSON.stringify({ message: { from: { id: 999 }, chat: { id: 999 }, text: '/start' } }),
  });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
});

test('without telegram config the api stays open (local dev)', async (t) => {
  const db = await createDb({ url: ':memory:' });
  const app = createApp(db, { now: () => FIXED_NOW });
  const server = app.listen(0);
  t.after(() => server.close());
  const res = await fetch(`http://localhost:${server.address().port}/api/settings`);
  assert.equal(res.status, 200);
});
