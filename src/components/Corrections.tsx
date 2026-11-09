import { Check, FilePen, ShieldCheck, Undo2, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dateTime, todayIso } from '../lib/format';
import { correctableSteps, correctionChanges, EDIT_STEP_LABELS, panelColumns } from '../lib/pipeline';
import { useStore } from '../lib/store';
import type { Candidate, EditRequest, EditStep } from '../types';
import { PanelEditor, panelRows, panelSummary, rowsToPanel, type PanelRow } from './PipelineDialogs';
import { Button, DateTimeField, Dialog, errorText, Select, TextArea, useToast } from './ui';

// Corrections: a step recorded wrongly is corrected only after an admin (GM, AGM, DGM) approves. HR asks with a
// reason; an admin approves or turns it down; the person who asked then corrects that one step, once. The
// database holds the same rules (request_edit, decide_edit, apply_edit in schema.sql).

const OPEN = new Set(['pending', 'approved']);

/** Open requests for this candidate, and recent answers to the person signed in. */
export function useCandidateEdits(candidateId: string) {
  const { editRequests, user } = useStore();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return editRequests.filter((r) =>
    r.candidate_id === candidateId &&
    (OPEN.has(r.status) || (r.requested_by === user?.id && r.status === 'rejected' && (r.decided_at ?? '') > weekAgo)));
}

