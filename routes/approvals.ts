import { Router } from 'express';
import approvalController from '../controllers/approvalController';
import { requireAuth, requireRole } from '../middlewares/auth';

const router = Router();

router.use(requireAuth);
router.use(requireRole('super_admin'));

router.get('/',             approvalController.getIndex);
router.post('/:id/approve', approvalController.postApprove);
router.post('/:id/reject',  approvalController.postReject);

export = router;
