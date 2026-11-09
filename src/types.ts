// Row shapes mirror supabase/schema.sql column for column, so there is no mapping layer to drift.

export type Role = 'admin' | 'hr' | 'viewer' | 'pending';

/**
 * Which part of the work a person does. Screening: receives and uploads CVs, screens them and hands the
 * selected ones over. Process: everything after the handover, from the call to joining. All: both.
 */
export type Desk = 'all' | 'screening' | 'process';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  /** Shown beside the name, e.g. Assistant General Manager. */
  job_title: string;
  desk: Desk;
  created_at: string;
}

export type NotificationEvent =
  | 'new_cvs'
  | 'posting'
  | 'handover'
  | 'call_confirm'
  | 'call_reject'
  | 'primary_scheduled'
  | 'primary_selected'
  | 'primary_rejected'
  | 'final_scheduled'
  | 'final_selected'
  | 'final_rejected'
  | 'decision_confirmed'
  | 'decision_rejected'
  | 'joining_accepted'
  | 'joined'
  | 'joining_declined'
  | 'edit_request'
  | 'edit_approved'
  | 'edit_rejected'
  | 'edit_used';

/** One update for one person. Written by the database, never by the app, so no step can skip it. */
export interface AppNotification {
  id: string;
  recipient_id: string;
  event: NotificationEvent;
  actor_name: string;
  /** Several new CVs or handovers from the same person to the same bucket are counted on one line. */
  item_count: number;
  /** The candidate's name, for a single candidate. */
  subject: string;
  designation: string;
  /** The handover note, the posting's media, or the interview day and time. */
  detail: string;
  candidate_id: string | null;
  bucket_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Settings {
  id: number;
  group_name: string;
  default_company: string;
  companies: string[];
  departments: string[];
  media: string[];
  corporate_address: string;
  interview_address: string;
  interview_landmark: string;
  hr_signature: string;
  signatory_name: string;
  signatory_designation: string;
  signatory_mobile: string;
  signatory_phone: string;
  signatory_ext: string;
  signatory_fax: string;
  signatory_email: string;
  seal_path: string | null;
  /** The most files one upload takes. */
  upload_max_files: number;
  /** A large upload is read this many files at a time. */
  upload_batch_size: number;
  /** Seconds of break between two batches. */
  upload_batch_pause: number;
  /** The units, each with its departments, sections and subsections. */
  org_structure: OrgUnit[];
  updated_at?: string;
}

export interface OrgSection {
  name: string;
  subsections: string[];
}

export interface OrgDepartment {
  name: string;
  /** Short code, e.g. RHL-ESG. */
  code: string;
  sections: OrgSection[];
}

/** One unit of the group, e.g. RHL. */
export interface OrgUnit {
  code: string;
  /** The full name, when known. */
  name: string;
  departments: OrgDepartment[];
}

export interface MessageTemplate {
  key: string;
  name: string;
  stage: 'primary' | 'secondary' | 'review' | 'general';
  body: string;
  updated_at?: string;
}

export interface DocumentTemplate {
  key: string;
  title: string;
  body: string;
  sort_order: number;
  is_active: boolean;
  updated_at?: string;
}

export interface Designation {
  id: string;
  title: string;
  department: string;
  company: string;
  sanctioned: number;
  filled: number;
  is_active: boolean;
  created_at: string;
}

export type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';
export type RequisitionStatus = 'Pending approval' | 'Approved' | 'In progress' | 'Filled' | 'On hold' | 'Cancelled';

export interface Requisition {
  id: string;
  ref_no: string;
  designation_id: string | null;
  designation: string;
  department: string;
  company: string;
  vacancies: number;
  priority: Priority;
  employment_type: string;
  location: string;
  hiring_manager: string;
  requested_by: string;
  budget_min: number | null;
  budget_max: number | null;
  target_date: string | null;
  status: RequisitionStatus;
  justification: string;
  job_description: string;
  created_at: string;
  filled_at: string | null;
  /** Unit code, e.g. TAL. */
  unit: string;
  section: string;
  subsection: string;
  /** New, Replacement, or New & Replacement. */
  vacancy_type: string;
  /** For a replacement: who left, with their ID, as written. */
  replacing: string;
  requisition_date: string | null;
  approved_on: string | null;
  offer_date: string | null;
  expected_joining: string | null;
  /** Who was selected, as written in the vacancy sheet. Candidates handled in the app show on their own. */
  selected_names: string;
  remarks: string;
  /** Set for a row synced from the vacancy sheet: its SL. */
  sheet_key: string | null;
  /** The sheet's own figures for this row: CVs received, shortlisted, interview dates and so on. */
  sheet_data: Record<string, string | number | boolean | null>;
}

export interface JobPosting {
  id: string;
  requisition_id: string;
  media: string;
  url: string;
  posted_on: string;
  closes_on: string | null;
  cost: number;
  status: 'Planned' | 'Live' | 'Closed';
  notes: string;
  created_at: string;
}

export interface CvBucket {
  id: string;
  code: string;
  requisition_id: string | null;
  designation: string;
  department: string;
  company: string;
  color: string;
  status: 'Open' | 'Closed' | 'Archived';
  accepting_applications: boolean;
  description: string;
  created_at: string;
  unit: string;
  section: string;
  subsection: string;
}

export interface EducationItem {
  degree: string;
  institution: string;
  board?: string;
  result?: string;
  year?: string;
}

export interface ExperienceItem {
  company: string;
  role: string;
  duration?: string;
  details?: string;
}

export interface TrainingItem {
  title: string;
  institute?: string;
  year?: string;
}

export interface ReferenceItem {
  name: string;
  designation?: string;
  organization?: string;
  phone?: string;
  email?: string;
}

export type ScreeningStatus = 'new' | 'shortlisted' | 'rejected';
export type CallStatus = 'pending' | 'confirm' | 'followup' | 'reject';
export type MessageStatus = 'not_sent' | 'message_done';
export type InterviewStatus = 'pending' | 'scheduled' | 'selected' | 'rejected';
export type JoiningStatus = 'pending' | 'offer_sent' | 'accepted' | 'joined' | 'declined';
export type ParseMethod = 'manual' | 'rules' | 'ai' | 'form';
export type SelectionCategory = 'merit' | 'waiting';
export type FinalDecision = 'confirmed' | 'rejected';

export interface InterviewerScore {
  name: string;
  score: number | null;
  /** Shown to users as "Recommended". The stored name stays, so saved panels keep working. */
  referred: boolean;
}

export interface CandidateProfileFields {
  full_name: string;
  email: string;
  phone: string;
  alt_phone: string;
  address: string;
  permanent_address: string;
  date_of_birth: string | null;
  father_name: string;
  mother_name: string;
  spouse_name: string;
  gender: string;
  marital_status: string;
  religion: string;
  nationality: string;
  blood_group: string;
  national_id: string;
  passport_no: string;
  tin_no: string;
  linkedin: string;
  current_designation: string;
  current_company: string;
  industry: string;
  total_experience_years: number | null;
  present_salary: string;
  expected_salary: string;
  notice_period: string;
  career_summary: string;
  education: EducationItem[];
  experience: ExperienceItem[];
  training: TrainingItem[];
  skills: string[];
  languages: string[];
  references_list: ReferenceItem[];
}

export interface Candidate extends CandidateProfileFields {
  id: string;
  bucket_id: string;
  job_posting_id: string | null;
  source: string;
  received_at: string;
  sections?: Record<string, string>;
  raw_text?: string;
  cv_path: string | null;
  cv_file_name: string;
  photo_path: string | null;
  parse_method: ParseMethod;
  parse_warnings: string[];

