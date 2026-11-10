const assert = require('node:assert/strict');
const { once } = require('node:events');
const app = require('../app');
const db = require('../configuration/database');

async function check() {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const list = await fetch(`${base}/api/projects?pageSize=1`);
    assert.equal(list.status, 200);
    const data = await list.json();
    assert.ok(Array.isArray(data.items));
    console.log(`Public projects API OK. Published projects: ${data.total}.`);

    const filters = await fetch(`${base}/api/projects/filters`);
    assert.equal(filters.status, 200);
    assert.ok(Array.isArray((await filters.json()).types));
    console.log('Public project filters API OK.');

    const admin = await fetch(`${base}/api/admin/projects`);
    assert.equal(admin.status, 401);
    console.log('Admin projects API rejects unauthenticated requests: HTTP 401.');
  } finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await db.$disconnect();
  }
}

check().catch(error => { console.error('Project API check failed:', error.code || error.message); process.exitCode = 1; });
