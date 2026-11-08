import { AlertTriangle, Download, FileSpreadsheet, Search, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HelpTip } from '../components/Guide';
import { Avatar, Button, EmptyState, PageHeader, RecommendationStars, Select, SortHeader, StatTile, StatusBadge, TABLE, TD, TH, THEAD } from '../components/ui';
import { DOCUMENT_CHECKLIST } from '../lib/defaults';
import { downloadCsv, downloadXlsx, type ExportColumn } from '../lib/export';
import { duration, money, todayIso, whenText } from '../lib/format';
import { afterFinal, CATEGORY_LABELS, JOINING, joiningWhen, recommendationCount } from '../lib/pipeline';
import { useFileUrls, useStore } from '../lib/store';
import type { Candidate, CvBucket } from '../types';

type SortColumn = 'name' | 'list' | 'designation' | 'department' | 'selected' | 'joining' | 'salary';

function buildExportColumns(bucketOf: (c: Candidate) => CvBucket | undefined): ExportColumn<Candidate>[] {
  return [
    { header: 'Employee ID', value: (c) => c.employee_code },
    { header: 'Name', value: (c) => c.full_name, width: 28 },
    { header: 'Designation', value: (c) => bucketOf(c)?.designation, width: 26 },
    { header: 'Department', value: (c) => bucketOf(c)?.department, width: 20 },
    { header: 'Company', value: (c) => bucketOf(c)?.company, width: 30 },
    { header: 'Selection list', value: (c) => (c.selection_category ? CATEGORY_LABELS[c.selection_category] : '') },
    { header: 'Recommendations', value: (c) => recommendationCount(c) },
    { header: 'Status', value: (c) => afterFinal(c).label, width: 18 },
    { header: 'Selected on', value: (c) => whenText(c.decision_date, c.decision_time), width: 22 },
    { header: 'Offered joining', value: (c) => whenText(c.joining_date, c.joining_time), width: 22 },
    { header: 'Called for joining', value: (c) => whenText(c.joining_call_date, c.joining_call_time), width: 22 },
    { header: 'Candidate confirmed joining', value: (c) => whenText(c.joining_confirmed_date, c.joining_confirmed_time), width: 22 },
    { header: 'Monthly salary', value: (c) => c.offered_salary },
    { header: 'Mobile', value: (c) => c.phone, width: 16 },
    { header: 'Other mobile', value: (c) => c.alt_phone, width: 16 },
    { header: 'Email', value: (c) => c.email, width: 28 },
    { header: 'Present address', value: (c) => c.address, width: 36 },
    { header: 'Permanent address', value: (c) => c.permanent_address, width: 36 },
    { header: "Father's name", value: (c) => c.father_name, width: 22 },
    { header: "Mother's name", value: (c) => c.mother_name, width: 22 },
    { header: "Spouse's name", value: (c) => c.spouse_name, width: 22 },
    { header: 'Date of birth', value: (c) => c.date_of_birth },
    { header: 'Gender', value: (c) => c.gender },
    { header: 'Marital status', value: (c) => c.marital_status },
    { header: 'Religion', value: (c) => c.religion },
    { header: 'Nationality', value: (c) => c.nationality },
    { header: 'Blood group', value: (c) => c.blood_group },
    { header: 'NID', value: (c) => c.national_id, width: 20 },
    { header: 'TIN', value: (c) => c.tin_no, width: 16 },
    { header: 'Passport', value: (c) => c.passport_no, width: 14 },
    { header: 'Experience (years)', value: (c) => c.total_experience_years },
    { header: 'Education', value: (c) => c.education.map((e) => [e.degree, e.institution, e.result, e.year].filter(Boolean).join(', ')).join(' | '), width: 50 },
    { header: 'Work experience', value: (c) => c.experience.map((e) => [e.role, e.company, e.duration].filter(Boolean).join(', ')).join(' | '), width: 50 },
    { header: 'Skills', value: (c) => c.skills.join(', '), width: 40 },
    { header: 'Source', value: (c) => c.source },
    { header: 'Industry', value: (c) => c.industry, width: 20 },
    { header: 'Called on', value: (c) => whenText(c.call_date, c.call_time), width: 22 },
    { header: 'Confirmed on', value: (c) => whenText(c.confirmed_date, c.confirmed_time), width: 22 },
    { header: 'Primary score', value: (c) => c.primary_score },
    { header: 'Primary interviewers', value: (c) => c.primary_interviewer, width: 30 },
    { header: 'Final score', value: (c) => c.secondary_score },
    { header: 'Final interviewers', value: (c) => c.secondary_interviewer, width: 30 },
    { header: 'Review time', value: (c) => duration(c.review_seconds) },
    { header: 'Documents received', value: (c) => `${c.documents_received.length} of ${DOCUMENT_CHECKLIST.length}` },
  ];
}

