import type { AppNotification, Candidate, Desk, NotificationEvent, Profile } from '../types';
import { whenText } from './format';

// Desks split the work: the screening desk receives, uploads and screens CVs and hands the selected ones
// over; the process desk does every step after that. supabase/schema.sql enforces the same split.

export const DESK_LABELS: Record<Desk, string> = {
  all: 'All steps',
  screening: 'CV screening and handover',
  process: 'Process after handover',
};

type Person = Pick<Profile, 'role' | 'desk'> | null | undefined;

const writes = (p: Person) => p?.role === 'admin' || p?.role === 'hr';

/** Upload CVs, screen them, hand them over and change who handles them. */
export const canScreenAs = (p: Person) => writes(p) && (p!.desk === 'screening' || p!.desk === 'all');

/** Every step from the call to joining. */
export const canProcessAs = (p: Person) => writes(p) && (p!.desk === 'process' || p!.desk === 'all');

/** The people a CV can be handed to. */
export function processTeam(people: Profile[]): Profile[] {
  return people.filter((p) => writes(p) && (p.desk === 'process' || p.desk === 'all'));
}

export const personName = (p: Pick<Profile, 'full_name' | 'email'> | undefined) => p?.full_name || p?.email || 'Someone';

/** True when this candidate is this person's to handle: handed to them, or to the whole process team. */
export function isHandledBy(c: Pick<Candidate, 'assigned_to'>, userId: string | undefined): boolean {
  const assigned = c.assigned_to ?? [];
  return assigned.length === 0 || (userId !== undefined && assigned.includes(userId));
}

/** "Nafis", "Nafis, Mili" or "Whole process team". */
export function handlerNames(c: Pick<Candidate, 'assigned_to'>, people: Profile[]): string {
  const assigned = c.assigned_to ?? [];
  if (assigned.length === 0) return 'Whole process team';
  return assigned.map((id) => personName(people.find((p) => p.id === id))).join(', ');
}

/** Columns only the screening desk may change. */
export const SCREENING_FIELDS = ['screening_status', 'screening_note', 'assigned_to', 'handover_note', 'handed_over_by', 'handed_over_at'] as const;

/** Columns only the process desk may change. Profile details are open to both. */
export const PROCESS_FIELDS = [
  'call_status', 'call_note', 'followup_on', 'followup_time', 'called_at', 'called_by', 'call_date', 'call_time',
  'confirmed_date', 'confirmed_time', 'call_rejected_date', 'call_rejected_time',
  'message_status', 'message_sent_at', 'message_channel',
  'primary_status', 'primary_date', 'primary_time', 'primary_interviewer', 'primary_score', 'primary_feedback', 'primary_panel',
  'secondary_message_status', 'secondary_message_sent_at', 'secondary_status', 'secondary_date', 'secondary_time',
  'secondary_interviewer', 'secondary_score', 'secondary_feedback', 'secondary_panel', 'selection_category',
  'final_decision', 'decision_date', 'decision_time', 'informed_date', 'informed_time', 'decided_by', 'decided_at',
  'joining_status', 'joining_date', 'joining_time', 'joining_call_date', 'joining_call_time',
  'joining_confirmed_date', 'joining_confirmed_time', 'joining_remarks', 'offered_salary', 'employee_code', 'probation_period',
  'reporting_to', 'documents_received', 'offer_sent_at',
] as const;

type StepFields = Pick<
  Candidate,
  | 'joining_status' | 'final_decision' | 'secondary_status' | 'primary_status' | 'message_status' | 'call_status'
  | 'primary_date' | 'primary_time' | 'secondary_date' | 'secondary_time' | 'joining_date' | 'joining_time'
  | 'joining_confirmed_date' | 'joining_confirmed_time'
>;

/** The step one update completed, if any, and its day and time. Mirrors notify_candidate_changes in schema.sql. */
export function completedStep(before: StepFields, after: StepFields): { event: NotificationEvent; detail: string } | null {
  const at = (date: string | null, time: string) => [date ?? '', time ?? ''].join(' ').trim();
  if (after.joining_status !== before.joining_status && ['accepted', 'joined', 'declined'].includes(after.joining_status)) {
    if (after.joining_status === 'accepted') return { event: 'joining_accepted', detail: at(after.joining_confirmed_date, after.joining_confirmed_time) };
    return { event: after.joining_status === 'joined' ? 'joined' : 'joining_declined', detail: '' };
  }
  if (after.final_decision !== before.final_decision && after.final_decision) {
    return after.final_decision === 'confirmed'
      ? { event: 'decision_confirmed', detail: at(after.joining_date, after.joining_time) }
      : { event: 'decision_rejected', detail: '' };
  }
  if (after.secondary_status !== before.secondary_status && ['scheduled', 'selected', 'rejected'].includes(after.secondary_status)) {
    return { event: `final_${after.secondary_status}` as NotificationEvent, detail: after.secondary_status === 'scheduled' ? at(after.secondary_date, after.secondary_time) : '' };
  }
  if (after.primary_status !== before.primary_status && (after.primary_status === 'selected' || after.primary_status === 'rejected')) {
    return { event: `primary_${after.primary_status}` as NotificationEvent, detail: '' };
  }
  if (after.message_status !== before.message_status && after.message_status === 'message_done') {
    return { event: 'primary_scheduled', detail: at(after.primary_date, after.primary_time) };
  }
  if (after.call_status !== before.call_status && (after.call_status === 'confirm' || after.call_status === 'reject')) {
    return { event: `call_${after.call_status}` as NotificationEvent, detail: '' };
  }
  return null;
}

