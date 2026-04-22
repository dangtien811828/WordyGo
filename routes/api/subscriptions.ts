import { Router, Response } from 'express';
import { z } from 'zod';
import NodeCache from 'node-cache';
import pool from '../../config/db';
import { ApiRequest, requireApiAuth, optionalApiAuth } from '../../middlewares/apiAuth';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import { validateBody } from '../../middlewares/validateBody';
import {
  getActiveSubscription,
  getFeaturesForUser,
  getUsage,
  calcPeriodEnd,
} from '../../utils/subscriptionHelper';

const router = Router();

// ── In-memory plan cache (5 min TTL) ─────────────────────────────────────────
const planCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const CACHE_KEY_ALL  = 'plans:all';
const CACHE_KEY_ID   = (id: string) => `plan:${id}`;

// ── Helper: load plans with features + payment_methods from DB ───────────────

async function loadPlansFromDb(activeOnly = true) {
  const where = activeOnly ? `WHERE sp.status = 'active'` : '';
  const { rows: plans } = await pool.query(
    `SELECT sp.id, sp.name, sp.description, sp.icon_color,
            sp.price_monthly, sp.price_yearly, sp.price_weekly,
            sp.trial_days, sp.promo_price, sp.promo_start, sp.promo_end,
            sp.is_recommended, sp.status, sp.sort_order
       FROM subscription_plans sp
      ${where}
      ORDER BY sp.sort_order ASC, sp.created_at ASC`
  );
  if (plans.length === 0) return [];

  const planIds = plans.map((p: any) => p.id);

  const [featuresRes, methodsRes] = await Promise.all([
    pool.query(
      `SELECT plan_id, feature_key, feature_value
         FROM plan_features
        WHERE plan_id = ANY($1::uuid[])
        ORDER BY feature_key ASC`,
      [planIds]
    ),
    pool.query(
      `SELECT ppm.plan_id,
              pm.id, pm.code, pm.display_name, pm.logo_url,
              pm.method_type, pm.fee_percent
         FROM plan_payment_methods ppm
         JOIN payment_methods pm ON pm.id = ppm.payment_method_id
        WHERE ppm.plan_id = ANY($1::uuid[])
          AND pm.is_active = TRUE
        ORDER BY pm.sort_order ASC`,
      [planIds]
    ),
  ]);

  const featureMap: Record<string, any[]> = {};
  for (const f of featuresRes.rows) {
    if (!featureMap[f.plan_id]) featureMap[f.plan_id] = [];
    featureMap[f.plan_id].push({ key: f.feature_key, value: f.feature_value });
  }

  const methodMap: Record<string, any[]> = {};
  for (const m of methodsRes.rows) {
    if (!methodMap[m.plan_id]) methodMap[m.plan_id] = [];
    methodMap[m.plan_id].push({
      id: m.id,
      code: m.code,
      display_name: m.display_name,
      logo_url: m.logo_url,
      method_type: m.method_type,
      fee_percent: parseFloat(m.fee_percent) || 0,
    });
  }

  return plans.map((p: any) => ({
    ...p,
    price_monthly: Number(p.price_monthly),
    price_yearly:  p.price_yearly  != null ? Number(p.price_yearly)  : null,
    price_weekly:  p.price_weekly  != null ? Number(p.price_weekly)  : null,
    promo_price:   p.promo_price   != null ? Number(p.promo_price)   : null,
    features:      featureMap[p.id]  || [],
    payment_methods: methodMap[p.id] || [],
  }));
}

// ── GET /api/v1/subscriptions/plans  (public) ─────────────────────────────────

router.get(
  '/plans',
  optionalApiAuth,
  asyncHandler(async (_req: ApiRequest, res: Response) => {
    let plans = planCache.get<any[]>(CACHE_KEY_ALL);
    if (!plans) {
      plans = await loadPlansFromDb(true);
      planCache.set(CACHE_KEY_ALL, plans);
    }
    return apiSuccess(res, plans);
  })
);

// ── GET /api/v1/subscriptions/plans/:id  (public) ────────────────────────────

