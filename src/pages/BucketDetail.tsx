import { AlertTriangle, ArrowLeft, Calendar, Check, Copy, Download, Link2, Pencil, Search, Upload, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BucketFormDialog } from '../components/BucketForm';
import { BulkUploadDialog } from '../components/BulkUpload';
import { HelpTip } from '../components/Guide';
import { HandoverDialog } from '../components/HandoverDialog';
import { copyText, ScheduleDialog } from '../components/PipelineDialogs';
import { ProcessMini } from '../components/ProcessBar';
import { ActionIcon, Avatar, Button, Confirm, EmptyState, errorText, HoverTooltip, PageHeader, RangeSlider, RecommendationStars, Select, SortHeader, StatusBadge, TABLE, TD, TH, THEAD, TooltipList, useToast } from '../components/ui';
import { backend } from '../lib/backend';
import { downloadXlsx, type ExportColumn } from '../lib/export';
import { candidateSalary, hasFilters, INDUSTRY_NOT_STATED, matchesFilters, NO_FILTERS, sliderBounds, usesExperienceFilter, usesSalaryFilter, type CandidateFilters } from '../lib/filters';
import { classNames, dateMedium, duration, money, todayIso, whenText } from '../lib/format';
import { bucketStats, can, CATEGORY_LABELS, isRejected, matchesStageFilter, nextAction, processPosition, recommendationCount, rejectScreening, shortlist, stageOf, type StageFilter } from '../lib/pipeline';
import { useFileUrls, useStore } from '../lib/store';
import { handlerNames, processTeam } from '../lib/team';
import type { Candidate } from '../types';

type SortColumn = 'name' | 'experience' | 'received' | 'stage' | 'review';

type Modal =
  | { kind: 'schedule'; candidates: Candidate[]; stage: 'primary' | 'secondary' }
  | { kind: 'reject'; candidates: Candidate[] }
  | { kind: 'handover'; candidates: Candidate[] }
  | { kind: 'upload' }
  | { kind: 'edit' };

const STAGES: { value: StageFilter; label: string; help: string }[] = [
  { value: 'all', label: 'All', help: 'Everyone in this bucket. Click a row to open the candidate\'s card and move them to the next step.' },
  { value: 'new', label: 'New CVs', help: 'CVs not reviewed yet. Open one, read it, then select or reject.' },
  { value: 'calling', label: 'To call', help: 'Selected from their CV, waiting for your phone call or a follow-up.' },
  { value: 'messaging', label: 'To schedule', help: 'Confirmed on the call, waiting for a primary interview date and time.' },
  { value: 'primary', label: 'Primary', help: 'Primary interview scheduled, waiting for the result.' },
  { value: 'secondary', label: 'Final', help: 'Passed the primary interview: final schedule or result still to come.' },
  { value: 'decision', label: 'Decision', help: 'Passed the final interview, waiting for the confirmation letter or a rejection.' },
  { value: 'confirmed', label: 'Confirmed', help: 'Confirmation letter sent. The process is locked.' },
  { value: 'rejected', label: 'Rejected', help: 'Stopped at some step. The card shows where and why.' },
];

const EXPORT_COLUMNS: ExportColumn<Candidate>[] = [
  { header: 'Name', value: (c) => c.full_name, width: 28 },
  { header: 'Mobile', value: (c) => c.phone, width: 16 },
  { header: 'Email', value: (c) => c.email, width: 28 },
  { header: 'Experience (years)', value: (c) => c.total_experience_years },
  { header: 'Current role', value: (c) => c.current_designation, width: 24 },
  { header: 'Current company', value: (c) => c.current_company, width: 24 },
  { header: 'Industry', value: (c) => c.industry, width: 20 },
  { header: 'Expected salary', value: (c) => c.expected_salary, width: 18 },
  { header: 'Education', value: (c) => c.education.map((e) => e.degree).join('; '), width: 30 },
  { header: 'Source', value: (c) => c.source },
  { header: 'Received', value: (c) => c.received_at.slice(0, 10) },
  { header: 'Stage', value: (c) => stageOf(c).label, width: 20 },
  { header: 'Review time', value: (c) => duration(c.review_seconds) },
  { header: 'Called on', value: (c) => whenText(c.call_date, c.call_time), width: 22 },
  { header: 'Confirmed on', value: (c) => whenText(c.confirmed_date, c.confirmed_time), width: 22 },
  { header: 'Candidate rejected on', value: (c) => whenText(c.call_rejected_date, c.call_rejected_time), width: 22 },
  { header: 'Call note', value: (c) => c.call_note, width: 30 },
  { header: 'Primary on', value: (c) => whenText(c.primary_date, c.primary_time), width: 22 },
  { header: 'Primary score', value: (c) => c.primary_score },
  { header: 'Primary interviewers', value: (c) => c.primary_interviewer, width: 30 },
  { header: 'Final on', value: (c) => whenText(c.secondary_date, c.secondary_time), width: 22 },
  { header: 'Final score', value: (c) => c.secondary_score },
  { header: 'Final interviewers', value: (c) => c.secondary_interviewer, width: 30 },
  { header: 'Recommendations', value: (c) => recommendationCount(c) },
  { header: 'Selection list', value: (c) => (c.selection_category ? CATEGORY_LABELS[c.selection_category] : '') },
  { header: 'Final decision', value: (c) => c.final_decision ?? '' },
  { header: 'Decided on', value: (c) => whenText(c.decision_date, c.decision_time), width: 22 },
  { header: 'Joins on', value: (c) => whenText(c.joining_date, c.joining_time), width: 22 },
  { header: 'Informed of rejection on', value: (c) => whenText(c.informed_date, c.informed_time), width: 22 },
];

