import type { Attendance, Candidate } from '../types';
import { dayMonth, whenText } from './format';
import { joiningWhen, stageOf } from './pipeline';

// The map at the top of a CV bucket: how many reached each step and what became of them. Unlike the tabs,
// which say where everyone is now, a count here never drops: the 50 selected from their CVs stay 50 when
// some of them are later rejected at an interview.

/** start: the CVs. pass: the path to the job. rejected: left there. hold: missed or set aside. todo: work still to do. */
export type FlowKind = 'start' | 'pass' | 'rejected' | 'hold' | 'todo';

export interface FlowBox {
  id: string;
  label: string;
  kind: FlowKind;
  /** What the box means, with how many of how many, for the hover card. */
  summary: string;
  people: Candidate[];
  /** What to show beside each name on hover. */
  detail: (c: Candidate) => string;
}

export interface FlowStep {
  title: string;
  /** The people who moved on: the green box. */
  node: FlowBox;
  /** Everyone else who reached this step, by what happened to them. Boxes with nobody in them are left out. */
  branches: FlowBox[];
}

type Round = 'primary' | 'secondary';

const round = (c: Candidate, r: Round) => (r === 'primary'
  ? { status: c.primary_status, attendance: (c.primary_attendance ?? '') as Attendance, date: c.primary_date, time: c.primary_time, score: c.primary_score, note: c.primary_attendance_note ?? '' }
  : { status: c.secondary_status, attendance: (c.secondary_attendance ?? '') as Attendance, date: c.secondary_date, time: c.secondary_time, score: c.secondary_score, note: c.secondary_attendance_note ?? '' });

const share = (part: number, whole: number) => `${part} of ${whole}${whole > 0 ? ` (${Math.round((part / whole) * 100)}%)` : ''}`;
const score = (value: number | null) => (value === null ? '' : `Score ${value}/10`);
const missedText = (attendance: Attendance) =>
  attendance === 'absent' ? 'Did not come' : attendance === 'cant_attend' ? 'Could not come' : attendance === 'not_interested' ? 'Not interested' : '';
const nowAt = (c: Candidate) => stageOf(c).label;
const days = (people: Candidate[], r: Round) => {
  const list = [...new Set(people.map((c) => round(c, r).date).filter((d): d is string => Boolean(d)))].sort();
  return list.length === 0 ? '' : `${list.slice(0, 2).map((d) => dayMonth(d)).join(', ')}${list.length > 2 ? ` +${list.length - 2} more` : ''}`;
};
const sentence = (...parts: string[]) => parts.filter(Boolean).join(' · ');

function box(id: string, label: string, kind: FlowKind, people: Candidate[], summary: string, detail: (c: Candidate) => string): FlowBox {
  return { id, label, kind, people, summary, detail };
}

/** An interview round: who passed, who was rejected, who missed it, and who is still waiting for it. */
function interviewStep(title: string, r: Round, reached: Candidate[], today: string, interviewers: string[]): FlowStep {
  const id = r === 'primary' ? 'primary' : 'final';
  const of = (test: (x: ReturnType<typeof round>, c: Candidate) => boolean) => reached.filter((c) => test(round(c, r), c));
  // The primary round is set once the schedule message goes out; the final once its status leaves pending.
  const unscheduled = (c: Candidate) => (r === 'primary' ? c.message_status !== 'message_done' : c.secondary_status === 'pending');
  const waiting = (x: ReturnType<typeof round>, c: Candidate) => !unscheduled(c) && (x.status === 'scheduled' || x.status === 'pending') && x.attendance === '';
  const passed = of((x) => x.status === 'selected');
  const when = (c: Candidate) => whenText(round(c, r).date, round(c, r).time) || 'Day not set';
  return {
    title,
    node: box(`${id}.selected`, 'Selected', 'pass', passed, sentence(`${share(passed.length, reached.length)} passed`, days(reached, r), interviewers.length > 0 ? interviewers.join(', ') : ''), (c) => score(round(c, r).score) || nowAt(c)),
    branches: [
      box(`${id}.rejected`, 'Rejected', 'rejected', of((x) => x.status === 'rejected'), 'Rejected at this interview, or for not coming to it.', (c) => missedText(round(c, r).attendance) || score(round(c, r).score)),
      box(`${id}.absent`, 'Absent', 'hold', of((x) => x.status === 'scheduled' && x.attendance === 'absent'), 'Did not come and did not tell us.', (c) => `Missed ${when(c)}`),
      box(`${id}.cant`, "Can't attend", 'hold', of((x) => x.status === 'scheduled' && x.attendance === 'cant_attend'), 'Told us they cannot come.', (c) => round(c, r).note || `Was set for ${when(c)}`),
      box(`${id}.due`, 'Result due', 'todo', of((x, c) => waiting(x, c) && Boolean(x.date) && (x.date as string) < today), 'The interview day has passed; the result is not in yet.', when),
      box(`${id}.scheduled`, 'Scheduled', 'todo', of((x, c) => waiting(x, c) && !(x.date && x.date < today)), 'Coming for the interview.', when),
      box(`${id}.unscheduled`, 'Not scheduled', 'todo', reached.filter(unscheduled), 'Waiting for an interview date.', (c) => (r === 'primary' && c.confirmed_date ? `Confirmed ${dayMonth(c.confirmed_date)}` : nowAt(c))),
    ],
  };
}