router.get(
  '/plans/:id',
  optionalApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const { id } = req.params as { id: string };
    let plan = planCache.get<any>(CACHE_KEY_ID(id));
    if (!plan) {
      const allPlans = await loadPlansFromDb(false);
      plan = allPlans.find((p: any) => p.id === id) || null;
      if (plan) planCache.set(CACHE_KEY_ID(id), plan);
    }
    if (!plan) {
      return apiError(res, 404, 'NOT_FOUND', 'Plan không tồn tại');
    }
    return apiSuccess(res, plan);
  })
);

// ── GET /api/v1/subscriptions/me  (auth) ─────────────────────────────────────

router.get(
  '/me',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;

    const sub = await getActiveSubscription(userId);
    const features = await getFeaturesForUser(userId);

    // Build usage map for numeric features
    const usageMap: Record<string, number> = {};
    for (const [key, val] of Object.entries(features)) {
      if (val !== 'unlimited' && !isNaN(parseInt(val))) {
        usageMap[key] = await getUsage(userId, key);
      }
    }

    let currentPlan: any = null;
    if (sub) {
      const cached = planCache.get<any>(CACHE_KEY_ID(sub.plan_id));
      if (cached) {
        currentPlan = cached;
      } else {
        const { rows } = await pool.query(
          `SELECT id, name, description, icon_color, price_monthly, is_recommended, sort_order
             FROM subscription_plans WHERE id = $1`,
          [sub.plan_id]
        );
        currentPlan = rows[0] || null;
      }
    }

    return apiSuccess(res, {
      current_plan: currentPlan,
      subscription: sub
        ? {
            id:                   sub.id,
            status:               sub.status,
            billing_cycle:        sub.billing_cycle,
            current_period_start: sub.current_period_start,
            current_period_end:   sub.current_period_end,
            cancelled_at:         sub.cancelled_at,
            trial_end:            sub.trial_end,
          }
        : null,
      features,
      usage: usageMap,
    });
  })
);

// ── Checkout schemas ──────────────────────────────────────────────────────────

const VALID_CYCLES = ['monthly', 'yearly', 'weekly'] as const;

const previewSchema = z.object({
  plan_id:             z.string().uuid(),
  billing_cycle:       z.enum(VALID_CYCLES),
  payment_method_code: z.string().min(1).max(30),
});

const confirmSchema = z.object({
  plan_id:             z.string().uuid(),
  billing_cycle:       z.enum(VALID_CYCLES),
  payment_method_code: z.string().min(1).max(30),
  payment_ref:         z.string().max(255).optional(),
  amount_paid:         z.number().int().min(0),
});

// ── POST /api/v1/subscriptions/checkout/preview  (auth) ──────────────────────

