const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { requireAuth } = require('../middlewares/auth');
const { uploadImage } = require('../middlewares/upload');

router.use(requireAuth);

router.get('/',          profileController.getProfile);
router.post('/update',   uploadImage.single('image'), profileController.postUpdate);
router.post('/password', profileController.postPassword);
router.post('/delete',   profileController.postDelete);

module.exports = router;

export {};
