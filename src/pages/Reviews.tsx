import { MessageSquareHeart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/ui';
import { useStore } from '../lib/store';

// The survey report itself is drawn by SurveyReport in Layout, so it starts loading at sign-in and is
// ready by the time anyone opens this page. This page only adds the heading.
export function ReviewsPage() {
  const { settings, isAdmin } = useStore();
  return (
    <>
      <PageHeader title="Candidate Reviews" description="What candidates said in the Candidate Experience Survey on Microsoft Forms." />
      {!settings.review_form_url && (
        <EmptyState
          icon={MessageSquareHeart}
          title="No survey linked yet"
          action={isAdmin ? <Link to="/settings" className="text-sm font-medium text-brand-700 hover:underline">Add it under Settings &gt; Company</Link> : undefined}
        >
          {isAdmin ? 'Paste the Microsoft Forms summary link under Settings > Company.' : 'Ask an admin to add the Microsoft Forms summary link under Settings > Company.'}
        </EmptyState>
      )}
    </>
  );
}