router.post(
  '/checkout/preview',
  requireApiAuth,
  validateBody(previewSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { plan_id, billing_cycle, payment_method_code } = req.body;

    // Load plan
    const { rows: planRows } = await pool.query(
      `SELECT * FROM subscription_plans WHERE id = $1 AND status = 'active'`,
      [plan_id]
    );
    if (!planRows[0]) {
      return apiError(res, 404, 'NOT_FOUND', 'Plan không tồn tại hoặc không active');
    }
    const plan = planRows[0];

    // Load payment method (must be active and linked to this plan)
    const { rows: pmRows } = await pool.query(
      `SELECT pm.*
         FROM payment_methods pm
         JOIN plan_payment_methods ppm ON ppm.payment_method_id = pm.id
        WHERE pm.code = $1 AND pm.is_active = TRUE AND ppm.plan_id = $2`,
      [payment_method_code, plan_id]
    );
    if (!pmRows[0]) {
      return apiError(res, 400, 'VALIDATION_ERROR',
        'Phương thức thanh toán không hợp lệ hoặc không được chấp nhận cho gói này');
    }
    const pm = pmRows[0];

    // Pricing
    const priceField: Record<string, string> = {
      monthly: 'price_monthly',
      yearly:  'price_yearly',
      weekly:  'price_weekly',
    };
    const basePrice = Number(plan[priceField[billing_cycle]]) || 0;

    let promoDiscount = 0;
    if (plan.promo_price != null) {
      const now = new Date();
      const promoStart = plan.promo_start ? new Date(plan.promo_start) : null;
      const promoEnd   = plan.promo_end   ? new Date(plan.promo_end)   : null;
      const inWindow = (!promoStart || now >= promoStart) && (!promoEnd || now <= promoEnd);
      if (inWindow) {
        promoDiscount = Math.max(0, basePrice - Number(plan.promo_price));
      }
    }

    const feePercent  = parseFloat(pm.fee_percent) || 0;
    const feeAmount   = Math.round(basePrice * feePercent / 100);
    const totalAmount = basePrice - promoDiscount + feeAmount;

    // Payment instructions
    const ts = Date.now();
    const shortId = userId.replace(/-/g, '').substring(0, 8).toUpperCase();
    const transferContent = `EL_${shortId}_${ts}`;

    let paymentInstructions: Record<string, any>;
    const accountInfo = pm.account_info || {};

    if (pm.method_type === 'bank') {
      paymentInstructions = {
        type:             'bank_transfer',
        account_info:     accountInfo,
        transfer_content: transferContent,
        instructions_vi:  pm.instructions_vi,
      };
    } else if (pm.method_type === 'ewallet') {
      paymentInstructions = {
        type:             'qr_code',
        qr_image_url:     accountInfo.qr_image_url || null,
        transfer_content: transferContent,
        instructions_vi:  pm.instructions_vi,
      };
    } else if (pm.method_type === 'card') {
      paymentInstructions = {
        type:         'redirect',
        redirect_url: null,
      };
    } else {
      paymentInstructions = {
        type:             'manual',
        transfer_content: transferContent,
        instructions_vi:  pm.instructions_vi,
      };
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    return apiSuccess(res, {
      plan_id,
      plan_name:   plan.name,
      billing_cycle,
      pricing: {
        base_price:     basePrice,
        promo_discount: promoDiscount,
        fee_amount:     feeAmount,
        total_amount:   totalAmount,
      },
      payment_method: {
        code:         pm.code,
        display_name: pm.display_name,
        logo_url:     pm.logo_url,
      },
      payment_instructions: paymentInstructions,
      expires_at: expiresAt,
    });
  })
);

// ── POST /api/v1/subscriptions/checkout/confirm  (auth) ──────────────────────

