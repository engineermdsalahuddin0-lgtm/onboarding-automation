import type { Candidate, CvBucket, InterviewAssessment, InterviewPanelMember, PanelSide, Profile } from '../types';
import { isFilled } from './assessment';
import { personName } from './team';

// The primary selection report: the paper list HR takes to the final interview. One row per candidate whom
// every primary interviewer marked Employ, with HRD's and the team's word and empty boxes for the Team HOD,
// GM, CHRO and the final decision. A single Turn Down keeps a candidate off it.

export const SIDE_LABEL: Record<Exclude<PanelSide, ''>, string> = { hrd: 'HRD', team: 'Team' };

/** A first guess at the side, from the department on the person's profile or form. */
export function guessSide(department: string | null | undefined): Exclude<PanelSide, ''> {
  return /\bhrd?\b|human\s*resource/i.test(department ?? '') ? 'hrd' : 'team';
}

export interface SelectionRow {
  candidate: Candidate;
  /** What goes in the two primary interview columns: always Employ for someone on the list. */
  hrd: string;
  team: string;
}

export interface WaitingRow {
  candidate: Candidate;
  /** Why they are not on the list yet. */
  reasons: string[];
}

export interface SelectionReport {
  rows: SelectionRow[];
  /** Marked Employ by someone, but not by everyone needed yet. */
  waiting: WaitingRow[];
  /** The date printed on the report: the bucket's primary interview day, else the latest one on the list. */
  date: string | null;
}

export function selectionReport(
  bucket: CvBucket,
  candidates: Candidate[],
  context: { panels: InterviewPanelMember[]; team: Profile[]; assessments: InterviewAssessment[] },
): SelectionReport {
  const panel = context.panels.filter((p) => p.bucket_id === bucket.id && p.stage === 'primary');
  const sideOf = (a: InterviewAssessment): Exclude<PanelSide, ''> => {
    const seat = a.interviewer_id ? panel.find((p) => p.interviewer_id === a.interviewer_id) : undefined;
    return seat?.side || guessSide(a.interviewer_department);
  };
  const rows: SelectionRow[] = [];
  const waiting: WaitingRow[] = [];

  for (const candidate of candidates) {
    if (candidate.bucket_id !== bucket.id || candidate.message_status !== 'message_done') continue;
    // Rejected, or did not come: not going to the final interview.
    if (candidate.primary_status === 'rejected' || (candidate.primary_attendance ?? '') !== '') continue;
    const forms = context.assessments.filter((a) => a.candidate_id === candidate.id && a.stage === 'primary' && isFilled(a));
    if (forms.some((a) => a.recommendation === 'turn_down')) continue;
    const employ = forms.filter((a) => a.recommendation === 'employ');
    if (employ.length === 0) continue;

    const reasons: string[] = [];
    for (const seat of panel) {
      if (!forms.some((a) => a.interviewer_id === seat.interviewer_id)) {
        reasons.push(`${personName(context.team.find((t) => t.id === seat.interviewer_id))} has not marked yet`);
      }
    }
    for (const a of forms) if (!a.recommendation) reasons.push(`${a.interviewer_name || 'An interviewer'} gave no recommendation`);
    const sides = new Set(employ.map(sideOf));
    if (!sides.has('hrd')) reasons.push('No Employ from HRD yet');
    if (!sides.has('team')) reasons.push('No Employ from the team yet');

    if (reasons.length > 0) waiting.push({ candidate, reasons });
    else rows.push({ candidate, hrd: 'Employ', team: 'Employ' });
  }

  const byDayThenName = (a: Candidate, b: Candidate) =>
    (a.primary_date ?? '').localeCompare(b.primary_date ?? '') || a.full_name.localeCompare(b.full_name);
  rows.sort((a, b) => byDayThenName(a.candidate, b.candidate));
  waiting.sort((a, b) => byDayThenName(a.candidate, b.candidate));
  const days = rows.map((r) => r.candidate.primary_date).filter((d): d is string => Boolean(d)).sort();
  return { rows, waiting, date: bucket.primary_date ?? days[days.length - 1] ?? null };
}

/** "Design & Product Development (Executive)", as the report's title line names the post. */
export function postTitle(bucket: Pick<CvBucket, 'department' | 'designation'>): string {
  return bucket.department ? `${bucket.department} (${bucket.designation})` : bucket.designation;
}
