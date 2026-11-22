import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AppNotification,
  Candidate,
  CandidateReview,
  CvBucket,
  Desk,
  Designation,
  DocumentTemplate,
  AssessmentInput,
  EditRequest,
  EditStep,
  GuestLink,
  InterviewAssessment,
  InterviewPanelMember,
  InterviewStage,
  JobPosting,
  MessageTemplate,
  PanelSide,
  Profile,
  Question,
  Requisition,
  Role,
  Settings,
} from '../types';
import { backend, type TableName } from './backend';
import { DEFAULT_DOCUMENT_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES, DEFAULT_SETTINGS } from './defaults';
import { DEFAULT_ORG_STRUCTURE } from './org';
import { canProcessAs, canScreenAs } from './team';

/** Calls the server's user-account routes, which need the service role key. Admins only. */
async function teamApi(method: 'POST' | 'PATCH' | 'DELETE', path: string, body: unknown, fallback: string) {
  const token = await backend.accessToken();
  const response = await fetch(path, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || fallback);
  return result as { profile: Profile; ok?: boolean };
}

/** The latest notifications kept in memory; older ones stay in the database. */
const NOTIFICATION_LIMIT = 100;

// Everything except the full CV text: tables stay fast, and the text loads when a profile opens.
export const CANDIDATE_LIST_COLUMNS = [
  'id', 'bucket_id', 'job_posting_id', 'source', 'received_at', 'full_name', 'email', 'phone', 'alt_phone', 'address',
  'permanent_address', 'date_of_birth', 'father_name', 'mother_name', 'spouse_name', 'gender', 'marital_status',
  'religion', 'nationality', 'blood_group', 'national_id', 'passport_no', 'tin_no', 'linkedin', 'current_designation',
  'current_company', 'industry', 'total_experience_years', 'present_salary', 'expected_salary', 'notice_period', 'career_summary',
  'education', 'experience', 'training', 'skills', 'languages', 'references_list', 'cv_path', 'cv_file_name',
  'photo_path', 'parse_method', 'parse_warnings', 'screening_status', 'screening_note',
  'assigned_to', 'handover_note', 'handed_over_by', 'handed_over_at', 'call_status', 'call_note',
  'followup_on', 'followup_time', 'called_at', 'called_by', 'call_date', 'call_time', 'confirmed_date', 'confirmed_time', 'call_rejected_date', 'call_rejected_time', 'message_status', 'message_sent_at', 'message_channel', 'primary_status',
  'primary_date', 'primary_time', 'primary_interviewer', 'primary_score', 'primary_feedback', 'primary_panel',
  'secondary_message_status', 'secondary_message_sent_at', 'secondary_status', 'secondary_date', 'secondary_time',
  'secondary_interviewer', 'secondary_score', 'secondary_feedback', 'secondary_panel', 'selection_category',
  'final_decision', 'decision_date', 'decision_time', 'informed_date', 'informed_time', 'decided_by', 'decided_at', 'review_seconds', 'review_count',
  'joining_status', 'joining_date', 'joining_time', 'joining_call_date', 'joining_call_time', 'joining_confirmed_date', 'joining_confirmed_time', 'joining_remarks', 'offered_salary',
  'employee_code', 'probation_period', 'reporting_to', 'documents_received', 'offer_sent_at', 'selected_at', 'created_at',
  'primary_attendance', 'primary_attendance_note', 'primary_reschedules', 'secondary_attendance', 'secondary_attendance_note', 'secondary_reschedules',
].join(',');

interface Data {
  settings: Settings;
  messageTemplates: MessageTemplate[];
  documentTemplates: DocumentTemplate[];
  designations: Designation[];
  requisitions: Requisition[];
  postings: JobPosting[];
  buckets: CvBucket[];
  candidates: Candidate[];
  reviews: CandidateReview[];
  /** Everyone with an account, for names and the handover. */
  team: Profile[];
  /** This person's own, newest first. */
  notifications: AppNotification[];
  /** The question library. */
  questions: Question[];
  /** Correction requests, newest first. */
  editRequests: EditRequest[];
  /** Who sits on which bucket's primary or final interview. */
  panels: InterviewPanelMember[];
  /** Links for interviewers without an account, newest first. */
  guestLinks: GuestLink[];
  /** Every interviewer's Interview Assessment Form. */
  assessments: InterviewAssessment[];
}

/** What HR enters for an interviewer who could not: an account, or a name for someone without one. */
export interface ModeratorEntry {
  candidateId: string;
  stage: InterviewStage;
  interviewerId: string | null;
  name?: string;
  designation?: string;
  department?: string;
  input: AssessmentInput;
  /** '' leaves it empty, 'profile' uses the interviewer's saved signature, or a drawn one. */
  signature: string;
}

