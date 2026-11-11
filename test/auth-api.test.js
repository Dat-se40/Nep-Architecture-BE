const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');
const createAuthRouter = require('../routes/auth');
const { createAuthService } = require('../services/auth');
const errorHandler = require('../middleware/error-handler');

const user = { id: 'user-one', email: 'one@example.com', identities: [{ provider: 'email' }] };
const session = { access_token: 'fresh-access', refresh_token: 'fresh-refresh', token_type: 'bearer', expires_in: 3600, user };
const json = (body, status = 200, headers) => new Response(JSON.stringify(body), { status, headers });

async function setup(t, upstream = async () => json(session)) {
  const calls = [];
  const service = createAuthService({ url: 'https://auth.example', key: 'public-key', frontendUrl: 'http://localhost:3000', fetch: async (url, options) => {
    calls.push({ url: new URL(url), options, body: options.body ? JSON.parse(options.body) : undefined });
    return upstream(calls.at(-1), calls);
  } });
  const supabase = { auth: { getUser: async token => token === 'user-token' || token === 'second-user-token' ? { data: { user: token === 'user-token' ? user : { ...user, id: 'user-two' } }, error: null } : { data: { user: null }, error: { status: 401 } } } };
  const app = express(); app.use(express.json());
  app.use('/api/auth', createAuthRouter(supabase, async () => 'member', service)); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { calls, request: async (path, body, { token, method = 'POST' } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { response, body: response.status === 204 ? null : response.headers.get('content-type')?.includes('text/html') ? await response.text() : await response.json() };
  } };
}

test('login returns a session without storing it in a shared server client', async t => {
  const { request, calls } = await setup(t);
  const result = await request('login', { email: 'one@example.com', password: 'old123' });
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(result.body, session);
  assert.equal(calls[0].url.searchParams.get('grant_type'), 'password');
  assert.equal(calls[0].options.headers.apikey, 'public-key');
  assert.equal(calls[0].options.headers.Authorization, undefined);
});

test('register forwards PKCE and display name but rejects role injection', async t => {
  const { request, calls } = await setup(t, async () => json(user));
  const input = { email: user.email, password: 'password-123', data: { display_name: 'Bạn Nép' }, code_challenge: 'a'.repeat(43), code_challenge_method: 's256', gotrue_meta_security: {} };
  let result = await request('register', input);
  assert.equal(result.response.status, 201);
  assert.equal(result.body.access_token, undefined);
  assert.deepEqual(calls[0].body, input);
  assert.equal(calls[0].url.searchParams.get('redirect_to'), 'http://localhost:3000/#/auth/callback');
  for (const malicious of [{ ...input, role: 'admin' }, { ...input, data: { display_name: 'Test', role: 'admin' } }, { ...input, code_challenge_method: undefined }]) {
    result = await request('register', malicious);
    assert.equal(result.response.status, 400);
  }
  assert.equal(calls.length, 1);
});

test('email callbacks reject untrusted redirects before contacting Supabase', async t => {
  const { request, calls } = await setup(t, async () => json({}));
  const input = { email: user.email };
  const rejected = await request('forgot-password?redirect_to=https%3A%2F%2Fevil.example%2Fcallback', input);
  assert.equal(rejected.response.status, 400);
  assert.equal(calls.length, 0);
  const accepted = await request('forgot-password?redirect_to=' + encodeURIComponent('http://localhost:3000/#/auth/callback?sb_flow_id=flow-123'), input);
  assert.equal(accepted.response.status, 200);
  assert.equal(calls[0].url.pathname, '/auth/v1/recover');
});

test('forgot and resend preserve the browser-generated PKCE challenge', async t => {
  const { request, calls } = await setup(t, async () => json({}));
  const input = { email: user.email, code_challenge: 'a'.repeat(43), code_challenge_method: 's256' };
  assert.equal((await request('forgot-password', input)).response.status, 200);
  assert.equal((await request('resend-confirmation', { ...input, type: 'signup' })).response.status, 200);
  assert.equal(calls[0].body.code_challenge, input.code_challenge);
  assert.equal(calls[1].url.pathname, '/auth/v1/resend');
  assert.equal((await request('resend-confirmation', { ...input, type: 'email_change' })).response.status, 400);
});

test('callback exchanges the code with its verifier and refresh rotates session tokens', async t => {
  const { request, calls } = await setup(t);
  const input = { auth_code: 'one-use-code', code_verifier: 'v'.repeat(56) };
  assert.equal((await request('callback', input)).response.status, 200);
  assert.deepEqual(calls[0].body, input);
  assert.equal(calls[0].url.searchParams.get('grant_type'), 'pkce');
  assert.equal((await request('refresh', { refresh_token: 'old-refresh' })).body.refresh_token, 'fresh-refresh');
  assert.equal(calls[1].url.searchParams.get('grant_type'), 'refresh_token');
});

test('password and logout reject unauthenticated calls without mutating provider state', async t => {
  const { request, calls } = await setup(t);
  assert.equal((await request('password', { password: 'new-password' }, { method: 'PUT' })).response.status, 401);
  assert.equal((await request('logout', undefined, { token: 'expired' })).response.status, 401);
  assert.equal(calls.length, 0);
});

