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
dùng để xác minh qua `getUser`. `SUPABASE_SECRET_KEY` được BE dùng riêng để gọi
Edge Function `admin-ids`; JWKS URL chưa cần cho cách xác minh hiện tại.

Frontend đăng nhập Google hoặc email qua Supabase, lấy access token của phiên
rồi gọi BE:

```js
const response = await fetch('http://localhost:8080/api/auth/me', {
  headers: { Authorization: `Bearer ${session.access_token}` },
});
const result = await response.json();
```

`GET /api/auth/me` trả `{ "user": { "id": "...", "email": "...", "role": "admin" } }` sau khi
xác minh. Trả `401` nếu thiếu, sai hoặc hết hạn token; trả `503` khi dịch vụ xác
thực tạm thời không khả dụng. API này kiểm tra danh tính Supabase, không tạo hồ
sơ `nep.profiles`. BE gọi `GET /functions/v1/admin-ids` bằng header `apikey`
chứa secret key để nhận mảng UUID admin. UUID đã xác minh có trong danh sách
nhận role `admin`, các UUID còn lại nhận role `member`. Role được tính lại mỗi
lần gọi; nếu không tải được danh sách hoặc dữ liệu sai định dạng, trả `503`.
Danh sách này là nguồn phân quyền hiện tại, không dùng `profiles.role`, role từ
FE hay `user_metadata`. Các API nghiệp vụ sẽ dùng `req.user.id` để kiểm tra
quyền sở hữu, và dùng cùng service để kiểm tra quyền admin.

```sh
npm run auth:check
npm run admin:check
npm test
```

`auth:check` kiểm tra project URL/publishable key và trạng thái Google provider
bằng một yêu cầu chỉ đọc. `admin:check` kiểm tra Edge Function thật và xác nhận
UUID trong/ngoài danh sách lần lượt có role `admin`/`member`, không tạo tài khoản
hay thay đổi quyền. `npm test` kiểm tra API xác thực với Supabase được mô
phỏng, không tạo tài khoản hoặc thay đổi dữ liệu thật. Cần thử đăng nhập từ FE
để xác nhận đầy đủ cấu hình OAuth, redirect URL và token thực tế.

Tham khảo: [Khởi tạo JavaScript client](https://supabase.com/docs/reference/javascript/initializing),
[Xác minh access token bằng getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

## API công trình

Thư viện công khai chỉ trả `published` và `published_at <= now()`, kể cả khi
truy cập trực tiếp slug. Các API quản trị xác minh token Supabase rồi đối chiếu
UUID với Edge Function `admin-ids` ở mỗi request.

- `GET /api/projects`: trả `items`, `total`, `page`, `pageSize`, `totalPages`.
  Nhận `q`, `type`, `style`, `city`, `creatorId`, `area=small|medium|large`,
  `minArea`, `maxArea`, `sort=newest|area|name`, `page`, `pageSize` (tối đa 50).
- `GET /api/projects/filters`: loại nhà, phong cách và địa điểm đã xuất bản.
- `GET /api/projects/:slug`: chi tiết, người thiết kế và gallery theo thứ tự.
- `GET /api/admin/projects`: danh sách quản trị; thêm bộ lọc `status`.
- `GET /api/admin/projects/options`: người thiết kế và trạng thái cấu hình upload.
- `GET /api/admin/projects/:slug`: xem cả bản nháp, hẹn đăng và đã gỡ.
- `POST /api/admin/projects`: tạo công trình, mặc định là nháp.
- `PATCH /api/admin/projects/:slug`: sửa nội dung, trạng thái và gallery.
- `DELETE /api/admin/projects/:slug`: gỡ về `archived`, giữ dữ liệu và liên kết.
- `POST /api/admin/creators`: tạo người thiết kế để chọn khi nhập công trình.

Payload tạo công trình gồm `slug`, `name`, `creatorId`, `type`, `style`, `city`.
Các trường tùy chọn: `area`, `floors`, `beds`, `year`, `story`, `status`,
`publishedAt` (ISO date), `imageIds` (mảng ID ảnh dạng chuỗi). Số liệu chưa có
được để `null`. Slug giữ cố định sau khi tạo. Khi chuyển sang `published` mà
chưa đặt thời gian, server dùng thời điểm hiện tại; ngày trong tương lai là hẹn
đăng. `imageIds` xác định thứ tự gallery, ảnh đầu tiên làm bìa.

Trong FE mở `/#/admin/projects`, hoặc vào Tài khoản → Quản lý công trình bằng
tài khoản có UUID trong danh sách admin. Màn hình hỗ trợ tạo người thiết kế,
tạo/sửa/gỡ công trình và đổi thứ tự ảnh đã có trong thư viện. Trang chủ, danh sách và chi
tiết công trình đọc API thật; database rỗng hiển thị trạng thái chưa có nội dung.

```sh
npm run projects:check
npm test
```

`projects:check` dùng database hiện tại và chỉ đọc dữ liệu. Test CRUD dùng
PostgreSQL tạm qua PGlite và Prisma, không tạo công trình trong Supabase thật.

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