export interface NewInterviewer {
  email: string;
  password: string;
  full_name: string;
  job_title: string;
  department: string;
}

export interface NewUser extends NewInterviewer {
  role: Role;
  desk: Desk;
}

/** What an admin changes on an account. A password is set only when given; it is never read back. */
export type UserChanges = Partial<Pick<Profile, 'full_name' | 'job_title' | 'department' | 'role' | 'desk'>> & { email?: string; password?: string };

const EMPTY: Data = {
  settings: { ...DEFAULT_SETTINGS, id: 1 },
  messageTemplates: [],
  documentTemplates: [],
  designations: [],
  requisitions: [],
  postings: [],
  buckets: [],
  candidates: [],
  reviews: [],
  team: [],
  notifications: [],
  questions: [],
  editRequests: [],
  panels: [],
  guestLinks: [],
  assessments: [],
};

interface StoreValue extends Data {
  user: Profile | null;
  loadingUser: boolean;
  loadingData: boolean;
  /** True once the data has loaded for the signed-in person. */
  dataReady: boolean;
  loadError: string | null;
  canWrite: boolean;
  isAdmin: boolean;
  /** Upload, screen and hand over CVs. */
  canScreen: boolean;
  /** The steps after the handover, from the call to joining. */
  canProcess: boolean;
  /** Marks these notifications read, or all of them when no list is given. */
  markNotificationsRead: (ids?: string[]) => Promise<void>;
  /** The candidate most recently saved, and when. */
  lastSave: { id: string; at: number } | null;
  reload: () => Promise<void>;
  refreshUser: () => Promise<void>;

  updateCandidate: (id: string, patch: Partial<Candidate>) => Promise<Candidate>;
  updateCandidates: (ids: string[], patchFor: (c: Candidate) => Partial<Candidate>) => Promise<number>;
  addCandidates: (rows: Partial<Candidate>[]) => Promise<Candidate[]>;
  removeCandidate: (id: string) => Promise<void>;

  saveDesignation: (row: Partial<Designation>) => Promise<Designation>;
  removeDesignation: (id: string) => Promise<void>;
  saveRequisition: (row: Partial<Requisition>) => Promise<Requisition>;
  removeRequisition: (id: string) => Promise<void>;
  savePosting: (row: Partial<JobPosting>) => Promise<JobPosting>;
  removePosting: (id: string) => Promise<void>;
  saveBucket: (row: Partial<CvBucket>) => Promise<CvBucket>;
  /** Deletes a bucket with every CV in it, and their files. A bucket with CVs needs an admin. */
  removeBucket: (id: string) => Promise<void>;
  /** Saves many requisitions at once, matched on the vacancy sheet's key. */
  syncRequisitions: (rows: Partial<Requisition>[]) => Promise<number>;
  saveQuestion: (row: Partial<Question>) => Promise<Question>;
  removeQuestion: (id: string) => Promise<void>;

  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  saveMessageTemplate: (row: MessageTemplate) => Promise<void>;
  saveDocumentTemplate: (row: DocumentTemplate) => Promise<void>;
  reviewLink: (candidateId: string, stage: 'primary' | 'secondary') => Promise<string>;
  logReviewSession: (candidateId: string, startedAt: string, endedAt: string) => Promise<void>;

  /** Asks an admin to approve correcting one step. */
  requestEdit: (candidateId: string, step: EditStep, reason: string) => Promise<void>;
  /** An admin approves or turns down a correction request. */
  decideEdit: (requestId: string, approve: boolean, note?: string) => Promise<void>;
  /** Withdraws one's own open request. */
  cancelEdit: (requestId: string) => Promise<void>;
  /** Applies an approved correction: only the changed fields of its step. */
  applyEdit: (requestId: string, changes: Partial<Candidate>) => Promise<void>;

