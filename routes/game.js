import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { startGame, shoot, cashout } from '../services/gameService.js';

const router = express.Router();
router.use(authMiddleware);

router.post('/start', async (req, res, next) => {
  try {
    const game = await startGame(req.user);
    res.json({ success: true, data: game });
  } catch (err) {
    next(err);
  }
});

router.post('/shoot', async (req, res, next) => {
  try {
    const { angle } = req.body;
    if (![1,2,3,4,5].includes(angle)) return res.status(400).json({ success: false, error: 'Invalid angle' });

    const result = await shoot(req.user.id, angle);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/cashout', async (req, res, next) => {
  try {
    const result = await cashout(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
