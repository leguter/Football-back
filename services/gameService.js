import { pool } from '../db.js';

const GAME_ANGLES = [1, 2, 3, 4, 5];

export async function startGame(user) {
  // Додаємо користувача, якщо не існує
  await pool.query(
    `INSERT INTO users(id, username, first_name, last_name)
     VALUES($1, $2, $3, $4)
     ON CONFLICT(id) DO NOTHING`,
    [user.id, user.username, user.first_name, user.last_name]
  );

  // Створюємо нову гру або ресетуємо
  const res = await pool.query(
    `INSERT INTO games(user_id, stake, multiplier, last_result, is_shooting, updated_at)
     VALUES($1, $2, 1.0, NULL, FALSE, NOW())
     ON CONFLICT(user_id)
     DO UPDATE SET stake = $2, multiplier = 1.0, last_result = NULL, is_shooting = FALSE, updated_at = NOW()
     RETURNING stake, multiplier, last_result`,
    [user.id, 100]
  );

  return res.rows[0];
}

export async function shoot(userId, angleId) {
  // Отримуємо стан гри
  const gameRes = await pool.query(`SELECT * FROM games WHERE user_id=$1`, [userId]);
  if (!gameRes.rows[0]) throw new Error('Game not found');
  const game = gameRes.rows[0];

  if (game.is_shooting) throw new Error('Already shooting');

  // Логіка гри
  const guessChance = Math.min(0.5 + (game.multiplier - 1.0) * 0.1, 0.9);
  const willGuess = Math.random() < guessChance;
  let keeperAngleId;
  if (willGuess) keeperAngleId = angleId;
  else {
    do {
      keeperAngleId = Math.floor(Math.random() * GAME_ANGLES.length) + 1;
    } while (keeperAngleId === angleId);
  }
  const isGoal = keeperAngleId !== angleId;
  const newMultiplier = isGoal ? Math.floor((game.multiplier + 0.4 + Math.random() * 0.2) * 100) / 100 : 1.0;

  // Оновлюємо стан гри
  const updateRes = await pool.query(
    `UPDATE games
     SET multiplier=$1, last_result=$2, is_shooting=FALSE, updated_at=NOW()
     WHERE user_id=$3
     RETURNING multiplier, last_result`,
    [newMultiplier, { keeperAngleId, isGoal }, userId]
  );

  return updateRes.rows[0].last_result;
}

export async function cashout(userId) {
  const gameRes = await pool.query(`SELECT * FROM games WHERE user_id=$1`, [userId]);
  if (!gameRes.rows[0]) throw new Error('Game not found');
  const game = gameRes.rows[0];

  if (game.multiplier === 1.0) throw new Error('No winnings');

  const winnings = Math.floor(game.stake * game.multiplier);

  await pool.query(
    `UPDATE games SET multiplier=1.0, last_result=NULL, updated_at=NOW() WHERE user_id=$1`,
    [userId]
  );

  return { winnings };
}
