const pool = require('../config/db');

/**
 * GET /api/budgets?month=&year=
 *
 * Trả về danh sách ngân sách của user trong tháng, kèm spent_amount
 * (số tiền đã tiêu thực tế của danh mục đó trong tháng).
 * Android dùng spent_amount và limit_amount để vẽ ProgressBar 3 màu.
 */
async function getBudgets(req, res) {
  const userId = req.user.id;
  const month  = parseInt(req.query.month, 10);
  const year   = parseInt(req.query.year,  10);

  if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2000) {
    return res.status(400).json({
      success: false,
      message: 'Tham số month và year không hợp lệ',
      data: null
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT
         b.id,
         b.category_id,
         b.limit_amount,
         b.month,
         b.year,
         b.created_at,
         c.name       AS category_name,
         c.icon       AS category_icon,
         c.color_hex  AS category_color,
         COALESCE(
           (SELECT SUM(t.amount)
            FROM transactions t
            WHERE t.user_id     = b.user_id
              AND t.category_id = b.category_id
              AND t.type        = 'expense'
              AND MONTH(t.transaction_date) = b.month
              AND YEAR(t.transaction_date)  = b.year
           ), 0
         ) AS spent_amount
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = ?
         AND b.month   = ?
         AND b.year    = ?
       ORDER BY b.created_at DESC`,
      [userId, month, year]
    );

    return res.status(200).json({
      success: true,
      message: 'Lấy danh sách ngân sách thành công',
      data: rows
    });
  } catch (err) {
    console.error('[budget/getBudgets]', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi lấy ngân sách',
      data: null
    });
  }
}

/**
 * POST /api/budgets
 * Body: { category_id, limit_amount, month, year }
 *
 * Nếu đã tồn tại ngân sách cho category_id + month + year thì cập nhật (upsert).
 */
async function createBudget(req, res) {
  const userId = req.user.id;
  const { category_id, limit_amount, month, year } = req.body;

  if (!category_id || !limit_amount || !month || !year) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu thông tin: category_id, limit_amount, month, year',
      data: null
    });
  }

  const parsedLimit = parseFloat(limit_amount);
  const parsedMonth = parseInt(month, 10);
  const parsedYear  = parseInt(year,  10);

  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Số tiền hạn mức phải lớn hơn 0',
      data: null
    });
  }

  if (isNaN(parsedMonth) || parsedMonth < 1 || parsedMonth > 12 ||
      isNaN(parsedYear)  || parsedYear  < 2000) {
    return res.status(400).json({
      success: false,
      message: 'Tháng hoặc năm không hợp lệ',
      data: null
    });
  }

  try {
    // Upsert: nếu đã có ngân sách cho category + tháng + năm → cập nhật
    const [existing] = await pool.query(
      `SELECT id FROM budgets
       WHERE user_id = ? AND category_id = ? AND month = ? AND year = ?`,
      [userId, category_id, parsedMonth, parsedYear]
    );

    let budgetId;
    if (existing.length > 0) {
      budgetId = existing[0].id;
      await pool.query(
        `UPDATE budgets SET limit_amount = ? WHERE id = ?`,
        [parsedLimit, budgetId]
      );
    } else {
      const [result] = await pool.query(
        `INSERT INTO budgets (user_id, category_id, limit_amount, month, year)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, category_id, parsedLimit, parsedMonth, parsedYear]
      );
      budgetId = result.insertId;
    }

    // Lấy bản ghi vừa tạo/cập nhật kèm thông tin danh mục
    const [rows] = await pool.query(
      `SELECT
         b.id, b.category_id, b.limit_amount, b.month, b.year, b.created_at,
         c.name AS category_name, c.icon AS category_icon, c.color_hex AS category_color
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       WHERE b.id = ?`,
      [budgetId]
    );

    return res.status(existing.length > 0 ? 200 : 201).json({
      success: true,
      message: existing.length > 0
        ? 'Cập nhật ngân sách thành công'
        : 'Tạo ngân sách thành công',
      data: rows[0]
    });
  } catch (err) {
    console.error('[budget/createBudget]', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi lưu ngân sách',
      data: null
    });
  }
}

/**
 * DELETE /api/budgets/:id
 *
 * Xóa ngân sách theo ID (chỉ xóa được ngân sách của chính user).
 */
async function deleteBudget(req, res) {
  const userId   = req.user.id;
  const budgetId = parseInt(req.params.id, 10);

  if (isNaN(budgetId)) {
    return res.status(400).json({
      success: false,
      message: 'ID ngân sách không hợp lệ',
      data: null
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id FROM budgets WHERE id = ? AND user_id = ?`,
      [budgetId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy ngân sách',
        data: null
      });
    }

    await pool.query(`DELETE FROM budgets WHERE id = ?`, [budgetId]);

    return res.status(200).json({
      success: true,
      message: 'Xóa ngân sách thành công',
      data: null
    });
  } catch (err) {
    console.error('[budget/deleteBudget]', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi xóa ngân sách',
      data: null
    });
  }
}

module.exports = { getBudgets, createBudget, deleteBudget };
