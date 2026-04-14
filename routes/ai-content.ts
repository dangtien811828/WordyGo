const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/aiContentController');

router.use(requireAuth);
router.use(requireRole('super_admin', 'moderator'));

router.get('/',                    ctrl.getIndex);
router.get('/sessions',            ctrl.getSessions);
router.get('/sessions/:id',        ctrl.getSessionDetail);
router.get('/moderation',          ctrl.getModeration);
router.get('/moderation/:id',      ctrl.getModerationDetail);
router.get('/prompts',             ctrl.getPrompts);

module.exports = router;
