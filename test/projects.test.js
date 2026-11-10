const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { once } = require('node:events');
const { before, after, test } = require('node:test');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const { PrismaClient } = require('../generated/prisma');
const { PrismaPg } = require('@prisma/adapter-pg');
const { createPublicProjectsRouter, createAdminProjectsRouter } = require('../routes/projects');
const errorHandler = require('../middleware/error-handler');
const { r2Config } = require('../configuration/r2');

let pg, socket, db, server, base;
const input = { slug: 'test-house', name: 'Nhà thử nghiệm', creatorId: 'studio', type: 'Nhà phố', style: 'Hiện đại', city: 'Hà Nội', area: 180, floors: 2, beds: 3, year: 2025, story: 'Câu chuyện của công trình.' };

before(async () => {
  pg = await PGlite.create();
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);');
  await pg.exec(await readFile('prisma/migrations/20261110000000_init_nep/migration.sql', 'utf8'));
  socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 0, maxConnections: 1 });
  await socket.start();
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1 }, { schema: 'nep' }) });
  await db.creator.create({ data: { id: 'studio', name: 'Studio thử nghiệm', tags: [] } });

  const supabase = { auth: { getUser: async token => token === 'admin' || token === 'member'
    ? { data: { user: { id: token, user_metadata: { role: 'admin' } } }, error: null }
    : { data: null, error: { status: 401 } } } };
  const app = express();
  app.use(express.json());
  app.use('/api/projects', createPublicProjectsRouter(db));
  app.use('/api/admin', createAdminProjectsRouter(db, supabase, async id => id === 'admin' ? 'admin' : 'member'));
  app.use(errorHandler);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await db?.$disconnect();
  await socket?.stop();
  await pg?.close();
});

