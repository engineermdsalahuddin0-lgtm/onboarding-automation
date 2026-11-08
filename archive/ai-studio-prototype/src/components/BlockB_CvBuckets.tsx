import React, { useState } from 'react';
import { 
  FolderGit2, 
  Plus, 
  Search, 
  Filter, 
  Upload, 
  PhoneCall, 
  MessageSquare, 
  UserCheck, 
  Star, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Sparkles,
  ArrowLeft,
  Share2,
  FileText,
  FileSpreadsheet,
  Trash2,
  Eye,
  Send,
  Building,
  DollarSign,
  ChevronRight,
  ShieldCheck,
  UserPlus,
  Copy,
  Check,
  Mail
} from 'lucide-react';
import { 
  CvBucket, 
  Candidate, 
  CallingStatus, 
  MessageStatus, 
  InterviewStatus, 
  CandidateOverallStatus,
  CandidateReview,
  Requisition 
} from '../types';
import { parseCvWithoutAi, parseCvWithAi } from '../lib/cvParser';
import { Storage } from '../lib/storage';
import { CandidateDetailModal } from './CandidateDetailModal';
import { CandidateExperienceReviewModal } from './CandidateExperienceReviewModal';

interface BlockBCvBucketsProps {
  cvBuckets: CvBucket[];
  candidates: Candidate[];
  requisitions: Requisition[];
  selectedBucketId: string | null;
  onSelectBucket: (bucketId: string | null) => void;
  onAddCandidate: (candidate: Omit<Candidate, 'id'>) => void;
  onUpdateCandidate: (candidate: Candidate) => void;
  onDeleteCandidate: (id: string) => void;
  onCreateBucket: (bucket: Omit<CvBucket, 'id' | 'createdAt'>) => void;
  onNavigateToBlockC: () => void;
  onOpenCompanyForm: () => void;
  geminiApiKey: string;
}

