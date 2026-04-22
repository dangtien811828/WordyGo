import type { Request, Response } from 'express';
import Subscription from '../models/Subscription';
import PaymentMethod from '../models/PaymentMethod';
import { uploadPaymentLogo } from '../middlewares/upload';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseFeatures(body: any) {
  const keys: any[] = ([] as any[]).concat(body['feature_key[]'] || []);
  const vals: any[] = ([] as any[]).concat(body['feature_value[]'] || []);
  return keys
    .map((k, i) => ({ key: (k || '').trim(), value: (vals[i] || '').trim() }))
    .filter(f => f.key);
}

function parseMethodIds(body: any): string[] {
  const raw = body['payment_method_ids[]'] || body.payment_method_ids || [];
  return ([] as string[]).concat(raw).filter(Boolean);
}

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

// ── Controller ────────────────────────────────────────────────────────────────

const subscriptionController = {

  // ── Dashboard ──

  async getIndex(req: Request, res: Response) {
    try {
      const stats = await Subscription.getStats();
      res.render('subscriptions/index', {
        title: 'Subscriptions',
        active: 'subscriptions',
        stats,
      });
    } catch (err) {
      console.error('[Subscriptions] getIndex error:', err);
      req.flash('error', 'Không thể tải trang subscriptions');
      return res.redirect('/dashboard');
    }
  },

  // ── Plans ──

  async getPlansList(req: Request, res: Response) {
    try {
      const [plans, stats] = await Promise.all([
        Subscription.getPlans(),
        Subscription.getStats(),
      ]);
      res.render('subscriptions/plans/list', {
        title: 'Subscription Plans',
        active: 'subscriptions',
        plans,
        stats,
      });
    } catch (err) {
      console.error('[Subscriptions] getPlansList error:', err);
      req.flash('error', 'Không thể tải danh sách plans');
      return res.redirect('/subscriptions');
    }
  },

  async getCreatePlan(req: Request, res: Response) {
    try {
      const allMethods = await PaymentMethod.findAll();
      res.render('subscriptions/plans/form', {
        title: 'Tạo gói mới',
        active: 'subscriptions',
        plan: null,
        allMethods,
        planMethodIds: [],
      });
    } catch (err) {
      console.error('[Subscriptions] getCreatePlan error:', err);
      req.flash('error', 'Không thể tải form');
      return res.redirect('/subscriptions/plans');
    }
  },

  async postCreatePlan(req: Request, res: Response) {
    try {
      const data = parsePlanData(req.body);
      const features = parseFeatures(req.body);
      const methodIds = parseMethodIds(req.body);

      if (!data.name) {
        req.flash('error', 'Tên gói không được để trống');
        return res.redirect('/subscriptions/plans/new');
      }

      const plan = await Subscription.createPlan(data, features, methodIds);
      req.flash('success', `Đã tạo gói "${plan.name}" thành công`);
      return res.redirect('/subscriptions/plans');
    } catch (err) {
      console.error('[Subscriptions] postCreatePlan error:', err);
      req.flash('error', 'Không thể tạo gói. Vui lòng thử lại.');
      return res.redirect('/subscriptions/plans/new');
    }
  },

  async getEditPlan(req: Request, res: Response) {
    try {
      const [plan, allMethods, planMethods] = await Promise.all([
        Subscription.getPlanById(req.params.id as string),
        PaymentMethod.findAll(),
        PaymentMethod.getByPlan(req.params.id as string),
      ]);
      if (!plan) {
        req.flash('error', 'Gói đăng ký không tồn tại');
        return res.redirect('/subscriptions/plans');
      }
      const planMethodIds = planMethods.map((m: any) => m.id);
      res.render('subscriptions/plans/form', {
        title: `Sửa gói: ${plan.name}`,
        active: 'subscriptions',
        plan,
        allMethods,
        planMethodIds,
      });
    } catch (err) {
      console.error('[Subscriptions] getEditPlan error:', err);
      req.flash('error', 'Không thể tải thông tin gói');
      return res.redirect('/subscriptions/plans');
    }
  },

  async postEditPlan(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      const data = parsePlanData(req.body);
      const features = parseFeatures(req.body);
      const methodIds = parseMethodIds(req.body);

      if (!data.name) {
        req.flash('error', 'Tên gói không được để trống');
        return res.redirect(`/subscriptions/plans/${id}/edit`);
      }

      const plan = await Subscription.updatePlan(id, data, features, methodIds);
      if (!plan) {
        req.flash('error', 'Gói đăng ký không tồn tại');
        return res.redirect('/subscriptions/plans');
      }
      req.flash('success', `Đã cập nhật gói "${plan.name}"`);
      return res.redirect('/subscriptions/plans');
    } catch (err) {
      console.error('[Subscriptions] postEditPlan error:', err);
      req.flash('error', 'Không thể cập nhật gói. Vui lòng thử lại.');
      return res.redirect(`/subscriptions/plans/${id}/edit`);
    }
  },

  async postDeletePlan(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      await Subscription.deletePlan(id);
      req.flash('success', 'Đã xóa gói đăng ký');
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'HAS_ACTIVE_SUBSCRIBERS') {
        req.flash('error', error.message || 'Không thể xóa gói đang có người đăng ký');
      } else {
        console.error('[Subscriptions] postDeletePlan error:', err);
        req.flash('error', 'Không thể xóa gói. Vui lòng thử lại.');
      }
    }
    return res.redirect('/subscriptions/plans');
  },

  async getFeatures(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      const plan = await Subscription.getPlanById(id);
      if (!plan) {
        req.flash('error', 'Gói đăng ký không tồn tại');
        return res.redirect('/subscriptions/plans');
      }
      res.render('subscriptions/plans/features', {
        title: `Features — ${plan.name}`,
        active: 'subscriptions',
        plan,
      });
    } catch (err) {
      console.error('[Subscriptions] getFeatures error:', err);
      req.flash('error', 'Không thể tải features');
      return res.redirect('/subscriptions/plans');
    }
  },

  async postFeatures(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      const plan = await Subscription.getPlanById(id);
      if (!plan) {
        req.flash('error', 'Gói đăng ký không tồn tại');
        return res.redirect('/subscriptions/plans');
      }
      const features = parseFeatures(req.body);
      await Subscription.savePlanFeatures(id, features);
      req.flash('success', `Đã lưu features cho gói "${plan.name}"`);
      return res.redirect(`/subscriptions/plans/${id}/features`);
    } catch (err) {
      console.error('[Subscriptions] postFeatures error:', err);
      req.flash('error', 'Không thể lưu features');
      return res.redirect(`/subscriptions/plans/${id}/features`);
    }
  },

  async getSubscribers(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      const plan = await Subscription.getPlanById(id);
      if (!plan) {
        req.flash('error', 'Gói đăng ký không tồn tại');
        return res.redirect('/subscriptions/plans');
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
      return res.redirect('/subscriptions/plans');
    }
  },

  // ── Payment Methods ──

  async getPaymentMethods(req: Request, res: Response) {
    try {
      const methods = await PaymentMethod.findAll();
      res.render('subscriptions/payment-methods/list', {
        title: 'Payment Methods',
        active: 'subscriptions',
        methods,
      });
    } catch (err) {
      console.error('[Subscriptions] getPaymentMethods error:', err);
      req.flash('error', 'Không thể tải payment methods');
      return res.redirect('/subscriptions');
    }
  },

  getCreatePaymentMethod(req: Request, res: Response) {
    res.render('subscriptions/payment-methods/form', {
      title: 'Thêm phương thức thanh toán',
      active: 'subscriptions',
      method: null,
    });
  },

  postCreatePaymentMethod(req: Request, res: Response) {
    uploadPaymentLogo.single('logo')(req, res, async (err: any) => {
      if (err) {
        req.flash('error', err.message || 'Lỗi upload logo');
        return res.redirect('/subscriptions/payment-methods/new');
      }
      try {
        const logo_url = req.file
          ? `/uploads/payment-methods/${req.file.filename}`
          : null;

        const accountInfo = buildAccountInfo(req.body);

        // Validate code format
        if (!/^[a-z_]+$/.test((req.body.code || '').trim())) {
          req.flash('error', 'Code chỉ được chứa chữ thường và dấu gạch dưới (a-z_)');
          return res.redirect('/subscriptions/payment-methods/new');
        }

        await PaymentMethod.create({
          code:            (req.body.code || '').trim(),
          display_name:    (req.body.display_name || '').trim(),
          description:     req.body.description || null,
          logo_url:        logo_url || req.body.logo_url_manual || null,
          method_type:     req.body.method_type,
          account_info:    accountInfo,
          instructions_vi: req.body.instructions_vi || null,
          instructions_en: req.body.instructions_en || null,
          fee_percent:     req.body.fee_percent || 0,
          is_active:       req.body.is_active === 'on' || req.body.is_active === 'true',
          sort_order:      req.body.sort_order || 0,
        });

        req.flash('success', 'Đã thêm phương thức thanh toán');
        return res.redirect('/subscriptions/payment-methods');
      } catch (e: any) {
        console.error('[Subscriptions] postCreatePaymentMethod error:', e);
        const msg = e.code === '23505'
          ? 'Code này đã tồn tại, vui lòng dùng code khác'
          : 'Không thể tạo. Vui lòng thử lại.';
        req.flash('error', msg);
        return res.redirect('/subscriptions/payment-methods/new');
      }
    });
  },

  async getEditPaymentMethod(req: Request, res: Response) {
    try {
      const method = await PaymentMethod.findById(req.params.id as string);
      if (!method) {
        req.flash('error', 'Phương thức thanh toán không tồn tại');
        return res.redirect('/subscriptions/payment-methods');
      }
      res.render('subscriptions/payment-methods/form', {
        title: `Sửa: ${method.display_name}`,
        active: 'subscriptions',
        method,
      });
    } catch (err) {
      console.error('[Subscriptions] getEditPaymentMethod error:', err);
      req.flash('error', 'Không thể tải thông tin');
      return res.redirect('/subscriptions/payment-methods');
    }
  },

  postEditPaymentMethod(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    uploadPaymentLogo.single('logo')(req, res, async (err: any) => {
      if (err) {
        req.flash('error', err.message || 'Lỗi upload logo');
        return res.redirect(`/subscriptions/payment-methods/${id}/edit`);
      }
      try {
        const existing = await PaymentMethod.findById(id);
        if (!existing) {
          req.flash('error', 'Phương thức thanh toán không tồn tại');
          return res.redirect('/subscriptions/payment-methods');
        }

        const logo_url = req.file
          ? `/uploads/payment-methods/${req.file.filename}`
          : (req.body.logo_url_manual || existing.logo_url || null);

        const accountInfo = buildAccountInfo(req.body);

        await PaymentMethod.update(id, {
          display_name:    (req.body.display_name || '').trim(),
          description:     req.body.description || null,
          logo_url,
          method_type:     req.body.method_type,
          account_info:    accountInfo,
          instructions_vi: req.body.instructions_vi || null,
          instructions_en: req.body.instructions_en || null,
          fee_percent:     req.body.fee_percent || 0,
          is_active:       req.body.is_active === 'on' || req.body.is_active === 'true',
          sort_order:      req.body.sort_order || 0,
        });

        req.flash('success', 'Đã cập nhật phương thức thanh toán');
        return res.redirect('/subscriptions/payment-methods');
      } catch (e) {
        console.error('[Subscriptions] postEditPaymentMethod error:', e);
        req.flash('error', 'Không thể cập nhật. Vui lòng thử lại.');
        return res.redirect(`/subscriptions/payment-methods/${id}/edit`);
      }
    });
  },

  async postDeletePaymentMethod(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      await PaymentMethod.delete(id);
      req.flash('success', 'Đã xóa phương thức thanh toán');
    } catch (err) {
      console.error('[Subscriptions] postDeletePaymentMethod error:', err);
      req.flash('error', 'Không thể xóa. Vui lòng thử lại.');
    }
    return res.redirect('/subscriptions/payment-methods');
  },

  async postTogglePaymentMethod(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      await PaymentMethod.toggleActive(id);
    } catch (err) {
      console.error('[Subscriptions] postTogglePaymentMethod error:', err);
      req.flash('error', 'Không thể thay đổi trạng thái');
    }
    return res.redirect('/subscriptions/payment-methods');
  },

  // ── Transactions ──

  async getTransactions(req: Request, res: Response) {
    try {
      const { status = '', payment_method = '', date_from = '', date_to = '', page = 1 } =
        req.query as any;

      const [result, paymentMethods] = await Promise.all([
        Subscription.getTransactionsFiltered({
          status,
          payment_method,
          date_from,
          date_to,
          page,
          limit: 20,
        }),
        PaymentMethod.findAll(),
      ]);

      res.render('subscriptions/transactions/list', {
        title: 'Transactions',
        active: 'subscriptions',
        transactions: result.rows,
        pagination: result,
        paymentMethods,
        filters: { status, payment_method, date_from, date_to },
      });
    } catch (err) {
      console.error('[Subscriptions] getTransactions error:', err);
      req.flash('error', 'Không thể tải danh sách giao dịch');
      return res.redirect('/subscriptions');
    }
  },

  async postApproveTransaction(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      await Subscription.approveTransaction(id);
      req.flash('success', 'Giao dịch đã được duyệt, subscription kích hoạt thành công');
    } catch (err: any) {
      console.error('[Subscriptions] postApproveTransaction error:', err);
      req.flash('error', err.code === 'NOT_FOUND'
        ? 'Giao dịch không tồn tại'
        : 'Không thể duyệt giao dịch. Vui lòng thử lại.'
      );
    }
    return res.redirect('/subscriptions/transactions');
  },

  async postRejectTransaction(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    const reason = (req.body.reason || '').trim();
    try {
      await Subscription.rejectTransaction(id, reason);
      req.flash('success', 'Giao dịch đã bị từ chối');
    } catch (err: any) {
      console.error('[Subscriptions] postRejectTransaction error:', err);
      req.flash('error', err.code === 'NOT_FOUND'
        ? 'Giao dịch không tồn tại'
        : 'Không thể từ chối giao dịch. Vui lòng thử lại.'
      );
    }
    return res.redirect('/subscriptions/transactions');
  },

  // ── Legacy aliases (backward compat) ──

  getCreate(req: Request, res: Response) {
    return subscriptionController.getCreatePlan(req, res);
  },
  postCreate(req: Request, res: Response) {
    return subscriptionController.postCreatePlan(req, res);
  },
  async getEdit(req: Request, res: Response) {
    return subscriptionController.getEditPlan(req, res);
  },
  async postEdit(req: Request, res: Response) {
    return subscriptionController.postEditPlan(req, res);
  },
  async postDelete(req: Request, res: Response) {
    return subscriptionController.postDeletePlan(req, res);
  },
};

