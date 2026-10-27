const pool = require('../config/db');
const { parseMonthYear } = require('../utils/monthRange');

const BUDGET_SELECT = `
  SELECT b.id, b.category_id, c.name AS category_name, c.icon AS category_icon, c.color_hex AS category_color,
         b.limit_amount, b.month, b.year,
         (SELECT COALESCE(SUM(t.amount), 0)
            FROM transactions t
           WHERE t.user_id = b.user_id AND t.category_id = b.category_id AND t.type = 'expense'
             AND t.transaction_date >= ? AND t.transaction_date < ?) AS spent_amount
  FROM budgets b
  JOIN categories c ON c.id = b.category_id
`;

function mapBudget(row) {
  if (!row) return null;
  const limitAmount = Number(row.limit_amount);
  const spentAmount = Number(row.spent_amount);
  const percent = Math.round(spentAmount / limitAmount * 100);
  let status = 'ok';
  if (percent >= 100) {
    status = 'over';
  } else if (percent >= 80) {
    status = 'warning';
  }
  return {
    id: row.id,
    category_id: row.category_id,
    category_name: row.category_name,
    category_icon: row.category_icon,
    category_color: row.category_color,
    limit_amount: limitAmount,
    spent_amount: spentAmount,
    remaining: limitAmount - spentAmount,
    percent,
    status,
    month: row.month,
    year: row.year
  };
}

async function getBudgets(req, res, next) {
  try {
    const range = parseMonthYear(req.query.month, req.query.year);
    if (!range) {
      return res.status(400).json({
        success: false,
        message: 'Tham số lọc không hợp lệ',
        data: null
      });
    }

    const [rows] = await pool.query(
      `${BUDGET_SELECT}
       WHERE b.user_id = ? AND b.month = ? AND b.year = ?
       ORDER BY spent_amount / b.limit_amount DESC, b.id ASC`,
      [range.start, range.end, req.user.id, range.month, range.year]
    );

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách ngân sách thành công',
      data: rows.map(mapBudget)
    });
  } catch (err) {
    next(err);
  }
}

async function upsertBudget(req, res, next) {
  try {
    const range = req.body.month === undefined || req.body.year === undefined
      ? null
      : parseMonthYear(req.body.month, req.body.year);
    if (!range) {
      return res.status(400).json({
        success: false,
        message: 'Tháng/năm không hợp lệ',
        data: null
      });
    }

    const rawLimit = req.body.limit_amount;
    const limitNumber = typeof rawLimit === 'boolean' || rawLimit === null || rawLimit === '' ? NaN : Number(rawLimit);
    if (!Number.isFinite(limitNumber) || limitNumber <= 0 || limitNumber > 999999999999) {
      return res.status(400).json({
        success: false,
        message: 'Hạn mức phải lớn hơn 0',
        data: null
      });
    }
    const limitAmount = Math.round(limitNumber * 100) / 100;

    const categoryId = Number(req.body.category_id);
    let category = null;
    if (Number.isInteger(categoryId) && categoryId > 0) {
      const [categories] = await pool.query(
        'SELECT id, type FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
        [categoryId, req.user.id]
      );
      category = categories.length > 0 ? categories[0] : null;
    }
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Danh mục không tồn tại',
        data: null
      });
    }
    if (category.type !== 'expense') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ đặt ngân sách cho danh mục chi tiêu',
        data: null
      });
    }

    const conn = await pool.getConnection();
    let budgetId;
    let created;
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        'SELECT id FROM budgets WHERE user_id = ? AND category_id = ? AND month = ? AND year = ? FOR UPDATE',
        [req.user.id, categoryId, range.month, range.year]
      );
      if (rows.length > 0) {
        budgetId = rows[0].id;
        created = false;
        await conn.query('UPDATE budgets SET limit_amount = ? WHERE id = ?', [limitAmount, budgetId]);
      } else {
        const [insertRes] = await conn.query(
          'INSERT INTO budgets (user_id, category_id, limit_amount, month, year) VALUES (?, ?, ?, ?, ?)',
          [req.user.id, categoryId, limitAmount, range.month, range.year]
        );
        budgetId = insertRes.insertId;
        created = true;
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const [budgetRows] = await pool.query(
      `${BUDGET_SELECT} WHERE b.id = ?`,
      [range.start, range.end, budgetId]
    );

    res.status(created ? 201 : 200).json({
      success: true,
      message: created ? 'Đã tạo ngân sách' : 'Đã cập nhật ngân sách',
      data: mapBudget(budgetRows[0])
    });
  } catch (err) {
    next(err);
  }
}

async function deleteBudget(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Mã ngân sách không hợp lệ',
        data: null
      });
    }

    const [result] = await pool.query('DELETE FROM budgets WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ngân sách không tồn tại',
        data: null
      });
    }

    res.status(200).json({
      success: true,
      message: 'Đã xoá ngân sách',
      data: { id }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBudgets,
  upsertBudget,
  deleteBudget
};
