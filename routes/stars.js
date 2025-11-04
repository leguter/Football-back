const express = require("express");
const db = require("../db");
const authMiddleware = require("../middleware/authMiddleware");
const axios = require("axios");

const router = express.Router();
router.use(authMiddleware);

// ==============================
// 💰 Створення інвойсу (депозит)
// ==============================
router.post("/deposit", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { amount } = req.body;

    if (!amount || amount <= 0)
      return res.status(400).json({ success: false, message: "Invalid amount" });

    const botToken = process.env.BOT_TOKEN;
    const payload = `deposit_${telegramId}_${amount}_${Date.now()}`;

    // Створюємо лінк на оплату в Telegram (XTR)
    const response = await axios.post(
      `https://api.telegram.org/bot${botToken}/createInvoiceLink`,
      {
        title: "Поповнення балансу ⭐",
        description: `Поповнення на ${amount} зірок`,
        payload,
        currency: "XTR", // Telegram Stars
        prices: [{ label: "Deposit", amount }],
      }
    );

    if (response.data?.ok && response.data.result) {
      res.json({
        success: true,
        invoice_link: response.data.result,
        payload,
      });
    } else {
      throw new Error("Telegram API error");
    }
  } catch (err) {
    console.error("Create invoice error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Failed to create invoice" });
  }
});

// ==============================
// ✅ Завершення депозиту (оновлює баланс)
// ==============================
router.post("/deposit/complete", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { payload } = req.body;

    if (!payload)
      return res.status(400).json({ success: false, message: "Payload missing" });

    // payload: deposit_<telegramId>_<amount>_<timestamp>
    const [, , amountStr] = payload.split("_");
    const amount = parseInt(amountStr, 10);

    // 🔹 Просто додаємо зірки без бонусів
    const updateRes = await db.query(
      "UPDATE users SET internal_stars = internal_stars + $1 WHERE telegram_id = $2 RETURNING internal_stars",
      [amount, telegramId]
    );

    const newBalance = updateRes.rows[0].internal_stars;

    // 🔹 Логуємо депозит
    await db.query(
      "INSERT INTO deposits (telegram_id, amount, total_added) VALUES ($1, $2, $3)",
      [telegramId, amount, amount]
    );

    res.json({ success: true, internal_stars: newBalance });
  } catch (err) {
    console.error("Complete deposit error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==============================
// 💸 Вивід зірок
// ==============================
router.post("/withdraw", async (req, res) => {
  try {
    const { telegramId } = req.user;
    const { amount } = req.body;

    if (!amount || amount <= 0)
      return res.status(400).json({ success: false, message: "Invalid amount" });

    const userRes = await db.query(
      "SELECT internal_stars FROM users WHERE telegram_id = $1",
      [telegramId]
    );
    const currentBalance = userRes.rows[0]?.internal_stars || 0;

    if (currentBalance < amount)
      return res
        .status(400)
        .json({ success: false, message: "Недостатньо зірок для виводу" });

    // Створюємо заявку на вивід
    await db.query(
      "INSERT INTO withdrawals (telegram_id, amount, status) VALUES ($1, $2, $3)",
      [telegramId, amount, "pending"]
    );

    // Зменшуємо баланс
    const updateRes = await db.query(
      "UPDATE users SET internal_stars = internal_stars - $1 WHERE telegram_id = $2 RETURNING internal_stars",
      [amount, telegramId]
    );

    const newBalance = updateRes.rows[0].internal_stars;

    // Повідомлення користувачу
    const botToken = process.env.BOT_TOKEN;
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: telegramId,
      text: `💸 Ваш запит на вивід ${amount}⭐ отримано! Очікуйте підтвердження.`,
    });

    res.json({ success: true, internal_stars: newBalance });
  } catch (err) {
    console.error("Withdraw error:", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
