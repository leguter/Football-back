const express = require('express');
const router = express.Router();
const pool = require('../db');

const GAME_ANGLES = [1, 2, 3, 4, 5];

// ✅ Витягує user.id з initData (перевірку робить фронт)
function extractUserId(initData) {
  try {
    const params = new URLSearchParams(initData);
    const user = JSON.parse(params.get('user'));
    return user?.id || null;
  } catch {
    return null;
  }
}

// ✅ Старт гри або ресет
router.post('/start', async (req, res) => {
  try {
    const { initData, stake = 100 } = req.body;
    const userId = extractUserId(initData);
    if (!userId) return res.status(400).json({ message: 'Invalid initData' });

    const userRes = await pool.query(`SELECT * FROM users WHERE id=$1`, [userId]);
    const user = userRes.rows[0];

    if (!user) {
      await pool.query(`INSERT INTO users(id, balance) VALUES($1, 1000)`, [userId]);
    } else if (user.balance < stake) {
      return res.status(400).json({ message: 'Недостатньо зірок для ставки' });
    }

    // Віднімаємо ставку
    await pool.query(`UPDATE users SET balance = balance - $1 WHERE id=$2`, [stake, userId]);

    await pool.query(
      `INSERT INTO games(user_id, stake, multiplier, last_result, is_shooting, updated_at)
       VALUES($1, $2, 1.0, NULL, FALSE, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET stake=$2, multiplier=1.0, last_result=NULL, is_shooting=FALSE, updated_at=NOW()`,
      [userId, stake]
    );

    const updatedUser = await pool.query(`SELECT balance FROM users WHERE id=$1`, [userId]);
    res.json({ balance: updatedUser.rows[0].balance, stake, multiplier: 1.0 });
  } catch (err) {
    console.error('❌ startGame error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Удар
// ✅ Удар з прогресією складності
router.post('/shoot', async (req, res) => {
  try {
    const { initData, angleId } = req.body;
    const userId = extractUserId(initData);
    if (!userId || !angleId) return res.status(400).json({ message: 'Invalid data' });

    const gameRes = await pool.query(`SELECT * FROM games WHERE user_id=$1`, [userId]);
    const game = gameRes.rows[0];
    if (!game) return res.status(404).json({ message: 'Game not found' });

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
    const newMultiplier = isGoal
      ? +(game.multiplier + (0.4 + Math.random() * 0.3)).toFixed(2)
      : 1.0;

    await pool.query(
      `UPDATE games
       SET multiplier=$1, last_result=$2, is_shooting=FALSE, updated_at=NOW()
       WHERE user_id=$3`,
      [newMultiplier, JSON.stringify({ keeperAngleId, isGoal }), userId]
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
    const userId = extractUserId(initData);
    if (!userId) return res.status(400).json({ message: 'Invalid initData' });

    const gameRes = await pool.query(`SELECT * FROM games WHERE user_id=$1`, [userId]);
    const game = gameRes.rows[0];
    if (!game) return res.status(404).json({ message: 'Game not found' });
    if (game.multiplier === 1.0) return res.status(400).json({ message: 'Немає виграшу для кешауту' });

    const winnings = Math.floor(game.stake * game.multiplier);

    await pool.query(
      `UPDATE users SET balance = balance + $1 WHERE id=$2`,
      [winnings, userId]
    );

    await pool.query(
      `UPDATE games
       SET multiplier=1.0, last_result=NULL, updated_at=NOW()
       WHERE user_id=$1`,
      [userId]
    );

    const userRes = await pool.query(`SELECT balance FROM users WHERE id=$1`, [userId]);
    res.json({ winnings, balance: userRes.rows[0].balance });
  } catch (err) {
    console.error('❌ cashout error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;
