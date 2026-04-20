import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  // GIN full-text search index — future-ready cho @@ to_tsquery.
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_dict_entries_search ON dictionary_entries
      USING gin (to_tsvector('english', headword || ' ' || COALESCE(lemma, '')));
  `);
  // Recency-only scan trên word_lookups cho trending (bổ sung cho idx_lookups_entry/user
  // leading bằng entry_id/user_id ở 08_indexes).
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_word_lookups_recent ON word_lookups(created_at DESC);
  `);
  console.log('  [✓] dictionary GIN FTS + word_lookups recency (2 indexes)');
};

export = migration;
