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
  { name: 'Indexes (performance)',                     file: './migrations/08_indexes' },
];

export const migrate = async (): Promise<void> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('╔══════════════════════════════════════════╗');
    console.log('║   English Learning App — DB Migration    ║');
    console.log('╚══════════════════════════════════════════╝\n');

    // Extension
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    console.log('[✓] Extension uuid-ossp\n');

    // Chạy từng migration
    for (const m of migrations) {
      console.log(`── ${m.name} ──`);
      const fn = require(m.file) as MigrationFn;
      await fn(client);
      console.log('');
    }

    await client.query('COMMIT');

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
    await client.query('ROLLBACK');
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
