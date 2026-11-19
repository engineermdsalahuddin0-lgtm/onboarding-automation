import type { AssessmentInput, InterviewAssessment, InterviewerScore, InterviewPosition, InterviewStage, Recommendation } from '../types';

/** What the system fills in at the top of the form. The interviewer never types any of it. */
export interface FormHeader extends InterviewPosition {
  candidateName: string;
  stage: InterviewStage;
  date: string | null;
  interviewerName: string;
  interviewerDesignation: string;
  interviewerDepartment: string;
}

// The company's Interview Assessment Form: ten areas, each marked from 1 (Poor) to 5 (Outstanding).
// The interviewer gives only the marks, the remarks and a signature; everything else is filled in and
// worked out here. supabase/schema.sql (assessment_clean) checks the same rules.

export const AREAS: { title: string; hint: string }[] = [
  { title: 'Appearance', hint: 'Dress-up, gesture & posture' },
  { title: 'Communication Skill', hint: 'Presentation, verbal fluency, listening power & body language' },
  { title: 'Job / Technical Skills', hint: 'Knowledge, skills, experience & ability' },
  { title: 'Intelligence', hint: 'Analytical ability, logical / numerical intelligence, visual-spatial intelligence & problem solving capability' },
  { title: 'Professionalism', hint: 'Discipline, integrity, dedication, commitment, accountability, patience and positive attitude' },
  { title: 'Mindset', hint: 'Belief, confidence & behavior' },
  { title: 'Leadership Skill', hint: 'Result oriented, convincing ability, relationship building & self-motivation' },
  { title: 'Team Work Skill', hint: 'Delegation mentality, reliability power, empathetic approach, appreciation capability, adaptability' },
  { title: 'Technological Advancement', hint: 'Sound knowledge in relevant automated system, system friendly, relevant software knowledge & technologically updated' },
  { title: 'Learning Capability', hint: 'Interest in learning, change attitude, proactivity & critical thinking process' },
];

export const FULL_SCORE = AREAS.length * 5;
export const MAX_REMARKS = 5;

/** The form's five points, best first, as printed on it. */
export const RATING_SCALE: { value: number; label: string }[] = [
  { value: 5, label: 'Outstanding' },
  { value: 4, label: 'Excellent' },
  { value: 3, label: 'Good' },
  { value: 2, label: 'Average' },
  { value: 1, label: 'Poor' },
];

export const STAGE_LABEL: Record<InterviewStage, string> = { primary: 'Primary interview', secondary: 'Final interview' };
export const STAGE_SHORT: Record<InterviewStage, string> = { primary: 'Primary', secondary: 'Final' };

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = { '': 'Not given', employ: 'Employ', turn_down: 'Turn Down' };

/** Units printed as tick boxes at the top of the form. Any other unit is shown under Other. */
export const FORM_UNITS = ['CHO', 'TAL', 'RHL', 'BGL'];

export function emptyInput(): AssessmentInput {
  return { ratings: AREAS.map(() => null), strengths: [], weaknesses: [], comment: '', recommendation: '' };
}

export interface Score {
  /** Out of 50; an empty area counts as 0. */
  obtained: number;
  /** Obtained ÷ 10, as printed on the form. */
  average: number;
  /** Obtained ÷ 50 × 100. */
  percent: number;
  /** How many areas were marked. */
  rated: number;
}

export function scoreOf(ratings: (number | null | undefined)[]): Score {
  const marks = AREAS.map((_, index) => ratings[index]).filter((mark): mark is number => typeof mark === 'number' && mark >= 1 && mark <= 5);
  const obtained = marks.reduce((sum, mark) => sum + mark, 0);
  return {
    obtained,
    average: round1(obtained / AREAS.length),
    percent: round1((obtained / FULL_SCORE) * 100),
    rated: marks.length,
  };
}

/** The nearest point of the form's scale, e.g. 2.3 is Average. */
export function scaleLabel(average: number): string {
  if (average <= 0) return '';
  const nearest = Math.min(5, Math.max(1, Math.round(average)));
  return RATING_SCALE.find((point) => point.value === nearest)?.label ?? '';
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** A form with no area marked is empty: it shows as not filled and is left out of every average. */
export const isFilled = (a: Pick<InterviewAssessment, 'rated'>) => a.rated > 0;

/** The candidate's score for one interview: the simple average of the filled forms. */
export function stageAverage(assessments: InterviewAssessment[]): { forms: number; percent: number | null; obtained: number | null } {
  const filled = assessments.filter(isFilled);
  if (filled.length === 0) return { forms: 0, percent: null, obtained: null };
  const obtained = filled.reduce((sum, a) => sum + Number(a.obtained), 0) / filled.length;
  return { forms: filled.length, percent: round1((obtained / FULL_SCORE) * 100), obtained: round1(obtained) };
}

/**
 * The filled forms as the interview result's panel, scored out of 10 as the result screen does
 * (obtained ÷ 5, so 46% is 4.6). Recommended means the interviewer chose Employ.
 */
export function assessmentsToPanel(assessments: InterviewAssessment[]): InterviewerScore[] {
  return assessments.filter(isFilled).map((a) => ({
    name: a.interviewer_name,
    score: Math.max(1, round1(Number(a.obtained) / 5)),
    referred: a.recommendation === 'employ',
  }));
}

/** Who entered a form, in words. */
export function enteredByText(a: Pick<InterviewAssessment, 'marks_by' | 'entered_by_name' | 'interviewer_name'>): string {
  if (a.marks_by === 'moderator') return `Entered by ${a.entered_by_name || 'HR'} on behalf of ${a.interviewer_name}`;
  if (a.marks_by === 'guest') return 'Entered by the guest interviewer';
  return 'Entered by the interviewer';
}

/** The form as the database keeps it: checked and cut to size. Mirrors assessment_clean in schema.sql. */
export function cleanInput(input: Partial<AssessmentInput>): AssessmentInput & { obtained: number; rated: number } {
  const ratings = AREAS.map((_, index) => {
    const mark = input.ratings?.[index];
    if (mark === null || mark === undefined) return null;
    if (typeof mark !== 'number' || ![1, 2, 3, 4, 5].includes(mark)) throw new Error('Each area takes a mark from 1 to 5.');
    return mark;
  });
  const list = (items: unknown) =>
    Array.isArray(items) ? items.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, MAX_REMARKS).map((item) => item.slice(0, 300)) : [];
  const { obtained, rated } = scoreOf(ratings);
  return {
    ratings,
    obtained,
    rated,
    strengths: list(input.strengths),
    weaknesses: list(input.weaknesses),
    comment: String(input.comment ?? '').trim().slice(0, 2000),
    recommendation: input.recommendation === 'employ' || input.recommendation === 'turn_down' ? input.recommendation : '',
  };
}

/** A drawn signature: a PNG data URL of reasonable size, or nothing. Mirrors clean_signature in schema.sql. */
export function cleanSignature(signature: string | null | undefined): string {
  if (!signature) return '';
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length > 400_000) {
    throw new Error('The signature could not be read. Please sign again.');
  }
  return signature;
}

/** Today as a Bangladesh calendar day, which is when a guest link works. Mirrors today_bd in schema.sql. */
export function todayBd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const guestLinkUrl = (token: string) => `${location.origin}/interview/${token}`;
