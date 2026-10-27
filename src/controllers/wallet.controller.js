const pool = require('../config/db');
const { parseMonthYear } = require('../utils/monthRange');

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

async function transferMoney(req, res, next) {
  try {
    const fromId = Number(req.body.from_wallet_id);
    const toId = Number(req.body.to_wallet_id);
    if (!Number.isInteger(fromId) || fromId <= 0 || !Number.isInteger(toId) || toId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn ví nguồn và ví đích',
        data: null
      });
    }

    if (fromId === toId) {
      return res.status(400).json({
        success: false,
        message: 'Ví nguồn và ví đích phải khác nhau',
        data: null
      });
    }

    const amount = parseAmount(req.body.amount);
    if (amount === null || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Số tiền phải lớn hơn 0',
        data: null
      });
    }

    let note = req.body.note != null ? String(req.body.note).trim() : '';
    if (note.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Ghi chú tối đa 500 ký tự',
        data: null
      });
    }
    if (note.length === 0) {
      note = null;
    }

    const conn = await pool.getConnection();
    let transferId;
    try {
      await conn.beginTransaction();

      // Khoá 2 ví theo thứ tự id tăng dần để 2 lệnh chuyển ngược chiều chạy cùng lúc không bị deadlock
      const [rows] = await conn.query(
        'SELECT id, name, balance, type, is_default, created_at FROM wallets WHERE id IN (?, ?) AND user_id = ? ORDER BY id FOR UPDATE',
        [fromId, toId, req.user.id]
      );
      if (rows.length !== 2) {
        await conn.rollback();
        return res.status(404).json({
          success: false,
          message: 'Ví không tồn tại',
          data: null
        });
      }

      const fromWallet = rows.find(r => r.id === fromId);
      if (Number(fromWallet.balance) < amount) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: 'Số dư ví nguồn không đủ',
          data: null
        });
      }

      await conn.query('UPDATE wallets SET balance = balance - ? WHERE id = ?', [amount, fromId]);
      await conn.query('UPDATE wallets SET balance = balance + ? WHERE id = ?', [amount, toId]);
      const [insertRes] = await conn.query(
        `INSERT INTO wallet_transfers (user_id, from_wallet_id, to_wallet_id, amount, note, transfer_date)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [req.user.id, fromId, toId, amount, note]
      );
      transferId = insertRes.insertId;

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const [wallets] = await pool.query(
      'SELECT id, name, balance, type, is_default, created_at FROM wallets WHERE id IN (?, ?) AND user_id = ?',
      [fromId, toId, req.user.id]
    );
    const [transfers] = await pool.query(
      'SELECT id, from_wallet_id, to_wallet_id, amount, note, transfer_date FROM wallet_transfers WHERE id = ?',
      [transferId]
    );
    const transfer = transfers[0];

    res.status(201).json({
      success: true,
      message: 'Chuyển tiền thành công',
      data: {
        transfer: {
          id: transfer.id,
          from_wallet_id: transfer.from_wallet_id,
          to_wallet_id: transfer.to_wallet_id,
          amount: Number(transfer.amount),
          note: transfer.note != null ? transfer.note : null,
          transfer_date: transfer.transfer_date
        },
        from_wallet: mapWallet(wallets.find(w => w.id === fromId)),
        to_wallet: mapWallet(wallets.find(w => w.id === toId))
      }
    });
  } catch (err) {
    next(err);
  }
}

// Lich su chuyen tien trong 1 thang, kem ten vi nguon/dich (4B-1)
async function getTransfers(req, res, next) {
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
      `SELECT wt.id, wt.amount, wt.note, wt.transfer_date,
              wt.from_wallet_id, fw.name AS from_wallet_name,
              wt.to_wallet_id,   tw.name AS to_wallet_name
       FROM wallet_transfers wt
       JOIN wallets fw ON fw.id = wt.from_wallet_id
       JOIN wallets tw ON tw.id = wt.to_wallet_id
       WHERE wt.user_id = ? AND wt.transfer_date >= ? AND wt.transfer_date < ?
       ORDER BY wt.transfer_date DESC, wt.id DESC`,
      [req.user.id, range.start, range.end]
    );

    res.status(200).json({
      success: true,
      message: 'Lấy lịch sử chuyển tiền thành công',
      data: rows.map(row => ({
        id: row.id,
        amount: Number(row.amount),
        note: row.note != null ? row.note : null,
        transfer_date: row.transfer_date,
        from_wallet_id: row.from_wallet_id,
        from_wallet_name: row.from_wallet_name,
        to_wallet_id: row.to_wallet_id,
        to_wallet_name: row.to_wallet_name
      }))
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  mapWallet,
  getWallets,
  createWallet,
  updateWallet,
  transferMoney,
  getTransfers
};
