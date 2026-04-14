const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middlewares/auth');

router.get('/', requireAuth, dashboardController.getDashboard);

module.exports = router;
