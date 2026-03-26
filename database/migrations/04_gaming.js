/**
 * Domain 6: Gaming — Mini-games Config & Results (6 bảng)
 */
module.exports = async (client) => {

  await client.query(`
    CREATE TABLE IF NOT EXISTS game_word_lists (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      game_type   VARCHAR(20) NOT NULL
                  CHECK (game_type IN ('lexisweep','anagram')),
      name        VARCHAR(255) NOT NULL,
      topic       VARCHAR(100),
      level       VARCHAR(20) NOT NULL DEFAULT 'beginner'
                  CHECK (level IN ('beginner','intermediate','advanced')),
      status      VARCHAR(20) DEFAULT 'published'
                  CHECK (status IN ('draft','published','archived')),
      created_by  UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] game_word_lists');

  await client.query(`
    CREATE TABLE IF NOT EXISTS game_word_list_items (
      list_id   UUID NOT NULL REFERENCES game_word_lists(id) ON DELETE CASCADE,
      entry_id  UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      PRIMARY KEY (list_id, entry_id)
    );
  `);
  console.log('  [✓] game_word_list_items');

  await client.query(`
    CREATE TABLE IF NOT EXISTS game_levels (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      game_type     VARCHAR(20) NOT NULL
                    CHECK (game_type IN ('lexisweep','anagram','ladder')),
      level_number  INT NOT NULL,
      config_json   JSONB NOT NULL DEFAULT '{}',
      status        VARCHAR(20) DEFAULT 'active'
                    CHECK (status IN ('active','inactive')),
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (game_type, level_number)
    );
  `);
  console.log('  [✓] game_levels');

  await client.query(`
    CREATE TABLE IF NOT EXISTS semantic_sets (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name              VARCHAR(255) NOT NULL,
      scale_description VARCHAR(500) NOT NULL,
      level             VARCHAR(20) NOT NULL DEFAULT 'intermediate'
                        CHECK (level IN ('beginner','intermediate','advanced')),
      status            VARCHAR(20) DEFAULT 'published'
                        CHECK (status IN ('draft','published','archived')),
      created_by        UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] semantic_sets');

  await client.query(`
    CREATE TABLE IF NOT EXISTS semantic_set_items (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      set_id        UUID NOT NULL REFERENCES semantic_sets(id) ON DELETE CASCADE,
      entry_id      UUID NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      correct_order INT NOT NULL,
      hint_vi       VARCHAR(255),
      UNIQUE (set_id, correct_order),
      UNIQUE (set_id, entry_id)
    );
  `);
  console.log('  [✓] semantic_set_items');

  await client.query(`
    CREATE TABLE IF NOT EXISTS game_runs (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_type     VARCHAR(20) NOT NULL
                    CHECK (game_type IN ('lexisweep','anagram','ladder')),
      level_id      UUID REFERENCES game_levels(id) ON DELETE SET NULL,
      list_id       UUID REFERENCES game_word_lists(id) ON DELETE SET NULL,
      set_id        UUID REFERENCES semantic_sets(id) ON DELETE SET NULL,
      score         INT DEFAULT 0,
      accuracy      REAL CHECK (accuracy >= 0 AND accuracy <= 1),
      time_sec      INT,
      completed     BOOLEAN DEFAULT FALSE,
      details_json  JSONB,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] game_runs');
};
