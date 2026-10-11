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
// Temporary diagnostic: was this initData issued for OUR bot at all?
// Telegram co-signs initData with Ed25519 over "{bot_id}:WebAppData\n..." —
// verifiable with only the public key and the bot id.
const TELEGRAM_ED25519_PUBKEY = 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d';

function signedForBot(initData, botId) {
  try {
    const params = new URLSearchParams(initData);
    const signature = params.get('signature');
    if (!signature) return 'no-signature';
    params.delete('signature');
    params.delete('hash');
    const dataCheckString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const message = Buffer.from(`${botId}:WebAppData\n${dataCheckString}`);
    const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const key = crypto.createPublicKey({
      key: Buffer.concat([spkiPrefix, Buffer.from(TELEGRAM_ED25519_PUBKEY, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    const sig = Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    return crypto.verify(null, message, key, sig) ? 'ours' : 'other-bot';
  } catch (err) {
    return `sig-err:${err.message}`;
  }
}

export function telegramAuth({ botToken, ownerId }, now) {
  return (req, res, next) => {
    const raw = req.get('x-telegram-init-data') ?? '';
    const user = validateInitData(raw, botToken, now().getTime());
    if (!user) {
      const params = new URLSearchParams(raw);
      const ageH = (now().getTime() / 1000 - Number(params.get('auth_date') || 0)) / 3600;
      const reason = !raw ? 'no-header'
        : !params.get('hash') ? 'no-hash'
        : ageH > 24 ? `stale:${Math.round(ageH)}h`
        : !params.get('user') ? 'no-user'
        : `bad-hash sig=${signedForBot(raw, botToken.split(':')[0])}`;
      console.log('auth fail:', JSON.stringify({ path: req.path, reason, raw }));
      return res.status(401).json({ error: `Open this app from the Telegram bot [${reason}]` });
    }
    if (user.id !== ownerId) {
      console.log('auth wrong user:', user.id);
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
