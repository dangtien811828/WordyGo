import type { Request, Response } from 'express';
import Subscription from '../models/Subscription';

/**
 * Parse feature_key[] and feature_value[] from form body into [{ key, value }].
 */
function parseFeatures(body: any) {
  const keys: any[] = ([] as any[]).concat(body['feature_key[]'] || []);
  const vals: any[] = ([] as any[]).concat(body['feature_value[]'] || []);
  return keys
    .map((k, i) => ({ key: (k || '').trim(), value: (vals[i] || '').trim() }))
    .filter(f => f.key);
}

/**
 * Parse plan data fields from form body.
 */
function parsePlanData(body: any) {
  return {
    name:           (body.name || '').trim(),
    description:    (body.description || '').trim() || null,
    icon_color:     (body.icon_color || '').trim() || null,
    price_monthly:  parseInt(body.price_monthly) || 0,
    price_yearly:   body.price_yearly ? (parseInt(body.price_yearly) || null) : null,
    price_weekly:   body.price_weekly ? (parseInt(body.price_weekly) || null) : null,
    trial_days:     parseInt(body.trial_days) || 0,
    promo_price:    body.promo_price ? (parseInt(body.promo_price) || null) : null,
    promo_start:    body.promo_start || null,
    promo_end:      body.promo_end || null,
    is_recommended: body.is_recommended === 'on' || body.is_recommended === 'true',
    status:         ['active', 'inactive'].includes(body.status) ? body.status : 'inactive',
    sort_order:     parseInt(body.sort_order) || 0,
  };
}

const subscriptionController = {
  /**
   * GET /subscriptions
   * Shows plan cards + feature matrix + stats.
   */
  async getIndex(req: Request, res: Response) {
    try {
      const [plans, stats] = await Promise.all([
        Subscription.getPlans(),
        Subscription.getStats(),
      ]);

      // Collect all unique feature keys (preserving insertion order, deduplicated)
      const allKeysSet = new Set<string>();
      for (const p of plans) {
        for (const f of p.features) allKeysSet.add(f.feature_key);
      }
      const allKeys = [...allKeysSet].sort();

      // Build lookup: planId → { feature_key: feature_value }
      const featureLookup: Record<string, Record<string, any>> = {};
      for (const p of plans) {
        featureLookup[p.id] = {};
        for (const f of p.features) featureLookup[p.id][f.feature_key] = f.feature_value;
      }

      res.render('subscriptions/index', {
        title: 'Gói đăng ký',
        active: 'subscriptions',
        plans,
        stats,
        allKeys,
        featureLookup,
      });
    } catch (err) {
      console.error('[Subscriptions] getIndex error:', err);
      req.flash('error', 'Không thể tải danh sách gói đăng ký');
      return res.redirect('/dashboard');
    }
  },

  /**
   * GET /subscriptions/create
   */
  getCreate(req: Request, res: Response) {
    res.render('subscriptions/create', {
      title: 'Tạo gói đăng ký',
      active: 'subscriptions',
    });
  },

  /**
   * POST /subscriptions/create
   */
  async postCreate(req: Request, res: Response) {
    try {
      const data = parsePlanData(req.body);
      const features = parseFeatures(req.body);

      if (!data.name) {
        req.flash('error', 'Tên gói không được để trống');
        return res.redirect('/subscriptions/create');
      }

      const plan = await Subscription.createPlan(data, features);
      req.flash('success', `Đã tạo gói "${plan.name}" thành công`);
      return res.redirect('/subscriptions');
    } catch (err) {
      console.error('[Subscriptions] postCreate error:', err);
      req.flash('error', 'Không thể tạo gói. Vui lòng thử lại.');
      return res.redirect('/subscriptions/create');
    }
  },

  /**
   * GET /subscriptions/:id/edit
   */
  async getEdit(req: Request, res: Response) {
    try {
      const plan = await Subscription.getPlanById(req.params.id as string);
      if (!plan) {
        req.flash('error', 'Gói đăng ký không tồn tại');
        return res.redirect('/subscriptions');
      }
      res.render('subscriptions/edit', {
        title: `Sửa gói: ${plan.name}`,
        active: 'subscriptions',
        plan,
      });
    } catch (err) {
      console.error('[Subscriptions] getEdit error:', err);
      req.flash('error', 'Không thể tải thông tin gói');
      return res.redirect('/subscriptions');
    }
  },

  /**
   * POST /subscriptions/:id/edit
   */
  async postEdit(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      const data = parsePlanData(req.body);
      const features = parseFeatures(req.body);

      if (!data.name) {
        req.flash('error', 'Tên gói không được để trống');
        return res.redirect(`/subscriptions/${id}/edit`);
      }

      const plan = await Subscription.updatePlan(id, data, features);
      if (!plan) {
        req.flash('error', 'Gói đăng ký không tồn tại');
        return res.redirect('/subscriptions');
      }

      req.flash('success', `Đã cập nhật gói "${plan.name}"`);
      return res.redirect('/subscriptions');
    } catch (err) {
      console.error('[Subscriptions] postEdit error:', err);
      req.flash('error', 'Không thể cập nhật gói. Vui lòng thử lại.');
      return res.redirect(`/subscriptions/${id}/edit`);
    }
  },

  /**
   * POST /subscriptions/:id/delete
   */
  async postDelete(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      await Subscription.deletePlan(id);
      req.flash('success', 'Đã xóa gói đăng ký');
      return res.redirect('/subscriptions');
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'HAS_ACTIVE_SUBSCRIBERS') {
        req.flash('error', error.message);
      } else {
        console.error('[Subscriptions] postDelete error:', err);
        req.flash('error', 'Không thể xóa gói. Vui lòng thử lại.');
      }
      return res.redirect('/subscriptions');
    }
  },

  /**
   * GET /subscriptions/:id/subscribers
   */
  async getSubscribers(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      const plan = await Subscription.getPlanById(id);
      if (!plan) {
        req.flash('error', 'Gói đăng ký không tồn tại');
        return res.redirect('/subscriptions');
      }

      const { page = 1 } = req.query as any;
      const result = await Subscription.getSubscribers(id, { page, limit: 20 });

      res.render('subscriptions/subscribers', {
        title: `Subscribers — ${plan.name}`,
        active: 'subscriptions',
        plan,
        subscribers: result.rows,
        pagination: result,
      });
    } catch (err) {
      console.error('[Subscriptions] getSubscribers error:', err);
      req.flash('error', 'Không thể tải danh sách subscribers');
      return res.redirect('/subscriptions');
    }
  },

  /**
   * GET /subscriptions/transactions
   */
  async getTransactions(req: Request, res: Response) {
    try {
      const { page = 1 } = req.query as any;
      const result = await Subscription.getRecentTransactions({ page, limit: 20 });

      res.render('subscriptions/transactions', {
        title: 'Giao dịch',
        active: 'subscriptions',
        transactions: result.rows,
        pagination: result,
      });
    } catch (err) {
      console.error('[Subscriptions] getTransactions error:', err);
      req.flash('error', 'Không thể tải danh sách giao dịch');
      return res.redirect('/subscriptions');
    }
  },
};

export = subscriptionController;
