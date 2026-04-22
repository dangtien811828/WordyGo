/**
 * Master Migration Runner
 * Chạy: npm run db:migrate
 *
 * Tạo toàn bộ 44 bảng + indexes cho English Learning App
 */

import type { PoolClient } from 'pg';
import pool from '../config/db';

type MigrationFn = (client: PoolClient) => Promise<void>;

interface MigrationDef {
  name: string;
  file: string;
}

const migrations: MigrationDef[] = [
  { name: 'Domain 1+2: Auth & Content (22 tables)', file: './migrations/01_auth_content' },
  { name: 'Domain 3+4: Learning & Retrieval (6 bảng)', file: './migrations/02_learning_srs' },
  { name: 'Domain 5: Ebook & TTS (6 bảng)',            file: './migrations/03_reading_ebook' },
  { name: 'Domain 6: Gaming (6 bảng)',                 file: './migrations/04_gaming' },
  { name: 'Domain 7: Commerce (4 bảng)',               file: './migrations/05_commerce' },
  { name: 'Domain 8: AI & Sync (6 bảng)',              file: './migrations/06_ai_sync' },
  { name: 'Domain 9: System (4 bảng)',                 file: './migrations/07_system' },
  { name: 'Domain 10: Approvals (1 bảng)',             file: './migrations/09_approvals' },
  { name: 'Domain 11: Refresh Tokens (1 bảng)',        file: './migrations/10_refresh_tokens' },
  { name: 'Domain 12: User Saved Words (1 bảng)',      file: './migrations/11_user_saved_words' },
  { name: 'Indexes (performance)',                     file: './migrations/08_indexes' },
  { name: 'Dictionary GIN + recency (2 indexes)',      file: './migrations/12_dictionary_indexes' },
  { name: 'Phase 4: User decks + study indexes',       file: './migrations/13_decks_user_study' },
  { name: 'Phase 4 fix: decks.user_id safety (idempotent)', file: './migrations/14_decks_user_id' },
  { name: 'Phase 6 rewrite: leitner_cards + leitner_reviews', file: './migrations/15_leitner_rewrite' },
  { name: 'Phase 6: practice_sessions + practice_answers',   file: './migrations/16_practice_sessions' },
  { name: 'Phase 6: clean user_card_progress (drop SRS)',    file: './migrations/17_clean_user_card_progress' },
  { name: 'Phase 7: Payment Methods (2 bảng + admin_note)', file: './migrations/18_payment_methods' },
  { name: 'Phase 7.2: user_subscriptions pending_payment status', file: './migrations/19_user_subscription_pending' },
  { name: 'Phase 9: paragraphs table + user_reading_progress.current_paragraph_index', file: './migrations/20_paragraphs' },
  { name: 'Phase 9: user_ebook_favorites table', file: './migrations/21_user_ebook_favorites' },
];

export const migrate = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   English Learning App — DB Migration    ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // Extension — auto-commit (ngoài transaction).
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    console.log('[✓] Extension uuid-ossp\n');

    // Mỗi migration file chạy trong transaction RIÊNG.
    // File N fail → rollback chỉ file N; file 1..N-1 đã commit vẫn giữ nguyên.
    for (const m of migrations) {
      console.log(`── ${m.name} ──`);
      const fn = require(m.file) as MigrationFn;

      await client.query('BEGIN');
      try {
        await fn(client);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`\n❌ Failed in: ${m.name}`);
        throw err;
      }
      console.log('');
    }

    // Đếm bảng
    const { rows } = await pool.query<{ count: number }>(`
      SELECT COUNT(*)::int as count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);

    console.log('══════════════════════════════════════════');
    console.log(`✅ Migration hoàn tất! ${rows[0].count} bảng đã tạo.`);
    console.log('══════════════════════════════════════════');

  } catch (err) {
    const error = err as Error;
    console.error('\n❌ Migration thất bại:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

// Auto-run khi gọi trực tiếp (tsx database/migrate.ts)
if (require.main === module) {
  migrate();
}
