# CapMoney Backend

API Node.js + Express + MySQL cho app Android CapMoney.

## Yêu cầu

- Node.js 18 trở lên
- MySQL 8 đang chạy ở máy local

## Cài đặt và chạy

1. Cài thư viện:

   ```bash
   npm install
   ```

2. Tạo file `.env` từ file mẫu, rồi sửa `DB_USER`, `DB_PASS` cho đúng MySQL trên máy:

   ```bash
   cp .env.example .env
   ```

3. Tạo database `capmoney`, 6 bảng và danh mục mặc định (chạy lại nhiều lần không bị trùng):

   ```bash
   npm run db:init
   ```

4. (Tuỳ chọn) Thêm dữ liệu test: user id 1 và 2 ví (Tiền mặt 2.000.000, Ngân hàng 5.000.000):

   ```bash
   node scripts/run-sql.js database_dev_seed.sql
   ```

5. Chạy server (tự khởi động lại khi sửa code):

   ```bash
   npm run dev
   ```

   Server chạy ở `http://localhost:5000`. Gọi `GET http://localhost:5000/api/xyz` thấy JSON `"Không tìm thấy API"` là đã chạy.

## Lấy token để test khi chưa có API đăng nhập

```bash
npm run dev:token
```

Lệnh in ra JWT của user id 1, hạn 30 ngày. Muốn user khác thì thêm id: `npm run dev:token -- 2`.

Gửi kèm header `Authorization: Bearer <token>` cho mọi API.

## Kết nối từ app Android

- Emulator: `http://10.0.2.2:5000/api/` (đã cấu hình sẵn trong `ApiClient.java`).
- Điện thoại thật: đổi `10.0.2.2` thành IP LAN của máy chạy server, điện thoại và máy tính dùng chung WiFi.
- Ảnh upload lưu ở `public/uploads/`, truy cập qua `http://<host>:5000/uploads/<tên file>`.

## Khuôn JSON trả về

Mọi API đều trả đúng 3 trường:

```json
{ "success": true, "message": "...", "data": { } }
```

Lỗi thì `success: false` và `data: null`.

## Danh sách API

| Method | Đường dẫn | Mô tả | Trạng thái |
|---|---|---|---|
| GET | `/api/categories?type=expense\|income` | Danh mục thu/chi | Có |
| POST | `/api/transactions` | Tạo giao dịch, `multipart/form-data`, ảnh ở field `image` (≤ 5MB, JPG/PNG/WEBP) | Có |
| GET | `/api/transactions?month=&year=&wallet_id=&type=` | Danh sách giao dịch trong tháng | Có |
| DELETE | `/api/transactions/:id` | Xoá giao dịch, hoàn số dư ví, xoá file ảnh | Có |
| POST | `/api/auth/register`, `/api/auth/login` | Đăng ký, đăng nhập | Chưa có |
| GET | `/api/auth/profile` | Thông tin user | Chưa có |
| GET, POST, PUT | `/api/wallets` | Quản lý ví | Chưa có |
| POST | `/api/wallets/transfer` | Chuyển tiền giữa các ví | Chưa có |
| GET | `/api/analytics/summary` | Thống kê theo danh mục | Chưa có |
| GET, POST, DELETE | `/api/budgets` | Ngân sách | Chưa có |

Khi thêm route mới, mount trong `src/app.js` ở chỗ comment giữ chỗ sẵn.

## Cấu trúc thư mục

```text
src/
├── app.js            # Khởi tạo Express, mount route, xử lý lỗi
├── config/db.js      # Pool kết nối MySQL
├── controllers/      # Xử lý từng API
├── middlewares/      # auth (JWT), upload (multer)
├── routes/           # Khai báo đường dẫn
└── utils/            # AppError, câu query dùng chung
scripts/              # run-sql.js, dev-token.js
public/uploads/       # Ảnh upload (không commit)
```
