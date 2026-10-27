const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const { BASE_TRANSACTION_QUERY, mapTransaction } = require('../utils/transaction.query');
const { UPLOAD_DIR } = require('../middlewares/upload.middleware');

function formatLocalDate(date) {
  const pad = n => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d} ${h}:${mi}:${s}`;
}

function isValidDateTimeString(str) {
  const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  if (!regex.test(str)) return false;

  const [datePart, timePart] = str.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, mi, s] = timePart.split(':').map(Number);

  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (h < 0 || h > 23) return false;
  if (mi < 0 || mi > 59) return false;
  if (s < 0 || s > 59) return false;

  const dt = new Date(y, m - 1, d, h, mi, s);
  return dt.getFullYear() === y &&
         dt.getMonth() === m - 1 &&
         dt.getDate() === d &&
         dt.getHours() === h &&
         dt.getMinutes() === mi &&
         dt.getSeconds() === s;
}

async function removeFileSafe(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    // Ignore ENOENT
  }
}

async function createTransaction(req, res, next) {
  const uploadedPath = req.file ? req.file.path : null;

  try {
    const rawAmount = Number(req.body.amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0 || rawAmount > 999999999999) {
      await removeFileSafe(uploadedPath);
      return res.status(400).json({
        success: false,
        message: 'Số tiền phải lớn hơn 0',
        data: null
      });
    }
    const amount = Math.round(rawAmount * 100) / 100;

    const { type } = req.body;
    if (type !== 'expense' && type !== 'income') {
      await removeFileSafe(uploadedPath);
      return res.status(400).json({
        success: false,
        message: 'Loại giao dịch không hợp lệ',
        data: null
      });
    }

    const walletId = Number(req.body.wallet_id);
    if (!Number.isInteger(walletId) || walletId <= 0) {
      await removeFileSafe(uploadedPath);
      return res.status(404).json({
        success: false,
        message: 'Ví không tồn tại',
        data: null
      });
    }

    const categoryId = Number(req.body.category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      await removeFileSafe(uploadedPath);
      return res.status(404).json({
        success: false,
        message: 'Danh mục không tồn tại',
        data: null
      });
    }

    let note = req.body.note != null ? String(req.body.note).trim() : '';
    if (note.length > 500) {
      await removeFileSafe(uploadedPath);
      return res.status(400).json({
        success: false,
        message: 'Ghi chú tối đa 500 ký tự',
        data: null
      });
    }
    if (note.length === 0) {
      note = null;
    }

    let transactionDate = req.body.transaction_date;
    if (transactionDate) {
      transactionDate = String(transactionDate).trim();
      if (!isValidDateTimeString(transactionDate)) {
        await removeFileSafe(uploadedPath);
        return res.status(400).json({
          success: false,
          message: 'Ngày giao dịch không hợp lệ',
          data: null
        });
      }
    } else {
      transactionDate = formatLocalDate(new Date());
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check wallet
      const [wallets] = await conn.query(
        'SELECT id, balance FROM wallets WHERE id = ? AND user_id = ? FOR UPDATE',
        [walletId, req.user.id]
      );
      if (wallets.length === 0) {
        await conn.rollback();
        await removeFileSafe(uploadedPath);
        return res.status(404).json({
          success: false,
          message: 'Ví không tồn tại',
          data: null
        });
      }
      const wallet = wallets[0];

      // Check category
      const [categories] = await conn.query(
        'SELECT id, type FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
        [categoryId, req.user.id]
      );
      if (categories.length === 0) {
        await conn.rollback();
        await removeFileSafe(uploadedPath);
        return res.status(404).json({
          success: false,
          message: 'Danh mục không tồn tại',
          data: null
        });
      }
      const category = categories[0];
      if (category.type !== type) {
        await conn.rollback();
        await removeFileSafe(uploadedPath);
        return res.status(400).json({
          success: false,
          message: 'Danh mục không khớp loại giao dịch',
          data: null
        });
      }

      // Check balance if expense
      if (type === 'expense' && amount > Number(wallet.balance)) {
        await conn.rollback();
        await removeFileSafe(uploadedPath);
        return res.status(400).json({
          success: false,
          message: 'Số dư ví không đủ để thực hiện giao dịch',
          data: null
        });
      }

      // Insert transaction
      const [insertRes] = await conn.query(
        `INSERT INTO transactions
         (user_id, wallet_id, category_id, amount, note, image_url, type, transaction_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, walletId, categoryId, amount, note, imageUrl, type, transactionDate]
      );
      const newTxId = insertRes.insertId;

      // Update wallet balance
      const balanceDelta = type === 'income' ? amount : -amount;
      await conn.query('UPDATE wallets SET balance = balance + ? WHERE id = ?', [balanceDelta, walletId]);

      await conn.commit();

      const [txRows] = await pool.query(
        `${BASE_TRANSACTION_QUERY} WHERE t.id = ?`,
        [newTxId]
      );

      res.status(201).json({
        success: true,
        message: 'Đã lưu giao dịch',
        data: mapTransaction(txRows[0])
      });
    } catch (err) {
      await conn.rollback();
      await removeFileSafe(uploadedPath);
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    await removeFileSafe(uploadedPath);
    next(err);
  }
}

