/**
 * Phase 11: per-user in-app notifications + FCM tokens.
 *
 * The pre-existing `notifications` table (migration 07) is admin-only —
 * its `admin_id` FK references admin_accounts. We need a separate
 * `user_notifications` table for the mobile app surface.
 *
 * `user_fcm_tokens` is the device-token registry. Actual FCM dispatch
 * is deferred to Phase 12; this migration only provisions the table.
 */
import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        VARCHAR(50) NOT NULL,
      title       VARCHAR(500) NOT NULL,
      message     TEXT,
      link_url    VARCHAR(500),
      is_read     BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
      ON user_notifications(user_id, created_at DESC);
  `);

  // Partial index to make unread-count + unread-list queries cheap.
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
      ON user_notifications(user_id) WHERE is_read = FALSE;
  `);

  console.log('  [✓] user_notifications + indexes');

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_fcm_tokens (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token         VARCHAR(500) NOT NULL,
      device_id     VARCHAR(200),
      platform      VARCHAR(20),
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      last_used_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, device_id)
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_user
      ON user_fcm_tokens(user_id);
  `);

  console.log('  [✓] user_fcm_tokens + index');
};

export = migration;
