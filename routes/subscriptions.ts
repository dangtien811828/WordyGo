import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import ctrl from '../controllers/subscriptionController';

const router = Router();

router.use(requireAuth);
router.use(requireRole('super_admin'));

// Static routes must come before /:id
router.get('/',                   ctrl.getIndex);
router.get('/create',             ctrl.getCreate);
router.post('/create',            ctrl.postCreate);
router.get('/transactions',       ctrl.getTransactions);

// Parameterized routes
router.get('/:id/edit',           ctrl.getEdit);
router.post('/:id/edit',          ctrl.postEdit);
router.post('/:id/delete',        ctrl.postDelete);
router.get('/:id/subscribers',    ctrl.getSubscribers);

export = router;
