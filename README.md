# English Admin Dashboard

Admin website quản lý ứng dụng học tiếng Anh.

## Tech Stack

- **Backend:** Node.js + Express.js
- **Frontend:** EJS (template engine)
- **Database:** PostgreSQL
- **Auth:** bcryptjs + express-session

## Yêu cầu

- Node.js >= 18
- PostgreSQL >= 14

## Cài đặt

### 1. Clone và cài dependencies

```bash
cd english-admin-websites
npm install
```

### 2. Tạo database PostgreSQL

```sql
-- Mở psql hoặc pgAdmin, chạy:
CREATE DATABASE english_learning_app;
```

### 3. Cấu hình environment

```bash
cp .env.example .env
```

Mở file `.env` và sửa thông tin PostgreSQL:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=english_learning_app
DB_USER=postgres
DB_PASSWORD=your_password_here
SESSION_SECRET=chuoi-bat-ky-dai-va-ngau-nhien
```

### 4. Chạy migration (tạo bảng)

```bash
npm run db:migrate
```

Kết quả thành công:
```
[✓] Bảng users
[✓] Bảng admin_accounts
[✓] Bảng tags
[✓] Bảng dictionary_entries
... (10 bảng)
[Migrate] ✅ Tạo thành công 10 bảng + indexes!
```

### 5. Seed dữ liệu mẫu

```bash
npm run db:seed
```

Kết quả:
```
[✓] Admin: admin@english-app.com (super_admin)
[✓] 8 tags
────────────────────────────
📧 Email:    admin@english-app.com
🔑 Password: admin123
────────────────────────────
```

### 6. Chạy server

```bash
npm run dev
```

Truy cập: **http://localhost:3000**

## Cấu trúc thư mục

```
english-admin-websites/
├── app.js                  # Entry point
├── package.json
├── .env.example
├── config/
│   └── db.js               # PostgreSQL connection pool
├── controllers/
│   ├── authController.js    # Login, Register, Logout
│   └── dashboardController.js
├── database/
│   ├── migrate.js           # Tạo 10 bảng (Domain 1+2)
│   └── seed.js              # Seed admin + tags
├── middlewares/
│   └── auth.js              # requireAuth, requireRole, injectAdmin
├── models/
│   └── Admin.js             # Admin queries
├── public/
│   ├── css/style.css
│   └── js/main.js
├── routes/
│   ├── auth.js
│   └── dashboard.js
└── views/
    ├── layouts/main.ejs     # Main layout
    ├── partials/
    │   ├── sidebar.ejs
    │   └── header.ejs
    ├── auth/
    │   ├── login.ejs
    │   └── register.ejs
    ├── dashboard.ejs
    └── 404.ejs
```

## Database Schema (Domain 1+2)

10 bảng đã tạo:

| # | Bảng | Mô tả |
|---|------|--------|
| 1 | users | Người dùng mobile app |
| 2 | admin_accounts | Tài khoản admin website |
| 3 | tags | Tags phân loại (IELTS, Business...) |
| 4 | dictionary_entries | Từ điển EN↔VI (bảng trung tâm) |
| 5 | entry_tags | Junction: entry ↔ tags |
| 6 | entry_edit_history | Lịch sử chỉnh sửa từ |
| 7 | lessons | Bài học theo chủ đề |
| 8 | lesson_tags | Junction: lesson ↔ tags |
| 9 | lesson_entries | Junction: lesson ↔ entries |
| 10 | user_lesson_progress | Tiến độ học bài |

## Tài khoản mặc định

| Email | Password | Role |
|-------|----------|------|
| admin@english-app.com | admin123 | super_admin |
