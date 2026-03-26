/**
 * Domain 8: AI Content & Micro-delta Sync (6 bảng)
 */
module.exports = async (client) => {

  await client.query(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name            VARCHAR(255) NOT NULL,
      description     TEXT,
      model           VARCHAR(30) NOT NULL
                      CHECK (model IN ('gpt-4o','gpt-4o-mini')),
      system_prompt   TEXT NOT NULL,
      expected_schema JSONB NOT NULL DEFAULT '{}',
      version         INT NOT NULL DEFAULT 1,
      status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','active','archived')),
      created_by      UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] prompt_templates');

  await client.query(`
    CREATE TABLE IF NOT EXISTS moderation_logs (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      input_text      TEXT NOT NULL,
      source          VARCHAR(30) NOT NULL DEFAULT 'retrieval_practice',
      flag_type       VARCHAR(30)
                      CHECK (flag_type IN ('sexual','violence','hate','self_harm','other')),
      severity        VARCHAR(10)
                      CHECK (severity IN ('low','medium','high')),
      api_response    JSONB,
      status          VARCHAR(20) DEFAULT 'pending'
                      CHECK (status IN ('pending','reviewed','dismissed')),
      reviewer_id     UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      reviewer_note   TEXT,
      action_taken    VARCHAR(20)
                      CHECK (action_taken IN ('none','warn','ban')),
      reviewed_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] moderation_logs');

  await client.query(`
    CREATE TABLE IF NOT EXISTS translation_cache (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      source_hash     VARCHAR(64) UNIQUE NOT NULL,
      source_text     TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      source_lang     VARCHAR(10) DEFAULT 'en',
      target_lang     VARCHAR(10) DEFAULT 'vi',
      ebook_id        UUID REFERENCES ebooks(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] translation_cache');

  await client.query(`
    CREATE TABLE IF NOT EXISTS translation_glossary (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      term_en         VARCHAR(255) UNIQUE NOT NULL,
      translation_vi  VARCHAR(500) NOT NULL,
      domain          VARCHAR(100),
      created_by      UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] translation_glossary');

  await client.query(`
    CREATE TABLE IF NOT EXISTS micro_delta_batches (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      seq             BIGINT UNIQUE NOT NULL,
      entries_count   INT NOT NULL,
      batch_type      VARCHAR(20) NOT NULL
                      CHECK (batch_type IN ('auto_backfill','manual','mixed')),
      status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','published','failed','revoked')),
      published_at    TIMESTAMPTZ,
      created_by      UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] micro_delta_batches');

  await client.query(`
    CREATE TABLE IF NOT EXISTS batch_entries (
      batch_id        UUID NOT NULL REFERENCES micro_delta_batches(id) ON DELETE CASCADE,
      entry_id        UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      action          VARCHAR(10) NOT NULL CHECK (action IN ('upsert','delete')),
      entry_snapshot  JSONB NOT NULL,
      PRIMARY KEY (batch_id, entry_id)
    );
  `);
  console.log('  [✓] batch_entries');
};
