import type { Candidate, CallStatus, EditStep, InterviewerScore, InterviewStatus, JoiningStatus, SelectionCategory } from '../types';
import { dayMonth, time12 } from './format';

export type Tone = 'neutral' | 'info' | 'progress' | 'warning' | 'good' | 'bad';

export interface StageInfo {
  key: string;
  label: string;
  tone: Tone;
}

type PipelineFields = Pick<
  Candidate,
  | 'screening_status'
  | 'call_status'
  | 'message_status'
  | 'primary_status'
  | 'secondary_message_status'
  | 'secondary_status'
  | 'joining_status'
  | 'final_decision'
>;

/** The one place that turns the status columns into a single human-readable stage. */
export function stageOf(c: PipelineFields): StageInfo {
  if (c.joining_status === 'joined') return { key: 'joined', label: 'Joined', tone: 'good' };
  if (c.joining_status === 'declined') return { key: 'declined', label: 'Did not confirm', tone: 'bad' };
  if (c.final_decision === 'confirmed') {
    return { key: 'letter_sent', label: c.joining_status === 'accepted' ? 'Joining confirmed' : 'Confirmed', tone: 'good' };
  }
  if (c.secondary_status === 'selected') return { key: 'selected', label: 'Final selected', tone: 'good' };
  if (c.secondary_status === 'rejected') return { key: 'rej_secondary', label: 'Rejected · Final', tone: 'bad' };
  if (c.secondary_status === 'scheduled') return { key: 'secondary', label: 'Final scheduled', tone: 'progress' };
  if (c.primary_status === 'selected') return { key: 'primary_selected', label: 'Primary selected', tone: 'progress' };
  if (c.primary_status === 'rejected') return { key: 'rej_primary', label: 'Rejected · Primary', tone: 'bad' };
  if (c.primary_status === 'scheduled') return { key: 'primary', label: 'Primary scheduled', tone: 'progress' };
  if (c.message_status === 'message_done') return { key: 'messaged', label: 'Primary scheduled', tone: 'progress' };
  if (c.call_status === 'reject') return { key: 'rej_call', label: 'Rejected · Call', tone: 'bad' };
  if (c.call_status === 'confirm') return { key: 'confirmed', label: 'Call confirmed', tone: 'info' };
  if (c.call_status === 'followup') return { key: 'followup', label: 'Call follow-up', tone: 'warning' };
  if (c.screening_status === 'rejected') return { key: 'rej_screening', label: 'Rejected · Screening', tone: 'bad' };
  if (c.screening_status === 'shortlisted') return { key: 'shortlisted', label: 'Shortlisted', tone: 'info' };
  return { key: 'new', label: 'New CV', tone: 'neutral' };
}

export function isRejected(c: PipelineFields): boolean {
  return stageOf(c).tone === 'bad';
}

export function isActive(c: PipelineFields): boolean {
  const key = stageOf(c).key;
  return !isRejected(c) && key !== 'selected' && key !== 'letter_sent' && key !== 'joined';
}

/** A confirmation letter sent or a final rejection ends the process: nothing in it may change after that. */
export function isLocked(c: Pick<Candidate, 'final_decision'>): boolean {
  return c.final_decision != null;
}

/** Fixed once a final decision is made. The database refuses changes to these too. Joining paperwork stays open. */
export const LOCKED_FIELDS = [
  'screening_status', 'call_status', 'call_date', 'call_time', 'confirmed_date', 'confirmed_time', 'call_rejected_date', 'call_rejected_time',
  'message_status', 'primary_status', 'primary_date', 'primary_time', 'primary_panel', 'primary_score',
  'secondary_message_status', 'secondary_status', 'secondary_date', 'secondary_time', 'secondary_panel', 'secondary_score',
  'selection_category', 'final_decision', 'decision_date', 'decision_time', 'informed_date', 'informed_time',
  'joining_date', 'joining_time',
] as const;

// Each helper returns only the columns that change. Moving a stage backwards clears everything
// after it, so the row can never hold a final result for a stage it has returned from.

const CLEAR_DECISION: Partial<Candidate> = {
  final_decision: null,
  decision_date: null,
  decision_time: '',
  informed_date: null,
  informed_time: '',
  decided_by: '',
  decided_at: null,
  joining_status: 'pending',
  joining_time: '',
  joining_call_date: null,
  joining_call_time: '',
  joining_confirmed_date: null,
  joining_confirmed_time: '',
  offer_sent_at: null,
};

