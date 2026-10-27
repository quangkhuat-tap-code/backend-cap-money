const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
  getWallets,
  createWallet,
  updateWallet,
  transferMoney
} = require('../controllers/wallet.controller');

router.get('/', auth, getWallets);
router.post('/', auth, createWallet);
router.post('/transfer', auth, transferMoney);
router.put('/:id', auth, updateWallet);

module.exports = router;
