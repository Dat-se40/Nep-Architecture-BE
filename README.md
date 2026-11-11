# Nep-Architecture-BE

Backend Express (CommonJS), PostgreSQL trên Supabase và Prisma ORM 7.
Mô hình dữ liệu được chuyển từ tài liệu local `docs/md/HUONG-DAN-BACKEND.md`
(thư mục `docs/md/` không đưa vào Git).

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
FRONTEND_URL=http://localhost:3000
AUTH_REDIRECT_URL="http://localhost:3000/#/auth/callback"
```

`FRONTEND_URL` phải khớp origin thực tế của frontend để gọi API qua CORS.
Client trong `configuration/supabase.js` xác minh từng access token với Supabase
bằng `getUser(token)`; không lưu hay dùng chung phiên đăng nhập giữa các request.
Google Client Secret được cấu hình ở Supabase Dashboard. Publishable key được
dùng để xác minh qua `getUser`. `SUPABASE_SECRET_KEY` được BE dùng riêng để gọi
Edge Function `admin-ids`; JWKS URL chưa cần cho cách xác minh hiện tại.

Các thao tác email/mật khẩu của FE gọi API Express bên dưới. Supabase SDK ở FE
giữ phiên và PKCE, dùng transport gửi request qua BE. Đăng nhập Google vẫn mở
trang OAuth của Supabase; đổi code callback đi qua BE. Khi đã có access token,
FE gọi API được bảo vệ như sau:

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

## API đăng nhập và mật khẩu

Tất cả endpoint dưới `/api/auth` trả `Cache-Control: no-store`. BE dùng REST API
Supabase với publishable key, không lưu mật khẩu hay phiên đăng nhập vào client
Supabase dùng chung trên server. Không cần secret/service-role key cho các luồng
này; secret key hiện tại vẫn chỉ phục vụ danh sách UUID admin.

- `POST /api/auth/register`: `email`, `password` (8–128 ký tự), tùy chọn
  `data.display_name`. Trả `201`; nếu cần xác nhận email thì chưa có session.
- `POST /api/auth/login`: `email`, `password`; trả access/refresh token và user.
  Gọi `GET /api/auth/me` để lấy role admin/member do BE xác minh.
- `POST /api/auth/forgot-password`: gửi email khôi phục.
- `POST /api/auth/resend-confirmation`: gửi lại xác nhận với `email`, `type=signup`.
- `POST /api/auth/callback`: `auth_code`, `code_verifier`; đổi code lấy session.
- `GET /api/auth/callback`: trang HTML dự phòng có link quay lại trang xác nhận,
  đăng nhập hoặc trang chủ FE khi callback bị mở trực tiếp trên BE.
- `POST /api/auth/verify-email`: `token_hash`, `type=signup|email|recovery` cho
  email template dùng token hash. Supabase xác minh token trước khi trả session.
- `GET /api/auth/user`: thông tin Supabase user đã xác minh, gồm metadata avatar.
- `POST /api/auth/avatar`: Bearer token, multipart field `avatar`; mọi thành viên
  đăng nhập đều được upload ảnh của chính mình, không cần quyền admin. Tối đa
  5 MiB/40 megapixel. BE cắt vuông 512×512, chuyển WebP, lưu R2 trong
  `<prefix>/avatars/<verified-user-id>/<UUID>.webp`, rồi cập nhật
  `user_metadata.avatar_url` bằng token của chính người đó. Nếu cập nhật metadata
  lỗi, xóa riêng object vừa tạo. Không nhận userId hay URL avatar từ client.
- `POST /api/auth/refresh`: `refresh_token`; trả phiên mới.
- `PUT /api/auth/password`: Bearer token và `password`; gửi `current_password`
  khi đổi trong Cài đặt. BE xác minh mật khẩu cũ theo email từ token, kiểm tra
  đúng chủ tài khoản rồi thu hồi riêng phiên xác minh tạm. Khi khôi phục email
  hoặc đặt mật khẩu cho tài khoản Google, dùng phiên vừa xác thực và password.
  Supabase vẫn áp dụng chính sách bảo mật/reauthentication của project.
- `POST /api/auth/logout?scope=local`: thu hồi refresh token của phiên hiện tại;
  có thể chọn `global` hoặc `others`. Trả `204`. Client xóa phiên local; JWT đã
  phát hành vẫn có thể còn hợp lệ tới khi hết hạn theo cơ chế Supabase.

Response đăng nhập/callback/refresh giữ định dạng session Supabase để SDK có thể
lưu phiên và tự refresh. Mật khẩu không được trim. Body được kiểm tra bằng Zod,
không nhận userId/role hoặc metadata phân quyền do client truyền vào.

Đăng ký, gửi lại và quên mật khẩu nhận PKCE `code_challenge` và
`code_challenge_method=s256` từ SDK. Verifier giữ tại trình duyệt và chỉ gửi lên
API callback khi đổi code. Client tự viết cần quản lý cặp này nếu dùng PKCE.
Query `redirect_to` chỉ nhận callback cố định đã cấu hình, không nhận URL tùy ý.
Đặt `AUTH_REDIRECT_URL` giống callback FE và cho phép URL đó trong Supabase Auth.
Nếu bỏ trống, BE suy ra từ `FRONTEND_URL`, mặc định local cổng 3000.

Lỗi có `error` và `code`/`error_code` khi đến từ dịch vụ auth; không trả nguyên
chi tiết lỗi nội bộ Supabase. HTTP `429` giữ `Retry-After`; lỗi kết nối trả `503`.
Gửi email thật phụ thuộc SMTP/rate limit của project. Các test auth dùng HTTP
Supabase giả lập, không tạo user hoặc gửi email thật.

## Tài liệu API với Scalar

Chạy BE bằng `npm run dev`, sau đó mở [Scalar API Reference](http://localhost:8080/docs).
File OpenAPI JSON ở [http://localhost:8080/openapi.json](http://localhost:8080/openapi.json).
Nếu đổi `PORT`, dùng cổng tương ứng. Trang tài liệu tải giao diện Scalar từ CDN,
còn các request thử API gửi tới chính BE đang mở tài liệu.

Tài liệu gồm health, auth, thư viện công khai, quản trị công trình/người thiết kế
và upload ảnh. Để thử API cần đăng nhập, nhập **access_token của phiên Supabase**
vào Bearer Auth trong Scalar; không nhập publishable key hay secret key. API quản
trị vẫn yêu cầu UUID có quyền admin. Các request tạo/sửa/gỡ/upload thay đổi dữ
liệu thật; token nhập trong Scalar không được cấu hình lưu qua lần tải lại trang.

Spec nằm trong `docs/openapi.js`. Schema request tạo/sửa công trình và tạo người
thiết kế lấy từ Zod trong `validation/projects.js`; khi thêm endpoint hoặc đổi
response/query, cập nhật phần tương ứng trong spec.

Tích hợp theo [tài liệu Scalar cho Express](https://scalar.com/products/api-references/integrations/express).

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
- `POST /api/admin/media/images`: upload một ảnh trong multipart field `image`,
  kèm `alt`, `credit` tùy chọn; trả ID ảnh dạng chuỗi để đưa vào `imageIds`.

Payload tạo công trình gồm `slug`, `name`, `creatorId`, `type`, `style`, `city`.
Các trường tùy chọn: `area`, `floors`, `beds`, `year`, `story`, `status`,
`publishedAt` (ISO date), `imageIds` (mảng ID ảnh dạng chuỗi). Số liệu chưa có
được để `null`. Slug giữ cố định sau khi tạo. Khi chuyển sang `published` mà
chưa đặt thời gian, server dùng thời điểm hiện tại; ngày trong tương lai là hẹn
đăng. `imageIds` xác định thứ tự gallery, ảnh đầu tiên làm bìa.

Trong FE mở `/#/admin/projects`, hoặc vào Tài khoản → Quản lý công trình bằng
tài khoản có UUID trong danh sách admin. Màn hình hỗ trợ tạo người thiết kế,
tạo/sửa/gỡ công trình, tải ảnh và đổi thứ tự ảnh. Trang chủ, danh sách và chi
tiết công trình đọc API thật; database rỗng hiển thị trạng thái chưa có nội dung.

