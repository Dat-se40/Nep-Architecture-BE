const { z } = require('zod');
const validation = require('../validation/auth');
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const json = schema => ({ 'application/json': { schema } });
const body = (name, example) => ({ required: true, content: { 'application/json': { schema: ref(name), example } } });
const errors = {
  400: 'Dữ liệu không hợp lệ hoặc callback không được cho phép.', 401: 'Sai mật khẩu hoặc access token không hợp lệ.',
  403: 'Yêu cầu bị dịch vụ xác thực từ chối.', 413: 'JSON vượt giới hạn kích thước.',
  422: 'Email hoặc mật khẩu không đáp ứng chính sách Supabase.', 429: 'Vượt giới hạn gửi email hoặc số yêu cầu; xem Retry-After.',
  503: 'Supabase Auth tạm thời không khả dụng.',
};
const responses = success => ({ ...success, ...Object.fromEntries(Object.entries(errors).map(([status, description]) => [status, { description, content: json(ref('Error')) }])) });
const success = (schema, description = 'Thành công.') => ({ description, content: json(schema) });
const bearer = [{ bearerAuth: [] }];
const redirect = [{ name: 'redirect_to', in: 'query', schema: { type: 'string', format: 'uri' }, description: 'Không bắt buộc. Chỉ nhận AUTH_REDIRECT_URL hoặc callback suy ra từ FRONTEND_URL; mặc định local là http://localhost:3000/#/auth/callback.' }];
const pkceNote = 'SDK ở FE tự tạo và giữ code_verifier, gửi code_challenge cùng code_challenge_method=s256. API client tự viết cần quản lý cặp PKCE tương ứng để đổi code ở /api/auth/callback.';
const session = {
  type: 'object', required: ['access_token', 'refresh_token', 'token_type', 'expires_in', 'user'],
  properties: { access_token: { type: 'string' }, refresh_token: { type: 'string' }, token_type: { type: 'string', examples: ['bearer'] }, expires_in: { type: 'integer' }, expires_at: { type: 'integer' }, user: ref('AuthUser') },
};

