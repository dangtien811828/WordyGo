const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/ebookController');
const { requireAuth } = require('../middlewares/auth');

// All authenticated roles can access ebooks
router.use(requireAuth);

// Static routes BEFORE /:id
router.get('/',          ctrl.getIndex);
router.get('/create',    ctrl.getCreate);
router.post('/create',   ctrl.postCreate);

// Parameterized routes
router.get('/:id',       ctrl.getShow);
router.get('/:id/edit',  ctrl.getEdit);
router.post('/:id/edit', ctrl.postEdit);
router.post('/:id/delete', ctrl.postDelete);

module.exports = router;
