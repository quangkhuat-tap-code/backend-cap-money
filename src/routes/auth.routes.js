const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { uploadSingleImage } = require('../middlewares/upload.middleware');
const { register, login, getProfile, changePassword, uploadAvatar } = require('../controllers/auth.controller');

router.post('/register', register);
router.post('/login', login);
router.get('/profile', auth, getProfile);
router.put('/password', auth, changePassword);
router.post('/avatar', auth, uploadSingleImage, uploadAvatar);

module.exports = router;
