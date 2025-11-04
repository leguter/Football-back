const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const app = express();

app.use(cors({
  origin: "https://tg-football.vercel.app", // 👈 твій фронт
  credentials: true, // 👈 обов’язково!
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Якщо використовуєш cookie-сесію або JWT через cookie
app.set("trust proxy", 1);
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