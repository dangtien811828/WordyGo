/**
 * Domain 1: Auth & Users (2 tables)
 * Domain 2: Dictionary & Lessons (20 tables — was 10, +10 new for Dictionary Pro)
 *
 * Changes from previous version:
 *   dictionary_entries: ipa → ipa_us + ipa_uk, +audio_us/uk_url, +cefr_level, +frequency_rank
 *                       lemma now NOT NULL (fixes NULL unique bug)
 *   NEW: entry_synonyms (junction — self-referencing dictionary_entries)
 *   NEW: entry_antonyms (junction — self-referencing dictionary_entries)
 *
 * Dictionary Pro (multi-sense normalized):
 *   ALTER: dictionary_entries +etymology, +register, +is_countable, +is_transitive
 *   NEW: entry_senses, sense_examples, word_forms, entry_idioms, phrasal_verbs,
 *        collocations, sense_synonyms, sense_antonyms, word_families, word_family_members
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

  // ── Dictionary Pro: thêm columns mới vào dictionary_entries ──
  // Dùng try-catch vì ALTER ADD COLUMN lỗi nếu column đã tồn tại
  const newColumns = [
    { name: 'etymology',     sql: 'TEXT' },
    { name: 'register',      sql: "VARCHAR(30) CHECK (register IN ('formal','informal','slang','literary','technical','dated','humorous'))" },
    { name: 'is_countable',  sql: 'BOOLEAN' },
    { name: 'is_transitive', sql: 'BOOLEAN' },
  ];
  for (const col of newColumns) {
    try {
      await client.query(`ALTER TABLE dictionary_entries ADD COLUMN ${col.name} ${col.sql}`);
    } catch (err) {
      if (!err.message.includes('already exists')) throw err;
    }
  }
  console.log('  [✓] dictionary_entries (pro: +etymology, +register, +is_countable, +is_transitive)');

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

  // ══ DOMAIN 2 — DICTIONARY PRO: Multi-sense Normalized ══

  await client.query(`
    CREATE TABLE IF NOT EXISTS entry_senses (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entry_id        UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      pos             VARCHAR(30) NOT NULL,
      sense_order     INT NOT NULL DEFAULT 0,
      definition_en   TEXT,
      definition_vi   TEXT,
      register        VARCHAR(30)
                      CHECK (register IN ('formal','informal','slang','literary','technical','dated','humorous')),
      domain          VARCHAR(100),
      grammar_note    TEXT,
      usage_note      TEXT,
      region          VARCHAR(30),
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (entry_id, pos, sense_order)
    );
  `);
  console.log('  [✓] entry_senses');

  await client.query(`
    CREATE TABLE IF NOT EXISTS sense_examples (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      sense_id    UUID NOT NULL REFERENCES entry_senses(id) ON DELETE CASCADE,
      example_en  TEXT NOT NULL,
      example_vi  TEXT,
      sort_order  INT DEFAULT 0,
      source      VARCHAR(50)
    );
  `);
  console.log('  [✓] sense_examples');

  await client.query(`
    CREATE TABLE IF NOT EXISTS word_forms (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entry_id    UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      form_type   VARCHAR(30) NOT NULL
                  CHECK (form_type IN (
                    'base','third_person_singular','past_simple',
                    'past_participle','present_participle',
                    'plural','possessive',
                    'comparative','superlative'
                  )),
      form_value  VARCHAR(255) NOT NULL,
      ipa         VARCHAR(255),
      audio_url   VARCHAR(500),
      tags        VARCHAR(50)[] DEFAULT '{}',
      sort_order  INT DEFAULT 0,
      UNIQUE (entry_id, form_type, form_value)
    );
  `);
  console.log('  [✓] word_forms');

  await client.query(`
    CREATE TABLE IF NOT EXISTS entry_idioms (
      id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entry_id       UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      idiom_text     VARCHAR(500) NOT NULL,
      definition_en  TEXT,
      definition_vi  TEXT,
      example_en     TEXT,
      example_vi     TEXT,
      register       VARCHAR(30),
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] entry_idioms');

  await client.query(`
    CREATE TABLE IF NOT EXISTS phrasal_verbs (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entry_id        UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      phrasal_verb    VARCHAR(255) NOT NULL,
      particle        VARCHAR(30) NOT NULL,
      is_separable    BOOLEAN DEFAULT FALSE,
      definition_en   TEXT,
      definition_vi   TEXT,
      example_en      TEXT,
      example_vi      TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] phrasal_verbs');

  await client.query(`
    CREATE TABLE IF NOT EXISTS collocations (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      entry_id        UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      sense_id        UUID REFERENCES entry_senses(id) ON DELETE SET NULL,
      collocation     VARCHAR(255) NOT NULL,
      pattern         VARCHAR(50),
      example_en      TEXT,
      example_vi      TEXT,
      frequency       INT
    );
  `);
  console.log('  [✓] collocations');

  await client.query(`
    CREATE TABLE IF NOT EXISTS sense_synonyms (
      sense_id         UUID NOT NULL REFERENCES entry_senses(id) ON DELETE CASCADE,
      synonym_text     VARCHAR(255) NOT NULL,
      synonym_entry_id UUID REFERENCES dictionary_entries(id) ON DELETE SET NULL,
      PRIMARY KEY (sense_id, synonym_text)
    );
  `);
  console.log('  [✓] sense_synonyms');

  await client.query(`
    CREATE TABLE IF NOT EXISTS sense_antonyms (
      sense_id         UUID NOT NULL REFERENCES entry_senses(id) ON DELETE CASCADE,
      antonym_text     VARCHAR(255) NOT NULL,
      antonym_entry_id UUID REFERENCES dictionary_entries(id) ON DELETE SET NULL,
      PRIMARY KEY (sense_id, antonym_text)
    );
  `);
  console.log('  [✓] sense_antonyms');

  await client.query(`
    CREATE TABLE IF NOT EXISTS word_families (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      family_root VARCHAR(255) NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS word_family_members (
      family_id   UUID NOT NULL REFERENCES word_families(id) ON DELETE CASCADE,
      entry_id    UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      relation    VARCHAR(30) NOT NULL
                  CHECK (relation IN ('root','noun_form','verb_form','adj_form','adv_form','other')),
      PRIMARY KEY (family_id, entry_id)
    );
  `);
  console.log('  [✓] word_families + word_family_members');

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

export {};
