/**
 * Reset Database — XÓA TOÀN BỘ rồi tạo lại
 * Chạy: npm run db:reset
 * ⚠ CHỈ DÙNG KHI DEVELOPMENT!
 */
require('dotenv').config();
const { Pool } = require('pg');
const path = require('path');
const { execFileSync } = require('child_process');

const reset = async () => {
  // Tạo pool riêng cho reset (không dùng chung config/db.js)
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  let client;

  try {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   ⚠  RESET DATABASE — XÓA TOÀN BỘ      ║');
    console.log('╚══════════════════════════════════════════╝\n');

    client = await pool.connect();

    await client.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);

    console.log('[✓] Đã xóa toàn bộ tables\n');

    // Giải phóng pool TRƯỚC khi chạy migrate
    client.release();
    client = null;
    await pool.end();

    // Chạy migrate như process con (pool mới, không conflict)
    console.log('── Chạy lại Migration ──\n');
    const migratePath = path.join(__dirname, 'migrate.js');
    execFileSync(process.execPath, [migratePath], { stdio: 'inherit' });

  } catch (err) {
    console.error('❌ Reset thất bại:', err.message);
    if (client) {
      try { client.release(); } catch (_) {}
    }
    try { await pool.end(); } catch (_) {}
    process.exit(1);
  }
};

reset();