  screening_status: ScreeningStatus;
  screening_note: string;

  /** Who on the process desk handles this candidate after screening. Empty: the whole process team. */
  assigned_to: string[];
  /** What the screener asked the process team to do, given at the handover. */
  handover_note: string;
  handed_over_by: string;
  handed_over_at: string | null;

  call_status: CallStatus;
  call_note: string;
  followup_on: string | null;
  followup_time: string;
  called_at: string | null;
  called_by: string;
  call_date: string | null;
  call_time: string;
  confirmed_date: string | null;
  confirmed_time: string;
  /** The day and time the candidate turned the job down on the call. */
  call_rejected_date: string | null;
  call_rejected_time: string;

  /** message_done means the interview schedule has been set. */
  message_status: MessageStatus;
  message_sent_at: string | null;
  message_channel: string;

  primary_status: InterviewStatus;
  primary_date: string | null;
  primary_time: string;
  primary_interviewer: string;
  primary_score: number | null;
  primary_feedback: string;
  primary_panel: InterviewerScore[];

  secondary_message_status: MessageStatus;
  secondary_message_sent_at: string | null;
  secondary_status: InterviewStatus;
  secondary_date: string | null;
  secondary_time: string;
  secondary_interviewer: string;
  secondary_score: number | null;
  secondary_feedback: string;
  secondary_panel: InterviewerScore[];
  selection_category: SelectionCategory | null;

