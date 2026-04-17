import { Pool } from 'pg';

// const pool = new Pool({
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
//   database: process.env.DB_NAME,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
// });


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway dùng SSL nội bộ, cần tắt reject nếu dùng internal URL
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});


pool.on('connect', () => {
  console.log('[DB] Kết nối PostgreSQL thành công');
});

pool.on('error', (err: Error) => {
  console.error('[DB] Lỗi kết nối PostgreSQL:', err.message);
});


export default pool;
module.exports = pool;