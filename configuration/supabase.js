require('./environment');

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env.');
}

const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: (input, options) => fetch(input, {
      ...options,
      signal: AbortSignal.timeout(10000),
    }),
  },
});

module.exports = supabase;
