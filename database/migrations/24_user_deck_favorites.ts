import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_deck_favorites (
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deck_id    UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, deck_id)
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_deck_favorites_user
      ON user_deck_favorites(user_id);
  `);

  console.log('  [✓] user_deck_favorites table + index');
};

export = migration;
