/**
 * Migration 27: Rename plan_features keys to match mobile FeatureLabels convention.
 *
 * Renames:
 *   - ebook_max         → premium_ebooks
 *   - offline           → offline_access
 *   - ads='false'       → no_ads='true'      (semantic INVERSION)
 *   - ads='true'        → DELETE              (no entitlement = ads shown by default)
 *
 * Inserts translation_daily quotas:
 *   Free=5, Premium=50, Pro=unlimited.
 *
 * Idempotent: each rename guards against UNIQUE(plan_id, feature_key) collisions
 * by deleting the OLD row when the NEW key already exists for the same plan.
 *
 * Re-running this migration after a partial manual fix is safe.
 */
import type { PoolClient } from 'pg';

const migration = async (client: PoolClient): Promise<void> => {

  // ── 1) ebook_max → premium_ebooks ──────────────────────────────────────────
  await client.query(`
    DELETE FROM plan_features pf1
     WHERE pf1.feature_key = 'ebook_max'
       AND EXISTS (
         SELECT 1 FROM plan_features pf2
          WHERE pf2.plan_id = pf1.plan_id
            AND pf2.feature_key = 'premium_ebooks'
       )
  `);
  const renamedEbookMax = await client.query(`
    UPDATE plan_features SET feature_key = 'premium_ebooks'
     WHERE feature_key = 'ebook_max'
  `);
  console.log(`  [✓] ebook_max → premium_ebooks (${renamedEbookMax.rowCount} rows)`);

  // ── 2) offline → offline_access ────────────────────────────────────────────
  await client.query(`
    DELETE FROM plan_features pf1
     WHERE pf1.feature_key = 'offline'
       AND EXISTS (
         SELECT 1 FROM plan_features pf2
          WHERE pf2.plan_id = pf1.plan_id
            AND pf2.feature_key = 'offline_access'
       )
  `);
  const renamedOffline = await client.query(`
    UPDATE plan_features SET feature_key = 'offline_access'
     WHERE feature_key = 'offline'
  `);
  console.log(`  [✓] offline → offline_access (${renamedOffline.rowCount} rows)`);

  // ── 3) ads → no_ads (inverted semantic) ────────────────────────────────────
  // ads='true' (user HAS ads) → entitlement absent → DELETE row
  const deletedAdsTrue = await client.query(`
    DELETE FROM plan_features
     WHERE feature_key = 'ads' AND feature_value = 'true'
  `);
  console.log(`  [✓] ads='true' deleted (${deletedAdsTrue.rowCount} rows)`);

  // ads='false' (user HAS NO ads) → no_ads='true'
  // Guard: drop pre-existing no_ads row on same plan to avoid UNIQUE collision
  await client.query(`
    DELETE FROM plan_features pf1
     WHERE pf1.feature_key = 'ads'
       AND pf1.feature_value = 'false'
       AND EXISTS (
         SELECT 1 FROM plan_features pf2
          WHERE pf2.plan_id = pf1.plan_id
            AND pf2.feature_key = 'no_ads'
       )
  `);
  const renamedAdsFalse = await client.query(`
    UPDATE plan_features
       SET feature_key   = 'no_ads',
           feature_value = 'true'
     WHERE feature_key = 'ads' AND feature_value = 'false'
  `);
  console.log(`  [✓] ads='false' → no_ads='true' (${renamedAdsFalse.rowCount} rows)`);

  // ── 4) Insert translation_daily quotas ─────────────────────────────────────
  const quotas: { plan: string; value: string }[] = [
    { plan: 'Free',    value: '5' },
    { plan: 'Premium', value: '50' },
    { plan: 'Pro',     value: 'unlimited' },
  ];

  let inserted = 0;
  for (const { plan, value } of quotas) {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM subscription_plans WHERE name = $1 LIMIT 1`,
      [plan],
    );
    if (rows.length === 0) {
      console.log(`  [!] Plan "${plan}" not found, skipping translation_daily seed`);
      continue;
    }
    const res = await client.query(
      `INSERT INTO plan_features (plan_id, feature_key, feature_value)
       VALUES ($1, 'translation_daily', $2)
       ON CONFLICT (plan_id, feature_key) DO NOTHING`,
      [rows[0].id, value],
    );
    inserted += res.rowCount ?? 0;
  }
  console.log(`  [✓] translation_daily seeded (Free=5, Premium=50, Pro=unlimited; ${inserted} new rows)`);
};

export = migration;
