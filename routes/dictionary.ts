import { Router } from 'express';
import ctrl from '../controllers/dictionaryController';
import { requireAuth, requireRole } from '../middlewares/auth';

const router = Router();

router.use(requireAuth);
router.use(requireRole('super_admin', 'moderator'));

// Static routes BEFORE /:id
router.get('/',            ctrl.getIndex);
router.get('/create',      ctrl.getCreate);
router.post('/create',     ctrl.postCreate);
router.get('/import',      ctrl.getImport);
router.post('/import',     ctrl.postImport);

// Parameterized routes
router.get('/:id',         ctrl.getShow);
router.get('/:id/edit',    ctrl.getEdit);
router.post('/:id/edit',   ctrl.postEdit);
router.post('/:id/delete', ctrl.postDelete);

export = router;
