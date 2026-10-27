const pool = require('../config/db');
const { parseMonthYear } = require('../utils/monthRange');

async function getSummary(req, res, next) {
  try {
    const range = parseMonthYear(req.query.month, req.query.year);
    const type = req.query.type !== undefined ? req.query.type : 'expense';
    if (!range || (type !== 'expense' && type !== 'income')) {
      return res.status(400).json({
        success: false,
        message: 'Tham số lọc không hợp lệ',
        data: null
      });
    }

    const [totalRows] = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income'  THEN amount END), 0) AS total_income,
              COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS total_expense
       FROM transactions
       WHERE user_id = ? AND transaction_date >= ? AND transaction_date < ?`,
      [req.user.id, range.start, range.end]
    );
    const totalIncome = Number(totalRows[0].total_income);
    const totalExpense = Number(totalRows[0].total_expense);
    const total = type === 'expense' ? totalExpense : totalIncome;

    let categories = [];
    if (total > 0) {
      const [rows] = await pool.query(
        `SELECT c.id AS category_id, c.name AS category_name, c.icon AS category_icon, c.color_hex AS category_color,
                SUM(t.amount) AS amount, COUNT(*) AS count
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = ? AND t.type = ? AND t.transaction_date >= ? AND t.transaction_date < ?
         GROUP BY c.id, c.name, c.icon, c.color_hex
         ORDER BY amount DESC, c.id ASC`,
        [req.user.id, type, range.start, range.end]
      );
      categories = rows.map(r => ({
        category_id: r.category_id,
        category_name: r.category_name,
        category_icon: r.category_icon,
        category_color: r.category_color,
        amount: Number(r.amount),
        count: Number(r.count),
        percent: Math.round(Number(r.amount) / total * 100 * 10) / 10
      }));
    }

    res.status(200).json({
      success: true,
      message: 'Lấy thống kê thành công',
      data: {
        month: range.month,
        year: range.year,
        type,
        total_income: totalIncome,
        total_expense: totalExpense,
        total,
        categories
      }
    });
  } catch (err) {
    next(err);
  }
}

// Tong chi/thu cua N thang ket thuc o thang chon, cu nhat truoc; thang khong co giao dich van co so 0 (4C-1)
async function getTrend(req, res, next) {
  try {
    const range = parseMonthYear(req.query.month, req.query.year);
    const months = req.query.months !== undefined ? Number(req.query.months) : 6;
    if (!range || !Number.isInteger(months) || months < 2 || months > 12) {
      return res.status(400).json({
        success: false,
        message: 'Tham số lọc không hợp lệ',
        data: null
      });
    }

    // Dung san mang thang tu cu den moi
    const points = [];
    let m = range.month;
    let y = range.year;
    for (let i = 0; i < months; i++) {
      points.unshift({ month: m, year: y, total_expense: 0, total_income: 0 });
      m--;
      if (m < 1) {
        m = 12;
        y--;
      }
    }
    const first = parseMonthYear(points[0].month, points[0].year);
    const start = first ? first.start : range.start;

    const [rows] = await pool.query(
      `SELECT YEAR(transaction_date) AS y, MONTH(transaction_date) AS m, type, SUM(amount) AS total
       FROM transactions
       WHERE user_id = ? AND transaction_date >= ? AND transaction_date < ?
       GROUP BY y, m, type`,
      [req.user.id, start, range.end]
    );
    for (const r of rows) {
      const p = points.find(x => x.month === Number(r.m) && x.year === Number(r.y));
      if (!p) continue;
      const total = Math.round(Number(r.total) * 100) / 100;
      if (r.type === 'expense') {
        p.total_expense = total;
      } else {
        p.total_income = total;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Lấy xu hướng thành công',
      data: points
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  getTrend
};