  /** Set once a confirmation letter goes out or the candidate is rejected. From then on the process is locked. */
  final_decision: FinalDecision | null;
  /** The day the candidate was selected or rejected. */
  decision_date: string | null;
  decision_time: string;
  /** For a rejection: the day the candidate was told. */
  informed_date: string | null;
  informed_time: string;
  decided_by: string;
  decided_at: string | null;

  /** Time HR has spent with this CV open, across all reviews. */
  review_seconds: number;
  review_count: number;

  joining_status: JoiningStatus;
  /** The joining day and time HR offered in the confirmation letter. */
  joining_date: string | null;
  joining_time: string;
  /** When HR called the candidate to fix the joining. */
  joining_call_date: string | null;
  joining_call_time: string;
  /** The joining day and time the candidate confirmed on that call. Can differ from the offered one. */
  joining_confirmed_date: string | null;
  joining_confirmed_time: string;
  /** What HR noted on the joining call. */
  joining_remarks: string;
  offered_salary: number | null;
  employee_code: string;
  probation_period: string;
  reporting_to: string;
  documents_received: string[];
  offer_sent_at: string | null;
  selected_at: string | null;

  created_at: string;
  updated_at?: string;
}

export interface CandidateEvent {
  id: string;
  candidate_id: string;
  field: string;
  from_value: string | null;
  to_value: string | null;
  actor_name: string;
  /** The account that did it. Empty for the company form and for records made before it was kept. */
  actor_id: string | null;
  created_at: string;
}

/** A step that can be corrected after an admin approves. */
export type EditStep = 'call' | 'primary_schedule' | 'primary' | 'final_schedule' | 'final' | 'decision';
export type EditRequestStatus = 'pending' | 'approved' | 'rejected' | 'used' | 'cancelled';

/** HR asks to correct one recorded step; an admin approves or turns it down; then HR corrects it once. */
export interface EditRequest {
  id: string;
  candidate_id: string;
  step: EditStep;
  reason: string;
  status: EditRequestStatus;
  requested_by: string;
  requested_by_name: string;
  decided_by: string | null;
  decided_by_name: string;
  decided_at: string | null;
  decision_note: string;
  used_at: string | null;
  created_at: string;
}

/** One review: from opening a candidate's CV to closing it. */
export interface CvReviewSession {
  id: string;
  candidate_id: string;
  reviewer_name: string;
  reviewer_id?: string | null;
  started_at: string;
  ended_at: string;
  seconds: number;
}

export interface MessageLogEntry {
  id: string;
  candidate_id: string;
  template_key: string;
  channel: string;
  body: string;
  sent_by: string;
  created_at: string;
}

export interface CandidateReview {
  id: string;
  candidate_id: string;
  stage: 'primary' | 'secondary';
  token: string;
  invited_at: string;
  submitted_at: string | null;
  overall: number | null;
  communication: number | null;
  professionalism: number | null;
  clarity: number | null;
  would_recommend: boolean | null;
  comments: string;
}

export type QuestionKind = 'written' | 'mcq' | 'interview';
export type Difficulty = 'easy' | 'medium' | 'hard';

/** One question in the library, for a written test, an MCQ test or an interview. */
export interface Question {
  id: string;
  kind: QuestionKind;
  question: string;
  /** MCQ only: the choices, in order. */
  options: string[];
  /** MCQ only: which choice is right, counted from 0. */
  correct_option: number | null;
  /** Written and interview: the model answer, or what a good answer covers. */
  answer: string;
  marks: number;
  difficulty: Difficulty;
  /** Blank: any department. */
  department: string;
  /** Blank: any post. */
  designation: string;
  topic: string;
  /** Interview only. */
  round: 'any' | 'primary' | 'final';
  is_active: boolean;
  created_by_name: string;
  created_at: string;
  updated_at?: string;
}

export interface PublicBucket {
  designation: string;
  department: string;
  company: string;
  group_name: string;
  description: string;
  job_description: string;
  accepting: boolean;
}

export interface ReviewInvite {
  first_name: string;
  designation: string;
  group_name: string;
  stage: 'primary' | 'secondary';
  submitted: boolean;
  /** False once the candidate has moved past this interview. Missing from databases set up before it existed. */
  open?: boolean;
}
