import React, { useState } from 'react';
import { 
  Building, 
  Upload, 
  CheckCircle2, 
  X, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  FileText, 
  Award,
  Sparkles,
  Camera
} from 'lucide-react';
import { CvBucket, Candidate } from '../types';

interface CompanyApplicationModalProps {
  cvBuckets: CvBucket[];
  onAddCandidate: (candidate: Omit<Candidate, 'id'>) => void;
  onClose: () => void;
}

export const CompanyApplicationModal: React.FC<CompanyApplicationModalProps> = ({
  cvBuckets,
  onAddCandidate,
  onClose,
}) => {
  const [selectedBucketId, setSelectedBucketId] = useState<string>(cvBuckets[0]?.id || '');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('Dhaka, Bangladesh');
  const [experienceYears, setExperienceYears] = useState(3.0);
  const [educationSummary, setEducationSummary] = useState('B.Sc in CSE / BBA');
  const [skillsText, setSkillsText] = useState('React, TypeScript, Node.js, Problem Solving');
  const [summary, setSummary] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('80,000 BDT');
  const [noticePeriod, setNoticePeriod] = useState('30 Days');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);

  const targetBucket = cvBuckets.find(b => b.id === selectedBucketId) || cvBuckets[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !phone.trim()) return;

    const skills = skillsText.split(',').map(s => s.trim()).filter(Boolean);

    onAddCandidate({
      bucketId: targetBucket?.id || 'bucket-01',
      designation: targetBucket?.designation || 'Specialist',
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      avatarUrl: avatarUrl || '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg',
      source: 'Company Form',
      totalExperienceYears: Number(experienceYears) || 2,
      educationSummary: educationSummary.trim(),
      degrees: [{ degree: educationSummary.trim(), institution: 'University', year: '2022' }],
      skills: skills.length > 0 ? skills : ['Communication', 'Teamwork'],
      workExperience: [
        {
          company: 'Current / Previous Org',
          role: targetBucket?.designation || 'Professional',
          duration: `${experienceYears} yrs`,
          highlights: 'Handled key departmental objectives and projects.'
        }
      ],
      summary: summary.trim() || `Experienced professional with ${experienceYears} years background in ${targetBucket?.designation}.`,
      expectedSalary: expectedSalary.trim(),
      noticePeriod: noticePeriod.trim(),
      submissionDate: new Date().toISOString().split('T')[0],
      fitRating: 90,
      hasPhoto: Boolean(avatarUrl),
      overallStatus: 'New CV',
      isShortlisted: true,
      callingStatus: 'Pending',
      callNotes: '',
      messageStatus: 'Not Sent',
      primaryStatus: 'Not Scheduled',
      secondaryStatus: 'Not Scheduled',
    });

    setSubmitted(true);
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl p-6 sm:p-8 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
              TF
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Company Job Application Portal
              </h2>
              <p className="text-xs text-slate-500">
                Official career application form. Direct ingestion into the designated CV bucket.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Application Ingested Successfully!
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Your profile has been filed into the <strong>{targetBucket?.designation}</strong> bucket. You will now appear on the HR screening and calling dashboard.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
            {/* Position choice */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Select Applied Designation / Position *
              </label>
              <select
                value={selectedBucketId}
                onChange={(e) => setSelectedBucketId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-medium"
              >
                {cvBuckets.map((bucket) => (
                  <option key={bucket.id} value={bucket.id}>
                    {bucket.designation} — ({bucket.department})
                  </option>
                ))}
              </select>
            </div>

            {/* Candidate Photo / Avatar upload */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={avatarUrl || '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg'}
                  alt="Candidate Avatar Preview"
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-cover border border-slate-300 dark:border-slate-600"
                />
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    Candidate Profile Photo
                  </div>
                  <div className="text-[11px] text-slate-500">
                    PNG, JPG, or WebP. Attached to official joining documents.
                  </div>
                </div>
              </div>

              <label className="cursor-pointer px-3 py-1.5 bg-white dark:bg-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 dark:border-slate-600 font-semibold text-slate-700 dark:text-slate-200">
                <span>Choose Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setAvatarUrl(ev.target?.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            </div>

            {/* Full Name & Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Asif Mahmud"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number (Active for calls/WhatsApp) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. +880 1712-345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>

            {/* Email & Address */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. asif.dev@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Residential Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. Uttara Sector 11, Dhaka"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Experience & Degree */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Total Experience (Years)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="40"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Highest Academic Degree
                </label>
                <input
                  type="text"
                  placeholder="e.g. B.Sc in CSE, University of Dhaka"
                  value={educationSummary}
                  onChange={(e) => setEducationSummary(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Skills */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Core Competencies &amp; Skills (Comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. React, TypeScript, Node.js, Tailwind, System Architecture"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>

            {/* Salary & Notice */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Expected Monthly Salary
                </label>
                <input
                  type="text"
                  placeholder="e.g. 85,000 BDT"
                  value={expectedSalary}
                  onChange={(e) => setExpectedSalary(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notice Period
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1 Month / Immediate"
                  value={noticePeriod}
                  onChange={(e) => setNoticePeriod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Summary */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Candidate Bio / Profile Summary
              </label>
              <textarea
                rows={3}
                placeholder="Brief summary of achievements and career trajectory..."
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
              >
                Submit Application To HR Bucket
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
