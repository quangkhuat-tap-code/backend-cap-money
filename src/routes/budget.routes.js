const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth.middleware');
const {
  getBudgets,
  upsertBudget,
  deleteBudget
} = require('../controllers/budget.controller');

router.get('/', auth, getBudgets);
router.post('/', auth, upsertBudget);
router.delete('/:id', auth, deleteBudget);

module.exports = router;
