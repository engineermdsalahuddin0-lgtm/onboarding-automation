import type {
  AppNotification,
  Candidate,
  CandidateEvent,
  CandidateReview,
  CvBucket,
  CvReviewSession,
  Designation,
  EditRequest,
  JobPosting,
  Profile,
  Question,
  Requisition,
  Settings,
} from '../../types';
import { DEFAULT_DOCUMENT_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES, DEFAULT_SETTINGS } from '../defaults';
import { isoDate } from '../format';

// Fictional sample data for demo mode only; it never reaches Supabase.

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

const stamp = (days: number) => `${daysFromNow(days)}T04:00:00.000Z`;

const BASE: Omit<Candidate, 'id' | 'bucket_id' | 'full_name' | 'phone' | 'email'> = {
  job_posting_id: null,
  source: 'BDJobs',
  received_at: stamp(-6),
  alt_phone: '',
  address: 'Mirpur, Dhaka',
  permanent_address: '',
  date_of_birth: null,
  father_name: '',
  mother_name: '',
  spouse_name: '',
  gender: '',
  marital_status: '',
  religion: '',
  nationality: 'Bangladeshi',
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
  languages: ['Bangla', 'English'],
  references_list: [],
  sections: {},
  raw_text: '',
  cv_path: null,
  cv_file_name: '',
  photo_path: null,
  parse_method: 'rules',
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
  created_at: stamp(-6),
};

const SHORTLISTED: Partial<Candidate> = { screening_status: 'shortlisted', handed_over_by: 'Tareq Azij', handed_over_at: stamp(-5) };
const CONFIRMED: Partial<Candidate> = {
  ...SHORTLISTED,
  call_status: 'confirm',
  called_at: stamp(-4),
  called_by: 'Nafis',
  call_date: daysFromNow(-5),
  call_time: '10:30',
  confirmed_date: daysFromNow(-4),
  confirmed_time: '16:15',
};
const MESSAGED: Partial<Candidate> = {
  ...CONFIRMED,
  message_status: 'message_done',
  message_sent_at: stamp(-3),
  message_channel: 'SMS',
};
const PRIMARY_PASSED: Partial<Candidate> = {
  ...MESSAGED,
  primary_status: 'selected',
  primary_date: daysFromNow(-2),
  primary_time: '11:00',
  primary_interviewer: 'Demo Interviewer A, Demo Interviewer B',
  primary_score: 7.5,
  primary_panel: [
    { name: 'Demo Interviewer A', score: 8, referred: true },
    { name: 'Demo Interviewer B', score: 7, referred: false },
  ],
};
const FINAL_SELECTED: Partial<Candidate> = {
  ...PRIMARY_PASSED,
  secondary_message_status: 'message_done',
  secondary_message_sent_at: stamp(-2),
  secondary_status: 'selected',
  secondary_date: daysFromNow(-1),
  secondary_time: '15:00',
  secondary_interviewer: 'Demo Director, Demo Interviewer A',
  secondary_score: 8.5,
  secondary_panel: [
    { name: 'Demo Director', score: 9, referred: true },
    { name: 'Demo Interviewer A', score: 8, referred: true },
  ],
  selection_category: 'merit',
  selected_at: stamp(-1),
};

const SAMPLE_INDUSTRIES = ['Garments & Textile', 'Banking & Finance', 'Garments & Textile', 'IT & Telecom'];

/** The three demo accounts: one screens and hands over, two run the process after that. */
// Real accounts have UUIDs, and assigned_to holds them, so the demo ones do too.
export const DEMO_PEOPLE = {
  agm: '0d3b6c1e-7a52-4f0e-9c1a-000000000001',
  nafis: '0d3b6c1e-7a52-4f0e-9c1a-000000000002',
  mili: '0d3b6c1e-7a52-4f0e-9c1a-000000000003',
} as const;

