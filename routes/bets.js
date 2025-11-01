// routes/bets.js
const express = require("express");
const pool = require("../db/db");

const router = express.Router();

/**
 * 📤 Place Bet
 * Віднімає ставку з балансу користувача і створює запис у таблиці bets
 */
router.post("/place", async (req, res) => {
  const { telegram_id, stake } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Отримуємо користувача
    const userRes = await client.query(
      "SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE",
      [telegram_id]
    );
    if (userRes.rowCount === 0) throw new Error("User not found");
    const user = userRes.rows[0];

    if (Number(user.balance) < Number(stake)) {
      throw new Error("Insufficient balance");
    }

    // Знімаємо ставку
    await client.query("UPDATE users SET balance = balance - $1 WHERE id = $2", [
      stake,
      user.id,
    ]);

    // Отримуємо поточний активний раунд
    const roundRes = await client.query(
      "SELECT * FROM rounds WHERE status = 'running' ORDER BY started_at DESC LIMIT 1 FOR UPDATE"
    );
    if (roundRes.rowCount === 0) throw new Error("No active round");
    const round = roundRes.rows[0];

    // Створюємо ставку
    const betRes = await client.query(
      `INSERT INTO bets(user_id, round_id, stake, status)
       VALUES($1, $2, $3, $4)
       RETURNING *`,
      [user.id, round.id, stake, "active"]
    );

    // Лог транзакції (ставка)
    await client.query(
      `INSERT INTO transactions(user_id, amount, type, meta)
       VALUES($1, $2, $3, $4)`,
      [user.id, -Math.abs(stake), "bet", JSON.stringify({ round: round.id })]
    );

    await client.query("COMMIT");
    res.json({ ok: true, bet: betRes.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Place bet error:", e);
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

/**
 * 💰 Cashout
 * Користувач забирає свій виграш до зупинки раунду
 */
router.post("/cashout", async (req, res) => {
  const { telegram_id, bet_id, cashout_multiplier } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Знаходимо користувача
    const userRes = await client.query(
      "SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE",
      [telegram_id]
    );
    if (userRes.rowCount === 0) throw new Error("User not found");
    const user = userRes.rows[0];

    // Отримуємо ставку
    const betRes = await client.query(
      "SELECT * FROM bets WHERE id = $1 FOR UPDATE",
      [bet_id]
    );
    if (betRes.rowCount === 0) throw new Error("Bet not found");
    const bet = betRes.rows[0];

    // Перевірка, чи ще не кешаутнута
    if (bet.status !== "active") throw new Error("Bet is not active");

    // Отримуємо відповідний раунд
    const roundRes = await client.query("SELECT * FROM rounds WHERE id = $1", [
      bet.round_id,
    ]);
    if (roundRes.rowCount === 0) throw new Error("Round not found");
    const round = roundRes.rows[0];

    const stopMultiplier = Number(round.stop_multiplier);
    const userMultiplier = Number(cashout_multiplier);

    // Якщо користувач кешаутнув після зупинки — програш
    if (stopMultiplier <= userMultiplier) {
      await client.query("UPDATE bets SET status = $1 WHERE id = $2", [
        "lost",
        bet.id,
      ]);
      await client.query("COMMIT");
      return res.json({ ok: true, result: "lost" });
    }

    // Обчислюємо виплату
    const payout = Number(bet.stake) * userMultiplier;
    const payoutNet = payout; // тут можна врахувати комісію house edge

    // Оновлюємо баланс користувача
    await client.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [
      payoutNet,
      user.id,
    ]);

    // Оновлюємо ставку
    await client.query(
      `UPDATE bets
       SET status = $1, cashed_out_multiplier = $2, cashed_out_amount = $3
       WHERE id = $4`,
      ["cashed", userMultiplier, payoutNet, bet.id]
    );

    // Лог транзакції (виплата)
    await client.query(
      `INSERT INTO transactions(user_id, amount, type, meta)
       VALUES($1, $2, $3, $4)`,
      [user.id, payoutNet, "payout", JSON.stringify({ round: round.id })]
    );

    await client.query("COMMIT");
    res.json({ ok: true, result: "cashed", amount: payoutNet });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Cashout error:", e);
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