  /** Puts an interviewer on a bucket's primary or final interview, or takes them off. */
  addToPanel: (bucketId: string, stage: InterviewStage, interviewerId: string, side?: PanelSide) => Promise<void>;
  removeFromPanel: (panelId: string) => Promise<void>;
  /** Whether a primary interviewer sits for HRD or the team. */
  setPanelSide: (panelId: string, side: PanelSide) => Promise<void>;
  /** Makes a link for guest interviewers, working on that day only. */
  createGuestLink: (bucketId: string, stage: InterviewStage, validOn: string) => Promise<GuestLink>;
  removeGuestLink: (linkId: string) => Promise<void>;
  /** HR enters the marks of an interviewer who could not. */
  saveModeratorAssessment: (entry: ModeratorEntry) => Promise<InterviewAssessment>;
  /** HR adds a missing name, designation or signature to a form. */
  signAssessment: (assessmentId: string, fields: { name?: string; designation?: string; signature: string }) => Promise<InterviewAssessment>;
  /** Admins only. */
  removeAssessment: (assessmentId: string) => Promise<void>;
  /** Admins only: an account that signs in only to mark interviews. */
  createInterviewer: (person: NewInterviewer) => Promise<Profile>;
  /** Admins only: changes someone's details, role or saved signature. */
  updateProfile: (id: string, patch: Partial<Profile>) => Promise<Profile>;
  /** Admins only: a new login with any role. */
  createUser: (person: NewUser) => Promise<Profile>;
  /** Admins only: details, role, desk, and the login email or password. */
  saveUser: (id: string, changes: UserChanges) => Promise<Profile>;
  /** Admins only: deletes the login. What the person did stays on record under their name. */
  deleteUser: (id: string) => Promise<void>;
  refreshAssessments: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

function replaceById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((row) => row.id === item.id) ? list.map((row) => (row.id === item.id ? item : row)) : [item, ...list];
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<Data>(EMPTY);
  const [lastSave, setLastSave] = useState<{ id: string; at: number } | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const userId = user?.id ?? null;

