import React, { useState } from 'react';
import { 
  Layers, 
  FolderGit2, 
  UserCheck, 
  XCircle, 
  Calendar, 
  Clock, 
  PhoneCall, 
  MessageSquare, 
  Copy, 
  Check, 
  Search, 
  Printer, 
  ExternalLink, 
  Sparkles, 
  ArrowRight,
  TrendingUp,
  FileText,
  Building,
  CheckCircle2,
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { Requisition, JobPosting, CvBucket, Candidate } from '../types';
import { JoiningDocumentsModal } from './JoiningDocumentsModal';
import { CandidateDetailModal } from './CandidateDetailModal';

interface DashboardOverviewProps {
  requisitions: Requisition[];
  jobPostings: JobPosting[];
  cvBuckets: CvBucket[];
  candidates: Candidate[];
  onSelectBucket: (bucketId: string) => void;
  onNavigateTab: (tab: 'dashboard' | 'blockB') => void;
  onOpenCompanyForm: () => void;
  onBulkUpload: (bucketId?: string) => void;
  onUpdateCandidate: (candidate: Candidate) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  requisitions,
  jobPostings,
  cvBuckets,
  candidates,
  onSelectBucket,
  onNavigateTab,
  onOpenCompanyForm,
  onBulkUpload,
  onUpdateCandidate,
}) => {
  // Sub-tab selection inside Overview for instant answers
  const [activeView, setActiveView] = useState<'all' | 'interviews' | 'hired' | 'listed' | 'rejected'>('interviews');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  // Modal inspection & print
  const [inspectingCandidate, setInspectingCandidate] = useState<Candidate | null>(null);
  const [candidateForDocs, setCandidateForDocs] = useState<Candidate | null>(null);

  // Categorize candidates for the 4 core questions
  // 1. Kader Interview Kobe (Upcoming Scheduled Interviews)
  const scheduledInterviews = candidates.filter(
    c => c.primaryStatus === 'Scheduled' || c.secondaryStatus === 'Scheduled' || c.overallStatus === 'Primary Interview' || c.overallStatus === 'Secondary Interview'
  );

  // 2. Kara Hired (Final selected / hired personnel)
  const hiredCandidates = candidates.filter(
    c => c.overallStatus === 'Final Selected' || c.overallStatus === 'Hired' || c.secondaryStatus === 'Selected'
  );

  // 3. Kader CV List Kora Hoiyeche (All active candidates in queue/shortlist)
  const listedCandidates = candidates.filter(
    c => c.overallStatus !== 'Rejected' && c.callingStatus !== 'Reject' && c.primaryStatus !== 'Rejected' && c.secondaryStatus !== 'Rejected'
  );

  // 4. Kara Rejected (Candidates rejected in calling, primary or secondary)
  const rejectedCandidates = candidates.filter(
    c => c.overallStatus === 'Rejected' || c.callingStatus === 'Reject' || c.primaryStatus === 'Rejected' || c.secondaryStatus === 'Rejected'
  );

  // Quick copy message helper
  const handleCopyMessage = (cand: Candidate, type: 'primary' | 'final' | 'offer') => {
    let text = '';
    if (type === 'final') {
      text = `Dear Concern ${cand.fullName},\nyou are shortlisted & Invited to attend the final interview on 13/08/2026 (Thursday) at 11:20am. 823/3 Begum Rokeya Sharani, Shewrapara, Mirpur. (Close to metrorail pillar no 321)\nB/R, HRD, BITOPI GROUP`;
    } else if (type === 'primary') {
      text = `Dear Concern, Interview for "${cand.designation}" on 07/07/26 (Tue) at 3:00 PM. B/R HRD, BITOPI GROUP, 822/3 Rokeya Sharani, Shewrapara, Mirpur Dhaka. (Close to metrorail pillar no 321)`;
    } else {
      text = `Further to the interview and discussions with us we are pleased to offer you employment in Tarasima Apparels Ltd. (Corporate Office - Bitopi Group) as "${cand.designation}". Corporate Office: 823/3 Begum Rokeya Sharani, Shewrapara, Mirpur.`;
    }

    navigator.clipboard.writeText(text);
    setCopiedToast(`Copied ${type === 'final' ? 'Final Interview' : 'Primary Interview'} message for ${cand.fullName}!`);
    setTimeout(() => setCopiedToast(null), 2500);

    if (cand.messageStatus !== 'Message Done') {
      onUpdateCandidate({
        ...cand,
        messageStatus: 'Message Done',
        messageSentAt: new Date().toLocaleString(),
        overallStatus: 'Message Done',
      });
    }
  };

  // Filter based on search query
  const filterList = (list: Candidate[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(c => 
      c.fullName.toLowerCase().includes(q) ||
      c.designation.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.skills.some(s => s.toLowerCase().includes(q))
    );
  };

  return (
    <div className="space-y-6 pb-12 bg-white min-h-screen text-slate-900">
      {/* Toast Alert for Clipboard Copy */}
      {copiedToast && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl shadow-2xl text-xs font-semibold animate-bounce border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{copiedToast}</span>
        </div>
      )}

      {/* Top Welcome & Command Center Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white border border-slate-200 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full">
              Bitopi Group HR Command Center
            </span>
            <span className="text-xs text-slate-500 font-mono">
              Live Pipeline Overview
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 mt-1">
            Recruitment &amp; Onboarding Overview
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 max-w-2xl">
            At-a-glance visibility: Track who is hired, who is rejected, whose CVs are listed, and when interviews are scheduled.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => onBulkUpload()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Bulk PDF/DOCX Ingest</span>
          </button>

          <button
            onClick={onOpenCompanyForm}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Public Application Form</span>
          </button>
        </div>
      </div>

      {/* The 4 Core Overview Decision Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Kader Interview Kobe */}
        <div 
          onClick={() => setActiveView('interviews')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeView === 'interviews'
              ? 'bg-sky-50/70 border-sky-400 shadow-sm ring-1 ring-sky-400'
              : 'bg-white border-slate-200 hover:border-sky-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-800">
              Kader Interview Kobe
            </span>
            <div className="p-2 bg-sky-100 text-sky-700 rounded-lg">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tabular-nums text-slate-900">
              {scheduledInterviews.length}
            </span>
            <span className="text-xs text-slate-500">Upcoming Sessions</span>
          </div>
          <p className="mt-1 text-[11px] text-sky-700 font-medium">
            View scheduled dates, times &amp; 1-click copy messages &rarr;
          </p>
        </div>

        {/* Card 2: Kara Hired */}
        <div 
          onClick={() => setActiveView('hired')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeView === 'hired'
              ? 'bg-emerald-50/70 border-emerald-400 shadow-sm ring-1 ring-emerald-400'
              : 'bg-white border-slate-200 hover:border-emerald-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Kara Hired (Selected)
            </span>
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tabular-nums text-emerald-700">
              {hiredCandidates.length}
            </span>
            <span className="text-xs text-slate-500">Employees Onboarded</span>
          </div>
          <p className="mt-1 text-[11px] text-emerald-700 font-medium">
            Print joining day documents with zero data entry &rarr;
          </p>
        </div>

        {/* Card 3: Kader CV List Kora Hoiyeche */}
        <div 
          onClick={() => setActiveView('listed')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeView === 'listed'
              ? 'bg-indigo-50/70 border-indigo-400 shadow-sm ring-1 ring-indigo-400'
              : 'bg-white border-slate-200 hover:border-indigo-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-800">
              Kader CV List Kora
            </span>
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tabular-nums text-indigo-700">
              {listedCandidates.length}
            </span>
            <span className="text-xs text-slate-500">Active CVs in Queue</span>
          </div>
          <p className="mt-1 text-[11px] text-indigo-700 font-medium">
            Search talent, review skills &amp; trigger calling &rarr;
          </p>
        </div>

        {/* Card 4: Kara Rejected */}
        <div 
          onClick={() => setActiveView('rejected')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeView === 'rejected'
              ? 'bg-rose-50/70 border-rose-400 shadow-sm ring-1 ring-rose-400'
              : 'bg-white border-slate-200 hover:border-rose-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
              Kara Rejected
            </span>
            <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono tabular-nums text-rose-700">
              {rejectedCandidates.length}
            </span>
            <span className="text-xs text-slate-500">Screening Disqualified</span>
          </div>
          <p className="mt-1 text-[11px] text-rose-700 font-medium">
            Inspect feedback notes &amp; screening rejection reasons &rarr;
          </p>
        </div>
      </div>

      {/* Main Content Area for the Selected Question */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Navigation bar between the 4 perspectives */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <button
              onClick={() => setActiveView('interviews')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeView === 'interviews'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              1. Upcoming Interviews ({scheduledInterviews.length})
            </button>

            <button
              onClick={() => setActiveView('hired')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeView === 'hired'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              2. Who is Hired ({hiredCandidates.length})
            </button>

            <button
              onClick={() => setActiveView('listed')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeView === 'listed'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              3. Listed CVs ({listedCandidates.length})
            </button>

            <button
              onClick={() => setActiveView('rejected')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeView === 'rejected'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              4. Who is Rejected ({rejectedCandidates.length})
            </button>
          </div>

          {/* Quick Search inside this view */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by name, phone, designation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 w-56 sm:w-64 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* VIEW 1: KADER INTERVIEW KOBE (SCHEDULED INTERVIEWS SCHEDULE) */}
        {/* ------------------------------------------------------------- */}
        {activeView === 'interviews' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-800">
                Candidates with upcoming interview appointments at Bitopi Group
              </span>
              <span>Location: 823/3 Begum Rokeya Sharani, Shewrapara, Mirpur (Near Pillar 321)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Candidate Name</th>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4">Interview Round</th>
                    <th className="py-3 px-4">Scheduled Date &amp; Time</th>
                    <th className="py-3 px-4">Interviewer / Panel</th>
                    <th className="py-3 px-4 text-right">Auto Copy Message &amp; Dispatch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filterList(scheduledInterviews).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        No upcoming interviews currently scheduled. Go to CV Buckets to schedule interviews.
                      </td>
                    </tr>
                  ) : (
                    filterList(scheduledInterviews).map((cand) => {
                      const isFinal = cand.secondaryStatus === 'Scheduled' || cand.overallStatus === 'Secondary Interview';
                      const interviewDateText = isFinal 
                        ? (cand.secondaryDate ? `${cand.secondaryDate} (${cand.secondaryTime || '11:20am'})` : '13/08/2026 (Thursday) at 11:20am')
                        : (cand.primaryDate ? `${cand.primaryDate} (${cand.primaryTime || '3:00 PM'})` : '07/07/2026 (Tue) at 3:00 PM');
                      const interviewer = isFinal ? (cand.secondaryInterviewer || 'CTO & MD Panel') : (cand.primaryInterviewer || 'Tariq Rahman');

                      return (
                        <tr key={cand.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 text-sm">
                              {cand.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {cand.phone} · {cand.email}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-semibold text-slate-800">
                            {cand.designation}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold ${
                              isFinal ? 'bg-purple-100 text-purple-800' : 'bg-sky-100 text-sky-800'
                            }`}>
                              {isFinal ? 'Final Interview' : 'Primary Round'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{interviewDateText}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-slate-700">
                            {interviewer}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleCopyMessage(cand, isFinal ? 'final' : 'primary')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer shadow-xs"
                                title="Click to auto-copy WhatsApp/SMS message to clipboard"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy {isFinal ? 'Message 1' : 'Message 2'}</span>
                              </button>

                              <a
                                href={`https://wa.me/${cand.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                                  isFinal
                                    ? `Dear Concern ${cand.fullName},\nyou are shortlisted & Invited to attend the final interview on 13/08/2026 (Thursday) at 11:20am. 823/3 Begum Rokeya Sharani, Shewrapara, Mirpur. (Close to metrorail pillar no 321)\nB/R, HRD, BITOPI GROUP`
                                    : `Dear Concern, Interview for "${cand.designation}" on 07/07/26 (Tue) at 3:00 PM. B/R HRD, BITOPI GROUP, 822/3 Rokeya Sharani, Shewrapara, Mirpur Dhaka.`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-xs transition-colors cursor-pointer"
                                title="Send via WhatsApp"
                              >
                                WhatsApp
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 2: KARA HIRED (FINAL SELECTED EMPLOYEES) */}
        {/* ------------------------------------------------------------- */}
        {activeView === 'hired' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-800">
                Successfully hired personnel for Tarasima Apparels Ltd. &amp; Bitopi Group
              </span>
              <span>All joining documents pre-filled for 1-click printing</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Employee Name</th>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4">Offered Gross Salary</th>
                    <th className="py-3 px-4">Joining Date</th>
                    <th className="py-3 px-4">National ID (NID)</th>
                    <th className="py-3 px-4">Emergency Contact</th>
                    <th className="py-3 px-4 text-right">Official Joining Packet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filterList(hiredCandidates).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        No hired candidates yet. Select candidates in CV Buckets to mark as Hired.
                      </td>
                    </tr>
                  ) : (
                    filterList(hiredCandidates).map((cand) => (
                      <tr key={cand.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-sm">
                            {cand.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {cand.phone} · {cand.email}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-slate-800">
                          {cand.designation}
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-700 text-sm tabular-nums">
                          {cand.offeredSalary ? `${cand.offeredSalary.toLocaleString()} BDT` : '85,000 BDT'}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-900 font-semibold">
                          {cand.joiningDate || '2026-12-01'}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-600 text-[11px]">
                          {cand.nationalId || '19952692610000123'}
                        </td>

                        <td className="py-3.5 px-4 text-slate-700">
                          {cand.emergencyContactName || 'Family Contact'} ({cand.emergencyContactPhone || cand.phone})
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setCandidateForDocs(cand)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs shadow-xs transition-colors cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Print Joining Docs</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 3: KADER CV LIST KORA HOIYECHE (ALL ACTIVE QUEUED CVS) */}
        {/* ------------------------------------------------------------- */}
        {activeView === 'listed' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-800">
                All listed candidates in active consideration across all CV Buckets
              </span>
              <span>Total Active: {listedCandidates.length} Candidates</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Candidate Profile</th>
                    <th className="py-3 px-4">Applied Designation</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Experience</th>
                    <th className="py-3 px-4">Current Pipeline Stage</th>
                    <th className="py-3 px-4">Calling Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filterList(listedCandidates).map((cand) => (
                    <tr key={cand.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div 
                          onClick={() => setInspectingCandidate(cand)}
                          className="font-bold text-slate-900 hover:text-indigo-600 cursor-pointer text-sm"
                        >
                          {cand.fullName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {cand.phone} · {cand.email}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {cand.designation}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-medium">
                          {cand.source}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                        {cand.totalExperienceYears} yrs
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700">
                          {cand.overallStatus}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-medium">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          cand.callingStatus === 'Confirm' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : cand.callingStatus === 'Followup'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {cand.callingStatus}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => {
                            onSelectBucket(cand.bucketId);
                            onNavigateTab('blockB');
                          }}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 justify-end"
                        >
                          <span>Open in Bucket</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 4: KARA REJECTED (SCREENING DISQUALIFIED CANDIDATES) */}
        {/* ------------------------------------------------------------- */}
        {activeView === 'rejected' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-800">
                Candidates disqualified or rejected during screening call or interview rounds
              </span>
              <span>Total Disqualified: {rejectedCandidates.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Candidate Profile</th>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4">Rejection Stage</th>
                    <th className="py-3 px-4">Screening Feedback &amp; Reason</th>
                    <th className="py-3 px-4">Date Logged</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filterList(rejectedCandidates).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        No rejected candidates recorded.
                      </td>
                    </tr>
                  ) : (
                    filterList(rejectedCandidates).map((cand) => (
                      <tr key={cand.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-sm">
                            {cand.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {cand.phone} · {cand.email}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-semibold text-slate-800">
                          {cand.designation}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>
                              {cand.callingStatus === 'Reject' 
                                ? 'Phone Call Rejection' 
                                : cand.primaryStatus === 'Rejected' 
                                ? 'Primary Interview Rejection' 
                                : 'Final Round Rejection'}
                            </span>
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-slate-700 max-w-xs">
                          {cand.callNotes || cand.primaryFeedback || 'Does not meet role criteria or salary alignment.'}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          {cand.calledAt || cand.submissionDate}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              onUpdateCandidate({
                                ...cand,
                                callingStatus: 'Pending',
                                primaryStatus: 'Not Scheduled',
                                overallStatus: 'Shortlisted',
                                isShortlisted: true,
                              });
                            }}
                            className="px-2.5 py-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold rounded hover:bg-indigo-50"
                          >
                            Re-evaluate
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* CV Buckets Folders Direct Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-indigo-600" />
              <span>Interactive CV Buckets ({cvBuckets.length} Folders)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Click any bucket to open candidate table, execute calling, send SMS/WhatsApp, and score interviews.
            </p>
          </div>

          <button
            onClick={() => onNavigateTab('blockB')}
            className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Open All Buckets</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cvBuckets.map((bucket) => {
            const bCandidates = candidates.filter(c => c.bucketId === bucket.id);
            const bCalls = bCandidates.filter(c => c.callingStatus === 'Confirm').length;
            const bHired = bCandidates.filter(c => c.overallStatus === 'Final Selected' || c.overallStatus === 'Hired').length;
            const bInterviews = bCandidates.filter(c => c.primaryStatus === 'Scheduled' || c.secondaryStatus === 'Scheduled').length;

            return (
              <div
                key={bucket.id}
                onClick={() => {
                  onSelectBucket(bucket.id);
                  onNavigateTab('blockB');
                }}
                className="group p-5 bg-white border border-slate-200 rounded-2xl hover:border-slate-800 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center font-bold">
                      <FolderGit2 className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {bucket.department}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors line-clamp-1">
                    {bucket.designation}
                  </h3>
                  <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    Created {bucket.createdAt}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-500">Ingested CVs</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {bCandidates.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[10px] text-center">
                    <div className="p-1 bg-slate-50 rounded">
                      <div className="text-slate-400">Calls</div>
                      <div className="font-mono font-bold text-slate-800">{bCalls}</div>
                    </div>
                    <div className="p-1 bg-slate-50 rounded">
                      <div className="text-slate-400">Interview</div>
                      <div className="font-mono font-bold text-indigo-700">{bInterviews}</div>
                    </div>
                    <div className="p-1 bg-slate-50 rounded">
                      <div className="text-slate-400">Hired</div>
                      <div className="font-mono font-bold text-emerald-700">{bHired}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Joining Documents Modal */}
      {candidateForDocs && (
        <JoiningDocumentsModal
          candidate={candidateForDocs}
          onClose={() => setCandidateForDocs(null)}
        />
      )}

      {/* Inspect Candidate Detail Drawer */}
      {inspectingCandidate && (
        <CandidateDetailModal
          candidate={inspectingCandidate}
          onClose={() => setInspectingCandidate(null)}
          onOpenCallingModal={() => {}}
          onOpenMessageModal={() => {}}
          onOpenPrimaryModal={() => {}}
          onOpenSecondaryModal={() => {}}
          onOpenOnboardModal={() => {}}
        />
      )}
    </div>
  );
};
