import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDemoData } from '../src/lib/backend/seed';

// Runs the real schema.sql in an embedded Postgres, with the small part of Supabase it depends on
// stubbed out (auth, storage, roles), then checks the security rules as each kind of user.

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

const ADMIN = '00000000-0000-4000-8000-000000000001';
const HR = '00000000-0000-4000-8000-000000000002';
const VIEWER = '00000000-0000-4000-8000-000000000003';
const STRANGER = '00000000-0000-4000-8000-000000000004';

let db: PGlite;

async function as<T = any>(user: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.sub', $1, false)`, [user ?? '']);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.sub', '', false)`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  await db.exec(schema);
  // Running it a second time must be harmless: the user may re-run it after an update.
  await db.exec(schema);

  for (const [id, email] of [[ADMIN, 'admin@x.com'], [HR, 'hr@x.com'], [VIEWER, 'viewer@x.com'], [STRANGER, 'new@x.com']]) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  }
  await db.query(`update public.profiles set role = 'hr' where id = $1`, [HR]);
  await db.query(`update public.profiles set role = 'viewer' where id = $1`, [VIEWER]);
}, 60_000);

async function makeBucket(code: string) {
  const [req] = await as(HR, `insert into requisitions (designation) values ('Jr. Executive') returning id, ref_no`);
  expect(req.ref_no).toMatch(/^REQ-\d{4}-\d{4}$/);
  const [bucket] = await as(
    HR,
    `insert into cv_buckets (designation, department, requisition_id, code) values ('Jr. Executive', 'HR & Admin', $1, $2) returning id`,
    [req.id, code],
  );
  return bucket.id as string;
}

async function addCandidate(bucketId: string, name = 'Test Person') {
  const [row] = await as(HR, `insert into candidates (bucket_id, full_name, phone) values ($1, $2, '01711234567') returning id`, [bucketId, name]);
  return row.id as string;
}

describe('accounts', () => {
  it('makes the first account admin and holds later accounts as pending', async () => {
    const rows = await db.query<{ id: string; role: string }>('select id, role from public.profiles');
    expect(rows.rows.find((r) => r.id === ADMIN)?.role).toBe('admin');
    expect(rows.rows.find((r) => r.id === STRANGER)?.role).toBe('pending');
  });

  it('does not let a user promote themselves', async () => {
    await as(STRANGER, `update profiles set role = 'admin' where id = $1`, [STRANGER]);
    const [row] = await db.query<{ role: string }>('select role from public.profiles where id = $1', [STRANGER]).then((r) => r.rows);
    expect(row.role).toBe('pending');
  });

  it('keeps at least one admin', async () => {
    await expect(as(ADMIN, `update profiles set role = 'hr' where id = $1`, [ADMIN])).rejects.toThrow(/admin/);
  });
});

describe('who can see candidate data', () => {
  let bucket: string;
  beforeAll(async () => {
    bucket = await makeBucket('sec-bucket');
    await addCandidate(bucket);
  });

  it('hides everything from anonymous visitors', async () => {
    expect(await as(null, 'select * from candidates')).toEqual([]);
    expect(await as(null, 'select * from cv_buckets')).toEqual([]);
    expect(await as(null, 'select * from candidate_reviews')).toEqual([]);
    expect(await as(null, 'select * from settings')).toEqual([]);
  });

  it('hides everything from accounts not yet approved', async () => {
    expect(await as(STRANGER, 'select * from candidates')).toEqual([]);
    expect(await as(STRANGER, 'select * from requisitions')).toEqual([]);
  });

  it('blocks anonymous inserts', async () => {
    await expect(as(null, `insert into candidates (bucket_id, full_name) values ($1, 'Bot')`, [bucket])).rejects.toThrow(/row-level security/);
  });

  it('lets viewers read but not write', async () => {
    expect((await as(VIEWER, 'select id from candidates')).length).toBeGreaterThan(0);
    await expect(as(VIEWER, `insert into candidates (bucket_id, full_name) values ($1, 'X')`, [bucket])).rejects.toThrow(/row-level security/);
  });

  it('lets only admins delete candidates', async () => {
    const id = await addCandidate(bucket, 'To Delete');
    await as(HR, 'delete from candidates where id = $1', [id]);
    expect((await as(HR, 'select id from candidates where id = $1', [id])).length).toBe(1);
    await as(ADMIN, 'delete from candidates where id = $1', [id]);
    expect((await as(HR, 'select id from candidates where id = $1', [id])).length).toBe(0);
  });

  it('refuses to delete a bucket that still holds candidates', async () => {
    await expect(as(ADMIN, 'delete from cv_buckets where id = $1', [bucket])).rejects.toThrow(/foreign key/);
  });
});

describe('AI key', () => {
  it('can be set by an admin but never read back', async () => {
    await expect(as(HR, `select set_ai_key('secret-key-1234')`)).rejects.toThrow(/admin/);
    const [{ set_ai_key: status }] = await as(ADMIN, `select set_ai_key('secret-key-1234')`);
    expect(status).toEqual({ configured: true, last4: '1234' });
    expect(await as(ADMIN, 'select * from app_secrets')).toEqual([]);
    expect(await as(HR, 'select * from app_secrets')).toEqual([]);
    expect(await as(null, 'select * from app_secrets')).toEqual([]);
    await expect(as(null, `select set_ai_key('x')`)).rejects.toThrow(/permission denied/);
    await as(ADMIN, `select set_ai_key('')`);
  });
});

describe('pipeline rules in the database', () => {
  let bucket: string;
  beforeAll(async () => {
    bucket = await makeBucket('rule-bucket');
  });

  it('rejects a status that skips a stage', async () => {
    const id = await addCandidate(bucket);
    await expect(as(HR, `update candidates set call_status = 'confirm' where id = $1`, [id])).rejects.toThrow(/call_needs_shortlist/);
    await as(HR, `update candidates set screening_status = 'shortlisted' where id = $1`, [id]);
    await expect(as(HR, `update candidates set message_status = 'message_done' where id = $1`, [id])).rejects.toThrow(/message_needs_confirm/);
    await expect(as(HR, `update candidates set secondary_status = 'selected', selection_category = 'merit' where id = $1`, [id])).rejects.toThrow(/secondary_needs_primary/);
  });

  it('writes an audit trail with the user name and stamps the selection time', async () => {
    const id = await addCandidate(bucket);
    await as(HR, `update candidates set screening_status = 'shortlisted' where id = $1`, [id]);
    const events = await as(HR, `select field, from_value, to_value, actor_name from candidate_events where candidate_id = $1 order by created_at`, [id]);
    expect(events.map((e) => e.field)).toEqual(expect.arrayContaining(['received', 'screening_status']));
    expect(events.find((e) => e.field === 'screening_status')).toMatchObject({ from_value: 'new', to_value: 'shortlisted', actor_name: 'hr' });

    await as(HR, `update candidates set call_status = 'confirm' where id = $1`, [id]);
    await as(HR, `update candidates set message_status = 'message_done' where id = $1`, [id]);
    await as(HR, `update candidates set primary_status = 'selected' where id = $1`, [id]);
    const [selected] = await as(HR, `update candidates set secondary_status = 'selected', selection_category = 'merit' where id = $1 returning selected_at`, [id]);
    expect(selected.selected_at).not.toBeNull();
    const listEvents = await as(HR, `select to_value from candidate_events where candidate_id = $1 and field = 'selection_category'`, [id]);
    expect(listEvents.map((e) => e.to_value)).toEqual(['merit']);
    const [undone] = await as(HR, `update candidates set secondary_status = 'pending', selection_category = null where id = $1 returning selected_at`, [id]);
    expect(undone.selected_at).toBeNull();
  });

  async function atFinalInterview() {
    const id = await addCandidate(bucket);
    await as(HR, `update candidates set screening_status = 'shortlisted', call_status = 'confirm', message_status = 'message_done', primary_status = 'selected', secondary_status = 'scheduled' where id = $1`, [id]);
    return id;
  }

  it('makes every selected candidate choose a list, and nobody else', async () => {
    const id = await atFinalInterview();
    await expect(as(HR, `update candidates set secondary_status = 'selected' where id = $1`, [id])).rejects.toThrow(/category_needs_selection/);
    await expect(as(HR, `update candidates set selection_category = 'merit' where id = $1`, [id])).rejects.toThrow(/category_needs_selection/);
    await expect(as(HR, `update candidates set secondary_status = 'selected', selection_category = 'reserve' where id = $1`, [id])).rejects.toThrow(/selection_category_values/);
  });

  it('keeps offers from the waiting list until someone is moved to merit', async () => {
    const id = await atFinalInterview();
    await as(HR, `update candidates set secondary_status = 'selected', selection_category = 'waiting' where id = $1`, [id]);
    await expect(as(HR, `update candidates set joining_status = 'offer_sent' where id = $1`, [id])).rejects.toThrow(/offer_needs_merit/);
    await as(HR, `update candidates set selection_category = 'merit' where id = $1`, [id]);
    const [row] = await as(HR, `update candidates set joining_status = 'offer_sent' where id = $1 returning joining_status`, [id]);
    expect(row.joining_status).toBe('offer_sent');
    await expect(as(HR, `update candidates set selection_category = 'waiting' where id = $1`, [id])).rejects.toThrow(/offer_needs_merit/);
  });

  it('stores a panel of interviewers and a fractional average', async () => {
    const id = await atFinalInterview();
    const panel = [{ name: 'A', score: 8, referred: true }, { name: 'B', score: 7, referred: false }];
    const [row] = await as(HR, `update candidates set primary_panel = $1::jsonb, primary_score = 7.5 where id = $2 returning primary_panel, primary_score`, [JSON.stringify(panel), id]);
    expect(row.primary_panel).toEqual(panel);
    expect(Number(row.primary_score)).toBe(7.5);
    await expect(as(HR, `update candidates set primary_score = 11 where id = $1`, [id])).rejects.toThrow(/primary_score/);
  });

  async function selected(category = 'merit') {
    const id = await atFinalInterview();
    await as(HR, `update candidates set secondary_status = 'selected', selection_category = $2 where id = $1`, [id, category]);
    return id;
  }
  const CONFIRM = `final_decision = 'confirmed', decision_date = '2026-11-13', decision_time = '16:00', joining_date = '2026-12-01', joining_time = '09:00', joining_status = 'offer_sent'`;
  const REJECT = `final_decision = 'rejected', decision_date = '2026-11-13', decision_time = '16:00', informed_date = '2026-11-14', informed_time = '10:00', secondary_status = 'rejected', selection_category = null`;

  it('records a confirmation with both days and refuses an incomplete one', async () => {
    const id = await selected();
    await expect(as(HR, `update candidates set final_decision = 'confirmed', joining_status = 'offer_sent' where id = $1`, [id])).rejects.toThrow(/confirmed_needs_details/);
    await expect(as(HR, `update candidates set final_decision = 'approved' where id = $1`, [id])).rejects.toThrow(/final_decision_values/);
    const [row] = await as(HR, `update candidates set ${CONFIRM} where id = $1 returning final_decision, decision_time, joining_time`, [id]);
    expect(row).toEqual({ final_decision: 'confirmed', decision_time: '16:00', joining_time: '09:00' });
    const events = await as(HR, `select to_value from candidate_events where candidate_id = $1 and field = 'final_decision'`, [id]);
    expect(events.map((e) => e.to_value)).toEqual(['confirmed']);
  });

  it('refuses a confirmation for the waiting list', async () => {
    const id = await selected('waiting');
    await expect(as(HR, `update candidates set ${CONFIRM} where id = $1`, [id])).rejects.toThrow(/offer_needs_merit|confirmed_needs_details/);
  });

  it('locks the whole process after a confirmation, for HR and admin alike', async () => {
    const id = await selected();
    await as(HR, `update candidates set ${CONFIRM} where id = $1`, [id]);
    for (const change of [
      `secondary_status = 'rejected', selection_category = null, joining_status = 'pending', final_decision = 'confirmed'`,
      `joining_date = '2027-01-01'`,
      `joining_time = '10:00'`,
      `decision_date = '2026-01-01'`,
      `selection_category = 'waiting', joining_status = 'declined'`,
      `primary_status = 'rejected'`,
      `call_time = '12:00'`,
      `primary_panel = '[{"name": "X", "score": 5, "referred": true}]'`,
    ]) {
      await expect(as(HR, `update candidates set ${change} where id = $1`, [id])).rejects.toThrow(/locked/);
      await expect(as(ADMIN, `update candidates set ${change} where id = $1`, [id])).rejects.toThrow(/locked/);
    }
  });

  it('locks the whole process after a rejection', async () => {
    const id = await selected();
    await as(HR, `update candidates set ${REJECT} where id = $1`, [id]);
    await expect(as(HR, `update candidates set informed_date = '2027-01-01' where id = $1`, [id])).rejects.toThrow(/locked/);
    await expect(as(HR, `update candidates set screening_status = 'new' where id = $1`, [id])).rejects.toThrow(/locked/);
  });

  it('keeps joining paperwork and the outcome open after the lock', async () => {
    const id = await selected();
    await as(HR, `update candidates set ${CONFIRM} where id = $1`, [id]);
    const [row] = await as(HR, `update candidates set offered_salary = 40000, employee_code = 'E-1', phone = '01811111111', joining_status = 'joined' where id = $1 returning joining_status, offered_salary`, [id]);
    expect(row.joining_status).toBe('joined');
    expect(Number(row.offered_salary)).toBe(40000);
  });

  it('records the joining call after the lock, and the day the candidate confirmed on it', async () => {
    const id = await selected();
    await expect(as(HR, `update candidates set joining_confirmed_date = '2026-12-03' where id = $1`, [id])).rejects.toThrow(/joining_confirmed_needs_call/);
    await as(HR, `update candidates set ${CONFIRM} where id = $1`, [id]);
    await expect(as(HR, `update candidates set joining_confirmed_date = '2026-12-03', joining_status = 'accepted' where id = $1`, [id])).rejects.toThrow(/joining_confirmed_needs_call/);
    await expect(as(HR, `update candidates set joining_call_date = '2026-11-20', joining_confirmed_date = '2026-11-19', joining_status = 'accepted' where id = $1`, [id])).rejects.toThrow(/joining_confirmed_needs_call/);
    const [row] = await as(
      HR,
      `update candidates set joining_call_date = '2026-11-20', joining_call_time = '11:00', joining_confirmed_date = '2026-12-03', joining_confirmed_time = '10:00', joining_status = 'accepted' where id = $1
       returning joining_status, joining_date, joining_confirmed_date::text as confirmed`,
      [id],
    );
    // The letter's joining day stays locked as it was; the confirmed day sits beside it.
    expect(row.joining_status).toBe('accepted');
    expect(row.confirmed).toBe('2026-12-03');
    expect(new Date(row.joining_date).toISOString().slice(0, 10)).toBe('2026-12-01');
  });

  it('lets only an admin unlock', async () => {
    const id = await selected();
    await as(HR, `update candidates set ${CONFIRM} where id = $1`, [id]);
    const UNLOCK = `final_decision = null, decision_date = null, decision_time = '', decided_at = null, joining_status = 'pending', joining_time = ''`;
    await expect(as(HR, `update candidates set ${UNLOCK} where id = $1`, [id])).rejects.toThrow(/Only an admin/);
    const [row] = await as(ADMIN, `update candidates set ${UNLOCK} where id = $1 returning final_decision, secondary_status`, [id]);
    expect(row).toEqual({ final_decision: null, secondary_status: 'selected' });
    await as(HR, `update candidates set selection_category = 'waiting' where id = $1`, [id]);
  });

  it('adds up review time, keeps sessions as a record and leaves viewers out', async () => {
    const id = await addCandidate(bucket);
    const log = (user: string, seconds: number) => as(user, `insert into cv_review_sessions (candidate_id, reviewer_name, started_at, ended_at, seconds) values ($1, 'HR', now(), now(), $2)`, [id, seconds]);
    await log(HR, 120);
    await log(ADMIN, 45);
    await expect(log(VIEWER, 10)).rejects.toThrow(/row-level security/);
    const [row] = await as(VIEWER, 'select review_seconds, review_count from candidates where id = $1', [id]);
    expect(row).toEqual({ review_seconds: 165, review_count: 2 });
    expect((await as(VIEWER, 'select id from cv_review_sessions where candidate_id = $1', [id])).length).toBe(2);
    expect(await as(null, 'select id from cv_review_sessions')).toEqual([]);
    await as(HR, 'update cv_review_sessions set seconds = 1 where candidate_id = $1', [id]);
    const [same] = await as(HR, 'select sum(seconds)::int as total from cv_review_sessions where candidate_id = $1', [id]);
    expect(same.total).toBe(165);
  });

  it('still adds review time to a locked candidate', async () => {
    const id = await selected();
    await as(HR, `update candidates set ${CONFIRM} where id = $1`, [id]);
    await as(HR, `insert into cv_review_sessions (candidate_id, started_at, ended_at, seconds) values ($1, now(), now(), 30)`, [id]);
    const [row] = await as(HR, 'select review_seconds from candidates where id = $1', [id]);
    expect(row.review_seconds).toBe(30);
  });

  it('does not let staff forge the audit trail', async () => {
    const id = await addCandidate(bucket);
    await expect(as(HR, `insert into candidate_events (candidate_id, field) values ($1, 'x')`, [id])).rejects.toThrow(/row-level security/);
  });
});

describe('public application form', () => {
  const payload = { full_name: 'Public Applicant', phone: '+880 1811-223344', email: 'A@Example.com', education: [{ degree: 'BBA' }], skills: ['Excel'] };
  const submit = (code: string, data: object, path = 'applications/x/cv.pdf', website = '') =>
    as(null, `select submit_application($1, $2::jsonb, $3, null, 'cv.pdf', $4) as r`, [code, JSON.stringify(data), path, website]);

  it('shows only safe details of an open position', async () => {
    await makeBucket('open-role');
    const [{ r }] = await as(null, `select get_public_bucket('open-role') as r`);
    expect(r).toMatchObject({ designation: 'Jr. Executive', accepting: true, group_name: 'Bitopi Group' });
    expect(JSON.stringify(r)).not.toContain('id"');
  });

  it('adds the applicant to the right bucket', async () => {
    const bucket = await makeBucket('apply-1');
    await submit('apply-1', payload);
    const rows = await as(HR, `select full_name, email, source, parse_method, cv_path, education, skills from candidates where bucket_id = $1`, [bucket]);
    expect(rows).toEqual([
      expect.objectContaining({
        full_name: 'Public Applicant', email: 'a@example.com', source: 'Company form', parse_method: 'form',
        cv_path: 'applications/x/cv.pdf', education: [{ degree: 'BBA' }], skills: ['Excel'],
      }),
    ]);
  });

  it('cannot set pipeline status through the payload', async () => {
    const bucket = await makeBucket('apply-2');
    await submit('apply-2', { ...payload, screening_status: 'shortlisted', secondary_status: 'selected', joining_status: 'joined' });
    const [row] = await as(HR, `select screening_status, secondary_status from candidates where bucket_id = $1`, [bucket]);
    expect(row).toEqual({ screening_status: 'new', secondary_status: 'pending' });
  });

  it('ignores duplicates and bots, and validates input', async () => {
    const bucket = await makeBucket('apply-3');
    await submit('apply-3', payload);
    await submit('apply-3', { ...payload, phone: '01811223344' });
    await submit('apply-3', { ...payload, phone: '01911223344' }, undefined, 'http://spam');
    expect((await as(HR, `select id from candidates where bucket_id = $1`, [bucket])).length).toBe(1);
    await expect(submit('apply-3', { full_name: 'A B', phone: '123' })).rejects.toThrow(/mobile/);
    await expect(submit('apply-3', { phone: '01911223344' })).rejects.toThrow(/Name/);
    await expect(submit('apply-3', { ...payload, phone: '01911223345' }, '../../secret')).rejects.toThrow(/file/);
  });

  it('refuses closed positions and unknown codes', async () => {
    const bucket = await makeBucket('apply-4');
    await as(HR, `update cv_buckets set accepting_applications = false where id = $1`, [bucket]);
    await expect(submit('apply-4', payload)).rejects.toThrow(/not accepting/);
    await expect(submit('nope', payload)).rejects.toThrow(/not accepting/);
  });
});

describe('candidate review form', () => {
  it('works once per link and shows no private data', async () => {
    const bucket = await makeBucket('review-1');
    const candidate = await addCandidate(bucket, 'Rahim Uddin');
    const [{ token }] = await as(HR, `insert into candidate_reviews (candidate_id, stage) values ($1, 'primary') returning token`, [candidate]);

    const [{ r: invite }] = await as(null, 'select get_review_invite($1) as r', [token]);
    expect(invite).toEqual({ first_name: 'Rahim', designation: 'Jr. Executive', group_name: 'Bitopi Group', stage: 'primary', submitted: false });

    const send = () => as(null, `select submit_review($1, 5, 4, 5, 3, true, 'Good') as r`, [token]);
    await send();
    await expect(send()).rejects.toThrow(/already been used/);

    const [saved] = await as(HR, `select overall, comments, submitted_at from candidate_reviews where token = $1`, [token]);
    expect(saved).toMatchObject({ overall: 5, comments: 'Good' });
    expect(saved.submitted_at).not.toBeNull();
    expect((await as(null, 'select get_review_invite($1) as r', [token]))[0].r.submitted).toBe(true);
  });

  it('rejects made-up tokens and anonymous reads', async () => {
    await expect(as(null, `select submit_review('00000000-0000-4000-8000-00000000abcd', 5, 5, 5, 5, true, '')`)).rejects.toThrow(/invalid/);
  });
});

describe('file storage rules', () => {
  it('lets anonymous applicants upload only into applications/ and read nothing', async () => {
    await as(null, `insert into storage.objects (bucket_id, name) values ('candidate-files', 'applications/a/cv.pdf')`);
    await expect(
      as(null, `insert into storage.objects (bucket_id, name) values ('candidate-files', 'cvs/hack.pdf')`),
    ).rejects.toThrow(/row-level security/);
    expect(await as(null, 'select * from storage.objects')).toEqual([]);
    expect((await as(VIEWER, 'select * from storage.objects')).length).toBeGreaterThan(0);
    const [bucket] = (await db.query<{ public: boolean }>(`select public from storage.buckets where id = 'candidate-files'`)).rows;
    expect(bucket.public).toBe(false);
  });
});

describe('upgrading a database made before these columns existed', () => {
  it('keeps old rows valid and carries their data across', async () => {
    const old = new PGlite();
    await old.exec(SUPABASE_STUB);
    const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
    await old.exec(schema);
    // Back to the first release's shape, holding a candidate selected under the old rules.
    await old.exec(`
      alter table public.candidates
        drop constraint category_needs_selection, drop constraint offer_needs_merit, drop constraint selection_category_values,
        drop constraint final_decision_values, drop constraint confirmed_needs_details, drop constraint rejected_needs_details,
        drop column industry, drop column call_date, drop column confirmed_date,
        drop column primary_panel, drop column secondary_panel, drop column selection_category,
        drop column call_time, drop column confirmed_time, drop column call_rejected_date, drop column call_rejected_time, drop column followup_time, drop column final_decision,
        drop column decision_date, drop column decision_time, drop column informed_date, drop column informed_time,
        drop column decided_by, drop column decided_at, drop column joining_time, drop column review_seconds, drop column review_count;
      alter table public.candidates alter column primary_score type int, alter column secondary_score type int;
      insert into public.cv_buckets (id, designation) values ('00000000-0000-4000-8000-0000000000aa', 'Old role');
      insert into public.candidates (bucket_id, full_name, screening_status, call_status, called_at, message_status, primary_status, primary_interviewer, primary_score, secondary_status, secondary_interviewer, secondary_score, joining_status)
      values ('00000000-0000-4000-8000-0000000000aa', 'Old Selected', 'shortlisted', 'confirm', '2026-01-15T05:00:00Z', 'message_done', 'selected', 'Interviewer X', 8, 'selected', 'Interviewer Y', 9, 'offer_sent');
      insert into public.candidates (bucket_id, full_name, screening_status, call_status, message_status, primary_status, secondary_status, joining_status, joining_date, selected_at)
      values ('00000000-0000-4000-8000-0000000000aa', 'Old Dated Offer', 'shortlisted', 'confirm', 'message_done', 'selected', 'selected', 'offer_sent', '2026-02-01', '2026-01-20T05:00:00Z');
    `);
    await old.exec(schema);
    await old.exec(schema);
    const { rows } = await old.query<any>(`select * from public.candidates where full_name = 'Old Selected'`);
    expect(rows[0].selection_category).toBe('merit');
    expect(rows[0].call_date).not.toBeNull();
    expect(rows[0].primary_panel).toEqual([{ name: 'Interviewer X', score: 8, referred: false }]);
    expect(rows[0].secondary_panel).toEqual([{ name: 'Interviewer Y', score: 9, referred: false }]);
    expect(rows[0].confirmed_date).toBeNull();
    // With no joining date on record there is nothing to lock yet; HR finishes it from the card.
    expect(rows[0].final_decision).toBeNull();
    expect(rows[0].review_seconds).toBe(0);
    const dated = (await old.query<any>(`select * from public.candidates where full_name = 'Old Dated Offer'`)).rows[0];
    expect(dated.final_decision).toBe('confirmed');
    expect(String(dated.decision_date)).toContain('2026');
    await old.close();
  }, 60_000);
});

describe('question library', () => {
  it('lets staff add, edit and remove questions, viewers only read, and strangers nothing', async () => {
    const [mcq] = await as(HR, `insert into questions (kind, question, options, correct_option, created_by_name)
      values ('mcq', 'Two plus two?', '["3", "4", "5"]', 1, 'Forged name') returning id, created_by, created_by_name`);
    expect(mcq).toMatchObject({ created_by: HR, created_by_name: 'hr' });
    await as(ADMIN, `insert into questions (kind, question, answer, marks, round) values ('interview', 'Tell us about yourself.', 'Clear and brief.', 10, 'primary')`);
    expect(await as(VIEWER, 'select id from questions')).toHaveLength(2);
    await expect(as(VIEWER, `insert into questions (kind, question) values ('written', 'x')`)).rejects.toThrow(/row-level security/);
    expect(await as(STRANGER, 'select id from questions')).toEqual([]);
    expect(await as(null, 'select id from questions')).toEqual([]);
    await as(HR, `update questions set question = 'What is two plus two?' where id = $1`, [mcq.id]);
    await as(HR, `delete from questions where id = $1`, [mcq.id]);
    expect(await as(ADMIN, 'select id from questions where id = $1', [mcq.id])).toEqual([]);
  });

  it('refuses an MCQ without enough choices or a right answer', async () => {
    await expect(as(HR, `insert into questions (kind, question, options, correct_option) values ('mcq', 'Pick', '["only one"]', 0)`)).rejects.toThrow(/mcq_needs_choices/);
    await expect(as(HR, `insert into questions (kind, question, options) values ('mcq', 'Pick', '["a", "b"]')`)).rejects.toThrow(/mcq_needs_choices/);
    await expect(as(HR, `insert into questions (kind, question, options, correct_option) values ('mcq', 'Pick', '["a", "b"]', 2)`)).rejects.toThrow(/mcq_needs_choices/);
    await expect(as(HR, `insert into questions (kind, question) values ('written', '   ')`)).rejects.toThrow(/check/);
  });
});

describe('CV upload limits', () => {
  it('start at 1000 files, batches of 50 and a 10 second break, and stay within bounds', async () => {
    const [row] = await as(ADMIN, 'select upload_max_files, upload_batch_size, upload_batch_pause from settings');
    expect(row).toEqual({ upload_max_files: 1000, upload_batch_size: 50, upload_batch_pause: 10 });
    await expect(as(ADMIN, 'update settings set upload_batch_size = 0')).rejects.toThrow(/settings_upload_limits/);
    await expect(as(ADMIN, 'update settings set upload_batch_pause = 601')).rejects.toThrow(/settings_upload_limits/);
    await as(ADMIN, 'update settings set upload_batch_size = 25, upload_batch_pause = 0');
    await as(ADMIN, 'update settings set upload_batch_size = 50, upload_batch_pause = 10');
  });
});

describe('sample data for a real project', () => {
  const count = async (table: string) => Number((await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0].n);
  const sample = readFileSync(new URL('../supabase/sample-data.sql', import.meta.url), 'utf8');

  it('refuses to run before the three accounts exist', async () => {
    await expect(db.exec(sample)).rejects.toThrow(/Create the three accounts first/);
  });

  it('loads under the real rules, links to the real accounts, runs twice harmlessly, and comes out cleanly', async () => {
    const people = [['00000000-0000-4000-8000-0000000000b1', 'tareq@bitopibd.com', 'Tareq Azij'], ['00000000-0000-4000-8000-0000000000b2', 'nafis@bitopibd.com', 'Nafis'], ['00000000-0000-4000-8000-0000000000b3', 'mili@bitopibd.com', 'Mili']];
    for (const [id, email, name] of people) {
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, jsonb_build_object('full_name', $3::text))`, [id, email, name]);
    }
    const before = { candidates: await count('candidates'), notifications: await count('notifications'), questions: await count('questions') };
    await db.exec(sample);
    expect(await count('candidates')).toBe(before.candidates + 23);
    expect(await count('questions')).toBe(before.questions + 12);
    const mahmud = (await db.query<any>(`select c.final_decision, c.assigned_to, b.designation from candidates c join cv_buckets b on b.id = c.bucket_id where c.full_name = 'Mahmud Karim'`)).rows[0];
    expect(mahmud).toMatchObject({ final_decision: 'confirmed', designation: 'HR Tech & Automation Specialist', assigned_to: [people[2][0]] });
    // The history and alerts are the sample's own, not "received by the company form" for everyone.
    const events = (await db.query<any>(`select actor_name, actor_id from candidate_events e join candidates c on c.id = e.candidate_id where c.full_name = 'Rahim Uddin' order by e.created_at`)).rows;
    expect(events[0]).toEqual({ actor_name: 'Tareq Azij', actor_id: people[0][0] });
    expect(await count('notifications')).toBe(before.notifications + 7);
    expect((await db.query<any>(`select count(*)::int as n from notifications where recipient_id = $1`, [people[0][0]])).rows[0].n).toBe(2);
    // Review time is added up once, through the sessions.
    // (Earlier tests left other people of the same name, without review time.)
    expect((await db.query<any>(`select review_seconds from candidates where full_name = 'Rahim Uddin' and review_seconds > 0`)).rows.map((r) => r.review_seconds)).toEqual([375]);

    await db.exec(sample);
    expect(await count('candidates')).toBe(before.candidates + 23);

    // A requisition made in the app afterwards takes the next free number.
    const [req] = await as(HR, `insert into requisitions (designation) values ('After sample') returning ref_no`);
    expect(req.ref_no).toMatch(/-0005$|-00[1-9]\d$/);

    await db.exec(readFileSync(new URL('../supabase/remove-sample-data.sql', import.meta.url), 'utf8'));
    expect(await count('candidates')).toBe(before.candidates);
    expect(await count('questions')).toBe(before.questions);
  });
});

