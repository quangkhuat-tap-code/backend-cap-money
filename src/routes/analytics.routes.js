const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const { getSummary } = require('../controllers/analytics.controller');

// GET /api/analytics/summary?month=&year=&type=expense|income
router.get('/summary', auth, getSummary);

module.exports = router;
