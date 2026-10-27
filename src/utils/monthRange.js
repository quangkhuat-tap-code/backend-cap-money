// Trả { month, year, start, end } hoặc null nếu tham số sai.
// Khoảng [start, end) giống transaction.controller.js của Phần 1.
function parseMonthYear(monthRaw, yearRaw) {
  const now = new Date();
  const month = monthRaw !== undefined ? Number(monthRaw) : (now.getMonth() + 1);
  const year = yearRaw !== undefined ? Number(yearRaw) : now.getFullYear();

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return null;
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

  return { month, year, start, end };
}

module.exports = { parseMonthYear };
