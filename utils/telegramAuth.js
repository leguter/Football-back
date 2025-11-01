import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

export function checkTelegramAuth(data) {
  const { hash, ...userData } = data;
  const secretKey = crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN).digest();

  const dataCheckString = Object.keys(userData)
    .sort()
    .map(key => `${key}=${userData[key]}`)
    .join('\n');

  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return hmac === hash;
}
