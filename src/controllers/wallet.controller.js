const pool = require('../config/db');

const WALLET_TYPES = ['cash', 'bank', 'saving'];
const MAX_AMOUNT = 999999999999;

function mapWallet(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    balance: Number(row.balance),
    type: row.type,
    is_default: !!row.is_default,
    created_at: row.created_at
  };
}

function parseAmount(value) {
  if (value === null || value === '' || typeof value === 'boolean') return null;
  const x = Number(value);
  if (!Number.isFinite(x) || x < 0 || x > MAX_AMOUNT) return null;
  return Math.round(x * 100) / 100;
}

function validName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (name.length === 0 || name.length > 100) return null;
  return name;
}

async function getWallets(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, balance, type, is_default, created_at
       FROM wallets WHERE user_id = ?
       ORDER BY is_default DESC, id ASC`,
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách ví thành công',
      data: rows.map(mapWallet)
    });
  } catch (err) {
    next(err);
  }
}

async function createWallet(req, res, next) {
  try {
    const name = validName(req.body.name);
    if (name === null) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập tên ví (tối đa 100 ký tự)',
        data: null
      });
    }

    const { type } = req.body;
    if (!WALLET_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Loại ví không hợp lệ',
        data: null
      });
    }

    let balance = 0;
    if (req.body.balance !== undefined) {
      balance = parseAmount(req.body.balance);
      if (balance === null) {
        return res.status(400).json({
          success: false,
          message: 'Số dư không hợp lệ',
          data: null
        });
      }
    }

    const [dup] = await pool.query(
      'SELECT id FROM wallets WHERE user_id = ? AND LOWER(name) = LOWER(?)',
      [req.user.id, name]
    );
    if (dup.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Tên ví đã tồn tại',
        data: null
      });
    }

    const [insertRes] = await pool.query(
      'INSERT INTO wallets (user_id, name, balance, type, is_default) VALUES (?, ?, ?, ?, 0)',
      [req.user.id, name, balance, type]
    );

    const [rows] = await pool.query(
      'SELECT id, name, balance, type, is_default, created_at FROM wallets WHERE id = ?',
      [insertRes.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Đã tạo ví',
      data: mapWallet(rows[0])
    });
  } catch (err) {
    next(err);
  }
}

async function updateWallet(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Mã ví không hợp lệ',
        data: null
      });
    }

    const body = req.body || {};
    if (body.name === undefined && body.type === undefined && body.balance === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Không có thông tin cần cập nhật',
        data: null
      });
    }

    const fields = [];
    const params = [];

    let name = null;
    if (body.name !== undefined) {
      name = validName(body.name);
      if (name === null) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập tên ví (tối đa 100 ký tự)',
          data: null
        });
      }
      fields.push('name = ?');
      params.push(name);
    }

    if (body.type !== undefined) {
      if (!WALLET_TYPES.includes(body.type)) {
        return res.status(400).json({
          success: false,
          message: 'Loại ví không hợp lệ',
          data: null
        });
      }
      fields.push('type = ?');
      params.push(body.type);
    }

    if (body.balance !== undefined) {
      const balance = parseAmount(body.balance);
      if (balance === null) {
        return res.status(400).json({
          success: false,
          message: 'Số dư không hợp lệ',
          data: null
        });
      }
      fields.push('balance = ?');
      params.push(balance);
    }

    const [existing] = await pool.query(
      'SELECT id FROM wallets WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ví không tồn tại',
        data: null
      });
    }

    if (name !== null) {
      const [dup] = await pool.query(
        'SELECT id FROM wallets WHERE user_id = ? AND LOWER(name) = LOWER(?) AND id <> ?',
        [req.user.id, name, id]
      );
      if (dup.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Tên ví đã tồn tại',
          data: null
        });
      }
    }

    await pool.query(
      `UPDATE wallets SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      [...params, id, req.user.id]
    );

    const [rows] = await pool.query(
      'SELECT id, name, balance, type, is_default, created_at FROM wallets WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    res.status(200).json({
      success: true,
      message: 'Đã cập nhật ví',
      data: mapWallet(rows[0])
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  mapWallet,
  getWallets,
  createWallet,
  updateWallet
};
