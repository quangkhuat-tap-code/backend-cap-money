CREATE DATABASE IF NOT EXISTS capmoney CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE capmoney;

-- 1. users
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. wallets
CREATE TABLE IF NOT EXISTS wallets (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  name       VARCHAR(100) NOT NULL,
  balance    DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  type       ENUM('cash', 'bank', 'saving') NOT NULL DEFAULT 'cash',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_wallets_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. categories (chuẩn theo 01_Database_Va_API_Contract.md)
CREATE TABLE IF NOT EXISTS categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  name       VARCHAR(50)  NOT NULL,
  icon       VARCHAR(16)  NOT NULL,
  color_hex  CHAR(7)      NOT NULL,
  type       ENUM('expense','income') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_categories_user_type (user_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. transactions (chuẩn theo 01_Database_Va_API_Contract.md)
CREATE TABLE IF NOT EXISTS transactions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  wallet_id        INT NOT NULL,
  category_id      INT NOT NULL,
  amount           DECIMAL(15,2) NOT NULL,
  note             TEXT NULL,
  image_url        VARCHAR(255) NULL,
  type             ENUM('expense','income') NOT NULL,
  transaction_date DATETIME NOT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tx_user     FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE,
  CONSTRAINT fk_tx_wallet   FOREIGN KEY (wallet_id)   REFERENCES wallets(id)    ON DELETE RESTRICT,
  CONSTRAINT fk_tx_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  INDEX idx_tx_user_date (user_id, transaction_date),
  INDEX idx_tx_wallet (wallet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. wallet_transfers
CREATE TABLE IF NOT EXISTS wallet_transfers (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  from_wallet_id INT NOT NULL,
  to_wallet_id   INT NOT NULL,
  amount         DECIMAL(15,2) NOT NULL,
  note           TEXT NULL,
  transfer_date  DATETIME NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transfer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_transfer_from FOREIGN KEY (from_wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transfer_to   FOREIGN KEY (to_wallet_id)   REFERENCES wallets(id) ON DELETE RESTRICT,
  INDEX idx_transfer_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. budgets
CREATE TABLE IF NOT EXISTS budgets (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  category_id  INT NOT NULL,
  limit_amount DECIMAL(15,2) NOT NULL,
  month        TINYINT NOT NULL,
  year         SMALLINT NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_budgets_user     FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE,
  CONSTRAINT fk_budgets_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  INDEX idx_budgets_user_period (user_id, month, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dữ liệu mẫu danh mục hệ thống (user_id = NULL)
-- Chỉ thêm danh mục chưa có (cùng name + type), chạy lại file này không bị trùng
INSERT INTO categories (user_id, name, icon, color_hex, type)
SELECT NULL, s.name, s.icon, s.color_hex, s.type
FROM (
            SELECT 'Ăn uống'       AS name, '🍜' AS icon, '#FF9F0A' AS color_hex, 'expense' AS type
  UNION ALL SELECT 'Di chuyển',     '🚗', '#0A84FF', 'expense'
  UNION ALL SELECT 'Mua sắm',       '🛍️', '#FF375F', 'expense'
  UNION ALL SELECT 'Giải trí',      '🎮', '#BF5AF2', 'expense'
  UNION ALL SELECT 'Hóa đơn',       '🧾', '#64D2FF', 'expense'
  UNION ALL SELECT 'Sức khỏe',      '💊', '#32D74B', 'expense'
  UNION ALL SELECT 'Giáo dục',      '📚', '#FFD60A', 'expense'
  UNION ALL SELECT 'Khác',          '📦', '#8E8E93', 'expense'
  UNION ALL SELECT 'Lương',         '💼', '#32D74B', 'income'
  UNION ALL SELECT 'Thưởng',        '🎁', '#FFD60A', 'income'
  UNION ALL SELECT 'Đầu tư',        '📈', '#0A84FF', 'income'
  UNION ALL SELECT 'Thu nhập khác', '💰', '#8E8E93', 'income'
) AS s
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.user_id IS NULL AND c.name = s.name AND c.type = s.type
);
