import { CalendarPlus, Check, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { STAGE_LABEL } from '../lib/assessment';
import { backend } from '../lib/backend';
import { guessSide } from '../lib/selectionReport';
import { useStore } from '../lib/store';
import { personName } from '../lib/team';
import type { InterviewStage, PanelSide, Profile } from '../types';
import { SignaturePad } from './SignaturePad';
import { Button, Dialog, errorText, Select, TextInput, useToast } from './ui';

export interface InterviewerPrefill {
  full_name: string;
  job_title: string;
  department: string;
}

/** An admin makes an interviewer's login: email and password. A guest who interviewed before can fill it in. */
export function NewInterviewerDialog({ initial, onClose, onDone }: { initial?: InterviewerPrefill; onClose: () => void; onDone?: (profile: Profile) => void }) {
  const { createInterviewer, assessments } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: '', job_title: '', department: '', email: '', password: '', ...initial });
  const [busy, setBusy] = useState(false);
  // People who marked as guests: an admin can turn any of them into an account.
  const guests = [...new Map(assessments.filter((a) => a.marks_by === 'guest' && a.interviewer_name)
    .map((a) => [a.interviewer_name.toLowerCase(), a])).values()];
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const profile = await createInterviewer(form);
      toast(`${profile.full_name || form.full_name} can now sign in with ${form.email} and the password you set.`);
      onDone?.(profile);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Add an interviewer"
      description="The interviewer signs in with this email and password and sees only the interviews you put them on. Give them the email and password yourself."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="new-interviewer" variant="primary" icon={UserPlus} loading={busy}>Add interviewer</Button>
        </>
      }
    >
      <form id="new-interviewer" onSubmit={submit} className="space-y-3">
        {!initial && guests.length > 0 && (
          <Select
            label="From a guest interviewer (optional)"
            value=""
            onChange={(e) => {
              const guest = guests.find((g) => g.id === e.target.value);
              if (guest) set({ full_name: guest.interviewer_name, job_title: guest.interviewer_designation, department: guest.interviewer_department });
            }}
          >
            <option value="">Choose to fill in their details…</option>
            {guests.map((g) => <option key={g.id} value={g.id}>{g.interviewer_name}{g.interviewer_designation ? `, ${g.interviewer_designation}` : ''}</option>)}
          </Select>
        )}
        <TextInput label="Name" required value={form.full_name} onChange={(e) => set({ full_name: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Designation" value={form.job_title} onChange={(e) => set({ job_title: e.target.value })} />
          <TextInput label="Department" value={form.department} onChange={(e) => set({ department: e.target.value })} />
          <TextInput label="Email (login ID)" type="email" required autoComplete="off" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          <TextInput label="Password" type="text" required minLength={backend.mode === 'demo' ? 0 : 8} autoComplete="new-password" hint="At least 8 characters." value={form.password} onChange={(e) => set({ password: e.target.value })} />
        </div>
      </form>
    </Dialog>
  );
}

/** An admin changes an interviewer's details, and can save their signature for them, e.g. from a signed paper. */
export function EditInterviewerDialog({ person, onClose }: { person: Profile; onClose: () => void }) {
  const { updateProfile, saveUser } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: person.full_name ?? '', job_title: person.job_title, department: person.department ?? '', email: person.email ?? '', password: '' });
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await saveUser(person.id, {
        full_name: form.full_name.trim(), job_title: form.job_title.trim(), department: form.department.trim(), email: form.email.trim(),
        ...(form.password ? { password: form.password } : {}),
      });
      if (signature !== null) await updateProfile(person.id, { signature });
      toast(`${form.full_name.trim() || 'Interviewer'}: saved.`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Edit ${personName(person)}`}
      description="Printed on every interview form this person marks. The interviewer can change these too, from their own page."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-interviewer" variant="primary" icon={Check} loading={busy}>Save</Button>
        </>
      }
    >
      <form id="edit-interviewer" onSubmit={submit} className="space-y-3">
        <TextInput label="Name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Designation" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
          <TextInput label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Email (login ID)" type="email" required autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <TextInput
            label="New password"
            type="text"
            minLength={form.password && backend.mode !== 'demo' ? 8 : undefined}
            autoComplete="new-password"
            hint="Only to change it, e.g. when they forgot it."
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <SignaturePad label="Saved signature" saved={person.signature || undefined} value={signature ?? ''} onChange={setSignature} />
      </form>
    </Dialog>
  );
}

/** Puts one interviewer on a bucket's primary or final interview. */
export function AssignInterviewDialog({ person, onClose }: { person: Profile; onClose: () => void }) {
  const { buckets, panels, addToPanel } = useStore();
  const toast = useToast();
  const [bucketId, setBucketId] = useState('');
  const [stage, setStage] = useState<InterviewStage>('primary');
  const [side, setSide] = useState<Exclude<PanelSide, ''>>(() => guessSide(person.department));
  const [busy, setBusy] = useState(false);
  const open = buckets.filter((b) => b.status !== 'Archived');
  const already = panels.some((p) => p.bucket_id === bucketId && p.stage === stage && p.interviewer_id === person.id);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await addToPanel(bucketId, stage, person.id, side);
      toast(`${personName(person)} is on the ${STAGE_LABEL[stage].toLowerCase()} for ${buckets.find((b) => b.id === bucketId)?.designation}.`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Assign ${personName(person)} to an interview`}
      description="They see that position's candidates as soon as each one's interview is scheduled."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="assign-interview" variant="primary" icon={CalendarPlus} loading={busy} disabled={!bucketId || already}>Assign</Button>
        </>
      }
    >
      <form id="assign-interview" onSubmit={submit} className="space-y-3">
        <Select label="Position (CV bucket)" required value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
          <option value="">Choose…</option>
          {open.map((b) => <option key={b.id} value={b.id}>{b.designation}{[b.unit, b.department].filter(Boolean).length ? ` · ${[b.unit, b.department].filter(Boolean).join(' · ')}` : ''}</option>)}
        </Select>
        <Select label="Interview" value={stage} onChange={(e) => setStage(e.target.value as InterviewStage)}>
          <option value="primary">{STAGE_LABEL.primary}</option>
          <option value="secondary">{STAGE_LABEL.secondary}</option>
        </Select>
        {stage === 'primary' && (
          <Select label="Sits for" hint="Their column on the primary selection report." value={side} onChange={(e) => setSide(e.target.value as Exclude<PanelSide, ''>)}>
            <option value="hrd">HRD</option>
            <option value="team">Team (the department)</option>
          </Select>
        )}
        {already && <p className="text-sm text-amber-900">Already on this interview.</p>}
      </form>
    </Dialog>
  );
}
