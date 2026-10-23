const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { getCategories } = require('../controllers/category.controller');

router.get('/', auth, getCategories);

module.exports = router;