const CLEAR_SECONDARY: Partial<Candidate> = {
  secondary_message_status: 'not_sent',
  secondary_message_sent_at: null,
  secondary_status: 'pending',
  secondary_date: null,
  secondary_time: '',
  secondary_panel: [],
  secondary_score: null,
  secondary_interviewer: '',
  selection_category: null,
  ...CLEAR_DECISION,
};

const CLEAR_PRIMARY: Partial<Candidate> = {
  primary_status: 'pending',
  primary_date: null,
  primary_time: '',
  primary_panel: [],
  primary_score: null,
  primary_interviewer: '',
  ...CLEAR_SECONDARY,
};

const CLEAR_MESSAGE: Partial<Candidate> = {
  message_status: 'not_sent',
  message_sent_at: null,
  message_channel: '',
  ...CLEAR_PRIMARY,
};

const CLEAR_CALL: Partial<Candidate> = {
  call_status: 'pending',
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
  ...CLEAR_MESSAGE,
};

const CLEAR_HANDOVER: Partial<Candidate> = { assigned_to: [], handover_note: '', handed_over_by: '', handed_over_at: null };

/**
 * Selected at CV review: the CV goes to the process team. With no one named, the whole process team
 * gets it; otherwise only the people named.
 */
export function shortlist(handover: { to?: string[]; note?: string; by?: string; now?: string } = {}): Partial<Candidate> {
  return {
    screening_status: 'shortlisted',
    assigned_to: handover.to ?? [],
    handover_note: handover.note?.trim() ?? '',
    handed_over_by: handover.by ?? '',
    handed_over_at: handover.now ?? new Date().toISOString(),
  };
}

/** Gives a candidate already handed over to someone else on the process team. */
export function reassign(to: string[], note?: string): Partial<Candidate> {
  return { assigned_to: to, ...(note !== undefined ? { handover_note: note.trim() } : {}) };
}

export function rejectScreening(note = ''): Partial<Candidate> {
  return { ...CLEAR_CALL, ...CLEAR_HANDOVER, screening_status: 'rejected', screening_note: note };
}

export function resetScreening(): Partial<Candidate> {
  return { ...CLEAR_CALL, ...CLEAR_HANDOVER, screening_status: 'new' };
}

export function setCall(
  status: CallStatus,
  opts: {
    note?: string;
    by?: string;
    followupOn?: string | null;
    followupTime?: string;
    now?: string;
    /** The day and time HR phoned, which can be earlier than when this is recorded. */
    callDate?: string | null;
    callTime?: string;
    /** The day and time the candidate confirmed, which can be later than the call. */
    confirmedDate?: string | null;
    confirmedTime?: string;
    /** The day and time the candidate turned the job down. */
    rejectedDate?: string | null;
    rejectedTime?: string;
  } = {},
): Partial<Candidate> {
  const patch: Partial<Candidate> = {
    ...(status === 'confirm' ? {} : CLEAR_MESSAGE),
    call_status: status,
    followup_on: status === 'followup' ? (opts.followupOn ?? null) : null,
    followup_time: status === 'followup' ? (opts.followupTime ?? '') : '',
    called_at: status === 'pending' ? null : (opts.now ?? new Date().toISOString()),
    called_by: status === 'pending' ? '' : (opts.by ?? ''),
    call_date: status === 'pending' ? null : (opts.callDate ?? null),
    call_time: status === 'pending' ? '' : (opts.callTime ?? ''),
    confirmed_date: status === 'confirm' ? (opts.confirmedDate ?? null) : null,
    confirmed_time: status === 'confirm' ? (opts.confirmedTime ?? '') : '',
    call_rejected_date: status === 'reject' ? (opts.rejectedDate ?? null) : null,
    call_rejected_time: status === 'reject' ? (opts.rejectedTime ?? '') : '',
  };
  if (opts.note !== undefined) patch.call_note = opts.note;
  return patch;
}

export function schedulePrimary(opts: {
  channel: string;
  date?: string | null;
  time?: string;
  now?: string;
}): Partial<Candidate> {
  return {
    message_status: 'message_done',
    message_sent_at: opts.now ?? new Date().toISOString(),
    message_channel: opts.channel,
    ...(opts.date ? { primary_status: 'scheduled', primary_date: opts.date, primary_time: opts.time ?? '' } : {}),
  };
}