module.exports = {
  schemas: {
    ...Object.fromEntries(Object.entries({ Register: 'register', Login: 'login', ForgotPassword: 'forgotPassword', ResendConfirmation: 'resendConfirmation', AuthCallback: 'callback', VerifyEmail: 'verifyEmail', RefreshSession: 'refresh', UpdatePassword: 'updatePassword' }).map(([name, key]) => {
      const { $schema, ...schema } = z.toJSONSchema(validation[key], { io: 'input' });
      return [name, schema];
    })),
    AuthUser: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' }, email: { type: ['string', 'null'] }, user_metadata: { type: 'object' }, identities: { type: 'array', items: { type: 'object' } } } },
    AuthSession: session,
  },
  paths: {
    '/api/auth/register': { post: {
      tags: ['Auth'], operationId: 'registerAccount', summary: 'Đăng ký email/mật khẩu', parameters: redirect,
      description: `Không nhận role hay userId từ client. Email xác nhận được gửi bởi Supabase. Khi cần xác nhận, response là user và chưa có access_token; không coi là đã đăng nhập. ${pkceNote}`,
      requestBody: body('Register', { email: 'you@example.com', password: 'Example-password-123', data: { display_name: 'Bạn Nép' } }),
      responses: responses({ 201: success({ oneOf: [ref('AuthUser'), ref('AuthSession')] }, 'User chờ xác nhận hoặc session nếu project tắt xác nhận email.') }),
    } },
    '/api/auth/login': { post: {
      tags: ['Auth'], operationId: 'loginWithPassword', summary: 'Đăng nhập email/mật khẩu',
      description: 'Trả session Supabase. Gọi GET /api/auth/me bằng access_token để lấy role admin/member do BE xác minh.',
      requestBody: body('Login', { email: 'you@example.com', password: 'Example-password-123' }),
      responses: responses({ 200: success(ref('AuthSession')) }),
    } },
    '/api/auth/forgot-password': { post: {
      tags: ['Auth'], operationId: 'requestPasswordReset', summary: 'Gửi email đặt lại mật khẩu', parameters: redirect,
      description: `Thông báo gửi thành công không xác nhận email có tài khoản. ${pkceNote}`,
      requestBody: body('ForgotPassword', { email: 'you@example.com' }), responses: responses({ 200: success({ type: 'object' }, 'Yêu cầu được tiếp nhận; kiểm tra hộp thư nếu tài khoản tồn tại.') }),
    } },
    '/api/auth/resend-confirmation': { post: {
      tags: ['Auth'], operationId: 'resendSignupConfirmation', summary: 'Gửi lại xác nhận đăng ký', parameters: redirect,
      description: pkceNote, requestBody: body('ResendConfirmation', { email: 'you@example.com', type: 'signup' }), responses: responses({ 200: success({ type: 'object' }, 'Yêu cầu được tiếp nhận.') }),
    } },
    '/api/auth/callback': {
      get: { tags: ['Auth'], operationId: 'getAuthCallbackLanding', summary: 'Trang dự phòng khi mở callback bằng trình duyệt', description: 'HTML tĩnh với nút mở FE để hoàn tất code, đăng nhập hoặc về trang chủ; chưa khẳng định xác thực thành công.', responses: { 200: { description: 'Trang hướng dẫn có link quay về FE.', content: { 'text/html': { schema: { type: 'string' } } } } } },
      post: {
      tags: ['Auth'], operationId: 'exchangeAuthCode', summary: 'Đổi code PKCE lấy phiên đăng nhập',
      description: 'Dùng code từ callback xác nhận email, khôi phục mật khẩu hoặc Google. code_verifier phải là giá trị đã tạo ở cùng trình duyệt khi bắt đầu luồng.',
      requestBody: body('AuthCallback', { auth_code: 'CODE_FROM_CALLBACK', code_verifier: 'VERIFIER_SAVED_BY_THE_CLIENT_AT_LEAST_43_CHARS' }), responses: responses({ 200: success(ref('AuthSession')) }),
    } },
    '/api/auth/refresh': { post: {
      tags: ['Auth'], operationId: 'refreshAuthSession', summary: 'Làm mới phiên bằng refresh token',
      description: 'Không cần Bearer vì access token có thể đã hết hạn. SDK quản lý refresh token và lưu token mới.',
      requestBody: body('RefreshSession', { refresh_token: 'YOUR_REFRESH_TOKEN' }), responses: responses({ 200: success(ref('AuthSession')) }),
    } },
    '/api/auth/verify-email': { post: {
      tags: ['Auth'], operationId: 'verifyEmailTokenHash', summary: 'Xác minh token_hash từ email template',
      description: 'Hỗ trợ template Supabase trỏ token_hash về FE; type chỉ nhận signup, email hoặc recovery. Token được Supabase xác minh trước khi trả phiên.',
      requestBody: body('VerifyEmail', { token_hash: 'TOKEN_HASH_FROM_EMAIL', type: 'signup' }), responses: responses({ 200: success(ref('AuthSession')) }),
    } },
    '/api/auth/password': { put: {
      tags: ['Auth'], operationId: 'updateAccountPassword', summary: 'Đổi hoặc đặt lại mật khẩu', security: bearer,
      description: 'Cần access token đã xác minh. Khi đổi mật khẩu trong Cài đặt, gửi current_password để BE xác minh mật khẩu cũ và đúng chủ tài khoản. Sau khi khôi phục bằng email hoặc đặt mật khẩu cho tài khoản Google, gửi password bằng phiên vừa xác thực. Supabase vẫn áp dụng chính sách bảo mật/reauthentication của project.',
      requestBody: body('UpdatePassword', { password: 'New-example-password-123', current_password: 'Old-example-password-123' }), responses: responses({ 200: success(ref('AuthUser'), 'Tài khoản sau cập nhật.') }),
    } },
    '/api/auth/logout': { post: {
      tags: ['Auth'], operationId: 'logoutSession', summary: 'Đăng xuất / thu hồi refresh token', security: bearer,
      description: 'Mặc định local: phiên hiện tại. global: tất cả phiên; others: các phiên khác. Client phải xóa phiên local sau khi đăng xuất. Access token JWT đã phát hành vẫn có thể hợp lệ tới lúc hết hạn.',
      parameters: [{ name: 'scope', in: 'query', schema: { type: 'string', enum: ['local', 'global', 'others'], default: 'local' } }],
      responses: responses({ 204: { description: 'Refresh token của phạm vi đã chọn được thu hồi.' } }),
    } },
    '/api/auth/user': { get: {
      tags: ['Auth'], operationId: 'getVerifiedAuthUser', summary: 'Đọc thông tin Supabase user đã xác minh', security: bearer,
      description: 'Dùng để đồng bộ thông tin và avatar trong phiên FE. Role ứng dụng vẫn lấy qua GET /api/auth/me.',
      responses: responses({ 200: success(ref('AuthUser')) }),
    } },
    '/api/auth/avatar': { post: {
      tags: ['Auth'], operationId: 'uploadAccountAvatar', summary: 'Cập nhật ảnh đại diện của chính mình', security: bearer,
      description: 'Mọi tài khoản đăng nhập đều được dùng. Một ảnh tối đa 5 MiB, JPG/PNG/WebP/AVIF, tối đa 40 megapixel; BE cắt vuông 512×512, chuyển WebP và lưu vào R2. URL được lưu vào user_metadata.avatar_url. Không nhận userId hay URL tùy ý từ client.',
      requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['avatar'], additionalProperties: false, properties: { avatar: { type: 'string', format: 'binary' } } } } } },
      responses: { ...responses({ 200: success({ type: 'object', required: ['user', 'avatarUrl'], properties: { user: ref('AuthUser'), avatarUrl: { type: 'string', format: 'uri' } } }) }), 502: { description: 'Không upload hoặc lưu được ảnh.', content: json(ref('Error')) } },
    } },
  },
};
