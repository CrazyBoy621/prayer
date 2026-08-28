export function telegramFromEnv(env = process.env) {
  if (!env.BOT_TOKEN) return undefined;
  return {
    botToken: env.BOT_TOKEN,
    ownerId: Number(env.OWNER_TELEGRAM_ID) || undefined,
    webhookSecret: env.WEBHOOK_SECRET,
    appUrl: env.APP_URL,
  };
}
