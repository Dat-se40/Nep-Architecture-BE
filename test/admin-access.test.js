const assert = require('node:assert/strict');
const test = require('node:test');
const { getAdminIds, getUserRole } = require('../services/admin-access');

const adminId = '11111111-1111-4111-a111-111111111111';
const memberId = '22222222-2222-4222-a222-222222222222';

function options(ids) {
  return {
    projectUrl: 'https://project.example.com',
    secretKey: 'test-only-secret-key',
    fetchImpl: async (url, request) => {
      assert.equal(url.href, 'https://project.example.com/functions/v1/admin-ids');
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.apikey, 'test-only-secret-key');
      assert.equal(request.headers.Authorization, undefined);
      return Response.json(ids);
    },
  };
}

test('assigns admin only to a UUID in the private list', async () => {
  assert.equal(await getUserRole(adminId, options([adminId])), 'admin');
  assert.equal(await getUserRole(memberId, options([adminId])), 'member');
});

test('accepts uppercase UUIDs and surrounding whitespace in the configured list', async () => {
  assert.equal(await getUserRole(adminId, options([` ${adminId.toUpperCase()} `])), 'admin');
});

test('an empty list grants no admin permissions', async () => {
  assert.equal(await getUserRole(adminId, options([])), 'member');
});

for (const ids of [null, { admins: [adminId] }, ['UUID_ADMIN_1'], [adminId, 42]]) {
  test(`rejects an invalid admin list: ${JSON.stringify(ids)}`, async () => {
    await assert.rejects(getAdminIds(options(ids)), /array of UUID/);
  });
}

test('rejects an upstream authentication failure', async () => {
  await assert.rejects(getUserRole(adminId, {
    ...options([]),
    fetchImpl: async () => new Response(null, { status: 401 }),
  }), /HTTP 401/);
});

test('propagates an upstream outage instead of assigning a default role', async () => {
  await assert.rejects(getUserRole(adminId, {
    ...options([]),
    fetchImpl: async () => { throw new Error('Network unavailable'); },
  }), /Network unavailable/);
});
