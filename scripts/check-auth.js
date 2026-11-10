require('../configuration/supabase');

async function check() {
  const response = await fetch(new URL('/auth/v1/settings', process.env.SUPABASE_URL), {
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Supabase Auth returned HTTP ${response.status}. Check the project URL and publishable key.`);
  }

  const settings = await response.json();
  console.log('Supabase Auth connection OK.');
  console.log(`Google sign-in: ${settings.external?.google ? 'enabled' : 'disabled'}.`);
}

check().catch((error) => {
  console.error('Supabase Auth check failed:', error.message);
  process.exitCode = 1;
});
