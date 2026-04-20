import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_saved_words (
      id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_id       UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      note           TEXT,
      mastery_level  VARCHAR(20) NOT NULL DEFAULT 'new'
                     CHECK (mastery_level IN ('new','learning','mastered')),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, entry_id)
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_saved_words_user    ON user_saved_words(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_saved_words_mastery ON user_saved_words(user_id, mastery_level);
  `);
  console.log('  [✓] user_saved_words (+ 2 indexes)');
};

export = migration;