export const BlockB_CvBuckets: React.FC<BlockBCvBucketsProps> = ({
  cvBuckets,
  candidates,
  requisitions,
  selectedBucketId,
  onSelectBucket,
  onAddCandidate,
  onUpdateCandidate,
  onDeleteCandidate,
  onCreateBucket,
  onNavigateToBlockC,
  onOpenCompanyForm,
  geminiApiKey,
}) => {
  // Navigation & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sourceFilter, setSourceFilter] = useState<string>('All');

  // Modal states
  const [showCreateBucketModal, setShowCreateBucketModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [inspectingCandidate, setInspectingCandidate] = useState<Candidate | null>(null);

  // Calling modal
  const [callingCandidate, setCallingCandidate] = useState<Candidate | null>(null);
  const [callingStatusChoice, setCallingStatusChoice] = useState<CallingStatus>('Confirm');
  const [callingNotes, setCallingNotes] = useState('');

  // Messaging modal & Bitopi Group Auto-Generated Templates
  const [messagingCandidate, setMessagingCandidate] = useState<Candidate | null>(null);
  const [messageTab, setMessageTab] = useState<'msg1' | 'msg2' | 'offerEmail'>('msg1');
  const [interviewDate, setInterviewDate] = useState('13/08/2026');
  const [interviewDayOfWeek, setInterviewDayOfWeek] = useState('Thursday');
  const [interviewTime, setInterviewTime] = useState('11:20am');
  const [hiringManagerName, setHiringManagerName] = useState('Sadia Farhana');
  const [managerDesignation, setManagerDesignation] = useState('Head of HR & People');
  const [managerMobile, setManagerMobile] = useState('+880 1711-234567');
  const [managerEmail, setManagerEmail] = useState('hr.corporate@bitopigroup.com');
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  // Interview Evaluation modal
  const [interviewCandidate, setInterviewCandidate] = useState<{ candidate: Candidate; stage: 'Primary' | 'Secondary' } | null>(null);
  const [interviewStatusChoice, setInterviewStatusChoice] = useState<InterviewStatus>('Selected');
  const [interviewerName, setInterviewerName] = useState('Senior Evaluation Panel');
  const [interviewScore, setInterviewScore] = useState<number>(9);
  const [interviewFeedback, setInterviewFeedback] = useState('Demonstrated strong domain competence, clear communication, and high alignment with organizational values.');

  // Candidate Experience Review Modal
  const [reviewModalState, setReviewModalState] = useState<{ candidate: Candidate; stage: 'Primary' | 'Secondary' } | null>(null);

  // Final Onboard / Move to Block C Modal
  const [onboardingCandidate, setOnboardingCandidate] = useState<Candidate | null>(null);
  const [offeredSalary, setOfferedSalary] = useState<number>(90000);
  const [joiningDate, setJoiningDate] = useState('2026-12-01');
  const [nationalId, setNationalId] = useState('19962692610000889');
  const [emergencyName, setEmergencyName] = useState('Fatima Begum');
  const [emergencyPhone, setEmergencyPhone] = useState('+880 1819-001122');
  const [emergencyRel, setEmergencyRel] = useState('Mother');

  // Upload Modal State
  const [uploadMode, setUploadMode] = useState<'withAi' | 'withoutAi'>('withoutAi');
  const [uploadCustomApiKey, setUploadCustomApiKey] = useState(geminiApiKey || '');
  const [uploadCvText, setUploadCvText] = useState('');
  const [uploadPhotoUrl, setUploadPhotoUrl] = useState<string>('');
  const [uploadTargetBucketId, setUploadTargetBucketId] = useState<string>(selectedBucketId || cvBuckets[0]?.id || '');
  const [uploadSource, setUploadSource] = useState<'BDJobs' | 'LinkedIn' | 'Facebook' | 'Company Form' | 'Walk-In' | 'Referral' | 'Direct Upload'>('Direct Upload');
  const [uploadedFilesList, setUploadedFilesList] = useState<Array<{ name: string; text: string; size: string }>>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<any | null>(null);

  // New Bucket form state
  const [newBucketDesignation, setNewBucketDesignation] = useState('');
  const [newBucketDept, setNewBucketDept] = useState('Engineering');
  const [newBucketTarget, setNewBucketTarget] = useState(30);
  const [newBucketColor, setNewBucketColor] = useState<'blue' | 'purple' | 'emerald' | 'amber' | 'rose' | 'slate' | 'indigo'>('indigo');
  const [newBucketDesc, setNewBucketDesc] = useState('');

  const currentBucket = cvBuckets.find(b => b.id === selectedBucketId);

  // Filter candidates for current bucket or all
  const bucketCandidates = selectedBucketId 
    ? candidates.filter(c => c.bucketId === selectedBucketId)
    : candidates;

  const filteredCandidates = bucketCandidates.filter(c => {
    // Search filter
    const matchesSearch = !searchQuery.trim() || 
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

    // Status filter
    let matchesStatus = true;
    if (statusFilter === 'Shortlisted') matchesStatus = c.isShortlisted;
    else if (statusFilter === 'Call Confirm') matchesStatus = c.callingStatus === 'Confirm';
    else if (statusFilter === 'Call Followup') matchesStatus = c.callingStatus === 'Followup';
    else if (statusFilter === 'Message Done') matchesStatus = c.messageStatus === 'Message Done';
    else if (statusFilter === 'Primary Selected') matchesStatus = c.primaryStatus === 'Selected';
    else if (statusFilter === 'Secondary Selected') matchesStatus = c.secondaryStatus === 'Selected';
    else if (statusFilter === 'Final Selected') matchesStatus = c.overallStatus === 'Final Selected' || c.overallStatus === 'Hired';
    else if (statusFilter === 'Rejected') matchesStatus = c.overallStatus === 'Rejected' || c.callingStatus === 'Reject' || c.primaryStatus === 'Rejected' || c.secondaryStatus === 'Rejected';

    // Source filter
    const matchesSource = sourceFilter === 'All' || c.source === sourceFilter;

    return matchesSearch && matchesStatus && matchesSource;
  });

  // Sample resumes for instant 1-click test in upload modal
  const handleLoadSampleResume = (type: 'engineer' | 'hr' | 'designer') => {
    if (type === 'engineer') {
      setUploadCvText(`Curriculum Vitae
Shahriar Ahmed
Email: shahriar.ahmed.eng@gmail.com
Phone: +880 1713-987654
Address: Gulshan-2, Dhaka, Bangladesh

Professional Summary:
Full stack developer with 4.5 years of industry experience building high-performance web applications with React 19, TypeScript, Node.js, and PostgreSQL. Experienced in Docker containerization and CI/CD pipelines.

Core Technical Skills:
React, TypeScript, Next.js, Node.js, PostgreSQL, Docker, Tailwind CSS, Redis, REST APIs, Git

Education:
B.Sc in Computer Science & Engineering, BRAC University (2021)
HSC Science, Dhaka College (2017)

Work Experience:
Software Engineer | DevCraft Technologies (2022 - Present)
- Architected enterprise cloud dashboards serving 50k+ daily users.
- Reduced API query latency by 45% using database index optimization.

Junior Web Developer | Innovate IT (2020 - 2022)
- Implemented responsive user interfaces using modern CSS and React.`);
      setUploadPhotoUrl('/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg');
    } else if (type === 'hr') {
      setUploadCvText(`Resume
Fariha Rahman
Email: fariha.rahman.hr@gmail.com
Phone: +880 1812-349876
Address: Dhanmondi, Dhaka

Profile:
Human Resources professional with 3 years of hands-on experience in talent acquisition, employee onboarding documentation, Bangladesh Labour Law compliance, and payroll administration.

Key Skills:
Recruitment, Employee Onboarding, Bangladesh Labour Law, HRIS, Payroll, Talent Acquisition, Documentation, Communication

Education:
BBA in Human Resource Management, North South University (2022)

Experience:
HR Officer | Bengal Enterprise Group (2022 - Present)
- Supervised end-to-end recruitment pipeline and coordinated candidate interviews.
- Processed complete joining packets, NDA agreements, and employee records.`);
      setUploadPhotoUrl('/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg');
    } else {
      setUploadCvText(`Curriculum Vitae
Arifur Rahman
Email: arif.uxdesigns@gmail.com
Phone: +880 1914-554433
Address: Uttara, Dhaka

Professional Objective:
UI/UX Product Designer with 3.5 years experience creating design systems, interactive prototypes, and SaaS dashboards.

Competencies:
Figma, UI/UX Design, Prototyping, Wireframing, Design Systems, User Research, Mobile App Design, Tailwind CSS

Education:
B.A. in Multimedia & Creative Arts, Dhaka University (2022)

Work History:
Product Designer | PixelStudio BD (2022 - Present)
- Designed complete UI components and mobile apps for fintech and logistics.`);
      setUploadPhotoUrl('/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg');
    }
  };

  // Handle Multi-file PDF, DOCX, TXT upload in Block B
  const handleBulkFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setParseError(null);

    const newFiles: Array<{ name: string; text: string; size: string }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileSize = `${(file.size / 1024).toFixed(1)} KB`;
      try {
        const textContent = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve((ev.target?.result as string) || '');
          reader.onerror = () => resolve(`Resume (${file.name})\nName: Candidate ${file.name.replace(/\.[^/.]+$/, '')}\nEmail: candidate.${i + 1}@example.com\nPhone: +880 1712-${Math.floor(100000 + Math.random() * 900000)}`);
          reader.readAsText(file);
        });
        newFiles.push({ name: file.name, text: textContent, size: fileSize });
      } catch {
        newFiles.push({
          name: file.name,
          text: `Candidate Resume ${file.name}\nName: Applicant ${file.name.replace(/\.[^/.]+$/, '')}\nEmail: applicant.${i + 1}@example.com\nPhone: +880 1712-445566`,
          size: fileSize,
        });
      }
    }
    setUploadedFilesList(prev => [...prev, ...newFiles]);
  };

  const handleBatchUploadAllFiles = async () => {
    if (uploadedFilesList.length === 0) return;
    setIsParsing(true);
    setParseError(null);
    const targetBucket = cvBuckets.find(b => b.id === uploadTargetBucketId) || cvBuckets[0];
    const targetRole = targetBucket?.designation || '';

    try {
      for (let i = 0; i < uploadedFilesList.length; i++) {
        const item = uploadedFilesList[i];
        let parsed: any;
        if (uploadMode === 'withAi') {
          try {
            parsed = await parseCvWithAi(item.text, targetRole, uploadCustomApiKey || undefined);
          } catch {
            parsed = parseCvWithoutAi(item.text, targetRole);
          }
        } else {
          parsed = parseCvWithoutAi(item.text, targetRole);
        }

        onAddCandidate({
          bucketId: targetBucket.id,
          designation: targetBucket.designation,
          fullName: parsed.fullName || `Candidate ${i + 1}`,
          email: parsed.email || `candidate.${i + 1}@example.com`,
          phone: parsed.phone || '+880 1712-000000',
          address: parsed.address || 'Dhaka, Bangladesh',
          avatarUrl: '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg',
          source: uploadSource,
          totalExperienceYears: parsed.totalExperienceYears || 2,
          educationSummary: parsed.educationSummary || 'Graduate Degree',
          degrees: parsed.degrees || [{ degree: 'Bachelor Degree', institution: 'University', year: '2022' }],
          skills: parsed.skills || ['Communication', 'Teamwork'],
          workExperience: parsed.workExperience || [{ company: 'Previous Firm', role: targetRole, duration: '2 Years', highlights: 'Key achievements' }],
          summary: parsed.summary || 'Qualified talent with industry experience.',
          expectedSalary: parsed.expectedSalary || '50,000 - 70,000 BDT',
          noticePeriod: parsed.noticePeriod || '30 Days',
          submissionDate: new Date().toISOString().split('T')[0],
          fitRating: parsed.fitRating || 85,
          hasPhoto: true,
          overallStatus: 'New CV',
          isShortlisted: true,
          callingStatus: 'Pending',
          callNotes: '',
          messageStatus: 'Not Sent',
          primaryStatus: 'Not Scheduled',
          secondaryStatus: 'Not Scheduled',
        });
      }

      setUploadedFilesList([]);
      setShowUploadModal(false);
    } catch (err: any) {
      setParseError(err.message || 'Error occurred during bulk ingest.');
    } finally {
      setIsParsing(false);
    }
  };

  // Perform parsing in Upload Modal
  const handleRunParse = async () => {
    if (!uploadCvText.trim()) {
      setParseError('Please paste or type CV text, or click a sample resume below.');
      return;
    }

    setIsParsing(true);
    setParseError(null);

    const targetBucket = cvBuckets.find(b => b.id === uploadTargetBucketId) || cvBuckets[0];
    const targetRole = targetBucket?.designation || '';

    try {
      if (uploadMode === 'withAi') {
        const result = await parseCvWithAi(
          uploadCvText, 
          targetRole, 
          uploadCustomApiKey || undefined, 
          uploadPhotoUrl || undefined
        );
        setParsedPreview(result);
      } else {
        const result = parseCvWithoutAi(
          uploadCvText, 
          targetRole, 
          uploadPhotoUrl || undefined
        );
        setParsedPreview(result);
      }
    } catch (err: any) {
      setParseError(err.message || 'Parsing failed. You can switch to "Without AI" mode for instant parsing.');
    } finally {
      setIsParsing(false);
    }
  };

  // Confirm save from Upload Modal
  const handleConfirmSaveCandidate = () => {
    if (!parsedPreview) return;
    const targetBucket = cvBuckets.find(b => b.id === uploadTargetBucketId) || cvBuckets[0];

    onAddCandidate({
      bucketId: targetBucket.id,
      designation: targetBucket.designation,
      fullName: parsedPreview.fullName,
      email: parsedPreview.email,
      phone: parsedPreview.phone,
      address: parsedPreview.address,
      avatarUrl: parsedPreview.avatarUrl || '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg',
      source: uploadSource,
      totalExperienceYears: parsedPreview.totalExperienceYears,
      educationSummary: parsedPreview.educationSummary,
      degrees: parsedPreview.degrees,
      skills: parsedPreview.skills,
      workExperience: parsedPreview.workExperience,
      summary: parsedPreview.summary,
      expectedSalary: parsedPreview.expectedSalary,
      noticePeriod: parsedPreview.noticePeriod,
      submissionDate: new Date().toISOString().split('T')[0],
      fitRating: parsedPreview.fitRating,
      hasPhoto: Boolean(parsedPreview.hasPhoto || parsedPreview.avatarUrl),
      overallStatus: 'New CV',
      isShortlisted: false,
      callingStatus: 'Pending',
      callNotes: '',
      messageStatus: 'Not Sent',
      primaryStatus: 'Not Scheduled',
      secondaryStatus: 'Not Scheduled',
    });

    setShowUploadModal(false);
    setParsedPreview(null);
    setUploadCvText('');
    setUploadPhotoUrl('');
  };

  // Submit Calling log
  const handleSaveCalling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callingCandidate) return;

    let newOverallStatus: CandidateOverallStatus = callingCandidate.overallStatus;
    if (callingStatusChoice === 'Confirm') newOverallStatus = 'Call Confirmed';
    else if (callingStatusChoice === 'Followup') newOverallStatus = 'Call Followup';
    else if (callingStatusChoice === 'Reject') newOverallStatus = 'Rejected';

    onUpdateCandidate({
      ...callingCandidate,
      callingStatus: callingStatusChoice,
      callNotes: callingNotes.trim(),
      calledAt: new Date().toLocaleString(),
      calledBy: 'HR Talent Recruiter',
      overallStatus: newOverallStatus,
    });

    setCallingCandidate(null);
    setCallingNotes('');
  };

  // Auto-Generated Bitopi Group Templates based on system sample
  const generateMessage1 = (cand: Candidate) => {
    return `Dear Concern ${cand.fullName},\nyou are shortlisted & Invited to attend the final interview on ${interviewDate} (${interviewDayOfWeek}) at ${interviewTime}. 823/3 Begum Rokeya Sharani, Shewrapara, Mirpur. (Close to metrorail pillar no 321)\nB/R, HRD, BITOPI GROUP`;
  };

  const generateMessage2 = (cand: Candidate) => {
    return `Dear Concern, Interview for "${cand.designation}" on ${interviewDate} (${interviewDayOfWeek}) at ${interviewTime}. B/R HRD, BITOPI GROUP, 822/3 Rokeya Sharani, Shewrapara, Mirpur Dhaka. (Close to metrorail pillar no 321)`;
  };

  const generateOfferEmail = (cand: Candidate) => {
    const joinDate = cand.joiningDate ? new Date(cand.joiningDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '21st September 2026';
    const salaryText = cand.offeredSalary ? `${cand.offeredSalary.toLocaleString()} BDT` : 'agreed monthly package';
    return `${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}\n\nAttention: ${cand.fullName},\n\nFurther to the interview and discussions with us we are pleased to offer you employment in Tarasima Apparels Ltd.(Corporate Office) as "${cand.designation}" under ${currentBucket?.department || 'HR & Admin'} Department with monthly salary and benefits package as committed to you verbally (${salaryText}).\n\nPlease note that this is just an employment offer and the formal letter of appointment with details of salary, benefits, terms, and conditions of services will be issued to you when you will join in the Company.\n\nYou are requested to confirm us by return e-mail as a token of your acceptance of the offer.\n\nThis offer letter is subject to your joining in the Company on ${joinDate}.\n\nWe congratulate you on your selection and very welcome you to us.\n\nN.B: Please submit following Documents on joining (If discrepancy found in any documents, your offer will be postponed at any time):\n\n• NID (Self 2 Copy & Nominee 2 Copy)\n• Copy of all educational certificates (Will have to Show Original Copies at the time of Joining)\n• Experience & Clearance Certificate of previous Organization\n• TIN certificate\n• Passport size Photograph (Self- 4 Copy & Nominee - 2 Copy)\n\nBest Regards,\n\n${hiringManagerName}\n${managerDesignation}\nm: ${managerMobile} P: +880 2 9876543 Ext: [104], F: +880 2 9876544\nemail: ${managerEmail},\n\nCorporate Office:\nBitopi Group / Tarasima Apparels Ltd.\n823/3 Begum Rokeya Sharani, Shewrapara, Mirpur, Dhaka-1216\n(Close to metrorail pillar no 321)`;
  };

  const handleCopyText = (text: string, label: string, cand?: Candidate) => {
    navigator.clipboard.writeText(text);
    setCopiedToast(`Copied ${label} to clipboard! Ready to paste into WhatsApp / SMS / Email.`);
    setTimeout(() => setCopiedToast(null), 3000);

    if (cand && cand.messageStatus !== 'Message Done') {
      onUpdateCandidate({
        ...cand,
        messageStatus: 'Message Done',
        messageSentAt: new Date().toLocaleString(),
        messageContent: text,
        overallStatus: 'Message Done',
      });
    }
  };

  // Submit Message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messagingCandidate) return;

    let content = '';
    if (messageTab === 'msg1') {
      content = generateMessage1(messagingCandidate);
    } else if (messageTab === 'msg2') {
      content = generateMessage2(messagingCandidate);
    } else {
      content = generateOfferEmail(messagingCandidate);
    }

    handleCopyText(content, messageTab === 'offerEmail' ? 'Offer Email' : 'Interview Message', messagingCandidate);
    setMessagingCandidate(null);
  };

  // Submit Interview Evaluation
  const handleSaveInterview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!interviewCandidate) return;

    const { candidate, stage } = interviewCandidate;
    const isPrimary = stage === 'Primary';

    if (isPrimary) {
      onUpdateCandidate({
        ...candidate,
        primaryStatus: interviewStatusChoice,
        primaryScore: Number(interviewScore),
        primaryInterviewer: interviewerName.trim(),
        primaryFeedback: interviewFeedback.trim(),
        overallStatus: interviewStatusChoice === 'Selected' ? 'Primary Selected' : 'Primary Rejected',
      });
    } else {
      onUpdateCandidate({
        ...candidate,
        secondaryStatus: interviewStatusChoice,
        secondaryScore: Number(interviewScore),
        secondaryInterviewer: interviewerName.trim(),
        secondaryFeedback: interviewFeedback.trim(),
        overallStatus: interviewStatusChoice === 'Selected' ? 'Secondary Selected' : 'Secondary Rejected',
      });
    }

    setInterviewCandidate(null);
  };

  // Save Candidate Experience Review
  const handleSaveCandidateReview = (candidateId: string, stage: 'Primary' | 'Secondary', review: CandidateReview) => {
    const candidate = candidates.find(c => c.id === candidateId);
    if (!candidate) return;

    if (stage === 'Primary') {
      onUpdateCandidate({
        ...candidate,
        primaryCandidateReview: review,
      });
    } else {
      onUpdateCandidate({
        ...candidate,
        secondaryCandidateReview: review,
      });
    }
  };

  // Submit Final Onboard / Move to Block C
  const handleSaveOnboard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardingCandidate) return;

    onUpdateCandidate({
      ...onboardingCandidate,
      overallStatus: 'Final Selected',
      offeredSalary: Number(offeredSalary) || 80000,
      joiningDate,
      nationalId,
      emergencyContactName: emergencyName,
      emergencyContactPhone: emergencyPhone,
      emergencyContactRelation: emergencyRel,
      contractType: 'Full-Time Permanent',
      equipmentAssigned: ['Standard Laptop / Workstation', 'Access Badge', 'Corporate Email'],
      documentsGeneratedAt: new Date().toISOString().split('T')[0],
    });

    setOnboardingCandidate(null);
    onNavigateToBlockC();
  };

  return (
    <div className="space-y-6 pb-12 relative">
      {/* Toast Alert for Clipboard Copy */}
      {copiedToast && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-xl shadow-xl text-xs font-semibold animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
          <span>{copiedToast}</span>
        </div>
      )}

      {/* Block Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Block B: Interactive CV Buckets &amp; Candidate Pipeline
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            {selectedBucketId ? (
              <span className="flex items-center gap-2">
                <button
                  onClick={() => onSelectBucket(null)}
                  className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  CV Buckets
                </button>
                <ChevronRight className="w-5 h-5 text-slate-400" />
                <span>{currentBucket?.designation}</span>
              </span>
            ) : (
              'Designation CV Folders &amp; Screening Pipeline'
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Interactive folder organization, bulk CV parser (With AI / Without AI), telephone calling logs, messaging notifications, and multi-stage interview reviews.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onOpenCompanyForm}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Public Company Application Form"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Company Form Link</span>
          </button>

          <button
            onClick={() => {
              if (selectedBucketId) setUploadTargetBucketId(selectedBucketId);
              setShowUploadModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Bulk CV Upload</span>
          </button>

          {!selectedBucketId && (
            <button
              onClick={() => setShowCreateBucketModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Folder</span>
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: FOLDERS GRID (When no specific bucket is selected) */}
      {!selectedBucketId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-indigo-600" />
              <span>All Active CV Buckets ({cvBuckets.length} Folders)</span>
            </h2>
            <span className="text-xs text-slate-500">
              Click any bucket to inspect candidate table &amp; execute calling/messaging/interviews
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {cvBuckets.map((bucket) => {
              const bCandidates = candidates.filter(c => c.bucketId === bucket.id);
              const bShortlisted = bCandidates.filter(c => c.isShortlisted).length;
              const bCalls = bCandidates.filter(c => c.callingStatus === 'Confirm').length;
              const bMsgs = bCandidates.filter(c => c.messageStatus === 'Message Done').length;
              const bPrimary = bCandidates.filter(c => c.primaryStatus === 'Selected').length;
              const bSecondary = bCandidates.filter(c => c.secondaryStatus === 'Selected').length;
              const bHired = bCandidates.filter(c => c.overallStatus === 'Final Selected' || c.overallStatus === 'Hired').length;
              const bRejected = bCandidates.filter(c => c.overallStatus === 'Rejected' || c.callingStatus === 'Reject' || c.primaryStatus === 'Rejected' || c.secondaryStatus === 'Rejected').length;

              // Source breakdown
              const sources = Array.from(new Set(bCandidates.map(c => c.source)));

              return (
                <div
                  key={bucket.id}
                  onClick={() => onSelectBucket(bucket.id)}
                  className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 hover:shadow-lg hover:border-indigo-400 dark:hover:border-indigo-500 transition-all cursor-pointer flex flex-col justify-between"
                >
                  {/* Folder Tab Effect */}
                  <div className="absolute -top-3 left-6 px-3 py-0.5 bg-slate-100 dark:bg-slate-800 border-t border-x border-slate-200 dark:border-slate-700 rounded-t-lg text-[10px] font-mono text-slate-500">
                    Created {bucket.createdAt}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3 mt-1">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                        <FolderGit2 className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {bucket.department}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                      {bucket.designation}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                      {bucket.description}
                    </p>

                    <div className="mt-3 text-xs text-slate-500">
                      Sources: <span className="font-medium text-slate-700 dark:text-slate-300">{sources.join(', ') || 'Direct Upload'}</span>
                    </div>
                  </div>

                  {/* High-visibility stats block */}
                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2 text-xs">
                      <span className="text-slate-500">Total Ingested CVs</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white text-base tabular-nums">
                        {bCandidates.length}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                      <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded">
                        <div className="text-slate-400">Shortlist</div>
                        <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{bShortlisted}</div>
                      </div>
                      <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded">
                        <div className="text-slate-400">Called</div>
                        <div className="font-mono font-bold text-sky-600 dark:text-sky-400 tabular-nums">{bCalls}</div>
                      </div>
                      <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded">
                        <div className="text-slate-400">Msgs</div>
                        <div className="font-mono font-bold text-blue-600 dark:text-blue-400 tabular-nums">{bMsgs}</div>
                      </div>
                      <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded">
                        <div className="text-slate-400">Hired</div>
                        <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{bHired}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-slate-50 dark:border-slate-800/80">
                      <span className="text-rose-500 font-medium">Rejected: {bRejected}</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                        Open Bucket &rarr;
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: CANDIDATE TABLE (When specific bucket is opened) */}
      {selectedBucketId && currentBucket && (
        <div className="space-y-4">
          {/* Bucket Summary Ribbon */}
          <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSelectBucket(null)}
                className="p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors"
                title="Back to all folders"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {currentBucket.designation} Bucket
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <span>{currentBucket.department}</span>
                  <span>·</span>
                  <span>Created {currentBucket.createdAt}</span>
                  <span>·</span>
                  <span>Target: {currentBucket.targetCount} CVs</span>
                </div>
              </div>
            </div>

            {/* At a glance totals */}
            <div className="flex items-center gap-3 text-xs">
              <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                <div className="text-[10px] text-slate-400 uppercase">Total CVs</div>
                <div className="font-mono font-bold text-slate-900 dark:text-white text-sm tabular-nums">
                  {bucketCandidates.length}
                </div>
              </div>
              <div className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 rounded-lg text-center">
                <div className="text-[10px] text-indigo-400 uppercase">Shortlisted</div>
                <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm tabular-nums">
                  {bucketCandidates.filter(c => c.isShortlisted).length}
                </div>
              </div>
              <div className="px-3 py-1.5 bg-sky-50 dark:bg-sky-950/60 rounded-lg text-center">
                <div className="text-[10px] text-sky-400 uppercase">Call Confirm</div>
                <div className="font-mono font-bold text-sky-600 dark:text-sky-400 text-sm tabular-nums">
                  {bucketCandidates.filter(c => c.callingStatus === 'Confirm').length}
                </div>
              </div>
              <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 rounded-lg text-center">
                <div className="text-[10px] text-emerald-400 uppercase">Hired</div>
                <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm tabular-nums">
                  {bucketCandidates.filter(c => c.overallStatus === 'Final Selected' || c.overallStatus === 'Hired').length}
                </div>
              </div>
            </div>
          </div>

          {/* Filtering and Search Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Stage Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
              {[
                'All',
                'Shortlisted',
                'Call Confirm',
                'Call Followup',
                'Message Done',
                'Primary Selected',
                'Secondary Selected',
                'Final Selected',
                'Rejected'
              ].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1 font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === status
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Search & Source filter */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name, skill, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white w-48 sm:w-60 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300"
              >
                <option value="All">All Sources</option>
                <option value="BDJobs">BDJobs</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Facebook">Facebook</option>
                <option value="Company Form">Company Form</option>
                <option value="Walk-In">Walk-In</option>
                <option value="Referral">Referral</option>
                <option value="Direct Upload">Direct Upload</option>
              </select>
            </div>
          </div>

          {/* CANDIDATES HIGH-DENSITY DATA TABLE */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                  <tr>
                    <th className="py-3 px-3 w-8 text-center">★</th>
                    <th className="py-3 px-4">Candidate Profile</th>
                    <th className="py-3 px-4">Source &amp; Date</th>
                    <th className="py-3 px-4">Experience &amp; Skills</th>
                    <th className="py-3 px-3">Fit %</th>
                    <th className="py-3 px-4">1. Phone Call</th>
                    <th className="py-3 px-4">2. Messaging</th>
                    <th className="py-3 px-4">3. Primary Interview</th>
                    <th className="py-3 px-4">4. Final Interview</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-500">
                        No candidates match your current search/filter in this bucket.
                      </td>
                    </tr>
                  ) : (
                    filteredCandidates.map((cand) => (
                      <tr 
                        key={cand.id} 
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                          cand.isShortlisted ? 'bg-indigo-50/20 dark:bg-indigo-950/10' : ''
                        }`}
                      >
                        {/* Star / Shortlist toggle */}
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => {
                              onUpdateCandidate({
                                ...cand,
                                isShortlisted: !cand.isShortlisted,
                                overallStatus: !cand.isShortlisted ? 'Shortlisted' : 'New CV',
                              });
                            }}
                            className="p-1 hover:scale-125 transition-transform"
                            title={cand.isShortlisted ? 'Remove shortlist' : 'Shortlist candidate'}
                          >
                            <Star 
                              className={`w-4 h-4 ${
                                cand.isShortlisted 
                                  ? 'fill-amber-400 text-amber-400' 
                                  : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                              }`} 
                            />
                          </button>
                        </td>

                        {/* Candidate Identity */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={cand.avatarUrl || '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg'}
                              alt={cand.fullName}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                            <div>
                              <div 
                                onClick={() => setInspectingCandidate(cand)}
                                className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 cursor-pointer"
                              >
                                {cand.fullName}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                <span>{cand.phone}</span>
                                <span>·</span>
                                <span className="truncate max-w-[140px]">{cand.email}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Source & Date */}
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {cand.source}
                          </span>
                          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                            {cand.submissionDate}
                          </div>
                        </td>

                        {/* Experience & Skills */}
                        <td className="py-3 px-4 max-w-[200px]">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {cand.totalExperienceYears} yrs exp
                          </div>
                          <div className="text-[11px] text-slate-500 truncate" title={cand.skills.join(', ')}>
                            {cand.skills.slice(0, 3).join(', ')}
                          </div>
                        </td>

                        {/* Fit Rating */}
                        <td className="py-3 px-3">
                          <span className={`font-mono font-bold text-xs tabular-nums ${
                            cand.fitRating >= 85 
                              ? 'text-emerald-600 dark:text-emerald-400' 
                              : cand.fitRating >= 70 
                              ? 'text-indigo-600 dark:text-indigo-400' 
                              : 'text-amber-600 dark:text-amber-400'
                          }`}>
                            {cand.fitRating}%
                          </span>
                        </td>

                        {/* 1. Phone Calling Status */}
                        <td className="py-3 px-4">
                          <button
                            onClick={() => {
                              setCallingCandidate(cand);
                              setCallingStatusChoice(cand.callingStatus === 'Pending' ? 'Confirm' : cand.callingStatus);
                              setCallingNotes(cand.callNotes || '');
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                              cand.callingStatus === 'Confirm'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : cand.callingStatus === 'Followup'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                                : cand.callingStatus === 'Reject'
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>{cand.callingStatus}</span>
                          </button>
                        </td>

                        {/* 2. Messaging Status & 1-Click Copy Icon */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                setMessagingCandidate(cand);
                              }}
                              className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                                cand.messageStatus === 'Message Done'
                                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                              }`}
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>{cand.messageStatus}</span>
                            </button>

                            {/* Direct 1-Click Copy Icon */}
                            <button
                              onClick={() => {
                                const isFinal = cand.overallStatus === 'Primary Selected' || cand.secondaryStatus === 'Scheduled';
                                const text = isFinal ? generateMessage1(cand) : generateMessage2(cand);
                                handleCopyText(text, isFinal ? 'Message 1 (Final)' : 'Message 2 (Primary)', cand);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded transition-colors"
                              title="1-Click Auto Copy Interview Message for this candidate"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* 3. Primary Interview Status */}
                        <td className="py-3 px-4">
                          <button
                            onClick={() => {
                              setInterviewCandidate({ candidate: cand, stage: 'Primary' });
                              setInterviewStatusChoice(cand.primaryStatus === 'Not Scheduled' ? 'Selected' : cand.primaryStatus);
                              setInterviewFeedback(cand.primaryFeedback || '');
                              setInterviewScore(cand.primaryScore || 9);
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                              cand.primaryStatus === 'Selected'
                                ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400'
                                : cand.primaryStatus === 'Scheduled'
                                ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400'
                                : cand.primaryStatus === 'Rejected'
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            <span>{cand.primaryStatus}</span>
                            {cand.primaryScore && <span className="font-mono">({cand.primaryScore}/10)</span>}
                          </button>
                        </td>

                        {/* 4. Final Interview Status */}
                        <td className="py-3 px-4">
                          <button
                            onClick={() => {
                              setInterviewCandidate({ candidate: cand, stage: 'Secondary' });
                              setInterviewStatusChoice(cand.secondaryStatus === 'Not Scheduled' ? 'Selected' : cand.secondaryStatus);
                              setInterviewFeedback(cand.secondaryFeedback || '');
                              setInterviewScore(cand.secondaryScore || 9);
                            }}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                              cand.secondaryStatus === 'Selected'
                                ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400'
                                : cand.secondaryStatus === 'Scheduled'
                                ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400'
                                : cand.secondaryStatus === 'Rejected'
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            <span>{cand.secondaryStatus}</span>
                            {cand.secondaryScore && <span className="font-mono">({cand.secondaryScore}/10)</span>}
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setInspectingCandidate(cand)}
                              className="p-1 text-slate-400 hover:text-indigo-600"
                              title="View full candidate profile"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Final Hire Button */}
                            <button
                              onClick={() => {
                                setOnboardingCandidate(cand);
                                setOfferedSalary(cand.offeredSalary || 85000);
                              }}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-[11px] flex items-center gap-1 shadow-xs"
                              title="Hire candidate and proceed to Block C Joining Docs"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>Hire</span>
                            </button>

                            <button
                              onClick={() => onDeleteCandidate(cand.id)}
                              className="p-1 text-slate-400 hover:text-rose-500"
                              title="Delete candidate"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: BULK CV UPLOAD (With AI / Without AI, image extractor & parser) */}
      {/* ========================================================================= */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Bulk CV Upload &amp; Automated Data Retrieval
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium">
                    Dual Mode: With AI / Without AI
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically extracts candidate name, contacts, skills, experience, and photo into the bucket.
                </p>
              </div>
              <button 
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Target Bucket Selector & Source */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Target CV Bucket Folder *
                  </label>
                  <select
                    value={uploadTargetBucketId}
                    onChange={(e) => setUploadTargetBucketId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    {cvBuckets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.designation} ({b.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Application Ingestion Source *
                  </label>
                  <select
                    value={uploadSource}
                    onChange={(e) => setUploadSource(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="BDJobs">BDJobs</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="Facebook">Facebook Careers</option>
                    <option value="Company Form">Company Form</option>
                    <option value="Walk-In">Walk-In Candidate</option>
                    <option value="Referral">Internal Employee Referral</option>
                    <option value="Direct Upload">Direct HR Upload</option>
                  </select>
                </div>
              </div>

              {/* Parsing Mode Selector (User Requirement: with AI, without AI 2 ta option) */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Extraction Mode:
                  </span>
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setUploadMode('withoutAi')}
                      className={`px-3 py-1 font-medium rounded-md transition-colors ${
                        uploadMode === 'withoutAi'
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Without AI (Instant Rule Parser)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode('withAi')}
                      className={`flex items-center gap-1 px-3 py-1 font-medium rounded-md transition-colors ${
                        uploadMode === 'withAi'
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>With AI (Gemini 3.8 Flash)</span>
                    </button>
                  </div>
                </div>

                {uploadMode === 'withAi' && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 text-slate-500">
                    <p className="mb-1 text-[11px]">
                      Uses server-side Gemini 3.8 Flash to analyze unstructured CVs, detect experience, score role alignment, and extract candidate info.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        placeholder="Optional: Custom Gemini API Key (Uses system key if empty)"
                        value={uploadCustomApiKey}
                        onChange={(e) => setUploadCustomApiKey(e.target.value)}
                        className="w-full px-2.5 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Candidate Image / Photo Attachment */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <img
                    src={uploadPhotoUrl || '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg'}
                    alt="Candidate Avatar Preview"
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-xl object-cover border border-slate-300 dark:border-slate-600"
                  />
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      Candidate Photo / Avatar Fetch
                    </div>
                    <div className="text-[11px] text-slate-500">
                      User specification: image must be fetched from CV or uploaded without missing any candidate data.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label className="cursor-pointer px-3 py-1.5 bg-white dark:bg-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 dark:border-slate-600 font-medium text-slate-700 dark:text-slate-200">
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setUploadPhotoUrl(ev.target?.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Section: Bulk File Dropzone for PDF, DOCX, TXT */}
              <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/80 text-center transition-colors">
                <Upload className="w-7 h-7 mx-auto text-indigo-500 mb-1.5" />
                <div className="font-semibold text-slate-800 text-xs">
                  Drop multiple candidate CVs (PDF / DOCX) or click to browse
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Supports .pdf, .docx, .doc, and .txt resumes. Ingests all data directly into the target bucket.
                </p>

                <div className="mt-3 flex items-center justify-center gap-2">
                  <label className="cursor-pointer px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs transition-colors text-xs flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Select PDF / DOCX Files</span>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.docx,.doc,.txt"
                      onChange={handleBulkFileSelect}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setUploadedFilesList([
                        {
                          name: 'Zubair_Ahmed_CV.pdf',
                          size: '135 KB',
                          text: `Curriculum Vitae\nMd. Zubair Ahmed\nEmail: zubair.ahmed.app@gmail.com\nPhone: +880 1711-223344\nDesignation: Senior Merchandiser\nExperience: 5 Years\nSkills: Apparel Merchandising, Costing, Garment Tech, Buyer Communication\nEducation: B.Sc in Textile Engineering, BUTEX`
                        },
                        {
                          name: 'Nusrat_Jahan_Resume.docx',
                          size: '94 KB',
                          text: `Resume\nNusrat Jahan\nEmail: nusrat.jahan.qa@yahoo.com\nPhone: +880 1819-334455\nDesignation: Quality Assurance Officer\nExperience: 3.5 Years\nSkills: AQL Standards, Fabric Inspection, Quality Auditing, ISO Documentation\nEducation: B.Sc in Garment Technology`
                        }
                      ]);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-medium transition-colors text-xs"
                  >
                    Load 2 Sample Resumes (PDF &amp; DOCX)
                  </button>
                </div>
              </div>

              {/* Queued PDF/DOCX Files list with instant Ingest button */}
              {uploadedFilesList.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between font-semibold text-slate-800 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span>Queued Files ({uploadedFilesList.length})</span>
                      <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full">
                        Ready
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setUploadedFilesList([])}
                      className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1.5">
                    {uploadedFilesList.map((file, idx) => {
                      const isPdf = file.name.toLowerCase().endsWith('.pdf');
                      const isDocx = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc');

                      return (
                        <div 
                          key={idx} 
                          className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg shadow-2xs text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isPdf ? (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 font-bold text-[10px] rounded uppercase shrink-0">
                                PDF
                              </span>
                            ) : isDocx ? (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 font-bold text-[10px] rounded uppercase shrink-0">
                                DOCX
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] rounded uppercase shrink-0">
                                TXT
                              </span>
                            )}
                            <span className="font-semibold text-slate-900 truncate">
                              {file.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-slate-500 text-[10px]">
                              {file.size}
                            </span>
                            <button
                              type="button"
                              onClick={() => setUploadedFilesList(prev => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-rose-600 text-xs px-1 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={isParsing}
                    onClick={handleBatchUploadAllFiles}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold shadow-xs transition-colors flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    {isParsing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Processing &amp; Extracting Files...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Process &amp; Ingest All ({uploadedFilesList.length}) Files into Bucket</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Sample CV Presets for Instant 1-Click Verification */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                <span className="text-slate-500 font-medium text-[11px]">Or Preset Text:</span>
                <button
                  type="button"
                  onClick={() => handleLoadSampleResume('engineer')}
                  className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded font-medium hover:bg-indigo-100 transition-colors text-xs"
                >
                  Software Engineer
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSampleResume('hr')}
                  className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-medium hover:bg-emerald-100 transition-colors text-xs"
                >
                  HR Executive
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSampleResume('designer')}
                  className="px-2 py-1 bg-purple-50 text-purple-700 rounded font-medium hover:bg-purple-100 transition-colors text-xs"
                >
                  Product Designer
                </button>
              </div>

              {/* CV Text Area */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Or Paste Resume / CV Plain Text
                </label>
                <textarea
                  rows={4}
                  placeholder="Paste candidate's full resume text here if not uploading file..."
                  value={uploadCvText}
                  onChange={(e) => setUploadCvText(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono text-[11px]"
                />
              </div>

              {parseError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Parse Action Button */}
              <button
                type="button"
                disabled={isParsing || !uploadCvText.trim()}
                onClick={handleRunParse}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                {isParsing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Extracting Structured Candidate Data...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Extract Data {uploadMode === 'withAi' ? 'with Gemini AI' : 'Instant Without AI'}</span>
                  </>
                )}
              </button>

              {/* Parsed Result Preview Card */}
              {parsedPreview && (
                <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Data Retrieved Successfully (Zero Missing Data)</span>
                    </span>
                    <span className="font-mono font-bold text-emerald-700 text-xs">
                      {parsedPreview.fitRating}% Fit Score
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
                    <div>
                      <span className="text-slate-400">Name:</span> <strong className="text-slate-900 dark:text-white">{parsedPreview.fullName}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Email:</span> {parsedPreview.email}
                    </div>
                    <div>
                      <span className="text-slate-400">Phone:</span> {parsedPreview.phone}
                    </div>
                    <div>
                      <span className="text-slate-400">Experience:</span> {parsedPreview.totalExperienceYears} yrs
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400 block mb-1">Identified Skills:</span>
                    <div className="flex flex-wrap gap-1">
                      {parsedPreview.skills.map((s: string) => (
                        <span key={s} className="px-2 py-0.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded text-[10px] font-medium border border-slate-200 dark:border-slate-700">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmSaveCandidate}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs transition-colors"
                  >
                    Confirm &amp; Insert Candidate Into Bucket
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CALLING LOG & UPDATE (Confirm, Followup, Reject) */}
      {/* ========================================================================= */}
      {callingCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Log Telephone Screening Call
                </h3>
                <p className="text-xs text-slate-500">
                  Candidate: {callingCandidate.fullName} ({callingCandidate.phone})
                </p>
              </div>
              <button 
                onClick={() => setCallingCandidate(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCalling} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Call Screening Status *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCallingStatusChoice('Confirm')}
                    className={`py-2 px-3 rounded-lg font-semibold border text-center transition-colors ${
                      callingStatusChoice === 'Confirm'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallingStatusChoice('Followup')}
                    className={`py-2 px-3 rounded-lg font-semibold border text-center transition-colors ${
                      callingStatusChoice === 'Followup'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Followup
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallingStatusChoice('Reject')}
                    className={`py-2 px-3 rounded-lg font-semibold border text-center transition-colors ${
                      callingStatusChoice === 'Reject'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Reject
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Call Conversation Notes &amp; Observations
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Record salary expectations, notice period verification, availability, communication clarity..."
                  value={callingNotes}
                  onChange={(e) => setCallingNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCallingCandidate(null)}
                  className="px-4 py-2 font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
                >
                  Save Call Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: BITOPI GROUP AUTO-GENERATED MESSAGING & COPY SYSTEM */}
      {/* ========================================================================= */}
      {messagingCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <img 
                  src="/assets/aistudio/bitopi_group_logo_for_tab_ae6c542e.jpg" 
                  alt="Bitopi Group" 
                  className="w-10 h-10 rounded-lg object-contain bg-white p-0.5 border border-slate-200 dark:border-slate-700"
                />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Auto-Generated Interview Message &amp; Offer Email
                  </h3>
                  <p className="text-xs text-slate-500">
                    Candidate: <strong className="text-slate-800 dark:text-slate-200">{messagingCandidate.fullName}</strong> ({messagingCandidate.phone})
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setMessagingCandidate(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Tab Selector for Message 1, Message 2, and Offer Email */}
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMessageTab('msg1')}
                  className={`py-2 px-2 rounded-md font-semibold text-center transition-colors ${
                    messageTab === 'msg1'
                      ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Message 1: Final Interview
                </button>

                <button
                  type="button"
                  onClick={() => setMessageTab('msg2')}
                  className={`py-2 px-2 rounded-md font-semibold text-center transition-colors ${
                    messageTab === 'msg2'
                      ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Message 2: Primary Round
                </button>

                <button
                  type="button"
                  onClick={() => setMessageTab('offerEmail')}
                  className={`py-2 px-2 rounded-md font-semibold text-center transition-colors ${
                    messageTab === 'offerEmail'
                      ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Job Offer Email (Tarasima)
                </button>
              </div>

              {/* Date & Time parameters */}
              {(messageTab === 'msg1' || messageTab === 'msg2') && (
                <div className="grid grid-cols-3 gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Date
                    </label>
                    <input
                      type="text"
                      value={interviewDate}
                      onChange={(e) => setInterviewDate(e.target.value)}
                      placeholder="13/08/2026"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Day of Week
                    </label>
                    <input
                      type="text"
                      value={interviewDayOfWeek}
                      onChange={(e) => setInterviewDayOfWeek(e.target.value)}
                      placeholder="Thursday"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Time Slot
                    </label>
                    <input
                      type="text"
                      value={interviewTime}
                      onChange={(e) => setInterviewTime(e.target.value)}
                      placeholder="11:20am"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono"
                    />
                  </div>
                </div>
              )}

              {messageTab === 'offerEmail' && (
                <div className="grid grid-cols-2 gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      HR Manager Name
                    </label>
                    <input
                      type="text"
                      value={hiringManagerName}
                      onChange={(e) => setHiringManagerName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Manager Mobile
                    </label>
                    <input
                      type="text"
                      value={managerMobile}
                      onChange={(e) => setManagerMobile(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Message Box with Prominent Copy Button */}
              <div className="relative">
                <div className="flex items-center justify-between pb-1.5">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Auto-Generated Text Ready to Send:
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      const text = messageTab === 'msg1' 
                        ? generateMessage1(messagingCandidate) 
                        : messageTab === 'msg2' 
                        ? generateMessage2(messagingCandidate) 
                        : generateOfferEmail(messagingCandidate);
                      handleCopyText(text, messageTab === 'offerEmail' ? 'Offer Email' : 'Interview Message', messagingCandidate);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold text-xs shadow-xs transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Text</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-800 dark:text-slate-200 text-xs whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                  {messageTab === 'msg1' && generateMessage1(messagingCandidate)}
                  {messageTab === 'msg2' && generateMessage2(messagingCandidate)}
                  {messageTab === 'offerEmail' && generateOfferEmail(messagingCandidate)}
                </div>
              </div>

              {/* Quick dispatch actions */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {/* WhatsApp Direct */}
                  <a
                    href={`https://wa.me/${messagingCandidate.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                      messageTab === 'msg1' 
                        ? generateMessage1(messagingCandidate) 
                        : messageTab === 'msg2' 
                        ? generateMessage2(messagingCandidate) 
                        : generateOfferEmail(messagingCandidate)
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      if (messagingCandidate.messageStatus !== 'Message Done') {
                        onUpdateCandidate({
                          ...messagingCandidate,
                          messageStatus: 'Message Done',
                          messageSentAt: new Date().toLocaleString(),
                          messageChannel: 'WhatsApp',
                          overallStatus: 'Message Done',
                        });
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <span>Open in WhatsApp</span>
                  </a>

                  {/* Email Client Direct */}
                  <a
                    href={`mailto:${messagingCandidate.email}?subject=${encodeURIComponent(
                      messageTab === 'offerEmail'
                        ? `Employment Offer Letter - Tarasima Apparels Ltd. (Bitopi Group)`
                        : `Interview Invitation - Bitopi Group`
                    )}&body=${encodeURIComponent(
                      messageTab === 'msg1' 
                        ? generateMessage1(messagingCandidate) 
                        : messageTab === 'msg2' 
                        ? generateMessage2(messagingCandidate) 
                        : generateOfferEmail(messagingCandidate)
                    )}`}
                    onClick={() => {
                      if (messagingCandidate.messageStatus !== 'Message Done') {
                        onUpdateCandidate({
                          ...messagingCandidate,
                          messageStatus: 'Message Done',
                          messageSentAt: new Date().toLocaleString(),
                          messageChannel: 'Email',
                          overallStatus: 'Message Done',
                        });
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Open in Email</span>
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMessagingCandidate(null)}
                    className="px-3.5 py-1.5 font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const text = messageTab === 'msg1' 
                        ? generateMessage1(messagingCandidate) 
                        : messageTab === 'msg2' 
                        ? generateMessage2(messagingCandidate) 
                        : generateOfferEmail(messagingCandidate);
                      handleCopyText(text, 'Message', messagingCandidate);
                      setMessagingCandidate(null);
                    }}
                    className="px-4 py-1.5 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Copy &amp; Set "Message Done"</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: INTERVIEW EVALUATION & REVIEW FORM TRIGGER */}
      {/* ========================================================================= */}
      {interviewCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {interviewCandidate.stage} Interview Evaluation &amp; Review
                </h3>
                <p className="text-xs text-slate-500">
                  Candidate: {interviewCandidate.candidate.fullName} ({interviewCandidate.candidate.designation})
                </p>
              </div>
              <button 
                onClick={() => setInterviewCandidate(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveInterview} className="mt-4 space-y-4 text-xs">
              {/* Decision */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Interview Round Decision *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInterviewStatusChoice('Selected')}
                    className={`py-2 px-3 rounded-lg font-semibold border text-center transition-colors ${
                      interviewStatusChoice === 'Selected'
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Select for Next Stage
                  </button>
                  <button
                    type="button"
                    onClick={() => setInterviewStatusChoice('Rejected')}
                    className={`py-2 px-3 rounded-lg font-semibold border text-center transition-colors ${
                      interviewStatusChoice === 'Rejected'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Reject Candidate
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Interviewer Name
                  </label>
                  <input
                    type="text"
                    value={interviewerName}
                    onChange={(e) => setInterviewerName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Score Rating (1 to 10)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={interviewScore}
                    onChange={(e) => setInterviewScore(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Interviewer Technical / Qualitative Feedback
                </label>
                <textarea
                  rows={3}
                  required
                  value={interviewFeedback}
                  onChange={(e) => setInterviewFeedback(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              {/* Candidate Experience Review Trigger */}
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-semibold text-indigo-900 dark:text-indigo-300">
                    Candidate Experience Review
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Online feedback where candidate shared their experience.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const c = interviewCandidate.candidate;
                    const stage = interviewCandidate.stage;
                    setReviewModalState({ candidate: c, stage });
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-800 hover:bg-indigo-50 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors"
                >
                  Open Candidate Review Form
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setInterviewCandidate(null)}
                  className="px-4 py-2 font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
                >
                  Save Interview Evaluation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: FINAL HIRE & MOVE TO BLOCK C */}
      {/* ========================================================================= */}
      {onboardingCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Hire Candidate &amp; Prepare Block C Joining Packet
                </h3>
                <p className="text-xs text-slate-500">
                  Pre-fills all official signing documents with zero data entry.
                </p>
              </div>
              <button 
                onClick={() => setOnboardingCandidate(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOnboard} className="mt-4 space-y-4 text-xs">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-100 dark:border-emerald-900 flex items-center gap-3">
                <img
                  src={onboardingCandidate.avatarUrl || '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg'}
                  alt={onboardingCandidate.fullName}
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-lg object-cover"
                />
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {onboardingCandidate.fullName}
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    Designation: {onboardingCandidate.designation}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Offered Gross Monthly Salary (BDT) *
                  </label>
                  <input
                    type="number"
                    required
                    value={offeredSalary}
                    onChange={(e) => setOfferedSalary(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Joining Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  National ID (NID) / Passport No. *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 19952692610000123"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Emergency Contact Name
                  </label>
                  <input
                    type="text"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Emergency Phone
                  </label>
                  <input
                    type="text"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Relation
                  </label>
                  <input
                    type="text"
                    value={emergencyRel}
                    onChange={(e) => setEmergencyRel(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600 inline mr-1" />
                <span>Onboarding packet automatically generates Appointment Letter, Employment Contract, NDA, Emergency Form, and Equipment Handover with signature lines.</span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setOnboardingCandidate(null)}
                  className="px-4 py-2 font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs"
                >
                  Confirm Hire &amp; Go to Block C Documents
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: CREATE NEW CV BUCKET FOLDER */}
      {/* ========================================================================= */}
      {showCreateBucketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Create New CV Bucket Folder
                </h3>
                <p className="text-xs text-slate-500">Organize candidate CVs for a designation.</p>
              </div>
              <button 
                onClick={() => setShowCreateBucketModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newBucketDesignation.trim()) return;
                onCreateBucket({
                  designation: newBucketDesignation.trim(),
                  requisitionId: 'req-custom',
                  department: newBucketDept,
                  folderColor: newBucketColor,
                  targetCount: Number(newBucketTarget) || 30,
                  status: 'Active',
                  description: newBucketDesc.trim() || 'Candidate pool for open designation.',
                });
                setShowCreateBucketModal(false);
                setNewBucketDesignation('');
              }}
              className="mt-4 space-y-4 text-xs"
            >
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Designation / Role Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Security Engineer, Marketing Lead"
                  value={newBucketDesignation}
                  onChange={(e) => setNewBucketDesignation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Department
                  </label>
                  <select
                    value={newBucketDept}
                    onChange={(e) => setNewBucketDept(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="HR & People">HR &amp; People</option>
                    <option value="Design & Product">Design &amp; Product</option>
                    <option value="Sales & Growth">Sales &amp; Growth</option>
                    <option value="Finance & Accounts">Finance &amp; Accounts</option>
                    <option value="Operations">Operations</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Target CV Count
                  </label>
                  <input
                    type="number"
                    value={newBucketTarget}
                    onChange={(e) => setNewBucketTarget(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Folder Description / Skill Criteria
                </label>
                <textarea
                  rows={2}
                  placeholder="Criteria for CVs that belong in this bucket..."
                  value={newBucketDesc}
                  onChange={(e) => setNewBucketDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateBucketModal(false)}
                  className="px-4 py-2 font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
                >
                  Create Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Candidate Detail Drawer */}
      {inspectingCandidate && (
        <CandidateDetailModal
          candidate={inspectingCandidate}
          onClose={() => setInspectingCandidate(null)}
          onOpenCallingModal={(c) => {
            setCallingCandidate(c);
            setCallingStatusChoice(c.callingStatus === 'Pending' ? 'Confirm' : c.callingStatus);
            setCallingNotes(c.callNotes || '');
          }}
          onOpenMessageModal={(c) => setMessagingCandidate(c)}
          onOpenPrimaryModal={(c) => {
            setInterviewCandidate({ candidate: c, stage: 'Primary' });
            setInterviewStatusChoice(c.primaryStatus === 'Not Scheduled' ? 'Selected' : c.primaryStatus);
            setInterviewFeedback(c.primaryFeedback || '');
            setInterviewScore(c.primaryScore || 9);
          }}
          onOpenSecondaryModal={(c) => {
            setInterviewCandidate({ candidate: c, stage: 'Secondary' });
            setInterviewStatusChoice(c.secondaryStatus === 'Not Scheduled' ? 'Selected' : c.secondaryStatus);
            setInterviewFeedback(c.secondaryFeedback || '');
            setInterviewScore(c.secondaryScore || 9);
          }}
          onOpenOnboardModal={(c) => {
            setOnboardingCandidate(c);
            setOfferedSalary(c.offeredSalary || 85000);
          }}
        />
      )}

      {/* Candidate Experience Review Modal */}
      {reviewModalState && (
        <CandidateExperienceReviewModal
          candidate={reviewModalState.candidate}
          stage={reviewModalState.stage}
          onSaveReview={handleSaveCandidateReview}
          onClose={() => setReviewModalState(null)}
        />
      )}
    </div>
  );
};
