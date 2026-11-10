// The in-app guide: a short tour of each page, and the whole hiring flow in order. Each tour step points
// at an element marked data-tour="…"; steps whose element is not on screen are skipped, so a tour fits
// whoever is signed in (the process desk has no Upload button, for example).

import type { Candidate } from '../types';

export type TourId = 'dashboard' | 'buckets' | 'bucket' | 'card' | 'upload' | 'requisitions' | 'selected' | 'questions' | 'activity';

export interface TourStep {
  target: string;
  title: string;
  body: string;
}

export const TOURS: Record<TourId, { title: string; steps: TourStep[] }> = {
  dashboard: {
    title: 'The dashboard',
    steps: [
      { target: 'nav', title: 'Pages', body: 'Move between pages from this bar. Point at it to see the names: Dashboard, Requisitions, CV Buckets, Selected, Candidate Reviews, Question library, Team activity and Settings.' },
      { target: 'search', title: 'Find anyone', body: 'Type a name, mobile number or email. Click a result to open that candidate\'s card.' },
      { target: 'upload', title: 'Upload CVs', body: 'Add PDF or Word CVs, scans, or a ZIP of them. The details and photo are read automatically. Only the CV screening desk sees this button.' },
      { target: 'bell', title: 'Updates', body: 'New CVs, postings, handovers and the big decisions arrive here. A number means unread updates. Click one to go straight to it.' },
      { target: 'dash-tiles', title: 'Numbers at a glance', body: 'Point at a tile for a quick look. Click it for the full details, with charts and tables, without leaving the dashboard. Interviews, next 7 days opens a calendar.' },
      { target: 'dash-team', title: 'Process team progress', body: 'For the head of the team: how many candidates each person has at each step. Point at a number to see the names.' },
      { target: 'dash-now', title: 'Who is working now', body: 'Who has the app open and which candidate they are working on, live. Team activity has the full record.' },
      { target: 'dash-todo', title: 'To do', body: 'Your next steps, most urgent first: CVs to screen, calls to make, interviews to record. Click a line to open it.' },
      { target: 'help', title: 'Help is always here', body: 'Press this button on any page for a tour of that page, or for the whole hiring flow step by step.' },
    ],
  },
  buckets: {
    title: 'CV Buckets',
    steps: [
      { target: 'buckets-new', title: 'A new CV bucket', body: 'A bucket is a folder for one position. Choose the unit, department, section, designation and number of posts; its requisition is made at the same time.' },
      { target: 'buckets-tree', title: 'Find buckets by place', body: 'Units, then departments, sections and subsections, with how many buckets each holds. Click one to show only its buckets; the filters above do the same.' },
      { target: 'buckets-list', title: 'Open a bucket', body: 'Each folder shows how many CVs it holds and where they stand. Click one to open its table. Inside, the chain icon copies the job application link to share on Facebook, BDJobs or WhatsApp.' },
    ],
  },
  bucket: {
    title: 'Inside a CV bucket',
    steps: [
      { target: 'bucket-link', title: 'Application link', body: 'Copies the job application link for this position. Applicants fill in the form, attach their CV, and appear here as New, without anyone uploading anything.' },
      { target: 'bucket-upload', title: 'Upload CVs', body: 'Adds CVs you received by email or on paper. Large uploads are read in batches; the limits are shown in the upload window.' },
      { target: 'bucket-tiles', title: 'Where candidates stand', body: 'Every candidate is in exactly one of these tiles. Click a tile to show only those people, for example New to screen the fresh CVs.' },
      { target: 'bucket-filters', title: 'Filters', body: 'Narrow the list by a keyword anywhere in the CV, years of experience, expected salary or industry.' },
      { target: 'bucket-select', title: 'Several at once', body: 'Tick candidates to select and hand over, reject, or set an interview schedule for all of them in one go.' },
      { target: 'bucket-table', title: 'Open a candidate', body: 'Click any row to open the candidate\'s card. The card is where you accept or reject, and where every later step is done.' },
    ],
  },
  card: {
    title: 'A candidate\'s card',
    steps: [
      { target: 'card-process', title: 'The seven steps', body: 'CV review, call, primary schedule, primary interview, final schedule, final interview and the final decision. Green is done, the outlined step is the current one.' },
      { target: 'card-next', title: 'Accept or reject here', body: 'This panel always shows the one thing to do next. Select (accept) moves the candidate forward; Reject stops the process and asks for the reason. After an interview, Select or Reject records the result and scores.' },
      { target: 'card-handler', title: 'Who handles this candidate', body: 'After the CV is selected it goes to a person on the process team, or to the whole team. Change gives it to someone else.' },
      { target: 'card-tabs', title: 'Everything about them', body: 'Full details, the original CV, all the text read from it, and History: every step, who did it and when.' },
      { target: 'card-save', title: 'Saving', body: 'Each step saves as soon as you press Save in its window. Save and close just leaves the card.' },
    ],
  },
  upload: {
    title: 'Uploading CVs',
    steps: [
      { target: 'upload-bucket', title: 'Which position', body: 'Choose the CV bucket the CVs belong to, and where they came from.' },
      { target: 'upload-mode', title: 'With or without AI', body: 'Without AI is free and the CV stays on this computer. With AI reads unusual layouts and scans better.' },
      { target: 'upload-limits', title: 'Limits', body: 'The size limit per file, the most files per upload, and how large uploads are split into batches with a short break between them.' },
      { target: 'upload-drop', title: 'Add the files', body: 'Drop files or a ZIP here, or click to choose them. Check the names read from each CV, then press Import.' },
    ],
  },
  requisitions: {
    title: 'Requisitions and job postings',
    steps: [
      { target: 'req-tabs', title: 'Three lists', body: 'Designations shows each post and how many are vacant. Requisitions are requests to hire for a post. Job postings record where each job was advertised.' },
      { target: 'req-new', title: 'Add one', body: 'This button adds to the list you are looking at: a designation, a new requisition, or a job posting. The team is told about each new posting.' },
      { target: 'req-list', title: 'The list', body: 'From a vacant designation, Raise requisition starts the hiring. Each requisition gets a CV bucket for its CVs.' },
    ],
  },
  selected: {
    title: 'Selected candidates',
    steps: [
      { target: 'selected-list', title: 'Everyone who passed', body: 'Candidates selected at the final interview, on the merit or the waiting list, with their joining status. Click a row to open the card.' },
      { target: 'selected-download', title: 'Download', body: 'Downloads the list as an Excel file, in the order shown.' },
    ],
  },
  questions: {
    title: 'Question library',
    steps: [
      { target: 'questions-kinds', title: 'Three kinds', body: 'Written test questions, MCQ with one right answer, and interview questions for the panel.' },
      { target: 'questions-add', title: 'Add a question', body: 'Write the question, the right answer or what a good answer covers, the marks, and which department or post it suits.' },
      { target: 'questions-filters', title: 'Find questions', body: 'Filter by department, post, topic and difficulty, or search the text.' },
      { target: 'questions-paper', title: 'Make a question paper', body: 'Tick the questions you want, then make a printable paper. The answer key can be printed separately for the examiner.' },
    ],
  },
  activity: {
    title: 'Team activity',
    steps: [
      { target: 'activity-now', title: 'Working now', body: 'Who has the app open and which candidate each person is working on at this moment.' },
      { target: 'activity-people', title: 'What each person did', body: 'Uploads, screening, handovers, calls, interviews, decisions and joining, counted per person for the chosen period. Click a name to see only their steps.' },
      { target: 'activity-feed', title: 'Every step', body: 'Each step in order, with who did it and when. Click a candidate\'s name to open the card.' },
    ],
  },
};

