const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const db = require("../db"); // Your connection to PostgreSQL

const router = express.Router();
const BOT_TOKEN = process.env.BOT_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET;

// POST /api/auth
router.post("/", async (req, res) => {
  // 1. Get initData and the new referrerId from the request body
  const { initData, referrerId } = req.body;

  if (!initData) {
    return res.status(400).json({ message: "initData is required" });
  }

  try {
    // --- 2. Validate Telegram initData ---
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    if (!hash) {
      return res.status(400).json({ message: "hash missing" });
    }

    urlParams.delete("hash");
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (calculatedHash !== hash) {
      return res.status(403).json({ message: "Authentication failed: Invalid hash" });
    }

    // --- 3. Work with the user ---
    const user = JSON.parse(urlParams.get("user"));
    const telegramId = user.id;
    // We now use the 'referrerId' passed from the frontend, not 'start_param'

    let userResult = await db.query("SELECT * FROM users WHERE telegram_id = $1", [telegramId]);

    if (userResult.rows.length === 0) {
      // New user
      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const newUserQuery = `
          INSERT INTO users 
          (telegram_id, first_name, username, balance, photo_url, tickets, referred_by, internal_stars, referral_spins)
          VALUES ($1, $2, $3, 0, $4, $5, $6, 0, 0)
          RETURNING *`;

        const newUserValues = [
          telegramId,
          user.first_name,
          user.username,
          user.photo_url || null,
          referrerId ? 2 : 0, // Bonus tickets on start if referred
          referrerId || null, // Save the referrer
        ];

        const newUserResult = await client.query(newUserQuery, newUserValues);
        userResult = newUserResult;

        // Grant bonus to the referrer
        if (referrerId) {
          await client.query(
            `UPDATE users SET tickets = tickets + 2 WHERE telegram_id = $1`,
            [referrerId]
          );
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err; // Re-throw error to be caught by the outer catch block
      } finally {
        client.release();
      }
    } else {
      // Existing user
      userResult = await db.query(
        `UPDATE users SET last_login_at = NOW(), photo_url = $1 WHERE telegram_id = $2 RETURNING *`,
        [user.photo_url || userResult.rows[0].photo_url, telegramId]
      );
    }

    const finalUser = userResult.rows[0];

    // --- 4. Generate JWT ---
    const token = jwt.sign({ telegramId: finalUser.telegram_id }, JWT_SECRET, { expiresIn: "7d" });

    // Respond to the frontend
    res.json({
      message: "Authenticated successfully",
      token,
      user: {
        telegramId: finalUser.telegram_id,
        firstName: finalUser.first_name,
        username: finalUser.username,
        photoUrl: finalUser.photo_url || null,
        balance: finalUser.balance,
        tickets: finalUser.tickets,
        internal_stars: finalUser.internal_stars,
        referral_spins: finalUser.referral_spins,
      },
    });

  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ message: "Server error during authentication" });
  }
});

module.exports = router;
