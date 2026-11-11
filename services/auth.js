require('../configuration/environment');
const HttpError = require('../lib/http-error');

const messages = {
  invalid_credentials: 'Email hoặc mật khẩu chưa đúng.',
  email_not_confirmed: 'Bạn cần xác nhận email trước khi đăng nhập.',
  user_already_exists: 'Email đã có tài khoản. Bạn đăng nhập hoặc đặt lại mật khẩu nhé.',
  weak_password: 'Mật khẩu chưa đủ mạnh.',
  same_password: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
  email_address_invalid: 'Địa chỉ email chưa hợp lệ.',
  email_address_not_authorized: 'Dịch vụ email chưa cho phép gửi tới địa chỉ này.',
  signup_disabled: 'Đăng ký hiện chưa được bật.',
  email_provider_disabled: 'Đăng nhập email hiện chưa được bật.',
  over_email_send_rate_limit: 'Bạn yêu cầu email quá nhanh. Vui lòng thử lại sau.',
  over_request_rate_limit: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
  flow_state_expired: 'Liên kết xác thực đã hết hạn. Bạn yêu cầu link mới nhé.',
  flow_state_not_found: 'Liên kết xác thực không hợp lệ hoặc đã được sử dụng.',
  bad_code_verifier: 'Không xác minh được PKCE. Mở link bằng trình duyệt đã gửi yêu cầu.',
  refresh_token_not_found: 'Phiên đăng nhập đã hết hạn. Bạn đăng nhập lại nhé.',
  refresh_token_already_used: 'Phiên đăng nhập không còn hợp lệ. Bạn đăng nhập lại nhé.',
  reauthentication_needed: 'Bạn cần xác thực lại trước khi đổi mật khẩu.',
  reauthentication_not_valid: 'Mã xác thực lại chưa hợp lệ.',
  session_not_found: 'Phiên đăng nhập không còn hợp lệ.',
};

class AuthError extends HttpError {
  constructor(status, code, retryAfter) {
    super(status, messages[code] || (status === 503 ? 'Dịch vụ xác thực tạm thời không khả dụng.' : 'Không thực hiện được yêu cầu xác thực.'));
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function createAuthService({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY, frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000', redirectUrl = process.env.AUTH_REDIRECT_URL, fetch: request = (...args) => fetch(...args) } = {}) {
  const callbackUrl = redirectUrl || `${frontendUrl.replace(/\/+$/, '')}/#/auth/callback`;

  function redirect(requested) {
    if (!requested) return callbackUrl;
    const value = new URL(requested);
    // The SDK may append a non-secret PKCE flow selector to the callback.
    const hash = value.hash.split('?');
    const hashQuery = new URLSearchParams(hash[1] || '');
    const selectors = [value.searchParams.get('sb_flow_id'), hashQuery.get('sb_flow_id')].filter(Boolean);
    if (selectors.some(id => !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw new HttpError(400, 'PKCE flow ID không hợp lệ.');
    value.searchParams.delete('sb_flow_id'); hashQuery.delete('sb_flow_id');
    value.hash = hash[0] + (hashQuery.size ? `?${hashQuery}` : '');
    if (value.href !== new URL(callbackUrl).href) throw new HttpError(400, 'redirect_to phải là callback FE đã cấu hình.');
    return requested;
  }

  async function send(path, { method = 'POST', body, token, query } = {}) {
    if (!url || !key) throw new AuthError(503, 'auth_unavailable');
    const endpoint = new URL(`${url.replace(/\/+$/, '')}/auth/v1/${path}`);
    for (const [name, value] of Object.entries(query || {})) endpoint.searchParams.set(name, value);
    let response, data;
    try {
      response = await request(endpoint, {
        method, headers: { apikey: key, 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
      });
      data = response.status === 204 ? null : await response.json();
    } catch { throw new AuthError(503, 'auth_unavailable'); }
    if (!response.ok) {
      const status = response.status >= 500 ? 503 : response.status === 429 ? 429 : data?.code === 'invalid_credentials' ? 401 : [400, 401, 403, 404, 422].includes(response.status) ? response.status : 400;
      const code = status === 503 ? 'auth_unavailable' : Object.hasOwn(messages, data?.code) ? data.code : status === 429 ? 'over_request_rate_limit' : 'auth_failed';
      const retry = response.headers.get('retry-after');
      throw new AuthError(status, code, status === 429 ? /^\d{1,4}$/.test(retry || '') ? retry : '60' : undefined);
    }
    return { status: response.status, body: data };
  }

  async function updatePassword(token, user, input) {
    if (input.current_password !== undefined) {
      if (!user.email) throw new AuthError(400, 'invalid_credentials');
      if (input.current_password === input.password) throw new AuthError(400, 'same_password');
      const verified = await send('token', { query: { grant_type: 'password' }, body: { email: user.email, password: input.current_password } });
      try {
        if (verified.body?.user?.id !== user.id) throw new AuthError(401, 'invalid_credentials');
      } finally {
        // Revoke only the temporary session made by this verification.
        if (verified.body?.access_token) await send('logout', { token: verified.body.access_token, query: { scope: 'local' } });
      }
    }
    const { code_challenge, code_challenge_method, ...attributes } = input;
    return send('user', { method: 'PUT', token, body: attributes });
  }

  return {
    frontendCallbackUrl: `${frontendUrl.replace(/\/+$/, '')}/#/auth/callback`,
    register: (input, requested) => send('signup', { body: input, query: { redirect_to: redirect(requested) } }),
    login: input => send('token', { body: input, query: { grant_type: 'password' } }),
    forgotPassword: (input, requested) => send('recover', { body: input, query: { redirect_to: redirect(requested) } }),
    resendConfirmation: (input, requested) => send('resend', { body: input, query: { redirect_to: redirect(requested) } }),
    callback: input => send('token', { body: input, query: { grant_type: 'pkce' } }),
    verifyEmail: input => send('verify', { body: input }),
    refresh: input => send('token', { body: input, query: { grant_type: 'refresh_token' } }),
    updatePassword,
    updateAvatar: (token, avatarUrl) => send('user', { method: 'PUT', token, body: { data: { avatar_url: avatarUrl } } }),
    logout: (token, scope) => send('logout', { token, query: { scope } }),
  };
}

module.exports = { createAuthService, AuthError };
