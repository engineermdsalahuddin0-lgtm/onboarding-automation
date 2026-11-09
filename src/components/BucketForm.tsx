import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_COLORS } from '../lib/defaults';
import { classNames } from '../lib/format';
import { useStore } from '../lib/store';
import type { CvBucket, Requisition } from '../types';
import { OrgFields } from './OrgFields';
import { Button, Dialog, errorText, Select, TextArea, TextInput, useToast } from './ui';

export const FOLDER_COLORS: Record<string, { tab: string; body: string; icon: string }> = {
  stone: { tab: 'bg-stone-200', body: 'bg-stone-50 border-stone-200', icon: 'text-stone-600' },
  green: { tab: 'bg-brand-100', body: 'bg-brand-50 border-brand-100', icon: 'text-brand-700' },
  blue: { tab: 'bg-sky-200', body: 'bg-sky-50 border-sky-200', icon: 'text-sky-800' },
  amber: { tab: 'bg-amber-200', body: 'bg-amber-50 border-amber-200', icon: 'text-amber-800' },
  rose: { tab: 'bg-rose-200', body: 'bg-rose-50 border-rose-200', icon: 'text-rose-800' },
  violet: { tab: 'bg-violet-200', body: 'bg-violet-50 border-violet-200', icon: 'text-violet-800' },
  teal: { tab: 'bg-teal-200', body: 'bg-teal-50 border-teal-200', icon: 'text-teal-800' },
};

interface Props {
  onClose: () => void;
  bucket?: CvBucket;
  fromRequisition?: Requisition;
  defaultDepartment?: string;
}

export function BucketFormDialog({ onClose, bucket, fromRequisition, defaultDepartment }: Props) {
  const { requisitions, settings, saveBucket } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    requisition_id: bucket?.requisition_id ?? fromRequisition?.id ?? '',
    designation: bucket?.designation ?? fromRequisition?.designation ?? '',
    unit: bucket?.unit ?? fromRequisition?.unit ?? '',
    department: bucket?.department ?? fromRequisition?.department ?? defaultDepartment ?? '',
    section: bucket?.section ?? fromRequisition?.section ?? '',
    subsection: bucket?.subsection ?? fromRequisition?.subsection ?? '',
    // A requisition synced from the vacancy sheet has no company of its own: the default company is used.
    company: bucket ? bucket.company : fromRequisition?.company || settings.default_company,
    color: bucket?.color ?? 'green',
    status: bucket?.status ?? 'Open',
    accepting_applications: bucket?.accepting_applications ?? true,
    description: bucket?.description ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  function linkRequisition(id: string) {
    const requisition = requisitions.find((r) => r.id === id);
    set({
      requisition_id: id,
      ...(requisition
        ? {
            designation: requisition.designation,
            unit: requisition.unit ?? '',
            department: requisition.department,
            section: requisition.section ?? '',
            subsection: requisition.subsection ?? '',
            company: requisition.company || settings.default_company,
          }
        : {}),
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await saveBucket({ ...(bucket ? { id: bucket.id } : {}), ...form, requisition_id: form.requisition_id || null });
      toast(bucket ? 'Bucket updated.' : 'Bucket created.');
      onClose();
      if (!bucket) navigate(`/buckets/${saved.id}`);
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={bucket ? 'Edit CV bucket' : 'New CV bucket'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="bucket-form" variant="primary" loading={busy}>{bucket ? 'Save' : 'Create bucket'}</Button>
        </>
      }
    >
      <form id="bucket-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Select label="Requisition" value={form.requisition_id} onChange={(e) => linkRequisition(e.target.value)}>
            <option value="">Not linked to a requisition</option>
            {requisitions.map((r) => <option key={r.id} value={r.id}>{r.ref_no} · {r.designation}</option>)}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <TextInput label="Designation" required autoFocus value={form.designation} onChange={(e) => set({ designation: e.target.value })} />
        </div>
        <OrgFields value={form} onChange={(place) => set(place)} />
        <div className="sm:col-span-2">
          <TextInput label="Company" value={form.company} list="company-options" onChange={(e) => set({ company: e.target.value })} hint="Printed on the offer letter and joining documents." />
          <datalist id="company-options">{settings.companies.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="sm:col-span-2">
          <TextArea label="Notes" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-xs font-medium text-ink-soft">Folder colour</legend>
          <div className="flex gap-2">
            {DEFAULT_COLORS.map((color) => (
              <label key={color} className={classNames('size-7 cursor-pointer rounded-lg border-2', FOLDER_COLORS[color].tab, form.color === color ? 'border-ink' : 'border-transparent')}>
                <input type="radio" name="folder-color" value={color} aria-label={color} checked={form.color === color} onChange={() => set({ color })} className="sr-only" />
              </label>
            ))}
          </div>
        </fieldset>
        {bucket && (
          <Select label="Status" value={form.status} onChange={(e) => set({ status: e.target.value as CvBucket['status'] })}>
            <option>Open</option>
            <option>Closed</option>
            <option>Archived</option>
          </Select>
        )}
        <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-1">
          <input type="checkbox" className="size-4 accent-brand-600" checked={form.accepting_applications} onChange={(e) => set({ accepting_applications: e.target.checked })} />
          Accept applications through the company form
        </label>
      </form>
    </Dialog>
  );
}
