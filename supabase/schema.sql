-- Bitopi Group Recruitment Management Suite: full database setup.
-- Run once in Supabase dashboard > SQL Editor. Safe to re-run: every statement is idempotent.

-- ---------------------------------------------------------------------------
-- Users and roles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  -- 'pending' users can sign in but see nothing until an admin assigns a role.
  role text not null default 'pending' check (role in ('admin', 'hr', 'viewer', 'pending')),
  created_at timestamptz not null default now()
);

-- Who does which part of the work. 'screening': receives, uploads and screens CVs, then hands the selected
-- ones over. 'process': everything after the handover. 'all': both, as before desks existed.
alter table public.profiles add column if not exists job_title text not null default '';
alter table public.profiles add column if not exists desk text not null default 'all';
alter table public.profiles drop constraint if exists profiles_desk_values;
alter table public.profiles add constraint profiles_desk_values check (desk in ('all', 'screening', 'process'));

create or replace function public.app_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.app_desk()
returns text language sql stable security definer set search_path = '' as $$
  select desk from public.profiles where id = auth.uid()
$$;

create or replace function public.can_read()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(public.app_role() in ('admin', 'hr', 'viewer'), false)
$$;

create or replace function public.can_write()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(public.app_role() in ('admin', 'hr'), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

-- The very first account becomes admin; everyone after waits for an admin to approve them.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_last_admin()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'At least one admin account must remain.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists protect_last_admin on public.profiles;
create trigger protect_last_admin
  before update or delete on public.profiles
  for each row execute function public.protect_last_admin();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Company settings and editable templates
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  group_name text not null default 'Bitopi Group',
  default_company text not null default '',
  companies text[] not null default '{}',
  departments text[] not null default '{}',
  media text[] not null default '{}',
  corporate_address text not null default '',
  interview_address text not null default '',
  interview_landmark text not null default '',
  hr_signature text not null default '',
  signatory_name text not null default '',
  signatory_designation text not null default '',
  signatory_mobile text not null default '',
  signatory_phone text not null default '',
  signatory_ext text not null default '',
  signatory_fax text not null default '',
  signatory_email text not null default '',
  seal_path text,
  updated_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  key text primary key,
  name text not null,
  stage text not null check (stage in ('primary', 'secondary', 'review', 'general')),
  body text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.document_templates (
  key text primary key,
  title text not null,
  body text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- CV upload limits, set by an admin under Settings > Company. A large upload is read in batches, with a
-- break between batches, so neither the browser nor the AI service is flooded.
alter table public.settings add column if not exists upload_max_files int not null default 1000;
alter table public.settings add column if not exists upload_batch_size int not null default 50;
alter table public.settings add column if not exists upload_batch_pause int not null default 10;
alter table public.settings drop constraint if exists settings_upload_limits;
alter table public.settings add constraint settings_upload_limits check (
  upload_max_files between 1 and 5000 and upload_batch_size between 1 and 1000 and upload_batch_pause between 0 and 600
);

-- No policies on purpose: only the server (service role) can read this table.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Block A: vacancies, requisitions, job postings
-- ---------------------------------------------------------------------------
create table if not exists public.designations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null default '',
  company text not null default '',
  sanctioned int not null default 0 check (sanctioned >= 0),
  filled int not null default 0 check (filled >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (title, department, company)
);

create sequence if not exists public.requisition_seq;

create table if not exists public.requisitions (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique
    default 'REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.requisition_seq')::text, 4, '0'),
  designation_id uuid references public.designations (id) on delete set null,
  designation text not null,
  department text not null default '',
  company text not null default '',
  vacancies int not null default 1 check (vacancies > 0),
  priority text not null default 'Medium' check (priority in ('Urgent', 'High', 'Medium', 'Low')),
  employment_type text not null default 'Permanent',
  location text not null default '',
  hiring_manager text not null default '',
  requested_by text not null default '',
  budget_min numeric,
  budget_max numeric,
  target_date date,
  status text not null default 'Pending approval'
    check (status in ('Pending approval', 'Approved', 'In progress', 'Filled', 'On hold', 'Cancelled')),
  justification text not null default '',
  job_description text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  filled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.job_postings (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references public.requisitions (id) on delete cascade,
  media text not null,
  url text not null default '',
  posted_on date not null default current_date,
  closes_on date,
  cost numeric not null default 0,
  status text not null default 'Live' check (status in ('Planned', 'Live', 'Closed')),
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- The group's units (CHO, TAL, BGL, RHL, MGL), each with its departments, sections and subsections:
-- [{"code": "RHL", "name": "...", "departments": [{"name": "ESG", "code": "RHL-ESG",
--   "sections": [{"name": "EMS", "subsections": ["EMS"]}]}]}]. Edited under Settings > Units and departments.
alter table public.settings add column if not exists org_structure jsonb not null default '[]';

-- Where a position sits, and the columns of the company's vacancy status sheet, so the sheet can be synced in.
alter table public.requisitions add column if not exists unit text not null default '';
alter table public.requisitions add column if not exists section text not null default '';
alter table public.requisitions add column if not exists subsection text not null default '';
-- New, Replacement, or both; and for a replacement, who left (name and ID as written).
alter table public.requisitions add column if not exists vacancy_type text not null default '';
alter table public.requisitions add column if not exists replacing text not null default '';
alter table public.requisitions add column if not exists requisition_date date;
alter table public.requisitions add column if not exists approved_on date;
alter table public.requisitions add column if not exists offer_date date;
alter table public.requisitions add column if not exists expected_joining date;
alter table public.requisitions add column if not exists selected_names text not null default '';
alter table public.requisitions add column if not exists remarks text not null default '';
-- A row synced from the vacancy sheet: its key (the sheet's SL) and the sheet's own numbers, kept as written.
alter table public.requisitions add column if not exists sheet_key text;
alter table public.requisitions add column if not exists sheet_data jsonb not null default '{}';
create unique index if not exists requisitions_sheet_key_idx on public.requisitions (sheet_key);

-- ---------------------------------------------------------------------------
-- Block B: CV buckets and the candidate pipeline
-- ---------------------------------------------------------------------------
create table if not exists public.cv_buckets (
  id uuid primary key default gen_random_uuid(),
  -- Short code used in the public application link.
  code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  requisition_id uuid references public.requisitions (id) on delete set null,
  designation text not null,
  department text not null default '',
  company text not null default '',
  color text not null default 'stone',
  status text not null default 'Open' check (status in ('Open', 'Closed', 'Archived')),
  accepting_applications boolean not null default true,
  description text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.cv_buckets add column if not exists unit text not null default '';
alter table public.cv_buckets add column if not exists section text not null default '';
alter table public.cv_buckets add column if not exists subsection text not null default '';

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  -- Restrict: a bucket holding candidates has to be archived, not deleted.
  bucket_id uuid not null references public.cv_buckets (id) on delete restrict,
  job_posting_id uuid references public.job_postings (id) on delete set null,
  source text not null default 'Direct upload',
  received_at timestamptz not null default now(),

  full_name text not null,
  email text not null default '',
  phone text not null default '',
  alt_phone text not null default '',
  address text not null default '',
  permanent_address text not null default '',
  date_of_birth date,
  father_name text not null default '',
  mother_name text not null default '',
  spouse_name text not null default '',
  gender text not null default '',
  marital_status text not null default '',
  religion text not null default '',
  nationality text not null default '',
  blood_group text not null default '',
  national_id text not null default '',
  passport_no text not null default '',
  tin_no text not null default '',
  linkedin text not null default '',

  current_designation text not null default '',
  current_company text not null default '',
  total_experience_years numeric,
  present_salary text not null default '',
  expected_salary text not null default '',
  notice_period text not null default '',
  career_summary text not null default '',
  education jsonb not null default '[]',
  experience jsonb not null default '[]',
  training jsonb not null default '[]',
  skills text[] not null default '{}',
  languages text[] not null default '{}',
  references_list jsonb not null default '[]',
  -- Every heading found in the CV mapped to its text, plus the complete text, so nothing is lost.
  sections jsonb not null default '{}',
  raw_text text not null default '',

  cv_path text,
  cv_file_name text not null default '',
  photo_path text,
  parse_method text not null default 'manual' check (parse_method in ('manual', 'rules', 'ai', 'form')),
  parse_warnings text[] not null default '{}',

  screening_status text not null default 'new' check (screening_status in ('new', 'shortlisted', 'rejected')),
  screening_note text not null default '',

  call_status text not null default 'pending' check (call_status in ('pending', 'confirm', 'followup', 'reject')),
  call_note text not null default '',
  followup_on date,
  called_at timestamptz,
  called_by text not null default '',

  message_status text not null default 'not_sent' check (message_status in ('not_sent', 'message_done')),
  message_sent_at timestamptz,
  message_channel text not null default '',

  primary_status text not null default 'pending' check (primary_status in ('pending', 'scheduled', 'selected', 'rejected')),
  primary_date date,
  primary_time text not null default '',
  primary_interviewer text not null default '',
  primary_score int check (primary_score between 1 and 10),
  primary_feedback text not null default '',

  secondary_message_status text not null default 'not_sent' check (secondary_message_status in ('not_sent', 'message_done')),
  secondary_message_sent_at timestamptz,
  secondary_status text not null default 'pending' check (secondary_status in ('pending', 'scheduled', 'selected', 'rejected')),
  secondary_date date,
  secondary_time text not null default '',
  secondary_interviewer text not null default '',
  secondary_score int check (secondary_score between 1 and 10),
  secondary_feedback text not null default '',

  -- Block C
  joining_status text not null default 'pending' check (joining_status in ('pending', 'offer_sent', 'accepted', 'joined', 'declined')),
  joining_date date,
  offered_salary numeric,
  employee_code text not null default '',
  probation_period text not null default '',
  reporting_to text not null default '',
  documents_received text[] not null default '{}',
  offer_sent_at timestamptz,
  selected_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The pipeline is a sequence: a later stage cannot hold a result the earlier stage never reached.
  constraint call_needs_shortlist check (call_status = 'pending' or screening_status = 'shortlisted'),
  constraint message_needs_confirm check (message_status = 'not_sent' or call_status = 'confirm'),
  constraint primary_needs_message check (primary_status = 'pending' or message_status = 'message_done'),
  constraint secondary_needs_primary check (secondary_status = 'pending' or primary_status = 'selected'),
  constraint joining_needs_selection check (joining_status = 'pending' or secondary_status = 'selected')
);

-- Added after the first release. Running this file again brings an existing database up to date.
alter table public.candidates add column if not exists industry text not null default '';
alter table public.candidates add column if not exists call_date date;
alter table public.candidates add column if not exists confirmed_date date;
-- One entry per interviewer: {"name": text, "score": number, "referred": boolean}.
alter table public.candidates add column if not exists primary_panel jsonb not null default '[]';
alter table public.candidates add column if not exists secondary_panel jsonb not null default '[]';
alter table public.candidates add column if not exists selection_category text;
-- A phone call and its confirmation are recorded with the time as well as the day.
alter table public.candidates add column if not exists call_time text not null default '';
alter table public.candidates add column if not exists confirmed_time text not null default '';
alter table public.candidates add column if not exists followup_time text not null default '';
-- When the candidate turned the job down on the call.
alter table public.candidates add column if not exists call_rejected_date date;
alter table public.candidates add column if not exists call_rejected_time text not null default '';
-- The final decision: a confirmation letter or a rejection. Once set, the process is locked.
alter table public.candidates add column if not exists final_decision text;
alter table public.candidates add column if not exists decision_date date;
alter table public.candidates add column if not exists decision_time text not null default '';
alter table public.candidates add column if not exists informed_date date;
alter table public.candidates add column if not exists informed_time text not null default '';
alter table public.candidates add column if not exists decided_by text not null default '';
alter table public.candidates add column if not exists decided_at timestamptz;
alter table public.candidates add column if not exists joining_time text not null default '';
-- After the letter: the call that fixes the joining, and the joining day and time the candidate confirmed on it.
alter table public.candidates add column if not exists joining_call_date date;
alter table public.candidates add column if not exists joining_call_time text not null default '';
alter table public.candidates add column if not exists joining_confirmed_date date;
alter table public.candidates add column if not exists joining_confirmed_time text not null default '';
-- Running totals of the time HR spent with this CV open. Kept up to date from cv_review_sessions.
alter table public.candidates add column if not exists review_seconds int not null default 0;
alter table public.candidates add column if not exists review_count int not null default 0;
-- The handover from CV screening to the process team. An empty list means the whole process team.
alter table public.candidates add column if not exists assigned_to uuid[] not null default '{}';
alter table public.candidates add column if not exists handover_note text not null default '';
alter table public.candidates add column if not exists handed_over_by text not null default '';
alter table public.candidates add column if not exists handed_over_at timestamptz;
-- What HR noted on the joining call: a condition the candidate set, why the day moved, anything worth keeping.
alter table public.candidates add column if not exists joining_remarks text not null default '';

-- A panel's score is the average of its interviewers, so it can be a fraction.
alter table public.candidates alter column primary_score type numeric(4, 1);
alter table public.candidates alter column secondary_score type numeric(4, 1);

update public.candidates set call_date = called_at::date where call_date is null and called_at is not null;
update public.candidates
  set primary_panel = jsonb_build_array(jsonb_build_object('name', primary_interviewer, 'score', primary_score, 'referred', false))
  where primary_panel = '[]' and primary_score is not null;
update public.candidates
  set secondary_panel = jsonb_build_array(jsonb_build_object('name', secondary_interviewer, 'score', secondary_score, 'referred', false))
  where secondary_panel = '[]' and secondary_score is not null;
-- Anyone selected before the merit and waiting lists existed was the chosen candidate.
update public.candidates set selection_category = 'merit' where secondary_status = 'selected' and selection_category is null;

alter table public.candidates drop constraint if exists selection_category_values;
alter table public.candidates add constraint selection_category_values
  check (selection_category is null or selection_category in ('merit', 'waiting'));
-- Everyone who passes the final interview is on exactly one list, and no one else is on either.
alter table public.candidates drop constraint if exists category_needs_selection;
alter table public.candidates add constraint category_needs_selection
  check ((secondary_status = 'selected') = (selection_category is not null));
-- Offers go to the merit list. The waiting list has to be moved to merit by hand first.
alter table public.candidates drop constraint if exists offer_needs_merit;
alter table public.candidates add constraint offer_needs_merit
  check (joining_status in ('pending', 'declined') or selection_category = 'merit');

-- An offer already out with a joining date was a confirmation letter under the old screens.
update public.candidates
  set final_decision = 'confirmed',
      decision_date = coalesce(selected_at::date, current_date),
      decided_at = coalesce(offer_sent_at, now())
  where final_decision is null and selection_category = 'merit'
    and joining_status in ('offer_sent', 'accepted', 'joined') and joining_date is not null;

alter table public.candidates drop constraint if exists final_decision_values;
alter table public.candidates add constraint final_decision_values
  check (final_decision is null or final_decision in ('confirmed', 'rejected'));
-- A confirmation needs a merit candidate, the day they were selected and the day they join.
alter table public.candidates drop constraint if exists confirmed_needs_details;
alter table public.candidates add constraint confirmed_needs_details
  check (final_decision is distinct from 'confirmed' or (
    secondary_status = 'selected' and selection_category = 'merit'
    and decision_date is not null and joining_date is not null and joining_status <> 'pending'
  ));
-- A rejection needs the day it was decided, and cannot hold an offer.
alter table public.candidates drop constraint if exists rejected_needs_details;
alter table public.candidates add constraint rejected_needs_details
  check (final_decision is distinct from 'rejected' or (
    secondary_status = 'rejected' and decision_date is not null and joining_status = 'pending'
  ));
-- The candidate confirms a joining day on the joining call, so there is no confirmed day without
-- that call, and the day cannot come before it.
alter table public.candidates drop constraint if exists joining_confirmed_needs_call;
alter table public.candidates add constraint joining_confirmed_needs_call
  check (joining_confirmed_date is null or (
    final_decision = 'confirmed' and joining_call_date is not null and joining_confirmed_date >= joining_call_date
  ));

create index if not exists candidates_bucket_idx on public.candidates (bucket_id);
create index if not exists candidates_phone_idx on public.candidates (phone);
create index if not exists candidates_email_idx on public.candidates (lower(email));
create index if not exists candidates_secondary_idx on public.candidates (secondary_status);
create index if not exists postings_requisition_idx on public.job_postings (requisition_id);
create index if not exists buckets_requisition_idx on public.cv_buckets (requisition_id);

create table if not exists public.candidate_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  field text not null,
  from_value text,
  to_value text,
  actor_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists candidate_events_candidate_idx on public.candidate_events (candidate_id, created_at);
-- Who did it, by account, so Team activity can count each person's work even after a name changes.
alter table public.candidate_events add column if not exists actor_id uuid;
create index if not exists candidate_events_created_idx on public.candidate_events (created_at desc);

create table if not exists public.message_log (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  template_key text not null default '',
  channel text not null,
  body text not null,
  sent_by text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists message_log_candidate_idx on public.message_log (candidate_id);

create table if not exists public.candidate_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  stage text not null check (stage in ('primary', 'secondary')),
  token uuid not null unique default gen_random_uuid(),
  invited_at timestamptz not null default now(),
  submitted_at timestamptz,
  overall int check (overall between 1 and 5),
  communication int check (communication between 1 and 5),
  professionalism int check (professionalism between 1 and 5),
  clarity int check (clarity between 1 and 5),
  would_recommend boolean,
  comments text not null default '',
  unique (candidate_id, stage)
);

-- One row per review: from opening a candidate's CV to closing it.
create table if not exists public.cv_review_sessions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  reviewer_name text not null default '',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  seconds int not null check (seconds >= 0)
);

create index if not exists cv_review_sessions_candidate_idx on public.cv_review_sessions (candidate_id, started_at);
alter table public.cv_review_sessions add column if not exists reviewer_id uuid default auth.uid();
create index if not exists cv_review_sessions_started_idx on public.cv_review_sessions (started_at desc);

create or replace function public.add_review_time()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.candidates
    set review_seconds = review_seconds + new.seconds, review_count = review_count + 1
    where id = new.candidate_id;
  return new;
end;
$$;

drop trigger if exists cv_review_sessions_total on public.cv_review_sessions;
create trigger cv_review_sessions_total
  after insert on public.cv_review_sessions
  for each row execute function public.add_review_time();

-- A review is always credited to whoever is signed in, whatever name a client sends.
create or replace function public.stamp_review_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.reviewer_id := auth.uid();
    new.reviewer_name := coalesce(
      (select coalesce(nullif(full_name, ''), email, '') from public.profiles where id = auth.uid()), new.reviewer_name);
  end if;
  return new;
end;
$$;

drop trigger if exists cv_review_sessions_stamp on public.cv_review_sessions;
create trigger cv_review_sessions_stamp
  before insert on public.cv_review_sessions
  for each row execute function public.stamp_review_session();

-- A confirmation letter or a final rejection locks the process, whatever a client sends. Only an admin
-- can unlock it, by clearing the decision. Joining paperwork and the joining outcome stay editable.
-- With no signed-in user (the SQL Editor), nothing is enforced, so a database owner can still repair data.
-- The details each step records, which an approved correction of that step may change. Never a status:
-- a correction fixes what was written down, not where the candidate stands.
create or replace function public.edit_step_fields(p_step text)
returns text[] language sql immutable set search_path = '' as $$
  select case p_step
    when 'call' then array['call_date', 'call_time', 'confirmed_date', 'confirmed_time', 'call_rejected_date', 'call_rejected_time', 'followup_on', 'followup_time', 'call_note']
    when 'primary_schedule' then array['primary_date', 'primary_time', 'message_channel']
    when 'primary' then array['primary_panel', 'primary_score', 'primary_interviewer', 'primary_feedback']
    when 'final_schedule' then array['secondary_date', 'secondary_time']
    when 'final' then array['secondary_panel', 'secondary_score', 'secondary_interviewer', 'secondary_feedback']
    when 'decision' then array['decision_date', 'decision_time', 'informed_date', 'informed_time', 'joining_date', 'joining_time']
    else array[]::text[]
  end
$$;

create or replace function public.edit_step_label(p_step text)
returns text language sql immutable set search_path = '' as $$
  select case p_step
    when 'call' then 'Call' when 'primary_schedule' then 'Primary schedule' when 'primary' then 'Primary interview'
    when 'final_schedule' then 'Final schedule' when 'final' then 'Final interview' when 'decision' then 'Final decision'
    else p_step
  end
$$;

create or replace function public.protect_final_decision()
returns trigger language plpgsql set search_path = '' as $$
declare
  field_name text;
  grant_step text;
  locked_fields text[] := array[
    'screening_status', 'call_status', 'call_date', 'call_time', 'confirmed_date', 'confirmed_time', 'call_rejected_date', 'call_rejected_time',
    'message_status', 'primary_status', 'primary_date', 'primary_time', 'primary_panel', 'primary_score',
    'secondary_message_status', 'secondary_status', 'secondary_date', 'secondary_time', 'secondary_panel', 'secondary_score',
    'selection_category', 'final_decision', 'decision_date', 'decision_time', 'informed_date', 'informed_time',
    'joining_date', 'joining_time'
  ];
begin
  if old.final_decision is null or auth.uid() is null then
    return new;
  end if;
  if new.final_decision is null then
    if public.is_admin() then
      return new;
    end if;
    raise exception 'Only an admin can unlock a final decision.';
  end if;
  -- A correction an admin approved, applied through apply_edit, may change its own step's details and nothing else.
  -- The request has to be approved, for this candidate, and asked for by whoever is signed in.
  if coalesce(current_setting('app.edit_grant', true), '') <> '' then
    select r.step into grant_step from public.edit_requests r
      where r.id = current_setting('app.edit_grant', true)::uuid
        and r.candidate_id = new.id and r.requested_by = auth.uid() and r.status = 'approved';
  end if;
  foreach field_name in array locked_fields loop
    if (to_jsonb(old) ->> field_name) is distinct from (to_jsonb(new) ->> field_name)
       and not (grant_step is not null and field_name = any (public.edit_step_fields(grant_step))) then
      raise exception 'This candidate''s process is locked. An admin has to unlock it first.';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists candidates_protect_decision on public.candidates;
create trigger candidates_protect_decision
  before update on public.candidates
  for each row execute function public.protect_final_decision();

-- Desks: the screening desk uploads, screens and hands over; the process desk does every step after that.
-- Profile details (contact, education and so on) stay open to both. Desk 'all' and the SQL Editor are not limited.
create or replace function public.enforce_desk()
returns trigger language plpgsql set search_path = '' as $$
declare
  my_desk text;
  field_name text;
  screening_fields text[] := array[
    'screening_status', 'screening_note', 'assigned_to', 'handover_note', 'handed_over_by', 'handed_over_at'
  ];
  process_fields text[] := array[
    'call_status', 'call_note', 'followup_on', 'followup_time', 'called_at', 'called_by', 'call_date', 'call_time',
    'confirmed_date', 'confirmed_time', 'call_rejected_date', 'call_rejected_time',
    'message_status', 'message_sent_at', 'message_channel',
    'primary_status', 'primary_date', 'primary_time', 'primary_interviewer', 'primary_score', 'primary_feedback', 'primary_panel',
    'secondary_message_status', 'secondary_message_sent_at', 'secondary_status', 'secondary_date', 'secondary_time',
    'secondary_interviewer', 'secondary_score', 'secondary_feedback', 'secondary_panel', 'selection_category',
    'final_decision', 'decision_date', 'decision_time', 'informed_date', 'informed_time', 'decided_by', 'decided_at',
    'joining_status', 'joining_date', 'joining_time', 'joining_call_date', 'joining_call_time',
    'joining_confirmed_date', 'joining_confirmed_time', 'joining_remarks', 'offered_salary', 'employee_code', 'probation_period',
    'reporting_to', 'documents_received', 'offer_sent_at'
  ];
begin
  if auth.uid() is null then
    return new;
  end if;
  my_desk := coalesce(public.app_desk(), 'all');
  if my_desk = 'all' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if my_desk = 'process' then
      raise exception 'CVs are uploaded from the CV screening desk.';
    end if;
    return new;
  end if;
  if my_desk = 'process' then
    foreach field_name in array screening_fields loop
      if (to_jsonb(old) ->> field_name) is distinct from (to_jsonb(new) ->> field_name) then
        raise exception 'CV screening and the handover are done from the CV screening desk.';
      end if;
    end loop;
  else
    -- An admin on the screening desk can still unlock a decision made by mistake.
    if public.is_admin() and old.final_decision is not null and new.final_decision is null then
      return new;
    end if;
    foreach field_name in array process_fields loop
      if (to_jsonb(old) ->> field_name) is distinct from (to_jsonb(new) ->> field_name) then
        raise exception 'This step belongs to the process team. An admin can change your desk under Settings > Team.';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_enforce_desk on public.candidates;
create trigger candidates_enforce_desk
  before insert or update on public.candidates
  for each row execute function public.enforce_desk();

-- "Nafis", "Nafis, Mili" or "Whole process team", for the audit trail.
create or replace function public.handler_names(p_assigned uuid[])
returns text language sql stable security definer set search_path = '' as $$
  select case when cardinality(coalesce(p_assigned, '{}')) = 0 then 'Whole process team' else coalesce(
    (select string_agg(coalesce(nullif(p.full_name, ''), p.email, '?'), ', ' order by array_position(p_assigned, p.id))
     from public.profiles p where p.id = any (p_assigned)), '') end
$$;

-- Status changes write their own audit trail, so history cannot be skipped by any client.
create or replace function public.log_candidate_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor text;
  field_name text;
  old_value text;
  new_value text;
  tracked text[] := array[
    'screening_status', 'call_status', 'message_status', 'primary_status',
    'secondary_message_status', 'secondary_status', 'selection_category', 'final_decision', 'joining_status', 'bucket_id'
  ];
begin
  select coalesce(full_name, email, '') into actor from public.profiles where id = auth.uid();
  actor := coalesce(actor, 'Candidate / system');

  if tg_op = 'INSERT' then
    insert into public.candidate_events (candidate_id, field, to_value, actor_name, actor_id)
    values (new.id, 'received', new.source, actor, auth.uid());
    return new;
  end if;

  foreach field_name in array tracked loop
    old_value := to_jsonb(old) ->> field_name;
    new_value := to_jsonb(new) ->> field_name;
    if old_value is distinct from new_value then
      insert into public.candidate_events (candidate_id, field, from_value, to_value, actor_name, actor_id)
      values (new.id, field_name, old_value, new_value, actor, auth.uid());
    end if;
  end loop;

  -- The handover, and any later change of hands: who the candidate went to, by name.
  if new.screening_status = 'shortlisted'
     and (old.screening_status is distinct from 'shortlisted' or old.assigned_to is distinct from new.assigned_to) then
    insert into public.candidate_events (candidate_id, field, from_value, to_value, actor_name, actor_id)
    values (
      new.id, 'assigned_to',
      case when old.screening_status = 'shortlisted' then public.handler_names(old.assigned_to) end,
      public.handler_names(new.assigned_to), actor, auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_events on public.candidates;
create trigger candidates_events
  after insert or update on public.candidates
  for each row execute function public.log_candidate_events();

-- ---------------------------------------------------------------------------
-- Notifications: new CVs and postings reach the team, a handover reaches the process desk, and every
-- step the process desk completes reaches the screening desk. Written only by the triggers below.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  event text not null,
  actor_name text not null default '',
  item_count int not null default 1,
  subject text not null default '',
  designation text not null default '',
  detail text not null default '',
  candidate_id uuid references public.candidates (id) on delete cascade,
  bucket_id uuid references public.cv_buckets (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- Staff who can act, on one desk (or any desk when p_desk is null). On the process desk, a candidate
-- handed to named people reaches only them; an empty list reaches the whole process team.
create or replace function public.team_members(p_desk text, p_assigned uuid[] default '{}')
returns table (member_id uuid) language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p
  where p.role in ('admin', 'hr')
    and (p_desk is null or p.desk in (p_desk, 'all'))
    and (p_desk is distinct from 'process' or cardinality(coalesce(p_assigned, '{}')) = 0 or p.id = any (p_assigned))
$$;

create or replace function public.actor_name()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select coalesce(nullif(full_name, ''), email, '') from public.profiles where id = auth.uid()), '')
$$;

-- Several new CVs or handovers from one person to one bucket add up on one unread line, so a bulk upload
-- of 500 CVs is one notification, not 500.
create or replace function public.push_notification(
  p_recipient uuid, p_event text, p_actor text, p_bucket uuid, p_candidate uuid,
  p_subject text, p_designation text, p_detail text, p_count int, p_merge boolean
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_merge then
    update public.notifications set
      item_count = item_count + p_count,
      subject = p_subject,
      candidate_id = p_candidate,
      detail = case when p_detail <> '' then p_detail else detail end,
      created_at = now()
    where recipient_id = p_recipient and event = p_event and bucket_id is not distinct from p_bucket
      and actor_name = p_actor and read_at is null and created_at > now() - interval '12 hours';
    if found then
      return;
    end if;
  end if;
  insert into public.notifications (recipient_id, event, actor_name, item_count, subject, designation, detail, candidate_id, bucket_id)
  values (p_recipient, p_event, p_actor, p_count, coalesce(p_subject, ''), coalesce(p_designation, ''), coalesce(p_detail, ''), p_candidate, p_bucket);
end;
$$;

create or replace function public.notify_new_cvs()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor text := case when auth.uid() is null then 'Company form' else public.actor_name() end;
  grp record;
  recipient uuid;
begin
  for grp in
    select a.bucket_id, count(*)::int as n, (array_agg(a.id order by a.created_at desc))[1] as one_id,
           (array_agg(a.full_name order by a.created_at desc))[1] as one_name, b.designation
    from added a join public.cv_buckets b on b.id = a.bucket_id
    group by a.bucket_id, b.designation
  loop
    for recipient in select member_id from public.team_members(null) where member_id is distinct from actor_id loop
      perform public.push_notification(recipient, 'new_cvs', actor, grp.bucket_id, grp.one_id, grp.one_name, grp.designation, '', grp.n, true);
    end loop;
  end loop;
  return null;
end;
$$;

drop trigger if exists candidates_notify_new on public.candidates;
create trigger candidates_notify_new
  after insert on public.candidates
  referencing new table as added
  for each statement execute function public.notify_new_cvs();

create or replace function public.notify_candidate_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor text;
  designation_name text;
  ev text;
  extra text := '';
  recipient uuid;
begin
  -- Only people make handovers and complete steps; repairs from the SQL Editor notify nobody.
  if actor_id is null then
    return new;
  end if;
  actor := public.actor_name();
  select designation into designation_name from public.cv_buckets where id = new.bucket_id;

  -- The handover: the screening desk selected the CV, so the process team takes it from here.
  if new.screening_status = 'shortlisted' and old.screening_status is distinct from 'shortlisted' then
    for recipient in select member_id from public.team_members('process', new.assigned_to) where member_id <> actor_id loop
      perform public.push_notification(recipient, 'handover', actor, new.bucket_id, new.id, new.full_name, designation_name, new.handover_note, 1, true);
    end loop;
    return new;
  end if;

  -- Handed to someone else later: only the people newly given the candidate hear about it.
  if new.screening_status = 'shortlisted' and new.final_decision is null and old.assigned_to is distinct from new.assigned_to then
    for recipient in
      select member_id from public.team_members('process', new.assigned_to)
      except select member_id from public.team_members('process', old.assigned_to)
    loop
      if recipient <> actor_id then
        perform public.push_notification(recipient, 'handover', actor, new.bucket_id, new.id, new.full_name, designation_name, new.handover_note, 1, true);
      end if;
    end loop;
  end if;

  -- One update is one step: report the latest stage it reached.
  ev := case
    when new.joining_status is distinct from old.joining_status and new.joining_status in ('accepted', 'joined', 'declined') then
      case new.joining_status when 'accepted' then 'joining_accepted' when 'joined' then 'joined' else 'joining_declined' end
    when new.final_decision is distinct from old.final_decision and new.final_decision is not null then 'decision_' || new.final_decision
    when new.secondary_status is distinct from old.secondary_status and new.secondary_status in ('scheduled', 'selected', 'rejected') then 'final_' || new.secondary_status
    when new.primary_status is distinct from old.primary_status and new.primary_status in ('selected', 'rejected') then 'primary_' || new.primary_status
    when new.message_status is distinct from old.message_status and new.message_status = 'message_done' then 'primary_scheduled'
    when new.call_status is distinct from old.call_status and new.call_status in ('confirm', 'reject') then 'call_' || new.call_status
  end;
  -- The screening desk hears only about the big decisions: the final decision and how the joining ended.
  -- Every other step still shows on its dashboard, under Process team progress.
  if ev is null or ev not in ('decision_confirmed', 'decision_rejected', 'joined', 'joining_declined') then
    return new;
  end if;
  extra := case ev
    when 'primary_scheduled' then btrim(coalesce(new.primary_date::text, '') || ' ' || new.primary_time)
    when 'final_scheduled' then btrim(coalesce(new.secondary_date::text, '') || ' ' || new.secondary_time)
    when 'decision_confirmed' then btrim(coalesce(new.joining_date::text, '') || ' ' || new.joining_time)
    when 'joining_accepted' then btrim(coalesce(new.joining_confirmed_date::text, '') || ' ' || new.joining_confirmed_time)
    else ''
  end;
  for recipient in select member_id from public.team_members('screening') where member_id <> actor_id loop
    perform public.push_notification(recipient, ev, actor, new.bucket_id, new.id, new.full_name, designation_name, extra, 1, false);
  end loop;
  return new;
end;
$$;

drop trigger if exists candidates_notify_changes on public.candidates;
create trigger candidates_notify_changes
  after update on public.candidates
  for each row execute function public.notify_candidate_changes();

create or replace function public.notify_new_posting()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor text := public.actor_name();
  designation_name text;
  bucket uuid;
  recipient uuid;
begin
  select designation into designation_name from public.requisitions where id = new.requisition_id;
  select id into bucket from public.cv_buckets where requisition_id = new.requisition_id order by created_at limit 1;
  for recipient in select member_id from public.team_members(null) where member_id is distinct from actor_id loop
    perform public.push_notification(recipient, 'posting', actor, bucket, null, '', designation_name, new.media, 1, false);
  end loop;
  return new;
end;
$$;

drop trigger if exists job_postings_notify on public.job_postings;
create trigger job_postings_notify
  after insert on public.job_postings
  for each row execute function public.notify_new_posting();

-- ---------------------------------------------------------------------------
-- Corrections: a step recorded wrongly is corrected only after an admin (GM, AGM, DGM) approves.
-- HR asks with a reason; an admin approves or turns it down; the person who asked then corrects that one
-- step once, even after the final decision locked the process. Every request and correction stays on record.
-- Written only through the functions below, never directly.
-- ---------------------------------------------------------------------------
create table if not exists public.edit_requests (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  step text not null check (step in ('call', 'primary_schedule', 'primary', 'final_schedule', 'final', 'decision')),
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'used', 'cancelled')),
  requested_by uuid not null references public.profiles (id) on delete cascade,
  requested_by_name text not null default '',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_by_name text not null default '',
  decided_at timestamptz,
  decision_note text not null default '',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists edit_requests_candidate_idx on public.edit_requests (candidate_id, created_at desc);
-- One open request per person, candidate and step.
create unique index if not exists edit_requests_open_idx on public.edit_requests (candidate_id, step, requested_by)
  where status in ('pending', 'approved');

create or replace function public.request_edit(p_candidate uuid, p_step text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cand public.candidates%rowtype;
  actor text := public.actor_name();
  reason_text text := left(btrim(coalesce(p_reason, '')), 1000);
  new_id uuid;
  recipient uuid;
begin
  if not public.can_write() then
    raise exception 'Only HR and admins can ask for a correction.';
  end if;
  if cardinality(public.edit_step_fields(p_step)) = 0 then
    raise exception 'There is no step called %.', p_step;
  end if;
  if length(reason_text) < 3 then
    raise exception 'Say what was entered wrongly, so the approver knows what to check.';
  end if;
  select * into cand from public.candidates where id = p_candidate;
  if not found then
    raise exception 'This candidate was not found.';
  end if;
  if exists (select 1 from public.edit_requests where candidate_id = p_candidate and step = p_step
             and requested_by = auth.uid() and status in ('pending', 'approved')) then
    raise exception 'You already asked to correct this step. It is waiting for an answer, or approved and ready for you.';
  end if;
  insert into public.edit_requests (candidate_id, step, reason, requested_by, requested_by_name)
  values (p_candidate, p_step, reason_text, auth.uid(), actor)
  returning id into new_id;
  for recipient in select id from public.profiles where role = 'admin' and id <> auth.uid() loop
    perform public.push_notification(recipient, 'edit_request', actor, cand.bucket_id, cand.id, cand.full_name,
      (select designation from public.cv_buckets where id = cand.bucket_id),
      public.edit_step_label(p_step) || ': ' || left(reason_text, 200), 1, false);
  end loop;
  return (select to_jsonb(r) from public.edit_requests r where r.id = new_id);
end;
$$;

create or replace function public.decide_edit(p_request uuid, p_approve boolean, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  req public.edit_requests%rowtype;
  cand public.candidates%rowtype;
  actor text := public.actor_name();
  note_text text := left(btrim(coalesce(p_note, '')), 1000);
begin
  if not public.is_admin() then
    raise exception 'Only an admin can answer a correction request.';
  end if;
  select * into req from public.edit_requests where id = p_request for update;
  if not found then
    raise exception 'This correction request was not found.';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request was already answered or withdrawn.';
  end if;
  update public.edit_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_by_name = actor, decided_at = now(), decision_note = note_text
  where id = p_request;
  if req.requested_by is distinct from auth.uid() then
    select * into cand from public.candidates where id = req.candidate_id;
    perform public.push_notification(req.requested_by, case when p_approve then 'edit_approved' else 'edit_rejected' end,
      actor, cand.bucket_id, cand.id, cand.full_name, (select designation from public.cv_buckets where id = cand.bucket_id),
      public.edit_step_label(req.step) || case when note_text <> '' then ': ' || left(note_text, 200) else '' end, 1, false);
  end if;
  return (select to_jsonb(r) from public.edit_requests r where r.id = p_request);
end;
$$;

-- The person who asked can withdraw a request that is still open.
create or replace function public.cancel_edit(p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.edit_requests set status = 'cancelled'
  where id = p_request and requested_by = auth.uid() and status in ('pending', 'approved');
  if not found then
    raise exception 'Only an open request of your own can be withdrawn.';
  end if;
  return (select to_jsonb(r) from public.edit_requests r where r.id = p_request);
end;
$$;

-- Applies an approved correction: only the fields of its step, once. The desk rules still apply, and the
-- History keeps every value before and after.
create or replace function public.apply_edit(p_request uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  req public.edit_requests%rowtype;
  cur public.candidates%rowtype;
  nxt public.candidates%rowtype;
  allowed text[];
  field_name text;
  old_value text;
  new_value text;
  assignments text[] := '{}';
  summary text[] := '{}';
  actor text := public.actor_name();
begin
  if not public.can_write() then
    raise exception 'Only HR and admins can correct a step.';
  end if;
  select * into req from public.edit_requests where id = p_request for update;
  if not found or req.requested_by is distinct from auth.uid() then
    raise exception 'This correction request was not found.';
  end if;
  if req.status <> 'approved' then
    raise exception 'This correction is not approved, or it was already used.';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'object' then
    raise exception 'Nothing to correct.';
  end if;
  allowed := public.edit_step_fields(req.step);
  select * into cur from public.candidates where id = req.candidate_id;
  nxt := jsonb_populate_record(cur, p_changes);
  for field_name in select jsonb_object_keys(p_changes) loop
    if not field_name = any (allowed) then
      raise exception 'A correction of the % step cannot change %.', lower(public.edit_step_label(req.step)), field_name;
    end if;
    old_value := to_jsonb(cur) ->> field_name;
    new_value := to_jsonb(nxt) ->> field_name;
    if old_value is distinct from new_value then
      assignments := assignments || format('%I = ($1).%I', field_name, field_name);
      summary := summary || format('%s: %s -> %s', field_name, coalesce(nullif(old_value, ''), '-'), coalesce(nullif(new_value, ''), '-'));
    end if;
  end loop;
  if cardinality(assignments) = 0 then
    raise exception 'Nothing was changed.';
  end if;
  perform set_config('app.edit_grant', req.id::text, true);
  execute format('update public.candidates set %s where id = ($1).id', array_to_string(assignments, ', ')) using nxt;
  perform set_config('app.edit_grant', '', true);
  update public.edit_requests set status = 'used', used_at = now() where id = req.id;
  insert into public.candidate_events (candidate_id, field, from_value, to_value, actor_name, actor_id)
  values (cur.id, 'correction', req.step, array_to_string(summary, '; '), actor, auth.uid());
  if req.decided_by is not null and req.decided_by <> auth.uid() then
    perform public.push_notification(req.decided_by, 'edit_used', actor, cur.bucket_id, cur.id, cur.full_name,
      (select designation from public.cv_buckets where id = cur.bucket_id), public.edit_step_label(req.step), 1, false);
  end if;
  return (select to_jsonb(r) from public.edit_requests r where r.id = req.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Question library: written test, MCQ and interview questions, to build question papers from
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('written', 'mcq', 'interview')),
  question text not null check (length(btrim(question)) > 0),
  -- MCQ only: the choices in order, and which one is right (counted from 0).
  options jsonb not null default '[]',
  correct_option int,
  -- Written and interview: the model answer, or what a good answer covers.
  answer text not null default '',
  marks numeric(5, 1) not null default 1 check (marks >= 0),
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  -- Blank means the question suits any department or post.
  department text not null default '',
  designation text not null default '',
  topic text not null default '',
  -- Interview only: which round it is meant for.
  round text not null default 'any' check (round in ('any', 'primary', 'final')),
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mcq_needs_choices check (
    kind <> 'mcq' or (
      jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8
      and correct_option is not null and correct_option between 0 and jsonb_array_length(options) - 1
    )
  )
);

create index if not exists questions_kind_idx on public.questions (kind, department, designation);

create or replace function public.stamp_question_author()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.created_by_name := coalesce((select coalesce(nullif(full_name, ''), email, '') from public.profiles where id = auth.uid()), '');
  end if;
  return new;
end;
$$;

drop trigger if exists questions_stamp_author on public.questions;
create trigger questions_stamp_author
  before insert on public.questions
  for each row execute function public.stamp_question_author();

-- Stamps selection time so time-to-hire can be measured.
create or replace function public.track_selection()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.secondary_status is distinct from old.secondary_status then
    if new.secondary_status = 'selected' then
      new.selected_at := now();
    else
      new.selected_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_track_selection on public.candidates;
create trigger candidates_track_selection
  before update on public.candidates
  for each row execute function public.track_selection();

drop trigger if exists candidates_touch on public.candidates;
create trigger candidates_touch before update on public.candidates
  for each row execute function public.touch_updated_at();
drop trigger if exists requisitions_touch on public.requisitions;
create trigger requisitions_touch before update on public.requisitions
  for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();
drop trigger if exists message_templates_touch on public.message_templates;
create trigger message_templates_touch before update on public.message_templates
  for each row execute function public.touch_updated_at();
drop trigger if exists document_templates_touch on public.document_templates;
create trigger document_templates_touch before update on public.document_templates
  for each row execute function public.touch_updated_at();
drop trigger if exists questions_touch on public.questions;
create trigger questions_touch before update on public.questions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.message_templates enable row level security;
alter table public.document_templates enable row level security;
alter table public.app_secrets enable row level security;
alter table public.designations enable row level security;
alter table public.requisitions enable row level security;
alter table public.job_postings enable row level security;
alter table public.cv_buckets enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_events enable row level security;
alter table public.message_log enable row level security;
alter table public.candidate_reviews enable row level security;
alter table public.cv_review_sessions enable row level security;
alter table public.notifications enable row level security;
alter table public.questions enable row level security;
alter table public.edit_requests enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_read());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles for delete to authenticated
  using (public.is_admin());

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to authenticated using (public.can_read());
drop policy if exists settings_insert on public.settings;
create policy settings_insert on public.settings for insert to authenticated with check (public.can_write());
drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Standard shape for working tables: staff read, admin and HR write, only admin deletes.
do $$
declare
  t text;
begin
  foreach t in array array[
    'message_templates', 'document_templates', 'designations', 'requisitions',
    'job_postings', 'cv_buckets', 'candidates', 'message_log', 'candidate_reviews', 'questions'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read())', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write()) with check (public.can_write())', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_delete', t);
  end loop;
end;
$$;

-- HR can remove a posting it entered by mistake; postings hold no candidate data themselves.
drop policy if exists job_postings_delete on public.job_postings;
create policy job_postings_delete on public.job_postings for delete to authenticated using (public.can_write());
-- Questions hold no candidate data either: HR can remove one it no longer wants.
drop policy if exists questions_delete on public.questions;
create policy questions_delete on public.questions for delete to authenticated using (public.can_write());
-- HR can delete an empty CV bucket. One that holds candidates cannot go while they are in it, and only an
-- admin can delete candidates, so only an admin can delete a bucket with its CVs.
drop policy if exists cv_buckets_delete on public.cv_buckets;
create policy cv_buckets_delete on public.cv_buckets for delete to authenticated using (public.can_write());

-- Correction requests: staff read them; they are written only by request_edit, decide_edit, cancel_edit and apply_edit.
drop policy if exists edit_requests_select on public.edit_requests;
create policy edit_requests_select on public.edit_requests for select to authenticated using (public.can_read());
revoke insert, update, delete on public.edit_requests from anon, authenticated;

drop policy if exists candidate_events_select on public.candidate_events;
create policy candidate_events_select on public.candidate_events for select to authenticated using (public.can_read());

-- Review time can be added but not edited afterwards: it is a record of what happened.
drop policy if exists cv_review_sessions_select on public.cv_review_sessions;
create policy cv_review_sessions_select on public.cv_review_sessions for select to authenticated using (public.can_read());
drop policy if exists cv_review_sessions_insert on public.cv_review_sessions;
create policy cv_review_sessions_insert on public.cv_review_sessions for insert to authenticated with check (public.can_write());

-- Each person sees and clears only their own notifications, and can only mark them read.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated using (recipient_id = auth.uid());
revoke all on public.notifications from anon;
revoke insert, update on public.notifications from authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Public functions for the application and review forms (no login)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_bucket(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'designation', b.designation,
    'department', b.department,
    'company', coalesce(nullif(b.company, ''), s.default_company),
    'group_name', s.group_name,
    'description', b.description,
    'job_description', coalesce(r.job_description, ''),
    'accepting', b.accepting_applications and b.status = 'Open'
  )
  from public.cv_buckets b
  left join public.requisitions r on r.id = b.requisition_id
  left join public.settings s on s.id = 1
  where b.code = p_code
$$;

create or replace function public.submit_application(
  p_code text, p_payload jsonb, p_cv_path text, p_photo_path text, p_cv_file_name text, p_website text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  bucket public.cv_buckets%rowtype;
  name_value text := left(btrim(coalesce(p_payload ->> 'full_name', '')), 200);
  phone_value text := left(btrim(coalesce(p_payload ->> 'phone', '')), 40);
  email_value text := left(lower(btrim(coalesce(p_payload ->> 'email', ''))), 200);
  digits text;
  dob date;
  new_id uuid;
begin
  -- Honeypot: real applicants never see this field. Bots get a normal-looking reply.
  if coalesce(p_website, '') <> '' then
    return jsonb_build_object('ok', true);
  end if;

  select * into bucket from public.cv_buckets where code = p_code;
  if not found or not bucket.accepting_applications or bucket.status <> 'Open' then
    raise exception 'This position is not accepting applications.';
  end if;

  if length(name_value) < 2 then
    raise exception 'Name is required.';
  end if;

  -- Without the country prefix, so +880 1711... and 01711... count as the same number.
  digits := regexp_replace(regexp_replace(phone_value, '\D', '', 'g'), '^88', '');
  if length(digits) < 10 then
    raise exception 'A valid mobile number is required.';
  end if;

  if (select count(*) from public.candidates
      where bucket_id = bucket.id and parse_method = 'form' and received_at > now() - interval '1 hour') >= 300 then
    raise exception 'Too many applications right now. Please try again later.';
  end if;

  -- Same person applying twice to one position: keep the first record, reply as usual.
  if exists (select 1 from public.candidates
             where bucket_id = bucket.id
               and regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^88', '') = digits) then
    return jsonb_build_object('ok', true);
  end if;

  if coalesce(p_cv_path, '') <> '' and p_cv_path not like 'applications/%' then
    raise exception 'Invalid file reference.';
  end if;
  if coalesce(p_photo_path, '') <> '' and p_photo_path not like 'applications/%' then
    raise exception 'Invalid file reference.';
  end if;

  begin
    dob := nullif(p_payload ->> 'date_of_birth', '')::date;
  exception when others then
    dob := null;
  end;

  insert into public.candidates (
    bucket_id, source, parse_method, full_name, email, phone, alt_phone, address, permanent_address,
    date_of_birth, father_name, mother_name, spouse_name, gender, marital_status, religion, nationality,
    blood_group, national_id, tin_no, passport_no, linkedin, current_designation, current_company, industry,
    total_experience_years, present_salary, expected_salary, notice_period, career_summary,
    education, experience, training, skills, languages, references_list,
    cv_path, cv_file_name, photo_path
  ) values (
    bucket.id, 'Company form', 'form', name_value, email_value, phone_value,
    left(coalesce(p_payload ->> 'alt_phone', ''), 40),
    left(coalesce(p_payload ->> 'address', ''), 500),
    left(coalesce(p_payload ->> 'permanent_address', ''), 500),
    dob,
    left(coalesce(p_payload ->> 'father_name', ''), 200),
    left(coalesce(p_payload ->> 'mother_name', ''), 200),
    left(coalesce(p_payload ->> 'spouse_name', ''), 200),
    left(coalesce(p_payload ->> 'gender', ''), 30),
    left(coalesce(p_payload ->> 'marital_status', ''), 30),
    left(coalesce(p_payload ->> 'religion', ''), 50),
    left(coalesce(p_payload ->> 'nationality', ''), 60),
    left(coalesce(p_payload ->> 'blood_group', ''), 10),
    left(coalesce(p_payload ->> 'national_id', ''), 40),
    left(coalesce(p_payload ->> 'tin_no', ''), 40),
    left(coalesce(p_payload ->> 'passport_no', ''), 40),
    left(coalesce(p_payload ->> 'linkedin', ''), 300),
    left(coalesce(p_payload ->> 'current_designation', ''), 200),
    left(coalesce(p_payload ->> 'current_company', ''), 200),
    left(coalesce(p_payload ->> 'industry', ''), 100),
    case when coalesce(p_payload ->> 'total_experience_years', '') ~ '^\d{1,2}(\.\d+)?$'
      then (p_payload ->> 'total_experience_years')::numeric end,
    left(coalesce(p_payload ->> 'present_salary', ''), 100),
    left(coalesce(p_payload ->> 'expected_salary', ''), 100),
    left(coalesce(p_payload ->> 'notice_period', ''), 100),
    left(coalesce(p_payload ->> 'career_summary', ''), 4000),
    case when jsonb_typeof(p_payload -> 'education') = 'array' then p_payload -> 'education' else '[]'::jsonb end,
    case when jsonb_typeof(p_payload -> 'experience') = 'array' then p_payload -> 'experience' else '[]'::jsonb end,
    case when jsonb_typeof(p_payload -> 'training') = 'array' then p_payload -> 'training' else '[]'::jsonb end,
    case when jsonb_typeof(p_payload -> 'skills') = 'array'
      then array(select left(value, 100) from jsonb_array_elements_text(p_payload -> 'skills') limit 100) else '{}' end,
    case when jsonb_typeof(p_payload -> 'languages') = 'array'
      then array(select left(value, 100) from jsonb_array_elements_text(p_payload -> 'languages') limit 30) else '{}' end,
    case when jsonb_typeof(p_payload -> 'references_list') = 'array' then p_payload -> 'references_list' else '[]'::jsonb end,
    nullif(p_cv_path, ''), left(coalesce(p_cv_file_name, ''), 300), nullif(p_photo_path, '')
  ) returning id into new_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- A feedback link can be shared before or after its interview, and works until the candidate moves on:
-- the primary link until the final interview is scheduled, the final link until the final decision.
create or replace function public.review_is_open(p_stage text, c public.candidates)
returns boolean language sql stable set search_path = '' as $$
  select case p_stage
    when 'primary' then c.message_status = 'message_done' and c.secondary_status = 'pending'
    when 'secondary' then c.secondary_status <> 'pending' and c.final_decision is null
    else false
  end
$$;

create or replace function public.get_review_invite(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'first_name', split_part(c.full_name, ' ', 1),
    'designation', b.designation,
    'group_name', s.group_name,
    'stage', r.stage,
    'submitted', r.submitted_at is not null,
    'open', public.review_is_open(r.stage, c)
  )
  from public.candidate_reviews r
  join public.candidates c on c.id = r.candidate_id
  join public.cv_buckets b on b.id = c.bucket_id
  left join public.settings s on s.id = 1
  where r.token = p_token
$$;

create or replace function public.submit_review(
  p_token uuid, p_overall int, p_communication int, p_professionalism int, p_clarity int,
  p_would_recommend boolean, p_comments text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_overall is null or p_overall not between 1 and 5 then
    raise exception 'Overall rating is required.';
  end if;

  if exists (
    select 1 from public.candidate_reviews r join public.candidates c on c.id = r.candidate_id
    where r.token = p_token and r.submitted_at is null and not public.review_is_open(r.stage, c)
  ) then
    raise exception 'This feedback link has closed: the interview process has moved on.';
  end if;

  update public.candidate_reviews set
    overall = p_overall,
    communication = p_communication,
    professionalism = p_professionalism,
    clarity = p_clarity,
    would_recommend = p_would_recommend,
    comments = left(coalesce(p_comments, ''), 4000),
    submitted_at = now()
  where token = p_token and submitted_at is null;

  if not found then
    raise exception 'This review link is invalid or has already been used.';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- AI key: admins can set it and anyone on staff can see whether one exists, but nobody can read it back.
create or replace function public.set_ai_key(p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the AI key.';
  end if;
  if coalesce(btrim(p_key), '') = '' then
    delete from public.app_secrets where key = 'gemini_api_key';
  else
    insert into public.app_secrets (key, value) values ('gemini_api_key', btrim(p_key))
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  return public.ai_key_status();
end;
$$;

create or replace function public.ai_key_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.can_read() then jsonb_build_object(
    'configured', exists (select 1 from public.app_secrets where key = 'gemini_api_key'),
    'last4', (select right(value, 4) from public.app_secrets where key = 'gemini_api_key')
  ) else jsonb_build_object('configured', false) end
$$;

revoke all on function public.get_public_bucket(text) from public;
revoke all on function public.submit_application(text, jsonb, text, text, text, text) from public;
revoke all on function public.get_review_invite(uuid) from public;
revoke all on function public.submit_review(uuid, int, int, int, int, boolean, text) from public;
revoke all on function public.set_ai_key(text) from public;
revoke all on function public.ai_key_status() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.request_edit(uuid, text, text) from public;
revoke all on function public.decide_edit(uuid, boolean, text) from public;
revoke all on function public.cancel_edit(uuid) from public;
revoke all on function public.apply_edit(uuid, jsonb) from public;
-- Internal: only the triggers call these.
revoke all on function public.push_notification(uuid, text, text, uuid, uuid, text, text, text, int, boolean) from public, anon, authenticated;
revoke all on function public.team_members(text, uuid[]) from public, anon, authenticated;
revoke all on function public.handler_names(uuid[]) from public, anon, authenticated;

grant execute on function public.get_public_bucket(text) to anon, authenticated;
grant execute on function public.submit_application(text, jsonb, text, text, text, text) to anon, authenticated;
grant execute on function public.get_review_invite(uuid) to anon, authenticated;
grant execute on function public.submit_review(uuid, int, int, int, int, boolean, text) to anon, authenticated;
grant execute on function public.set_ai_key(text) to authenticated;
grant execute on function public.ai_key_status() to authenticated;
grant execute on function public.request_edit(uuid, text, text) to authenticated;
grant execute on function public.decide_edit(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_edit(uuid) to authenticated;
grant execute on function public.apply_edit(uuid, jsonb) to authenticated;

grant usage on sequence public.requisition_seq to authenticated;

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- File storage: CVs and photos are private; only signed links are ever handed out
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-files', 'candidate-files', false, 15728640,
  array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/webp', 'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists candidate_files_public_upload on storage.objects;
create policy candidate_files_public_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'candidate-files' and name like 'applications/%');

drop policy if exists candidate_files_staff_read on storage.objects;
create policy candidate_files_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'candidate-files' and public.can_read());

drop policy if exists candidate_files_staff_write on storage.objects;
create policy candidate_files_staff_write on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-files' and public.can_write());

drop policy if exists candidate_files_staff_update on storage.objects;
create policy candidate_files_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'candidate-files' and public.can_write());

drop policy if exists candidate_files_admin_delete on storage.objects;
create policy candidate_files_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'candidate-files' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime: lets several HR users see each other's status changes without reloading
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['candidates', 'cv_buckets', 'requisitions', 'job_postings', 'designations', 'candidate_reviews', 'notifications', 'profiles', 'questions', 'edit_requests'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- Tells the API about new tables and columns at once, so the app does not report one as missing.
notify pgrst, 'reload schema';
