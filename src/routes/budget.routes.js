const express = require('express');
const router  = express.Router();
const auth    = require('../middlewares/auth.middleware');
const { getBudgets, createBudget, deleteBudget } = require('../controllers/budget.controller');

// GET  /api/budgets?month=&year=   — Danh sách ngân sách + spent_amount
router.get('/',    auth, getBudgets);

// POST /api/budgets               — Tạo / cập nhật ngân sách (upsert)
router.post('/',   auth, createBudget);

// DELETE /api/budgets/:id         — Xóa ngân sách
router.delete('/:id', auth, deleteBudget);

module.exports = router;
