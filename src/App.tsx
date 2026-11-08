import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner, ToastProvider } from './components/ui';
import { backendMisconfigured } from './lib/backend';
import { StoreProvider, useStore } from './lib/store';
import { AccessPending, LoginPage, SetupRequired } from './pages/Auth';
import { DashboardPage } from './pages/Dashboard';

const RequisitionsPage = lazy(() => import('./pages/Requisitions').then((m) => ({ default: m.RequisitionsPage })));
const BucketsPage = lazy(() => import('./pages/Buckets').then((m) => ({ default: m.BucketsPage })));
const BucketDetailPage = lazy(() => import('./pages/BucketDetail').then((m) => ({ default: m.BucketDetailPage })));
const SelectedPage = lazy(() => import('./pages/Selected').then((m) => ({ default: m.SelectedPage })));
const DocumentsPage = lazy(() => import('./pages/Documents').then((m) => ({ default: m.DocumentsPage })));
const ReviewsPage = lazy(() => import('./pages/Reviews').then((m) => ({ default: m.ReviewsPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const QuestionsPage = lazy(() => import('./pages/Questions').then((m) => ({ default: m.QuestionsPage })));
const QuestionPaperPage = lazy(() => import('./pages/Questions').then((m) => ({ default: m.QuestionPaperPage })));
const ActivityPage = lazy(() => import('./pages/Activity').then((m) => ({ default: m.ActivityPage })));
const ApplyPage = lazy(() => import('./pages/PublicForms').then((m) => ({ default: m.ApplyPage })));
const ReviewFormPage = lazy(() => import('./pages/PublicForms').then((m) => ({ default: m.ReviewFormPage })));

function Staff() {
  const { user, loadingUser, loadingData, loadError } = useStore();
  if (loadingUser) return <Spinner />;
  if (!user) return <LoginPage />;
  if (user.role === 'pending') return <AccessPending />;

  return (
    <Routes>
      <Route path="/selected/:id/documents" element={<Suspense fallback={<Spinner />}><DocumentsPage /></Suspense>} />
      <Route path="/questions/paper" element={<Suspense fallback={<Spinner />}><QuestionPaperPage /></Suspense>} />
      <Route element={<Layout />}>
        <Route
          path="*"
          element={
            loadError ? (
              <div role="alert" className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                The data could not be loaded: {loadError}. If the database was just created, check that
                supabase/schema.sql has been run in the SQL Editor.
              </div>
            ) : loadingData ? (
              <Spinner label="Loading data" />
            ) : (
              <Suspense fallback={<Spinner />}>
                <Routes>
                  <Route index element={<DashboardPage />} />
                  <Route path="requisitions" element={<RequisitionsPage />} />
                  <Route path="buckets" element={<BucketsPage />} />
                  <Route path="buckets/:id" element={<BucketDetailPage />} />
                  <Route path="selected" element={<SelectedPage />} />
                  <Route path="reviews" element={<ReviewsPage />} />
                  <Route path="questions" element={<QuestionsPage />} />
                  <Route path="activity" element={<ActivityPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            )
          }
        />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (backendMisconfigured) return <SetupRequired />;
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public pages: candidates reach these from a link, with no account. */}
          <Route path="/apply/:code" element={<Suspense fallback={<Spinner />}><ApplyPage /></Suspense>} />
          <Route path="/review/:token" element={<Suspense fallback={<Spinner />}><ReviewFormPage /></Suspense>} />
          <Route
            path="*"
            element={
              <StoreProvider>
                <Staff />
              </StoreProvider>
            }
          />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
