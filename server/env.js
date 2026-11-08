// @ts-check
// One place that reads the Supabase settings on the server. Besides our own VITE_ names it accepts the
// names Vercel's Supabase integration creates, so connecting the integration is enough on its own.

/** @param {string[]} names */
function first(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

export function supabaseEnv() {
  const url = first(['VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const anonKey = first([
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]);
  const serviceKey = first(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']);
  const configured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'));
  return { url, anonKey, serviceKey, configured };
}
