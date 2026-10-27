const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function toPublicUser(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email
  };
}

async function register(req, res, next) {
  try {
    const fullName = typeof req.body.full_name === 'string' ? req.body.full_name.trim() : '';
    if (fullName.length === 0 || fullName.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập họ tên (tối đa 100 ký tự)',
        data: null
      });
    }

    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!EMAIL_REGEX.test(email) || email.length > 150) {
      return res.status(400).json({
        success: false,
        message: 'Email không hợp lệ',
        data: null
      });
    }

    const { password } = req.body;
    if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải từ 6 đến 72 ký tự',
        data: null
      });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email đã được sử dụng',
        data: null
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const conn = await pool.getConnection();
    let userId;
    try {
      await conn.beginTransaction();

      const [userRes] = await conn.query(
        'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
        [fullName, email, passwordHash]
      );
      userId = userRes.insertId;

      await conn.query(
        "INSERT INTO wallets (user_id, name, balance, type, is_default) VALUES (?, 'Tiền mặt', 0, 'cash', 1)",
        [userId]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          message: 'Email đã được sử dụng',
          data: null
        });
      }
      throw err;
    } finally {
      conn.release();
    }

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công',
      data: {
        token: signToken(userId),
        user: toPublicUser({ id: userId, full_name: fullName, email })
      }
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (email.length === 0 || password.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập email và mật khẩu',
        data: null
      });
    }

    const [rows] = await pool.query(
      'SELECT id, full_name, email, password_hash FROM users WHERE email = ?',
      [email]
    );

    let matched = false;
    if (rows.length > 0) {
      try {
        matched = await bcrypt.compare(password, rows[0].password_hash);
      } catch (err) {
        // Hash không hợp lệ (vd user seed) coi như sai mật khẩu
        matched = false;
      }
    }

    if (!matched) {
      return res.status(401).json({
        success: false,
        message: 'Email hoặc mật khẩu không đúng',
        data: null
      });
    }

    const user = rows[0];
    res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        token: signToken(user.id),
        user: toPublicUser(user)
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login
};
