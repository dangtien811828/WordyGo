const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth');
const ctrl = require('../controllers/gameController');

router.use(requireAuth);
router.use(requireRole('super_admin', 'moderator'));

router.get('/', ctrl.getIndex);

// Word Lists — static routes before /:id
router.get('/word-lists',              ctrl.getWordLists);
router.get('/word-lists/create',       ctrl.getWordListsCreate);
router.post('/word-lists/create',      ctrl.postWordListsCreate);
router.get('/word-lists/:id/edit',     ctrl.getWordListsEdit);
router.post('/word-lists/:id/edit',    ctrl.postWordListsEdit);
router.post('/word-lists/:id/delete',  ctrl.postWordListsDelete);

// Levels
router.get('/levels',                  ctrl.getLevels);
router.post('/levels/create',          ctrl.postLevelsCreate);
router.post('/levels/:id/edit',        ctrl.postLevelsEdit);
router.post('/levels/:id/delete',      ctrl.postLevelsDelete);

// Semantic Sets — static routes before /:id
router.get('/semantic-sets',           ctrl.getSemanticSets);
router.get('/semantic-sets/create',    ctrl.getSemanticSetsCreate);
router.post('/semantic-sets/create',   ctrl.postSemanticSetsCreate);
router.get('/semantic-sets/:id/edit',  ctrl.getSemanticSetsEdit);
router.post('/semantic-sets/:id/edit', ctrl.postSemanticSetsEdit);
router.post('/semantic-sets/:id/delete', ctrl.postSemanticSetsDelete);

// Leaderboard
router.get('/leaderboard',             ctrl.getLeaderboard);

module.exports = router;

export {};
