const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const { before, after } = require('node:test');
const express = require('express');
const sharp = require('sharp');
const { uploadAvatar } = require('../services/avatar');
const { r2Config } = require('../configuration/r2');
const createAuthRouter = require('../routes/auth');
const errorHandler = require('../middleware/error-handler');

const user = { id: '11111111-1111-4111-a111-111111111111', email: 'avatar@example.com' };
const previousPublicUrl = process.env.R2_PUBLIC_BASE_URL;
before(() => { process.env.R2_PUBLIC_BASE_URL = 'https://media.example'; });
after(() => { if (previousPublicUrl === undefined) delete process.env.R2_PUBLIC_BASE_URL; else process.env.R2_PUBLIC_BASE_URL = previousPublicUrl; });
const original = () => sharp({ create: { width: 700, height: 300, channels: 3, background: '#a19375' } }).png().toBuffer();

test('avatars become square WebP files and metadata updates target only the verified owner', async () => {
  const commands = [];
  let updatedUrl;
  const result = await uploadAvatar(user, 'owner-token', { buffer: await original() }, {
    updateAvatar: async (token, url) => {
      assert.equal(token, 'owner-token'); updatedUrl = url;
      return { body: { ...user, user_metadata: { avatar_url: url, display_name: 'Nép' } } };
    },
  }, { send: async command => { commands.push(command); } });
  const uploaded = commands[0].input;
  assert.equal(uploaded.Bucket, r2Config().bucket);
  assert.ok(('/' + uploaded.Key).includes(`/avatars/${user.id}/`));
  const info = await sharp(uploaded.Body).metadata();
  assert.equal(info.width, 512); assert.equal(info.height, 512); assert.equal(info.format, 'webp'); assert.equal(info.exif, undefined);
  assert.equal(result.avatarUrl, updatedUrl); assert.equal(result.user.id, user.id);
});

test('invalid avatars never reach storage or the user metadata API', async () => {
  let stored = false;
  await assert.rejects(uploadAvatar(user, 'owner-token', { buffer: Buffer.from('fake image') }, {}, { send: async () => { stored = true; } }), error => error.status === 400);
  assert.equal(stored, false);
});

test('metadata failure removes only the avatar created by this request', async () => {
  const commands = [];
  await assert.rejects(uploadAvatar(user, 'owner-token', { buffer: await original() }, { updateAvatar: async () => { throw new Error('Metadata unavailable'); } }, { send: async command => { commands.push(command); } }), /Metadata unavailable/);
  assert.equal(commands.length, 2); assert.equal(commands[1].constructor.name, 'DeleteObjectCommand');
  assert.equal(commands[0].input.Key, commands[1].input.Key); assert.equal(commands[0].input.Bucket, commands[1].input.Bucket);
});

test('storage failure cannot update the avatar metadata', async () => {
  let updated = false;
  await assert.rejects(uploadAvatar(user, 'owner-token', { buffer: await original() }, { updateAvatar: async () => { updated = true; } }, { send: async () => { throw new Error('R2 failure'); } }), error => error.status === 502);
  assert.equal(updated, false);
});

test('mismatched metadata response is rejected and the temporary object removed', async () => {
  const commands = [];
  await assert.rejects(uploadAvatar(user, 'owner-token', { buffer: await original() }, { updateAvatar: async () => ({ body: { id: 'another-user' } }) }, { send: async command => { commands.push(command); } }), error => error.status === 502);
  assert.equal(commands.length, 2);
});

test('a member can upload their avatar while unauthenticated and spoofed userId requests are rejected', async t => {
  let uploaded = 0;
  const supabase = { auth: { getUser: async token => token === 'member-token' ? { data: { user }, error: null } : { data: null, error: { status: 401 } } } };
  const app = express(); app.use(express.json());
  app.use('/api/auth', createAuthRouter(supabase, async () => { throw new Error('Avatar must not require admin role'); }, {}, async (verified, token, file) => {
    uploaded++; assert.equal(verified.id, user.id); assert.equal(token, 'member-token'); assert.ok(file.buffer);
    return { user: verified, avatarUrl: 'https://media.example/avatar.webp' };
  })); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const body = () => { const form = new FormData(); form.append('avatar', new Blob(['image'], { type: 'image/png' }), 'avatar.png'); return form; };
  assert.equal((await fetch(base + '/avatar', { method: 'POST', body: body() })).status, 401);
  assert.equal((await fetch(base + '/avatar', { method: 'POST', headers: { Authorization: 'Bearer member-token' }, body: body() })).status, 200);
  const spoof = body(); spoof.append('userId', 'another-user');
  assert.equal((await fetch(base + '/avatar', { method: 'POST', headers: { Authorization: 'Bearer member-token' }, body: spoof })).status, 400);
  const large = new FormData(); large.append('avatar', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
  assert.equal((await fetch(base + '/avatar', { method: 'POST', headers: { Authorization: 'Bearer member-token' }, body: large })).status, 413);
  assert.equal(uploaded, 1);
});
