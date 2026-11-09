import { Archive, CalendarDays, Folder, FolderOpen, FolderPlus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BucketFormDialog, FOLDER_COLORS } from '../components/BucketForm';
import { HelpTip } from '../components/Guide';
import { Button, EmptyState, PageHeader, Select } from '../components/ui';
import { classNames, dateMedium } from '../lib/format';
import { placeText } from '../lib/org';
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
            <p className="truncate text-xs text-ink-soft" title={placeText({ unit: bucket.unit, department: bucket.department, section: bucket.section, subsection: bucket.subsection })}>
              {placeText({ unit: bucket.unit, department: bucket.department || 'No department', section: bucket.section })}
            </p>
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
type GroupKey = 'month' | 'year' | 'none';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The local year and month a bucket was created in. */
function createdIn(bucket: CvBucket): { year: number; month: number } {
  const date = new Date(bucket.created_at);
  return { year: date.getFullYear(), month: date.getMonth() };
}

// The filters live in the link, so going into a bucket and back keeps them.
const PARAM_DEFAULTS = { q: '', unit: '', department: '', year: '', month: '', sort: 'newest', group: 'month', show: 'active' };

export function BucketsPage() {
  const { buckets, candidates, settings, canWrite } = useStore();
  const [params, setParams] = useSearchParams();
  const param = (key: keyof typeof PARAM_DEFAULTS) => params.get(key) ?? PARAM_DEFAULTS[key];
  const setParam = (key: keyof typeof PARAM_DEFAULTS, value: string) => setParams((current) => {
    if (value === PARAM_DEFAULTS[key]) current.delete(key);
    else current.set(key, value);
    return current;
  }, { replace: true });
  const query = param('q');
  const unit = param('unit');
  const department = param('department');
  const year = param('year');
  const month = param('month');
  const sort = param('sort') as SortKey;
  const group = param('group') as GroupKey;
  const status = param('show') === 'archived' ? 'Archived' : 'active';
  const [creating, setCreating] = useState(false);

  const years = useMemo(() => [...new Set(buckets.map((b) => createdIn(b).year))].sort((a, b) => b - a), [buckets]);
  const units = useMemo(() => [...new Set([...(settings.org_structure ?? []).map((u) => u.code), ...buckets.map((b) => b.unit)].filter(Boolean))], [buckets, settings.org_structure]);

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
    const list = buckets.filter((b) => {
      const when = createdIn(b);
      return (status === 'Archived' ? b.status === 'Archived' : b.status !== 'Archived') &&
        (!unit || b.unit === unit) &&
        (!department || b.department === department) &&
        (!year || when.year === Number(year)) &&
        (month === '' || when.month === Number(month)) &&
        (!text || [b.designation, b.department, b.section, b.subsection, b.unit].some((value) => (value ?? '').toLowerCase().includes(text)));
    });
    const cvs = (b: CvBucket) => statsByBucket.get(b.id)?.total ?? 0;
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.designation.localeCompare(b.designation);
      if (sort === 'cvs') return cvs(b) - cvs(a);
      const order = a.created_at < b.created_at ? -1 : 1;
      return sort === 'oldest' ? order : -order;
    });
  }, [buckets, query, unit, department, year, month, status, sort, statsByBucket]);

  // Folders grouped by the month or year they were created, so a period is easy to find. The groups run newest
  // first (oldest first when sorted that way); inside each, the chosen order holds.
  const groups = useMemo(() => {
    if (group === 'none') return [{ key: '', label: '', items: visible }];
    const result = new Map<string, { key: string; label: string; items: CvBucket[] }>();
    for (const bucket of visible) {
      const when = createdIn(bucket);
      const key = group === 'year' ? String(when.year) : `${when.year}-${String(when.month + 1).padStart(2, '0')}`;
      const label = group === 'year' ? String(when.year) : `${MONTH_NAMES[when.month]} ${when.year}`;
      const entry = result.get(key);
      if (entry) entry.items.push(bucket);
      else result.set(key, { key, label, items: [bucket] });
    }
    return [...result.values()].sort((a, b) => (sort === 'oldest' ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key)));
  }, [visible, group, sort]);
  const filtered = Boolean(query || unit || department || year || month !== '');

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
          <input type="search" aria-label="Search buckets" placeholder="Search designation or section" value={query} onChange={(e) => setParam('q', e.target.value)} className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-sm" />
        </div>
        {units.length > 0 && (
          <div className="w-32">
            <Select aria-label="Filter by unit" value={unit} onChange={(e) => setParam('unit', e.target.value)}>
              <option value="">All units</option>
              {units.map((code) => <option key={code}>{code}</option>)}
            </Select>
          </div>
        )}
        <div className="w-48">
          <Select aria-label="Filter by department" value={department} onChange={(e) => setParam('department', e.target.value)}>
            <option value="">All departments</option>
            {[...new Set(buckets.filter((b) => !unit || b.unit === unit).map((b) => b.department).filter(Boolean))].sort().map((d) => <option key={d}>{d}</option>)}
          </Select>
        </div>
        <div className="w-28">
          <Select aria-label="Filter by year created" value={year} onChange={(e) => setParam('year', e.target.value)}>
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </div>
        <div className="w-36">
          <Select aria-label="Filter by month created" value={month} onChange={(e) => setParam('month', e.target.value)}>
            <option value="">All months</option>
            {MONTH_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </Select>
        </div>
        <div className="w-40">
          <Select aria-label="Sort buckets" value={sort} onChange={(e) => setParam('sort', e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Designation A-Z</option>
            <option value="cvs">Most CVs</option>
          </Select>
        </div>
        <div className="w-40">
          <Select aria-label="Group buckets" value={group} onChange={(e) => setParam('group', e.target.value)}>
            <option value="month">Group by month</option>
            <option value="year">Group by year</option>
            <option value="none">No grouping</option>
          </Select>
        </div>
        {filtered && <Button variant="ghost" icon={X} onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}
        <Button variant="ghost" icon={Archive} aria-pressed={status === 'Archived'} onClick={() => setParam('show', status === 'active' ? 'archived' : 'active')} className="ml-auto">
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
        groups.map((entry, index) => (
          <section key={entry.key} className="mb-6" data-tour={index === 0 ? 'buckets-list' : undefined}>
            {entry.label && (
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                {entry.label} <span className="font-normal normal-case">· {entry.items.length} bucket{entry.items.length === 1 ? '' : 's'}</span>
              </h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {entry.items.map((bucket) => <BucketFolder key={bucket.id} bucket={bucket} stats={statsByBucket.get(bucket.id)!} />)}
            </div>
          </section>
        ))
      )}

      {creating && <BucketFormDialog onClose={() => setCreating(false)} defaultDepartment={settings.departments[0]} />}
    </>
  );
}
