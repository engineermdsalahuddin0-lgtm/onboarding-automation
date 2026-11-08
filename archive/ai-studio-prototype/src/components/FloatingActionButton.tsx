import React from 'react';
import { FolderPlus, Sparkles } from 'lucide-react';

interface FloatingActionButtonProps {
  onClick: () => void;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({ onClick }) => {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
      <button
        onClick={onClick}
        className="group relative flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
        aria-label="Create New CV Bucket"
      >
        <FolderPlus className="w-5 h-5 transition-transform group-hover:rotate-6" />
        <span className="font-bold text-xs sm:text-sm tracking-wide whitespace-nowrap">
          + New CV Bucket
        </span>
        <span className="hidden sm:inline-block text-[11px] font-normal px-2 py-0.5 rounded-full bg-white/20 text-white">
          Bulk Upload
        </span>

        {/* Ambient ping effect on first load */}
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
        </span>
      </button>
    </div>
  );
};
