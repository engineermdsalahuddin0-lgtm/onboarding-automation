import React, { useState } from 'react';
import { 
  Database, 
  Key, 
  CheckCircle2, 
  Copy, 
  Check, 
  X, 
  RefreshCw, 
  ShieldCheck, 
  AlertCircle,
  FileCode,
  HardDrive
} from 'lucide-react';
import { SupabaseConfig } from '../types';
import { Storage } from '../lib/storage';

interface SupabaseConfigModalProps {
  config: SupabaseConfig;
  onSaveConfig: (config: SupabaseConfig) => void;
  geminiKey: string;
  onSaveGeminiKey: (key: string) => void;
  onResetData: () => void;
  onClose: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  config,
  onSaveConfig,
  geminiKey,
  onSaveGeminiKey,
  onResetData,
  onClose,
}) => {
  const [url, setUrl] = useState(config.url || '');
  const [anonKey, setAnonKey] = useState(config.anonKey || '');
  const [enabled, setEnabled] = useState(config.enabled);
  const [aiKey, setAiKey] = useState(geminiKey || '');
  const [copiedSql, setCopiedSql] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const sqlSchema = Storage.generateSupabaseSql();

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlSchema);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      url: url.trim(),
      anonKey: anonKey.trim(),
      enabled,
      lastSyncedAt: new Date().toISOString(),
    });
    onSaveGeminiKey(aiKey.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl p-6 sm:p-8 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Database &amp; Integration Settings
              </h2>
              <p className="text-xs text-slate-500">
                Configure Supabase Cloud PostgreSQL, Gemini API keys, and local caching.
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

        <form onSubmit={handleSave} className="mt-5 space-y-5 text-xs">
          {/* Supabase Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600" />
                <span className="font-bold text-slate-900 dark:text-white">Supabase Cloud Database</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-medium text-slate-700 dark:text-slate-300 text-xs">
                  Enable Supabase Sync
                </span>
              </label>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Supabase Project URL
              </label>
              <input
                type="url"
                placeholder="https://xyzcompany.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Supabase Anon / Public API Key
              </label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          {/* Gemini AI Key Section */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-600" />
              <span className="font-bold text-slate-900 dark:text-white">Gemini AI API Key (For AI CV Parsing)</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Your server includes built-in Gemini capabilities. You can optionally supply your personal key for higher quotas.
            </p>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
            />
          </div>

          {/* Pre-written SQL Schema for Supabase */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <span className="font-bold text-slate-900 dark:text-white">Supabase PostgreSQL DDL Migration SQL</span>
              </div>
              <button
                type="button"
                onClick={handleCopySql}
                className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-700 hover:bg-slate-100 rounded text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 text-[11px] font-semibold"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Copied SQL!' : 'Copy SQL Script'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Run this in your Supabase SQL Editor to provision all tables: <code className="font-mono text-indigo-600">requisitions</code>, <code className="font-mono text-indigo-600">job_postings</code>, <code className="font-mono text-indigo-600">cv_buckets</code>, and <code className="font-mono text-indigo-600">candidates</code> with RLS security policies.
            </p>
            <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[10px] max-h-32 overflow-y-auto">
              <pre>{sqlSchema.slice(0, 450)}...</pre>
            </div>
          </div>

          {/* Reset sample data */}
          <div className="flex items-center justify-between p-3 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900 rounded-xl">
            <div>
              <div className="font-bold text-rose-900 dark:text-rose-300">Restore Default Mock Data</div>
              <div className="text-[11px] text-slate-500">Reset requisitions, postings, and candidates to standard realistic values.</div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm('Reset application data to initial defaults?')) {
                  onResetData();
                  onClose();
                }
              }}
              className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 rounded-lg font-semibold text-xs"
            >
              Reset Data
            </button>
          </div>

          {savedSuccess && (
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Settings saved successfully.</span>
            </div>
          )}

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
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