```sh
npm run projects:check
npm test
```

`projects:check` dùng database hiện tại và chỉ đọc dữ liệu. Test CRUD dùng
PostgreSQL tạm qua PGlite và Prisma, không tạo công trình trong Supabase thật.

## Cấu hình Cloudflare R2 cho ảnh công trình

Admin upload ảnh công trình công khai qua BE; thành viên đăng nhập được upload
avatar của chính mình qua `/api/auth/avatar`. Cơ chế ảnh riêng tư cho hồ sơ
người dùng chờ duyệt sẽ được làm cùng luồng submissions.

1. Dùng bucket R2 gốc hiện có, ví dụ `nep-architecture`. Thư mục `nep-media`
   bên trong là prefix của object key, không phải tên bucket.
2. Mở bucket → **Settings → Public Development URL → Enable**, lấy URL
   `https://pub-....r2.dev` để thử local. Production dùng custom domain.
3. Ở trang R2 → **Manage R2 API Tokens**, tạo token **Object Read & Write**
   và giới hạn vào đúng bucket. Lưu **Access Key ID** và **Secret Access Key**.
4. Lấy **Account ID** của tài khoản Cloudflare chứa bucket. Điền vào `.env` BE:

```dotenv
R2_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_SECRET_ACCESS_KEY
R2_MEDIA_BUCKET=YOUR_EXISTING_BUCKET_NAME
R2_MEDIA_PREFIX=nep-media
R2_PUBLIC_BASE_URL=https://pub-YOUR_BUCKET.r2.dev
# Để trống với bucket mặc định; chỉ điền khi cần endpoint riêng theo jurisdiction.
R2_ENDPOINT=
```

Ảnh mới được lưu dưới `nep-media/projects/<UUID>.webp` khi dùng prefix trên.
`R2_PUBLIC_BASE_URL` là URL đọc ảnh công khai của bucket gốc, không nối thêm
`nep-media` vào biến này. Endpoint S3 được BE ghép từ
Account ID, không dùng URL công khai làm endpoint S3. Nếu chọn jurisdiction
riêng, dùng endpoint tương ứng theo tài liệu Cloudflare. Giữ toàn bộ Access Key
ở BE. FE gửi ảnh đến Express nên không cần cấu hình CORS PUT trực tiếp trên R2.

```sh
npm run r2:check
```

Lệnh kiểm tra quyền đọc bucket, không upload hay xóa ảnh. Nếu trả `403`, kiểm
tra Account ID, tên bucket và token được cấp đúng bucket. Khởi động lại BE sau
khi sửa `.env`. Khi chưa cấu hình R2, vẫn có thể lưu nội dung công trình; API
upload báo `503`, giao diện hiển thị khung chờ ảnh.

Ảnh upload giới hạn 10 MB, tối đa 40 megapixel, được giải mã và chuyển WebP
tối đa 2560 px trước khi ghi R2. Database chỉ lưu bucket/key/metadata. Nếu ghi
metadata thất bại, BE thử dọn object vừa upload. Gỡ công trình không xóa object
ảnh; ảnh upload nhưng chưa gắn vào công trình có thể cần dọn sau.

Tham khảo: [R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/),
[Public bucket URL](https://developers.cloudflare.com/r2/buckets/public-buckets/).

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
