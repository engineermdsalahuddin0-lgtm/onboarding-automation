import { Requisition, JobPosting, CvBucket, Candidate, SupabaseConfig } from '../types';

const STORAGE_KEYS = {
  REQUISITIONS: 'talentflow_requisitions_v1',
  JOB_POSTINGS: 'talentflow_job_postings_v1',
  CV_BUCKETS: 'talentflow_cv_buckets_v1',
  CANDIDATES: 'talentflow_candidates_v1',
  SUPABASE_CONFIG: 'talentflow_supabase_config_v1',
  API_KEY: 'talentflow_gemini_api_key_v1',
};

// Initial realistic default dataset
export const DEFAULT_REQUISITIONS: Requisition[] = [
  {
    id: 'req-01',
    designation: 'Senior Full Stack Engineer',
    department: 'Engineering',
    vacanciesCount: 2,
    priority: 'Urgent',
    hiringManager: 'Tariq Rahman (VP Engineering)',
    budgetMin: 120000,
    budgetMax: 160000,
    currency: 'BDT',
    targetFillDate: '2026-11-25',
    status: 'In Progress',
    jobDescription: 'Leading architecture for modern SaaS onboarding, React 19, Node.js microservices, and PostgreSQL.',
    createdAt: '2026-11-01',
  },
  {
    id: 'req-02',
    designation: 'HR Operations Executive',
    department: 'HR & People',
    vacanciesCount: 1,
    priority: 'High',
    hiringManager: 'Sadia Farhana (Head of HR)',
    budgetMin: 50000,
    budgetMax: 65000,
    currency: 'BDT',
    targetFillDate: '2026-11-30',
    status: 'In Progress',
    jobDescription: 'Managing full-cycle employee onboarding, joining documentation, employee records, and payroll coordination.',
    createdAt: '2026-11-02',
  },
  {
    id: 'req-03',
    designation: 'UI/UX Product Designer',
    department: 'Design & Product',
    vacanciesCount: 1,
    priority: 'Medium',
    hiringManager: 'Ashfaqur Nayeem (Design Lead)',
    budgetMin: 80000,
    budgetMax: 110000,
    currency: 'BDT',
    targetFillDate: '2026-12-10',
    status: 'Approved',
    jobDescription: 'Crafting responsive design systems in Figma, interactive onboarding flows, and modern dashboard ergonomics.',
    createdAt: '2026-11-03',
  },
  {
    id: 'req-04',
    designation: 'Enterprise Account Executive',
    department: 'Sales & Growth',
    vacanciesCount: 2,
    priority: 'High',
    hiringManager: 'Tanvir Hossain (Commercial Director)',
    budgetMin: 70000,
    budgetMax: 95000,
    currency: 'BDT',
    targetFillDate: '2026-11-28',
    status: 'In Progress',
    jobDescription: 'B2B client acquisition, product demonstrations, and enterprise deal closures across South Asia.',
    createdAt: '2026-11-03',
  },
];

export const DEFAULT_JOB_POSTINGS: JobPosting[] = [
  {
    id: 'post-01',
    requisitionId: 'req-01',
    designation: 'Senior Full Stack Engineer',
    platform: 'LinkedIn',
    postUrl: 'https://linkedin.com/jobs/view/98374291',
    status: 'Active',
    postedDate: '2026-11-02',
    expiryDate: '2026-11-22',
    applicationsReceived: 42,
    budgetSpent: 4500,
    notes: 'High organic engagement from Dhaka tech network',
  },
  {
    id: 'post-02',
    requisitionId: 'req-01',
    designation: 'Senior Full Stack Engineer',
    platform: 'BDJobs',
    postUrl: 'https://jobs.bdjobs.com/jobdetails.asp?id=839210',
    status: 'Active',
    postedDate: '2026-11-02',
    expiryDate: '2026-11-25',
    applicationsReceived: 68,
    budgetSpent: 3000,
    notes: 'Premium featured job placement',
  },
  {
    id: 'post-03',
    requisitionId: 'req-02',
    designation: 'HR Operations Executive',
    platform: 'Facebook',
    postUrl: 'https://facebook.com/careers/posts/1029384',
    status: 'Active',
    postedDate: '2026-11-03',
    expiryDate: '2026-11-24',
    applicationsReceived: 29,
    budgetSpent: 1500,
    notes: 'Boosted campaign targeting HR graduates and young professionals',
  },
  {
    id: 'post-04',
    requisitionId: 'req-02',
    designation: 'HR Operations Executive',
    platform: 'Career Portal',
    postUrl: 'https://company.careers/jobs/hr-operations',
    status: 'Active',
    postedDate: '2026-11-02',
    expiryDate: '2026-12-02',
    applicationsReceived: 18,
    budgetSpent: 0,
    notes: 'Internal career page direct submissions',
  },
  {
    id: 'post-05',
    requisitionId: 'req-03',
    designation: 'UI/UX Product Designer',
    platform: 'LinkedIn',
    postUrl: 'https://linkedin.com/jobs/view/76239120',
    status: 'Active',
    postedDate: '2026-11-04',
    expiryDate: '2026-11-27',
    applicationsReceived: 23,
    budgetSpent: 3500,
    notes: 'Targeting Dribbble / Behance portfolio links',
  },
];

