/**
 * Migration 22: Seed retrieval_practice_daily feature quotas
 *
 * Adds the `retrieval_practice_daily` feature_key to plan_features
 * for Free / Premium / Pro subscription plans.
 *
 * Idempotent: uses ON CONFLICT (plan_id, feature_key) DO NOTHING.
 * Safe on fresh DB: skips plans that don't exist yet.
 */
import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {
  const quotas: { plan: string; value: string }[] = [
    { plan: 'Free',    value: 'false' },
    { plan: 'Premium', value: '10' },
    { plan: 'Pro',     value: '100' },
  ];

  let seeded = 0;

  for (const { plan, value } of quotas) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM subscription_plans WHERE name = $1 LIMIT 1`,
      [plan],
    );

    if (rows.length === 0) {
      console.log(`  [!] Plan "${plan}" not found, skipping`);
      continue;
    }

    await client.query(
      `INSERT INTO plan_features (plan_id, feature_key, feature_value)
       VALUES ($1, 'retrieval_practice_daily', $2)
       ON CONFLICT (plan_id, feature_key) DO NOTHING`,
      [rows[0].id, value],
    );
    seeded++;
  }

  if (seeded > 0) {
    console.log('  [✓] retrieval_practice_daily quotas seeded (Free=false, Premium=10, Pro=100)');
  } else {
    console.log('  [!] No plans found — quotas will be seeded after db:seed creates plans');
  }
};

export = migration;