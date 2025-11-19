const express = require("express");
const router = express.Router();
const pool = require("../db");

function extractTelegramId(initData) {
  try {
    const params = new URLSearchParams(initData);
    const rawUser = params.get("user");
    if (!rawUser) return null;

    const decoded = decodeURIComponent(rawUser);
    const user = JSON.parse(decoded);
    return user.id;
  } catch (e) {
    console.error("extractTelegramId error:", e);
    return null;
  }
}

async function getDbUser(telegramId) {
  const res = await pool.query(
    `SELECT id, balance FROM users WHERE telegram_id=$1`,
    [telegramId]
  );
  return res.rows[0];
}

// ====================== START GAME ======================
router.post("/start", async (req, res) => {
  try {
    const { initData, stake = 100 } = req.body;
    const telegramId = extractTelegramId(initData);

    if (!telegramId)
      return res.status(400).json({ success: false, message: "Invalid initData" });

    let user = await getDbUser(telegramId);

    if (!user) {
      const createRes = await pool.query(
        `INSERT INTO users(telegram_id, balance, created_at, updated_at)
         VALUES($1, 1000, NOW(), NOW())
         RETURNING id, balance`,
        [telegramId]
      );
      user = createRes.rows[0];
    }

    if (user.balance < stake)
      return res.status(400).json({ success: false, message: "Недостатньо зірок" });

    const userId = user.id;

    await pool.query(
      `UPDATE users SET balance=balance-$1, updated_at=NOW()
       WHERE telegram_id=$2`,
      [stake, telegramId]
    );

    await pool.query(
      `INSERT INTO games(user_id, stake, multiplier, last_result, updated_at)
       VALUES($1, $2, 1.0, NULL, NOW())
       ON CONFLICT(user_id)
       DO UPDATE SET stake=$2, multiplier=1.0, last_result=NULL, updated_at=NOW()`,
      [userId, stake]
    );

    return res.json({
      success: true,
      balance: user.balance - stake,
      stake,
      multiplier: 1.0,
    });
  } catch (err) {
    console.error("start error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ====================== SHOOT ======================
router.post("/shoot", async (req, res) => {
  try {
    const { initData, angleId } = req.body;
    const telegramId = extractTelegramId(initData);

    if (!telegramId || !angleId)
      return res.status(400).json({ success: false, message: "Invalid data" });

    const user = await getDbUser(telegramId);
    if (!user)
      return res.status(400).json({ success: false, message: "User not found" });

    const gameRes = await pool.query(
      `SELECT * FROM games WHERE user_id=$1`,
      [user.id]
    );
    const game = gameRes.rows[0];

    if (!game)
      return res.status(400).json({ success: false, message: "Game not found" });

    const currentMultiplier = parseFloat(game.multiplier);
    const guessChance = Math.min(0.35 + (currentMultiplier - 1.0) * 0.12, 0.9);
    const willGuess = Math.random() < guessChance;

    const keeperAngleId = willGuess ? angleId : Math.ceil(Math.random() * 5);
    const isGoal = keeperAngleId !== angleId;

    const newMultiplier = isGoal
      ? +(currentMultiplier + (0.4 + Math.random() * 0.3)).toFixed(2)
      : 1.0;

    await pool.query(
      `UPDATE games
       SET multiplier=$1, last_result=$2, updated_at=NOW()
       WHERE user_id=$3`,
      [
        newMultiplier,
        JSON.stringify({ keeperAngleId, isGoal }),
        user.id,
      ]
    );

    return res.json({
      success: true,
      keeperAngleId,
      isGoal,
      multiplier: newMultiplier,
    });
  } catch (err) {
    console.error("shoot error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ====================== CASHOUT ======================
router.post("/cashout", async (req, res) => {
  try {
    const { initData } = req.body;
    const telegramId = extractTelegramId(initData);

    if (!telegramId)
      return res.status(400).json({ success: false, message: "Invalid initData" });

    const user = await getDbUser(telegramId);
    if (!user)
      return res.status(400).json({ success: false, message: "User not found" });

    const gameRes = await pool.query(
      `SELECT * FROM games WHERE user_id=$1`,
      [user.id]
    );
    const game = gameRes.rows[0];

    if (!game)
      return res.status(400).json({ success: false, message: "Game not found" });

    if (game.multiplier === 1.0)
      return res.status(400).json({ success: false, message: "Немає виграшу" });

    const winnings = Math.floor(game.stake * game.multiplier);

    await pool.query(
      `UPDATE users SET balance=balance+$1 WHERE telegram_id=$2`,
      [winnings, telegramId]
    );

    await pool.query(
      `UPDATE games
       SET multiplier=1.0, last_result=NULL, updated_at=NOW()
       WHERE user_id=$1`,
      [user.id]
    );

    return res.json({
      success: true,
      winnings,
      balance: user.balance + winnings,
    });
  } catch (err) {
    console.error("cashout error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
