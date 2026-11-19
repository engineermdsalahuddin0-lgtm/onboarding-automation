import { Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { reassign, shortlist } from '../lib/pipeline';
import { useStore } from '../lib/store';
import { personName, processTeam } from '../lib/team';
import type { Candidate } from '../types';
import { Button, Dialog, errorText, TextArea, useToast } from './ui';

const LAST_CHOICE = 'handover-choice';

/** The people chosen last time. Older versions kept one id as plain text. */
function storedChoice(): string[] {
  const saved = localStorage.getItem(LAST_CHOICE) ?? '';
  try {
    const list = JSON.parse(saved) as unknown;
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return saved ? [saved] : [];
  }
}

/**
 * The screening desk selects CVs and hands them to the process team: the whole team, or one or more people.
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
  // One or several people, or nobody chosen for the whole process team. The last choice is offered again.
  const initial = mode === 'reassign' ? first.assigned_to : storedChoice();
  const [to, setTo] = useState<string[]>(() => initial.filter((id) => people.some((p) => p.id === id)));
  const [note, setNote] = useState(mode === 'reassign' ? first.handover_note : '');
  const [busy, setBusy] = useState(false);
  const many = candidates.length > 1;
  const and = (list: string[]) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list.join(''));
  const names = and(people.map((p) => personName(p)));
  const chosenName = to.length > 0 ? and(to.map((id) => personName(people.find((p) => p.id === id)))) : 'the whole process team';
  const toggle = (id: string) => setTo((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    // In the team's order, so the same people always read the same way.
    const assigned = people.filter((p) => to.includes(p.id)).map((p) => p.id);
    try {
      for (const c of candidates) {
        await updateCandidate(c.id, mode === 'select'
          ? shortlist({ to: assigned, note, by: user?.full_name || user?.email || '' })
          : reassign(assigned, note));
      }
      if (mode === 'select') localStorage.setItem(LAST_CHOICE, JSON.stringify(assigned));
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

  const option = (key: string, label: string, hint: string, checked: boolean, onChange: () => void) => (
    <label key={key} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2 has-checked:border-brand-600 has-checked:bg-brand-50">
      <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={checked} onChange={onChange} />
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
          <legend className="mb-0.5 text-sm font-medium">Who handles {many ? 'them' : 'this candidate'}</legend>
          <p className="mb-1.5 text-xs text-ink-muted">Tick one person or several. Each one chosen is told, and any of them can do the steps.</p>
          {option('team', 'Whole process team', names ? `${names} see it, and any of them can do the steps.` : 'Everyone on the process desk.', to.length === 0, () => setTo([]))}
          {people.map((p) => option(p.id, personName(p), p.job_title || 'Process desk', to.includes(p.id), () => toggle(p.id)))}
          {to.length > 1 && <p className="text-xs font-medium text-brand-700">Handing to {to.length} people: {chosenName}.</p>}
        </fieldset>
        <TextArea label="Note for them (optional)" rows={2} placeholder="For example: strong candidate, call today" value={note} onChange={(e) => setNote(e.target.value)} />
      </form>
    </Dialog>
  );
}