export const DEFAULT_CV_BUCKETS: CvBucket[] = [
  {
    id: 'bucket-01',
    designation: 'Senior Full Stack Engineer',
    requisitionId: 'req-01',
    department: 'Engineering',
    folderColor: 'indigo',
    createdAt: '2026-11-01',
    targetCount: 50,
    status: 'Active',
    description: 'Candidates with strong React 19, TypeScript, Express, and cloud architectural background.',
  },
  {
    id: 'bucket-02',
    designation: 'HR Operations Executive',
    requisitionId: 'req-02',
    department: 'HR & People',
    folderColor: 'emerald',
    createdAt: '2026-11-02',
    targetCount: 30,
    status: 'Active',
    description: 'Onboarding specialists, labor law compliance, joining documentation and records.',
  },
  {
    id: 'bucket-03',
    designation: 'UI/UX Product Designer',
    requisitionId: 'req-03',
    department: 'Design & Product',
    folderColor: 'purple',
    createdAt: '2026-11-03',
    targetCount: 25,
    status: 'Active',
    description: 'Figma masters, design tokens, micro-interactions, responsive mobile & SaaS web layouts.',
  },
  {
    id: 'bucket-04',
    designation: 'Enterprise Account Executive',
    requisitionId: 'req-04',
    department: 'Sales & Growth',
    folderColor: 'amber',
    createdAt: '2026-11-03',
    targetCount: 40,
    status: 'Active',
    description: 'SaaS solutions selling, consultative negotiation, pipeline closing track record.',
  },
];

