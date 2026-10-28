const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { getSummary, getTrend } = require('../controllers/analytics.controller');

router.get('/summary', auth, getSummary);
router.get('/trend', auth, getTrend);

module.exports = router;
