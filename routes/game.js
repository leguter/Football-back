const express = require('express');
const router = express.Router();
const pool = require('../db');

const GAME_ANGLES = [1, 2, 3, 4, 5];

// ✅ Витягує telegram_id з initData (перевірку робить фронт)

function extractTelegramId(initData) {
  console.log("🧾 RAW initData:", initData);
  try {
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    return user?.id || null; // Telegram API передає user.id
  } catch {
    return null;
  }
}

// ✅ Старт гри або ресет
router.post("/start", async (req, res) => {
  try {
    const { initData, stake = 100 } = req.body;
    const telegramId = extractTelegramId(initData);
    if (!telegramId) return res.status(400).json({ message: "Invalid initData" });

    const userRes = await pool.query("SELECT * FROM users WHERE telegram_id=$1", [telegramId]);
    let user = userRes.rows[0];

    if (!user) {
      await pool.query(
        `INSERT INTO users(telegram_id, balance, created_at, updated_at)
         VALUES($1, 1000, NOW(), NOW())`,
        [telegramId]
      );
      user = { balance: 1000 };
    } else if (user.balance < stake) {
      return res.status(400).json({ message: "Недостатньо зірок для ставки" });
    }

    await pool.query("UPDATE users SET balance = balance - $1 WHERE telegram_id=$2", [stake, telegramId]);

    await pool.query(
      `INSERT INTO games(user_id, stake, multiplier, last_result, is_shooting, updated_at)
       VALUES($1, $2, 1.0, NULL, FALSE, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET stake=$2, multiplier=1.0, last_result=NULL, is_shooting=FALSE, updated_at=NOW()`,
      [telegramId, stake]
    );

    const updated = await pool.query("SELECT balance FROM users WHERE telegram_id=$1", [telegramId]);

    return res.json({
      success: true,
      balance: updated.rows[0].balance,
      multiplier: 1.0,
      stake,
    });
  } catch (err) {
    console.error("❌ startGame error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



// ✅ Удар
router.post('/shoot', async (req, res) => {
  try {
    console.log("📥 SHOOT BODY:", req.body);
    const { initData, angleId } = req.body;
    const telegramId = extractTelegramId(initData);
    console.log("📤 Parsed telegramId:", telegramId);

    if (!telegramId || !angleId) {
      console.warn("❌ Missing telegramId or angleId");
      return res.status(400).json({ message: "Invalid data" });
    }

    // 🔹 Шанс, що воротар здогадається
    const guessChance = Math.min(0.35 + (game.multiplier - 1.0) * 0.12, 0.9);
    const willGuess = Math.random() < guessChance;

    let keeperAngleId;
    if (willGuess) keeperAngleId = angleId;
    else {
      do keeperAngleId = Math.floor(Math.random() * GAME_ANGLES.length) + 1;
      while (keeperAngleId === angleId);
    }

    const isGoal = keeperAngleId !== angleId;

    // 🔹 Якщо забив — росте множник, інакше скидається
   const currentMultiplier = parseFloat(game.multiplier) || 1.0;
const newMultiplier = isGoal
  ? +(currentMultiplier + (0.4 + Math.random() * 0.3)).toFixed(2)
  : 1.0;

    await pool.query(
      `UPDATE games
       SET multiplier=$1, last_result=$2, is_shooting=FALSE, updated_at=NOW()
       WHERE user_id=$3`,
      [newMultiplier, JSON.stringify({ keeperAngleId, isGoal }), telegramId]
    );

    res.json({
      keeperAngleId,
      isGoal,
      multiplier: newMultiplier
    });
  } catch (err) {
    console.error('❌ shoot error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Cashout з оновленням балансу
router.post('/cashout', async (req, res) => {
  try {
    const { initData } = req.body;
    const telegramId = extractTelegramId(initData);
    if (!telegramId) return res.status(400).json({ message: 'Invalid initData' });

    const gameRes = await pool.query(`SELECT * FROM games WHERE user_id=$1`, [telegramId]);
    const game = gameRes.rows[0];
    if (!game) return res.status(404).json({ message: 'Game not found' });
    if (game.multiplier === 1.0) return res.status(400).json({ message: 'Немає виграшу для кешауту' });

    const winnings = Math.floor(game.stake * game.multiplier);

    await pool.query(
      `UPDATE users SET balance = balance + $1 WHERE telegram_id=$2`,
      [winnings, telegramId]
    );

    await pool.query(
      `UPDATE games
       SET multiplier=1.0, last_result=NULL, updated_at=NOW()
       WHERE user_id=$1`,
      [telegramId]
    );

    const userRes = await pool.query(`SELECT balance FROM users WHERE telegram_id=$1`, [telegramId]);
    res.json({ winnings, balance: userRes.rows[0].balance });
  } catch (err) {
    console.error('❌ cashout error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
