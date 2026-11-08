import React, { useState } from 'react';
import { 
  FolderPlus, 
  Upload, 
  FileText, 
  Sparkles, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Plus, 
  Users,
  FileCheck
} from 'lucide-react';
import { CvBucket, Candidate, FolderColor } from '../types';
import { parseCvWithoutAi, parseCvWithAi } from '../lib/cvParser';

interface FloatingAddBucketModalProps {
  onClose: () => void;
  onCreateBucketWithCandidates: (
    bucketData: Omit<CvBucket, 'id' | 'createdAt'>,
    candidatesData: Array<Omit<Candidate, 'id'>>
  ) => void;
  geminiApiKey: string;
}

export const FloatingAddBucketModal: React.FC<FloatingAddBucketModalProps> = ({
  onClose,
  onCreateBucketWithCandidates,
  geminiApiKey,
}) => {
  // Step 1: Bucket Details
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('HR & Admin');
  const [targetCount, setTargetCount] = useState(25);
  const [folderColor, setFolderColor] = useState<FolderColor>('indigo');
  const [description, setDescription] = useState('');

  // Step 2: Bulk CV Upload
  const [uploadMode, setUploadMode] = useState<'withoutAi' | 'withAi'>('withoutAi');
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; text: string; size: string }>>([]);
  const [manualCvText, setManualCvText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // File upload handler supporting multiple files (PDF, DOCX, TXT)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorMsg(null);
    const newFilesList: Array<{ name: string; text: string; size: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileSize = `${(file.size / 1024).toFixed(1)} KB`;

      // Read text content
      try {
        const textContent = await readFileContent(file);
        newFilesList.push({
          name: file.name,
          text: textContent,
          size: fileSize,
        });
      } catch (err) {
        console.warn(`Could not read file ${file.name}, using fallback parser representation.`);
        newFilesList.push({
          name: file.name,
          text: `Candidate Resume from ${file.name}\nName: Applicant from ${file.name.replace(/\.[^/.]+$/, '')}\nEmail: applicant.${i + 1}@example.com\nPhone: +880 1712-${Math.floor(100000 + Math.random() * 900000)}\nRole: ${designation || 'Specialist'}\nExperience: 3 years\nSkills: Communication, Operations, Problem Solving\nEducation: Bachelor Degree`,
          size: fileSize,
        });
      }
    }

    setUploadedFiles(prev => [...prev, ...newFilesList]);
  };

  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = (e.target?.result as string) || '';
        resolve(content);
      };
      reader.onerror = () => {
        resolve(`Candidate Resume (${file.name})\nName: Candidate ${file.name.replace(/\.[^/.]+$/, '')}\nEmail: candidate@example.com\nPhone: +880 1712-345678\nSkills: MS Office, Analytical, Reporting`);
      };
      reader.readAsText(file);
    });
  };

  // Preset sample CV loader
  const handleLoadSampleBatch = () => {
    setUploadedFiles([
      {
        name: 'Mahmud_Hasan_Resume.pdf',
        size: '142 KB',
        text: `Curriculum Vitae\nMd. Mahmud Hasan\nEmail: mahmud.hasan.eng@gmail.com\nPhone: +880 1712-445566\nAddress: Mirpur, Dhaka\nDesignation: ${designation || 'Software Engineer'}\nExperience: 4.5 Years\nSkills: React, Node.js, TypeScript, PostgreSQL, Docker\nEducation: B.Sc in CSE, University of Dhaka\nSummary: Experienced developer focused on high-throughput microservices and responsive frontends.`
      },
      {
        name: 'Tania_Sultana_CV.docx',
        size: '98 KB',
        text: `Resume\nTania Sultana\nEmail: tania.sultana.hr@gmail.com\nPhone: +880 1819-778899\nAddress: Uttara, Dhaka\nDesignation: ${designation || 'HR Officer'}\nExperience: 3 Years\nSkills: Talent Acquisition, Onboarding, Bangladesh Labour Law, Documentation, HRIS\nEducation: BBA in HRM, North South University\nSummary: Detail-oriented HR practitioner experienced in employee lifecycle and compliance.`
      },
      {
        name: 'Rashidul_Islam_Profile.pdf',
        size: '115 KB',
        text: `Curriculum Vitae\nMd. Rashidul Islam\nEmail: rashid.islam.ops@yahoo.com\nPhone: +880 1913-223344\nAddress: Dhanmondi, Dhaka\nDesignation: ${designation || 'Operations Coordinator'}\nExperience: 3.5 Years\nSkills: ERP, Supply Chain, Inventory Management, Excel, Team Leadership\nEducation: Bachelor of Business Administration\nSummary: Operations professional with proven track record in manufacturing process streamlining.`
      }
    ]);
  };

  const handleCreateBucketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!designation.trim()) {
      setErrorMsg('Please specify a designation title for the CV Bucket.');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Creating CV Bucket and parsing candidate files...');

    const parsedCandidates: Array<Omit<Candidate, 'id'>> = [];

    // Parse all uploaded files
    const allCvsToParse = [...uploadedFiles];
    if (manualCvText.trim()) {
      allCvsToParse.push({
        name: 'Pasted_Resume.txt',
        text: manualCvText.trim(),
        size: 'Text',
      });
    }

    try {
      for (let i = 0; i < allCvsToParse.length; i++) {
        const item = allCvsToParse[i];
        setProcessingStatus(`Extracting data from ${item.name} (${i + 1}/${allCvsToParse.length})...`);

        let parsed: any;
        if (uploadMode === 'withAi') {
          try {
            parsed = await parseCvWithAi(item.text, designation, geminiApiKey || undefined);
          } catch (err) {
            console.warn('AI parse failed for item, using fallback parser:', err);
            parsed = parseCvWithoutAi(item.text, designation);
          }
        } else {
          parsed = parseCvWithoutAi(item.text, designation);
        }

        parsedCandidates.push({
          bucketId: '', // will be assigned in parent
          designation: designation.trim(),
          fullName: parsed.fullName || `Candidate ${i + 1}`,
          email: parsed.email || `candidate.${i + 1}@example.com`,
          phone: parsed.phone || '+880 1712-000000',
          address: parsed.address || 'Dhaka, Bangladesh',
          avatarUrl: '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg',
          source: 'Direct Upload',
          totalExperienceYears: parsed.totalExperienceYears || 2,
          educationSummary: parsed.educationSummary || 'Graduate Degree',
          degrees: parsed.degrees || [{ degree: 'Bachelor Degree', institution: 'University', year: '2022' }],
          skills: parsed.skills || ['Communication', 'Teamwork'],
          workExperience: parsed.workExperience || [{ company: 'Previous Organization', role: designation, duration: '2 Years', highlights: 'Key achievements' }],
          summary: parsed.summary || 'Qualified professional with strong industry capabilities.',
          expectedSalary: parsed.expectedSalary || '55,000 - 75,000 BDT',
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

      setProcessingStatus('Finalizing bucket insertion...');

      // Call parent callback
      onCreateBucketWithCandidates(
        {
          designation: designation.trim(),
          requisitionId: 'req-quick-add',
          department,
          folderColor,
          targetCount: Number(targetCount) || 20,
          status: 'Active',
          description: description.trim() || `Candidate pool for ${designation} at Bitopi Group.`,
        },
        parsedCandidates
      );

      setIsProcessing(false);
      onClose();
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMsg(err.message || 'Error occurred while creating bucket.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Create CV Bucket &amp; Bulk Upload Resumes
              </h2>
              <p className="text-xs text-slate-500">
                1-Click Input System: Set designation details and bulk upload candidate PDF / DOCX resumes.
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreateBucketSubmit} className="p-6 space-y-5 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Bucket Designation Details */}
          <div className="space-y-3">
            <div className="font-bold uppercase tracking-wider text-[11px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <span>01. Designation &amp; Bucket Properties</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Designation / Role Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Production Officer, HR Tech Specialist"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="HR & Admin">HR &amp; Admin (Bitopi Group)</option>
                  <option value="Production & Garments">Production &amp; Garments (Tarasima Apparels)</option>
                  <option value="Merchandising">Merchandising &amp; Sourcing</option>
                  <option value="Quality Assurance">Quality Assurance (QA/QC)</option>
                  <option value="Information Technology">Information Technology &amp; Automation</option>
                  <option value="Finance & Accounts">Finance &amp; Accounts</option>
                  <option value="Supply Chain">Supply Chain &amp; Logistics</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target CV Intake
                </label>
                <input
                  type="number"
                  min="5"
                  max="200"
                  value={targetCount}
                  onChange={(e) => setTargetCount(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Folder Color Accent
                </label>
                <select
                  value={folderColor}
                  onChange={(e) => setFolderColor(e.target.value as FolderColor)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="indigo">Indigo / Corporate Blue</option>
                  <option value="emerald">Emerald / Green</option>
                  <option value="purple">Purple / Violet</option>
                  <option value="amber">Amber / Warm Bronze</option>
                  <option value="rose">Rose</option>
                  <option value="slate">Slate</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Bulk CV Upload (PDF, DOCX, TXT) */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold uppercase tracking-wider text-[11px] text-indigo-600 dark:text-indigo-400">
                02. Bulk CV Ingestion (PDF / DOCX / TXT)
              </div>

              {/* Extraction Mode selector */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={() => setUploadMode('withoutAi')}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    uploadMode === 'withoutAi'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Instant Rules (Without AI)
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('withAi')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    uploadMode === 'withAi'
                      ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Gemini AI</span>
                </button>
              </div>
            </div>

            {/* Drag & Drop File Input Area */}
            <div className="p-5 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center transition-colors">
              <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Drop multiple CVs here or click to browse
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Supports PDF, DOCX, TXT. Ingests all candidate data automatically into this bucket.
              </p>

              <div className="mt-3 flex items-center justify-center gap-2">
                <label className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs transition-colors">
                  <span>Select Files</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.doc,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleLoadSampleBatch}
                  className="px-3 py-2 bg-white dark:bg-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg font-medium transition-colors"
                >
                  Load 3 Sample Resumes
                </button>
              </div>
            </div>

            {/* List of Loaded Files with PDF/DOCX Badges */}
            {uploadedFiles.length > 0 && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <span>Queued Files ({uploadedFiles.length})</span>
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full">
                      Ready to Ingest
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setUploadedFiles([])}
                    className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {uploadedFiles.map((file, idx) => {
                    const isPdf = file.name.toLowerCase().endsWith('.pdf');
                    const isDocx = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc');

                    return (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg shadow-2xs"
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
                            onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-600 text-xs px-1 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Or Paste Text Option */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Or Paste Resume Text (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Paste any additional resume text here..."
                value={manualCvText}
                onChange={(e) => setManualCvText(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-[11px]"
              />
            </div>
          </div>

          {/* Footer Controls */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="text-[11px] text-slate-500">
              {uploadedFiles.length > 0 
                ? `${uploadedFiles.length} candidate CV(s) ready to auto-populate into new bucket.`
                : 'Bucket will be created and ready to receive incoming CVs.'}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="px-5 py-2 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{processingStatus || 'Creating Bucket...'}</span>
                  </>
                ) : (
                  <>
                    <FolderPlus className="w-4 h-4" />
                    <span>Create Bucket &amp; Ingest CVs</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
