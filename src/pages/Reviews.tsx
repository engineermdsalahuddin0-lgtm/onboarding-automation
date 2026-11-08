import { Copy, MessageSquareHeart, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { copyText } from '../components/PipelineDialogs';
import { Card, EmptyState, IconButton, PageHeader, Select, StatTile, Tabs, useToast } from '../components/ui';
import { dateMedium } from '../lib/format';
import { useStore } from '../lib/store';

function Stars({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label}: ${value} out of 5`} title={`${label}: ${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} aria-hidden className={`size-3.5 ${n <= value ? 'fill-amber-500 text-amber-500' : 'text-line-strong'}`} />)}
    </span>
  );
}

const average = (values: (number | null)[]) => {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? (present.reduce((a, b) => a + b, 0) / present.length).toFixed(1) : '-';
};

export function ReviewsPage() {
  const { reviews, candidates, buckets } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<'submitted' | 'waiting'>('submitted');
  const [stage, setStage] = useState('');
  const [bucketId, setBucketId] = useState('');

  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const bucketById = useMemo(() => new Map(buckets.map((b) => [b.id, b])), [buckets]);

  const scoped = reviews.filter((r) => {
    const candidate = candidateById.get(r.candidate_id);
    return candidate && (!stage || r.stage === stage) && (!bucketId || candidate.bucket_id === bucketId);
  });
  const submitted = scoped.filter((r) => r.submitted_at);
  const waiting = scoped.filter((r) => !r.submitted_at);
  const recommend = submitted.filter((r) => r.would_recommend !== null);
  const rate = recommend.length ? `${Math.round((recommend.filter((r) => r.would_recommend).length / recommend.length) * 100)}%` : '-';

  return (
    <>
      <PageHeader
        title="Candidate Reviews"
        description="What candidates say about their interview experience. Open a candidate's card and choose Ask for feedback to get the link."
        actions={
          <>
            <div className="w-40">
              <Select aria-label="Interview round" value={stage} onChange={(e) => setStage(e.target.value)}>
                <option value="">All rounds</option>
                <option value="primary">Primary</option>
                <option value="secondary">Final</option>
              </Select>
            </div>
            <div className="w-52">
              <Select aria-label="Position" value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
                <option value="">All positions</option>
                {buckets.map((b) => <option key={b.id} value={b.id}>{b.designation}</option>)}
              </Select>
            </div>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Overall" value={average(submitted.map((r) => r.overall))} hint={`${submitted.length} of ${scoped.length} answered`} />
        <StatTile label="Communication" value={average(submitted.map((r) => r.communication))} />
        <StatTile label="Professionalism" value={average(submitted.map((r) => r.professionalism))} />
        <StatTile label="Clear process" value={average(submitted.map((r) => r.clarity))} />
        <StatTile label="Would recommend" value={rate} />
        <StatTile label="Waiting for reply" value={waiting.length} />
      </div>

      <div className="mt-5">
        <Tabs
          label="Review status"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'submitted', label: 'Answered', count: submitted.length },
            { value: 'waiting', label: 'Waiting', count: waiting.length },
          ]}
        />
      </div>

      <div className="mt-4 space-y-3">
        {(tab === 'submitted' ? submitted : waiting).length === 0 && (
          <EmptyState icon={MessageSquareHeart} title={tab === 'submitted' ? 'No reviews yet' : 'No one to wait for'}>
            {tab === 'submitted' && 'Reviews appear here once candidates answer the private link.'}
          </EmptyState>
        )}
        {tab === 'submitted' && submitted.map((review) => {
          const candidate = candidateById.get(review.candidate_id)!;
          return (
            <Card key={review.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link to={{ search: `?candidate=${candidate.id}` }} className="text-sm font-semibold hover:underline">{candidate.full_name}</Link>
                  <p className="text-xs text-ink-muted">
                    {bucketById.get(candidate.bucket_id)?.designation} · {review.stage === 'primary' ? 'Primary' : 'Final'} interview · {dateMedium(review.submitted_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
                  <span className="flex items-center gap-1">Overall <Stars value={review.overall} label="Overall" /></span>
                  <span className="flex items-center gap-1">Communication <Stars value={review.communication} label="Communication" /></span>
                  <span className="flex items-center gap-1">Professionalism <Stars value={review.professionalism} label="Professionalism" /></span>
                  <span className="flex items-center gap-1">Clear process <Stars value={review.clarity} label="Clear process" /></span>
                </div>
              </div>
              {review.comments && <p className="mt-2 text-sm whitespace-pre-wrap">{review.comments}</p>}
              {review.would_recommend !== null && <p className="mt-1 text-xs text-ink-muted">{review.would_recommend ? 'Would recommend applying here.' : 'Would not recommend applying here.'}</p>}
            </Card>
          );
        })}
        {tab === 'waiting' && waiting.map((review) => {
          const candidate = candidateById.get(review.candidate_id)!;
          const link = `${location.origin}/review/${review.token}`;
          return (
            <Card key={review.id}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Link to={{ search: `?candidate=${candidate.id}` }} className="text-sm font-semibold hover:underline">{candidate.full_name}</Link>
                  <p className="text-xs text-ink-muted">{review.stage === 'primary' ? 'Primary' : 'Final'} interview · Link created {dateMedium(review.invited_at)}</p>
                </div>
                <IconButton label={`Copy review link for ${candidate.full_name}`} icon={Copy} onClick={() => void copyText(link).then(() => toast('Link copied.'))} />
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
