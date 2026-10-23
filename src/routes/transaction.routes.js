const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { uploadSingleImage } = require('../middlewares/upload.middleware');
const {
  createTransaction,
  getTransactions,
  deleteTransaction
} = require('../controllers/transaction.controller');

router.get('/', auth, getTransactions);
router.post('/', auth, uploadSingleImage, createTransaction);
router.delete('/:id', auth, deleteTransaction);

module.exports = router;
