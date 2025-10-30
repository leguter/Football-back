// routes/rounds.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { hmacToR, computeMultiplier, newServerSeed, sha256hex } = require('../utils/provably');


const HOUSE_EDGE = Number(process.env.HOUSE_EDGE || 0.03);
const MAX_MULT = 1000;


// in-memory seeds & state for demo
let serverSeed = newServerSeed();
let serverSeedHash = sha256hex(serverSeed);
let roundNonce = 0;
let currentRound = null;



router.get('/current', async (req, res) => {
try {
if (!currentRound) {
await startRound();
}
res.json(currentRound);
} catch (e) {
console.error(e);
res.status(500).json({ error: e.message });
}
});


async function startRound() {
roundNonce += 1;
const r = hmacToR(serverSeed, roundNonce);
const stopMultiplier = computeMultiplier(r, HOUSE_EDGE, MAX_MULT);
const round = {
id: Date.now(),
nonce: roundNonce,
serverSeedHash,
stopMultiplier,
status: 'running',
startedAt: new Date()
};
currentRound = round;
await pool.query('INSERT INTO rounds(id, nonce, server_seed_hash, stop_multiplier, status, started_at) VALUES($1,$2,$3,$4,$5,$6)', [round.id, round.nonce, round.serverSeedHash, round.stopMultiplier, round.status, round.startedAt]);
return round;
}


router.post('/start', async (req, res) => {
try {
const r = await startRound();
res.json(r);
} catch (e) {
res.status(500).json({ error: e.message });
}
});


router.post('/stop', async (req, res) => {
try {
if (!currentRound) return res.status(400).json({ error: 'No running round' });
currentRound.status = 'ended';
currentRound.endedAt = new Date();
currentRound.revealedSeed = serverSeed;
await pool.query('UPDATE rounds SET status=$1, ended_at=$2, revealed_seed=$3 WHERE id=$4', [currentRound.status, currentRound.endedAt, currentRound.revealedSeed, currentRound.id]);
// rotate seeds
serverSeed = newServerSeed();
serverSeedHash = sha256hex(serverSeed);
const finished = currentRound;
currentRound = null;
res.json(finished);
} catch (e) {
console.error(e);
res.status(500).json({ error: e.message });
}
});


module.exports = router;