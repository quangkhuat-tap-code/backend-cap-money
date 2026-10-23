require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function runSql() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Vui lòng chỉ định file SQL cần chạy. Ví dụ: node scripts/run-sql.js database_init.sql');
    process.exit(1);
  }

  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(__dirname, '..', fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`Không tìm thấy file: ${filePath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`Đang chạy SQL từ file: ${filePath}...`);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  try {
    await connection.query(sql);
    console.log('Thực thi SQL thành công!');
  } catch (err) {
    console.error('Lỗi khi thực thi SQL:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runSql();
