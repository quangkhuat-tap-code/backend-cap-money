USE capmoney;

INSERT INTO users (id, full_name, email, password_hash) VALUES
  (1, 'Dev Tester', 'dev@example.test', 'not-a-real-hash')
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO wallets (id, user_id, name, balance, type, is_default) VALUES
  (1, 1, 'Tiền mặt',  2000000, 'cash', 1),
  (2, 1, 'Ngân hàng', 5000000, 'bank', 0)
ON DUPLICATE KEY UPDATE name = VALUES(name), balance = VALUES(balance);
