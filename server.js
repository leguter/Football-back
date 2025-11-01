// server/server.js (CommonJS)
require("dotenv").config(); // Завантаження .env
const express = require('express');
const bodyParser = require('body-parser');

// Імпорти з нових файлів
const { startRound, stopRound, getCurrentRound } = require('./utils/game'); // Логіка раундів
const { verifyTelegramAuth } = require('./utils/telegramAuth'); // Аутентифікація Telegram


const app = express();
app.use(bodyParser.json());


// --- Роути (Маршрути) Express ---

// Роут: Отримати поточний статус гри
app.get('/api/status', (req, res) => {
    const round = getCurrentRound();
    res.json({ 
        status: round ? round.status : 'stopped',
        roundId: round ? round.id : null,
        serverSeedHash: round ? round.serverSeedHash : null
    });
});

// Роут: Запуск нового раунду (потрібна авторизація)
app.post('/api/start', async (req, res) => {
    // Тут потрібно додати логіку перевірки адміністратора!
    try {
        const round = await startRound();
        res.status(200).json({ success: true, round });
    } catch (error) {
        console.error('Error starting round:', error);
        res.status(500).json({ success: false, message: 'Failed to start round' });
    }
});

// Роут: Перевірка Telegram Init Data (ваша логіка з попереднього коду)
app.post('/api/auth/telegram', (req, res) => {
    const { initData, botToken } = req.body; // Припускаємо, що ви надсилаєте це у тілі запиту
    
    if (!initData || !process.env.BOT_TOKEN) {
         return res.status(400).json({ verified: false, message: 'Missing initData or BOT_TOKEN in environment' });
    }

    // Використовуємо функцію з utils/telegramAuth.js
    const isVerified = verifyTelegramAuth(initData, process.env.BOT_TOKEN); 
    
    if (isVerified) {
        res.json({ verified: true, message: 'Telegram user authenticated.' });
    } else {
        res.status(401).json({ verified: false, message: 'Authentication failed.' });
    }
});


// ----------------------------------------------------
// ЗАПУСК СЕРВЕРА
// ----------------------------------------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
});