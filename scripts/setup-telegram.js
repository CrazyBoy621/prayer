// One-time Telegram wiring: point the bot's webhook at the deployed app and
// make the chat menu button open the mini app.
// Usage: BOT_TOKEN=... APP_URL=https://... WEBHOOK_SECRET=... node scripts/setup-telegram.js

const { BOT_TOKEN, APP_URL, WEBHOOK_SECRET } = process.env;
if (!BOT_TOKEN || !APP_URL || !WEBHOOK_SECRET) {
  console.error('Required env vars: BOT_TOKEN, APP_URL, WEBHOOK_SECRET');
  process.exit(1);
}

async function tg(method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`${method}: ${body.description}`);
  return body.result;
}

const me = await tg('getMe');
console.log(`Bot: @${me.username}`);

await tg('setWebhook', {
  url: `${APP_URL}/api/telegram/webhook`,
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message'],
});
console.log(`Webhook -> ${APP_URL}/api/telegram/webhook`);

await tg('setChatMenuButton', {
  menu_button: { type: 'web_app', text: 'Open', web_app: { url: APP_URL } },
});
console.log('Menu button set to open the mini app.');