export function SelectedPage() {
  const { candidates, buckets } = useStore();
  const [, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('');
  const [listFilter, setListFilter] = useState('');
  // Merit first: that is who the next letters go to.
  const [sort, setSort] = useState<{ column: SortColumn; ascending: boolean }>({ column: 'list', ascending: true });

  const bucketById = useMemo(() => new Map(buckets.map((b) => [b.id, b])), [buckets]);
  const bucketOf = (c: Candidate) => bucketById.get(c.bucket_id);
  const all = useMemo(() => candidates.filter((c) => c.secondary_status === 'selected'), [candidates]);

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    const list = all.filter((c) => {
      const bucket = bucketById.get(c.bucket_id);
      return (
        (!department || bucket?.department === department) &&
        (!designation || bucket?.designation === designation) &&
        (!company || bucket?.company === company) &&
        (!status || c.joining_status === status) &&
        (!listFilter || c.selection_category === listFilter) &&
        (!text || c.full_name.toLowerCase().includes(text) || c.phone.includes(text) || c.email.toLowerCase().includes(text) || c.employee_code.toLowerCase().includes(text))
      );
    });
    const direction = sort.ascending ? 1 : -1;
    const textOf = (c: Candidate): string => {
      const bucket = bucketById.get(c.bucket_id);
      switch (sort.column) {
        case 'name': return c.full_name;
        case 'list': return c.selection_category ?? '';
        case 'designation': return bucket?.designation ?? '';
        case 'department': return bucket?.department ?? '';
        case 'selected': return c.decision_date ?? '';
        case 'joining': return joiningWhen(c).date ?? '';
        default: return '';
      }
    };
    return [...list].sort((a, b) =>
      sort.column === 'salary'
        ? ((a.offered_salary ?? -1) - (b.offered_salary ?? -1)) * direction
        : textOf(a).localeCompare(textOf(b)) * direction,
    );
  }, [all, query, department, designation, company, status, listFilter, sort, bucketById]);

  // A merit candidate who did not confirm opens a place: point at whoever is waiting for that position.
  const openPlaces = useMemo(() => {
    const places: { bucketId: string; designation: string; declined: number; waiting: number }[] = [];
    for (const bucket of buckets) {
      const here = all.filter((c) => c.bucket_id === bucket.id);
      const declined = here.filter((c) => c.selection_category === 'merit' && c.joining_status === 'declined').length;
      const waiting = here.filter((c) => c.selection_category === 'waiting' && c.joining_status !== 'declined').length;
      if (declined > 0 && waiting > 0) places.push({ bucketId: bucket.id, designation: bucket.designation, declined, waiting });
    }
    return places;
  }, [all, buckets]);

  const urls = useFileUrls(rows.slice(0, 300).map((c) => c.photo_path));
  const today = todayIso();
  const distinct = (pick: (b: CvBucket) => string) =>
    [...new Set(all.map((c) => { const b = bucketById.get(c.bucket_id); return b ? pick(b) : ''; }).filter(Boolean))];
  const onSort = (column: SortColumn) => setSort((s) => ({ column, ascending: s.column === column ? !s.ascending : true }));
  const columns = buildExportColumns(bucketOf);
  const openCard = (id: string) => setParams((current) => {
    current.set('candidate', id);
    return current;
  });

  return (
    <>
      <PageHeader
        title="Selected Candidates"
        titleActions={
          <HelpTip label="How to use the selected list">
            Everyone who passed the final interview, on the merit or the waiting list. Click a tile to filter, and a row to open the card: send the
            confirmation letter, call for joining, print the joining pack, and mark Joined or Did not confirm.
          </HelpTip>
        }
        description="Everyone who passed the final interview. Click a row for the full card and the next step."
        actions={
          <span data-tour="selected-download" className="flex gap-2">
            <Button icon={Download} disabled={rows.length === 0} onClick={() => downloadCsv(rows, columns, `selected-candidates-${today}.csv`)}>CSV</Button>
            <Button variant="primary" icon={FileSpreadsheet} disabled={rows.length === 0} onClick={() => void downloadXlsx(rows, columns, `selected-candidates-${today}.xlsx`, 'Selected candidates')}>Download Excel</Button>
          </span>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Merit" value={all.filter((c) => c.selection_category === 'merit').length} active={listFilter === 'merit'} onClick={() => setListFilter(listFilter === 'merit' ? '' : 'merit')} />
        <StatTile label="Waiting" value={all.filter((c) => c.selection_category === 'waiting').length} active={listFilter === 'waiting'} onClick={() => setListFilter(listFilter === 'waiting' ? '' : 'waiting')} />
        <StatTile label="Letters to send" hint="Merit list only" value={all.filter((c) => c.selection_category === 'merit' && c.joining_status === 'pending').length} active={listFilter === 'merit' && status === 'pending'} onClick={() => { const on = listFilter === 'merit' && status === 'pending'; setListFilter(on ? '' : 'merit'); setStatus(on ? '' : 'pending'); }} />
        <StatTile label="Confirmed" hint="Letter sent, locked" value={all.filter((c) => c.joining_status === 'offer_sent' || c.joining_status === 'accepted').length} active={status === 'offer_sent'} onClick={() => setStatus(status === 'offer_sent' ? '' : 'offer_sent')} />
        <StatTile label="Did not confirm" value={all.filter((c) => c.joining_status === 'declined').length} active={status === 'declined'} onClick={() => setStatus(status === 'declined' ? '' : 'declined')} />
        <StatTile label="Joined" value={all.filter((c) => c.joining_status === 'joined').length} active={status === 'joined'} onClick={() => setStatus(status === 'joined' ? '' : 'joined')} />
      </div>

      {openPlaces.map((place) => (
        <p key={place.bucketId} className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong>{place.designation}:</strong> {place.declined} merit candidate{place.declined === 1 ? '' : 's'} did not confirm, and {place.waiting} {place.waiting === 1 ? 'is' : 'are'} on the waiting list.
            Open a waiting candidate's card and move them to Merit to send the letter.
          </span>
        </p>
      ))}

      <div className="mb-3 flex flex-wrap gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-muted" aria-hidden />
          <input type="search" aria-label="Search selected candidates" placeholder="Name, mobile, email or ID" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-sm placeholder:text-ink-muted" />
        </div>
        {[
          { label: 'All designations', value: designation, set: setDesignation, options: distinct((b) => b.designation) },
          { label: 'All departments', value: department, set: setDepartment, options: distinct((b) => b.department) },
          { label: 'All companies', value: company, set: setCompany, options: distinct((b) => b.company) },
        ].map((filter) => (
          <div key={filter.label} className="w-48">
            <Select aria-label={filter.label} value={filter.value} onChange={(e) => filter.set(e.target.value)}>
              <option value="">{filter.label}</option>
              {filter.options.map((option) => <option key={option}>{option}</option>)}
            </Select>
          </div>
        ))}
        <div className="w-36">
          <Select aria-label="Selection list" value={listFilter} onChange={(e) => setListFilter(e.target.value)}>
            <option value="">All lists</option>
            <option value="merit">Merit</option>
            <option value="waiting">Waiting</option>
          </Select>
        </div>
        <div className="w-44">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(JOINING).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
      </div>

      <div data-tour="selected-list" className="relative overflow-x-auto rounded-xl border border-line bg-surface">
        {rows.length === 0 ? (
          <EmptyState icon={UserCheck} title={all.length === 0 ? 'No one has been selected yet' : 'No candidate matches these filters'}>
            {all.length === 0 && 'Candidates appear here once they pass the final interview in a CV bucket.'}
          </EmptyState>
        ) : (
          <table className={TABLE}>
            <thead className={THEAD}>
              <tr>
                <SortHeader column="name" label="Name" sort={sort} onSort={onSort} />
                <SortHeader column="list" label="List" sort={sort} onSort={onSort} />
                <SortHeader column="designation" label="Designation" sort={sort} onSort={onSort} />
                <SortHeader column="department" label="Department" sort={sort} onSort={onSort} className="hidden xl:table-cell" />
                <th scope="col" className={`${TH} hidden lg:table-cell`}>Mobile</th>
                <SortHeader column="selected" label="Selected on" sort={sort} onSort={onSort} />
                <SortHeader column="joining" label="Joins on" sort={sort} onSort={onSort} />
                <SortHeader column="salary" label="Salary" sort={sort} onSort={onSort} className="hidden xl:table-cell" />
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={`${TH} hidden xl:table-cell`}>Docs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const bucket = bucketOf(c);
                const locked = c.final_decision === 'confirmed';
                return (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-canvas"
                    onClick={(event) => {
                      if (!(event.target as Element).closest('a,button')) openCard(c.id);
                    }}
                  >
                    <td className={TD}>
                      <button type="button" onClick={() => openCard(c.id)} className="flex items-center gap-2.5 text-left">
                        <Avatar name={c.full_name} url={c.photo_path ? urls[c.photo_path] : null} />
                        <span className="font-medium whitespace-nowrap hover:underline">{c.full_name}</span>
                        <RecommendationStars candidate={c} />
                      </button>
                    </td>
                    <td className={TD}>{c.selection_category && <StatusBadge tone={c.selection_category === 'merit' ? 'good' : 'warning'}>{CATEGORY_LABELS[c.selection_category]}</StatusBadge>}</td>
                    <td className={TD}>{bucket?.designation}</td>
                    <td className={`${TD} hidden xl:table-cell`}>{bucket?.department}</td>
                    <td className={`${TD} tabular hidden whitespace-nowrap lg:table-cell`}><a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a></td>
                    <td className={`${TD} tabular text-xs whitespace-nowrap`}>{locked ? whenText(c.decision_date, c.decision_time) : <span className="text-ink-muted">-</span>}</td>
                    <td className={`${TD} tabular text-xs whitespace-nowrap`}>
                      {locked ? (
                        <>
                          <span className="block">{whenText(joiningWhen(c).date, joiningWhen(c).time)}</span>
                          <span className="block text-ink-muted">{joiningWhen(c).confirmed ? 'Confirmed by candidate' : c.joining_call_date ? 'Called, not confirmed' : 'Offered, call pending'}</span>
                        </>
                      ) : <span className="text-ink-muted">-</span>}
                    </td>
                    <td className={`${TD} tabular hidden xl:table-cell`}>{money(c.offered_salary) || '-'}</td>
                    <td className={TD}><StatusBadge tone={afterFinal(c).tone}>{afterFinal(c).label}</StatusBadge></td>
                    <td className={`${TD} tabular hidden text-xs xl:table-cell`}>{c.documents_received.length}/{DOCUMENT_CHECKLIST.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
