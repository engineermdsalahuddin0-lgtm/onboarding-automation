import type { AppNotification, Candidate, CandidateEvent, CandidateReview, CvBucket, EditRequest, EditStep, Profile, Requisition, Settings } from '../../types';
import { EDIT_STEP_FIELDS, EDIT_STEP_LABELS, isReviewOpen, LOCKED_FIELDS, normalizePhone } from '../pipeline';
import { completedStep, COMPLETES_PROCESS, PROCESS_FIELDS, SCREENING_FIELDS } from '../team';
import { buildDemoData } from './seed';
import { BackendError, type Backend, type ListOptions, type PresenceEntry, type RpcName, type TableName } from './types';

// Demo mode keeps everything in this browser's IndexedDB so the app can be reviewed without a
// Supabase project. It mirrors the rules in supabase/schema.sql that the UI relies on.

const DB_NAME = 'bitopi-onboarding-demo';
// Bump when the sample data's shape changes: browsers holding an older copy start again from fresh samples.
const STATE_KEY = 'state-v9';

type Row = Record<string, any>;
type State = Record<string, Row[]> & { __secrets?: any };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('kv');
      request.result.createObjectStore('files');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const matches = (row: Row, match: Record<string, unknown> = {}) =>
  Object.entries(match).every(([column, value]) => row[column] === value);

const TRACKED_FIELDS = [
  'screening_status',
  'call_status',
  'message_status',
  'primary_status',
  'secondary_message_status',
  'secondary_status',
  'selection_category',
  'final_decision',
  'joining_status',
  'bucket_id',
];

const CANDIDATE_DEFAULTS: Partial<Candidate> = {
  job_posting_id: null,
  source: 'Direct upload',
  email: '',
  phone: '',
  alt_phone: '',
  address: '',
  permanent_address: '',
  date_of_birth: null,
  father_name: '',
  mother_name: '',
  spouse_name: '',
  gender: '',
  marital_status: '',
  religion: '',
  nationality: '',
  blood_group: '',
  national_id: '',
  passport_no: '',
  tin_no: '',
  linkedin: '',
  current_designation: '',
  current_company: '',
  industry: '',
  total_experience_years: null,
  present_salary: '',
  expected_salary: '',
  notice_period: '',
  career_summary: '',
  education: [],
  experience: [],
  training: [],
  skills: [],
  languages: [],
  references_list: [],
  sections: {},
  raw_text: '',
  cv_path: null,
  cv_file_name: '',
  photo_path: null,
  parse_method: 'manual',
  parse_warnings: [],
  screening_status: 'new',
  screening_note: '',
  assigned_to: [],
  handover_note: '',
  handed_over_by: '',
  handed_over_at: null,
  call_status: 'pending',
  call_note: '',
  followup_on: null,
  followup_time: '',
  called_at: null,
  called_by: '',
  call_date: null,
  call_time: '',
  confirmed_date: null,
  confirmed_time: '',
  call_rejected_date: null,
  call_rejected_time: '',
  message_status: 'not_sent',
  message_sent_at: null,
  message_channel: '',
  primary_status: 'pending',
  primary_date: null,
  primary_time: '',
  primary_interviewer: '',
  primary_score: null,
  primary_feedback: '',
  primary_panel: [],
  secondary_message_status: 'not_sent',
  secondary_message_sent_at: null,
  secondary_status: 'pending',
  secondary_date: null,
  secondary_time: '',
  secondary_interviewer: '',
  secondary_score: null,
  secondary_feedback: '',
  secondary_panel: [],
  selection_category: null,
  final_decision: null,
  decision_date: null,
  decision_time: '',
  informed_date: null,
  informed_time: '',
  decided_by: '',
  decided_at: null,
  review_seconds: 0,
  review_count: 0,
  joining_status: 'pending',
  joining_date: null,
  joining_time: '',
  joining_call_date: null,
  joining_call_time: '',
  joining_confirmed_date: null,
  joining_confirmed_time: '',
  joining_remarks: '',
  offered_salary: null,
  employee_code: '',
  probation_period: '',
  reporting_to: '',
  documents_received: [],
  offer_sent_at: null,
  selected_at: null,
};

