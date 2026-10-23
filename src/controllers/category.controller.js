const pool = require('../config/db');
const AppError = require('../utils/AppError');

async function getCategories(req, res, next) {
  try {
    const { type } = req.query;
    if (type && type !== 'expense' && type !== 'income') {
      return res.status(400).json({
        success: false,
        message: 'Loại danh mục không hợp lệ',
        data: null
      });
    }

    let sql = `
      SELECT id, name, icon, color_hex, type, (user_id IS NULL) AS is_system
      FROM categories
      WHERE (user_id IS NULL OR user_id = ?)
    `;
    const params = [req.user.id];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY type, (user_id IS NULL) DESC, id ASC';

    const [rows] = await pool.query(sql, params);
    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      color_hex: r.color_hex,
      type: r.type,
      is_system: !!r.is_system
    }));

    res.status(200).json({
      success: true,
      message: 'Lấy danh mục thành công',
      data
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCategories
};