async function getTransactions(req, res, next) {
  try {
    const now = new Date();
    let month = req.query.month != null ? Number(req.query.month) : (now.getMonth() + 1);
    let year = req.query.year != null ? Number(req.query.year) : now.getFullYear();

    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Tham số lọc không hợp lệ',
        data: null
      });
    }

    let walletId = null;
    if (req.query.wallet_id != null) {
      walletId = Number(req.query.wallet_id);
      if (!Number.isInteger(walletId) || walletId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Tham số lọc không hợp lệ',
          data: null
        });
      }
    }

    let type = null;
    if (req.query.type != null) {
      type = req.query.type;
      if (type !== 'expense' && type !== 'income') {
        return res.status(400).json({
          success: false,
          message: 'Tham số lọc không hợp lệ',
          data: null
        });
      }
    }

    const pad = n => String(n).padStart(2, '0');
    const start = `${year}-${pad(month)}-01 00:00:00`;
    let endYear = year;
    let endMonth = month + 1;
    if (endMonth > 12) {
      endYear += 1;
      endMonth = 1;
    }
    const end = `${endYear}-${pad(endMonth)}-01 00:00:00`;

    let sql = `
      ${BASE_TRANSACTION_QUERY}
      WHERE t.user_id = ? AND t.transaction_date >= ? AND t.transaction_date < ?
    `;
    const params = [req.user.id, start, end];

    if (walletId) {
      sql += ' AND t.wallet_id = ?';
      params.push(walletId);
    }

    if (type) {
      sql += ' AND t.type = ?';
      params.push(type);
    }

    sql += ' ORDER BY t.transaction_date DESC, t.id DESC';

    const [rows] = await pool.query(sql, params);
    const data = rows.map(mapTransaction);

    res.status(200).json({
      success: true,
      message: 'Lấy danh sách giao dịch thành công',
      data
    });
  } catch (err) {
    next(err);
  }
}

