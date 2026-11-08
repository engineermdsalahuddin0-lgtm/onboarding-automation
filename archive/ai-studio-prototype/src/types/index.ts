export type PriorityLevel = 'Urgent' | 'High' | 'Medium' | 'Low';
export type RequisitionStatus = 'Pending Approval' | 'Approved' | 'In Progress' | 'Fulfilled' | 'Closed';
export type JobPostingPlatform = 'LinkedIn' | 'BDJobs' | 'Facebook' | 'Career Portal' | 'Indeed' | 'Referral';
export type JobPostingStatus = 'Active' | 'Scheduled' | 'Expired' | 'Paused';

export interface Requisition {
  id: string;
  designation: string;
  department: string;
  vacanciesCount: number;
  priority: PriorityLevel;
  hiringManager: string;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  targetFillDate: string;
  status: RequisitionStatus;
  jobDescription: string;
  createdAt: string;
}

export interface JobPosting {
  id: string;
  requisitionId: string;
  designation: string;
  platform: JobPostingPlatform;
  postUrl: string;
  status: JobPostingStatus;
  postedDate: string;
  expiryDate: string;
  applicationsReceived: number;
  budgetSpent: number;
  notes: string;
}

export type FolderColor = 'blue' | 'purple' | 'emerald' | 'amber' | 'rose' | 'slate' | 'indigo';

export interface CvBucket {
  id: string;
  designation: string;
  requisitionId: string;
  department: string;
  folderColor: FolderColor;
  createdAt: string;
  targetCount: number;
  status: 'Active' | 'Archived';
  description: string;
}

export type CandidateOverallStatus =
  | 'New CV'
  | 'Shortlisted'
  | 'Calling In Progress'
  | 'Call Confirmed'
  | 'Call Followup'
  | 'Call Rejected'
  | 'Message Done'
  | 'Primary Interview'
  | 'Primary Selected'
  | 'Primary Rejected'
  | 'Secondary Interview'
  | 'Secondary Selected'
  | 'Secondary Rejected'
  | 'Final Selected'
  | 'Hired'
  | 'Rejected';

export type CallingStatus = 'Pending' | 'Confirm' | 'Followup' | 'Reject';
export type MessageStatus = 'Not Sent' | 'Message Done';
export type InterviewStatus = 'Not Scheduled' | 'Scheduled' | 'Selected' | 'Rejected';

export interface CandidateDegree {
  degree: string;
  institution: string;
  year: string;
}

export interface WorkExperienceItem {
  company: string;
  role: string;
  duration: string;
  highlights: string;
}

export interface CandidateReview {
  stage: 'Primary' | 'Secondary';
  rating: number; // 1 to 5
  clarity: number; // 1 to 5
  respectfulness: number; // 1 to 5
  comments: string;
  submittedAt: string;
  candidateName: string;
}

export interface Candidate {
  id: string;
  bucketId: string;
  designation: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  avatarUrl: string;
  source: 'BDJobs' | 'LinkedIn' | 'Facebook' | 'Company Form' | 'Walk-In' | 'Referral' | 'Direct Upload';
  totalExperienceYears: number;
  educationSummary: string;
  degrees: CandidateDegree[];
  skills: string[];
  workExperience: WorkExperienceItem[];
  summary: string;
  expectedSalary: string;
  noticePeriod: string;
  submissionDate: string;
  fitRating: number; // 0-100
  hasPhoto: boolean;
  
  // Pipeline status tracking
  overallStatus: CandidateOverallStatus;
  isShortlisted: boolean;

  // Block B: Calling
  callingStatus: CallingStatus;
  callNotes: string;
  calledAt?: string;
  calledBy?: string;

  // Block B: Messaging
  messageStatus: MessageStatus;
  messageSentAt?: string;
  messageChannel?: 'SMS' | 'WhatsApp' | 'Email';
  messageContent?: string;

  // Block B: Primary Interview
  primaryStatus: InterviewStatus;
  primaryDate?: string;
  primaryTime?: string;
  primaryInterviewer?: string;
  primaryFeedback?: string;
  primaryScore?: number; // 1-10
  primaryCandidateReview?: CandidateReview;

  // Block B: Secondary Interview
  secondaryStatus: InterviewStatus;
  secondaryDate?: string;
  secondaryTime?: string;
  secondaryInterviewer?: string;
  secondaryFeedback?: string;
  secondaryScore?: number; // 1-10
  secondaryCandidateReview?: CandidateReview;

  // Block C: Selected & Joining details
  joiningDate?: string;
  offeredSalary?: number;
  currency?: string;
  nationalId?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  contractType?: 'Full-Time Permanent' | 'Probationary (6 Months)' | 'Contractual';
  equipmentAssigned?: string[];
  documentsGeneratedAt?: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  enabled: boolean;
  lastSyncedAt?: string;
}
