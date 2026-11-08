import { Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { reassign, shortlist } from '../lib/pipeline';
import { useStore } from '../lib/store';
import { personName, processTeam } from '../lib/team';
import type { Candidate } from '../types';
import { Button, Dialog, errorText, TextArea, useToast } from './ui';

const LAST_CHOICE = 'handover-choice';

/**
 * The screening desk selects CVs and hands them to the process team: the whole team, or one person.
 * The people chosen get a notification. Also used to give a candidate to someone else later.
 */
export function HandoverDialog({ candidates, mode, onClose, onDone }: {
  candidates: Candidate[];
  mode: 'select' | 'reassign';
  onClose: () => void;
  onDone?: () => void;
}) {
  const { team, user, updateCandidate } = useStore();
  const toast = useToast();
  const people = processTeam(team).filter((p) => p.id !== user?.id);
  const first = candidates[0];
  const initial = mode === 'reassign'
    ? (first.assigned_to.length === 1 ? first.assigned_to[0] : '')
    : (localStorage.getItem(LAST_CHOICE) ?? '');
  const [to, setTo] = useState(people.some((p) => p.id === initial) ? initial : '');
  const [note, setNote] = useState(mode === 'reassign' ? first.handover_note : '');
  const [busy, setBusy] = useState(false);
  const many = candidates.length > 1;
  const listed = people.map((p) => personName(p));
  const names = listed.length > 1 ? `${listed.slice(0, -1).join(', ')} and ${listed[listed.length - 1]}` : listed.join('');
  const chosenName = to ? personName(people.find((p) => p.id === to)) : 'the whole process team';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const assigned = to ? [to] : [];
    try {
      for (const c of candidates) {
        await updateCandidate(c.id, mode === 'select'
          ? shortlist({ to: assigned, note, by: user?.full_name || user?.email || '' })
          : reassign(assigned, note));
      }
      if (mode === 'select') localStorage.setItem(LAST_CHOICE, to);
      toast(mode === 'select'
        ? `${many ? `${candidates.length} CVs` : first.full_name} selected and handed to ${chosenName}. Next: the call.`
        : `${first.full_name} is now with ${chosenName}.`);
      onDone?.();
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  const option = (value: string, label: string, hint: string) => (
    <label key={value || 'team'} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2 has-checked:border-brand-600 has-checked:bg-brand-50">
      <input type="radio" name="handover-to" className="mt-0.5 size-4 accent-brand-600" checked={to === value} onChange={() => setTo(value)} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-ink-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <Dialog
      title={mode === 'select' ? (many ? `Select ${candidates.length} CVs and hand over` : `Select ${first.full_name} and hand over`) : `Hand ${first.full_name} to someone else`}
      description={mode === 'select' ? 'The process team takes it from here: call, interviews, decision and joining. They are told at once.' : 'The person you choose is told at once.'}
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="handover-form" variant="primary" icon={Send} loading={busy}>{mode === 'select' ? 'Select and hand over' : 'Hand over'}</Button>
        </>
      }
    >
      <form id="handover-form" onSubmit={submit} className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium">Who handles {many ? 'them' : 'this candidate'}</legend>
          {option('', 'Whole process team', names ? `${names} see it, and any of them can do the steps.` : 'Everyone on the process desk.')}
          {people.map((p) => option(p.id, personName(p), p.job_title || 'Process desk'))}
        </fieldset>
        <TextArea label="Note for them (optional)" rows={2} placeholder="For example: strong candidate, call today" value={note} onChange={(e) => setNote(e.target.value)} />
      </form>
    </Dialog>
  );
}
