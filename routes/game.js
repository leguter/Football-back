const express = require("express");
const router = express.Router();
const pool = require("../db");

// --- Decode Telegram user data ---
function extractTelegramId(initData) {
  try {
    const params = new URLSearchParams(initData);
    const rawUser = params.get("user");
    if (!rawUser) return null;
    const user = JSON.parse(decodeURIComponent(rawUser));
    return user.id;
  } catch (err) {
    console.error("extractTelegramId error:", err);
    return null;
  }
}

// --- Start Game ---
router.post("/start", async (req, res) => {
  try {
    const { initData, stake = 100 } = req.body;
    const telegramId = extractTelegramId(initData);

    if (!telegramId)
      return res.status(400).json({ message: "Invalid initData" });

    const userRes = await pool.query(
      "SELECT balance FROM users WHERE telegram_id=$1",
      [telegramId]
    );
    const user = userRes.rows[0];

    if (!user)
      return res.status(404).json({ message: "User not found" });

    if (user.balance < stake)
      return res.status(400).json({ message: "Недостатньо зірок" });

    await pool.query(
      "UPDATE users SET balance=balance-$1 WHERE telegram_id=$2",
      [stake, telegramId]
    );

    await pool.query(
      `INSERT INTO games(user_id, stake, multiplier, last_result, updated_at)
       VALUES($1, $2, 1.0, NULL, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET stake=$2, multiplier=1.0, last_result=NULL, updated_at=NOW()`,
      [telegramId, stake]
    );

    return res.json({
      success: true,
      balance: user.balance - stake,
      stake,
      multiplier: 1.0,
    });
  } catch (err) {
    console.error("start error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// --- Shoot ---
router.post("/shoot", async (req, res) => {
  try {
    const { initData, angleId } = req.body;
    const telegramId = extractTelegramId(initData);

    if (!telegramId || !angleId)
      return res.status(400).json({ message: "Invalid data" });

    const gameRes = await pool.query(
      "SELECT stake, multiplier FROM games WHERE user_id=$1",
      [telegramId]
    );
    const game = gameRes.rows[0];
    if (!game)
      return res.status(404).json({ message: "Game not found" });

    const stake = parseInt(game.stake);
    const currentMult = parseFloat(game.multiplier);

    // 📌 Чим більший множник — тим більше шанс сейву (до 90%)
    const guessChance = Math.min(0.35 + (currentMult - 1.0) * 0.12, 0.9);
    const willGuess = Math.random() < guessChance;

    const keeperAngleId = willGuess
      ? angleId
      : Math.ceil(Math.random() * 5);

    const isGoal = keeperAngleId !== angleId;

    const newMultiplier = isGoal
      ? +(currentMult + (0.4 + Math.random() * 0.3)).toFixed(2)
      : 1.0;

    // 📌 Запис в історію (до оновлення множника)
    await pool.query(
      `INSERT INTO game_history (telegram_id, type, amount, multiplier)
       VALUES ($1, $2, $3, $4)`,
      [
        telegramId,
        isGoal ? "Win" : "Loss",
        isGoal ? 0 : -stake,
        currentMult
      ]
    );

    // 📌 Оновлюємо поточну гру
    await pool.query(
      `UPDATE games
       SET multiplier=$1, last_result=$2, updated_at=NOW()
       WHERE user_id=$3`,
      [
        newMultiplier,
        JSON.stringify({ keeperAngleId, isGoal }),
        telegramId,
      ]
    );

    res.json({
      success: true,
      keeperAngleId,
      isGoal,
      multiplier: newMultiplier,
    });

  } catch (err) {
    console.error("shoot error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// --- Cashout ---
router.post("/cashout", async (req, res) => {
  try {
    const { initData } = req.body;
    const telegramId = extractTelegramId(initData);

    if (!telegramId)
      return res.status(400).json({ message: "Invalid initData" });

    const gameRes = await pool.query(
      "SELECT stake, multiplier FROM games WHERE user_id=$1",
      [telegramId]
    );
    const game = gameRes.rows[0];
    if (!game)
      return res.status(404).json({ message: "Game not found" });

    const stake = parseInt(game.stake);
    const currentMult = parseFloat(game.multiplier);

    if (currentMult === 1.0)
      return res.status(400).json({ message: "Немає виграшу" });

    const winnings = Math.floor(stake * currentMult);

    // 📌 Додаємо виграш гравцю
    await pool.query(
      "UPDATE users SET balance = balance + $1 WHERE telegram_id=$2",
      [winnings, telegramId]
    );

    // 📌 Записуємо Cashout в історію
    await pool.query(
      `INSERT INTO game_history (telegram_id, type, amount, multiplier)
       VALUES ($1, $2, $3, $4)`,
      [
        telegramId,
        "Cashout",
        winnings,
        currentMult
      ]
    );

    // 📌 Скидаємо множник у грі
    await pool.query(
      `UPDATE games
       SET multiplier = 1.0, last_result = NULL, updated_at = NOW()
       WHERE user_id = $1`,
      [telegramId]
    );

    res.json({ success: true, winnings });

  } catch (err) {
    console.error("cashout error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/history", async (req, res) => {
  try {
    const { initData } = req.body;
    const telegramId = extractTelegramId(initData);

    if (!telegramId) return res.status(400).json({ message: "Invalid initData" });

    const result = await pool.query(
      `SELECT type, amount, multiplier, created_at
       FROM game_history
       WHERE telegram_id=$1
       ORDER BY id DESC
       LIMIT 50`,
      [telegramId]
    );

    res.json({ success: true, history: result.rows });
  } catch (err) {
    console.error("history error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
