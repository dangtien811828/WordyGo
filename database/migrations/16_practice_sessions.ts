import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id        uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deck_id        uuid        NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      mode           varchar(30) NOT NULL,
      total_count    int         NOT NULL,
      answered_count int         DEFAULT 0,
      correct_count  int         DEFAULT 0,
      wrong_count    int         DEFAULT 0,
      started_at     timestamptz DEFAULT now(),
      completed_at   timestamptz,
      time_total_ms  int,
      xp_earned      int         DEFAULT 0
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_practice_sessions_user
      ON practice_sessions(user_id, started_at DESC)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS practice_answers (
      id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
      session_id  uuid        NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
      card_id     uuid        NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      correct     boolean     NOT NULL,
      time_ms     int,
      user_answer text,
      created_at  timestamptz DEFAULT now()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_practice_answers_session
      ON practice_answers(session_id)
  `);

  console.log('  [✓] practice_sessions + practice_answers + indexes');
};

export = migration;