export function undoSchedule(): Partial<Candidate> {
  return { ...CLEAR_MESSAGE };
}

export function setPrimary(status: InterviewStatus, extra: Partial<Candidate> = {}): Partial<Candidate> {
  return {
    ...(status === 'selected' ? {} : CLEAR_SECONDARY),
    ...(status === 'pending' ? { primary_date: null, primary_time: '' } : {}),
    primary_status: status,
    ...extra,
  };
}

export function scheduleFinal(opts: { date: string; time: string; now?: string }): Partial<Candidate> {
  return {
    secondary_message_status: 'message_done',
    secondary_message_sent_at: opts.now ?? new Date().toISOString(),
    secondary_status: 'scheduled',
    secondary_date: opts.date,
    secondary_time: opts.time,
  };
}

export function setSecondary(status: InterviewStatus, extra: Partial<Candidate> = {}): Partial<Candidate> {
  return {
    ...(status === 'selected' ? {} : { joining_status: 'pending' as JoiningStatus, selection_category: null }),
    ...(status === 'pending' ? { secondary_date: null, secondary_time: '' } : {}),
    secondary_status: status,
    ...extra,
  };
}

/** Moves a selected candidate between the merit and waiting lists. An offer already out is withdrawn from the record. */
export function setCategory(c: Pick<Candidate, 'joining_status'>, category: SelectionCategory): Partial<Candidate> {
  const offerStands = category === 'merit' || c.joining_status === 'pending' || c.joining_status === 'declined';
  return {
    selection_category: category,
    ...(offerStands ? {} : { joining_status: 'pending' as JoiningStatus, offer_sent_at: null }),
  };
}

/** The confirmation letter goes out: records both days and locks the process. */
export function confirmDecision(opts: {
  selectedDate: string;
  selectedTime: string;
  joiningDate: string;
  joiningTime: string;
  by?: string;
  now?: string;
}): Partial<Candidate> {
  const now = opts.now ?? new Date().toISOString();
  return {
    final_decision: 'confirmed',
    decision_date: opts.selectedDate,
    decision_time: opts.selectedTime,
    informed_date: null,
    informed_time: '',
    joining_date: opts.joiningDate,
    joining_time: opts.joiningTime,
    joining_status: 'offer_sent',
    offer_sent_at: now,
    decided_by: opts.by ?? '',
    decided_at: now,
  };
}

/** The candidate is turned down after the final interview: records both days and locks the process. */
export function rejectDecision(opts: {
  rejectedDate: string;
  rejectedTime: string;
  informedDate: string;
  informedTime: string;
  by?: string;
  now?: string;
}): Partial<Candidate> {
  return {
    secondary_status: 'rejected',
    selection_category: null,
    final_decision: 'rejected',
    decision_date: opts.rejectedDate,
    decision_time: opts.rejectedTime,
    informed_date: opts.informedDate,
    informed_time: opts.informedTime,
    joining_status: 'pending',
    joining_time: '',
    offer_sent_at: null,
    decided_by: opts.by ?? '',
    decided_at: opts.now ?? new Date().toISOString(),
  };
}

/**
 * After the letter, HR calls the candidate to fix the joining. The candidate may confirm the offered
 * day or another one; until they confirm, only the call is recorded.
 */
export function recordJoiningCall(opts: {
  callDate: string;
  callTime: string;
  confirmedDate: string | null;
  confirmedTime: string;
  /** What HR noted on the call. Left as it was when not given. */
  remarks?: string;
}): Partial<Candidate> {
  return {
    joining_call_date: opts.callDate,
    joining_call_time: opts.callTime,
    joining_confirmed_date: opts.confirmedDate || null,
    joining_confirmed_time: opts.confirmedDate ? opts.confirmedTime : '',
    joining_status: opts.confirmedDate ? 'accepted' : 'offer_sent',
    ...(opts.remarks !== undefined ? { joining_remarks: opts.remarks.trim() } : {}),
  };
}

/** The joining day that counts: the one the candidate confirmed, otherwise the one offered in the letter. */
export function joiningWhen(c: Pick<Candidate, 'joining_date' | 'joining_time' | 'joining_confirmed_date' | 'joining_confirmed_time'>): { date: string | null; time: string; confirmed: boolean } {
  return c.joining_confirmed_date
    ? { date: c.joining_confirmed_date, time: c.joining_confirmed_time, confirmed: true }
    : { date: c.joining_date, time: c.joining_time, confirmed: false };
}

