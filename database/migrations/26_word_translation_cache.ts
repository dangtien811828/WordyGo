import type { PoolClient } from 'pg';

/**
 * Migration 26 — Word Translation Cache + word_lookups fallback fields.
 *
 * Why:
 *   POST /api/v1/ebooks/:id/lookup gains a fallback path: when a word is not
 *   in `dictionary_entries`, we call Google Translate + Free Dictionary in
 *   parallel and cache the merged result so subsequent lookups are instant.
 *
 * Schema changes (idempotent — safe to re-run):
 *   1. CREATE TABLE word_translation_cache (word UNIQUE).
 *   2. ALTER word_lookups:
 *        - entry_id → nullable (translation/not-found rows have no entry).
 *        - + word_text     (the looked-up word, preserves casing for display).
 *        - + lookup_result ('dictionary' | 'translation' | 'not_found').
 *        - + paragraph_id  (raw UUID — no FK; paragraph rows can be re-segmented).
 */
const migration = async (client: PoolClient): Promise<void> => {
  // 1. Cache table
  await client.query(`
    CREATE TABLE IF NOT EXISTS word_translation_cache (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      word            VARCHAR(100) UNIQUE NOT NULL,
      word_original   VARCHAR(100) NOT NULL,
      translation_vi  TEXT NOT NULL,
      phonetic        VARCHAR(100),
      audio_url       VARCHAR(500),
      pos             VARCHAR(50),
      definitions_en  JSONB DEFAULT '[]'::jsonb,
      examples        JSONB DEFAULT '[]'::jsonb,
      providers       JSONB DEFAULT '[]'::jsonb,
      hit_count       INT DEFAULT 1,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] word_translation_cache');

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_word_cache_word
      ON word_translation_cache(word);
  `);

  // 2. word_lookups columns — additive, safe to re-run
  await client.query(`
    ALTER TABLE word_lookups
      ADD COLUMN IF NOT EXISTS word_text     VARCHAR(100),
      ADD COLUMN IF NOT EXISTS lookup_result VARCHAR(20) DEFAULT 'dictionary',
      ADD COLUMN IF NOT EXISTS paragraph_id  UUID;
  `);

  // 3. CHECK constraint on lookup_result — guarded so re-running doesn't fail.
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name = 'word_lookups'
           AND constraint_name = 'word_lookups_lookup_result_check'
      ) THEN
        ALTER TABLE word_lookups
          ADD CONSTRAINT word_lookups_lookup_result_check
          CHECK (lookup_result IN ('dictionary','translation','not_found'));
      END IF;
    END $$;
  `);

  // 4. Drop NOT NULL on entry_id — guarded so re-running is a no-op.
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'word_lookups'
           AND column_name = 'entry_id'
           AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE word_lookups ALTER COLUMN entry_id DROP NOT NULL;
      END IF;
    END $$;
  `);

  console.log('  [✓] word_lookups fallback columns');
};

export = migration;
