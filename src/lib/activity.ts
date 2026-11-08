import type { Candidate, CandidateEvent, CvReviewSession, Profile } from '../types';

// Team activity: who did what, built from the audit trail the database writes on every step.

export type ActivityKind = 'upload' | 'screening' | 'handover' | 'call' | 'interview' | 'decision' | 'joining' | 'other';

export const ACTIVITY_KINDS: { value: ActivityKind; label: string }[] = [
  { value: 'upload', label: 'CVs received' },
  { value: 'screening', label: 'CV screening' },
  { value: 'handover', label: 'Handovers' },
  { value: 'call', label: 'Calls' },
  { value: 'interview', label: 'Interviews' },
  { value: 'decision', label: 'Final decisions' },
  { value: 'joining', label: 'Joining' },
];

const KIND_OF_FIELD: Record<string, ActivityKind> = {
  received: 'upload',
  screening_status: 'screening',
  assigned_to: 'handover',
  call_status: 'call',
  message_status: 'interview',
  primary_status: 'interview',
  secondary_message_status: 'interview',
  secondary_status: 'interview',
  selection_category: 'interview',
  final_decision: 'decision',
  joining_status: 'joining',
};

export const kindOf = (event: Pick<CandidateEvent, 'field'>): ActivityKind => KIND_OF_FIELD[event.field] ?? 'other';

const INTERVIEW_RESULT: Record<string, string> = {
  pending: 'result cleared',
  scheduled: 'scheduled',
  selected: 'selected',
  rejected: 'rejected',
};

/** What one entry in the audit trail means, in words: "Selected the CV", "Handed to Nafis". */
export function activityText(event: Pick<CandidateEvent, 'field' | 'from_value' | 'to_value' | 'actor_name'>): string {
  const to = event.to_value ?? '';
  switch (event.field) {
    case 'received':
      return event.actor_name === 'Candidate / system' ? 'Applied through the company form' : `Uploaded the CV${to ? ` (${to})` : ''}`;
    case 'screening_status':
      return to === 'shortlisted' ? 'Selected the CV' : to === 'rejected' ? 'Rejected the CV' : 'Moved the CV back to New';
    case 'assigned_to':
      return event.from_value ? `Moved from ${event.from_value} to ${to}` : `Handed to ${to}`;
    case 'call_status':
      return { confirm: 'Call: candidate confirmed', reject: 'Call: candidate turned it down', followup: 'Call: to follow up', pending: 'Call result cleared' }[to] ?? `Call: ${to}`;
    case 'message_status':
      return to === 'message_done' ? 'Set the primary interview schedule' : 'Cleared the primary interview schedule';
    case 'primary_status':
      return `Primary interview ${INTERVIEW_RESULT[to] ?? to}`;
    case 'secondary_message_status':
      return to === 'message_done' ? 'Set the final interview schedule' : 'Cleared the final interview schedule';
    case 'secondary_status':
      return `Final interview ${INTERVIEW_RESULT[to] ?? to}`;
    case 'selection_category':
      return to === 'merit' ? 'Put on the merit list' : to === 'waiting' ? 'Put on the waiting list' : 'Taken off the selection list';
    case 'final_decision':
      return to === 'confirmed' ? 'Sent the confirmation letter' : to === 'rejected' ? 'Recorded the final rejection' : 'Unlocked the final decision';
    case 'joining_status':
      return { offer_sent: 'Offer sent', accepted: 'Joining day confirmed', joined: 'Marked as joined', declined: 'Did not confirm joining', pending: 'Joining reset' }[to] ?? `Joining: ${to}`;
    case 'bucket_id':
      return 'Moved to another CV bucket';
    default:
      return event.field;
  }
}

/** The person behind an entry: by account where it was kept, by name for older entries. */
export function actorOf(event: Pick<CandidateEvent, 'actor_id' | 'actor_name'>, team: Profile[]): Profile | undefined {
  if (event.actor_id) return team.find((p) => p.id === event.actor_id);
  return team.find((p) => (p.full_name || p.email) === event.actor_name);
}

export interface PersonSummary {
  person: Profile;
  uploaded: number;
  screened: number;
  handedOver: number;
  calls: number;
  interviews: number;
  decisions: number;
  joining: number;
  reviewSeconds: number;
  /** Their latest recorded step in the period. */
  lastAt: string | null;
  /** Candidates handed to them by name and still in the process. */
  inHand: number;
  /** Total steps in the period. */
  total: number;
}

/** True while a candidate still needs someone to act: selected, and not stopped or finished. */
export function stillInProcess(c: Candidate): boolean {
  if (c.screening_status !== 'shortlisted') return false;
  if (c.call_status === 'reject' || c.primary_status === 'rejected' || c.secondary_status === 'rejected') return false;
  if (c.final_decision === 'rejected') return false;
  return !(c.joining_status === 'joined' || c.joining_status === 'declined');
}

export function summarise(
  team: Profile[], events: CandidateEvent[], sessions: CvReviewSession[], candidates: Candidate[],
): PersonSummary[] {
  const rows = new Map<string, PersonSummary>();
  for (const person of team.filter((p) => p.role !== 'pending')) {
    rows.set(person.id, {
      person, uploaded: 0, screened: 0, handedOver: 0, calls: 0, interviews: 0, decisions: 0, joining: 0,
      reviewSeconds: 0, lastAt: null, total: 0,
      inHand: candidates.filter((c) => stillInProcess(c) && c.assigned_to.includes(person.id)).length,
    });
  }
  for (const event of events) {
    const actor = actorOf(event, team);
    const row = actor && rows.get(actor.id);
    if (!row) continue;
    const kind = kindOf(event);
    if (kind === 'upload') row.uploaded += 1;
    else if (kind === 'screening') row.screened += 1;
    else if (kind === 'handover') row.handedOver += 1;
    else if (kind === 'call') row.calls += 1;
    else if (kind === 'interview') row.interviews += 1;
    else if (kind === 'decision') row.decisions += 1;
    else if (kind === 'joining') row.joining += 1;
    row.total += 1;
    if (!row.lastAt || event.created_at > row.lastAt) row.lastAt = event.created_at;
  }
  for (const session of sessions) {
    const person = session.reviewer_id
      ? team.find((p) => p.id === session.reviewer_id)
      : team.find((p) => (p.full_name || p.email) === session.reviewer_name);
    const row = person && rows.get(person.id);
    if (row) row.reviewSeconds += session.seconds;
  }
  return [...rows.values()];
}

export interface FeedItem {
  key: string;
  event: CandidateEvent;
  /** Several uploads by one person to one bucket within minutes show as one line. */
  count: number;
}

const UPLOAD_GROUP_MS = 15 * 60 * 1000;

/** Newest first. A bulk upload of 500 CVs is one line, not 500. */
export function buildFeed(events: CandidateEvent[], bucketOf: (candidateId: string) => string | undefined): FeedItem[] {
  const sorted = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const feed: FeedItem[] = [];
  for (const event of sorted) {
    const last = feed[feed.length - 1];
    if (
      event.field === 'received' && last?.event.field === 'received' &&
      last.event.actor_name === event.actor_name &&
      bucketOf(last.event.candidate_id) === bucketOf(event.candidate_id) &&
      Date.parse(last.event.created_at) - Date.parse(event.created_at) < UPLOAD_GROUP_MS
    ) {
      last.count += 1;
      continue;
    }
    feed.push({ key: event.id, event, count: 1 });
  }
  return feed;
}
