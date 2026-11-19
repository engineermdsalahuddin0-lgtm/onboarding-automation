import { CalendarDays, ClipboardPen, Pencil } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import tabLogo from '../assets/images/bitopi_group_logo_for_tab.jpg';
import { AssessmentForm } from '../components/AssessmentForm';
import { SignaturePad } from '../components/SignaturePad';
import { Button, Card, Dialog, EmptyState, errorText, Spinner, StatusBadge, TextInput, useToast } from '../components/ui';
import { isFilled, scoreOf, STAGE_LABEL } from '../lib/assessment';
import { backend } from '../lib/backend';
import { dateDmy, time12 } from '../lib/format';
import type { AssessmentInput, GuestInterview, InterviewCandidate } from '../types';
import { FormStatus, inputOf } from './MyInterviews';

interface Guest {
  name: string;
  designation: string;
  department: string;
  signature: string;
}

const storageKey = (token: string) => `guest-interviewer:${token}`;

function storedGuest(token: string): Guest | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(token)) ?? 'null') as Guest | null;
    return value && value.name ? value : null;
  } catch {
    return null;
  }
}

/** The page a guest interviewer opens from the link HR sent: who they are once, then a form per candidate. */
export function GuestInterviewPage() {
  const { token = '' } = useParams();
  const [guest, setGuest] = useState<Guest | null>(() => storedGuest(token));
  const [data, setData] = useState<GuestInterview | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [editingGuest, setEditingGuest] = useState(false);
  const [open, setOpen] = useState<InterviewCandidate | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await backend.rpc<GuestInterview | null>('get_guest_interview', { p_token: token, p_name: guest?.name ?? '' }));
      setError('');
    } catch (failure) {
      setError(errorText(failure));
    }
  }, [token, guest?.name]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = useMemo(() => new Map((data?.assessments ?? []).map((a) => [a.candidate_id, a])), [data]);

  function saveGuest(next: Guest) {
    localStorage.setItem(storageKey(token), JSON.stringify(next));
    setGuest(next);
    setEditingGuest(false);
  }

  let body;
  if (data === undefined) body = error ? <p role="alert" className="text-sm text-red-800">{error}</p> : <Spinner label="Loading the interview" />;
  else if (data === null) body = <EmptyState icon={CalendarDays} title="This interview link is not valid">Ask HR for a new link.</EmptyState>;
  else if (!data.open) {
    body = (
      <EmptyState icon={CalendarDays} title="This link has expired">
        It was for the interview on {dateDmy(data.valid_on)}. Ask HR for today's link.
      </EmptyState>
    );
  } else if (!guest || editingGuest) {
    body = <GuestDetails initial={guest} onSave={saveGuest} onCancel={guest ? () => setEditingGuest(false) : undefined} />;
  } else {
    body = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          <span className="flex-1">
            Marking as <strong>{guest.name}</strong>, {guest.designation}{guest.department ? `, ${guest.department}` : ''}
            {!guest.signature && <span className="text-amber-900"> · not signed</span>}
          </span>
          <Button size="sm" icon={Pencil} onClick={() => setEditingGuest(true)}>Change</Button>
        </div>
        <Card title="Candidates">
          {data.candidates.length === 0 ? (
            <p className="text-sm text-ink-muted">No candidate is scheduled for this interview today.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.candidates.map((candidate) => {
                const form = mine.get(candidate.id);
                return (
                  <li key={candidate.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{candidate.full_name}</p>
                      <p className="text-xs text-ink-muted">{candidate.time ? time12(candidate.time) : ''}{candidate.current_designation ? ` · ${candidate.current_designation}` : ''}</p>
                    </div>
                    {candidate.attendance && <StatusBadge tone="warning">Did not attend</StatusBadge>}
                    <FormStatus form={form} />
                    <Button size="sm" variant={form && isFilled(form) ? 'secondary' : 'primary'} icon={ClipboardPen} onClick={() => setOpen(candidate)}>
                      {form && isFilled(form) ? 'Edit marks' : 'Give marks'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <img src={tabLogo} alt="" className="size-9 rounded-md object-contain" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{data?.group_name || 'Interview'}: Interview Assessment</p>
          {data && <p className="truncate text-xs text-ink-muted">{data.designation} · {STAGE_LABEL[data.stage]} · {dateDmy(data.valid_on)}</p>}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-5">{body}</main>
      {open && data && guest && (
        <GuestMarkDialog
          token={token}
          data={data}
          guest={guest}
          candidate={open}
          initial={inputOf(mine.get(open.id))}
          onClose={() => setOpen(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}

function GuestDetails({ initial, onSave, onCancel }: { initial: Guest | null; onSave: (guest: Guest) => void; onCancel?: () => void }) {
  const [form, setForm] = useState<Guest>(initial ?? { name: '', designation: '', department: '', signature: '' });
  const [error, setError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim().length < 2) return setError('Write your name.');
    if (!form.designation.trim()) return setError('Write your designation.');
    onSave({ name: form.name.trim(), designation: form.designation.trim(), department: form.department.trim(), signature: form.signature });
  }

  return (
    <Card title="Who is marking">
      <p className="-mt-1 mb-3 text-sm text-ink-soft">Once only: this goes on every form you mark today.</p>
      <form onSubmit={submit} className="space-y-3">
        <TextInput label="Your name" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Designation (position)" required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <TextInput label="Department (optional)" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
        </div>
        <SignaturePad label="Your signature" saved={initial?.signature || undefined} value={form.signature} onChange={(signature) => setForm({ ...form, signature })} />
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary">Continue</Button>
          {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        </div>
      </form>
    </Card>
  );
}

function GuestMarkDialog({ token, data, guest, candidate, initial, onClose, onSaved }: {
  token: string;
  data: GuestInterview;
  guest: Guest;
  candidate: InterviewCandidate;
  initial: AssessmentInput | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function save(input: AssessmentInput) {
    setBusy(true);
    try {
      await backend.rpc('save_guest_assessment', { p_token: token, p_candidate: candidate.id, p_guest: guest, p_payload: input });
      const score = scoreOf(input.ratings);
      toast(`${candidate.full_name}: ${score.obtained}/50 (${score.percent}%) saved.`);
      onSaved();
      onClose();
    } catch (failure) {
      toast(errorText(failure), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`${candidate.full_name}: ${STAGE_LABEL[data.stage]}`}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="guest-assessment" variant="primary" loading={busy}>Save marks</Button>
        </>
      }
    >
      <AssessmentForm
        id="guest-assessment"
        header={{
          ...data, candidateName: candidate.full_name, date: candidate.date ?? data.valid_on,
          interviewerName: guest.name, interviewerDesignation: guest.designation, interviewerDepartment: guest.department,
        }}
        initial={initial}
        onSubmit={(input) => void save(input)}
        signature={
          <div className="border-t border-line pt-3">
            <p className="mb-1 text-xs font-medium text-ink-soft">Interviewer's signature</p>
            {guest.signature
              ? <img src={guest.signature} alt="Your signature" className="h-16 rounded-lg border border-line bg-white" />
              : <p className="text-sm text-ink-muted">Not signed. Use Change at the top to add your signature.</p>}
          </div>
        }
      />
    </Dialog>
  );
}
