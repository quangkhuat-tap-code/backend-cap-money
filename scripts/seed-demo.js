// Tao tai khoan demo co du lieu ao de test app (chi dung cho may dev).
// Chay: npm run seed:demo
// Chay lai nhieu lan: xoa sach du lieu cu cua tai khoan demo roi tao lai, du lieu luon giong nhau.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

// Thong tin dang nhap tai khoan demo (du lieu test, khong phai tai khoan that)
const DEMO_USER = {
  full_name: 'Người Dùng Demo',
  email: 'demo@capmoney.test',
  password: 'Demo@123456'
};

const MONTHS_BACK = 3; // thang hien tai + 2 thang truoc

// Sinh so gia ngau nhien co dinh (seed) de lan nao chay cung ra cung du lieu
let seed = 20261105;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}
function between(min, max, step = 1000) {
  return Math.round((min + rand() * (max - min)) / step) * step;
}
function pad(n) {
  return String(n).padStart(2, '0');
}
function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

// Chi tieu mau theo ten danh muc he thong: [so lan/thang, min, max, cac ghi chu]
const EXPENSE_PLAN = {
  'Ăn uống': [14, 30000, 180000, ['Cơm trưa văn phòng', 'Phở sáng', 'Trà sữa', 'Ăn tối cùng bạn', 'Cà phê', 'Bún chả', 'Đi chợ']],
  'Di chuyển': [6, 20000, 120000, ['Đổ xăng', 'Grab đi làm', 'Gửi xe tháng', 'Taxi về nhà']],
  'Mua sắm': [3, 150000, 900000, ['Mua áo thun', 'Giày thể thao', 'Đồ dùng nhà cửa', 'Mỹ phẩm']],
  'Giải trí': [3, 80000, 400000, ['Xem phim', 'Netflix', 'Karaoke', 'Vé ca nhạc']],
  'Hóa đơn': [3, 150000, 700000, ['Tiền điện', 'Tiền nước', 'Internet', 'Cước điện thoại']],
  'Sức khỏe': [1, 100000, 500000, ['Mua thuốc', 'Khám răng', 'Phòng gym']],
  'Giáo dục': [1, 200000, 800000, ['Mua sách', 'Khóa học online', 'Học phí tiếng Anh']],
  'Khác': [1, 50000, 300000, ['Quà sinh nhật bạn', 'Từ thiện', 'Linh tinh']]
};

// Ngan sach thang hien tai: mot so muc gan cham / vuot han muc de thay 3 mau ProgressBar
const BUDGET_PLAN = {
  'Ăn uống': 2500000,
  'Di chuyển': 600000,
  'Mua sắm': 1000000,
  'Giải trí': 500000,
  'Hóa đơn': 1500000
};

