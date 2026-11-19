// @ts-check
// Accounts for interviewers, made by an admin from Settings > Team. Making a sign-in needs the service role
// key, so it happens here on the server and never in the browser.
import { createClient } from '@supabase/supabase-js';
import { ParseError } from './ai.js';
import { supabaseEnv } from './env.js';

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/** @param {unknown} value @param {number} max */
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * @param {string | undefined} authHeader
 * @param {any} body
 */
export async function createInterviewer(authHeader, body) {
  const { url, anonKey, serviceKey, configured } = supabaseEnv();
  if (!configured) throw new ParseError(503, 'NOT_CONFIGURED', 'The server is missing its Supabase settings.');
  if (!serviceKey) {
    throw new ParseError(
      503,
      'NO_SERVICE_KEY',
      'This server cannot make accounts: set SUPABASE_SERVICE_ROLE_KEY and restart. Or add the user in Supabase and choose the Interviewer role under Settings > Team.',
    );
  }

  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!token) throw new ParseError(401, 'UNAUTHORIZED', 'Please sign in again.');
  const caller = createClient(url, anonKey, { ...clientOptions, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error } = await caller.auth.getUser(token);
  if (error || !userData.user) throw new ParseError(401, 'UNAUTHORIZED', 'Please sign in again.');
  const { data: me } = await caller.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  if (me?.role !== 'admin') throw new ParseError(403, 'FORBIDDEN', 'Only an admin can add interviewers.');

  const email = text(body?.email, 200).toLowerCase();
  const password = typeof body?.password === 'string' ? body.password : '';
  const fullName = text(body?.full_name, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ParseError(400, 'BAD_EMAIL', 'Write a valid email address. It is the interviewer\'s login ID.');
  if (password.length < 8) throw new ParseError(400, 'WEAK_PASSWORD', 'The password needs at least 8 characters.');
  if (fullName.length < 2) throw new ParseError(400, 'NO_NAME', 'Write the interviewer\'s name.');

  const admin = createClient(url, serviceKey, clientOptions);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    throw new ParseError(400, 'CREATE_FAILED', createError?.message || 'The account could not be made.');
  }
  // The database made the profile as Pending when the account was created; this gives it the interviewer role.
  const { data: profile, error: updateError } = await admin
    .from('profiles')
    .update({ role: 'interviewer', full_name: fullName, job_title: text(body?.job_title, 200), department: text(body?.department, 200) })
    .eq('id', created.user.id)
    .select()
    .single();
  if (updateError) throw new ParseError(500, 'PROFILE_FAILED', updateError.message);
  return { profile };
}
