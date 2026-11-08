import React from 'react';
import { 
  Layers, 
  FolderGit2, 
  FileText, 
  Settings, 
  Plus,
  Sparkles
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'dashboard' | 'blockB';
  setActiveTab: (tab: 'dashboard' | 'blockB') => void;
  onOpenCompanyForm: () => void;
  onOpenSettings: () => void;
  onOpenBulkUpload: () => void;
  totalCvCount: number;
  hiredCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenCompanyForm,
  onOpenSettings,
  onOpenBulkUpload,
  totalCvCount,
  hiredCount,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 transition-colors shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-6 h-16">
          {/* 1. Bitopi Group Tab Logo & Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <img 
              src="/assets/aistudio/bitopi_group_logo_for_tab_ae6c542e.jpg" 
              alt="Bitopi Group" 
              className="w-10 h-10 rounded-lg object-contain bg-white p-0.5 border border-slate-200 shadow-xs"
            />
            <div>
              <button 
                onClick={() => setActiveTab('dashboard')}
                className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap hover:opacity-90 block leading-tight text-left cursor-pointer"
              >
                Bitopi Group
              </button>
              <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase block">
                HR Onboarding Suite
              </span>
            </div>
          </div>

          {/* 2. Core Navigation: Overview & CV Buckets */}
          <nav className="flex items-center gap-2 text-sm font-semibold">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Overview</span>
              {totalCvCount > 0 && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono tabular-nums ${
                  activeTab === 'dashboard' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {totalCvCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('blockB')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'blockB'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FolderGit2 className="w-4 h-4" />
              <span>CV Buckets</span>
            </button>
          </nav>

          {/* 3. Bulk PDF/DOCX Upload Button */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={onOpenBulkUpload}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>+ Bulk Upload (PDF / DOCX)</span>
            </button>

            <button
              onClick={onOpenSettings}
              className="p-2 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Database & Settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
