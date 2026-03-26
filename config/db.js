const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('connect', () => {
  console.log('[DB] Kết nối PostgreSQL thành công');
});

pool.on('error', (err) => {
  console.error('[DB] Lỗi kết nối PostgreSQL:', err.message);
});

module.exports = pool;