async function deleteTransaction(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Mã giao dịch không hợp lệ',
        data: null
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [txRows] = await conn.query(
        'SELECT id, wallet_id, amount, type, image_url FROM transactions WHERE id = ? AND user_id = ? FOR UPDATE',
        [id, req.user.id]
      );
      if (txRows.length === 0) {
        await conn.rollback();
        return res.status(404).json({
          success: false,
          message: 'Giao dịch không tồn tại',
          data: null
        });
      }

      const tx = txRows[0];
      const delta = tx.type === 'expense' ? Number(tx.amount) : -Number(tx.amount);

      await conn.query('UPDATE wallets SET balance = balance + ? WHERE id = ?', [delta, tx.wallet_id]);
      await conn.query('DELETE FROM transactions WHERE id = ?', [id]);

      const [wallets] = await conn.query('SELECT balance FROM wallets WHERE id = ?', [tx.wallet_id]);
      const newBalance = wallets.length > 0 ? Number(wallets[0].balance) : 0;

      await conn.commit();

      if (tx.image_url) {
        const filename = path.basename(tx.image_url);
        const imageDiskPath = path.join(UPLOAD_DIR, filename);
        await removeFileSafe(imageDiskPath);
      }

      res.status(200).json({
        success: true,
        message: 'Đã xóa giao dịch',
        data: {
          id: tx.id,
          wallet_id: tx.wallet_id,
          wallet_balance: newBalance
        }
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

function badRequest(res, message) {
  return res.status(400).json({ success: false, message, data: null });
}

function notFound(res, message) {
  return res.status(404).json({ success: false, message, data: null });
}

// Sua giao dich: khong doi loai, khong doi anh. So du vi tinh lai = hoan tac giao dich cu + ap giao dich moi
async function updateTransaction(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return badRequest(res, 'Mã giao dịch không hợp lệ');
    }

    const rawAmount = Number(req.body.amount);
    if (req.body.amount === null || req.body.amount === '' || !Number.isFinite(rawAmount) || rawAmount <= 0 || rawAmount > 999999999999) {
      return badRequest(res, 'Số tiền phải lớn hơn 0');
    }
    const amount = Math.round(rawAmount * 100) / 100;

    let note = req.body.note != null ? String(req.body.note).trim() : '';
    if (note.length > 500) {
      return badRequest(res, 'Ghi chú tối đa 500 ký tự');
    }
    if (note.length === 0) {
      note = null;
    }

    const transactionDate = req.body.transaction_date != null ? String(req.body.transaction_date).trim() : '';
    if (!isValidDateTimeString(transactionDate)) {
      return badRequest(res, 'Ngày giao dịch không hợp lệ');
    }

    const walletId = Number(req.body.wallet_id);
    const categoryId = Number(req.body.category_id);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [txRows] = await conn.query(
        'SELECT id, wallet_id, amount, type FROM transactions WHERE id = ? AND user_id = ? FOR UPDATE',
        [id, req.user.id]
      );
      if (txRows.length === 0) {
        await conn.rollback();
        return notFound(res, 'Giao dịch không tồn tại');
      }
      const oldTx = txRows[0];

      if (!Number.isInteger(walletId) || walletId <= 0) {
        await conn.rollback();
        return notFound(res, 'Ví không tồn tại');
      }

      // Khoa vi theo thu tu id tang dan (giong transferMoney) de tranh deadlock
      const walletIds = Array.from(new Set([oldTx.wallet_id, walletId])).sort((a, b) => a - b);
      const [walletRows] = await conn.query(
        'SELECT id, balance FROM wallets WHERE id IN (?) AND user_id = ? ORDER BY id FOR UPDATE',
        [walletIds, req.user.id]
      );
      const balances = {};
      walletRows.forEach(w => { balances[w.id] = Number(w.balance); });
      if (balances[walletId] === undefined) {
        await conn.rollback();
        return notFound(res, 'Ví không tồn tại');
      }

      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        await conn.rollback();
        return notFound(res, 'Danh mục không tồn tại');
      }
      const [categories] = await conn.query(
        'SELECT id, type FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
        [categoryId, req.user.id]
      );
      if (categories.length === 0) {
        await conn.rollback();
        return notFound(res, 'Danh mục không tồn tại');
      }
      if (categories[0].type !== oldTx.type) {
        await conn.rollback();
        return badRequest(res, 'Danh mục không khớp loại giao dịch');
      }

      // Hoan tac giao dich cu o vi cu, roi ap giao dich moi o vi moi
      const sign = oldTx.type === 'income' ? 1 : -1;
      balances[oldTx.wallet_id] -= sign * Number(oldTx.amount);
      balances[walletId] += sign * amount;

      const negative = walletIds.some(wid => Math.round(balances[wid] * 100) < 0);
      if (negative) {
        await conn.rollback();
        return badRequest(res, 'Số dư ví không đủ để thực hiện giao dịch');
      }

      for (const wid of walletIds) {
        await conn.query('UPDATE wallets SET balance = ? WHERE id = ?', [Math.round(balances[wid] * 100) / 100, wid]);
      }
      await conn.query(
        `UPDATE transactions
         SET amount = ?, wallet_id = ?, category_id = ?, note = ?, transaction_date = ?
         WHERE id = ?`,
        [amount, walletId, categoryId, note, transactionDate, id]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const [rows] = await pool.query(`${BASE_TRANSACTION_QUERY} WHERE t.id = ?`, [id]);
    res.status(200).json({
      success: true,
      message: 'Đã cập nhật giao dịch',
      data: mapTransaction(rows[0])
    });
  } catch (err) {
    next(err);
  }
}

const SEARCH_PAGE_SIZE = 20;

// Tim trong ghi chu hoac ten danh muc, moi thang, 20 dong/trang
async function searchTransactions(req, res, next) {
  try {
    const q = req.query.q != null ? String(req.query.q).trim() : '';
    const page = req.query.page != null ? Number(req.query.page) : 1;
    if (q.length < 1 || q.length > 50 || !Number.isInteger(page) || page < 1 || page > 1000) {
      return badRequest(res, 'Từ khoá tìm kiếm không hợp lệ');
    }

    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const [rows] = await pool.query(
      `${BASE_TRANSACTION_QUERY}
       WHERE t.user_id = ? AND (t.note LIKE ? OR c.name LIKE ?)
       ORDER BY t.transaction_date DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, like, like, SEARCH_PAGE_SIZE + 1, (page - 1) * SEARCH_PAGE_SIZE]
    );

    res.status(200).json({
      success: true,
      message: 'Tìm thấy giao dịch',
      data: {
        items: rows.slice(0, SEARCH_PAGE_SIZE).map(mapTransaction),
        page,
        has_more: rows.length > SEARCH_PAGE_SIZE
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createTransaction,
  getTransactions,
  deleteTransaction,
  updateTransaction,
  searchTransactions
};