/** Admin only, for a decision recorded by mistake: reopens the decision step and nothing before it. */
export function unlockDecision(): Partial<Candidate> {
  return { ...CLEAR_DECISION };
}

export const CATEGORY_LABELS: Record<SelectionCategory, string> = { merit: 'Merit', waiting: 'Waiting' };

export const JOINING: Record<JoiningStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Letter not sent', tone: 'warning' },
  offer_sent: { label: 'Confirmed', tone: 'info' },
  accepted: { label: 'Joining confirmed', tone: 'good' },
  joined: { label: 'Joined', tone: 'good' },
  declined: { label: 'Did not confirm', tone: 'bad' },
};

/** Where someone stands after the final interview. The waiting list has no letter to send until a place opens. */
export function afterFinal(c: Pick<Candidate, 'joining_status' | 'selection_category'>): { label: string; tone: Tone } {
  return c.selection_category === 'waiting' && c.joining_status === 'pending' ? { label: 'Waiting for a place', tone: 'neutral' } : JOINING[c.joining_status];
}

/** Only a merit candidate who has not turned the offer down is taking up a vacancy. */
export function fillsVacancy(c: Pick<Candidate, 'secondary_status' | 'selection_category' | 'joining_status'>): boolean {
  return c.secondary_status === 'selected' && c.selection_category === 'merit' && c.joining_status !== 'declined';
}

type Panels = Pick<Candidate, 'primary_panel' | 'secondary_panel'>;

const panelEntries = (c: Panels) => [...(c.primary_panel ?? []), ...(c.secondary_panel ?? [])];

/** How many interviewers have scored the candidate across both rounds, and how many of them recommend them. */
export function recommendations(c: Panels): { recommended: number; total: number } {
  const entries = panelEntries(c);
  return { recommended: entries.filter((entry) => entry.referred).length, total: entries.length };
}

export function recommendationCount(c: Panels): number {
  return recommendations(c).recommended;
}

/** Plain words for the stars: who recommended the candidate and who did not. */
export function recommendationSummary(c: Panels): string {
  const entries = panelEntries(c);
  const names = (list: InterviewerScore[]) => [...new Set(list.map((entry) => entry.name).filter(Boolean))].join(', ');
  const yes = names(entries.filter((entry) => entry.referred));
  const no = names(entries.filter((entry) => !entry.referred));
  return [yes && `Recommended by ${yes}`, no && `Not recommended by ${no}`].filter(Boolean).join('. ');
}

/** Turns a panel into the columns that hold its average score and interviewer names. */
export function panelColumns(stage: 'primary' | 'secondary', panel: InterviewerScore[]): Partial<Candidate> {
  const scores = panel.map((entry) => entry.score).filter((score): score is number => score !== null);
  const average = scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null;
  const names = panel.map((entry) => entry.name).join(', ');
  return stage === 'primary'
    ? { primary_panel: panel, primary_score: average, primary_interviewer: names }
    : { secondary_panel: panel, secondary_score: average, secondary_interviewer: names };
}

/** Undoes the latest result, for when HR clicked the wrong thing. Null when there is nothing to undo or the process is locked. */
export function stepBack(c: PipelineFields): { label: string; patch: Partial<Candidate> } | null {
  if (isLocked(c)) return null;
  if (c.secondary_status === 'selected' || c.secondary_status === 'rejected') {
    return { label: 'Undo final result', patch: { ...CLEAR_DECISION, secondary_status: 'scheduled', selection_category: null } };
  }
  if (c.secondary_status === 'scheduled') return { label: 'Undo final schedule', patch: { ...CLEAR_SECONDARY } };
  if (c.primary_status === 'selected' || c.primary_status === 'rejected') {
    return { label: 'Undo primary result', patch: { ...CLEAR_SECONDARY, primary_status: 'scheduled' } };
  }
  if (c.message_status === 'message_done') return { label: 'Undo primary schedule', patch: undoSchedule() };
  if (c.call_status !== 'pending') return { label: 'Undo call result', patch: { ...CLEAR_CALL } };
  if (c.screening_status !== 'new') return { label: 'Back to new CV', patch: resetScreening() };
  return null;
}

// What may be done next, used for bulk actions.
export const can = {
  schedulePrimary: (c: PipelineFields) => c.call_status === 'confirm' && c.message_status === 'not_sent',
  scheduleFinal: (c: PipelineFields) => c.primary_status === 'selected' && c.secondary_status === 'pending',
};

