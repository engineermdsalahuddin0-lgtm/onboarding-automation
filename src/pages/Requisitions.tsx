import { ClipboardList, Download, ExternalLink, Eye, FileSpreadsheet, FolderOpen, FolderPlus, Megaphone, Pencil, Plus, Search, Trash2, UserRoundSearch } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BucketFormDialog } from '../components/BucketForm';
import { HelpTip } from '../components/Guide';
import { OrgFields } from '../components/OrgFields';
import { Button, Confirm, Dialog, EmptyState, errorText, IconButton, PageHeader, Select, StatusBadge, TABLE, Tabs, TD, TextArea, TextInput, TH, THEAD, useToast } from '../components/ui';
import { NewRecruitmentDialog } from '../components/NewRecruitment';
import { VacancyImportDialog } from '../components/VacancyImport';
import { downloadXlsx, type ExportColumn } from '../lib/export';
import { dateDmy, dateMedium, money, todayIso } from '../lib/format';
import { DESIGNATIONS, gradeOf } from '../lib/designations';
import { placeText } from '../lib/org';
import { byNewest, daysToFill, isOpenRequisition, selectedNames } from '../lib/requisitions';
import type { Tone } from '../lib/pipeline';
import { useStore } from '../lib/store';
import type { Designation, JobPosting, Priority, Requisition, RequisitionStatus } from '../types';

type Tab = 'vacancies' | 'requisitions' | 'postings';

export const STATUS_TONE: Record<RequisitionStatus, Tone> = {
  'Pending approval': 'warning',
  Approved: 'info',
  'In progress': 'progress',
  Filled: 'good',
  'On hold': 'neutral',
  Cancelled: 'bad',
};

const PRIORITY_TONE: Record<Priority, Tone> = { Urgent: 'bad', High: 'warning', Medium: 'neutral', Low: 'neutral' };

function DesignationDialog({ designation, onClose }: { designation?: Designation; onClose: () => void }) {
  const { settings, saveDesignation } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    title: designation?.title ?? '',
    department: designation?.department ?? settings.departments[0] ?? '',
    company: designation?.company ?? settings.default_company,
    sanctioned: String(designation?.sanctioned ?? 1),
    filled: String(designation?.filled ?? 0),
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await saveDesignation({ ...(designation ? { id: designation.id } : {}), ...form, sanctioned: Number(form.sanctioned), filled: Number(form.filled) });
      toast('Designation saved.');
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={designation ? 'Edit designation' : 'Add designation'}
      description="Vacant positions are the approved headcount minus the people in post."
      onClose={onClose}
      width="max-w-md"
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" form="designation-form" variant="primary" loading={busy}>Save</Button></>}
    >
      <form id="designation-form" onSubmit={submit} className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><TextInput label="Designation" required autoFocus value={form.title} onChange={(e) => set({ title: e.target.value })} /></div>
        <Select label="Department" value={form.department} onChange={(e) => set({ department: e.target.value })}>
          {[...new Set([...settings.departments, form.department].filter(Boolean))].map((d) => <option key={d}>{d}</option>)}
        </Select>
        <TextInput label="Company" list="req-company-options" value={form.company} onChange={(e) => set({ company: e.target.value })} />
        <datalist id="req-company-options">{settings.companies.map((c) => <option key={c} value={c} />)}</datalist>
        <TextInput label="Approved headcount" type="number" min={0} required value={form.sanctioned} onChange={(e) => set({ sanctioned: e.target.value })} />
        <TextInput label="People in post" type="number" min={0} required value={form.filled} onChange={(e) => set({ filled: e.target.value })} />
      </form>
    </Dialog>
  );
}