/** A slider's ends mean no limit, so people with no figure on record are only left out once a limit is really set. */
function RangeFilter({ label, bounds, step, from, to, format, onChange }: {
  label: string;
  bounds: { min: number; max: number };
  step: number;
  from: string;
  to: string;
  format: (value: number) => string;
  onChange: (from: string, to: string) => void;
}) {
  const low = from === '' ? bounds.min : Number(from);
  const high = to === '' ? bounds.max : Number(to);
  return (
    <RangeSlider
      label={label}
      min={bounds.min}
      max={bounds.max}
      step={step}
      low={low}
      high={high}
      format={format}
      onChange={(nextLow, nextHigh) => onChange(nextLow <= bounds.min ? '' : String(nextLow), nextHigh >= bounds.max ? '' : String(nextHigh))}
    />
  );
}

export function BucketDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { buckets, candidates, postings, requisitions, team, user, canWrite, canScreen, canProcess, updateCandidates } = useStore();
  const toast = useToast();

  const bucket = buckets.find((b) => b.id === id);
  const items = useMemo(() => candidates.filter((c) => c.bucket_id === id), [candidates, id]);
  const stats = useMemo(() => bucketStats(items), [items]);
  const requisition = requisitions.find((r) => r.id === bucket?.requisition_id);
  const bucketPostings = postings.filter((p) => p.requisition_id === bucket?.requisition_id);

  // The stage lives in the link, so the dashboard can point straight at the people waiting for something.
  const filter = (STAGES.find((stage) => stage.value === params.get('stage'))?.value ?? 'all') as StageFilter;
  const setFilter = (value: StageFilter) => setParams((current) => {
    if (value === 'all') current.delete('stage');
    else current.set('stage', value);
    return current;
  }, { replace: true });
  const openCard = (candidateId: string) => setParams((current) => {
    current.set('candidate', candidateId);
    return current;
  });

  const [filters, setFilters] = useState<CandidateFilters>(NO_FILTERS);
  const [fullTexts, setFullTexts] = useState<Record<string, string>>({});
  const [source, setSource] = useState('');
  const setFilterValue = (patch: Partial<CandidateFilters>) => setFilters((current) => ({ ...current, ...patch }));
  const [sort, setSort] = useState<{ column: SortColumn; ascending: boolean }>({ column: 'received', ascending: false });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal | null>(null);

  useEffect(() => setSelection(new Set()), [filter, id]);

  const counts = useMemo(() => {
    const result = {} as Record<StageFilter, number>;
    for (const { value } of STAGES) result[value] = items.filter((c) => matchesStageFilter(c, value)).length;
    return result;
  }, [items]);

  // The full CV text stays out of the normal list to keep it light; it is fetched once someone searches by keyword.
  const searching = filters.keyword.trim() !== '';
  useEffect(() => {
    if (!searching || !id) return;
    let cancelled = false;
    void backend
      .list<{ id: string; raw_text: string }>('candidates', { select: 'id,raw_text', match: { bucket_id: id }, order: { column: 'id' } })
      .then((rows) => {
        if (!cancelled) setFullTexts(Object.fromEntries(rows.map((row) => [row.id, row.raw_text])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [searching, id, items.length]);

  const inStage = useMemo(
    () => items.filter((c) => matchesStageFilter(c, filter) && (!source || c.source === source)),
    [items, filter, source],
  );

  const visible = useMemo(() => {
    const list = inStage.filter((c) => matchesFilters(c, filters, fullTexts[c.id]));
    const direction = sort.ascending ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.column) {
        case 'name': return a.full_name.localeCompare(b.full_name) * direction;
        case 'experience': return ((a.total_experience_years ?? -1) - (b.total_experience_years ?? -1)) * direction;
        case 'stage': return (processPosition(a) - processPosition(b)) * direction;
        case 'review': return (a.review_seconds - b.review_seconds) * direction;
        default: return a.received_at.localeCompare(b.received_at) * direction;
      }
    });
  }, [inStage, filters, fullTexts, sort]);

  const industries = useMemo(() => [...new Set(items.map((c) => c.industry).filter(Boolean))].sort(), [items]);
  const experienceBounds = useMemo(
    () => sliderBounds(items.map((c) => c.total_experience_years).filter((years): years is number => years !== null).concat(0), 1, { min: 0, max: 20 }),
    [items],
  );
  const salaryBounds = useMemo(
    () => sliderBounds(items.flatMap((c) => { const salary = candidateSalary(c); return salary ? [salary.min, salary.max] : []; }), 1000, { min: 0, max: 200_000 }),
    [items],
  );
  // A CV that does not state a figure cannot match a range; say so, or those people just seem to vanish.
  const notStated = [
    usesExperienceFilter(filters) && inStage.some((c) => c.total_experience_years === null) && `${inStage.filter((c) => c.total_experience_years === null).length} with no experience on record`,
    usesSalaryFilter(filters) && inStage.some((c) => !candidateSalary(c)) && `${inStage.filter((c) => !candidateSalary(c)).length} with no salary on record`,
  ].filter(Boolean);

  const urls = useFileUrls(visible.slice(0, 300).map((c) => c.photo_path));

  if (!bucket) {
    return <EmptyState icon={Users} title="This bucket was not found" action={<Link className="text-sm underline" to="/buckets">Back to CV Buckets</Link>} />;
  }

  const onSort = (column: SortColumn) => setSort((s) => ({ column, ascending: s.column === column ? !s.ascending : column === 'name' }));
  const selected = visible.filter((c) => selection.has(c.id));
  const allSelected = visible.length > 0 && selected.length === visible.length;

  async function bulk(eligible: Candidate[], patchFor: (c: Candidate) => Partial<Candidate>, label: string) {
    try {
      const done = await updateCandidates(eligible.map((c) => c.id), patchFor);
      toast(`${done} candidate${done === 1 ? '' : 's'} ${label}.`);
      setSelection(new Set());
    } catch (error) {
      toast(errorText(error), 'bad');
    }
  }

  const applyLink = `${location.origin}/apply/${bucket.code}`;
  const maxSource = stats.sources[0]?.count ?? 1;
  // Bulk actions follow the desks: screening for new CVs, the process team for the schedules.
  const canShortlist = canScreen ? selected.filter((c) => c.screening_status === 'new') : [];
  const canSchedulePrimary = canProcess ? selected.filter(can.schedulePrimary) : [];
  const canScheduleFinal = canProcess ? selected.filter(can.scheduleFinal) : [];
  const hasProcessTeam = processTeam(team).some((p) => p.id !== user?.id);
  const help = STAGES.find((stage) => stage.value === filter)?.help;

  return (
    <>
      <Link to="/buckets" className="mb-2 inline-flex items-center gap-1 text-xs text-ink-soft hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> All CV Buckets
      </Link>
      <PageHeader
        title={bucket.designation}
        titleActions={
          <>
            {canWrite && <ActionIcon label="Edit bucket" icon={Pencil} onClick={() => setModal({ kind: 'edit' })} />}
            <ActionIcon data-tour="bucket-link" label="Copy application link" icon={Link2} onClick={() => void copyText(applyLink).then(() => toast('Application form link copied.'))} />
            <ActionIcon label="Download" icon={Download} disabled={visible.length === 0} onClick={() => void downloadXlsx(visible, EXPORT_COLUMNS, `${bucket.designation}-${todayIso()}.xlsx`, bucket.designation)} />
            {canScreen && <ActionIcon data-tour="bucket-upload" label="Upload CVs" icon={Upload} primary onClick={() => setModal({ kind: 'upload' })} />}
            <HelpTip label="How to use this CV bucket">
              <span className="block">This is the CV bank for one position.</span>
              <span className="mt-1 block"><strong>Job application link</strong> (the chain icon): copy it and share it on Facebook, BDJobs or WhatsApp. Each applicant fills the form and arrives here as New.</span>
              <span className="mt-1 block"><strong>Accept or reject</strong>: click the New tile, open each CV, then press Select (accept and hand over) or Reject (with the reason). Tick several rows to do it for all of them at once.</span>
              <span className="mt-1 block">Every later step, from the call to joining, is done on the candidate's card.</span>
            </HelpTip>
          </>
        }
        description={
          <>
            {[bucket.department, bucket.company].filter(Boolean).join(' · ')}
            {' · '}Created {dateMedium(bucket.created_at)}
            {requisition && <> · <Link className="underline" to="/requisitions">{requisition.ref_no}</Link> ({requisition.vacancies} vacanc{requisition.vacancies === 1 ? 'y' : 'ies'})</>}
          </>
        }
      />

      <div data-tour="bucket-tiles" role="tablist" aria-label="Where candidates stand" className="grid grid-cols-[repeat(auto-fit,minmax(5.75rem,1fr))] gap-2">
        {STAGES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={classNames(
              'rounded-xl border bg-surface px-3 py-2 text-left transition-colors hover:border-line-strong',
              filter === value ? 'border-brand-600 ring-1 ring-brand-600' : 'border-line',
            )}
          >
            <span className="block truncate text-xs font-medium text-ink-muted">{label}</span>
            <span className="tabular block text-xl font-semibold tracking-tight">{counts[value]}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-ink-soft">{help}</p>

      {stats.sources.length > 0 && (
        <section className="mt-2.5 rounded-xl border border-line bg-surface px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <h2 className="text-xs font-semibold text-ink-soft">Where CVs came from</h2>
            {stats.sources.map(({ source: name, count }) => {
              const people = items.filter((c) => c.source === name);
              const selectedHere = people.filter((c) => c.secondary_status === 'selected').length;
              return (
                <HoverTooltip
                  key={name}
                  details={
                    <TooltipList
                      title={`${name}: ${count} CV${count === 1 ? '' : 's'}`}
                      rows={[
                        { label: 'Share of this bucket', value: `${Math.round((count / stats.total) * 100)}%` },
                        { label: 'Shortlisted', value: people.filter((c) => c.screening_status === 'shortlisted').length },
                        { label: 'Called', value: people.filter((c) => c.call_status !== 'pending').length },
                        { label: 'Final selected', value: selectedHere },
                        { label: 'Rejected', value: people.filter(isRejected).length },
                      ]}
                    />
                  }
                >
                  {({ tooltipId }) => (
                    <button
                      type="button"
                      aria-pressed={source === name}
                      aria-describedby={tooltipId}
                      title={`Show only ${name}`}
                      onClick={() => setSource(source === name ? '' : name)}
                      className={classNames('flex items-center gap-2 rounded-md px-1.5 py-0.5 text-xs hover:bg-hover', source === name && 'bg-brand-50 ring-1 ring-brand-600')}
                    >
                      <span className={source === name ? 'font-semibold' : ''}>{name}</span>
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-hover" aria-hidden>
                        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(count / maxSource) * 100}%` }} />
                      </span>
                      <span className="tabular font-medium">{count}</span>
                    </button>
                  )}
                </HoverTooltip>
              );
            })}
            {bucketPostings.length > 0 && (
              <span className="ml-auto text-xs text-ink-muted">Posted on {[...new Set(bucketPostings.map((p) => p.media))].join(', ')}</span>
            )}
          </div>
        </section>
      )}

      <div data-tour="bucket-filters" className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-ink-muted" aria-hidden />
          <input
            type="search"
            aria-label="Keyword"
            title="Searches the whole CV. Separate keywords with commas to require all of them."
            placeholder="Keyword, anywhere in the CV"
            value={filters.keyword}
            onChange={(e) => setFilterValue({ keyword: e.target.value })}
            className="h-8 w-full rounded-lg border border-line-strong bg-surface pr-2 pl-8 text-xs placeholder:text-ink-muted"
          />
        </div>
        <div className="w-full sm:w-44">
          <RangeFilter
            label="Experience"
            bounds={experienceBounds}
            step={0.5}
            from={filters.experienceMin}
            to={filters.experienceMax}
            format={(value) => `${value} yr${value === 1 ? '' : 's'}`}
            onChange={(experienceMin, experienceMax) => setFilterValue({ experienceMin, experienceMax })}
          />
        </div>
        <div className="w-full sm:w-60">
          <RangeFilter
            label="Salary (BDT per month)"
            bounds={salaryBounds}
            step={1000}
            from={filters.salaryMin}
            to={filters.salaryMax}
            format={money}
            onChange={(salaryMin, salaryMax) => setFilterValue({ salaryMin, salaryMax })}
          />
        </div>
        <div className="w-full sm:w-40">
          <Select aria-label="Industry" value={filters.industry} onChange={(e) => setFilterValue({ industry: e.target.value })} className="h-8! px-2! text-xs!">
            <option value="">All industries</option>
            {industries.map((industry) => <option key={industry}>{industry}</option>)}
            <option value={INDUSTRY_NOT_STATED}>Not stated</option>
          </Select>
        </div>
      </div>

      <div className="mt-2 flex min-h-8 flex-wrap items-center gap-3">
        <span className="text-xs text-ink-muted" aria-live="polite">
          {visible.length} shown{notStated.length > 0 && `. Not shown: ${notStated.join(', ')}.`}
          {stats.reviewedCvs > 0 && ` · Average CV review ${duration(stats.reviewSeconds / stats.reviewedCvs)}`}
        </span>
        {(hasFilters(filters) || source) && <Button size="sm" variant="ghost" icon={X} onClick={() => { setFilters(NO_FILTERS); setSource(''); }}>Clear filters</Button>}

        {canWrite && selected.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-2.5 py-1.5">
            <span className="text-xs font-medium">{selected.length} selected</span>
            {canShortlist.length > 0 && (
              <Button
                size="sm"
                icon={Check}
                onClick={() => (hasProcessTeam
                  ? setModal({ kind: 'handover', candidates: canShortlist })
                  : void bulk(canShortlist, () => shortlist({ by: user?.full_name || user?.email || '' }), 'moved to To call'))}
              >
                Select and hand over {canShortlist.length}
              </Button>
            )}
            {canShortlist.length > 0 && <Button size="sm" icon={X} onClick={() => setModal({ kind: 'reject', candidates: canShortlist })}>Reject {canShortlist.length}</Button>}
            {canSchedulePrimary.length > 0 && <Button size="sm" icon={Calendar} onClick={() => setModal({ kind: 'schedule', candidates: canSchedulePrimary, stage: 'primary' })}>Set primary schedule for {canSchedulePrimary.length}</Button>}
            {canScheduleFinal.length > 0 && <Button size="sm" icon={Calendar} onClick={() => setModal({ kind: 'schedule', candidates: canScheduleFinal, stage: 'secondary' })}>Set final schedule for {canScheduleFinal.length}</Button>}
            <Button size="sm" icon={Copy} onClick={() => void copyText(selected.map((c) => c.phone).filter(Boolean).join(', ')).then(() => toast('Mobile numbers copied.'))}>Copy mobiles</Button>
          </div>
        )}
      </div>

      <div data-tour="bucket-table" className="relative mt-3 overflow-x-auto rounded-xl border border-line bg-surface">
        {visible.length === 0 ? (
          <EmptyState icon={Users} title={items.length === 0 ? 'No CVs in this bucket yet' : 'No candidate matches this view'} action={items.length === 0 && canScreen ? <Button variant="primary" icon={Upload} onClick={() => setModal({ kind: 'upload' })}>Upload CVs</Button> : undefined}>
            {items.length === 0 && 'Upload CVs here, or share the application link above.'}
          </EmptyState>
        ) : (
          <table className={TABLE}>
            <thead className={THEAD}>
              <tr>
                {canWrite && (
                  <th scope="col" className={TH} data-tour="bucket-select">
                    <input
                      type="checkbox"
                      aria-label="Select all shown candidates"
                      className="size-4 accent-brand-600"
                      checked={allSelected}
                      onChange={() => setSelection(allSelected ? new Set() : new Set(visible.map((c) => c.id)))}
                    />
                  </th>
                )}
                <SortHeader column="name" label="Candidate" sort={sort} onSort={onSort} />
                <th scope="col" className={`${TH} hidden md:table-cell`}>Mobile</th>
                <SortHeader column="experience" label="Exp., education" sort={sort} onSort={onSort} className="hidden md:table-cell" />
                <th scope="col" className={`${TH} hidden lg:table-cell`}>Industry, salary</th>
                <SortHeader column="received" label="Received" sort={sort} onSort={onSort} className="hidden xl:table-cell" />
                <SortHeader column="stage" label="Process" sort={sort} onSort={onSort} className="hidden sm:table-cell" />
                <SortHeader column="review" label="Review time" sort={sort} onSort={onSort} className="hidden lg:table-cell" />
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const stage = stageOf(c);
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-canvas"
                    onClick={(event) => {
                      if (!(event.target as Element).closest('a,button,input,label')) openCard(c.id);
                    }}
                  >
                    {canWrite && (
                      <td className={TD}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${c.full_name}`}
                          className="size-4 accent-brand-600"
                          checked={selection.has(c.id)}
                          onChange={() => setSelection((current) => {
                            const next = new Set(current);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          })}
                        />
                      </td>
                    )}
                    <td className={TD}>
                      <button type="button" onClick={() => openCard(c.id)} className="flex items-center gap-2.5 text-left">
                        <Avatar name={c.full_name} url={c.photo_path ? urls[c.photo_path] : null} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 font-medium hover:underline">
                            {c.full_name}
                            {c.parse_warnings.length > 0 && <AlertTriangle className="size-3.5 text-amber-700" aria-label="Details to check" />}
                            <RecommendationStars candidate={c} />
                          </span>
                          <span className="block max-w-56 truncate text-xs text-ink-muted">{c.current_designation || c.email}</span>
                        </span>
                      </button>
                      {/* On a phone there is no room for a Process column, so it sits under the name. */}
                      <div className="mt-1.5 flex flex-col items-start gap-1 sm:hidden">
                        <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
                        <span className="tabular text-xs text-ink-muted">{nextAction(c)}</span>
                      </div>
                    </td>
                    <td className={`${TD} tabular hidden whitespace-nowrap md:table-cell`}>{c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : <span className="text-ink-muted">Missing</span>}</td>
                    <td className={`${TD} hidden max-w-36 md:table-cell`}>
                      <span className="tabular block">{c.total_experience_years === null ? '-' : `${c.total_experience_years} yr${c.total_experience_years === 1 ? '' : 's'}`}</span>
                      <span className="block truncate text-xs text-ink-muted" title={c.education.map((e) => e.degree).join(', ')}>{c.education[0]?.degree}</span>
                    </td>
                    <td className={`${TD} hidden max-w-40 lg:table-cell`}>
                      <span className="block truncate" title={c.industry}>{c.industry || '-'}</span>
                      <span className="block truncate text-xs text-ink-muted" title={c.expected_salary}>{c.expected_salary}</span>
                    </td>
                    <td className={`${TD} hidden whitespace-nowrap xl:table-cell`}>
                      <span className="tabular block">{dateMedium(c.received_at)}</span>
                      <span className="block text-xs text-ink-muted">{c.source}</span>
                    </td>
                    <td className={`${TD} hidden sm:table-cell`}>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
                        <div className="flex flex-wrap items-center gap-x-2">
                          <ProcessMini candidate={c} />
                          <span className="tabular text-xs text-ink-muted">{nextAction(c)}</span>
                        </div>
                        {c.screening_status === 'shortlisted' && <span className="text-[11px] text-ink-muted">With {handlerNames(c, team)}</span>}
                      </div>
                    </td>
                    <td className={`${TD} tabular hidden whitespace-nowrap lg:table-cell`}>
                      {c.review_seconds > 0 ? duration(c.review_seconds) : <span className="text-ink-muted">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal?.kind === 'schedule' && <ScheduleDialog candidates={modal.candidates} stage={modal.stage} onClose={() => { setModal(null); setSelection(new Set()); }} />}
      {modal?.kind === 'reject' && (
        <Confirm
          danger
          title={`Reject ${modal.candidates.length} candidate${modal.candidates.length === 1 ? '' : 's'}?`}
          body="They move to Rejected. You can undo this from each candidate's card."
          confirmLabel="Reject"
          onCancel={() => setModal(null)}
          onConfirm={async () => {
            await bulk(modal.candidates, () => rejectScreening(), 'moved to Rejected');
            setModal(null);
          }}
        />
      )}
      {modal?.kind === 'handover' && <HandoverDialog candidates={modal.candidates} mode="select" onClose={() => setModal(null)} onDone={() => setSelection(new Set())} />}
      {modal?.kind === 'upload' && <BulkUploadDialog bucketId={bucket.id} onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <BucketFormDialog bucket={bucket} onClose={() => setModal(null)} />}
    </>
  );
}
