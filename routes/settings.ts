import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import ctrl from '../controllers/settingsController';

const router = Router();

router.use(requireAuth);

router.get('/', ctrl.getIndex);

export = router;
