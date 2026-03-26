/**
 * Domain 3: Flashcards & SRS (5 bảng)
 * Domain 4: Retrieval Practice (1 bảng)
 */
module.exports = async (client) => {
  // ══ DOMAIN 3: FLASHCARDS & SRS ══

  await client.query(`
    CREATE TABLE IF NOT EXISTS decks (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title             VARCHAR(500) NOT NULL,
      description       TEXT,
      level             VARCHAR(20) NOT NULL DEFAULT 'beginner'
                        CHECK (level IN ('beginner','intermediate','advanced')),
      thumbnail_url     VARCHAR(500),
      deck_type         VARCHAR(20) DEFAULT 'premade'
                        CHECK (deck_type IN ('premade','system_generated')),
      min_cards_to_study INT DEFAULT 5,
      status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','published','archived')),
      created_by        UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] decks');

  await client.query(`
    CREATE TABLE IF NOT EXISTS deck_tags (
      deck_id UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      tag_id  UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (deck_id, tag_id)
    );
  `);
  console.log('  [✓] deck_tags');

  await client.query(`
    CREATE TABLE IF NOT EXISTS cards (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      deck_id     UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      entry_id    UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      note_html   TEXT,
      sort_order  INT DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (deck_id, entry_id)
    );
  `);
  console.log('  [✓] cards');

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_card_progress (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      card_id     UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      leitner_box INT DEFAULT 1 CHECK (leitner_box >= 1 AND leitner_box <= 5),
      ease        REAL DEFAULT 2.5,
      interval    INT DEFAULT 0,
      due_at      TIMESTAMPTZ,
      stability   REAL,
      lapses      INT DEFAULT 0,
      last_review TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, card_id)
    );
  `);
  console.log('  [✓] user_card_progress');

  await client.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      card_id     UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      rating      SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 4),
      mode        VARCHAR(20) NOT NULL
                  CHECK (mode IN ('flashcard','swift_choice','cloze_craft','pair_link','leitner')),
      time_ms     INT,
      correct     BOOLEAN NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] reviews');

  // ══ DOMAIN 4: RETRIEVAL PRACTICE ══

  await client.query(`
    CREATE TABLE IF NOT EXISTS retrieval_sessions (
      id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_words     VARCHAR(255)[] NOT NULL,
      target_entry_ids UUID[] NOT NULL,
      sentences        TEXT[] NOT NULL,
      fixes            TEXT[],
      results_json     JSONB,
      all_passed       BOOLEAN DEFAULT FALSE,
      model_used       VARCHAR(30)
                       CHECK (model_used IN ('gpt-4o','gpt-4o-mini','languagetool')),
      latency_ms       INT,
      tokens_in        INT,
      tokens_out       INT,
      cost_usd         NUMERIC(10,6),
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] retrieval_sessions');
};
