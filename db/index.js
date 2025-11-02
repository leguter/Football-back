// /db/index.js (CommonJS)
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // для Render; якщо локально і не потрібно, можна прибрати
  max: 20,
});

pool.connect()
  .then(() => console.log('Postgres connected'))
  .catch(err => console.error('Postgres connection error', err));

module.exports = pool;
