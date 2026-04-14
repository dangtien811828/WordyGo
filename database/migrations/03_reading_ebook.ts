/**
 * Domain 5: Reading — Ebook, TTS, Lookup (6 bảng)
 */
module.exports = async (client) => {

  await client.query(`
    CREATE TABLE IF NOT EXISTS ebooks (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title           VARCHAR(500) NOT NULL,
      author          VARCHAR(255) NOT NULL,
      isbn            VARCHAR(30),
      description     TEXT,
      cover_url       VARCHAR(500),
      epub_file_url   VARCHAR(500) NOT NULL,
      level           VARCHAR(20) NOT NULL DEFAULT 'beginner'
                      CHECK (level IN ('beginner','intermediate','advanced')),
      genre           VARCHAR(50)[] DEFAULT '{}',
      total_chapters  INT DEFAULT 0,
      total_words     INT DEFAULT 0,
      required_plan   VARCHAR(20) DEFAULT 'free'
                      CHECK (required_plan IN ('free','premium','pro')),
      tts_voice       VARCHAR(100),
      tts_speed       REAL DEFAULT 1.0,
      status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','published','archived')),
      created_by      UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] ebooks');

  await client.query(`
    CREATE TABLE IF NOT EXISTS chapters (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      ebook_id        UUID NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
      chapter_index   INT NOT NULL,
      title           VARCHAR(500) NOT NULL,
      content_html    TEXT,
      word_count      INT DEFAULT 0,
      has_tts         BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (ebook_id, chapter_index)
    );
  `);
  console.log('  [✓] chapters');

  await client.query(`
    CREATE TABLE IF NOT EXISTS tts_cache (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      chapter_id      UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      voice           VARCHAR(100) NOT NULL,
      speed           REAL DEFAULT 1.0,
      audio_file_url  VARCHAR(500) NOT NULL,
      duration_sec    INT,
      file_size_bytes BIGINT,
      timepoints_json JSONB NOT NULL DEFAULT '{}',
      last_accessed   TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (chapter_id, voice, speed)
    );
  `);
  console.log('  [✓] tts_cache');

  await client.query(`
    CREATE TABLE IF NOT EXISTS ebook_glossary (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      ebook_id        UUID NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
      term_en         VARCHAR(255) NOT NULL,
      translation_vi  VARCHAR(500) NOT NULL,
      domain          VARCHAR(100),
      occurrences     INT DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (ebook_id, term_en)
    );
  `);
  console.log('  [✓] ebook_glossary');

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_reading_progress (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ebook_id        UUID NOT NULL REFERENCES ebooks(id) ON DELETE CASCADE,
      current_chapter INT DEFAULT 0,
      progress        REAL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
      total_time_sec  INT DEFAULT 0,
      words_looked_up INT DEFAULT 0,
      started_at      TIMESTAMPTZ,
      last_read_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, ebook_id)
    );
  `);
  console.log('  [✓] user_reading_progress');

  await client.query(`
    CREATE TABLE IF NOT EXISTS word_lookups (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_id    UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      source      VARCHAR(20) NOT NULL
                  CHECK (source IN ('ebook','flashcard','manual_search')),
      ebook_id    UUID REFERENCES ebooks(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] word_lookups');
};

export {};
