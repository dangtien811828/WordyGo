import { Router } from 'express';
import authController from '../controllers/authController';
import { redirectIfAuth } from '../middlewares/auth';

const router = Router();

router.get('/login', redirectIfAuth, authController.getLogin);
router.post('/login', authController.postLogin);

router.get('/register', authController.getRegister);
router.post('/register', authController.postRegister);

router.post('/logout', authController.postLogout);

export = router;
