const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
  getWallets,
  createWallet,
  updateWallet,
  transferMoney,
  getTransfers
} = require('../controllers/wallet.controller');

router.get('/', auth, getWallets);
router.post('/', auth, createWallet);
router.post('/transfer', auth, transferMoney);
router.get('/transfers', auth, getTransfers);
router.put('/:id', auth, updateWallet);

module.exports = router;