describe('app rows match the database columns', () => {
  it('accepts every demo row, so the shared types and the schema cannot drift apart', async () => {
    const data = buildDemoData();
    const columnsOf = async (table: string) =>
      new Set(
        (await db.query<{ column_name: string }>(
          `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
          [table],
        )).rows.map((r) => r.column_name),
      );

    for (const table of ['settings', 'message_templates', 'document_templates', 'designations', 'requisitions', 'job_postings', 'cv_buckets', 'candidates', 'candidate_reviews', 'cv_review_sessions', 'profiles', 'notifications', 'questions', 'candidate_events'] as const) {
      const columns = await columnsOf(table);
      expect(columns.size, table).toBeGreaterThan(0);
      for (const row of data[table] as object[]) {
        for (const key of Object.keys(row)) {
          expect(columns.has(key), `${table}.${key} is used by the app but missing from schema.sql`).toBe(true);
        }
      }
    }
  });

  it('accepts the demo pipeline states under the real constraints', async () => {
    const data = buildDemoData();
    const bucket = await makeBucket('seed-check');
    for (const candidate of data.candidates) {
      const { id, bucket_id, job_posting_id, ...row } = candidate;
      const keys = Object.keys(row);
      const jsonColumns = new Set(['education', 'experience', 'training', 'references_list', 'sections', 'primary_panel', 'secondary_panel']);
      const values = keys.map((key) => {
        const value = (row as Record<string, unknown>)[key];
        return jsonColumns.has(key) ? JSON.stringify(value) : value;
      });
      const placeholders = keys.map((key, i) => (jsonColumns.has(key) ? `$${i + 2}::jsonb` : `$${i + 2}`));
      await as(HR, `insert into candidates (bucket_id, ${keys.join(', ')}) values ($1, ${placeholders.join(', ')})`, [bucket, ...values]);
    }
  });
});

describe('desks and notifications', () => {
  // Tareq screens and hands over; Nafis and Mili run the process. ADMIN and HR above stay on desk "all".
  const TAREQ = '00000000-0000-4000-8000-0000000000a1';
  const NAFIS = '00000000-0000-4000-8000-0000000000a2';
  const MILI = '00000000-0000-4000-8000-0000000000a3';
  let bucket: string;

  const inbox = (user: string) => as<any>(user, 'select * from notifications order by created_at');

  beforeAll(async () => {
    for (const [id, email, name, desk] of [[TAREQ, 'tareq@x.com', 'Tareq Azij', 'screening'], [NAFIS, 'nafis@x.com', 'Nafis', 'process'], [MILI, 'mili@x.com', 'Mili', 'process']]) {
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, jsonb_build_object('full_name', $3::text))`, [id, email, name]);
      await db.query(`update public.profiles set role = 'hr', desk = $2 where id = $1`, [id, desk]);
    }
    bucket = await makeBucket('desk-bucket');
  });

  it('lets only the screening desk upload CVs', async () => {
    await expect(as(NAFIS, `insert into candidates (bucket_id, full_name) values ($1, 'By Nafis')`, [bucket])).rejects.toThrow(/screening desk/);
    await as(TAREQ, `insert into candidates (bucket_id, full_name) values ($1, 'A'), ($1, 'B'), ($1, 'C')`, [bucket]);
    await as(TAREQ, `insert into candidates (bucket_id, full_name) values ($1, 'D'), ($1, 'E')`, [bucket]);
  });

  it('tells the process team about new CVs on one line per bucket, and not the uploader', async () => {
    for (const person of [NAFIS, MILI]) {
      const rows = (await inbox(person)).filter((n) => n.event === 'new_cvs' && n.bucket_id === bucket);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actor_name: 'Tareq Azij', item_count: 5, designation: 'Jr. Executive' });
    }
    expect((await inbox(TAREQ)).filter((n) => n.event === 'new_cvs' && n.bucket_id === bucket)).toHaveLength(0);
  });

  it('hands a CV to the person chosen, and only to them', async () => {
    const [{ id }] = await as(TAREQ, `select id from candidates where full_name = 'A' and bucket_id = $1`, [bucket]);
    await expect(as(MILI, `update candidates set screening_status = 'shortlisted' where id = $1`, [id])).rejects.toThrow(/screening desk/);
    await as(TAREQ, `update candidates set screening_status = 'shortlisted', assigned_to = array[$2]::uuid[], handover_note = 'Call today' where id = $1`, [id, NAFIS]);
    const toNafis = (await inbox(NAFIS)).filter((n) => n.event === 'handover');
    expect(toNafis).toHaveLength(1);
    expect(toNafis[0]).toMatchObject({ subject: 'A', detail: 'Call today', candidate_id: id });
    expect((await inbox(MILI)).filter((n) => n.event === 'handover')).toHaveLength(0);
  });

  it('keeps the screening desk out of the process steps, and tells it only about the big decisions', async () => {
    const [{ id }] = await as(TAREQ, `select id from candidates where full_name = 'A' and bucket_id = $1`, [bucket]);
    await expect(as(TAREQ, `update candidates set call_status = 'confirm' where id = $1`, [id])).rejects.toThrow(/process team/);
    await as(NAFIS, `update candidates set call_status = 'confirm', call_date = current_date where id = $1`, [id]);
    await as(NAFIS, `update candidates set message_status = 'message_done', primary_status = 'scheduled', primary_date = '2026-12-01', primary_time = '10:30' where id = $1`, [id]);
    expect((await inbox(TAREQ)).filter((n) => n.candidate_id === id)).toEqual([]);
    // Profile details stay open to both desks.
    await as(TAREQ, `update candidates set email = 'a@x.com' where id = $1`, [id]);

    const [{ id: b }] = await as(TAREQ, `select id from candidates where full_name = 'B' and bucket_id = $1`, [bucket]);
    await as(TAREQ, `update candidates set screening_status = 'shortlisted', assigned_to = array[$2]::uuid[] where id = $1`, [b, NAFIS]);
    await as(NAFIS, `update candidates set call_status = 'confirm', message_status = 'message_done', primary_status = 'selected',
      secondary_message_status = 'message_done', secondary_status = 'selected', selection_category = 'merit',
      final_decision = 'confirmed', decision_date = '2026-12-10', joining_date = '2026-12-20', joining_time = '09:00', joining_status = 'offer_sent'
      where id = $1`, [b]);
    const decisions = (await inbox(TAREQ)).filter((n) => n.candidate_id === b).map((n) => [n.event, n.actor_name, n.detail]);
    expect(decisions).toEqual([['decision_confirmed', 'Nafis', '2026-12-20 09:00']]);
  });

  it('tells the head of the team, on desk "all", about the big decisions too', async () => {
    await db.query(`update public.profiles set role = 'admin', desk = 'all' where id = $1`, [TAREQ]);
    const [{ id: b }] = await as(TAREQ, `select id from candidates where full_name = 'B' and bucket_id = $1`, [bucket]);
    await as(NAFIS, `update candidates set joining_status = 'joined' where id = $1`, [b]);
    expect((await inbox(TAREQ)).filter((n) => n.candidate_id === b).map((n) => n.event)).toEqual(['decision_confirmed', 'joined']);
    await db.query(`update public.profiles set role = 'hr', desk = 'screening' where id = $1`, [TAREQ]);
  });

  it('gives a candidate to someone else and tells only the newcomer', async () => {
    const [{ id }] = await as(TAREQ, `select id from candidates where full_name = 'A' and bucket_id = $1`, [bucket]);
    await as(TAREQ, `update candidates set assigned_to = array[$2]::uuid[] where id = $1`, [id, MILI]);
    expect((await inbox(MILI)).filter((n) => n.event === 'handover' && n.candidate_id === id)).toHaveLength(1);
    expect((await inbox(NAFIS)).filter((n) => n.event === 'handover')).toHaveLength(1);
  });

  it('shows each person only their own notifications, which they can mark read but not rewrite', async () => {
    const [mine] = await inbox(NAFIS);
    expect(await as(MILI, 'select * from notifications where id = $1', [mine.id])).toEqual([]);
    await as(MILI, `update notifications set read_at = now() where id = $1`, [mine.id]);
    expect((await inbox(NAFIS)).find((n) => n.id === mine.id).read_at).toBeNull();
    await as(NAFIS, `update notifications set read_at = now() where id = $1`, [mine.id]);
    expect((await inbox(NAFIS)).find((n) => n.id === mine.id).read_at).not.toBeNull();
    await expect(as(NAFIS, `update notifications set subject = 'x' where id = $1`, [mine.id])).rejects.toThrow(/permission denied/);
    await expect(as(NAFIS, `insert into notifications (recipient_id, event) values ($1, 'handover')`, [MILI])).rejects.toThrow(/permission denied/);
    await expect(as(null, 'select * from notifications')).rejects.toThrow(/permission denied/);
  });

  it('records who did each step by account, and who a candidate was handed to', async () => {
    const [{ id }] = await as(TAREQ, `select id from candidates where full_name = 'C' and bucket_id = $1`, [bucket]);
    await as(TAREQ, `update candidates set screening_status = 'shortlisted', assigned_to = array[$2]::uuid[] where id = $1`, [id, NAFIS]);
    await as(TAREQ, `update candidates set assigned_to = array[$2, $3]::uuid[] where id = $1`, [id, NAFIS, MILI]);
    await as(NAFIS, `update candidates set call_status = 'confirm' where id = $1`, [id]);
    const trail = await as<any>(TAREQ, `select field, from_value, to_value, actor_name, actor_id from candidate_events where candidate_id = $1 order by created_at, field`, [id]);
    expect(trail.find((e) => e.field === 'received')).toMatchObject({ actor_name: 'Tareq Azij', actor_id: TAREQ });
    expect(trail.filter((e) => e.field === 'assigned_to').map((e) => [e.from_value, e.to_value])).toEqual([[null, 'Nafis'], ['Nafis', 'Nafis, Mili']]);
    expect(trail.find((e) => e.field === 'call_status')).toMatchObject({ actor_name: 'Nafis', actor_id: NAFIS });
    // A handover to the whole team is recorded too, though assigned_to stays empty.
    const [{ id: d }] = await as(TAREQ, `select id from candidates where full_name = 'D' and bucket_id = $1`, [bucket]);
    await as(TAREQ, `update candidates set screening_status = 'shortlisted' where id = $1`, [d]);
    expect((await as<any>(TAREQ, `select to_value from candidate_events where candidate_id = $1 and field = 'assigned_to'`, [d]))[0].to_value).toBe('Whole process team');
  });

  it('credits review time to whoever is signed in, whatever name is sent', async () => {
    const [{ id }] = await as(TAREQ, `select id from candidates where full_name = 'E' and bucket_id = $1`, [bucket]);
    await as(TAREQ, `insert into cv_review_sessions (candidate_id, reviewer_name, started_at, ended_at, seconds) values ($1, 'Someone else', now() - interval '1 minute', now(), 60)`, [id]);
    const [session] = await as<any>(TAREQ, `select reviewer_name, reviewer_id from cv_review_sessions where candidate_id = $1`, [id]);
    expect(session).toEqual({ reviewer_name: 'Tareq Azij', reviewer_id: TAREQ });
  });

  it('reports applications from the company form and new job postings', async () => {
    await as(HR, `update cv_buckets set code = 'desk-form' where id = $1`, [bucket]);
    await as(null, `select submit_application('desk-form', '{"full_name": "Form Person", "phone": "01799999999"}'::jsonb, '', '', '', '')`);
    expect((await inbox(TAREQ)).some((n) => n.event === 'new_cvs' && n.actor_name === 'Company form' && n.subject === 'Form Person')).toBe(true);
    const [{ requisition_id }] = await as(HR, `select requisition_id from cv_buckets where id = $1`, [bucket]);
    await as(TAREQ, `insert into job_postings (requisition_id, media) values ($1, 'BDJobs')`, [requisition_id]);
    const posting = (await inbox(MILI)).find((n) => n.event === 'posting');
    expect(posting).toMatchObject({ actor_name: 'Tareq Azij', detail: 'BDJobs', designation: 'Jr. Executive', bucket_id: bucket });
  });
});
