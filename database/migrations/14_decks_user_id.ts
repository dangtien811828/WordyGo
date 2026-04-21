import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  // Safety migration — idempotent. Migration 13 contains the same statements but may not
  // have run on Railway yet. This file ensures the column and constraint exist.

  await client.query(`
    ALTER TABLE decks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
  `);

  // Drop and re-add so the CHECK covers 'user_created' regardless of prior state.
  await client.query(`ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_deck_type_check;`);
  await client.query(`
    ALTER TABLE decks ADD CONSTRAINT decks_deck_type_check
      CHECK (deck_type IN ('premade', 'system_generated', 'user_created'));
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_decks_user_id ON decks(user_id) WHERE user_id IS NOT NULL;
  `);

  console.log('  [✓] decks.user_id + deck_type constraint (idempotent safety migration)');
};

export = migration;
