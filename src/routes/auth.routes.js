const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { register, login, getProfile } = require('../controllers/auth.controller');

router.post('/register', register);
router.post('/login', login);
router.get('/profile', auth, getProfile);

module.exports = router;
