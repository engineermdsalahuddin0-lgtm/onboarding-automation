import type { Candidate, InterviewAssessment, InterviewPanelMember, InterviewStage, Profile } from '../types';
import { isFilled } from './assessment';
import { stageOf } from './pipeline';
import { personName } from './team';

// What happened at a bucket's primary or final interview, and where its rejected candidates stopped. Shown when
// hovering a CV bucket folder or the tiles inside a bucket.

export interface RoundSummary {
  stage: InterviewStage;
  /** Everyone whose interview at this round was scheduled. */
  scheduled: Candidate[];
  /** Came, and a result was recorded. */
  attended: Candidate[];
  passed: Candidate[];
  failed: Candidate[];
  /** Scheduled, no result yet and nothing missed. */
  waiting: Candidate[];
  absent: Candidate[];
  cantAttend: Candidate[];
  notInterested: Candidate[];
  /** Given a new date after missing it. */
  rescheduled: Candidate[];
  days: string[];
  interviewers: string[];
}

const round = (c: Candidate, stage: InterviewStage) => (stage === 'primary'
  ? { reached: c.message_status === 'message_done', status: c.primary_status, attendance: c.primary_attendance ?? '', reschedules: c.primary_reschedules ?? 0, date: c.primary_date, panel: c.primary_panel ?? [] }
  : { reached: c.secondary_status !== 'pending', status: c.secondary_status, attendance: c.secondary_attendance ?? '', reschedules: c.secondary_reschedules ?? 0, date: c.secondary_date, panel: c.secondary_panel ?? [] });

export function roundSummary(
  items: Candidate[],
  stage: InterviewStage,
  context: { bucketId: string; panels: InterviewPanelMember[]; team: Profile[]; assessments: InterviewAssessment[] },
): RoundSummary {
  const scheduled = items.filter((c) => round(c, stage).reached);
  const of = (test: (r: ReturnType<typeof round>) => boolean) => scheduled.filter((c) => test(round(c, stage)));
  const ids = new Set(scheduled.map((c) => c.id));
  // Who interviews: the panel, everyone who filled a form, and names typed on a recorded result.
  const interviewers = new Set<string>([
    ...context.panels.filter((p) => p.bucket_id === context.bucketId && p.stage === stage).map((p) => personName(context.team.find((t) => t.id === p.interviewer_id))),
    ...context.assessments.filter((a) => a.stage === stage && ids.has(a.candidate_id) && isFilled(a)).map((a) => a.interviewer_name),
    ...scheduled.flatMap((c) => round(c, stage).panel.map((entry) => entry.name)),
  ].filter((name) => name && name !== 'Someone'));
  return {
    stage,
    scheduled,
    attended: of((r) => (r.status === 'selected' || r.status === 'rejected') && r.attendance === ''),
    passed: of((r) => r.status === 'selected'),
    failed: of((r) => r.status === 'rejected' && r.attendance === ''),
    waiting: of((r) => (r.status === 'scheduled' || r.status === 'pending') && r.attendance === ''),
    absent: of((r) => r.attendance === 'absent'),
    cantAttend: of((r) => r.attendance === 'cant_attend'),
    notInterested: of((r) => r.attendance === 'not_interested'),
    rescheduled: of((r) => r.reschedules > 0),
    days: [...new Set(scheduled.map((c) => round(c, stage).date).filter((d): d is string => Boolean(d)))].sort(),
    interviewers: [...interviewers].sort(),
  };
}

const REJECTION_STEPS: { key: string; label: string }[] = [
  { key: 'rej_screening', label: 'At CV screening' },
  { key: 'rej_call', label: 'On the call (turned it down)' },
  { key: 'rej_primary', label: 'At the primary interview' },
  { key: 'rej_secondary', label: 'At the final interview' },
  { key: 'declined', label: 'Did not confirm joining' },
];

/** The rejected candidates, grouped by the step they stopped at, in process order. */
export function rejectionsByStep(items: Candidate[]): { label: string; people: { name: string; detail: string }[] }[] {
  return REJECTION_STEPS
    .map(({ key, label }) => ({
      label,
      people: items.filter((c) => stageOf(c).key === key).map((c) => ({ name: c.full_name, detail: stageOf(c).label })),
    }))
    .filter((group) => group.people.length > 0);
}