async function call(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

test('anonymous and ordinary members cannot create projects', async () => {
  assert.equal((await call('/api/admin/projects', { method: 'POST', body: input })).status, 401);
  assert.equal((await call('/api/admin/projects', { method: 'POST', token: 'member', body: input })).status, 403);
  assert.equal(await db.project.count(), 0);
});

test('draft creation, publishing, editing and archiving work through Prisma', async () => {
  const created = await call('/api/admin/projects', { method: 'POST', token: 'admin', body: input });
  assert.equal(created.status, 201);
  assert.equal(created.body.project.status, 'draft');
  assert.equal(created.body.project.area, 180);
  assert.equal((await call('/api/projects/test-house')).status, 404);
  assert.equal((await call('/api/projects')).body.total, 0);

  const published = await call('/api/admin/projects/test-house', { method: 'PATCH', token: 'admin', body: { status: 'published' } });
  assert.equal(published.status, 200);
  assert.ok(published.body.project.publishedAt);
  assert.equal((await call('/api/projects/test-house')).status, 200);
  assert.equal((await call('/api/projects')).body.total, 1);

  const edited = await call('/api/admin/projects/test-house', { method: 'PATCH', token: 'admin', body: { name: 'Nhà đã cập nhật', beds: 0, area: null } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.project.beds, 0);
  assert.equal(edited.body.project.area, null);

  const archived = await call('/api/admin/projects/test-house', { method: 'DELETE', token: 'admin' });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.project.status, 'archived');
  assert.equal((await call('/api/projects/test-house')).status, 404);
  assert.equal((await call('/api/admin/projects/test-house', { token: 'admin' })).status, 200);
  assert.equal((await call('/api/admin/projects/test-house', { method: 'DELETE', token: 'admin' })).status, 200);
});

test('filters, totals, deterministic pagination and publication dates agree', async () => {
  const past = new Date(Date.now() - 86400000);
  const future = new Date(Date.now() + 86400000);
  for (const [slug, area, status, publishedAt] of [
    ['alpha', 100, 'published', past], ['beta', 180, 'published', past],
    ['gamma', 320, 'published', past], ['future', 190, 'published', future], ['private', 200, 'draft', null],
  ]) {
    await db.project.create({ data: { ...input, slug, name: slug, area, status, publishedAt } });
  }
  const first = await call('/api/projects?pageSize=2');
  assert.equal(first.body.total, 3);
  assert.deepEqual(first.body.items.map(p => p.slug), ['alpha', 'beta']);
  const second = await call('/api/projects?pageSize=2&page=2');
  assert.deepEqual(second.body.items.map(p => p.slug), ['gamma']);
  assert.equal((await call('/api/projects?area=medium')).body.total, 1);
  assert.equal((await call('/api/projects?minArea=150&maxArea=250')).body.total, 1);
  assert.equal((await call('/api/projects?q=STUDIO')).body.total, 3);
  const emptyFilters = await call('/api/projects?q=&type=&style=&city=&area=&minArea=&maxArea=&sort=&page=&pageSize=');
  assert.equal(emptyFilters.status, 200);
  assert.equal(emptyFilters.body.total, 3);
  assert.equal((await call('/api/projects?city=H%C3%A0%20N%E1%BB%99i&sort=area')).body.items[0].slug, 'alpha');
  assert.equal((await call('/api/projects/future')).status, 404);
  assert.equal((await call('/api/projects/private')).status, 404);
  const filters = await call('/api/projects/filters');
  assert.deepEqual(filters.body.types, ['Nhà phố']);
  assert.equal((await call('/api/admin/projects?status=draft', { token: 'admin' })).body.total, 1);
});

test('invalid payloads and attempts to control server-owned fields are rejected', async () => {
  for (const body of [{ ...input, slug: 'another', area: -1 }, { ...input, slug: 'another', imageIds: ['abc'] }, { ...input, slug: 'another', userId: 'victim' }, { ...input, slug: 'another', imageIds: ['99999999999999999999999'] }]) {
    assert.equal((await call('/api/admin/projects', { method: 'POST', token: 'admin', body })).status, 400);
  }
  for (const query of ['page=0', 'pageSize=999', 'minArea=300&maxArea=100', 'status=draft', 'sort=sql']) {
    assert.equal((await call('/api/projects?' + query)).status, 400);
  }
  assert.equal((await call('/api/admin/projects/alpha', { method: 'PATCH', token: 'admin', body: { slug: 'changed' } })).status, 400);
  assert.equal((await call('/api/admin/projects/missing', { method: 'PATCH', token: 'admin', body: { name: 'Missing' } })).status, 404);
  assert.equal((await call('/api/admin/projects', { method: 'POST', token: 'admin', body: { ...input, slug: 'alpha' } })).status, 409);
});

test('creator selection and gallery order are validated and changed atomically', async () => {
  const creator = await call('/api/admin/creators', { method: 'POST', token: 'admin', body: { id: 'new-studio', name: 'Người thiết kế mới' } });
  assert.equal(creator.status, 201);
  const images = await Promise.all(['one', 'two'].map(key => db.image.create({ data: { bucket: r2Config().bucket, objectKey: key, mime: 'image/webp', bytes: 10n } })));
  const ids = images.map(image => image.id.toString());
  let result = await call('/api/admin/projects', { method: 'POST', token: 'admin', body: { ...input, slug: 'gallery', creatorId: 'new-studio', imageIds: ids } });
  assert.equal(result.status, 201);
  assert.deepEqual(result.body.project.images.map(image => image.id), ids);
  result = await call('/api/admin/projects/gallery', { method: 'PATCH', token: 'admin', body: { imageIds: ids.toReversed() } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.project.images.map(image => image.id), ids.toReversed());
  assert.equal((await call('/api/admin/projects/gallery', { method: 'PATCH', token: 'admin', body: { name: 'Do not save', imageIds: ['99999'] } })).status, 400);
  assert.equal((await db.project.findUnique({ where: { slug: 'gallery' } })).name, input.name);
  assert.equal((await call('/api/admin/projects/gallery', { method: 'PATCH', token: 'admin', body: { creatorId: 'unknown' } })).status, 400);
  const options = await call('/api/admin/projects/options', { token: 'admin' });
  assert.equal(options.status, 200);
  assert.equal(options.body.creators.length, 2);
});
