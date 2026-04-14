const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/subscriptionController');

router.use(requireAuth);
router.use(requireRole('super_admin'));

// Static routes must come before /:id
router.get('/',                   ctrl.getIndex);
router.get('/create',             ctrl.getCreate);
router.post('/create',            ctrl.postCreate);
router.get('/transactions',       ctrl.getTransactions);

// Parameterized routes
router.get('/:id/edit',           ctrl.getEdit);
router.post('/:id/edit',          ctrl.postEdit);
router.post('/:id/delete',        ctrl.postDelete);
router.get('/:id/subscribers',    ctrl.getSubscribers);

module.exports = router;