async function main() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Xoa du lieu cu cua tai khoan demo (neu co)
    const [old] = await conn.query('SELECT id FROM users WHERE email = ?', [DEMO_USER.email]);
    if (old.length > 0) {
      const oldId = old[0].id;
      await conn.query('DELETE FROM transactions WHERE user_id = ?', [oldId]);
      await conn.query('DELETE FROM wallet_transfers WHERE user_id = ?', [oldId]);
      await conn.query('DELETE FROM budgets WHERE user_id = ?', [oldId]);
      await conn.query('DELETE FROM wallets WHERE user_id = ?', [oldId]);
      await conn.query('DELETE FROM categories WHERE user_id = ?', [oldId]);
      await conn.query('DELETE FROM users WHERE id = ?', [oldId]);
    }

    // 2. Tao user
    const hash = await bcrypt.hash(DEMO_USER.password, 10);
    const [u] = await conn.query(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [DEMO_USER.full_name, DEMO_USER.email, hash]
    );
    const userId = u.insertId;

    // 3. Tao vi voi so du dau ky
    const walletDefs = [
      { key: 'cash', name: 'Tiền mặt', type: 'cash', is_default: 1, balance: 3000000 },
      { key: 'bank', name: 'Vietcombank', type: 'bank', is_default: 0, balance: 12000000 },
      { key: 'saving', name: 'Tiết kiệm', type: 'saving', is_default: 0, balance: 20000000 }
    ];
    const wallets = {};
    for (const w of walletDefs) {
      const [r] = await conn.query(
        'INSERT INTO wallets (user_id, name, balance, type, is_default) VALUES (?, ?, 0, ?, ?)',
        [userId, w.name, w.type, w.is_default]
      );
      wallets[w.key] = { id: r.insertId, balance: w.balance };
    }

    // 4. Lay danh muc he thong
    const [cats] = await conn.query('SELECT id, name, type FROM categories WHERE user_id IS NULL');
    const catId = (name, type) => {
      const c = cats.find(x => x.name === name && x.type === type);
      if (!c) throw new Error(`Thieu danh muc he thong "${name}" (${type}). Chay npm run db:init truoc.`);
      return c.id;
    };

    // 5. Sinh giao dich cho tung thang, chi den thoi diem hien tai
    const now = new Date();
    const txs = [];
    const transfers = [];
    for (let back = MONTHS_BACK - 1; back >= 0; back--) {
      const first = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const y = first.getFullYear();
      const m = first.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const lastDay = back === 0 ? now.getDate() : daysInMonth;
      const at = (day, hour, minute) => new Date(y, m, Math.min(day, lastDay), hour, minute);
      const inRange = d => d <= now;

      // Thu nhap
      const salaryDay = at(5, 9, 0);
      if (salaryDay.getDate() === 5 && inRange(salaryDay)) {
        txs.push({ w: 'bank', cat: catId('Lương', 'income'), type: 'income', amount: 15000000, note: `Lương tháng ${m + 1}`, date: salaryDay });
        // Rut tien mat va gui tiet kiem sau khi nhan luong
        transfers.push({ from: 'bank', to: 'cash', amount: 2000000, note: 'Rút tiền mặt', date: at(6, 18, 30) });
        transfers.push({ from: 'bank', to: 'saving', amount: 3000000, note: 'Gửi tiết kiệm hàng tháng', date: at(6, 18, 45) });
      }
      if (back === 1) {
        txs.push({ w: 'bank', cat: catId('Thưởng', 'income'), type: 'income', amount: 2000000, note: 'Thưởng dự án', date: at(20, 10, 0) });
      }
      if (back === 2) {
        txs.push({ w: 'cash', cat: catId('Thu nhập khác', 'income'), type: 'income', amount: 800000, note: 'Bán đồ cũ', date: at(15, 20, 0) });
      }
      txs.push({ w: 'saving', cat: catId('Đầu tư', 'income'), type: 'income', amount: between(100000, 200000), note: 'Lãi tiết kiệm', date: at(1, 8, 0) });

      // Chi tieu
      const ratio = lastDay / daysInMonth; // thang hien tai moi qua mot phan
      for (const [name, [times, min, max, notes]] of Object.entries(EXPENSE_PLAN)) {
        const count = Math.max(1, Math.round(times * ratio));
        for (let i = 0; i < count; i++) {
          const day = 1 + Math.floor(rand() * lastDay);
          const date = at(day, 7 + Math.floor(rand() * 14), Math.floor(rand() * 60));
          if (!inRange(date)) continue;
          const amount = between(min, max);
          const w = amount >= 300000 ? 'bank' : (rand() < 0.7 ? 'cash' : 'bank');
          txs.push({ w, cat: catId(name, 'expense'), type: 'expense', amount, note: pick(notes), date });
        }
      }
    }

    // Thang hien tai: day Giai tri vuot ngan sach va Di chuyen gan cham han muc
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    const sumCur = name => txs
      .filter(t => t.cat === catId(name, 'expense') && t.date.getMonth() + 1 === curMonth && t.date.getFullYear() === curYear)
      .reduce((s, t) => s + t.amount, 0);
    const topUp = (name, target, note) => {
      const extra = target - sumCur(name);
      if (extra > 0) {
        const date = new Date(curYear, curMonth - 1, now.getDate(), Math.max(0, now.getHours() - 1), 0);
        txs.push({ w: 'cash', cat: catId(name, 'expense'), type: 'expense', amount: Math.round(extra / 1000) * 1000, note, date });
      }
    };
    topUp('Giải trí', Math.round(BUDGET_PLAN['Giải trí'] * 1.15), 'Vé concert cuối tuần'); // vuot ~115%
    topUp('Di chuyển', Math.round(BUDGET_PLAN['Di chuyển'] * 0.85), 'Bảo dưỡng xe máy');     // ~85%

    // 6. Ghi giao dich + chuyen tien theo thu tu thoi gian, cap nhat so du
    txs.sort((a, b) => a.date - b.date);
    for (const t of txs) {
      await conn.query(
        `INSERT INTO transactions (user_id, wallet_id, category_id, amount, note, type, transaction_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, wallets[t.w].id, t.cat, t.amount, t.note, t.type, fmt(t.date)]
      );
      wallets[t.w].balance += t.type === 'income' ? t.amount : -t.amount;
    }
    for (const tr of transfers.filter(x => x.date <= now)) {
      await conn.query(
        `INSERT INTO wallet_transfers (user_id, from_wallet_id, to_wallet_id, amount, note, transfer_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, wallets[tr.from].id, wallets[tr.to].id, tr.amount, tr.note, fmt(tr.date)]
      );
      wallets[tr.from].balance -= tr.amount;
      wallets[tr.to].balance += tr.amount;
    }
    for (const w of Object.values(wallets)) {
      await conn.query('UPDATE wallets SET balance = ? WHERE id = ?', [w.balance, w.id]);
    }

    // 7. Ngan sach thang hien tai
    for (const [name, limit] of Object.entries(BUDGET_PLAN)) {
      await conn.query(
        'INSERT INTO budgets (user_id, category_id, limit_amount, month, year) VALUES (?, ?, ?, ?, ?)',
        [userId, catId(name, 'expense'), limit, curMonth, curYear]
      );
    }

    await conn.commit();

    console.log('Da tao tai khoan demo:');
    console.log(`  Email   : ${DEMO_USER.email}`);
    console.log(`  Mat khau: xem DEMO_USER trong scripts/seed-demo.js`);
    console.log(`  ${txs.length} giao dich, ${transfers.filter(x => x.date <= now).length} lan chuyen tien, ${Object.keys(BUDGET_PLAN).length} ngan sach thang ${curMonth}/${curYear}`);
    for (const w of walletDefs) {
      console.log(`  Vi ${w.name}: ${wallets[w.key].balance.toLocaleString('vi-VN')} đ`);
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Loi tao du lieu demo:', err.message);
  process.exit(1);
});
