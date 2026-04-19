import { Router } from 'express';
import profileController from '../controllers/profileController';
import { requireAuth } from '../middlewares/auth';
import { uploadImage } from '../middlewares/upload';

const router = Router();

router.use(requireAuth);

router.get('/',          profileController.getProfile);
router.post('/update',   uploadImage.single('image'), profileController.postUpdate);
router.post('/password', profileController.postPassword);
router.post('/delete',   profileController.postDelete);

export = router;
