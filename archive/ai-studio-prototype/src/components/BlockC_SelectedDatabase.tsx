import React, { useState } from 'react';
import { 
  UserCheck, 
  Download, 
  Printer, 
  Search, 
  Filter, 
  ArrowUpDown, 
  FileText, 
  Calendar, 
  DollarSign, 
  Mail, 
  Phone, 
  CheckCircle2, 
  FileSpreadsheet,
  Plus,
  ShieldCheck,
  Eye,
  Trash2
} from 'lucide-react';
import { Candidate } from '../types';
import { Storage } from '../lib/storage';
import { JoiningDocumentsModal } from './JoiningDocumentsModal';
import { CandidateDetailModal } from './CandidateDetailModal';

interface BlockCSelectedDatabaseProps {
  candidates: Candidate[];
  onUpdateCandidate: (candidate: Candidate) => void;
  onDeleteCandidate: (id: string) => void;
}

export const BlockC_SelectedDatabase: React.FC<BlockCSelectedDatabaseProps> = ({
  candidates,
  onUpdateCandidate,
  onDeleteCandidate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'salary' | 'date' | 'exp'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedCandidateForDocs, setSelectedCandidateForDocs] = useState<Candidate | null>(null);
  const [inspectingCandidate, setInspectingCandidate] = useState<Candidate | null>(null);

  // Filter for hired / final selected candidates
  const hiredCandidates = candidates.filter(
    c => c.overallStatus === 'Final Selected' || c.overallStatus === 'Hired' || c.secondaryStatus === 'Selected'
  );

  // Sorting
  const sortedCandidates = [...hiredCandidates].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'name') {
      comparison = a.fullName.localeCompare(b.fullName);
    } else if (sortBy === 'salary') {
      comparison = (a.offeredSalary || 0) - (b.offeredSalary || 0);
    } else if (sortBy === 'date') {
      comparison = (a.joiningDate || '9999').localeCompare(b.joiningDate || '9999');
    } else if (sortBy === 'exp') {
      comparison = a.totalExperienceYears - b.totalExperienceYears;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const filteredCandidates = sortedCandidates.filter(c => {
    return !searchQuery.trim() || 
      c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.designation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery);
  });

  // Calculate metrics
  const totalPayroll = hiredCandidates.reduce((acc, c) => acc + (c.offeredSalary || 0), 0);
  const avgExp = hiredCandidates.length > 0
    ? (hiredCandidates.reduce((acc, c) => acc + c.totalExperienceYears, 0) / hiredCandidates.length).toFixed(1)
    : '0';

  // Export to CSV
  const handleDownloadCsv = () => {
    const csvData = Storage.exportCandidatesToCsv(hiredCandidates);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `hired_candidates_database_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to JSON
  const handleDownloadJson = () => {
    const jsonData = JSON.stringify(hiredCandidates, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `hired_candidates_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Block Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Block C: Hired Personnel Database &amp; Signing Documentation
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Hired Talent Database &amp; Automated Joining Day Packets
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Easily search, sort, and export selected employees. One-click print for all 5 official onboarding contracts and undertaking forms with zero manual data entry.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg shadow-xs transition-colors"
            title="Download CSV spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Download CSV</span>
          </button>

          <button
            onClick={handleDownloadJson}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg shadow-xs transition-colors"
            title="Download JSON data"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download JSON</span>
          </button>
        </div>
      </div>

      {/* KPI Cards for Hired Talent */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-xs font-medium text-slate-500">Total Hired Personnel</span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {hiredCandidates.length}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Successfully screened &amp; selected</div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-xs font-medium text-slate-500">Monthly Payroll Commitment</span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
            {totalPayroll.toLocaleString()} <span className="text-xs font-normal text-slate-500">BDT</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Approved gross monthly salaries</div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-xs font-medium text-slate-500">Average Industry Experience</span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
            {avgExp} <span className="text-xs font-normal text-slate-500">Years</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Combined professional seniority</div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-xs font-medium text-slate-500">Joining Packets Ready</span>
          <div className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white flex items-center gap-2">
            <span>{hiredCandidates.length}</span>
            <span className="text-xs font-sans font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Zero Data Entry
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Printable Offer, Contract, NDA, Handover</div>
        </div>
      </div>

      {/* Search, Filter, Sort Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, role, email, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white w-64 sm:w-80 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Sorting options */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300"
          >
            <option value="date">Joining Date</option>
            <option value="name">Candidate Name</option>
            <option value="salary">Offered Salary</option>
            <option value="exp">Experience</option>
          </select>

          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50"
            title="Toggle sort direction"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SELECTED PERSONNEL DATABASE TABLE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <tr>
                <th className="py-3 px-4">Employee Profile</th>
                <th className="py-3 px-4">Designation &amp; Dept</th>
                <th className="py-3 px-4">Offered Salary (BDT)</th>
                <th className="py-3 px-4">Target Joining Date</th>
                <th className="py-3 px-4">National ID (NID)</th>
                <th className="py-3 px-4">Emergency Contact</th>
                <th className="py-3 px-4">Onboarding Status</th>
                <th className="py-3 px-4 text-right">Joining Signing Packet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    No hired personnel found in database. Move candidates to "Final Selected" in Block B to see them here!
                  </td>
                </tr>
              ) : (
                filteredCandidates.map((cand) => (
                  <tr key={cand.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    {/* Employee Profile */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={cand.avatarUrl || '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg'}
                          alt={cand.fullName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                        <div>
                          <div 
                            onClick={() => setInspectingCandidate(cand)}
                            className="font-bold text-slate-900 dark:text-white text-sm hover:text-indigo-600 cursor-pointer"
                          >
                            {cand.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>{cand.phone}</span>
                            <span>·</span>
                            <span className="truncate max-w-[130px]">{cand.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {cand.designation}
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        {cand.contractType || 'Full-Time Permanent'}
                      </div>
                    </td>

                    {/* Salary */}
                    <td className="py-3.5 px-4 font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                      {cand.offeredSalary ? `${cand.offeredSalary.toLocaleString()} BDT` : '85,000 BDT'}
                    </td>

                    {/* Joining Date */}
                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {cand.joiningDate || '2026-12-01'}
                    </td>

                    {/* NID */}
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                      {cand.nationalId || '19952692610000123'}
                    </td>

                    {/* Emergency Contact */}
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 dark:text-slate-200 font-medium">
                        {cand.emergencyContactName || 'Family Member'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {cand.emergencyContactPhone || cand.phone} ({cand.emergencyContactRelation || 'Emergency'})
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Ready For Joining</span>
                      </span>
                    </td>

                    {/* Print Joining Docs Action */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedCandidateForDocs(cand)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                          title="Generate official Appointment Letter, Contract, NDA, Dossier, and Handover Form"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Generate &amp; Print Docs</span>
                        </button>

                        <button
                          onClick={() => onDeleteCandidate(cand.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 rounded"
                          title="Remove from database"
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

      {/* Print & View Official Documents Modal */}
      {selectedCandidateForDocs && (
        <JoiningDocumentsModal
          candidate={selectedCandidateForDocs}
          onClose={() => setSelectedCandidateForDocs(null)}
        />
      )}

      {/* Candidate Inspect Drawer */}
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
