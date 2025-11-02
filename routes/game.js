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

    await pool.query(
      `INSERT INTO users(id) VALUES($1)
       ON CONFLICT (id) DO NOTHING`,
      [userId]
    );

    const result = await pool.query(
      `INSERT INTO games(user_id, stake, multiplier, last_result, is_shooting, updated_at)
       VALUES($1, $2, 1.0, NULL, FALSE, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET stake=$2, multiplier=1.0, last_result=NULL, is_shooting=FALSE, updated_at=NOW()
       RETURNING stake, multiplier, last_result`,
      [userId, stake]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ startGame error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Удар
router.post('/shoot', async (req, res) => {
  try {
    const { initData, angleId } = req.body;
    const userId = extractUserId(initData);
    if (!userId || !angleId) return res.status(400).json({ message: 'Invalid data' });

    const gameRes = await pool.query(`SELECT * FROM games WHERE user_id=$1`, [userId]);
    const game = gameRes.rows[0];
    if (!game) return res.status(404).json({ message: 'Game not found' });
    if (game.is_shooting) return res.status(400).json({ message: 'Already shooting' });

    // Логіка гри
    const guessChance = Math.min(0.5 + (game.multiplier - 1.0) * 0.1, 0.9);
    const willGuess = Math.random() < guessChance;
    let keeperAngleId;

    if (willGuess) keeperAngleId = angleId;
    else {
      do keeperAngleId = Math.floor(Math.random() * GAME_ANGLES.length) + 1;
      while (keeperAngleId === angleId);
    }

    const isGoal = keeperAngleId !== angleId;
    const newMultiplier = isGoal
      ? Math.floor((game.multiplier + 0.4 + Math.random() * 0.2) * 100) / 100
      : 1.0;

    const updated = await pool.query(
      `UPDATE games
       SET multiplier=$1, last_result=$2, is_shooting=FALSE, updated_at=NOW()
       WHERE user_id=$3
       RETURNING multiplier, last_result`,
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

// ✅ Cashout
router.post('/cashout', async (req, res) => {
  try {
    const { initData } = req.body;
    const userId = extractUserId(initData);
    if (!userId) return res.status(400).json({ message: 'Invalid initData' });

    const gameRes = await pool.query(`SELECT * FROM games WHERE user_id=$1`, [userId]);
    const game = gameRes.rows[0];
    if (!game) return res.status(404).json({ message: 'Game not found' });
    if (game.multiplier === 1.0) return res.status(400).json({ message: 'No winnings' });

    const winnings = Math.floor(game.stake * game.multiplier);

    await pool.query(
      `UPDATE games
       SET multiplier=1.0, last_result=NULL, updated_at=NOW()
       WHERE user_id=$1`,
      [userId]
    );

    res.json({ winnings });
  } catch (err) {
    console.error('❌ cashout error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
