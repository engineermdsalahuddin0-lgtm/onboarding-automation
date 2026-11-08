// Writes supabase/sample-data.sql from the demo data, for showing the app on a real Supabase project.
// Run with: node --import tsx scripts/make-sample-sql.ts
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { buildDemoData, DEMO_PEOPLE } from '../src/lib/backend/seed';
import { isoDate } from '../src/lib/format';

// Tables in the order they can be filled, each referring only to those before it.
const TABLES = [
  'designations', 'requisitions', 'job_postings', 'cv_buckets', 'candidates',
  'candidate_events', 'cv_review_sessions', 'candidate_reviews', 'notifications', 'questions',
] as const;

/** The same sample id always becomes the same UUID, so running the file twice adds nothing twice. */
function uuidFor(id: string): string {
  const hex = createHash('sha256').update(`bitopi-sample:${id}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const data = buildDemoData() as unknown as Record<string, Record<string, unknown>[]>;

// Every sample row's id, and every reference to it, becomes a UUID.
const ids = new Map<string, string>();
for (const table of TABLES) for (const row of data[table]) ids.set(String(row.id), uuidFor(String(row.id)));
const mapRef = (value: unknown) => (typeof value === 'string' && ids.has(value) ? ids.get(value) : value);

const rows: Record<string, Record<string, unknown>[]> = {};
for (const table of TABLES) {
  rows[table] = data[table].map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = key === 'id' || key.endsWith('_id') ? mapRef(value) : value;
    }
    // Review time is added up again by the database as the sessions go in.
    if (table === 'candidates') {
      out.review_seconds = 0;
      out.review_count = 0;
    }
    return out;
  });
}

// The demo accounts stand for the real ones, found by email when the file runs.
let json = JSON.stringify(rows);
json = json.replaceAll(DEMO_PEOPLE.agm, '@@agm@@').replaceAll(DEMO_PEOPLE.nafis, '@@nafis@@').replaceAll(DEMO_PEOPLE.mili, '@@mili@@');
if (json.includes('$sample$')) throw new Error('The data contains the SQL quote marker.');

// The database numbers requisitions and codes buckets itself, so the sample never clashes with what is there.
const LEFT_TO_DATABASE: Record<string, string[]> = { requisitions: ['ref_no'], cv_buckets: ['code'] };
const columns = (table: string) => [...new Set(rows[table].flatMap((row) => Object.keys(row)))].filter((column) => !LEFT_TO_DATABASE[table]?.includes(column));
const inserts = TABLES.map((table) => {
  const list = columns(table);
  // A position of the same name may already exist, in which case the sample's own is not added: link to nothing then.
  const values = list.map((column) => (table === 'requisitions' && column === 'designation_id'
    ? '(select id from public.designations where id = x.designation_id)'
    : `x.${column}`));
  return `  insert into public.${table} (${list.join(', ')})\n    select ${values.join(', ')} from jsonb_populate_recordset(null::public.${table}, d -> '${table}') x\n    on conflict do nothing;`;
});
const idList = (table: string) => `array[${rows[table].map((row) => `'${row.id}'`).join(', ')}]::uuid[]`;

const sql = `-- Sample data for showing the Recruitment Management Suite: positions, CV buckets, 23 candidates at every step of the
-- process, the team's history, interview feedback and a question library. Fictional people only.
--
-- Before running: run supabase/schema.sql, and create the three accounts (Tareq, Nafis, Mili).
-- If their emails differ from the ones below, change them here first.
-- Run it once in Supabase > SQL Editor. Running it again changes nothing.
-- To take it all out again, run supabase/remove-sample-data.sql.

do $do$
declare
  agm_email text := 'tareq@bitopibd.com';
  nafis_email text := 'nafis@bitopibd.com';
  mili_email text := 'mili@bitopibd.com';

  agm uuid := (select id from public.profiles where lower(email) = lower(agm_email));
  nafis uuid := (select id from public.profiles where lower(email) = lower(nafis_email));
  mili uuid := (select id from public.profiles where lower(email) = lower(mili_email));
  -- The sample was made on ${isoDate(new Date())}; every date moves forward to today, so interviews stay upcoming.
  shift int := current_date - date '${isoDate(new Date())}';
  d jsonb;
  t text;
  c record;
  sample_ids uuid[];
begin
  if agm is null or nafis is null or mili is null then
    raise exception 'Create the three accounts first (%, %, %), or change the emails at the top of this file.', agm_email, nafis_email, mili_email;
  end if;
  if exists (select 1 from public.candidates where id = '${rows.candidates[0].id}') then
    raise notice 'The sample data is already loaded.';
    return;
  end if;

  d := replace(replace(replace($sample$${json}$sample$, '@@agm@@', agm::text), '@@nafis@@', nafis::text), '@@mili@@', mili::text)::jsonb;

${inserts.slice(0, 5).join('\n')}

  -- Adding postings and candidates wrote alerts and "received by the company form"; the sample's own history replaces them.
  -- Those were all written just now, in this transaction, so now() picks out exactly them.
  delete from public.candidate_events where candidate_id = any (${idList('candidates')});
  delete from public.notifications where created_at = now();

${inserts.slice(5).join('\n')}

  -- Requisition numbers made in the app carry on after the sample ones.
  perform setval('public.requisition_seq', greatest(
    (select coalesce(max(nullif(substring(ref_no from '\\d+$'), '')::int), 0) from public.requisitions), 1));

  if shift <> 0 then
    foreach t in array array[${TABLES.map((table) => `'${table}'`).join(', ')}] loop
      sample_ids := array(select (value ->> 'id')::uuid from jsonb_array_elements(d -> t));
      for c in
        select column_name, data_type from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name <> 'updated_at'
          and data_type in ('date', 'timestamp with time zone')
      loop
        execute format('update public.%I set %I = %I + %s where id = any ($1)', t, c.column_name, c.column_name,
          case when c.data_type = 'date' then shift::text else format('interval %L', shift || ' days') end)
        using sample_ids;
      end loop;
    end loop;
  end if;

  raise notice 'Sample data loaded.';
end
$do$;
`;

const remove = `-- Takes out everything supabase/sample-data.sql added, and nothing else. Run it in Supabase > SQL Editor.

delete from public.notifications where id = any (${idList('notifications')}) or bucket_id = any (${idList('cv_buckets')});
delete from public.candidates where id = any (${idList('candidates')});
delete from public.cv_buckets where id = any (${idList('cv_buckets')});
delete from public.requisitions where id = any (${idList('requisitions')});
delete from public.designations where id = any (${idList('designations')});
delete from public.questions where id = any (${idList('questions')});
`;

writeFileSync(new URL('../supabase/sample-data.sql', import.meta.url), sql);
writeFileSync(new URL('../supabase/remove-sample-data.sql', import.meta.url), remove);
console.log(`Wrote supabase/sample-data.sql (${Math.round(sql.length / 1024)} KB) and supabase/remove-sample-data.sql`);
