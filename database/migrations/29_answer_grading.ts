import type { PoolClient } from 'pg';

/**
 * Migration 29: Typed Vietnamese answer grading support.
 *
 * Adds:
 * - entry_answer_aliases: accepted Vietnamese aliases per dictionary entry.
 * - answer_semantic_cache: cached GPT semantic grading results per entry + answer.
 * - nullable metadata on practice_answers so legacy client-graded answers remain valid.
 */
const migration = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS entry_answer_aliases (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entry_id          UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      answer_text       TEXT NOT NULL,
      normalized_answer TEXT NOT NULL,
      source            VARCHAR(30) NOT NULL DEFAULT 'admin'
                        CHECK (source IN ('admin','ai_accepted','import','user_suggested')),
      status            VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','pending','rejected')),
      created_by        UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entry_answer_aliases_active_unique
      ON entry_answer_aliases(entry_id, normalized_answer)
      WHERE status = 'active';
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_entry_answer_aliases_entry_status
      ON entry_answer_aliases(entry_id, status);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS answer_semantic_cache (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entry_id          UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      normalized_answer TEXT NOT NULL,
      user_answer       TEXT NOT NULL,
      verdict           VARCHAR(20) NOT NULL
                        CHECK (verdict IN ('correct','near_correct','wrong')),
      confidence        NUMERIC(5,4) NOT NULL DEFAULT 0
                        CHECK (confidence >= 0 AND confidence <= 1),
      reason_vi         TEXT,
      matched_answer    TEXT,
      accepted_answers  JSONB NOT NULL DEFAULT '[]'::jsonb,
      model_used        VARCHAR(100),
      latency_ms        INT,
      tokens_in         INT,
      tokens_out        INT,
      cost_usd          NUMERIC(12,8),
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (entry_id, normalized_answer)
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_answer_semantic_cache_entry_verdict
      ON answer_semantic_cache(entry_id, verdict);
  `);

  await client.query(`
    ALTER TABLE practice_answers
      ADD COLUMN IF NOT EXISTS grading_source VARCHAR(30)
        CHECK (grading_source IN ('exact','alias','semantic_cache','openai','client_legacy','deterministic_miss','openai_unavailable')),
      ADD COLUMN IF NOT EXISTS verdict VARCHAR(20)
        CHECK (verdict IN ('correct','near_correct','wrong')),
      ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4)
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
      ADD COLUMN IF NOT EXISTS matched_answer TEXT,
      ADD COLUMN IF NOT EXISTS accepted_answers JSONB,
      ADD COLUMN IF NOT EXISTS grading_details JSONB;
  `);

  console.log('  [✓] answer grading aliases, semantic cache, and practice answer metadata');
};

export = migration;
