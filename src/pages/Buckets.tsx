import { Archive, CalendarDays, Folder, FolderOpen, FolderPlus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BucketFormDialog, FOLDER_COLORS } from '../components/BucketForm';
import { HelpTip } from '../components/Guide';
import { Button, EmptyState, PageHeader, Select } from '../components/ui';
import { classNames, dateMedium } from '../lib/format';
import { bucketStats, type BucketStats } from '../lib/pipeline';
import { useStore } from '../lib/store';
import type { CvBucket } from '../types';

export function BucketFolder({ bucket, stats }: { bucket: CvBucket; stats: BucketStats }) {
  const color = FOLDER_COLORS[bucket.color] ?? FOLDER_COLORS.stone;
  const open = bucket.status === 'Open';
  return (
    <Link to={`/buckets/${bucket.id}`} className="group block rounded-2xl transition-transform hover:-translate-y-0.5">
      {/* The small tab on top is what makes the card read as a folder. */}
      <div className={classNames('ml-3 h-3 w-24 rounded-t-lg', color.tab)} aria-hidden />
      <div className={classNames('rounded-2xl rounded-tl-md border p-4 transition-shadow group-hover:shadow-md', color.body)}>
        <div className="flex items-start gap-3">
          {open ? <FolderOpen className={classNames('mt-0.5 size-5 shrink-0', color.icon)} aria-hidden /> : <Folder className={classNames('mt-0.5 size-5 shrink-0', color.icon)} aria-hidden />}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold" title={bucket.designation}>{bucket.designation}</h3>
            <p className="truncate text-xs text-ink-soft">{bucket.department || 'No department'}</p>
          </div>
          {bucket.status !== 'Open' && <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-ink-soft">{bucket.status}</span>}
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-ink-soft">
          <CalendarDays className="size-3.5" aria-hidden /> Created {dateMedium(bucket.created_at)}
        </p>
        {/* Columns size to their labels: with five, equal widths would not leave "Shortlisted" enough room. */}
        <dl className="mt-3 flex justify-between gap-1 border-t border-black/5 pt-3 text-center">
          {[
            ['CVs', stats.total],
            ['Shortlisted', stats.shortlisted],
            ['Called', stats.called],
            ['Selected', stats.secondarySelected],
            ['Rejected', stats.rejected],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse">
              <dt className="text-[11px] text-ink-soft">{label}</dt>
              <dd className="tabular text-base font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Link>
  );
}

type SortKey = 'newest' | 'oldest' | 'name' | 'cvs';

export function BucketsPage() {
  const { buckets, candidates, settings, canWrite } = useStore();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState<'active' | 'Archived'>('active');
  const [sort, setSort] = useState<SortKey>('newest');
  const [creating, setCreating] = useState(false);

  const statsByBucket = useMemo(() => {
    const groups = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const list = groups.get(candidate.bucket_id);
      if (list) list.push(candidate);
      else groups.set(candidate.bucket_id, [candidate]);
    }
    return new Map(buckets.map((b) => [b.id, bucketStats(groups.get(b.id) ?? [])]));
  }, [buckets, candidates]);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    const list = buckets.filter(
      (b) =>
        (status === 'Archived' ? b.status === 'Archived' : b.status !== 'Archived') &&
        (!department || b.department === department) &&
        (!text || b.designation.toLowerCase().includes(text) || b.department.toLowerCase().includes(text)),
    );
    const cvs = (b: CvBucket) => statsByBucket.get(b.id)?.total ?? 0;
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.designation.localeCompare(b.designation);
      if (sort === 'cvs') return cvs(b) - cvs(a);
      const order = a.created_at < b.created_at ? -1 : 1;
      return sort === 'oldest' ? order : -order;
    });
  }, [buckets, query, department, status, sort, statsByBucket]);

  // Folders grouped by the month they were created, so a date is easy to find.
  const groups = useMemo(() => {
    if (sort !== 'newest' && sort !== 'oldest') return [{ label: '', items: visible }];
    const result: { label: string; items: CvBucket[] }[] = [];
    for (const bucket of visible) {
      const label = new Date(bucket.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const group = result.find((g) => g.label === label);
      if (group) group.items.push(bucket);
      else result.push({ label, items: [bucket] });
    }
    return result;
  }, [visible, sort]);

  return (
    <>
      <PageHeader
        title="CV Buckets"
        titleActions={
          <HelpTip label="How to use the CV bank">
            <span className="block">The CV bank keeps one folder per position. Every CV, uploaded or sent through the application form, lands in its folder as New.</span>
            <span className="mt-1 block">Open a folder to screen the CVs, filter them, and copy the job application link (the chain icon) to share on Facebook, BDJobs or WhatsApp.</span>
          </HelpTip>
        }
        description="One folder per position. Open a folder to see every CV and where it stands."
        actions={canWrite && <Button data-tour="buckets-new" variant="primary" icon={FolderPlus} onClick={() => setCreating(true)}>New bucket</Button>}
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-muted" aria-hidden />
          <input type="search" aria-label="Search buckets" placeholder="Search designation" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-sm" />
        </div>
        <div className="w-48">
          <Select aria-label="Filter by department" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {[...new Set(buckets.map((b) => b.department).filter(Boolean))].map((d) => <option key={d}>{d}</option>)}
          </Select>
        </div>
        <div className="w-44">
          <Select aria-label="Sort buckets" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Designation A-Z</option>
            <option value="cvs">Most CVs</option>
          </Select>
        </div>
        <Button variant="ghost" icon={Archive} aria-pressed={status === 'Archived'} onClick={() => setStatus(status === 'active' ? 'Archived' : 'active')} className="ml-auto">
          {status === 'active' ? 'Show archived' : 'Show active'}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={buckets.length === 0 ? 'No CV buckets yet' : 'No bucket matches this search'}
          action={buckets.length === 0 && canWrite ? <Button variant="primary" icon={FolderPlus} onClick={() => setCreating(true)}>Create the first bucket</Button> : undefined}
        >
          {buckets.length === 0 && 'Create one for a position, or from a requisition, then upload its CVs.'}
        </EmptyState>
      ) : (
        groups.map((group, index) => (
          <section key={group.label} className="mb-6" data-tour={index === 0 ? 'buckets-list' : undefined}>
            {group.label && <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">{group.label}</h2>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.items.map((bucket) => <BucketFolder key={bucket.id} bucket={bucket} stats={statsByBucket.get(bucket.id)!} />)}
            </div>
          </section>
        ))
      )}

      {creating && <BucketFormDialog onClose={() => setCreating(false)} defaultDepartment={settings.departments[0]} />}
    </>
  );
}
