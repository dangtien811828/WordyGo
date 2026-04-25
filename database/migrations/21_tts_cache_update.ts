/**
 * Migration: tts_cache update — Section A casing convention (snake_case)
 *
 * - If tts_cache does not exist → CREATE TABLE with the new schema.
 * - If it exists (from migration 03) → ALTER TABLE ADD COLUMN IF NOT EXISTS for each
 *   new column. Existing columns (chapter_id, voice, audio_file_url, …) are left in
 *   place so legacy data and the idx_tts_chapter index from migration 08 keep working.
 *
 * Idempotent: safe to run multiple times.
 */
import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  const { rows } = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'tts_cache'
    ) AS exists;
  `);

  if (!rows[0].exists) {
    await client.query(`
      CREATE TABLE tts_cache (
        id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        source_text_hash   VARCHAR(64) NOT NULL,
        accent             VARCHAR(10) NOT NULL CHECK (accent IN ('us','uk')),
        voice_name         VARCHAR(50) NOT NULL,
        audio_url          VARCHAR(500) NOT NULL,
        char_count         INT NOT NULL,
        source_type        VARCHAR(30) NOT NULL,
        source_id          UUID,
        created_at         TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('  [✓] tts_cache (created)');
  } else {
    await client.query(`ALTER TABLE tts_cache ADD COLUMN IF NOT EXISTS source_text_hash VARCHAR(64);`);
    await client.query(`ALTER TABLE tts_cache ADD COLUMN IF NOT EXISTS accent           VARCHAR(10);`);
    await client.query(`ALTER TABLE tts_cache ADD COLUMN IF NOT EXISTS voice_name       VARCHAR(50);`);
    await client.query(`ALTER TABLE tts_cache ADD COLUMN IF NOT EXISTS audio_url        VARCHAR(500);`);
    await client.query(`ALTER TABLE tts_cache ADD COLUMN IF NOT EXISTS char_count       INT;`);
    await client.query(`ALTER TABLE tts_cache ADD COLUMN IF NOT EXISTS source_type      VARCHAR(30);`);
    await client.query(`ALTER TABLE tts_cache ADD COLUMN IF NOT EXISTS source_id        UUID;`);

    // Add the accent CHECK constraint only if it isn't already present.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'tts_cache_accent_check'
        ) THEN
          ALTER TABLE tts_cache
            ADD CONSTRAINT tts_cache_accent_check
            CHECK (accent IS NULL OR accent IN ('us','uk'));
        END IF;
      END $$;
    `);

    console.log('  [✓] tts_cache (altered — new columns added)');
  }

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tts_cache_lookup
      ON tts_cache(source_text_hash, accent, voice_name);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_tts_cache_source
      ON tts_cache(source_type, source_id);
  `);

  console.log('  [✓] tts_cache indexes (lookup, source)');
};

export = migration;
