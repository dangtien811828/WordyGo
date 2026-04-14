const pool = require('../config/db');
const { paginate } = require('../helpers/pagination');

const Subscription = {
  /**
   * Get all plans with their features.
   * Returns each plan with a `.features` array: [{ feature_key, feature_value }]
   */
  async getPlans() {
    const { rows: plans } = await pool.query(
      `SELECT sp.*,
              (SELECT COUNT(*)::int FROM user_subscriptions us
               WHERE us.plan_id = sp.id AND us.status = 'active') AS active_subscribers
       FROM subscription_plans sp
       ORDER BY sp.sort_order ASC, sp.created_at ASC`
    );
    if (plans.length === 0) return [];

    const { rows: features } = await pool.query(
      `SELECT plan_id, feature_key, feature_value
       FROM plan_features
       WHERE plan_id = ANY($1::uuid[])
       ORDER BY feature_key ASC`,
      [plans.map(p => p.id)]
    );

    const featureMap = {};
    for (const f of features) {
      if (!featureMap[f.plan_id]) featureMap[f.plan_id] = [];
      featureMap[f.plan_id].push({ feature_key: f.feature_key, feature_value: f.feature_value });
    }

    return plans.map(p => ({ ...p, features: featureMap[p.id] || [] }));
  },

  /**
   * Get a single plan by id with features. Returns null if not found.
   */
  async getPlanById(id) {
    const { rows } = await pool.query(
      `SELECT sp.*,
              (SELECT COUNT(*)::int FROM user_subscriptions us
               WHERE us.plan_id = sp.id AND us.status = 'active') AS active_subscribers
       FROM subscription_plans sp
       WHERE sp.id = $1`,
      [id]
    );
    if (!rows[0]) return null;
    const plan = rows[0];

    const { rows: features } = await pool.query(
      `SELECT feature_key, feature_value FROM plan_features WHERE plan_id = $1 ORDER BY feature_key ASC`,
      [id]
    );
    plan.features = features;
    return plan;
  },

  /**
   * Create a new plan with features.
   * @param {object} data  - Plan fields
   * @param {Array}  features - [{ key, value }]
   */
  async createPlan(data, features = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO subscription_plans
           (name, description, icon_color,
            price_monthly, price_yearly, price_weekly,
            trial_days, promo_price, promo_start, promo_end,
            is_recommended, status, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          data.name,
          data.description || null,
          data.icon_color || null,
          data.price_monthly || 0,
          data.price_yearly || null,
          data.price_weekly || null,
          data.trial_days || 0,
          data.promo_price || null,
          data.promo_start || null,
          data.promo_end || null,
          data.is_recommended ? true : false,
          data.status || 'inactive',
          data.sort_order || 0,
        ]
      );
      const plan = rows[0];

      for (const f of features) {
        if (!f.key || !f.key.trim()) continue;
        await client.query(
          `INSERT INTO plan_features (plan_id, feature_key, feature_value)
           VALUES ($1, $2, $3)
           ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value`,
          [plan.id, f.key.trim(), f.value || '']
        );
      }

      await client.query('COMMIT');
      return plan;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Update a plan and replace its features entirely.
   * @param {string} id
   * @param {object} data
   * @param {Array}  features - [{ key, value }]
   */
  async updatePlan(id, data, features = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `UPDATE subscription_plans SET
           name          = $1,
           description   = $2,
           icon_color    = $3,
           price_monthly = $4,
           price_yearly  = $5,
           price_weekly  = $6,
           trial_days    = $7,
           promo_price   = $8,
           promo_start   = $9,
           promo_end     = $10,
           is_recommended = $11,
           status        = $12,
           sort_order    = $13
         WHERE id = $14
         RETURNING *`,
        [
          data.name,
          data.description || null,
          data.icon_color || null,
          data.price_monthly || 0,
          data.price_yearly || null,
          data.price_weekly || null,
          data.trial_days || 0,
          data.promo_price || null,
          data.promo_start || null,
          data.promo_end || null,
          data.is_recommended ? true : false,
          data.status || 'inactive',
          data.sort_order || 0,
          id,
        ]
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return null;
      }

      // Replace features
      await client.query('DELETE FROM plan_features WHERE plan_id = $1', [id]);
      for (const f of features) {
        if (!f.key || !f.key.trim()) continue;
        await client.query(
          `INSERT INTO plan_features (plan_id, feature_key, feature_value) VALUES ($1,$2,$3)`,
          [id, f.key.trim(), f.value || '']
        );
      }

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Delete a plan. Throws if there are active subscribers.
   */
  async deletePlan(id) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM user_subscriptions WHERE plan_id = $1 AND status = 'active'`,
      [id]
    );
    if (rows[0].cnt > 0) {
      const err: any = new Error('Không thể xóa gói đang có người đăng ký.');
      err.code = 'HAS_ACTIVE_SUBSCRIBERS';
      throw err;
    }
    await pool.query('DELETE FROM subscription_plans WHERE id = $1', [id]);
  },

  /**
   * Get paginated subscribers for a plan, newest first.
   */
  async getSubscribers(planId, { page = 1, limit = 20 } = {}) {
    const query = `
      SELECT us.id, us.billing_cycle, us.price_paid, us.status,
             us.trial_end, us.current_period_start, us.current_period_end, us.cancelled_at,
             us.created_at,
             u.full_name, u.email,
             sp.name AS plan_name
        FROM user_subscriptions us
        JOIN users u ON u.id = us.user_id
        JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.plan_id = $1
       ORDER BY us.created_at DESC
       LIMIT $2 OFFSET $3`;
    const countQuery = `
      SELECT COUNT(*)::int AS count
        FROM user_subscriptions us
       WHERE us.plan_id = $1`;
    return paginate(query, countQuery, [planId], [planId], page, limit);
  },

  /**
   * Get all recent transactions (all plans), paginated, newest first.
   */
  async getRecentTransactions({ page = 1, limit = 20 } = {}) {
    const query = `
      SELECT t.id, t.type, t.amount, t.payment_method, t.payment_ref, t.status,
             t.created_at,
             u.full_name, u.email,
             sp.name AS plan_name
        FROM transactions t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN user_subscriptions us ON us.id = t.subscription_id
        LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       ORDER BY t.created_at DESC
       LIMIT $1 OFFSET $2`;
    const countQuery = `SELECT COUNT(*)::int AS count FROM transactions`;
    return paginate(query, countQuery, [], [], page, limit);
  },

  /**
   * Compute high-level stats.
   * Returns { mrr, totalSubscribers, churnRate }
   */
  async getStats() {
    const { rows: subRows } = await pool.query(`
      SELECT billing_cycle, SUM(price_paid)::bigint AS total_paid
        FROM user_subscriptions
       WHERE status = 'active'
       GROUP BY billing_cycle`);

    let mrr = 0;
    for (const r of subRows) {
      const paid = Number(r.total_paid) || 0;
      if (r.billing_cycle === 'monthly') mrr += paid;
      else if (r.billing_cycle === 'yearly') mrr += Math.round(paid / 12);
      else if (r.billing_cycle === 'weekly') mrr += Math.round(paid * 4.33);
    }

    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM user_subscriptions WHERE status = 'active'`
    );
    const totalSubscribers = totalRows[0].cnt;

    // Churn: cancelled in last 30 days / active subscribers
    const { rows: churnRows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM user_subscriptions
        WHERE status = 'cancelled' AND cancelled_at >= NOW() - INTERVAL '30 days'`
    );
    const cancelledLast30 = churnRows[0].cnt;
    const churnRate = totalSubscribers > 0
      ? Math.round((cancelledLast30 / (totalSubscribers + cancelledLast30)) * 100)
      : 0;

    return { mrr, totalSubscribers, churnRate };
  },
};

module.exports = Subscription;

export {};
