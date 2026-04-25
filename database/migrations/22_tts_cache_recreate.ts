/**
 * Migration: tts_cache recreate.
 *
 * The original tts_cache (migration 03) had `chapter_id UUID NOT NULL` plus
 * `voice / speed / audio_file_url` etc., which doesn't fit the new
 * dictionary/ebook TTS use case. The cache holds no critical data, so we
 * drop and recreate with the new snake_case schema.
 *
 * Idempotent: the DROP+CREATE only runs while the legacy schema is still
 * around (detected by the presence of the `chapter_id` column) or while no
 * `tts_cache` table exists. On subsequent runs — once the new schema is
 * already in place — this migration is a no-op so that re-running
 * `db:migrate` on every Railway deploy doesn't wipe the cache.
 */
import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  const tableProbe = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'tts_cache'
    ) AS exists;
  `);

  const legacyProbe = await client.query<{ has_legacy: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tts_cache'
        AND column_name = 'chapter_id'
    ) AS has_legacy;
  `);

  const tableExists = tableProbe.rows[0].exists;
  const hasLegacy = legacyProbe.rows[0].has_legacy;

  if (tableExists && !hasLegacy) {
    console.log('  [skip] tts_cache already on new schema — nothing to do');
    return;
  }

  await client.query(`DROP TABLE IF EXISTS tts_cache CASCADE;`);

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

  await client.query(`
    CREATE UNIQUE INDEX idx_tts_cache_lookup
      ON tts_cache(source_text_hash, accent, voice_name);
  `);

  await client.query(`
    CREATE INDEX idx_tts_cache_source
      ON tts_cache(source_type, source_id);
  `);

  console.log('  [✓] tts_cache recreated with new schema (9 columns + 2 indexes)');
};

export = migration;