function checkPipeline(row: Row) {
  const broken =
    (row.call_status !== 'pending' && row.screening_status !== 'shortlisted') ||
    (row.message_status !== 'not_sent' && row.call_status !== 'confirm') ||
    (row.primary_status !== 'pending' && row.message_status !== 'message_done') ||
    (row.secondary_status !== 'pending' && row.primary_status !== 'selected') ||
    (row.joining_status !== 'pending' && row.secondary_status !== 'selected');
  if (broken) throw new BackendError('This status change skips a required earlier stage.');
  if ((row.secondary_status === 'selected') !== (row.selection_category != null)) {
    throw new BackendError('A selected candidate must be on the merit or the waiting list.');
  }
  if (!['pending', 'declined'].includes(row.joining_status) && row.selection_category !== 'merit') {
    throw new BackendError('Only a merit candidate can receive an offer. Move this candidate to Merit first.');
  }
  if (row.final_decision === 'confirmed' && (row.secondary_status !== 'selected' || row.selection_category !== 'merit' || !row.decision_date || !row.joining_date || row.joining_status === 'pending')) {
    throw new BackendError('A confirmation needs a merit candidate, a selection date and a joining date.');
  }
  if (row.final_decision === 'rejected' && (row.secondary_status !== 'rejected' || !row.decision_date || row.joining_status !== 'pending')) {
    throw new BackendError('A final rejection needs a rejection date.');
  }
  if (row.joining_confirmed_date && (row.final_decision !== 'confirmed' || !row.joining_call_date || row.joining_confirmed_date < row.joining_call_date)) {
    throw new BackendError('A confirmed joining day needs the joining call, and cannot come before it.');
  }
}

/** An approved correction being applied: it may change its own step's fields on a locked candidate. */
let activeGrant: { candidateId: string; step: EditStep } | null = null;

function checkLock(row: Row, next: Row) {
  if (!row.final_decision || !next.final_decision) return;
  const grant = activeGrant;
  const allowed: readonly string[] = grant && grant.candidateId === row.id ? EDIT_STEP_FIELDS[grant.step] : [];
  for (const field of LOCKED_FIELDS) {
    if (JSON.stringify(row[field] ?? null) !== JSON.stringify(next[field] ?? null) && !allowed.includes(field)) {
      throw new BackendError("This candidate's process is locked. An admin has to unlock it first.");
    }
  }
}

const REQUISITION_DEFAULTS: Partial<Requisition> = {
  designation_id: null, department: '', company: '', vacancies: 1, priority: 'Medium', employment_type: 'Permanent', location: '',
  hiring_manager: '', requested_by: '', budget_min: null, budget_max: null, target_date: null, status: 'Pending approval',
  justification: '', job_description: '', filled_at: null, unit: '', section: '', subsection: '', vacancy_type: '', replacing: '',
  requisition_date: null, approved_on: null, offer_date: null, expected_joining: null, selected_names: '', remarks: '',
  sheet_key: null, sheet_data: {},
};

const changed = (row: Row, next: Row, fields: readonly string[]) =>
  fields.some((field) => JSON.stringify(row[field] ?? null) !== JSON.stringify(next[field] ?? null));

/** Mirrors enforce_desk in schema.sql. */
function checkDesk(user: Profile, row: Row | null, next: Row) {
  if (user.desk === 'all') return;
  if (!row) {
    if (user.desk === 'process') throw new BackendError('CVs are uploaded from the CV screening desk.');
    return;
  }
  if (user.desk === 'process' && changed(row, next, SCREENING_FIELDS)) {
    throw new BackendError('CV screening and the handover are done from the CV screening desk.');
  }
  if (user.desk === 'screening') {
    if (user.role === 'admin' && row.final_decision && !next.final_decision) return;
    if (changed(row, next, PROCESS_FIELDS)) {
      throw new BackendError('This step belongs to the process team. An admin can change your desk under Settings > Team.');
    }
  }
}

// Each tab can be signed in as a different person, so two people can be tried side by side.
const USER_KEY = 'demo-user';

