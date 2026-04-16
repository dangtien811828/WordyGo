/**
 * Restore: Import dictionary content từ file JSON backup
 * Chạy: npm run db:restore            (dùng latest.json)
 *        npm run db:restore -- file.json  (dùng file cụ thể)
 *
 * THỨ TỰ QUAN TRỌNG: tags → entries → entry_tags → synonyms → antonyms
 * (vì foreign key dependencies)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const restore = async () => {
  // Xác định file backup
  const args = process.argv.slice(2);
  let backupFile;

  if (args.length > 0) {
    // User chỉ định file cụ thể
    backupFile = path.resolve(args[0]);
  } else {
    backupFile = path.join(__dirname, 'backups', 'latest.json');
  }

  if (!fs.existsSync(backupFile)) {
    console.error(`❌ File backup không tồn tại: ${backupFile}`);
    console.error('   Chạy "npm run db:backup" trước để tạo backup.');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    const raw = fs.readFileSync(backupFile, 'utf8');
    const data = JSON.parse(raw);

    console.log('╔══════════════════════════════════════════╗');
    console.log('║   Restore Dictionary Content             ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(`   Source: ${path.basename(backupFile)}\n`);

    await client.query('BEGIN');

    // Thứ tự restore: parent tables trước, junction/child tables sau
    const restoreOrder = [
      // ── Legacy core ──
      'tags',
      'dictionary_entries',
      'entry_tags',
      'entry_synonyms',
      'entry_antonyms',
      // ── Dictionary Pro (entry_senses trước vì sense_examples, collocations, sense_synonyms FK tới nó) ──
      'word_forms',
      'entry_idioms',
      'phrasal_verbs',
      'word_families',
      'word_family_members',
      'entry_senses',
      'sense_examples',
      'collocations',
      'sense_synonyms',
      'sense_antonyms',
    ];

    for (const table of restoreOrder) {
      const rows = data[table];
      if (!rows || rows.length === 0) {
        console.log(`  [—] ${table}: 0 rows (skip)`);
        continue;
      }

      // Lấy danh sách columns từ row đầu tiên
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
      const onConflict = getConflictClause(table, columns);

      let inserted = 0;
      for (const row of rows) {
        const values = columns.map(col => {
          const val = row[col];
          // PostgreSQL arrays cần xử lý đặc biệt
          if (Array.isArray(val)) return val;
          return val;
        });

        try {
          await client.query(
            `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders}) ${onConflict}`,
            values
          );
          inserted++;
        } catch (err) {
          // Skip nếu duplicate (an toàn)
          if (err.code === '23505') continue;
          throw err;
        }
      }

      console.log(`  [✓] ${table}: ${inserted}/${rows.length} rows restored`);
    }

    await client.query('COMMIT');

    console.log(`\n══════════════════════════════════════════`);
    console.log(`✅ Restore hoàn tất!`);
    console.log(`══════════════════════════════════════════`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Restore thất bại:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

/**
 * Tạo ON CONFLICT clause phù hợp cho từng bảng
 */
function getConflictClause(table, columns) {
  switch (table) {
    case 'tags':
      return 'ON CONFLICT (name) DO NOTHING';
    case 'dictionary_entries': {
      // Upsert: nếu headword+lemma trùng → cập nhật toàn bộ fields
      const updateCols = columns
        .filter(c => !['id', 'headword', 'lemma', 'created_at'].includes(c))
        .map(c => `${c} = EXCLUDED.${c}`)
        .join(', ');
      return `ON CONFLICT (headword, lemma) DO UPDATE SET ${updateCols}`;
    }
    case 'entry_tags':
      return 'ON CONFLICT (entry_id, tag_id) DO NOTHING';
    case 'entry_synonyms':
      return 'ON CONFLICT (entry_id, synonym_id) DO NOTHING';
    case 'entry_antonyms':
      return 'ON CONFLICT (entry_id, antonym_id) DO NOTHING';

    // ── Dictionary Pro tables ──
    case 'entry_senses':
      return 'ON CONFLICT (entry_id, pos, sense_order) DO NOTHING';
    case 'sense_examples':
      return 'ON CONFLICT (id) DO NOTHING';
    case 'word_forms':
      return 'ON CONFLICT (entry_id, form_type, form_value) DO NOTHING';
    case 'entry_idioms':
      return 'ON CONFLICT (id) DO NOTHING';
    case 'phrasal_verbs':
      return 'ON CONFLICT (id) DO NOTHING';
    case 'collocations':
      return 'ON CONFLICT (id) DO NOTHING';
    case 'sense_synonyms':
      return 'ON CONFLICT (sense_id, synonym_text) DO NOTHING';
    case 'sense_antonyms':
      return 'ON CONFLICT (sense_id, antonym_text) DO NOTHING';
    case 'word_families':
      return 'ON CONFLICT (id) DO NOTHING';
    case 'word_family_members':
      return 'ON CONFLICT (family_id, entry_id) DO NOTHING';

    default:
      return 'ON CONFLICT DO NOTHING';
  }
}

restore();

export {};
