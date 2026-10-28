const pool = require('../config/db');

/**
 * GET /api/analytics/summary?month=&year=&type=expense|income
 *
 * Trả về:
 *   - total_expense: tổng chi tiêu tháng đó
 *   - total_income:  tổng thu nhập tháng đó
 *   - categories:    mảng từng danh mục gồm { category_id, name, icon, color_hex, total, percentage }
 *
 * Dùng để vẽ Donut Chart và danh sách % bên dưới biểu đồ.
 */
async function getSummary(req, res) {
  const userId = req.user.id;
  const month = parseInt(req.query.month, 10);
  const year  = parseInt(req.query.year,  10);
  const type  = req.query.type === 'income' ? 'income' : 'expense';

  // Validate tháng / năm
  if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year < 2000) {
    return res.status(400).json({
      success: false,
      message: 'Tham số month và year không hợp lệ',
      data: null
    });
  }

  try {
    // 1. Tổng thu + tổng chi trong tháng (không phụ thuộc type)
    const [totals] = await pool.query(
      `SELECT
         SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS total_expense,
         SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) AS total_income
       FROM transactions
       WHERE user_id = ?
         AND MONTH(transaction_date) = ?
         AND YEAR(transaction_date)  = ?`,
      [userId, month, year]
    );

    const totalExpense = totals[0].total_expense || 0;
    const totalIncome  = totals[0].total_income  || 0;
    const grandTotal   = type === 'income' ? totalIncome : totalExpense;

    // 2. Gom nhóm theo danh mục cho type đã chọn
    const [rows] = await pool.query(
      `SELECT
         t.category_id,
         c.name,
         c.icon,
         c.color_hex,
         SUM(t.amount) AS total
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ?
         AND t.type    = ?
         AND MONTH(t.transaction_date) = ?
         AND YEAR(t.transaction_date)  = ?
       GROUP BY t.category_id, c.name, c.icon, c.color_hex
       ORDER BY total DESC`,
      [userId, type, month, year]
    );

    // 3. Tính phần trăm từng danh mục
    const categories = rows.map(row => ({
      category_id: row.category_id,
      name:        row.name,
      icon:        row.icon,
      color_hex:   row.color_hex,
      total:       row.total,
      percentage:  grandTotal > 0
        ? Math.round((row.total / grandTotal) * 10000) / 100  // 2 chữ số thập phân
        : 0
    }));

    return res.status(200).json({
      success: true,
      message: 'Lấy thống kê thành công',
      data: {
        month,
        year,
        type,
        total_expense: totalExpense,
        total_income:  totalIncome,
        categories
      }
    });
  } catch (err) {
    console.error('[analytics/getSummary]', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ khi lấy thống kê',
      data: null
    });
  }
}

module.exports = { getSummary };
