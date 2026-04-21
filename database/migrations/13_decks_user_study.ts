import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  // Add user_id to decks so mobile users can create their own decks
  await client.query(`
    ALTER TABLE decks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
  `);

  // Extend deck_type CHECK to include 'user_created'
  await client.query(`ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_deck_type_check;`);
  await client.query(`
    ALTER TABLE decks ADD CONSTRAINT decks_deck_type_check
      CHECK (deck_type IN ('premade','system_generated','user_created'));
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id) WHERE user_id IS NOT NULL;
  `);

  // Composite index for card list ordered by sort_order per deck
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cards_deck_sort ON cards(deck_id, sort_order);
  `);

  console.log('  [✓] decks.user_id + deck_type extended + 2 indexes');
};

export = migration;
