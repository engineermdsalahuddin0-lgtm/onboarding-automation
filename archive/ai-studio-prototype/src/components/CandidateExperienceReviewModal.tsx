import React, { useState } from 'react';
import { Star, MessageSquare, CheckCircle, ShieldCheck, Heart } from 'lucide-react';
import { Candidate, CandidateReview } from '../types';

interface CandidateExperienceReviewModalProps {
  candidate: Candidate;
  stage: 'Primary' | 'Secondary';
  onSaveReview: (candidateId: string, stage: 'Primary' | 'Secondary', review: CandidateReview) => void;
  onClose: () => void;
}

export const CandidateExperienceReviewModal: React.FC<CandidateExperienceReviewModalProps> = ({
  candidate,
  stage,
  onSaveReview,
  onClose,
}) => {
  const existingReview = stage === 'Primary' 
    ? candidate.primaryCandidateReview 
    : candidate.secondaryCandidateReview;

  const [rating, setRating] = useState<number>(existingReview?.rating || 5);
  const [clarity, setClarity] = useState<number>(existingReview?.clarity || 5);
  const [respectfulness, setRespectfulness] = useState<number>(existingReview?.respectfulness || 5);
  const [comments, setComments] = useState<string>(
    existingReview?.comments || 'The interview questions were thoroughly professional and directly tested core competencies. Excellent communication from the team.'
  );
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newReview: CandidateReview = {
      stage,
      rating,
      clarity,
      respectfulness,
      comments: comments.trim(),
      submittedAt: new Date().toLocaleString(),
      candidateName: candidate.fullName,
    };

    onSaveReview(candidate.id, stage, newReview);
    setSubmitted(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Candidate Feedback System
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {stage} Interview Experience Review Form
            </h3>
            <p className="text-xs text-slate-500">
              Submitted for candidate: <span className="font-semibold text-slate-700 dark:text-slate-300">{candidate.fullName}</span> ({candidate.designation})
            </p>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Candidate Feedback Logged Successfully
            </h4>
            <p className="text-xs text-slate-500">
              Thank you for keeping our interview experience transparent and candidate-friendly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
            {/* Rating 1: Overall Experience */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-800">
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                1. Overall Interview Experience
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= rating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-slate-600'
                      }`}
                    />
                  </button>
                ))}
                <span className="ml-2 font-mono tabular-nums text-slate-600 dark:text-slate-400 font-semibold">
                  {rating}/5
                </span>
              </div>
            </div>

            {/* Rating 2: Clarity of Process */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-800">
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                2. Clarity of Job Role &amp; Expectations Explained
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setClarity(star)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= clarity
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-slate-600'
                      }`}
                    />
                  </button>
                ))}
                <span className="ml-2 font-mono tabular-nums text-slate-600 dark:text-slate-400 font-semibold">
                  {clarity}/5
                </span>
              </div>
            </div>

            {/* Rating 3: Respectfulness & Professionalism */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-800">
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                3. Recruiter / Interviewer Respectfulness &amp; Punctuality
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRespectfulness(star)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= respectfulness
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-slate-600'
                      }`}
                    />
                  </button>
                ))}
                <span className="ml-2 font-mono tabular-nums text-slate-600 dark:text-slate-400 font-semibold">
                  {respectfulness}/5
                </span>
              </div>
            </div>

            {/* Feedback textarea */}
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Candidate's Written Comments &amp; Review Notes
              </label>
              <textarea
                rows={3}
                required
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="What went well? Any areas of improvement in the interview process?"
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
                className="px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
              >
                Save Review
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
