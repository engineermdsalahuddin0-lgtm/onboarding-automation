import { createDemoBackend } from './demo';
import { createSupabaseBackend } from './supabase';
import type { Backend } from './types';

export * from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const hasSupabase = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'));

/** Demo mode exists for local review only. A production build without Supabase shows a setup error. */
export const backendMisconfigured = !hasSupabase && !import.meta.env.DEV;

export const backend: Backend = hasSupabase ? createSupabaseBackend(url!, anonKey!) : createDemoBackend();
