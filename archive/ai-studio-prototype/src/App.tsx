import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DashboardOverview } from './components/DashboardOverview';
import { BlockA_Requisitions } from './components/BlockA_Requisitions';
import { BlockB_CvBuckets } from './components/BlockB_CvBuckets';
import { BlockC_SelectedDatabase } from './components/BlockC_SelectedDatabase';
import { CompanyApplicationModal } from './components/CompanyApplicationModal';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { FloatingActionButton } from './components/FloatingActionButton';
import { FloatingAddBucketModal } from './components/FloatingAddBucketModal';
import { Footer } from './components/Footer';
import { Storage } from './lib/storage';
import { 
  Requisition, 
  JobPosting, 
  CvBucket, 
  Candidate, 
  SupabaseConfig 
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'blockA' | 'blockB' | 'blockC'>('dashboard');
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null);

  // Core Data States
  const [requisitions, setRequisitions] = useState<Requisition[]>(() => Storage.getRequisitions());
  const [jobPostings, setJobPostings] = useState<JobPosting[]>(() => Storage.getJobPostings());
  const [cvBuckets, setCvBuckets] = useState<CvBucket[]>(() => Storage.getCvBuckets());
  const [candidates, setCandidates] = useState<Candidate[]>(() => Storage.getCandidates());
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig>(() => Storage.getSupabaseConfig());
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => Storage.getGeminiApiKey());

  // Modals
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFloatingAddModal, setShowFloatingAddModal] = useState(false);

  // Ensure pure white background across all viewports
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  // Persist handlers
  const handleAddRequisition = (newReq: Omit<Requisition, 'id' | 'createdAt'>) => {
    const item: Requisition = {
      ...newReq,
      id: `req-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    const updated = [item, ...requisitions];
    setRequisitions(updated);
    Storage.saveRequisitions(updated);
  };

  const handleUpdateRequisition = (req: Requisition) => {
    const updated = requisitions.map(r => r.id === req.id ? req : r);
    setRequisitions(updated);
    Storage.saveRequisitions(updated);
  };

  const handleDeleteRequisition = (id: string) => {
    const updated = requisitions.filter(r => r.id !== id);
    setRequisitions(updated);
    Storage.saveRequisitions(updated);
  };

  const handleAddJobPosting = (posting: Omit<JobPosting, 'id'>) => {
    const item: JobPosting = {
      ...posting,
      id: `post-${Date.now()}`,
    };
    const updated = [item, ...jobPostings];
    setJobPostings(updated);
    Storage.saveJobPostings(updated);
  };

  const handleDeleteJobPosting = (id: string) => {
    const updated = jobPostings.filter(p => p.id !== id);
    setJobPostings(updated);
    Storage.saveJobPostings(updated);
  };

  const handleCreateBucket = (bucket: Omit<CvBucket, 'id' | 'createdAt'>) => {
    const item: CvBucket = {
      ...bucket,
      id: `bucket-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    const updated = [...cvBuckets, item];
    setCvBuckets(updated);
    Storage.saveCvBuckets(updated);
    setSelectedBucketId(item.id);
  };

  const handleCreateBucketFromReq = (req: Requisition) => {
    // Check if bucket already exists
    const existing = cvBuckets.find(b => b.requisitionId === req.id || b.designation.toLowerCase() === req.designation.toLowerCase());
    if (existing) {
      setSelectedBucketId(existing.id);
      setActiveTab('blockB');
      return;
    }

    const newBucket: CvBucket = {
      id: `bucket-${Date.now()}`,
      designation: req.designation,
      requisitionId: req.id,
      department: req.department,
      folderColor: 'indigo',
      createdAt: new Date().toISOString().split('T')[0],
      targetCount: req.vacanciesCount * 15,
      status: 'Active',
      description: req.jobDescription || `CV pool for ${req.designation}.`,
    };

    const updated = [...cvBuckets, newBucket];
    setCvBuckets(updated);
    Storage.saveCvBuckets(updated);
    setSelectedBucketId(newBucket.id);
    setActiveTab('blockB');
  };

  const handleCreateBucketWithCandidates = (
    bucketData: Omit<CvBucket, 'id' | 'createdAt'>,
    candidatesData: Array<Omit<Candidate, 'id'>>
  ) => {
    const bucketId = `bucket-${Date.now()}`;
    const newBucket: CvBucket = {
      ...bucketData,
      id: bucketId,
      createdAt: new Date().toISOString().split('T')[0],
    };

    const updatedBuckets = [...cvBuckets, newBucket];
    setCvBuckets(updatedBuckets);
    Storage.saveCvBuckets(updatedBuckets);

    if (candidatesData.length > 0) {
      const newCandidatesList: Candidate[] = candidatesData.map((c, idx) => ({
        ...c,
        id: `cand-${Date.now()}-${idx}`,
        bucketId: bucketId,
        designation: newBucket.designation,
      }));
      const updatedCandidates = [...newCandidatesList, ...candidates];
      setCandidates(updatedCandidates);
      Storage.saveCandidates(updatedCandidates);
    }

    setSelectedBucketId(bucketId);
    setActiveTab('blockB');
  };

  const handleAddCandidate = (newCand: Omit<Candidate, 'id'>) => {
    const item: Candidate = {
      ...newCand,
      id: `cand-${Date.now()}`,
    };
    const updated = [item, ...candidates];
    setCandidates(updated);
    Storage.saveCandidates(updated);
  };

  const handleUpdateCandidate = (cand: Candidate) => {
    const updated = candidates.map(c => c.id === cand.id ? cand : c);
    setCandidates(updated);
    Storage.saveCandidates(updated);
  };

  const handleDeleteCandidate = (id: string) => {
    const updated = candidates.filter(c => c.id !== id);
    setCandidates(updated);
    Storage.saveCandidates(updated);
  };

  const handleResetData = () => {
    Storage.resetToDefaults();
    setRequisitions(Storage.getRequisitions());
    setJobPostings(Storage.getJobPostings());
    setCvBuckets(Storage.getCvBuckets());
    setCandidates(Storage.getCandidates());
  };

  const hiredCandidateCount = candidates.filter(
    c => c.overallStatus === 'Final Selected' || c.overallStatus === 'Hired'
  ).length;

  return (
    <div className="min-h-screen bg-white text-slate-900 transition-colors">
      {/* Universal Top Bar - Minimalist with Bitopi Logo, Overview, CV Buckets, & Bulk Ingest */}
      <Header
        activeTab={activeTab === 'blockB' ? 'blockB' : 'dashboard'}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'blockB') {
            setSelectedBucketId(null);
          }
        }}
        onOpenCompanyForm={() => setShowCompanyForm(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenBulkUpload={() => setShowFloatingAddModal(true)}
        totalCvCount={candidates.length}
        hiredCount={hiredCandidateCount}
      />

      {/* Main Workspace Viewport */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 bg-white">
        {activeTab === 'dashboard' && (
          <DashboardOverview
            requisitions={requisitions}
            jobPostings={jobPostings}
            cvBuckets={cvBuckets}
            candidates={candidates}
            onSelectBucket={(id) => {
              setSelectedBucketId(id);
              setActiveTab('blockB');
            }}
            onNavigateTab={(tab) => {
              setActiveTab(tab);
            }}
            onOpenCompanyForm={() => setShowCompanyForm(true)}
            onBulkUpload={(bId) => {
              if (bId) setSelectedBucketId(bId);
              setShowFloatingAddModal(true);
            }}
            onUpdateCandidate={handleUpdateCandidate}
          />
        )}

        {activeTab === 'blockA' && (
          <BlockA_Requisitions
            requisitions={requisitions}
            jobPostings={jobPostings}
            onAddRequisition={handleAddRequisition}
            onUpdateRequisition={handleUpdateRequisition}
            onDeleteRequisition={handleDeleteRequisition}
            onAddJobPosting={handleAddJobPosting}
            onDeleteJobPosting={handleDeleteJobPosting}
            onCreateBucketFromReq={handleCreateBucketFromReq}
          />
        )}

        {activeTab === 'blockB' && (
          <BlockB_CvBuckets
            cvBuckets={cvBuckets}
            candidates={candidates}
            requisitions={requisitions}
            selectedBucketId={selectedBucketId}
            onSelectBucket={setSelectedBucketId}
            onAddCandidate={handleAddCandidate}
            onUpdateCandidate={handleUpdateCandidate}
            onDeleteCandidate={handleDeleteCandidate}
            onCreateBucket={handleCreateBucket}
            onNavigateToBlockC={() => setActiveTab('blockC')}
            onOpenCompanyForm={() => setShowCompanyForm(true)}
            geminiApiKey={geminiApiKey}
          />
        )}

        {activeTab === 'blockC' && (
          <BlockC_SelectedDatabase
            candidates={candidates}
            onUpdateCandidate={handleUpdateCandidate}
            onDeleteCandidate={handleDeleteCandidate}
          />
        )}
      </main>

      {/* Bitopi Group Footer with 50 Years & Beyond Logo */}
      <Footer />

      {/* FLOATING ACTION BUTTON (Always accessible to create bucket + bulk CVs) */}
      <FloatingActionButton onClick={() => setShowFloatingAddModal(true)} />

      {/* MODAL: ALL-IN-ONE FLOATING ADD BUCKET & BULK CV INGESTION */}
      {showFloatingAddModal && (
        <FloatingAddBucketModal
          onClose={() => setShowFloatingAddModal(false)}
          onCreateBucketWithCandidates={handleCreateBucketWithCandidates}
          geminiApiKey={geminiApiKey}
        />
      )}

      {/* MODAL: PUBLIC COMPANY JOB APPLICATION FORM */}
      {showCompanyForm && (
        <CompanyApplicationModal
          cvBuckets={cvBuckets}
          onAddCandidate={handleAddCandidate}
          onClose={() => setShowCompanyForm(false)}
        />
      )}

      {/* MODAL: SUPABASE & INTEGRATION SETTINGS */}
      {showSettings && (
        <SupabaseConfigModal
          config={supabaseConfig}
          onSaveConfig={(cfg) => {
            setSupabaseConfig(cfg);
            Storage.saveSupabaseConfig(cfg);
          }}
          geminiKey={geminiApiKey}
          onSaveGeminiKey={(k) => {
            setGeminiApiKey(k);
            Storage.saveGeminiApiKey(k);
          }}
          onResetData={handleResetData}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
