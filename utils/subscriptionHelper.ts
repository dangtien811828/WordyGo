import pool from '../config/db';

// ── Active subscription ───────────────────────────────────────────────────────

export async function getActiveSubscription(userId: string) {
  // Auto-expire subscriptions whose period ended
  await pool.query(
    `UPDATE user_subscriptions
        SET status = 'expired', updated_at = NOW()
      WHERE user_id = $1 AND status = 'active' AND current_period_end < NOW()`,
    [userId]
  );

  const { rows } = await pool.query(
    `SELECT us.*, sp.name AS plan_name, sp.icon_color, sp.description AS plan_description
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
      WHERE us.user_id = $1
        AND us.status IN ('active', 'trial')
        AND us.current_period_end > NOW()
      ORDER BY us.created_at DESC
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

// ── Feature map ───────────────────────────────────────────────────────────────

export async function getFeaturesForUser(userId: string): Promise<Record<string, string>> {
  const sub = await getActiveSubscription(userId);

  const planId: string | null = sub
    ? sub.plan_id
    : await getFreePlanId();

  if (!planId) return {};

  const { rows } = await pool.query(
    `SELECT feature_key, feature_value FROM plan_features WHERE plan_id = $1`,
    [planId]
  );

  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.feature_key] = r.feature_value;
  }
  return map;
}

async function getFreePlanId(): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT id FROM subscription_plans
      WHERE status = 'active'
      ORDER BY price_monthly ASC, sort_order ASC
      LIMIT 1`
  );
  return rows[0]?.id ?? null;
}

// ── Usage counters ────────────────────────────────────────────────────────────

export async function getUsage(userId: string, featureKey: string): Promise<number> {
  switch (featureKey) {
    case 'flashcard_max_decks': {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM decks
          WHERE user_id = $1 AND deck_type = 'user_created'`,
        [userId]
      );
      return rows[0].cnt;
    }

    case 'retrieval_practice_daily': {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM retrieval_sessions
          WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`,
        [userId]
      );
      return rows[0].cnt;
    }

    case 'translation_daily': {
      // translation_cache is keyed by content hash (not per-user).
      // Per-user tracking added in Phase 9 migration.
      return 0;
    }

    default:
      return 0;
  }
}

// ── Period end calculator ─────────────────────────────────────────────────────

export function calcPeriodEnd(billingCycle: string, startDate: Date = new Date()): Date {
  const d = new Date(startDate);
  switch (billingCycle) {
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
    case 'weekly':  d.setDate(d.getDate() + 7);          break;
    case 'monthly':
    default:        d.setMonth(d.getMonth() + 1);        break;
  }
  return d;
}