export function buildDemoData() {
  const profiles: Profile[] = [
    { id: DEMO_PEOPLE.agm, email: 'tareq@example.com', full_name: 'Tareq Azij', role: 'admin', job_title: 'Assistant General Manager', desk: 'all', created_at: stamp(-30) },
    { id: DEMO_PEOPLE.nafis, email: 'nafis@example.com', full_name: 'Nafis', role: 'hr', job_title: 'Senior Manager', desk: 'process', created_at: stamp(-30) },
    { id: DEMO_PEOPLE.mili, email: 'mili@example.com', full_name: 'Mili', role: 'hr', job_title: 'Senior Executive', desk: 'process', created_at: stamp(-30) },
  ];

  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    id: 1,
    signatory_name: 'Demo Signatory',
    signatory_designation: 'Head of HR (demo)',
    signatory_mobile: '01700-000000',
    signatory_phone: '02-0000000',
    signatory_ext: '100',
    signatory_fax: '02-0000001',
    signatory_email: 'hr-demo@example.com',
  };

  const company = settings.default_company;
  const designation = (
    id: string, title: string, department: string, sanctioned: number, filled: number,
  ): Designation => ({ id, title, department, company, sanctioned, filled, is_active: true, created_at: stamp(-40) });

  const designations: Designation[] = [
    designation('des-1', 'Jr. Executive', 'HR & Admin', 4, 2),
    designation('des-2', 'HR Tech & Automation Specialist', 'HR & Admin', 1, 0),
    designation('des-3', 'Merchandiser', 'Merchandising', 6, 4),
    designation('des-4', 'Accounts Officer', 'Accounts & Finance', 3, 3),
    designation('des-5', 'Quality Inspector', 'Quality', 8, 5),
    designation('des-6', 'Commercial Officer', 'Commercial', 2, 1),
  ];

  const requisition = (
    id: string, ref: number, des: Designation, vacancies: number, priority: Requisition['priority'],
    status: Requisition['status'], createdDaysAgo: number, targetInDays: number,
  ): Requisition => ({
    id,
    ref_no: `REQ-${new Date().getFullYear()}-${String(ref).padStart(4, '0')}`,
    designation_id: des.id,
    designation: des.title,
    department: des.department,
    company,
    vacancies,
    priority,
    employment_type: 'Permanent',
    location: 'Dhaka',
    hiring_manager: 'Demo Manager',
    requested_by: 'Tareq Azij',
    budget_min: 30000,
    budget_max: 50000,
    target_date: daysFromNow(targetInDays),
    status,
    justification: 'Vacant position.',
    job_description: `Responsibilities and requirements for ${des.title}.`,
    created_at: stamp(-createdDaysAgo),
    filled_at: null,
    unit: 'CHO',
    section: des.department === 'HR & Admin' ? 'HR' : '',
    subsection: '',
    vacancy_type: ref % 2 === 0 ? 'Replacement' : 'New',
    replacing: ref % 2 === 0 ? 'Demo Former Employee' : '',
    requisition_date: daysFromNow(-createdDaysAgo),
    approved_on: status === 'Pending approval' ? null : daysFromNow(-createdDaysAgo + 1),
    offer_date: null,
    expected_joining: null,
    selected_names: '',
    remarks: '',
    sheet_key: null,
    sheet_data: {},
  });

  const requisitions: Requisition[] = [
    requisition('req-1', 1, designations[0], 2, 'High', 'In progress', 12, 18),
    requisition('req-2', 2, designations[1], 1, 'Urgent', 'In progress', 9, 12),
    requisition('req-3', 3, designations[2], 2, 'Medium', 'Approved', 3, 30),
    requisition('req-4', 4, designations[4], 3, 'Low', 'Pending approval', 1, 45),
  ];

  const posting = (
    id: string, requisitionId: string, media: string, postedDaysAgo: number, cost: number,
  ): JobPosting => ({
    id,
    requisition_id: requisitionId,
    media,
    url: '',
    posted_on: daysFromNow(-postedDaysAgo),
    closes_on: daysFromNow(30 - postedDaysAgo),
    cost,
    status: 'Live',
    notes: '',
    created_at: stamp(-postedDaysAgo),
  });

  const job_postings: JobPosting[] = [
    posting('post-1', 'req-1', 'BDJobs', 11, 5000),
    posting('post-2', 'req-1', 'Facebook', 10, 1500),
    posting('post-3', 'req-2', 'LinkedIn', 8, 0),
    posting('post-4', 'req-2', 'BDJobs', 8, 5000),
  ];

  const bucket = (
    id: string, code: string, requisitionId: string | null, title: string, department: string, color: string, daysAgo: number,
  ): CvBucket => ({
    id,
    code,
    requisition_id: requisitionId,
    designation: title,
    department,
    company,
    color,
    status: 'Open',
    accepting_applications: true,
    description: '',
    created_at: stamp(-daysAgo),
    unit: 'CHO',
    section: department === 'HR & Admin' ? 'HR' : '',
    subsection: '',
  });

  const cv_buckets: CvBucket[] = [
    bucket('bkt-1', 'demo-jrexec', 'req-1', 'Jr. Executive', 'HR & Admin', 'green', 11),
    bucket('bkt-2', 'demo-hrtech', 'req-2', 'HR Tech & Automation Specialist', 'HR & Admin', 'blue', 8),
    bucket('bkt-3', 'demo-merch', 'req-3', 'Merchandiser', 'Merchandising', 'amber', 2),
  ];

  let serial = 0;
  const person = (
    bucketId: string, fullName: string, source: string, overrides: Partial<Candidate> = {},
  ): Candidate => {
    serial += 1;
    return {
      ...BASE,
      id: `cand-${serial}`,
      bucket_id: bucketId,
      full_name: fullName,
      phone: `0170000${String(serial).padStart(4, '0')}`,
      email: `candidate${serial}@example.com`,
      source,
      received_at: stamp(-(serial % 9) - 1),
      total_experience_years: (serial % 7) + 1,
      industry: SAMPLE_INDUSTRIES[serial % SAMPLE_INDUSTRIES.length],
      expected_salary: `Tk. ${25 + (serial % 6) * 5},000`,
      education: [{ degree: 'BBA', institution: 'Sample University', result: '3.50', year: '2020' }],
      experience: [{ company: 'Sample Garments Ltd.', role: 'Executive', duration: '2021 - Present' }],
      skills: ['MS Office', 'Communication'],
      career_summary: 'Fictional demo profile.',
      ...overrides,
    };
  };

  const selectedProfile: Partial<Candidate> = {
    father_name: 'Sample Father',
    mother_name: 'Sample Mother',
    date_of_birth: '1996-03-14',
    gender: 'Male',
    marital_status: 'Single',
    religion: 'Islam',
    blood_group: 'O+',
    national_id: '0000000000',
    permanent_address: 'Sample Village, Comilla',
    joining_date: daysFromNow(14),
    employee_code: '',
  };

  const candidates: Candidate[] = [
    person('bkt-1', 'Rahim Uddin', 'BDJobs', { ...FINAL_SELECTED, ...selectedProfile, offered_salary: 38000 }),
    person('bkt-1', 'Sumaiya Akter', 'Facebook', PRIMARY_PASSED),
    person('bkt-1', 'Tanvir Ahmed', 'BDJobs', { ...MESSAGED, primary_status: 'scheduled', primary_date: daysFromNow(2), primary_time: '11:20' }),
    person('bkt-1', 'Nabila Hossain', 'BDJobs', CONFIRMED),
    person('bkt-1', 'Kamal Hasan', 'Facebook', { ...SHORTLISTED, call_status: 'followup', followup_on: daysFromNow(0), followup_time: '17:00', call_time: '11:00', call_date: daysFromNow(-1), called_at: stamp(-1), called_by: 'Mili', call_note: 'Asked for a call back in the evening.' }),
    person('bkt-1', 'Farhana Yasmin', 'BDJobs', SHORTLISTED),
    person('bkt-1', 'Imran Khan', 'Company form', SHORTLISTED),
    person('bkt-1', 'Rakib Hasan', 'BDJobs'),
    person('bkt-1', 'Shirin Sultana', 'Facebook'),
    person('bkt-1', 'Jewel Rana', 'BDJobs', { screening_status: 'rejected', screening_note: 'Experience below requirement.' }),
    person('bkt-1', 'Moushumi Rahman', 'BDJobs', { ...SHORTLISTED, call_status: 'reject', call_date: daysFromNow(-3), call_time: '12:45', call_rejected_date: daysFromNow(-3), call_rejected_time: '12:50', called_at: stamp(-3), called_by: 'Mili', call_note: 'Not interested in location.' }),
    person('bkt-1', 'Arif Hossain', 'Facebook', { ...MESSAGED, primary_status: 'rejected', primary_date: daysFromNow(-2), primary_time: '12:00', primary_score: 4, primary_interviewer: 'Demo Interviewer A', primary_panel: [{ name: 'Demo Interviewer A', score: 4, referred: false }] }),
    person('bkt-2', 'Sadia Islam', 'LinkedIn', { ...PRIMARY_PASSED, secondary_message_status: 'message_done', secondary_message_sent_at: stamp(-1), secondary_status: 'scheduled', secondary_date: daysFromNow(1), secondary_time: '15:00' }),
    person('bkt-2', 'Mehedi Hasan', 'LinkedIn', { ...MESSAGED, primary_status: 'scheduled', primary_date: daysFromNow(0), primary_time: '15:00' }),
    person('bkt-2', 'Ayesha Siddika', 'BDJobs', CONFIRMED),
    person('bkt-2', 'Shakil Ahmed', 'BDJobs', SHORTLISTED),
    person('bkt-2', 'Nusrat Jahan', 'Company form'),
    person('bkt-2', 'Hasib Rahman', 'LinkedIn'),
    person('bkt-3', 'Tania Akter', 'Employee Referral'),
    person('bkt-3', 'Rubel Mia', 'BDJobs'),
    person('bkt-1', 'Liton Das', 'BDJobs', { ...FINAL_SELECTED, ...selectedProfile, selection_category: 'waiting', joining_date: null }),
    person('bkt-2', 'Mahmud Karim', 'LinkedIn', {
      ...FINAL_SELECTED,
      ...selectedProfile,
      offered_salary: 55000,
      final_decision: 'confirmed',
      decision_date: daysFromNow(-1),
      decision_time: '16:30',
      joining_date: daysFromNow(20),
      joining_time: '09:00',
      joining_status: 'offer_sent',
      offer_sent_at: stamp(-1),
      decided_by: 'Mili',
      decided_at: stamp(-1),
    }),
    person('bkt-2', 'Rina Parvin', 'BDJobs', {
      ...FINAL_SELECTED,
      secondary_status: 'rejected',
      selection_category: null,
      selected_at: null,
      final_decision: 'rejected',
      decision_date: daysFromNow(-1),
      decision_time: '17:00',
      informed_date: daysFromNow(0),
      informed_time: '10:00',
      decided_by: 'Mili',
      decided_at: stamp(-1),
    }),
  ];

  // Who handles whom after the handover. Anyone shortlisted and not listed went to the whole process team.
  const handledBy: Record<string, string[]> = {
    'cand-1': [DEMO_PEOPLE.nafis], 'cand-2': [DEMO_PEOPLE.nafis], 'cand-3': [DEMO_PEOPLE.nafis], 'cand-4': [DEMO_PEOPLE.nafis],
    'cand-6': [DEMO_PEOPLE.nafis], 'cand-21': [DEMO_PEOPLE.nafis],
    'cand-5': [DEMO_PEOPLE.mili], 'cand-11': [DEMO_PEOPLE.mili], 'cand-12': [DEMO_PEOPLE.mili], 'cand-13': [DEMO_PEOPLE.mili],
    'cand-14': [DEMO_PEOPLE.mili], 'cand-15': [DEMO_PEOPLE.mili], 'cand-16': [DEMO_PEOPLE.mili], 'cand-22': [DEMO_PEOPLE.mili], 'cand-23': [DEMO_PEOPLE.mili],
  };
  for (const c of candidates) {
    if (c.screening_status === 'shortlisted') c.assigned_to = handledBy[c.id] ?? [];
  }
  candidates.find((c) => c.id === 'cand-6')!.handover_note = 'Good fit for the plant HR desk. Please call today.';

  const notification = (
    id: string, recipient: string, event: AppNotification['event'], actor: string, hoursAgo: number,
    fields: Partial<AppNotification>, read = false,
  ): AppNotification => ({
    id,
    recipient_id: recipient,
    event,
    actor_name: actor,
    item_count: 1,
    subject: '',
    designation: '',
    detail: '',
    candidate_id: null,
    bucket_id: null,
    created_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    read_at: read ? new Date(Date.now() - (hoursAgo - 0.5) * 3_600_000).toISOString() : null,
    ...fields,
  });
  const notifications: AppNotification[] = [
    // The big decisions the process team made, as Tareq sees them.
    notification('n-1', DEMO_PEOPLE.agm, 'decision_confirmed', 'Mili', 20, { subject: 'Mahmud Karim', designation: 'HR Tech & Automation Specialist', candidate_id: 'cand-22', bucket_id: 'bkt-2', detail: `${daysFromNow(20)} 09:00` }),
    notification('n-2', DEMO_PEOPLE.agm, 'decision_rejected', 'Mili', 22, { subject: 'Rina Parvin', designation: 'HR Tech & Automation Specialist', candidate_id: 'cand-23', bucket_id: 'bkt-2' }, true),
    // What Tareq sent their way.
    notification('n-5', DEMO_PEOPLE.nafis, 'handover', 'Tareq Azij', 3, { subject: 'Farhana Yasmin', designation: 'Jr. Executive', candidate_id: 'cand-6', bucket_id: 'bkt-1', detail: 'Good fit for the plant HR desk. Please call today.' }),
    notification('n-6', DEMO_PEOPLE.nafis, 'new_cvs', 'Tareq Azij', 5, { item_count: 2, subject: 'Rubel Mia', designation: 'Merchandiser', candidate_id: 'cand-20', bucket_id: 'bkt-3' }),
    notification('n-7', DEMO_PEOPLE.nafis, 'posting', 'Tareq Azij', 70, { designation: 'HR Tech & Automation Specialist', detail: 'LinkedIn', bucket_id: 'bkt-2' }, true),
    notification('n-8', DEMO_PEOPLE.mili, 'handover', 'Tareq Azij', 4, { subject: 'Shakil Ahmed', designation: 'HR Tech & Automation Specialist', candidate_id: 'cand-16', bucket_id: 'bkt-2' }),
    notification('n-9', DEMO_PEOPLE.mili, 'new_cvs', 'Tareq Azij', 5, { item_count: 2, subject: 'Rubel Mia', designation: 'Merchandiser', candidate_id: 'cand-20', bucket_id: 'bkt-3' }),
  ];

  // Review time for a few people, so the column and the dashboard card have something to show.
  const cv_review_sessions: CvReviewSession[] = [
    ['cand-1', 245], ['cand-1', 130], ['cand-2', 195], ['cand-3', 310], ['cand-4', 88], ['cand-13', 420], ['cand-22', 275],
  ].map(([candidateId, seconds], index) => {
    const ended = new Date(Date.now() - (index + 1) * 3_600_000);
    const candidate = candidates.find((c) => c.id === candidateId)!;
    candidate.review_seconds += seconds as number;
    candidate.review_count += 1;
    return {
      id: `session-${index + 1}`,
      candidate_id: candidateId as string,
      reviewer_name: 'Tareq Azij',
      reviewer_id: DEMO_PEOPLE.agm,
      started_at: new Date(ended.getTime() - (seconds as number) * 1000).toISOString(),
      ended_at: ended.toISOString(),
      seconds: seconds as number,
    };
  });
  const candidate_reviews: CandidateReview[] = [
    {
      id: 'rev-1', candidate_id: 'cand-1', stage: 'primary', token: '11111111-1111-4111-8111-111111111111',
      invited_at: stamp(-2), submitted_at: stamp(-2), overall: 5, communication: 5, professionalism: 4, clarity: 5,
      would_recommend: true, comments: 'Well organised and started on time.',
    },
    {
      id: 'rev-2', candidate_id: 'cand-12', stage: 'primary', token: '22222222-2222-4222-8222-222222222222',
      invited_at: stamp(-2), submitted_at: stamp(-1), overall: 3, communication: 3, professionalism: 4, clarity: 2,
      would_recommend: true, comments: 'Waited a while before the interview started.',
    },
    {
      id: 'rev-3', candidate_id: 'cand-2', stage: 'primary', token: '33333333-3333-4333-8333-333333333333',
      invited_at: stamp(-1), submitted_at: null, overall: null, communication: null, professionalism: null, clarity: null,
      would_recommend: null, comments: '',
    },
  ];

  return {
    profiles,
    notifications,
    settings: [settings],
    message_templates: DEFAULT_MESSAGE_TEMPLATES,
    document_templates: DEFAULT_DOCUMENT_TEMPLATES,
    designations,
    requisitions,
    job_postings,
    cv_buckets,
    candidates,
    candidate_events: sampleHistory(candidates, profiles),
    message_log: [],
    candidate_reviews,
    cv_review_sessions,
    questions: sampleQuestions(),
    edit_requests: [] as EditRequest[],
  };
}

