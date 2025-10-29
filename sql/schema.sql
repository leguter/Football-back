CREATE TABLE IF NOT EXISTS users (
id SERIAL PRIMARY KEY,
telegram_id TEXT UNIQUE,
username TEXT,
balance NUMERIC(18,8) DEFAULT 0,
created_at TIMESTAMP DEFAULT now()
);


CREATE TABLE IF NOT EXISTS rounds (
id BIGINT PRIMARY KEY,
nonce BIGINT,
server_seed_hash TEXT,
stop_multiplier NUMERIC(12,4),
status TEXT,
started_at TIMESTAMP,
ended_at TIMESTAMP,
revealed_seed TEXT
);


CREATE TABLE IF NOT EXISTS bets (
id SERIAL PRIMARY KEY,
user_id INT REFERENCES users(id),
round_id BIGINT REFERENCES rounds(id),
stake NUMERIC(18,8),
cashed_out_multiplier NUMERIC(12,4),
cashed_out_amount NUMERIC(18,8),
status TEXT,
created_at TIMESTAMP DEFAULT now()
);


CREATE TABLE IF NOT EXISTS transactions (
id SERIAL PRIMARY KEY,
user_id INT REFERENCES users(id),
amount NUMERIC(18,8),
type TEXT,
meta JSONB,
created_at TIMESTAMP DEFAULT now()
);