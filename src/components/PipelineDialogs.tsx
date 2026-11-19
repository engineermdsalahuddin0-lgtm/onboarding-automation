import { Copy, Download, Mail, MessageCircle, Plus, Smartphone, Star, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { assessmentsToPanel } from '../lib/assessment';
import { backend } from '../lib/backend';
import { DOCUMENT_CHECKLIST } from '../lib/defaults';
import { downloadCsv } from '../lib/export';
import { classNames, nowTime, todayIso, whenText } from '../lib/format';
import {
  attendanceOf,
  bucketSlot,
  confirmDecision,
  giveNewDate,
  JOINING,
  markMissed,
  normalizePhone,
  panelColumns,
  recordJoiningCall,
  rejectDecision,
  rejectMissed,
  rejectScreening,
  REVIEW_CLOSES,
  scheduledRound,
  scheduleFinal,
  schedulePrimary,
  setCall,
  setPrimary,
  setSecondary,
  type Slot,
} from '../lib/pipeline';
import { useStore } from '../lib/store';
import { candidateVars, renderTemplate, slotVars } from '../lib/templates';
import type { Candidate, CallStatus, CvBucket, InterviewerScore, JoiningStatus, SelectionCategory } from '../types';
import { Button, DateTimeField, Dialog, errorText, IconButton, Select, TextArea, TextInput, useToast } from './ui';

export function copyText(text: string) {
  return navigator.clipboard.writeText(text);
}

/** Mobile number in the form WhatsApp links need: country code, digits only. */
function whatsappNumber(phone: string): string {
  const digits = normalizePhone(phone);
  return digits.startsWith('0') ? `88${digits}` : digits;
}

export function ScreeningRejectDialog({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const { updateCandidate } = useStore();
  const toast = useToast();
  const [note, setNote] = useState(candidate.screening_note);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await updateCandidate(candidate.id, rejectScreening(note));
      toast(`${candidate.full_name}: saved. Moved to Rejected.`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Reject ${candidate.full_name}`}
      description="The process stops at CV review."
      onClose={onClose}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="screening-form" variant="danger" loading={busy}>Save rejection</Button>
        </>
      }
    >
      <form id="screening-form" onSubmit={submit}>
        <TextArea label="Reason (optional)" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
      </form>
    </Dialog>
  );
}

/** HR records the call, and what the candidate answered: confirmed, rejected, or call again. */
export function CallDialog({ candidate, status, onClose }: { candidate: Candidate; status: Exclude<CallStatus, 'pending'>; onClose: () => void }) {
  const { user, buckets, updateCandidate } = useStore();
  const toast = useToast();
  const today = todayIso();
  const bucket = buckets.find((b) => b.id === candidate.bucket_id);
  const [note, setNote] = useState(candidate.call_note);
  const [followupOn, setFollowupOn] = useState(candidate.followup_on ?? '');
  const [followupTime, setFollowupTime] = useState(candidate.followup_time);
  const [callDate, setCallDate] = useState(candidate.call_date ?? today);
  const [callTime, setCallTime] = useState(candidate.call_time || nowTime());
  const [answerDate, setAnswerDate] = useState(today);
  const [answerTime, setAnswerTime] = useState(nowTime());
  const [busy, setBusy] = useState(false);

  const titles = {
    confirm: `Record confirmation: ${candidate.full_name}`,
    followup: `Follow up with ${candidate.full_name}`,
    reject: `Record rejection: ${candidate.full_name}`,
  };
  const actions = { confirm: 'Save confirmation', followup: 'Save follow-up', reject: 'Save rejection' };
  // The bucket's primary interview, when it has one still to come: confirming schedules the candidate for it.
  const slot = status === 'confirm' ? bucketSlot(bucket, answerDate) : null;
  const done = {
    confirm: slot ? `Saved. Primary interview on ${whenText(slot.date, slot.time)}.` : 'Saved. Next: set the primary schedule.',
    followup: 'Follow-up saved.',
    reject: 'Saved. Moved to Rejected.',
  };
  const answerLabel = status === 'confirm' ? 'Candidate confirmed on' : 'Candidate rejected on';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await updateCandidate(candidate.id, setCall(status, {
        note,
        by: user?.full_name ?? '',
        followupOn: followupOn || null,
        followupTime,
        callDate,
        callTime,
        confirmedDate: answerDate,
        confirmedTime: answerTime,
        rejectedDate: answerDate,
        rejectedTime: answerTime,
        primarySlot: slot,
      }));
      toast(`${candidate.full_name}: ${done[status]}`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={titles[status]}
      description={<a className="tabular underline" href={`tel:${candidate.phone}`}>{candidate.phone}</a>}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="call-form" variant={status === 'reject' ? 'danger' : 'primary'} loading={busy}>
            {actions[status]}
          </Button>
        </>
      }
    >
      <form id="call-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <DateTimeField label="Called on" required max={today} date={callDate} time={callTime} onDate={setCallDate} onTime={setCallTime} />
        {status === 'followup' ? (
          <DateTimeField label="Call again on" min={today} date={followupOn} time={followupTime} onDate={setFollowupOn} onTime={setFollowupTime} />
        ) : (
          <DateTimeField
            label={answerLabel}
            required
            min={callDate}
            minTime={answerDate === callDate ? callTime : undefined}
            max={today}
            date={answerDate}
            time={answerTime}
            onDate={setAnswerDate}
            onTime={setAnswerTime}
          />
        )}
        <div className="sm:col-span-2">
          <TextArea label="Call note" rows={3} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did the candidate say?" />
        </div>
        {status === 'confirm' && <PrimarySlotNote bucket={bucket} slot={slot} />}
      </form>
    </Dialog>
  );
}

/** Says what confirming does with the bucket's primary interview day. */
function PrimarySlotNote({ bucket, slot, many = false }: { bucket: CvBucket | undefined; slot: Slot | null; many?: boolean }) {
  const who = many ? 'They are' : 'The candidate is';
  return (
    <p className={classNames('rounded-lg px-3 py-2 text-sm sm:col-span-2', slot ? 'bg-brand-50 text-brand-900' : 'bg-amber-50 text-amber-950')}>
      {slot
        ? <>{who} scheduled for the primary interview set on this bucket: <strong className="tabular">{whenText(slot.date, slot.time)}</strong>. Tell them on the call.</>
        : bucket?.primary_date
          ? <>The primary interview set on this bucket ({whenText(bucket.primary_date, bucket.primary_time)}) has passed. Set the schedule next, or change the date on the bucket.</>
          : <>This bucket has no primary interview date. Set the schedule next, or add the date to the bucket.</>}
    </p>
  );
}

/** Several candidates confirmed on their calls, recorded together. With a primary interview on the bucket, they are scheduled for it too. */
export function ConfirmCallsDialog({ candidates, onClose }: { candidates: Candidate[]; onClose: () => void }) {
  const { user, buckets, updateCandidates } = useStore();
  const toast = useToast();
  const today = todayIso();
  const [callDate, setCallDate] = useState(today);
  const [callTime, setCallTime] = useState(nowTime());
  const [answerDate, setAnswerDate] = useState(today);
  const [answerTime, setAnswerTime] = useState(nowTime());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // A bulk action works inside one bucket, so they share its interview day.
  const bucket = buckets.find((b) => b.id === candidates[0]?.bucket_id);
  const slot = bucketSlot(bucket, answerDate);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const done = await updateCandidates(candidates.map((c) => c.id), (c) => setCall('confirm', {
        ...(note.trim() ? { note: note.trim() } : {}),
        by: user?.full_name ?? '',
        callDate,
        callTime,
        confirmedDate: answerDate,
        confirmedTime: answerTime,
        primarySlot: bucketSlot(buckets.find((b) => b.id === c.bucket_id), answerDate),
      }));
      toast(slot ? `${done} confirmed and scheduled for ${whenText(slot.date, slot.time)}.` : `${done} confirmed. Next: set the primary schedule.`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Record confirmation: ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
      description={candidates.map((c) => c.full_name).join(', ')}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="confirm-calls-form" variant="primary" loading={busy}>Save confirmation for {candidates.length}</Button>
        </>
      }
    >
      <form id="confirm-calls-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <DateTimeField label="Called on" required max={today} date={callDate} time={callTime} onDate={setCallDate} onTime={setCallTime} />
        <DateTimeField label="Candidates confirmed on" required min={callDate} max={today} date={answerDate} time={answerTime} onDate={setAnswerDate} onTime={setAnswerTime} />
        <div className="sm:col-span-2">
          <TextArea label="Call note (optional, same for all)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <PrimarySlotNote bucket={bucket} slot={slot} many />
      </form>
    </Dialog>
  );
}

/** The candidate told HR they cannot come, or did not come. One or several at once, each in the interview they are scheduled for. */
export function MissedDialog({ candidates, attendance, onClose }: { candidates: Candidate[]; attendance: 'cant_attend' | 'absent'; onClose: () => void }) {
  const { updateCandidates } = useStore();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const only = candidates.length === 1 ? candidates[0] : undefined;
  const absent = attendance === 'absent';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const done = await updateCandidates(candidates.map((c) => c.id), (c) => {
        const round = scheduledRound(c);
        return round ? markMissed(round, attendance, note) : {};
      });
      toast(`${only ? only.full_name : `${done} candidates`}: saved as ${absent ? 'absent. Next: the follow-up call.' : "can't attend. Next: give a new date."}`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`${absent ? 'Absent from the interview' : "Can't attend the interview"}: ${only ? only.full_name : `${candidates.length} candidates`}`}
      description={absent ? 'Did not come and did not tell HR. Next comes a follow-up call.' : 'Told HR beforehand they cannot come. Next comes a new date.'}
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="missed-form" variant="primary" loading={busy}>Save{only ? '' : ` for ${candidates.length}`}</Button>
        </>
      }
    >
      <form id="missed-form" onSubmit={submit}>
        <TextArea
          label={absent ? 'Remarks (optional)' : 'Reason'}
          required={!absent}
          rows={3}
          autoFocus
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={absent ? 'e.g. Phone was off; no reply on WhatsApp' : 'e.g. Exam on that day, asked for next week'}
          hint="Shown on the card and on the dashboard."
        />
      </form>
    </Dialog>
  );
}

/**
 * A new date after a missed interview: for someone who could not come, or who said on the follow-up call that
 * they will come. Given once by the process team; an admin can give another.
 */
export function NewDateDialog({ candidates, onClose }: { candidates: Candidate[]; onClose: () => void }) {
  const { updateCandidates } = useStore();
  const toast = useToast();
  const only = candidates.length === 1 ? candidates[0] : undefined;
  const followUp = candidates.some((c) => { const round = scheduledRound(c); return round !== null && attendanceOf(c, round) === 'absent'; });
  const [date, setDate] = useState('');
  const [time, setTime] = useState(() => {
    const round = only ? scheduledRound(only) : null;
    return only && round ? only[`${round}_time`] : '';
  });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const today = todayIso();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const done = await updateCandidates(candidates.map((c) => c.id), (c) => {
        const round = scheduledRound(c);
        return round ? giveNewDate(c, round, { date, time }, note) : {};
      });
      toast(`${only ? only.full_name : `${done} candidates`}: new interview date ${whenText(date, time)}.`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`${followUp ? 'Follow-up call: will come. ' : ''}New interview date: ${only ? only.full_name : `${candidates.length} candidates`}`}
      description={only ? <>{only.phone && <a className="tabular underline" href={`tel:${only.phone}`}>{only.phone}</a>}</> : 'The same day and time for everyone selected.'}
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="new-date-form" variant="primary" loading={busy}>Save new date{only ? '' : ` for ${candidates.length}`}</Button>
        </>
      }
    >
      <form id="new-date-form" onSubmit={submit} className="space-y-3">
        <DateTimeField label="New interview on" required min={today} date={date} time={time} onDate={setDate} onTime={setTime} />
        <TextArea
          label={followUp ? 'What the candidate said on the follow-up call (optional)' : 'Remarks (optional)'}
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <p className="text-xs text-ink-muted">A new date is given once. If the candidate misses this one too, an admin decides.</p>
      </form>
    </Dialog>
  );
}

/**
 * Ends a missed interview. not_interested: on the follow-up call the candidate said they will not come.
 * admin: an admin rejects the candidate for not attending. A final interview also takes the final decision's dates and locks.
 */
export function RejectMissedDialog({ candidate, reason, onClose }: { candidate: Candidate; reason: 'not_interested' | 'admin'; onClose: () => void }) {
  const { updateCandidate, user } = useStore();
  const toast = useToast();
  const round = scheduledRound(candidate) ?? 'primary';
  const locks = round === 'secondary';
  const [note, setNote] = useState('');
  const [dates, setDates] = useState(() => initialRejectionDates());
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await updateCandidate(candidate.id, {
        ...rejectMissed(candidate, round, reason, note),
        ...(locks ? rejectDecision({ ...dates, by: user?.full_name ?? '' }) : {}),
      });
      toast(`${candidate.full_name}: saved. ${locks ? 'Rejected, and the process is now locked.' : 'Moved to Rejected.'}`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={reason === 'not_interested' ? `Follow-up call: not interested · ${candidate.full_name}` : `Reject for not attending: ${candidate.full_name}`}
      description={reason === 'not_interested' ? 'The candidate said on the call that they will not come. The process stops here.' : 'The candidate did not attend the interview. The process stops here.'}
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="reject-missed-form" variant="danger" loading={busy}>{locks ? 'Save and lock' : 'Save rejection'}</Button>
        </>
      }
    >
      <form id="reject-missed-form" onSubmit={submit} className="space-y-3">
        <TextArea
          label={reason === 'not_interested' ? 'What the candidate said (optional)' : 'Remarks (optional)'}
          rows={3}
          autoFocus
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {locks && (
          <div className="border-t border-line pt-3">
            <RejectionFields dates={dates} onChange={setDates} />
            <p className="mt-2 text-xs text-ink-muted">This is the final decision: the whole process locks once you save.</p>
          </div>
        )}
      </form>
    </Dialog>
  );
}

export interface PanelRow {
  key: number;
  name: string;
  score: string;
  referred: boolean;
}

/** A saved panel as editable rows, with one empty row when there is none yet. */
export function panelRows(panel: InterviewerScore[]): PanelRow[] {
  return panel.length > 0
    ? panel.map((entry, index) => ({ key: index, name: entry.name, score: entry.score?.toString() ?? '', referred: entry.referred }))
    : [{ key: 0, name: '', score: '', referred: false }];
}

export const rowsToPanel = (rows: PanelRow[]): InterviewerScore[] =>
  rows.map((row) => ({ name: row.name.trim(), score: Number(row.score), referred: row.referred }));

export function panelSummary(rows: PanelRow[]): { average: number | null; recommended: number } {
  const scores = rows.map((row) => Number(row.score)).filter((score) => score > 0);
  return {
    average: scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null,
    recommended: rows.filter((row) => row.referred).length,
  };
}

/** One row per interviewer: name, score and whether they recommend the candidate. */
export function PanelEditor({ rows, onChange }: { rows: PanelRow[]; onChange: (rows: PanelRow[]) => void }) {
  const { candidates } = useStore();
  const knownNames = useMemo(
    () => [...new Set(candidates.flatMap((c) => [...c.primary_panel, ...c.secondary_panel].map((entry) => entry.name)).filter(Boolean))].sort(),
    [candidates],
  );
  const patchRow = (key: number, patch: Partial<PanelRow>) => onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const nextKey = () => Math.max(-1, ...rows.map((row) => row.key)) + 1;

  return (
    <>
      <datalist id="interviewer-names">{knownNames.map((name) => <option key={name} value={name} />)}</datalist>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.key} className="grid grid-cols-[1fr_5.5rem_auto_2rem] items-end gap-2">
            <TextInput
              label={`Interviewer ${index + 1}`}
              required
              list="interviewer-names"
              autoFocus={index === rows.length - 1}
              value={row.name}
              onChange={(e) => patchRow(row.key, { name: e.target.value })}
            />
            <TextInput
              label="Score (1-10)"
              aria-label={`Score from interviewer ${index + 1}`}
              type="number"
              required
              min={1}
              max={10}
              step={0.1}
              inputMode="decimal"
              value={row.score}
              onChange={(e) => patchRow(row.key, { score: e.target.value })}
            />
            <label className={classNames('flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-brand-600', row.referred ? 'border-amber-300 bg-amber-50 font-medium text-amber-950' : 'border-line-strong text-ink-soft hover:bg-hover')}>
              <input
                type="checkbox"
                className="sr-only"
                aria-label={`Recommended by interviewer ${index + 1}`}
                checked={row.referred}
                onChange={(e) => patchRow(row.key, { referred: e.target.checked })}
              />
              <Star className={classNames('size-4', row.referred ? 'fill-amber-500 text-amber-500' : 'text-ink-muted')} aria-hidden />
              Recommended
            </label>
            <IconButton
              label={`Remove interviewer ${index + 1}`}
              icon={Trash2}
              disabled={rows.length === 1}
              className="mb-0.5"
              onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
            />
          </li>
        ))}
      </ul>
      <Button size="sm" icon={Plus} onClick={() => onChange([...rows, { key: nextKey(), name: '', score: '', referred: false }])}>
        Add more
      </Button>
    </>
  );
}

export function InterviewResultDialog({ candidate, stage, result, onClose }: { candidate: Candidate; stage: 'primary' | 'secondary'; result: 'selected' | 'rejected'; onClose: () => void }) {
  const { updateCandidate, user, assessments } = useStore();
  const toast = useToast();
  const isPrimary = stage === 'primary';
  const asksForList = !isPrimary && result === 'selected';
  // Rejecting at the final interview is the final decision, so its dates are taken here too.
  const locks = !isPrimary && result === 'rejected';
  const saved = isPrimary ? candidate.primary_panel : candidate.secondary_panel;
  // With no panel saved yet, the interviewers' own forms fill it in: each score out of 10, and Employ as recommended.
  const fromForms = saved.length === 0 ? assessmentsToPanel(assessments.filter((a) => a.candidate_id === candidate.id && a.stage === stage)) : [];
  const [rows, setRows] = useState<PanelRow[]>(() => panelRows(fromForms.length > 0 ? fromForms : saved));
  const [category, setCategory] = useState<SelectionCategory | ''>('');
  const [remarks, setRemarks] = useState(candidate.secondary_feedback ?? '');
  const [dates, setDates] = useState(() => initialRejectionDates());
  const [busy, setBusy] = useState(false);
  const { average, recommended } = panelSummary(rows);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const panel = rowsToPanel(rows);
    try {
      await updateCandidate(
        candidate.id,
        isPrimary
          ? setPrimary(result, panelColumns('primary', panel))
          : {
              ...setSecondary(result, {
                ...panelColumns('secondary', panel),
                ...(asksForList ? { selection_category: category as SelectionCategory, secondary_feedback: remarks.trim() } : {}),
              }),
              ...(locks ? rejectDecision({ ...dates, by: user?.full_name ?? '' }) : {}),
            },
      );
      const outcome = result === 'rejected'
        ? locks ? 'Saved. Rejected, and the process is now locked.' : 'Saved. Moved to Rejected.'
        : isPrimary ? 'Saved. Next: set the final schedule.' : 'Saved. Next: the final decision.';
      toast(`${candidate.full_name}: ${outcome}`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`${isPrimary ? 'Primary' : 'Final'} interview: ${result === 'selected' ? 'select' : 'reject'} ${candidate.full_name}`}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <p className="mr-auto text-xs text-ink-soft" aria-live="polite">
            {average !== null && <>Average <strong className="tabular">{average}</strong>/10</>}
            {rows.length > 0 && <> · {recommended} of {rows.length} recommended</>}
          </p>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="interview-form" variant={result === 'selected' ? 'primary' : 'danger'} loading={busy}>
            {result === 'selected' ? 'Save as selected' : locks ? 'Save and lock' : 'Save as rejected'}
          </Button>
        </>
      }
    >
      <form id="interview-form" onSubmit={submit} className="space-y-3">
        {fromForms.length > 0 && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900">
            Filled in from {fromForms.length} interviewer form{fromForms.length === 1 ? '' : 's'}: each score is the form's marks out of 50, shown out of 10, and Employ counts as recommended.
          </p>
        )}
        <PanelEditor rows={rows} onChange={setRows} />
        {asksForList && (
          <div className="border-t border-line pt-3">
            <Select
              label="Selection list"
              required
              hint="Confirmation letters go to Merit. Move someone up from Waiting yourself if a merit candidate does not confirm."
              value={category}
              onChange={(e) => setCategory(e.target.value as SelectionCategory)}
            >
              <option value="">Choose…</option>
              <option value="merit">Merit</option>
              <option value="waiting">Waiting</option>
            </Select>
            <div className="mt-3">
              <TextArea
                label="Remarks (optional)"
                rows={3}
                placeholder={category === 'waiting' ? 'Why waiting, e.g. strong second choice, salary expectation higher' : 'Why merit, e.g. best technical answers, can join early'}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>
        )}
        {locks && (
          <div className="border-t border-line pt-3">
            <RejectionFields dates={dates} onChange={setDates} />
            <p className="mt-2 text-xs text-ink-muted">This is the final decision: the whole process locks once you save.</p>
          </div>
        )}
      </form>
    </Dialog>
  );
}

export interface RejectionDates {
  rejectedDate: string;
  rejectedTime: string;
  informedDate: string;
  informedTime: string;
}

function initialRejectionDates(): RejectionDates {
  return { rejectedDate: todayIso(), rejectedTime: nowTime(), informedDate: todayIso(), informedTime: nowTime() };
}

export function RejectionFields({ dates, onChange }: { dates: RejectionDates; onChange: (dates: RejectionDates) => void }) {
  const set = (patch: Partial<RejectionDates>) => onChange({ ...dates, ...patch });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <DateTimeField label="Rejected on" required date={dates.rejectedDate} time={dates.rejectedTime} onDate={(rejectedDate) => set({ rejectedDate })} onTime={(rejectedTime) => set({ rejectedTime })} />
      <DateTimeField label="Candidate informed on" required min={dates.rejectedDate} date={dates.informedDate} time={dates.informedTime} onDate={(informedDate) => set({ informedDate })} onTime={(informedTime) => set({ informedTime })} />
    </div>
  );
}

/** The last step: a confirmation letter or a rejection. Saving either one locks the process. */
export function DecisionDialog({ candidate, decision, onClose }: { candidate: Candidate; decision: 'confirmed' | 'rejected'; onClose: () => void }) {
  const { updateCandidate, user } = useStore();
  const toast = useToast();
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedTime, setSelectedTime] = useState(nowTime());
  const [joiningDate, setJoiningDate] = useState(candidate.joining_date ?? '');
  const [joiningTime, setJoiningTime] = useState(candidate.joining_time);
  const [dates, setDates] = useState(() => initialRejectionDates());
  const [busy, setBusy] = useState(false);
  const confirming = decision === 'confirmed';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await updateCandidate(
        candidate.id,
        confirming
          ? confirmDecision({ selectedDate, selectedTime, joiningDate, joiningTime, by: user?.full_name ?? '' })
          : rejectDecision({ ...dates, by: user?.full_name ?? '' }),
      );
      toast(`${candidate.full_name}: saved. ${confirming ? 'Confirmed' : 'Rejected'}, and the process is now locked.`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={confirming ? `Send confirmation letter to ${candidate.full_name}` : `Reject ${candidate.full_name}`}
      description="This is the final decision: the whole process locks once you save."
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="decision-form" variant={confirming ? 'primary' : 'danger'} loading={busy}>
            Save and lock
          </Button>
        </>
      }
    >
      <form id="decision-form" onSubmit={submit}>
        {confirming ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <DateTimeField label="Selected on" required date={selectedDate} time={selectedTime} onDate={setSelectedDate} onTime={setSelectedTime} />
            <DateTimeField label="Joins on" required min={selectedDate} date={joiningDate} time={joiningTime} onDate={setJoiningDate} onTime={setJoiningTime} />
          </div>
        ) : (
          <RejectionFields dates={dates} onChange={setDates} />
        )}
      </form>
    </Dialog>
  );
}

/**
 * After the letter: HR calls the candidate about joining, and records the joining day and time the
 * candidate confirms. The letter's joining day stays as it was; this is the day the candidate agreed to.
 */
export function JoiningCallDialog({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const { updateCandidate } = useStore();
  const toast = useToast();
  const today = todayIso();
  const [callDate, setCallDate] = useState(candidate.joining_call_date ?? today);
  const [callTime, setCallTime] = useState(candidate.joining_call_time || nowTime());
  const [joinDate, setJoinDate] = useState(candidate.joining_confirmed_date ?? candidate.joining_date ?? '');
  const [joinTime, setJoinTime] = useState(candidate.joining_confirmed_date ? candidate.joining_confirmed_time : candidate.joining_time);
  const [confirmed, setConfirmed] = useState(candidate.joining_call_date ? Boolean(candidate.joining_confirmed_date) : true);
  const [remarks, setRemarks] = useState(candidate.joining_remarks ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await updateCandidate(candidate.id, recordJoiningCall({
        callDate,
        callTime,
        confirmedDate: confirmed ? joinDate : null,
        confirmedTime: joinTime,
        remarks,
      }));
      toast(confirmed ? `${candidate.full_name}: saved. Joining confirmed.` : `${candidate.full_name}: saved. Waiting for the candidate to confirm a day.`);
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Call for joining: ${candidate.full_name}`}
      description={<>Offered in the letter: <strong className="tabular">{whenText(candidate.joining_date, candidate.joining_time)}</strong> · <a className="tabular underline" href={`tel:${candidate.phone}`}>{candidate.phone}</a></>}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="joining-call-form" variant="primary" loading={busy}>Save joining call</Button>
        </>
      }
    >
      <form id="joining-call-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <DateTimeField label="Called for joining on" required max={today} date={callDate} time={callTime} onDate={setCallDate} onTime={setCallTime} />
        {confirmed ? (
          <DateTimeField
            label="Candidate confirmed joining on"
            hint="The day and time the candidate will join, as they confirmed it."
            required
            min={callDate}
            date={joinDate}
            time={joinTime}
            onDate={setJoinDate}
            onTime={setJoinTime}
          />
        ) : (
          <p className="self-center text-sm text-ink-soft">The candidate has not confirmed a day yet. Call again later.</p>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="size-4 accent-brand-600" checked={!confirmed} onChange={(e) => setConfirmed(!e.target.checked)} />
          The candidate has not confirmed a joining day yet
        </label>
        <div className="sm:col-span-2">
          <TextArea
            label="Remarks (optional)"
            rows={3}
            maxLength={2000}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="e.g. Asked for a later day to serve notice; will bring the release letter; salary to be discussed on joining"
            hint="Shown on the card and in the Selected download."
          />
        </div>
      </form>
    </Dialog>
  );
}

/** Joining paperwork after the decision. The decision and its dates stay locked; only what happens next can be recorded. */
export function JoiningDialog({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const { updateCandidate } = useStore();
  const toast = useToast();
  const [form, setForm] = useState({
    joining_status: candidate.joining_status,
    offered_salary: candidate.offered_salary?.toString() ?? '',
    employee_code: candidate.employee_code,
    reporting_to: candidate.reporting_to,
    probation_period: candidate.probation_period,
    national_id: candidate.national_id,
    tin_no: candidate.tin_no,
  });
  const [received, setReceived] = useState(new Set(candidate.documents_received));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  // "Joining confirmed" comes from the joining call, which holds the day the candidate confirmed.
  const outcomes: JoiningStatus[] = [candidate.joining_status === 'accepted' ? 'accepted' : 'offer_sent', 'joined', 'declined'];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await updateCandidate(candidate.id, {
        ...form,
        offered_salary: form.offered_salary ? Number(form.offered_salary) : null,
        documents_received: [...received],
      });
      toast('Joining details saved.');
      onClose();
    } catch (error) {
      toast(errorText(error), 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Joining details: ${candidate.full_name}`}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button type="submit" form="joining-form" variant="primary" loading={busy}>Save</Button></>}
    >
      <form id="joining-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Select
          label="What happened after the letter"
          value={form.joining_status}
          hint="Did not confirm opens the vacancy again, for the waiting list."
          onChange={(e) => set({ joining_status: e.target.value as JoiningStatus })}
        >
          {outcomes.map((value) => <option key={value} value={value}>{value === 'offer_sent' ? 'Waiting to join' : JOINING[value].label}</option>)}
        </Select>
        <TextInput label="Monthly salary (BDT)" type="number" min={0} value={form.offered_salary} onChange={(e) => set({ offered_salary: e.target.value })} />
        <TextInput label="Employee ID" value={form.employee_code} onChange={(e) => set({ employee_code: e.target.value })} />
        <TextInput label="Reporting to" value={form.reporting_to} onChange={(e) => set({ reporting_to: e.target.value })} />
        <TextInput label="Probation period" placeholder="e.g. 6 months" value={form.probation_period} onChange={(e) => set({ probation_period: e.target.value })} />
        <TextInput label="NID no." value={form.national_id} onChange={(e) => set({ national_id: e.target.value })} />
        <TextInput label="TIN no." value={form.tin_no} onChange={(e) => set({ tin_no: e.target.value })} />
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-xs font-medium text-ink-soft">Documents received</legend>
          <ul className="space-y-1.5">
            {DOCUMENT_CHECKLIST.map((item) => (
              <li key={item}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-brand-600"
                    checked={received.has(item)}
                    onChange={() => setReceived((current) => {
                      const next = new Set(current);
                      if (next.has(item)) next.delete(item);
                      else next.add(item);
                      return next;
                    })}
                  />
                  {item}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </form>
    </Dialog>
  );
}

const CHANNELS = ['SMS', 'WhatsApp', 'Email'];

/** Sets the interview schedule for one person or several, and prepares the message telling them. */
export function ScheduleDialog({ candidates, stage, onClose }: { candidates: Candidate[]; stage: 'primary' | 'secondary'; onClose: () => void }) {
  const { messageTemplates, buckets, settings, updateCandidate, user } = useStore();
  const toast = useToast();
  const templates = messageTemplates.filter((t) => t.stage === stage || t.stage === 'general');
  const only = candidates.length === 1 ? candidates[0] : undefined;
  // A primary interview not set yet starts from the day set on the bucket.
  const bucketDay = stage === 'primary' ? bucketSlot(buckets.find((b) => b.id === candidates[0]?.bucket_id), todayIso()) : null;
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? '');
  const [date, setDate] = useState((stage === 'primary' ? only?.primary_date : only?.secondary_date) ?? bucketDay?.date ?? '');
  const [time, setTime] = useState((stage === 'primary' ? only?.primary_date && only.primary_time : only?.secondary_time) || bucketDay?.time || '');
  const [channel, setChannel] = useState('SMS');
  const [busy, setBusy] = useState(false);
  const template = templates.find((t) => t.key === templateKey);
  const roundName = stage === 'primary' ? 'primary' : 'final';

  const previews = useMemo(
    () =>
      candidates.map((candidate) => {
        const bucket = buckets.find((b) => b.id === candidate.bucket_id);
        const rendered = renderTemplate(template?.body ?? '', {
          ...candidateVars(candidate, bucket, settings),
          ...slotVars({ date, time }),
        }, '[…]');
        return { candidate, text: rendered.text, missing: rendered.missing };
      }),
    [candidates, buckets, settings, template, date, time],
  );

  const scheduleMissing = !date || !time;

  function exportForGateway() {
    downloadCsv(
      previews,
      [
        { header: 'Mobile', value: (p) => p.candidate.phone },
        { header: 'Name', value: (p) => p.candidate.full_name },
        { header: 'Message', value: (p) => p.text },
      ],
      `messages-${todayIso()}.csv`,
    );
  }

  async function save() {
    setBusy(true);
    let done = 0;
    try {
      for (const { candidate, text } of previews) {
        await updateCandidate(
          candidate.id,
          stage === 'primary' ? schedulePrimary({ channel, date, time }) : scheduleFinal({ date, time }),
        );
        await backend.insert('message_log', [
          { candidate_id: candidate.id, template_key: templateKey, channel, body: text, sent_by: user?.full_name ?? '' },
        ]);
        done += 1;
      }
      toast(`Saved. ${roundName === 'primary' ? 'Primary' : 'Final'} interview scheduled for ${done} candidate${done === 1 ? '' : 's'}.`);
      onClose();
    } catch (error) {
      toast(`${done} saved, then: ${errorText(error)}`, 'bad');
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Set ${roundName} interview schedule`}
      description={only ? only.full_name : `${candidates.length} candidates`}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <Button icon={Download} className="mr-auto" disabled={scheduleMissing} onClick={exportForGateway}>Download for SMS gateway</Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={scheduleMissing} onClick={() => void save()}>
            Save schedule{only ? '' : ` for ${candidates.length}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <DateTimeField label="Interview on" required date={date} time={time} onDate={setDate} onTime={setTime} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Sent through" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select label="Wording" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
            {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </Select>
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        Tell the candidate with the buttons below, or download every message for your SMS gateway. The app does not send them by itself.
      </p>

      <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
        {previews.map(({ candidate, text }) => (
          <li key={candidate.id} className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium">
                {candidate.full_name} <span className="tabular font-normal text-ink-muted">{candidate.phone}</span>
              </p>
              <div className="flex shrink-0">
                <IconButton label={`Copy message for ${candidate.full_name}`} icon={Copy} onClick={() => void copyText(text).then(() => toast('Message copied.'))} />
                <a className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft hover:bg-hover" aria-label={`Open SMS to ${candidate.full_name}`} title="Open SMS app" href={`sms:${candidate.phone}?body=${encodeURIComponent(text)}`}><Smartphone className="size-4" aria-hidden /></a>
                <a className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft hover:bg-hover" aria-label={`Open WhatsApp to ${candidate.full_name}`} title="Open WhatsApp" target="_blank" rel="noreferrer" href={`https://wa.me/${whatsappNumber(candidate.phone)}?text=${encodeURIComponent(text)}`}><MessageCircle className="size-4" aria-hidden /></a>
                {candidate.email && <a className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft hover:bg-hover" aria-label={`Email ${candidate.full_name}`} title="Open email" href={`mailto:${candidate.email}?subject=${encodeURIComponent('Interview invitation')}&body=${encodeURIComponent(text)}`}><Mail className="size-4" aria-hidden /></a>}
              </div>
            </div>
            <p className="mt-1 text-sm whitespace-pre-wrap text-ink-soft">{text}</p>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export function ReviewLinkDialog({ candidate, stage, onClose }: { candidate: Candidate; stage: 'primary' | 'secondary'; onClose: () => void }) {
  const { reviewLink, messageTemplates, buckets, settings } = useStore();
  const toast = useToast();
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    reviewLink(candidate.id, stage)
      .then((value) => { if (!cancelled) setLink(value); })
      .catch((failure) => { if (!cancelled) setError(errorText(failure)); });
    return () => {
      cancelled = true;
    };
    // Only the candidate and stage decide the link; the store function changes on every data update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.id, stage]);

  const template = messageTemplates.find((t) => t.key === 'review_invite');
  const bucket = buckets.find((b) => b.id === candidate.bucket_id);
  const message = link && template
    ? renderTemplate(template.body, { ...candidateVars(candidate, bucket, settings), review_link: link }).text
    : '';

  return (
    <Dialog title={`Ask ${candidate.full_name} for feedback`} description={`${stage === 'primary' ? 'Primary' : 'Final'} interview experience`} onClose={onClose} width="max-w-lg">
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {link && (
        <div className="space-y-3">
          <TextInput
            label="Private link for this candidate"
            hint={`Share it before or after the interview. It works ${REVIEW_CLOSES[stage]}, then closes by itself.`}
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
          />
          <TextArea label="Message" rows={4} readOnly value={message} />
          <div className="flex flex-wrap gap-2">
            <Button icon={Copy} onClick={() => void copyText(link).then(() => toast('Link copied.'))}>Copy link</Button>
            <Button icon={Copy} onClick={() => void copyText(message).then(() => toast('Message copied.'))}>Copy message</Button>
            <a className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3.5 text-sm font-medium hover:bg-hover" target="_blank" rel="noreferrer" href={`https://wa.me/${whatsappNumber(candidate.phone)}?text=${encodeURIComponent(message)}`}>
              <MessageCircle className="size-4" aria-hidden /> WhatsApp
            </a>
          </div>
        </div>
      )}
    </Dialog>
  );
}