// ---------------------------------------------------------------------------
// The process bar: the same seven steps for every candidate, from CV to final decision.
// ---------------------------------------------------------------------------

export type StepKey = 'review' | 'call' | 'primary_schedule' | 'primary' | 'final_schedule' | 'final' | 'decision';
export type StepState = 'done' | 'current' | 'stopped' | 'upcoming';

export interface ProcessStep {
  key: StepKey;
  label: string;
  state: StepState;
  detail: string;
}

type ProcessFields = PipelineFields &
  Pick<
    Candidate,
    | 'call_date' | 'call_time' | 'confirmed_date' | 'confirmed_time' | 'call_rejected_date' | 'call_rejected_time' | 'followup_on' | 'followup_time'
    | 'primary_date' | 'primary_time' | 'primary_score' | 'secondary_date' | 'secondary_time' | 'secondary_score'
    | 'selection_category' | 'decision_date' | 'joining_date' | 'joining_time'
    | 'joining_call_date' | 'joining_confirmed_date' | 'joining_confirmed_time'
  >;

const STEP_LABELS: Record<StepKey, string> = {
  review: 'CV review',
  call: 'Call',
  primary_schedule: 'Primary schedule',
  primary: 'Primary interview',
  final_schedule: 'Final schedule',
  final: 'Final interview',
  decision: 'Final decision',
};

const when = (date: string | null, time: string) => [dayMonth(date), time12(time)].filter(Boolean).join(', ');
const scoreText = (score: number | null) => (score === null ? '' : `Score ${score}/10`);

export function processSteps(c: ProcessFields): ProcessStep[] {
  const interviewState = (status: InterviewStatus): StepState => (status === 'selected' ? 'done' : status === 'rejected' ? 'stopped' : 'current');
  const steps: [StepKey, StepState, string][] = [
    ['review', c.screening_status === 'shortlisted' ? 'done' : c.screening_status === 'rejected' ? 'stopped' : 'current', c.screening_status === 'shortlisted' ? 'Selected' : c.screening_status === 'rejected' ? 'Rejected' : ''],
    [
      'call',
      c.call_status === 'confirm' ? 'done' : c.call_status === 'reject' ? 'stopped' : 'current',
      c.call_status === 'confirm' ? when(c.confirmed_date ?? c.call_date, c.confirmed_date ? c.confirmed_time : c.call_time)
        : c.call_status === 'followup' ? (c.followup_on ? `Again ${when(c.followup_on, c.followup_time)}` : 'Follow up')
        : c.call_status === 'reject' ? `Rejected ${when(c.call_rejected_date ?? c.call_date, c.call_rejected_date ? c.call_rejected_time : c.call_time)}`.trim() : '',
    ],
    ['primary_schedule', c.message_status === 'message_done' ? 'done' : 'current', when(c.primary_date, c.primary_time)],
    ['primary', interviewState(c.primary_status), scoreText(c.primary_score)],
    ['final_schedule', c.secondary_status !== 'pending' ? 'done' : 'current', when(c.secondary_date, c.secondary_time)],
    // A final rejection still means the interview took place; the rejection shows on the decision step.
    ['final', c.secondary_status === 'scheduled' || c.secondary_status === 'pending' ? 'current' : 'done', scoreText(c.secondary_score)],
    [
      'decision',
      c.final_decision === 'confirmed' ? 'done' : c.final_decision === 'rejected' ? 'stopped' : 'current',
      c.final_decision === 'confirmed' ? `Joins ${when(joiningWhen(c).date, joiningWhen(c).time)}`
        : c.final_decision === 'rejected' ? `Rejected ${dayMonth(c.decision_date)}`
        : c.secondary_status === 'selected' && c.selection_category ? CATEGORY_LABELS[c.selection_category] : '',
    ],
  ];
  // The first step not finished is where the candidate stands; nothing after it has happened yet.
  const stand = steps.findIndex(([, state]) => state !== 'done');
  return steps.map(([key, state, detail], index) => ({
    key,
    label: STEP_LABELS[key],
    state: stand === -1 || index < stand ? 'done' : index === stand ? state : 'upcoming',
    detail: stand === -1 || index <= stand ? detail : '',
  }));
}

// ---------------------------------------------------------------------------
// Corrections: a recorded step is corrected after an admin approves. Mirrors edit_step_fields in schema.sql.
// ---------------------------------------------------------------------------

