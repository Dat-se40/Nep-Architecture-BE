const { z } = require('zod');
const parameters = z.object({
  code: z.string().max(4096).optional(), error: z.string().max(120).optional(),
  error_code: z.string().max(120).optional(), sb_flow_id: z.string().max(128).optional(),
  token_hash: z.string().max(4096).optional(), type: z.enum(['signup', 'email', 'recovery']).optional(),
}).passthrough();
const escape = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function authLanding(frontendCallbackUrl) {
  return (req, res) => {
    const parsed = parameters.safeParse(req.query);
    const input = parsed.success ? parsed.data : { error: 'invalid_callback' };
    const callback = new URL(frontendCallbackUrl);
    for (const key of ['code', 'error', 'error_code', 'sb_flow_id', 'token_hash', 'type']) if (input[key]) callback.searchParams.set(key, input[key]);
    const home = new URL(frontendCallbackUrl); home.hash = '/';
    const login = new URL(frontendCallbackUrl); login.hash = '/login';
    res.set('Referrer-Policy', 'no-referrer');
    res.type('html').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hoàn tất xác nhận — Nép</title><style>body{margin:0;background:#f8f6f0;color:#292720;font:16px/1.7 system-ui}main{max-width:540px;margin:12vh auto;padding:32px}h1{font:36px Georgia,serif}a{color:inherit}.button{display:block;padding:14px 18px;margin:24px 0;background:#534b3d;color:white;text-align:center;text-decoration:none}nav{display:flex;gap:24px;flex-wrap:wrap}</style></head><body><main><a href="${escape(home.href)}">nép.</a><h1>Quay lại Nép để tiếp tục.</h1><p>Liên kết email đã mở tới máy chủ xác thực. Bấm bên dưới để kiểm tra kết quả và hoàn tất trên website.</p><a class="button" rel="noreferrer" href="${escape(callback.href)}">Mở trang xác nhận</a><nav><a href="${escape(login.href)}">Về đăng nhập</a><a href="${escape(home.href)}">Về trang chủ</a></nav><p>Nếu link đã hết hạn hoặc được mở ở trình duyệt khác, bạn có thể đăng nhập để kiểm tra tài khoản hoặc yêu cầu email mới.</p></main></body></html>`);
  };
}
module.exports = authLanding;
