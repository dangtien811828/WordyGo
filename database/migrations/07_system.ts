/**
 * Domain 9: System — Config, Audit, Notifications, Activity (4 tables)
 *
 * Fix: user_activity_log.action — removed CHECK constraint (allow new activity types)
 */
import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {

  await client.query(`
    CREATE TABLE IF NOT EXISTS system_configs (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      config_key    VARCHAR(100) UNIQUE NOT NULL,
      config_value  JSONB NOT NULL,
      description   TEXT,
      updated_by    UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] system_configs');

  await client.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      admin_id      UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      action        VARCHAR(20) NOT NULL
                    CHECK (action IN ('CREATE','UPDATE','DELETE','BAN','UNBAN','PUBLISH','REVOKE','LOGIN')),
      module        VARCHAR(30) NOT NULL,
      target_type   VARCHAR(50),
      target_id     UUID,
      target_label  VARCHAR(500),
      details       JSONB,
      ip_address    VARCHAR(45),
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] audit_logs');

  await client.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      admin_id    UUID NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
      type        VARCHAR(50) NOT NULL,
      title       VARCHAR(500) NOT NULL,
      message     TEXT,
      link_url    VARCHAR(500),
      is_read     BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] notifications');

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_activity_log (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action        VARCHAR(50) NOT NULL,
      details       JSONB,
      duration_sec  INT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] user_activity_log (fix: flexible action)');
};

export = migration;
