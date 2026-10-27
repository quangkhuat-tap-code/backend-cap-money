const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
  getWallets,
  createWallet,
  updateWallet
} = require('../controllers/wallet.controller');

router.get('/', auth, getWallets);
router.post('/', auth, createWallet);
router.put('/:id', auth, updateWallet);

module.exports = router;
