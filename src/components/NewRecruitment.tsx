import { CircleHelp } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DESIGNATIONS, gradeOf } from '../lib/designations';
import { todayIso } from '../lib/format';
import { useStore } from '../lib/store';
import { OrgFields, type OrgPlace } from './OrgFields';
import { Button, Dialog, errorText, HoverTooltip, Select, TextInput, useToast } from './ui';

/**
 * One window for a new recruitment: where the position sits, which designation and how many people. Saving
 * makes the requisition and its CV bucket together and opens the bucket, ready for CVs.
 * The company is always the group, so it is not asked for; the designation's grade is kept without being shown.
 */
export function NewRecruitmentDialog({ onClose, title = 'New recruitment' }: { onClose: () => void; title?: string }) {
  const { settings, user, saveRequisition, saveBucket, removeRequisition } = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [place, setPlace] = useState<OrgPlace>({ unit: '', department: '', section: '', subsection: '' });
  const [designation, setDesignation] = useState('');
  const [posts, setPosts] = useState('1');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const company = settings.group_name || 'Bitopi Group';
    let requisitionId: string | null = null;
    try {
      const requisition = await saveRequisition({
        ...place,
        designation,
        grade: gradeOf(designation),
        company,
        vacancies: Math.max(1, Number(posts) || 1),
        // CVs are collected from now on, so the recruitment is under way.
        status: 'In progress',
        requisition_date: todayIso(),
        requested_by: user?.full_name ?? '',
      });
      requisitionId = requisition.id;
      const bucket = await saveBucket({ ...place, requisition_id: requisition.id, designation, company, color: 'green', status: 'Open', accepting_applications: true, description: '' });
      toast(`${designation}: requisition ${requisition.ref_no} and its CV bucket are ready.`);
      onClose();
      navigate(`/buckets/${bucket.id}`);
    } catch (error) {
      // Both or neither: a requisition without its bucket would only confuse.
      if (requisitionId) await removeRequisition(requisitionId).catch(() => undefined);
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={title}
      description="Makes the CV bucket and its requisition together, so there is nothing to do on the Requisitions page. The bucket opens when you are done, ready for CVs."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="recruitment-form" variant="primary" loading={busy}>Create</Button>
        </>
      }
    >
      <form id="recruitment-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <OrgFields value={place} onChange={setPlace} requireUnit requireDepartment />
        <Select label="Designation" required value={designation} onChange={(e) => setDesignation(e.target.value)}>
          <option value="">Choose…</option>
          {DESIGNATIONS.map((d) => <option key={d.title}>{d.title}</option>)}
        </Select>
        <div>
          <div className="mb-1 flex h-4 items-center gap-1">
            <label htmlFor="recruitment-posts" className="text-xs font-medium text-ink-soft">Number of posts<span className="text-red-800"> *</span></label>
            <HoverTooltip
              side="above"
              details={
                <div className="space-y-1.5 text-sm leading-relaxed text-ink-soft">
                  <p><strong className="text-ink">How many people you will hire</strong> for this designation in this recruitment.</p>
                  <p>Need two Executives for HR? Write <strong className="text-ink">2</strong>. It is not the number of CVs you expect, and not how many people already work there.</p>
                  <p>The dashboard uses it to show how many places are still open.</p>
                </div>
              }
            >
              {({ tooltipId }) => (
                <button type="button" aria-label="What is Number of posts?" aria-describedby={tooltipId} className="inline-flex size-5 -my-0.5 items-center justify-center rounded-full text-ink-muted hover:bg-hover hover:text-brand-700">
                  <CircleHelp className="size-3.5" aria-hidden />
                </button>
              )}
            </HoverTooltip>
          </div>
          <TextInput
            id="recruitment-posts"
            type="number"
            min={1}
            max={500}
            step={1}
            required
            inputMode="numeric"
            value={posts}
            onChange={(e) => setPosts(e.target.value)}
            hint="People to hire, not CVs."
          />
        </div>
      </form>
    </Dialog>
  );
}
