import React, { useState } from 'react';
import { 
  Briefcase, 
  Share2, 
  Plus, 
  ExternalLink, 
  Clock, 
  DollarSign, 
  Users, 
  CheckCircle, 
  AlertCircle,
  FolderPlus,
  Filter,
  Globe,
  Trash2,
  Calendar
} from 'lucide-react';
import { Requisition, JobPosting, PriorityLevel, JobPostingPlatform } from '../types';

interface BlockARequisitionsProps {
  requisitions: Requisition[];
  jobPostings: JobPosting[];
  onAddRequisition: (req: Omit<Requisition, 'id' | 'createdAt'>) => void;
  onUpdateRequisition: (req: Requisition) => void;
  onDeleteRequisition: (id: string) => void;
  onAddJobPosting: (posting: Omit<JobPosting, 'id'>) => void;
  onDeleteJobPosting: (id: string) => void;
  onCreateBucketFromReq: (req: Requisition) => void;
}

export const BlockA_Requisitions: React.FC<BlockARequisitionsProps> = ({
  requisitions,
  jobPostings,
  onAddRequisition,
  onUpdateRequisition,
  onDeleteRequisition,
  onAddJobPosting,
  onDeleteJobPosting,
  onCreateBucketFromReq,
}) => {
  const [activeSection, setActiveSection] = useState<'requisitions' | 'jobPostings'>('requisitions');
  const [showReqModal, setShowReqModal] = useState(false);
  const [showPostingModal, setShowPostingModal] = useState(false);
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('All');

  // New Requisition Form State
  const [newDesignation, setNewDesignation] = useState('');
  const [newDepartment, setNewDepartment] = useState('Engineering');
  const [newVacancies, setNewVacancies] = useState(1);
  const [newPriority, setNewPriority] = useState<PriorityLevel>('High');
  const [newHiringManager, setNewHiringManager] = useState('');
  const [newBudgetMin, setNewBudgetMin] = useState(60000);
  const [newBudgetMax, setNewBudgetMax] = useState(90000);
  const [newTargetDate, setNewTargetDate] = useState('2026-12-01');
  const [newJobDescription, setNewJobDescription] = useState('');

  // New Job Posting Form State
  const [postingReqId, setPostingReqId] = useState('');
  const [postingPlatform, setPostingPlatform] = useState<JobPostingPlatform>('LinkedIn');
  const [postingUrl, setPostingUrl] = useState('');
  const [postingExpiry, setPostingExpiry] = useState('2026-11-30');
  const [postingBudget, setPostingBudget] = useState(2500);
  const [postingNotes, setPostingNotes] = useState('');

  const departments = ['All', ...Array.from(new Set(requisitions.map(r => r.department)))];

  const filteredRequisitions = selectedDeptFilter === 'All' 
    ? requisitions 
    : requisitions.filter(r => r.department === selectedDeptFilter);

  const handleCreateRequisitionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesignation.trim()) return;

    onAddRequisition({
      designation: newDesignation.trim(),
      department: newDepartment,
      vacanciesCount: Number(newVacancies) || 1,
      priority: newPriority,
      hiringManager: newHiringManager.trim() || 'HR Department',
      budgetMin: Number(newBudgetMin) || 50000,
      budgetMax: Number(newBudgetMax) || 80000,
      currency: 'BDT',
      targetFillDate: newTargetDate,
      status: 'In Progress',
      jobDescription: newJobDescription.trim() || 'Candidate will be responsible for key functional milestones.',
    });

    setNewDesignation('');
    setShowReqModal(false);
  };

  const handleCreatePostingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const req = requisitions.find(r => r.id === postingReqId) || requisitions[0];
    if (!req) return;

    onAddJobJobPosting({
      requisitionId: req.id,
      designation: req.designation,
      platform: postingPlatform,
      postUrl: postingUrl.trim() || `https://${postingPlatform.toLowerCase().replace(/\s+/g, '')}.com/jobs`,
      status: 'Active',
      postedDate: new Date().toISOString().split('T')[0],
      expiryDate: postingExpiry,
      applicationsReceived: 0,
      budgetSpent: Number(postingBudget) || 0,
      notes: postingNotes.trim(),
    });

    setShowPostingModal(false);
    setPostingUrl('');
    setPostingNotes('');
  };

  const onAddJobJobPosting = onAddJobPosting;

  return (
    <div className="space-y-6 pb-12">
      {/* Block Header & Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Block A: Recruitment Planning &amp; Outreach
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Requisitions &amp; Multi-Channel Job Postings
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Identify vacant designations, approve departmental requisitions, and track media job distribution across BDJobs, LinkedIn, and social portals.
          </p>
        </div>

        {/* Section switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
          <button
            onClick={() => setActiveSection('requisitions')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeSection === 'requisitions'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>1. Requisitions ({requisitions.length})</span>
          </button>
          <button
            onClick={() => setActiveSection('jobPostings')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeSection === 'jobPostings'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>2. Media Postings ({jobPostings.length})</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: REQUISITIONS */}
      {activeSection === 'requisitions' && (
        <div className="space-y-4">
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Filter Department:</span>
              <div className="flex items-center gap-1">
                {departments.map((dept) => (
                  <button
                    key={dept}
                    onClick={() => setSelectedDeptFilter(dept)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      selectedDeptFilter === dept
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowReqModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Requisition</span>
            </button>
          </div>

          {/* Requisitions List Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                  <tr>
                    <th className="py-3 px-4">Designation &amp; Department</th>
                    <th className="py-3 px-4">Vacancies</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Hiring Manager</th>
                    <th className="py-3 px-4">Budget Range</th>
                    <th className="py-3 px-4">Target Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRequisitions.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white text-sm">
                          {req.designation}
                        </div>
                        <div className="text-slate-500 text-xs mt-0.5">
                          {req.department}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                        {req.vacanciesCount} {req.vacanciesCount === 1 ? 'seat' : 'seats'}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                          req.priority === 'Urgent'
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                            : req.priority === 'High'
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {req.priority}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                        {req.hiringManager}
                      </td>

                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {req.budgetMin.toLocaleString()} - {req.budgetMax.toLocaleString()} {req.currency}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                        {req.targetFillDate}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>{req.status}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onCreateBucketFromReq(req)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded transition-colors"
                            title="Generate a dedicated CV Bucket folder for this designation"
                          >
                            <FolderPlus className="w-3.5 h-3.5" />
                            <span>Create Bucket</span>
                          </button>

                          <button
                            onClick={() => {
                              setPostingReqId(req.id);
                              setShowPostingModal(true);
                            }}
                            className="px-2 py-1 text-xs text-sky-600 hover:text-sky-700 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 rounded transition-colors"
                            title="Post this requisition to job boards"
                          >
                            Post Media
                          </button>

                          <button
                            onClick={() => onDeleteRequisition(req.id)}
                            className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                            title="Delete requisition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: JOB POSTINGS RECORD */}
      {activeSection === 'jobPostings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Media distribution record tracking which channels (LinkedIn, BDJobs, Facebook, Career Portal) are publishing open requisitions.
            </p>

            <button
              onClick={() => setShowPostingModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record New Job Posting</span>
            </button>
          </div>

          {/* Job Postings Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                  <tr>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4">Publishing Media</th>
                    <th className="py-3 px-4">Live URL / Link</th>
                    <th className="py-3 px-4">Posted Date</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4">Applications Count</th>
                    <th className="py-3 px-4">Budget Spent</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {jobPostings.map((post) => (
                    <tr key={post.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                        {post.designation}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {post.platform}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <a 
                          href={post.postUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-mono text-[11px]"
                        >
                          <span className="truncate max-w-[150px]">{post.postUrl}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </td>

                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {post.postedDate}
                      </td>

                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {post.expiryDate}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums text-sm">
                          {post.applicationsReceived}
                        </span>
                        <span className="text-slate-400 ml-1">CVs</span>
                      </td>

                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {post.budgetSpent ? `${post.budgetSpent.toLocaleString()} BDT` : 'Free'}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                          {post.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => onDeleteJobPosting(post.id)}
                          className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                          title="Remove posting record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD REQUISITION */}
      {showReqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Add Vacancy Requisition
                </h3>
                <p className="text-xs text-slate-500">Record a new role that needs to be filled.</p>
              </div>
              <button 
                onClick={() => setShowReqModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRequisitionSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Designation / Role Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior DevOps Specialist, Sales Manager"
                  value={newDesignation}
                  onChange={(e) => setNewDesignation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Department
                  </label>
                  <select
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
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
                    Vacancies Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={newVacancies}
                    onChange={(e) => setNewVacancies(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Priority Level
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as PriorityLevel)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="Urgent">Urgent (Immediate hire)</option>
                    <option value="High">High Priority</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Hiring Manager
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tariq Rahman"
                    value={newHiringManager}
                    onChange={(e) => setNewHiringManager(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Budget Min (BDT)
                  </label>
                  <input
                    type="number"
                    value={newBudgetMin}
                    onChange={(e) => setNewBudgetMin(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Budget Max (BDT)
                  </label>
                  <input
                    type="number"
                    value={newBudgetMax}
                    onChange={(e) => setNewBudgetMax(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Fill Date
                </label>
                <input
                  type="date"
                  value={newTargetDate}
                  onChange={(e) => setNewTargetDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Job Description / Requirements
                </label>
                <textarea
                  rows={3}
                  placeholder="Outline key requirements and responsibilities..."
                  value={newJobDescription}
                  onChange={(e) => setNewJobDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReqModal(false)}
                  className="px-4 py-2 font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
                >
                  Create Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD JOB POSTING RECORD */}
      {showPostingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Record Media Job Posting
                </h3>
                <p className="text-xs text-slate-500">Log where this requisition has been posted.</p>
              </div>
              <button 
                onClick={() => setShowPostingModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePostingSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Select Requisition *
                </label>
                <select
                  value={postingReqId || (requisitions[0]?.id || '')}
                  onChange={(e) => setPostingReqId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  {requisitions.map((req) => (
                    <option key={req.id} value={req.id}>
                      {req.designation} ({req.department} - {req.vacanciesCount} vacancies)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Publishing Platform *
                  </label>
                  <select
                    value={postingPlatform}
                    onChange={(e) => setPostingPlatform(e.target.value as JobPostingPlatform)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="BDJobs">BDJobs</option>
                    <option value="Facebook">Facebook Careers</option>
                    <option value="Career Portal">Company Career Portal</option>
                    <option value="Indeed">Indeed</option>
                    <option value="Referral">Internal Referral / Walk-in</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Budget Spent (BDT)
                  </label>
                  <input
                    type="number"
                    value={postingBudget}
                    onChange={(e) => setPostingBudget(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Live Post URL / Web Link
                </label>
                <input
                  type="url"
                  placeholder="https://linkedin.com/jobs/view/..."
                  value={postingUrl}
                  onChange={(e) => setPostingUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Posting Expiry Date
                </label>
                <input
                  type="date"
                  value={postingExpiry}
                  onChange={(e) => setPostingExpiry(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Campaign Notes / Tracking Tags
                </label>
                <input
                  type="text"
                  placeholder="e.g. Targeted at Dhaka tech graduates, sponsored boost"
                  value={postingNotes}
                  onChange={(e) => setPostingNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPostingModal(false)}
                  className="px-4 py-2 font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
                >
                  Save Posting Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