export function RequestCorrectionDialog({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const { requestEdit, editRequests, user, isAdmin } = useStore();
  const toast = useToast();
  const mineOpen = new Set(editRequests.filter((r) => r.candidate_id === candidate.id && r.requested_by === user?.id && OPEN.has(r.status)).map((r) => r.step));
  const steps = correctableSteps(candidate).filter((step) => !mineOpen.has(step));
  const [step, setStep] = useState<EditStep | ''>(steps.length === 1 ? steps[0] : '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!step) return;
    setBusy(true);
    try {
      await requestEdit(candidate.id, step, reason);
      toast(isAdmin ? 'Request saved. As an admin you can approve it on the card.' : 'Request sent. You are told when an admin answers.');
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Ask to correct a step: ${candidate.full_name}`}
      description="An admin (GM, AGM or DGM) approves the request first. Then you can correct that step once; the history keeps the values before and after."
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="request-correction-form" variant="primary" loading={busy} disabled={!step}>Send request</Button>
        </>
      }
    >
      <form id="request-correction-form" onSubmit={submit} className="space-y-3">
        {steps.length === 0 ? (
          <p className="text-sm text-ink-soft">There is no recorded step left to ask about: each already has an open request from you.</p>
        ) : (
          <Select label="Which step was entered wrongly?" required value={step} onChange={(e) => setStep(e.target.value as EditStep)}>
            <option value="">Choose…</option>
            {steps.map((s) => <option key={s} value={s}>{EDIT_STEP_LABELS[s]}</option>)}
          </Select>
        )}
        <TextArea
          label="What is wrong, and what should it be?"
          required
          minLength={3}
          maxLength={1000}
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. The call date was entered as 12 Nov; the candidate was called on 11 Nov."
        />
        <p className="text-xs text-ink-muted">
          A correction changes what was written down for a step: dates, times, scores, notes. To change the result itself before the final
          decision, use the undo button on the card; after the decision, an admin can unlock it.
        </p>
      </form>
    </Dialog>
  );
}

/** An admin approves or turns down a request, with an optional note for the person who asked. */
export function DecideCorrectionDialog({ request, candidateName, approve, onClose }: { request: EditRequest; candidateName: string; approve: boolean; onClose: () => void }) {
  const { decideEdit } = useStore();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await decideEdit(request.id, approve, note);
      toast(approve ? `Approved. ${request.requested_by_name || 'They'} can now correct the ${EDIT_STEP_LABELS[request.step].toLowerCase()}.` : 'Request turned down.');
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`${approve ? 'Approve' : 'Turn down'} the correction: ${candidateName}`}
      description={`${EDIT_STEP_LABELS[request.step]} · asked by ${request.requested_by_name || 'someone'} on ${dateTime(request.created_at)}`}
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="decide-correction-form" variant={approve ? 'primary' : 'danger'} loading={busy}>{approve ? 'Approve' : 'Turn down'}</Button>
        </>
      }
    >
      <form id="decide-correction-form" onSubmit={submit} className="space-y-3">
        <blockquote className="rounded-lg bg-canvas px-3 py-2 text-sm whitespace-pre-wrap">{request.reason}</blockquote>
        <TextArea
          label={approve ? 'Note (optional)' : 'Why not? (optional)'}
          rows={3}
          maxLength={1000}
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {approve && <p className="text-xs text-ink-muted">They can then change this step's details once, even if the process is locked. You are told when they do.</p>}
      </form>
    </Dialog>
  );
}

type Draft = Partial<Candidate>;

/** The fields of one step, filled with what is recorded now. Only what changes is saved. */
export function CorrectionDialog({ candidate: c, request, onClose }: { candidate: Candidate; request: EditRequest; onClose: () => void }) {
  const { applyEdit } = useStore();
  const toast = useToast();
  const step = request.step;
  const [draft, setDraft] = useState<Draft>(() => ({ ...c }));
  const [rows, setRows] = useState<PanelRow[]>(() => panelRows(step === 'primary' ? c.primary_panel : c.secondary_panel));
  const [busy, setBusy] = useState(false);
  const set = (patch: Draft) => setDraft((current) => ({ ...current, ...patch }));
  const text = (key: keyof Candidate) => (draft[key] as string | null) ?? '';
  const when = (label: string, dateKey: keyof Candidate, timeKey: keyof Candidate, extra: { required?: boolean; min?: string; max?: string } = {}) => (
    <DateTimeField
      label={label}
      required={extra.required}
      min={extra.min}
      max={extra.max}
      date={text(dateKey)}
      time={text(timeKey)}
      onDate={(value) => set({ [dateKey]: value || null } as Draft)}
      onTime={(value) => set({ [timeKey]: value } as Draft)}
    />
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    const full: Draft = step === 'primary' || step === 'final'
      ? { ...draft, ...panelColumns(step === 'primary' ? 'primary' : 'secondary', rowsToPanel(rows)) }
      : draft;
    const changes = correctionChanges(step, c, full);
    if (Object.keys(changes).length === 0) {
      toast('Nothing was changed yet.', 'bad');
      return;
    }
    setBusy(true);
    try {
      await applyEdit(request.id, changes);
      toast(`${c.full_name}: ${EDIT_STEP_LABELS[step].toLowerCase()} corrected. The history keeps the old values.`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  let fields: ReactNode = null;
  const today = todayIso();
  switch (step) {
    case 'call':
      fields = (
        <>
          {when('Called on', 'call_date', 'call_time', { required: true, max: today })}
          {c.call_status === 'confirm' && when('Candidate confirmed on', 'confirmed_date', 'confirmed_time', { required: true, min: text('call_date') || undefined, max: today })}
          {c.call_status === 'reject' && when('Candidate rejected on', 'call_rejected_date', 'call_rejected_time', { required: true, min: text('call_date') || undefined, max: today })}
          {c.call_status === 'followup' && when('Call again on', 'followup_on', 'followup_time')}
          <div className="sm:col-span-2"><TextArea label="Call note" rows={3} value={text('call_note')} onChange={(e) => set({ call_note: e.target.value })} /></div>
        </>
      );
      break;
    case 'primary_schedule':
      fields = (
        <>
          {when('Primary interview on', 'primary_date', 'primary_time', { required: c.primary_date !== null })}
          <Select label="Sent through" value={text('message_channel')} onChange={(e) => set({ message_channel: e.target.value })}>
            {[...new Set(['SMS', 'WhatsApp', 'Email', c.message_channel].filter(Boolean))].map((channel) => <option key={channel}>{channel}</option>)}
          </Select>
        </>
      );
      break;
    case 'final_schedule':
      fields = when('Final interview on', 'secondary_date', 'secondary_time', { required: true });
      break;
    case 'primary':
    case 'final': {
      const key = step === 'primary' ? 'primary_feedback' : 'secondary_feedback';
      const { average, recommended } = panelSummary(rows);
      fields = (
        <div className="space-y-3 sm:col-span-2">
          <PanelEditor rows={rows} onChange={setRows} />
          <p className="text-xs text-ink-soft" aria-live="polite">
            {average !== null && <>Average <strong className="tabular">{average}</strong>/10 · </>}{recommended} of {rows.length} recommended
          </p>
          <TextArea label={step === 'final' ? 'Remarks' : 'Feedback'} rows={3} value={text(key)} onChange={(e) => set({ [key]: e.target.value } as Draft)} />
        </div>
      );
      break;
    }
    case 'decision':
      fields = c.final_decision === 'rejected' ? (
        <>
          {when('Rejected on', 'decision_date', 'decision_time', { required: true })}
          {when('Candidate informed on', 'informed_date', 'informed_time', { required: true, min: text('decision_date') || undefined })}
        </>
      ) : (
        <>
          {when('Selected on', 'decision_date', 'decision_time', { required: true })}
          {when('Joins on (in the letter)', 'joining_date', 'joining_time', { required: true, min: text('decision_date') || undefined })}
        </>
      );
      break;
  }

  return (
    <Dialog
      title={`Correct the ${EDIT_STEP_LABELS[step].toLowerCase()}: ${c.full_name}`}
      description={<>Approved by {request.decided_by_name || 'an admin'}{request.decision_note ? ` ("${request.decision_note}")` : ''}. You asked: "{request.reason}"</>}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <p className="mr-auto text-xs text-ink-muted">Saves once. Correcting this step again needs a new request.</p>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="correction-form" variant="primary" icon={Check} loading={busy}>Save correction</Button>
        </>
      }
    >
      <form id="correction-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">{fields}</form>
    </Dialog>
  );
}

/**
 * On the dashboard: requests waiting for an admin's answer, and approved corrections waiting for the person who
 * asked. Nothing shows when there is nothing to do.
 */
export function CorrectionRequestsCard() {
  const { editRequests, candidates, buckets, user, isAdmin } = useStore();
  const [, setParams] = useSearchParams();
  const waiting = editRequests.filter((r) => (isAdmin && r.status === 'pending') || (r.requested_by === user?.id && r.status === 'approved'));
  if (waiting.length === 0) return null;
  const open = (candidateId: string) => setParams((current) => {
    current.set('candidate', candidateId);
    return current;
  });
  return (
    <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3" aria-label="Correction requests">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <FilePen className="size-4 text-amber-800" aria-hidden />
        {isAdmin ? 'Corrections waiting for your answer' : 'Corrections approved for you'}
        <span className="tabular rounded-full bg-amber-200 px-2 text-xs">{waiting.length}</span>
      </h2>
      <ul className="mt-2 divide-y divide-amber-200/70">
        {waiting.slice(0, 8).map((r) => {
          const c = candidates.find((candidate) => candidate.id === r.candidate_id);
          const position = buckets.find((b) => b.id === c?.bucket_id)?.designation ?? '';
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-48 flex-1">
                <strong>{c?.full_name ?? 'A candidate'}</strong>
                <span className="text-ink-soft">{position ? ` · ${position}` : ''} · {EDIT_STEP_LABELS[r.step]}</span>
                <span className="block text-xs text-ink-soft">
                  {r.status === 'pending' ? `${r.requested_by_name || 'Someone'}: "${r.reason}"` : `Approved by ${r.decided_by_name || 'an admin'} · ${dateTime(r.decided_at)}`}
                </span>
              </span>
              {c && <Button size="sm" onClick={() => open(c.id)}>{r.status === 'pending' ? 'Open to answer' : 'Open to correct'}</Button>}
            </li>
          );
        })}
      </ul>
      {waiting.length > 8 && <p className="mt-1 text-xs text-ink-soft">And {waiting.length - 8} more.</p>}
    </section>
  );
}

type StripModal =
  | { kind: 'decide'; request: EditRequest; approve: boolean }
  | { kind: 'correct'; request: EditRequest };

/** On the candidate card: the correction requests open for this candidate, and what each person can do with them. */
export function CorrectionsStrip({ candidate }: { candidate: Candidate }) {
  const { user, isAdmin, cancelEdit } = useStore();
  const toast = useToast();
  const requests = useCandidateEdits(candidate.id);
  const [modal, setModal] = useState<StripModal | null>(null);
  if (requests.length === 0) return null;

  const withdraw = (request: EditRequest) =>
    void cancelEdit(request.id).then(() => toast('Request withdrawn.'), (error) => toast(errorText(error), 'bad'));

  return (
    <div className="mt-2 space-y-1.5" aria-label="Correction requests">
      {requests.map((r) => {
        const mine = r.requested_by === user?.id;
        const step = EDIT_STEP_LABELS[r.step].toLowerCase();
        return (
          <div key={r.id} className={r.status === 'rejected' ? 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs' : r.status === 'approved' ? 'rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-xs' : 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs'}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {r.status === 'approved' ? <ShieldCheck className="size-4 shrink-0 text-brand-700" aria-hidden /> : <FilePen className="size-4 shrink-0 text-amber-800" aria-hidden />}
              <p className="min-w-48 flex-1">
                {r.status === 'pending' && <><strong>{mine ? 'You asked' : `${r.requested_by_name || 'Someone'} asks`}</strong> to correct the {step}. {mine && !isAdmin && 'Waiting for an admin.'}</>}
                {r.status === 'approved' && <><strong>Correction of the {step} approved</strong> by {r.decided_by_name || 'an admin'}{mine ? '. You can correct it now.' : `, for ${r.requested_by_name || 'the person who asked'}.`}</>}
                {r.status === 'rejected' && <><strong>Correction of the {step} turned down</strong> by {r.decided_by_name || 'an admin'}{r.decision_note ? `: "${r.decision_note}"` : '.'}</>}
                <span className="block text-ink-soft">"{r.reason}" · {dateTime(r.created_at)}</span>
              </p>
              <span className="flex flex-wrap gap-1.5">
                {r.status === 'pending' && isAdmin && (
                  <>
                    <Button size="sm" variant="primary" icon={Check} onClick={() => setModal({ kind: 'decide', request: r, approve: true })}>Approve</Button>
                    <Button size="sm" variant="danger" icon={X} onClick={() => setModal({ kind: 'decide', request: r, approve: false })}>Turn down</Button>
                  </>
                )}
                {r.status === 'approved' && mine && (
                  <Button size="sm" variant="primary" icon={FilePen} onClick={() => setModal({ kind: 'correct', request: r })}>Correct now</Button>
                )}
                {OPEN.has(r.status) && mine && <Button size="sm" variant="ghost" icon={Undo2} onClick={() => withdraw(r)}>Withdraw</Button>}
              </span>
            </div>
          </div>
        );
      })}
      {modal?.kind === 'decide' && <DecideCorrectionDialog request={modal.request} candidateName={candidate.full_name} approve={modal.approve} onClose={() => setModal(null)} />}
      {modal?.kind === 'correct' && <CorrectionDialog candidate={candidate} request={modal.request} onClose={() => setModal(null)} />}
    </div>
  );
}
