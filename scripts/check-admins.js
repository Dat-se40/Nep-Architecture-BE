const { randomUUID } = require('node:crypto');
const { getAdminIds, getUserRole } = require('../services/admin-access');

async function check() {
  const ids = await getAdminIds();
  console.log(`Admin Edge Function connection OK. Admin UUIDs: ${ids.length}.`);

  if (ids.length) {
    const role = await getUserRole(ids[0]);
    if (role !== 'admin') throw new Error('An admin UUID did not resolve to admin.');
    console.log('Listed UUID resolves to role: admin.');
  }

  let otherId;
  do { otherId = randomUUID(); } while (ids.includes(otherId));
  const role = await getUserRole(otherId);
  if (role !== 'member') throw new Error('An unlisted UUID did not resolve to member.');
  console.log('Unlisted UUID resolves to role: member.');
}

check().catch((error) => {
  console.error('Admin Edge Function check failed:', error.message);
  process.exitCode = 1;
});
