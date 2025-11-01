import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();
const app = express();

// CORS для фронтенда
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(bodyParser.json());

app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);

// Централізований обробник помилок
app.use(errorHandler);

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
