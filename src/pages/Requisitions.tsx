import { ClipboardList, ExternalLink, FolderOpen, Megaphone, Pencil, Plus, Trash2, UserRoundSearch } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BucketFormDialog } from '../components/BucketForm';
import { HelpTip } from '../components/Guide';
import { Button, Confirm, Dialog, EmptyState, errorText, IconButton, PageHeader, Select, StatusBadge, TABLE, Tabs, TD, TextArea, TextInput, TH, THEAD, useToast } from '../components/ui';
import { dateMedium, money, todayIso } from '../lib/format';
import type { Tone } from '../lib/pipeline';
import { useStore } from '../lib/store';
import type { Designation, JobPosting, Priority, Requisition, RequisitionStatus } from '../types';

type Tab = 'vacancies' | 'requisitions' | 'postings';

const STATUS_TONE: Record<RequisitionStatus, Tone> = {
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
    department: requisition?.department ?? fromDesignation?.department ?? settings.departments[0] ?? '',
    company: requisition?.company ?? fromDesignation?.company ?? settings.default_company,
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
        designation_id: designations.find((d) => d.title === form.designation)?.id ?? form.designation_id,
        vacancies: Number(form.vacancies),
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        target_date: form.target_date || null,
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
        <TextInput label="Designation" required autoFocus list="designation-list" value={form.designation} onChange={(e) => set({ designation: e.target.value })} />
        <datalist id="designation-list">{designations.map((d) => <option key={d.id} value={d.title} />)}</datalist>
        <Select label="Department" value={form.department} onChange={(e) => set({ department: e.target.value })}>
          {[...new Set([...settings.departments, form.department].filter(Boolean))].map((d) => <option key={d}>{d}</option>)}
        </Select>
        <TextInput label="Company" list="req-company-options-2" value={form.company} onChange={(e) => set({ company: e.target.value })} />
        <datalist id="req-company-options-2">{settings.companies.map((c) => <option key={c} value={c} />)}</datalist>
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
        <div className="sm:col-span-2"><TextArea label="Why this position is needed" rows={2} value={form.justification} onChange={(e) => set({ justification: e.target.value })} /></div>
        <div className="sm:col-span-2"><TextArea label="Job description" hint="Shown to candidates on the application form." rows={4} value={form.job_description} onChange={(e) => set({ job_description: e.target.value })} /></div>
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

export function RequisitionsPage() {
  const { designations, requisitions, postings, buckets, candidates, canWrite, isAdmin, removeRequisition, removePosting, removeDesignation } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('vacancies');
  const [modal, setModal] = useState<React.ReactNode>(null);
  const close = () => setModal(null);

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
              {tab === 'requisitions' && <Button variant="primary" icon={Plus} onClick={() => setModal(<RequisitionDialog onClose={close} />)}>New requisition</Button>}
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
                  const open = requisitions.find((r) => r.designation === d.title && r.department === d.department && !['Filled', 'Cancelled'].includes(r.status));
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
            <EmptyState icon={ClipboardList} title="No requisitions yet">Raise one from a vacant designation, or create it here.</EmptyState>
          ) : (
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th scope="col" className={TH}>Ref.</th>
                  <th scope="col" className={TH}>Position</th>
                  <th scope="col" className={`${TH} text-right`}>Vacancies</th>
                  <th scope="col" className={TH}>Priority</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}>Budget (BDT)</th>
                  <th scope="col" className={TH}>Target</th>
                  <th scope="col" className={`${TH} text-right`}>Posts</th>
                  <th scope="col" className={`${TH} text-right`}>CVs</th>
                  {canWrite && <th scope="col" className={TH}><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {requisitions.map((r) => {
                  const bucket = buckets.find((b) => b.requisition_id === r.id);
                  return (
                    <tr key={r.id}>
                      <td className={`${TD} tabular whitespace-nowrap`}>{r.ref_no}</td>
                      <td className={TD}>
                        <span className="font-medium">{r.designation}</span>
                        <span className="block text-xs text-ink-muted">{r.department}{r.hiring_manager ? ` · ${r.hiring_manager}` : ''}</span>
                      </td>
                      <td className={`${TD} tabular text-right`}>{r.vacancies}</td>
                      <td className={TD}><StatusBadge tone={PRIORITY_TONE[r.priority]}>{r.priority}</StatusBadge></td>
                      <td className={TD}><StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge></td>
                      <td className={`${TD} tabular whitespace-nowrap`}>{r.budget_min || r.budget_max ? `${money(r.budget_min)} - ${money(r.budget_max)}` : '-'}</td>
                      <td className={`${TD} tabular whitespace-nowrap`}>{dateMedium(r.target_date) || '-'}</td>
                      <td className={`${TD} tabular text-right`}>{postings.filter((p) => p.requisition_id === r.id).length}</td>
                      <td className={`${TD} tabular text-right`}>{cvCount(r.id)}</td>
                      {canWrite && (
                        <td className={TD}>
                          <div className="flex items-center justify-end gap-1">
                            {bucket
                              ? <Button size="sm" icon={FolderOpen} onClick={() => navigate(`/buckets/${bucket.id}`)}>Bucket</Button>
                              : <Button size="sm" icon={FolderOpen} onClick={() => setModal(<BucketFormDialog fromRequisition={r} onClose={close} />)}>Create bucket</Button>}
                            <IconButton label={`Record job posting for ${r.ref_no}`} icon={Megaphone} onClick={() => setModal(<PostingDialog requisitionId={r.id} onClose={close} />)} />
                            <IconButton label={`Edit ${r.ref_no}`} icon={Pencil} onClick={() => setModal(<RequisitionDialog requisition={r} onClose={close} />)} />
                            {isAdmin && <IconButton label={`Delete ${r.ref_no}`} icon={Trash2} onClick={() => confirmDelete(`Delete ${r.ref_no}?`, 'Its job postings are deleted too. CV buckets and candidates are kept.', () => removeRequisition(r.id))} />}
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
