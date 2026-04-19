import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_refresh_tokens (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_id    UUID NOT NULL UNIQUE,
      expires_at  TIMESTAMPTZ NOT NULL,
      revoked     BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_agent  VARCHAR(500),
      ip_address  VARCHAR(45)
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id  ON user_refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_id ON user_refresh_tokens(token_id);
  `);
  console.log('  [✓] user_refresh_tokens (+ 2 indexes)');
};

export = migration;
