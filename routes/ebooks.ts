import { Router } from 'express';
import ctrl from '../controllers/ebookController';
import { requireAuth } from '../middlewares/auth';

const router = Router();

// All authenticated roles can access ebooks
router.use(requireAuth);

// Static routes BEFORE /:id
router.get('/',          ctrl.getIndex);
router.get('/create',    ctrl.getCreate);
router.post('/create',   ctrl.postCreate);

// Parameterized routes
router.get('/:id',       ctrl.getShow);
router.get('/:id/edit',  ctrl.getEdit);
router.post('/:id/edit', ctrl.postEdit);
router.post('/:id/delete', ctrl.postDelete);

export = router;
