// @ts-check
// User accounts, managed by an admin from Settings > Team and the Interviewers page: create a login, change
// its email or password, delete it. These touch Supabase Auth, which needs the service role key, so they
// happen here on the server and never in the browser.
import { createClient } from '@supabase/supabase-js';
import { ParseError } from './ai.js';
import { supabaseEnv } from './env.js';

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

export const ROLES = ['admin', 'hr', 'viewer', 'interviewer', 'pending'];
export const DESKS = ['all', 'screening', 'process'];

/** @param {unknown} value @param {number} max */
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The caller must be a signed-in admin. Returns a service-role client and the caller's id.
 * @param {string | undefined} authHeader
 */
async function asAdmin(authHeader) {
  const { url, anonKey, serviceKey, configured } = supabaseEnv();
  if (!configured) throw new ParseError(503, 'NOT_CONFIGURED', 'The server is missing its Supabase settings.');
  if (!serviceKey) {
    throw new ParseError(
      503,
      'NO_SERVICE_KEY',
      'This server cannot manage logins: set SUPABASE_SERVICE_ROLE_KEY and restart. Until then, add or delete users in Supabase (Authentication > Users).',
    );
  }
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!token) throw new ParseError(401, 'UNAUTHORIZED', 'Please sign in again.');
  const caller = createClient(url, anonKey, { ...clientOptions, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error } = await caller.auth.getUser(token);
  if (error || !userData.user) throw new ParseError(401, 'UNAUTHORIZED', 'Please sign in again.');
  const { data: me } = await caller.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  if (me?.role !== 'admin') throw new ParseError(403, 'FORBIDDEN', 'Only an admin can manage user accounts.');
  return { admin: createClient(url, serviceKey, clientOptions), callerId: userData.user.id };
}

/** @param {any} body */
function checkEmail(body) {
  const email = text(body?.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ParseError(400, 'BAD_EMAIL', 'Write a valid email address. It is the login ID.');
  return email;
}

/** @param {unknown} password */
function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new ParseError(400, 'WEAK_PASSWORD', 'The password needs at least 8 characters.');
  return password;
}

/** The profile fields an admin sets, checked. Only those present in the body. @param {any} body */
function profileFields(body) {
  /** @type {Record<string, string>} */
  const fields = {};
  if (body?.full_name !== undefined) {
    fields.full_name = text(body.full_name, 200);
    if (fields.full_name.length < 2) throw new ParseError(400, 'NO_NAME', 'Write the person\'s name.');
  }
  if (body?.job_title !== undefined) fields.job_title = text(body.job_title, 200);
  if (body?.department !== undefined) fields.department = text(body.department, 200);
  if (body?.role !== undefined) {
    if (!ROLES.includes(body.role)) throw new ParseError(400, 'BAD_ROLE', 'Choose a role.');
    fields.role = body.role;
  }
  if (body?.desk !== undefined) {
    if (!DESKS.includes(body.desk)) throw new ParseError(400, 'BAD_DESK', 'Choose a desk.');
    fields.desk = body.desk;
  }
  return fields;
}

/** Supabase's messages, in words an admin can act on. @param {string | undefined} message */
function authMessage(message) {
  if (message && /already (been )?registered|already exists/i.test(message)) return 'Someone already signs in with this email.';
  return message || 'The login could not be saved.';
}

/** @param {unknown} id */
function checkId(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new ParseError(400, 'BAD_ID', 'This user was not found.');
  return id;
}

/**
 * A new login with any role. The database makes the profile as Pending; this then sets its details.
 * @param {string | undefined} authHeader
 * @param {any} body
 */
export async function createUser(authHeader, body) {
  const { admin } = await asAdmin(authHeader);
  const email = checkEmail(body);
  const password = checkPassword(body?.password);
  const fields = profileFields({ role: 'hr', desk: 'all', ...body, full_name: body?.full_name ?? '' });
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fields.full_name },
  });
  if (error || !created.user) throw new ParseError(400, 'CREATE_FAILED', authMessage(error?.message));
  const { data: profile, error: updateError } = await admin.from('profiles').update(fields).eq('id', created.user.id).select().single();
  if (updateError) throw new ParseError(500, 'PROFILE_FAILED', updateError.message);
  return { profile };
}

/** Kept for the Add interviewer button: a new login with the interviewer role. */
export const createInterviewer = (/** @type {string | undefined} */ authHeader, /** @type {any} */ body) =>
  createUser(authHeader, { ...body, role: 'interviewer', desk: 'all' });

/**
 * Changes a person's details, and their login email or password when given.
 * @param {string | undefined} authHeader
 * @param {unknown} rawId
 * @param {any} body
 */
export async function updateUser(authHeader, rawId, body) {
  const { admin } = await asAdmin(authHeader);
  const id = checkId(rawId);
  const fields = profileFields(body);
  /** @type {{ email?: string; email_confirm?: boolean; password?: string }} */
  const login = {};
  if (body?.email !== undefined) {
    const { data: current } = await admin.from('profiles').select('email').eq('id', id).maybeSingle();
    const email = checkEmail(body);
    if (email !== (current?.email ?? '').toLowerCase()) {
      login.email = email;
      login.email_confirm = true;
      fields.email = email;
    }
  }
  if (body?.password) login.password = checkPassword(body.password);
  if (Object.keys(login).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(id, login);
    if (error) throw new ParseError(400, 'LOGIN_FAILED', authMessage(error.message));
  }
  const { data: profile, error } = Object.keys(fields).length > 0
    ? await admin.from('profiles').update(fields).eq('id', id).select().single()
    : await admin.from('profiles').select().eq('id', id).single();
  if (error) throw new ParseError(400, 'PROFILE_FAILED', error.message);
  return { profile };
}

/**
 * Deletes a login and its profile. What the person did stays on record under their name. Candidates handed
 * to them go back to the rest of the people they were handed to, or to the whole process team.
 * @param {string | undefined} authHeader
 * @param {unknown} rawId
 */
export async function deleteUser(authHeader, rawId) {
  const { admin, callerId } = await asAdmin(authHeader);
  const id = checkId(rawId);
  if (id === callerId) throw new ParseError(400, 'SELF', 'You cannot delete your own account. Ask another admin.');
  const { data: person } = await admin.from('profiles').select('role').eq('id', id).maybeSingle();
  if (person?.role === 'admin') {
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
    if ((count ?? 0) <= 1) throw new ParseError(400, 'LAST_ADMIN', 'At least one admin account must remain.');
  }
  const { error: handError } = await admin.rpc('release_handovers', { p_user: id });
  if (handError) throw new ParseError(500, 'HANDOVER_FAILED', handError.message);
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw new ParseError(400, 'DELETE_FAILED', error.message);
  return { ok: true };
}
