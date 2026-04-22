/**
 * Phase 9: Paragraphs table + current_paragraph_index on user_reading_progress
 */
import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {

  await client.query(`
    CREATE TABLE IF NOT EXISTS paragraphs (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      chapter_id        UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      paragraph_index   INT NOT NULL,
      text              TEXT NOT NULL,
      word_count        INT NOT NULL,
      translation_vi    TEXT,
      audio_url         VARCHAR(500),
      duration_ms       INT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (chapter_id, paragraph_index)
    );
  `);
  console.log('  [✓] paragraphs');

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_paragraphs_chapter
      ON paragraphs (chapter_id, paragraph_index);
  `);
  console.log('  [✓] idx_paragraphs_chapter');

  await client.query(`
    ALTER TABLE user_reading_progress
      ADD COLUMN IF NOT EXISTS current_paragraph_index INT DEFAULT 0;
  `);
  console.log('  [✓] user_reading_progress.current_paragraph_index');
};

export = migration;
