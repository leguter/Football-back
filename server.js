const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const app = express();


app.use(express.json());

app.use(cors({
  origin: "https://tg-football.vercel.app", // 👈 твій фронтенд
  credentials: true, // 👈 дозволяємо cookies / credentials
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-telegram-user" // 👈 ДОДАЛИ ЦЕ
  ]
}));

// Обов’язково додай preflight для Render
app.options("*", cors({
  origin: "https://tg-football.vercel.app",
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-telegram-user"
  ]
}));
app.use(bodyParser.json());

// ✅ Імпортуємо маршрути
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const depositRouters = require("./routes/stars");
// ✅ Підключаємо маршрути
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/stars', depositRouters);
// ✅ Централізована обробка помилок
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ message: 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));