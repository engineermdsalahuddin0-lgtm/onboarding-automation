import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

/** The browser needs the Supabase URL and anon key. Vercel's Supabase integration names them differently. */
function firstOf(env: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return '';
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>;
  const supabaseUrl = firstOf(env, ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const supabaseAnonKey = firstOf(env, [
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]);
  // Vercel functions refuse a request body over 4.5 MB; Vercel sets VERCEL=1 while it builds.
  const aiMaxRequestBytes = env.VITE_AI_MAX_REQUEST_BYTES || (env.VERCEL ? '4000000' : '21000000');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'import.meta.env.VITE_AI_MAX_REQUEST_BYTES': JSON.stringify(aiMaxRequestBytes),
    },
    server: {
      watch: { ignored: ['**/tests/.tmp/**', '**/archive/**', '**/recruitment-data/**'] },
    },
    build: {
      chunkSizeWarningLimit: 1500,
    },
  };
});
