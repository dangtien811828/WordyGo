/**
 * Backup: Export các bảng nội dung (dictionary) ra file JSON
 * Chạy: npm run db:backup
 * Output: database/backups/dict_backup_YYYY-MM-DD_HHmmss.json
 *
 * Bảng được backup:
 *   - tags
 *   - dictionary_entries
 *   - entry_tags
 *   - entry_synonyms
 *   - entry_antonyms
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const CONTENT_TABLES = [
  'tags',
  'dictionary_entries',
  'entry_tags',
  'entry_synonyms',
  'entry_antonyms',
];

const backup = async () => {
  const client = await pool.connect();

  try {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   Backup Dictionary Content              ║');
    console.log('╚══════════════════════════════════════════╝\n');

    const data = {};

    for (const table of CONTENT_TABLES) {
      // Kiểm tra bảng tồn tại
      const exists = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        )`, [table]);

      if (!exists.rows[0].exists) {
        console.log(`  [—] ${table} (not found, skip)`);
        data[table] = [];
        continue;
      }

      const { rows } = await client.query(`SELECT * FROM ${table}`);
      data[table] = rows;
      console.log(`  [✓] ${table}: ${rows.length} rows`);
    }

    // Tạo thư mục backups nếu chưa có
    const backupsDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // Ghi file với timestamp
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `dict_backup_${ts}.json`;
    const filepath = path.join(backupsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');

    // Cũng ghi 1 bản latest (cho restore nhanh)
    const latestPath = path.join(backupsDir, 'latest.json');
    fs.writeFileSync(latestPath, JSON.stringify(data, null, 2), 'utf8');

    const totalRows = Object.values(data).reduce<number>((sum, rows: any) => sum + rows.length, 0);

    console.log(`\n══════════════════════════════════════════`);
    console.log(`✅ Backup hoàn tất! ${totalRows} rows total`);
    console.log(`   File: ${filename}`);
    console.log(`   Path: ${filepath}`);
    console.log(`══════════════════════════════════════════`);

  } catch (err) {
    console.error('❌ Backup thất bại:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

backup();

export {};