export const EDIT_STEP_LABELS: Record<EditStep, string> = {
  call: 'Call',
  primary_schedule: 'Primary schedule',
  primary: 'Primary interview',
  final_schedule: 'Final schedule',
  final: 'Final interview',
  decision: 'Final decision',
};

/** The details each step records. A correction changes only these, never where the candidate stands. */
export const EDIT_STEP_FIELDS: Record<EditStep, (keyof Candidate)[]> = {
  call: ['call_date', 'call_time', 'confirmed_date', 'confirmed_time', 'call_rejected_date', 'call_rejected_time', 'followup_on', 'followup_time', 'call_note'],
  primary_schedule: ['primary_date', 'primary_time', 'message_channel'],
  primary: ['primary_panel', 'primary_score', 'primary_interviewer', 'primary_feedback'],
  final_schedule: ['secondary_date', 'secondary_time'],
  final: ['secondary_panel', 'secondary_score', 'secondary_interviewer', 'secondary_feedback'],
  decision: ['decision_date', 'decision_time', 'informed_date', 'informed_time', 'joining_date', 'joining_time'],
};

/** The steps of this candidate that hold a recorded result, so there is something to correct. */
export function correctableSteps(c: PipelineFields): EditStep[] {
  const steps: EditStep[] = [];
  if (c.call_status !== 'pending') steps.push('call');
  if (c.message_status === 'message_done') steps.push('primary_schedule');
  if (c.primary_status === 'selected' || c.primary_status === 'rejected') steps.push('primary');
  if (c.secondary_status !== 'pending') steps.push('final_schedule');
  if (c.secondary_status === 'selected' || c.secondary_status === 'rejected') steps.push('final');
  if (c.final_decision) steps.push('decision');
  return steps;
}

