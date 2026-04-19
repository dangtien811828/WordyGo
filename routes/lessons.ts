import { Router } from 'express';
import ctrl from '../controllers/lessonController';
import { requireAuth, requireRole } from '../middlewares/auth';

const router = Router();

router.use(requireAuth);
router.use(requireRole('super_admin', 'moderator'));

// Static routes BEFORE /:id
router.get('/',                   ctrl.getIndex);
router.get('/create',             ctrl.getCreate);
router.post('/create',            ctrl.postCreate);

// Parameterized routes
router.get('/:id/edit',           ctrl.getEdit);
router.post('/:id/edit',          ctrl.postEdit);
router.post('/:id/delete',        ctrl.postDelete);
router.post('/:id/toggle-status', ctrl.postToggleStatus);

export = router;
