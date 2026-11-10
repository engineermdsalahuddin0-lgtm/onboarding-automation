import { Archive, CalendarDays, ChevronRight, Folder, FolderOpen, FolderPlus, FolderTree, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FOLDER_COLORS } from '../components/BucketForm';
import { HelpTip } from '../components/Guide';
import { NewRecruitmentDialog } from '../components/NewRecruitment';
import { Button, EmptyState, PageHeader, Select } from '../components/ui';
import { classNames, dateMedium } from '../lib/format';
import { nameKey, placeText } from '../lib/org';
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
const PARAM_DEFAULTS = { q: '', unit: '', department: '', section: '', subsection: '', year: '', month: '', sort: 'newest', group: 'month', show: 'active' };

/** Stands for "not set" in a place filter, e.g. buckets made before units existed. */
const NONE = '(none)';
const PLACE_LEVELS = ['unit', 'department', 'section', 'subsection'] as const;
type PlaceLevel = (typeof PLACE_LEVELS)[number];
type Place = Record<PlaceLevel, string>;

/** Whether a bucket's value fits a place filter. Spelling differences ("QA,Audit" and "QA, Audit") do not matter. */
function fits(value: string | undefined, filter: string): boolean {
  if (!filter) return true;
  if (filter === NONE) return !value?.trim();
  return nameKey(value ?? '') === nameKey(filter);
}

const fitsPlace = (b: CvBucket, place: Place) => PLACE_LEVELS.every((level) => fits(b[level], place[level]));

interface TreeNode {
  /** The value the filter takes: the name, or NONE for buckets with nothing at this level. */
  value: string;
  label: string;
  count: number;
  children: TreeNode[];
}

/**
 * Units, then departments, sections and subsections, with how many buckets sit under each. The company's units
 * always show, even when empty; deeper levels show only where there are buckets.
 */
function buildTree(buckets: CvBucket[], unitCodes: string[]): TreeNode[] {
  const grow = (items: CvBucket[], depth: number): TreeNode[] => {
    const level = PLACE_LEVELS[depth];
    if (!level) return [];
    const groups = new Map<string, { label: string; items: CvBucket[] }>();
    for (const b of items) {
      const name = (b[level] ?? '').trim();
      const key = name ? nameKey(name) : NONE;
      const entry = groups.get(key) ?? { label: name, items: [] };
      entry.items.push(b);
      groups.set(key, entry);
    }
    // Below a unit, a level nobody filled in is not worth a node of its own; the parent already counts them.
    if (depth > 0 && groups.size === 1 && groups.has(NONE)) return [];
    return [...groups.entries()]
      .map(([key, { label, items: inside }]) => ({
        value: key === NONE ? NONE : label,
        label: key === NONE ? `No ${level}` : label,
        count: inside.length,
        children: grow(inside, depth + 1),
      }))
      .sort((a, b) => Number(a.value === NONE) - Number(b.value === NONE) || a.label.localeCompare(b.label));
  };
  const units = grow(buckets, 0);
  for (const code of unitCodes) {
    if (!units.some((node) => nameKey(node.value) === nameKey(code))) units.push({ value: code, label: code, count: 0, children: [] });
  }
  // The company's units in their own order, then anything else.
  const order = (node: TreeNode) => {
    const index = unitCodes.findIndex((code) => nameKey(code) === nameKey(node.value));
    return index === -1 ? unitCodes.length + (node.value === NONE ? 1 : 0) : index;
  };
  return units.sort((a, b) => order(a) - order(b) || a.label.localeCompare(b.label));
}

