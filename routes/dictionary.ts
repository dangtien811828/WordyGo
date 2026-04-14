const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dictionaryController');
const { requireAuth, requireRole } = require('../middlewares/auth');

router.use(requireAuth);
router.use(requireRole('super_admin', 'moderator'));

// Static routes BEFORE /:id
router.get('/',            ctrl.getIndex);
router.get('/create',      ctrl.getCreate);
router.post('/create',     ctrl.postCreate);
router.get('/import',      ctrl.getImport);
router.post('/import',     ctrl.postImport);

// Parameterized routes
router.get('/:id',         ctrl.getShow);
router.get('/:id/edit',    ctrl.getEdit);
router.post('/:id/edit',   ctrl.postEdit);
router.post('/:id/delete', ctrl.postDelete);

module.exports = router;

export {};