test('password updates stay bound to the verified caller under concurrent requests', async t => {
  const { request, calls } = await setup(t, async call => json({ id: call.options.headers.Authorization === 'Bearer user-token' ? 'user-one' : 'user-two' }));
  const results = await Promise.all(['user-token', 'second-user-token'].map(token => request('password', { password: 'new-password', code_challenge: null, code_challenge_method: null }, { token, method: 'PUT' })));
  assert.deepEqual(results.map(result => result.body.id), ['user-one', 'user-two']);
  assert.deepEqual(calls.map(call => call.options.headers.Authorization).sort(), ['Bearer second-user-token', 'Bearer user-token']);
  assert.ok(calls.every(call => call.body.password === 'new-password' && !Object.hasOwn(call.body, 'code_challenge')));
  assert.equal((await request('password', { password: 'new-password', userId: 'victim' }, { token: 'user-token', method: 'PUT' })).response.status, 400);
});

test('wrong current password cannot reach the password update endpoint', async t => {
  const { request, calls } = await setup(t, async () => json({ code: 'invalid_credentials', msg: 'Private upstream details' }, 400));
  const result = await request('password', { password: 'new-password', current_password: 'wrong' }, { token: 'user-token', method: 'PUT' });
  assert.equal(result.response.status, 401);
  assert.equal(result.body.code, 'invalid_credentials');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/auth/v1/token');
  assert.equal(JSON.stringify(result.body).includes('Private'), false);
});

test('changing a password verifies the owner and revokes only the temporary verification session', async t => {
  const { request, calls } = await setup(t, async call => call.url.pathname.endsWith('/logout') ? new Response(null, { status: 204 }) : call.url.pathname.endsWith('/user') ? json(user) : json(session));
  const result = await request('password', { password: 'new-password', current_password: 'old-password' }, { token: 'user-token', method: 'PUT' });
  assert.equal(result.response.status, 200);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body.email, user.email);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fresh-access');
  assert.equal(calls[1].url.searchParams.get('scope'), 'local');
  assert.equal(calls[2].options.headers.Authorization, 'Bearer user-token');
});

test('a verification result for another user is rejected and its temporary session cleaned up', async t => {
  const { request, calls } = await setup(t, async call => call.url.pathname.endsWith('/logout') ? new Response(null, { status: 204 }) : json({ ...session, user: { ...user, id: 'another-user' } }));
  const result = await request('password', { password: 'new-password', current_password: 'old-password' }, { token: 'user-token', method: 'PUT' });
  assert.equal(result.response.status, 401);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => !call.url.pathname.endsWith('/user')));
});

test('logout uses the verified token and validates the requested scope', async t => {
  const { request, calls } = await setup(t, async () => new Response(null, { status: 204 }));
  assert.equal((await request('logout', undefined, { token: 'user-token' })).response.status, 204);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer user-token');
  assert.equal(calls[0].url.searchParams.get('scope'), 'local');
  assert.equal((await request('logout?scope=everyone', undefined, { token: 'user-token' })).response.status, 400);
});

test('provider rate limits and outages return safe errors without leaking credentials', async t => {
  let unavailable = false;
  const { request } = await setup(t, async () => {
    if (unavailable) throw new Error('Private endpoint, key and password');
    return json({ code: 'over_email_send_rate_limit', message: 'Private provider details' }, 429, { 'retry-after': '90' });
  });
  let result = await request('forgot-password', { email: user.email });
  assert.equal(result.response.status, 429); assert.equal(result.response.headers.get('retry-after'), '90');
  assert.equal(result.body.error_code, 'over_email_send_rate_limit');
  unavailable = true;
  result = await request('login', { email: user.email, password: 'password' });
  assert.equal(result.response.status, 503);
  assert.equal(JSON.stringify(result.body).includes('Private'), false);
});

test('callback opened with GET has a safe fallback page and fixed links back to the FE', async t => {
  const { request } = await setup(t);
  const result = await request('callback?code=%22%3E%3Cscript%3Ebad%3C%2Fscript%3E&redirect_to=https://evil.example', undefined, { method: 'GET' });
  assert.equal(result.response.status, 200);
  assert.match(result.body, /Mở trang xác nhận/);
  assert.match(result.body, /http:\/\/localhost:3000\//);
  assert.equal(result.body.includes('<script>bad'), false);
  assert.equal(result.body.includes('https://evil.example'), false);
});

test('email token hashes are verified by Supabase and the authenticated user endpoint ignores another userId', async t => {
  const { request, calls } = await setup(t);
  assert.equal((await request('verify-email', { token_hash: 'hash-from-email', type: 'signup' })).response.status, 200);
  assert.equal(calls[0].url.pathname, '/auth/v1/verify');
  assert.equal((await request('verify-email', { token_hash: 'hash-from-email', type: 'email_change' })).response.status, 400);
  const result = await request('user?userId=another-user', undefined, { method: 'GET', token: 'user-token' });
  assert.equal(result.body.id, user.id);
});