export interface FlowStep {
  title: string;
  body: string;
  where: string;
  /** The page to go to for "Show me". */
  to: string;
  tour: TourId;
  /** For a step done on a candidate's card: a candidate at this step, to open as the example. */
  example?: (c: Candidate) => boolean;
}

/** The whole hiring flow, from vacancy to joining day, with where each step is done. */
export const FLOW: FlowStep[] = [
  { title: 'Ask for people', body: 'Create a requisition for the position: vacancies, budget and target date.', where: 'Requisitions', to: '/requisitions', tour: 'requisitions' },
  { title: 'Advertise', body: 'Record each job posting (BDJobs, Facebook, LinkedIn) on the requisition. The team is told about it.', where: 'Requisitions', to: '/requisitions', tour: 'requisitions' },
  { title: 'Collect CVs', body: 'Share the application link of the CV bucket, and upload CVs that came by email or on paper.', where: 'CV Buckets', to: '/buckets', tour: 'buckets' },
  {
    title: 'Screen: accept or reject', body: 'Open each New CV. Select (accept) hands it to the process team, to one person or everyone, with a note. Reject asks for the reason.',
    where: 'A CV bucket, New tile, then the card', to: '/buckets', tour: 'card', example: (c) => c.screening_status === 'new',
  },
  {
    title: 'Call the candidate', body: 'Candidate confirmed or Candidate rejected, with the day and time of the call. Follow up if there is no answer yet.',
    where: 'The candidate\'s card', to: '/buckets', tour: 'card', example: (c) => c.screening_status === 'shortlisted' && (c.call_status === 'pending' || c.call_status === 'followup'),
  },
  {
    title: 'Primary interview', body: 'Set interview schedule prepares the message. After the interview, Select or Reject with each interviewer\'s score.',
    where: 'The candidate\'s card', to: '/buckets', tour: 'card', example: (c) => c.message_status === 'message_done' && (c.primary_status === 'pending' || c.primary_status === 'scheduled'),
  },
  {
    title: 'Final interview', body: 'The same again. Selecting puts the candidate on the merit or the waiting list.',
    where: 'The candidate\'s card', to: '/buckets', tour: 'card', example: (c) => c.primary_status === 'selected' && (c.secondary_status === 'pending' || c.secondary_status === 'scheduled'),
  },
  {
    title: 'Final decision', body: 'Send the confirmation letter, or reject. Either one locks the process, and the head of the team is told.',
    where: 'The candidate\'s card', to: '/selected', tour: 'card', example: (c) => c.secondary_status === 'selected' && !c.final_decision,
  },
  { title: 'Joining', body: 'Call for joining, record the documents, then Joined or Did not confirm. The head of the team is told.', where: 'Selected', to: '/selected', tour: 'selected' },
];

/** Which tour fits the page at this path. */
export function tourForPath(path: string): TourId {
  if (path.startsWith('/buckets/')) return 'bucket';
  if (path.startsWith('/buckets')) return 'buckets';
  if (path.startsWith('/requisitions')) return 'requisitions';
  if (path.startsWith('/selected')) return 'selected';
  if (path.startsWith('/questions')) return 'questions';
  if (path.startsWith('/activity')) return 'activity';
  return 'dashboard';
}
