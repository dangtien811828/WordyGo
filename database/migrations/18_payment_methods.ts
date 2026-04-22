/**
 * Phase 7: Payment Methods — 2 new tables + admin_note on transactions
 */
import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {

  await client.query(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      code             VARCHAR(30) UNIQUE NOT NULL,
      display_name     VARCHAR(100) NOT NULL,
      description      TEXT,
      logo_url         VARCHAR(500),
      method_type      VARCHAR(20) NOT NULL
                       CHECK (method_type IN ('ewallet','bank','card','international')),
      account_info     JSONB,
      instructions_vi  TEXT,
      instructions_en  TEXT,
      fee_percent      NUMERIC(5,2) DEFAULT 0,
      is_active        BOOLEAN DEFAULT TRUE,
      sort_order       INT DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] payment_methods');

  await client.query(`
    CREATE TABLE IF NOT EXISTS plan_payment_methods (
      plan_id            UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
      payment_method_id  UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
      PRIMARY KEY (plan_id, payment_method_id)
    );
  `);
  console.log('  [✓] plan_payment_methods');

  // Add admin_note to transactions for approve/reject workflow
  await client.query(`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS admin_note TEXT;
  `);
  console.log('  [✓] transactions.admin_note');

  // Seed 6 default payment methods
  await client.query(`
    INSERT INTO payment_methods (code, display_name, method_type, sort_order) VALUES
      ('momo',          'Ví Momo',                 'ewallet',       1),
      ('zalopay',       'ZaloPay',                 'ewallet',       2),
      ('bank_transfer', 'Chuyển khoản ngân hàng',  'bank',          3),
      ('visa_master',   'Thẻ Visa/Mastercard',      'card',          4),
      ('apple_pay',     'Apple Pay',               'international', 5),
      ('google_pay',    'Google Pay',              'international', 6)
    ON CONFLICT (code) DO NOTHING;
  `);
  console.log('  [✓] payment_methods seeded (6 rows)');
};

export = migration;
