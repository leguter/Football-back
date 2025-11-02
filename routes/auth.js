// /routes/auth.js (CommonJS)
const express = require('express');
const jwt = require('jsonwebtoken');
const { checkTelegramAuth } = require('../utils/telegramAuth');
require('dotenv').config();

const router = express.Router();

router.post('/login', (req, res) => {
  const data = req.body || {};

  if (!checkTelegramAuth(data)) {
    return res.status(401).json({ success: false, error: 'Invalid Telegram data' });
  }

  const token = jwt.sign(
    { id: data.id, username: data.username, first_name: data.first_name },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ success: true, data: { token } });
});

module.exports = router;
