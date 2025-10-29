// server/server.js
const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const bodyParser = require('body-parser');


const app = express();
app.use(bodyParser.json());


const pool = new Pool({ connectionString: process.env.DATABASE_URL });


const HOUSE_EDGE = 0.03; // 3%
const MAX_MULTIPLIER = 1000;


// Keep serverSeed in memory for demo; in production store in secure store
let serverSeed = crypto.randomBytes(32).toString('hex');
let serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
let roundNonce = 0;
let currentRound = null;


function hmacToR(seed, nonce) {
const hmac = crypto.createHmac('sha256', seed);
hmac.update(String(nonce));
const h = hmac.digest('hex');
const slice = h.slice(0, 13); // 52 bits
const num = parseInt(slice, 16);
const denom = 0x1fffffffffffff; // 2^53 -1
return num / denom;
}


function computeMultiplier(r) {
const safeR = Math.min(1 - 1e-12, Math.max(0, r));
const mult = ((1 - HOUSE_EDGE) / (1 - safeR));
const truncated = Math.floor(mult * 100) / 100; // two decimals
return Math.min(Math.max(1, truncated), MAX_MULTIPLIER);
}


async function startRound() {
roundNonce += 1;
const r = hmacToR(serverSeed, roundNonce);
const stopMultiplier = computeMultiplier(r);
const round = {
id: Date.now(),
nonce: roundNonce,
serverSeedHash,
stopMultiplier,
startedAt: new Date(),
status: 'running'
};
currentRound = round;
// persist to DB
await pool.query(
'INSERT INTO rounds(id, nonce, server_seed_hash, stop_multiplier, status, started_at) VALUES($1,$2,$3,$4,$5,$6)',
[round.id, round.nonce, round.serverSeedHash, round.stopMultiplier, round.status, round.startedAt]
);
return round;
}


async function stopRound() {
if (!currentRound) return null;
currentRound.status = 'ended';
currentRound.endedAt = new Date();
currentRound.revealedSeed = serverSeed;
// update DB
await pool.query('UPDATE rounds SET status=$1, ended_at=$2, revealed_seed=$3 WHERE id=$4', [currentRound.status, currentRound.endedAt, currentRound.revealedSeed, currentRound.id]);
// rotate serverSeed
serverSeed = crypto.randomBytes(32).toString('hex');
serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
const finished = currentRound;
currentRound = null;
return finished;
}


// Telegram initData verification
function verifyTelegramInitData(initData, botToken) {
// initData is the full string 'key1=value1\nkey2=value2...\nhash=...'
const params = {};
initData.split('\n').forEach(line => {
const kv = line.split('=');
const k = kv.shift();
const v = kv.join('=');
params[k] = v;
});
const hash = params.hash;
delete params.hash;
const dataCheckString = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('\n');
app.listen(PORT, () => console.log('Server listening on', PORT));
}