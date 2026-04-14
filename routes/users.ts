const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireRole } = require('../middlewares/auth');

router.use(requireRole('super_admin', 'moderator'));

router.get('/',                   userController.getIndex);
router.get('/create',             userController.getCreate);
router.post('/create',            userController.postCreate);
router.get('/:id',                userController.getShow);
router.get('/:id/edit',           userController.getEdit);
router.post('/:id/edit',          userController.postEdit);
router.post('/:id/toggle-status', userController.postToggleStatus);
router.post('/:id/delete',        userController.postDelete);

module.exports = router;
