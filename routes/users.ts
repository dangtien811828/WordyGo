import { Router } from 'express';
import userController from '../controllers/userController';
import { requireRole } from '../middlewares/auth';

const router = Router();

router.use(requireRole('super_admin', 'moderator'));

router.get('/',                   userController.getIndex);
router.get('/create',             userController.getCreate);
router.post('/create',            userController.postCreate);
router.get('/:id',                userController.getShow);
router.get('/:id/edit',           userController.getEdit);
router.post('/:id/edit',          userController.postEdit);
router.post('/:id/toggle-status', userController.postToggleStatus);
router.post('/:id/delete',        userController.postDelete);

export = router;
