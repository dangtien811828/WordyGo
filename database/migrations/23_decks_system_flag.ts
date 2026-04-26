import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  // Pre-condition for the GENERATED column expression to never produce NULL
  await client.query(`UPDATE decks SET deck_type = 'premade' WHERE deck_type IS NULL;`);
  await client.query(`ALTER TABLE decks ALTER COLUMN deck_type SET NOT NULL;`);

  // is_system: derived column, single source of truth (cannot drift from deck_type)
  await client.query(`
    ALTER TABLE decks
      ADD COLUMN IF NOT EXISTS is_system boolean
        GENERATED ALWAYS AS (deck_type IN ('premade','system_generated')) STORED;
  `);

  // sort_order: manual ordering hint controlled by admin
  await client.query(`
    ALTER TABLE decks ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
  `);

  // Partial index optimizes the dominant /decks/system query
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_decks_is_system_sort
      ON decks(sort_order ASC, created_at DESC)
      WHERE is_system = true;
  `);

  console.log('  [✓] decks.is_system (GENERATED) + sort_order + partial index');
};

export = migration;