function PlaceTree({ nodes, total, place, onChoose }: { nodes: TreeNode[]; total: number; place: Place; onChoose: (place: Place) => void }) {
  const chosen = PLACE_LEVELS.filter((level) => place[level]);
  const row = (node: TreeNode, depth: number, path: Place) => {
    const level = PLACE_LEVELS[depth];
    const here: Place = { ...path, [level]: node.value };
    // A node is open when it is on the chosen path: choosing a unit shows its departments, and so on down.
    const onPath = PLACE_LEVELS.slice(0, depth + 1).every((l) => fits(here[l] === NONE ? '' : here[l], place[l]) && place[l] !== '');
    const selected = onPath && chosen.length === depth + 1;
    return (
      <li key={`${level}-${node.value}`}>
        <button
          type="button"
          onClick={() => onChoose(selected ? { ...path, ...Object.fromEntries(PLACE_LEVELS.slice(depth).map((l) => [l, ''])) } as Place : here)}
          aria-current={selected ? 'true' : undefined}
          aria-expanded={node.children.length > 0 ? onPath : undefined}
          className={classNames(
            'flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-sm transition-colors hover:bg-hover',
            selected ? 'bg-brand-50 font-semibold text-brand-900' : onPath ? 'font-medium text-ink' : 'text-ink-soft',
            node.count === 0 && 'text-ink-muted',
          )}
          style={{ paddingLeft: `${0.25 + depth * 0.85}rem` }}
        >
          {node.children.length > 0
            ? <ChevronRight className={classNames('size-3.5 shrink-0 transition-transform', onPath && 'rotate-90')} aria-hidden />
            : <span className="size-3.5 shrink-0" aria-hidden />}
          <span className={classNames('min-w-0 flex-1 truncate', node.value === NONE && 'italic')} title={node.label}>{node.label}</span>
          <span className="tabular shrink-0 text-xs text-ink-muted">{node.count}</span>
        </button>
        {onPath && node.children.length > 0 && <ul>{node.children.map((child) => row(child, depth + 1, here))}</ul>}
      </li>
    );
  };
  return (
    <nav aria-label="Buckets by unit and department" className="rounded-xl border border-line bg-surface p-2">
      <button
        type="button"
        onClick={() => onChoose({ unit: '', department: '', section: '', subsection: '' })}
        aria-current={chosen.length === 0 ? 'true' : undefined}
        className={classNames('flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-sm hover:bg-hover', chosen.length === 0 ? 'bg-brand-50 font-semibold text-brand-900' : 'text-ink')}
      >
        <FolderTree className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">All buckets</span>
        <span className="tabular text-xs text-ink-muted">{total}</span>
      </button>
      <ul className="mt-1">{nodes.map((node) => row(node, 0, { unit: '', department: '', section: '', subsection: '' }))}</ul>
    </nav>
  );
}

