const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { UPLOAD_DIR } = require('../middlewares/upload.middleware');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function toPublicUser(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    avatar_url: row.avatar_url || null
  };
}

async function removeFileSafe(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    // Bo qua file khong ton tai
  }
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
      'SELECT id, full_name, email, avatar_url, password_hash FROM users WHERE email = ?',
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

async function getProfile(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.avatar_url, u.created_at,
              COUNT(t.id)                                                      AS total_transactions,
              COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount END), 0) AS total_income,
              COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount END), 0) AS total_expense
       FROM users u
       LEFT JOIN transactions t ON t.user_id = u.id
       WHERE u.id = ?
       GROUP BY u.id`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Người dùng không tồn tại',
        data: null
      });
    }

    const row = rows[0];
    res.status(200).json({
      success: true,
      message: 'Lấy thông tin cá nhân thành công',
      data: {
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        avatar_url: row.avatar_url || null,
        created_at: row.created_at,
        total_transactions: Number(row.total_transactions),
        total_income: Number(row.total_income),
        total_expense: Number(row.total_expense)
      }
    });
  } catch (err) {
    next(err);
  }
}

// Doi mat khau (4B-2): sai mat khau hien tai tra 400 (khong phai 401 de app khong tu dang xuat)
async function changePassword(req, res, next) {
  try {
    const current = typeof req.body.current_password === 'string' ? req.body.current_password : '';
    const newPassword = req.body.new_password;

    if (current.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mật khẩu hiện tại',
        data: null
      });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 72) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu phải từ 6 đến 72 ký tự',
        data: null
      });
    }
    if (newPassword === current) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
        data: null
      });
    }

    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
        data: null
      });
    }

    let matched = false;
    try {
      matched = await bcrypt.compare(current, rows[0].password_hash);
    } catch (err) {
      matched = false;
    }
    if (!matched) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu hiện tại không đúng',
        data: null
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);

    res.status(200).json({
      success: true,
      message: 'Đã đổi mật khẩu',
      data: null
    });
  } catch (err) {
    next(err);
  }
}

// Tai anh dai dien (4B-3): dung lai multer cua Phan 1, xoa anh cu SAU khi DB da cap nhat
async function uploadAvatar(req, res, next) {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng chọn ảnh',
      data: null
    });
  }

  const newUrl = `/uploads/${req.file.filename}`;
  try {
    const [rows] = await pool.query(
      'SELECT id, full_name, email, avatar_url FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      await removeFileSafe(req.file.path);
      return res.status(401).json({
        success: false,
        message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
        data: null
      });
    }

    const oldUrl = rows[0].avatar_url;
    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [newUrl, req.user.id]);
    if (oldUrl) {
      // basename chan duong dan kieu ../
      await removeFileSafe(path.join(UPLOAD_DIR, path.basename(oldUrl)));
    }

    res.status(200).json({
      success: true,
      message: 'Đã cập nhật ảnh đại diện',
      data: toPublicUser({ ...rows[0], avatar_url: newUrl })
    });
  } catch (err) {
    await removeFileSafe(req.file.path);
    next(err);
  }
}

module.exports = {
  register,
  login,
  getProfile,
  changePassword,
  uploadAvatar
};
