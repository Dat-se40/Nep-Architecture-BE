const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const express = require('express');
const createAuthRouter = require('../routes/auth');

async function request(t, getUser, authorization, path = '/api/auth/me') {
  const app = express();
  app.use('/api/auth', createAuthRouter({ auth: { getUser } }));

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });

  return { response, body: await response.json() };
}

for (const authorization of [undefined, 'Basic credentials', 'Bearer', 'Bearer one two']) {
  test(`rejects missing or malformed credentials: ${authorization ?? '(missing)'}`, async (t) => {
    let verified = false;
    const { response } = await request(t, async () => { verified = true; }, authorization);
    assert.equal(response.status, 401);
    assert.equal(verified, false);
  });
}

test('uses the verified identity and only returns public identity fields', async (t) => {
  const { response, body } = await request(t, async (token) => {
    assert.equal(token, 'test-access-token');
    return {
      data: { user: { id: 'verified-user', email: 'user@example.com', user_metadata: { role: 'admin' } } },
      error: null,
    };
  }, 'bearer test-access-token', '/api/auth/me?userId=someone-else');

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(body, { user: { id: 'verified-user', email: 'user@example.com' } });
});

test('rejects an invalid or expired token without leaking provider errors', async (t) => {
  const { response, body } = await request(t, async () => ({
    data: { user: null },
    error: { status: 403, message: 'Internal provider details' },
  }), 'Bearer expired-token');

  assert.equal(response.status, 401);
  assert.equal(JSON.stringify(body).includes('Internal provider details'), false);
});

test('rejects a verification response without a user', async (t) => {
  const { response } = await request(t, async () => ({ data: { user: null }, error: null }), 'Bearer token');
  assert.equal(response.status, 401);
});

test('fails closed when the authentication server cannot be reached', async (t) => {
  const { response } = await request(t, async () => { throw new Error('Network unavailable'); }, 'Bearer token');
  assert.equal(response.status, 503);
});

for (const status of [429, 500]) {
  test(`reports provider HTTP ${status} as unavailable`, async (t) => {
    const { response } = await request(t, async () => ({ data: null, error: { status } }), 'Bearer token');
    assert.equal(response.status, 503);
  });
}
