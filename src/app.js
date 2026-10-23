require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const AppError = require('./utils/AppError');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

const categoryRoutes = require('./routes/category.routes');
const transactionRoutes = require('./routes/transaction.routes');

app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);

// Route placeholders (của Thành viên khác)
// app.use('/api/auth', ...);          // Thành viên 2: register, login, profile
// app.use('/api/wallets', ...);       // Thành viên 2: CRUD ví, transfer
// app.use('/api/analytics', ...);     // Thành viên 3: summary
// app.use('/api/budgets', ...);       // Thành viên 3

// 404 handler cho /api/*
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Không tìm thấy API',
    data: null
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof AppError || (err && err.status)) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      data: null
    });
  }

  console.error(err);
  res.status(500).json({
    success: false,
    message: 'Lỗi máy chủ',
    data: null
  });
});

const PORT = Number(process.env.PORT || 5000);
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

module.exports = app;