const STEP_TEXT: Partial<Record<NotificationEvent, string>> = {
  call_confirm: 'confirmed on the call',
  call_reject: 'turned the job down on the call',
  primary_scheduled: 'primary interview scheduled',
  primary_selected: 'passed the primary interview',
  primary_rejected: 'rejected at the primary interview',
  final_scheduled: 'final interview scheduled',
  final_selected: 'selected at the final interview',
  final_rejected: 'rejected at the final interview',
  decision_confirmed: 'confirmation letter sent',
  decision_rejected: 'final rejection recorded',
  joining_accepted: 'joining day confirmed',
  joined: 'joined',
  joining_declined: 'did not confirm joining',
};

/** The big decisions: the end of a candidate's process. Only these reach the screening desk as notifications. */
export const COMPLETES_PROCESS: NotificationEvent[] = ['decision_confirmed', 'decision_rejected', 'joined', 'joining_declined'];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** A day and time stored as "2026-11-12 10:30", in words. */
function storedWhen(value: string): string {
  const [date, time] = value.split(' ');
  return whenText(date || null, time ?? '');
}

export function notificationText(n: AppNotification): { title: string; detail: string; tone: 'info' | 'good' | 'bad' } {
  const where = n.designation;
  switch (n.event) {
    case 'new_cvs':
      return {
        title: n.actor_name === 'Company form'
          ? `${plural(n.item_count, 'new application')} from the company form`
          : `${n.actor_name} added ${plural(n.item_count, 'new CV')}`,
        detail: where,
        tone: 'info',
      };
    case 'posting':
      return { title: `${n.actor_name} added a job posting`, detail: [where, n.detail].filter(Boolean).join(' · '), tone: 'info' };
    case 'handover':
      return {
        title: n.item_count === 1 ? `${n.actor_name} handed over ${n.subject}` : `${n.actor_name} handed over ${plural(n.item_count, 'CV')}`,
        detail: [where, 'Next: the call', n.detail && `"${n.detail}"`].filter(Boolean).join(' · '),
        tone: 'info',
      };
    // For corrections the detail holds the step, then the reason or the approver's note.
    case 'edit_request':
      return { title: `${n.actor_name} asks to correct ${n.subject}`, detail: [n.detail, where].filter(Boolean).join(' · '), tone: 'info' };
    case 'edit_approved':
      return { title: `${n.actor_name} approved your correction for ${n.subject}`, detail: [n.detail, 'Open the card to correct it'].filter(Boolean).join(' · '), tone: 'good' };
    case 'edit_rejected':
      return { title: `${n.actor_name} turned down your correction for ${n.subject}`, detail: [n.detail, where].filter(Boolean).join(' · '), tone: 'bad' };
    case 'edit_used':
      return { title: `${n.actor_name} corrected ${n.subject}`, detail: [n.detail, where].filter(Boolean).join(' · '), tone: 'info' };
    default: {
      const step = STEP_TEXT[n.event] ?? n.event;
      const when = !n.detail
        ? ''
        : n.event === 'decision_confirmed' || n.event === 'joining_accepted'
          ? `, joins ${storedWhen(n.detail)}`
          : n.event.endsWith('scheduled') ? ` for ${storedWhen(n.detail)}` : '';
      const bad = n.event.endsWith('rejected') || n.event === 'call_reject' || n.event === 'joining_declined';
      return {
        title: `${n.subject}: ${step}${when}`,
        detail: `${where} · by ${n.actor_name}`,
        tone: bad ? 'bad' : COMPLETES_PROCESS.includes(n.event) || n.event === 'joining_accepted' ? 'good' : 'info',
      };
    }
  }
}

/** Where a notification leads: the candidate's card for one person, the bucket for several. */
export function notificationLink(n: AppNotification): { pathname?: string; candidate?: string } {
  if (n.event === 'posting') return { pathname: '/requisitions' };
  if (n.candidate_id && n.item_count === 1) return { candidate: n.candidate_id };
  if (n.bucket_id) return { pathname: `/buckets/${n.bucket_id}${n.event === 'new_cvs' ? '?stage=new' : n.event === 'handover' ? '?stage=calling' : ''}` };
  return {};
}