/**
 * The audit trail the sample candidates would have left, so Team activity and each card's History have
 * something to show. Tareq uploads and screens; whoever the candidate was handed to does the rest.
 */
function sampleHistory(candidates: Candidate[], profiles: Profile[]): CandidateEvent[] {
  const events: CandidateEvent[] = [];
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? '';
  const now = Date.now();
  for (const c of candidates) {
    const start = Date.parse(c.received_at);
    const doer = c.assigned_to[0] ?? DEMO_PEOPLE.nafis;
    // Each step a little after the one before, ending within the last few hours.
    const steps: [string, string | null, string, string][] = [];
    const add = (field: string, from: string | null, to: string, by: string) => steps.push([field, from, to, by]);
    add('received', null, c.source, c.source === 'Company form' ? '' : DEMO_PEOPLE.agm);
    if (c.screening_status !== 'new') add('screening_status', 'new', c.screening_status, DEMO_PEOPLE.agm);
    if (c.screening_status === 'shortlisted') add('assigned_to', null, c.assigned_to.length ? c.assigned_to.map(nameOf).join(', ') : 'Whole process team', DEMO_PEOPLE.agm);
    if (c.call_status !== 'pending') add('call_status', 'pending', c.call_status, doer);
    if (c.message_status === 'message_done') add('message_status', 'not_sent', 'message_done', doer);
    if (c.primary_status === 'scheduled' || c.primary_status === 'selected' || c.primary_status === 'rejected') add('primary_status', 'pending', c.primary_status, doer);
    if (c.secondary_status !== 'pending') add('secondary_status', 'pending', c.secondary_status, doer);
    if (c.selection_category) add('selection_category', '', c.selection_category, doer);
    if (c.final_decision) add('final_decision', '', c.final_decision, doer);
    if (c.joining_status !== 'pending') add('joining_status', 'pending', c.joining_status, doer);
    const span = Math.max(now - 3 * 3_600_000 - start, 60_000);
    steps.forEach(([field, from, to, by], index) => {
      events.push({
        id: `event-${c.id}-${index}`,
        candidate_id: c.id,
        field,
        from_value: from || null,
        to_value: to,
        actor_name: by ? nameOf(by) : 'Candidate / system',
        actor_id: by || null,
        created_at: new Date(start + (span * index) / Math.max(steps.length - 1, 1)).toISOString(),
      });
    });
  }
  return events;
}

