import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  // Drop old Leitner tables if they exist from a prior failed attempt
  await client.query(`DROP TABLE IF EXISTS leitner_reviews CASCADE`);
  await client.query(`DROP TABLE IF EXISTS leitner_cards CASCADE`);

  await client.query(`
    CREATE TABLE leitner_cards (
      id                uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id           uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_id          uuid        NOT NULL REFERENCES dictionary_entries(id) ON DELETE CASCADE,
      box_number        smallint    NOT NULL DEFAULT 1 CHECK (box_number BETWEEN 1 AND 5),
      due_at            timestamptz NOT NULL,
      last_reviewed_at  timestamptz,
      correct_streak    int         DEFAULT 0,
      total_reviews     int         DEFAULT 0,
      source            varchar(30) NOT NULL DEFAULT 'practice',
      added_from_mode   varchar(30),
      created_at        timestamptz DEFAULT now(),
      updated_at        timestamptz DEFAULT now(),
      UNIQUE(user_id, entry_id)
    )
  `);

  await client.query(`CREATE INDEX idx_leitner_due ON leitner_cards(user_id, due_at)`);
  await client.query(`CREATE INDEX idx_leitner_box ON leitner_cards(user_id, box_number)`);

  await client.query(`
    CREATE TABLE leitner_reviews (
      id               uuid      PRIMARY KEY DEFAULT uuid_generate_v4(),
      leitner_card_id  uuid      NOT NULL REFERENCES leitner_cards(id) ON DELETE CASCADE,
      user_id          uuid      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      correct          boolean   NOT NULL,
      old_box          smallint  NOT NULL,
      new_box          smallint  NOT NULL,
      time_ms          int,
      created_at       timestamptz DEFAULT now()
    )
  `);

  await client.query(`
    CREATE INDEX idx_leitner_reviews_user ON leitner_reviews(user_id, created_at DESC)
  `);

  // Seed default intervals — DO NOTHING so production overrides are preserved
  await client.query(`
    INSERT INTO system_configs (config_key, config_value, description)
    VALUES ('leitner_intervals_days', '[1, 2, 4, 7, 14]'::jsonb, 'Interval days for Box 1..5')
    ON CONFLICT (config_key) DO NOTHING
  `);

  console.log('  [✓] leitner_cards + leitner_reviews + indexes + leitner_intervals_days config');
};

export = migration;
