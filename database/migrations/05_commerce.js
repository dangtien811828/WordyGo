/**
 * Domain 7: Commerce — Subscriptions & Payments (4 bảng)
 */
module.exports = async (client) => {

  await client.query(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name            VARCHAR(100) NOT NULL,
      description     TEXT,
      icon_color      VARCHAR(20),
      price_monthly   BIGINT DEFAULT 0,
      price_yearly    BIGINT DEFAULT 0,
      price_weekly    BIGINT DEFAULT 0,
      trial_days      INT DEFAULT 0,
      promo_price     BIGINT,
      promo_start     TIMESTAMPTZ,
      promo_end       TIMESTAMPTZ,
      is_recommended  BOOLEAN DEFAULT FALSE,
      status          VARCHAR(20) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','inactive')),
      sort_order      INT DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] subscription_plans');

  await client.query(`
    CREATE TABLE IF NOT EXISTS plan_features (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      plan_id       UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
      feature_key   VARCHAR(100) NOT NULL,
      feature_value VARCHAR(255) NOT NULL,
      UNIQUE (plan_id, feature_key)
    );
  `);
  console.log('  [✓] plan_features');

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id               UUID NOT NULL REFERENCES subscription_plans(id),
      billing_cycle         VARCHAR(20) NOT NULL
                            CHECK (billing_cycle IN ('monthly','yearly','weekly')),
      price_paid            BIGINT NOT NULL,
      status                VARCHAR(20) NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','expired','cancelled','trial')),
      trial_end             TIMESTAMPTZ,
      current_period_start  TIMESTAMPTZ NOT NULL,
      current_period_end    TIMESTAMPTZ NOT NULL,
      cancelled_at          TIMESTAMPTZ,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] user_subscriptions');

  await client.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
      type            VARCHAR(20) NOT NULL
                      CHECK (type IN ('new','renew','upgrade','downgrade','cancel','refund')),
      amount          BIGINT NOT NULL,
      payment_method  VARCHAR(50),
      payment_ref     VARCHAR(255),
      status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','completed','failed','refunded')),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('  [✓] transactions');
};
