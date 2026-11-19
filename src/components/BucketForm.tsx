import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_COLORS } from '../lib/defaults';
import { classNames, whenText } from '../lib/format';
import { useStore } from '../lib/store';
import type { CvBucket, Requisition } from '../types';
import { OrgFields } from './OrgFields';
import { Button, DateTimeField, Dialog, errorText, Select, TextArea, TextInput, useToast } from './ui';

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
  const { requisitions, settings, candidates, canProcess, saveBucket, updateCandidates } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    requisition_id: bucket?.requisition_id ?? fromRequisition?.id ?? '',
    designation: bucket?.designation ?? fromRequisition?.designation ?? '',
    unit: bucket?.unit ?? fromRequisition?.unit ?? '',
    department: bucket?.department ?? fromRequisition?.department ?? defaultDepartment ?? '',
    section: bucket?.section ?? fromRequisition?.section ?? '',
    subsection: bucket?.subsection ?? fromRequisition?.subsection ?? '',
    // The company is always the group; an existing bucket keeps what it has.
    company: bucket ? bucket.company : fromRequisition?.company || settings.group_name,
    color: bucket?.color ?? 'green',
    status: bucket?.status ?? 'Open',
    accepting_applications: bucket?.accepting_applications ?? true,
    description: bucket?.description ?? '',
    primary_date: bucket?.primary_date ?? '',
    primary_time: bucket?.primary_time ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  // Moving the bucket's interview day moves the people waiting for it: scheduled for the old day, not yet
  // interviewed, and not on a new date of their own. This is the company's change, so it uses up nobody's new date.
  const slotChanged = Boolean(bucket?.primary_date) && (form.primary_date !== bucket?.primary_date || form.primary_time !== bucket?.primary_time);
  const waitingForOldSlot = bucket && slotChanged
    ? candidates.filter((c) => c.bucket_id === bucket.id && c.final_decision === null && c.primary_status === 'scheduled' && c.secondary_status === 'pending'
      && !c.primary_attendance && !c.primary_reschedules && c.primary_date === bucket.primary_date && c.primary_time === bucket.primary_time)
    : [];
  const [moveThem, setMoveThem] = useState(true);

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
            company: requisition.company || settings.group_name,
          }
        : {}),
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await saveBucket({
        ...(bucket ? { id: bucket.id } : {}),
        ...form,
        requisition_id: form.requisition_id || null,
        primary_date: form.primary_date || null,
        primary_time: form.primary_date ? form.primary_time : '',
      });
      let moved = 0;
      if (moveThem && canProcess && waitingForOldSlot.length > 0 && form.primary_date) {
        moved = await updateCandidates(waitingForOldSlot.map((c) => c.id), () => ({ primary_date: form.primary_date, primary_time: form.primary_time }));
      }
      toast(bucket ? `Bucket updated.${moved ? ` ${moved} candidate${moved === 1 ? '' : 's'} moved to the new interview date.` : ''}` : 'Bucket created.');
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
          <DateTimeField
            label="Primary interview on"
            date={form.primary_date}
            time={form.primary_time}
            onDate={(primary_date) => set({ primary_date })}
            onTime={(primary_time) => set({ primary_time })}
            hint="Optional. Everyone who confirms on the call is scheduled for this day. A candidate who cannot come gets a new date of their own."
          />
          {waitingForOldSlot.length > 0 && form.primary_date && (
            canProcess ? (
              <label className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={moveThem} onChange={(e) => setMoveThem(e.target.checked)} />
                <span>Also move the {waitingForOldSlot.length} candidate{waitingForOldSlot.length === 1 ? '' : 's'} scheduled for {whenText(bucket?.primary_date ?? null, bucket?.primary_time ?? '')} to the new day. Tell them the new date.</span>
              </label>
            ) : (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {waitingForOldSlot.length} candidate{waitingForOldSlot.length === 1 ? ' is' : 's are'} scheduled for the old day. The process team moves them from their cards.
              </p>
            )
          )}
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
