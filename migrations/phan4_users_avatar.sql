-- Phan 4B-3: them cot anh dai dien cho bang users
-- Chay: node scripts/run-sql.js migrations/phan4_users_avatar.sql
-- Chay lai nhieu lan khong loi (MySQL 8 khong co ADD COLUMN IF NOT EXISTS nen kiem tra qua information_schema)
USE capmoney;

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'capmoney' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar_url'
);
SET @sql := IF(@has_col = 0,
  'ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) NULL AFTER password_hash',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
