# Nep-Architecture-BE

Backend Express (CommonJS), PostgreSQL trên Supabase và Prisma ORM 7.
Mô hình dữ liệu được chuyển từ `docs/HUONG-DAN-BACKEND.md`.

## Cài đặt

Yêu cầu Node.js 22.12+ hoặc 24+ và npm. Từ thư mục dự án:

```sh
npm install
```

Nếu chưa có `.env`, sao chép `.env.example` thành `.env` rồi điền thông tin
kết nối từ hộp thoại **Connect** của Supabase. Giữ nguyên `.env` nếu đã có.
Trên PowerShell có chặn `npm.ps1`, dùng `npm.cmd` thay cho `npm`.

- `DATABASE_URL`: kết nối cho ứng dụng, nên dùng role riêng chỉ truy cập `nep`.
- `DIRECT_URL`: kết nối có quyền migration; dùng direct hoặc session pooler
  cổng 5432, không dùng transaction pooler cổng 6543.
- `DB_URL`: tên biến cũ vẫn dùng được khi chưa có `DATABASE_URL`.
- `PORT`: mặc định `8080`.

Prisma CLI ưu tiên `DIRECT_URL`, rồi `DATABASE_URL`, cuối cùng `DB_URL`.
Ứng dụng dùng `DATABASE_URL` hoặc `DB_URL`. Mật khẩu trong URL phải được URL-encode.
Không đưa các chuỗi kết nối này vào frontend.

## Xác thực với Supabase Auth

Express dùng SDK JavaScript `@supabase/supabase-js`. Bổ sung vào `.env`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
FRONTEND_URL=http://localhost:5173
```

`FRONTEND_URL` phải khớp origin thực tế của frontend để gọi API qua CORS.
Client trong `configuration/supabase.js` xác minh từng access token với Supabase
bằng `getUser(token)`; không lưu hay dùng chung phiên đăng nhập giữa các request.
Google Client Secret được cấu hình ở Supabase Dashboard. Publishable key được
dùng cho luồng này; secret key và JWKS URL chưa cần cho việc xác minh qua `getUser`.

Frontend đăng nhập Google hoặc email qua Supabase, lấy access token của phiên
rồi gọi BE:

```js
const response = await fetch('http://localhost:8080/api/auth/me', {
  headers: { Authorization: `Bearer ${session.access_token}` },
});
const result = await response.json();
```

`GET /api/auth/me` trả `{ "user": { "id": "...", "email": "..." } }` sau khi
xác minh. Trả `401` nếu thiếu, sai hoặc hết hạn token; trả `503` khi dịch vụ xác
thực tạm thời không khả dụng. API này kiểm tra danh tính Supabase, không tạo hồ
sơ `nep.profiles`. Các API nghiệp vụ sẽ dùng `req.user.id` để truy vấn hồ sơ và
kiểm tra quyền sở hữu; không lấy role từ `user_metadata`.

```sh
npm run auth:check
npm test
```

`auth:check` kiểm tra project URL/publishable key và trạng thái Google provider
bằng một yêu cầu chỉ đọc. `npm test` kiểm tra API xác thực với Supabase được mô
phỏng, không tạo tài khoản hoặc thay đổi dữ liệu thật. Cần thử đăng nhập từ FE
để xác nhận đầy đủ cấu hình OAuth, redirect URL và token thực tế.

Tham khảo: [Khởi tạo JavaScript client](https://supabase.com/docs/reference/javascript/initializing),
[Xác minh access token bằng getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

## Khởi tạo database

Migration đầu tiên dành cho database Supabase mới: `auth.users` và các role
`anon`, `authenticated` phải tồn tại sẵn. Prisma chỉ quản lý schema nghiệp vụ
`nep`; không tạo hay thay đổi các bảng do Supabase Auth quản lý.

```sh
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:check
npm start
```

`db:migrate` chạy `prisma migrate deploy`, áp dụng các migration đã lưu trong
`prisma/migrations`. Chạy lệnh này bằng tài khoản có quyền tạo schema, bảng và
khóa ngoại đến `auth.users`. Không cần chạy thêm khối SQL trong tài liệu gốc.

Nếu đã tạo `nep` bằng SQL trong tài liệu, cần đối chiếu schema và baseline
database trước khi dùng migration này; không áp dụng migration khởi tạo lên
các bảng đang có. Hai bảng `bookmarks`, `collection_items` cần thêm khóa chính
UUID như `schema.prisma` trước khi có thể đánh dấu migration đã áp dụng.

Giữ `nep` ngoài danh sách schema được expose qua Supabase Data API. Migration
thu hồi quyền schema của `PUBLIC`, `anon`, `authenticated`. Sau khi tự tạo role
đăng nhập PostgreSQL `nep_api`, chạy bằng tài khoản migration:

```sql
GRANT CONNECT ON DATABASE postgres TO nep_api;
GRANT USAGE ON SCHEMA nep TO nep_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA nep TO nep_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA nep TO nep_api;
```

Cập nhật `DATABASE_URL` bằng role này. Cấp lại quyền cho bảng/sequence mới ở các
migration tiếp theo. API phải xác minh phiên và quyền sở hữu trước khi truy vấn.

## Dùng Prisma

```js
const db = require('./configuration/database');

const projects = await db.project.findMany({
  where: {
    status: 'published',
    publishedAt: { lte: new Date() },
  },
  orderBy: [{ publishedAt: 'desc' }, { slug: 'asc' }],
  take: 20,
});
```

`configuration/database.js` dùng một Prisma Client và pool tối đa 5 kết nối.
Server kết nối database trước khi lắng nghe và ngắt kết nối khi dừng.
Client được generate vào `generated/prisma`, không commit thư mục này;
`postinstall` tạo lại client sau khi cài dependencies. Dùng generator
`prisma-client-js` để có JavaScript tương thích ứng dụng CommonJS hiện tại.

Schema có 13 model, ánh xạ tên field camelCase sang tên cột snake_case của tài
liệu. `bookmarks` và `collection_items` có thêm `id UUID` để Prisma định danh;
các unique constraint theo người dùng/bộ sưu tập và đối tượng được giữ nguyên.
Các cột `BigInt` như ID ảnh phải đổi thành chuỗi trước khi trả JSON.

Các CHECK constraint, index `projects_latest` chỉ dành cho công trình published
và khóa ngoại `profiles.id → auth.users.id` được lưu trong SQL migration.
Giữ các phần SQL này khi viết migration tiếp theo. Không dùng `db push` thay
cho migration vì Prisma schema không biểu diễn đầy đủ các ràng buộc đó.
Nếu dùng `migrate dev`, shadow database cũng phải có sẵn `auth.users` và các
role Supabase cần thiết; ưu tiên một Supabase local riêng cho phát triển.

Tham khảo: [Prisma Config](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference),
[Prisma với Supabase](https://supabase.com/docs/guides/database/prisma).
