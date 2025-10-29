// routes/auth.js
const express = require("express");
const crypto = require("crypto");
const pool = require("../db");

const router = express.Router();

/**
 * Перевіряє підпис Telegram WebApp initData
 * @param {string} initData - рядок initData з Telegram WebApp
 * @param {string} botToken - токен вашого бота
 * @returns {object|false} - об'єкт даних користувача або false, якщо невалідно
 */
function verifyTelegramInitData(initData, botToken) {
  if (!initData || typeof initData !== "string") return false;

  // Telegram іноді передає через '&', тому спробуємо і це, і '\n'
  const parts = initData.includes("&")
    ? initData.split("&")
    : initData.split("\n");

  const params = {};
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) params[key] = decodeURIComponent(value);
  }

  const hash = params.hash;
  if (!hash) return false;
  delete params.hash;

  // Формуємо строку для перевірки
  const dataCheckString = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("\n");

  // Створюємо HMAC-SHA256 підпис
  const secret = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  // Повертаємо об'єкт, якщо підпис збігається
  return hmac === hash ? params : false;
}

/**
 * POST /api/auth/telegram
 * Реєстрація або оновлення користувача через Telegram WebApp
 */
router.post("/telegram", async (req, res) => {
  try {
    const { initData } = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!initData || !botToken) {
      return res.status(400).json({ error: "Missing initData or bot token" });
    }

    const parsed = verifyTelegramInitData(initData, botToken);
    if (!parsed) {
      return res.status(403).json({ error: "Invalid Telegram login data" });
    }

    const telegramId = parsed.id;
    const username =
      parsed.username || parsed.first_name || "tg_user_" + telegramId;

    const query = `
      INSERT INTO users (telegram_id, username)
      VALUES ($1, $2)
      ON CONFLICT (telegram_id)
      DO UPDATE SET username = EXCLUDED.username
      RETURNING id, telegram_id, username, created_at;
    `;

    const result = await pool.query(query, [telegramId, username]);
    const user = result.rows[0];

    res.json({ ok: true, user });
  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ error: "Server error during Telegram auth" });
  }
});

module.exports = router;