function RequisitionDialog({ requisition, fromDesignation, onClose }: { requisition?: Requisition; fromDesignation?: Designation; onClose: () => void }) {
  const { settings, saveRequisition, designations, user } = useStore();
  const toast = useToast();
  const vacant = fromDesignation ? Math.max(1, fromDesignation.sanctioned - fromDesignation.filled) : 1;
  const [form, setForm] = useState({
    designation_id: requisition?.designation_id ?? fromDesignation?.id ?? null,
    designation: requisition?.designation ?? fromDesignation?.title ?? '',
    unit: requisition?.unit ?? '',
    department: requisition?.department ?? fromDesignation?.department ?? settings.departments[0] ?? '',
    section: requisition?.section ?? '',
    subsection: requisition?.subsection ?? '',
    // The company is always the group; an existing requisition keeps what it has.
    company: requisition?.company ?? (fromDesignation?.company || settings.group_name),
    vacancy_type: requisition?.vacancy_type ?? '',
    replacing: requisition?.replacing ?? '',
    requisition_date: requisition?.requisition_date ?? (requisition ? '' : todayIso()),
    approved_on: requisition?.approved_on ?? '',
    offer_date: requisition?.offer_date ?? '',
    expected_joining: requisition?.expected_joining ?? '',
    selected_names: requisition?.selected_names ?? '',
    remarks: requisition?.remarks ?? '',
    vacancies: String(requisition?.vacancies ?? vacant),
    priority: requisition?.priority ?? ('Medium' as Priority),
    employment_type: requisition?.employment_type ?? 'Permanent',
    location: requisition?.location ?? '',
    hiring_manager: requisition?.hiring_manager ?? '',
    requested_by: requisition?.requested_by ?? user?.full_name ?? '',
    budget_min: requisition?.budget_min?.toString() ?? '',
    budget_max: requisition?.budget_max?.toString() ?? '',
    target_date: requisition?.target_date ?? '',
    status: requisition?.status ?? ('Pending approval' as RequisitionStatus),
    justification: requisition?.justification ?? '',
    job_description: requisition?.job_description ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await saveRequisition({
        ...(requisition ? { id: requisition.id } : {}),
        ...form,
        grade: gradeOf(form.designation),
        designation_id: designations.find((d) => d.title === form.designation)?.id ?? form.designation_id,
        vacancies: Number(form.vacancies),
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        target_date: form.target_date || null,
        requisition_date: form.requisition_date || null,
        approved_on: form.approved_on || null,
        offer_date: form.offer_date || null,
        expected_joining: form.expected_joining || null,
        filled_at: form.status === 'Filled' ? requisition?.filled_at ?? new Date().toISOString() : null,
      });
      toast('Requisition saved.');
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={requisition ? `Edit ${requisition.ref_no}` : 'New requisition'}
      onClose={onClose}
      width="max-w-2xl"
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" form="requisition-form" variant="primary" loading={busy}>Save</Button></>}
    >
      <form id="requisition-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextInput label="Designation" required autoFocus list="designation-list" value={form.designation} onChange={(e) => set({ designation: e.target.value })} hint="Choose from the company's list, or type one that is not on it." />
          <datalist id="designation-list">{[...new Set([...DESIGNATIONS.map((d) => d.title), ...designations.map((d) => d.title)])].map((title) => <option key={title} value={title} />)}</datalist>
        </div>
        <OrgFields value={form} onChange={(place) => set(place)} />
        <Select label="New or replacement" value={form.vacancy_type} onChange={(e) => set({ vacancy_type: e.target.value })}>
          <option value="">Not stated</option>
          {[...new Set(['New', 'Replacement', 'New & Replacement', form.vacancy_type].filter(Boolean))].map((t) => <option key={t}>{t}</option>)}
        </Select>
        <TextInput label="Replacing (name and ID)" disabled={form.vacancy_type === 'New'} value={form.replacing} onChange={(e) => set({ replacing: e.target.value })} />
        <TextInput label="Vacancies" type="number" min={1} required value={form.vacancies} onChange={(e) => set({ vacancies: e.target.value })} />
        <Select label="Priority" value={form.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
          {['Urgent', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
        </Select>
        <Select label="Status" value={form.status} onChange={(e) => set({ status: e.target.value as RequisitionStatus })}>
          {Object.keys(STATUS_TONE).map((s) => <option key={s}>{s}</option>)}
        </Select>
        <TextInput label="Hiring manager" value={form.hiring_manager} onChange={(e) => set({ hiring_manager: e.target.value })} />
        <TextInput label="Requested by" value={form.requested_by} onChange={(e) => set({ requested_by: e.target.value })} />
        <TextInput label="Employment type" list="employment-types" value={form.employment_type} onChange={(e) => set({ employment_type: e.target.value })} />
        <datalist id="employment-types"><option value="Permanent" /><option value="Contractual" /><option value="Intern" /></datalist>
        <TextInput label="Location" value={form.location} onChange={(e) => set({ location: e.target.value })} />
        <TextInput label="Budget from (BDT per month)" type="number" min={0} value={form.budget_min} onChange={(e) => set({ budget_min: e.target.value })} />
        <TextInput label="Budget to (BDT per month)" type="number" min={0} value={form.budget_max} onChange={(e) => set({ budget_max: e.target.value })} />
        <TextInput label="Target date" type="date" value={form.target_date} onChange={(e) => set({ target_date: e.target.value })} />
        <TextInput label="Requisition date" type="date" value={form.requisition_date} onChange={(e) => set({ requisition_date: e.target.value })} />
        <TextInput label="Approved requisition received" type="date" min={form.requisition_date || undefined} value={form.approved_on} onChange={(e) => set({ approved_on: e.target.value })} />
        <TextInput label="Approval and offer letter" type="date" value={form.offer_date} onChange={(e) => set({ offer_date: e.target.value })} hint="Days to fill are counted up to this day." />
        <TextInput label="Expected joining" type="date" value={form.expected_joining} onChange={(e) => set({ expected_joining: e.target.value })} />
        <div className="sm:col-span-2"><TextArea label="Why this position is needed" rows={2} value={form.justification} onChange={(e) => set({ justification: e.target.value })} /></div>
        <div className="sm:col-span-2"><TextArea label="Job description" hint="Shown to candidates on the application form." rows={4} value={form.job_description} onChange={(e) => set({ job_description: e.target.value })} /></div>
        <TextArea label="Selected candidates" hint="For hiring done outside the app, e.g. by the factory. One name per line." rows={3} value={form.selected_names} onChange={(e) => set({ selected_names: e.target.value })} />
        <TextArea label="Remarks" rows={3} value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} />
      </form>
    </Dialog>
  );
}

function PostingDialog({ posting, requisitionId, onClose }: { posting?: JobPosting; requisitionId?: string; onClose: () => void }) {
  const { requisitions, settings, savePosting } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    requisition_id: posting?.requisition_id ?? requisitionId ?? requisitions[0]?.id ?? '',
    media: posting?.media ?? settings.media[0] ?? '',
    url: posting?.url ?? '',
    posted_on: posting?.posted_on ?? todayIso(),
    closes_on: posting?.closes_on ?? '',
    cost: String(posting?.cost ?? 0),
    status: posting?.status ?? ('Live' as JobPosting['status']),
    notes: posting?.notes ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.url && !/^https?:\/\//i.test(form.url)) {
      toast('The link must start with http:// or https://', 'bad');
      return;
    }
    setBusy(true);
    try {
      await savePosting({ ...(posting ? { id: posting.id } : {}), ...form, closes_on: form.closes_on || null, cost: Number(form.cost) || 0 });
      toast('Job posting saved.');
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={posting ? 'Edit job posting' : 'Record a job posting'}
      description="Where the vacancy was advertised, and when."
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" form="posting-form" variant="primary" loading={busy}>Save</Button></>}
    >
      <form id="posting-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Select label="Requisition" required value={form.requisition_id} onChange={(e) => set({ requisition_id: e.target.value })}>
            {requisitions.map((r) => <option key={r.id} value={r.id}>{r.ref_no} · {r.designation}</option>)}
          </Select>
        </div>
        <TextInput label="Media" required list="media-options" value={form.media} onChange={(e) => set({ media: e.target.value })} />
        <datalist id="media-options">{settings.media.map((m) => <option key={m} value={m} />)}</datalist>
        <Select label="Status" value={form.status} onChange={(e) => set({ status: e.target.value as JobPosting['status'] })}>
          <option>Planned</option><option>Live</option><option>Closed</option>
        </Select>
        <TextInput label="Posted on" type="date" required value={form.posted_on} onChange={(e) => set({ posted_on: e.target.value })} />
        <TextInput label="Closes on" type="date" value={form.closes_on} onChange={(e) => set({ closes_on: e.target.value })} />
        <TextInput label="Cost (BDT)" type="number" min={0} value={form.cost} onChange={(e) => set({ cost: e.target.value })} />
        <TextInput label="Link" type="url" placeholder="https://" value={form.url} onChange={(e) => set({ url: e.target.value })} />
        <div className="sm:col-span-2"><TextArea label="Notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
      </form>
    </Dialog>
  );
}

/** Days from the approved requisition (or the requisition) to the offer letter, or to today while still open. */
const sheetFigure = (r: Requisition, key: string) => {
  const value = r.sheet_data?.[key];
  return value === null || value === undefined || value === '' ? '' : value === true ? 'Yes' : String(value);
};

/** The requisitions in the column order of the company's vacancy status sheet, so the download reads like it. */
const SHEET_COLUMNS: ExportColumn<Requisition & { sl: number }>[] = [
  { header: 'SL', value: (r) => r.sl, width: 6 },
  { header: 'Ref.', value: (r) => r.ref_no, width: 14 },
  { header: 'Unit', value: (r) => r.unit, width: 8 },
  { header: 'Position', value: (r) => r.designation, width: 26 },
  { header: 'Department', value: (r) => r.department, width: 24 },
  { header: 'Section', value: (r) => r.section, width: 20 },
  { header: 'Subsection', value: (r) => r.subsection, width: 20 },
  { header: 'Reason for Vacancy New / Replacement', value: (r) => r.vacancy_type, width: 16 },
  { header: 'Former Employee Name', value: (r) => r.replacing, width: 24 },
  { header: 'Vacancy / GAP', value: (r) => sheetFigure(r, 'gap') },
  { header: 'Required', value: (r) => r.vacancies },
  { header: 'Requisition Date', value: (r) => dateDmy(r.requisition_date), width: 14 },
  { header: 'Approved Requisition received Date', value: (r) => dateDmy(r.approved_on), width: 16 },
  { header: 'Job posting Site', value: (r) => sheetFigure(r, 'posting_site'), width: 18 },
  { header: 'Job Posting Date', value: (r) => sheetFigure(r, 'posting_date'), width: 14 },
  { header: 'CV Received', value: (r) => sheetFigure(r, 'cv_received') },
  { header: 'Shortlisted for Primary Interview', value: (r) => sheetFigure(r, 'shortlisted_primary') },
  { header: 'Primary Interview Date', value: (r) => sheetFigure(r, 'primary_interview'), width: 16 },
  { header: 'Primary Interview Attended', value: (r) => sheetFigure(r, 'primary_attended') },
  { header: 'Shortlisted for Final Interview', value: (r) => sheetFigure(r, 'shortlisted_final') },
  { header: 'Final Interview Date', value: (r) => sheetFigure(r, 'final_interview'), width: 16 },
  { header: 'Approval & Offer Letter (Date)', value: (r) => dateDmy(r.offer_date), width: 16 },
  { header: 'No. of Days to Fill', value: (r) => daysToFill(r)?.days ?? '' },
  { header: 'Name of Selected Candidates', value: (r) => r.selected_names, width: 30 },
  { header: 'Current Status', value: (r) => r.status, width: 14 },
  { header: 'Expected Date of Joining', value: (r) => dateDmy(r.expected_joining) || sheetFigure(r, 'expected_joining_note'), width: 16 },
  { header: 'Remarks', value: (r) => r.remarks, width: 30 },
];

/** Everything about one requisition, including the vacancy sheet's own figures. */
export function RequisitionDetails({ requisition: r, onClose }: { requisition: Requisition; onClose: () => void }) {
  const fill = daysToFill(r);
  const facts: [string, string | number][] = [
    ['Where', placeText(r) || '-'],
    ['Company', r.company],
    ['New or replacement', r.vacancy_type],
    ['Replacing', r.replacing],
    ['Vacancies', r.vacancies],
    ['Priority', r.priority],
    ['Status', r.status],
    ['Requisition date', dateMedium(r.requisition_date)],
    ['Approved requisition received', dateMedium(r.approved_on)],
    ['Approval and offer letter', dateMedium(r.offer_date)],
    ['Days to fill', fill ? `${fill.days}${fill.open ? ' so far' : ''}` : ''],
    ['Expected joining', dateMedium(r.expected_joining) || sheetFigure(r, 'expected_joining_note')],
    ['Budget (BDT per month)', r.budget_min || r.budget_max ? `${money(r.budget_min)} - ${money(r.budget_max)}` : ''],
    ['Target date', dateMedium(r.target_date)],
    ['Hiring manager', r.hiring_manager],
    ['Requested by', r.requested_by],
  ];
  const sheet: [string, string][] = [
    ['Vacancy / gap', sheetFigure(r, 'gap')],
    ['Handled by the factory (FO)', sheetFigure(r, 'factory') === 'Yes' ? 'Yes' : ''],
    ['Job posting site', sheetFigure(r, 'posting_site')],
    ['Job posting date', sheetFigure(r, 'posting_date')],
    ['CVs received', sheetFigure(r, 'cv_received')],
    ['Shortlisted for primary interview', sheetFigure(r, 'shortlisted_primary')],
    ['Primary interview', sheetFigure(r, 'primary_interview')],
    ['Attended the primary interview', sheetFigure(r, 'primary_attended')],
    ['Shortlisted for final interview', sheetFigure(r, 'shortlisted_final')],
    ['Final interview', sheetFigure(r, 'final_interview')],
    ['Offer letter dates', sheetFigure(r, 'offer_dates')],
    ['Status in the sheet', sheetFigure(r, 'sheet_status')],
  ];
  const list = (items: [string, string | number][]) => (
    <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
      {items.filter(([, value]) => value !== '' && value !== null).map(([label, value]) => (
        <div key={label}><dt className="text-xs text-ink-muted">{label}</dt><dd className="text-sm break-words">{value}</dd></div>
      ))}
    </dl>
  );
  return (
    <Dialog title={`${r.ref_no} · ${r.designation}`} description={r.sheet_key ? 'Synced from the vacancy status sheet.' : undefined} onClose={onClose} width="max-w-2xl">
      <div className="space-y-4">
        {list(facts)}
        {r.selected_names && (
          <div><p className="text-xs text-ink-muted">Selected candidates</p><p className="text-sm whitespace-pre-wrap">{r.selected_names}</p></div>
        )}
        {r.remarks && <div><p className="text-xs text-ink-muted">Remarks</p><p className="text-sm whitespace-pre-wrap">{r.remarks}</p></div>}
        {r.sheet_key && sheet.some(([, value]) => value) && (
          <section className="border-t border-line pt-3">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">From the vacancy sheet</h3>
            {list(sheet)}
          </section>
        )}
      </div>
    </Dialog>
  );
}

export function RequisitionsPage() {
  const { designations, requisitions, postings, buckets, candidates, settings, canWrite, isAdmin, removeRequisition, removePosting, removeDesignation } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  // The dashboard links here with ?tab=requisitions&status=open, so both show the same list.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (['vacancies', 'requisitions', 'postings'].includes(searchParams.get('tab') ?? '') ? (searchParams.get('tab') as Tab) : 'vacancies'));
  const [modal, setModal] = useState<React.ReactNode>(null);
  const close = () => setModal(null);
  const [filter, setFilter] = useState({ text: '', unit: searchParams.get('unit') ?? '', status: searchParams.get('status') ?? '', type: '', year: '' });
  const setFilterValue = (patch: Partial<typeof filter>) => setFilter((current) => ({ ...current, ...patch }));
  const requisitionYear = (r: Requisition) => (r.requisition_date ?? r.created_at).slice(0, 4);

  const units = useMemo(() => [...new Set([...(settings.org_structure ?? []).map((u) => u.code), ...requisitions.map((r) => r.unit)].filter(Boolean))], [requisitions, settings.org_structure]);
  const years = useMemo(() => [...new Set(requisitions.map(requisitionYear))].sort().reverse(), [requisitions]);
  const shownRequisitions = useMemo(() => {
    const text = filter.text.trim().toLowerCase();
    return requisitions
      .filter((r) =>
        (!filter.unit || r.unit === filter.unit) &&
        (!filter.status || (filter.status === 'open' ? isOpenRequisition(r) : r.status === filter.status)) &&
        (!filter.type || r.vacancy_type === filter.type) &&
        (!filter.year || requisitionYear(r) === filter.year) &&
        (!text || [r.ref_no, r.designation, r.department, r.section, r.subsection, r.replacing, r.selected_names, r.remarks].some((value) => (value ?? '').toLowerCase().includes(text))))
      .sort(byNewest);
  }, [requisitions, filter]);

  function downloadSheet() {
    const rows = [...shownRequisitions]
      .sort((a, b) => (Number(a.sheet_data?.sl ?? Infinity) - Number(b.sheet_data?.sl ?? Infinity)) || (a.requisition_date ?? a.created_at).localeCompare(b.requisition_date ?? b.created_at))
      .map((r, index) => ({ ...r, sl: index + 1 }));
    void downloadXlsx(rows, SHEET_COLUMNS, `Job vacancy status ${todayIso()}.xlsx`, 'VACANCY');
  }

  const vacant = useMemo(
    () => designations.map((d) => ({ ...d, vacant: Math.max(0, d.sanctioned - d.filled) })).sort((a, b) => b.vacant - a.vacant),
    [designations],
  );

  const cvCount = (requisitionId: string) => {
    const ids = new Set(buckets.filter((b) => b.requisition_id === requisitionId).map((b) => b.id));
    return candidates.filter((c) => ids.has(c.bucket_id)).length;
  };

  function confirmDelete(title: string, body: string, action: () => Promise<void>) {
    setModal(
      <Confirm
        danger
        title={title}
        body={body}
        confirmLabel="Delete"
        onCancel={close}
        onConfirm={async () => {
          try {
            await action();
            toast('Deleted.');
          } catch (error) {
            toast(errorText(error), 'bad');
          }
          close();
        }}
      />,
    );
  }

  return (
    <>
      <PageHeader
        title="Requisitions"
        titleActions={
          <HelpTip label="How requisitions and postings work">
            <span className="block"><strong>Designations</strong>: each post with its approved headcount, so you can see which are vacant.</span>
            <span className="mt-1 block"><strong>Requisitions</strong>: a request to hire for one vacant post: how many, the budget and by when.</span>
            <span className="mt-1 block"><strong>Job postings</strong>: where the job was advertised. The whole team is told about each new posting.</span>
          </HelpTip>
        }
        description="Which designations are vacant, the requisitions raised for them, and where each job was posted."
        actions={
          canWrite && (
            <span data-tour="req-new" className="flex gap-2">
              {tab === 'vacancies' && <Button variant="primary" icon={Plus} onClick={() => setModal(<DesignationDialog onClose={close} />)}>Add designation</Button>}
              {tab === 'requisitions' && <Button icon={FileSpreadsheet} onClick={() => setModal(<VacancyImportDialog onClose={close} />)}>Sync vacancy sheet</Button>}
              {tab === 'requisitions' && <Button icon={Plus} onClick={() => setModal(<RequisitionDialog onClose={close} />)}>New requisition only</Button>}
              {tab === 'requisitions' && <Button variant="primary" icon={FolderPlus} onClick={() => setModal(<NewRecruitmentDialog onClose={close} />)}>New recruitment</Button>}
              {tab === 'postings' && <Button variant="primary" icon={Plus} disabled={requisitions.length === 0} onClick={() => setModal(<PostingDialog onClose={close} />)}>Record job posting</Button>}
            </span>
          )
        }
      />

      <div data-tour="req-tabs">
      <Tabs<Tab>
        label="Requisition views"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'vacancies', label: 'Designations', count: vacant.length },
          { value: 'requisitions', label: 'Requisitions', count: requisitions.length },
          { value: 'postings', label: 'Job postings', count: postings.length },
        ]}
      />
      </div>

      <div data-tour="req-list" className="relative mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
        {tab === 'vacancies' && (
          vacant.length === 0 ? (
            <EmptyState icon={UserRoundSearch} title="No designations yet">Add your designations with their approved headcount to see which are vacant.</EmptyState>
          ) : (
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th scope="col" className={TH}>Designation</th>
                  <th scope="col" className={TH}>Department</th>
                  <th scope="col" className={TH}>Company</th>
                  <th scope="col" className={`${TH} text-right`}>Approved</th>
                  <th scope="col" className={`${TH} text-right`}>In post</th>
                  <th scope="col" className={`${TH} text-right`}>Vacant</th>
                  <th scope="col" className={TH}>Requisition</th>
                  {canWrite && <th scope="col" className={TH}><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {vacant.map((d) => {
                  const open = requisitions.find((r) => r.designation === d.title && r.department === d.department && isOpenRequisition(r));
                  return (
                    <tr key={d.id}>
                      <td className={`${TD} font-medium`}>{d.title}</td>
                      <td className={TD}>{d.department}</td>
                      <td className={`${TD} max-w-48 truncate`} title={d.company}>{d.company}</td>
                      <td className={`${TD} tabular text-right`}>{d.sanctioned}</td>
                      <td className={`${TD} tabular text-right`}>{d.filled}</td>
                      <td className={`${TD} tabular text-right font-semibold`}>{d.vacant}</td>
                      <td className={TD}>
                        {open ? <StatusBadge tone={STATUS_TONE[open.status]}>{open.ref_no}</StatusBadge>
                          : d.vacant > 0 && canWrite ? <Button size="sm" icon={Plus} onClick={() => setModal(<RequisitionDialog fromDesignation={d} onClose={close} />)}>Raise requisition</Button>
                          : <span className="text-xs text-ink-muted">{d.vacant > 0 ? 'None raised' : 'Fully staffed'}</span>}
                      </td>
                      {canWrite && (
                        <td className={TD}>
                          <div className="flex justify-end">
                            <IconButton label={`Edit ${d.title}`} icon={Pencil} onClick={() => setModal(<DesignationDialog designation={d} onClose={close} />)} />
                            {isAdmin && <IconButton label={`Delete ${d.title}`} icon={Trash2} onClick={() => confirmDelete(`Delete ${d.title}?`, 'Requisitions already raised for it are kept.', () => removeDesignation(d.id))} />}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}

        {tab === 'requisitions' && (
          requisitions.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No requisitions yet"
              action={canWrite ? <Button icon={FileSpreadsheet} onClick={() => setModal(<VacancyImportDialog onClose={close} />)}>Sync the vacancy status sheet</Button> : undefined}
            >
              Raise one from a vacant designation, create it here, or bring in the company's vacancy status sheet.
            </EmptyState>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2 border-b border-line p-3">
                <div className="relative w-60">
                  <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-ink-muted" aria-hidden />
                  <input type="search" aria-label="Search requisitions" placeholder="Position, section, name…" value={filter.text} onChange={(e) => setFilterValue({ text: e.target.value })} className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-sm" />
                </div>
                {units.length > 0 && (
                  <div className="w-28">
                    <Select aria-label="Filter by unit" value={filter.unit} onChange={(e) => setFilterValue({ unit: e.target.value })}>
                      <option value="">All units</option>
                      {units.map((code) => <option key={code}>{code}</option>)}
                    </Select>
                  </div>
                )}
                <div className="w-40">
                  <Select aria-label="Filter by status" value={filter.status} onChange={(e) => setFilterValue({ status: e.target.value })}>
                    <option value="">All statuses</option>
                    <option value="open">Still open</option>
                    {Object.keys(STATUS_TONE).map((s) => <option key={s}>{s}</option>)}
                  </Select>
                </div>
                <div className="w-40">
                  <Select aria-label="Filter by new or replacement" value={filter.type} onChange={(e) => setFilterValue({ type: e.target.value })}>
                    <option value="">New and replacement</option>
                    {[...new Set(requisitions.map((r) => r.vacancy_type).filter(Boolean))].map((t) => <option key={t}>{t}</option>)}
                  </Select>
                </div>
                {years.length > 1 && (
                  <div className="w-28">
                    <Select aria-label="Filter by year" value={filter.year} onChange={(e) => setFilterValue({ year: e.target.value })}>
                      <option value="">All years</option>
                      {years.map((y) => <option key={y}>{y}</option>)}
                    </Select>
                  </div>
                )}
                <p className="ml-auto self-center text-xs text-ink-muted">{shownRequisitions.length} of {requisitions.length}</p>
                <Button size="sm" icon={Download} disabled={shownRequisitions.length === 0} onClick={downloadSheet}>Download as the vacancy sheet</Button>
              </div>
              <table className={TABLE}>
                <thead className={THEAD}>
                  <tr>
                    <th scope="col" className={TH}>Ref.</th>
                    <th scope="col" className={TH}>Position</th>
                    <th scope="col" className={TH}>Type</th>
                    <th scope="col" className={`${TH} text-right`}>Vacancies</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={TH}>Requisition</th>
                    <th scope="col" className={`${TH} text-right`} title="From the approved requisition to the offer letter; still counting while open">Days to fill</th>
                    <th scope="col" className={TH}>Selected</th>
                    <th scope="col" className={`${TH} text-right`}>CVs</th>
                    <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shownRequisitions.map((r) => {
                    const bucket = buckets.find((b) => b.requisition_id === r.id);
                    const fill = daysToFill(r);
                    const posts = postings.filter((p) => p.requisition_id === r.id).length;
                    const selected = selectedNames(r);
                    return (
                      <tr key={r.id}>
                        <td className={`${TD} tabular whitespace-nowrap`}>{r.ref_no}</td>
                        <td className={TD}>
                          <span className="font-medium">{r.designation}</span>
                          <span className="block text-xs text-ink-muted">{placeText(r) || r.department}{r.hiring_manager ? ` · ${r.hiring_manager}` : ''}</span>
                          {r.replacing && <span className="block text-xs text-ink-muted">Replacing {r.replacing}</span>}
                        </td>
                        <td className={`${TD} text-xs whitespace-nowrap`}>{r.vacancy_type || '-'}</td>
                        <td className={`${TD} tabular text-right`}>{r.vacancies}</td>
                        <td className={TD}>
                          <span className="flex flex-wrap gap-1">
                            <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge>
                            {(r.priority === 'Urgent' || r.priority === 'High') && <StatusBadge tone={PRIORITY_TONE[r.priority]}>{r.priority}</StatusBadge>}
                          </span>
                        </td>
                        <td className={`${TD} tabular text-xs whitespace-nowrap`}>{dateMedium(r.requisition_date) || dateMedium(r.created_at)}</td>
                        <td className={`${TD} tabular text-right`}>{fill ? <span className={fill.open && fill.days > 30 ? 'font-semibold text-amber-800' : undefined}>{fill.days}{fill.open ? '+' : ''}</span> : '-'}</td>
                        <td className={`${TD} max-w-48 text-xs`}>
                          {selected.length === 0 ? '-' : <span className="line-clamp-2" title={selected.join(', ')}>{selected.join(', ')}</span>}
                        </td>
                        <td className={`${TD} tabular text-right`}>{cvCount(r.id)}{posts > 0 && <span className="block text-[11px] text-ink-muted">{posts} post{posts === 1 ? '' : 's'}</span>}</td>
                        <td className={TD}>
                          <div className="flex items-center justify-end gap-1">
                            <IconButton label={`Details of ${r.ref_no}`} icon={Eye} onClick={() => setModal(<RequisitionDetails requisition={r} onClose={close} />)} />
                            {canWrite && (
                              <>
                                {bucket
                                  ? <Button size="sm" icon={FolderOpen} onClick={() => navigate(`/buckets/${bucket.id}`)}>Bucket</Button>
                                  : <Button size="sm" icon={FolderOpen} onClick={() => setModal(<BucketFormDialog fromRequisition={r} onClose={close} />)}>Create bucket</Button>}
                                <IconButton label={`Record job posting for ${r.ref_no}`} icon={Megaphone} onClick={() => setModal(<PostingDialog requisitionId={r.id} onClose={close} />)} />
                                <IconButton label={`Edit ${r.ref_no}`} icon={Pencil} onClick={() => setModal(<RequisitionDialog requisition={r} onClose={close} />)} />
                                {isAdmin && <IconButton label={`Delete ${r.ref_no}`} icon={Trash2} onClick={() => confirmDelete(`Delete ${r.ref_no}?`, 'Its job postings are deleted too. CV buckets and candidates are kept.', () => removeRequisition(r.id))} />}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {shownRequisitions.length === 0 && (
                    <tr><td colSpan={10} className={`${TD} py-8 text-center text-ink-muted`}>No requisition matches these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )
        )}

        {tab === 'postings' && (
          postings.length === 0 ? (
            <EmptyState icon={Megaphone} title="No job postings recorded">Record each place a vacancy is advertised, so CVs can be traced back to it.</EmptyState>
          ) : (
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th scope="col" className={TH}>Media</th>
                  <th scope="col" className={TH}>Position</th>
                  <th scope="col" className={TH}>Posted</th>
                  <th scope="col" className={TH}>Closes</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={`${TH} text-right`}>Cost (BDT)</th>
                  <th scope="col" className={`${TH} text-right`}>CVs received</th>
                  {canWrite && <th scope="col" className={TH}><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {postings.map((p) => {
                  const requisition = requisitions.find((r) => r.id === p.requisition_id);
                  const bucketIds = new Set(buckets.filter((b) => b.requisition_id === p.requisition_id).map((b) => b.id));
                  const received = candidates.filter((c) => c.job_posting_id === p.id || (bucketIds.has(c.bucket_id) && !c.job_posting_id && c.source === p.media)).length;
                  const bucket = buckets.find((b) => b.requisition_id === p.requisition_id);
                  return (
                    <tr key={p.id}>
                      <td className={`${TD} font-medium`}>
                        {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{p.media}<ExternalLink className="size-3" aria-label="opens in a new tab" /></a> : p.media}
                      </td>
                      <td className={TD}>
                        {requisition?.designation}
                        <span className="block text-xs text-ink-muted">{requisition?.ref_no}</span>
                      </td>
                      <td className={`${TD} tabular whitespace-nowrap`}>{dateMedium(p.posted_on)}</td>
                      <td className={`${TD} tabular whitespace-nowrap`}>{dateMedium(p.closes_on) || '-'}</td>
                      <td className={TD}><StatusBadge tone={p.status === 'Live' ? 'good' : p.status === 'Planned' ? 'info' : 'neutral'}>{p.status}</StatusBadge></td>
                      <td className={`${TD} tabular text-right`}>{money(p.cost)}</td>
                      <td className={`${TD} tabular text-right`}>{bucket ? <Link className="underline" to={`/buckets/${bucket.id}`}>{received}</Link> : received}</td>
                      {canWrite && (
                        <td className={TD}>
                          <div className="flex justify-end">
                            <IconButton label={`Edit ${p.media} posting`} icon={Pencil} onClick={() => setModal(<PostingDialog posting={p} onClose={close} />)} />
                            <IconButton label={`Delete ${p.media} posting`} icon={Trash2} onClick={() => confirmDelete('Delete this job posting?', 'CVs that came from it are kept.', () => removePosting(p.id))} />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>
      {modal}
    </>
  );
}
