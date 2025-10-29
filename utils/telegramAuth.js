// utils/telegramAuth.js
import crypto from "crypto";

export function verifyTelegramAuth(initData, botToken) {
  const secret = crypto.createHash("sha256").update(botToken).digest();
  const data = new URLSearchParams(initData);
  const hash = data.get("hash");
  data.delete("hash");

  const checkString = [...data.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(checkString)
    .digest("hex");

  return hmac === hash;
}
