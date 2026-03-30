/**
 * Domain 1: Auth & Users (2 tables)
 * Domain 2: Dictionary & Lessons (10 tables — was 8, +2 new)
 *
 * Changes from previous version:
 *   dictionary_entries: ipa → ipa_us + ipa_uk, +audio_us/uk_url, +cefr_level, +frequency_rank
 *                       lemma now NOT NULL (fixes NULL unique bug)
 *   NEW: entry_synonyms (junction — self-referencing dictionary_entries)
 *   NEW: entry_antonyms (junction — self-referencing dictionary_entries)
 */
module.exports = async (client) => {
  // ══ DOMAIN 1: AUTH ══

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email           VARCHAR(255) UNIQUE NOT NULL,
      password_hash   VARCHAR(255) NOT NULL,
      full_name       VARCHAR(255) NOT NULL,
      phone           VARCHAR(20),
      avatar_url      VARCHAR(500),
      level           VARCHAR(20) NOT NULL DEFAULT 'beginner'
                      CHECK (level IN ('beginner','intermediate','advanced')),
      status          VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','inactive','banned')),
      streak_current  INT DEFAULT 0,
      streak_longest  INT DEFAULT 0,
      last_active_at  TIMESTAMPTZ,
      last_login_at   TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] users');

  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_accounts (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email           VARCHAR(255) UNIQUE NOT NULL,
      password_hash   VARCHAR(255) NOT NULL,
      full_name       VARCHAR(255) NOT NULL,
      avatar_url      VARCHAR(500),
      role            VARCHAR(20) NOT NULL DEFAULT 'content_editor'
                      CHECK (role IN ('super_admin','content_editor','moderator')),
      status          VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','disabled')),
      last_login_at   TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] admin_accounts');

  // ══ DOMAIN 2: CONTENT ══

  await client.query(`
    CREATE TABLE IF NOT EXISTS tags (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name        VARCHAR(100) UNIQUE NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] tags');

  await client.query(`
    CREATE TABLE IF NOT EXISTS dictionary_entries (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      headword        VARCHAR(255) NOT NULL,
      lemma           VARCHAR(255) NOT NULL,

      -- Pronunciation: UK & US separated
      ipa_us          VARCHAR(255),
      ipa_uk          VARCHAR(255),
      audio_us_url    VARCHAR(500),
      audio_uk_url    VARCHAR(500),

      pos             VARCHAR(50)[] DEFAULT '{}',
      meaning_vi      TEXT NOT NULL,
      meaning_en      TEXT,
      example_en      TEXT,
      example_vi      TEXT,

      -- Metadata for learning prioritization
      cefr_level      VARCHAR(2) CHECK (cefr_level IN ('A1','A2','B1','B2','C1','C2')),
      frequency_rank  INT,

      source          VARCHAR(20) NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('stardict','wiktionary','manual','user')),
      admin_note      TEXT,
      published       BOOLEAN DEFAULT TRUE,
      created_by      UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (headword, lemma)
    );
  `);
  console.log('  [✓] dictionary_entries (improved: ipa_us/uk, cefr, frequency)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS entry_tags (
      entry_id  UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      tag_id    UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (entry_id, tag_id)
    );
  `);
  console.log('  [✓] entry_tags');

  await client.query(`
    CREATE TABLE IF NOT EXISTS entry_synonyms (
      entry_id    UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      synonym_id  UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      PRIMARY KEY (entry_id, synonym_id),
      CHECK (entry_id != synonym_id)
    );
  `);
  console.log('  [✓] entry_synonyms (NEW)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS entry_antonyms (
      entry_id    UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      antonym_id  UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      PRIMARY KEY (entry_id, antonym_id),
      CHECK (entry_id != antonym_id)
    );
  `);
  console.log('  [✓] entry_antonyms (NEW)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS entry_edit_history (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entry_id    UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      admin_id    UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      field_name  VARCHAR(100) NOT NULL,
      old_value   TEXT,
      new_value   TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] entry_edit_history');

  await client.query(`
    CREATE TABLE IF NOT EXISTS lessons (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title           VARCHAR(500) NOT NULL,
      description     TEXT,
      content_html    TEXT,
      level           VARCHAR(20) NOT NULL DEFAULT 'beginner'
                      CHECK (level IN ('beginner','intermediate','advanced')),
      thumbnail_url   VARCHAR(500),
      status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','published','archived')),
      publish_at      TIMESTAMPTZ,
      sort_order      INT DEFAULT 0,
      created_by      UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] lessons');

  await client.query(`
    CREATE TABLE IF NOT EXISTS lesson_tags (
      lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      tag_id    UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (lesson_id, tag_id)
    );
  `);
  console.log('  [✓] lesson_tags');

  await client.query(`
    CREATE TABLE IF NOT EXISTS lesson_entries (
      lesson_id  UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      entry_id   UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      sort_order INT DEFAULT 0,
      PRIMARY KEY (lesson_id, entry_id)
    );
  `);
  console.log('  [✓] lesson_entries');

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_lesson_progress (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id     UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      completed     BOOLEAN DEFAULT FALSE,
      progress      REAL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
      started_at    TIMESTAMPTZ,
      completed_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, lesson_id)
    );
  `);
  console.log('  [✓] user_lesson_progress');

  // ── Auto-update updated_at trigger ──
  await client.query(`
    CREATE OR REPLACE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  const tablesWithUpdatedAt = [
    'users', 'admin_accounts', 'dictionary_entries', 'lessons'
  ];
  for (const table of tablesWithUpdatedAt) {
    await client.query(`
      DROP TRIGGER IF EXISTS trg_${table}_updated_at ON ${table};
      CREATE TRIGGER trg_${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `);
  }
  console.log('  [✓] updated_at triggers (4 tables)');
};