export function BucketsPage() {
  const { buckets, candidates, settings, canWrite } = useStore();
  const [params, setParams] = useSearchParams();
  const param = (key: keyof typeof PARAM_DEFAULTS) => params.get(key) ?? PARAM_DEFAULTS[key];
  // Every change starts from the address as it is right now, not as of the last render, so two quick choices
  // (a unit, then at once a department) never undo each other.
  const liveParams = () => new URLSearchParams(window.location.search);
  const setParam = (key: keyof typeof PARAM_DEFAULTS, value: string) => {
    const next = liveParams();
    if (value === PARAM_DEFAULTS[key]) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const query = param('q');
  const unit = param('unit');
  const department = param('department');
  const section = param('section');
  const subsection = param('subsection');
  const place: Place = useMemo(() => ({ unit, department, section, subsection }), [unit, department, section, subsection]);
  // Choosing a level clears the levels under it, in one step so the link changes once.
  const updatePlace = (change: (now: Place) => Place) => {
    const params = liveParams();
    const next = change(Object.fromEntries(PLACE_LEVELS.map((level) => [level, params.get(level) ?? ''])) as Place);
    for (const level of PLACE_LEVELS) {
      if (next[level]) params.set(level, next[level]);
      else params.delete(level);
    }
    setParams(params, { replace: true });
  };
  const choosePlace = (next: Place) => updatePlace(() => next);
  const setLevel = (level: PlaceLevel, value: string) => {
    const index = PLACE_LEVELS.indexOf(level);
    updatePlace((now) => ({ ...now, ...Object.fromEntries(PLACE_LEVELS.slice(index).map((l) => [l, ''])), [level]: value }) as Place);
  };
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

  // Every filter but the place: what the tree counts, so its numbers answer "how many here, for this period".
  const inPeriod = useMemo(() => {
    const text = query.trim().toLowerCase();
    return buckets.filter((b) => {
      const when = createdIn(b);
      return (status === 'Archived' ? b.status === 'Archived' : b.status !== 'Archived') &&
        (!year || when.year === Number(year)) &&
        (month === '' || when.month === Number(month)) &&
        (!text || [b.designation, b.department, b.section, b.subsection, b.unit].some((value) => (value ?? '').toLowerCase().includes(text)));
    });
  }, [buckets, query, year, month, status]);
  const tree = useMemo(() => buildTree(inPeriod, (settings.org_structure ?? []).map((u) => u.code)), [inPeriod, settings.org_structure]);

  // Each place filter offers what the buckets above it hold, so no choice leads to an empty page.
  const optionsFor = (level: PlaceLevel) => {
    const index = PLACE_LEVELS.indexOf(level);
    const above = Object.fromEntries(PLACE_LEVELS.map((l, i) => [l, i < index ? place[l] : ''])) as Place;
    const names = new Map<string, string>();
    let missing = false;
    for (const b of inPeriod) {
      if (!fitsPlace(b, above)) continue;
      const name = (b[level] ?? '').trim();
      if (name) names.set(nameKey(name), names.get(nameKey(name)) ?? name);
      else missing = true;
    }
    if (level === 'unit') for (const code of units) names.set(nameKey(code), names.get(nameKey(code)) ?? code);
    const current = place[level];
    if (current && current !== NONE && !names.has(nameKey(current))) names.set(nameKey(current), current);
    return { names: [...names.values()].sort((a, b) => (level === 'unit' ? units.indexOf(a) - units.indexOf(b) : 0) || a.localeCompare(b)), missing: missing || current === NONE };
  };

  const visible = useMemo(() => {
    const list = inPeriod.filter((b) => fitsPlace(b, place));
    const cvs = (b: CvBucket) => statsByBucket.get(b.id)?.total ?? 0;
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.designation.localeCompare(b.designation);
      if (sort === 'cvs') return cvs(b) - cvs(a);
      const order = a.created_at < b.created_at ? -1 : 1;
      return sort === 'oldest' ? order : -order;
    });
  }, [inPeriod, place, sort, statsByBucket]);

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
  const filtered = Boolean(query || unit || department || section || subsection || year || month !== '');

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
        actions={canWrite && <Button data-tour="buckets-new" variant="primary" icon={FolderPlus} onClick={() => setCreating(true)}>New CV bucket</Button>}
      />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-muted" aria-hidden />
          <input type="search" aria-label="Search buckets" placeholder="Search designation or section" value={query} onChange={(e) => setParam('q', e.target.value)} className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-sm" />
        </div>
        {PLACE_LEVELS.map((level) => {
          const { names, missing } = optionsFor(level);
          const above = PLACE_LEVELS.slice(0, PLACE_LEVELS.indexOf(level));
          // Section and subsection wait for the level above them, as in the forms.
          const waiting = level !== 'unit' && level !== 'department' && above.some((l) => !place[l]);
          const label = level[0].toUpperCase() + level.slice(1);
          return (
            <div key={level} className={level === 'unit' ? 'w-28' : level === 'department' ? 'w-48' : 'w-44'}>
              <Select
                aria-label={`Filter by ${level}`}
                title={waiting ? `Choose a ${PLACE_LEVELS[PLACE_LEVELS.indexOf(level) - 1]} first` : undefined}
                value={place[level]}
                disabled={waiting || (names.length === 0 && !missing)}
                onChange={(e) => setLevel(level, e.target.value)}
              >
                <option value="">{waiting ? label : `All ${level === 'unit' ? 'units' : `${level}s`}`}</option>
                {names.map((name) => <option key={name} value={name}>{name}</option>)}
                {missing && <option value={NONE}>No {level}</option>}
              </Select>
            </div>
          );
        })}
      </div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
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

      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside data-tour="buckets-tree" className="hidden lg:block">
          <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <PlaceTree nodes={tree} total={inPeriod.length} place={place} onChoose={choosePlace} />
          </div>
        </aside>
        <div className="min-w-0">
          {placeText(place) && (
            <p className="mb-3 text-sm text-ink-soft">
              Showing <strong className="text-ink">{placeText(Object.fromEntries(PLACE_LEVELS.map((l) => [l, place[l] === NONE ? `No ${l}` : place[l]])))}</strong>: {visible.length} bucket{visible.length === 1 ? '' : 's'}
            </p>
          )}
          {visible.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title={buckets.length === 0 ? 'No CV buckets yet' : 'No bucket matches this search'}
              action={buckets.length === 0 && canWrite ? <Button variant="primary" icon={FolderPlus} onClick={() => setCreating(true)}>Create the first bucket</Button> : undefined}
            >
              {buckets.length === 0 && 'New CV bucket makes the bucket and its requisition together. Then upload its CVs.'}
            </EmptyState>
          ) : (
            groups.map((entry, index) => (
              <section key={entry.key} className="mb-6" data-tour={index === 0 ? 'buckets-list' : undefined}>
                {entry.label && (
                  <h2 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                    {entry.label} <span className="font-normal normal-case">· {entry.items.length} bucket{entry.items.length === 1 ? '' : 's'}</span>
                  </h2>
                )}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {entry.items.map((bucket) => <BucketFolder key={bucket.id} bucket={bucket} stats={statsByBucket.get(bucket.id)!} />)}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      {creating && <NewRecruitmentDialog title="New CV bucket" onClose={() => setCreating(false)} />}
    </>
  );
}