/** Only the fields of the step that differ from the candidate's current values. */
export function correctionChanges(step: EditStep, c: Candidate, draft: Partial<Candidate>): Partial<Candidate> {
  const changes: Partial<Candidate> = {};
  for (const field of EDIT_STEP_FIELDS[step]) {
    if (!(field in draft)) continue;
    if (JSON.stringify(draft[field] ?? null) !== JSON.stringify(c[field] ?? null)) {
      (changes as Record<string, unknown>)[field] = draft[field];
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Feedback links: shared before or after the interview, open until the candidate moves on.
// Mirrors review_is_open in schema.sql.
// ---------------------------------------------------------------------------

export type ReviewStage = 'primary' | 'secondary';

export function isReviewOpen(c: Pick<Candidate, 'message_status' | 'secondary_status' | 'final_decision'>, stage: ReviewStage): boolean {
  return stage === 'primary'
    ? c.message_status === 'message_done' && c.secondary_status === 'pending'
    : c.secondary_status !== 'pending' && c.final_decision === null;
}

/** The interview whose feedback link works right now, if any. */
export function openReviewStage(c: Pick<Candidate, 'message_status' | 'secondary_status' | 'final_decision'>): ReviewStage | null {
  if (isReviewOpen(c, 'secondary')) return 'secondary';
  if (isReviewOpen(c, 'primary')) return 'primary';
  return null;
}

/** When the link stops working, in words. */
export const REVIEW_CLOSES: Record<ReviewStage, string> = {
  primary: 'until the final interview is scheduled',
  secondary: 'until the final decision is made',
};

/** Position in the process, for sorting: later steps sort after earlier ones. */
export function processPosition(c: ProcessFields): number {
  const steps = processSteps(c);
  const stand = steps.findIndex((step) => step.state === 'current' || step.state === 'stopped');
  return stand === -1 ? steps.length : stand;
}

/** In a few words, what has to happen next for this candidate. */
export function nextAction(c: ProcessFields): string {
  if (c.joining_status === 'joined') return 'Joined';
  if (c.joining_status === 'declined') return 'Did not confirm';
  if (c.joining_status === 'accepted') return `Joins ${when(c.joining_confirmed_date, c.joining_confirmed_time)} (confirmed)`;
  if (c.final_decision === 'confirmed') return c.joining_call_date ? 'Called for joining, no day confirmed' : 'Next: call for joining';
  if (c.final_decision === 'rejected') return `Locked · Rejected ${dayMonth(c.decision_date)}`;
  if (c.screening_status === 'rejected' || c.call_status === 'reject' || c.primary_status === 'rejected') return 'Process stopped';
  if (c.screening_status === 'new') return 'Next: review the CV';
  if (c.call_status === 'followup') return c.followup_on ? `Next: call again ${when(c.followup_on, c.followup_time)}` : 'Next: call again';
  if (c.call_status === 'pending') return 'Next: call the candidate';
  if (c.message_status === 'not_sent') return 'Next: set primary schedule';
  if (c.primary_status === 'pending' || c.primary_status === 'scheduled') return when(c.primary_date, c.primary_time) ? `Primary on ${when(c.primary_date, c.primary_time)}` : 'Next: set primary schedule';
  if (c.secondary_status === 'pending') return 'Next: set final schedule';
  if (c.secondary_status === 'scheduled') return `Final on ${when(c.secondary_date, c.secondary_time)}`;
  if (c.secondary_status === 'rejected') return 'Next: record the rejection';
  if (c.selection_category === 'waiting') return 'On the waiting list';
  return 'Next: send confirmation letter';
}

export interface BucketStats {
  total: number;
  shortlisted: number;
  called: number;
  secondarySelected: number;
  merit: number;
  waiting: number;
  rejected: number;
  joined: number;
  reviewSeconds: number;
  /** CVs with review time recorded: each CV is reviewed once, however many sittings it took. */
  reviewedCvs: number;
  sources: { source: string; count: number }[];
}

export function bucketStats(items: Candidate[]): BucketStats {
  const stats: BucketStats = {
    total: items.length,
    shortlisted: 0,
    called: 0,
    secondarySelected: 0,
    merit: 0,
    waiting: 0,
    rejected: 0,
    joined: 0,
    reviewSeconds: 0,
    reviewedCvs: 0,
    sources: [],
  };
  const sources = new Map<string, number>();
  for (const c of items) {
    if (c.screening_status === 'shortlisted') stats.shortlisted += 1;
    if (c.call_status !== 'pending') stats.called += 1;
    if (c.secondary_status === 'selected') stats.secondarySelected += 1;
    if (c.selection_category === 'merit') stats.merit += 1;
    if (c.selection_category === 'waiting') stats.waiting += 1;
    if (c.joining_status === 'joined') stats.joined += 1;
    if (isRejected(c)) stats.rejected += 1;
    stats.reviewSeconds += c.review_seconds ?? 0;
    if ((c.review_seconds ?? 0) > 0) stats.reviewedCvs += 1;
    sources.set(c.source, (sources.get(c.source) ?? 0) + 1);
  }
  stats.sources = [...sources.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
  return stats;
}

export type StageFilter =
  | 'all'
  | 'new'
  | 'calling'
  | 'messaging'
  | 'primary'
  | 'secondary'
  | 'decision'
  | 'confirmed'
  | 'rejected';

/** Apart from "all", each candidate is in exactly one of these at any time. */
export function matchesStageFilter(c: PipelineFields, filter: StageFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'rejected') return isRejected(c);
  if (isRejected(c)) return false;
  switch (filter) {
    case 'new':
      return c.screening_status === 'new';
    case 'calling':
      return c.screening_status === 'shortlisted' && (c.call_status === 'pending' || c.call_status === 'followup');
    case 'messaging':
      return c.call_status === 'confirm' && c.message_status === 'not_sent';
    case 'primary':
      return c.message_status === 'message_done' && (c.primary_status === 'pending' || c.primary_status === 'scheduled');
    case 'secondary':
      return c.primary_status === 'selected' && (c.secondary_status === 'pending' || c.secondary_status === 'scheduled');
    case 'decision':
      return c.secondary_status === 'selected' && c.final_decision !== 'confirmed';
    case 'confirmed':
      return c.final_decision === 'confirmed';
  }
}

/** Digits only, without the Bangladesh country prefix, so 8801711… and 01711… compare equal. */
export function normalizePhone(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.startsWith('880') ? digits.slice(2) : digits;
}

export function findDuplicate<T extends { phone: string; email: string }>(
  person: { phone: string; email: string },
  others: T[],
): T | undefined {
  const phone = normalizePhone(person.phone);
  const email = (person.email ?? '').trim().toLowerCase();
  return others.find(
    (o) =>
      (phone.length >= 10 && normalizePhone(o.phone) === phone) ||
      (email !== '' && (o.email ?? '').trim().toLowerCase() === email),
  );
}