export const DEFAULT_CANDIDATES: Candidate[] = [
  {
    id: 'cand-01',
    bucketId: 'bucket-01',
    designation: 'Senior Full Stack Engineer',
    fullName: 'Mahmudul Hasan',
    email: 'mahmud.hasan.dev@gmail.com',
    phone: '+880 1711-234567',
    address: 'Dhanmondi 27, Dhaka-1209',
    avatarUrl: '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg',
    source: 'LinkedIn',
    totalExperienceYears: 5.5,
    educationSummary: 'B.Sc in Computer Science & Engineering, BUET',
    degrees: [
      { degree: 'B.Sc in CSE', institution: 'BUET', year: '2020' },
      { degree: 'HSC Science (GPA 5.0)', institution: 'Notre Dame College', year: '2016' }
    ],
    skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker', 'Tailwind CSS', 'Redis', 'System Architecture'],
    workExperience: [
      { company: 'Kite Digital Ltd.', role: 'Senior Software Engineer', duration: '2022 - Present', highlights: 'Engineered high-throughput fintech APIs and unified state machines.' },
      { company: 'Brainstation 23', role: 'Software Engineer', duration: '2020 - 2022', highlights: 'Built client portals and payment gateway integrations.' }
    ],
    summary: 'Senior developer with 5+ years building scalable SaaS web platforms and resilient real-time microservices.',
    expectedSalary: '145,000 BDT',
    noticePeriod: '1 Month',
    submissionDate: '2026-11-02',
    fitRating: 94,
    hasPhoto: true,
    overallStatus: 'Final Selected',
    isShortlisted: true,
    callingStatus: 'Confirm',
    callNotes: 'Spoke with candidate. Highly articulate, agreed with salary range, enthusiastic about company roadmap.',
    calledAt: '2026-11-03 11:30 AM',
    calledBy: 'Sadia Farhana',
    messageStatus: 'Message Done',
    messageSentAt: '2026-11-03 01:15 PM',
    messageChannel: 'WhatsApp',
    messageContent: 'Dear Mahmudul, you are shortlisted for Senior Full Stack Engineer. Interview confirmed for 05 Nov at 3:00 PM.',
    primaryStatus: 'Selected',
    primaryDate: '2026-11-04',
    primaryTime: '03:00 PM',
    primaryInterviewer: 'Tariq Rahman',
    primaryFeedback: 'Exceptional depth in React 19 hooks, concurrency, database indexing, and API reliability.',
    primaryScore: 9,
    primaryCandidateReview: {
      stage: 'Primary',
      rating: 5,
      clarity: 5,
      respectfulness: 5,
      comments: 'Very professional discussion. The technical questions were directly relevant to real architecture.',
      submittedAt: '2026-11-04 04:30 PM',
      candidateName: 'Mahmudul Hasan'
    },
    secondaryStatus: 'Selected',
    secondaryDate: '2026-11-04',
    secondaryTime: '05:30 PM',
    secondaryInterviewer: 'Managing Director & CTO',
    secondaryFeedback: 'Outstanding cultural fit and leadership clarity. Recommended for immediate hire.',
    secondaryScore: 10,
    secondaryCandidateReview: {
      stage: 'Secondary',
      rating: 5,
      clarity: 5,
      respectfulness: 5,
      comments: 'Smooth leadership round. All terms were clarified transparently.',
      submittedAt: '2026-11-04 06:45 PM',
      candidateName: 'Mahmudul Hasan'
    },
    joiningDate: '2026-12-01',
    offeredSalary: 150000,
    currency: 'BDT',
    nationalId: '19952692610000123',
    emergencyContactName: 'Dr. Rafiqul Hasan',
    emergencyContactPhone: '+880 1819-987654',
    emergencyContactRelation: 'Father',
    contractType: 'Full-Time Permanent',
    equipmentAssigned: ['MacBook Pro M3 Max 16"', '4K Dell UltraSharp Display', 'Company Access Card & Security Key'],
    documentsGeneratedAt: '2026-11-04',
  },
  {
    id: 'cand-02',
    bucketId: 'bucket-02',
    designation: 'HR Operations Executive',
    fullName: 'Nusrat Jahan Chowdhury',
    email: 'nusrat.jahan.hr@outlook.com',
    phone: '+880 1842-567890',
    address: 'Sector 4, Uttara, Dhaka-1230',
    avatarUrl: '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg',
    source: 'BDJobs',
    totalExperienceYears: 3.2,
    educationSummary: 'BBA in Human Resource Management, IBA University of Dhaka',
    degrees: [
      { degree: 'BBA in HRM', institution: 'IBA, University of Dhaka', year: '2022' }
    ],
    skills: ['Talent Acquisition', 'Employee Onboarding', 'Bangladesh Labour Law 2006', 'Payroll Management', 'HRIS', 'Documentation'],
    workExperience: [
      { company: 'Apex Group BD', role: 'Junior HR Executive', duration: '2022 - 2024', highlights: 'Managed onboarding for 250+ employees and verified joining documentation.' }
    ],
    summary: 'Dedicated HR professional skilled in structured onboarding, contract administration, employee lifecycle, and labor compliance.',
    expectedSalary: '60,000 BDT',
    noticePeriod: '15 Days',
    submissionDate: '2026-11-02',
    fitRating: 91,
    hasPhoto: true,
    overallStatus: 'Final Selected',
    isShortlisted: true,
    callingStatus: 'Confirm',
    callNotes: 'Confirmed interest, prompt responder, great telephone presence.',
    calledAt: '2026-11-03 10:00 AM',
    calledBy: 'Sadia Farhana',
    messageStatus: 'Message Done',
    messageSentAt: '2026-11-03 10:30 AM',
    messageChannel: 'Email',
    messageContent: 'Invitation to Primary HR Interview on 04 Nov at 11:30 AM.',
    primaryStatus: 'Selected',
    primaryDate: '2026-11-04',
    primaryTime: '11:30 AM',
    primaryInterviewer: 'Sadia Farhana',
    primaryFeedback: 'Strong mastery of onboarding documentation workflows and Bangladesh Labour Law compliance.',
    primaryScore: 9,
    primaryCandidateReview: {
      stage: 'Primary',
      rating: 5,
      clarity: 5,
      respectfulness: 5,
      comments: 'Prompt and clear interview. Questions tested practical daily HR scenarios.',
      submittedAt: '2026-11-04 01:00 PM',
      candidateName: 'Nusrat Jahan Chowdhury'
    },
    secondaryStatus: 'Selected',
    secondaryDate: '2026-11-04',
    secondaryTime: '04:00 PM',
    secondaryInterviewer: 'COO & Head of HR',
    secondaryFeedback: 'Very poised, high integrity, approved for immediate joining.',
    secondaryScore: 9,
    secondaryCandidateReview: {
      stage: 'Secondary',
      rating: 5,
      clarity: 5,
      respectfulness: 5,
      comments: 'Warm atmosphere, clear guidance on joining requirements and timeline.',
      submittedAt: '2026-11-04 05:00 PM',
      candidateName: 'Nusrat Jahan Chowdhury'
    },
    joiningDate: '2026-11-16',
    offeredSalary: 62000,
    currency: 'BDT',
    nationalId: '19972619478000456',
    emergencyContactName: 'Shahidul Alam Chowdhury',
    emergencyContactPhone: '+880 1715-112233',
    emergencyContactRelation: 'Brother',
    contractType: 'Full-Time Permanent',
    equipmentAssigned: ['ThinkPad Carbon X1', 'Official SIM & Card', 'Corporate Access Badge'],
    documentsGeneratedAt: '2026-11-04',
  },
  {
    id: 'cand-03',
    bucketId: 'bucket-01',
    designation: 'Senior Full Stack Engineer',
    fullName: 'Tanvir Anjum Khan',
    email: 'tanvir.anjum@techmail.com',
    phone: '+880 1912-887766',
    address: 'Mirpur DOHS, Dhaka',
    avatarUrl: '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg',
    source: 'BDJobs',
    totalExperienceYears: 4.8,
    educationSummary: 'B.Sc in CSE, North South University',
    degrees: [
      { degree: 'B.Sc in CSE', institution: 'North South University', year: '2021' }
    ],
    skills: ['React', 'Next.js', 'Express', 'Tailwind CSS', 'SQL', 'MongoDB'],
    workExperience: [
      { company: 'Orbit Tech BD', role: 'Full Stack Engineer', duration: '2021 - 2024', highlights: 'Built client e-commerce portals and internal ERP tools.' }
    ],
    summary: 'Full Stack engineer with focus on frontend ergonomics and clean REST API integrations.',
    expectedSalary: '130,000 BDT',
    noticePeriod: '30 Days',
    submissionDate: '2026-11-03',
    fitRating: 86,
    hasPhoto: true,
    overallStatus: 'Primary Interview',
    isShortlisted: true,
    callingStatus: 'Confirm',
    callNotes: 'Confirmed for technical interview round.',
    calledAt: '2026-11-03 04:00 PM',
    calledBy: 'Sadia Farhana',
    messageStatus: 'Message Done',
    messageSentAt: '2026-11-03 04:30 PM',
    messageChannel: 'WhatsApp',
    primaryStatus: 'Scheduled',
    primaryDate: '2026-11-06',
    primaryTime: '02:00 PM',
    primaryInterviewer: 'Tariq Rahman',
    secondaryStatus: 'Not Scheduled',
  },
  {
    id: 'cand-04',
    bucketId: 'bucket-03',
    designation: 'UI/UX Product Designer',
    fullName: 'Sabrina Mostafa',
    email: 'sabrina.designs@gmail.com',
    phone: '+880 1612-990011',
    address: 'Gulshan 1, Dhaka-1212',
    avatarUrl: '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg',
    source: 'Company Form',
    totalExperienceYears: 4.0,
    educationSummary: 'B.A. in Graphic Design & Multimedia, Shanto-Mariam University',
    degrees: [
      { degree: 'B.A. in Multimedia Design', institution: 'SMUCT', year: '2021' }
    ],
    skills: ['Figma', 'UI/UX Design', 'Design Systems', 'Micro-interactions', 'Prototyping', 'User Research'],
    workExperience: [
      { company: 'Hyperion Labs', role: 'UI/UX Designer', duration: '2021 - Present', highlights: 'Crafted mobile app experience for 100K+ DAU fintech app.' }
    ],
    summary: 'Product designer obsessed with zero-clutter typography, accessible contrast, and intuitive user workflows.',
    expectedSalary: '95,000 BDT',
    noticePeriod: 'Immediate',
    submissionDate: '2026-11-04',
    fitRating: 92,
    hasPhoto: true,
    overallStatus: 'Calling In Progress',
    isShortlisted: true,
    callingStatus: 'Followup',
    callNotes: 'Phone rang, requested callback after 5:00 PM today due to ongoing design sprint.',
    calledAt: '2026-11-04 02:15 PM',
    calledBy: 'Sadia Farhana',
    messageStatus: 'Not Sent',
    primaryStatus: 'Not Scheduled',
    secondaryStatus: 'Not Scheduled',
  },
  {
    id: 'cand-05',
    bucketId: 'bucket-04',
    designation: 'Enterprise Account Executive',
    fullName: 'Kamrul Ahsan',
    email: 'kamrul.sales.pro@gmail.com',
    phone: '+880 1718-445566',
    address: 'Banani, Dhaka-1213',
    avatarUrl: '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg',
    source: 'LinkedIn',
    totalExperienceYears: 6.0,
    educationSummary: 'MBA in Marketing, Jahangirnagar University',
    degrees: [
      { degree: 'MBA Marketing', institution: 'Jahangirnagar University', year: '2019' }
    ],
    skills: ['B2B Sales', 'Enterprise Closing', 'CRM (HubSpot/Salesforce)', 'Contract Negotiation', 'Lead Qualification'],
    workExperience: [
      { company: 'CloudTech Solutions', role: 'Senior Sales Executive', duration: '2020 - 2024', highlights: 'Surpassed sales quota by 135% across banking and retail verticals.' }
    ],
    summary: 'Results-driven B2B sales professional with 6 years experience selling software solutions to corporate clients.',
    expectedSalary: '85,000 BDT',
    noticePeriod: '15 Days',
    submissionDate: '2026-11-03',
    fitRating: 88,
    hasPhoto: true,
    overallStatus: 'Shortlisted',
    isShortlisted: true,
    callingStatus: 'Pending',
    callNotes: '',
    messageStatus: 'Not Sent',
    primaryStatus: 'Not Scheduled',
    secondaryStatus: 'Not Scheduled',
  },
  {
    id: 'cand-06',
    bucketId: 'bucket-01',
    designation: 'Senior Full Stack Engineer',
    fullName: 'Rashedul Karim',
    email: 'rashed.dev92@yahoo.com',
    phone: '+880 1715-334455',
    address: 'Khilgaon, Dhaka',
    avatarUrl: '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg',
    source: 'Walk-In',
    totalExperienceYears: 1.5,
    educationSummary: 'Diploma in Computer Technology',
    degrees: [{ degree: 'Diploma in Engineering', institution: 'Dhaka Polytechnic Institute', year: '2023' }],
    skills: ['HTML', 'CSS', 'Basic JavaScript', 'WordPress'],
    workExperience: [{ company: 'Freelance', role: 'Junior Web Assistant', duration: '1 Year', highlights: 'Created WordPress themes.' }],
    summary: 'Junior developer seeking senior role.',
    expectedSalary: '80,000 BDT',
    noticePeriod: 'Immediate',
    submissionDate: '2026-11-02',
    fitRating: 54,
    hasPhoto: true,
    overallStatus: 'Rejected',
    isShortlisted: false,
    callingStatus: 'Reject',
    callNotes: 'Does not meet 4+ years senior engineering requirements.',
    calledAt: '2026-11-02 03:00 PM',
    calledBy: 'Sadia Farhana',
    messageStatus: 'Not Sent',
    primaryStatus: 'Rejected',
    secondaryStatus: 'Not Scheduled',
  }
];

