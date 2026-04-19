/**
 * Restore: Import dictionary content từ file JSON backup
 * Chạy: npm run db:restore            (dùng latest.json)
 *        npm run db:restore -- file.json  (dùng file cụ thể)
 *
 * THỨ TỰ QUAN TRỌNG: tags → entries → entry_tags → synonyms → antonyms
 * (vì foreign key dependencies)
 *
 * FIX: Track entry IDs đã insert thành công, skip child rows tham chiếu
 *      tới entries bị skip (thiếu meaning_vi).
 */
import fs from 'fs';
import path from 'path';
import pool from '../config/db';

interface RestoreRow {
  id?: string;
  entry_id?: string;
  synonym_id?: string;
  antonym_id?: string;
  sense_id?: string | null;
  family_id?: string;
  meaning_vi?: string;
  [key: string]: any;
}

type BackupData = Record<string, RestoreRow[]>;

const restore = async (): Promise<void> => {
  const args = process.argv.slice(2);
  let backupFile: string;

  if (args.length > 0) {
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
    const data: BackupData = JSON.parse(raw);

    console.log('╔══════════════════════════════════════════╗');
    console.log('║   Restore Dictionary Content             ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log(`   Source: ${path.basename(backupFile)}\n`);

    await client.query('BEGIN');

    // ══════════════════════════════════════════════════════
    //  Track IDs đã insert thành công
    //  Dùng để filter child tables (entry_tags, word_forms, ...)
    // ══════════════════════════════════════════════════════
    const insertedEntryIds = new Set<string>();
    const insertedSenseIds = new Set<string>();
    const insertedFamilyIds = new Set<string>();

    const restoreOrder: string[] = [
      'tags',
      'dictionary_entries',
      'entry_tags',
      'entry_synonyms',
      'entry_antonyms',
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

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
      const onConflict = getConflictClause(table, columns);

      let inserted = 0;
      let skipped = 0;

      for (const row of rows) {
        // ── Filter: skip rows tham chiếu tới entries/senses bị skip ──
        if (!shouldInsertRow(table, row, insertedEntryIds, insertedSenseIds, insertedFamilyIds)) {
          skipped++;
          continue;
        }

        const values = columns.map(col => row[col]);

        try {
          await client.query(
            `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders}) ${onConflict}`,
            values
          );
          inserted++;

          // Track IDs đã insert thành công
          if (table === 'dictionary_entries' && row.id) {
            insertedEntryIds.add(row.id);
          }
          if (table === 'entry_senses' && row.id) {
            insertedSenseIds.add(row.id);
          }
          if (table === 'word_families' && row.id) {
            insertedFamilyIds.add(row.id);
          }
        } catch (err) {
          const error = err as { code?: string };
          if (error.code === '23505') continue; // duplicate
          if (error.code === '23503') {         // foreign key
            skipped++;
            continue;
          }
          throw err;
        }
      }

      const skipMsg = skipped > 0 ? ` (${skipped} skipped)` : '';
      console.log(`  [✓] ${table}: ${inserted}/${rows.length} rows restored${skipMsg}`);
    }

    await client.query('COMMIT');

    console.log(`\n══════════════════════════════════════════`);
    console.log(`✅ Restore hoàn tất!`);
    console.log(`   Entries restored: ${insertedEntryIds.size}`);
    console.log(`   Senses restored: ${insertedSenseIds.size}`);
    console.log(`══════════════════════════════════════════`);

  } catch (err) {
    await client.query('ROLLBACK');
    const error = err as Error;
    console.error('❌ Restore thất bại:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

/**
 * Quyết định có nên insert row này không
 * Trả về false nếu row tham chiếu tới entry/sense đã bị skip
 */
function shouldInsertRow(
  table: string,
  row: RestoreRow,
  insertedEntryIds: Set<string>,
  insertedSenseIds: Set<string>,
  insertedFamilyIds: Set<string>,
): boolean {
  switch (table) {
    // ── dictionary_entries: skip nếu thiếu meaning_vi ──
    case 'dictionary_entries':
      return !!row.meaning_vi;

    // ── Tables có entry_id FK ──
    case 'entry_tags':
    case 'word_forms':
    case 'entry_idioms':
    case 'phrasal_verbs':
    case 'entry_senses':
      return !!row.entry_id && insertedEntryIds.has(row.entry_id);

    // ── Synonyms: cả 2 entry phải tồn tại ──
    case 'entry_synonyms':
      return !!row.entry_id && !!row.synonym_id &&
        insertedEntryIds.has(row.entry_id) &&
        insertedEntryIds.has(row.synonym_id);

    // ── Antonyms: cả 2 entry phải tồn tại ──
    case 'entry_antonyms':
      return !!row.entry_id && !!row.antonym_id &&
        insertedEntryIds.has(row.entry_id) &&
        insertedEntryIds.has(row.antonym_id);

    // ── Tables có sense_id FK ──
    case 'sense_examples':
    case 'sense_synonyms':
    case 'sense_antonyms':
      return !!row.sense_id && insertedSenseIds.has(row.sense_id);

    // ── Collocations: entry_id bắt buộc, sense_id tùy chọn ──
    case 'collocations':
      if (!row.entry_id || !insertedEntryIds.has(row.entry_id)) return false;
      if (row.sense_id && !insertedSenseIds.has(row.sense_id)) {
        row.sense_id = null;
      }
      return true;

    // ── Word families ──
    case 'word_families':
      return true;

    case 'word_family_members':
      return !!row.family_id && !!row.entry_id &&
        insertedFamilyIds.has(row.family_id) &&
        insertedEntryIds.has(row.entry_id);

    default:
      return true;
  }
}

/**
 * Tạo ON CONFLICT clause phù hợp cho từng bảng
 */
function getConflictClause(table: string, columns: string[]): string {
  switch (table) {
    case 'tags':
      return 'ON CONFLICT (name) DO NOTHING';
    case 'dictionary_entries': {
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
