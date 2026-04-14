const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/deckController');
const { requireAuth, requireRole } = require('../middlewares/auth');

router.use(requireAuth);
router.use(requireRole('super_admin', 'moderator'));

// Static routes BEFORE /:id
router.get('/',          ctrl.getIndex);
router.get('/create',    ctrl.getCreate);
router.post('/create',   ctrl.postCreate);

// Deck CRUD
router.get('/:id',              ctrl.getShow);
router.get('/:id/edit',         ctrl.getEdit);
router.post('/:id/edit',        ctrl.postEdit);
router.post('/:id/delete',      ctrl.postDelete);

// Card management
router.post('/:id/cards/add',                ctrl.postAddCards);
router.post('/:id/cards/:entryId/remove',    ctrl.postRemoveCard);

module.exports = router;
