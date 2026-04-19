import { Router } from 'express';
import dashboardController from '../controllers/dashboardController';
import { requireAuth } from '../middlewares/auth';

const router = Router();

router.get('/', requireAuth, dashboardController.getDashboard);

export = router;
