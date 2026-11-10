require('../configuration/environment');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getAdminIds({
  projectUrl = process.env.SUPABASE_URL,
  secretKey = process.env.SUPABASE_SECRET_KEY,
  fetchImpl = fetch,
} = {}) {
  if (!projectUrl || !secretKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY to load admin permissions.');
  }

  const response = await fetchImpl(new URL('/functions/v1/admin-ids', projectUrl), {
    method: 'GET',
    headers: { apikey: secretKey },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Admin list returned HTTP ${response.status}.`);
  }

  const ids = await response.json();
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && UUID.test(id.trim()))) {
    throw new Error('Admin list must be an array of UUID strings.');
  }

  return ids.map(id => id.trim().toLowerCase());
}

async function getUserRole(userId, options) {
  const adminIds = await getAdminIds(options);
  return adminIds.includes(userId.toLowerCase()) ? 'admin' : 'member';
}

module.exports = { getAdminIds, getUserRole };
