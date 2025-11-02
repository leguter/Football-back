const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db');

// ✅ Функція перевірки підпису від Telegram
function verifyTelegramInitData(initData) {
  const secret = crypto.createHmac('sha256', 'WebAppData')
    .update(process.env.BOT_TOKEN) // ⚠️ Твій Telegram Bot Token
    .digest();

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const calculatedHash = crypto
    .createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');

  if (calculatedHash !== hash) return null;

  try {
    const userData = JSON.parse(params.get('user'));
    return userData;
  } catch (e) {
    return null;
  }
}

// ✅ POST /api/auth — авторизація через Telegram initData
router.post('/', async (req, res) => {
  try {
    const { initData } = req.body;
    if (!initData) return res.status(400).json({ message: 'No initData provided' });

    const user = verifyTelegramInitData(initData);
    if (!user) return res.status(403).json({ message: 'Invalid initData' });

    // Заносимо або оновлюємо користувача в БД
    await pool.query(
      `INSERT INTO users(id, username, first_name, last_name)
       VALUES($1, $2, $3, $4)
       ON CONFLICT (id)
       DO UPDATE SET username=$2, first_name=$3, last_name=$4`,
      [user.id, user.username, user.first_name, user.last_name]
    );

    res.json({
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name
    });
  } catch (err) {
    console.error('❌ Auth error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
