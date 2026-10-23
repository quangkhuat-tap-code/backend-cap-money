const BASE_TRANSACTION_QUERY = `
  SELECT t.id, t.amount, t.type, t.note, t.image_url, t.transaction_date,
         t.wallet_id, w.name AS wallet_name,
         t.category_id, c.name AS category_name, c.icon AS category_icon, c.color_hex AS category_color
  FROM transactions t
  JOIN wallets w    ON w.id = t.wallet_id
  JOIN categories c ON c.id = t.category_id
`;

function mapTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    amount: Number(row.amount),
    type: row.type,
    note: row.note != null ? row.note : null,
    image_url: row.image_url != null ? row.image_url : null,
    transaction_date: row.transaction_date,
    wallet_id: row.wallet_id,
    wallet_name: row.wallet_name,
    category_id: row.category_id,
    category_name: row.category_name,
    category_icon: row.category_icon,
    category_color: row.category_color
  };
}

module.exports = {
  BASE_TRANSACTION_QUERY,
  mapTransaction
};
