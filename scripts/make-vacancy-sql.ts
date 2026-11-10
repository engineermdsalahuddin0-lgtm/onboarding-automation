// Turns the company's vacancy status sheet into one SQL file that loads every row as a requisition, so it can
// be run straight in Supabase > SQL Editor instead of using Requisitions > Sync vacancy sheet.
// Run with: node --import tsx scripts/make-vacancy-sql.ts ["path/to/sheet.xlsx"] ["path/to/output.sql"]
// The output holds real names, so it goes to data/, which is kept out of git.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_ORG_STRUCTURE } from '../src/lib/org';
import { parseVacancySheet, readVacancyWorkbook } from '../src/lib/vacancySheet';

const input = resolve(process.argv[2] ?? 'data/NEW_Job vacancy Status _July 2026 .xlsx');
const output = resolve(process.argv[3] ?? 'data/vacancy-data.sql');

const file = readFileSync(input);
const { sheetName, rows: cells } = await readVacancyWorkbook(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const result = parseVacancySheet(sheetName, cells, DEFAULT_ORG_STRUCTURE);
if (result.missingColumns.length) throw new Error(`The sheet lacks the columns: ${result.missingColumns.join(', ')}`);

const records = result.rows.map((row) => row.requisition);
const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
// On a second run the sheet's values replace what is there; when the row was first added stays as it was.
const updated = columns.filter((column) => !['sheet_key', 'ref_no', 'created_at'].includes(column));

const json = JSON.stringify(records);
const structure = JSON.stringify(result.structure);
if (json.includes('$vacancy$') || structure.includes('$vacancy$')) throw new Error('The data contains the SQL quote marker.');

const counts = new Map<string, number>();
for (const record of records) counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
const notes = result.rows.filter((row) => row.notes.length).map((row) => `--   SL ${row.sl}: ${row.notes.join(' ')}`.replace(/\n/g, ' '));

const sql = `-- The vacancy status sheet "${input.split(/[\\/]/).pop()}" (sheet ${sheetName}) as requisitions.
-- ${records.length} rows: ${[...counts].map(([status, n]) => `${status} ${n}`).join(', ')}. ${result.blankRows} numbered blank rows skipped.
--
-- Run it in Supabase > SQL Editor, after supabase/schema.sql. Running it again adds nothing twice: each row is
-- matched by its SL and updated from the sheet.
--
-- Read with these changes:
${notes.join('\n') || '--   none'}

-- The columns the sheet needs, in case schema.sql has not been run again since they were added.
alter table public.settings add column if not exists org_structure jsonb not null default '[]';
alter table public.requisitions add column if not exists unit text not null default '';
alter table public.requisitions add column if not exists section text not null default '';
alter table public.requisitions add column if not exists subsection text not null default '';
alter table public.requisitions add column if not exists grade text not null default '';
alter table public.requisitions add column if not exists vacancy_type text not null default '';
alter table public.requisitions add column if not exists replacing text not null default '';
alter table public.requisitions add column if not exists requisition_date date;
alter table public.requisitions add column if not exists approved_on date;
alter table public.requisitions add column if not exists offer_date date;
alter table public.requisitions add column if not exists expected_joining date;
alter table public.requisitions add column if not exists selected_names text not null default '';
alter table public.requisitions add column if not exists remarks text not null default '';
alter table public.requisitions add column if not exists sheet_key text;
alter table public.requisitions add column if not exists sheet_data jsonb not null default '{}';
create unique index if not exists requisitions_sheet_key_idx on public.requisitions (sheet_key);

insert into public.requisitions (${columns.join(', ')})
select ${columns.map((column) => `x.${column}`).join(', ')}
from jsonb_populate_recordset(null::public.requisitions, $vacancy$${json}$vacancy$::jsonb) x
on conflict (sheet_key) do update set
  ${updated.map((column) => `${column} = excluded.${column}`).join(',\n  ')};

-- Units, departments and sections (Settings > Units and departments), unless someone has set them up already.
insert into public.settings (id) values (1) on conflict (id) do nothing;
update public.settings set org_structure = $vacancy$${structure}$vacancy$::jsonb
where id = 1 and org_structure = '[]'::jsonb;

notify pgrst, 'reload schema';

select count(*) as vacancy_rows_loaded from public.requisitions where sheet_key like 'vacancy-sheet:%';
`;

writeFileSync(output, sql);
console.log(`Wrote ${output}: ${records.length} rows (${Math.round(sql.length / 1024)} KB)`);