function sampleQuestions(): Question[] {
  const at = stamp(-20);
  const q = (id: string, fields: Partial<Question> & Pick<Question, 'kind' | 'question'>): Question => ({
    id, options: [], correct_option: null, answer: '', marks: 1, difficulty: 'medium', department: '', designation: '',
    topic: '', round: 'any', is_active: true, created_by_name: 'Tareq Azij', created_at: at, ...fields,
  });
  return [
    q('q-1', { kind: 'mcq', topic: 'Labour law', department: 'HR & Admin', question: 'Under the Bangladesh Labour Act, how long is the usual probation period for a clerical worker?', options: ['3 months', '6 months', '9 months', '1 year'], correct_option: 1 }),
    q('q-2', { kind: 'mcq', topic: 'MS Excel', question: 'Which Excel function finds a value in the first column of a table and returns a value from another column?', options: ['SUMIF', 'VLOOKUP', 'COUNTA', 'CONCAT'], correct_option: 1, difficulty: 'easy' }),
    q('q-3', { kind: 'mcq', topic: 'Garments', department: 'Merchandising', designation: 'Merchandiser', question: 'What does FOB stand for in export pricing?', options: ['Free On Board', 'Freight On Bill', 'Factory Order Book', 'Final Order Balance'], correct_option: 0, difficulty: 'easy' }),
    q('q-4', { kind: 'mcq', topic: 'Accounts', department: 'Accounts & Finance', question: 'A payment made in advance for next month\'s rent is recorded as:', options: ['An expense', 'A liability', 'A prepaid asset', 'Revenue'], correct_option: 2 }),
    q('q-5', { kind: 'mcq', topic: 'HR basics', department: 'HR & Admin', question: 'Which document is signed by a new employee on the joining day to accept the terms of employment?', options: ['Requisition', 'Appointment letter', 'Exit form', 'Job posting'], correct_option: 1, difficulty: 'easy' }),
    q('q-6', { kind: 'written', topic: 'HR basics', department: 'HR & Admin', designation: 'Jr. Executive', marks: 10, question: 'Write the steps you would follow to arrange the joining of a new employee, from the confirmation letter to the first day.', answer: 'Confirmation letter; call to fix the joining day; documents to bring (certificates, NID, photos); ID card and access; induction plan; introduce to the line manager; personnel file.' }),
    q('q-7', { kind: 'written', topic: 'Communication', marks: 10, question: 'Write a short email to a candidate inviting them to a primary interview. Include the day, time, venue and what to bring.', answer: 'Polite greeting; position name; day, date and time; full venue with landmark; documents to bring; contact person and number; sign-off.', difficulty: 'easy' }),
    q('q-8', { kind: 'written', topic: 'Garments', department: 'Merchandising', designation: 'Merchandiser', marks: 15, question: 'A buyer\'s shipment date is at risk because fabric arrived late. Explain how you would handle it.', answer: 'Find the real delay; re-plan production with the factory; check air freight or partial shipment; inform the buyer early with a revised plan; record the cause.', difficulty: 'hard' }),
    q('q-9', { kind: 'interview', topic: 'Introduction', round: 'primary', marks: 10, question: 'Tell us about yourself and why you applied for this position.', answer: 'Clear and brief; links past work to this role; knows something about the company.' }),
    q('q-10', { kind: 'interview', topic: 'Experience', round: 'primary', marks: 10, question: 'Describe a problem at your last job that you solved. What did you do, and what was the result?', answer: 'A real example; their own part in it; a measurable result.' }),
    q('q-11', { kind: 'interview', topic: 'Attitude', round: 'final', marks: 10, question: 'Where do you see yourself in three years, and how would this job help?', answer: 'Realistic plan; fits the career path here; intends to stay.', difficulty: 'easy' }),
    q('q-12', { kind: 'interview', topic: 'HR basics', department: 'HR & Admin', round: 'final', marks: 10, question: 'An employee complains that a supervisor treats them unfairly. How would you handle it?', answer: 'Listen and record; stay neutral; hear the supervisor; check facts; follow the company grievance procedure; keep it confidential; follow up.', difficulty: 'hard' }),
  ];
}