  const merge = useCallback((patch: Partial<Data>) => {
    setData((current) => ({ ...current, ...patch }));
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await backend.currentUser());
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
    return backend.onAuthChange(() => void refreshUser());
  }, [refreshUser]);

  const reload = useCallback(async () => {
    const [settingsRows, messageTemplates, documentTemplates, designations, requisitions, postings, buckets, candidates, reviews, team, notifications, questions, editRequests, panels, guestLinks, assessments] = await Promise.all([
      backend.list<Settings>('settings', { order: { column: 'id' } }),
      backend.list<MessageTemplate>('message_templates', { order: { column: 'key' } }),
      backend.list<DocumentTemplate>('document_templates', { order: { column: 'sort_order' } }),
      backend.list<Designation>('designations', { order: { column: 'title' } }),
      backend.list<Requisition>('requisitions', { order: { column: 'created_at', ascending: false } }),
      backend.list<JobPosting>('job_postings', { order: { column: 'posted_on', ascending: false } }),
      backend.list<CvBucket>('cv_buckets', { order: { column: 'created_at', ascending: false } }),
      backend.list<Candidate>('candidates', { select: CANDIDATE_LIST_COLUMNS, order: { column: 'received_at', ascending: false } }),
      backend.list<CandidateReview>('candidate_reviews', { order: { column: 'invited_at', ascending: false } }),
      backend.list<Profile>('profiles', { order: { column: 'created_at' } }),
      userId
        ? backend.list<AppNotification>('notifications', { match: { recipient_id: userId }, order: { column: 'created_at', ascending: false }, limit: NOTIFICATION_LIMIT })
        : Promise.resolve([]),
      backend.list<Question>('questions', { order: { column: 'created_at', ascending: false } }),
      // Before schema.sql is run again after this update, the table is missing: the rest of the app still works.
      backend.list<EditRequest>('edit_requests', { order: { column: 'created_at', ascending: false } }).catch(() => [] as EditRequest[]),
      // The same for the interview assessment tables.
      backend.list<InterviewPanelMember>('interview_panels', { order: { column: 'created_at' } }).catch(() => [] as InterviewPanelMember[]),
      backend.list<GuestLink>('guest_links', { order: { column: 'created_at', ascending: false } }).catch(() => [] as GuestLink[]),
      backend.list<InterviewAssessment>('interview_assessments', { order: { column: 'created_at' } }).catch(() => [] as InterviewAssessment[]),
    ]);
    const stored = settingsRows[0];
    setData({
      // Until an admin saves a structure under Settings, the company's own is used, so units can be chosen from day one.
      settings: stored ? { ...stored, org_structure: stored.org_structure?.length ? stored.org_structure : DEFAULT_ORG_STRUCTURE } : EMPTY.settings,
      messageTemplates,
      documentTemplates,
      designations,
      requisitions,
      postings,
      buckets,
      candidates,
      reviews,
      team,
      notifications,
      questions,
      editRequests,
      panels,
      guestLinks,
      assessments,
    });
    return;
  }, [userId]);

  // Interviewers see only their own interviews, through my_interviews; they load none of the staff data.
  const hasAccess = user !== null && user.role !== 'pending' && user.role !== 'interviewer';
  const canWrite = user?.role === 'admin' || user?.role === 'hr';

  useEffect(() => {
    if (!hasAccess) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    setLoadingData(true);
    setLoadError(null);
    (async () => {
      try {
        await seedDefaults(canWrite);
        await reload();
      } catch (error) {
        if (!cancelled) setLoadError((error as Error).message);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAccess, canWrite, reload]);

  // Another HR user changed something: refresh shortly after, once a burst of changes has settled.
  useEffect(() => {
    if (!hasAccess) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = backend.subscribe((table) => {
      // An admin may have changed this person's desk or role.
      if (table === 'profiles') void refreshUser();
      clearTimeout(timer);
      timer = setTimeout(() => void reload().catch(() => undefined), table === 'notifications' ? 300 : 1500);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [hasAccess, reload, refreshUser]);

  const markNotificationsRead = useCallback(async (ids?: string[]) => {
    if (!userId) return;
    const now = new Date().toISOString();
    const unread = dataRef.current.notifications.filter((n) => !n.read_at && (!ids || ids.includes(n.id)));
    if (unread.length === 0) return;
    setData((state) => ({
      ...state,
      notifications: state.notifications.map((n) => (unread.some((u) => u.id === n.id) ? { ...n, read_at: now } : n)),
    }));
    if (ids) await Promise.all(unread.map((n) => backend.update('notifications', { id: n.id }, { read_at: now })));
    else await backend.update('notifications', { recipient_id: userId }, { read_at: now });
  }, [userId]);

  const updateCandidate = useCallback(async (id: string, patch: Partial<Candidate>) => {
    const [row] = await backend.update<Candidate>('candidates', { id }, patch);
    if (!row) throw new Error('This candidate could not be updated. They may have been removed.');
    const current = dataRef.current.candidates.find((c) => c.id === id);
    // The list skips the bulky columns; do not let an update pull them into memory.
    const { raw_text: _rawText, sections: _sections, ...light } = row;
    const next = { ...current, ...light } as Candidate;
    setData((state) => ({ ...state, candidates: state.candidates.map((c) => (c.id === id ? next : c)) }));
    setLastSave({ id, at: Date.now() });
    return next;
  }, []);

  const updateCandidates = useCallback(
    async (ids: string[], patchFor: (c: Candidate) => Partial<Candidate>) => {
      let done = 0;
      for (const id of ids) {
        const candidate = dataRef.current.candidates.find((c) => c.id === id);
        if (!candidate) continue;
        await updateCandidate(id, patchFor(candidate));
        done += 1;
      }
      return done;
    },
    [updateCandidate],
  );

  const addCandidates = useCallback(async (rows: Partial<Candidate>[]) => {
    const created = await backend.insert<Candidate>('candidates', rows);
    const light = created.map(({ raw_text: _rawText, sections: _sections, ...row }) => row as Candidate);
    setData((state) => ({ ...state, candidates: [...light, ...state.candidates] }));
    return light;
  }, []);

  const removeCandidate = useCallback(async (id: string) => {
    const candidate = dataRef.current.candidates.find((c) => c.id === id);
    await backend.remove('candidates', { id });
    setData((state) => ({ ...state, candidates: state.candidates.filter((c) => c.id !== id) }));
    // The CV and photo go too. The record is already gone, so a file that cannot be removed is no reason to fail.
    const files = [candidate?.cv_path, candidate?.photo_path].filter((path): path is string => Boolean(path));
    if (files.length > 0) await backend.removeFiles(files).catch(() => undefined);
  }, []);

  const removeBucket = useCallback(async (id: string) => {
    const inside = dataRef.current.candidates.filter((c) => c.bucket_id === id);
    if (inside.length > 0) {
      await backend.remove('candidates', { bucket_id: id });
      // The database deletes nothing for someone not allowed to: check before going on.
      const left = await backend.list<{ id: string }>('candidates', { select: 'id', match: { bucket_id: id }, limit: 1 });
      if (left.length > 0) throw new Error('This bucket still holds CVs, and only an admin can delete CVs. Ask an admin, or archive the bucket instead.');
      setData((state) => ({ ...state, candidates: state.candidates.filter((c) => c.bucket_id !== id) }));
    }
    await backend.remove('cv_buckets', { id });
    setData((state) => ({ ...state, buckets: state.buckets.filter((b) => b.id !== id) }));
    const files = inside.flatMap((c) => [c.cv_path, c.photo_path]).filter((path): path is string => Boolean(path));
    if (files.length > 0) await backend.removeFiles(files).catch(() => undefined);
  }, []);

  const syncRequisitions = useCallback(async (rows: Partial<Requisition>[]) => {
    let saved = 0;
    // In parts, so a long sheet stays within what one request may carry.
    for (let i = 0; i < rows.length; i += 100) {
      const done = await backend.upsert<Requisition>('requisitions', rows.slice(i, i + 100), 'sheet_key');
      saved += done.length;
    }
    const requisitions = await backend.list<Requisition>('requisitions', { order: { column: 'created_at', ascending: false } });
    setData((state) => ({ ...state, requisitions }));
    return saved;
  }, []);

  const refreshEdits = useCallback(async () => {
    const editRequests = await backend.list<EditRequest>('edit_requests', { order: { column: 'created_at', ascending: false } });
    setData((state) => ({ ...state, editRequests }));
  }, []);

  const requestEdit = useCallback(async (candidateId: string, step: EditStep, reason: string) => {
    await backend.rpc('request_edit', { p_candidate: candidateId, p_step: step, p_reason: reason });
    await refreshEdits();
  }, [refreshEdits]);

  const decideEdit = useCallback(async (requestId: string, approve: boolean, note = '') => {
    await backend.rpc('decide_edit', { p_request: requestId, p_approve: approve, p_note: note });
    await refreshEdits();
  }, [refreshEdits]);

  const cancelEdit = useCallback(async (requestId: string) => {
    await backend.rpc('cancel_edit', { p_request: requestId });
    await refreshEdits();
  }, [refreshEdits]);

  const applyEdit = useCallback(async (requestId: string, changes: Partial<Candidate>) => {
    const request = await backend.rpc<EditRequest>('apply_edit', { p_request: requestId, p_changes: changes });
    const fresh = await backend.get<Candidate>('candidates', { id: request.candidate_id });
    if (fresh) {
      const { raw_text: _rawText, sections: _sections, ...light } = fresh;
      setData((state) => ({ ...state, candidates: state.candidates.map((c) => (c.id === fresh.id ? { ...c, ...light } as Candidate : c)) }));
      setLastSave({ id: fresh.id, at: Date.now() });
    }
    await refreshEdits();
  }, [refreshEdits]);

  const refreshAssessments = useCallback(async () => {
    const assessments = await backend.list<InterviewAssessment>('interview_assessments', { order: { column: 'created_at' } });
    setData((state) => ({ ...state, assessments }));
  }, []);

  const addToPanel = useCallback(async (bucketId: string, stage: InterviewStage, interviewerId: string, side: PanelSide = '') => {
    const [row] = await backend.insert<InterviewPanelMember>('interview_panels', [
      { bucket_id: bucketId, stage, interviewer_id: interviewerId, side: stage === 'primary' ? side : '' },
    ]);
    if (!row) throw new Error('The panel could not be changed. You may not have permission.');
    setData((state) => ({ ...state, panels: [...state.panels, row] }));
  }, []);

  const removeFromPanel = useCallback(async (panelId: string) => {
    await backend.remove('interview_panels', { id: panelId });
    setData((state) => ({ ...state, panels: state.panels.filter((p) => p.id !== panelId) }));
  }, []);

  const setPanelSide = useCallback(async (panelId: string, side: PanelSide) => {
    const [row] = await backend.update<InterviewPanelMember>('interview_panels', { id: panelId }, { side });
    if (!row) throw new Error('The panel could not be changed. You may not have permission.');
    setData((state) => ({ ...state, panels: state.panels.map((p) => (p.id === panelId ? row : p)) }));
  }, []);

  const createGuestLink = useCallback(async (bucketId: string, stage: InterviewStage, validOn: string) => {
    const [row] = await backend.insert<GuestLink>('guest_links', [{ bucket_id: bucketId, stage, valid_on: validOn }]);
    if (!row) throw new Error('The link could not be made. You may not have permission.');
    setData((state) => ({ ...state, guestLinks: [row, ...state.guestLinks] }));
    return row;
  }, []);

  const removeGuestLink = useCallback(async (linkId: string) => {
    await backend.remove('guest_links', { id: linkId });
    setData((state) => ({ ...state, guestLinks: state.guestLinks.filter((l) => l.id !== linkId) }));
  }, []);

  const putAssessment = useCallback((row: InterviewAssessment) => {
    setData((state) => ({ ...state, assessments: replaceById(state.assessments, row) }));
    return row;
  }, []);

  const saveModeratorAssessment = useCallback(async (entry: ModeratorEntry) => {
    const row = await backend.rpc<InterviewAssessment>('moderator_save_assessment', {
      p_candidate: entry.candidateId,
      p_stage: entry.stage,
      p_interviewer: entry.interviewerId,
      p_name: entry.name ?? '',
      p_designation: entry.designation ?? '',
      p_department: entry.department ?? '',
      p_payload: entry.input,
      p_signature: entry.signature,
    });
    return putAssessment(row);
  }, [putAssessment]);

  const signAssessment = useCallback(async (assessmentId: string, fields: { name?: string; designation?: string; signature: string }) => {
    const row = await backend.rpc<InterviewAssessment>('moderator_sign_assessment', {
      p_assessment: assessmentId, p_name: fields.name ?? '', p_designation: fields.designation ?? '', p_signature: fields.signature,
    });
    return putAssessment(row);
  }, [putAssessment]);

  const removeAssessment = useCallback(async (assessmentId: string) => {
    await backend.remove('interview_assessments', { id: assessmentId });
    const left = await backend.list<{ id: string }>('interview_assessments', { select: 'id', match: { id: assessmentId } });
    if (left.length > 0) throw new Error('Only an admin can delete a form.');
    setData((state) => ({ ...state, assessments: state.assessments.filter((a) => a.id !== assessmentId) }));
  }, []);

  const createUser = useCallback(async (person: NewUser) => {
    let profile: Profile;
    if (backend.mode === 'demo') {
      const email = person.email.trim().toLowerCase();
      if (data.team.some((p) => p.email?.toLowerCase() === email)) throw new Error('Someone already signs in with this email.');
      [profile] = await backend.insert<Profile>('profiles', [{
        email, full_name: person.full_name.trim(), job_title: person.job_title.trim(), department: person.department.trim(),
        role: person.role, desk: person.desk, signature: '',
      }]);
    } else {
      profile = (await teamApi('POST', '/api/team/users', person, 'The account could not be made.')).profile;
    }
    setData((state) => ({ ...state, team: replaceById(state.team, profile) }));
    return profile;
  }, [data.team]);

  const createInterviewer = useCallback(
    (person: NewInterviewer) => createUser({ ...person, role: 'interviewer', desk: 'all' }),
    [createUser],
  );

  const saveUser = useCallback(async (id: string, changes: UserChanges) => {
    let profile: Profile;
    if (backend.mode === 'demo') {
      // Demo accounts have no password: the email alone signs in.
      const { password: _password, ...patch } = changes;
      const email = patch.email?.trim().toLowerCase();
      if (email && data.team.some((p) => p.id !== id && p.email?.toLowerCase() === email)) throw new Error('Someone already signs in with this email.');
      [profile] = await backend.update<Profile>('profiles', { id }, email ? { ...patch, email } : patch);
      if (!profile) throw new Error('Only an admin can change accounts.');
    } else {
      profile = (await teamApi('PATCH', `/api/team/users/${encodeURIComponent(id)}`, changes, 'The account could not be saved.')).profile;
    }
    setData((state) => ({ ...state, team: replaceById(state.team, profile) }));
    if (id === user?.id) await refreshUser();
    return profile;
  }, [data.team, user?.id, refreshUser]);

  const deleteUser = useCallback(async (id: string) => {
    if (id === user?.id) throw new Error('You cannot delete your own account. Ask another admin.');
    const person = data.team.find((p) => p.id === id);
    if (person?.role === 'admin' && data.team.filter((p) => p.role === 'admin').length <= 1) throw new Error('At least one admin account must remain.');
    if (backend.mode === 'demo') await backend.remove('profiles', { id });
    else await teamApi('DELETE', `/api/team/users/${encodeURIComponent(id)}`, undefined, 'The account could not be deleted.');
    // Panels, handovers and forms change with it; load them fresh.
    setData((state) => ({ ...state, team: state.team.filter((p) => p.id !== id) }));
    await reload().catch(() => undefined);
  }, [data.team, user?.id, reload]);

  const updateProfile = useCallback(async (id: string, patch: Partial<Profile>) => {
    const [row] = await backend.update<Profile>('profiles', { id }, patch);
    if (!row) throw new Error('Only an admin can change accounts.');
    setData((state) => ({ ...state, team: replaceById(state.team, row) }));
    return row;
  }, []);

  const saveRow = useCallback(
    async <T extends { id: string }>(table: TableName, key: keyof Data, row: Partial<T>): Promise<T> => {
      const { id, ...patch } = row as Partial<T> & { id?: string };
      const saved = id
        ? (await backend.update<T>(table, { id }, patch))[0]
        : (await backend.insert<T>(table, [patch]))[0];
      if (!saved) throw new Error('The change could not be saved. You may not have permission.');
      setData((state) => ({ ...state, [key]: replaceById(state[key] as unknown as T[], saved) }));
      return saved;
    },
    [],
  );

  const removeRow = useCallback(async (table: TableName, key: keyof Data, id: string) => {
    await backend.remove(table, { id });
    setData((state) => ({ ...state, [key]: (state[key] as unknown as { id: string }[]).filter((row) => row.id !== id) }));
  }, []);

  const reviewerName = user?.full_name || user?.email || '';
  const logReviewSession = useCallback(
    async (candidateId: string, startedAt: string, endedAt: string) => {
      const seconds = Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000);
      if (seconds < 1) return;
      await backend.insert('cv_review_sessions', [
        { candidate_id: candidateId, reviewer_name: reviewerName, started_at: startedAt, ended_at: endedAt, seconds },
      ]);
      setData((state) => ({
        ...state,
        candidates: state.candidates.map((c) =>
          c.id === candidateId ? { ...c, review_seconds: c.review_seconds + seconds, review_count: c.review_count + 1 } : c,
        ),
      }));
    },
    [reviewerName],
  );

  // A review still open when the browser closed: save it, up to the last moment it was seen open.
  useEffect(() => {
    if (canWrite) void saveAbandonedReviews(logReviewSession);
  }, [canWrite, logReviewSession]);

  const value = useMemo<StoreValue>(
    () => ({
      ...data,
      user,
      loadingUser,
      loadingData,
      dataReady: data !== EMPTY,
      loadError,
      canWrite,
      isAdmin: user?.role === 'admin',
      canScreen: canScreenAs(user),
      canProcess: canProcessAs(user),
      markNotificationsRead,
      lastSave,
      reload,
      refreshUser,
      updateCandidate,
      updateCandidates,
      addCandidates,
      removeCandidate,
      saveDesignation: (row) => saveRow<Designation>('designations', 'designations', row),
      removeDesignation: (id) => removeRow('designations', 'designations', id),
      saveRequisition: (row) => saveRow<Requisition>('requisitions', 'requisitions', row),
      removeRequisition: (id) => removeRow('requisitions', 'requisitions', id),
      savePosting: (row) => saveRow<JobPosting>('job_postings', 'postings', row),
      removePosting: (id) => removeRow('job_postings', 'postings', id),
      saveBucket: (row) => saveRow<CvBucket>('cv_buckets', 'buckets', row),
      removeBucket,
      syncRequisitions,
      saveQuestion: (row) => saveRow<Question>('questions', 'questions', row),
      removeQuestion: (id) => removeRow('questions', 'questions', id),
      saveSettings: async (patch) => {
        const [row] = await backend.update<Settings>('settings', { id: 1 }, patch);
        if (!row) throw new Error('Only an admin can change company settings.');
        merge({ settings: row });
      },
      saveMessageTemplate: async (row) => {
        const { updated_at: _updated, ...fields } = row;
        await backend.upsert('message_templates', [fields], 'key');
        setData((state) => ({ ...state, messageTemplates: state.messageTemplates.map((t) => (t.key === row.key ? row : t)) }));
      },
      saveDocumentTemplate: async (row) => {
        const { updated_at: _updated, ...fields } = row;
        await backend.upsert('document_templates', [fields], 'key');
        setData((state) => ({ ...state, documentTemplates: state.documentTemplates.map((t) => (t.key === row.key ? row : t)) }));
      },
      reviewLink: async (candidateId, stage) => {
        let review = dataRef.current.reviews.find((r) => r.candidate_id === candidateId && r.stage === stage);
        if (!review) {
          [review] = await backend.insert<CandidateReview>('candidate_reviews', [
            {
              candidate_id: candidateId,
              stage,
              ...(backend.mode === 'demo'
                ? {
                    token: crypto.randomUUID(), invited_at: new Date().toISOString(), submitted_at: null, overall: null,
                    communication: null, professionalism: null, clarity: null, would_recommend: null, comments: '',
                  }
                : {}),
            },
          ]);
          const created = review;
          setData((state) => ({ ...state, reviews: [created, ...state.reviews] }));
        }
        return `${location.origin}/review/${review.token}`;
      },
      logReviewSession,
      requestEdit,
      decideEdit,
      cancelEdit,
      applyEdit,
      addToPanel,
      removeFromPanel,
      setPanelSide,
      createGuestLink,
      removeGuestLink,
      saveModeratorAssessment,
      signAssessment,
      removeAssessment,
      createInterviewer,
      updateProfile,
      createUser,
      saveUser,
      deleteUser,
      refreshAssessments,
    }),
    [data, user, loadingUser, loadingData, loadError, canWrite, lastSave, reload, refreshUser, updateCandidate, updateCandidates, addCandidates, removeCandidate, removeBucket, syncRequisitions, requestEdit, decideEdit, cancelEdit, applyEdit, saveRow, removeRow, merge, logReviewSession, markNotificationsRead, addToPanel, removeFromPanel, setPanelSide, createGuestLink, removeGuestLink, saveModeratorAssessment, signAssessment, removeAssessment, createInterviewer, updateProfile, createUser, saveUser, deleteUser, refreshAssessments],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// ---------------------------------------------------------------------------
// Review time: counted from opening a candidate's CV to closing it.
// ---------------------------------------------------------------------------
const OPEN_REVIEW_PREFIX = 'open-cv-review:';
const HEARTBEAT_MS = 5000;

interface OpenReview {
  candidateId: string;
  startedAt: string;
  lastSeen: string;
}

async function saveAbandonedReviews(log: StoreValue['logReviewSession']) {
  const staleBefore = Date.now() - HEARTBEAT_MS * 3;
  for (const key of Object.keys(localStorage).filter((name) => name.startsWith(OPEN_REVIEW_PREFIX))) {
    let open: OpenReview;
    try {
      open = JSON.parse(localStorage.getItem(key) ?? '') as OpenReview;
    } catch {
      localStorage.removeItem(key);
      continue;
    }
    // Recently seen means another tab still has it open.
    if (Date.parse(open.lastSeen) > staleBefore) continue;
    localStorage.removeItem(key);
    await log(open.candidateId, open.startedAt, open.lastSeen).catch(() => undefined);
  }
}

/** Times one review while enabled, and returns the seconds so far. The time is saved when it ends. */
export function useReviewTimer(candidateId: string, enabled: boolean): number {
  const { logReviewSession } = useStore();
  const [elapsed, setElapsed] = useState(0);
  const log = useRef(logReviewSession);
  log.current = logReviewSession;

  useEffect(() => {
    setElapsed(0);
    if (!enabled) return;
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    const key = `${OPEN_REVIEW_PREFIX}${crypto.randomUUID()}`;
    const stamp = () => localStorage.setItem(key, JSON.stringify({ candidateId, startedAt, lastSeen: new Date().toISOString() } satisfies OpenReview));
    stamp();
    const heartbeat = setInterval(stamp, HEARTBEAT_MS);
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => {
      clearInterval(heartbeat);
      clearInterval(tick);
      localStorage.removeItem(key);
      void log.current(candidateId, startedAt, new Date().toISOString()).catch(() => undefined);
    };
  }, [candidateId, enabled]);

  return elapsed;
}

/** Fills a brand-new database with the company's default wording, once. Staff can edit it afterwards. */
async function seedDefaults(canWrite: boolean) {
  if (!canWrite) return;
  const [messages, documents, settings] = await Promise.all([
    backend.list<MessageTemplate>('message_templates', { select: 'key', order: { column: 'key' } }),
    backend.list<DocumentTemplate>('document_templates', { select: 'key', order: { column: 'key' } }),
    backend.get<Settings>('settings', { id: 1 }),
  ]);
  if (messages.length === 0) await backend.insert('message_templates', DEFAULT_MESSAGE_TEMPLATES);
  if (documents.length === 0) await backend.insert('document_templates', DEFAULT_DOCUMENT_TEMPLATES);
  if (settings && settings.corporate_address === '' && settings.media.length === 0) {
    const { seal_path: _seal, ...defaults } = DEFAULT_SETTINGS;
    await backend.update('settings', { id: 1 }, defaults).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Signed links for private files. They expire after an hour, so they are cached for 50 minutes.
// ---------------------------------------------------------------------------
const urlCache = new Map<string, { url: string; at: number }>();
const URL_TTL = 50 * 60 * 1000;

export async function fileUrls(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const now = Date.now();
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const missing = wanted.filter((path) => {
    const cached = urlCache.get(path);
    return !cached || now - cached.at > URL_TTL;
  });
  if (missing.length > 0) {
    const fresh: Record<string, string> = {};
    for (let i = 0; i < missing.length; i += 200) {
      Object.assign(fresh, await backend.signedUrls(missing.slice(i, i + 200)).catch(() => ({})));
    }
    for (const [path, url] of Object.entries(fresh)) urlCache.set(path, { url, at: now });
  }
  const result: Record<string, string> = {};
  for (const path of wanted) {
    const cached = urlCache.get(path);
    if (cached) result[path] = cached.url;
  }
  return result;
}

export function useFileUrls(paths: (string | null | undefined)[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.filter(Boolean).join('|');
  useEffect(() => {
    let cancelled = false;
    void fileUrls(paths).then((result) => {
      if (!cancelled) setUrls(result);
    });
    return () => {
      cancelled = true;
    };
    // The joined key is the real dependency; the array is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
