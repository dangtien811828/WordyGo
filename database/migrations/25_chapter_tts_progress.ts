import { Pool } from 'pg';

/**
 * Migration 25: Chapter TTS Progress Tracking
 * 
 * Adds TTS generation status tracking for ebook chapters and paragraphs.
 * Allows admin to trigger TTS generation per chapter and view progress.
 * 
 * Changes:
 * - paragraphs: add audio_status, audio_error
 * - chapters: add tts_progress, tts_status, tts_started_at, tts_completed_at
 * 
 * Note: paragraphs.audio_url already exists from migration 18.
 */

const migration = async (pool: Pool): Promise<void> => {
  // 1. Add TTS tracking columns to paragraphs table
  await pool.query(`
    ALTER TABLE paragraphs
      ADD COLUMN IF NOT EXISTS audio_status varchar(20) DEFAULT 'none'
        CHECK (audio_status IN ('none', 'generating', 'ready', 'failed')),
      ADD COLUMN IF NOT EXISTS audio_error text;
  `);

  // 2. Add TTS progress tracking to chapters table
  await pool.query(`
    ALTER TABLE chapters
      ADD COLUMN IF NOT EXISTS tts_progress int DEFAULT 0
        CHECK (tts_progress BETWEEN 0 AND 100),
      ADD COLUMN IF NOT EXISTS tts_status varchar(20) DEFAULT 'none'
        CHECK (tts_status IN ('none', 'generating', 'ready', 'failed')),
      ADD COLUMN IF NOT EXISTS tts_started_at timestamptz,
      ADD COLUMN IF NOT EXISTS tts_completed_at timestamptz;
  `);

  // 3. Indexes for fast filtering
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chapters_tts_status 
      ON chapters(tts_status);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_paragraphs_audio_status 
      ON paragraphs(audio_status);
  `);

  console.log('✓ Migration 25: Chapter TTS progress tracking added');
};

export = migration;