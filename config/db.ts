import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('connect', () => {
  console.log('[DB] Kết nối PostgreSQL thành công');
});

pool.on('error', (err: Error) => {
  console.error('[DB] Lỗi kết nối PostgreSQL:', err.message);
});

export = pool;
