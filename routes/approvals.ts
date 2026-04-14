const express = require('express');
const router = express.Router();
const approvalController = require('../controllers/approvalController');
const { requireAuth, requireRole } = require('../middlewares/auth');

router.use(requireAuth);
router.use(requireRole('super_admin'));

router.get('/',             approvalController.getIndex);
router.post('/:id/approve', approvalController.postApprove);
router.post('/:id/reject',  approvalController.postReject);

module.exports = router;

export {};