export const Storage = {
  getRequisitions(): Requisition[] {
    const raw = localStorage.getItem(STORAGE_KEYS.REQUISITIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.REQUISITIONS, JSON.stringify(DEFAULT_REQUISITIONS));
      return DEFAULT_REQUISITIONS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_REQUISITIONS;
    }
  },

  saveRequisitions(items: Requisition[]) {
    localStorage.setItem(STORAGE_KEYS.REQUISITIONS, JSON.stringify(items));
  },

  getJobPostings(): JobPosting[] {
    const raw = localStorage.getItem(STORAGE_KEYS.JOB_POSTINGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.JOB_POSTINGS, JSON.stringify(DEFAULT_JOB_POSTINGS));
      return DEFAULT_JOB_POSTINGS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_JOB_POSTINGS;
    }
  },

  saveJobPostings(items: JobPosting[]) {
    localStorage.setItem(STORAGE_KEYS.JOB_POSTINGS, JSON.stringify(items));
  },

  getCvBuckets(): CvBucket[] {
    const raw = localStorage.getItem(STORAGE_KEYS.CV_BUCKETS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.CV_BUCKETS, JSON.stringify(DEFAULT_CV_BUCKETS));
      return DEFAULT_CV_BUCKETS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_CV_BUCKETS;
    }
  },

  saveCvBuckets(items: CvBucket[]) {
    localStorage.setItem(STORAGE_KEYS.CV_BUCKETS, JSON.stringify(items));
  },

  getCandidates(): Candidate[] {
    const raw = localStorage.getItem(STORAGE_KEYS.CANDIDATES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify(DEFAULT_CANDIDATES));
      return DEFAULT_CANDIDATES;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_CANDIDATES;
    }
  },

  saveCandidates(items: Candidate[]) {
    localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify(items));
  },

  getSupabaseConfig(): SupabaseConfig {
    const raw = localStorage.getItem(STORAGE_KEYS.SUPABASE_CONFIG);
    if (!raw) {
      return { url: '', anonKey: '', enabled: false };
    }
    try {
      return JSON.parse(raw);
    } catch {
      return { url: '', anonKey: '', enabled: false };
    }
  },

  saveSupabaseConfig(config: SupabaseConfig) {
    localStorage.setItem(STORAGE_KEYS.SUPABASE_CONFIG, JSON.stringify(config));
  },

  getGeminiApiKey(): string {
    return localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
  },

  saveGeminiApiKey(key: string) {
    localStorage.setItem(STORAGE_KEYS.API_KEY, key);
  },

  resetToDefaults() {
    localStorage.setItem(STORAGE_KEYS.REQUISITIONS, JSON.stringify(DEFAULT_REQUISITIONS));
    localStorage.setItem(STORAGE_KEYS.JOB_POSTINGS, JSON.stringify(DEFAULT_JOB_POSTINGS));
    localStorage.setItem(STORAGE_KEYS.CV_BUCKETS, JSON.stringify(DEFAULT_CV_BUCKETS));
    localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify(DEFAULT_CANDIDATES));
  },

  // Export database to CSV
  exportCandidatesToCsv(candidates: Candidate[]): string {
    const headers = [
      'Candidate ID',
      'Full Name',
      'Designation',
      'Email',
      'Phone',
      'Total Experience (Yrs)',
      'Source',
      'Fit Rating',
      'Calling Status',
      'Message Status',
      'Primary Interview',
      'Secondary Interview',
      'Overall Status',
      'Offered Salary (BDT)',
      'Joining Date',
      'National ID',
    ];

    const rows = candidates.map(c => [
      `"${c.id}"`,
      `"${c.fullName.replace(/"/g, '""')}"`,
      `"${c.designation.replace(/"/g, '""')}"`,
      `"${c.email}"`,
      `"${c.phone}"`,
      c.totalExperienceYears,
      `"${c.source}"`,
      c.fitRating,
      `"${c.callingStatus}"`,
      `"${c.messageStatus}"`,
      `"${c.primaryStatus}"`,
      `"${c.secondaryStatus}"`,
      `"${c.overallStatus}"`,
      c.offeredSalary || '',
      `"${c.joiningDate || ''}"`,
      `"${c.nationalId || ''}"`,
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  },

  // Pre-configured Supabase PostgreSQL schema for the user
  generateSupabaseSql(): string {
    return `-- ========================================================
-- SUPABASE POSTGRESQL SCHEMA FOR ONBOARDING AUTOMATION SUITE
-- ========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Requisitions Table (Block A)
CREATE TABLE IF NOT EXISTS requisitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    designation TEXT NOT NULL,
    department TEXT NOT NULL,
    vacancies_count INTEGER DEFAULT 1,
    priority TEXT CHECK (priority IN ('Urgent', 'High', 'Medium', 'Low')),
    hiring_manager TEXT,
    budget_min NUMERIC,
    budget_max NUMERIC,
    currency TEXT DEFAULT 'BDT',
    target_fill_date DATE,
    status TEXT DEFAULT 'In Progress',
    job_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Job Postings Table (Block A)
CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requisition_id UUID REFERENCES requisitions(id) ON DELETE CASCADE,
    designation TEXT NOT NULL,
    platform TEXT NOT NULL,
    post_url TEXT,
    status TEXT DEFAULT 'Active',
    posted_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    applications_received INTEGER DEFAULT 0,
    budget_spent NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. CV Buckets Folders Table (Block B)
CREATE TABLE IF NOT EXISTS cv_buckets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    designation TEXT NOT NULL,
    requisition_id UUID REFERENCES requisitions(id) ON DELETE SET NULL,
    department TEXT NOT NULL,
    folder_color TEXT DEFAULT 'indigo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    target_count INTEGER DEFAULT 30,
    status TEXT DEFAULT 'Active',
    description TEXT
);

-- 4. Candidates Pipeline Table (Block B & Block C)
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bucket_id UUID REFERENCES cv_buckets(id) ON DELETE CASCADE,
    designation TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    avatar_url TEXT,
    source TEXT DEFAULT 'Direct Upload',
    total_experience_years NUMERIC DEFAULT 0,
    education_summary TEXT,
    skills TEXT[] DEFAULT '{}',
    summary TEXT,
    expected_salary TEXT,
    notice_period TEXT,
    fit_rating INTEGER DEFAULT 75,
    has_photo BOOLEAN DEFAULT FALSE,
    overall_status TEXT DEFAULT 'New CV',
    is_shortlisted BOOLEAN DEFAULT FALSE,
    calling_status TEXT DEFAULT 'Pending',
    call_notes TEXT,
    called_at TIMESTAMP WITH TIME ZONE,
    called_by TEXT,
    message_status TEXT DEFAULT 'Not Sent',
    message_sent_at TIMESTAMP WITH TIME ZONE,
    message_channel TEXT,
    primary_status TEXT DEFAULT 'Not Scheduled',
    primary_date DATE,
    primary_time TEXT,
    primary_interviewer TEXT,
    primary_feedback TEXT,
    primary_score INTEGER,
    secondary_status TEXT DEFAULT 'Not Scheduled',
    secondary_date DATE,
    secondary_time TEXT,
    secondary_interviewer TEXT,
    secondary_feedback TEXT,
    secondary_score INTEGER,
    joining_date DATE,
    offered_salary NUMERIC,
    currency TEXT DEFAULT 'BDT',
    national_id TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relation TEXT,
    contract_type TEXT DEFAULT 'Full-Time Permanent',
    equipment_assigned TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

-- Allow read/write for authenticated users or public service key
CREATE POLICY "Allow all operations for anon" ON requisitions FOR ALL USING (true);
CREATE POLICY "Allow all operations for anon" ON job_postings FOR ALL USING (true);
CREATE POLICY "Allow all operations for anon" ON cv_buckets FOR ALL USING (true);
CREATE POLICY "Allow all operations for anon" ON candidates FOR ALL USING (true);
`;
  }
};