// ── account_info builder ──────────────────────────────────────────────────────

// When two form sections share a field name (e.g. "account_name" in both bank
// and ewallet), multer/urlencoded yields an array. Take the first truthy value.
function str(v: any): string {
  if (Array.isArray(v)) v = v.find((x: any) => x !== '' && x != null) ?? v[0];
  return v != null ? String(v).trim() : '';
}

function buildAccountInfo(body: any): object | null {
  const type = Array.isArray(body.method_type) ? body.method_type[0] : body.method_type;
  if (type === 'bank') {
    const info: any = {};
    if (str(body.account_number)) info.account_number = str(body.account_number);
    if (str(body.account_name))   info.account_name   = str(body.account_name);
    if (str(body.bank_name))      info.bank_name       = str(body.bank_name);
    if (str(body.swift_code))     info.swift_code      = str(body.swift_code);
    if (str(body.branch))         info.branch          = str(body.branch);
    return Object.keys(info).length ? info : null;
  }
  if (type === 'ewallet') {
    const info: any = {};
    if (str(body.phone_number)) info.phone_number = str(body.phone_number);
    if (str(body.account_name)) info.account_name = str(body.account_name);
    if (str(body.qr_image_url)) info.qr_image_url = str(body.qr_image_url);
    return Object.keys(info).length ? info : null;
  }
  if (type === 'card') {
    const info: any = {};
    if (str(body.merchant_id))     info.merchant_id     = str(body.merchant_id);
    if (str(body.integration_key)) info.integration_key = str(body.integration_key);
    return Object.keys(info).length ? info : null;
  }
  return null;
}

export = subscriptionController;
