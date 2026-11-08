import React, { useState } from 'react';
import { 
  Printer, 
  Download, 
  X, 
  FileText, 
  ShieldCheck, 
  CheckCircle2, 
  Building, 
  Calendar, 
  Award,
  Layers,
  ChevronRight
} from 'lucide-react';
import { Candidate } from '../types';

interface JoiningDocumentsModalProps {
  candidate: Candidate;
  onClose: () => void;
}

export const JoiningDocumentsModal: React.FC<JoiningDocumentsModalProps> = ({
  candidate,
  onClose,
}) => {
  const [activeDoc, setActiveDoc] = useState<'all' | 'offer' | 'contract' | 'nda' | 'dossier' | 'asset'>('all');

  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const joiningDateFormatted = candidate.joiningDate 
    ? new Date(candidate.joiningDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'To be determined';

  const monthlySalary = candidate.offeredSalary 
    ? `${candidate.offeredSalary.toLocaleString()} BDT`
    : '85,000 BDT';

  const annualSalary = candidate.offeredSalary 
    ? `${(candidate.offeredSalary * 12).toLocaleString()} BDT`
    : '1,020,000 BDT';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl my-6 flex flex-col max-h-[92vh]">
        {/* Top Control Bar (Hidden during print) */}
        <div className="no-print p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/70 rounded-t-2xl">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Block C: Automated Joining Day Packet
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 font-mono">
                100% Pre-Filled
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              Official Joining Documents for {candidate.fullName}
            </h2>
            <p className="text-xs text-slate-500">
              Role: <strong className="text-slate-700 dark:text-slate-300">{candidate.designation}</strong> · Joining: <strong className="text-slate-700 dark:text-slate-300">{joiningDateFormatted}</strong> · No manual data entry needed.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Official Signing Packet</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Selection Tabs (Hidden during print) */}
        <div className="no-print px-5 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto text-xs">
          <span className="text-slate-400 mr-2 shrink-0 font-medium">Select Document:</span>
          {[
            { id: 'all', label: 'Complete Packet (All 5 Docs)' },
            { id: 'offer', label: '1. Appointment Letter' },
            { id: 'contract', label: '2. Employment Contract' },
            { id: 'nda', label: '3. NDA & IP Agreement' },
            { id: 'dossier', label: '4. Employee Dossier' },
            { id: 'asset', label: '5. Asset Handover Form' },
          ].map((doc) => (
            <button
              key={doc.id}
              onClick={() => setActiveDoc(doc.id as any)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeDoc === doc.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {doc.label}
            </button>
          ))}
        </div>

        {/* Printable Paper Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-100 dark:bg-slate-950 font-sans">
          <div className="max-w-[850px] mx-auto space-y-8">
            
            {/* ========================================================================= */}
            {/* DOCUMENT 1: OFFICIAL APPOINTMENT / OFFER LETTER */}
            {/* ========================================================================= */}
            {(activeDoc === 'all' || activeDoc === 'offer') && (
              <div className="print-page bg-white text-slate-900 p-8 sm:p-12 shadow-md rounded-xl border border-slate-200 relative min-h-[1050px] flex flex-col justify-between">
                <div>
                  {/* Company Letterhead */}
                  <div className="flex items-center justify-between border-b-2 border-slate-800 pb-5 mb-6">
                    <div>
                      <div className="flex items-center gap-3">
                        <img 
                          src="/assets/aistudio/bitopi_group_logo_for_tab_ae6c542e.jpg" 
                          alt="Bitopi Group Logo" 
                          className="w-12 h-12 object-contain bg-white p-0.5 border border-slate-200"
                        />
                        <div>
                          <h1 className="text-xl font-extrabold tracking-tight text-slate-950 uppercase">
                            Bitopi Group
                          </h1>
                          <p className="text-xs font-semibold text-slate-700">
                            Tarasima Apparels Ltd. (Corporate Office)
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 mt-2">
                        Corporate Office: 823/3 Begum Rokeya Sharani, Shewrapara, Mirpur, Dhaka-1216, Bangladesh
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        (Close to Metro Rail Pillar No 321) · Tel: +880 2 9876543 · hr.corporate@bitopigroup.com
                      </p>
                    </div>

                    <img 
                      src="/src/assets/images/company_official_seal_1793850304894.jpg" 
                      alt="Company Seal" 
                      className="w-16 h-16 object-contain"
                    />
                  </div>

                  {/* Date & Ref */}
                  <div className="flex items-center justify-between text-xs text-slate-600 mb-6 font-mono">
                    <span>Ref: TF/HR/APPT/2026/{candidate.id.toUpperCase().slice(-6)}</span>
                    <span>Date: {today}</span>
                  </div>

                  {/* Recipient */}
                  <div className="text-xs text-slate-800 space-y-0.5 mb-6">
                    <p className="font-bold text-sm text-slate-950">{candidate.fullName}</p>
                    <p>{candidate.address}</p>
                    <p>Contact: {candidate.phone} · {candidate.email}</p>
                    {candidate.nationalId && <p className="font-mono">National ID: {candidate.nationalId}</p>}
                  </div>

                  {/* Subject */}
                  <div className="bg-slate-50 p-2.5 rounded border border-slate-200 text-xs font-bold text-slate-950 mb-6">
                    SUBJECT: FORMAL LETTER OF APPOINTMENT AS {candidate.designation.toUpperCase()}
                  </div>

                  {/* Letter Body */}
                  <div className="text-xs text-slate-700 space-y-3 leading-relaxed">
                    <p>
                      Dear <strong className="text-slate-950">{candidate.fullName}</strong>,
                    </p>
                    <p>
                      We are pleased to offer you the position of <strong className="text-slate-950">{candidate.designation}</strong> with <strong>TalentFlow Global Technologies Ltd.</strong> following your successful completion of our technical evaluation and leadership interview process.
                    </p>

                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 my-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-500 font-medium">Designation:</span>
                          <div className="font-bold text-slate-950">{candidate.designation}</div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Reporting Date (Joining):</span>
                          <div className="font-bold text-slate-950">{joiningDateFormatted}</div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Gross Monthly Remuneration:</span>
                          <div className="font-bold font-mono text-slate-950">{monthlySalary}</div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Annualized CTC:</span>
                          <div className="font-bold font-mono text-slate-950">{annualSalary}</div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Employment Classification:</span>
                          <div className="font-bold text-slate-950">{candidate.contractType || 'Full-Time Permanent'}</div>
                        </div>
                        <div>
                          <span className="text-slate-500 font-medium">Probationary Period:</span>
                          <div className="font-bold text-slate-950">6 (Six) Months from Joining Date</div>
                        </div>
                      </div>
                    </div>

                    <p>
                      This appointment is governed by the rules, policies, and code of conduct of the Company and applicable laws of the Bangladesh Labour Act 2006 (as amended). You will be eligible for festival bonuses, group health insurance, and provident fund benefits upon standard confirmation.
                    </p>

                    {/* Official Joining Checklist from System Specification */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] space-y-1">
                      <strong className="text-slate-900 block font-semibold">
                        N.B: Please submit following Documents on joining (If discrepancy found, offer will be subject to postponement):
                      </strong>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                        <li>NID (Self 2 Copy &amp; Nominee 2 Copy)</li>
                        <li>Copy of all educational certificates (Original copies to be verified at joining)</li>
                        <li>Experience &amp; Clearance Certificate of previous organization</li>
                        <li>TIN certificate</li>
                        <li>Passport size Photograph (Self 4 Copy &amp; Nominee 2 Copy)</li>
                      </ul>
                    </div>

                    <p>
                      Please sign and return the duplicate copy of this letter along with the attached Employment Agreement and Non-Disclosure Agreement as confirmation of your acceptance.
                    </p>
                  </div>
                </div>

                {/* Signatures & Seal */}
                <div className="pt-8 border-t border-slate-200 mt-8">
                  <div className="grid grid-cols-2 gap-8 text-xs">
                    <div>
                      <div className="h-14 flex items-end">
                        <span className="font-serif italic text-base text-indigo-950 font-bold border-b border-slate-900 pb-1 w-48 block">
                          Sadia Farhana
                        </span>
                      </div>
                      <div className="font-bold text-slate-900 mt-1">Sadia Farhana</div>
                      <div className="text-slate-500">Head of Human Resources &amp; People</div>
                      <div className="text-slate-400">TalentFlow Global Technologies Ltd.</div>
                    </div>

                    <div>
                      <div className="h-14 flex items-end">
                        <div className="border-b border-dashed border-slate-900 pb-1 w-48 text-slate-400 text-[11px]">
                          (Candidate Signature &amp; Date)
                        </div>
                      </div>
                      <div className="font-bold text-slate-900 mt-1">Accepted &amp; Confirmed By:</div>
                      <div className="text-slate-950 font-semibold">{candidate.fullName}</div>
                      <div className="text-slate-500 font-mono">Date: ________________________</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* DOCUMENT 2: STANDARD EMPLOYMENT AGREEMENT & CODE OF CONDUCT */}
            {/* ========================================================================= */}
            {(activeDoc === 'all' || activeDoc === 'contract') && (
              <div className="print-page bg-white text-slate-900 p-8 sm:p-12 shadow-md rounded-xl border border-slate-200 relative min-h-[1050px] flex flex-col justify-between">
                <div>
                  <div className="text-center pb-4 border-b border-slate-200 mb-6">
                    <h2 className="text-lg font-extrabold uppercase text-slate-900">
                      Standard Employment Contract &amp; Service Terms
                    </h2>
                    <p className="text-xs text-slate-500">
                      Executed pursuant to Bangladesh Labour Law &amp; Company Employment Bye-Laws
                    </p>
                  </div>

                  <div className="text-xs text-slate-700 space-y-4 leading-relaxed">
                    <p>
                      THIS EMPLOYMENT AGREEMENT is entered into between <strong>TalentFlow Global Technologies Ltd.</strong> (hereinafter referred to as the <em>"Company"</em>) and <strong className="text-slate-950">{candidate.fullName}</strong>, bearing National ID / Passport No: <span className="font-mono font-bold text-slate-900">{candidate.nationalId || 'N/A'}</span>, residing at {candidate.address} (hereinafter referred to as the <em>"Employee"</em>).
                    </p>

                    <div>
                      <h3 className="font-bold text-slate-950 text-xs mb-1">1. APPOINTMENT &amp; DUTIES</h3>
                      <p>
                        The Company hereby employs the Employee in the capacity of <strong>{candidate.designation}</strong>. The Employee agrees to perform all responsibilities diligently, faithfully, and to the best of their skill and ability.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-950 text-xs mb-1">2. WORKING HOURS &amp; ATTENDANCE</h3>
                      <p>
                        Standard operational hours are 9:00 AM to 6:00 PM, Sunday through Thursday, with standard weekend breaks. Flexible schedules and remote collaborations are governed by departmental approval.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-950 text-xs mb-1">3. COMPENSATION &amp; REMUNERATION</h3>
                      <p>
                        The Employee shall receive a monthly gross salary of <strong className="font-mono text-slate-950">{monthlySalary}</strong>, payable on or before the 1st working day of the following calendar month via bank transfer to the employee's nominated salary account.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-950 text-xs mb-1">4. CONFIDENTIALITY &amp; CODE OF CONDUCT</h3>
                      <p>
                        The Employee covenants that they will not at any time during employment or subsequent to termination divulge or communicate to any person, company, or third party any trade secrets, source code, designs, or proprietary information of the Company.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-950 text-xs mb-1">5. SEPARATION &amp; NOTICE PERIOD</h3>
                      <p>
                        During the probation period, either party may terminate the employment with 15 (fifteen) days written notice or gross salary in lieu thereof. Upon confirmation, the notice period shall be 30 (thirty) days.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200 mt-8">
                  <p className="text-[11px] text-slate-500 mb-6 italic">
                    IN WITNESS WHEREOF, the parties hereto have signed and executed this Agreement on this day of {today}.
                  </p>

                  <div className="grid grid-cols-2 gap-8 text-xs">
                    <div>
                      <div className="border-b border-slate-900 pb-1 w-48 font-bold">
                        Authorized Signatory
                      </div>
                      <div className="font-semibold text-slate-900 mt-1">For TalentFlow Global Technologies Ltd.</div>
                      <div className="text-slate-500">Corporate Seal &amp; Authority</div>
                    </div>

                    <div>
                      <div className="border-b border-slate-900 pb-1 w-48 font-bold">
                        {candidate.fullName}
                      </div>
                      <div className="font-semibold text-slate-900 mt-1">Employee Signature</div>
                      <div className="text-slate-500 font-mono">Date: ________________________</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* DOCUMENT 3: NON-DISCLOSURE & INTELLECTUAL PROPERTY AGREEMENT (NDA) */}
            {/* ========================================================================= */}
            {(activeDoc === 'all' || activeDoc === 'nda') && (
              <div className="print-page bg-white text-slate-900 p-8 sm:p-12 shadow-md rounded-xl border border-slate-200 relative min-h-[1050px] flex flex-col justify-between">
                <div>
                  <div className="text-center pb-4 border-b border-slate-200 mb-6">
                    <h2 className="text-lg font-extrabold uppercase text-slate-900">
                      Non-Disclosure &amp; Intellectual Property Assignment Agreement
                    </h2>
                    <p className="text-xs text-slate-500">
                      Proprietary Information, Confidentiality, &amp; Inventions Assignment
                    </p>
                  </div>

                  <div className="text-xs text-slate-700 space-y-4 leading-relaxed">
                    <p>
                      This Agreement is made effective upon commencement of engagement between <strong>TalentFlow Global Technologies Ltd.</strong> and Employee <strong>{candidate.fullName}</strong>.
                    </p>

                    <div>
                      <h3 className="font-bold text-slate-950 text-xs mb-1">1. DEFINITION OF CONFIDENTIAL INFORMATION</h3>
                      <p>
                        "Confidential Information" includes, without limitation, all software source code, system designs, product mockups, customer databases, business strategies, pricing matrices, API keys, intellectual property, and proprietary internal workflows developed or accessible during engagement.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-950 text-xs mb-1">2. PERPETUAL NON-DISCLOSURE</h3>
                      <p>
                        The Employee agrees to hold all Confidential Information in strictest confidence and shall not disclose, duplicate, transfer, reverse engineer, or make available any portion thereof to any unauthorized third party, whether during or indefinitely after the termination of employment.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-950 text-xs mb-1">3. OWNERSHIP OF INVENTIONS &amp; INTELLECTUAL PROPERTY</h3>
                      <p>
                        All discoveries, inventions, source codes, documents, and creative designs created or authored by the Employee in connection with their employment shall belong solely and exclusively to TalentFlow Global Technologies Ltd. as works made for hire.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-950 text-xs mb-1">4. RETURN OF COMPANY MATERIALS</h3>
                      <p>
                        Upon termination of employment, the Employee must immediately deliver to the Company all physical assets, documents, drives, security tokens, and delete all local copies of confidential company data.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200 mt-8">
                  <div className="grid grid-cols-2 gap-8 text-xs">
                    <div>
                      <div className="h-10 flex items-end">
                        <span className="font-serif italic text-sm text-indigo-950 font-bold border-b border-slate-900 pb-1 w-48 block">
                          Legal &amp; Compliance Dept
                        </span>
                      </div>
                      <div className="font-bold text-slate-900 mt-1">TalentFlow Legal Council</div>
                      <div className="text-slate-500">Official Company Seal</div>
                    </div>

                    <div>
                      <div className="h-10 flex items-end">
                        <div className="border-b border-slate-900 pb-1 w-48 font-bold">
                          {candidate.fullName}
                        </div>
                      </div>
                      <div className="font-bold text-slate-900 mt-1">Employee Acknowledgment</div>
                      <div className="text-slate-500 font-mono">Date: ________________________</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* DOCUMENT 4: EMPLOYEE INFORMATION & EMERGENCY CONTACT DOSSIER */}
            {/* ========================================================================= */}
            {(activeDoc === 'all' || activeDoc === 'dossier') && (
              <div className="print-page bg-white text-slate-900 p-8 sm:p-12 shadow-md rounded-xl border border-slate-200 relative min-h-[1050px] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
                    <div>
                      <h2 className="text-lg font-extrabold uppercase text-slate-900">
                        Employee Information &amp; Emergency Contact Dossier
                      </h2>
                      <p className="text-xs text-slate-500">
                        Official Personnel Record for HRIS and Bangladesh Labour Compliance
                      </p>
                    </div>

                    <img
                      src={candidate.avatarUrl || '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg'}
                      alt={candidate.fullName}
                      className="w-16 h-16 rounded-lg object-cover border border-slate-300"
                    />
                  </div>

                  <div className="text-xs space-y-4">
                    {/* Section A: Personal Information */}
                    <div>
                      <h3 className="font-bold text-slate-950 bg-slate-100 p-1.5 rounded uppercase tracking-wider text-[11px] mb-2">
                        Section A: Personal &amp; Identity Details
                      </h3>
                      <div className="grid grid-cols-2 gap-3 p-2">
                        <div><span className="text-slate-500">Full Legal Name:</span> <strong className="text-slate-950 block">{candidate.fullName}</strong></div>
                        <div><span className="text-slate-500">National ID (NID) / Passport:</span> <strong className="font-mono text-slate-950 block">{candidate.nationalId || '19952692610000123'}</strong></div>
                        <div><span className="text-slate-500">Primary Mobile Phone:</span> <span className="font-mono block">{candidate.phone}</span></div>
                        <div><span className="text-slate-500">Official Email:</span> <span className="block">{candidate.email}</span></div>
                        <div className="col-span-2"><span className="text-slate-500">Residential Address:</span> <span className="block">{candidate.address}</span></div>
                      </div>
                    </div>

                    {/* Section B: Employment Parameters */}
                    <div>
                      <h3 className="font-bold text-slate-950 bg-slate-100 p-1.5 rounded uppercase tracking-wider text-[11px] mb-2">
                        Section B: Employment &amp; Position Assignment
                      </h3>
                      <div className="grid grid-cols-2 gap-3 p-2">
                        <div><span className="text-slate-500">Designation:</span> <strong className="text-slate-950 block">{candidate.designation}</strong></div>
                        <div><span className="text-slate-500">Date of Joining:</span> <strong className="font-mono text-slate-950 block">{joiningDateFormatted}</strong></div>
                        <div><span className="text-slate-500">Initial Gross Remuneration:</span> <span className="font-mono font-bold block">{monthlySalary}</span></div>
                        <div><span className="text-slate-500">Prior Experience:</span> <span className="block">{candidate.totalExperienceYears} Years</span></div>
                        <div className="col-span-2"><span className="text-slate-500">Academic Background:</span> <span className="block">{candidate.educationSummary}</span></div>
                      </div>
                    </div>

                    {/* Section C: Emergency Contact Details */}
                    <div>
                      <h3 className="font-bold text-slate-950 bg-slate-100 p-1.5 rounded uppercase tracking-wider text-[11px] mb-2">
                        Section C: Emergency Contact Information
                      </h3>
                      <div className="grid grid-cols-3 gap-3 p-2">
                        <div><span className="text-slate-500">Contact Person:</span> <strong className="text-slate-950 block">{candidate.emergencyContactName || 'Family Member'}</strong></div>
                        <div><span className="text-slate-500">Emergency Phone:</span> <span className="font-mono block">{candidate.emergencyContactPhone || candidate.phone}</span></div>
                        <div><span className="text-slate-500">Relationship:</span> <span className="block">{candidate.emergencyContactRelation || 'Parent / Sibling'}</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200 mt-6 text-xs">
                  <p className="text-[11px] text-slate-500 mb-4">
                    I hereby declare that all information furnished above is true, complete, and correct to the best of my knowledge and belief.
                  </p>
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="font-bold text-slate-900">HR Records Officer</div>
                      <div className="text-slate-500">TalentFlow HR Department</div>
                    </div>
                    <div className="text-right">
                      <div className="border-b border-slate-900 pb-1 w-48 font-bold text-center">
                        {candidate.fullName}
                      </div>
                      <div className="text-slate-500 font-mono mt-1">Signature &amp; Date</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* DOCUMENT 5: ASSET & IT EQUIPMENT HANDOVER FORM */}
            {/* ========================================================================= */}
            {(activeDoc === 'all' || activeDoc === 'asset') && (
              <div className="print-page bg-white text-slate-900 p-8 sm:p-12 shadow-md rounded-xl border border-slate-200 relative min-h-[1050px] flex flex-col justify-between">
                <div>
                  <div className="text-center pb-4 border-b border-slate-200 mb-6">
                    <h2 className="text-lg font-extrabold uppercase text-slate-900">
                      IT Asset &amp; Equipment Handover Undertaking
                    </h2>
                    <p className="text-xs text-slate-500">
                      Hardware Assignment, Usage Responsibility, &amp; Security Protocol
                    </p>
                  </div>

                  <div className="text-xs text-slate-700 space-y-4 leading-relaxed">
                    <p>
                      This acknowledges that the following company assets have been provisioned to <strong>{candidate.fullName}</strong> ({candidate.designation}) on this date of {today}:
                    </p>

                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 font-bold text-slate-800">
                          <tr>
                            <th className="py-2.5 px-3">Item #</th>
                            <th className="py-2.5 px-3">Equipment Description</th>
                            <th className="py-2.5 px-3">Serial / Asset Tag</th>
                            <th className="py-2.5 px-3">Condition</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          <tr>
                            <td className="py-2.5 px-3 font-mono">01</td>
                            <td className="py-2.5 px-3 font-semibold">Primary Workstation / Laptop (MacBook Pro / ThinkPad)</td>
                            <td className="py-2.5 px-3 font-mono">TF-DEV-2026-981</td>
                            <td className="py-2.5 px-3 text-emerald-700 font-medium">Brand New / Excellent</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 px-3 font-mono">02</td>
                            <td className="py-2.5 px-3 font-semibold">High-Resolution External Display Monitor (27" 4K)</td>
                            <td className="py-2.5 px-3 font-mono">TF-MON-2026-402</td>
                            <td className="py-2.5 px-3 text-emerald-700 font-medium">Brand New / Tested</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 px-3 font-mono">03</td>
                            <td className="py-2.5 px-3 font-semibold">Smart Office Access Keycard &amp; RFID Badge</td>
                            <td className="py-2.5 px-3 font-mono">TF-SEC-0912</td>
                            <td className="py-2.5 px-3 text-emerald-700 font-medium">Active</td>
                          </tr>
                          <tr>
                            <td className="py-2.5 px-3 font-mono">04</td>
                            <td className="py-2.5 px-3 font-semibold">Corporate Email &amp; Cloud VPN Credentials</td>
                            <td className="py-2.5 px-3 font-mono">{candidate.email}</td>
                            <td className="py-2.5 px-3 text-emerald-700 font-medium">Provisioned</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="space-y-2 mt-4 text-[11px] text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <p>
                        <strong>Terms of Handover:</strong> The employee agrees to take full physical and cybersecurity responsibility for all assigned hardware. All hardware must remain password-protected with whole-disk encryption enabled. In the event of resignation or termination, all listed equipment must be returned in operable condition before final settlement clearance.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-200 mt-8">
                  <div className="grid grid-cols-2 gap-8 text-xs">
                    <div>
                      <div className="border-b border-slate-900 pb-1 w-48 font-bold">
                        IT Systems Administrator
                      </div>
                      <div className="font-semibold text-slate-900 mt-1">Handed Over By: IT Operations</div>
                      <div className="text-slate-500 font-mono">Date: {today}</div>
                    </div>

                    <div>
                      <div className="border-b border-slate-900 pb-1 w-48 font-bold">
                        {candidate.fullName}
                      </div>
                      <div className="font-semibold text-slate-900 mt-1">Received &amp; Acknowledged By: Employee</div>
                      <div className="text-slate-500 font-mono">Date: ________________________</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
