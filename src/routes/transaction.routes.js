const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const { uploadSingleImage } = require('../middlewares/upload.middleware');
const {
  createTransaction,
  getTransactions,
  deleteTransaction,
  updateTransaction,
  searchTransactions
} = require('../controllers/transaction.controller');

router.get('/', auth, getTransactions);
router.get('/search', auth, searchTransactions);
router.post('/', auth, uploadSingleImage, createTransaction);
router.put('/:id', auth, updateTransaction);
router.delete('/:id', auth, deleteTransaction);

module.exports = router;
