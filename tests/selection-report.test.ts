import { describe, expect, it } from 'vitest';
import { guessSide, postTitle, selectionReport } from '../src/lib/selectionReport';
import type { Candidate, CvBucket, InterviewAssessment, InterviewPanelMember, Profile } from '../src/types';

const bucket = { id: 'b1', designation: 'Executive', department: 'Design & Product Development', primary_date: '2026-11-11' } as CvBucket;
const team = [
  { id: 'hr', full_name: 'Nafis', department: 'HR & Admin' },
  { id: 'dept', full_name: 'Rafiq', department: 'Design' },
  { id: 'dept2', full_name: 'Sumi', department: 'Design' },
] as Profile[];
const seat = (interviewer_id: string, side: InterviewPanelMember['side']) =>
  ({ id: `p-${interviewer_id}`, bucket_id: 'b1', stage: 'primary', interviewer_id, side, created_at: '' }) as InterviewPanelMember;

let next = 0;
const candidate = (name: string, overrides: Partial<Candidate> = {}) =>
  ({
    id: `c${(next += 1)}`, bucket_id: 'b1', full_name: name, message_status: 'message_done', primary_status: 'scheduled',
    primary_attendance: '', primary_date: '2026-11-11', current_designation: 'Executive', current_company: 'Ananta Apparels Ltd.', ...overrides,
  }) as Candidate;
const form = (c: Candidate, interviewer_id: string | null, recommendation: InterviewAssessment['recommendation'], department = '') =>
  ({
    id: `f${(next += 1)}`, candidate_id: c.id, stage: 'primary', interviewer_id, interviewer_name: interviewer_id ?? 'Guest',
    interviewer_department: department, rated: 10, obtained: 40, recommendation,
  }) as InterviewAssessment;

describe('primary selection report', () => {
  const panels = [seat('hr', 'hrd'), seat('dept', 'team')];

  it('lists only candidates whom HRD and the team both marked Employ', () => {
    const both = candidate('Sazidul Islam');
    const turnedDown = candidate('Turned Down');
    const halfDone = candidate('Half Done');
    const report = selectionReport(bucket, [both, turnedDown, halfDone], {
      panels, team,
      assessments: [
        form(both, 'hr', 'employ'), form(both, 'dept', 'employ'),
        form(turnedDown, 'hr', 'employ'), form(turnedDown, 'dept', 'turn_down'),
        form(halfDone, 'hr', 'employ'),
      ],
    });
    expect(report.rows.map((r) => [r.candidate.full_name, r.hrd, r.team])).toEqual([['Sazidul Islam', 'Employ', 'Employ']]);
    // A Turn Down is out for good; the one still waiting says who has not marked.
    expect(report.waiting).toEqual([{ candidate: halfDone, reasons: ['Rafiq has not marked yet', 'No Employ from the team yet'] }]);
    expect(report.date).toBe('2026-11-11');
  });

  it('waits for every panel member, and takes two team interviewers as one team column', () => {
    const c = candidate('Subbir Hossain');
    const three = [...panels, seat('dept2', 'team')];
    const two = selectionReport(bucket, [c], { panels: three, team, assessments: [form(c, 'hr', 'employ'), form(c, 'dept', 'employ')] });
    expect(two.rows).toEqual([]);
    expect(two.waiting[0].reasons).toEqual(['Sumi has not marked yet']);
    const all = selectionReport(bucket, [c], { panels: three, team, assessments: [form(c, 'hr', 'employ'), form(c, 'dept', 'employ'), form(c, 'dept2', 'employ')] });
    expect(all.rows).toHaveLength(1);
  });

  it('places guests and unmarked seats by department, and leaves out rejected or absent candidates', () => {
    const guest = candidate('Maharajul Islam');
    const rejected = candidate('Rejected', { primary_status: 'rejected' });
    const absent = candidate('Absent', { primary_attendance: 'absent' });
    const notYet = candidate('Not scheduled', { message_status: 'not_sent' });
    const people = [guest, rejected, absent, notYet];
    const report = selectionReport(bucket, people, {
      panels: [], team,
      assessments: people.flatMap((c) => [form(c, null, 'employ', 'Human Resources'), form(c, null, 'employ', 'Design')]),
    });
    expect(report.rows.map((r) => r.candidate.full_name)).toEqual(['Maharajul Islam']);
  });

  it('guesses the side from a department and names the post as on paper', () => {
    expect(['HR & Admin', 'HRD', 'Human Resource', 'Design', 'Shrimp Processing'].map(guessSide)).toEqual(['hrd', 'hrd', 'hrd', 'team', 'team']);
    expect(postTitle(bucket)).toBe('Design & Product Development (Executive)');
  });
});