router.post(
  '/checkout/confirm',
  requireApiAuth,
  validateBody(confirmSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { plan_id, billing_cycle, payment_method_code, payment_ref, amount_paid } = req.body;

    // Check for existing active/pending subscription
    const { rows: existing } = await pool.query(
      `SELECT id FROM user_subscriptions
        WHERE user_id = $1 AND status IN ('active','trial','pending_payment')
          AND current_period_end > NOW()`,
      [userId]
    );
    if (existing.length > 0) {
      return apiError(res, 409, 'ALREADY_SUBSCRIBED',
        'Bạn đã có subscription đang hoạt động. Hãy cancel trước khi đăng ký mới.');
    }

    // Validate plan + payment method
    const { rows: planRows } = await pool.query(
      `SELECT sp.*, pm.id AS pm_id, pm.code AS pm_code
         FROM subscription_plans sp
         JOIN plan_payment_methods ppm ON ppm.plan_id = sp.id
         JOIN payment_methods pm ON pm.id = ppm.payment_method_id
        WHERE sp.id = $1 AND sp.status = 'active'
          AND pm.code = $2 AND pm.is_active = TRUE`,
      [plan_id, payment_method_code]
    );
    if (!planRows[0]) {
      return apiError(res, 400, 'VALIDATION_ERROR',
        'Plan hoặc phương thức thanh toán không hợp lệ');
    }

    const periodStart = new Date();
    const periodEnd   = calcPeriodEnd(billing_cycle, periodStart);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create user_subscription (pending_payment)
      const { rows: subRows } = await client.query(
        `INSERT INTO user_subscriptions
           (user_id, plan_id, billing_cycle, price_paid, status,
            current_period_start, current_period_end)
         VALUES ($1,$2,$3,$4,'pending_payment',$5,$6)
         RETURNING id`,
        [userId, plan_id, billing_cycle, amount_paid, periodStart, periodEnd]
      );
      const subscriptionId = subRows[0].id;

      // Create transaction (pending)
      const { rows: txRows } = await client.query(
        `INSERT INTO transactions
           (user_id, subscription_id, type, amount, payment_method, payment_ref, status)
         VALUES ($1,$2,'new',$3,$4,$5,'pending')
         RETURNING id`,
        [userId, subscriptionId, amount_paid, payment_method_code, payment_ref || null]
      );
      const transactionId = txRows[0].id;

      // Notify all super_admins
      const { rows: adminRows } = await client.query(
        `SELECT id FROM admin_accounts WHERE role = 'super_admin'`
      );
      const userEmail = req.user!.email;
      for (const admin of adminRows) {
        await client.query(
          `INSERT INTO notifications (admin_id, type, title, message, link_url)
           VALUES ($1, 'payment_pending_review',
                   'Thanh toán chờ duyệt',
                   $2,
                   '/subscriptions/transactions')`,
          [admin.id, `User ${userEmail} vừa thanh toán, cần xác nhận`]
        );
      }

      await client.query('COMMIT');

      return apiSuccess(res, {
        subscription_id: subscriptionId,
        transaction_id:  transactionId,
        status:          'pending_payment',
        message:         'Đơn hàng đã tạo. Vui lòng hoàn tất thanh toán và chờ admin xác nhận.',
      }, 'Checkout thành công');

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// ── POST /api/v1/subscriptions/cancel  (auth) ────────────────────────────────

router.post(
  '/cancel',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;

    const { rows } = await pool.query(
      `UPDATE user_subscriptions
          SET cancelled_at = NOW(), updated_at = NOW()
        WHERE user_id = $1 AND status = 'active' AND cancelled_at IS NULL
        RETURNING id`,
      [userId]
    );

    if (rows.length === 0) {
      return apiError(res, 404, 'NOT_FOUND',
        'Không tìm thấy subscription active để cancel');
    }

    return res.status(204).send();
  })
);

// ── GET /api/v1/subscriptions/transactions  (auth) ───────────────────────────

router.get(
  '/transactions',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const page  = Math.max(1, parseInt(String(req.query.page))  || 1);
    const limit = Math.max(1, parseInt(String(req.query.limit)) || 20);
    const offset = (page - 1) * limit;

    const statusFilter = typeof req.query.status === 'string' && req.query.status
      ? req.query.status
      : null;

    const conditions = ['t.user_id = $1'];
    const params: any[] = [userId];

    if (statusFilter) {
      params.push(statusFilter);
      conditions.push(`t.status = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT t.id, t.type, t.amount, t.payment_method, t.payment_ref,
                t.status, t.created_at,
                sp.name AS plan_name,
                pm.display_name AS payment_method_display,
                pm.logo_url AS payment_method_logo,
                pm.code AS payment_method_code
           FROM transactions t
           LEFT JOIN user_subscriptions us ON us.id = t.subscription_id
           LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
           LEFT JOIN payment_methods pm ON pm.code = t.payment_method
          ${where}
          ORDER BY t.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM transactions t ${where}`,
        params
      ),
    ]);

    const total = countRes.rows[0].count;

    const items = dataRes.rows.map((r: any) => ({
      id:           r.id,
      plan_name:    r.plan_name || null,
      amount:       Number(r.amount),
      payment_method: {
        code:         r.payment_method_code || r.payment_method,
        display_name: r.payment_method_display || r.payment_method,
        logo_url:     r.payment_method_logo || null,
      },
      status:       r.status,
      payment_ref:  r.payment_ref,
      created_at:   r.created_at,
    }));

    return apiSuccess(res, {
      items,
      total,
      page,
      limit,
    });
  })
);

export default router;