/** Every step of a bucket, from the CVs received to the people who joined. */
export function bucketFlow(items: Candidate[], today: string, interviewers: { primary: string[]; final: string[] } = { primary: [], final: [] }): FlowStep[] {
  const selected = items.filter((c) => c.screening_status === 'shortlisted');
  const called = selected.filter((c) => c.call_status !== 'pending');
  const confirmed = selected.filter((c) => c.call_status === 'confirm');
  const primaryPassed = confirmed.filter((c) => c.primary_status === 'selected');
  const finalPassed = primaryPassed.filter((c) => c.secondary_status === 'selected');
  const letters = finalPassed.filter((c) => c.final_decision === 'confirmed');
  const joined = letters.filter((c) => c.joining_status === 'joined');

  const steps: FlowStep[] = [
    {
      title: 'Start',
      node: box('all', 'CVs received', 'start', items, 'Every CV in this bucket.', nowAt),
      branches: [],
    },
    {
      title: '1 · CV review',
      node: box('cv.selected', 'Selected from CV', 'pass', selected, `${share(selected.length, items.length)} selected on reading the CV.`, nowAt),
      branches: [
        box('cv.rejected', 'Rejected on CV', 'rejected', items.filter((c) => c.screening_status === 'rejected'), 'Rejected on reading the CV.', (c) => c.screening_note || 'Rejected'),
        box('cv.new', 'Not reviewed', 'todo', items.filter((c) => c.screening_status === 'new'), 'Nobody has selected or rejected these CVs yet.', (c) => `Received ${dayMonth(c.received_at)}`),
      ],
    },
    {
      title: '2 · Call',
      node: box('call.confirmed', 'Confirmed', 'pass', confirmed, `${share(confirmed.length, selected.length)} confirmed. ${called.length} of ${selected.length} called so far.`, nowAt),
      branches: [
        box('call.rejected', 'Candidate rejected', 'rejected', selected.filter((c) => c.call_status === 'reject'), 'Turned the job down on the call.', (c) => c.call_note || `On ${dayMonth(c.call_rejected_date)}`),
        box('call.followup', 'Follow-up', 'hold', selected.filter((c) => c.call_status === 'followup'), 'No answer, or asked to be called later.', (c) => (c.followup_on ? `Call again ${whenText(c.followup_on, c.followup_time)}` : 'Call again')),
        box('call.pending', 'Not called yet', 'todo', selected.filter((c) => c.call_status === 'pending'), 'Selected from the CV, not called yet.', (c) => (c.handed_over_at ? `Selected ${dayMonth(c.handed_over_at)}` : 'Selected')),
      ],
    },
    interviewStep('3 · Primary', 'primary', confirmed, today, interviewers.primary),
    interviewStep('4 · Final', 'secondary', primaryPassed, today, interviewers.final),
    {
      title: '5 · Decision',
      node: box('decision.letter', 'Letter sent', 'pass', letters, `${share(letters.length, finalPassed.length)} got the confirmation letter.`, (c) => `Joins ${whenText(joiningWhen(c).date, joiningWhen(c).time) || 'day not set'}`),
      branches: [
        box('decision.waiting', 'Waiting list', 'hold', finalPassed.filter((c) => c.final_decision === null && c.selection_category === 'waiting'), 'Passed both interviews and kept as backup.', () => 'Waiting list'),
        box('decision.due', 'Decision due', 'todo', finalPassed.filter((c) => c.final_decision === null && c.selection_category !== 'waiting'), 'Passed both interviews; the letter is still to go out.', (c) => (c.selection_category === 'merit' ? 'Merit list' : 'Not decided')),
      ],
    },
    {
      title: '6 · Joining',
      node: box('joining.joined', 'Joined', 'pass', joined, `${share(joined.length, letters.length)} of those with a letter have joined.`, (c) => `Joined ${dayMonth(joiningWhen(c).date)}`),
      branches: [
        box('joining.declined', 'Did not join', 'rejected', letters.filter((c) => c.joining_status === 'declined'), 'Had the letter and did not take the job.', (c) => c.joining_remarks || 'Did not confirm'),
        box('joining.due', 'To join', 'todo', letters.filter((c) => c.joining_status !== 'joined' && c.joining_status !== 'declined'), 'Letter sent; not joined yet.', (c) => `Joins ${whenText(joiningWhen(c).date, joiningWhen(c).time) || 'day not set'}`),
      ],
    },
  ];
  return steps.map((step) => ({ ...step, branches: step.branches.filter((b) => b.people.length > 0) }));
}

/** The box with this id, if it is on the map. */
export function findFlowBox(steps: FlowStep[], id: string | null): FlowBox | null {
  if (!id) return null;
  for (const step of steps) {
    if (step.node.id === id) return step.node;
    const branch = step.branches.find((b) => b.id === id);
    if (branch) return branch;
  }
  return null;
}
