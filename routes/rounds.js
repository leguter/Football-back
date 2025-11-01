// utils/game.js (CommonJS)
const crypto = require('crypto'); // Потрібно для randomBytes та createHash
const pool = require('./db'); // Підключення до бази даних
const { sha256hex, newServerSeed, hmacToR, computeMultiplier } = require('./provably'); // Логіка крашу


const HOUSE_EDGE = 0.03; // 3%
const MAX_MULTIPLIER = 1000;


// Змінні стану гри
let serverSeed = newServerSeed(); // Використовуємо функцію з provably
let serverSeedHash = sha256hex(serverSeed); // Використовуємо функцію з provably
let roundNonce = 0;
let currentRound = null;


async function startRound() {
    roundNonce += 1;
    
    // Використовуємо логіку з provably.js
    const r = hmacToR(serverSeed, roundNonce);
    const stopMultiplier = computeMultiplier(r, HOUSE_EDGE, MAX_MULTIPLIER);
    
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
    await pool.query('UPDATE rounds SET status=$1, ended_at=$2, revealed_seed=$3 WHERE id=$4', 
                     [currentRound.status, currentRound.endedAt, currentRound.revealedSeed, currentRound.id]);
    
    // rotate serverSeed
    serverSeed = newServerSeed();
    serverSeedHash = sha256hex(serverSeed);
    
    const finished = currentRound;
    currentRound = null;
    return finished;
}


// Експорт функціоналу
module.exports = {
    startRound,
    stopRound,
    getCurrentRound: () => currentRound,
    // Можливо, інші геттери/сеттери
};