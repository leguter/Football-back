// /services/gameService.js (CommonJS)
const pool = require('../db');
const GAME_ANGLES = [1,2,3,4,5];

async function startGame(user) {
  // Insert user if not exists
  await pool.query(
    `INSERT INTO users(id, username, first_name, last_name)
     VALUES($1, $2, $3, $4)
     ON CONFLICT(id) DO NOTHING`,
    [user.id, user.username || null, user.first_name || null, user.last_name || null]
  );

  // Create or reset game
  const res = await pool.query(
    `INSERT INTO games(user_id, stake, multiplier, last_result, is_shooting, updated_at)
     VALUES($1, $2, 1.0, NULL, FALSE, NOW())
     ON CONFLICT(user_id)
     DO UPDATE SET stake = EXCLUDED.stake, multiplier = 1.0, last_result = NULL, is_shooting = FALSE, updated_at = NOW()
     RETURNING stake, multiplier, last_result`,
    [user.id, 100]
  );

  return res.rows[0];
}

async function shoot(userId, angleId) {
  // Get game
  const gameRes = await pool.query(`SELECT * FROM games WHERE user_id=$1 FOR UPDATE`, [userId]);
  if (!gameRes.rows[0]) throw new Error('Game not found');
  const game = gameRes.rows[0];

  if (game.is_shooting) throw new Error('Already shooting');

  // Set is_shooting = true to prevent concurrent shoots
  await pool.query(`UPDATE games SET is_shooting = TRUE WHERE user_id = $1`, [userId]);

  try {
    const guessChance = Math.min(0.5 + (Number(game.multiplier) - 1.0) * 0.1, 0.9);
    const willGuess = Math.random() < guessChance;

    let keeperAngleId;
    if (willGuess) keeperAngleId = angleId;
    else {
      do {
        keeperAngleId = Math.floor(Math.random() * GAME_ANGLES.length) + 1;
      } while (keeperAngleId === angleId);
    }

    const isGoal = keeperAngleId !== angleId;
    const newMultiplier = isGoal ? Math.floor((Number(game.multiplier) + 0.4 + Math.random() * 0.2) * 100) / 100 : 1.0;

    const lastResult = { keeperAngleId, isGoal };

    const updateRes = await pool.query(
      `UPDATE games
       SET multiplier=$1, last_result=$2, is_shooting=FALSE, updated_at=NOW()
       WHERE user_id=$3
       RETURNING multiplier, last_result`,
      [newMultiplier, lastResult, userId]
    );

    return updateRes.rows[0].last_result;
  } catch (err) {
    // Ensure we reset is_shooting on error
    await pool.query(`UPDATE games SET is_shooting = FALSE WHERE user_id = $1`, [userId]);
    throw err;
  }
}

async function cashout(userId) {
  const gameRes = await pool.query(`SELECT * FROM games WHERE user_id=$1`, [userId]);
  if (!gameRes.rows[0]) throw new Error('Game not found');
  const game = gameRes.rows[0];

  if (Number(game.multiplier) === 1.0) throw new Error('No winnings');

  const winnings = Math.floor(Number(game.stake) * Number(game.multiplier));

  await pool.query(
    `UPDATE games SET multiplier=1.0, last_result=NULL, updated_at=NOW() WHERE user_id=$1`,
    [userId]
  );

  return { winnings };
}

module.exports = {
  startGame,
  shoot,
  cashout
};