export function createDemoBackend(): Backend {
  let db: IDBDatabase;
  let state: State;
  let userId = sessionStorage.getItem(USER_KEY) ?? localStorage.getItem(USER_KEY);
  const authListeners = new Set<() => void>();
  const changeListeners = new Set<(table: string) => void>();
  // True while the company form saves an application: that is the candidate, not a signed-in person.
  let applying = false;
  // Tells this browser's other tabs that the shared demo data changed.
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('bitopi-onboarding-demo');

  const ready = (async () => {
    db = await openDb();
    const stored = await idbGet<State>(db, 'kv', STATE_KEY);
    state = stored ?? (buildDemoData() as unknown as State);
    if (!stored) await persist();
  })();

  async function persist() {
    await idbPut(db, 'kv', STATE_KEY, state);
    channel?.postMessage('changed');
  }

  if (channel) {
    channel.onmessage = async () => {
      await ready;
      state = (await idbGet<State>(db, 'kv', STATE_KEY)) ?? state;
      changeListeners.forEach((listener) => listener('candidates'));
    };
  }

  const demoUser = (): Profile => {
    const profiles = state.profiles as unknown as Profile[];
    return profiles.find((p) => p.id === userId) ?? profiles[0];
  };
  const actorName = () => demoUser().full_name || demoUser().email || '';
  const table = (name: string) => (state[name] ??= []) as Row[];

  /** Staff on one desk (any desk when null). Mirrors team_members in schema.sql. */
  function teamMembers(desk: 'screening' | 'process' | null, assigned: string[] = []): string[] {
    return (state.profiles as unknown as Profile[])
      .filter((p) => (p.role === 'admin' || p.role === 'hr') && (desk === null || p.desk === desk || p.desk === 'all'))
      .filter((p) => desk !== 'process' || assigned.length === 0 || assigned.includes(p.id))
      .map((p) => p.id);
  }

  /** Mirrors push_notification in schema.sql. */
  function push(recipient: string, fields: Omit<AppNotification, 'id' | 'recipient_id' | 'read_at' | 'created_at'>, merge: boolean) {
    const now = Date.now();
    if (merge) {
      const existing = table('notifications').find((n) =>
        n.recipient_id === recipient && n.event === fields.event && n.bucket_id === fields.bucket_id && n.actor_name === fields.actor_name
        && n.read_at === null && now - Date.parse(n.created_at) < 12 * 3_600_000);
      if (existing) {
        Object.assign(existing, {
          item_count: existing.item_count + fields.item_count,
          subject: fields.subject,
          candidate_id: fields.candidate_id,
          detail: fields.detail || existing.detail,
          created_at: new Date(now).toISOString(),
        });
        return;
      }
    }
    table('notifications').push({ id: crypto.randomUUID(), recipient_id: recipient, read_at: null, created_at: new Date(now).toISOString(), ...fields });
  }

  const designationOf = (bucketId: string) => (table('cv_buckets').find((b) => b.id === bucketId)?.designation as string) ?? '';

  function notifyNewCvs(rows: Row[], actor: string, actorId: string | null) {
    const byBucket = new Map<string, Row[]>();
    for (const row of rows) byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row]);
    for (const [bucketId, added] of byBucket) {
      const last = added[added.length - 1];
      for (const recipient of teamMembers(null).filter((id) => id !== actorId)) {
        push(recipient, { event: 'new_cvs', actor_name: actor, item_count: added.length, subject: last.full_name, designation: designationOf(bucketId), detail: '', candidate_id: last.id, bucket_id: bucketId }, true);
      }
    }
  }

  function notifyChange(row: Row, next: Row) {
    const me = demoUser().id;
    const base = { actor_name: actorName(), subject: next.full_name, designation: designationOf(next.bucket_id), candidate_id: next.id, bucket_id: next.bucket_id, item_count: 1 };
    if (next.screening_status === 'shortlisted' && row.screening_status !== 'shortlisted') {
      for (const recipient of teamMembers('process', next.assigned_to).filter((id) => id !== me)) {
        push(recipient, { ...base, event: 'handover', detail: next.handover_note }, true);
      }
      return;
    }
    if (next.screening_status === 'shortlisted' && !next.final_decision && changed(row, next, ['assigned_to'])) {
      const before = new Set(teamMembers('process', row.assigned_to));
      for (const recipient of teamMembers('process', next.assigned_to).filter((id) => id !== me && !before.has(id))) {
        push(recipient, { ...base, event: 'handover', detail: next.handover_note }, true);
      }
    }
    const step = completedStep(row as Candidate, next as Candidate);
    // Only the big decisions reach the screening desk, as in schema.sql.
    if (!step || !COMPLETES_PROCESS.includes(step.event)) return;
    for (const recipient of teamMembers('screening').filter((id) => id !== me)) {
      push(recipient, { ...base, event: step.event, detail: step.detail }, false);
    }
  }

  function logEvent(candidateId: string, field: string, from: string | null, to: string | null, actor: string, actorId: string | null) {
    const event: CandidateEvent = {
      id: crypto.randomUUID(),
      candidate_id: candidateId,
      field,
      from_value: from,
      to_value: to,
      actor_name: actor,
      actor_id: actorId,
      created_at: new Date().toISOString(),
    };
    table('candidate_events').push(event);
  }

  /** Mirrors handler_names in schema.sql. */
  const handlerNamesOf = (assigned: string[] = []) =>
    assigned.length === 0
      ? 'Whole process team'
      : assigned.map((id) => {
        const p = (state.profiles as unknown as Profile[]).find((person) => person.id === id);
        return p?.full_name || p?.email || '?';
      }).join(', ');

  /** Mirrors stamp_question_author and the mcq_needs_choices check in schema.sql. */
  function checkQuestion(row: Row) {
    if (!String(row.question ?? '').trim()) throw new BackendError('A question needs its text.');
    if (row.kind === 'mcq') {
      const options = row.options ?? [];
      if (options.length < 2 || options.length > 8 || row.correct_option == null || row.correct_option < 0 || row.correct_option >= options.length) {
        throw new BackendError('An MCQ needs 2 to 8 choices and one right answer.');
      }
    }
  }

  function prepareInsert(name: TableName, row: Row): Row {
    const now = new Date().toISOString();
    switch (name) {
      case 'candidates': {
        const full: Row = { id: crypto.randomUUID(), received_at: now, created_at: now, ...CANDIDATE_DEFAULTS, ...row };
        checkPipeline(full);
        return full;
      }
      case 'requisitions': {
        const count = table('requisitions').length + 1;
        return {
          id: crypto.randomUUID(),
          ref_no: `REQ-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`,
          created_at: now,
          ...REQUISITION_DEFAULTS,
          ...row,
        };
      }
      case 'cv_buckets':
        return {
          id: crypto.randomUUID(),
          code: crypto.randomUUID().replace(/-/g, '').slice(0, 10),
          created_at: now,
          status: 'Open',
          accepting_applications: true,
          requisition_id: null,
          department: '',
          company: '',
          color: 'stone',
          description: '',
          unit: '',
          section: '',
          subsection: '',
          ...row,
        };
      case 'questions': {
        const full: Row = {
          id: crypto.randomUUID(), options: [], correct_option: null, answer: '', marks: 1, difficulty: 'medium', department: '',
          designation: '', topic: '', round: 'any', is_active: true, created_at: now, updated_at: now, ...row,
          created_by_name: actorName(),
        };
        checkQuestion(full);
        return full;
      }
      case 'cv_review_sessions':
        // Always the person signed in, as stamp_review_session does.
        return { id: crypto.randomUUID(), ...row, reviewer_id: demoUser().id, reviewer_name: actorName() };
      default:
        return { id: crypto.randomUUID(), created_at: now, ...row };
    }
  }

  const backend: Backend = {
    mode: 'demo',

    async currentUser() {
      await ready;
      if (!userId || !(state.profiles as unknown as Profile[]).some((p) => p.id === userId)) return null;
      return structuredClone(demoUser());
    },

    /** Demo accounts need no password: the email picks the person. */
    async signIn(email) {
      await ready;
      const person = (state.profiles as unknown as Profile[]).find((p) => p.email?.toLowerCase() === email.trim().toLowerCase());
      if (!person) throw new BackendError('There is no demo account with that email.');
      userId = person.id;
      sessionStorage.setItem(USER_KEY, person.id);
      localStorage.setItem(USER_KEY, person.id);
      authListeners.forEach((listener) => listener());
    },

    async signOut() {
      userId = null;
      sessionStorage.removeItem(USER_KEY);
      localStorage.removeItem(USER_KEY);
      authListeners.forEach((listener) => listener());
    },

    onAuthChange(callback) {
      authListeners.add(callback);
      return () => authListeners.delete(callback);
    },

    async accessToken() {
      return null;
    },

    async list<T>(name: TableName, options: ListOptions = {}) {
      await ready;
      let rows = table(name).filter((row) => matches(row, options.match));
      if (options.since) {
        const { column, value } = options.since;
        rows = rows.filter((row) => (row[column] ?? '') >= value);
      }
      if (options.order) {
        const { column, ascending = true } = options.order;
        rows = [...rows].sort((a, b) => {
          const left = a[column] ?? '';
          const right = b[column] ?? '';
          if (left === right) return 0;
          return (left < right ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      // Like the database's security rules: each person reads only their own notifications.
      if (name === 'notifications') rows = rows.filter((row) => row.recipient_id === demoUser().id);
      if (options.limit !== undefined) rows = rows.slice(0, options.limit);
      if (options.select) {
        const columns = options.select.split(',').map((column) => column.trim());
        rows = rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
      }
      return structuredClone(rows) as T[];
    },

    async get<T>(name: TableName, match: Record<string, string | number>) {
      await ready;
      const row = table(name).find((candidate) => matches(candidate, match));
      return row ? (structuredClone(row) as T) : null;
    },

    async insert<T>(name: TableName, rows: object[]) {
      await ready;
      const created = rows.map((row) => prepareInsert(name, row as Row));
      // The company form is the candidate applying, not a staff member, so no desk applies.
      if (name === 'candidates' && !applying) for (const row of created) checkDesk(demoUser(), null, row);
      table(name).push(...created);
      if (name === 'candidates') {
        for (const row of created) logEvent(row.id, 'received', null, row.source, applying ? 'Candidate / system' : actorName(), applying ? null : demoUser().id);
        notifyNewCvs(created, applying ? 'Company form' : actorName(), applying ? null : demoUser().id);
      }
      if (name === 'job_postings') {
        for (const row of created) {
          const requisition = table('requisitions').find((r) => r.id === row.requisition_id);
          const bucket = table('cv_buckets').find((b) => b.requisition_id === row.requisition_id);
          for (const recipient of teamMembers(null).filter((id) => id !== demoUser().id)) {
            push(recipient, { event: 'posting', actor_name: actorName(), item_count: 1, subject: '', designation: requisition?.designation ?? '', detail: row.media, candidate_id: null, bucket_id: bucket?.id ?? null }, false);
          }
        }
      }
      if (name === 'cv_review_sessions') {
        for (const session of created) {
          const candidate = table('candidates').find((c) => c.id === session.candidate_id);
          if (candidate) {
            candidate.review_seconds += session.seconds;
            candidate.review_count += 1;
          }
        }
      }
      await persist();
      return structuredClone(created) as T[];
    },

    async update<T>(name: TableName, match: Record<string, string | number>, patch: object) {
      await ready;
      const updated: Row[] = [];
      for (const row of table(name)) {
        if (!matches(row, match)) continue;
        const next: Row = { ...row, ...patch };
        if (name === 'candidates') {
          checkDesk(demoUser(), row, next);
          checkLock(row, next);
          checkPipeline(next);
          if (row.secondary_status !== next.secondary_status) {
            next.selected_at = next.secondary_status === 'selected' ? new Date().toISOString() : null;
          }
          for (const field of TRACKED_FIELDS) {
            if (row[field] !== next[field]) {
              logEvent(row.id, field, row[field] ?? null, next[field] ?? null, actorName(), demoUser().id);
            }
          }
          if (next.screening_status === 'shortlisted' && (row.screening_status !== 'shortlisted' || changed(row, next, ['assigned_to']))) {
            logEvent(row.id, 'assigned_to', row.screening_status === 'shortlisted' ? handlerNamesOf(row.assigned_to) : null, handlerNamesOf(next.assigned_to), actorName(), demoUser().id);
          }
          notifyChange(row, next);
        }
        if (name === 'questions') {
          checkQuestion(next);
          next.updated_at = new Date().toISOString();
        }
        if (name === 'notifications' && row.recipient_id !== demoUser().id) continue;
        Object.assign(row, next);
        updated.push(row);
      }
      await persist();
      return structuredClone(updated) as T[];
    },

    async upsert<T>(name: TableName, rows: object[], conflictColumn: string) {
      await ready;
      const results: Row[] = [];
      for (const row of rows as Row[]) {
        const existing = table(name).find((item) => item[conflictColumn] === row[conflictColumn]);
        if (existing) {
          Object.assign(existing, row);
          results.push(existing);
        } else {
          const created = prepareInsert(name, row);
          table(name).push(created);
          results.push(created);
        }
      }
      await persist();
      return structuredClone(results) as T[];
    },

    async remove(name: TableName, match: Record<string, string | number>) {
      await ready;
      if (name === 'cv_buckets' && table('candidates').some((c) => c.bucket_id === match.id)) {
        throw new BackendError('This bucket still holds candidates. Archive it instead.');
      }
      // As the database's security rules: only an admin deletes candidates, and nothing is deleted otherwise.
      if (name === 'candidates' && demoUser().role !== 'admin') return;
      const removed = new Set(table(name).filter((row) => matches(row, match)).map((row) => row.id as string));
      state[name] = table(name).filter((row) => !removed.has(row.id));
      // What the database removes with them (on delete cascade).
      if (name === 'candidates') {
        for (const child of ['candidate_events', 'message_log', 'candidate_reviews', 'cv_review_sessions', 'notifications', 'edit_requests']) {
          state[child] = table(child).filter((row) => !removed.has(row.candidate_id));
        }
      }
      if (name === 'cv_buckets') state.notifications = table('notifications').filter((row) => !removed.has(row.bucket_id));
      await persist();
    },

    async rpc<T>(name: RpcName, args: Record<string, any>) {
      await ready;
      const settings = state.settings[0] as unknown as Settings;
      switch (name) {
        case 'get_public_bucket': {
          const bucket = table('cv_buckets').find((b) => b.code === args.p_code) as CvBucket | undefined;
          if (!bucket) return null as T;
          const requisition = table('requisitions').find((r) => r.id === bucket.requisition_id) as Requisition | undefined;
          return {
            designation: bucket.designation,
            department: bucket.department,
            company: bucket.company || settings.default_company,
            group_name: settings.group_name,
            description: bucket.description,
            job_description: requisition?.job_description ?? '',
            accepting: bucket.accepting_applications && bucket.status === 'Open',
          } as T;
        }
        case 'submit_application': {
          if (args.p_website) return { ok: true } as T;
          const bucket = table('cv_buckets').find((b) => b.code === args.p_code) as CvBucket | undefined;
          if (!bucket || !bucket.accepting_applications || bucket.status !== 'Open') {
            throw new BackendError('This position is not accepting applications.');
          }
          const payload = args.p_payload as Row;
          const phone = normalizePhone(payload.phone ?? '');
          if ((payload.full_name ?? '').trim().length < 2) throw new BackendError('Name is required.');
          if (phone.length < 10) throw new BackendError('A valid mobile number is required.');
          const duplicate = table('candidates').some(
            (c) => c.bucket_id === bucket.id && normalizePhone(c.phone) === phone,
          );
          if (duplicate) return { ok: true } as T;
          applying = true;
          try {
            await backend.insert('candidates', [
              {
                ...payload,
                total_experience_years: payload.total_experience_years ? Number(payload.total_experience_years) : null,
                date_of_birth: payload.date_of_birth || null,
                bucket_id: bucket.id,
                source: 'Company form',
                parse_method: 'form',
                cv_path: args.p_cv_path || null,
                cv_file_name: args.p_cv_file_name ?? '',
                photo_path: args.p_photo_path || null,
              },
            ]);
          } finally {
            applying = false;
          }
          return { ok: true } as T;
        }
        case 'get_review_invite': {
          const review = table('candidate_reviews').find((r) => r.token === args.p_token) as CandidateReview | undefined;
          if (!review) return null as T;
          const candidate = table('candidates').find((c) => c.id === review.candidate_id) as Candidate;
          const bucket = table('cv_buckets').find((b) => b.id === candidate.bucket_id) as CvBucket;
          return {
            first_name: candidate.full_name.split(' ')[0],
            designation: bucket.designation,
            group_name: settings.group_name,
            stage: review.stage,
            submitted: review.submitted_at !== null,
            open: isReviewOpen(candidate, review.stage),
          } as T;
        }
        case 'submit_review': {
          const review = table('candidate_reviews').find(
            (r) => r.token === args.p_token && r.submitted_at === null,
          );
          if (!args.p_overall) throw new BackendError('Overall rating is required.');
          if (review) {
            const candidate = table('candidates').find((c) => c.id === review.candidate_id) as Candidate | undefined;
            if (candidate && !isReviewOpen(candidate, review.stage as 'primary' | 'secondary')) {
              throw new BackendError('This feedback link has closed: the interview process has moved on.');
            }
          }
          if (!review) throw new BackendError('This review link is invalid or has already been used.');
          Object.assign(review, {
            overall: args.p_overall,
            communication: args.p_communication,
            professionalism: args.p_professionalism,
            clarity: args.p_clarity,
            would_recommend: args.p_would_recommend,
            comments: args.p_comments ?? '',
            submitted_at: new Date().toISOString(),
          });
          await persist();
          return { ok: true } as T;
        }
        case 'set_ai_key': {
          const value = String(args.p_key ?? '').trim();
          state.__secrets = value ? { gemini_api_key: value } : {};
          localStorage.setItem('demo-ai-key', value);
          await persist();
          return { configured: Boolean(value), last4: value.slice(-4) } as T;
        }
        case 'ai_key_status': {
          const value: string = state.__secrets?.gemini_api_key ?? '';
          return { configured: Boolean(value), last4: value.slice(-4) } as T;
        }
        // Corrections, as request_edit, decide_edit, cancel_edit and apply_edit in schema.sql.
        case 'request_edit': {
          const me = demoUser();
          if (me.role !== 'admin' && me.role !== 'hr') throw new BackendError('Only HR and admins can ask for a correction.');
          const step = args.p_step as EditStep;
          if (!EDIT_STEP_FIELDS[step]) throw new BackendError(`There is no step called ${step}.`);
          const reason = String(args.p_reason ?? '').trim().slice(0, 1000);
          if (reason.length < 3) throw new BackendError('Say what was entered wrongly, so the approver knows what to check.');
          const candidate = table('candidates').find((c) => c.id === args.p_candidate);
          if (!candidate) throw new BackendError('This candidate was not found.');
          if (table('edit_requests').some((r) => r.candidate_id === candidate.id && r.step === step && r.requested_by === me.id && ['pending', 'approved'].includes(r.status))) {
            throw new BackendError('You already asked to correct this step. It is waiting for an answer, or approved and ready for you.');
          }
          const request: EditRequest = {
            id: crypto.randomUUID(), candidate_id: candidate.id, step, reason, status: 'pending', requested_by: me.id, requested_by_name: actorName(),
            decided_by: null, decided_by_name: '', decided_at: null, decision_note: '', used_at: null, created_at: new Date().toISOString(),
          };
          table('edit_requests').push(request);
          for (const admin of (state.profiles as unknown as Profile[]).filter((p) => p.role === 'admin' && p.id !== me.id)) {
            push(admin.id, { event: 'edit_request', actor_name: actorName(), item_count: 1, subject: candidate.full_name, designation: designationOf(candidate.bucket_id), detail: `${EDIT_STEP_LABELS[step]}: ${reason.slice(0, 200)}`, candidate_id: candidate.id, bucket_id: candidate.bucket_id }, false);
          }
          await persist();
          return structuredClone(request) as T;
        }
        case 'decide_edit': {
          const me = demoUser();
          if (me.role !== 'admin') throw new BackendError('Only an admin can answer a correction request.');
          const request = table('edit_requests').find((r) => r.id === args.p_request);
          if (!request) throw new BackendError('This correction request was not found.');
          if (request.status !== 'pending') throw new BackendError('This request was already answered or withdrawn.');
          const note = String(args.p_note ?? '').trim().slice(0, 1000);
          Object.assign(request, { status: args.p_approve ? 'approved' : 'rejected', decided_by: me.id, decided_by_name: actorName(), decided_at: new Date().toISOString(), decision_note: note });
          const candidate = table('candidates').find((c) => c.id === request.candidate_id)!;
          if (request.requested_by !== me.id) {
            push(request.requested_by, { event: args.p_approve ? 'edit_approved' : 'edit_rejected', actor_name: actorName(), item_count: 1, subject: candidate.full_name, designation: designationOf(candidate.bucket_id), detail: `${EDIT_STEP_LABELS[request.step as EditStep]}${note ? `: ${note.slice(0, 200)}` : ''}`, candidate_id: candidate.id, bucket_id: candidate.bucket_id }, false);
          }
          await persist();
          return structuredClone(request) as T;
        }
        case 'cancel_edit': {
          const request = table('edit_requests').find((r) => r.id === args.p_request && r.requested_by === demoUser().id && ['pending', 'approved'].includes(r.status));
          if (!request) throw new BackendError('Only an open request of your own can be withdrawn.');
          request.status = 'cancelled';
          await persist();
          return structuredClone(request) as T;
        }
        case 'apply_edit': {
          const me = demoUser();
          const request = table('edit_requests').find((r) => r.id === args.p_request);
          if (!request || request.requested_by !== me.id) throw new BackendError('This correction request was not found.');
          if (request.status !== 'approved') throw new BackendError('This correction is not approved, or it was already used.');
          const step = request.step as EditStep;
          const changes = (args.p_changes ?? {}) as Row;
          const candidate = table('candidates').find((c) => c.id === request.candidate_id)!;
          const summary: string[] = [];
          for (const [field, value] of Object.entries(changes)) {
            if (!(EDIT_STEP_FIELDS[step] as string[]).includes(field)) {
              throw new BackendError(`A correction of the ${EDIT_STEP_LABELS[step].toLowerCase()} step cannot change ${field}.`);
            }
            const before = candidate[field] == null ? '' : typeof candidate[field] === 'object' ? JSON.stringify(candidate[field]) : String(candidate[field]);
            const after = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
            if (before !== after) summary.push(`${field}: ${before || '-'} -> ${after || '-'}`);
          }
          if (summary.length === 0) throw new BackendError('Nothing was changed.');
          activeGrant = { candidateId: candidate.id, step };
          try {
            await backend.update('candidates', { id: candidate.id }, changes);
          } finally {
            activeGrant = null;
          }
          Object.assign(request, { status: 'used', used_at: new Date().toISOString() });
          logEvent(candidate.id, 'correction', step, summary.join('; '), actorName(), me.id);
          if (request.decided_by && request.decided_by !== me.id) {
            push(request.decided_by, { event: 'edit_used', actor_name: actorName(), item_count: 1, subject: candidate.full_name, designation: designationOf(candidate.bucket_id), detail: EDIT_STEP_LABELS[step], candidate_id: candidate.id, bucket_id: candidate.bucket_id }, false);
          }
          await persist();
          return structuredClone(request) as T;
        }
      }
    },

    async upload(path, file) {
      await ready;
      await idbPut(db, 'files', path, file);
    },

    async removeFiles(paths) {
      await ready;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        for (const path of paths) tx.objectStore('files').delete(path);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },

    async signedUrls(paths) {
      await ready;
      const urls: Record<string, string> = {};
      for (const path of paths) {
        const blob = await idbGet<Blob>(db, 'files', path);
        if (blob) urls[path] = URL.createObjectURL(blob);
      }
      return urls;
    },

    subscribe(callback) {
      changeListeners.add(callback);
      return () => {
        changeListeners.delete(callback);
      };
    },

    // Tabs in this browser tell each other where they are, as Supabase Realtime presence does between computers.
    presence(onChange) {
      const others = new Map<string, { entry: PresenceEntry; seen: number }>();
      let mine: PresenceEntry | null = null;
      const link = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('bitopi-onboarding-presence');
      const report = () => {
        const fresh = Date.now() - PRESENCE_STALE_MS;
        for (const [tab, item] of others) if (item.seen < fresh) others.delete(tab);
        onChange([...(mine ? [mine] : []), ...[...others.values()].map((item) => item.entry)]);
      };
      const announce = () => mine && link?.postMessage({ type: 'here', entry: mine });
      if (link) {
        link.onmessage = (event: MessageEvent<{ type: 'here' | 'ask' | 'gone'; entry?: PresenceEntry; tab?: string }>) => {
          const message = event.data;
          if (message.type === 'ask') announce();
          if (message.type === 'gone' && message.tab) others.delete(message.tab);
          if (message.type === 'here' && message.entry) others.set(message.entry.tab, { entry: message.entry, seen: Date.now() });
          report();
        };
        link.postMessage({ type: 'ask' });
      }
      const heartbeat = setInterval(() => {
        announce();
        report();
      }, PRESENCE_STALE_MS / 3);
      const leave = () => mine && link?.postMessage({ type: 'gone', tab: mine.tab });
      window.addEventListener('pagehide', leave);
      return {
        update(entry) {
          mine = entry;
          announce();
          report();
        },
        stop() {
          leave();
          clearInterval(heartbeat);
          window.removeEventListener('pagehide', leave);
          link?.close();
        },
      };
    },
  };

  return backend;
}

const PRESENCE_STALE_MS = 15_000;
