const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const ctrl = require('../controllers/settingsController');

router.use(requireAuth);

router.get('/', ctrl.getIndex);

module.exports = router;

export {};
