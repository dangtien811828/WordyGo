/**
 * Phase 9: user_ebook_favorites table
 */
import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_ebook_favorites (
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ebook_id   UUID NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, ebook_id)
    );
  `);
  console.log('  [✓] user_ebook_favorites');
};

export = migration;
