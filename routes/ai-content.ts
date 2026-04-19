import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import ctrl from '../controllers/aiContentController';

const router = Router();

router.use(requireAuth);
router.use(requireRole('super_admin', 'moderator'));

router.get('/',                    ctrl.getIndex);
router.get('/sessions',            ctrl.getSessions);
router.get('/sessions/:id',        ctrl.getSessionDetail);
router.get('/moderation',          ctrl.getModeration);
router.get('/moderation/:id',      ctrl.getModerationDetail);
router.get('/prompts',             ctrl.getPrompts);

export = router;
