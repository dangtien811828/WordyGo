import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import ctrl from '../controllers/subscriptionController';

const router = Router();

router.use(requireAuth);
router.use(requireRole('super_admin'));

// ── Dashboard ──
router.get('/', ctrl.getIndex);

// ── Plans — static routes before /:id ──
router.get('/plans',           ctrl.getPlansList);
router.get('/plans/new',       ctrl.getCreatePlan);
router.post('/plans',          ctrl.postCreatePlan);
router.get('/plans/:id/edit',        ctrl.getEditPlan);
router.post('/plans/:id/update',     ctrl.postEditPlan);
router.post('/plans/:id/delete',     ctrl.postDeletePlan);
router.get('/plans/:id/features',    ctrl.getFeatures);
router.post('/plans/:id/features',   ctrl.postFeatures);
router.get('/plans/:id/subscribers', ctrl.getSubscribers);

// ── Payment methods — static routes before /:id ──
router.get('/payment-methods',              ctrl.getPaymentMethods);
router.get('/payment-methods/new',          ctrl.getCreatePaymentMethod);
router.post('/payment-methods',             ctrl.postCreatePaymentMethod);
router.get('/payment-methods/:id/edit',     ctrl.getEditPaymentMethod);
router.post('/payment-methods/:id/update',  ctrl.postEditPaymentMethod);
router.post('/payment-methods/:id/delete',  ctrl.postDeletePaymentMethod);
router.post('/payment-methods/:id/toggle-active', ctrl.postTogglePaymentMethod);

// ── Transactions ──
router.get('/transactions',                ctrl.getTransactions);
router.post('/transactions/:id/approve',   ctrl.postApproveTransaction);
router.post('/transactions/:id/reject',    ctrl.postRejectTransaction);

// ── Legacy aliases (backward compat) ──
router.get('/create',      ctrl.getCreate);
router.post('/create',     ctrl.postCreate);
router.get('/:id/edit',    ctrl.getEdit);
router.post('/:id/edit',   ctrl.postEdit);
router.post('/:id/delete', ctrl.postDelete);

export = router;
