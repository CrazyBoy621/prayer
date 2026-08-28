import { Router } from 'express';
import crypto from 'node:crypto';

const MAX_AGE_SEC = 24 * 3600;

// First-party initData validation per Telegram's spec: HMAC-SHA256 of the
// sorted key=value pairs, keyed by HMAC("WebAppData", bot_token).
export function validateInitData(initData, botToken, nowMs) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  params.delete('signature');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const a = Buffer.from(computed);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (nowMs / 1000 - authDate > MAX_AGE_SEC) return null;

  try {
    return JSON.parse(params.get('user') ?? '');
  } catch {
    return null;
  }
}

// Locks /api to the bot owner: every request must carry initData signed by
// Telegram for the configured owner account.
export function telegramAuth({ botToken, ownerId }, now) {
  return (req, res, next) => {
    const user = validateInitData(req.get('x-telegram-init-data') ?? '', botToken, now().getTime());
    if (!user) {
      return res.status(401).json({ error: 'Open this app from the Telegram bot' });
    }
    if (user.id !== ownerId) {
      return res.status(403).json({ error: 'This is a private tracker' });
    }
    next();
  };
}

const defaultSend = (botToken) => async (payload) => {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

export function telegramRouter({ botToken, ownerId, webhookSecret, appUrl, send }) {
  const sendMessage = send ?? defaultSend(botToken);
  const router = Router();

  router.post('/webhook', async (req, res) => {
    if (req.get('x-telegram-bot-api-secret-token') !== webhookSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const message = req.body?.message;
    if (message?.chat?.id && message.from?.id === ownerId) {
      try {
        await sendMessage({
          chat_id: message.chat.id,
          text: 'Assalomu alaykum! Your prayer tracker is one tap away.',
          reply_markup: {
            inline_keyboard: [[{ text: '🕌 Open Besh Vaqt', web_app: { url: appUrl } }]],
          },
        });
      } catch {
        // Never fail the webhook: Telegram would retry the same update.
      }
    }
    res.json({ ok: true });
  });

  return router;
}
