import React from 'react';
import { 
  X, 
  Mail, 
  Phone, 
  MapPin, 
  Briefcase, 
  GraduationCap, 
  Star, 
  Calendar, 
  MessageSquare, 
  CheckCircle, 
  FileText,
  UserCheck,
  Building,
  DollarSign
} from 'lucide-react';
import { Candidate } from '../types';

interface CandidateDetailModalProps {
  candidate: Candidate;
  onClose: () => void;
  onOpenCallingModal: (candidate: Candidate) => void;
  onOpenMessageModal: (candidate: Candidate) => void;
  onOpenPrimaryModal: (candidate: Candidate) => void;
  onOpenSecondaryModal: (candidate: Candidate) => void;
  onOpenOnboardModal: (candidate: Candidate) => void;
}

export const CandidateDetailModal: React.FC<CandidateDetailModalProps> = ({
  candidate,
  onClose,
  onOpenCallingModal,
  onOpenMessageModal,
  onOpenPrimaryModal,
  onOpenSecondaryModal,
  onOpenOnboardModal,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <img 
              src={candidate.avatarUrl || '/src/assets/images/candidate_placeholder_avatar_1793850304562.jpg'} 
              alt={candidate.fullName}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-xl object-cover border-2 border-indigo-100 dark:border-indigo-900 shadow-xs"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {candidate.fullName}
                </h2>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                  {candidate.fitRating}% Fit Rating
                </span>
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-0.5">
                {candidate.designation} · {candidate.totalExperienceYears} yrs experience
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> {candidate.email}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> {candidate.phone}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {candidate.address}
                </span>
              </div>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Tabs / Body */}
        <div className="p-6 space-y-6 text-xs">
          {/* Executive Summary */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-indigo-500" />
              <span>Professional Summary</span>
            </h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
              {candidate.summary}
            </p>
          </div>

          {/* Key Skills */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider mb-2">
              Extracted Core Competencies &amp; Skills
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {candidate.skills.map((skill) => (
                <span 
                  key={skill}
                  className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Work Experience Timeline */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-indigo-500" />
              <span>Work Experience</span>
            </h3>
            <div className="space-y-2.5">
              {candidate.workExperience.map((exp, idx) => (
                <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
                    <span>{exp.role} · {exp.company}</span>
                    <span className="font-mono text-slate-500 text-[11px]">{exp.duration}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 mt-1">
                    {exp.highlights}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Education & Academic Credentials */}
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
              <span>Education</span>
            </h3>
            <div className="space-y-2">
              {candidate.degrees.map((deg, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{deg.degree}</div>
                    <div className="text-slate-500">{deg.institution}</div>
                  </div>
                  <span className="font-mono text-slate-500 text-[11px]">{deg.year}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Interview Rounds & Candidate Feedback */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            {/* Primary Interview status card */}
            <div className="p-3 bg-violet-50/50 dark:bg-violet-950/20 rounded-lg border border-violet-100 dark:border-violet-900">
              <div className="flex items-center justify-between font-bold text-violet-900 dark:text-violet-300">
                <span>Primary Interview</span>
                <span className="font-mono">{candidate.primaryStatus}</span>
              </div>
              <div className="text-slate-600 dark:text-slate-400 mt-1">
                Interviewer: {candidate.primaryInterviewer || 'TBD'}
              </div>
              {candidate.primaryFeedback && (
                <div className="mt-1 text-slate-700 dark:text-slate-300 italic">
                  "{candidate.primaryFeedback}"
                </div>
              )}
              {candidate.primaryCandidateReview && (
                <div className="mt-2 pt-2 border-t border-violet-200 dark:border-violet-800 text-[11px] text-violet-800 dark:text-violet-300">
                  <span className="font-semibold">Candidate's Review:</span> {candidate.primaryCandidateReview.rating}/5 stars - "{candidate.primaryCandidateReview.comments}"
                </div>
              )}
            </div>

            {/* Secondary Interview status card */}
            <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-lg border border-purple-100 dark:border-purple-900">
              <div className="flex items-center justify-between font-bold text-purple-900 dark:text-purple-300">
                <span>Secondary / Final Interview</span>
                <span className="font-mono">{candidate.secondaryStatus}</span>
              </div>
              <div className="text-slate-600 dark:text-slate-400 mt-1">
                Interviewer: {candidate.secondaryInterviewer || 'TBD'}
              </div>
              {candidate.secondaryFeedback && (
                <div className="mt-1 text-slate-700 dark:text-slate-300 italic">
                  "{candidate.secondaryFeedback}"
                </div>
              )}
              {candidate.secondaryCandidateReview && (
                <div className="mt-2 pt-2 border-t border-purple-200 dark:border-purple-800 text-[11px] text-purple-800 dark:text-purple-300">
                  <span className="font-semibold">Candidate's Review:</span> {candidate.secondaryCandidateReview.rating}/5 stars - "{candidate.secondaryCandidateReview.comments}"
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            Source: <span className="font-medium text-slate-700 dark:text-slate-300">{candidate.source}</span> · Submitted {candidate.submissionDate}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenCallingModal(candidate);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-100 rounded-md border border-slate-200 dark:border-slate-600 transition-colors"
            >
              Log Phone Call
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenMessageModal(candidate);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 rounded-md border border-sky-200 dark:border-sky-800 transition-colors"
            >
              Send Message
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenPrimaryModal(candidate);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/60 hover:bg-violet-100 rounded-md border border-violet-200 dark:border-violet-800 transition-colors"
            >
              Primary Interview
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenSecondaryModal(candidate);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 rounded-md border border-purple-200 dark:border-purple-800 transition-colors"
            >
              Secondary Interview
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenOnboardModal(candidate);
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-xs transition-colors"
            >
              Final Hire &amp; Onboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
