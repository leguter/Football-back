// utils/provably.js
const crypto = require('crypto');


function sha256hex(str) {
return crypto.createHash('sha256').update(str).digest('hex');
}


function newServerSeed() {
return crypto.randomBytes(32).toString('hex');
}


function hmacToR(seed, nonce) {
const hmac = crypto.createHmac('sha256', seed);
hmac.update(String(nonce));
const h = hmac.digest('hex');
const slice = h.slice(0, 13); // 52 bits
const num = parseInt(slice, 16);
const denom = 0x1fffffffffffff; // 2^53-1
return num / denom;
}


function computeMultiplier(r, houseEdge = 0.03, maxMultiplier = 1000) {
const safeR = Math.min(1 - 1e-12, Math.max(0, r));
const mult = ((1 - houseEdge) / (1 - safeR));
const truncated = Math.floor(mult * 100) / 100;
return Math.min(Math.max(1, truncated), maxMultiplier);
}


module.exports = { sha256hex, newServerSeed, hmacToR, computeMultiplier };