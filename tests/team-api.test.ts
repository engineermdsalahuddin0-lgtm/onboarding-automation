import { beforeEach, describe, expect, it, vi } from 'vitest';

// server/team.js against a stand-in for Supabase: who may call it, and what it asks Supabase to do.

const ADMIN = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

const calls: { what: string; args: unknown[] }[] = [];
let profiles: Record<string, { id: string; role: string; email: string }> = {};

/** A tiny query builder: enough of supabase-js's chain for team.js. */
function from(table: string) {
  const state: { filter?: [string, string]; patch?: Record<string, unknown>; head?: boolean } = {};
  const rows = () => Object.values(profiles).filter((p) => !state.filter || (p as any)[state.filter[0]] === state.filter[1]);
  const builder: any = {
    select: (_cols?: string, options?: { head?: boolean }) => { state.head = options?.head; return builder; },
    update: (patch: Record<string, unknown>) => { state.patch = patch; return builder; },
    eq: (column: string, value: string) => { state.filter = [column, value]; return builder; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    single: async () => {
      if (state.patch) {
        calls.push({ what: `${table}.update`, args: [state.filter?.[1], state.patch] });
        for (const row of rows()) Object.assign(row, state.patch);
      }
      return { data: rows()[0] ?? null, error: rows()[0] ? null : { message: 'not found' } };
    },
    then: (resolve: (value: unknown) => void) => resolve({ count: rows().length, data: rows(), error: null }),
  };
  return builder;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from,
    rpc: async (name: string, args: unknown) => { calls.push({ what: `rpc.${name}`, args: [args] }); return { error: null }; },
    auth: {
      getUser: async (token: string) => ({ data: { user: token === 'admin' ? { id: ADMIN } : token === 'hr' ? { id: OTHER } : null }, error: null }),
      admin: {
        createUser: async (attrs: any) => {
          calls.push({ what: 'auth.createUser', args: [attrs] });
          if (Object.values(profiles).some((p) => p.email === attrs.email)) return { data: {}, error: { message: 'A user with this email address has already been registered' } };
          const id = '00000000-0000-4000-8000-0000000000ff';
          profiles[id] = { id, role: 'pending', email: attrs.email };
          return { data: { user: { id } }, error: null };
        },
        updateUserById: async (id: string, attrs: unknown) => { calls.push({ what: 'auth.updateUserById', args: [id, attrs] }); return { error: null }; },
        deleteUser: async (id: string) => { calls.push({ what: 'auth.deleteUser', args: [id] }); delete profiles[id]; return { error: null }; },
      },
    },
  }),
}));

const team = await import('../server/team.js');

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://x.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  calls.length = 0;
  profiles = {
    [ADMIN]: { id: ADMIN, role: 'admin', email: 'admin@x.com' },
    [OTHER]: { id: OTHER, role: 'hr', email: 'hr@x.com' },
  };
});

describe('user accounts on the server', () => {
  it('lets only an admin manage accounts', async () => {
    await expect(team.deleteUser('Bearer hr', ADMIN)).rejects.toThrow(/Only an admin/);
    await expect(team.createUser(undefined, {})).rejects.toThrow(/sign in/);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(team.createUser('Bearer admin', {})).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('creates a login with the role and desk chosen', async () => {
    const { profile } = await team.createUser('Bearer admin', { email: 'Mili@X.com', password: 'secret123', full_name: 'Mili', role: 'hr', desk: 'process' });
    expect(calls[0]).toMatchObject({ what: 'auth.createUser', args: [{ email: 'mili@x.com', email_confirm: true }] });
    expect(profile).toMatchObject({ role: 'hr', desk: 'process', full_name: 'Mili' });
    await expect(team.createUser('Bearer admin', { email: 'hr@x.com', password: 'secret123', full_name: 'Again' })).rejects.toThrow(/already signs in/);
    await expect(team.createUser('Bearer admin', { email: 'x@x.com', password: 'short', full_name: 'X' })).rejects.toThrow(/8 characters/);
    await expect(team.createUser('Bearer admin', { email: 'x@x.com', password: 'secret123', full_name: 'X Y', role: 'boss' })).rejects.toThrow(/role/);
  });

  it('changes the login email and password only when asked', async () => {
    await team.updateUser('Bearer admin', OTHER, { full_name: 'Nafis', email: 'hr@x.com' });
    expect(calls.map((c) => c.what)).toEqual(['profiles.update']);
    calls.length = 0;
    await team.updateUser('Bearer admin', OTHER, { email: 'nafis@x.com', password: 'newpass12' });
    expect(calls[0]).toEqual({ what: 'auth.updateUserById', args: [OTHER, { email: 'nafis@x.com', email_confirm: true, password: 'newpass12' }] });
    expect(profiles[OTHER].email).toBe('nafis@x.com');
  });

  it('releases handovers before deleting, and never deletes yourself or the last admin', async () => {
    await expect(team.deleteUser('Bearer admin', ADMIN)).rejects.toThrow(/your own account/);
    profiles[OTHER].role = 'admin';
    await team.deleteUser('Bearer admin', OTHER);
    expect(calls.map((c) => c.what)).toEqual(['rpc.release_handovers', 'auth.deleteUser']);
    await expect(team.deleteUser('Bearer admin', 'not-an-id')).rejects.toThrow(/not found/);
  });
});
