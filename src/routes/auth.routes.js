const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { register, login, getProfile, changePassword } = require('../controllers/auth.controller');

router.post('/register', register);
router.post('/login', login);
router.get('/profile', auth, getProfile);
router.put('/password', auth, changePassword);

module.exports = router;
