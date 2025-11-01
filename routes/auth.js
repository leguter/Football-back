import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { checkTelegramAuth } from '../utils/telegramAuth.js';
dotenv.config();

const router = express.Router();

router.post('/login', (req, res) => {
  const data = req.body;

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

export default router;
