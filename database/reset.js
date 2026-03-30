/**
 * Smart Reset Database
 *
 * Chạy:
 *   npm run db:reset          → Reset CẤU TRÚC (giữ nguyên dictionary content)
 *   npm run db:reset:all      → Reset TOÀN BỘ (xóa sạch mọi thứ)
 *
 * Cách hoạt động:
 *   1. Xác định mode (selective vs all)
 *   2. Nếu selective: drop tất cả NGOẠI TRỪ content tables
 *   3. Chạy migrate (CREATE IF NOT EXISTS → an toàn cho bảng đã tồn tại)
 *   4. Nếu all: chạy migrate trên DB trống
 */
require('dotenv').config();
const { Pool } = require('pg');
const path = require('path');
const { execFileSync } = require('child_process');

// Các bảng nội dung từ điển — được bảo vệ khi selective reset
const PROTECTED_TABLES = [
  'tags',
  'dictionary_entries',
  'entry_tags',
  'entry_synonyms',
  'entry_antonyms',
];

const reset = async () => {
  const isFullReset = process.argv.includes('--all');
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  let client;

  try {
    client = await pool.connect();

    if (isFullReset) {
      // ── FULL RESET: xóa tất cả ──
      console.log('╔══════════════════════════════════════════╗');
      console.log('║   ⚠  FULL RESET — XÓA TOÀN BỘ          ║');
      console.log('╚══════════════════════════════════════════╝\n');

      await client.query(`
        DO $$ DECLARE r RECORD;
        BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
        END $$;
      `);
      console.log('[✓] Đã xóa TOÀN BỘ tables\n');

    } else {
      // ── SELECTIVE RESET: giữ content tables ──
      console.log('╔══════════════════════════════════════════╗');
      console.log('║   Reset — Giữ nguyên Dictionary content  ║');
      console.log('╚══════════════════════════════════════════╝\n');

      console.log('  Bảng được bảo vệ:');
      for (const t of PROTECTED_TABLES) {
        const { rows } = await client.query(`
          SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1)
        `, [t]);
        const count = rows[0].exists
          ? (await client.query(`SELECT COUNT(*)::int as c FROM ${t}`)).rows[0].c
          : 0;
        console.log(`    ✓ ${t} (${count} rows → giữ nguyên)`);
      }
      console.log('');

      // Lấy danh sách tất cả tables, loại trừ protected
      const { rows: allTables } = await client.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename != ALL($1)
      `, [PROTECTED_TABLES]);

      if (allTables.length === 0) {
        console.log('  Không có bảng nào cần xóa.\n');
      } else {
        // Drop từng bảng không protected (CASCADE để xóa FK dependencies)
        for (const { tablename } of allTables) {
          await client.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
        }
        console.log(`[✓] Đã xóa ${allTables.length} bảng (giữ ${PROTECTED_TABLES.length} bảng content)\n`);
      }
    }

    // Giải phóng pool trước khi chạy migrate
    client.release();
    client = null;
    await pool.end();

    // Chạy migrate (CREATE IF NOT EXISTS → an toàn cho bảng đã tồn tại)
    console.log('── Chạy Migration ──\n');
    execFileSync(process.execPath, [path.join(__dirname, 'migrate.js')], { stdio: 'inherit' });

  } catch (err) {
    console.error('❌ Reset thất bại:', err.message);
    if (client) try { client.release(); } catch (_) {}
    try { await pool.end(); } catch (_) {}
    process.exit(1);
  }
};

reset();
